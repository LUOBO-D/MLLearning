import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmJournalDateChange } from './journalDraft';

describe('journal draft navigation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('allows clean navigation without prompting', () => {
    const confirm = vi.fn();
    vi.stubGlobal('window', { confirm });
    expect(confirmJournalDateChange(false)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('requires confirmation before discarding an unsaved draft', () => {
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal('window', { confirm });
    expect(confirmJournalDateChange(true)).toBe(false);
    expect(confirm).toHaveBeenCalledWith('当前日志有未保存修改。离开这一天会丢弃这些修改，确定继续吗？');
  });

  it('allows navigation after the user explicitly confirms', () => {
    vi.stubGlobal('window', { confirm: vi.fn().mockReturnValue(true) });
    expect(confirmJournalDateChange(true)).toBe(true);
  });
});
