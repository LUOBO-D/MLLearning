import type {
  AttemptResult,
  Bootstrap,
  ConceptDetail,
  ConceptSummary,
  DiagnosticAnswer,
  DiagnosticPayload,
  DiagnosticResult,
  FoundationsPayload,
  JournalData,
  ProgressData,
  Question,
  Reflection,
  Curriculum,
} from '../types';

const API_ROOT = '/api/v1';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  return parseResponse<T>(response);
}

async function parseResponse<T>(response: Response): Promise<T> {

  if (!response.ok) {
    let message = '请求未能完成，请稍后重试。';
    try {
      const body = await response.json();
      message = body.detail?.[0]?.msg || body.detail || message;
    } catch {
      // Keep the human-readable fallback when the response is not JSON.
    }
    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export const api = {
  bootstrap: () => request<Bootstrap>('/bootstrap'),
  concepts: () => request<ConceptSummary[]>('/concepts'),
  curriculum: () => request<Curriculum>('/curriculum'),
  concept: (slug: string) => request<ConceptDetail>(`/concepts/${slug}`),
  foundations: () => request<FoundationsPayload>('/foundations'),
  questions: (conceptId: number) =>
    request<Question[]>(`/questions?concept_id=${conceptId}`),
  attempt: (input: {
    question_id: number;
    answer_id: string;
    confidence: number;
    time_spent_seconds: number;
  }) =>
    request<AttemptResult>('/attempts', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  recordProgress: async (input: {
    concept_id: number;
    event_type: 'section_completed' | 'experiment_completed' | 'lesson_started';
    section_id?: string | null;
    minutes: number;
    metadata?: Record<string, unknown>;
  }) => {
    const response = await fetch(`${API_ROOT}/progress/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const result = await parseResponse<{ ok: boolean; completed_sections: number; status: string }>(response);
    return { ...result, recorded: response.headers.get('X-Progress-Recorded') === 'true' };
  },
  progress: () => request<ProgressData>('/progress'),
  journal: (date: string) => request<JournalData>(`/journal/${date}`),
  saveJournal: (date: string, reflection: Reflection) =>
    request<Reflection>(`/journal/${date}`, {
      method: 'PUT',
      body: JSON.stringify(reflection),
    }),
  diagnostic: () => request<DiagnosticPayload>('/diagnostic'),
  submitDiagnostic: (input: {
    client_session_id: string;
    responses: DiagnosticAnswer[];
  }) =>
    request<DiagnosticResult>('/diagnostic', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  timeline: (days = 14) =>
    request<{ date: string; minutes: number; event_count: number }[]>(
      `/timeline?days=${days}`,
    ),
};
