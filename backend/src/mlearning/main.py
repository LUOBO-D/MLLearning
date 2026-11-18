"""FastAPI application for the local ML Fieldbook backend."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import date as date_type
from pathlib import Path
import re

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import DAILY_GOAL_MINUTES, FRONTEND_DIST, LOCAL_TIMEZONE, database_path
from .content import Concept, ContentRepository
from .database import Database
from .models import (
    Attempt,
    DiagnosticResponse as DiagnosticResponseRecord,
    DiagnosticSession,
    ExperimentCompletion,
    LearningEvent,
    Reflection as ReflectionRecord,
    SectionCompletion,
)
from .schemas import (
    AttemptRequest,
    AttemptResponse,
    BootstrapResponse,
    ConceptDetail,
    ConceptSummary,
    DiagnosticPayload,
    DiagnosticResult,
    DiagnosticSubmission,
    CurriculumResponse,
    FoundationsResponse,
    JournalResponse,
    ProgressEventRequest,
    ProgressEventResponse,
    ProgressResponse,
    QuestionPublic,
    Reflection,
    ReflectionInput,
    ReflectionSaved,
    TimelineEntry,
)
from .services import (
    calibration,
    curriculum,
    concept_summaries,
    concept_summary,
    daily_aggregates,
    daily_plan,
    diagnostic_recommendation,
    diagnostic_result,
    diagnostic_summary,
    event_public,
    iso_utc,
    latest_diagnostic,
    local_today,
    next_action,
    recent_activity,
    recent_mistakes,
    stats,
    to_local_date,
    unresolved_mistakes,
    utc_now,
    weekly,
)

API_PREFIX = "/api/v1"
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def get_db(request: Request):
    yield from request.app.state.database.session()


def get_repository(request: Request) -> ContentRepository:
    return request.app.state.repository


def require_concept(concept_id: int, repository: ContentRepository) -> Concept:
    concept = repository.concept_by_id(concept_id)
    if concept is None:
        raise HTTPException(status_code=404, detail="概念不存在")
    return concept


def valid_journal_date(value: str = Query(default="")) -> str:
    if not DATE_PATTERN.fullmatch(value):
        raise HTTPException(status_code=422, detail="日期必须使用 YYYY-MM-DD 格式")
    try:
        date_type.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="日期不是有效的日历日期") from exc
    return value


def create_app() -> FastAPI:
    database = Database(database_path())
    repository = ContentRepository()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        database.create_tables()
        yield
        database.dispose()

    app = FastAPI(
        title="ML Fieldbook API",
        version="0.1.0",
        description="本地机器学习学习平台的基础 API",
        lifespan=lifespan,
    )
    app.state.database = database
    app.state.repository = repository
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", include_in_schema=False)
    @app.get(f"{API_PREFIX}/health", tags=["system"])
    def health(session: Session = Depends(get_db)) -> dict[str, str]:
        session.execute(select(1))
        return {"status": "ok"}

    @app.get(f"{API_PREFIX}/bootstrap", response_model=BootstrapResponse, tags=["progress"])
    def bootstrap(session: Session = Depends(get_db)) -> dict:
        today = local_today().isoformat()
        today_aggregate = daily_aggregates(session, 1)[0]
        completed_today = session.scalar(
            select(func.count(SectionCompletion.id)).where(SectionCompletion.local_date == today)
        ) or 0
        return {
            "profile": {
                "name": "本地学习者",
                "timezone": LOCAL_TIMEZONE,
                "daily_goal_minutes": DAILY_GOAL_MINUTES,
            },
            "today": {
                "date": today,
                "minutes": today_aggregate["minutes"],
                "goal_minutes": DAILY_GOAL_MINUTES,
                "completed_sections": int(completed_today),
                "reviews_due": len(unresolved_mistakes(session)),
            },
            "next_action": next_action(session, repository),
            "concepts": concept_summaries(session, repository),
            "weekly": weekly(session),
            "recent_activity": recent_activity(session, repository, limit=12),
            "stats": stats(session),
            "diagnostic": diagnostic_summary(session, repository),
            "daily_plan": daily_plan(session, repository),
        }

    @app.get(f"{API_PREFIX}/diagnostic", response_model=DiagnosticPayload, tags=["diagnostic"])
    def get_diagnostic(session: Session = Depends(get_db)) -> dict:
        labels = {domain.id: domain.label for domain in repository.diagnostic.domains}
        latest = latest_diagnostic(session)
        latest_result = None
        if latest is not None:
            responses = session.scalars(
                select(DiagnosticResponseRecord)
                .where(DiagnosticResponseRecord.session_id == latest.id)
                .order_by(DiagnosticResponseRecord.id)
            ).all()
            latest_result = diagnostic_result(latest, list(responses), repository)
        return {
            "version": repository.diagnostic.version,
            "estimated_minutes": repository.diagnostic.estimated_minutes,
            "domains": [domain.model_dump() for domain in repository.diagnostic.domains],
            "questions": [
                {
                    "id": question.id,
                    "domain": question.domain,
                    "domain_label": labels[question.domain],
                    "dimension": question.dimension,
                    "difficulty": question.difficulty,
                    "prompt": question.prompt,
                    "options": [option.model_dump() for option in question.options],
                    "hint": question.hint,
                }
                for question in repository.diagnostic_questions
            ],
            "latest": latest_result,
        }

    @app.post(f"{API_PREFIX}/diagnostic", response_model=DiagnosticResult, tags=["diagnostic"])
    def submit_diagnostic(
        payload: DiagnosticSubmission,
        session: Session = Depends(get_db),
    ) -> dict:
        client_session_id = str(payload.client_session_id)
        existing = session.scalar(
            select(DiagnosticSession).where(
                DiagnosticSession.client_session_id == client_session_id
            )
        )
        if existing is not None:
            responses = session.scalars(
                select(DiagnosticResponseRecord)
                .where(DiagnosticResponseRecord.session_id == existing.id)
                .order_by(DiagnosticResponseRecord.id)
            ).all()
            return diagnostic_result(existing, list(responses), repository)

        submitted_ids = [answer.question_id for answer in payload.responses]
        if len(set(submitted_ids)) != len(submitted_ids):
            raise HTTPException(status_code=422, detail="每道诊断题只能作答一次")
        expected_ids = {question.id for question in repository.diagnostic_questions}
        if set(submitted_ids) != expected_ids:
            raise HTTPException(status_code=422, detail="必须完成本次起点诊断的全部 8 道题")

        correct_count = 0
        records: list[dict] = []
        for answer in payload.responses:
            question = repository.diagnostic_question_by_id(answer.question_id)
            if question is None:
                raise HTTPException(status_code=422, detail="诊断题不存在或已更新")
            if answer.answer_id not in {option.id for option in question.options}:
                raise HTTPException(status_code=422, detail="答案选项不属于该诊断题")
            is_correct = answer.answer_id == question.correct_answer_id
            correct_count += int(is_correct)
            records.append({
                "question": question,
                "answer": answer,
                "is_correct": is_correct,
            })

        domains = []
        for domain in repository.diagnostic.domains:
            domain_records = [record for record in records if record["question"].domain == domain.id]
            domains.append({
                "id": domain.id,
                "label": domain.label,
                "correct": sum(1 for record in domain_records if record["is_correct"]),
                "total": len(domain_records),
            })
        recommendation = diagnostic_recommendation(domains, repository)
        overview = (
            f"这次取样答对 {correct_count} / {len(records)} 题。"
            f"建议起点是《{recommendation['concept_title']}》。"
        )
        evidence_note = (
            "8 道题只支持本次入口建议，不是掌握率或能力标签。"
            "按建议开始学习后，可以用真实小节与作答继续校准。"
        )
        now = utc_now()
        record = DiagnosticSession(
            client_session_id=client_session_id,
            content_version=repository.diagnostic.version,
            correct_count=correct_count,
            total_questions=len(records),
            duration_seconds=sum(answer.time_spent_seconds for answer in payload.responses),
            result_snapshot={
                "domains": domains,
                "recommendation": recommendation,
                "overview": overview,
                "evidence_note": evidence_note,
            },
            created_at=now,
        )
        session.add(record)
        session.flush()
        stored: list[DiagnosticResponseRecord] = []
        for item in records:
            response_record = DiagnosticResponseRecord(
                session_id=record.id,
                question_id=item["question"].id,
                question_version=item["question"].version,
                answer_id=item["answer"].answer_id,
                is_correct=item["is_correct"],
                confidence=item["answer"].confidence,
                hints_used=item["answer"].hints_used,
                time_spent_seconds=item["answer"].time_spent_seconds,
            )
            session.add(response_record)
            stored.append(response_record)
        session.add(LearningEvent(
            event_type="diagnostic_completed",
            concept_id=None,
            title="完成起点诊断",
            minutes=0,
            local_date=to_local_date(now),
            created_at=now,
            event_metadata={
                "session_id": record.id,
                "correct_count": correct_count,
                "total": len(records),
                "recommendation_slug": recommendation["concept_slug"],
            },
        ))
        try:
            session.commit()
        except IntegrityError:
            # A double-submit race resolves to the first committed calibration.
            session.rollback()
            existing = session.scalar(
                select(DiagnosticSession).where(
                    DiagnosticSession.client_session_id == client_session_id
                )
            )
            if existing is None:
                raise HTTPException(status_code=409, detail="诊断提交发生冲突，请重试") from None
            responses = session.scalars(
                select(DiagnosticResponseRecord)
                .where(DiagnosticResponseRecord.session_id == existing.id)
                .order_by(DiagnosticResponseRecord.id)
            ).all()
            return diagnostic_result(existing, list(responses), repository)
        return diagnostic_result(record, stored, repository)

    @app.get(f"{API_PREFIX}/foundations", response_model=FoundationsResponse, tags=["content"])
    def list_foundations() -> dict:
        return {
            "version": repository.foundations.version,
            "title": repository.foundations.title,
            "description": repository.foundations.description,
            "categories": [
                category.model_dump() for category in repository.foundation_categories
            ],
            "terms": [term.model_dump() for term in repository.foundation_terms],
            "references": [
                source.model_dump() for source in repository.foundations.references
            ],
        }

    @app.get(f"{API_PREFIX}/curriculum", response_model=CurriculumResponse, tags=["content"])
    def get_curriculum(session: Session = Depends(get_db)) -> dict:
        return curriculum(session, repository)

    @app.get(f"{API_PREFIX}/concepts", response_model=list[ConceptSummary], tags=["content"])
    def list_concepts(session: Session = Depends(get_db)) -> list[dict]:
        return concept_summaries(session, repository)

    @app.get(f"{API_PREFIX}/concepts/{{slug}}", response_model=ConceptDetail, tags=["content"])
    def concept_detail(slug: str, session: Session = Depends(get_db)) -> dict:
        concept = repository.concept_by_slug(slug)
        if concept is None:
            raise HTTPException(status_code=404, detail="概念不存在")
        completed_ids = session.scalars(
            select(SectionCompletion.section_id)
            .where(SectionCompletion.concept_id == concept.id)
            .order_by(SectionCompletion.id)
        ).all()
        return {
            **concept_summary(session, concept),
            "description": concept.description,
            "objectives": list(concept.objectives),
            "sections": [section.model_dump() for section in concept.sections],
            "symbols": [symbol.model_dump() for symbol in concept.symbols],
            "vocabulary": [entry.model_dump() for entry in concept.vocabulary],
            "algorithm": concept.algorithm.model_dump(),
            "sources": [source.model_dump() for source in concept.sources],
            "experiment_type": concept.experiment_type,
            "completed_section_ids": list(completed_ids),
        }

    @app.get(f"{API_PREFIX}/questions", response_model=list[QuestionPublic], tags=["practice"])
    def list_questions(concept_id: int = Query(..., gt=0)) -> list[dict]:
        require_concept(concept_id, repository)
        return [
            {
                "id": question.id,
                "concept_id": question.concept_id,
                "prompt": question.prompt,
                "options": [option.model_dump() for option in question.options],
                "difficulty": question.difficulty,
            }
            for question in repository.questions_for_concept(concept_id)
        ]

    @app.post(f"{API_PREFIX}/attempts", response_model=AttemptResponse, tags=["practice"])
    def submit_attempt(payload: AttemptRequest, session: Session = Depends(get_db)) -> dict:
        question = repository.question_by_id(payload.question_id)
        if question is None:
            raise HTTPException(status_code=404, detail="题目不存在")
        if payload.answer_id not in {option.id for option in question.options}:
            raise HTTPException(status_code=422, detail="答案选项不属于该题目")
        concept = require_concept(question.concept_id, repository)
        is_correct = payload.answer_id == question.correct_answer_id
        now = utc_now()
        attempt = Attempt(
            question_id=question.id,
            concept_id=concept.id,
            answer_id=payload.answer_id,
            is_correct=is_correct,
            confidence=payload.confidence,
            time_spent_seconds=payload.time_spent_seconds,
            created_at=now,
        )
        session.add(attempt)
        session.flush()
        session.add(LearningEvent(
            event_type="question_attempted",
            concept_id=concept.id,
            title=f"完成《{concept.title}》练习",
            minutes=0,
            local_date=to_local_date(now),
            created_at=now,
            event_metadata={
                "question_id": question.id,
                "attempt_id": attempt.id,
                "is_correct": is_correct,
                "confidence": payload.confidence,
                "time_spent_seconds": payload.time_spent_seconds,
            },
        ))
        session.commit()
        return {
            "id": attempt.id,
            "is_correct": is_correct,
            "correct_answer_id": question.correct_answer_id,
            "explanation": question.explanation,
            "misconception": None if is_correct else question.misconception,
            "concept_slug": concept.slug,
        }

    @app.post(f"{API_PREFIX}/progress/events", response_model=ProgressEventResponse, tags=["progress"])
    def record_progress_event(
        payload: ProgressEventRequest,
        response: Response,
        session: Session = Depends(get_db),
    ) -> dict:
        concept = require_concept(payload.concept_id, repository)
        section = None
        if payload.section_id is not None:
            section = next((item for item in concept.sections if item.id == payload.section_id), None)
            if section is None:
                raise HTTPException(status_code=422, detail="小节不属于该概念")
        if payload.event_type == "section_completed" and section is None:
            raise HTTPException(status_code=422, detail="完成小节时必须提供有效的 section_id")

        now = utc_now()
        day = to_local_date(now)
        should_write_event = True
        counted_minutes = 0 if payload.event_type == "lesson_started" else payload.minutes

        if payload.event_type == "section_completed":
            existing = session.scalar(
                select(SectionCompletion).where(
                    SectionCompletion.concept_id == concept.id,
                    SectionCompletion.section_id == payload.section_id,
                )
            )
            if existing is None:
                session.add(SectionCompletion(
                    concept_id=concept.id,
                    section_id=payload.section_id,
                    minutes=payload.minutes,
                    local_date=day,
                    created_at=now,
                ))
            else:
                should_write_event = False
        elif payload.event_type == "experiment_completed":
            existing = session.scalar(
                select(ExperimentCompletion).where(
                    ExperimentCompletion.concept_id == concept.id,
                    ExperimentCompletion.local_date == day,
                )
            )
            if existing is None:
                session.add(ExperimentCompletion(
                    concept_id=concept.id,
                    minutes=payload.minutes,
                    local_date=day,
                    created_at=now,
                ))
            else:
                should_write_event = False

        if should_write_event:
            titles = {
                "section_completed": f"学完《{concept.title}》·{section.title if section else ''}",
                "experiment_completed": f"完成《{concept.title}》实验",
                "lesson_started": f"开始学习《{concept.title}》",
            }
            metadata = dict(payload.metadata)
            if payload.section_id is not None:
                metadata["section_id"] = payload.section_id
            session.add(LearningEvent(
                event_type=payload.event_type,
                concept_id=concept.id,
                title=titles[payload.event_type],
                minutes=counted_minutes,
                local_date=day,
                created_at=now,
                event_metadata=metadata,
            ))
        try:
            session.commit()
        except IntegrityError:
            # A concurrent duplicate completion loses the unique-key race cleanly.
            session.rollback()
            should_write_event = False
        response.headers["X-Progress-Recorded"] = "true" if should_write_event else "false"
        summary = concept_summary(session, concept)
        return {"ok": True, "completed_sections": summary["completed_sections"], "status": summary["status"]}

    @app.get(f"{API_PREFIX}/progress", response_model=ProgressResponse, tags=["progress"])
    def progress(session: Session = Depends(get_db)) -> dict:
        return {
            "stats": stats(session),
            "calibration": calibration(session),
            "concepts": concept_summaries(session, repository),
            "weekly": weekly(session),
            "recent_mistakes": recent_mistakes(session, repository),
            "recent_activity": recent_activity(session, repository),
        }

    @app.get(f"{API_PREFIX}/journal/{{date}}", response_model=JournalResponse, tags=["journal"])
    def get_journal(date: str, session: Session = Depends(get_db)) -> dict:
        date = valid_journal_date(date)
        events = session.scalars(
            select(LearningEvent).where(LearningEvent.local_date == date).order_by(LearningEvent.id)
        ).all()
        reflection = session.get(ReflectionRecord, date)
        minutes = next((entry["minutes"] for entry in daily_aggregates(session, 90) if entry["date"] == date), None)
        if minutes is None:
            minutes = session.scalar(
                select(func.coalesce(func.sum(LearningEvent.minutes), 0)).where(LearningEvent.local_date == date)
            ) or 0
        return {
            "date": date,
            "minutes": int(minutes),
            "events": [event_public(event, repository) for event in events],
            "reflection": {
                "learned": reflection.learned if reflection else "",
                "confused": reflection.confused if reflection else "",
                "next_step": reflection.next_step if reflection else "",
            },
        }

    @app.put(f"{API_PREFIX}/journal/{{date}}", response_model=ReflectionSaved, tags=["journal"])
    def put_journal(date: str, payload: ReflectionInput, session: Session = Depends(get_db)) -> dict:
        date = valid_journal_date(date)
        reflection = session.get(ReflectionRecord, date)
        now = utc_now()
        if reflection is None:
            reflection = ReflectionRecord(date=date, **payload.model_dump(), saved_at=now)
            session.add(reflection)
        else:
            reflection.learned = payload.learned
            reflection.confused = payload.confused
            reflection.next_step = payload.next_step
            reflection.saved_at = now
        session.commit()
        return {**payload.model_dump(), "saved_at": iso_utc(now)}

    @app.get(f"{API_PREFIX}/timeline", response_model=list[TimelineEntry], tags=["journal"])
    def timeline(days: int = Query(default=14, ge=1, le=90), session: Session = Depends(get_db)) -> list[dict]:
        return [
            {"date": entry["date"], "minutes": entry["minutes"], "event_count": entry["event_count"]}
            for entry in daily_aggregates(session, days)
        ]

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        """Serve the built SPA when present without masking unknown API routes."""

        if full_path == "api" or full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        dist = FRONTEND_DIST.resolve()
        index = dist / "index.html"
        if not index.is_file():
            raise HTTPException(status_code=404, detail="前端构建不存在")
        candidate = (dist / full_path).resolve()
        if candidate.is_relative_to(dist) and candidate.is_file():
            return FileResponse(candidate)
        if Path(full_path).suffix:
            raise HTTPException(status_code=404, detail="静态资源不存在")
        return FileResponse(index)

    return app


app = create_app()
