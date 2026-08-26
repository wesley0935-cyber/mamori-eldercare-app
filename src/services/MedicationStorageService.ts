import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getMedications as apiGetMedications,
  addMedication as apiAddMedication,
  updateMedication as apiUpdateMedication,
  deleteMedication as apiDeleteMedication,
} from '../api/medicationApi';

/**
 * 本模組區分兩種識別碼，呼叫端必須明確傳入，不再從全域鍵推測：
 *
 * - `localKey`        本機 AsyncStorage 分區用。長輩端 = 自己的 pairCode；
 *                     家屬端 = `PairedElder.pairCode`。
 * - `backendElderId`  後端 API 用的 Elder UUID。長輩端 = `getElderSelfBackendId()`；
 *                     家屬端 = `PairedElder.elderId`。傳 null 代表沒有後端身分，只走本機。
 *
 * 這兩者以前混用同一個 `elderId` 參數、且後端呼叫一律讀全域 `backendElderId`，
 * 導致多長輩情境下藥物會寫到錯的長輩身上。
 */

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

function medsKey(localKey: string = 'default'): string {
  return `medications_list_${localKey}`;
}

function takenKey(localKey: string = 'default', ds: string): string {
  return `medication_taken_${localKey}_${ds}`;
}

function reminderKey(localKey: string = 'default', ds: string): string {
  return `medication_reminder_${localKey}_${ds}`;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Medication list ──────────────────────────────────────────────────────────

export async function getMedications(
  localKey: string,
  backendElderId: string | null,
): Promise<Medication[]> {
  try {
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
    const raw = await AsyncStorage.getItem(medsKey(localKey));
    if (raw) return JSON.parse(raw) as Medication[];
  } catch {}
  // 無任何資料時回傳空陣列，不再提供假的預設藥物
  return [];
}

export async function saveMedications(meds: Medication[], localKey: string = 'default'): Promise<void> {
  await AsyncStorage.setItem(medsKey(localKey), JSON.stringify(meds));
}

export async function addMedication(
  med: Omit<Medication, 'id'>,
  localKey: string,
  backendElderId: string | null,
): Promise<Medication[]> {
  try {
    if (backendElderId) {
      await apiAddMedication(backendElderId, {
        name: med.name,
        dosage: '',
        time: med.time,
        period: med.period,
        note: med.note,
      });
      return getMedications(localKey, backendElderId);
    }
  } catch (e) {
    console.warn('[MedicationStorageService] addMedication fallback to local:', e);
  }
  // fallback
  const meds = await getMedications(localKey, null);
  const newMed: Medication = {...med, id: `med_${Date.now()}`};
  const updated = [...meds, newMed];
  await saveMedications(updated, localKey);
  return updated;
}

export async function updateMedication(
  updated: Medication,
  localKey: string,
  backendElderId: string | null,
): Promise<Medication[]> {
  try {
    if (backendElderId) {
      await apiUpdateMedication(backendElderId, updated.id, {
        name: updated.name,
        dosage: '',
        time: updated.time,
        period: updated.period,
        note: updated.note,
      });
      return getMedications(localKey, backendElderId);
    }
  } catch (e) {
    console.warn('[MedicationStorageService] updateMedication fallback to local:', e);
  }
  // fallback
  const meds = await getMedications(localKey, null);
  const newList = meds.map(m => (m.id === updated.id ? updated : m));
  await saveMedications(newList, localKey);
  return newList;
}

export async function deleteMedication(
  id: string,
  localKey: string,
  backendElderId: string | null,
): Promise<Medication[]> {
  try {
    if (backendElderId) {
      await apiDeleteMedication(backendElderId, id);
      return getMedications(localKey, backendElderId);
    }
  } catch (e) {
    console.warn('[MedicationStorageService] deleteMedication fallback to local:', e);
  }
  // fallback
  const meds = await getMedications(localKey, null);
  const newList = meds.filter(m => m.id !== id);
  await saveMedications(newList, localKey);
  return newList;
}

// ─── Daily taken state ────────────────────────────────────────────────────────
// 以下皆為純本機狀態，只需要 localKey，不涉及後端。

export async function getDailyTakenStateForDate(ds: string, localKey: string = 'default'): Promise<DailyTakenState> {
  try {
    const raw = await AsyncStorage.getItem(takenKey(localKey, ds));
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export async function getDailyTakenState(localKey: string = 'default'): Promise<DailyTakenState> {
  return getDailyTakenStateForDate(todayDateStr(), localKey);
}

async function saveTakenStateForDate(ds: string, state: DailyTakenState, localKey: string = 'default'): Promise<void> {
  await AsyncStorage.setItem(takenKey(localKey, ds), JSON.stringify(state));
}

export async function markTakenOnDate(medId: string, ds: string, localKey: string = 'default'): Promise<DailyTakenState> {
  const state = await getDailyTakenStateForDate(ds, localKey);
  state[medId] = hhmm(new Date());
  await saveTakenStateForDate(ds, state, localKey);
  return state;
}

export async function unmarkTakenOnDate(medId: string, ds: string, localKey: string = 'default'): Promise<DailyTakenState> {
  const state = await getDailyTakenStateForDate(ds, localKey);
  state[medId] = null;
  await saveTakenStateForDate(ds, state, localKey);
  return state;
}

export async function markTaken(medId: string, localKey: string = 'default'): Promise<DailyTakenState> {
  return markTakenOnDate(medId, todayDateStr(), localKey);
}

export async function unmarkTaken(medId: string, localKey: string = 'default'): Promise<DailyTakenState> {
  return unmarkTakenOnDate(medId, todayDateStr(), localKey);
}

export async function getEffectiveTakenState(meds: Medication[], localKey: string = 'default'): Promise<DailyTakenState> {
  const todayState = await getDailyTakenState(localKey);
  if (new Date().getHours() >= 1) return todayState;

  const ydState = await getDailyTakenStateForDate(yesterdayDateStr(), localKey);
  const merged: DailyTakenState = {...todayState};
  for (const med of meds) {
    if (isBedtimeMed(med)) {
      merged[med.id] = ydState[med.id] ?? null;
    }
  }
  return merged;
}

// ─── Daily reminder state ─────────────────────────────────────────────────────

export async function getDailyReminderStateForDate(ds: string, localKey: string = 'default'): Promise<DailyReminderState> {
  try {
    const raw = await AsyncStorage.getItem(reminderKey(localKey, ds));
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export async function getDailyReminderState(localKey: string = 'default'): Promise<DailyReminderState> {
  return getDailyReminderStateForDate(todayDateStr(), localKey);
}

async function saveReminderStateForDate(ds: string, state: DailyReminderState, localKey: string = 'default'): Promise<void> {
  await AsyncStorage.setItem(reminderKey(localKey, ds), JSON.stringify(state));
}

export async function markReminderSent(medId: string, localKey: string = 'default'): Promise<void> {
  const state = await getDailyReminderState(localKey);
  state[medId] = {sentAt: hhmm(new Date()), missedSentAt: state[medId]?.missedSentAt ?? null};
  await saveReminderStateForDate(todayDateStr(), state, localKey);
}

export async function markMissedSent(medId: string, localKey: string = 'default'): Promise<void> {
  const state = await getDailyReminderState(localKey);
  state[medId] = {sentAt: state[medId]?.sentAt ?? null, missedSentAt: hhmm(new Date())};
  await saveReminderStateForDate(todayDateStr(), state, localKey);
}

export async function markMissedSentOnDate(medId: string, ds: string, localKey: string = 'default'): Promise<void> {
  const state = await getDailyReminderStateForDate(ds, localKey);
  state[medId] = {sentAt: state[medId]?.sentAt ?? null, missedSentAt: hhmm(new Date())};
  await saveReminderStateForDate(ds, state, localKey);
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

function cancelLogKey(localKey: string = 'default'): string {
  return `${CANCEL_LOG_PREFIX}${localKey}_${todayDateStr()}`;
}

export async function getFamilyCancelRecords(localKey: string = 'default'): Promise<FamilyCancelRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(cancelLogKey(localKey));
    if (raw) return JSON.parse(raw) as FamilyCancelRecord[];
  } catch {}
  return [];
}

export async function addFamilyCancelRecord(
  record: FamilyCancelRecord,
  localKey: string = 'default',
): Promise<void> {
  const list = await getFamilyCancelRecords(localKey);
  await AsyncStorage.setItem(cancelLogKey(localKey), JSON.stringify([...list, record]));
}
