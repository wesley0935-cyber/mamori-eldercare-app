import AsyncStorage from '@react-native-async-storage/async-storage';

export type MedPeriod = 'morning' | 'noon' | 'evening' | 'bedtime';

export interface Medication {
  id: string;
  name: string;
  time: string;   // "HH:MM"
  period: MedPeriod;
  note: string;
}

export interface DailyTakenState {
  [medId: string]: string | null; // HH:MM when taken, null if not
}

export interface DailyReminderState {
  [medId: string]: {
    sentAt: string | null;
    missedSentAt: string | null;
  };
}

export const PERIOD_LABELS: Record<MedPeriod, string> = {
  morning: '早',
  noon: '午',
  evening: '晚',
  bedtime: '睡前',
};

// ─── Bedtime detection ────────────────────────────────────────────────────────

/**
 * A medication is "bedtime" if its period is 'bedtime' OR its scheduled hour
 * is 21:00–23:59.  These meds get a grace window until 01:00 next morning.
 */
export function isBedtimeMed(med: Medication): boolean {
  if (med.period === 'bedtime') return true;
  const h = parseInt(med.time.split(':')[0], 10);
  return h >= 21;
}

// ─── Date string helpers ──────────────────────────────────────────────────────

function makeDateStr(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function todayDateStr(): string {
  return makeDateStr(new Date());
}

export function yesterdayDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return makeDateStr(d);
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const MEDS_KEY = 'medications_list';
const TAKEN_PREFIX = 'medication_taken_';
const REMINDER_PREFIX = 'medication_reminder_';

function todayKey(prefix: string): string {
  return prefix + todayDateStr();
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Medication list ──────────────────────────────────────────────────────────

const DEFAULT_MEDS: Medication[] = [
  {id: 'default_1', name: '血壓藥', time: '08:00', period: 'morning', note: '早餐後'},
  {id: 'default_2', name: '維他命 D', time: '12:00', period: 'noon', note: ''},
  {id: 'default_3', name: '降血糖藥', time: '18:00', period: 'evening', note: '晚餐後'},
];

export async function getMedications(): Promise<Medication[]> {
  try {
    const raw = await AsyncStorage.getItem(MEDS_KEY);
    if (raw) return JSON.parse(raw) as Medication[];
  } catch {}
  return DEFAULT_MEDS;
}

export async function saveMedications(meds: Medication[]): Promise<void> {
  await AsyncStorage.setItem(MEDS_KEY, JSON.stringify(meds));
}

export async function addMedication(med: Omit<Medication, 'id'>): Promise<Medication[]> {
  const meds = await getMedications();
  const newMed: Medication = {...med, id: `med_${Date.now()}`};
  const updated = [...meds, newMed];
  await saveMedications(updated);
  return updated;
}

export async function updateMedication(updated: Medication): Promise<Medication[]> {
  const meds = await getMedications();
  const newList = meds.map(m => (m.id === updated.id ? updated : m));
  await saveMedications(newList);
  return newList;
}

export async function deleteMedication(id: string): Promise<Medication[]> {
  const meds = await getMedications();
  const newList = meds.filter(m => m.id !== id);
  await saveMedications(newList);
  return newList;
}

// ─── Daily taken state ────────────────────────────────────────────────────────

export async function getDailyTakenStateForDate(ds: string): Promise<DailyTakenState> {
  try {
    const raw = await AsyncStorage.getItem(TAKEN_PREFIX + ds);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export async function getDailyTakenState(): Promise<DailyTakenState> {
  return getDailyTakenStateForDate(todayDateStr());
}

async function saveTakenStateForDate(ds: string, state: DailyTakenState): Promise<void> {
  await AsyncStorage.setItem(TAKEN_PREFIX + ds, JSON.stringify(state));
}

async function saveTakenState(state: DailyTakenState): Promise<void> {
  return saveTakenStateForDate(todayDateStr(), state);
}

export async function markTakenOnDate(medId: string, ds: string): Promise<DailyTakenState> {
  const state = await getDailyTakenStateForDate(ds);
  state[medId] = hhmm(new Date());
  await saveTakenStateForDate(ds, state);
  return state;
}

export async function unmarkTakenOnDate(medId: string, ds: string): Promise<DailyTakenState> {
  const state = await getDailyTakenStateForDate(ds);
  state[medId] = null;
  await saveTakenStateForDate(ds, state);
  return state;
}

export async function markTaken(medId: string): Promise<DailyTakenState> {
  return markTakenOnDate(medId, todayDateStr());
}

export async function unmarkTaken(medId: string): Promise<DailyTakenState> {
  return unmarkTakenOnDate(medId, todayDateStr());
}

/**
 * Returns the "effective" taken state for UI display.
 *
 * Between 00:00–00:59 (the bedtime grace window), bedtime meds are attributed
 * to the previous calendar day — so we read yesterday's records for those meds
 * and merge them into today's state.  After 01:00 the full today state is used.
 */
export async function getEffectiveTakenState(meds: Medication[]): Promise<DailyTakenState> {
  const todayState = await getDailyTakenState();
  if (new Date().getHours() >= 1) return todayState; // no cross-midnight merge

  const ydState = await getDailyTakenStateForDate(yesterdayDateStr());
  const merged: DailyTakenState = {...todayState};
  for (const med of meds) {
    if (isBedtimeMed(med)) {
      merged[med.id] = ydState[med.id] ?? null;
    }
  }
  return merged;
}

// ─── Daily reminder state ─────────────────────────────────────────────────────

export async function getDailyReminderStateForDate(ds: string): Promise<DailyReminderState> {
  try {
    const raw = await AsyncStorage.getItem(REMINDER_PREFIX + ds);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export async function getDailyReminderState(): Promise<DailyReminderState> {
  return getDailyReminderStateForDate(todayDateStr());
}

async function saveReminderStateForDate(ds: string, state: DailyReminderState): Promise<void> {
  await AsyncStorage.setItem(REMINDER_PREFIX + ds, JSON.stringify(state));
}

async function saveReminderState(state: DailyReminderState): Promise<void> {
  return saveReminderStateForDate(todayDateStr(), state);
}

export async function markReminderSent(medId: string): Promise<void> {
  const state = await getDailyReminderState();
  state[medId] = {sentAt: hhmm(new Date()), missedSentAt: state[medId]?.missedSentAt ?? null};
  await saveReminderState(state);
}

export async function markMissedSent(medId: string): Promise<void> {
  const state = await getDailyReminderState();
  state[medId] = {sentAt: state[medId]?.sentAt ?? null, missedSentAt: hhmm(new Date())};
  await saveReminderState(state);
}

export async function markMissedSentOnDate(medId: string, ds: string): Promise<void> {
  const state = await getDailyReminderStateForDate(ds);
  state[medId] = {sentAt: state[medId]?.sentAt ?? null, missedSentAt: hhmm(new Date())};
  await saveReminderStateForDate(ds, state);
}

// ─── Sleep-window bundle tracking ─────────────────────────────────────────────
// 睡眠時段的服藥未打勾延遲到 07:00 通知
// 避免半夜打擾家屬

const SLEEP_BUNDLE_PREFIX = 'medication_sleep_bundle_';

/** Returns true if the 07:00 bundle has already been dispatched for the given date. */
export async function hasSleepBundleBeenSent(ds: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SLEEP_BUNDLE_PREFIX + ds)) === 'sent';
  } catch {
    return false;
  }
}

/** Marks the 07:00 bundle as sent for the given date (idempotent). */
export async function markSleepBundleSent(ds: string): Promise<void> {
  await AsyncStorage.setItem(SLEEP_BUNDLE_PREFIX + ds, 'sent');
}

// ─── Family cancel log (today's warning records) ──────────────────────────────

export interface FamilyCancelRecord {
  text: string;  // e.g. "家屬取消了王爺爺 08:00 血壓藥的服藥記錄"
  at: string;    // HH:MM when cancelled
}

const CANCEL_LOG_PREFIX = 'medication_cancel_log_';

export async function getFamilyCancelRecords(): Promise<FamilyCancelRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(todayKey(CANCEL_LOG_PREFIX));
    if (raw) return JSON.parse(raw) as FamilyCancelRecord[];
  } catch {}
  return [];
}

export async function addFamilyCancelRecord(
  record: FamilyCancelRecord,
): Promise<void> {
  const list = await getFamilyCancelRecords();
  await AsyncStorage.setItem(
    todayKey(CANCEL_LOG_PREFIX),
    JSON.stringify([...list, record]),
  );
}
