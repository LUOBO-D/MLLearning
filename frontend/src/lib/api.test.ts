import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

const progressResponse = {
  ok: true,
  completed_sections: 0,
  status: 'in_progress',
};

describe('api.recordProgress', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the persisted result when the server writes a new event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(progressResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Progress-Recorded': 'true' },
    })));
    await expect(api.recordProgress({
      concept_id: 1,
      event_type: 'experiment_completed',
      minutes: 3,
      metadata: { w: 0.4 },
    })).resolves.toEqual({ ...progressResponse, recorded: true });
  });

  it('does not claim a same-day duplicate was saved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(progressResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Progress-Recorded': 'false' },
    })));
    await expect(api.recordProgress({
      concept_id: 1,
      event_type: 'experiment_completed',
      minutes: 3,
      metadata: { w: 1.2 },
    })).resolves.toEqual({ ...progressResponse, recorded: false });
  });
});
