import {NativeModules, NativeEventEmitter, Platform, PermissionsAndroid} from 'react-native';
import {
  getSdkStatus,
  initialize,
  requestPermission,
  readRecords,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

const {StepCounterModule} = NativeModules;
const PROVIDER_PKG = 'com.google.android.apps.healthdata';

async function requestActivityRecognition(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
    );
  } catch {}
}

async function initHealthConnect(): Promise<boolean> {
  try {
    const status = await getSdkStatus(PROVIDER_PKG);
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) return false;
    return await initialize(PROVIDER_PKG);
  } catch {
    return false;
  }
}

export async function readLastNightSleep(): Promise<number | null> {
  try {
    const ready = await initHealthConnect();
    if (!ready) return null;
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(18, 0, 0, 0);
    const result = await readRecords('SleepSession', {
      timeRangeFilter: {
        operator: 'between',
        startTime: yesterday.toISOString(),
        endTime: now.toISOString(),
      },
    });
    let totalMs = 0;
    for (const session of (result as any).records ?? []) {
      const start = new Date(session.startTime).getTime();
      const end = new Date(session.endTime).getTime();
      if (!isNaN(start) && !isNaN(end) && end > start) totalMs += end - start;
    }
    return Math.round((totalMs / 3_600_000) * 10) / 10;
  } catch {
    return null;
  }
}

export async function requestHealthPermissions(): Promise<void> {
  try {
    const ready = await initHealthConnect();
    if (!ready) return;
    await requestPermission([{accessType: 'read', recordType: 'SleepSession'}]);
  } catch {}
}

export async function readTodayStepsOnce(): Promise<number | null> {
  return null;
}

export interface StepListenerResult {
  isMock: boolean;
  stop: () => void;
}

export async function startStepListener(
  onUpdate: (steps: number, isMock: boolean) => void,
): Promise<StepListenerResult> {
  await requestActivityRecognition();

  if (!StepCounterModule) {
    console.warn('[HealthService] StepCounterModule not available');
    onUpdate(0, true);
    const id = setInterval(() => onUpdate(0, true), 60_000);
    return {isMock: true, stop: () => clearInterval(id)};
  }

  const emitter = new NativeEventEmitter(StepCounterModule);
  const subscription = emitter.addListener('StepCounterUpdate', (data: {steps: number}) => {
    console.log('[HealthService] StepCounterUpdate received:', data.steps);
    onUpdate(data.steps, false);
  });

  StepCounterModule.startListening();

  return {
    isMock: false,
    stop: () => {
      subscription.remove();
      StepCounterModule.stopListening();
    },
  };
}
