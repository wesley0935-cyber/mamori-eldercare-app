import AsyncStorage from '@react-native-async-storage/async-storage';

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

export async function getEmergencyContacts(): Promise<EmergencyContact[]> {
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
  await AsyncStorage.setItem(KEY, JSON.stringify(contacts));
}

export async function getPrimaryContact(): Promise<EmergencyContact | null> {
  const contacts = await getEmergencyContacts();
  return contacts.find(c => c.isPrimary) ?? contacts[0] ?? null;
}
