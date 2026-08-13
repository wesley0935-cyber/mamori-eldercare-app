import {AppState, NativeEventEmitter, NativeModules, type AppStateStatus} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {sendInactivityAlert} from './NotificationService';
import {getElderDisplayName} from './ProfileService';
import {getThresholdSettings} from './ThresholdSettingsService';

// ─── Constants ───────────────────────────────────────────────────────────────

const KEY_LAST_ACTIVE_TS   = 'activity_last_active_ts';
const KEY_ALERT_COUNT      = 'activity_alert_count';
const KEY_ALERT_LAST_SENT  = 'activity_alert_last_sent';
const MAX_ALERT_COUNT      = 3;
const ALERT_INTERVAL_MS    = 30 * 60 * 1000; // 30 分鐘
const EVAL_INTERVAL_MS     = 60_000;
const STEP_DELTA_THRESHOLD = 10;

// ─── Module-level state ───────────────────────────────────────────────────────

// In-memory baseline for step comparison; reset on each service start.
let lastKnownSteps: number | null = null;

// Tracks whether the previous evaluate() tick was inside the sleep window.
// null = not yet initialized (first tick never triggers a reset).
let wasInSleep: boolean | null = null;

// Fall-detection pause: while the "您還好嗎？" modal is open, evaluate() is
// suspended so the 30-second wait doesn't add to the inactivity clock.
let _paused   = false;
let _pausedAt = 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns true when the current hour falls inside the user-defined sleep window.
 *
 * 睡眠時段豁免：只針對活躍警報（不觸發「4小時無活躍警報」）。
 * SOS、跌倒、早安簽到、低電量不受影響 — 這些功能在其他 service 中永遠運作。
 */
function isInSleepWindow(startHour: number, endHour: number): boolean {
  const h = new Date().getHours();
  // Handles overnight spans (e.g. 23→07) and same-day spans (e.g. 01→06)
  if (startHour >= endHour) {
    return h >= startHour || h < endHour;
  }
  return h >= startHour && h < endHour;
}

/**
 * Marks the elder as currently active.
 * Resets the alert_sent flag so a future inactivity window can fire again.
 */
export async function updateLastActive(): Promise<void> {
  await AsyncStorage.setItem(KEY_LAST_ACTIVE_TS, String(Date.now()));
  await AsyncStorage.removeItem(KEY_ALERT_COUNT);
  await AsyncStorage.removeItem(KEY_ALERT_LAST_SENT);
}

// ─── Pause / resume (used by fall-detection modal) ───────────────────────────

/**
 * Suspends the inactivity evaluation loop while the fall-detection modal is
 * open so the 30-second wait does not count as inactive time.
 */
export function pause(): void {
  _paused   = true;
  _pausedAt = Date.now();
}

/**
 * Resumes the inactivity evaluation loop after the fall-detection modal closes.
 *
 * Compensates KEY_LAST_ACTIVE_TS by adding the pause duration so that the
 * time spent inside the modal is excluded from the inactivity calculation.
 *
 * Situation A (false alarm): caller should additionally call updateLastActive()
 *   to reset the clock to now.
 * Situation B (confirmed fall): no extra call needed — the compensated timestamp
 *   lets the inactivity alert fire normally once the threshold is reached.
 */
export async function resume(): Promise<void> {
  if (!_paused) return;
  const pauseDuration = Date.now() - _pausedAt;
  _paused   = false;
  _pausedAt = 0;
  try {
    const raw = await AsyncStorage.getItem(KEY_LAST_ACTIVE_TS);
    if (raw) {
      await AsyncStorage.setItem(
        KEY_LAST_ACTIVE_TS,
        String(parseInt(raw, 10) + pauseDuration),
      );
    }
  } catch {}
}

// ─── Situation C: periodic evaluation ────────────────────────────────────────

async function evaluate(): Promise<void> {
  if (_paused) return;
  const {inactivityHours, sleepStartHour, sleepEndHour} =
    await getThresholdSettings();

  const inSleep = isInSleepWindow(sleepStartHour, sleepEndHour);

  // ── 睡眠時段結束重置 ──────────────────────────────────────────────────────────
  // Detect sleep → wake transition (wasInSleep true then false).
  // On the first tick after the sleep window ends:
  //   • Always reset alert_sent so the inactivity timer starts fresh.
  //   • 睡眠結束時只在必要時重置 last_active_ts
  //     避免覆蓋睡眠時段內的活躍記錄
  //     情況A: last_active_ts 早於昨晚睡眠開始時間 → 重置為現在（睡前就無活躍）
  //     情況B: last_active_ts 在睡眠時段內（例如05:30起來）→ 保留，不覆蓋
  if (wasInSleep === true && !inSleep) {

    // Compute the timestamp when the sleep window started (today's sleepStartHour).
    // If sleepStart >= sleepEnd the window spans midnight, so sleepStart was yesterday.
    const now          = new Date();
    const sleepStartTs = (() => {
      const d = new Date(now);
      d.setHours(sleepStartHour, 0, 0, 0);
      // Overnight span (e.g. 23→07): start hour was yesterday relative to the wake hour
      if (sleepStartHour >= sleepEndHour) {
        d.setDate(d.getDate() - 1);
      }
      return d.getTime();
    })();

    const rawTs = await AsyncStorage.getItem(KEY_LAST_ACTIVE_TS);
    const lastTs = rawTs ? parseInt(rawTs, 10) : 0;

    // 睡眠結束時只在必要時重置 last_active_ts
    // 避免覆蓋睡眠時段內的活躍記錄
    if (!lastTs || lastTs < sleepStartTs) {
      // 情況A: 長輩昨晚睡前就沒有活躍記錄，從睡眠結束時間開始計算
      await AsyncStorage.setItem(KEY_LAST_ACTIVE_TS, String(Date.now()));
    }
    // 情況B: last_active_ts 在睡眠時段內（例如05:30起來）→ 不覆蓋，保留原值
  }
  wasInSleep = inSleep;

  // 睡眠時段內：只暫停「4小時無活躍警報」，其他功能不受影響
  if (inSleep) return;

  const raw = await AsyncStorage.getItem(KEY_LAST_ACTIVE_TS);
  const ts  = raw ? parseInt(raw, 10) : 0;
  if (!ts) return; // null、'0' 或 NaN → 初始化尚未完成，跳過

  const elapsed     = Date.now() - ts;
  const thresholdMs = inactivityHours * 60 * 60 * 1000;
  if (elapsed < thresholdMs) return;

  const countRaw = await AsyncStorage.getItem(KEY_ALERT_COUNT);
  const count = countRaw ? parseInt(countRaw, 10) : 0;
  if (count >= MAX_ALERT_COUNT) return;

  const lastSentRaw = await AsyncStorage.getItem(KEY_ALERT_LAST_SENT);
  const lastSent = lastSentRaw ? parseInt(lastSentRaw, 10) : 0;
  if (count > 0 && Date.now() - lastSent < ALERT_INTERVAL_MS) return;

  await AsyncStorage.setItem(KEY_ALERT_COUNT, String(count + 1));
  await AsyncStorage.setItem(KEY_ALERT_LAST_SENT, String(Date.now()));
  const elderName = await getElderDisplayName();
  // 警示記錄由家屬端收到 FCM 後自行儲存，長輩端不需在本地寫入
  sendInactivityAlert(elderName, elapsed / 3_600_000);
}

// ─── First-launch initialisation ─────────────────────────────────────────────

/**
 * 初始化保護：第一次安裝時設為當前時間
 * 避免 last_active_ts 為空導致立即觸發警報
 *
 * Treats null, undefined, '0', and NaN as "not yet set".
 * Awaited before the first evaluate() call so there is no race condition.
 */
async function initializeLastActiveTs(): Promise<void> {
  const raw = await AsyncStorage.getItem(KEY_LAST_ACTIVE_TS);
  const ts  = raw ? parseInt(raw, 10) : 0;
  // 初始化保護：第一次安裝時設為當前時間
  // 避免 last_active_ts 為空導致立即觸發警報
  if (!ts) {
    await AsyncStorage.setItem(KEY_LAST_ACTIVE_TS, String(Date.now()));
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Situation B: call this whenever the step count updates.
 * If the count grew by ≥ 10 since the last reading, the elder is considered active.
 */
export async function notifyStepsUpdated(steps: number): Promise<void> {
  if (lastKnownSteps === null) {
    // 第一次收到步數（APP 重啟後）→ 設基準值並立即重置活躍時間
    lastKnownSteps = steps;
    await updateLastActive();
    return;
  }
  if (steps - lastKnownSteps >= STEP_DELTA_THRESHOLD) {
    await updateLastActive();
  }
  lastKnownSteps = steps;
}

/**
 * Starts the activity detection service.
 *
 * Situation A — App enters foreground  → updateLastActive()
 * Situation B — Step delta ≥ 10       → updateLastActive() (via notifyStepsUpdated)
 * Situation C — evaluate() every 60 s → alert if no activity for > N h outside sleep window
 *
 * Sleep window scope (only inactivity alert is paused during sleep):
 *   ✓ Inactivity alert  — suppressed inside sleep window
 *   ✗ SOS               — always active (handled by SOS service)
 *   ✗ Fall detection    — always active (handled by FallDetection service)
 *   ✗ Morning check-in  — 05:00–06:59 still fires (handled by MorningCheckinService)
 *   ✗ Low battery       — always active (handled by NotificationService)
 *
 * Returns a cleanup function; call it when the component/host unmounts.
 */
export function startActivityDetection(): () => void {
  // 初始化保護：第一次安裝時設為當前時間
  // 避免 last_active_ts 為空導致立即觸發警報
  // Await init before the first evaluate() to eliminate the race condition
  // where evaluate() reads null while the write is still in flight.
  initializeLastActiveTs()
    .then(() => updateLastActive()) // APP 啟動時無條件重置一次
    .then(() => evaluate())
    .catch(console.error);

  const FallDetectionModule = NativeModules.FallDetectionModule;
  const fallEmitter = new NativeEventEmitter(FallDetectionModule);
  const inactivitySub = fallEmitter.addListener('InactivityTick', () => {
    evaluate().catch(console.error);
  });

  // Situation A: foreground transition
  const appStateSub = AppState.addEventListener(
    'change',
    (state: AppStateStatus) => {
      if (state === 'active') {
        updateLastActive().catch(console.error);
      }
    },
  );

  // Situation C: evaluate every minute (first tick handled by init chain above)
  const timer = setInterval(() => {
    evaluate().catch(console.error);
  }, EVAL_INTERVAL_MS);

  return () => {
    appStateSub.remove();
    inactivitySub.remove();
    clearInterval(timer);
    lastKnownSteps = null;
    wasInSleep     = null;
    _paused        = false;
    _pausedAt      = 0;
  };
}
