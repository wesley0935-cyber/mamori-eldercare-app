/**
 * @format
 */

import 'react-native-gesture-handler';
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import notifee, {EventType} from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import {saveAlert, inferType} from './src/services/AlertStorageService';

// FCM 背景訊息處理器（APP 在背景或已關閉時收到推播）
try {
  messaging().setBackgroundMessageHandler(async remoteMessage => {
    const title = remoteMessage.notification?.title ?? '';
    const body = remoteMessage.notification?.body ?? '';
    if (title) {
      await saveAlert(
        title,
        body,
        remoteMessage.data?.type || inferType(title),
        remoteMessage.data?.elderName,
        remoteMessage.data?.elderId,
      ).catch(console.error);
    }
  });
} catch (e) {
  console.error('[index.js] Firebase background handler setup failed:', e);
}

notifee.onBackgroundEvent(async ({type, detail}) => {
  if (type === EventType.PRESS) {
    console.log('[Notifee] Background notification pressed:', detail.notification?.id);
  }
});

AppRegistry.registerComponent(appName, () => App);
