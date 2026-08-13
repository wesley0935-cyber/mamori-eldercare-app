import apiClient from './client';

export interface StepRecord {
  id: string;
  elderId: string;
  date: string;       // "YYYY-MM-DD"
  steps: number;
  sleepHours: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 長輩端：上傳今日步數與昨夜睡眠到後端。
 * 以 elderDeviceId（裝置唯一識別碼）鑑別身份。
 */
export const uploadStepData = async (
  elderDeviceId: string,
  date: string,
  steps: number,
  sleepHours: number,
): Promise<any> => {
  const res = await apiClient.post(`/api/steps/${elderDeviceId}`, {
    date,
    steps,
    sleepHours,
  });
  return res.data;
};

/**
 * 家屬端：取得指定長輩的步數趨勢。
 * @param elderId 後端 Elder UUID（backendElderId）
 * @param days 取最近幾天的資料（1-31，預設 7）
 */
export const getStepTrend = async (
  elderId: string,
  days: number = 7,
): Promise<StepRecord[]> => {
  try {
    const res = await apiClient.get(`/api/steps/${elderId}`, {
      params: { days, _t: Date.now() },
      headers: {'Cache-Control': 'no-cache'},
    });
    return res.data?.records ?? [];
  } catch (e) {
    console.warn('[stepsApi] getStepTrend failed:', e);
    return [];
  }
};
