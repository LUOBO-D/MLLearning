export type ConceptStatus = 'not_started' | 'in_progress' | 'completed';

export interface ConceptSummary {
  id: number;
  slug: string;
  title: string;
  english_title: string;
  kicker: string;
  summary: string;
  duration: number;
  level: string;
  order: number;
  total_sections: number;
  completed_sections: number;
  status: ConceptStatus;
  accent: string;
}

export interface LessonBlock {
  heading: string;
  paragraphs: string[];
  formula: string | null;
  formula_note: string | null;
}

export interface WorkedExampleStep {
  title: string;
  detail: string;
  formula: string | null;
}

export interface LessonContent {
  hook: string;
  blocks: LessonBlock[];
  worked_example: {
    title: string;
    setup: string;
    steps: WorkedExampleStep[];
    conclusion: string;
  };
  code_walkthrough: {
    title: string;
    code: string;
    annotations: string[];
  };
  misconceptions: { mistake: string; correction: string }[];
  recap: string[];
  self_check: { question: string; answer: string };
}

export interface ConceptSection {
  id: string;
  title: string;
  summary: string;
  paragraphs: string[];
  formula: string | null;
  key_point: string;
  lesson: LessonContent;
}

export interface SymbolEntry {
  symbol: string;
  meaning: string;
}

export interface VocabularyEntry {
  term: string;
  english: string;
  definition: string;
}

export interface ConceptAlgorithm {
  name: string;
  steps: string[];
  code: string;
  code_caption: string;
}

export interface ConceptDetail extends ConceptSummary {
  description: string;
  objectives: string[];
  sections: ConceptSection[];
  symbols: SymbolEntry[];
  vocabulary: VocabularyEntry[];
  algorithm: ConceptAlgorithm;
  sources: { label: string; url: string }[];
  experiment_type: 'regression' | 'descent' | 'complexity' | 'regularization' | 'classification' | 'evaluation' | 'tree' | 'network' | 'leakage';
  completed_section_ids: string[];
}

export type FoundationCategoryId =
  | 'data'
  | 'math'
  | 'learning'
  | 'generalization'
  | 'algorithms'
  | 'deep-learning'
  | 'practice';

export interface FoundationCategory {
  id: FoundationCategoryId;
  label: string;
  description: string;
  order: number;
  readings: { label: string; url: string }[];
}

export interface FoundationTerm {
  id: number;
  slug: string;
  term: string;
  english: string;
  category: FoundationCategoryId;
  level: '入门' | '基础' | '进阶';
  summary: string;
  definition: string;
  formula: string | null;
  formula_note: string | null;
  intuition: string;
  steps: string[];
  code: string;
  code_caption: string;
  pitfall: string;
  related: string[];
}

export interface FoundationsPayload {
  version: string;
  title: string;
  description: string;
  categories: FoundationCategory[];
  terms: FoundationTerm[];
  references: { label: string; url: string }[];
}

export interface ProgressEventResult {
  ok: boolean;
  completed_sections: number;
  status: string;
  recorded: boolean;
}

export interface LearningEvent {
  id: number;
  event_type: string;
  concept_id: number | null;
  concept_title: string | null;
  title: string;
  minutes: number;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface DayActivity {
  date: string;
  weekday: string;
  minutes: number;
}

export interface Stats {
  total_minutes: number;
  total_attempts: number;
  correct_attempts: number;
  completed_sections: number;
  study_days: number;
}

export type DailyStepKind = 'think' | 'read' | 'do' | 'experiment' | 'practice' | 'reflect';

export interface DailyStep {
  id: string;
  kind: DailyStepKind;
  title: string;
  instruction: string;
  minutes: number;
  href: string | null;
  completed: boolean;
}

export interface DailyPlan {
  mode: 'learn' | 'review';
  concept_slug: string;
  concept_title: string;
  section_id: string;
  section_title: string;
  focus: string;
  success: string;
  total_minutes: number;
  steps: DailyStep[];
}

export interface Bootstrap {
  profile: { name: string; timezone: string; daily_goal_minutes: number };
  today: {
    date: string;
    minutes: number;
    goal_minutes: number;
    completed_sections: number;
    reviews_due: number;
  };
  next_action: { concept_slug: string; title: string; reason: string };
  concepts: ConceptSummary[];
  weekly: DayActivity[];
  recent_activity: LearningEvent[];
  stats: Stats;
  diagnostic: DiagnosticSummary;
  daily_plan: DailyPlan;
}

export interface Question {
  id: number;
  concept_id: number;
  prompt: string;
  options: { id: string; text: string }[];
  difficulty: string;
}

export interface AttemptResult {
  id: number;
  is_correct: boolean;
  correct_answer_id: string;
  explanation: string;
  misconception: string;
  concept_slug: string;
}

export interface CalibrationBucket {
  confidence: number;
  attempts: number;
  correct: number;
}

export interface ProgressData {
  stats: Stats;
  calibration: CalibrationBucket[];
  concepts: ConceptSummary[];
  weekly: DayActivity[];
  recent_mistakes: {
    question_id: number;
    concept_title: string;
    prompt: string;
    misconception: string;
    created_at: string;
  }[];
  recent_activity: LearningEvent[];
}

export interface Reflection {
  learned: string;
  confused: string;
  next_step: string;
  saved_at?: string | null;
}

export interface JournalData {
  date: string;
  minutes: number;
  events: LearningEvent[];
  reflection: Reflection;
}

export interface DiagnosticDomain {
  id: string;
  label: string;
  description: string;
}

export interface DiagnosticQuestion {
  id: number;
  domain: string;
  domain_label: string;
  dimension: string;
  difficulty: string;
  prompt: string;
  options: { id: string; text: string }[];
  hint: string;
}

export interface DiagnosticDomainResult {
  id: string;
  label: string;
  correct: number;
  total: number;
}

export interface DiagnosticRecommendation {
  concept_slug: string;
  concept_title: string;
  reason: string;
}

export interface DiagnosticItem {
  question_id: number;
  domain: string;
  domain_label: string;
  prompt: string;
  answer_id: string;
  correct_answer_id: string;
  is_correct: boolean;
  confidence: number;
  hints_used: number;
  explanation: string;
  misconception: string;
}

export interface DiagnosticResult {
  client_session_id: string;
  content_version: string;
  completed_at: string;
  correct_count: number;
  total: number;
  duration_seconds: number;
  overview: string;
  domains: DiagnosticDomainResult[];
  recommendation: DiagnosticRecommendation;
  evidence_note: string;
  items: DiagnosticItem[];
}

export interface DiagnosticSummary {
  completed: boolean;
  completed_at: string | null;
  correct_count: number;
  total: number;
  recommendation: DiagnosticRecommendation | null;
}

export interface DiagnosticPayload {
  version: string;
  estimated_minutes: number;
  domains: DiagnosticDomain[];
  questions: DiagnosticQuestion[];
  latest: DiagnosticResult | null;
}

export interface DiagnosticAnswer {
  question_id: number;
  answer_id: string;
  confidence: number;
  hints_used: number;
  time_spent_seconds: number;
}


export interface StageTerm {
  slug: string;
  term: string;
  english: string;
  level: string;
  summary: string;
}

export interface CurriculumStage {
  id: string;
  order: number;
  title: string;
  tagline: string;
  goal: string;
  hours: number;
  level: string;
  outcomes: string[];
  status: 'complete' | 'current' | 'upcoming';
  concepts: ConceptSummary[];
  foundations: StageTerm[];
  milestone: { title: string; detail: string; href: string; action: string };
}

export interface Curriculum {
  version: string;
  title: string;
  description: string;
  total_hours: number;
  current_stage_id: string;
  stages: CurriculumStage[];
}
