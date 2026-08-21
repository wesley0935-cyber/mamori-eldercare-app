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
  Clipboard,
  Share,
  Linking,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import type {StackNavigationProp} from '@react-navigation/stack';
import notifee, {AuthorizationStatus} from '@notifee/react-native';
import QRCode from 'react-native-qrcode-svg';
import type {RootStackParamList} from '../../navigation/AppNavigator';
import {
  getPairedElders,
  addPairedElder,
  removePairedElder,
  updateElderPairCode,
  addFamilyMember,
  removeFamilyMember,
  getFamilyProfile,
  getFamilyRole,
  getFamilyMembers,
  generateAndSaveInviteCode,
  getInviteCode,
  generatePairCode,
  generateAndSavePairCode,
  setElderProfile,
  confirmPairingWithCode,
  type PairedElder,
  type FamilyMember,
  type FamilyRole,
  type InviteCode,
  type ElderProfile,
} from '../../services/ProfileService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import StepTrendChart from '../../components/StepTrendChart';
import {
  loadAlerts,
  markAlertResolved,
  type AlertRecord,
} from '../../services/AlertStorageService';

type Nav = StackNavigationProp<RootStackParamList, 'FamilyDashboard'>;

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:        '#F0F3FA',
  primary:   '#274A6E',
  safe:      '#3DB87A',
  sos:       '#FF4444',
  warning:   '#F59E0B',
  white:     '#FFFFFF',
  card:      '#FFFFFF',
  ink:       '#1A1A2E',
  sub:       '#6B7280',
  border:    '#E5E7EB',
};

function sc(n: number) { return Math.round(n * 1.2); }

// AlertRecord 型別來自 AlertStorageService，此處無需重複宣告

// ─── Add Elder Modal ───────────────────────────────────────────────────────────
interface AddElderModalProps {
  visible: boolean;
  onClose: () => void;
  onAdded: (elder: PairedElder) => void;
}

function AddElderModal({visible, onClose, onAdded}: AddElderModalProps) {
  const [step, setStep] = useState<'form' | 'display'>('form');
  const [elderName, setElderName] = useState('');
  const [elderAge, setElderAge] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [codeCreatedAt, setCodeCreatedAt] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const reset = () => {
    setStep('form');
    setElderName('');
    setElderAge('');
    setPairCode('');
    setCodeCreatedAt(Date.now());
    setLoading(false);
    setRegenerating(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleGenerate = async () => {
    const name = elderName.trim();
    const age = parseInt(elderAge, 10);
    if (!name) { Alert.alert('請輸入長輩姓名'); return; }
    if (!elderAge || isNaN(age) || age < 1 || age > 120) {
      Alert.alert('請輸入有效的年齡（1–120）');
      return;
    }
    setLoading(true);
    try {
      const record = await generateAndSavePairCode();
      const profile: ElderProfile = {name, age, pairCode: record.code};
      await setElderProfile(profile);
      setPairCode(record.code);
      setCodeCreatedAt(record.createdAt);
      setStep('display');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const record = await generateAndSavePairCode();
      const name = elderName.trim();
      const age = parseInt(elderAge, 10);
      await setElderProfile({name, age, pairCode: record.code});
      setPairCode(record.code);
      setCodeCreatedAt(record.createdAt);
    } finally {
      setRegenerating(false);
    }
  };

  const handleConfirmPaired = async () => {
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const pairedResult = await confirmPairingWithCode(pairCode);
      let elderId = pairedResult.profile?.elderId ?? undefined;
      if (!elderId) {
        const fallback = await AsyncStorage.getItem('backendElderId');
        elderId = fallback ?? undefined;
      }
      const newElder: PairedElder = {
        pairCode,
        name: elderName.trim(),
        age: parseInt(elderAge, 10),
        pairedAt: now,
        elderId: elderId ?? undefined,
      };
      await addPairedElder(newElder);
      const fp = await getFamilyProfile();
      if (fp) {
        await addFamilyMember({
          name: fp.name,
          pairedAt: now,
          familyId: fp.familyId,
          role: fp.role,
        });
      }

      // 登記家屬裝置 FCM token，確保後續推播能收到
      try {
        const pairingId = await AsyncStorage.getItem('backendPairingId');
        if (pairingId) {
          const messaging = require('@react-native-firebase/messaging').default;
          const { registerFamilyFcmToken } = require('../../api/notificationApi');
          const fcmToken = await messaging().getToken();
          if (fcmToken) {
            await registerFamilyFcmToken(pairingId, fcmToken);
            console.log('[FamilyDashboard] 家屬 FCM token 已登記 pairingId:', pairingId);
          }
        } else {
          console.warn('[FamilyDashboard] 無 backendPairingId，FCM token 未登記');
        }
      } catch (fcmErr) {
        console.warn('[FamilyDashboard] FCM token 登記失敗（不影響配對）:', fcmErr);
      }

      reset();
      onAdded(newElder);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({message: `長輩配對碼：${pairCode}`});
    } catch {}
  };

  const qrData = JSON.stringify({code: pairCode});
  const hoursLeft = Math.max(
    0,
    Math.ceil((codeCreatedAt + 48 * 3_600_000 - Date.now()) / 3_600_000),
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <View style={ss.modalRoot}>
        <View style={ss.modalHeader}>
          <TouchableOpacity
            onPress={step === 'display' ? () => setStep('form') : handleClose}
            style={ss.modalBack}>
            <Text style={ss.modalBackText}>{step === 'display' ? '←' : '✕'}</Text>
          </TouchableOpacity>
          <Text style={ss.modalHeaderTitle}>新增關懷長輩</Text>
          <View style={ss.modalBack} />
        </View>

        {step === 'form' ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={ss.formArea}>
            <ScrollView
              contentContainerStyle={ss.formScroll}
              keyboardShouldPersistTaps="handled">
              <Text style={ss.formTitle}>請輸入長輩資料</Text>
              <Text style={ss.formHint}>
                家屬端產生配對碼，再請長輩手機掃描 QR Code 完成配對
              </Text>
              <Text style={ss.formLabel}>長輩姓名</Text>
              <TextInput
                style={ss.formInput}
                value={elderName}
                onChangeText={setElderName}
                placeholder="例：王奶奶"
                placeholderTextColor="#9CA3AF"
                maxLength={20}
              />
              <Text style={ss.formLabel}>年齡</Text>
              <TextInput
                style={ss.formInput}
                value={elderAge}
                onChangeText={setElderAge}
                placeholder="例：75"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={3}
              />
              <TouchableOpacity
                style={[ss.primaryBtn, loading && ss.primaryBtnBusy]}
                onPress={handleGenerate}
                disabled={loading}>
                <Text style={ss.primaryBtnText}>
                  {loading ? '產生中…' : '產生配對碼 →'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <ScrollView contentContainerStyle={ss.displayScroll}>
            <View style={ss.qrSection}>
              <View style={[ss.codeBadge, {backgroundColor: '#E3EBF4'}]}>
                <Text style={[ss.codeBadgeText, {color: C.primary}]}>長輩配對碼・6 位數</Text>
              </View>
              <Text style={ss.qrInstruction}>
                請在長輩手機上掃描此 QR Code
              </Text>
              <Text style={ss.qrDesc}>此碼僅用於綁定長輩裝置，與家屬邀請碼不同</Text>
              {/* Expiry badge */}
              <View style={[ss.expiryBadge, hoursLeft < 12 && {borderColor: '#C0392B'}]}>
                <Text style={[ss.expiryText, hoursLeft < 12 && {color: '#C0392B'}]}>
                  {hoursLeft > 0
                    ? `有效期限：剩餘 ${hoursLeft} 小時`
                    : '配對碼已過期，請重新產生'}
                </Text>
              </View>
              <View style={ss.qrBox}>
                <QRCode value={qrData} size={200} />
              </View>
              <Text style={ss.qrOrText}>— 或輸入以下備用配對碼 —</Text>
              <View style={[ss.codeBadge, {backgroundColor: '#E3EBF4'}]}>
                <Text style={[ss.codeBadgeText, {color: C.primary}]}>長輩配對碼・6 位數</Text>
              </View>
              <View style={ss.codeDisplayBox}>
                <Text style={ss.codeDisplayText}>{pairCode}</Text>
              </View>
              <Text style={ss.codeHint}>在長輩手機「輸入長輩配對碼」頁面輸入</Text>
              <TouchableOpacity style={ss.shareBtn} onPress={handleShare}>
                <Text style={ss.shareBtnText}>📤 分享配對碼</Text>
              </TouchableOpacity>
              {/* Regenerate button */}
              <TouchableOpacity
                style={[ss.regenBtn, regenerating && {opacity: 0.5}]}
                onPress={handleRegenerate}
                disabled={regenerating}>
                <Text style={ss.regenBtnText}>
                  {regenerating ? '產生中...' : '🔄 重新產生配對碼'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[ss.primaryBtn, loading && ss.primaryBtnBusy]}
              onPress={handleConfirmPaired}
              disabled={loading}>
              <Text style={ss.primaryBtnText}>
                {loading ? '配對中…' : '長輩已完成設定，配對完成'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={ss.ghostBtn} onPress={() => setStep('form')}>
              <Text style={ss.ghostBtnText}>重新輸入資料</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ─── Invite code modal ─────────────────────────────────────────────────────────
const INVITE_EXPIRY_HOURS = 48; // 與後端 /api/pairing/invite/generate 一致

function InviteModal({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const [invite, setInvite] = useState<InviteCode | null>(null);
  const [failed, setFailed] = useState(false);

  const loadOrGenerate = async () => {
    setFailed(false);
    const existing = await getInviteCode();
    if (existing) {
      const ageHours = (Date.now() - new Date(existing.createdAt).getTime()) / 3_600_000;
      if (ageHours <= INVITE_EXPIRY_HOURS) { setInvite(existing); return; }
    }
    const fresh = await generateAndSaveInviteCode();
    if (!fresh) { setFailed(true); return; }
    setInvite(fresh);
  };

  useEffect(() => {
    if (!visible) return;
    setInvite(null);
    setFailed(false);
    loadOrGenerate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const hoursLeft = invite
    ? Math.max(0, INVITE_EXPIRY_HOURS - (Date.now() - new Date(invite.createdAt).getTime()) / 3_600_000)
    : 0;
  const expiryText = hoursLeft > 1
    ? `剩餘 ${Math.floor(hoursLeft)} 小時有效`
    : `剩餘 ${Math.max(1, Math.floor(hoursLeft * 60))} 分鐘有效`;

  const handleCopy = () => {
    if (invite) {
      Clipboard.setString(invite.code);
      Alert.alert('已複製', '邀請碼已複製到剪貼簿');
    }
  };

  const handleRegen = async () => {
    setInvite(null);
    setFailed(false);
    const fresh = await generateAndSaveInviteCode();
    if (!fresh) { setFailed(true); return; }
    setInvite(fresh);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={ss.inviteOverlay}>
        <View style={ss.inviteCard}>
          <Text style={ss.inviteTitle}>邀請其他家屬</Text>

          <View style={ss.inviteNotice}>
            <Text style={ss.inviteNoticeRow}>📍 長輩配對碼：用來綁定長輩裝置</Text>
            <Text style={ss.inviteNoticeRow}>👥 家屬邀請碼：用來邀請其他家屬查看</Text>
          </View>

          <Text style={ss.inviteBody}>
            {'將此碼傳給其他家屬，讓他們加入查看。\n加入後為「查看者」，可查看狀態但無法修改設定。'}
          </Text>

          {invite ? (
            <>
              <View style={[ss.codeBadge, {backgroundColor: '#EDE9F6', alignSelf: 'center', marginBottom: 8}]}>
                <Text style={[ss.codeBadgeText, {color: '#6B21A8'}]}>家屬邀請碼・8 位數</Text>
              </View>
              <View style={ss.inviteCodeBox}>
                <Text style={ss.inviteCodeText}>{invite.code}</Text>
              </View>
              <Text style={ss.inviteExpiry}>{expiryText}</Text>
            </>
          ) : failed ? (
            <View style={ss.inviteFailBox}>
              <Text style={ss.inviteFailText}>
                {'邀請碼產生失敗\n請確認網路連線後點「重新產生」再試一次'}
              </Text>
            </View>
          ) : (
            <Text style={ss.inviteBody}>產生中…</Text>
          )}

          <View style={ss.inviteBtnRow}>
            <TouchableOpacity
              style={[ss.inviteBtn, ss.inviteCopyBtn, !invite && ss.inviteBtnDisabled]}
              onPress={handleCopy}
              disabled={!invite}>
              <Text style={ss.inviteCopyText}>📋 複製邀請碼</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ss.inviteBtn, ss.inviteRegenBtn]} onPress={handleRegen}>
              <Text style={ss.inviteRegenText}>重新產生</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={ss.ghostBtn} onPress={onClose}>
            <Text style={ss.ghostBtnText}>關閉</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Remove elder confirm modal ────────────────────────────────────────────────
interface RemoveElderModalProps {
  elder: PairedElder | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function RemoveElderModal({elder, onConfirm, onCancel}: RemoveElderModalProps) {
  return (
    <Modal visible={!!elder} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={ss.inviteOverlay}>
        <View style={ss.inviteCard}>
          <Text style={rmStyles.title}>確認移除 {elder?.name}？</Text>
          <Text style={rmStyles.body}>
            {'移除後將無法收到該長輩的任何通知\n所有設定（藥物、閾值）將一併刪除'}
          </Text>
          <View style={rmStyles.btnRow}>
            <TouchableOpacity style={[rmStyles.btn, rmStyles.cancelBtn]} onPress={onCancel}>
              <Text style={rmStyles.cancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[rmStyles.btn, rmStyles.confirmBtn]} onPress={onConfirm}>
              <Text style={rmStyles.confirmText}>確認移除</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Remove member confirm modal ───────────────────────────────────────────────
interface RemoveMemberModalProps {
  member: FamilyMember | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function RemoveMemberModal({member, onConfirm, onCancel}: RemoveMemberModalProps) {
  return (
    <Modal visible={!!member} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={ss.inviteOverlay}>
        <View style={ss.inviteCard}>
          <Text style={rmStyles.title}>確認移除 {member?.name}？</Text>
          <Text style={rmStyles.body}>
            移除後該家屬將無法查看長輩狀態
          </Text>
          <View style={rmStyles.btnRow}>
            <TouchableOpacity style={[rmStyles.btn, rmStyles.cancelBtn]} onPress={onCancel}>
              <Text style={rmStyles.cancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[rmStyles.btn, rmStyles.confirmBtn]} onPress={onConfirm}>
              <Text style={rmStyles.confirmText}>確認移除</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Elder detail modal ────────────────────────────────────────────────────────
interface ElderDetailModalProps {
  elder: PairedElder | null;
  isAdmin: boolean;
  onClose: () => void;
  onElderUpdated: () => void;
}

type DetailStep = 'info' | 'qr';

function ElderDetailModal({elder, isAdmin, onClose, onElderUpdated}: ElderDetailModalProps) {
  const [step, setStep] = useState<DetailStep>('info');
  const [showConfirm, setShowConfirm] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!elder) {
      setStep('info');
      setShowConfirm(false);
      setNewCode('');
      setLoading(false);
    }
  }, [elder]);

  const handleConfirmRebind = async () => {
    if (!elder) return;
    setShowConfirm(false);
    setLoading(true);
    try {
      const code = await generatePairCode();
      await updateElderPairCode(elder.pairCode, code);
      onElderUpdated();
      setNewCode(code);
      setStep('qr');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!newCode) return;
    Clipboard.setString(newCode);
    Alert.alert('已複製', '配對碼已複製到剪貼簿');
  };

  const handleShare = async () => {
    try {
      await Share.share({message: `請在長輩新手機上輸入配對碼：${newCode}`});
    } catch {}
  };

  const pairedDate = elder ? new Date(elder.pairedAt).toLocaleDateString('zh-TW') : '';
  const qrData = JSON.stringify({code: newCode});

  return (
    <Modal visible={!!elder} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={ss.modalRoot}>
        {/* Header */}
        <View style={ss.modalHeader}>
          <TouchableOpacity onPress={step === 'qr' ? onClose : onClose} style={ss.modalBack}>
            <Text style={ss.modalBackText}>✕</Text>
          </TouchableOpacity>
          <Text style={ss.modalHeaderTitle}>
            {step === 'qr' ? '重新綁定裝置' : `${elder?.name ?? ''} 詳細資訊`}
          </Text>
          <View style={ss.modalBack} />
        </View>

        {step === 'info' ? (
          <ScrollView contentContainerStyle={detailSt.scroll}>
            {/* Avatar + name */}
            <View style={detailSt.avatarCard}>
              <View style={detailSt.avatar}>
                <Text style={detailSt.avatarText}>{elder?.name[0]}</Text>
              </View>
              <Text style={detailSt.name}>{elder?.name}</Text>
              <Text style={detailSt.age}>{elder?.age} 歲</Text>
            </View>

            {/* Meta rows */}
            <View style={detailSt.metaCard}>
              <View style={detailSt.metaRow}>
                <Text style={detailSt.metaLabel}>配對碼</Text>
                <Text style={detailSt.metaValue}>{elder?.pairCode}</Text>
              </View>
              <View style={detailSt.metaDivider} />
              <View style={detailSt.metaRow}>
                <Text style={detailSt.metaLabel}>配對日期</Text>
                <Text style={detailSt.metaValue}>{pairedDate}</Text>
              </View>
              <View style={detailSt.metaDivider} />
              <View style={detailSt.metaRow}>
                <Text style={detailSt.metaLabel}>裝置狀態</Text>
                <View style={detailSt.statusBadge}>
                  <Text style={detailSt.statusText}>已綁定</Text>
                </View>
              </View>
            </View>

            {/* Rebind button — admin only */}
            {isAdmin && (
              <>
                <TouchableOpacity
                  style={detailSt.rebindBtn}
                  onPress={() => setShowConfirm(true)}
                  disabled={loading}>
                  <Text style={detailSt.rebindBtnText}>
                    {loading ? '處理中…' : '重新綁定裝置'}
                  </Text>
                </TouchableOpacity>
                <Text style={detailSt.rebindHint}>通常用於長輩換新手機時使用</Text>
              </>
            )}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={detailSt.scroll}>
            <View style={detailSt.qrSection}>
              <View style={[ss.codeBadge, {backgroundColor: '#E3EBF4', alignSelf: 'center'}]}>
                <Text style={[ss.codeBadgeText, {color: C.primary}]}>長輩配對碼・6 位數</Text>
              </View>
              <Text style={detailSt.qrTitle}>請長輩掃描</Text>
              <Text style={detailSt.qrDesc}>
                請在長輩的新手機上開啟默伴守護，掃描此 QR Code 或輸入下方備用配對碼
              </Text>
              <View style={ss.qrBox}>
                <QRCode value={qrData} size={200} />
              </View>
              <Text style={ss.qrOrText}>— 或輸入以下備用配對碼 —</Text>
              <View style={ss.codeDisplayBox}>
                <Text style={ss.codeDisplayText}>{newCode}</Text>
              </View>
              <View style={detailSt.actionRow}>
                <TouchableOpacity style={detailSt.halfBtn} onPress={handleCopy}>
                  <Text style={detailSt.halfBtnText}>📋 複製配對碼</Text>
                </TouchableOpacity>
                <TouchableOpacity style={detailSt.halfBtn} onPress={handleShare}>
                  <Text style={detailSt.halfBtnText}>📤 分享</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={ss.primaryBtn} onPress={onClose}>
              <Text style={ss.primaryBtnText}>完成</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Rebind confirm overlay */}
        <Modal visible={showConfirm} transparent animationType="fade" onRequestClose={() => setShowConfirm(false)}>
          <View style={ss.inviteOverlay}>
            <View style={ss.inviteCard}>
              <Text style={rmStyles.title}>確認重新綁定 {elder?.name} 的裝置？</Text>
              <Text style={rmStyles.body}>
                {'這通常用於長輩換新手機時使用\n舊裝置將自動解除綁定\n所有設定（藥物、閾值）將保留'}
              </Text>
              <View style={rmStyles.btnRow}>
                <TouchableOpacity style={[rmStyles.btn, rmStyles.cancelBtn]} onPress={() => setShowConfirm(false)}>
                  <Text style={rmStyles.cancelText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[rmStyles.btn, detailSt.rebindConfirmBtn]} onPress={handleConfirmRebind}>
                  <Text style={rmStyles.confirmText}>確認重新綁定</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {admin: '管理員', viewer: '查看者'};

function FamilyMemberCard({member, onRemove}: {member: FamilyMember; onRemove?: () => void}) {
  const joinedDate = new Date(member.pairedAt).toLocaleDateString('zh-TW');
  const role = member.role ?? 'admin';
  return (
    <View style={styles.memberCard}>
      <View style={styles.memberAvatar}>
        <Text style={styles.memberAvatarText}>{member.name[0]}</Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{member.name}</Text>
        <Text style={styles.memberMeta}>加入於 {joinedDate}</Text>
      </View>
      {onRemove ? (
        <TouchableOpacity style={styles.removeMemberBtn} onPress={onRemove}>
          <Text style={styles.removeMemberBtnText}>移除</Text>
        </TouchableOpacity>
      ) : (
        <View style={[styles.memberRoleBadge, styles.badgeAdmin]}>
          <Text style={[styles.memberRoleText, styles.badgeAdminText]}>
            {ROLE_LABELS[role]}
          </Text>
        </View>
      )}
    </View>
  );
}

function ElderCard({elder, alerts, onPress, onLongPress, isAdmin}: {elder: PairedElder; alerts: AlertRecord[]; onPress: () => void; onLongPress: () => void; isAdmin: boolean}) {
  const pairedDate = new Date(elder.pairedAt).toLocaleDateString('zh-TW');
  const statusCfg = STATUS_CONFIG[getElderStatus(elder, alerts)];
  return (
    <View style={styles.elderCard}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        onLongPress={isAdmin ? onLongPress : undefined}>
        <View style={styles.elderCardHeader}>
          <View style={styles.elderAvatar}>
            <Text style={styles.elderAvatarText}>{elder.name[0]}</Text>
          </View>
          <View style={styles.elderInfo}>
            <Text style={styles.elderName}>{elder.name}</Text>
            <Text style={styles.elderAge}>{elder.age} 歲</Text>
          </View>
          <View style={styles.elderBadgeCol}>
            <View style={[styles.elderStatusBadge, {backgroundColor: statusCfg.bg}]}>
              <Text style={[styles.elderStatusBadgeText, {color: statusCfg.color}]}>
                {statusCfg.label}
              </Text>
            </View>
            <View style={styles.pairedBadge}>
              <Text style={styles.pairedBadgeText}>已配對</Text>
            </View>
          </View>
        </View>
        <Text style={styles.pairedSince}>配對碼 {elder.pairCode}・加入於 {pairedDate}</Text>
        {isAdmin && <Text style={styles.longPressHint}>點擊查看詳情・長按可移除</Text>}
      </TouchableOpacity>
      <StepTrendChart pairCode={elder.pairCode} elderId={elder.elderId} />
    </View>
  );
}

// ─── Alert Message Body（支援 Google Maps 連結點擊）─────────────────────────────
const MAPS_URL_RE = /(https:\/\/maps\.google\.com\/\?q=[\d.,\-]+)/g;

function AlertMessageBody({message}: {message: string}) {
  if (!message) {
    return <Text style={detailModalSt.logBody}>（無詳細內容）</Text>;
  }
  const parts = message.split(MAPS_URL_RE);
  if (parts.length === 1) {
    return <Text style={detailModalSt.logBody}>{message}</Text>;
  }
  return (
    <Text style={detailModalSt.logBody}>
      {parts.map((part, i) =>
        MAPS_URL_RE.test(part) ? (
          <Text
            key={i}
            style={detailModalSt.logLink}
            onPress={() => Linking.openURL(part).catch(() => {})}>
            📍 點此開啟地圖
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        ),
      )}
    </Text>
  );
}

// ─── Alert Detail Modal ────────────────────────────────────────────────────────
function AlertDetailModal({
  alert,
  onClose,
  onResolve,
}: {
  alert: AlertRecord | null;
  onClose: () => void;
  onResolve: (id: string) => void;
}) {
  if (!alert) { return null; }
  const icons: Record<AlertRecord['type'], string> = {
    sos: '🆘', noCheckIn: '📋', lowBattery: '🔋', fall: '⚠️', medication: '💊', activity: '📋',
  };
  const borderColor =
    alert.type === 'sos' ? C.sos
    : alert.type === 'fall' ? C.warning
    : C.primary;

  return (
    <Modal visible={!!alert} transparent animationType="slide" onRequestClose={onClose}>
      <View style={detailModalSt.overlay}>
        <View style={[detailModalSt.sheet, {borderTopColor: borderColor}]}>
          {/* 頭部 */}
          <View style={detailModalSt.header}>
            <Text style={detailModalSt.icon}>{icons[alert.type]}</Text>
            <View style={detailModalSt.headerText}>
              <Text style={detailModalSt.title} numberOfLines={2}>{alert.title}</Text>
              <Text style={detailModalSt.time}>{alert.time}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={detailModalSt.closeBtn}>
              <Text style={detailModalSt.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 詳細日誌 */}
          <ScrollView style={detailModalSt.logScroll} contentContainerStyle={detailModalSt.logContent}>
            <Text style={detailModalSt.logLabel}>詳細日誌</Text>
            <AlertMessageBody message={alert.message} />
          </ScrollView>

          {/* 處理按鈕 */}
          {!alert.resolved ? (
            <TouchableOpacity
              style={detailModalSt.resolveBtn}
              onPress={() => onResolve(alert.id)}>
              <Text style={detailModalSt.resolveBtnText}>✓ 標記為已處理</Text>
            </TouchableOpacity>
          ) : (
            <View style={detailModalSt.resolvedNote}>
              <Text style={detailModalSt.resolvedNoteText}>✓ 已處理</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── 長輩狀態計算 ──────────────────────────────────────────────────────────────
type ElderStatus = 'normal' | 'attention' | 'critical';

const CRITICAL_TYPES: AlertRecord['type'][]  = ['sos', 'fall', 'noCheckIn'];
const ATTENTION_TYPES: AlertRecord['type'][] = ['lowBattery', 'medication'];

/**
 * 依未處理警示計算單一長輩的狀態。
 * 比對優先序：elderId（精準）→ elderName（備援）。
 * 兩者皆無的舊記錄（elderName 為空字串）會被排除，避免誤判。
 */
function getElderStatus(elder: PairedElder, alerts: AlertRecord[]): ElderStatus {
  const unresolved = alerts.filter(a => {
    if (a.resolved) { return false; }
    // 優先用 elderId 精準比對
    if (elder.elderId && a.elderId) { return a.elderId === elder.elderId; }
    // 退而用 elderName 比對
    if (a.elderName) { return a.elderName === elder.name; }
    return false;
  });
  if (unresolved.some(a => CRITICAL_TYPES.includes(a.type)))  { return 'critical'; }
  if (unresolved.some(a => ATTENTION_TYPES.includes(a.type))) { return 'attention'; }
  return 'normal';
}

const STATUS_CONFIG: Record<ElderStatus, {label: string; color: string; bg: string}> = {
  normal:    {label: '狀態正常', color: C.safe,    bg: '#E8F7EF'},
  attention: {label: '需要注意', color: C.warning, bg: '#FEF3C7'},
  critical:  {label: '狀態異常', color: C.sos,     bg: '#FDECEA'},
};

function AlertIcon({type}: {type: AlertRecord['type']}) {
  const icons: Record<AlertRecord['type'], string> = {
    sos: '🆘', noCheckIn: '📋', lowBattery: '🔋', fall: '⚠️', medication: '💊', activity: '📋',
  };
  return <Text style={styles.alertIcon}>{icons[type]}</Text>;
}

function AlertItem({record, onPress}: {record: AlertRecord; onPress: () => void}) {
  const borderColor = record.resolved ? C.border
    : record.type === 'sos' ? C.sos : C.warning;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.alertItem, {borderLeftColor: borderColor}]}>
      <AlertIcon type={record.type} />
      <View style={styles.alertContent}>
        <View style={styles.alertTitleRow}>
          <Text style={[styles.alertName, styles.alertNameShrink]} numberOfLines={1}>
            {record.title || '通知'}
          </Text>
          {!!record.elderName && (
            <View style={styles.alertElderTag}>
              <Text style={styles.alertElderTagText} numberOfLines={1}>
                {record.elderName}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.alertMessage} numberOfLines={2}>{record.message}</Text>
        <Text style={styles.alertTime}>{record.time}</Text>
      </View>
      {record.resolved ? (
        <View style={styles.resolvedBadge}><Text style={styles.resolvedText}>已處理</Text></View>
      ) : (
        <View style={styles.unresolvedBadge}><Text style={styles.unresolvedText}>待處理 ›</Text></View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function FamilyDashboard() {
  const navigation = useNavigation<Nav>();
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertRecord | null>(null);
  const [showUnresolvedList, setShowUnresolvedList] = useState(false);
  const [permGranted, setPermGranted] = useState<null | boolean>(null);
  const [elders, setElders] = useState<PairedElder[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [familyRole, setFamilyRole] = useState<FamilyRole>('admin');
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [elderToRemove, setElderToRemove] = useState<PairedElder | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<FamilyMember | null>(null);
  const [currentFamilyId, setCurrentFamilyId] = useState<string | undefined>(undefined);
  const [elderForDetail, setElderForDetail] = useState<PairedElder | null>(null);

  const loadData = useCallback(async () => {
    const [list, role, members, fp, alertList] = await Promise.all([
      getPairedElders(),
      getFamilyRole(),
      getFamilyMembers(),
      getFamilyProfile(),
      loadAlerts(),
    ]);
    setElders(list);
    setFamilyRole(role);
    setFamilyMembers(members);
    setCurrentFamilyId(fp?.familyId);
    setAlerts(alertList);
    notifee.getNotificationSettings().then(s => {
      setPermGranted(
        s.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
        s.authorizationStatus === AuthorizationStatus.PROVISIONAL,
      );
    });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // 每次回到家屬頁面時重新載入警示（確保後台收到的通知即時顯示）
  useFocusEffect(
    useCallback(() => {
      loadAlerts().then(setAlerts);
    }, []),
  );

  const handleElderAdded = (elder: PairedElder) => {
    setElders(prev => {
      const deduped = prev.filter(e => e.pairCode !== elder.pairCode);
      return [...deduped, elder];
    });
    setShowAddModal(false);
    loadData();
    Alert.alert('配對成功！', `已將 ${elder.name} 加入您的關懷名單`);
  };

  const handleConfirmRemoveElder = async () => {
    if (!elderToRemove) return;
    setElders(await removePairedElder(elderToRemove.pairCode));
    setElderToRemove(null);
  };

  const handleConfirmRemoveMember = async () => {
    if (!memberToRemove?.familyId) return;
    setFamilyMembers(await removeFamilyMember(memberToRemove.familyId));
    setMemberToRemove(null);
  };

  const unresolvedCount = alerts.filter(a => !a.resolved).length;

  // 長輩整體狀態：正常人數／總人數，顏色取最嚴重的那一位
  const elderStatuses = elders.map(e => getElderStatus(e, alerts));
  const normalCount = elderStatuses.filter(s => s === 'normal').length;
  const overallStatus: ElderStatus =
    elderStatuses.some(s => s === 'critical')  ? 'critical'
    : elderStatuses.some(s => s === 'attention') ? 'attention'
    : 'normal';

  const handleResolveAlert = async (id: string) => {
    const updated = await markAlertResolved(id);
    setAlerts(updated);
    setSelectedAlert(prev => (prev?.id === id ? {...prev, resolved: true} : prev));
  };

  return (
    <View style={styles.root}>
      <Modal
        visible={showUnresolvedList}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUnresolvedList(false)}>
        <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'}}>
          <View style={{
            backgroundColor: '#FAF6E8',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            maxHeight: '80%',
          }}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
              <Text style={{fontSize: 17, fontWeight: '700', color: '#1F2A3A'}}>
                待處理警示（{alerts.filter(r => !r.resolved).length} 筆）
              </Text>
              <TouchableOpacity onPress={() => setShowUnresolvedList(false)}>
                <Text style={{fontSize: 16, color: '#7B7A6A', fontWeight: '700'}}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {alerts.filter(r => !r.resolved).length === 0 ? (
                <Text style={{color: '#7B7A6A', textAlign: 'center', paddingVertical: 20}}>
                  目前沒有待處理警示
                </Text>
              ) : (
                alerts.filter(r => !r.resolved).map(record => (
                  <AlertItem
                    key={record.id}
                    record={record}
                    onPress={() => {
                      setShowUnresolvedList(false);
                      setSelectedAlert(record);
                    }}
                  />
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <AlertDetailModal
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onResolve={handleResolveAlert}
      />
      <AddElderModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdded={handleElderAdded}
      />
      <InviteModal
        visible={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />
      <RemoveElderModal
        elder={elderToRemove}
        onConfirm={handleConfirmRemoveElder}
        onCancel={() => setElderToRemove(null)}
      />
      <RemoveMemberModal
        member={memberToRemove}
        onConfirm={handleConfirmRemoveMember}
        onCancel={() => setMemberToRemove(null)}
      />
      <ElderDetailModal
        elder={elderForDetail}
        isAdmin={familyRole === 'admin'}
        onClose={() => setElderForDetail(null)}
        onElderUpdated={loadData}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 摘要列 */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{elders.length}</Text>
            <Text style={styles.summaryLabel}>位長輩</Text>
          </View>
          <View style={[styles.summaryItem, styles.summaryDivider]}>
            <Text style={[styles.summaryValue, {color: STATUS_CONFIG[overallStatus].color}]}>
              {normalCount}/{elders.length}
            </Text>
            <Text style={styles.summaryLabel}>長輩狀態</Text>
          </View>
          <TouchableOpacity
            style={styles.summaryItem}
            onPress={() => setShowUnresolvedList(true)}
            activeOpacity={0.7}>
            <Text style={[styles.summaryValue, {color: C.warning}]}>{unresolvedCount}</Text>
            <Text style={styles.summaryLabel}>待處理警示 ›</Text>
          </TouchableOpacity>
        </View>

        {/* 快速入口 */}
        {familyRole === 'admin' ? (
          <View style={styles.quickRow}>
            <TouchableOpacity style={styles.quickBtn} onPress={() => setShowAddModal(true)}>
              <Text style={styles.quickBtnIcon}>➕</Text>
              <Text style={styles.quickBtnLabel}>新增長輩</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => setShowInviteModal(true)}>
              <Text style={styles.quickBtnIcon}>👥</Text>
              <Text style={styles.quickBtnLabel}>邀請家屬</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('MedicineManagement')}>
              <Text style={styles.quickBtnIcon}>💊</Text>
              <Text style={styles.quickBtnLabel}>藥物管理</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Settings')}>
              <Text style={styles.quickBtnIcon}>🔔</Text>
              <Text style={styles.quickBtnLabel}>通知設定</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('ThresholdSettings')}>
              <Text style={styles.quickBtnIcon}>⚙️</Text>
              <Text style={styles.quickBtnLabel}>閾值設定</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('EmergencyContact')}>
              <Text style={styles.quickBtnIcon}>🆘</Text>
              <Text style={styles.quickBtnLabel}>緊急聯絡</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.quickRow}>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Settings')}>
              <Text style={styles.quickBtnIcon}>🔔</Text>
              <Text style={styles.quickBtnLabel}>通知設定</Text>
            </TouchableOpacity>
          </View>
        )}

        {permGranted === false && (
          <View style={styles.permBanner}>
            <Text style={styles.permBannerText}>✗ 尚未授權推播通知，部分警報將無法送達</Text>
          </View>
        )}

        {familyRole === 'viewer' && (
          <View style={styles.viewerBanner}>
            <Text style={styles.viewerBannerText}>👁 您是查看者，僅可瀏覽狀態與調整自己的通知設定</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>關懷名單</Text>
        {elders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>👴</Text>
            <Text style={styles.emptyText}>尚未加入任何長輩</Text>
            <Text style={styles.emptyHint}>
              {familyRole === 'admin'
                ? '點擊「新增長輩」輸入長輩資料，由家屬端產生 QR Code'
                : '請等待管理員家屬新增長輩後即可查看'}
            </Text>
          </View>
        ) : (
          elders.map(elder => (
            <ElderCard
              key={elder.pairCode}
              elder={elder}
              alerts={alerts}
              isAdmin={familyRole === 'admin'}
              onPress={() => setElderForDetail(elder)}
              onLongPress={() => setElderToRemove(elder)}
            />
          ))
        )}

        {alerts.filter(r => r.type !== 'activity').length > 0 && (
          <>
            <Text style={styles.sectionTitle}>警示記錄</Text>
            <View style={styles.card}>
              {alerts.filter(r => r.type !== 'activity').map(record => (
                <AlertItem
                  key={record.id}
                  record={record}
                  onPress={() => setSelectedAlert(record)}
                />
              ))}
            </View>
          </>
        )}
        {alerts.filter(r => r.type === 'activity').length > 0 && (
          <>
            <Text style={styles.sectionTitle}>活躍記錄</Text>
            <View style={styles.card}>
              {alerts.filter(r => r.type === 'activity').map(record => (
                <AlertItem
                  key={record.id}
                  record={record}
                  onPress={() => setSelectedAlert(record)}
                />
              ))}
            </View>
          </>
        )}

        {/* ── 家屬成員 ── */}
        {familyRole === 'admin' && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>家屬成員</Text>
              <TouchableOpacity onPress={() => setShowInviteModal(true)}>
                <Text style={styles.inviteLink}>+ 邀請家屬</Text>
              </TouchableOpacity>
            </View>
            {familyMembers.length === 0 ? (
              <View style={styles.emptyMembersCard}>
                <Text style={styles.emptyMembersText}>尚未有其他家屬加入</Text>
                <Text style={styles.emptyMembersHint}>點擊「邀請家屬」產生邀請碼</Text>
              </View>
            ) : (
              familyMembers.map((m, i) => (
                <FamilyMemberCard
                  key={i}
                  member={m}
                  onRemove={
                    m.role === 'viewer' && m.familyId && m.familyId !== currentFamilyId
                      ? () => setMemberToRemove(m)
                      : undefined
                  }
                />
              ))
            )}
          </>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

// ─── Styles: main screen ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: C.bg},
  scroll: {flex: 1},
  scrollContent: {paddingHorizontal: 16, paddingTop: 16},
  sectionTitle: {fontSize: sc(17), fontWeight: '700', color: C.ink, marginBottom: 10, marginTop: 4},
  summaryRow: {
    flexDirection: 'row', backgroundColor: C.primary, borderRadius: 16,
    padding: 20, marginBottom: 14,
    shadowColor: C.primary, shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  summaryItem: {flex: 1, alignItems: 'center'},
  summaryDivider: {borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.2)'},
  summaryValue: {fontSize: sc(28), fontWeight: '800', color: C.white},
  summaryLabel: {fontSize: sc(12), color: 'rgba(255,255,255,0.7)', marginTop: 4},
  quickRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14},
  quickBtn: {
    backgroundColor: C.card, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', minWidth: 68, flex: 1,
    shadowColor: '#000', shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  quickBtnIcon: {fontSize: 24, marginBottom: 4},
  quickBtnLabel: {fontSize: sc(12), fontWeight: '700', color: C.primary, textAlign: 'center'},
  permBanner: {backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: 14},
  permBannerText: {fontSize: sc(13), color: C.sos, fontWeight: '600'},
  viewerBanner: {backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, marginBottom: 14},
  viewerBannerText: {fontSize: sc(13), color: C.primary, fontWeight: '600'},
  elderCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 18, marginBottom: 14,
    borderLeftWidth: 5, borderLeftColor: C.safe,
    shadowColor: '#000', shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  elderCardHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: 10},
  elderAvatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#2D3F74',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  elderAvatarText: {color: C.white, fontSize: sc(22), fontWeight: '700'},
  elderInfo: {flex: 1},
  elderName: {fontSize: sc(18), fontWeight: '700', color: C.ink},
  elderAge: {fontSize: sc(13), color: C.sub, marginTop: 2},
  pairedBadge: {backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5},
  pairedBadgeText: {fontSize: sc(13), fontWeight: '700', color: C.safe},
  elderBadgeCol: {alignItems: 'flex-end', gap: 4},
  elderStatusBadge: {borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5},
  elderStatusBadgeText: {fontSize: sc(13), fontWeight: '700'},
  pairedSince: {fontSize: sc(13), color: C.sub, marginBottom: 4},
  longPressHint: {fontSize: sc(11), color: C.border},
  emptyCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 36,
    alignItems: 'center', marginBottom: 14,
    shadowColor: '#000', shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  emptyIcon: {fontSize: 48, marginBottom: 12},
  emptyText: {fontSize: sc(16), fontWeight: '700', color: C.ink, marginBottom: 6},
  emptyHint: {fontSize: sc(13), color: C.sub, textAlign: 'center'},
  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 4, marginBottom: 16,
    shadowColor: '#000', shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  alertItem: {flexDirection: 'row', alignItems: 'center', padding: 14, borderLeftWidth: 4, marginVertical: 2, borderRadius: 8},
  alertIcon: {fontSize: 22, marginRight: 12},
  alertContent: {flex: 1},
  alertName: {fontSize: sc(15), fontWeight: '700', color: C.ink},
  alertTitleRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  alertNameShrink: {flexShrink: 1},
  alertElderTag: {
    backgroundColor: '#EEF2F7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: '45%',
  },
  alertElderTagText: {fontSize: sc(11), fontWeight: '700', color: C.primary},
  alertMessage: {fontSize: sc(13), color: C.sub, marginTop: 2},
  alertTime: {fontSize: sc(12), color: C.sub, marginTop: 2},
  resolvedBadge: {backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4},
  resolvedText: {color: C.sub, fontSize: sc(12), fontWeight: '600'},
  unresolvedBadge: {backgroundColor: '#FEF2F2', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4},
  unresolvedText: {color: C.sos, fontSize: sc(12), fontWeight: '700'},
  bottomPadding: {height: 24},

  // ── Family members section ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  inviteLink: {
    fontSize: sc(14),
    fontWeight: '700',
    color: C.primary,
  },
  memberCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#7C6FA0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberAvatarText: {color: C.white, fontSize: sc(18), fontWeight: '700'},
  memberInfo: {flex: 1},
  memberName: {fontSize: sc(16), fontWeight: '700', color: C.ink},
  memberMeta: {fontSize: sc(12), color: C.sub, marginTop: 2},
  memberRoleBadge: {borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4},
  badgeAdmin:  {backgroundColor: '#EBF5FB'},
  badgeViewer: {backgroundColor: '#F3E8FF'},
  memberRoleText: {fontSize: sc(13), fontWeight: '700'},
  badgeAdminText:  {color: '#1B4F72'},
  badgeViewerText: {color: '#6B21A8'},
  emptyMembersCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyMembersText: {fontSize: sc(15), fontWeight: '600', color: C.ink, marginBottom: 4},
  emptyMembersHint: {fontSize: sc(13), color: C.sub},
  removeMemberBtn: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  removeMemberBtnText: {fontSize: sc(13), fontWeight: '700', color: C.sos},
});

const detailModalSt = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 4, maxHeight: '85%',
    shadowColor: '#000', shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 12,
  },
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  icon: {fontSize: 32, marginRight: 12, marginTop: 2},
  headerText: {flex: 1},
  title: {fontSize: 17, fontWeight: '700', color: '#1A1A2E', lineHeight: 24, marginBottom: 4},
  time: {fontSize: 13, color: '#6B7280'},
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
    marginLeft: 8,
  },
  closeBtnText: {fontSize: 14, color: '#6B7280', fontWeight: '700'},
  logScroll: {flexShrink: 1},
  logContent: {padding: 20},
  logLabel: {
    fontSize: 12, fontWeight: '700', color: '#6B7280',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
  },
  logBody: {fontSize: 15, color: '#1A1A2E', lineHeight: 24},
  logLink: {fontSize: 15, color: '#274A6E', textDecorationLine: 'underline', fontWeight: '600'},
  resolveBtn: {
    margin: 16, backgroundColor: '#274A6E', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  resolveBtnText: {color: '#FFFFFF', fontSize: 16, fontWeight: '700'},
  resolvedNote: {
    margin: 16, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', backgroundColor: '#ECFDF5',
  },
  resolvedNoteText: {color: '#3DB87A', fontSize: 16, fontWeight: '700'},
});

const rmStyles = StyleSheet.create({
  title: {
    fontSize: sc(18),
    fontWeight: '800',
    color: '#1A1A2E',
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    fontSize: sc(14),
    color: '#6B7280',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  btnRow: {flexDirection: 'row', gap: 12},
  btn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 52,
  },
  cancelBtn: {backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB'},
  cancelText: {fontSize: sc(15), fontWeight: '600', color: '#6B7280'},
  confirmBtn: {backgroundColor: C.sos},
  confirmText: {fontSize: sc(15), fontWeight: '700', color: '#FFFFFF'},
});

const detailSt = StyleSheet.create({
  scroll: {padding: 24, paddingTop: 32},

  // Avatar card
  avatarCard: {alignItems: 'center', marginBottom: 24},
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#2D3F74',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarText: {color: '#FFFFFF', fontSize: sc(32), fontWeight: '800'},
  name: {fontSize: sc(22), fontWeight: '800', color: C.ink, marginBottom: 4},
  age: {fontSize: sc(15), color: C.sub},

  // Meta card
  metaCard: {
    backgroundColor: C.white, borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    marginBottom: 32,
  },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16,
  },
  metaDivider: {height: 1, backgroundColor: C.border, marginHorizontal: 16},
  metaLabel: {fontSize: sc(15), fontWeight: '600', color: C.ink},
  metaValue: {fontSize: sc(15), color: C.sub},
  statusBadge: {backgroundColor: '#ECFDF5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4},
  statusText: {fontSize: sc(13), fontWeight: '700', color: C.safe},

  // Rebind button
  rebindBtn: {
    borderWidth: 1.5, borderColor: C.warning, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginBottom: 8,
  },
  rebindBtnText: {fontSize: sc(15), fontWeight: '700', color: C.warning},
  rebindHint: {fontSize: sc(12), color: C.sub, textAlign: 'center'},
  rebindConfirmBtn: {backgroundColor: C.warning},

  // QR step
  qrSection: {alignItems: 'center', marginBottom: 32},
  qrTitle: {fontSize: sc(20), fontWeight: '800', color: C.ink, marginBottom: 8, textAlign: 'center'},
  qrDesc: {fontSize: sc(14), color: C.sub, textAlign: 'center', lineHeight: 22, marginBottom: 20},
  actionRow: {flexDirection: 'row', gap: 12, marginTop: 16},
  halfBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: C.primary,
  },
  halfBtnText: {fontSize: sc(14), fontWeight: '700', color: C.primary},
});

// ─── Styles: modals ────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  // Code type badge
  codeBadge: {
    borderRadius: 20, paddingVertical: 5, paddingHorizontal: 14, marginBottom: 12,
  },
  codeBadgeText: {fontSize: sc(13), fontWeight: '700', letterSpacing: 0.5},

  // Modal shell
  modalRoot: {flex: 1, backgroundColor: C.bg},
  modalHeader: {
    backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, paddingTop: 48,
  },
  modalBack: {minWidth: 40, alignItems: 'center'},
  modalBackText: {color: C.white, fontSize: 20, fontWeight: '600'},
  modalHeaderTitle: {flex: 1, color: C.white, fontSize: sc(18), fontWeight: '700', textAlign: 'center'},

  // Form step
  formArea: {flex: 1},
  formScroll: {padding: 24, paddingTop: 32},
  formTitle: {
    fontSize: sc(20), fontWeight: '800', color: C.ink,
    textAlign: 'center', marginBottom: 8,
  },
  formHint: {
    fontSize: sc(14), color: C.sub, textAlign: 'center',
    lineHeight: 22, marginBottom: 28,
  },
  formLabel: {fontSize: sc(15), fontWeight: '700', color: C.ink, marginBottom: 8},
  formInput: {
    backgroundColor: C.white, borderRadius: 14, padding: 16,
    fontSize: sc(16), color: C.ink, borderWidth: 1.5,
    borderColor: '#D1D5DB', marginBottom: 20,
  },

  // Display step
  displayScroll: {padding: 24, paddingTop: 32},
  qrSection: {alignItems: 'center', marginBottom: 32},
  qrInstruction: {
    fontSize: sc(17), fontWeight: '700', color: C.ink,
    textAlign: 'center', marginBottom: 6, lineHeight: 26,
  },
  qrDesc: {
    fontSize: sc(13), color: C.sub, textAlign: 'center', marginBottom: 16,
  },
  qrBox: {
    backgroundColor: C.white, borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
    marginBottom: 20,
  },
  qrOrText: {fontSize: sc(13), color: C.sub, marginBottom: 12},
  codeDisplayBox: {
    backgroundColor: C.primary, borderRadius: 16,
    paddingHorizontal: 32, paddingVertical: 14,
    marginBottom: 8,
  },
  codeDisplayText: {
    color: C.white, fontSize: 40, fontWeight: '900', letterSpacing: 8,
  },
  codeHint: {fontSize: sc(13), color: C.sub, textAlign: 'center', marginBottom: 14},
  shareBtn: {paddingVertical: 8, paddingHorizontal: 20},
  shareBtnText: {fontSize: sc(14), color: C.primary, fontWeight: '600'},
  expiryBadge: {
    borderWidth: 1.5, borderColor: C.warning, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 16, marginBottom: 14, alignSelf: 'stretch',
    backgroundColor: '#FFFBEB',
  },
  expiryText: {fontSize: sc(13), color: C.warning, textAlign: 'center', fontWeight: '600'},
  regenBtn: {
    marginTop: 10, paddingVertical: 12, paddingHorizontal: 24,
    borderWidth: 1.5, borderColor: C.warning, borderRadius: 12,
  },
  regenBtnText: {fontSize: sc(14), color: C.warning, fontWeight: '700', textAlign: 'center'},

  // Shared buttons
  primaryBtn: {
    backgroundColor: C.primary, borderRadius: 16, paddingVertical: 18,
    alignItems: 'center', minHeight: 60,
    shadowColor: C.primary, shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 5,
  },
  primaryBtnBusy: {opacity: 0.55},
  primaryBtnText: {color: C.white, fontSize: sc(16), fontWeight: '700'},
  ghostBtn: {paddingVertical: 14, alignItems: 'center'},
  ghostBtnText: {color: C.sub, fontSize: sc(14)},

  // Invite modal
  inviteOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24},
  inviteCard: {
    backgroundColor: C.white, borderRadius: 22, padding: 26, width: '100%',
    shadowColor: '#000', shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.18, shadowRadius: 14, elevation: 10,
  },
  inviteTitle: {fontSize: sc(20), fontWeight: '800', color: C.ink, marginBottom: 10, textAlign: 'center'},
  inviteBody: {fontSize: sc(14), color: C.sub, lineHeight: 22, textAlign: 'center', marginBottom: 18},
  inviteNotice: {
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 4,
  },
  inviteNoticeRow: {fontSize: sc(13), color: '#1E40AF', lineHeight: 20},
  inviteExpiry: {
    fontSize: sc(12),
    color: '#6B7280',
    textAlign: 'center',
    marginTop: -10,
    marginBottom: 14,
  },
  inviteCodeBox: {
    backgroundColor: C.primary, borderRadius: 14, paddingVertical: 18,
    alignItems: 'center', marginBottom: 6,
  },
  inviteCodeText: {color: C.white, fontSize: 32, fontWeight: '900', letterSpacing: 6},
  inviteBtnRow: {flexDirection: 'row', gap: 12, marginBottom: 4},
  inviteBtn: {flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', minHeight: 50},
  inviteCopyBtn: {backgroundColor: C.primary},
  inviteCopyText: {color: C.white, fontSize: sc(14), fontWeight: '700'},
  inviteRegenBtn: {backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB'},
  inviteRegenText: {color: C.sub, fontSize: sc(14), fontWeight: '600'},
  inviteBtnDisabled: {opacity: 0.45},
  inviteFailBox: {
    backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#FECACA', marginBottom: 14,
  },
  inviteFailText: {fontSize: sc(13), color: C.sos, textAlign: 'center', lineHeight: 20},
});
