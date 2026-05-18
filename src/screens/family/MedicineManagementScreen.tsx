import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {
  getMedications,
  addMedication,
  updateMedication,
  deleteMedication,
  getDailyTakenState,
  getEffectiveTakenState,
  PERIOD_LABELS,
  type Medication,
  type MedPeriod,
  type DailyTakenState,
} from '../../services/MedicationStorageService';
import {familyCancelMedicationTaken} from '../../services/MedicationReminderService';
import {
  getElderProfile,
  getElderDisplayName,
  getFamilyRole,
  type FamilyRole,
} from '../../services/ProfileService';

const COLORS = {
  background: '#F0F3FA',
  deepBlueStart: '#1B2B5B',
  deepBlueEnd: '#2D3F74',
  safe: '#3DB87A',
  warning: '#F59E0B',
  sos: '#FF4444',
  white: '#FFFFFF',
  cardBg: '#FFFFFF',
  textPrimary: '#1A1A2E',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
};

const PERIODS: {key: MedPeriod; label: string}[] = [
  {key: 'morning', label: '早'},
  {key: 'noon',    label: '午'},
  {key: 'evening', label: '晚'},
  {key: 'bedtime', label: '睡前'},
];

const EMPTY_DRAFT: Omit<Medication, 'id'> = {
  name: '',
  time: '08:00',
  period: 'morning',
  note: '',
};

// ─── Simple time stepper ──────────────────────────────────────────────────────

function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  const inc = () => onChange(value + step > max ? min : value + step);
  const dec = () => onChange(value - step < min ? max - (step - 1) : value - step);
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepBtn} onPress={inc}>
        <Text style={styles.stepBtnText}>▲</Text>
      </TouchableOpacity>
      <Text style={styles.stepValue}>{String(value).padStart(2, '0')}</Text>
      <TouchableOpacity style={styles.stepBtn} onPress={dec}>
        <Text style={styles.stepBtnText}>▼</Text>
      </TouchableOpacity>
    </View>
  );
}

function TimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const parts = value.split(':').map(Number);
  const h = isNaN(parts[0]) ? 8 : parts[0];
  const m = isNaN(parts[1]) ? 0 : parts[1];

  const setH = (newH: number) =>
    onChange(`${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  const setM = (newM: number) =>
    onChange(`${String(h).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);

  return (
    <View style={styles.timePicker}>
      <Stepper value={h} onChange={setH} min={0} max={23} />
      <Text style={styles.timeColon}>:</Text>
      <Stepper value={m} onChange={setM} min={0} max={55} step={5} />
    </View>
  );
}

// ─── Add/Edit modal ───────────────────────────────────────────────────────────

interface MedModalProps {
  visible: boolean;
  initial: Omit<Medication, 'id'> | null;
  onSave: (draft: Omit<Medication, 'id'>) => void;
  onCancel: () => void;
}

function MedModal({visible, initial, onSave, onCancel}: MedModalProps) {
  const [draft, setDraft] = useState<Omit<Medication, 'id'>>(EMPTY_DRAFT);

  useEffect(() => {
    setDraft(initial ?? EMPTY_DRAFT);
  }, [initial, visible]);

  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) =>
    setDraft(prev => ({...prev, [k]: v}));

  const handleSave = () => {
    if (!draft.name.trim()) {
      Alert.alert('提示', '請輸入藥名');
      return;
    }
    onSave({...draft, name: draft.name.trim(), note: draft.note.trim()});
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {initial ? '編輯藥物' : '新增藥物'}
          </Text>

          {/* 藥名 */}
          <Text style={styles.fieldLabel}>藥名 *</Text>
          <TextInput
            style={styles.textInput}
            value={draft.name}
            onChangeText={v => set('name', v)}
            placeholder="例：血壓藥"
            placeholderTextColor={COLORS.textSecondary}
            maxLength={30}
          />

          {/* 服用時間 */}
          <Text style={styles.fieldLabel}>服用時間</Text>
          <TimePicker value={draft.time} onChange={v => set('time', v)} />

          {/* 服用時段 */}
          <Text style={styles.fieldLabel}>服用時段</Text>
          <View style={styles.periodRow}>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[
                  styles.periodBtn,
                  draft.period === p.key && styles.periodBtnActive,
                ]}
                onPress={() => set('period', p.key)}>
                <Text
                  style={[
                    styles.periodBtnText,
                    draft.period === p.key && styles.periodBtnTextActive,
                  ]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 備註 */}
          <Text style={styles.fieldLabel}>備註</Text>
          <TextInput
            style={styles.textInput}
            value={draft.note}
            onChangeText={v => set('note', v)}
            placeholder="例：早餐後（選填）"
            placeholderTextColor={COLORS.textSecondary}
            maxLength={40}
          />

          {/* 按鈕 */}
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>儲存</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Medication row ───────────────────────────────────────────────────────────

function MedRow({
  med,
  takenAt,
  onEdit,
  onDelete,
  onCancelTaken,
  isViewer,
}: {
  med: Medication;
  takenAt: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onCancelTaken: () => void;
  isViewer: boolean;
}) {
  const periodLabel = PERIOD_LABELS[med.period];
  const context = med.note || periodLabel;

  const confirmDelete = () => {
    Alert.alert('刪除藥物', `確定刪除「${med.name}」？`, [
      {text: '取消', style: 'cancel'},
      {text: '刪除', style: 'destructive', onPress: onDelete},
    ]);
  };

  return (
    <View style={styles.medRow}>
      <View style={styles.medLeft}>
        <View style={styles.medNameRow}>
          <Text style={styles.medName}>{med.name}</Text>
          {takenAt && (
            <View style={styles.takenBadge}>
              <Text style={styles.takenBadgeText}>✓ {takenAt}</Text>
            </View>
          )}
        </View>
        <Text style={styles.medMeta}>{context}・{med.time}</Text>
      </View>
      {!isViewer && (
        <View style={styles.medActions}>
          {takenAt && (
            <TouchableOpacity style={styles.cancelTakenBtn} onPress={onCancelTaken}>
              <Text style={styles.cancelTakenText}>取消打勾</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
            <Text style={styles.editBtnText}>編輯</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
            <Text style={styles.deleteBtnText}>刪除</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MedicineManagementScreen() {
  const navigation = useNavigation();
  const [meds, setMeds] = useState<Medication[]>([]);
  const [takenState, setTakenState] = useState<DailyTakenState>({});
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Medication | null>(null);
  const [familyRole, setFamilyRole] = useState<FamilyRole>('admin');

  const load = useCallback(async () => {
    const [loadedMeds, role] = await Promise.all([
      getMedications(),
      getFamilyRole(),
    ]);
    const loadedTaken = await getEffectiveTakenState(loadedMeds);
    setMeds(loadedMeds);
    setTakenState(loadedTaken);
    setFamilyRole(role);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancelTaken = async (med: Medication) => {
    const elderName = await getElderDisplayName();
    Alert.alert(
      '取消服藥記錄',
      `確認幫 ${elderName} 取消「${med.name}」${med.time} 的服藥記錄？`,
      [
        {text: '保留', style: 'cancel'},
        {
          text: '確認取消',
          style: 'destructive',
          onPress: async () => {
            const updated = await familyCancelMedicationTaken(med, elderName);
            setTakenState({...updated});
          },
        },
      ],
      {cancelable: true},
    );
  };

  const openAdd = () => {
    setEditTarget(null);
    setModalVisible(true);
  };

  const openEdit = (med: Medication) => {
    setEditTarget(med);
    setModalVisible(true);
  };

  const handleSave = async (draft: Omit<Medication, 'id'>) => {
    if (editTarget) {
      setMeds(await updateMedication({...draft, id: editTarget.id}));
    } else {
      setMeds(await addMedication(draft));
    }
    setModalVisible(false);
  };

  const handleDelete = async (id: string) => {
    setMeds(await deleteMedication(id));
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
        <Text style={styles.headerTitle}>藥物管理</Text>
        {familyRole === 'admin' ? (
          <TouchableOpacity
            style={styles.addHeaderBtn}
            onPress={openAdd}
            accessibilityRole="button"
            accessibilityLabel="新增藥物">
            <Text style={styles.addHeaderBtnText}>＋ 新增</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.addHeaderBtn} />
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {familyRole === 'viewer' && (
          <View style={styles.viewerBanner}>
            <Text style={styles.viewerBannerText}>👁 您是查看者，無法修改藥物設定</Text>
          </View>
        )}
        {meds.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>💊</Text>
            <Text style={styles.emptyText}>尚無藥物記錄</Text>
            <Text style={styles.emptyHint}>點擊「＋ 新增」加入第一筆藥物</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {meds.map((med, idx) => (
              <View key={med.id}>
                <MedRow
                  med={med}
                  takenAt={takenState[med.id] ?? null}
                  onEdit={() => openEdit(med)}
                  onDelete={() => handleDelete(med.id)}
                  onCancelTaken={() => handleCancelTaken(med)}
                  isViewer={familyRole === 'viewer'}
                />
                {idx < meds.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        )}

        <Text style={styles.hint}>
          💡 長輩端服藥清單會自動同步此處設定
        </Text>
        <View style={styles.bottomPad} />
      </ScrollView>

      <MedModal
        visible={modalVisible}
        initial={
          editTarget
            ? {
                name: editTarget.name,
                time: editTarget.time,
                period: editTarget.period,
                note: editTarget.note,
              }
            : null
        }
        onSave={handleSave}
        onCancel={() => setModalVisible(false)}
      />
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
  backBtn: {paddingRight: 12},
  backBtnText: {color: COLORS.white, fontSize: 18, fontWeight: '600'},
  headerTitle: {
    flex: 1,
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  addHeaderBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addHeaderBtnText: {color: COLORS.white, fontSize: 15, fontWeight: '700'},
  scroll: {flex: 1},
  scrollContent: {padding: 16},
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
  medRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    minHeight: 72,
  },
  medLeft: {flex: 1, marginRight: 8},
  medNameRow: {flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap'},
  medName: {fontSize: 17, fontWeight: '700', color: COLORS.textPrimary},
  takenBadge: {
    backgroundColor: '#D8EED8', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  takenBadgeText: {fontSize: 12, color: '#3A7A3A', fontWeight: '600'},
  medMeta: {fontSize: 13, color: COLORS.textSecondary, marginTop: 3},
  medActions: {flexDirection: 'row', gap: 8, flexShrink: 0},
  cancelTakenBtn: {
    backgroundColor: '#FEF8E7',
    borderRadius: 8, borderWidth: 1, borderColor: '#F59E0B',
    paddingHorizontal: 10, paddingVertical: 7,
  },
  cancelTakenText: {color: '#B45309', fontSize: 13, fontWeight: '600'},
  editBtn: {
    backgroundColor: COLORS.deepBlueEnd,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  editBtnText: {color: COLORS.white, fontSize: 13, fontWeight: '600'},
  deleteBtn: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  deleteBtnText: {color: COLORS.sos, fontSize: 13, fontWeight: '600'},
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {fontSize: 48, marginBottom: 12},
  emptyText: {fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 6},
  emptyHint: {fontSize: 14, color: COLORS.textSecondary},
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
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 20,
    textAlign: 'center',
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 14,
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
    backgroundColor: '#FAFAFA',
  },
  // Time picker
  timePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingVertical: 8,
  },
  stepper: {alignItems: 'center', paddingHorizontal: 24},
  stepBtn: {padding: 8},
  stepBtnText: {fontSize: 16, color: COLORS.deepBlueEnd, fontWeight: '700'},
  stepValue: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textPrimary,
    minWidth: 44,
    textAlign: 'center',
  },
  timeColon: {fontSize: 28, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4},
  // Period
  periodRow: {flexDirection: 'row', gap: 10},
  periodBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  periodBtnActive: {backgroundColor: COLORS.deepBlueStart},
  periodBtnText: {fontSize: 15, fontWeight: '600', color: COLORS.textSecondary},
  periodBtnTextActive: {color: COLORS.white},
  // Modal buttons
  modalBtns: {flexDirection: 'row', gap: 12, marginTop: 24},
  cancelBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelBtnText: {fontSize: 16, fontWeight: '600', color: COLORS.textSecondary},
  saveBtn: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: COLORS.deepBlueStart,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnText: {fontSize: 16, fontWeight: '700', color: COLORS.white},
});
