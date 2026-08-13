import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AlertRecord {
  id: string;
  elderName: string;
  elderId?: string;
  type: 'sos' | 'noCheckIn' | 'lowBattery' | 'fall' | 'medication' | 'activity';
  title: string;
  message: string;
  time: string;
  resolved: boolean;
}

const KEY_ALERTS = 'family_alert_records';
const MAX_ALERTS = 50;

export function inferType(title: string): AlertRecord['type'] {
  const t = title.toLowerCase();
  if (t.includes('sos') || t.includes('求救') || t.includes('位置')) { return 'sos'; }
  if (t.includes('跌倒') || t.includes('跌落'))                       { return 'fall'; }
  if (t.includes('電量'))                                             { return 'lowBattery'; }
  if (t.includes('服藥') || t.includes('藥'))                         { return 'medication'; }
  if (t.includes('不活躍') || t.includes('未活動') || t.includes('活躍')) { return 'noCheckIn'; }
  // 晨間簽到、運勢、起床、分享等歸為活躍記錄
  return 'activity';
}

export async function loadAlerts(): Promise<AlertRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_ALERTS);
    return raw ? (JSON.parse(raw) as AlertRecord[]) : [];
  } catch {
    return [];
  }
}

export async function saveAlert(
  title: string,
  body: string,
  type: AlertRecord['type'],
  elderName?: string,
  elderId?: string,
): Promise<void> {
  const now = new Date();
  const timeStr =
    `${now.getMonth() + 1}/${now.getDate()} ` +
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const record: AlertRecord = {
    id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    elderName: elderName ?? '',
    elderId,
    type,
    title,
    message: body,
    time: timeStr,
    resolved: false,
  };
  const existing = await loadAlerts();
  const updated = [record, ...existing].slice(0, MAX_ALERTS);
  await AsyncStorage.setItem(KEY_ALERTS, JSON.stringify(updated));
}

export async function markAlertResolved(id: string): Promise<AlertRecord[]> {
  const existing = await loadAlerts();
  const updated = existing.map(a => (a.id === id ? {...a, resolved: true} : a));
  await AsyncStorage.setItem(KEY_ALERTS, JSON.stringify(updated));
  return updated;
}
