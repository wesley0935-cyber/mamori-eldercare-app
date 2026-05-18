import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  StatusBar,
  ActivityIndicator,
  Linking,
  Modal,
  Share,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useBatteryLevel} from 'react-native-device-info';
import {startStepListener} from '../../services/HealthService';
import {startBatteryMonitor} from '../../services/BatteryService';
import {
  startScreenUnlockService,
  getLastUnlockTime,
} from '../../services/ScreenUnlockService';
import {
  startActivityDetection,
  notifyStepsUpdated,
  resume as resumeActivityDetection,
  updateLastActive as markActivityAsActive,
} from '../../services/ActivityDetectionService';
import {
  generateFortune,
  fetchTodayNews,
  type FortuneData,
  type NewsItem,
} from '../../services/DailyFortuneNewsService';
import {
  getMedications,
  getDailyTakenState,
  getEffectiveTakenState,
  PERIOD_LABELS,
  type Medication,
  type DailyTakenState,
} from '../../services/MedicationStorageService';
import {
  startMedicationReminder,
  confirmMedicationTaken,
} from '../../services/MedicationReminderService';
import {
  sendSOSImmediate,
  sendSOSWithLocation,
  sendSOSNoLocation,
  sendFallDetectedImmediate,
  sendFallDetectedWithLocation,
  sendFallDetectedNoLocation,
} from '../../services/NotificationService';
import {
  sendDailyInteraction,
  getDailyInteractionState,
} from '../../services/MorningCheckinService';
import {
  startFallDetection,
  isFallDetectionAvailable,
  isFallSleepMode,
  recordFalseAlarm,
  FALL_COUNTDOWN_DAY,
  FALL_COUNTDOWN_SLEEP,
} from '../../services/FallDetectionService';
import {
  getEmergencyContacts,
  type EmergencyContact,
} from '../../services/EmergencyContactService';
import {
  startCurrentLocation,
  type CancellableLocation,
} from '../../services/LocationService';
import {
  getElderProfile,
  getElderFamilyCount,
  getFamilyMembers,
  type ElderProfile,
  type FamilyMember,
} from '../../services/ProfileService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getThresholdSettings} from '../../services/ThresholdSettingsService';
import {
  getTimeGreeting,
  getDailyMessage,
} from '../../services/DailyGreetingService';

// ─── Design tokens — 藍 Ai ────────────────────────────────────────────────────

const C = {
  bg:           '#EFEAD9',
  cardBg:       '#FAF6E8',
  cardSub:      '#E5E0CD',
  border:       '#DCD3B8',
  primary:      '#274A6E',   // 藍染靛
  primaryDark:  '#173352',
  accent:       '#B25742',   // 朱色點綴
  matcha:       '#6E8E5E',
  ink:          '#1F2A3A',
  sub:          '#7B7A6A',
  white:        '#FFFFFF',
  washi:        '#FFF8EC',
  sos1:         '#B14A36',
  sos2:         '#D86A52',
  star:         '#C98520',   // 橘黃
  warning:      '#C98520',
  batteryBg:    '#E2DCC2',
  itemBg:       '#E5E0CD',
  badgeBg:      '#E2DCC2',
  modalOverlay: 'rgba(31,42,58,0.55)',
};

// 藥物彩色圓點循環（橘黃→抹茶→靛藍→紫）
const MED_DOTS = ['#C98520', '#6E8E5E', '#274A6E', '#7B5EA7'];

// 所有文字比一般 APP 大 20%
const F = (n: number) => Math.round(n * 1.2);

function dateStr() {
  const d = new Date();
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日（星期${days[d.getDay()]}）`;
}

// ─── 配對資訊 Modal ───────────────────────────────────────────────────────────

function PairingInfoModal({
  visible, pairCode, familyMembers, onClose,
}: {
  visible: boolean; pairCode: string;
  familyMembers: FamilyMember[]; onClose: () => void;
}) {
  const handleShare = async () => {
    try {
      await Share.share({
        message: `我的默伴守護配對碼是：${pairCode}，請用這個碼把我加入關懷名單。`,
      });
    } catch {}
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />

          <View style={s.modalTitleRow}>
            <Text style={s.modalTitle}>配對資訊</Text>
            <TouchableOpacity style={s.modalCloseBtn} onPress={onClose}
              accessibilityRole="button" accessibilityLabel="關閉">
              <Text style={s.modalCloseBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 配對碼大字卡 — 靛藍漸層 */}
          <LinearGradient colors={[C.primaryDark, C.primary]} style={s.modalCodeCard}>
            <Text style={s.modalCodeLabel}>您的配對碼</Text>
            <Text style={s.modalCodeValue} accessibilityLabel={`配對碼 ${pairCode}`}>
              {pairCode}
            </Text>
          </LinearGradient>

          {/* 分享按鈕 */}
          <TouchableOpacity style={s.modalShareBtn} onPress={handleShare}
            accessibilityRole="button" accessibilityLabel="分享配對碼給家屬">
            <Text style={s.modalShareBtnText}>📤 分享配對碼給家屬</Text>
          </TouchableOpacity>

          <Text style={s.modalTip}>將此號碼告訴其他家屬，讓他們也可以查看您的狀況</Text>
          <View style={s.modalDivider} />

          <Text style={s.modalSectionTitle}>
            已配對家屬
            {familyMembers.length > 0 && (
              <Text style={s.modalSectionCount}> （{familyMembers.length} 位）</Text>
            )}
          </Text>

          {familyMembers.length === 0 ? (
            <View style={s.modalEmptyRow}>
              <Text style={s.modalEmptyText}>尚無家屬配對</Text>
              <Text style={s.modalEmptyHint}>分享配對碼後家屬即可加入</Text>
            </View>
          ) : (
            familyMembers.map((m, i) => (
              <View key={i} style={s.modalMemberRow}>
                <LinearGradient colors={[C.cardBg, C.itemBg]} style={s.modalMemberAvatar}>
                  <Text style={s.modalMemberAvatarText}>{m.name[0]}</Text>
                </LinearGradient>
                <View style={s.modalMemberInfo}>
                  <Text style={s.modalMemberName}>{m.name}</Text>
                  <Text style={s.modalMemberDate}>
                    加入於 {new Date(m.pairedAt).toLocaleDateString('zh-TW')}
                  </Text>
                </View>
                <Text style={s.modalMemberCheck}>✓</Text>
              </View>
            ))
          )}

          <TouchableOpacity style={s.modalCloseFullBtn} onPress={onClose}
            accessibilityRole="button" accessibilityLabel="關閉">
            <Text style={s.modalCloseFullBtnText}>關閉</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── 區塊一：問候卡（靛藍漸層）────────────────────────────────────────────────

function GreetingCard({
  name, pairCode, familyCount, onShowInfo, timeLabel, dailyMessage,
}: {
  name: string; pairCode: string; familyCount: number; onShowInfo: () => void;
  timeLabel: string; dailyMessage: string;
}) {
  return (
    <LinearGradient colors={[C.primaryDark, C.primary]} style={s.greetingCard}>
      <Text style={s.greetingDate}>{dateStr()}</Text>
      <Text style={s.greetingMain}>{name}，{timeLabel}！</Text>
      <Text style={s.greetingSub}>{dailyMessage}</Text>
      <View style={s.greetingBadgeRow}>
        <View style={s.statusBadge}>
          <View style={s.safeDot} />
          <Text style={s.statusBadgeText}>狀態正常</Text>
        </View>
        <TouchableOpacity onPress={onShowInfo} activeOpacity={0.75}
          accessibilityRole="button" accessibilityLabel="查看配對資訊">
          {familyCount > 0 ? (
            <View style={s.pairedBadge}>
              <Text style={s.pairedBadgeText}>👨‍👩‍👧 已與 {familyCount} 位家屬配對 👥</Text>
            </View>
          ) : (
            <View style={s.codeBadge}>
              <Text style={s.codeBadgeText}>配對碼 {pairCode} ⚙️</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

// ─── SOS 確認 Modal（3 秒倒數自動發送）────────────────────────────────────────

const SOS_COUNTDOWN = 3;

function SOSConfirmModal({
  visible, contacts, elderName: _elderName, onConfirm, onCancel,
}: {
  visible: boolean; contacts: EmergencyContact[];
  elderName: string; onConfirm: () => void; onCancel: () => void;
}) {
  const [secsLeft, setSecsLeft] = useState(SOS_COUNTDOWN);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const firedRef     = useRef(false);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    if (!visible) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setSecsLeft(SOS_COUNTDOWN);
      firedRef.current = false;
      return;
    }
    firedRef.current = false;
    setSecsLeft(SOS_COUNTDOWN);
    intervalRef.current = setInterval(() => {
      setSecsLeft(prev => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          if (!firedRef.current) {
            firedRef.current = true;
            onConfirmRef.current();
          }
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleConfirm = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (!firedRef.current) { firedRef.current = true; onConfirmRef.current(); }
  };

  const handleCancel = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    firedRef.current = true;
    onCancel();
  };

  const progressPct = ((SOS_COUNTDOWN - secsLeft) / SOS_COUNTDOWN) * 100;
  const primary = contacts.find(c => c.isPrimary) ?? contacts[0] ?? null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleCancel}>
      <View style={s.sosModalOverlay}>
        <View style={s.sosModalBox}>
          <Text style={s.sosModalIcon}>🆘</Text>
          <Text style={s.sosModalTitle}>確認發送 SOS？</Text>
          <Text style={s.sosModalSub}>
            確認後將立即通知家屬並取得您的位置
            {primary ? `\n同時撥打「${primary.name}」的電話` : ''}
          </Text>

          {/* 倒數進度條 */}
          <View style={s.sosCountdownTrack}>
            <View style={[s.sosCountdownFill, {width: `${progressPct}%` as any}]} />
          </View>
          <Text style={s.sosCountdownText}>
            {secsLeft > 0 ? `${secsLeft} 秒後自動發送...` : '發送中...'}
          </Text>

          {contacts.length > 0 ? (
            <View style={s.sosContactList}>
              {contacts.map(c => (
                <View key={c.id} style={s.sosContactRow}>
                  <LinearGradient colors={[C.cardBg, C.itemBg]} style={s.sosContactAvatar}>
                    <Text style={s.sosContactAvatarText}>{c.name[0]}</Text>
                  </LinearGradient>
                  <View style={s.sosContactInfo}>
                    <Text style={s.sosContactName}>
                      {c.name}
                      {c.isPrimary && <Text style={s.sosPrimaryTag}> ⭐ 主要</Text>}
                    </Text>
                    <Text style={s.sosContactPhone}>{c.phone}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.sosNoContactHint}>尚未設定緊急聯絡人，將僅發送通知</Text>
          )}

          <TouchableOpacity style={s.sosConfirmBtn} onPress={handleConfirm}
            accessibilityRole="button" accessibilityLabel="立即發送求救">
            <LinearGradient colors={[C.sos1, C.sos2]} style={s.sosConfirmGradient}>
              <Text style={s.sosConfirmBtnText}>🆘 立即發送</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={s.sosCancelBtn} onPress={handleCancel}
            accessibilityRole="button" accessibilityLabel="取消">
            <Text style={s.sosCancelBtnText}>取消</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── 區塊二：SOS 緊急求援（長按進度條）───────────────────────────────────────

const SOS_DURATION = 3000;
const SOS_TICK = 80;
const SOS_COOLDOWN_MS = 5 * 60 * 1000; // 5 分鐘冷卻
const KEY_SOS_LAST_SENT = 'sos_last_sent_time';

function formatCooldown(remainingMs: number): string {
  const totalSec = Math.ceil(remainingMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return mins > 0 ? `${mins} 分 ${secs} 秒` : `${secs} 秒`;
}

function SOSButton({onLongPress}: {onLongPress: () => void}) {
  const [pressing, setPressing] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [secs, setSecs] = useState(3);
  const elapsed = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fired = useRef(false);

  const stopTimer = () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
  };

  const handlePressIn = () => {
    stopTimer();
    fired.current = false;
    elapsed.current = 0;
    setProgressPct(0);
    setSecs(3);
    setPressing(true);
    timer.current = setInterval(() => {
      elapsed.current += SOS_TICK;
      const pct = Math.min((elapsed.current / SOS_DURATION) * 100, 100);
      setProgressPct(pct);
      setSecs(Math.max(1, Math.ceil((SOS_DURATION - elapsed.current) / 1000)));
      if (elapsed.current >= SOS_DURATION) {
        stopTimer();
        fired.current = true;
        setProgressPct(0);
        setPressing(false);
        onLongPress();
      }
    }, SOS_TICK);
  };

  const handlePressOut = () => {
    if (!fired.current) {
      stopTimer();
      elapsed.current = 0;
      setProgressPct(0);
      setSecs(3);
      setPressing(false);
    }
  };

  return (
    <TouchableOpacity
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel="SOS 緊急求援，長按 3 秒發送">
      <LinearGradient colors={[C.sos1, C.sos2]} style={s.sosButton}>
        {pressing && (
          <View style={s.sosProgressInner as any}
            // width set inline so it can be a percentage string
          >
            <View style={[s.sosProgressFill, {width: `${progressPct}%` as any}]} />
          </View>
        )}
        <Text style={s.sosLabel}>緊急求援</Text>
        <Text style={s.sosSub}>
          {pressing ? `保持按住… ${secs} 秒` : '長按 3 秒自動發送'}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── 跌倒偵測確認 Modal（無回應自動警報；白天 30 秒，睡眠 60 秒）──────────────

function FallDetectionModal({
  visible, onFalseAlarm, onAlarm, countdownSecs,
}: {
  visible: boolean; onFalseAlarm: () => void; onAlarm: () => void; countdownSecs: number;
}) {
  const [secsLeft, setSecsLeft] = useState(countdownSecs);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firedRef    = useRef(false);
  const onAlarmRef  = useRef(onAlarm);
  onAlarmRef.current = onAlarm;

  useEffect(() => {
    if (!visible) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setSecsLeft(countdownSecs);
      firedRef.current = false;
      return;
    }
    firedRef.current = false;
    setSecsLeft(countdownSecs);
    intervalRef.current = setInterval(() => {
      setSecsLeft(prev => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          if (!firedRef.current) {
            firedRef.current = true;
            onAlarmRef.current();
          }
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleFalseAlarm = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    firedRef.current = true;
    onFalseAlarm();
  };

  const progressPct = ((countdownSecs - secsLeft) / countdownSecs) * 100;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={s.fallModalOverlay}>
        <View style={s.fallModalBox}>
          <Text style={s.fallModalIcon}>🤕</Text>
          <Text style={s.fallModalTitle}>您還好嗎？</Text>
          <Text style={s.fallModalSub}>偵測到異常，請按下方按鈕確認您平安</Text>

          <View style={s.fallCountdownTrack}>
            <View style={[s.fallCountdownFill, {width: `${progressPct}%` as any}]} />
          </View>
          <Text style={s.fallCountdownText}>
            {secsLeft > 0 ? `${secsLeft} 秒後若無回應將通知家屬` : '通知中...'}
          </Text>

          <TouchableOpacity
            style={s.fallOkBtn}
            onPress={handleFalseAlarm}
            accessibilityRole="button"
            accessibilityLabel="我沒事，取消警報">
            <Text style={s.fallOkBtnText}>我沒事 ✓</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── 區塊六：緊急聯絡人 ──────────────────────────────────────────────────────

function EmergencyContactCard({contacts}: {contacts: EmergencyContact[]}) {
  if (contacts.length === 0) {
    return (
      <View style={s.card}>
        <Text style={s.cardTitle}>緊急聯絡人</Text>
        <Text style={s.emptyHint}>請家屬協助設定緊急聯絡人</Text>
      </View>
    );
  }
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>緊急聯絡人</Text>
      {contacts.map((c, i) => (
        <View key={c.id} style={[s.ecRow, i < contacts.length - 1 && s.ecRowBorder]}>
          <LinearGradient colors={[C.cardBg, C.itemBg]} style={s.ecAvatar}>
            <Text style={s.ecAvatarText}>{c.name[0]}</Text>
          </LinearGradient>
          <View style={s.ecInfo}>
            <View style={s.ecNameRow}>
              <Text style={s.ecName}>{c.name}</Text>
              {c.isPrimary && (
                <View style={s.ecPrimaryBadge}>
                  <Text style={s.ecPrimaryText}>主要</Text>
                </View>
              )}
              <View style={s.ecRelBadge}>
                <Text style={s.ecRelText}>{c.relationship}</Text>
              </View>
            </View>
            <Text style={s.ecPhone}>{c.phone}</Text>
          </View>
          <TouchableOpacity
            style={s.callBtn}
            onPress={() => Linking.openURL(`tel:${c.phone}`).catch(console.error)}
            accessibilityRole="button"
            accessibilityLabel={`撥打 ${c.name} 的電話`}>
            <Text style={s.callBtnPhone}>☎</Text>
            <Text style={s.callBtnText}>直接撥打</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

// ─── 區塊三：每日運勢 + 今日新聞 ─────────────────────────────────────────────

function DailyFortuneNews({
  fortune, news, newsLoading, sharedAt, onShare,
}: {
  fortune: FortuneData; news: NewsItem | null;
  newsLoading: boolean; sharedAt: string | null; onShare: () => void;
}) {
  const shared = sharedAt !== null;
  const stars = '★'.repeat(fortune.stars) + '☆'.repeat(5 - fortune.stars);

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>每日運勢 ＋ 今日新聞</Text>

      {/* ── 運勢 ── */}
      <View style={s.fortuneSection}>
        <Text style={s.sectionLabel}>✦ 今日運勢</Text>
        <Text style={s.fortuneStars}>{stars}{'  '}{fortune.stars} 星</Text>
        <View style={s.fortuneRow}>
          <Text style={s.fortuneTag}>宜：</Text>
          <Text style={s.fortuneGood}>{fortune.lucky.join('、')}</Text>
        </View>
        <View style={s.fortuneRow}>
          <Text style={s.fortuneTag}>忌：</Text>
          <Text style={s.fortuneBad}>{fortune.avoid.join('、')}</Text>
        </View>
        <View style={s.fortuneRow}>
          <Text style={s.fortuneTag}>幸運顏色：</Text>
          <Text style={s.fortuneValue}>{fortune.color}</Text>
          <Text style={[s.fortuneTag, {marginLeft: 14}]}>幸運數字：</Text>
          <Text style={s.fortuneValue}>{fortune.number}</Text>
        </View>
      </View>

      <View style={s.divider} />

      {/* ── 新聞 ── */}
      <View style={s.newsSection}>
        <Text style={s.sectionLabel}>📰 今日新聞</Text>
        {newsLoading ? (
          <View style={s.newsLoadingRow}>
            <ActivityIndicator size="small" color={C.primary} />
            <Text style={s.newsLoadingText}>載入新聞中...</Text>
          </View>
        ) : news ? (
          <>
            <TouchableOpacity
              onPress={() =>
                news.url ? Linking.openURL(news.url).catch(console.error) : undefined
              }
              activeOpacity={news.url ? 0.7 : 1}
              accessibilityRole="link"
              accessibilityLabel={`開啟新聞：${news.title}`}>
              <Text style={[s.newsTitle, Boolean(news.url) && s.newsTitleLink]}>
                {news.title}
                {Boolean(news.url) && <Text style={s.newsArrow}> ›</Text>}
              </Text>
            </TouchableOpacity>
            {Boolean(news.summary) && (
              <Text style={s.newsSummary}>{news.summary}</Text>
            )}
          </>
        ) : (
          <Text style={s.newsLoadingText}>今日新聞暫時無法取得</Text>
        )}
      </View>

      {/* ── 分享按鈕 ── */}
      <TouchableOpacity
        style={[s.shareBtn, shared && s.shareBtnDone]}
        onPress={onShare}
        disabled={shared}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={shared ? `今天 ${sharedAt} 已分享` : '我看完了，分享給家人'}>
        <Text style={[s.shareBtnText, shared && s.shareBtnTextDone]}>
          {shared ? `今天 ${sharedAt} 已分享 ✓` : '我看完了，分享給家人 🌅'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── 區塊四：裝置電量 ────────────────────────────────────────────────────────

function BatteryCard() {
  const raw = useBatteryLevel();
  const pct = raw !== null && raw >= 0 ? Math.round(raw * 100) : null;

  let barColor   = C.matcha;
  let statusText = '手機電量充足，請放心使用';
  let statusColor = C.sub;
  let isCritical = false;
  let isWarning  = false;

  if (pct !== null) {
    if (pct < 10) {
      barColor = C.sos1; statusText = '🔋 電量極低！請立即充電';
      statusColor = C.sos1; isCritical = true;
    } else if (pct <= 20) {
      barColor = C.warning; statusText = '⚠️ 電量偏低，請充電';
      statusColor = C.warning; isWarning = true;
    }
  }

  return (
    <View style={[s.card, isWarning && s.cardWarning, isCritical && s.cardCritical]}>
      <Text style={s.cardTitle}>裝置電量</Text>
      <View style={s.batteryRow}>
        <View style={s.batteryTrack}>
          <View
            style={[
              s.batteryFill,
              {
                width: pct !== null ? (`${pct}%` as any) : ('0%' as any),
                backgroundColor: barColor,
              },
            ]}
          />
        </View>
        <Text style={[s.batteryPct, {color: barColor}]}>
          {pct !== null ? `${pct}%` : '--'}
        </Text>
      </View>
      <Text style={[s.cardSub, {color: statusColor}]}>
        {pct === null ? '讀取中...' : statusText}
      </Text>
      {isCritical && <Text style={s.batteryAlert}>已通知家屬</Text>}
    </View>
  );
}

// ─── 區塊五：今日狀態四格 ────────────────────────────────────────────────────

function StatusItem({
  icon, label, value, unit, color,
}: {
  icon: string; label: string; value: string; unit?: string; color?: string;
}) {
  return (
    <View style={s.statusItem}>
      <Text style={s.statusIcon}>{icon}</Text>
      <Text style={s.statusValue} numberOfLines={1}>
        <Text style={{color: color ?? C.ink}}>{value}</Text>
        {unit ? <Text style={s.statusUnit}> {unit}</Text> : null}
      </Text>
      <Text style={s.statusLabel}>{label}</Text>
    </View>
  );
}

function TodayStatusGrid({
  steps, isMock, lastUnlock, stepGoal, fallEnabled,
}: {
  steps: number | null; isMock: boolean; lastUnlock: string;
  stepGoal: number; fallEnabled: boolean;
}) {
  const stepsDisplay = steps === null ? '讀取中' : steps.toLocaleString('zh-TW');
  const stepsColor =
    steps === null ? C.sub : steps < stepGoal ? C.warning : C.matcha;

  return (
    <View style={[s.card, steps !== null && steps < stepGoal ? s.cardWarning : null]}>
      <Text style={s.cardTitle}>今日狀態</Text>
      {steps !== null && steps < stepGoal && (
        <Text style={s.stepWarning}>⚠️ 今日步數偏低，多走動有益健康</Text>
      )}
      <View style={s.statusGrid}>
        <StatusItem
          icon="👟" label="今日步數"
          value={stepsDisplay} unit={steps !== null ? '步' : undefined}
          color={stepsColor}
        />
        <StatusItem icon="📱" label="上次解鎖" value={lastUnlock} color={C.primary} />
        <StatusItem icon="🌙" label="昨夜睡眠" value="7.5" unit="小時" color={C.primary} />
        <StatusItem
          icon="🛡"
          label="跌倒偵測"
          value={fallEnabled ? '偵測中' : '已停用'}
          color={fallEnabled ? C.matcha : C.sub}
        />
      </View>
      {isMock && <Text style={s.mockBadge}>模擬數據</Text>}
    </View>
  );
}

// ─── 區塊七：今日服藥（彩色圓點）────────────────────────────────────────────

// 設定時間前 15 分鐘開放打勾（緩衝）
function isMedUnlocked(medTime: string): boolean {
  const now = new Date();
  const [h, m] = medTime.split(':').map(Number);
  const unlockMinutes = h * 60 + m - 15;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= unlockMinutes;
}

function MedicationList({
  meds, takenState, onMark,
}: {
  meds: Medication[]; takenState: DailyTakenState; onMark: (id: string) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const pendingMed = meds.find(m => m.id === pendingId) ?? null;

  const handleRowPress = (med: Medication) => {
    if (takenState[med.id]) return;           // 已打勾，長輩端不可取消
    if (!isMedUnlocked(med.time)) return;     // 時間未到，鎖定中
    setPendingId(med.id);
  };

  const handleConfirm = () => {
    if (pendingId) onMark(pendingId);
    setPendingId(null);
  };

  if (meds.length === 0) {
    return (
      <View style={s.card}>
        <Text style={s.cardTitle}>今日服藥</Text>
        <Text style={s.emptyHint}>尚無服藥記錄，請家屬在家屬端新增</Text>
      </View>
    );
  }

  const takenCount = meds.filter(m => !!takenState[m.id]).length;

  return (
    <>
      <View style={s.card}>
        <View style={s.medHeader}>
          <Text style={s.cardTitle}>今日服藥</Text>
          <View style={[s.medCountBadge, takenCount === meds.length && s.medCountBadgeDone]}>
            <Text style={[s.medCountText, takenCount === meds.length && s.medCountTextDone]}>
              {takenCount} / {meds.length}
            </Text>
          </View>
        </View>

        {meds.map((med, idx) => {
          const takenAt = takenState[med.id] ?? null;
          const taken = takenAt !== null;
          const unlocked = isMedUnlocked(med.time);
          const context = med.note || PERIOD_LABELS[med.period];
          const dotColor = MED_DOTS[idx % MED_DOTS.length];

          return (
            <TouchableOpacity
              key={med.id}
              style={[
                s.medRow,
                taken && s.medRowDone,
                !unlocked && !taken && s.medRowLocked,
              ]}
              onPress={() => handleRowPress(med)}
              activeOpacity={taken || !unlocked ? 1 : 0.6}
              accessibilityRole="checkbox"
              accessibilityLabel={`${med.name}，${taken ? '已服用' : unlocked ? '未服用' : '尚未開放'}`}>

              {/* 彩色圓點 */}
              <View style={[s.medDot, {backgroundColor: dotColor}]} />

              {/* 打勾圈：鎖定 / 可打勾 / 已打勾 */}
              {taken ? (
                <View style={[s.checkbox, s.checkboxChecked]}>
                  <Text style={s.checkmark}>✓</Text>
                </View>
              ) : unlocked ? (
                <View style={s.checkbox} />
              ) : (
                <View style={[s.checkbox, s.checkboxLocked]}>
                  <Text style={s.lockIcon}>🔒</Text>
                </View>
              )}

              <View style={s.medInfo}>
                <Text style={[s.medName, taken && s.medNameDone]}>{med.name}</Text>
                <View style={s.medTimeTag}>
                  {unlocked || taken ? (
                    <Text style={s.medTimeText}>{context}・{med.time}</Text>
                  ) : (
                    <Text style={s.lockHintText}>{med.time} 開放打勾</Text>
                  )}
                </View>
              </View>

              {taken ? (
                <View style={s.takenBadge}>
                  <Text style={s.takenText}>✓ {takenAt} 已服用</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── 確認服藥 Modal ── */}
      <Modal
        visible={pendingId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingId(null)}>
        <View style={s.medModalOverlay}>
          <View style={s.medModalCard}>
            <Text style={s.medModalTitle}>請確認服藥</Text>
            <Text style={s.medModalBody}>
              {'請服完藥之後再打勾\n確認您已服用完畢？'}
            </Text>
            {pendingMed && (
              <View style={s.medModalDrugRow}>
                <Text style={s.medModalDrugName}>{pendingMed.name}</Text>
                <Text style={s.medModalDrugTime}>{pendingMed.time}</Text>
              </View>
            )}
            <View style={s.medModalBtnRow}>
              <TouchableOpacity
                style={[s.medModalBtn, s.medModalCancelBtn]}
                onPress={() => setPendingId(null)}>
                <Text style={s.medModalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.medModalBtn, s.medModalConfirmBtn]}
                onPress={handleConfirm}>
                <Text style={s.medModalConfirmText}>✓ 確認已服藥</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── 主畫面 ───────────────────────────────────────────────────────────────────

export default function ElderHomeScreen() {
  // 時間問候 + 每日問候語（每分鐘更新一次時間詞）
  const [timeLabel, setTimeLabel]       = useState(() => getTimeGreeting());
  const [dailyMessage, setDailyMessage] = useState(() => getDailyMessage());

  const [steps, setSteps]           = useState<number | null>(null);
  const [isMock, setIsMock]         = useState(false);
  const [lastUnlock, setLastUnlock] = useState('--:--');
  const [profile, setProfile]       = useState<ElderProfile | null>(null);
  const [familyCount, setFamilyCount]     = useState(0);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [pairingModalVisible, setPairingModalVisible] = useState(false);
  const [stepGoal, setStepGoal]     = useState(3000);
  const [fortune]                   = useState<FortuneData>(() => generateFortune());
  const [news, setNews]             = useState<NewsItem | null>(null);
  const [newsLoading, setNewsLoading] = useState(true);
  const [sharedAt, setSharedAt]     = useState<string | null>(null);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [sosModalVisible, setSosModalVisible] = useState(false);
  const [sosStatus, setSosStatus]   = useState<'idle' | 'locating' | 'done'>('idle');
  const [sosCooldownUntil, setSosCooldownUntil] = useState(0);
  const locRef = useRef<CancellableLocation | null>(null);
  const [fallModalVisible, setFallModalVisible]   = useState(false);
  const [fallCountdownSecs, setFallCountdownSecs] = useState(FALL_COUNTDOWN_DAY);
  const [fallEnabled] = useState(() => isFallDetectionAvailable());
  const fallLocRef = useRef<CancellableLocation | null>(null);
  const [meds, setMeds]             = useState<Medication[]>([]);
  const [takenState, setTakenState] = useState<DailyTakenState>({});

  // 每 60 秒檢查時間詞是否需要更新（跨越整點時自動切換）
  useEffect(() => {
    const id = setInterval(() => {
      setTimeLabel(getTimeGreeting());
      // 日期問候語只在需要時重算（跨午夜自動換新一條）
      setDailyMessage(getDailyMessage());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let stop: (() => void) | null = null;
    startStepListener((s, mock) => {
      setSteps(s); setIsMock(mock); notifyStepsUpdated(s);
    }).then(r => { stop = r.stop; });
    return () => stop?.();
  }, []);

  useEffect(() => {
    getLastUnlockTime().then(setLastUnlock);
    const stopUnlock = startScreenUnlockService(ev => {
      if (ev.type === 'unlock') getLastUnlockTime().then(setLastUnlock);
    });
    return stopUnlock;
  }, []);

  useEffect(() => { return startActivityDetection(); }, []);
  useEffect(() => { return startBatteryMonitor(); }, []);

  useEffect(() => {
    getElderProfile().then(p => { if (p) setProfile(p); });
    getElderFamilyCount().then(setFamilyCount);
    getFamilyMembers().then(setFamilyMembers);
    getThresholdSettings().then(t => setStepGoal(t.stepGoal));
    getEmergencyContacts().then(setEmergencyContacts);
  }, []);

  useEffect(() => {
    getDailyInteractionState().then(setSharedAt);
    fetchTodayNews().then(setNews).finally(() => setNewsLoading(false));
  }, []);

  useEffect(() => {
    getMedications().then(loadedMeds => {
      setMeds(loadedMeds);
      return getEffectiveTakenState(loadedMeds);
    }).then(setTakenState);
    return startMedicationReminder();
  }, []);

  useEffect(() => {
    return startFallDetection(() => {
      fallLocRef.current = startCurrentLocation(10_000);
      setFallCountdownSecs(isFallSleepMode() ? FALL_COUNTDOWN_SLEEP : FALL_COUNTDOWN_DAY);
      setFallModalVisible(true);
    });
  }, []);

  // 載入上次 SOS 發送時間，恢復冷卻狀態（APP 重啟後仍有效）
  useEffect(() => {
    AsyncStorage.getItem(KEY_SOS_LAST_SENT).then(raw => {
      if (!raw) return;
      const lastSent = parseInt(raw, 10);
      const until = lastSent + SOS_COOLDOWN_MS;
      if (Date.now() < until) {
        setSosCooldownUntil(until);
      }
    });
  }, []);

  const handleFallAlarm = async () => {
    setFallModalVisible(false);
    // Situation B: resume timer without updating last_active_ts so inactivity
    // alert fires normally once the threshold is reached post-fall.
    resumeActivityDetection().catch(console.error);
    const elderName = profile?.name ?? '長輩';
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    await sendFallDetectedImmediate(elderName, time);

    const loc = await (fallLocRef.current?.promise ?? startCurrentLocation(10_000).promise);
    fallLocRef.current = null;

    if (loc) {
      await sendFallDetectedWithLocation(elderName, loc.latitude, loc.longitude, loc.accuracy);
    } else {
      await sendFallDetectedNoLocation(elderName);
    }
  };

  const handleFallFalseAlarm = () => {
    setFallModalVisible(false);
    // 取消 SOS 時必須停止 GPS 取得
    // 避免浪費電量和隱私疑慮
    fallLocRef.current?.cancel();
    fallLocRef.current = null;
    recordFalseAlarm().catch(console.error);
    // Situation A: resume timer then reset inactivity clock to now.
    resumeActivityDetection()
      .then(() => markActivityAsActive())
      .catch(console.error);
  };

  const handleShare = async () => {
    const time = await sendDailyInteraction();
    if (time !== null) setSharedAt(time);
  };

  const handleSOSTrigger = () => {
    locRef.current = startCurrentLocation(10_000);
    setSosModalVisible(true);
  };

  // 長按 SOS 時先檢查冷卻；冷卻中提示剩餘時間，緊急時提供二次確認覆蓋
  const handleSOSLongPress = () => {
    const remaining = sosCooldownUntil - Date.now();
    if (remaining <= 0) {
      handleSOSTrigger();
      return;
    }
    // 冷卻期間：提示 + 緊急例外選項
    Alert.alert(
      '已發送求救通知',
      `請等待家人回應\n\n${formatCooldown(remaining)} 後可再次發送`,
      [
        {text: '確定', style: 'cancel'},
        {
          text: '緊急再次發送',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              '確認再次發送？',
              '您剛才已發送過求救，確定要再次發送？',
              [
                {text: '取消', style: 'cancel'},
                {text: '確認發送', style: 'destructive', onPress: handleSOSTrigger},
              ],
            );
          },
        },
      ],
    );
  };

  const handleSOSConfirm = async () => {
    setSosModalVisible(false);
    const elderName = profile?.name ?? '長輩';
    const primary =
      emergencyContacts.find(c => c.isPrimary) ?? emergencyContacts[0] ?? null;

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    await sendSOSImmediate(elderName, time);
    setSosStatus('locating');

    if (primary) {
      Linking.openURL(`tel:${primary.phone}`).catch(console.error);
    }

    const loc = await (locRef.current?.promise ?? startCurrentLocation(10_000).promise);
    locRef.current = null;

    if (loc) {
      await sendSOSWithLocation(elderName, loc.latitude, loc.longitude, loc.accuracy);
    } else {
      await sendSOSNoLocation(elderName);
    }

    // 發送完成後啟動冷卻，避免短時間重複發送
    const sentAt = Date.now();
    await AsyncStorage.setItem(KEY_SOS_LAST_SENT, String(sentAt));
    setSosCooldownUntil(sentAt + SOS_COOLDOWN_MS);

    setSosStatus('done');
  };

  const handleSOSCancel = () => {
    setSosModalVisible(false);
    // 取消 SOS 時必須停止 GPS 取得
    // 避免浪費電量和隱私疑慮
    locRef.current?.cancel();
    locRef.current = null;
  };

  const handleMedMark = async (medId: string) => {
    const updated = await confirmMedicationTaken(medId);
    setTakenState({...updated}); // confirmMedicationTaken returns effective state
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <PairingInfoModal
        visible={pairingModalVisible}
        pairCode={profile?.pairCode ?? '------'}
        familyMembers={familyMembers}
        onClose={() => setPairingModalVisible(false)}
      />
      <SOSConfirmModal
        visible={sosModalVisible}
        contacts={emergencyContacts}
        elderName={profile?.name ?? '長輩'}
        onConfirm={handleSOSConfirm}
        onCancel={handleSOSCancel}
      />
      <FallDetectionModal
        visible={fallModalVisible}
        countdownSecs={fallCountdownSecs}
        onFalseAlarm={handleFallFalseAlarm}
        onAlarm={handleFallAlarm}
      />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}>
        <GreetingCard
          name={profile?.name ?? '長輩'}
          pairCode={profile?.pairCode ?? '------'}
          familyCount={familyCount}
          onShowInfo={() => setPairingModalVisible(true)}
          timeLabel={timeLabel}
          dailyMessage={dailyMessage}
        />
        <SOSButton onLongPress={handleSOSLongPress} />
        {sosStatus !== 'idle' && (
          <View style={[s.sosBanner, sosStatus === 'done' && s.sosBannerDone]}>
            <Text style={s.sosBannerText}>
              {sosStatus === 'locating'
                ? '📍 求救通知已發送，正在取得位置中...'
                : '✓ 已發送求救通知與位置給家屬'}
            </Text>
          </View>
        )}
        <EmergencyContactCard contacts={emergencyContacts} />
        <DailyFortuneNews
          fortune={fortune}
          news={news}
          newsLoading={newsLoading}
          sharedAt={sharedAt}
          onShare={handleShare}
        />
        <BatteryCard />
        <TodayStatusGrid
          steps={steps} isMock={isMock}
          lastUnlock={lastUnlock} stepGoal={stepGoal}
          fallEnabled={fallEnabled}
        />
        <MedicationList meds={meds} takenState={takenState} onMark={handleMedMark} />
        <View style={s.bottomPad} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  bottomPad: { height: 28 },

  // ── 區塊一：問候卡 ──
  greetingCard: {
    borderRadius: 22,
    padding: 24,
    marginBottom: 16,
    shadowColor: C.primaryDark,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  greetingDate: {
    color: 'rgba(255,248,236,0.7)',
    fontSize: F(12),
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  greetingMain: {
    color: C.washi,
    fontSize: F(22),
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 1,
  },
  greetingSub: {
    color: 'rgba(255,248,236,0.8)',
    fontSize: F(14),
    marginBottom: 18,
  },
  greetingBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(110,142,94,0.3)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(110,142,94,0.5)',
  },
  safeDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#A8D5A2',
    marginRight: 6,
  },
  statusBadgeText: { color: C.washi, fontSize: F(12), fontWeight: '600' },
  pairedBadge: {
    backgroundColor: 'rgba(255,248,236,0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,248,236,0.25)',
  },
  pairedBadgeText: { color: C.washi, fontSize: F(12), fontWeight: '600' },
  codeBadge: {
    backgroundColor: 'rgba(255,248,236,0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  codeBadgeText: {
    color: 'rgba(255,248,236,0.65)',
    fontSize: F(12), fontWeight: '600', letterSpacing: 1,
  },

  // ── 區塊二：SOS ──
  sosButton: {
    borderRadius: 22,
    marginBottom: 16,
    paddingVertical: 30,
    alignItems: 'center',
    overflow: 'hidden',
    minHeight: 124,
    shadowColor: C.sos1,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 9,
  },
  sosProgressInner: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0, right: 0,
  },
  sosProgressFill: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 22,
  },
  sosLabel: {
    color: C.white,
    fontSize: F(21),
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 8,
  },
  sosSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: F(14),
  },

  // ── 通用卡片 ──
  card: {
    backgroundColor: C.cardBg,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.primaryDark,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: F(14),
    fontWeight: '700',
    color: C.ink,
    marginBottom: 14,
    letterSpacing: 2,
  },
  cardSub: { fontSize: F(13), color: C.sub, marginBottom: 10 },
  cardWarning: { borderColor: C.warning, borderWidth: 1.5 },
  cardCritical: { borderColor: C.sos1, borderWidth: 1.5 },
  emptyHint: {
    fontSize: F(13), color: C.sub,
    textAlign: 'center', paddingVertical: 12,
  },

  // ── 區塊三：運勢 ──
  fortuneSection: { marginBottom: 4 },
  sectionLabel: {
    fontSize: F(13), fontWeight: '700', color: C.primary,
    marginBottom: 10, letterSpacing: 1,
  },
  fortuneStars: {
    fontSize: F(20), color: C.star,
    fontWeight: '700', marginBottom: 10, letterSpacing: 2,
  },
  fortuneRow: {
    flexDirection: 'row', alignItems: 'center',
    flexWrap: 'wrap', marginBottom: 6,
  },
  fortuneTag: { fontSize: F(13), color: C.sub, fontWeight: '600' },
  fortuneGood: { fontSize: F(13), color: C.matcha, fontWeight: '700' },
  fortuneBad:  { fontSize: F(13), color: C.sos1, fontWeight: '700' },
  fortuneValue:{ fontSize: F(13), color: C.ink, fontWeight: '700' },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },

  // 新聞
  newsSection: { marginBottom: 16 },
  newsLoadingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4,
  },
  newsLoadingText: { fontSize: F(13), color: C.sub },
  newsTitle: {
    fontSize: F(14), fontWeight: '700', color: C.ink,
    lineHeight: F(21), marginBottom: 6,
  },
  newsTitleLink: { color: C.primary, textDecorationLine: 'underline' },
  newsArrow: { fontSize: F(17), fontWeight: '700', color: C.primary },
  newsSummary: { fontSize: F(12), color: C.sub, lineHeight: F(19) },

  // 分享按鈕
  shareBtn: {
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  shareBtnDone: { backgroundColor: C.matcha },
  shareBtnText: { color: C.white, fontSize: F(15), fontWeight: '700' },
  shareBtnTextDone: { color: C.white },

  // ── 區塊四：電量 ──
  batteryRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 12,
  },
  batteryTrack: {
    flex: 1, height: 16, backgroundColor: C.batteryBg,
    borderRadius: 8, overflow: 'hidden',
    borderWidth: 1, borderColor: C.border,
  },
  batteryFill: { height: '100%', borderRadius: 8 },
  batteryPct: { fontSize: F(16), fontWeight: '700', minWidth: 48, textAlign: 'right' },
  batteryAlert: { marginTop: 6, fontSize: F(12), color: C.sos1, fontWeight: '600' },

  // ── 區塊五：四格狀態 ──
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statusItem: {
    width: '46%',
    backgroundColor: C.itemBg,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    minHeight: 94,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  statusIcon:  { fontSize: 26, marginBottom: 5 },
  statusValue: { fontSize: F(17), fontWeight: '800' },
  statusUnit:  { fontSize: F(12), color: C.sub, fontWeight: '400' },
  statusLabel: { fontSize: F(11), color: C.sub, marginTop: 3 },
  stepWarning: { fontSize: F(12), color: C.warning, fontWeight: '600', marginBottom: 10 },
  mockBadge:   { marginTop: 10, fontSize: F(11), color: C.sub, textAlign: 'right' },

  // ── 區塊七：服藥 ──
  medHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  medCountBadge: {
    backgroundColor: C.badgeBg,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
  },
  medCountBadgeDone: { backgroundColor: '#CFEACF' },
  medCountText:     { fontSize: F(13), fontWeight: '700', color: C.sub },
  medCountTextDone: { color: C.matcha },
  medRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    minHeight: 62,
    gap: 10,
  },
  medRowDone:   { opacity: 0.55 },
  medRowLocked: { opacity: 0.6 },
  medDot: {
    width: 10, height: 10, borderRadius: 5,
    flexShrink: 0,
  },
  checkbox: {
    width: 28, height: 28, borderRadius: 8,
    borderWidth: 2, borderColor: C.primary,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: C.matcha, borderColor: C.matcha },
  checkboxLocked:  { backgroundColor: '#F0EDE4', borderColor: '#C8C4B8' },
  checkmark: { color: C.white, fontSize: 16, fontWeight: '700' },
  lockIcon:  { fontSize: 13 },
  medInfo:  { flex: 1 },
  medName:  { fontSize: F(15), fontWeight: '600', color: C.ink },
  medNameDone: { textDecorationLine: 'line-through', color: C.sub },
  medTimeTag: {
    marginTop: 5,
    alignSelf: 'flex-start',
    backgroundColor: C.itemBg,
    borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: C.border,
  },
  medTimeText: { fontSize: F(11), color: C.sub },
  takenBadge: {
    backgroundColor: '#D8EED8',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
  },
  takenText:    { color: C.matcha, fontSize: F(11), fontWeight: '600' },
  lockHintText: { fontSize: F(11), color: '#A09880', fontStyle: 'italic' },

  // ── 確認服藥 Modal ──
  medModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  medModalCard: {
    backgroundColor: '#FFFDF7',
    borderRadius: 22, padding: 26, width: '100%',
    shadowColor: '#000', shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.18, shadowRadius: 14, elevation: 10,
  },
  medModalTitle: {
    fontSize: F(20), fontWeight: '800', color: C.ink,
    marginBottom: 10, textAlign: 'center',
  },
  medModalBody: {
    fontSize: F(15), color: C.sub, lineHeight: F(24),
    textAlign: 'center', marginBottom: 18,
  },
  medModalDrugRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: '#F2EDE0', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 20, marginBottom: 22,
  },
  medModalDrugName: { fontSize: F(17), fontWeight: '700', color: C.ink },
  medModalDrugTime: { fontSize: F(14), color: C.sub },
  medModalBtnRow:   { flexDirection: 'row', gap: 12 },
  medModalBtn: {
    flex: 1, borderRadius: 14, paddingVertical: 18,
    alignItems: 'center', justifyContent: 'center', minHeight: 58,
  },
  medModalCancelBtn: {
    backgroundColor: '#F0EDE4', borderWidth: 1.5, borderColor: '#D8D0BE',
  },
  medModalCancelText:  { fontSize: F(15), fontWeight: '600', color: C.sub },
  medModalConfirmBtn:  { backgroundColor: '#6E8E5E' },
  medModalConfirmText: { fontSize: F(15), fontWeight: '700', color: '#FFFFFF' },

  // ── 區塊六：緊急聯絡人 ──
  ecRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  ecRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  ecAvatar: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
    borderWidth: 1, borderColor: C.border,
  },
  ecAvatarText: { color: C.primary, fontSize: F(19), fontWeight: '700' },
  ecInfo: { flex: 1 },
  ecNameRow: {
    flexDirection: 'row', alignItems: 'center',
    flexWrap: 'wrap', gap: 6, marginBottom: 3,
  },
  ecName: { fontSize: F(15), fontWeight: '700', color: C.ink },
  ecPrimaryBadge: {
    backgroundColor: '#FBF0C8',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
  },
  ecPrimaryText: { fontSize: F(11), fontWeight: '700', color: '#7A5000' },
  ecRelBadge: {
    backgroundColor: C.itemBg,
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
  },
  ecRelText: { fontSize: F(11), fontWeight: '600', color: C.primary },
  ecPhone: { fontSize: F(13), color: C.sub },
  callBtn: {
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 50,
    justifyContent: 'center',
  },
  callBtnPhone: {
    fontSize: 20,
    color: '#E53535',
    lineHeight: 22,
  },
  callBtnText: { fontSize: F(12), fontWeight: '700', color: C.white },

  // ── SOS 倒數進度條 ──
  sosCountdownTrack: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(177,74,54,0.15)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  sosCountdownFill: {
    height: '100%',
    backgroundColor: C.sos1,
    borderRadius: 4,
  },
  sosCountdownText: {
    fontSize: F(13),
    color: C.sos1,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },

  // ── SOS 狀態橫幅 ──
  sosBanner: {
    backgroundColor: 'rgba(177,74,54,0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.sos1,
    alignItems: 'center',
  },
  sosBannerDone: {
    backgroundColor: 'rgba(110,142,94,0.1)',
    borderColor: C.matcha,
  },
  sosBannerText: {
    fontSize: F(13),
    fontWeight: '700',
    color: C.ink,
    textAlign: 'center',
    lineHeight: F(20),
  },

  // ── SOS 確認 Modal ──
  sosModalOverlay: {
    flex: 1,
    backgroundColor: C.modalOverlay,
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  sosModalBox: {
    backgroundColor: C.cardBg,
    borderRadius: 24, padding: 28,
    width: '100%', alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
    shadowColor: C.primaryDark,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  sosModalIcon:  { fontSize: 52, marginBottom: 10 },
  sosModalTitle: {
    fontSize: F(21), fontWeight: '900', color: C.ink,
    marginBottom: 6, letterSpacing: 1,
  },
  sosModalSub: {
    fontSize: F(13), color: C.sub,
    textAlign: 'center', lineHeight: F(20),
    marginBottom: 20, paddingHorizontal: 8,
  },
  sosContactList: {
    width: '100%', backgroundColor: C.itemBg,
    borderRadius: 14, padding: 12, marginBottom: 20, gap: 10,
    borderWidth: 1, borderColor: C.border,
  },
  sosContactRow:       { flexDirection: 'row', alignItems: 'center' },
  sosContactAvatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
    borderWidth: 1, borderColor: C.border,
  },
  sosContactAvatarText: { color: C.primary, fontSize: F(14), fontWeight: '700' },
  sosContactInfo:       { flex: 1 },
  sosContactName:       { fontSize: F(14), fontWeight: '700', color: C.ink },
  sosPrimaryTag:        { fontSize: F(11), color: C.warning, fontWeight: '600' },
  sosContactPhone:      { fontSize: F(12), color: C.sub },
  sosNoContactHint: {
    fontSize: F(13), color: C.sub,
    textAlign: 'center', marginBottom: 20, fontStyle: 'italic',
  },
  sosConfirmBtn: {
    width: '100%', borderRadius: 16, marginBottom: 10,
    overflow: 'hidden',
    shadowColor: C.sos1,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  sosConfirmGradient: {
    paddingVertical: 18, alignItems: 'center',
    minHeight: 58, justifyContent: 'center',
  },
  sosConfirmBtnText: { color: C.white, fontSize: F(17), fontWeight: '900' },
  sosCancelBtn:      { paddingVertical: 14, width: '100%', alignItems: 'center', minHeight: 50 },
  sosCancelBtnText:  { color: C.sub, fontSize: F(15), fontWeight: '600' },

  // ── 配對 Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: C.modalOverlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: C.border,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: 'center', marginBottom: 18,
  },
  modalTitleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 20,
  },
  modalTitle: { fontSize: F(18), fontWeight: '800', color: C.ink, letterSpacing: 1 },
  modalCloseBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.itemBg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  modalCloseBtnText: { fontSize: 14, color: C.sub, fontWeight: '700' },
  modalCodeCard: {
    borderRadius: 18, paddingVertical: 26,
    paddingHorizontal: 16, alignItems: 'center', marginBottom: 14,
  },
  modalCodeLabel: {
    color: 'rgba(255,248,236,0.65)',
    fontSize: F(11), fontWeight: '600',
    letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase',
  },
  modalCodeValue: {
    color: C.white, fontSize: F(36),
    fontWeight: '900', letterSpacing: 8,
  },
  modalShareBtn: {
    backgroundColor: C.itemBg,
    borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginBottom: 12,
    borderWidth: 1.5, borderColor: C.primary, minHeight: 52,
  },
  modalShareBtnText: { color: C.primary, fontSize: F(14), fontWeight: '700' },
  modalTip: {
    fontSize: F(12), color: C.sub,
    textAlign: 'center', lineHeight: F(18),
    marginBottom: 16, paddingHorizontal: 8,
  },
  modalDivider:    { height: 1, backgroundColor: C.border, marginBottom: 14 },
  modalSectionTitle: {
    fontSize: F(12), fontWeight: '700', color: C.sub,
    letterSpacing: 1, marginBottom: 10,
  },
  modalSectionCount: { fontWeight: '400', fontSize: F(11) },
  modalEmptyRow:   { alignItems: 'center', paddingVertical: 16, marginBottom: 4 },
  modalEmptyText:  { fontSize: F(14), color: C.sub, fontWeight: '600', marginBottom: 4 },
  modalEmptyHint:  { fontSize: F(11), color: C.border },
  modalMemberRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalMemberAvatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
    borderWidth: 1, borderColor: C.border,
  },
  modalMemberAvatarText: { color: C.primary, fontSize: F(16), fontWeight: '700' },
  modalMemberInfo:  { flex: 1 },
  modalMemberName:  { fontSize: F(14), fontWeight: '700', color: C.ink },
  modalMemberDate:  { fontSize: F(11), color: C.sub, marginTop: 2 },
  modalMemberCheck: { fontSize: 18, color: C.matcha, fontWeight: '700' },
  modalCloseFullBtn: {
    marginTop: 18, backgroundColor: C.itemBg,
    borderRadius: 14, paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1, borderColor: C.border, minHeight: 52,
  },
  modalCloseFullBtnText: { fontSize: F(14), fontWeight: '700', color: C.sub },

  // ── 跌倒偵測 Modal ──
  fallModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(31,42,58,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  fallModalBox: {
    backgroundColor: C.cardBg,
    borderRadius: 28,
    padding: 32,
    width: '100%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: C.warning,
    shadowColor: C.primaryDark,
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 14,
  },
  fallModalIcon: {fontSize: 64, marginBottom: 12},
  fallModalTitle: {
    fontSize: F(28),
    fontWeight: '900',
    color: C.ink,
    marginBottom: 6,
    letterSpacing: 2,
  },
  fallModalSub: {
    fontSize: F(14),
    color: C.sub,
    marginBottom: 20,
  },
  fallCountdownTrack: {
    width: '100%',
    height: 10,
    backgroundColor: 'rgba(201,133,32,0.2)',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 10,
  },
  fallCountdownFill: {
    height: '100%',
    backgroundColor: C.warning,
    borderRadius: 5,
  },
  fallCountdownText: {
    fontSize: F(14),
    color: C.warning,
    fontWeight: '700',
    marginBottom: 28,
    textAlign: 'center',
  },
  fallOkBtn: {
    backgroundColor: C.matcha,
    borderRadius: 18,
    paddingVertical: 20,
    width: '100%',
    alignItems: 'center',
    shadowColor: C.matcha,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
    minHeight: 72,
    justifyContent: 'center',
  },
  fallOkBtnText: {
    color: C.white,
    fontSize: F(22),
    fontWeight: '900',
    letterSpacing: 1,
  },

});
