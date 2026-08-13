import React, {useState, useRef, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import type {NavigationContainerRef} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import LinearGradient from 'react-native-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ElderHomeScreen from '../screens/elder/ElderHomeScreen';
import FamilyDashboard from '../screens/family/FamilyDashboard';
import FamilyLoginScreen from '../screens/family/FamilyLoginScreen';
import MedicineManagementScreen from '../screens/family/MedicineManagementScreen';
import SettingsScreen from '../screens/family/SettingsScreen';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import PermissionGuideScreen, {PERMISSION_GUIDE_KEY} from '../screens/onboarding/PermissionGuideScreen';
import ThresholdSettingsScreen from '../screens/family/ThresholdSettingsScreen';
import EmergencyContactScreen from '../screens/family/EmergencyContactScreen';
import {getAppRole, type AppRole} from '../services/ProfileService';
import {AppContext} from '../context/AppContext';

export type RootStackParamList = {
  ElderHome: undefined;
  FamilyLogin: undefined;
  FamilyDashboard: undefined;
  MedicineManagement: undefined;
  Settings: undefined;
  ThresholdSettings: undefined;
  EmergencyContact: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

const C = {
  bg:          '#EFEAD9',
  headerStart: '#FAF6E8',
  headerEnd:   '#EFEAD9',
  border:      '#DCD3B8',
  primary:     '#274A6E',
  ink:         '#1F2A3A',
  sub:         '#7B7A6A',
  washi:       '#FFF8EC',
};

function LogoMark() {
  return (
    <View style={s.logoCircle}>
      <Text style={s.logoChar}>守</Text>
    </View>
  );
}

export default function AppNavigator() {
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const [familyToken, setFamilyToken] = useState<string | null>(null);
  const navReady = useRef(false);
  const [appRole, setAppRoleState] = useState<AppRole | 'onboarding' | null>(null);
  const [showPermGuide, setShowPermGuide] = useState(false);
  const [pendingRole, setPendingRole] = useState<AppRole | null>(null);

  useEffect(() => {
    async function init() {
      const role = await getAppRole();
      const token = await AsyncStorage.getItem('familyToken');
      setFamilyToken(token);
      const guideShown = await AsyncStorage.getItem(PERMISSION_GUIDE_KEY);
      if (role === null) {
        setAppRoleState('onboarding');
      } else if (!guideShown && role !== 'family') {
        setPendingRole(role);
        setShowPermGuide(true);
      } else {
        setAppRoleState(role);
      }
    }
    init();
  }, []);

  const handleOnboardingComplete = async () => {
    const role = await getAppRole();
    if (!role) {return;}
    // 家屬端配對完成後直接進入主畫面，不強制顯示權限引導
    // onboarding 期間已完成 Google 登入，重讀 familyToken 讓其直接進儀表板
    if (role === 'family') {
      const token = await AsyncStorage.getItem('familyToken');
      setFamilyToken(token);
      setAppRoleState(role);
      return;
    }
    const guideShown = await AsyncStorage.getItem(PERMISSION_GUIDE_KEY);
    if (!guideShown) {
      setPendingRole(role);
      setShowPermGuide(true);
    } else {
      setAppRoleState(role);
    }
  };

  const handlePermGuideComplete = () => {
    if (pendingRole) {
      setAppRoleState(pendingRole);
      setPendingRole(null);
    }
    setShowPermGuide(false);
  };

  const resetApp = () => {
    setAppRoleState('onboarding');
  };

  const logoutFamily = () => {
    setFamilyToken(null);
    if (navReady.current && navRef.current) {
      navRef.current.reset({
        index: 0,
        routes: [{name: 'FamilyLogin'}],
      });
    }
  };

  const showPermissionGuide = async () => {
    await AsyncStorage.removeItem(PERMISSION_GUIDE_KEY);
    const currentRole = appRole && appRole !== 'onboarding' ? (appRole as AppRole) : pendingRole;
    if (currentRole) {setPendingRole(currentRole);}
    setShowPermGuide(true);
  };

  if (appRole === null && !showPermGuide) {return null;}

  if (showPermGuide) {
    return (
      <AppContext.Provider value={{resetApp, showPermissionGuide, logoutFamily}}>
        <GestureHandlerRootView style={s.gestureRoot}>
          <SafeAreaProvider>
            <PermissionGuideScreen onComplete={handlePermGuideComplete} />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </AppContext.Provider>
    );
  }

  if (appRole === 'onboarding') {
    return (
      <AppContext.Provider value={{resetApp, showPermissionGuide, logoutFamily}}>
        <GestureHandlerRootView style={s.gestureRoot}>
          <SafeAreaProvider>
            <StatusBar barStyle="dark-content" backgroundColor={C.headerStart} />
            <OnboardingScreen onComplete={handleOnboardingComplete} />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </AppContext.Provider>
    );
  }

  const handleLoginSuccess = () => {
    setFamilyToken('logged_in');
    if (navReady.current && navRef.current) {
      navRef.current.reset({
        index: 0,
        routes: [{name: 'FamilyDashboard'}],
      });
    }
  };

  return (
    <AppContext.Provider value={{resetApp, showPermissionGuide, logoutFamily}}>
      <GestureHandlerRootView style={s.gestureRoot}>
        <SafeAreaProvider>
          <StatusBar barStyle="dark-content" backgroundColor={C.headerStart} />
          <SafeAreaView style={s.safeArea} edges={['top']}>
            <LinearGradient colors={[C.headerStart, C.headerEnd]} style={s.header}>
              <View style={s.brandRow}>
                <LogoMark />
                <View style={s.brandText}>
                  <Text style={s.brandName}>默伴守護</Text>
                  <Text style={s.brandSub}>MAMORI · まもり</Text>
                </View>
              </View>
            </LinearGradient>
          </SafeAreaView>

          <NavigationContainer ref={navRef} onReady={() => { navReady.current = true; }}>
            <Stack.Navigator
              screenOptions={{headerShown: false}}
              initialRouteName={
                appRole === 'family' ? (familyToken ? 'FamilyDashboard' : 'FamilyLogin') : 'ElderHome'
              }>
              <Stack.Screen name="ElderHome" component={ElderHomeScreen} />
              <Stack.Screen
                name="FamilyLogin"
                children={() => <FamilyLoginScreen onLoginSuccess={handleLoginSuccess} />}
              />
              <Stack.Screen name="FamilyDashboard" component={FamilyDashboard} />
              <Stack.Screen name="MedicineManagement" component={MedicineManagementScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="ThresholdSettings" component={ThresholdSettingsScreen} />
              <Stack.Screen name="EmergencyContact" component={EmergencyContactScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppContext.Provider>
  );
}

const s = StyleSheet.create({
  gestureRoot: {flex: 1},
  safeArea:    {backgroundColor: C.headerStart},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  brandRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  logoCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{rotate: '-4deg'}],
    shadowColor: C.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  logoChar: {color: C.washi, fontSize: 18, fontWeight: '900'},
  brandText: {flexDirection: 'column'},
  brandName: {color: C.ink, fontSize: 20, fontWeight: '700', letterSpacing: 3, lineHeight: 24},
  brandSub: {color: C.sub, fontSize: 9, letterSpacing: 0.5, lineHeight: 13},
});
