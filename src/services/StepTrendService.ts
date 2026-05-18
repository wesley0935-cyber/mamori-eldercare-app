export interface DayStep {
  date: Date;
  steps: number;
}

export interface HourStep {
  hour: number;
  steps: number;
}

// DJB2 hash — deterministic per input string
function djb2(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function rand01(seed: number): number {
  return ((seed * 1664525 + 1013904223) >>> 0) / 4294967295;
}

function dayKey(pairCode: string, d: Date): string {
  return `${pairCode}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// TODO: replace with real Health Connect read when on-device
function mockDaySteps(pairCode: string, d: Date): number {
  return Math.round(2000 + rand01(djb2(dayKey(pairCode, d))) * 6000);
}

// TODO: replace with real Health Connect hourly buckets
function mockHourSteps(pairCode: string, d: Date, hour: number): number {
  const r = rand01(djb2(`${dayKey(pairCode, d)}|${hour}`));
  return hour <= 5 || hour >= 22
    ? Math.round(r * 80)
    : Math.round(50 + r * 550);
}

export function getMockWeekSteps(pairCode: string): DayStep[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({length: 7}, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return {date: d, steps: mockDaySteps(pairCode, d)};
  });
}

export function getMockDaySteps(pairCode: string): HourStep[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const curH = now.getHours();
  return Array.from({length: 24}, (_, h) => ({
    hour: h,
    steps: h <= curH ? mockHourSteps(pairCode, today, h) : 0,
  }));
}

export function getMockMonthSteps(pairCode: string): DayStep[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = today.getFullYear();
  const month = today.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  return Array.from({length: days}, (_, i) => {
    const d = new Date(year, month, i + 1);
    return {date: d, steps: d <= today ? mockDaySteps(pairCode, d) : 0};
  });
}
