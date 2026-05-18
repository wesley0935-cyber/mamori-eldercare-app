import apiClient from './client';

// 儲存裝置 FCM Token
export const registerFcmToken = async (deviceId: string, fcmToken: string) => {
  const response = await apiClient.post('/api/notification/token', {
    deviceId,
    fcmToken,
  });
  return response.data;
};