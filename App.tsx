import React, {useEffect} from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import {initFCM, setupForegroundHandler} from './src/services/NotificationService';
import {requestLocationPermission} from './src/services/LocationService';
import {saveAlert, inferType, type AlertRecord} from './src/services/AlertStorageService';

console.log('[App] App.tsx loaded at ' + new Date().toISOString());

export default function App() {
  useEffect(() => {
    initFCM().catch(console.error);
    requestLocationPermission().catch(console.error);
  }, []);

  useEffect(() => {
    return setupForegroundHandler();
  }, []);

  // 攔截所有 FCM 推播（前景 + 點擊通知開啟 APP）並持久化為警示記錄
  useEffect(() => {
    try {
      const msg = require('@react-native-firebase/messaging').default;

      const unsubForeground = msg().onMessage(async (remote: any) => {
        const title = remote.notification?.title ?? '';
        const body = remote.notification?.body ?? '';
        if (title) {
          await saveAlert(
            title,
            body,
            (remote.data?.type as AlertRecord['type']) ?? inferType(title),
            remote.data?.elderName as string | undefined,
            remote.data?.elderId as string | undefined,
          ).catch(console.error);
        }
      });

      const unsubOpened = msg().onNotificationOpenedApp(async (remote: any) => {
        const title = remote.notification?.title ?? '';
        const body = remote.notification?.body ?? '';
        if (title) {
          await saveAlert(
            title,
            body,
            (remote.data?.type as AlertRecord['type']) ?? inferType(title),
            remote.data?.elderName as string | undefined,
            remote.data?.elderId as string | undefined,
          ).catch(console.error);
        }
        // 若推播內含 Google Maps 連結，直接開啟地圖
        const mapsMatch = body.match(/https:\/\/maps\.google\.com\/\?q=[\d.,\-]+/);
        if (mapsMatch) {
          const {Linking} = require('react-native');
          Linking.openURL(mapsMatch[0]).catch(console.error);
        }
      });

      msg().getInitialNotification().then(async (remote: any) => {
        if (remote) {
          const title = remote.notification?.title ?? '';
          const body = remote.notification?.body ?? '';
          if (title) {
            await saveAlert(
              title,
              body,
              (remote.data?.type as AlertRecord['type']) ?? inferType(title),
              remote.data?.elderName as string | undefined,
              remote.data?.elderId as string | undefined,
            ).catch(console.error);
          }
          // 若推播內含 Google Maps 連結，直接開啟地圖
          const mapsMatch = body.match(/https:\/\/maps\.google\.com\/\?q=[\d.,\-]+/);
          if (mapsMatch) {
            const {Linking} = require('react-native');
            Linking.openURL(mapsMatch[0]).catch(console.error);
          }
        }
      });

      return () => { unsubForeground(); unsubOpened(); };
    } catch {
      return undefined;
    }
  }, []);

  return <AppNavigator />;
}
