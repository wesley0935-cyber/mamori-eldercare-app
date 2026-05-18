import React, {useEffect} from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import {initFCM, setupForegroundHandler} from './src/services/NotificationService';
import {requestLocationPermission} from './src/services/LocationService';

export default function App() {
  useEffect(() => {
    initFCM().catch(console.error);
    requestLocationPermission().catch(console.error);
  }, []);

  useEffect(() => {
    return setupForegroundHandler();
  }, []);

  return <AppNavigator />;
}
