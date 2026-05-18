import {
  getSdkStatus,
  initialize,
  requestPermission,
  aggregateRecord,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

const PROVIDER_PKG = 'com.google.android.apps.healthdata';

async function initHealthConnect(): Promise<boolean> {
  try {
    const status = await getSdkStatus(PROVIDER_PKG);
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
      return false;
    }
    return await initialize(PROVIDER_PKG);
  } catch {
    return false;
  }
}

async function requestStepPermission(): Promise<boolean> {
  try {
    const granted = await requestPermission([
      {accessType: 'read', recordType: 'Steps'},
    ]);
    return granted.some(
      p => p.recordType === 'Steps' && p.accessType === 'read',
    );
  } catch {
    return false;
  }
}

async function readTodaySteps(): Promise<number> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const result = (await aggregateRecord({
    recordType: 'Steps',
    timeRangeFilter: {
      operator: 'between',
      startTime: startOfDay.toISOString(),
      endTime: now.toISOString(),
    },
  })) as {COUNT_TOTAL?: number};
  return result.COUNT_TOTAL ?? 0;
}

function mockSteps(): number {
  // ~25% chance of a below-goal result so the low-step warning can be tested on simulator
  if (Math.random() < 0.25) {
    return Math.floor(Math.random() * 2800) + 200; // 200~2999
  }
  return Math.floor(Math.random() * 5001) + 3000; // 3000~8000
}

export interface StepListenerResult {
  isMock: boolean;
  stop: () => void;
}

/**
 * 嘗試使用 Health Connect；不可用時自動切換 Mock 模式。
 * 每 60 秒回呼一次步數，並告知是否為模擬數據。
 */
export async function startStepListener(
  onUpdate: (steps: number, isMock: boolean) => void,
): Promise<StepListenerResult> {
  const ready = await initHealthConnect();
  if (ready) {
    const permitted = await requestStepPermission();
    if (permitted) {
      // 真實模式
      const fetch = () =>
        readTodaySteps()
          .then(s => onUpdate(s, false))
          .catch(() => onUpdate(0, false));
      fetch();
      const id = setInterval(fetch, 60_000);
      return {isMock: false, stop: () => clearInterval(id)};
    }
  }

  // Mock 模式
  const fetch = () => onUpdate(mockSteps(), true);
  fetch();
  const id = setInterval(fetch, 60_000);
  return {isMock: true, stop: () => clearInterval(id)};
}
