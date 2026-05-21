import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getEmergencyContactsApi,
  saveEmergencyContactsApi,
} from '../api/emergencyContactApi';

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

const KEY = 'emergency_contacts';
export const MAX_CONTACTS = 3;

async function getBackendElderId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem('backendElderId');
  } catch {
    return null;
  }
}

export async function getEmergencyContacts(): Promise<EmergencyContact[]> {
  try {
    const elderId = await getBackendElderId();
    if (elderId) {
      const contacts = await getEmergencyContactsApi(elderId);
      // 同步到本地，供離線備用
      await AsyncStorage.setItem(KEY, JSON.stringify(contacts));
      return contacts;
    }
  } catch {}
  // fallback：後端失敗時讀本地快取
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as EmergencyContact[]) : [];
  } catch {
    return [];
  }
}

export async function saveEmergencyContacts(
  contacts: EmergencyContact[],
): Promise<void> {
  // 先存本地確保離線可用
  await AsyncStorage.setItem(KEY, JSON.stringify(contacts));
  // 再同步到後端
  try {
    const elderId = await getBackendElderId();
    if (elderId) {
      await saveEmergencyContactsApi(elderId, contacts);
    }
  } catch (e) {
    console.warn('[EmergencyContactService] 後端同步失敗，僅存本地:', e);
  }
}

export async function getPrimaryContact(): Promise<EmergencyContact | null> {
  const contacts = await getEmergencyContacts();
  return contacts.find(c => c.isPrimary) ?? contacts[0] ?? null;
}
