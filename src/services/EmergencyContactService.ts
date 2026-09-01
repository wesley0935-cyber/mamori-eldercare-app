import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getEmergencyContactsApi,
  saveEmergencyContactsApi,
} from '../api/emergencyContactApi';

/**
 * 緊急聯絡人以「長輩」為單位儲存，呼叫端必須明確傳入 `backendElderId`，
 * 不再從全域鍵 `backendElderId` 推測（那在家屬裝置上只代表最後配對的那位長輩，
 * 多長輩情境會存到錯的人身上）。
 *
 * 取值來源：長輩端 = `getElderSelfBackendId()`；家屬端 = `PairedElder.elderId`。
 * 傳 null 代表沒有後端身分，只走本機快取。
 *
 * ⚠️ 與 MedicationStorageService 的差異：那邊是 `localKey` + `backendElderId` 兩個參數，
 * 因為藥物有獨立的本機資料模型（以 pairCode 分區，離線時可新增/編輯）。
 * 緊急聯絡人的本機儲存純粹是後端資料的離線快取、沒有獨立模型，
 * 因此直接以 `backendElderId` 當快取鍵即可，也保證快取與後端一致。
 */

export type ContactRelationship = '子女' | '配偶' | '兄弟姊妹' | '朋友' | '其他';

export const RELATIONSHIPS: ContactRelationship[] = [
  '子女',
  '配偶',
  '兄弟姊妹',
  '朋友',
  '其他',
];

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: ContactRelationship;
  isPrimary: boolean;
}

export const MAX_CONTACTS = 3;

/** 舊版單一鍵（不分長輩），僅供一次性遷移使用 */
const LEGACY_KEY = 'emergency_contacts';

function contactsKey(backendElderId: string | null): string {
  return `emergency_contacts_${backendElderId ?? 'default'}`;
}

/**
 * 把舊版單一鍵的快取搬到指定長輩的新鍵底下，然後刪除舊鍵。
 *
 * 只在「新鍵尚無資料」時搬，避免覆蓋掉已經正確分長輩的資料。
 * 舊鍵不含長輩資訊，多長輩時無法得知它原本屬於誰，可能歸給非原主；
 * 但快取只在後端連不上時才會被讀取，後端一旦正常就會被正確資料覆蓋。
 */
async function migrateLegacyCache(backendElderId: string | null): Promise<void> {
  try {
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (!legacy) { return; }
    const target = contactsKey(backendElderId);
    const existing = await AsyncStorage.getItem(target);
    if (!existing) { await AsyncStorage.setItem(target, legacy); }
    await AsyncStorage.removeItem(LEGACY_KEY);
  } catch (e) {
    console.warn('[EmergencyContactService] 舊快取遷移失敗（不影響功能）:', e);
  }
}

export async function getEmergencyContacts(
  backendElderId: string | null,
): Promise<EmergencyContact[]> {
  await migrateLegacyCache(backendElderId);
  try {
    if (backendElderId) {
      const contacts = await getEmergencyContactsApi(backendElderId);
      // 同步到本地，供離線備用
      await AsyncStorage.setItem(contactsKey(backendElderId), JSON.stringify(contacts));
      return contacts;
    }
  } catch {}
  // fallback：後端失敗時讀本地快取
  try {
    const raw = await AsyncStorage.getItem(contactsKey(backendElderId));
    return raw ? (JSON.parse(raw) as EmergencyContact[]) : [];
  } catch {
    return [];
  }
}

export async function saveEmergencyContacts(
  contacts: EmergencyContact[],
  backendElderId: string | null,
): Promise<void> {
  // 先存本地確保離線可用
  await AsyncStorage.setItem(contactsKey(backendElderId), JSON.stringify(contacts));
  // 再同步到後端
  try {
    if (backendElderId) {
      await saveEmergencyContactsApi(backendElderId, contacts);
    }
  } catch (e) {
    console.warn('[EmergencyContactService] 後端同步失敗，僅存本地:', e);
  }
}

export async function getPrimaryContact(
  backendElderId: string | null,
): Promise<EmergencyContact | null> {
  const contacts = await getEmergencyContacts(backendElderId);
  return contacts.find(c => c.isPrimary) ?? contacts[0] ?? null;
}
