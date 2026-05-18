import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

export type AppRole = 'elder' | 'family';
export type FamilyRole = 'admin' | 'viewer';

export interface ElderProfile {
  name: string;
  age: number;
  pairCode: string;
}

export interface ElderPairCodeRecord {
  code: string;
  createdAt: number; // ms timestamp
}

export type TryPairStatus = 'ok' | 'invalid' | 'expired';
export interface TryPairResult {
  status: TryPairStatus;
  profile?: ElderProfile;
}

export type VerifyInviteStatus = 'ok' | 'invalid' | 'expired';

export interface FamilyProfile {
  name: string;
  familyId?: string;
  role?: FamilyRole;
}

export interface InviteCode {
  code: string;
  createdAt: string;
}

export interface PairedElder {
  pairCode: string;
  name: string;
  age: number;
  pairedAt: string;
}

export interface FamilyMember {
  name: string;
  pairedAt: string;
  familyId?: string;
  role?: FamilyRole;
}

const KEY_ROLE            = 'app_role';
const KEY_ELDER_PROFILE   = 'elder_profile';
const KEY_ELDER_PAIR_CODE = 'elder_pair_code';
const KEY_FAMILY_PROFILE  = 'family_profile';
const KEY_PAIRED_ELDERS   = 'paired_elders';
const KEY_FAMILY_COUNT    = 'elder_family_count';
const KEY_FAMILY_MEMBERS  = 'elder_family_members';
const KEY_INVITE_CODE     = 'family_invite_code';

const PAIR_CODE_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

// In-memory cache so notification senders don't hit storage on every call
let _cachedElderName: string | null = null;

// ?�?�?� Pair code ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

export async function generatePairCode(): Promise<string> {
  try {
    const deviceId = await DeviceInfo.getUniqueId();
    const seed = deviceId + Date.now().toString();
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = (Math.imul(31, h) + seed.charCodeAt(i)) >>> 0;
    }
    return String((h % 900000) + 100000);
  } catch {
    return String(Math.floor(100000 + Math.random() * 900000));
  }
}

export async function getElderPairCodeRecord(): Promise<ElderPairCodeRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_ELDER_PAIR_CODE);
    return raw ? (JSON.parse(raw) as ElderPairCodeRecord) : null;
  } catch {
    return null;
  }
}

export async function generateAndSavePairCode(): Promise<ElderPairCodeRecord> {
  try {
    // ?�試從�?端�?得�?對碼
    const { generatePairingCode } = require('../api/pairingApi');
    const result = await generatePairingCode();
    const record: ElderPairCodeRecord = {
      code: result.code,
      createdAt: Date.now(),
    };
    await AsyncStorage.setItem(KEY_ELDER_PAIR_CODE, JSON.stringify(record));
    return record;
  } catch (e) {
    // 後端失�??�退?�本?�產??    const code = await generatePairCode();
    const record: ElderPairCodeRecord = {code, createdAt: Date.now()};
    await AsyncStorage.setItem(KEY_ELDER_PAIR_CODE, JSON.stringify(record));
    return record;
  }
}

export function generateFamilyId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ?�?�?� App role ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

export async function getAppRole(): Promise<AppRole | null> {
  try {
    const val = await AsyncStorage.getItem(KEY_ROLE);
    return (val as AppRole) ?? null;
  } catch {
    return null;
  }
}

export async function setAppRole(role: AppRole): Promise<void> {
  await AsyncStorage.setItem(KEY_ROLE, role);
}

// ?�?�?� Elder profile ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

export async function getElderProfile(): Promise<ElderProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_ELDER_PROFILE);
    return raw ? (JSON.parse(raw) as ElderProfile) : null;
  } catch {
    return null;
  }
}

export async function setElderProfile(profile: ElderProfile): Promise<void> {
  _cachedElderName = profile.name;
  await AsyncStorage.setItem(KEY_ELDER_PROFILE, JSON.stringify(profile));
}

// ?�?�?� Family profile ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

export async function getFamilyProfile(): Promise<FamilyProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_FAMILY_PROFILE);
    if (!raw) return null;
    const profile = JSON.parse(raw) as FamilyProfile;
    if (!profile.familyId) {
      profile.familyId = generateFamilyId();
      await AsyncStorage.setItem(KEY_FAMILY_PROFILE, JSON.stringify(profile));
    }
    return profile;
  } catch {
    return null;
  }
}

export async function setFamilyProfile(profile: FamilyProfile): Promise<void> {
  const withId: FamilyProfile = profile.familyId
    ? profile
    : {...profile, familyId: generateFamilyId()};
  await AsyncStorage.setItem(KEY_FAMILY_PROFILE, JSON.stringify(withId));
}

// ?�?�?� Paired elders (family side) ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

export async function getPairedElders(): Promise<PairedElder[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PAIRED_ELDERS);
    return raw ? (JSON.parse(raw) as PairedElder[]) : [];
  } catch {
    return [];
  }
}

export async function addPairedElder(elder: PairedElder): Promise<PairedElder[]> {
  const list = await getPairedElders();
  const deduped = list.filter(e => e.pairCode !== elder.pairCode);
  const updated = [...deduped, elder];
  await AsyncStorage.setItem(KEY_PAIRED_ELDERS, JSON.stringify(updated));
  return updated;
}

export async function removePairedElder(pairCode: string): Promise<PairedElder[]> {
  const list = await getPairedElders();
  const updated = list.filter(e => e.pairCode !== pairCode);
  await AsyncStorage.setItem(KEY_PAIRED_ELDERS, JSON.stringify(updated));
  return updated;
}

export async function updateElderPairCode(oldCode: string, newCode: string): Promise<PairedElder[]> {
  const profile = await getElderProfile();
  if (profile?.pairCode === oldCode) {
    await setElderProfile({...profile, pairCode: newCode});
  }
  // Reset expiry: the new code gets a fresh 48-hour window
  const record: ElderPairCodeRecord = {code: newCode, createdAt: Date.now()};
  await AsyncStorage.setItem(KEY_ELDER_PAIR_CODE, JSON.stringify(record));
  const list = await getPairedElders();
/**
 * Same-device pairing: calls backend to confirm pairing code.
 * Falls back to local check if backend is unavailable.
 */
export async function tryPairWithCode(code: string): Promise<TryPairResult> {
  try {
    const { confirmPairing } = require('../api/pairingApi');
    const deviceId = await AsyncStorage.getItem('deviceId');
    if (!deviceId) { return {status: 'invalid'}; }
    const result = await confirmPairing(code.trim(), deviceId);
    if (result?.success) {
      await AsyncStorage.setItem('isPaired', 'true');
      return {status: 'ok', profile: await getElderProfile()};
    }
    if (result?.message?.includes('過期')) { return {status: 'expired'}; }
    return {status: 'invalid'};
  } catch (e) {
    const profile = await getElderProfile();
    if (!profile || profile.pairCode !== code.trim()) { return {status: 'invalid'}; }
    const record = await getElderPairCodeRecord();
    if (record && Date.now() - record.createdAt > PAIR_CODE_EXPIRY_MS) { return {status: 'expired'}; }
    return {status: 'ok', profile};
  }
}


// ?�?�?� Elder display name (for notifications) ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

export async function getElderDisplayName(): Promise<string> {
  if (_cachedElderName !== null) return _cachedElderName;
  const profile = await getElderProfile();
  _cachedElderName = profile?.name ?? '?�輩';
  return _cachedElderName;
}

// ?�?�?� Family members (shown on elder side) ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

export async function getFamilyMembers(): Promise<FamilyMember[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_FAMILY_MEMBERS);
    return raw ? (JSON.parse(raw) as FamilyMember[]) : [];
  } catch {
    return [];
  }
}

export async function addFamilyMember(member: FamilyMember): Promise<FamilyMember[]> {
  const list = await getFamilyMembers();
  const deduped = member.familyId
    ? list.filter(m => m.familyId !== member.familyId)
    : list;
  const updated = [...deduped, member];
  await AsyncStorage.setItem(KEY_FAMILY_MEMBERS, JSON.stringify(updated));
  return updated;
}

export async function removeFamilyMember(familyId: string): Promise<FamilyMember[]> {
  const list = await getFamilyMembers();
  const updated = list.filter(m => m.familyId !== familyId);
  await AsyncStorage.setItem(KEY_FAMILY_MEMBERS, JSON.stringify(updated));
  return updated;
}

// ?�?�?� Family count (shown on elder side) ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

export async function getElderFamilyCount(): Promise<number> {
  const members = await getFamilyMembers();
  const uniqueIds = new Set(
    members.filter(m => m.familyId).map(m => m.familyId as string),
  );
  const legacyCount = members.filter(m => !m.familyId).length;
  return uniqueIds.size + legacyCount;
}

// No-op: count is now derived from getFamilyMembers() to avoid drift
export async function incrementElderFamilyCount(): Promise<number> {
  return getElderFamilyCount();
}

// ?�?�?� Family role ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

export async function getFamilyRole(): Promise<FamilyRole> {
  const profile = await getFamilyProfile();
  return profile?.role ?? 'admin';
}

// ?�?�?� Invite code ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

export async function generateAndSaveInviteCode(): Promise<InviteCode> {
  const code = String(Math.floor(10000000 + Math.random() * 90000000));
  const invite: InviteCode = {code, createdAt: new Date().toISOString()};
  await AsyncStorage.setItem(KEY_INVITE_CODE, JSON.stringify(invite));
  return invite;
}

export async function getInviteCode(): Promise<InviteCode | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_INVITE_CODE);
    return raw ? (JSON.parse(raw) as InviteCode) : null;
  } catch {
    return null;
  }
}

// Returns true only if code matches and was created within 24 hours
export async function verifyInviteCode(code: string): Promise<boolean> {
  const invite = await getInviteCode();
  if (!invite || invite.code !== code.trim()) {return false;}
  const ageHours = (Date.now() - new Date(invite.createdAt).getTime()) / 3_600_000;
  return ageHours <= 24;
}

// Distinguishes expired from invalid for better user-facing error messages
export async function verifyInviteCodeStatus(code: string): Promise<VerifyInviteStatus> {
  const invite = await getInviteCode();
  if (!invite || invite.code !== code.trim()) {return 'invalid';}
  const ageHours = (Date.now() - new Date(invite.createdAt).getTime()) / 3_600_000;
  return ageHours <= 24 ? 'ok' : 'expired';
}

// ?�?�?� Full reset ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

export async function clearAllAppData(): Promise<void> {
  _cachedElderName = null;
  await AsyncStorage.clear();
}

