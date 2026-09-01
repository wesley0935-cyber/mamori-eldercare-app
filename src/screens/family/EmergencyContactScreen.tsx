import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {
  getEmergencyContacts,
  saveEmergencyContacts,
  RELATIONSHIPS,
  MAX_CONTACTS,
  type EmergencyContact,
  type ContactRelationship,
} from '../../services/EmergencyContactService';
import {
  getFamilyRole,
  getPairedElders,
  type FamilyRole,
  type PairedElder,
} from '../../services/ProfileService';

const COLORS = {
  background: '#F0F3FA',
  deepBlueStart: '#1B2B5B',
  deepBlueEnd: '#2D3F74',
  sos: '#FF4444',
  safe: '#3DB87A',
  warning: '#F59E0B',
  white: '#FFFFFF',
  cardBg: '#FFFFFF',
  textPrimary: '#1A1A2E',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  inputBg: '#F9FAFB',
  primary: '#EFF6FF',
};

function scaleFont(n: number) {
  return Math.round(n * 1.2);
}

// ─── Relationship chip selector ───────────────────────────────────────────────

function RelSelector({
  value,
  onChange,
}: {
  value: ContactRelationship;
  onChange: (v: ContactRelationship) => void;
}) {
  return (
    <View style={styles.relRow}>
      {RELATIONSHIPS.map(r => (
        <TouchableOpacity
          key={r}
          style={[styles.relChip, value === r && styles.relChipActive]}
          onPress={() => onChange(r)}
          accessibilityRole="radio"
          accessibilityState={{selected: value === r}}
          accessibilityLabel={r}>
          <Text style={[styles.relChipText, value === r && styles.relChipTextActive]}>
            {r}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Add/Edit modal ───────────────────────────────────────────────────────────

interface ContactForm {
  name: string;
  phone: string;
  relationship: ContactRelationship;
  isPrimary: boolean;
}

const EMPTY_FORM: ContactForm = {
  name: '',
  phone: '',
  relationship: '子女',
  isPrimary: false,
};

interface FormModalProps {
  visible: boolean;
  editing: EmergencyContact | null;
  hasPrimary: boolean;
  onSave: (form: ContactForm) => void;
  onClose: () => void;
}

function FormModal({visible, editing, hasPrimary, onSave, onClose}: FormModalProps) {
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);

  useEffect(() => {
    if (visible) {
      setForm(
        editing
          ? {
              name: editing.name,
              phone: editing.phone,
              relationship: editing.relationship,
              isPrimary: editing.isPrimary,
            }
          : EMPTY_FORM,
      );
    }
  }, [visible, editing]);

  function set<K extends keyof ContactForm>(key: K, val: ContactForm[K]) {
    setForm(prev => ({...prev, [key]: val}));
  }

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert('請輸入姓名');
      return;
    }
    const cleaned = form.phone.replace(/\s|-/g, '');
    if (cleaned.length < 6) {
      Alert.alert('請輸入有效電話號碼');
      return;
    }
    onSave({...form, name: form.name.trim(), phone: cleaned});
  };

  const title = editing ? '編輯聯絡人' : '新增緊急聯絡人';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>{title}</Text>

            {/* 姓名 */}
            <Text style={styles.fieldLabel}>姓名</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={v => set('name', v)}
              placeholder="例如：王小明"
              placeholderTextColor={COLORS.textSecondary}
              returnKeyType="next"
              accessibilityLabel="聯絡人姓名"
            />

            {/* 電話 */}
            <Text style={styles.fieldLabel}>電話號碼</Text>
            <TextInput
              style={styles.input}
              value={form.phone}
              onChangeText={v => set('phone', v.replace(/[^0-9+\-() ]/g, ''))}
              placeholder="例如：0912345678"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="phone-pad"
              returnKeyType="done"
              accessibilityLabel="電話號碼"
            />

            {/* 關係 */}
            <Text style={styles.fieldLabel}>關係</Text>
            <RelSelector
              value={form.relationship}
              onChange={v => set('relationship', v)}
            />

            {/* 主要聯絡人 */}
            <View style={styles.primaryRow}>
              <View style={styles.primaryInfo}>
                <Text style={styles.primaryLabel}>設為主要聯絡人</Text>
                <Text style={styles.primaryHint}>
                  SOS 時優先撥打此聯絡人電話
                </Text>
              </View>
              <Switch
                value={form.isPrimary}
                onValueChange={v => set('isPrimary', v)}
                trackColor={{false: COLORS.border, true: COLORS.safe}}
                thumbColor={COLORS.white}
                // Disable toggle-off if this is the only primary and it's currently editing
                disabled={editing?.isPrimary && !hasPrimary ? false : false}
                accessibilityLabel="設為主要聯絡人"
              />
            </View>

            {/* Buttons */}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>儲存</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>取消</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Contact card ─────────────────────────────────────────────────────────────

function ContactCard({
  contact,
  onEdit,
  onDelete,
  isViewer,
}: {
  contact: EmergencyContact;
  onEdit: () => void;
  onDelete: () => void;
  isViewer: boolean;
}) {
  return (
    <View style={styles.contactCard}>
      <View style={styles.contactCardLeft}>
        <View style={styles.contactAvatar}>
          <Text style={styles.contactAvatarText}>{contact.name[0]}</Text>
        </View>
        <View style={styles.contactInfo}>
          <View style={styles.contactNameRow}>
            <Text style={styles.contactName}>{contact.name}</Text>
            {contact.isPrimary && (
              <View style={styles.primaryBadge}>
                <Text style={styles.primaryBadgeText}>主要</Text>
              </View>
            )}
            <View style={styles.relBadge}>
              <Text style={styles.relBadgeText}>{contact.relationship}</Text>
            </View>
          </View>
          <Text style={styles.contactPhone}>{contact.phone}</Text>
        </View>
      </View>
      {!isViewer && (
        <View style={styles.contactActions}>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel={`編輯 ${contact.name}`}>
            <Text style={styles.editBtnText}>編輯</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel={`刪除 ${contact.name}`}>
            <Text style={styles.deleteBtnText}>刪除</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function EmergencyContactScreen() {
  const navigation = useNavigation();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<EmergencyContact | null>(null);
  // null = 角色尚未載入。權限判斷一律以 'admin' 為門檻，避免載入期間 fail-open
  const [familyRole, setFamilyRole] = useState<FamilyRole | null>(null);
  const [elders, setElders] = useState<PairedElder[]>([]);
  const [selectedElderId, setSelectedElderId] = useState<string>('');

  // 載入已配對長輩清單
  useEffect(() => {
    async function loadElders() {
      const [list, role] = await Promise.all([getPairedElders(), getFamilyRole()]);
      setElders(list);
      setFamilyRole(role);
      if (list.length > 0) {
        setSelectedElderId(list[0].pairCode);
      }
    }
    loadElders();
  }, []);

  // 當前選中長輩的後端 Elder UUID。以往此處讀全域 backendElderId，
  // 導致多長輩時緊急聯絡人永遠存到「最後配對的那位」身上。
  const selectedBackendElderId =
    elders.find(e => e.pairCode === selectedElderId)?.elderId ?? null;
  const selectedElder = elders.find(e => e.pairCode === selectedElderId);

  const load = useCallback(async () => {
    if (!selectedElderId) { return; }
    setContacts(await getEmergencyContacts(selectedBackendElderId));
  }, [selectedElderId, selectedBackendElderId]);

  useEffect(() => {
    load();
  }, [load]);

  const hasPrimary = contacts.some(c => c.isPrimary);

  const handleSave = async (form: {
    name: string;
    phone: string;
    relationship: ContactRelationship;
    isPrimary: boolean;
  }) => {
    let updated: EmergencyContact[];

    if (editing) {
      // Edit existing
      updated = contacts.map(c => {
        if (c.id === editing.id) {
          return {...c, ...form};
        }
        // If this contact becomes primary, demote others
        return form.isPrimary ? {...c, isPrimary: false} : c;
      });
      // Re-apply the edited contact with correct isPrimary
      updated = updated.map(c =>
        c.id === editing.id ? {...c, ...form} : c,
      );
    } else {
      // New contact
      const newContact: EmergencyContact = {
        id: Date.now().toString(),
        ...form,
      };
      // Demote existing primary if new one claims it
      updated = form.isPrimary
        ? [...contacts.map(c => ({...c, isPrimary: false})), newContact]
        : [...contacts, newContact];
    }

    // If no primary is set, auto-promote the first
    if (!updated.some(c => c.isPrimary) && updated.length > 0) {
      updated[0] = {...updated[0], isPrimary: true};
    }

    await saveEmergencyContacts(updated, selectedBackendElderId);
    setContacts(updated);
    setModalVisible(false);
    setEditing(null);
  };

  const handleDelete = (contact: EmergencyContact) => {
    Alert.alert(
      `刪除 ${contact.name}？`,
      '刪除後此聯絡人將從緊急聯絡名單中移除。',
      [
        {text: '取消', style: 'cancel'},
        {
          text: '確認刪除',
          style: 'destructive',
          onPress: async () => {
            let updated = contacts.filter(c => c.id !== contact.id);
            // Auto-promote first if primary was deleted
            if (contact.isPrimary && updated.length > 0) {
              updated[0] = {...updated[0], isPrimary: true};
            }
            await saveEmergencyContacts(updated, selectedBackendElderId);
            setContacts(updated);
          },
        },
      ],
    );
  };

  const openEdit = (contact: EmergencyContact) => {
    setEditing(contact);
    setModalVisible(true);
  };

  const openAdd = () => {
    setEditing(null);
    setModalVisible(true);
  };

  const canAdd = contacts.length < MAX_CONTACTS;

  return (
    <View style={styles.root}>
      <FormModal
        visible={modalVisible}
        editing={editing}
        hasPrimary={hasPrimary}
        onSave={handleSave}
        onClose={() => {
          setModalVisible(false);
          setEditing(null);
        }}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="返回">
          <Text style={styles.backBtnText}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>緊急聯絡人</Text>
        {familyRole === 'admin' && (
          <TouchableOpacity
            style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}
            onPress={canAdd ? openAdd : undefined}
            disabled={!canAdd}
            accessibilityRole="button"
            accessibilityLabel="新增聯絡人">
            <Text style={[styles.addBtnText, !canAdd && styles.addBtnTextDisabled]}>
              ＋ 新增
            </Text>
          </TouchableOpacity>
        )}
        {familyRole !== 'admin' && <View style={styles.addBtn} />}
      </View>

      {/* 長輩選擇 Tab —— 查看者也可切換，切換屬於「查看」不涉及修改 */}
      {elders.length > 1 && (
        <View style={styles.elderTabBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.elderTabContent}>
            {elders.map(elder => (
              <TouchableOpacity
                key={elder.pairCode}
                style={[styles.elderTab, selectedElderId === elder.pairCode && styles.elderTabActive]}
                onPress={() => setSelectedElderId(elder.pairCode)}>
                <Text style={[styles.elderTabText, selectedElderId === elder.pairCode && styles.elderTabTextActive]}>
                  {elder.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        {familyRole === 'viewer' && (
          <View style={styles.viewerBanner}>
            <Text style={styles.viewerBannerText}>👁 您是查看者，無法修改緊急聯絡人</Text>
          </View>
        )}

        {/* 目前選擇的長輩 */}
        {selectedElder && (
          <View style={styles.elderBanner}>
            <Text style={styles.elderBannerText}>👤 {selectedElder.name} 的緊急聯絡人</Text>
          </View>
        )}

        {/* 說明 */}
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            🆘 最多可設定 {MAX_CONTACTS} 位緊急聯絡人。長輩按下 SOS 時將優先撥打「主要聯絡人」的電話。
          </Text>
          <Text style={styles.capacityText}>
            已設定 {contacts.length} / {MAX_CONTACTS} 位
          </Text>
        </View>

        {/* 聯絡人清單 */}
        {contacts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>尚未設定緊急聯絡人</Text>
            <Text style={styles.emptyHint}>請點擊右上角「＋ 新增」設定</Text>
            <TouchableOpacity style={styles.emptyAddBtn} onPress={openAdd}>
              <Text style={styles.emptyAddBtnText}>立即新增</Text>
            </TouchableOpacity>
          </View>
        ) : (
          contacts.map(c => (
            <ContactCard
              key={c.id}
              contact={c}
              onEdit={() => openEdit(c)}
              onDelete={() => handleDelete(c)}
              isViewer={familyRole !== 'admin'}
            />
          ))
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  addBtn: {
    minWidth: 60,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addBtnDisabled: {backgroundColor: 'transparent'},
  addBtnText: {color: COLORS.white, fontSize: 14, fontWeight: '700'},
  addBtnTextDisabled: {color: 'rgba(255,255,255,0.35)'},
  // Scroll
  // 長輩選擇 Tab（樣式沿用 MedicineManagementScreen，保持兩頁操作一致）
  elderTabBar: {backgroundColor: COLORS.deepBlueEnd, paddingVertical: 8},
  elderTabContent: {paddingHorizontal: 12, gap: 8},
  elderTab: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  elderTabActive: {backgroundColor: '#FFFFFF'},
  elderTabText: {color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600'},
  elderTabTextActive: {color: COLORS.deepBlueStart},
  elderBanner: {
    backgroundColor: '#EFF6FF', borderRadius: 12,
    padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  elderBannerText: {fontSize: 14, color: '#1B4F72', fontWeight: '700'},

  scroll: {flex: 1},
  scrollContent: {padding: 16},
  // Info card
  infoCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.deepBlueEnd,
  },
  infoText: {
    fontSize: scaleFont(13),
    color: COLORS.deepBlueStart,
    lineHeight: 20,
    marginBottom: 6,
  },
  capacityText: {
    fontSize: scaleFont(12),
    color: COLORS.deepBlueEnd,
    fontWeight: '700',
  },
  // Empty state
  emptyCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 36,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  emptyIcon: {fontSize: 48, marginBottom: 12},
  emptyText: {
    fontSize: scaleFont(16),
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  emptyHint: {
    fontSize: scaleFont(13),
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  emptyAddBtn: {
    backgroundColor: COLORS.deepBlueStart,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  emptyAddBtnText: {color: COLORS.white, fontWeight: '700', fontSize: scaleFont(15)},
  // Contact card
  contactCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactCardLeft: {flexDirection: 'row', alignItems: 'center', flex: 1},
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.deepBlueEnd,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contactAvatarText: {color: COLORS.white, fontSize: scaleFont(20), fontWeight: '700'},
  contactInfo: {flex: 1},
  contactNameRow: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4},
  contactName: {fontSize: scaleFont(16), fontWeight: '700', color: COLORS.textPrimary},
  primaryBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  primaryBadgeText: {fontSize: scaleFont(11), fontWeight: '700', color: '#92400E'},
  relBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  relBadgeText: {fontSize: scaleFont(11), fontWeight: '600', color: COLORS.deepBlueEnd},
  contactPhone: {fontSize: scaleFont(14), color: COLORS.textSecondary},
  contactActions: {flexDirection: 'column', gap: 6, marginLeft: 10},
  editBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  editBtnText: {fontSize: scaleFont(13), fontWeight: '700', color: COLORS.deepBlueStart},
  deleteBtn: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  deleteBtnText: {fontSize: scaleFont(13), fontWeight: '700', color: COLORS.sos},
  bottomPad: {height: 24},
  viewerBanner: {backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, marginBottom: 14},
  viewerBannerText: {fontSize: scaleFont(14), color: '#1B4F72', fontWeight: '600'},
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: scaleFont(20),
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 20,
    textAlign: 'center',
  },
  fieldLabel: {
    fontSize: scaleFont(13),
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: scaleFont(16),
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  relRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16},
  relChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBg,
  },
  relChipActive: {
    backgroundColor: COLORS.deepBlueStart,
    borderColor: COLORS.deepBlueStart,
  },
  relChipText: {fontSize: scaleFont(14), color: COLORS.textSecondary, fontWeight: '600'},
  relChipTextActive: {color: COLORS.white},
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  primaryInfo: {flex: 1},
  primaryLabel: {fontSize: scaleFont(15), fontWeight: '700', color: COLORS.textPrimary},
  primaryHint: {fontSize: scaleFont(12), color: COLORS.textSecondary, marginTop: 2},
  saveBtn: {
    backgroundColor: COLORS.deepBlueStart,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  saveBtnText: {color: COLORS.white, fontSize: scaleFont(16), fontWeight: '700'},
  cancelBtn: {paddingVertical: 12, alignItems: 'center'},
  cancelBtnText: {color: COLORS.textSecondary, fontSize: scaleFont(14)},
});
