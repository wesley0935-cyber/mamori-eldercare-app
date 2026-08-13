import apiClient from './client';

// 儲存長輩裝置 FCM Token
export const registerFcmToken = async (deviceId: string, fcmToken: string) => {
  const response = await apiClient.post('/api/notification/token', {
    deviceId,
    fcmToken,
  });
  return response.data;
};

// 儲存家屬裝置 FCM Token（配對完成後呼叫）
export const registerFamilyFcmToken = async (pairingId: string, fcmToken: string) => {
  const response = await apiClient.post('/api/notification/family-token', {
    pairingId,
    fcmToken,
  });
  return response.data;
};

// 由長輩端觸發，透過後端 FCM 推播通知給所有已配對家屬
export const sendFamilyNotification = async (
  elderDeviceId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
) => {
  const response = await apiClient.post('/api/notification/send', {
    elderDeviceId,
    title,
    body,
    data: data ?? {},
  });
  return response.data;
};