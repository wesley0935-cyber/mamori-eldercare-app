import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
  Modal,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {
  getNotificationSettings,
  saveNotificationSettings,
  type NotificationSettings,
} from '../../services/NotificationSettingsService';
import {
  getAppRole,
  getFamilyRole,
  clearAllAppData,
  type AppRole,
  type FamilyRole,
} from '../../services/ProfileService';
import {useAppContext} from '../../context/AppContext';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';

const COLORS = {
  background: '#F0F3FA',
  deepBlueStart: '#1B2B5B',
  deepBlueEnd: '#2D3F74',
  safe: '#3DB87A',
  sos: '#FF4444',
  warning: '#F59E0B',
  white: '#FFFFFF',
  cardBg: '#FFFFFF',
  textPrimary: '#1A1A2E',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  locked: '#9CA3AF',
  danger: '#C0392B',
  dangerLight: '#FDECEA',
};

interface SettingRow {
  key: keyof NotificationSettings;
  emoji: string;
  label: string;
  desc: string;
}

interface LockedRow {
  emoji: string;
  label: string;
  desc: string;
}

const SETTING_ROWS: SettingRow[] = [
  {
    key: 'morningActivity',
    emoji: '🌙',
    label: '晨間活動通知',
    desc: '05:00–06:59 第一次喚醒螢幕時通知',
  },
  {
    key: 'wakeUp',
    emoji: '☀️',
    label: '起床通知',
    desc: '07:00–11:59 第一次喚醒螢幕時通知',
  },
  {
    key: 'fortuneViewed',
    emoji: '📰',
    label: '看了運勢／新聞通知',
    desc: '長輩點擊分享按鈕後通知',
  },
  {
    key: 'missedMedicine',
    emoji: '💊',
    label: '服藥未打勾提醒',
    desc: '超過服藥時間 2 小時仍未打勾時通知',
  },
  {
    key: 'inactivityAlert',
    emoji: '📵',
    label: '長時間未活躍警報',
    desc: '連續 4 小時無任何手機活動時通知',
  },
  {
    key: 'lowBattery',
    emoji: '🔋',
    label: '低電量提醒',
    desc: '手機電量低於 15% 時通知',
  },
];

const LOCKED_ROWS: LockedRow[] = [
  {
    emoji: '🆘',
    label: 'SOS 緊急求救',
    desc: '長輩按下求援時立即通知（強制開啟）',
  },
  {
    emoji: '🤸',
    label: '跌倒偵測',
    desc: '偵測到跌倒動作時立即通知（強制開啟）',
  },
];

const ROLE_LABELS: Record<AppRole, string> = {
  elder: '長輩端',
  family: '家屬端',
};

const FAMILY_ROLE_LABELS: Record<FamilyRole, string> = {
  admin: '管理員',
  viewer: '查看者',
};

function ToggleRow({
  row,
  value,
  onToggle,
}: {
  row: SettingRow;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowEmoji}>{row.emoji}</Text>
      <View style={styles.rowInfo}>
        <Text style={styles.rowLabel}>{row.label}</Text>
        <Text style={styles.rowDesc}>{row.desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{false: COLORS.border, true: COLORS.safe}}
        thumbColor={COLORS.white}
        accessibilityLabel={`${row.label} ${value ? '已開啟' : '已關閉'}`}
      />
    </View>
  );
}

function LockedRowItem({row}: {row: LockedRow}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowEmoji}>{row.emoji}</Text>
      <View style={styles.rowInfo}>
        <Text style={styles.rowLabel}>{row.label}</Text>
        <Text style={styles.rowDesc}>{row.desc}</Text>
      </View>
      <View style={styles.lockedBadge}>
        <Text style={styles.lockedIcon}>🔒</Text>
        <Switch
          value={true}
          disabled
          trackColor={{true: COLORS.safe}}
          thumbColor={COLORS.white}
        />
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation();
  const {resetApp, showPermissionGuide, logoutFamily} = useAppContext();
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  const [settings, setSettings] = useState<NotificationSettings>({
    morningActivity: true,
    wakeUp: true,
    fortuneViewed: true,
    missedMedicine: true,
    inactivityAlert: true,
    lowBattery: true,
  });
  const [currentRole, setCurrentRole] = useState<AppRole | null>(null);
  const [familyRole, setFamilyRole] = useState<FamilyRole>('admin');
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [leaveModalVisible, setLeaveModalVisible] = useState(false);

  const load = useCallback(async () => {
    const [s, role, fr] = await Promise.all([
      getNotificationSettings(),
      getAppRole(),
      getFamilyRole(),
    ]);
    setSettings(s);
    setCurrentRole(role);
    setFamilyRole(fr);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (key: keyof NotificationSettings) => {
    if (key === 'inactivityAlert' && settings.inactivityAlert) {
      Alert.alert(
        '⚠️ 確認關閉警報？',
        '長時間未活躍警報是偵測長輩超過4小時沒有使用手機的重要安全功能。關閉後將不會收到任何長輩無活躍的通知。',
        [
          {text: '確認關閉', onPress: () => applyToggle(key)},
          {text: '取消', style: 'cancel'},
        ],
        {cancelable: true},
      );
      return;
    }
    applyToggle(key);
  };

  const applyToggle = async (key: keyof NotificationSettings) => {
    const updated = {...settings, [key]: !settings[key]};
    setSettings(updated);
    await saveNotificationSettings(updated);
  };

  // 安全登出 Google（未登入時不拋錯）
  const signOutGoogle = async () => {
    try {
      await GoogleSignin.signOut();
    } catch {
      // 未曾用 Google 登入或已登出，忽略
    }
  };

  const handleLogout = async () => {
    setLogoutModalVisible(false);
    await signOutGoogle();
    await AsyncStorage.multiRemove([
      'familyToken',
      'familyEmail',
      'familyName',
      'familyPhoto',
    ]);
    logoutFamily();
  };

  const handleLeaveFamily = async () => {
    setLeaveModalVisible(false);
    await signOutGoogle();
    await clearAllAppData();
    resetApp();
  };

  const handleResetPress = () => {
    setConfirmText('');
    setResetModalVisible(true);
  };

  const handleResetConfirm = async () => {
    if (confirmText.trim() !== '確認重設') {
      Alert.alert('輸入有誤', '請輸入「確認重設」以繼續');
      return;
    }
    setResetting(true);
    setResetModalVisible(false);
    await signOutGoogle();
    await clearAllAppData();
    resetApp();
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="返回">
          <Text style={styles.backBtnText}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>設定</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>可調整通知</Text>
        <View style={styles.card}>
          {SETTING_ROWS.map((row, idx) => (
            <View key={row.key}>
              <ToggleRow
                row={row}
                value={settings[row.key]}
                onToggle={() => toggle(row.key)}
              />
              {idx < SETTING_ROWS.length - 1 && (
                <View style={styles.divider} />
              )}
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>強制開啟（無法關閉）</Text>
        <View style={styles.card}>
          {LOCKED_ROWS.map((row, idx) => (
            <View key={row.emoji}>
              <LockedRowItem row={row} />
              {idx < LOCKED_ROWS.length - 1 && (
                <View style={styles.divider} />
              )}
            </View>
          ))}
        </View>

        <Text style={styles.hint}>
          所有設定即時生效，不影響已發出的通知。
        </Text>

        {/* ── 關於 ── */}
        <Text style={styles.sectionTitle}>關於</Text>
        <View style={styles.card}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>目前身份</Text>
            <Text style={styles.aboutValue}>
              {currentRole ? ROLE_LABELS[currentRole] : '—'}
            </Text>
          </View>
          {currentRole === 'family' && (
            <>
              <View style={styles.divider} />
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>家屬權限</Text>
                <View style={[
                  styles.roleBadge,
                  familyRole === 'admin' ? styles.roleBadgeAdmin : styles.roleBadgeViewer,
                ]}>
                  <Text style={[
                    styles.roleBadgeText,
                    familyRole === 'admin' ? styles.roleBadgeTextAdmin : styles.roleBadgeTextViewer,
                  ]}>
                    {FAMILY_ROLE_LABELS[familyRole]}
                  </Text>
                </View>
              </View>
            </>
          )}
          <View style={styles.divider} />
          {currentRole === 'family' && familyRole === 'viewer' && (
            <>
              <TouchableOpacity
                style={styles.leaveFamilyBtn}
                onPress={() => setLeaveModalVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="退出此家庭">
                <Text style={styles.leaveFamilyBtnText}>退出此家庭</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
            </>
          )}
          {currentRole === 'family' && (
            <>
              <TouchableOpacity
                style={styles.logoutBtn}
                onPress={() => setLogoutModalVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="登出">
                <Text style={styles.logoutBtnText}>登出</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
            </>
          )}
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={handleResetPress}
            accessibilityRole="button"
            accessibilityLabel="重新設定身份">
            <Text style={styles.resetBtnText}>重新設定身份</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.permGuideBtn}
            onPress={showPermissionGuide}
            accessibilityRole="button"
            accessibilityLabel="重新查看權限設定說明">
            <Text style={styles.permGuideBtnText}>重新查看權限設定說明</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* ── 退出此家庭 Modal ── */}
      <Modal
        visible={leaveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLeaveModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>確認退出？</Text>
            <Text style={styles.modalBody}>
              退出後將無法查看長輩狀態
            </Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setLeaveModalVisible(false)}>
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalConfirmBtn]}
                onPress={handleLeaveFamily}>
                <Text style={styles.modalConfirmText}>確認退出</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 登出 Modal ── */}
      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>確認登出？</Text>
            <Text style={styles.modalBody}>
              登出後需重新使用 Google 帳號登入，配對的長輩資料會保留。
            </Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setLogoutModalVisible(false)}>
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalConfirmBtn]}
                onPress={handleLogout}>
                <Text style={styles.modalConfirmText}>確認登出</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 確認重設 Modal ── */}
      <Modal
        visible={resetModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setResetModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>重新設定身份</Text>
            <Text style={styles.modalBody}>
              此操作將清除所有資料（配對紀錄、藥物清單、設定），並回到身份選擇頁面。{'\n\n'}
              請輸入「確認重設」以繼續：
            </Text>
            <TextInput
              style={styles.modalInput}
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder="確認重設"
              placeholderTextColor="#9CA3AF"
              autoFocus
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setResetModalVisible(false)}>
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalConfirmBtn,
                  confirmText.trim() !== '確認重設' && styles.modalConfirmBtnDisabled,
                ]}
                onPress={handleResetConfirm}
                disabled={resetting || confirmText.trim() !== '確認重設'}>
                <Text style={styles.modalConfirmText}>
                  {resetting ? '重設中...' : '確認重設'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: COLORS.background},
  header: {
    backgroundColor: COLORS.deepBlueStart,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: {minWidth: 60},
  backBtnText: {color: COLORS.white, fontSize: 18, fontWeight: '600'},
  headerTitle: {
    flex: 1,
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  scroll: {flex: 1},
  scrollContent: {padding: 16},
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 8,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 76,
  },
  rowEmoji: {fontSize: 24, marginRight: 12, width: 30, textAlign: 'center'},
  rowInfo: {flex: 1, paddingRight: 12},
  rowLabel: {fontSize: 16, fontWeight: '600', color: COLORS.textPrimary},
  rowDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 3,
    lineHeight: 18,
  },
  lockedBadge: {flexDirection: 'row', alignItems: 'center', gap: 4},
  lockedIcon: {fontSize: 14},
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 16,
  },
  hint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 20,
    marginBottom: 8,
  },

  // ── 關於區塊 ──
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 56,
  },
  aboutLabel: {fontSize: 16, fontWeight: '600', color: COLORS.textPrimary},
  aboutValue: {fontSize: 16, color: COLORS.textSecondary, fontWeight: '500'},
  roleBadge: {borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4},
  roleBadgeAdmin:  {backgroundColor: '#EBF5FB'},
  roleBadgeViewer: {backgroundColor: '#FEF3C7'},
  roleBadgeText: {fontSize: 14, fontWeight: '700'},
  roleBadgeTextAdmin:  {color: '#1B4F72'},
  roleBadgeTextViewer: {color: '#92400E'},
  permGuideBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permGuideBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  leaveFamilyBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveFamilyBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.locked,
  },
  logoutBtn: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  resetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.danger,
  },

  bottomPad: {height: 24},

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: COLORS.textPrimary,
    marginBottom: 20,
    minHeight: 52,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  modalCancelBtn: {
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modalConfirmBtn: {
    backgroundColor: COLORS.danger,
  },
  modalConfirmBtnDisabled: {
    backgroundColor: COLORS.locked,
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
});
