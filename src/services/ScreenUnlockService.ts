import {
  NativeModules,
  NativeEventEmitter,
  Platform,
  type EmitterSubscription,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {checkAndSend} from './MorningCheckinService';

const {ScreenUnlockModule} = NativeModules;

export interface UnlockEvent {
  type: 'unlock' | 'screen_off';
  timestamp: number;
}

const STORAGE_PREFIX = 'unlock_history_';

const emitter =
  Platform.OS === 'android' && ScreenUnlockModule
    ? new NativeEventEmitter(ScreenUnlockModule)
    : null;

function todayStorageKey(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${STORAGE_PREFIX}${d.getFullYear()}-${mm}-${dd}`;
}

async function persistEvent(event: UnlockEvent): Promise<void> {
  try {
    const key = todayStorageKey();
    const raw = await AsyncStorage.getItem(key);
    const history: UnlockEvent[] = raw ? JSON.parse(raw) : [];
    history.push(event);
    await AsyncStorage.setItem(key, JSON.stringify(history));
  } catch {}
}

/**
 * Merges native SharedPreferences history with AsyncStorage.
 * Native is source of truth; local fills any gap.
 */
export async function getTodayUnlockLog(): Promise<UnlockEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(todayStorageKey());
    const local: UnlockEvent[] = raw ? JSON.parse(raw) : [];

    if (Platform.OS === 'android' && ScreenUnlockModule) {
      const native: UnlockEvent[] = await ScreenUnlockModule.getUnlockHistory();
      const nativeSet = new Set(native.map(e => e.timestamp));
      const extras = local.filter(e => !nativeSet.has(e.timestamp));
      return [...native, ...extras].sort((a, b) => a.timestamp - b.timestamp);
    }
    return local;
  } catch {
    return [];
  }
}

/** Returns "HH:MM" of the last unlock today, or '--:--' if none. */
export async function getLastUnlockTime(): Promise<string> {
  const log = await getTodayUnlockLog();
  const unlocks = log.filter(e => e.type === 'unlock');
  if (unlocks.length === 0) return '--:--';
  const last = unlocks[unlocks.length - 1];
  const d = new Date(last.timestamp);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

/**
 * Starts the Android foreground service and subscribes to native unlock events.
 * Returns a cleanup function that stops the service and removes the listener.
 * No-op on iOS.
 *
 * @param onEvent Optional callback fired on each unlock / screen-off event.
 */
export function startScreenUnlockService(
  onEvent?: (event: UnlockEvent) => void,
): () => void {
  if (Platform.OS !== 'android' || !ScreenUnlockModule || !emitter) {
    return () => {};
  }

  ScreenUnlockModule.startService();

  const sub: EmitterSubscription = emitter.addListener(
    'ScreenUnlockEvent',
    (event: UnlockEvent) => {
      persistEvent(event);
      if (event.type === 'unlock') {
        // checkAndSend writes to storage first; onEvent fires after so the UI
        // reads an already-updated state when it calls getDailyCheckinState().
        checkAndSend()
          .catch(console.error)
          .finally(() => onEvent?.(event));
      } else {
        onEvent?.(event);
      }
    },
  );

  return () => {
    sub.remove();
    ScreenUnlockModule.stopService();
  };
}
