import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

const KEY_DEVICE_ID = 'deviceId';

/**
 * 取得（或首次建立）裝置唯一 ID。
 *
 * - 先讀 AsyncStorage 的 'deviceId'
 * - 讀不到就用 DeviceInfo.getUniqueId() 產生並存回
 * - 回傳該值
 *
 * 失敗時直接 throw（不靜默回 'unknown'），讓呼叫端能察覺並正確處理，
 * 避免把 'unknown' 當成真實 deviceId 送到後端造成資料對不上。
 */
export async function getOrCreateDeviceId(): Promise<string> {
  try {
    let deviceId = await AsyncStorage.getItem(KEY_DEVICE_ID);
    if (!deviceId) {
      deviceId = await DeviceInfo.getUniqueId();
      await AsyncStorage.setItem(KEY_DEVICE_ID, deviceId);
    }
    return deviceId;
  } catch (e) {
    throw new Error(
      `[getOrCreateDeviceId] 無法取得裝置 ID: ${(e as Error)?.message ?? String(e)}`,
    );
  }
}
