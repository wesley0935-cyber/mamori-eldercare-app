import AsyncStorage from '@react-native-async-storage/async-storage';

export type FallDetectionSensitivity = 'low' | 'medium' | 'high';

export interface ThresholdSettings {
  inactivityHours: 2 | 4 | 6 | 8;
  stepGoal: 1000 | 3000 | 5000 | 8000;
  lowBatteryPct: 10 | 15 | 20 | 25;
  missedMedicineHours: 1 | 2 | 3;
  sleepStartHour: number; // 0–23
  sleepEndHour: number;   // 0–23
  fallDetectionSensitivity: FallDetectionSensitivity;
}

const KEY = 'threshold_settings';

export const THRESHOLD_DEFAULTS: ThresholdSettings = {
  inactivityHours: 4,
  stepGoal: 3000,
  lowBatteryPct: 15,
  missedMedicineHours: 2,
  sleepStartHour: 23,
  sleepEndHour: 7,
  fallDetectionSensitivity: 'low',
};

export async function getThresholdSettings(): Promise<ThresholdSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {...THRESHOLD_DEFAULTS};
    return {...THRESHOLD_DEFAULTS, ...JSON.parse(raw)} as ThresholdSettings;
  } catch {
    return {...THRESHOLD_DEFAULTS};
  }
}

export async function saveThresholdSettings(
  settings: ThresholdSettings,
): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}
