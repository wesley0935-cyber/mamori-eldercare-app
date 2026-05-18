import {getBatteryLevel} from 'react-native-device-info';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {sendLowBatteryAlert} from './NotificationService';
import {getElderDisplayName} from './ProfileService';
import {getThresholdSettings} from './ThresholdSettingsService';

// ─── Constants ────────────────────────────────────────────────────────────────

const KEY_ALERT_SENT   = 'battery_alert_sent';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Core check ──────────────────────────────────────────────────────────────

async function check(): Promise<void> {
  const level = await getBatteryLevel(); // 0..1; negative means unavailable
  if (level < 0) return;

  const {lowBatteryPct} = await getThresholdSettings();
  const alertThreshold  = lowBatteryPct / 100;
  // 重置門檻設為30%，避免長輩充電到20%就拔掉
  // 導致電量再次降到15%時反覆發送通知
  const resetThreshold  = 0.30;

  const percent   = Math.round(level * 100);
  const alertSent = (await AsyncStorage.getItem(KEY_ALERT_SENT)) === 'true';

  if (level < alertThreshold && !alertSent) {
    await AsyncStorage.setItem(KEY_ALERT_SENT, 'true');
    sendLowBatteryAlert(await getElderDisplayName(), percent);
  } else if (level >= resetThreshold && alertSent) {
    // Charged back above recovery threshold — allow next cycle to alert again.
    await AsyncStorage.setItem(KEY_ALERT_SENT, 'false');
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Starts polling battery level every 5 minutes.
 *
 * - < 15%  → sendLowBatteryAlert once per discharge cycle
 * - ≥ 30%  → resets the alert flag so the next cycle can fire again
 *
 * Returns a cleanup function; call it on component unmount.
 */
export function startBatteryMonitor(): () => void {
  check().catch(console.error);
  const timer = setInterval(() => check().catch(console.error), POLL_INTERVAL_MS);
  return () => clearInterval(timer);
}
