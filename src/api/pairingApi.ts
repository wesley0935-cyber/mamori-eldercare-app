import apiClient from './client';

// 長輩端產生配對碼
export const generatePairingCode = async (params: {
  elderName: string;
  elderAge: number;
  deviceId: string;
}) => {
  const response = await apiClient.post('/api/pairing/generate', params);
  return response.data;
};

// 家屬端輸入配對碼完成配對
// elderDeviceId：長輩端呼叫時傳入，後端用以更新 Elder.deviceId
export const confirmPairing = async (code: string, elderDeviceId?: string) => {
  const body: Record<string, string> = { code };
  if (elderDeviceId) { body.elderDeviceId = elderDeviceId; }
  const response = await apiClient.post('/api/pairing/confirm', body);
  return response.data;
};
