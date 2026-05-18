import {PermissionsAndroid, Platform} from 'react-native';

export interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
}

// ─── Typed wrapper for navigator.geolocation (no extra package needed) ────────

interface GeoPos {
  coords: {latitude: number; longitude: number; accuracy: number};
}
type GeoSuccess = (p: GeoPos) => void;
type GeoError   = (e: {code: number; message: string}) => void;
interface GeoOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}
interface GeoAPI {
  getCurrentPosition(s: GeoSuccess, e?: GeoError, o?: GeoOptions): void;
  watchPosition(s: GeoSuccess, e?: GeoError, o?: GeoOptions): number;
  clearWatch(id: number): void;
}

function geoAPI(): GeoAPI | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any)?.navigator?.geolocation ?? null;
}

// ─── Cancellable location request ─────────────────────────────────────────────

export interface CancellableLocation {
  promise: Promise<LocationResult | null>;
  /** 取消 SOS 時必須停止 GPS 取得，避免浪費電量和隱私疑慮 */
  cancel: () => void;
}

// ─── Runtime permission ───────────────────────────────────────────────────────

/**
 * Requests ACCESS_FINE_LOCATION at runtime on Android.
 * On iOS (or if already granted) returns true immediately.
 */
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
        buttonNeutral:  '稍後再說',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

// ─── Get current location ─────────────────────────────────────────────────────

/**
 * Starts a GPS location request that can be cancelled.
 *
 * Uses watchPosition internally so clearWatch() stops the hardware immediately.
 * GPS auto-stops after the first fix, on timeout, or when cancel() is called.
 *
 * 取消 SOS 時必須停止 GPS 取得
 * 避免浪費電量和隱私疑慮
 */
export function startCurrentLocation(timeoutMs = 10_000): CancellableLocation {
  const geo = geoAPI();
  let watchId: number | null = null;
  let settled = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  // 取消 SOS 時必須停止 GPS 取得
  // 避免浪費電量和隱私疑慮
  const stop = () => {
    if (timeoutHandle !== null) { clearTimeout(timeoutHandle); timeoutHandle = null; }
    if (watchId !== null && geo) { geo.clearWatch(watchId); watchId = null; }
  };

  const promise = new Promise<LocationResult | null>(resolve => {
    if (!geo) {
      console.warn('[LocationService] navigator.geolocation not available');
      resolve(null);
      return;
    }

    timeoutHandle = setTimeout(() => {
      if (!settled) { settled = true; stop(); resolve(null); }
    }, timeoutMs);

    watchId = geo.watchPosition(
      pos => {
        if (!settled) {
          settled = true;
          stop();
          resolve({
            latitude:  pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy:  Math.round(pos.coords.accuracy),
          });
        }
      },
      err => {
        if (!settled) {
          settled = true;
          stop();
          console.warn('[LocationService] GPS error:', err.code, err.message);
          resolve(null);
        }
      },
      {enableHighAccuracy: true, maximumAge: 0},
    );
  });

  const cancel = () => {
    if (!settled) {
      // 取消 SOS 時必須停止 GPS 取得
      // 避免浪費電量和隱私疑慮
      settled = true;
      stop();
    }
  };

  return {promise, cancel};
}

/**
 * Resolves with the device's current GPS coordinates, or null on timeout / error.
 * Use startCurrentLocation() if you need to cancel mid-flight.
 */
export function getCurrentLocation(
  timeoutMs = 10_000,
): Promise<LocationResult | null> {
  return startCurrentLocation(timeoutMs).promise;
}

/**
 * Formats a LocationResult into a Google Maps URL.
 */
export function toMapsUrl(loc: LocationResult): string {
  return `https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;
}
