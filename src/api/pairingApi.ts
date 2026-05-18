import apiClient from './client';

// 產生配對碼（家屬用）
export const generatePairingCode = async () => {
  const response = await apiClient.post('/api/pairing/generate');
  return response.data;
};

// 長輩確認配對碼
export const confirmPairing = async (code: string, deviceId: string) => {
  const response = await apiClient.post('/api/pairing/confirm', {
    code,
    deviceId,
  });
  return response.data;
};

// 取得家屬綁定的長輩清單
export const getElders = async () => {
  const response = await apiClient.get('/api/pairing/elders');
  return response.data;
};