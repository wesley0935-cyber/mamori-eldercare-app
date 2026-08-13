import {PermissionsAndroid, Platform, NativeModules} from 'react-native';

const {FusedLocationModule} = NativeModules;

export interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: '位置權限',
        message: '緊急求援時需要取得您的位置，以便通知家屬您的所在地',
        buttonPositive: '允許',
        buttonNegative: '拒絕',
        buttonNeutral: '稍後再說',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export interface CancellableLocation {
  promise: Promise<LocationResult | null>;
  cancel: () => void;
}

export function startCurrentLocation(timeoutMs = 15_000): CancellableLocation {
  let cancelled = false;

  const promise = new Promise<LocationResult | null>(async resolve => {
    if (!FusedLocationModule) {
      console.warn('[LocationService] FusedLocationModule not available');
      resolve(null);
      return;
    }
    try {
      const result = await FusedLocationModule.getCurrentLocation(timeoutMs);
      if (cancelled) { resolve(null); return; }
      if (result) {
        resolve({
          latitude: result.latitude,
          longitude: result.longitude,
          accuracy: Math.round(result.accuracy),
        });
      } else {
        resolve(null);
      }
    } catch (e) {
      console.warn('[LocationService] FusedLocation error:', e);
      resolve(null);
    }
  });

  const cancel = () => { cancelled = true; };

  return {promise, cancel};
}

export function getCurrentLocation(timeoutMs = 15_000): Promise<LocationResult | null> {
  return startCurrentLocation(timeoutMs).promise;
}

export function toMapsUrl(loc: LocationResult): string {
  return `https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;
}
