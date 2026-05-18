import {DeviceEventEmitter, NativeModules} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getThresholdSettings} from './ThresholdSettingsService';
import {pause as pauseActivityDetection} from './ActivityDetectionService';

// ─── Sensitivity presets ──────────────────────────────────────────────────────

const GRAVITY = 9.8; // m/s²
const ANGLE_THRESHOLD = Math.PI / 4; // 45° in radians
const IMPACT_WINDOW_MS = 2000; // max time to detect orientation change after impact
const STILL_WINDOW_MS = 5000; // stillness monitoring duration

// 睡眠時段確認倒數延長為 60 秒
// 給長輩更多時間從睡眠中醒來並回應
export const FALL_COUNTDOWN_DAY   = 30;
export const FALL_COUNTDOWN_SLEEP = 60;

export const FALL_SENSITIVITY_PRESETS = {
  low:    {gThreshold: 3.5 * GRAVITY, stillThreshold: 0.3},
  medium: {gThreshold: 3.0 * GRAVITY, stillThreshold: 0.5},
  high:   {gThreshold: 2.5 * GRAVITY, stillThreshold: 0.8},
} as const;

// 睡眠時段自動提高 G 值門檻到 4.5G
// 避免翻身誤觸，但仍偵測真正的跌倒
const SLEEP_FALL_PRESET = {gThreshold: 4.5 * GRAVITY, stillThreshold: 0.2};

export type FallSensitivity = keyof typeof FALL_SENSITIVITY_PRESETS;

// ─── False alarm tracking ─────────────────────────────────────────────────────

const FALSE_ALARM_PREFIX = 'fall_false_alarms_';

function todayFalseAlarmKey(): string {
  const d = new Date();
  return `${FALSE_ALARM_PREFIX}${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getDailyFalseAlarmCount(): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(todayFalseAlarmKey());
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}

export async function recordFalseAlarm(): Promise<void> {
  try {
    const key = todayFalseAlarmKey();
    const count = (await getDailyFalseAlarmCount()) + 1;
    await AsyncStorage.setItem(key, String(count));
    if (count >= 3) {
      // Dynamic import to avoid potential circular dependency at init time
      import('./NotificationService')
        .then(ns => ns.sendFallSensitivityWarning())
        .catch(console.error);
    }
  } catch {}
}

// ─── Detection state machine ──────────────────────────────────────────────────

type DetectionPhase = 'idle' | 'impact' | 'still';

let _phase: DetectionPhase = 'idle';
let _impactTimer: ReturnType<typeof setTimeout> | null = null;
let _stillTimer:  ReturnType<typeof setTimeout> | null = null;
let _stillSamples: number[] = [];
let _accAngle = 0;
let _lastGyroTs = 0;
let _gThreshold: number     = FALL_SENSITIVITY_PRESETS.low.gThreshold;
let _stillThreshold: number = FALL_SENSITIVITY_PRESETS.low.stillThreshold;
let _inSleepWindow          = false;
let _fallCallback: (() => void) | null = null;
let _sensorSub: {remove: () => void} | null = null;
let _settingsInterval: ReturnType<typeof setInterval> | null = null;

function resetDetection(): void {
  _phase = 'idle';
  _accAngle = 0;
  _stillSamples = [];
  _lastGyroTs = 0;
  if (_impactTimer) { clearTimeout(_impactTimer); _impactTimer = null; }
  if (_stillTimer)  { clearTimeout(_stillTimer);  _stillTimer = null;  }
}

function evaluateStillness(): void {
  if (_stillSamples.length === 0) { resetDetection(); return; }
  const avg = _stillSamples.reduce((a, b) => a + b, 0) / _stillSamples.length;
  const detected = avg < _stillThreshold;
  resetDetection();
  if (detected) {
    pauseActivityDetection();
    _fallCallback?.();
  }
}

function handleSensorEvent(event: {type: string; x: number; y: number; z: number}): void {
  if (event.type === 'accelerometer') {
    const mag = Math.sqrt(event.x ** 2 + event.y ** 2 + event.z ** 2);

    if (_phase === 'idle') {
      if (mag > _gThreshold) {
        _phase = 'impact';
        _accAngle = 0;
        _lastGyroTs = 0;
        _impactTimer = setTimeout(resetDetection, IMPACT_WINDOW_MS);
      }
    } else if (_phase === 'still') {
      // Track deviation from gravity — small deviation means phone is still
      _stillSamples.push(Math.abs(mag - GRAVITY));
    }

  } else if (event.type === 'gyroscope') {
    if (_phase !== 'impact') return;

    const now = Date.now();
    const dt = _lastGyroTs > 0 ? Math.min((now - _lastGyroTs) / 1000, 0.1) : 0.02;
    _lastGyroTs = now;

    // Integrate angular velocity to get cumulative angle change
    _accAngle += Math.sqrt(event.x ** 2 + event.y ** 2 + event.z ** 2) * dt;

    if (_accAngle >= ANGLE_THRESHOLD) {
      if (_impactTimer) { clearTimeout(_impactTimer); _impactTimer = null; }
      _phase = 'still';
      _stillSamples = [];
      _stillTimer = setTimeout(evaluateStillness, STILL_WINDOW_MS);
    }
  }
}

function isInSleepWindow(startHour: number, endHour: number): boolean {
  const h = new Date().getHours();
  if (startHour >= endHour) {
    return h >= startHour || h < endHour;
  }
  return h >= startHour && h < endHour;
}

async function loadSettings(): Promise<void> {
  try {
    const s = await getThresholdSettings();
    _inSleepWindow = isInSleepWindow(s.sleepStartHour, s.sleepEndHour);
    if (_inSleepWindow) {
      // 睡眠時段自動提高 G 值門檻到 4.5G
      // 避免翻身誤觸，但仍偵測真正的跌倒
      _gThreshold    = SLEEP_FALL_PRESET.gThreshold;
      _stillThreshold = SLEEP_FALL_PRESET.stillThreshold;
    } else {
      const preset = FALL_SENSITIVITY_PRESETS[s.fallDetectionSensitivity ?? 'low'];
      _gThreshold    = preset.gThreshold;
      _stillThreshold = preset.stillThreshold;
    }
  } catch {}
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function isFallDetectionAvailable(): boolean {
  return !!NativeModules.FallDetectionModule;
}

/** Returns true when the service is currently operating inside the sleep window. */
export function isFallSleepMode(): boolean {
  return _inSleepWindow;
}

export function startFallDetection(onFall: () => void): () => void {
  stopFallDetection();

  _fallCallback = onFall;
  loadSettings();
  _settingsInterval = setInterval(loadSettings, 30_000);

  NativeModules.FallDetectionModule?.startService();

  _sensorSub = DeviceEventEmitter.addListener(
    'FallDetectionSensorEvent',
    handleSensorEvent,
  );

  return stopFallDetection;
}

export function stopFallDetection(): void {
  _sensorSub?.remove();
  _sensorSub = null;
  if (_settingsInterval) { clearInterval(_settingsInterval); _settingsInterval = null; }
  NativeModules.FallDetectionModule?.stopService();
  _fallCallback = null;
  resetDetection();
}
