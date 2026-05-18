import AsyncStorage from '@react-native-async-storage/async-storage';
import {sendMorningCheckin, sendFortuneCheckin} from './NotificationService';
import {getElderDisplayName} from './ProfileService';
import {getNotificationSettings} from './NotificationSettingsService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SlotState {
  triggeredAt: string | null; // 'HH:MM' when first triggered, null if not yet
  notified:    boolean;       // whether the notification was actually sent
}

export interface DailyCheckinState {
  slot1: SlotState; // 05:00–06:59 晨間活動
  slot2: SlotState; // 07:00–11:59 起床簽到
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_PREFIX   = 'morning_checkin_';
const KEY_UNLOCK_TIME  = 'morningUnlockTime';   // epoch ms of slot2 first unlock
const FORTUNE_PREFIX   = 'fortune_shared_';
const MERGE_WINDOW_MS  = 30 * 60 * 1000;        // 30 minutes

const SLOT1_START = 5;  // 05:00 inclusive
const SLOT1_END   = 7;  // 07:00 exclusive
const SLOT2_START = 7;  // 07:00 inclusive
const SLOT2_END   = 12; // 12:00 exclusive

// ─── Storage helpers ─────────────────────────────────────────────────────────

function todayKey(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${STORAGE_PREFIX}${d.getFullYear()}-${mm}-${dd}`;
}

function todayFortuneKey(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${FORTUNE_PREFIX}${d.getFullYear()}-${mm}-${dd}`;
}

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function isSleepHour(): boolean {
  const h = new Date().getHours();
  return h >= 23 || h < 7;
}

async function load(): Promise<DailyCheckinState> {
  try {
    const raw = await AsyncStorage.getItem(todayKey());
    if (raw) {
      const p = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      // Migrate old format that lacks the `notified` field
      return {
        slot1: {
          triggeredAt: (p.slot1?.triggeredAt as string | null) ?? null,
          // Old slot1 sent immediately — treat triggeredAt as notified
          notified:    (p.slot1?.notified as boolean | undefined) ?? (p.slot1?.triggeredAt != null),
        },
        slot2: {
          triggeredAt: (p.slot2?.triggeredAt as string | null) ?? null,
          notified:    (p.slot2?.notified as boolean | undefined) ?? false,
        },
      };
    }
  } catch {}
  return {
    slot1: {triggeredAt: null, notified: false},
    slot2: {triggeredAt: null, notified: false},
  };
}

async function save(state: DailyCheckinState): Promise<void> {
  await AsyncStorage.setItem(todayKey(), JSON.stringify(state));
}

// ─── Public API — check-in ────────────────────────────────────────────────────

/** Returns today's check-in state for both slots (always fresh from storage). */
export async function getDailyCheckinState(): Promise<DailyCheckinState> {
  return load();
}

/**
 * Called on every real screen unlock (ACTION_USER_PRESENT).
 *
 * Slot 1  05:00–06:59  → ☀️ sent immediately on first unlock
 * Slot 2  07:00–11:59  → notification is DEFERRED:
 *   - Records `morningUnlockTime` and marks slot2 as triggered (no-repeat).
 *   - If `sendDailyInteraction()` fires within 30 min → merged notification is
 *     sent by sendDailyInteraction(), covering both wake-up + fortune.
 *   - On the NEXT unlock after 30 min with no fortune share → fallback
 *     "起床了" is sent now and slot2 is marked notified.
 */
export async function checkAndSend(): Promise<void> {
  const now = new Date();
  const h   = now.getHours();

  if (h < SLOT1_START || h >= SLOT2_END) return;

  const state = await load();
  const time  = hhmm(now);
  const name  = await getElderDisplayName();

  if (h < SLOT1_END) {
    // ── Slot 1: send immediately ──────────────────────────────────────────────
    if (state.slot1.triggeredAt !== null) return;
    state.slot1 = {triggeredAt: time, notified: true};
    await save(state);
    sendMorningCheckin(name, time, 1);
  } else {
    // ── Slot 2 ────────────────────────────────────────────────────────────────
    if (state.slot2.triggeredAt === null) {
      // First slot2 unlock: record epoch time, defer notification
      state.slot2 = {triggeredAt: time, notified: false};
      await save(state);
      await AsyncStorage.setItem(KEY_UNLOCK_TIME, String(now.getTime()));

    } else if (!state.slot2.notified) {
      // Slot2 triggered but notification deferred — check 30-min window
      const rawMs = await AsyncStorage.getItem(KEY_UNLOCK_TIME);
      if (rawMs && Date.now() - Number(rawMs) > MERGE_WINDOW_MS) {
        // Window expired without a fortune share → send fallback "起床了"
        state.slot2.notified = true;
        await save(state);
        sendMorningCheckin(name, state.slot2.triggeredAt!, 2);
      }
      // Still within window → keep waiting for fortune share
    }
    // slot2.notified === true → no-op
  }
}

/**
 * Manual check-in from the UI button.
 * Forces slot2 into notified state (sends notification if not yet sent).
 */
export async function manualCheckin(): Promise<DailyCheckinState> {
  const now   = new Date();
  const time  = hhmm(now);
  const state = await load();
  const name  = await getElderDisplayName();

  if (state.slot2.triggeredAt === null) {
    // First trigger via manual button
    state.slot2 = {triggeredAt: time, notified: true};
    await save(state);
    sendMorningCheckin(name, time, 2);
  } else if (!state.slot2.notified) {
    // Was deferred — elder manually confirmed, send now
    state.slot2.notified = true;
    await save(state);
    sendMorningCheckin(name, state.slot2.triggeredAt!, 2);
  }

  return load();
}

// ─── Public API — fortune interaction ────────────────────────────────────────

/** Returns today's fortune-share time (HH:MM) or null if not yet triggered. */
export async function getDailyInteractionState(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(todayFortuneKey());
  } catch {
    return null;
  }
}

/**
 * Called when the elder presses "我看完了，分享給家人 🌅".
 *
 * Merge logic:
 *   - Slot2 triggered but NOT yet notified AND within 30 min of unlock:
 *     → Sends ONE merged notification "起床並看了今日運勢，心情很好 😊"
 *     → Marks slot2 as notified (suppresses later "起床了")
 *   - Otherwise (slot2 already notified, or >30 min, or not in window):
 *     → Sends standalone "看了今日運勢，心情很好 😊"
 *
 * Returns the recorded share time (HH:MM), or existing time if already done.
 */
export async function sendDailyInteraction(): Promise<string | null> {
  try {
    const key      = todayFortuneKey();
    const existing = await AsyncStorage.getItem(key);
    if (existing) return existing;

    const now  = new Date();
    const time = hhmm(now);
    await AsyncStorage.setItem(key, time);

    const settings      = await getNotificationSettings().catch(() => null);
    const fortuneEnabled = settings?.fortuneViewed ?? true;

    if (isSleepHour() || !fortuneEnabled) return time;

    const name  = await getElderDisplayName();
    const state = await load();

    // Check if slot2 unlock is pending (deferred, unnotified) and within window
    if (state.slot2.triggeredAt !== null && !state.slot2.notified) {
      const rawMs = await AsyncStorage.getItem(KEY_UNLOCK_TIME);
      if (rawMs && Date.now() - Number(rawMs) <= MERGE_WINDOW_MS) {
        // ── Merged: covers both wake-up + fortune in one notification ─────────
        state.slot2.notified = true;
        await save(state);
        sendFortuneCheckin(name, state.slot2.triggeredAt!, true);
        return time;
      }
    }

    // ── Independent fortune notification ──────────────────────────────────────
    sendFortuneCheckin(name, time, false);
    return time;
  } catch {
    return null;
  }
}
