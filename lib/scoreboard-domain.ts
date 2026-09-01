export const EMPTY_REVIEW = {
  strongestAction: '',
  biggestGap: '',
  topProspects: '',
  nextImprovement: '',
  nextCaseTarget: '',
  nextTpcTarget: '',
};

export function normalizeDate(value: string | null | undefined): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getWeekStart(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(date, offset);
}

export function getWeekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function getExecutionLevel(execution: number): 'strong' | 'improve' | 'action' {
  if (execution >= 0.8) return 'strong';
  if (execution >= 0.6) return 'improve';
  return 'action';
}
