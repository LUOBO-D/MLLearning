"""Read models and transparent progress calculations derived from stored events."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from .config import LOCAL_TIMEZONE
from .content import Concept, ContentRepository
from .models import (
    Attempt,
    DiagnosticResponse,
    DiagnosticSession,
    ExperimentCompletion,
    LearningEvent,
    Reflection,
    SectionCompletion,
)

SHANGHAI = ZoneInfo(LOCAL_TIMEZONE)
WEEKDAYS = ("周一", "周二", "周三", "周四", "周五", "周六", "周日")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def local_today() -> date:
    return datetime.now(SHANGHAI).date()


def to_local_date(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(SHANGHAI).date().isoformat()


def iso_utc(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def concept_summary(session: Session, concept: Concept) -> dict:
    completed = session.scalar(
        select(func.count(SectionCompletion.id)).where(SectionCompletion.concept_id == concept.id)
    ) or 0
    has_activity = session.scalar(
        select(LearningEvent.id).where(LearningEvent.concept_id == concept.id).limit(1)
    ) is not None
    if completed == len(concept.sections):
        status = "completed"
    elif completed > 0 or has_activity:
        status = "in_progress"
    else:
        status = "not_started"
    return {
        "id": concept.id,
        "slug": concept.slug,
        "title": concept.title,
        "english_title": concept.english_title,
        "kicker": concept.kicker,
        "summary": concept.summary,
        "duration": concept.duration,
        "level": concept.level,
        "order": concept.order,
        "total_sections": len(concept.sections),
        "completed_sections": completed,
        "status": status,
        "accent": concept.accent,
    }


def concept_summaries(session: Session, repository: ContentRepository) -> list[dict]:
    return [concept_summary(session, concept) for concept in repository.concepts]


def event_public(event: LearningEvent, repository: ContentRepository) -> dict:
    concept = repository.concept_by_id(event.concept_id) if event.concept_id is not None else None
    return {
        "id": event.id,
        "event_type": event.event_type,
        "concept_id": event.concept_id,
        "concept_title": concept.title if concept else None,
        "title": event.title,
        "minutes": event.minutes,
        "created_at": iso_utc(event.created_at),
        "metadata": event.event_metadata or {},
    }


def stats(session: Session) -> dict:
    total_minutes = session.scalar(select(func.coalesce(func.sum(LearningEvent.minutes), 0))) or 0
    total_attempts = session.scalar(select(func.count(Attempt.id))) or 0
    correct_attempts = session.scalar(
        select(func.count(Attempt.id)).where(Attempt.is_correct.is_(True))
    ) or 0
    completed_sections = session.scalar(select(func.count(SectionCompletion.id))) or 0
    study_days = session.scalar(select(func.count(func.distinct(LearningEvent.local_date)))) or 0
    return {
        "total_minutes": int(total_minutes),
        "total_attempts": int(total_attempts),
        "correct_attempts": int(correct_attempts),
        "completed_sections": int(completed_sections),
        "study_days": int(study_days),
    }


def calibration(session: Session) -> list[dict]:
    """Attempts and correct answers per declared confidence level (1–5), from raw records only."""
    rows = session.execute(
        select(
            Attempt.confidence,
            func.count(Attempt.id),
            func.coalesce(func.sum(case((Attempt.is_correct.is_(True), 1), else_=0)), 0),
        ).group_by(Attempt.confidence)
    ).all()
    by_level = {int(level): (int(total), int(correct)) for level, total, correct in rows}
    return [
        {"confidence": level, "attempts": by_level.get(level, (0, 0))[0], "correct": by_level.get(level, (0, 0))[1]}
        for level in range(1, 6)
    ]


def daily_aggregates(session: Session, days: int) -> list[dict]:
    """Return complete ascending local-day buckets, including days with no activity."""

    end = local_today()
    start = end - timedelta(days=days - 1)
    rows = session.execute(
        select(
            LearningEvent.local_date,
            func.coalesce(func.sum(LearningEvent.minutes), 0),
            func.count(LearningEvent.id),
        )
        .where(LearningEvent.local_date >= start.isoformat())
        .where(LearningEvent.local_date <= end.isoformat())
        .group_by(LearningEvent.local_date)
    ).all()
    by_date = {row[0]: (int(row[1]), int(row[2])) for row in rows}
    result = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        key = day.isoformat()
        minutes, count = by_date.get(key, (0, 0))
        result.append({"date": key, "minutes": minutes, "event_count": count, "weekday": WEEKDAYS[day.weekday()]})
    return result


def weekly(session: Session) -> list[dict]:
    return [
        {"date": entry["date"], "weekday": entry["weekday"], "minutes": entry["minutes"]}
        for entry in daily_aggregates(session, 7)
    ]


def recent_activity(session: Session, repository: ContentRepository, limit: int = 20) -> list[dict]:
    events = session.scalars(
        select(LearningEvent).order_by(LearningEvent.id.desc()).limit(limit)
    ).all()
    return [event_public(event, repository) for event in events]


def unresolved_mistakes(session: Session) -> list[Attempt]:
    """A mistake is unresolved until a later attempt on that question is correct."""

    attempts = session.scalars(select(Attempt).order_by(Attempt.id.desc())).all()
    seen: set[int] = set()
    unresolved: list[Attempt] = []
    for attempt in attempts:
        if attempt.question_id in seen:
            continue
        seen.add(attempt.question_id)
        if not attempt.is_correct:
            unresolved.append(attempt)
    return unresolved


def recent_mistakes(session: Session, repository: ContentRepository, limit: int = 10) -> list[dict]:
    attempts = session.scalars(
        select(Attempt).where(Attempt.is_correct.is_(False)).order_by(Attempt.id.desc()).limit(limit)
    ).all()
    result = []
    for attempt in attempts:
        question = repository.question_by_id(attempt.question_id)
        concept = repository.concept_by_id(attempt.concept_id)
        if question and concept:
            result.append({
                "question_id": question.id,
                "concept_title": concept.title,
                "prompt": question.prompt,
                "misconception": question.misconception,
                "created_at": iso_utc(attempt.created_at),
            })
    return result


def next_action(session: Session, repository: ContentRepository) -> dict:
    unresolved = unresolved_mistakes(session)
    if unresolved:
        concept = repository.concept_by_id(unresolved[0].concept_id)
        if concept:
            return {
                "concept_slug": concept.slug,
                "title": f"修复《{concept.title}》中的误解",
                "reason": "最近一次独立作答仍有误解，建议回到对应内容并完成一道变式练习。",
            }

    has_concept_activity = session.scalar(
        select(LearningEvent.id)
        .where(LearningEvent.concept_id.is_not(None))
        .limit(1)
    ) is not None
    if not has_concept_activity:
        diagnostic = latest_diagnostic(session)
        if diagnostic is not None:
            recommendation = diagnostic.result_snapshot["recommendation"]
            concept = repository.concept_by_slug(recommendation["concept_slug"])
            if concept is not None:
                return {
                    "concept_slug": concept.slug,
                    "title": f"从《{concept.title}》开始",
                    "reason": (
                        f"起点诊断建议这里作为入口。{recommendation['reason']}"
                        "这是一次 8 题取样，不是掌握率。"
                    ),
                }

    summaries = concept_summaries(session, repository)
    for concept, summary in zip(repository.concepts, summaries, strict=True):
        if summary["status"] != "completed":
            reason = (
                f"已学完 {summary['completed_sections']} 个小节，继续下一小节即可保持学习链路。"
                if summary["completed_sections"]
                else "这是学习路线中的下一个基础概念，先建立直觉，再用实验和练习验证。"
            )
            return {"concept_slug": concept.slug, "title": f"学习《{concept.title}》", "reason": reason}
    concept = repository.concepts[-1]
    return {
        "concept_slug": concept.slug,
        "title": "复习并迁移所学",
        "reason": "三个概念的小节均已完成，建议通过练习检查是否仍能独立应用。",
    }


def latest_diagnostic(session: Session) -> DiagnosticSession | None:
    return session.scalars(
        select(DiagnosticSession).order_by(DiagnosticSession.id.desc()).limit(1)
    ).first()


def diagnostic_summary(
    session: Session, repository: ContentRepository
) -> dict:
    latest = latest_diagnostic(session)
    if latest is None:
        return {
            "completed": False,
            "completed_at": None,
            "correct_count": 0,
            "total": len(repository.diagnostic_questions),
            "recommendation": None,
        }
    snapshot = latest.result_snapshot
    return {
        "completed": True,
        "completed_at": iso_utc(latest.created_at),
        "correct_count": latest.correct_count,
        "total": latest.total_questions,
        "recommendation": snapshot.get("recommendation"),
    }


def diagnostic_recommendation(
    domains: list[dict], repository: ContentRepository
) -> dict:
    """Choose an evidence-backed entry point without pretending to measure mastery."""

    by_domain = {entry["id"]: entry for entry in domains}
    if by_domain["prerequisites"]["correct"] < 2:
        slug = "linear-regression"
        reason = (
            "先修补给题暴露出变化方向和残差判断的缺口。线性回归会从斜率和损失开始，"
            "把这两件事重新连起来。"
        )
    elif by_domain["loss"]["correct"] < 2:
        slug = "linear-regression"
        reason = (
            "损失函数题还没有稳定支持后续判断。建议从线性回归的残差与最小二乘开始，"
            "而不是直接跳向正则化。"
        )
    elif by_domain["generalization"]["correct"] < 2:
        slug = "overfitting"
        reason = (
            "你已经能处理基本拟合，但训练误差与验证误差的分离还不稳定。"
            "从过拟合一章开始更有针对性。"
        )
    elif by_domain["regularization"]["correct"] < 2:
        slug = "regularization"
        reason = (
            "拟合与评估的题目表现稳定，但约束和超参数选择的证据不足。"
            "可以从正则化一章开始。"
        )
    else:
        slug = "linear-regression"
        reason = (
            "这次 8 题都答对，但诊断只覆盖短判断。建议仍从线性回归开始，"
            "用推导与实验验证题目无法覆盖的能力。"
        )
    concept = repository.concept_by_slug(slug)
    if concept is None:
        concept = repository.concepts[0]
    return {"concept_slug": concept.slug, "concept_title": concept.title, "reason": reason}


def diagnostic_result(
    record: DiagnosticSession,
    responses: list[DiagnosticResponse],
    repository: ContentRepository,
) -> dict:
    snapshot = record.result_snapshot
    labels = {domain.id: domain.label for domain in repository.diagnostic.domains}
    items = []
    for response in responses:
        question = repository.diagnostic_question_by_id(response.question_id)
        if question is None:
            continue
        items.append({
            "question_id": question.id,
            "domain": question.domain,
            "domain_label": labels.get(question.domain, question.domain),
            "prompt": question.prompt,
            "answer_id": response.answer_id,
            "correct_answer_id": question.correct_answer_id,
            "is_correct": response.is_correct,
            "confidence": response.confidence,
            "hints_used": response.hints_used,
            "explanation": question.explanation,
            "misconception": question.misconception,
        })
    return {
        "client_session_id": record.client_session_id,
        "content_version": record.content_version,
        "completed_at": iso_utc(record.created_at),
        "correct_count": record.correct_count,
        "total": record.total_questions,
        "duration_seconds": record.duration_seconds,
        "overview": snapshot["overview"],
        "domains": snapshot["domains"],
        "recommendation": snapshot["recommendation"],
        "evidence_note": snapshot["evidence_note"],
        "items": items,
    }

def daily_plan(session: Session, repository: ContentRepository) -> dict:
    """Build a concrete, evidence-aware session from the next unfinished section."""

    today = local_today().isoformat()
    selected: Concept | None = None
    section = None
    completed_ids: set[str] = set()
    completed_today = False

    for concept in repository.concepts:
        rows = session.scalars(
            select(SectionCompletion)
            .where(SectionCompletion.concept_id == concept.id)
            .order_by(SectionCompletion.id)
        ).all()
        ids = {row.section_id for row in rows}
        if len(ids) >= len(concept.sections):
            continue
        selected = concept
        completed_ids = ids
        today_rows = [row for row in rows if row.local_date == today]
        if today_rows:
            pinned = next(
                (item for item in concept.sections if item.id == today_rows[-1].section_id),
                None,
            )
            section = pinned or next(item for item in concept.sections if item.id not in ids)
            completed_today = section.id in ids
        else:
            section = next(item for item in concept.sections if item.id not in ids)
        break

    if selected is None or section is None:
        selected = repository.concepts[-1]
        section = selected.sections[-1]
        practice_done = any(
            to_local_date(attempt.created_at) == today
            for attempt in session.scalars(
                select(Attempt).where(Attempt.concept_id == selected.id)
            ).all()
        )
        reflection = session.get(Reflection, today)
        reflect_done = bool(
            reflection and any((reflection.learned, reflection.confused, reflection.next_step))
        )
        steps = [
            {
                "id": "review-think",
                "kind": "think",
                "title": "把整章压成判断清单",
                "instruction": "不翻页面，写下这一章最容易做错的三个判断点。写完再打开资料核对。",
                "minutes": 4,
                "href": None,
                "completed": False,
            },
            {
                "id": "review-practice",
                "kind": "practice",
                "title": "用一题检查迁移",
                "instruction": "做一道题，重点不是答对，而是说出另外三个选项为什么错。",
                "minutes": 12,
                "href": f"/practice?concept={selected.slug}",
                "completed": practice_done,
            },
            {
                "id": "review-experiment",
                "kind": "experiment",
                "title": "改变一个条件",
                "instruction": "在实验中改变一个参数，预测结果后再运行；记录预测与实际是否一致。",
                "minutes": 10,
                "href": f"/learn/{selected.slug}#section-experiment",
                "completed": session.scalar(
                    select(ExperimentCompletion.id)
                    .where(
                        ExperimentCompletion.concept_id == selected.id,
                        ExperimentCompletion.local_date == today,
                    )
                    .limit(1)
                ) is not None,
            },
            {
                "id": "review-reflect",
                "kind": "reflect",
                "title": "留下下一步",
                "instruction": "写下一个仍不确定的点，以及下一次打开平台时要验证的具体动作。",
                "minutes": 4,
                "href": "/journal",
                "completed": reflect_done,
            },
        ]
        return {
            "mode": "review",
            "concept_slug": selected.slug,
            "concept_title": selected.title,
            "section_id": section.id,
            "section_title": section.title,
            "focus": f"把《{selected.title}》从“看懂”推进到“能迁移”：哪些判断最容易错？",
            "success": "不看页面，能说出三个判断点、一个反例，并解释它们分别对应哪条证据。",
            "total_minutes": sum(step["minutes"] for step in steps),
            "steps": steps,
        }

    experiment_done = session.scalar(
        select(ExperimentCompletion.id)
        .where(
            ExperimentCompletion.concept_id == selected.id,
            ExperimentCompletion.local_date == today,
        )
        .limit(1)
    ) is not None
    practice_done = any(
        to_local_date(attempt.created_at) == today
        for attempt in session.scalars(
            select(Attempt).where(Attempt.concept_id == selected.id)
        ).all()
    )
    reflection = session.get(Reflection, today)
    reflect_done = bool(
        reflection and any((reflection.learned, reflection.confused, reflection.next_step))
    )

    section_href = f"/learn/{selected.slug}#section-{section.id}"
    steps = [
        {
            "id": "think",
            "kind": "think",
            "title": "先判断，不查资料",
            "instruction": "用 30 秒给出你的判断，并把理由压缩成一句。先不要打开正文。",
            "minutes": 3,
            "href": None,
            "completed": False,
        },
        {
            "id": "read",
            "kind": "read",
            "title": f"精读：{section.title}",
            "instruction": "只读这一节，不从头翻整章。遇到公式先遮住解释，自己推一步；读完回到这里。",
            "minutes": 12,
            "href": section_href,
            "completed": section.id in completed_ids and completed_today,
        },
        {
            "id": "do",
            "kind": "do",
            "title": "动手，而不是继续看",
            "instruction": section.daily.action,
            "minutes": 12,
            "href": section_href,
            "completed": False,
        },
        {
            "id": "experiment",
            "kind": "experiment",
            "title": "用实验对照",
            "instruction": "改变一个参数，记录两组不同结果。不要只看曲线，要说出变化的原因。",
            "minutes": 10,
            "href": f"/learn/{selected.slug}#section-experiment",
            "completed": experiment_done,
        },
        {
            "id": "practice",
            "kind": "practice",
            "title": "做一道题，不查答案",
            "instruction": "完成 1 道题。提交前标出把握程度，提交后读误解反馈；答错也要留下原因。",
            "minutes": 10,
            "href": f"/practice?concept={selected.slug}",
            "completed": practice_done,
        },
        {
            "id": "reflect",
            "kind": "reflect",
            "title": "留下今天的证据",
            "instruction": section.daily.output,
            "minutes": 5,
            "href": "/journal",
            "completed": reflect_done,
        },
    ]
    return {
        "mode": "learn",
        "concept_slug": selected.slug,
        "concept_title": selected.title,
        "section_id": section.id,
        "section_title": section.title,
        "focus": section.daily.question,
        "success": section.daily.success,
        "total_minutes": sum(step["minutes"] for step in steps),
        "steps": steps,
    }




def curriculum(session: Session, repository: ContentRepository) -> dict:
    """Stage status comes only from recorded evidence: chapter completion and the diagnostic."""
    summaries = {item["slug"]: item for item in concept_summaries(session, repository)}
    diagnostic_done = latest_diagnostic(session) is not None
    stages = repository.curriculum.stages
    guided_complete = {
        stage.id: all(summaries[slug]["status"] == "completed" for slug in stage.concepts)
        for stage in stages
        if stage.concepts
    }
    current = next((stage.id for stage in stages if stage.concepts and not guided_complete[stage.id]), None)
    if current is None:
        current = next((stage.id for stage in stages if not stage.concepts and stage.order > 0), stages[-1].id)

    def status(stage) -> str:
        if stage.id == current:
            return "current"
        if stage.concepts:
            return "complete" if guided_complete[stage.id] else "upcoming"
        if stage.order == 0:
            return "complete" if diagnostic_done else "upcoming"
        return "upcoming"

    public = []
    for stage in stages:
        public.append({
            **stage.model_dump(exclude={"concepts", "foundations"}),
            "status": status(stage),
            "concepts": [summaries[slug] for slug in stage.concepts],
            "foundations": [
                {key: getattr(term, key) for key in ("slug", "term", "english", "level", "summary")}
                for term in (repository.foundation_by_slug(slug) for slug in stage.foundations)
                if term is not None
            ],
        })
    return {
        "version": repository.curriculum.version,
        "title": repository.curriculum.title,
        "description": repository.curriculum.description,
        "total_hours": sum(stage.hours for stage in stages),
        "current_stage_id": current,
        "stages": public,
    }
