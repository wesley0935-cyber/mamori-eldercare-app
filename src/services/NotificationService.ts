import notifee, {AndroidImportance, EventType} from '@notifee/react-native';
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getNotificationSettings,
  type NotificationSettings,
} from './NotificationSettingsService';
import {getElderDisplayName} from './ProfileService';
import type {AlertRecord} from './AlertStorageService';
import {getOrCreateDeviceId} from '../utils/deviceId';

// ─── Channel IDs ──────────────────────────────────────────────────────────────

export const CH_GENERAL    = 'ec_general';
export const CH_ALERT      = 'ec_alert';
export const CH_MEDICATION = 'ec_medication';

const FCM_TOKEN_KEY = 'fcm_token';

// ─── Init ─────────────────────────────────────────────────────────────────────

async function createChannels(): Promise<void> {
  await notifee.createChannel({
    id: CH_GENERAL,
    name: '一般通知',
    importance: AndroidImportance.DEFAULT,
  });
  await notifee.createChannel({
    id: CH_ALERT,
    name: '警示通知',
    importance: AndroidImportance.HIGH,
    vibration: true,
  });
  await notifee.createChannel({
    id: CH_MEDICATION,
    name: '服藥提醒',
    importance: AndroidImportance.HIGH,
  });
}

/**
 * Requests notification permission, creates Notifee channels, stores a mock FCM token.
 * Real FCM will be wired up once the backend is ready.
 */
export async function initFCM(): Promise<void> {
  // Must request permission before any displayNotification call (Android 13+).
  const settings = await notifee.requestPermission();
  console.log('[Notifee] Permission status:', settings.authorizationStatus);
  // TODO: 除錯用，測試完記得移除
  const {Alert} = require('react-native');
  Alert.alert('推播權限結果（除錯）', `authorizationStatus = ${settings.authorizationStatus}`);

  await createChannels();

  try {
    const { registerFcmToken } = require('../api/notificationApi');
    const messaging = require('@react-native-firebase/messaging').default;
    if (Platform.OS === 'ios') {
      await messaging().registerDeviceForRemoteMessages();

      // iOS 的 APNs token 是非同步到位的，第一次呼叫常回 null，需要輪詢等待
      let apnsToken = await messaging().getAPNSToken();
      let retries = 0;
      while (!apnsToken && retries < 10) {
        await new Promise<void>(resolve => setTimeout(() => resolve(), 500));
        apnsToken = await messaging().getAPNSToken();
        retries++;
      }
    }
    const token = await messaging().getToken();
    await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
    const deviceId = await getOrCreateDeviceId();
    try {
      await registerFcmToken(deviceId, token);
      console.log('[FCM] Token registered:', token);
    } catch (regError: any) {
      console.warn('[FCM] Token registration to backend failed (non-fatal):', regError?.message);
      // 不 throw，token 本身已經拿到，這只是登記失敗
    }
    // TODO: 除錯用，測試完記得移除
    Alert.alert('FCM Token 取得成功（除錯）', `Token 前 20 字：${token?.substring(0, 20)}...`);
  } catch (e: any) {
    // TODO: 除錯用，測試完記得移除
    Alert.alert('FCM Token 取得失敗（除錯）', `錯誤訊息：${e?.message ?? '無'}\n錯誤代碼：${e?.code ?? '無'}`);
    const mock = `mock-fcm-${Date.now()}`;
    await AsyncStorage.setItem(FCM_TOKEN_KEY, mock);
    console.log('[FCM] Mock token stored (fallback):', mock);
  }
}

// ─── Foreground handler ───────────────────────────────────────────────────────

/** Subscribes to Notifee foreground events. Returns cleanup. */
export function setupForegroundHandler(): () => void {
  return notifee.onForegroundEvent(({type, detail}) => {
    if (type === EventType.PRESS) {
      console.log('[Notifee] Foreground notification pressed:', detail.notification?.id);
    }
  });
}

/** No-op — kept so index.js import compiles. */
export async function handleBackgroundMessage(): Promise<void> {}

// ─── Local notification ───────────────────────────────────────────────────────

export async function sendLocalNotification(title: string, body: string): Promise<void> {
  console.log('[Notifee] sendLocalNotification:', title, body);
  try {
    await notifee.displayNotification({
      title,
      body,
      android: {channelId: CH_MEDICATION, pressAction: {id: 'default'}, smallIcon: '@mipmap/ic_launcher'},
    });
    console.log('[Notifee] displayNotification OK');
  } catch (e) {
    console.error('[Notifee] displayNotification error:', e);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function log(type: string, message: string): void {
  const ts = new Date().toLocaleTimeString('zh-TW', {hour12: false});
  console.log(`[NotificationService][${ts}][${type}] ${message}`);
}

/**
 * 發送推播給家屬裝置（透過後端 Firebase Admin SDK → FCM）。
 * 取代原本只在長輩裝置顯示的本地通知。
 */
async function localAlert(
  title: string,
  body: string,
  type: AlertRecord['type'],
  _highPriority = false,
): Promise<void> {
  try {
    const { sendFamilyNotification } = require('../api/notificationApi');
    const deviceId = await AsyncStorage.getItem('deviceId');
    if (!deviceId) {
      console.warn('[NotificationService] 無 deviceId，無法發送推播給家屬');
      return;
    }
    // 帶上長輩身份與警示類型，讓家屬端能分辨屬於哪一位長輩、屬於哪一種警示
    const elderId = await AsyncStorage.getItem('backendElderId');
    const elderName = await getElderDisplayName();
    await sendFamilyNotification(deviceId, title, body, {
      elderId: elderId ?? '',
      elderName: elderName ?? '',
      type,
    });
    log('remote_fcm', `已送出推播：${title} — ${body}`);
  } catch (e) {
    console.warn('[NotificationService] 發送家屬推播失敗:', e);
  }
}

// ─── Settings helper ──────────────────────────────────────────────────────────

async function checkSetting(key: keyof NotificationSettings): Promise<boolean> {
  try {
    const s = await getNotificationSettings();
    return s[key];
  } catch {
    return true; // fail-open: send if settings unreadable
  }
}

// ─── Domain notification senders ──────────────────────────────────────────────

export function sendMorningCheckin(name: string, time: string, period: 1 | 2): void {
  const settingKey: keyof NotificationSettings =
    period === 1 ? 'morningActivity' : 'wakeUp';
  checkSetting(settingKey).then(ok => {
    if (!ok) return;
    const emoji = period === 1 ? '🌙' : '☀️';
    const body  = period === 1
      ? `${name} 今天 ${time} 有起來活動`
      : `${name} 今天 ${time} 起床了`;
    log('morning_checkin', `${emoji} ${body}`);
    localAlert(period === 1 ? '晨間活動' : '早安簽到', `${emoji} ${body}`, 'activity').catch(console.error);
  });
}

/**
 * Sends the fortune-viewed notification.
 * merged=true  → "🌅 [name] 今天 [wakeTime] 起床並看了今日運勢，心情很好 😊"
 * merged=false → "🌅 [name] 今天 [time] 看了今日運勢，心情很好 😊"
 */
export function sendFortuneCheckin(name: string, time: string, merged: boolean): void {
  checkSetting('fortuneViewed').then(ok => {
    if (!ok) return;
    const body = merged
      ? `${name} 今天 ${time} 起床並看了今日運勢，心情很好 😊`
      : `${name} 今天 ${time} 看了今日運勢，心情很好 😊`;
    log('fortune_viewed', `🌅 ${body}`);
    localAlert('今日運勢', `🌅 ${body}`, 'activity').catch(console.error);
  });
}

export function sendInactivityAlert(name: string, hours: number): void {
  checkSetting('inactivityAlert').then(ok => {
    if (!ok) return;
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    const body = `${name} 已 ${h} 小時 ${m} 分鐘未有任何活躍記錄`;
    log('inactivity', body);
    localAlert('不活躍警報', body, 'noCheckIn').catch(console.error);
  });
}

export function sendLowBatteryAlert(name: string, pct: number): void {
  checkSetting('lowBattery').then(ok => {
    if (!ok) return;
    const body = `🔋 ${name}手機電量僅剩 ${pct}%，請提醒他記得充電`;
    log('low_battery', body);
    localAlert('電量低警報', body, 'lowBattery').catch(console.error);
  });
}

export function sendStepAlert(name: string, steps: number): void {
  const body = `${name} 今日步數僅 ${steps.toLocaleString('zh-TW')} 步，活動量偏低`;
  log('step_alert', body);
  localAlert('步數偏低', body, 'activity').catch(console.error);
}

export function sendSOS(name: string, location: string): void {
  // SOS is always enabled — no settings check
  const body = `${name} 在「${location}」發出緊急求援！`;
  log('sos', body);
  localAlert('🆘 SOS 緊急求援', body, 'sos', true).catch(console.error);
}

export async function sendSOSImmediate(name: string, time: string): Promise<void> {
  log('sos_immediate', `🚨 ${name} 於 ${time} 按下求救按鈕`);
  await localAlert(
    '🆘 緊急求救',
    `🚨 緊急求救！\n${name} 於 ${time} 按下求救按鈕\n📍 正在取得位置中，請稍候...\n請立即撥打電話確認狀況`,
    'sos',
    true,
  );
}

export async function sendSOSWithLocation(
  name: string, lat: number, lng: number, accuracy: number,
): Promise<void> {
  log('sos_location', `📍 ${name} 位置已取得 ${lat},${lng} 精確度 ${accuracy}m`);
  await localAlert(
    '📍 位置已取得',
    `📍 ${name} 的即時位置已取得\nhttps://maps.google.com/?q=${lat},${lng}\n精確度：約 ${accuracy} 公尺`,
    'sos',
    true,
  );
}

export async function sendSOSNoLocation(name: string): Promise<void> {
  log('sos_no_location', `⚠️ ${name} 無法取得位置`);
  await localAlert(
    '⚠️ 無法取得位置',
    `⚠️ 無法取得 ${name} 的位置\n請立即撥打電話確認狀況`,
    'sos',
    true,
  );
}

export function sendFallDetected(name: string, location: string): void {
  const body = `偵測到 ${name} 在「${location}」可能發生跌倒！`;
  log('fall', body);
  localAlert('⚠️ 跌倒偵測警報', body, 'fall', true).catch(console.error);
}

export async function sendFallDetectedImmediate(name: string, time: string): Promise<void> {
  log('fall_immediate', `⚠️ ${name} 於 ${time} 偵測到異常衝擊`);
  await localAlert(
    '⚠️ 疑似跌倒！',
    `⚠️ 疑似跌倒！\n${name} 於 ${time} 偵測到異常衝擊\n📍 正在取得位置...\n請立即撥打電話確認狀況`,
    'fall',
    true,
  );
}

export async function sendFallDetectedWithLocation(
  name: string, lat: number, lng: number, accuracy: number,
): Promise<void> {
  log('fall_location', `📍 ${name} 跌倒位置已取得 ${lat},${lng}`);
  await localAlert(
    '📍 跌倒位置已取得',
    `📍 ${name} 的位置已取得\nhttps://maps.google.com/?q=${lat},${lng}\n精確度：約 ${accuracy} 公尺`,
    'fall',
    true,
  );
}

export async function sendFallDetectedNoLocation(name: string): Promise<void> {
  log('fall_no_location', `⚠️ ${name} 跌倒，無法取得位置`);
  await localAlert(
    '⚠️ 無法取得位置',
    `⚠️ 無法取得 ${name} 的位置\n請立即撥打電話確認狀況`,
    'fall',
    true,
  );
}

export async function sendFallSensitivityWarning(): Promise<void> {
  try {
    const name = await getElderDisplayName();
    log('fall_sensitivity', `⚠️ ${name} 今日誤報已達 3 次`);
    await localAlert(
      '跌倒偵測提醒',
      `⚠️ ${name} 今天已發生 3 次誤報\n建議調低跌倒偵測靈敏度以減少誤報`,
      'activity',
      false,
    );
  } catch {}
}

// 💊 Medication reminder (at scheduled time — always sent)
export function sendMedicationReminder(
  medName: string,
  time: string,
  contextLabel: string,
): void {
  const body = `${medName} 該服藥了！（${contextLabel} ${time}）`;
  log('medication_reminder', `💊 ${body}`);
  localAlert('💊 服藥提醒', body, 'medication').catch(console.error);
}

// ⚠️ Missed medication alert (2 hours overdue — respects settings)
export function sendMissedMedicine(
  name: string,
  scheduledTime: string,
  medName: string,
): void {
  checkSetting('missedMedicine').then(ok => {
    if (!ok) return;
    const body = `${name} 今天 ${scheduledTime} 的${medName}還沒服用`;
    log('missed_medicine', `⚠️ ${body}`);
    localAlert('服藥未完成提醒', `⚠️ ${body}`, 'medication').catch(console.error);
  });
}

// 🌙 Sleep-window missed medication bundle (sent at 07:00)
// 睡眠時段的服藥未打勾延遲到 07:00 通知
// 避免半夜打擾家屬
export function sendSleepWindowMissedBundle(
  elderName: string,
  missedMeds: {time: string; name: string}[],
): void {
  checkSetting('missedMedicine').then(ok => {
    if (!ok) return;
    const list = missedMeds.map(m => `• ${m.name}（${m.time}）`).join('\n');
    const body = `昨晚 ${elderName} 有藥物未確認服用：\n${list}\n請今天確認是否有服藥`;
    log('sleep_bundle', `⚠️ ${body}`);
    localAlert('⚠️ 昨晚服藥提醒', body, 'medication').catch(console.error);
  });
}

// Fortune interaction functions (sendDailyInteraction, getDailyInteractionState)
// live in MorningCheckinService to avoid circular imports.
