"""Pydantic HTTP contracts. Secret question fields never enter public schemas."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class Profile(BaseModel):
    name: str
    timezone: str
    daily_goal_minutes: int


class Today(BaseModel):
    date: str
    minutes: int
    goal_minutes: int
    completed_sections: int
    reviews_due: int


class NextAction(BaseModel):
    concept_slug: str
    title: str
    reason: str


class DailyStep(BaseModel):
    id: str
    kind: Literal["think", "read", "do", "experiment", "practice", "reflect"]
    title: str
    instruction: str
    minutes: int
    href: str | None
    completed: bool


class DailyPlan(BaseModel):
    mode: Literal["learn", "review"]
    concept_slug: str
    concept_title: str
    section_id: str
    section_title: str
    focus: str
    success: str
    total_minutes: int
    steps: list[DailyStep]


class ConceptSummary(BaseModel):
    id: int
    slug: str
    title: str
    english_title: str
    kicker: str
    summary: str
    duration: int
    level: str
    order: int
    total_sections: int
    completed_sections: int
    status: Literal["not_started", "in_progress", "completed"]
    accent: str


class StageTerm(BaseModel):
    slug: str
    term: str
    english: str
    level: str
    summary: str


class StageMilestonePublic(BaseModel):
    title: str
    detail: str
    href: str
    action: str


class CurriculumStagePublic(BaseModel):
    id: str
    order: int
    title: str
    tagline: str
    goal: str
    hours: int
    level: str
    outcomes: list[str]
    status: Literal["complete", "current", "upcoming"]
    concepts: list[ConceptSummary]
    foundations: list[StageTerm]
    milestone: StageMilestonePublic


class CurriculumResponse(BaseModel):
    version: str
    title: str
    description: str
    total_hours: int
    current_stage_id: str
    stages: list[CurriculumStagePublic]


class LessonBlockPublic(BaseModel):
    heading: str
    paragraphs: list[str]
    formula: str | None
    formula_note: str | None


class WorkedExampleStepPublic(BaseModel):
    title: str
    detail: str
    formula: str | None


class WorkedExamplePublic(BaseModel):
    title: str
    setup: str
    steps: list[WorkedExampleStepPublic]
    conclusion: str


class CodeWalkthroughPublic(BaseModel):
    title: str
    code: str
    annotations: list[str]


class LessonMisconceptionPublic(BaseModel):
    mistake: str
    correction: str


class LessonSelfCheckPublic(BaseModel):
    question: str
    answer: str


class LessonContentPublic(BaseModel):
    hook: str
    blocks: list[LessonBlockPublic]
    worked_example: WorkedExamplePublic
    code_walkthrough: CodeWalkthroughPublic
    misconceptions: list[LessonMisconceptionPublic]
    recap: list[str]
    self_check: LessonSelfCheckPublic


class SectionPublic(BaseModel):
    id: str
    title: str
    summary: str
    paragraphs: list[str]
    formula: str | None
    key_point: str
    lesson: LessonContentPublic


class SourcePublic(BaseModel):
    label: str
    url: str


class SymbolPublic(BaseModel):
    symbol: str
    meaning: str


class VocabularyPublic(BaseModel):
    term: str
    english: str
    definition: str


class AlgorithmPublic(BaseModel):
    name: str
    steps: list[str]
    code: str
    code_caption: str


class ConceptDetail(ConceptSummary):
    description: str
    objectives: list[str]
    sections: list[SectionPublic]
    symbols: list[SymbolPublic]
    vocabulary: list[VocabularyPublic]
    algorithm: AlgorithmPublic
    sources: list[SourcePublic]
    experiment_type: Literal["regression", "descent", "complexity", "regularization", "classification", "evaluation", "tree", "network", "leakage"]
    completed_section_ids: list[str]


class FoundationCategoryPublic(BaseModel):
    id: str
    label: str
    description: str
    order: int
    readings: list[SourcePublic]


class FoundationTermPublic(BaseModel):
    id: int
    slug: str
    term: str
    english: str
    category: str
    level: Literal["入门", "基础", "进阶"]
    summary: str
    definition: str
    formula: str | None
    formula_note: str | None
    intuition: str
    steps: list[str]
    code: str
    code_caption: str
    pitfall: str
    related: list[str]


class FoundationsResponse(BaseModel):
    version: str
    title: str
    description: str
    categories: list[FoundationCategoryPublic]
    terms: list[FoundationTermPublic]
    references: list[SourcePublic]


class OptionPublic(BaseModel):
    id: str
    text: str


class QuestionPublic(BaseModel):
    id: int
    concept_id: int
    prompt: str
    options: list[OptionPublic]
    difficulty: str


class AttemptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_id: int
    answer_id: str = Field(min_length=1, max_length=32)
    confidence: int = Field(ge=1, le=5)
    time_spent_seconds: int = Field(ge=0, le=86400)


class AttemptResponse(BaseModel):
    id: int
    is_correct: bool
    correct_answer_id: str
    explanation: str
    misconception: str | None
    concept_slug: str


class ProgressEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    concept_id: int
    event_type: Literal["section_completed", "experiment_completed", "lesson_started"]
    section_id: str | None = Field(default=None, max_length=100)
    minutes: int = Field(default=0, ge=0, le=180)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProgressEventResponse(BaseModel):
    ok: Literal[True]
    completed_sections: int
    status: Literal["not_started", "in_progress", "completed"]


class DiagnosticDomainPublic(BaseModel):
    id: str
    label: str
    description: str


class DiagnosticQuestionPublic(BaseModel):
    id: int
    domain: str
    domain_label: str
    dimension: str
    difficulty: str
    prompt: str
    options: list[OptionPublic]
    hint: str


class DiagnosticDomainResult(BaseModel):
    id: str
    label: str
    correct: int
    total: int


class DiagnosticRecommendation(BaseModel):
    concept_slug: str
    concept_title: str
    reason: str


class DiagnosticItemResult(BaseModel):
    question_id: int
    domain: str
    domain_label: str
    prompt: str
    answer_id: str
    correct_answer_id: str
    is_correct: bool
    confidence: int
    hints_used: int
    explanation: str
    misconception: str


class DiagnosticResult(BaseModel):
    client_session_id: str
    content_version: str
    completed_at: str
    correct_count: int
    total: int
    duration_seconds: int
    overview: str
    domains: list[DiagnosticDomainResult]
    recommendation: DiagnosticRecommendation
    evidence_note: str
    items: list[DiagnosticItemResult]


class DiagnosticSummary(BaseModel):
    completed: bool
    completed_at: str | None
    correct_count: int
    total: int
    recommendation: DiagnosticRecommendation | None


class DiagnosticPayload(BaseModel):
    version: str
    estimated_minutes: int
    domains: list[DiagnosticDomainPublic]
    questions: list[DiagnosticQuestionPublic]
    latest: DiagnosticResult | None


class DiagnosticAnswerInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_id: int = Field(gt=0)
    answer_id: str = Field(min_length=1, max_length=32)
    confidence: int = Field(ge=1, le=5)
    hints_used: int = Field(default=0, ge=0, le=3)
    time_spent_seconds: int = Field(ge=0, le=600)


class DiagnosticSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_session_id: UUID
    responses: list[DiagnosticAnswerInput] = Field(min_length=8, max_length=8)


class Stats(BaseModel):
    total_minutes: int
    total_attempts: int
    correct_attempts: int
    completed_sections: int
    study_days: int


class EventPublic(BaseModel):
    id: int
    event_type: str
    concept_id: int | None
    concept_title: str | None
    title: str
    minutes: int
    created_at: str
    metadata: dict[str, Any]


class RecentMistake(BaseModel):
    question_id: int
    concept_title: str
    prompt: str
    misconception: str
    created_at: str


class BootstrapResponse(BaseModel):
    profile: Profile
    today: Today
    next_action: NextAction
    concepts: list[ConceptSummary]
    weekly: list["WeekEntry"]
    recent_activity: list[EventPublic]
    stats: Stats
    diagnostic: DiagnosticSummary
    daily_plan: DailyPlan


class WeekEntry(BaseModel):
    date: str
    weekday: str
    minutes: int


class CalibrationBucket(BaseModel):
    confidence: int = Field(ge=1, le=5)
    attempts: int = Field(ge=0)
    correct: int = Field(ge=0)


class ProgressResponse(BaseModel):
    stats: Stats
    calibration: list[CalibrationBucket]
    concepts: list[ConceptSummary]
    weekly: list[WeekEntry]
    recent_mistakes: list[RecentMistake]
    recent_activity: list[EventPublic]


class Reflection(BaseModel):
    learned: str = Field(default="", max_length=2000)
    confused: str = Field(default="", max_length=2000)
    next_step: str = Field(default="", max_length=2000)


class ReflectionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    learned: str = Field(default="", max_length=2000)
    confused: str = Field(default="", max_length=2000)
    next_step: str = Field(default="", max_length=2000)


class ReflectionSaved(Reflection):
    saved_at: str


class JournalResponse(BaseModel):
    date: str
    minutes: int
    events: list[EventPublic]
    reflection: Reflection


class TimelineEntry(BaseModel):
    date: str
    minutes: int
    event_count: int


BootstrapResponse.model_rebuild()
