import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {
  getThresholdSettings,
  saveThresholdSettings,
  THRESHOLD_DEFAULTS,
  type ThresholdSettings,
  type FallDetectionSensitivity,
} from '../../services/ThresholdSettingsService';
import {getFamilyRole, getAppRole, type FamilyRole, type AppRole} from '../../services/ProfileService';

const COLORS = {
  background: '#F0F3FA',
  deepBlueStart: '#1B2B5B',
  deepBlueEnd: '#2D3F74',
  safe: '#3DB87A',
  white: '#FFFFFF',
  cardBg: '#FFFFFF',
  textPrimary: '#1A1A2E',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  segmentBg: '#F3F4F6',
};

// ─── Segmented selector ───────────────────────────────────────────────────────

function SegmentSelector<T extends string | number>({
  options,
  labels,
  value,
  onChange,
  disabled = false,
}: {
  options: readonly T[];
  labels: readonly string[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.segmentRow, disabled && styles.controlDisabled]}>
      {options.map((opt, i) => (
        <TouchableOpacity
          key={String(opt)}
          style={[styles.segmentBtn, value === opt && styles.segmentBtnActive]}
          onPress={() => onChange(opt)}
          disabled={disabled}
          accessibilityRole="radio"
          accessibilityState={{selected: value === opt, disabled}}
          accessibilityLabel={labels[i]}>
          <Text
            style={[
              styles.segmentText,
              value === opt && styles.segmentTextActive,
            ]}>
            {labels[i]}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Hour stepper ─────────────────────────────────────────────────────────────

function HourStepper({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (h: number) => void;
  disabled?: boolean;
}) {
  const dec = () => onChange((value - 1 + 24) % 24);
  const inc = () => onChange((value + 1) % 24);
  const display = `${String(value).padStart(2, '0')}:00`;

  return (
    <View style={[styles.stepperBox, disabled && styles.controlDisabled]}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <TouchableOpacity
          style={styles.stepperArrowBtn}
          onPress={inc}
          disabled={disabled}
          accessibilityState={{disabled}}
          accessibilityLabel={`${label} 增加`}>
          <Text style={styles.stepperArrow}>▲</Text>
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{display}</Text>
        <TouchableOpacity
          style={styles.stepperArrowBtn}
          onPress={dec}
          disabled={disabled}
          accessibilityState={{disabled}}
          accessibilityLabel={`${label} 減少`}>
          <Text style={styles.stepperArrow}>▼</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Setting row wrapper ──────────────────────────────────────────────────────

function SettingRow({
  emoji,
  label,
  desc,
  children,
}: {
  emoji: string;
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingHeader}>
        <Text style={styles.settingEmoji}>{emoji}</Text>
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      {children}
      <Text style={styles.settingDesc}>{desc}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const INACTIVITY_OPTIONS = [2, 4, 6, 8] as const;
const INACTIVITY_LABELS  = ['2小時', '4小時', '6小時', '8小時'] as const;

const STEP_OPTIONS = [1000, 3000, 5000, 8000] as const;
const STEP_LABELS  = ['1,000', '3,000', '5,000', '8,000'] as const;

const BATTERY_OPTIONS = [10, 15, 20, 25] as const;
const BATTERY_LABELS  = ['10%', '15%', '20%', '25%'] as const;

const MEDICINE_OPTIONS = [1, 2, 3] as const;
const MEDICINE_LABELS  = ['1小時', '2小時', '3小時'] as const;

const FALL_OPTIONS: readonly FallDetectionSensitivity[] = ['low', 'medium', 'high'] as const;
const FALL_LABELS  = ['低', '中', '高'] as const;

export default function ThresholdSettingsScreen() {
  const navigation = useNavigation();
  const [settings, setSettings] = useState<ThresholdSettings>(THRESHOLD_DEFAULTS);
  const [dirty, setDirty] = useState(false);
  // null = 角色尚未載入。權限判斷一律以 'admin' 為門檻，避免載入期間 fail-open
  const [familyRole, setFamilyRole] = useState<FamilyRole | null>(null);
  const [appRole, setAppRole] = useState<AppRole | null>(null);

  const load = useCallback(async () => {
    const [s, role, ar] = await Promise.all([getThresholdSettings(), getFamilyRole(), getAppRole()]);
    setSettings(s);
    setFamilyRole(role);
    setAppRole(ar);
    setDirty(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function update<K extends keyof ThresholdSettings>(
    key: K,
    value: ThresholdSettings[K],
  ) {
    setSettings(prev => ({...prev, [key]: value}));
    setDirty(true);
  }

  const handleSave = async () => {
    await saveThresholdSettings(settings);
    setDirty(false);
    Alert.alert('已儲存', '閾值設定已成功儲存並即時生效。');
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
        <Text style={styles.headerTitle}>閾值設定</Text>
        <TouchableOpacity
          style={[styles.saveBtn, (!dirty || familyRole !== 'admin') && styles.saveBtnDisabled]}
          onPress={familyRole !== 'admin' ? undefined : handleSave}
          disabled={!dirty || familyRole !== 'admin'}
          accessibilityRole="button"
          accessibilityLabel="儲存設定">
          <Text style={[styles.saveBtnText, (!dirty || familyRole !== 'admin') && styles.saveBtnTextDisabled]}>
            儲存
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        {familyRole === 'viewer' && (
          <View style={styles.viewerBanner}>
            <Text style={styles.viewerBannerText}>👁 您是查看者，無法修改閾值設定</Text>
          </View>
        )}

        <View style={styles.card}>
          {/* 1. 無活躍警報時間 */}
          <SettingRow
            emoji="📵"
            label="無活躍警報時間"
            desc="長輩超過此時間未使用手機將發送警報">
            <SegmentSelector
              options={INACTIVITY_OPTIONS}
              labels={INACTIVITY_LABELS}
              value={settings.inactivityHours}
              onChange={v => update('inactivityHours', v)}
              disabled={familyRole !== 'admin'}
            />
          </SettingRow>

          {appRole !== 'family' && (
            <>
              <View style={styles.divider} />
              {/* 2. 每日步數目標 — 長輩端設定，家屬端隱藏 */}
              <SettingRow
                emoji="👟"
                label="每日步數目標"
                desc="低於此步數將顯示橘色警示">
                <SegmentSelector
                  options={STEP_OPTIONS}
                  labels={STEP_LABELS}
                  value={settings.stepGoal}
                  onChange={v => update('stepGoal', v)}
                  disabled={familyRole !== 'admin'}
                />
              </SettingRow>
            </>
          )}

          <View style={styles.divider} />

          {/* 3. 低電量警報門檻 */}
          <SettingRow
            emoji="🔋"
            label="低電量警報門檻"
            desc="低於此電量將通知家屬提醒充電">
            <SegmentSelector
              options={BATTERY_OPTIONS}
              labels={BATTERY_LABELS}
              value={settings.lowBatteryPct}
              onChange={v => update('lowBatteryPct', v)}
              disabled={familyRole !== 'admin'}
            />
          </SettingRow>

          <View style={styles.divider} />

          {/* 4. 服藥未打勾警報時間 */}
          <SettingRow
            emoji="💊"
            label="服藥未打勾警報時間"
            desc="超過服藥時間此時限未打勾將通知家屬">
            <SegmentSelector
              options={MEDICINE_OPTIONS}
              labels={MEDICINE_LABELS}
              value={settings.missedMedicineHours}
              onChange={v => update('missedMedicineHours', v)}
              disabled={familyRole !== 'admin'}
            />
          </SettingRow>

          <View style={styles.divider} />

          {/* 5. 睡眠時段 */}
          <SettingRow
            emoji="🌙"
            label="睡眠時段"
            desc="此時段內不發送任何警報通知">
            <View style={styles.sleepRow}>
              <HourStepper
                label="開始時間"
                value={settings.sleepStartHour}
                onChange={v => update('sleepStartHour', v)}
                disabled={familyRole !== 'admin'}
              />
              <View style={styles.sleepDash}>
                <Text style={styles.sleepDashText}>至</Text>
              </View>
              <HourStepper
                label="結束時間"
                value={settings.sleepEndHour}
                onChange={v => update('sleepEndHour', v)}
                disabled={familyRole !== 'admin'}
              />
            </View>
          </SettingRow>

          {appRole !== 'family' && (
            <>
              <View style={styles.divider} />
              {/* 6. 跌倒偵測靈敏度 — 長輩端設定，家屬端隱藏 */}
              <SettingRow
                emoji="🛡"
                label="跌倒偵測靈敏度"
                desc="靈敏度越高偵測越敏感，但誤報率也越高。建議從「低」開始調整">
                <SegmentSelector<FallDetectionSensitivity>
                  options={FALL_OPTIONS}
                  labels={FALL_LABELS}
                  value={settings.fallDetectionSensitivity}
                  onChange={v => update('fallDetectionSensitivity', v)}
                  disabled={familyRole !== 'admin'}
                />
              </SettingRow>
            </>
          )}
        </View>

        {dirty && familyRole === 'admin' && (
          <TouchableOpacity
            style={styles.floatSaveBtn}
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel="儲存設定">
            <Text style={styles.floatSaveBtnText}>💾 儲存設定</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.hint}>設定儲存後即時套用至所有監控功能。</Text>
        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: COLORS.background},
  // Header
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
  saveBtn: {
    minWidth: 60,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  saveBtnDisabled: {
    backgroundColor: 'transparent',
  },
  // 查看者（viewer）唯讀時，用於 SegmentSelector / HourStepper 的淡化樣式
  controlDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {color: COLORS.white, fontSize: 15, fontWeight: '700'},
  saveBtnTextDisabled: {color: 'rgba(255,255,255,0.4)'},
  // Scroll
  scroll: {flex: 1},
  scrollContent: {padding: 16},
  // Card
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 16,
  },
  divider: {height: 1, backgroundColor: COLORS.border, marginHorizontal: 16},
  // Setting row
  settingRow: {
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  settingEmoji: {fontSize: 20, marginRight: 8},
  settingLabel: {fontSize: 16, fontWeight: '700', color: COLORS.textPrimary},
  settingDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 10,
    lineHeight: 18,
  },
  // Segment
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.segmentBg,
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: COLORS.deepBlueStart,
    shadowColor: COLORS.deepBlueStart,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  segmentTextActive: {color: COLORS.white},
  // Sleep row
  sleepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sleepDash: {paddingHorizontal: 4},
  sleepDashText: {fontSize: 15, color: COLORS.textSecondary, fontWeight: '600'},
  // Hour stepper
  stepperBox: {
    flex: 1,
    backgroundColor: COLORS.segmentBg,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  stepperLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stepperControls: {alignItems: 'center', gap: 4},
  stepperArrowBtn: {
    width: 44,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 8,
  },
  stepperArrow: {fontSize: 14, color: COLORS.deepBlueStart, fontWeight: '700'},
  stepperValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.deepBlueStart,
    letterSpacing: 1,
    paddingVertical: 4,
    minWidth: 70,
    textAlign: 'center',
  },
  // Float save button (appears when dirty)
  floatSaveBtn: {
    backgroundColor: COLORS.deepBlueStart,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: COLORS.deepBlueStart,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  floatSaveBtnText: {color: COLORS.white, fontSize: 17, fontWeight: '700'},
  hint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  bottomPad: {height: 24},
  viewerBanner: {backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, marginBottom: 14},
  viewerBannerText: {fontSize: 14, color: '#1B4F72', fontWeight: '600'},
});
