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

// ─── Storage keys (per-elder) ─────────────────────────────────────────────────

// elderId 預設為 'default'，向下相容舊資料
function medsKey(elderId: string = 'default'): string {
  return `medications_list_${elderId}`;
}

function takenKey(elderId: string = 'default', ds: string): string {
  return `medication_taken_${elderId}_${ds}`;
}

function reminderKey(elderId: string = 'default', ds: string): string {
  return `medication_reminder_${elderId}_${ds}`;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Medication list ──────────────────────────────────────────────────────────

const DEFAULT_MEDS: Medication[] = [
  {id: 'default_1', name: '血壓藥',   time: '08:00', period: 'morning', note: '早餐後'},
  {id: 'default_2', name: '維他命 D', time: '12:00', period: 'noon',    note: ''},
  {id: 'default_3', name: '降血糖藥', time: '18:00', period: 'evening', note: '晚餐後'},
];

export async function getMedications(elderId: string = 'default'): Promise<Medication[]> {
  try {
    const raw = await AsyncStorage.getItem(medsKey(elderId));
    if (raw) return JSON.parse(raw) as Medication[];
  } catch {}
  return DEFAULT_MEDS;
}

export async function saveMedications(meds: Medication[], elderId: string = 'default'): Promise<void> {
  await AsyncStorage.setItem(medsKey(elderId), JSON.stringify(meds));
}

export async function addMedication(med: Omit<Medication, 'id'>, elderId: string = 'default'): Promise<Medication[]> {
  const meds = await getMedications(elderId);
  const newMed: Medication = {...med, id: `med_${Date.now()}`};
  const updated = [...meds, newMed];
  await saveMedications(updated, elderId);
  return updated;
}

export async function updateMedication(updated: Medication, elderId: string = 'default'): Promise<Medication[]> {
  const meds = await getMedications(elderId);
  const newList = meds.map(m => (m.id === updated.id ? updated : m));
  await saveMedications(newList, elderId);
  return newList;
}

export async function deleteMedication(id: string, elderId: string = 'default'): Promise<Medication[]> {
  const meds = await getMedications(elderId);
  const newList = meds.filter(m => m.id !== id);
  await saveMedications(newList, elderId);
  return newList;
}

// ─── Daily taken state ────────────────────────────────────────────────────────

export async function getDailyTakenStateForDate(ds: string, elderId: string = 'default'): Promise<DailyTakenState> {
  try {
    const raw = await AsyncStorage.getItem(takenKey(elderId, ds));
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export async function getDailyTakenState(elderId: string = 'default'): Promise<DailyTakenState> {
  return getDailyTakenStateForDate(todayDateStr(), elderId);
}

async function saveTakenStateForDate(ds: string, state: DailyTakenState, elderId: string = 'default'): Promise<void> {
  await AsyncStorage.setItem(takenKey(elderId, ds), JSON.stringify(state));
}

export async function markTakenOnDate(medId: string, ds: string, elderId: string = 'default'): Promise<DailyTakenState> {
  const state = await getDailyTakenStateForDate(ds, elderId);
  state[medId] = hhmm(new Date());
  await saveTakenStateForDate(ds, state, elderId);
  return state;
}

export async function unmarkTakenOnDate(medId: string, ds: string, elderId: string = 'default'): Promise<DailyTakenState> {
  const state = await getDailyTakenStateForDate(ds, elderId);
  state[medId] = null;
  await saveTakenStateForDate(ds, state, elderId);
  return state;
}

export async function markTaken(medId: string, elderId: string = 'default'): Promise<DailyTakenState> {
  return markTakenOnDate(medId, todayDateStr(), elderId);
}

export async function unmarkTaken(medId: string, elderId: string = 'default'): Promise<DailyTakenState> {
  return unmarkTakenOnDate(medId, todayDateStr(), elderId);
}

export async function getEffectiveTakenState(meds: Medication[], elderId: string = 'default'): Promise<DailyTakenState> {
  const todayState = await getDailyTakenState(elderId);
  if (new Date().getHours() >= 1) return todayState;

  const ydState = await getDailyTakenStateForDate(yesterdayDateStr(), elderId);
  const merged: DailyTakenState = {...todayState};
  for (const med of meds) {
    if (isBedtimeMed(med)) {
      merged[med.id] = ydState[med.id] ?? null;
    }
  }
  return merged;
}

// ─── Daily reminder state ─────────────────────────────────────────────────────

export async function getDailyReminderStateForDate(ds: string, elderId: string = 'default'): Promise<DailyReminderState> {
  try {
    const raw = await AsyncStorage.getItem(reminderKey(elderId, ds));
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export async function getDailyReminderState(elderId: string = 'default'): Promise<DailyReminderState> {
  return getDailyReminderStateForDate(todayDateStr(), elderId);
}

async function saveReminderStateForDate(ds: string, state: DailyReminderState, elderId: string = 'default'): Promise<void> {
  await AsyncStorage.setItem(reminderKey(elderId, ds), JSON.stringify(state));
}

export async function markReminderSent(medId: string, elderId: string = 'default'): Promise<void> {
  const state = await getDailyReminderState(elderId);
  state[medId] = {sentAt: hhmm(new Date()), missedSentAt: state[medId]?.missedSentAt ?? null};
  await saveReminderStateForDate(todayDateStr(), state, elderId);
}

export async function markMissedSent(medId: string, elderId: string = 'default'): Promise<void> {
  const state = await getDailyReminderState(elderId);
  state[medId] = {sentAt: state[medId]?.sentAt ?? null, missedSentAt: hhmm(new Date())};
  await saveReminderStateForDate(todayDateStr(), state, elderId);
}

export async function markMissedSentOnDate(medId: string, ds: string, elderId: string = 'default'): Promise<void> {
  const state = await getDailyReminderStateForDate(ds, elderId);
  state[medId] = {sentAt: state[medId]?.sentAt ?? null, missedSentAt: hhmm(new Date())};
  await saveReminderStateForDate(ds, state, elderId);
}

// ─── Sleep-window bundle tracking ─────────────────────────────────────────────

const SLEEP_BUNDLE_PREFIX = 'medication_sleep_bundle_';

export async function hasSleepBundleBeenSent(ds: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SLEEP_BUNDLE_PREFIX + ds)) === 'sent';
  } catch {
    return false;
  }
}

export async function markSleepBundleSent(ds: string): Promise<void> {
  await AsyncStorage.setItem(SLEEP_BUNDLE_PREFIX + ds, 'sent');
}

// ─── Family cancel log ────────────────────────────────────────────────────────

export interface FamilyCancelRecord {
  text: string;
  at: string;
}

const CANCEL_LOG_PREFIX = 'medication_cancel_log_';

function cancelLogKey(elderId: string = 'default'): string {
  return `${CANCEL_LOG_PREFIX}${elderId}_${todayDateStr()}`;
}

export async function getFamilyCancelRecords(elderId: string = 'default'): Promise<FamilyCancelRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(cancelLogKey(elderId));
    if (raw) return JSON.parse(raw) as FamilyCancelRecord[];
  } catch {}
  return [];
}

export async function addFamilyCancelRecord(
  record: FamilyCancelRecord,
  elderId: string = 'default',
): Promise<void> {
  const list = await getFamilyCancelRecords(elderId);
  await AsyncStorage.setItem(cancelLogKey(elderId), JSON.stringify([...list, record]));
}
