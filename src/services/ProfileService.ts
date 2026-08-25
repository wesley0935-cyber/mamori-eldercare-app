import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import {getOrCreateDeviceId} from '../utils/deviceId';

export type AppRole = 'elder' | 'family';
export type FamilyRole = 'admin' | 'viewer';

export interface ElderProfile {
  name: string;
  age: number;
  pairCode: string;
  elderId?: string;
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
  elderId?: string;  // 後端 Elder UUID，用於步數趨勢 API 查詢
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
const KEY_FAMILY_MEMBERS  = 'elder_family_members';
const KEY_INVITE_CODE     = 'family_invite_code';

export const INVITE_CODE_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours，與後端 /invite/generate 一致

let _cachedElderName: string | null = null;

// ── Pair code ────────────────────────────────────────────────────────────────

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

export async function generateAndSavePairCode(params?: {
  elderName?: string;
  elderAge?: number;
}): Promise<ElderPairCodeRecord> {
  try {
    const { generatePairingCode } = require('../api/pairingApi');
    const deviceId = await getOrCreateDeviceId();
    const result = await generatePairingCode({
      elderName: params?.elderName || '',
      elderAge: params?.elderAge || 0,
      deviceId,
    });
    // 儲存後端 elderId（供步數趨勢 API 查詢）
    if (result.elderId != null) {
      await AsyncStorage.setItem('backendElderId', String(result.elderId));
    }
    // 儲存後端 pairingId（配對完成後用於登記家屬 FCM token）
    if (result.pairingId != null) {
      await AsyncStorage.setItem('backendPairingId', String(result.pairingId));
    }
    const record: ElderPairCodeRecord = {
      code: result.code,
      createdAt: Date.now(),
    };
    await AsyncStorage.setItem(KEY_ELDER_PAIR_CODE, JSON.stringify(record));
    return record;
  } catch (e) {
    console.error('[generateAndSavePairCode] 後端失敗，改用本地碼:', e);
    const code = await generatePairCode();
    const record: ElderPairCodeRecord = { code, createdAt: Date.now() };
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

// ── App role ─────────────────────────────────────────────────────────────────

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

// ── Elder profile ─────────────────────────────────────────────────────────────

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

// ── Family profile ────────────────────────────────────────────────────────────

export async function getFamilyProfile(): Promise<FamilyProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_FAMILY_PROFILE);
    if (!raw) { return null; }
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
    : { ...profile, familyId: generateFamilyId() };
  await AsyncStorage.setItem(KEY_FAMILY_PROFILE, JSON.stringify(withId));
}

// ── Paired elders (family side) ───────────────────────────────────────────────

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
    await setElderProfile({ ...profile, pairCode: newCode });
  }
  const record: ElderPairCodeRecord = { code: newCode, createdAt: Date.now() };
  await AsyncStorage.setItem(KEY_ELDER_PAIR_CODE, JSON.stringify(record));
  const list = await getPairedElders();
  const updated = list.map(e => e.pairCode === oldCode ? { ...e, pairCode: newCode } : e);
  await AsyncStorage.setItem(KEY_PAIRED_ELDERS, JSON.stringify(updated));
  return updated;
}

// ── confirmPairingWithCode（家屬端配對）────────────────────────────────────────

export async function confirmPairingWithCode(code: string): Promise<TryPairResult> {
  try {
    const { confirmPairing } = require('../api/pairingApi');
    const result = await confirmPairing(code.trim());

    if (result?.success) {
      await AsyncStorage.setItem('backendElderId', String(result.elderId));

      // 儲存 pairingId，供後續更新家屬 FCM token 使用
      if (result.pairingId != null) {
        await AsyncStorage.setItem('backendPairingId', String(result.pairingId));
      }

      // 取得家屬裝置的 FCM token 並向後端登記
      try {
        const messaging = require('@react-native-firebase/messaging').default;
        const { registerFamilyFcmToken } = require('../api/notificationApi');
        const fcmToken = await messaging().getToken();
        if (result.pairingId && fcmToken) {
          await registerFamilyFcmToken(String(result.pairingId), fcmToken);
          console.log('[ProfileService] 家屬 FCM token 已登記');
        }
      } catch (fcmErr) {
        // FCM 登記失敗不影響配對結果，僅 log 警告
        console.warn('[ProfileService] 家屬 FCM token 登記失敗:', fcmErr);
      }

      return {
        status: 'ok',
        profile: {
          name: result.elderName || '長輩',
          age: result.elderAge || 0,
          pairCode: code.trim(),
          elderId: String(result.elderId),
        },
      };
    }
    if (result?.message?.includes('過期') || result?.error?.includes('過期')) {
      return { status: 'expired' };
    }
    return { status: 'invalid' };
  } catch (e: any) {
    console.error('[confirmPairingWithCode] Error:', e);
    console.error('[confirmPairingWithCode] Error message:', e?.message);
    console.error('[confirmPairingWithCode] Error code:', e?.code);
    return { status: 'invalid' };
  }
}

// ── Elder display name (for notifications) ────────────────────────────────────

export async function getElderDisplayName(): Promise<string> {
  if (_cachedElderName !== null) { return _cachedElderName; }
  const profile = await getElderProfile();
  _cachedElderName = profile?.name ?? '長輩';
  return _cachedElderName;
}

// ── Family members (shown on elder side) ──────────────────────────────────────

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

// ── Family count (shown on elder side) ────────────────────────────────────────

export async function getElderFamilyCount(): Promise<number> {
  const members = await getFamilyMembers();
  const uniqueIds = new Set(
    members.filter(m => m.familyId).map(m => m.familyId as string),
  );
  const legacyCount = members.filter(m => !m.familyId).length;
  return uniqueIds.size + legacyCount;
}

export async function incrementElderFamilyCount(): Promise<number> {
  return getElderFamilyCount();
}

// ── Family role ───────────────────────────────────────────────────────────────

/**
 * 取得家屬角色。讀不到時保守回 'viewer'，避免權限 fail-open。
 *
 * - profile 存在：沿用其 role；舊版資料可能沒有 role 欄位，視為 'admin'
 *   （'viewer' 只可能由邀請碼流程寫入，而該流程一定會帶 role）
 * - profile 不存在且身分是長輩：長輩端不適用家屬角色制度，回 'admin'，
 *   否則長輩自己的畫面會被誤判成唯讀
 * - 其餘（家屬端但讀不到 profile）：保守回 'viewer'
 */
export async function getFamilyRole(): Promise<FamilyRole> {
  const profile = await getFamilyProfile();
  if (profile) { return profile.role ?? 'admin'; }
  const appRole = await getAppRole();
  return appRole === 'elder' ? 'admin' : 'viewer';
}

// ── Invite code ───────────────────────────────────────────────────────────────

/**
 * 向後端申請 8 位數家屬邀請碼並存入本機。
 *
 * 失敗時回傳 null（不產生本機假碼）—— 本機碼在後端不存在，
 * 其他家屬永遠加不進來，卻沒有任何錯誤跡象。呼叫端需處理 null。
 */
export async function generateAndSaveInviteCode(): Promise<InviteCode | null> {
  try {
    const elderId = await AsyncStorage.getItem('backendElderId');
    if (!elderId) {
      console.error('[generateAndSaveInviteCode] 無 backendElderId，無法產生邀請碼');
      return null;
    }
    const { generateInviteCode } = require('../api/pairingApi');
    const result = await generateInviteCode(elderId);
    if (!result?.code) {
      console.error('[generateAndSaveInviteCode] 後端未回傳邀請碼:', JSON.stringify(result));
      return null;
    }
    // 用後端 expiresAt 回推 createdAt，讓 UI 倒數與後端真實效期一致
    const createdAt = result.expiresAt
      ? new Date(new Date(result.expiresAt).getTime() - INVITE_CODE_EXPIRY_MS).toISOString()
      : new Date().toISOString();
    const invite: InviteCode = { code: String(result.code), createdAt };
    await AsyncStorage.setItem(KEY_INVITE_CODE, JSON.stringify(invite));
    return invite;
  } catch (e) {
    console.error('[generateAndSaveInviteCode] 後端產生邀請碼失敗:', e);
    return null;
  }
}

export async function getInviteCode(): Promise<InviteCode | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_INVITE_CODE);
    return raw ? (JSON.parse(raw) as InviteCode) : null;
  } catch {
    return null;
  }
}

// ── Full reset ────────────────────────────────────────────────────────────────

export async function clearAllAppData(): Promise<void> {
  _cachedElderName = null;
  await AsyncStorage.clear();
}