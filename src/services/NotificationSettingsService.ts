import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NotificationSettings {
  morningActivity: boolean;  // 🌙 晨間活動
  wakeUp: boolean;           // ☀️ 起床
  fortuneViewed: boolean;    // 📰 看了運勢/新聞
  missedMedicine: boolean;   // 💊 服藥未打勾
  inactivityAlert: boolean;  // 📵 長時間未活躍
  lowBattery: boolean;       // 🔋 低電量
  // sos & fallDetected are always enabled — not stored
}

const SETTINGS_KEY = 'notification_settings';

const DEFAULTS: NotificationSettings = {
  morningActivity: true,
  wakeUp: true,
  fortuneViewed: true,
  missedMedicine: true,
  inactivityAlert: true,
  lowBattery: true,
};

export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) return {...DEFAULTS, ...JSON.parse(raw)};
  } catch {}
  return {...DEFAULTS};
}

export async function saveNotificationSettings(
  settings: NotificationSettings,
): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
