"""API contract tests against a temporary SQLite database."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.mlearning.config import content_path
from src.mlearning.main import create_app


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("MLLEARNING_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("MLLEARNING_CONTENT_PATH", str(content_path()))
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def test_health_and_initial_bootstrap(client: TestClient) -> None:
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    payload = client.get("/api/v1/bootstrap").json()
    assert len(payload["concepts"]) == 9
    assert len(payload["weekly"]) == 7
    assert payload["today"]["goal_minutes"] == 60
    assert payload["today"]["minutes"] == 0
    assert all(item["status"] == "not_started" for item in payload["concepts"])
    assert payload["next_action"]["concept_slug"] == "linear-regression"
    plan = payload["daily_plan"]
    assert plan["mode"] == "learn"
    assert plan["concept_slug"] == "linear-regression"
    assert plan["section_id"] == "linear-intuition"
    assert plan["total_minutes"] == 52
    assert len(plan["steps"]) == 6
    assert plan["steps"][0]["kind"] == "think"
    assert plan["steps"][1]["href"] == "/learn/linear-regression#section-linear-intuition"
    assert plan["steps"][4]["href"] == "/practice?concept=linear-regression"


def test_concept_detail_and_question_privacy(client: TestClient) -> None:
    detail = client.get("/api/v1/concepts/linear-regression")
    assert detail.status_code == 200
    body = detail.json()
    assert len(body["sections"]) == 3
    assert body["completed_section_ids"] == []
    assert body["experiment_type"] == "regression"
    for section in body["sections"]:
        lesson = section["lesson"]
        assert lesson["hook"]
        assert len(lesson["blocks"]) == 3
        assert len(lesson["worked_example"]["steps"]) == 3
        assert len(lesson["code_walkthrough"]["annotations"]) == 3
        compile(lesson["code_walkthrough"]["code"], section["id"], "exec")
        assert len(lesson["misconceptions"]) == 2
        assert len(lesson["recap"]) == 3
        assert lesson["self_check"]["question"]
        assert lesson["self_check"]["answer"]

    questions = client.get("/api/v1/questions", params={"concept_id": 1}).json()
    assert len(questions) == 3
    assert all("correct_answer_id" not in item for item in questions)
    assert all("explanation" not in item for item in questions)
    assert all("misconception" not in item for item in questions)
    assert client.get("/api/v1/concepts/does-not-exist").status_code == 404


def test_attempt_feedback_confidence_and_mistake_feed(client: TestClient) -> None:
    wrong = client.post(
        "/api/v1/attempts",
        json={
            "question_id": 1,
            "answer_id": "a",
            "confidence": 5,
            "time_spent_seconds": 20,
        },
    )
    assert wrong.status_code == 200, wrong.text
    result = wrong.json()
    assert result["is_correct"] is False
    assert result["correct_answer_id"] == "b"
    assert result["explanation"]
    assert result["misconception"]

    too_confident = client.post(
        "/api/v1/attempts",
        json={
            "question_id": 1,
            "answer_id": "b",
            "confidence": 6,
            "time_spent_seconds": 20,
        },
    )
    assert too_confident.status_code == 422

    progress = client.get("/api/v1/progress").json()
    assert progress["stats"]["total_attempts"] == 1
    assert progress["stats"]["correct_attempts"] == 0
    assert progress["recent_mistakes"][0]["question_id"] == 1

    correct = client.post(
        "/api/v1/attempts",
        json={
            "question_id": 1,
            "answer_id": "b",
            "confidence": 2,
            "time_spent_seconds": 12,
        },
    ).json()
    assert correct["is_correct"] is True
    # The latest correct attempt resolves the earlier mistake for next-action purposes.
    assert client.get("/api/v1/bootstrap").json()["today"]["reviews_due"] == 0
    # Calibration buckets come straight from raw attempts: one wrong at 5, one right at 2.
    buckets = client.get("/api/v1/progress").json()["calibration"]
    assert [bucket["confidence"] for bucket in buckets] == [1, 2, 3, 4, 5]
    assert buckets[1] == {"confidence": 2, "attempts": 1, "correct": 1}
    assert buckets[4] == {"confidence": 5, "attempts": 1, "correct": 0}
    assert sum(bucket["attempts"] for bucket in buckets) == 2


def test_section_and_experiment_recording_are_idempotent(client: TestClient) -> None:
    payload = {
        "concept_id": 1,
        "event_type": "section_completed",
        "section_id": "linear-intuition",
        "minutes": 2,
    }
    first = client.post("/api/v1/progress/events", json=payload)
    assert first.status_code == 200
    assert first.json()["completed_sections"] == 1
    plan = client.get("/api/v1/bootstrap").json()["daily_plan"]
    assert plan["section_id"] == "linear-intuition"
    assert plan["steps"][1]["completed"] is True
    second = client.post("/api/v1/progress/events", json=payload)
    assert second.status_code == 200
    assert second.json()["completed_sections"] == 1
    assert second.headers["x-progress-recorded"] == "false"

    experiment = {
        "concept_id": 1,
        "event_type": "experiment_completed",
        "minutes": 3,
        "metadata": {"slope": 1.2},
    }
    assert client.post("/api/v1/progress/events", json=experiment).status_code == 200
    assert client.post("/api/v1/progress/events", json=experiment).status_code == 200

    bootstrap = client.get("/api/v1/bootstrap").json()
    assert bootstrap["today"]["minutes"] == 5
    assert bootstrap["today"]["completed_sections"] == 1
    assert bootstrap["concepts"][0]["status"] == "in_progress"

    invalid = client.post(
        "/api/v1/progress/events",
        json={"concept_id": 1, "event_type": "section_completed", "minutes": 2},
    )
    assert invalid.status_code == 422


def test_concurrent_duplicate_reports_that_its_event_was_not_recorded(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import Session

    original_commit = Session.commit
    original_scalar = Session.scalar
    committed = False

    def scalar_before_competing_commit(session: Session, statement, *args, **kwargs):
        if "experiment_completions" in str(statement):
            return None
        return original_scalar(session, statement, *args, **kwargs)

    def commit_with_unique_key_race(session: Session) -> None:
        nonlocal committed
        if not committed:
            committed = True
            original_commit(session)
        else:
            # Deterministically reproduce the request that loses the unique-key race.
            raise IntegrityError("INSERT experiment_completions", {}, Exception("UNIQUE constraint failed"))

    monkeypatch.setattr(Session, "scalar", scalar_before_competing_commit)
    monkeypatch.setattr(Session, "commit", commit_with_unique_key_race)
    payload = {
        "concept_id": 1,
        "event_type": "experiment_completed",
        "minutes": 3,
        "metadata": {"slope": 1.2},
    }
    first = client.post("/api/v1/progress/events", json=payload)
    second = client.post("/api/v1/progress/events", json={**payload, "metadata": {"slope": 2.4}})

    assert first.headers["x-progress-recorded"] == "true"
    assert second.headers["x-progress-recorded"] == "false"


def test_journal_upsert_and_validation(client: TestClient) -> None:
    reflection = {
        "learned": "线性是指对参数线性。",
        "confused": "还需要练习残差计算。",
        "next_step": "完成最小二乘实验。",
    }
    saved = client.put("/api/v1/journal/2026-11-02", json=reflection)
    assert saved.status_code == 200
    assert saved.json()["saved_at"]
    assert client.put("/api/v1/journal/2026-11-02", json={**reflection, "learned": "更新"}).status_code == 200

    entry = client.get("/api/v1/journal/2026-11-02").json()
    assert entry["reflection"]["learned"] == "更新"
    assert entry["date"] == "2026-11-02"
    assert client.get("/api/v1/journal/not-a-date").status_code == 422

    timeline = client.get("/api/v1/timeline", params={"days": 7}).json()
    assert len(timeline) == 7
    assert timeline[-1]["date"] == "2026-11-02" or timeline[-1]["date"] >= "2026-10-01"


def _diagnostic_answers(**overrides: str) -> list[dict]:
    import json

    from src.mlearning.config import diagnostic_path

    content = json.loads(diagnostic_path().read_text(encoding="utf-8"))
    return [
        {
            "question_id": question["id"],
            "answer_id": overrides.get(str(question["id"]), question["correct_answer_id"]),
            "confidence": 3,
            "hints_used": 0,
            "time_spent_seconds": 12,
        }
        for question in content["questions"]
    ]


def test_diagnostic_contract_privacy_and_idempotency(client: TestClient) -> None:
    from uuid import uuid4

    initial = client.get("/api/v1/diagnostic")
    assert initial.status_code == 200
    body = initial.json()
    assert body["version"] == "2026.11-diagnostic-v1"
    assert len(body["questions"]) == 8
    assert len(body["domains"]) == 4
    assert body["latest"] is None
    for question in body["questions"]:
        assert len(question["options"]) == 4
        assert "correct_answer_id" not in question
        assert "explanation" not in question
        assert "misconception" not in question
        assert question["hint"]
    assert client.get("/api/v1/bootstrap").json()["diagnostic"]["completed"] is False

    session_id = str(uuid4())
    payload = {"client_session_id": session_id, "responses": _diagnostic_answers()}
    response = client.post("/api/v1/diagnostic", json=payload)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["correct_count"] == 8
    assert result["total"] == 8
    assert result["recommendation"]["concept_slug"] == "linear-regression"
    assert len(result["items"]) == 8
    assert all(item["explanation"] for item in result["items"])
    assert "掌握率" in result["evidence_note"]
    assert client.get("/api/v1/progress").json()["stats"]["total_attempts"] == 0

    # Replaying the same client id returns the first result, even with different answers.
    replay = client.post(
        "/api/v1/diagnostic",
        json={
            "client_session_id": session_id,
            "responses": _diagnostic_answers(**{str(i): "a" for i in range(101, 109)}),
        },
    )
    assert replay.status_code == 200
    assert replay.json()["correct_count"] == 8
    assert replay.json()["completed_at"] == result["completed_at"]

    latest = client.get("/api/v1/diagnostic").json()["latest"]
    assert latest["client_session_id"] == session_id
    assert latest["correct_count"] == 8

    bootstrap = client.get("/api/v1/bootstrap").json()
    assert bootstrap["diagnostic"]["completed"] is True
    assert bootstrap["diagnostic"]["recommendation"]["concept_slug"] == "linear-regression"
    assert "起点诊断" in bootstrap["next_action"]["reason"]
    assert bootstrap["next_action"]["concept_slug"] == "linear-regression"


def test_diagnostic_recommendations_follow_domain_evidence(client: TestClient) -> None:
    from uuid import uuid4

    generalization_gap = {"105": "a", "106": "b"}
    response = client.post(
        "/api/v1/diagnostic",
        json={
            "client_session_id": str(uuid4()),
            "responses": _diagnostic_answers(**generalization_gap),
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["correct_count"] == 6
    assert response.json()["recommendation"]["concept_slug"] == "overfitting"

    regularization_gap = {"107": "a", "108": "a"}
    response = client.post(
        "/api/v1/diagnostic",
        json={
            "client_session_id": str(uuid4()),
            "responses": _diagnostic_answers(**regularization_gap),
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["recommendation"]["concept_slug"] == "regularization"

    prerequisite_gap = {"101": "a", "102": "b"}
    response = client.post(
        "/api/v1/diagnostic",
        json={
            "client_session_id": str(uuid4()),
            "responses": _diagnostic_answers(**prerequisite_gap),
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["recommendation"]["concept_slug"] == "linear-regression"


def test_diagnostic_rejects_incomplete_duplicate_and_invalid_responses(client: TestClient) -> None:
    from uuid import uuid4

    answers = _diagnostic_answers()
    incomplete = client.post(
        "/api/v1/diagnostic",
        json={"client_session_id": str(uuid4()), "responses": answers[:-1]},
    )
    assert incomplete.status_code == 422

    duplicate = [dict(item) for item in answers]
    duplicate[-1]["question_id"] = duplicate[0]["question_id"]
    assert client.post(
        "/api/v1/diagnostic",
        json={"client_session_id": str(uuid4()), "responses": duplicate},
    ).status_code == 422

    invalid_confidence = [dict(item) for item in answers]
    invalid_confidence[0]["confidence"] = 6
    assert client.post(
        "/api/v1/diagnostic",
        json={"client_session_id": str(uuid4()), "responses": invalid_confidence},
    ).status_code == 422

    invalid_option = [dict(item) for item in answers]
    invalid_option[0]["answer_id"] = "z"
    assert client.post(
        "/api/v1/diagnostic",
        json={"client_session_id": str(uuid4()), "responses": invalid_option},
    ).status_code == 422


def test_foundations_catalog_and_concept_toolkit(client: TestClient) -> None:
    response = client.get("/api/v1/foundations")
    assert response.status_code == 200
    payload = response.json()
    assert payload["version"] == "2026.11-foundations-v2"
    assert len(payload["categories"]) == 7
    assert [category["id"] for category in payload["categories"]] == [
        "data",
        "math",
        "learning",
        "generalization",
        "algorithms",
        "deep-learning",
        "practice",
    ]
    assert all(len(category["readings"]) >= 2 for category in payload["categories"])
    assert len(payload["terms"]) >= 70
    slugs = {term["slug"] for term in payload["terms"]}
    assert len(slugs) == len(payload["terms"])
    assert {
        "gradient-descent",
        "linear-regression",
        "overfitting-underfitting",
        "pipeline",
        "attention-transformer",
        "calibration",
    } <= slugs
    for term in payload["terms"]:
        assert term["code"] and term["code_caption"] and term["pitfall"]
        assert set(term["related"]) <= slugs
        assert term["slug"] not in term["related"]

    detail = client.get("/api/v1/concepts/linear-regression").json()
    assert len(detail["symbols"]) >= 4
    assert len(detail["vocabulary"]) >= 4
    assert detail["algorithm"]["steps"]
    assert "lstsq" in detail["algorithm"]["code"]


def test_daily_plan_switches_to_review_after_all_sections(client: TestClient) -> None:
    concepts = client.get("/api/v1/concepts").json()
    for concept in concepts:
        detail = client.get(f"/api/v1/concepts/{concept['slug']}").json()
        for section in detail["sections"]:
            response = client.post(
                "/api/v1/progress/events",
                json={
                    "concept_id": concept["id"],
                    "event_type": "section_completed",
                    "section_id": section["id"],
                    "minutes": 2,
                },
            )
            assert response.status_code == 200

    plan = client.get("/api/v1/bootstrap").json()["daily_plan"]
    assert plan["mode"] == "review"
    assert plan["total_minutes"] == 30
    assert [step["kind"] for step in plan["steps"]] == ["think", "practice", "experiment", "reflect"]



def test_curriculum_stages_reference_real_content_and_follow_evidence(client: TestClient) -> None:
    body = client.get("/api/v1/curriculum").json()
    stages = body["stages"]
    assert [stage["order"] for stage in stages] == list(range(len(stages)))
    assert body["total_hours"] == sum(stage["hours"] for stage in stages)
    guided = [concept["slug"] for stage in stages for concept in stage["concepts"]]
    assert guided == [
        "linear-regression", "gradient-descent", "overfitting",
        "regularization", "logistic-regression", "model-evaluation",
        "decision-trees", "neural-networks", "ml-engineering",
    ]
    foundations = {term["slug"] for term in client.get("/api/v1/foundations").json()["terms"]}
    for stage in stages:
        assert all(term["slug"] in foundations for term in stage["foundations"])
        assert stage["milestone"]["href"].startswith("/")
    # Fresh learner: the first guided stage is current; nothing is marked complete.
    assert body["current_stage_id"] == "stage-1"
    assert all(stage["status"] != "complete" for stage in stages)
    # Completing every section of stage 1 moves "current" to stage 2.
    for concept in stages[1]["concepts"]:
        detail = client.get(f"/api/v1/concepts/{concept['slug']}").json()
        for section in detail["sections"]:
            client.post("/api/v1/progress/events", json={
                "concept_id": concept["id"], "event_type": "section_completed",
                "section_id": section["id"], "minutes": 2,
            })
    after = client.get("/api/v1/curriculum").json()
    assert after["current_stage_id"] == "stage-2"
    assert after["stages"][1]["status"] == "complete"
