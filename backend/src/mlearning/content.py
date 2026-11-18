"""Validated, read-only course content loaded from the shared content package."""

from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .config import curriculum_path, content_path, diagnostic_path, foundations_path


class ContentModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Source(ContentModel):
    label: str = Field(min_length=1)
    url: str = Field(pattern=r"^https://")


class DailyGuide(ContentModel):
    question: str = Field(min_length=8, max_length=200)
    action: str = Field(min_length=20, max_length=800)
    output: str = Field(min_length=8, max_length=300)
    success: str = Field(min_length=8, max_length=300)


class LessonBlock(ContentModel):
    heading: str = Field(min_length=4, max_length=100)
    paragraphs: list[str] = Field(min_length=2, max_length=3)
    formula: str | None = None
    formula_note: str | None = None


class WorkedExampleStep(ContentModel):
    title: str = Field(min_length=2, max_length=80)
    detail: str = Field(min_length=20)
    formula: str | None = None


class WorkedExample(ContentModel):
    title: str = Field(min_length=4, max_length=120)
    setup: str = Field(min_length=20)
    steps: list[WorkedExampleStep] = Field(min_length=3, max_length=3)
    conclusion: str = Field(min_length=20)


class CodeWalkthrough(ContentModel):
    title: str = Field(min_length=4, max_length=120)
    code: str = Field(min_length=20)
    annotations: list[str] = Field(min_length=3, max_length=3)


class LessonMisconception(ContentModel):
    mistake: str = Field(min_length=8)
    correction: str = Field(min_length=20)


class LessonSelfCheck(ContentModel):
    question: str = Field(min_length=8)
    answer: str = Field(min_length=20)


class LessonContent(ContentModel):
    hook: str = Field(min_length=40)
    blocks: list[LessonBlock] = Field(min_length=3, max_length=3)
    worked_example: WorkedExample
    code_walkthrough: CodeWalkthrough
    misconceptions: list[LessonMisconception] = Field(min_length=2, max_length=2)
    recap: list[str] = Field(min_length=3, max_length=3)
    self_check: LessonSelfCheck


class Section(ContentModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    paragraphs: list[str] = Field(min_length=2, max_length=2)
    formula: str | None = None
    key_point: str = Field(min_length=1)
    daily: DailyGuide
    lesson: LessonContent


class SymbolEntry(ContentModel):
    symbol: str = Field(min_length=1)
    meaning: str = Field(min_length=1)


class VocabularyEntry(ContentModel):
    term: str = Field(min_length=1)
    english: str = Field(min_length=1)
    definition: str = Field(min_length=1)


class Algorithm(ContentModel):
    name: str = Field(min_length=1)
    steps: list[str] = Field(min_length=3, max_length=8)
    code: str = Field(min_length=10)
    code_caption: str = Field(min_length=1)


class Concept(ContentModel):
    id: int = Field(gt=0)
    slug: str
    title: str
    english_title: str
    kicker: str
    summary: str
    description: str
    duration: int = Field(gt=0)
    level: str
    order: int = Field(gt=0)
    accent: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    experiment_type: Literal["regression", "descent", "complexity", "regularization", "classification", "evaluation", "tree", "network", "leakage"]
    objectives: list[str] = Field(min_length=3, max_length=3)
    sections: list[Section] = Field(min_length=3, max_length=3)
    symbols: list[SymbolEntry] = Field(min_length=4, max_length=8)
    vocabulary: list[VocabularyEntry] = Field(min_length=4, max_length=8)
    algorithm: Algorithm
    sources: list[Source] = Field(min_length=1)

    @model_validator(mode="after")
    def section_ids_are_unique(self) -> "Concept":
        ids = [section.id for section in self.sections]
        if len(ids) != len(set(ids)):
            raise ValueError(f"概念 {self.slug} 存在重复小节 ID")
        return self


class Option(ContentModel):
    id: str = Field(min_length=1)
    text: str = Field(min_length=1)


class Question(ContentModel):
    id: int = Field(gt=0)
    concept_id: int = Field(gt=0)
    prompt: str = Field(min_length=1)
    options: list[Option] = Field(min_length=4, max_length=4)
    correct_answer_id: str
    explanation: str = Field(min_length=1)
    misconception: str = Field(min_length=1)
    difficulty: str = Field(min_length=1)

    @model_validator(mode="after")
    def answer_is_an_option(self) -> "Question":
        option_ids = [option.id for option in self.options]
        if len(option_ids) != len(set(option_ids)):
            raise ValueError(f"题目 {self.id} 存在重复选项 ID")
        if self.correct_answer_id not in option_ids:
            raise ValueError(f"题目 {self.id} 的正确答案不在选项中")
        return self


DiagnosticDomainId = Literal["prerequisites", "loss", "generalization", "regularization"]


class DiagnosticDomain(ContentModel):
    id: DiagnosticDomainId
    label: str = Field(min_length=1, max_length=40)
    description: str = Field(min_length=1, max_length=120)


class DiagnosticQuestion(ContentModel):
    id: int = Field(gt=0)
    domain: DiagnosticDomainId
    version: str = Field(min_length=1, max_length=40)
    dimension: str = Field(min_length=1, max_length=40)
    difficulty: str = Field(min_length=1, max_length=20)
    prompt: str = Field(min_length=1)
    options: list[Option] = Field(min_length=4, max_length=4)
    correct_answer_id: str
    explanation: str = Field(min_length=1)
    hint: str = Field(min_length=1)
    misconception: str = Field(min_length=1)

    @model_validator(mode="after")
    def answer_is_an_option(self) -> "DiagnosticQuestion":
        option_ids = [option.id for option in self.options]
        if len(option_ids) != len(set(option_ids)):
            raise ValueError(f"诊断题 {self.id} 存在重复选项 ID")
        if self.correct_answer_id not in option_ids:
            raise ValueError(f"诊断题 {self.id} 的正确答案不在选项中")
        return self


class DiagnosticCatalog(ContentModel):
    version: str = Field(min_length=1, max_length=60)
    estimated_minutes: int = Field(ge=3, le=20)
    domains: list[DiagnosticDomain] = Field(min_length=4, max_length=4)
    questions: list[DiagnosticQuestion] = Field(min_length=8, max_length=8)

    @model_validator(mode="after")
    def structure_is_valid(self) -> "DiagnosticCatalog":
        expected = ["prerequisites", "loss", "generalization", "regularization"]
        if [domain.id for domain in self.domains] != expected:
            raise ValueError("诊断领域必须按先修补给、损失、泛化、正则化排列")
        domain_ids = {domain.id for domain in self.domains}
        if len({question.id for question in self.questions}) != 8:
            raise ValueError("诊断题 ID 必须唯一")
        for domain in self.domains:
            count = sum(1 for question in self.questions if question.domain == domain.id)
            if count != 2:
                raise ValueError(f"诊断领域 {domain.id} 必须恰好有 2 道题")
        if any(question.domain not in domain_ids for question in self.questions):
            raise ValueError("诊断题引用了不存在的领域")
        return self


FoundationCategoryId = Literal[
    "data",
    "math",
    "learning",
    "generalization",
    "algorithms",
    "deep-learning",
    "practice",
]


class FoundationCategory(ContentModel):
    id: FoundationCategoryId
    label: str = Field(min_length=1, max_length=30)
    description: str = Field(min_length=1, max_length=160)
    order: int = Field(ge=1, le=7)
    readings: list[Source] = Field(min_length=2, max_length=4)


class FoundationTerm(ContentModel):
    id: int = Field(gt=0)
    slug: str = Field(min_length=1, max_length=80)
    term: str = Field(min_length=1, max_length=40)
    english: str = Field(min_length=1, max_length=80)
    category: FoundationCategoryId
    level: Literal["入门", "基础", "进阶"]
    summary: str = Field(min_length=1, max_length=180)
    definition: str = Field(min_length=1)
    formula: str | None = None
    formula_note: str | None = Field(default=None, max_length=300)
    intuition: str = Field(min_length=1)
    steps: list[str] = Field(default_factory=list, max_length=8)
    code: str = Field(min_length=10)
    code_caption: str = Field(min_length=1, max_length=160)
    pitfall: str = Field(min_length=1)
    related: list[str] = Field(min_length=1, max_length=6)


class FoundationCatalog(ContentModel):
    version: str = Field(min_length=1, max_length=60)
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=300)
    categories: list[FoundationCategory] = Field(min_length=7, max_length=7)
    terms: list[FoundationTerm] = Field(min_length=70, max_length=80)
    references: list[Source] = Field(min_length=1)

    @model_validator(mode="after")
    def structure_is_valid(self) -> "FoundationCatalog":
        expected = [
            "data",
            "math",
            "learning",
            "generalization",
            "algorithms",
            "deep-learning",
            "practice",
        ]
        if [category.id for category in self.categories] != expected:
            raise ValueError("基础概念分类顺序不符合约定")
        if [category.order for category in self.categories] != [1, 2, 3, 4, 5, 6, 7]:
            raise ValueError("基础概念分类 order 必须为 1–7")
        if len({term.id for term in self.terms}) != len(self.terms):
            raise ValueError("基础概念 ID 必须唯一")
        if len({term.slug for term in self.terms}) != len(self.terms):
            raise ValueError("基础概念 slug 必须唯一")
        category_ids = {category.id for category in self.categories}
        for category in self.categories:
            count = sum(1 for term in self.terms if term.category == category.id)
            if count < 4:
                raise ValueError(f"分类 {category.id} 至少需要 4 条基础概念")
        if any(term.category not in category_ids for term in self.terms):
            raise ValueError("基础概念引用了不存在的分类")
        slugs = {term.slug for term in self.terms}
        for term in self.terms:
            missing = [slug for slug in term.related if slug not in slugs]
            if missing:
                raise ValueError(f"基础概念 {term.slug} 引用了不存在的词条：{missing}")
            if term.slug in term.related:
                raise ValueError(f"基础概念 {term.slug} 不能引用自身")
        return self


GUIDED_PATH = [
    "linear-regression",
    "gradient-descent",
    "overfitting",
    "regularization",
    "logistic-regression",
    "model-evaluation",
    "decision-trees",
    "neural-networks",
    "ml-engineering",
]


class Catalog(ContentModel):
    concepts: list[Concept] = Field(min_length=9, max_length=9)
    questions: list[Question] = Field(min_length=27, max_length=27)

    @model_validator(mode="after")
    def references_and_order_are_valid(self) -> "Catalog":
        ordered = sorted(self.concepts, key=lambda concept: concept.order)
        if [concept.slug for concept in ordered] != GUIDED_PATH:
            raise ValueError("概念必须按 " + "、".join(GUIDED_PATH) + " 排列")
        if [concept.order for concept in ordered] != list(range(1, len(GUIDED_PATH) + 1)):
            raise ValueError("概念 order 必须从 1 连续编号")
        if len({concept.id for concept in self.concepts}) != len(self.concepts):
            raise ValueError("概念 ID 必须唯一")
        if len({question.id for question in self.questions}) != len(self.questions):
            raise ValueError("题目 ID 必须唯一")
        concept_ids = {concept.id for concept in self.concepts}
        for concept in self.concepts:
            concept_questions = [q for q in self.questions if q.concept_id == concept.id]
            if len(concept_questions) != 3:
                raise ValueError(f"概念 {concept.slug} 必须恰好有 3 道题")
        if any(question.concept_id not in concept_ids for question in self.questions):
            raise ValueError("题目引用了不存在的概念")
        return self


class StageMilestone(ContentModel):
    title: str = Field(min_length=4, max_length=60)
    detail: str = Field(min_length=20, max_length=300)
    href: str = Field(pattern=r"^/")
    action: str = Field(min_length=2, max_length=24)


class CurriculumStage(ContentModel):
    id: str = Field(pattern=r"^stage-[0-9]+$")
    order: int = Field(ge=0)
    title: str = Field(min_length=2, max_length=30)
    tagline: str = Field(min_length=2, max_length=40)
    goal: str = Field(min_length=10, max_length=120)
    hours: int = Field(gt=0, le=60)
    level: str = Field(min_length=2, max_length=10)
    outcomes: list[str] = Field(min_length=3, max_length=5)
    concepts: list[str]
    foundations: list[str] = Field(min_length=4, max_length=12)
    milestone: StageMilestone


class Curriculum(ContentModel):
    version: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=60)
    description: str = Field(min_length=10, max_length=300)
    stages: list[CurriculumStage] = Field(min_length=3, max_length=10)

    @model_validator(mode="after")
    def stages_are_ordered(self) -> "Curriculum":
        if [stage.order for stage in self.stages] != list(range(len(self.stages))):
            raise ValueError("学习路径阶段 order 必须从 0 连续编号")
        if len({stage.id for stage in self.stages}) != len(self.stages):
            raise ValueError("学习路径阶段 ID 必须唯一")
        return self


@lru_cache(maxsize=4)
def _load_curriculum(path: str) -> Curriculum:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return Curriculum.model_validate(raw)


@lru_cache(maxsize=4)
def _load_catalog(path: str) -> Catalog:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return Catalog.model_validate(raw)


@lru_cache(maxsize=4)
def _load_diagnostic(path: str) -> DiagnosticCatalog:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return DiagnosticCatalog.model_validate(raw)


@lru_cache(maxsize=4)
def _load_foundations(path: str) -> FoundationCatalog:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return FoundationCatalog.model_validate(raw)


class ContentRepository:
    def __init__(
        self,
        path: Path | None = None,
        diagnostic: Path | None = None,
        foundations: Path | None = None,
        curriculum: Path | None = None,
    ) -> None:
        self.catalog = _load_catalog(str(path or content_path()))
        self.diagnostic = _load_diagnostic(str(diagnostic or diagnostic_path()))
        self.foundations = _load_foundations(str(foundations or foundations_path()))
        self.concepts = sorted(self.catalog.concepts, key=lambda concept: concept.order)
        self.questions = sorted(self.catalog.questions, key=lambda question: question.id)
        self.diagnostic_questions = sorted(
            self.diagnostic.questions, key=lambda question: question.id
        )
        self.foundation_categories = sorted(
            self.foundations.categories, key=lambda category: category.order
        )
        self.foundation_terms = sorted(self.foundations.terms, key=lambda term: term.id)
        self._by_slug = {concept.slug: concept for concept in self.concepts}
        self._by_id = {concept.id: concept for concept in self.concepts}
        self._questions_by_id = {question.id: question for question in self.questions}
        self._diagnostic_by_id = {
            question.id: question for question in self.diagnostic_questions
        }
        self._foundations_by_slug = {
            term.slug: term for term in self.foundation_terms
        }
        self.curriculum = _load_curriculum(str(curriculum or curriculum_path()))
        self._validate_curriculum()

    def _validate_curriculum(self) -> None:
        """Every guided chapter appears exactly once, in path order; every term exists."""
        guided: list[str] = []
        for stage in self.curriculum.stages:
            for slug in stage.concepts:
                if slug not in self._by_slug:
                    raise ValueError(f"学习路径 {stage.id} 引用了不存在的章节：{slug}")
                guided.append(slug)
            missing = [slug for slug in stage.foundations if slug not in self._foundations_by_slug]
            if missing:
                raise ValueError(f"学习路径 {stage.id} 引用了不存在的词条：{missing}")
        if guided != [concept.slug for concept in self.concepts]:
            raise ValueError("学习路径必须按章节顺序包含全部引导章节，且每章只出现一次")

    def concept_by_slug(self, slug: str) -> Concept | None:
        return self._by_slug.get(slug)

    def concept_by_id(self, concept_id: int) -> Concept | None:
        return self._by_id.get(concept_id)

    def question_by_id(self, question_id: int) -> Question | None:
        return self._questions_by_id.get(question_id)

    def questions_for_concept(self, concept_id: int) -> list[Question]:
        return [question for question in self.questions if question.concept_id == concept_id]

    def diagnostic_question_by_id(self, question_id: int) -> DiagnosticQuestion | None:
        return self._diagnostic_by_id.get(question_id)

    def foundation_by_slug(self, slug: str) -> FoundationTerm | None:
        return self._foundations_by_slug.get(slug)
