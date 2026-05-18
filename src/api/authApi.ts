import apiClient from './client';

// 登入或註冊
export const loginOrRegister = async (token: string) => {
  const response = await apiClient.post('/api/auth/login', {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

// 取得目前使用者資料
export const getMe = async () => {
  const response = await apiClient.get('/api/auth/me');
  return response.data;
};