import React, {useRef, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  PermissionsAndroid,
  Platform,
  Linking,
  StatusBar,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee from '@notifee/react-native';

const SCREEN_W = Dimensions.get('window').width;

export const PERMISSION_GUIDE_KEY = 'permission_guide_shown';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:          '#EFEAD9',
  primary:     '#274A6E',
  orange:      '#C98520',
  sub:         '#7B7A6A',
  white:       '#FFFFFF',
  washi:       '#FFF8EC',
  dotInactive: '#C5BFA8',
};

// ─── Permission handlers ──────────────────────────────────────────────────────

async function requestLocation(): Promise<void> {
  if (Platform.OS !== 'android') {return;}
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title:          '位置權限',
      message:        '需要您的位置才能在緊急時通知家人',
      buttonPositive: '允許',
      buttonNegative: '拒絕',
    },
  );
  if (granted === PermissionsAndroid.RESULTS.GRANTED && Platform.Version >= 29) {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
      {
        title:          '永遠允許位置',
        message:        '請選擇「永遠允許」，這樣即使 APP 關閉也能傳送位置',
        buttonPositive: '前往設定',
        buttonNegative: '略過',
      },
    );
  }
}

async function requestNotification(): Promise<void> {
  if (Platform.OS !== 'android') {return;}
  if (Platform.Version >= 33) {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title:          '通知權限',
        message:        '服藥提醒和緊急警報需要通知權限',
        buttonPositive: '允許',
        buttonNegative: '拒絕',
      },
    );
  }
  try { await notifee.requestPermission(); } catch {}
}

async function requestActivity(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version < 29) {return;}
  await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
    {
      title:          '身體活動權限',
      message:        '讀取您的每日步數，讓家人了解您的活動狀況',
      buttonPositive: '允許',
      buttonNegative: '拒絕',
    },
  );
}

async function requestBatteryOpt(): Promise<void> {
  if (Platform.OS !== 'android') {return;}
  try {
    await Linking.sendIntent(
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      [{key: 'package', value: 'com.eldercareapp'}],
    );
  } catch {
    try {
      await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
    } catch {}
  }
}

// ─── Page definition ──────────────────────────────────────────────────────────

interface PageDef {
  icon:       string;
  title:      string;
  desc:       string;
  highlight?: string;
  btnLabel:   string;
  onGrant:    () => Promise<void>;
}

const PAGES: PageDef[] = [
  {
    icon:      '📍',
    title:     '允許取得您的位置',
    desc:      '當您按下 SOS 或偵測到跌倒時，系統會將您的即時位置傳送給家人，讓家人能快速找到您',
    highlight: '請選擇「永遠允許」，這樣即使 APP 關閉也能傳送位置',
    btnLabel:  '允許位置權限',
    onGrant:   requestLocation,
  },
  {
    icon:     '🔔',
    title:    '允許傳送通知',
    desc:     '服藥提醒、緊急警報都需要通知權限才能運作',
    btnLabel: '允許通知',
    onGrant:  requestNotification,
  },
  {
    icon:     '👟',
    title:    '允許讀取步數',
    desc:     '讀取您的每日步數，讓家人了解您的活動狀況',
    btnLabel: '允許讀取步數',
    onGrant:  requestActivity,
  },
  {
    icon:     '🔋',
    title:    '允許背景執行',
    desc:     '讓 APP 在背景持續運作，才能偵測您的活動狀態。如果不允許，家人可能無法收到您的狀態通知',
    btnLabel: '允許背景執行',
    onGrant:  requestBatteryOpt,
  },
];

const TOTAL = PAGES.length;

// ─── Progress dots ────────────────────────────────────────────────────────────

function Dots({current}: {current: number}) {
  return (
    <View style={s.dotsRow}>
      {PAGES.map((_, i) => (
        <View key={i} style={[s.dot, i === current ? s.dotActive : s.dotInactive]} />
      ))}
    </View>
  );
}

// ─── Permission page ──────────────────────────────────────────────────────────

interface PageViewProps {
  page:    PageDef;
  index:   number;
  onNext:  () => void;
  onSkip:  () => void;
}

function PageView({page, index, onNext, onSkip}: PageViewProps) {
  const [busy, setBusy] = useState(false);

  const handleGrant = async () => {
    if (busy) {return;}
    setBusy(true);
    try {
      await page.onGrant();
    } finally {
      setBusy(false);
    }
    onNext();
  };

  return (
    <View style={s.page}>
      <Dots current={index} />

      <View style={s.centerContent}>
        <Text style={s.icon}>{page.icon}</Text>
        <Text style={s.title}>{page.title}</Text>
        <Text style={s.desc}>{page.desc}</Text>
        {page.highlight ? (
          <View style={s.highlightBox}>
            <Text style={s.highlightText}>{page.highlight}</Text>
          </View>
        ) : null}
      </View>

      <View style={s.bottom}>
        <TouchableOpacity
          style={[s.btn, busy && s.btnBusy]}
          onPress={handleGrant}
          activeOpacity={0.8}
          disabled={busy}>
          <Text style={s.btnText}>{busy ? '請稍候…' : page.btnLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSkip}
          style={s.skipBtn}
          hitSlop={{top: 8, bottom: 8, left: 16, right: 8}}>
          <Text style={s.skipText}>跳過</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Completion page ──────────────────────────────────────────────────────────

function DonePage({onDone}: {onDone: () => void}) {
  return (
    <View style={s.page}>
      <View style={s.dotsRow} />
      <View style={s.centerContent}>
        <Text style={s.icon}>✅</Text>
        <Text style={s.title}>設定完成！</Text>
        <Text style={s.desc}>太好了！所有設定已完成，家人已經可以關心您了</Text>
      </View>
      <View style={s.bottom}>
        <TouchableOpacity style={s.btn} onPress={onDone} activeOpacity={0.8}>
          <Text style={s.btnText}>開始使用</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

interface Props {
  onComplete: () => void;
}

export default function PermissionGuideScreen({onComplete}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [current, setCurrent] = useState(0);

  const goTo = (i: number) => {
    const target = Math.min(Math.max(i, 0), TOTAL);
    scrollRef.current?.scrollTo({x: target * SCREEN_W, animated: true});
    setCurrent(target);
  };

  const handleDone = async () => {
    await AsyncStorage.setItem(PERMISSION_GUIDE_KEY, 'true');
    onComplete();
  };

  const handleScrollEnd = (e: {nativeEvent: {contentOffset: {x: number}}}) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setCurrent(page);
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
        {/* 引導說明文字（設定過程中始終可見） */}
        <View style={s.introBanner}>
          <Text style={s.introText}>
            請協助長輩完成以下權限設定，設定完成後即可使用
          </Text>
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
          style={s.scroll}
          contentContainerStyle={s.scrollContent}>
          {PAGES.map((page, i) => (
            <PageView
              key={page.icon}
              page={page}
              index={i}
              onNext={() => goTo(i + 1)}
              onSkip={() => goTo(i + 1)}
            />
          ))}
          <DonePage onDone={handleDone} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  safeArea: {
    flex: 1,
  },
  introBanner: {
    backgroundColor: C.washi,
    borderBottomWidth: 1,
    borderBottomColor: '#DCD3B8',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  introText: {
    fontSize: 14,
    color: C.sub,
    textAlign: 'center',
    lineHeight: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'stretch', // 讓每頁撐滿 ScrollView 高度
  },

  // 每一頁
  page: {
    width: SCREEN_W,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 36,
    justifyContent: 'space-between',
  },

  // 進度點
  dotsRow: {
    flexDirection:  'row',
    justifyContent: 'center',
    alignItems:     'center',
    gap:            8,
    height:         32,
  },
  dot: {
    borderRadius: 5,
  },
  dotActive: {
    width:           10,
    height:          10,
    backgroundColor: C.primary,
  },
  dotInactive: {
    width:           7,
    height:          7,
    backgroundColor: C.dotInactive,
  },

  // 中央內容區
  centerContent: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            16,
    paddingVertical: 16,
  },
  icon: {
    fontSize:  80,
    lineHeight: 96,
    textAlign: 'center',
  },
  title: {
    fontSize:    22,
    fontWeight:  '700',
    color:       C.primary,
    textAlign:   'center',
    letterSpacing: 0.5,
  },
  desc: {
    fontSize:        16,
    color:           C.sub,
    textAlign:       'center',
    lineHeight:      25,
    paddingHorizontal: 8,
  },
  highlightBox: {
    borderWidth:       1.5,
    borderColor:       C.orange,
    backgroundColor:   C.washi,
    borderRadius:      10,
    paddingVertical:   12,
    paddingHorizontal: 16,
    marginTop:         4,
  },
  highlightText: {
    fontSize:   15,
    color:      C.orange,
    textAlign:  'center',
    lineHeight: 22,
    fontWeight: '600',
  },

  // 底部操作區
  bottom: {
    gap: 4,
  },
  btn: {
    backgroundColor: C.primary,
    borderRadius:    10,
    height:          48,
    alignItems:      'center',
    justifyContent:  'center',
  },
  btnBusy: {
    opacity: 0.55,
  },
  btnText: {
    color:         C.white,
    fontSize:      17,
    fontWeight:    '700',
    letterSpacing: 0.5,
  },
  skipBtn: {
    alignSelf:       'flex-end',
    paddingVertical: 8,
    paddingLeft:     16,
  },
  skipText: {
    fontSize: 14,
    color:    C.sub,
  },
});
