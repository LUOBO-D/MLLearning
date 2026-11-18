"""SQLAlchemy ORM models for durable local learning records."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    concept_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    answer_id: Mapped[str] = mapped_column(String(32), nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False)
    time_spent_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class LearningEvent(Base):
    __tablename__ = "learning_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    concept_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    local_date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    event_metadata: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSON, nullable=False, default=dict
    )


class SectionCompletion(Base):
    __tablename__ = "section_completions"
    __table_args__ = (
        UniqueConstraint("concept_id", "section_id", name="uq_section_completion"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    concept_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    section_id: Mapped[str] = mapped_column(String(100), nullable=False)
    minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    local_date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ExperimentCompletion(Base):
    __tablename__ = "experiment_completions"
    __table_args__ = (
        UniqueConstraint("concept_id", "local_date", name="uq_experiment_completion_day"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    concept_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    local_date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Reflection(Base):
    __tablename__ = "reflections"

    date: Mapped[str] = mapped_column(String(10), primary_key=True)
    learned: Mapped[str] = mapped_column(Text, nullable=False, default="")
    confused: Mapped[str] = mapped_column(Text, nullable=False, default="")
    next_step: Mapped[str] = mapped_column(Text, nullable=False, default="")
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DiagnosticSession(Base):
    __tablename__ = "diagnostic_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_session_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    content_version: Mapped[str] = mapped_column(String(80), nullable=False)
    correct_count: Mapped[int] = mapped_column(Integer, nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    result_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DiagnosticResponse(Base):
    __tablename__ = "diagnostic_responses"
    __table_args__ = (
        UniqueConstraint("session_id", "question_id", name="uq_diagnostic_response_question"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("diagnostic_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(Integer, nullable=False)
    question_version: Mapped[str] = mapped_column(String(40), nullable=False)
    answer_id: Mapped[str] = mapped_column(String(32), nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False)
    hints_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    time_spent_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
