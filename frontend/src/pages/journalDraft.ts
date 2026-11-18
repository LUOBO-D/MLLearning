export function confirmJournalDateChange(isDirty: boolean): boolean {
  return !isDirty || window.confirm('当前日志有未保存修改。离开这一天会丢弃这些修改，确定继续吗？');
}
