import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getMedications as apiGetMedications,
  addMedication as apiAddMedication,
  updateMedication as apiUpdateMedication,
  deleteMedication as apiDeleteMedication,
} from '../api/medicationApi';

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

async function getBackendElderId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem('backendElderId');
  } catch {
    return null;
  }
}

export async function getMedications(elderId: string = 'default'): Promise<Medication[]> {
  try {
    const backendElderId = await getBackendElderId();
    if (backendElderId) {
      const records = await apiGetMedications(backendElderId);
      if (records.length > 0) {
        return records.map(r => ({
          id: r.id,
          name: r.name,
          time: r.time,
          period: r.period as MedPeriod,
          note: r.note ?? '',
        }));
      }
    }
  } catch (e) {
    console.warn('[MedicationStorageService] getMedications fallback to local:', e);
  }
  // fallback：後端失敗時讀本地
  try {
    const raw = await AsyncStorage.getItem(medsKey(elderId));
    if (raw) return JSON.parse(raw) as Medication[];
  } catch {}
  // 無任何資料時回傳空陣列，不再提供假的預設藥物
  return [];
}

export async function saveMedications(meds: Medication[], elderId: string = 'default'): Promise<void> {
  await AsyncStorage.setItem(medsKey(elderId), JSON.stringify(meds));
}

export async function addMedication(med: Omit<Medication, 'id'>, elderId: string = 'default'): Promise<Medication[]> {
  try {
    const backendElderId = await getBackendElderId();
    if (backendElderId) {
      await apiAddMedication(backendElderId, {
        name: med.name,
        dosage: '',
        time: med.time,
        period: med.period,
        note: med.note,
      });
      return getMedications(elderId);
    }
  } catch (e) {
    console.warn('[MedicationStorageService] addMedication fallback to local:', e);
  }
  // fallback
  const meds = await getMedications(elderId);
  const newMed: Medication = {...med, id: `med_${Date.now()}`};
  const updated = [...meds, newMed];
  await saveMedications(updated, elderId);
  return updated;
}

export async function updateMedication(updated: Medication, elderId: string = 'default'): Promise<Medication[]> {
  try {
    const backendElderId = await getBackendElderId();
    if (backendElderId) {
      await apiUpdateMedication(backendElderId, updated.id, {
        name: updated.name,
        dosage: '',
        time: updated.time,
        period: updated.period,
        note: updated.note,
      });
      return getMedications(elderId);
    }
  } catch (e) {
    console.warn('[MedicationStorageService] updateMedication fallback to local:', e);
  }
  // fallback
  const meds = await getMedications(elderId);
  const newList = meds.map(m => (m.id === updated.id ? updated : m));
  await saveMedications(newList, elderId);
  return newList;
}

export async function deleteMedication(id: string, elderId: string = 'default'): Promise<Medication[]> {
  try {
    const backendElderId = await getBackendElderId();
    if (backendElderId) {
      await apiDeleteMedication(backendElderId, id);
      return getMedications(elderId);
    }
  } catch (e) {
    console.warn('[MedicationStorageService] deleteMedication fallback to local:', e);
  }
  // fallback
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