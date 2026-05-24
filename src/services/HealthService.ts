import {
  getSdkStatus,
  initialize,
  requestPermission,
  aggregateRecord,
  readRecords,
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
    // 同時申請步數與睡眠權限，一次完成授權流程
    const granted = await requestPermission([
      {accessType: 'read', recordType: 'Steps'},
      {accessType: 'read', recordType: 'SleepSession'},
    ]);
    return granted.some(
      p => p.recordType === 'Steps' && p.accessType === 'read',
    );
  } catch {
    return false;
  }
}

/**
 * 讀取昨夜睡眠時數（從昨天 18:00 到現在）。
 * Health Connect 可用時回傳小時數（取一位小數，有效值含 0）；
 * 不可用或發生例外時回傳 null，UI 顯示 -- 而非 0。
 */
export async function readLastNightSleep(): Promise<number | null> {
  try {
    const ready = await initHealthConnect();
    if (!ready) return null;   // HC 不可用 → null（UI 顯示 --）

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(18, 0, 0, 0); // 從昨天傍晚 18:00 開始算

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
      const end   = new Date(session.endTime).getTime();
      if (!isNaN(start) && !isNaN(end) && end > start) {
        totalMs += end - start;
      }
    }
    // HC 可用但無睡眠記錄 → 0（真實 0 小時，仍上傳）
    return Math.round((totalMs / 3_600_000) * 10) / 10;
  } catch {
    return null;   // 例外 → null（UI 顯示 --，不上傳）
  }
}

/**
 * 一次性讀取今日步數（不啟動輪詢）。
 * Health Connect 可用時回傳步數（含 0）；不可用或權限未授權時回傳 null。
 */
export async function readTodayStepsOnce(): Promise<number | null> {
  try {
    const ready = await initHealthConnect();
    if (!ready) return null;
    const permitted = await requestStepPermission();
    if (!permitted) return null;
    return await readTodaySteps();
  } catch {
    return null;
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
