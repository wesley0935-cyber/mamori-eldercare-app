import React, {useState, useRef, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Share,
  Clipboard,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';
import {Camera, useCameraDevice, useCodeScanner} from 'react-native-vision-camera';
import {
  setAppRole,
  setElderProfile,
  setFamilyProfile,
  addPairedElder,
  addFamilyMember,
  getFamilyProfile,
  confirmPairingWithCode,
  generateAndSavePairCode,
  getElderPairCodeRecord,
  type AppRole,
  type ElderProfile,
  type FamilyRole,
} from '../../services/ProfileService';
import {
  signInWithGoogle,
  saveFamilySession,
  googleErrorMessage,
} from '../../services/GoogleAuthService';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:      '#EFEAD9',
  elder:   '#274A6E',
  family:  '#6E8E5E',
  ink:     '#1F2A3A',
  sub:     '#7B7A6A',
  washi:   '#FFF8EC',
  white:   '#FFFFFF',
  border:  '#DCD3B8',
  inputBg: '#FAF7EE',
  orange:  '#C98520',
};

const F = {xs: 14, sm: 17, body: 19, md: 22, lg: 26, xl: 32, xxl: 46};

// ─── Logo mark ────────────────────────────────────────────────────────────────
function LogoMark({size = 64}: {size?: number}) {
  return (
    <View style={[s.logoCircle, {width: size, height: size, borderRadius: size / 2}]}>
      <Text style={[s.logoChar, {fontSize: size * 0.42}]}>守</Text>
    </View>
  );
}

// ─── Step 1: Role selection ───────────────────────────────────────────────────
function RoleStep({onSelect}: {onSelect: (r: AppRole) => void}) {
  return (
    <View style={s.stepWrap}>
      <View style={s.heroRow}>
        <LogoMark size={68} />
        <View style={s.heroTextBlock}>
          <Text style={s.heroTitle}>默伴守護</Text>
          <Text style={s.heroSub}>MAMORI · まもり</Text>
        </View>
      </View>

      <View style={s.helpBox}>
        <Text style={s.helpText}>
          如果您是幫家中長輩設定，請選擇「我是長輩」，{'\n'}
          並由您代為完成以下步驟
        </Text>
      </View>

      <Text style={s.warningText}>請選擇身份，選擇後將無法自行更改</Text>

      <TouchableOpacity
        style={[s.roleBtn, {backgroundColor: C.elder}]}
        onPress={() => onSelect('elder')}
        accessibilityRole="button"
        accessibilityLabel="我是長輩">
        <Text style={s.roleBtnIcon}>👴</Text>
        <View style={s.roleBtnInfo}>
          <Text style={s.roleBtnLabel}>我是長輩</Text>
          <Text style={s.roleBtnSub}>通常由家屬代為設定</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.roleBtn, {backgroundColor: C.family}]}
        onPress={() => onSelect('family')}
        accessibilityRole="button"
        accessibilityLabel="我是家屬">
        <Text style={s.roleBtnIcon}>👨</Text>
        <View style={s.roleBtnInfo}>
          <Text style={s.roleBtnLabel}>我是家屬</Text>
          <Text style={s.roleBtnSub}>我要關懷家中長輩</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 2a: Elder — input name/age ─────────────────────────────────────────
function ElderInfoStep({onNext}: {onNext: (name: string, age: number) => void}) {
  const [name, setName] = useState('');
  const [ageText, setAgeText] = useState('');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={s.stepWrap}>
      <Text style={s.stepTitle}>長輩基本資料</Text>
      <Text style={s.stepHint}>請輸入長輩的姓名與年齡</Text>

      <Text style={s.label}>姓名</Text>
      <TextInput
        style={s.input}
        value={name}
        onChangeText={setName}
        placeholder="例如：王爺爺"
        placeholderTextColor={C.sub}
        returnKeyType="next"
        accessibilityLabel="長輩姓名"
      />

      <Text style={s.label}>年齡</Text>
      <TextInput
        style={s.input}
        value={ageText}
        onChangeText={setAgeText}
        placeholder="例如：78"
        placeholderTextColor={C.sub}
        keyboardType="number-pad"
        returnKeyType="done"
        accessibilityLabel="長輩年齡"
      />

      <TouchableOpacity
        style={[s.primaryBtn, {backgroundColor: C.elder}]}
        onPress={() => {
          const trimmed = name.trim();
          const age = parseInt(ageText, 10);
          if (!trimmed) {Alert.alert('請輸入姓名'); return;}
          if (isNaN(age) || age < 1 || age > 130) {Alert.alert('請輸入正確年齡'); return;}
          onNext(trimmed, age);
        }}>
        <Text style={s.primaryBtnText}>下一步</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

// ─── Step 3a: Elder — show QR code ───────────────────────────────────────────
function ElderCodeDisplayStep({
  elderName,
  elderAge,
  onDone,
}: {
  elderName: string;
  elderAge: number;
  onDone: () => void;
}) {
  const [pairCode, setPairCode] = useState('');
  const [codeCreatedAt, setCodeCreatedAt] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    generateCode();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateCode = async () => {
    setLoading(true);
    try {
      const record = await generateAndSavePairCode({elderName, elderAge});
      setPairCode(record.code);
      setCodeCreatedAt(record.createdAt);
      // 存入 elder profile
      await setElderProfile({name: elderName, age: elderAge, pairCode: record.code});
      await setAppRole('elder');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const record = await generateAndSavePairCode({elderName, elderAge});
      setPairCode(record.code);
      setCodeCreatedAt(record.createdAt);
      await setElderProfile({name: elderName, age: elderAge, pairCode: record.code});
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopy = () => {
    Clipboard.setString(pairCode);
    Alert.alert('已複製', '配對碼已複製到剪貼簿');
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `請在家屬手機上打開默伴守護 APP，輸入配對碼：${pairCode}`,
      });
    } catch {}
  };

  const hoursLeft = Math.max(
    0,
    Math.ceil((codeCreatedAt + 48 * 3_600_000 - Date.now()) / 3_600_000),
  );

  const qrData = JSON.stringify({code: pairCode, elderName});

  if (loading) {
    return (
      <View style={[s.stepWrap, {alignItems: 'center', justifyContent: 'center'}]}>
        <Text style={s.stepHint}>產生配對碼中...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.stepWrap}>
      <CodeBadge label="長輩配對碼・6 位數" color={C.elder} bg="#E3EBF4" />
      <Text style={s.stepTitle}>請家屬掃描</Text>
      <Text style={s.stepHint}>
        請在家屬手機上打開默伴守護，掃描此 QR Code 或輸入下方配對碼
      </Text>

      <View style={[s.highlightBox, hoursLeft < 12 && {borderColor: '#C0392B'}]}>
        <Text style={[s.highlightText, hoursLeft < 12 && {color: '#C0392B'}]}>
          {hoursLeft > 0
            ? `有效期限：剩餘 ${hoursLeft} 小時`
            : '配對碼已過期，請重新產生'}
        </Text>
      </View>

      <View style={s.qrCard}>
        <QRCode value={qrData} size={220} color={C.elder} backgroundColor={C.washi} />
      </View>

      <View style={s.backupCodeRow}>
        <Text style={s.backupCodeLabel}>長輩配對碼</Text>
        <Text style={[s.backupCodeValue, {color: C.elder}]}>{pairCode}</Text>
      </View>

      <View style={s.actionRow}>
        <TouchableOpacity style={[s.halfBtn, {borderColor: C.elder}]} onPress={handleCopy}>
          <Text style={[s.halfBtnText, {color: C.elder}]}>📋 複製配對碼</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.halfBtn, {borderColor: C.elder}]} onPress={handleShare}>
          <Text style={[s.halfBtnText, {color: C.elder}]}>📤 分享</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[s.outlineBtn, {borderColor: C.orange, marginBottom: 8}, regenerating && {opacity: 0.5}]}
        onPress={handleRegenerate}
        disabled={regenerating}>
        <Text style={[s.outlineBtnText, {color: C.orange}]}>
          {regenerating ? '產生中...' : '🔄 重新產生配對碼'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.primaryBtn, {backgroundColor: C.elder}]}
        onPress={onDone}>
        <Text style={s.primaryBtnText}>家屬已完成配對，進入 APP</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── QR scanner ───────────────────────────────────────────────────────────────
function FamilyQRScanner({
  onFound,
  onClose,
}: {
  onFound: (code: string) => void;
  onClose: () => void;
}) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const scannedRef = useRef(false);
  const device = useCameraDevice('back');

  useEffect(() => {
    Camera.requestCameraPermission().then(status => {
      setHasPermission(status === 'granted');
    });
  }, []);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      if (scannedRef.current || codes.length === 0) return;
      const val = codes[0]?.value;
      if (!val) return;
      let parsed: string | null = null;
      try {
        const data = JSON.parse(val);
        if (typeof data.code === 'string' && /^\d{6}$/.test(data.code)) {
          parsed = data.code;
        }
      } catch {}
      if (!parsed && /^\d{6}$/.test(val.trim())) {parsed = val.trim();}
      if (parsed) {
        scannedRef.current = true;
        onFound(parsed);
      }
    },
  });

  if (hasPermission === null) {
    return (
      <View style={s.scanCenter}>
        <Text style={s.scanMsg}>正在取得相機權限…</Text>
      </View>
    );
  }
  if (!hasPermission || !device) {
    return (
      <View style={s.scanCenter}>
        <Text style={s.scanMsg}>
          {!hasPermission ? '相機權限被拒絕\n請至設定開啟，或改用手動輸入' : '找不到相機裝置'}
        </Text>
        <TouchableOpacity
          style={[s.primaryBtn, {backgroundColor: C.family, marginTop: 20, width: 180}]}
          onPress={onClose}>
          <Text style={s.primaryBtnText}>改用手動輸入</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const BOX = 220;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        codeScanner={codeScanner}
      />
      <View style={[s.overlay, {top: 0, height: '30%'}]} />
      <View style={[s.overlay, {bottom: 0, height: '30%'}]} />
      <View style={[s.overlay, {top: '30%', left: 0, width: '50%', height: BOX}]} />
      <View style={[s.overlay, {top: '30%', right: 0, width: '50%', height: BOX}]} />
      <View style={[s.scanBox, {width: BOX, height: BOX}]}>
        <View style={[s.corner, s.cornerTL]} />
        <View style={[s.corner, s.cornerTR]} />
        <View style={[s.corner, s.cornerBL]} />
        <View style={[s.corner, s.cornerBR]} />
      </View>
      <View style={s.scanInstruction}>
        <Text style={s.scanInstructionText}>將長輩手機的 QR Code 對準框內</Text>
      </View>
      <TouchableOpacity style={s.scanCloseBtn} onPress={onClose}>
        <Text style={s.scanCloseBtnText}>✕ 改用手動輸入</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Code type badge ──────────────────────────────────────────────────────────
function CodeBadge({label, color, bg}: {label: string; color: string; bg: string}) {
  return (
    <View style={[s.codeBadge, {backgroundColor: bg}]}>
      <Text style={[s.codeBadgeText, {color}]}>{label}</Text>
    </View>
  );
}

// ─── Step 1b: Family — Google login ───────────────────────────────────────────
function FamilyLoginStep({onNext}: {onNext: (googleName: string) => void}) {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const user = await signInWithGoogle();
      if (!user) {return;} // 使用者取消
      await saveFamilySession(user);
      onNext(user.name);
    } catch (e: unknown) {
      const msg = googleErrorMessage(e);
      if (msg) {Alert.alert('登入失敗', msg);}
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.stepWrap}>
      <View style={s.heroRow}>
        <LogoMark size={60} />
        <View style={s.heroTextBlock}>
          <Text style={s.stepTitle}>家屬登入</Text>
          <Text style={s.stepHint}>請先使用 Google 帳號登入</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[s.googleBtn, loading && {opacity: 0.6}]}
        onPress={handleLogin}
        disabled={loading}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="使用 Google 登入">
        {loading ? (
          <ActivityIndicator color={C.family} />
        ) : (
          <>
            <View style={s.gIcon}>
              <Text style={s.gIconText}>G</Text>
            </View>
            <Text style={s.googleBtnText}>使用 Google 登入</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={s.stepHint}>
        沒有 Google 帳號？在登入畫面點「建立帳戶」即可當場申請。
      </Text>
    </View>
  );
}

// ─── Step 2b: Family name ─────────────────────────────────────────────────────
function FamilyNameStep({
  onNext,
  initialName,
}: {
  onNext: (name: string) => void;
  initialName?: string;
}) {
  const [name, setName] = useState(initialName ?? '');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={s.stepWrap}>
      <Text style={s.stepTitle}>家屬資料</Text>
      <Text style={s.stepHint}>請確認或修改您的姓名</Text>

      <Text style={s.label}>姓名</Text>
      <TextInput
        style={s.input}
        value={name}
        onChangeText={setName}
        placeholder="例如：小明"
        placeholderTextColor={C.sub}
        returnKeyType="done"
        accessibilityLabel="家屬姓名"
      />

      <TouchableOpacity
        style={[s.primaryBtn, {backgroundColor: C.family}]}
        onPress={() => {
          const t = name.trim();
          if (!t) {Alert.alert('請輸入姓名'); return;}
          onNext(t);
        }}>
        <Text style={s.primaryBtnText}>下一步</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

// ─── Step 3b: Family — scan or input elder's code ────────────────────────────
function FamilyScanStep({
  familyName,
  onDone,
}: {
  familyName: string;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<'input' | 'scan'>('input');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [found, setFound] = useState<ElderProfile | null>(null);

  const handleVerify = async (c: string) => {
    setLoading(true);
    try {
      const result = await confirmPairingWithCode(c);
      if (result.status === 'expired') {
        Alert.alert('配對碼已過期', '請請長輩重新產生配對碼');
        return;
      }
      if (result.status !== 'ok' || !result.profile) {
        Alert.alert('配對碼無效', '請確認長輩手機上顯示的配對碼是否正確');
        return;
      }
      setMode('input');
      setFound(result.profile);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!found) {return;}
    await setAppRole('family');
    await setFamilyProfile({name: familyName, role: 'admin'});
    const now = new Date().toISOString();
    await addPairedElder({
      pairCode: found.pairCode,
      name: found.name,
      age: found.age,
      pairedAt: now,
      elderId: found.elderId ?? undefined,
    });
    const fp = await getFamilyProfile();
    await addFamilyMember({
      name: familyName,
      pairedAt: now,
      familyId: fp?.familyId,
      role: 'admin',
    });
    onDone();
  };

  if (found) {
    return (
      <View style={s.stepWrap}>
        <Text style={s.stepTitle}>配對確認</Text>
        <View style={s.confirmCard}>
          <Text style={s.confirmIcon}>👴</Text>
          <Text style={s.confirmName}>{found.name}</Text>
          <Text style={s.confirmAge}>{found.age} 歲</Text>
        </View>
        <Text style={s.stepHint}>請確認這是正確的長輩資料</Text>
        <TouchableOpacity
          style={[s.primaryBtn, {backgroundColor: C.family}]}
          onPress={handleConfirm}>
          <Text style={s.primaryBtnText}>確認，開始使用</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.skipBtn} onPress={() => {setFound(null); setCode('');}}>
          <Text style={s.skipBtnText}>不是，重新配對</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (mode === 'scan') {
    return (
      <View style={{flex: 1}}>
        <FamilyQRScanner
          onFound={c => handleVerify(c)}
          onClose={() => setMode('input')}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={s.stepWrap}>
      <CodeBadge label="長輩配對碼・6 位數" color={C.family} bg="#E9F0E5" />
      <Text style={s.stepTitle}>輸入長輩配對碼</Text>
      <Text style={s.stepHint}>
        請輸入長輩手機上顯示的 6 位數配對碼，或掃描 QR Code
      </Text>

      <TextInput
        style={[s.input, s.codeInput]}
        value={code}
        onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        placeholderTextColor={C.sub}
        keyboardType="number-pad"
        maxLength={6}
        returnKeyType="done"
        onSubmitEditing={() => {if (code.length === 6) {handleVerify(code);}}}
        accessibilityLabel="配對碼"
      />

      <TouchableOpacity
        style={[s.primaryBtn, {backgroundColor: C.family, opacity: loading || code.length !== 6 ? 0.55 : 1}]}
        onPress={() => handleVerify(code)}
        disabled={loading || code.length !== 6}>
        <Text style={s.primaryBtnText}>{loading ? '配對中...' : '確認配對'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.outlineBtn, {borderColor: C.family, marginTop: 12}]}
        onPress={() => setMode('scan')}>
        <Text style={[s.outlineBtnText, {color: C.family}]}>📷 掃描 QR Code</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

// ─── Step 4b: Join existing family via invite code ────────────────────────────
function FamilyJoinStep({familyName, onDone}: {familyName: string; onDone: () => void}) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    if (code.trim().length !== 8) {Alert.alert('請輸入 8 位數邀請碼'); return;}
    setLoading(true);
    try {
      const {confirmInviteCode} = require('../../api/pairingApi');
      const result = await confirmInviteCode(code.trim());

      if (!result?.success) {
        Alert.alert(
          '邀請碼無效或已過期',
          '請確認邀請碼是否正確，或請管理員重新產生',
        );
        return;
      }

      const now = new Date().toISOString();
      await setAppRole('family');
      await setFamilyProfile({name: familyName, role: 'viewer' as FamilyRole});
      const fp = await getFamilyProfile();
      await addFamilyMember({
        name: familyName,
        pairedAt: now,
        familyId: fp?.familyId,
        role: 'viewer',
      });

      // 查看者也要看得到長輩，否則儀表板的關懷名單會是空的。
      // 邀請流程沒有 6 位數配對碼，故以 pairingId 作為 pairCode 代用值。
      await addPairedElder({
        pairCode: String(result.pairingId),
        name: result.elderName || '長輩',
        age: result.elderAge || 0,
        pairedAt: now,
        elderId: result.elderId ? String(result.elderId) : undefined,
      });

      if (result.elderId) {
        await AsyncStorage.setItem('backendElderId', String(result.elderId));
      }
      if (result.pairingId) {
        await AsyncStorage.setItem('backendPairingId', String(result.pairingId));
      }

      // 登記本機 FCM token，讓此查看者也收得到推播（失敗不影響加入）
      try {
        const messaging = require('@react-native-firebase/messaging').default;
        const {registerFamilyFcmToken} = require('../../api/notificationApi');
        const fcmToken = await messaging().getToken();
        if (result.pairingId && fcmToken) {
          await registerFamilyFcmToken(String(result.pairingId), fcmToken);
        }
      } catch (fcmErr) {
        console.warn('[FamilyJoinStep] FCM token 登記失敗（不影響加入）:', fcmErr);
      }

      Alert.alert('加入成功！', `歡迎 ${familyName}！您已加入為查看者`, [
        {text: '開始使用', onPress: onDone},
      ]);
    } catch (e) {
      console.error('[FamilyJoinStep] 加入失敗:', e);
      Alert.alert('加入失敗', '請檢查網路連線後再試一次');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={s.stepWrap}>
      <CodeBadge label="家屬邀請碼・8 位數" color="#6B21A8" bg="#EDE9F6" />
      <Text style={s.stepTitle}>加入現有家庭</Text>
      <Text style={s.stepHint}>請輸入管理員家屬提供的 8 位數家屬邀請碼</Text>

      <View style={s.highlightBox}>
        <Text style={s.highlightText}>
          家屬邀請碼有效期限 48 小時，過期須向管理員重新索取{'\n'}
          注意：這與長輩配對碼（6 位數）不同
        </Text>
      </View>

      <TextInput
        style={[s.input, s.codeInput]}
        value={code}
        onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 8))}
        placeholder="00000000"
        placeholderTextColor={C.sub}
        keyboardType="number-pad"
        maxLength={8}
        returnKeyType="done"
        onSubmitEditing={handleJoin}
        accessibilityLabel="家屬邀請碼"
      />

      <TouchableOpacity
        style={[s.primaryBtn, {backgroundColor: '#7C6FA0'}]}
        onPress={handleJoin}
        disabled={loading}>
        <Text style={s.primaryBtnText}>{loading ? '驗證中...' : '確認加入'}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

// ─── Step 3b choice ───────────────────────────────────────────────────────────
function FamilyChoiceStep({
  onPrimary,
  onJoin,
}: {
  onPrimary: () => void;
  onJoin: () => void;
}) {
  return (
    <View style={s.stepWrap}>
      <Text style={s.stepTitle}>如何使用？</Text>
      <Text style={s.stepHint}>請選擇您的加入方式</Text>

      <TouchableOpacity
        style={[s.roleBtn, {backgroundColor: C.family}]}
        onPress={onPrimary}
        accessibilityRole="button">
        <Text style={s.roleBtnIcon}>📱</Text>
        <View style={s.roleBtnInfo}>
          <Text style={s.roleBtnLabel}>配對長輩手機</Text>
          <Text style={s.roleBtnSub}>輸入長輩手機顯示的配對碼</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.roleBtn, {backgroundColor: '#7C6FA0'}]}
        onPress={onJoin}
        accessibilityRole="button">
        <Text style={s.roleBtnIcon}>👥</Text>
        <View style={s.roleBtnInfo}>
          <Text style={s.roleBtnLabel}>加入現有家庭</Text>
          <Text style={s.roleBtnSub}>輸入管理員家屬的邀請碼（8 位數）</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

type Step =
  | {type: 'role'}
  | {type: 'elder_info'}
  | {type: 'elder_code'; elderName: string; elderAge: number}
  | {type: 'family_login'}
  | {type: 'family_name'; googleName?: string}
  | {type: 'family_choice'; familyName: string}
  | {type: 'family_scan'; familyName: string}
  | {type: 'family_join'; familyName: string};

export default function OnboardingScreen({onComplete}: {onComplete: () => void}) {
  const [step, setStep] = useState<Step>({type: 'role'});

  const handleRoleSelect = (role: AppRole) => {
    setStep(role === 'elder' ? {type: 'elder_info'} : {type: 'family_login'});
  };

  const progressTotal = step.type.startsWith('family') ? 4 : 0;
  const progressDone =
    !step.type.startsWith('family')     ? 0 :
    step.type === 'family_login'        ? 1 :
    step.type === 'family_name'         ? 2 :
    step.type === 'family_choice'       ? 3 :
    (step.type === 'family_scan' ||
     step.type === 'family_join')       ? 4 : 0;

  const isFullScreen = step.type === 'family_scan';

  return (
    <View style={s.root}>
      {!isFullScreen && (
        <View style={s.topBar}>
          <View style={s.progressRow}>
            {progressTotal > 0 &&
              Array.from({length: progressTotal}).map((_, i) => (
                <View
                  key={i}
                  style={[s.dot, i < progressDone ? {backgroundColor: C.family} : s.dotPending]}
                />
              ))}
          </View>
        </View>
      )}

      {isFullScreen && step.type === 'family_scan' && (
        <FamilyScanStep
          familyName={step.familyName}
          onDone={onComplete}
        />
      )}

      {!isFullScreen && (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled">
          {step.type === 'role' && (
            <RoleStep onSelect={handleRoleSelect} />
          )}
          {step.type === 'elder_info' && (
            <ElderInfoStep
              onNext={(name, age) => setStep({type: 'elder_code', elderName: name, elderAge: age})}
            />
          )}
          {step.type === 'elder_code' && (
            <ElderCodeDisplayStep
              elderName={step.elderName}
              elderAge={step.elderAge}
              onDone={onComplete}
            />
          )}
          {step.type === 'family_login' && (
            <FamilyLoginStep
              onNext={googleName => setStep({type: 'family_name', googleName})}
            />
          )}
          {step.type === 'family_name' && (
            <FamilyNameStep
              initialName={step.googleName}
              onNext={name => setStep({type: 'family_choice', familyName: name})}
            />
          )}
          {step.type === 'family_choice' && (
            <FamilyChoiceStep
              onPrimary={() => setStep({type: 'family_scan', familyName: step.familyName})}
              onJoin={() => setStep({type: 'family_join', familyName: step.familyName})}
            />
          )}
          {step.type === 'family_join' && (
            <FamilyJoinStep familyName={step.familyName} onDone={onComplete} />
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {flex: 1, backgroundColor: C.bg},
  topBar: {
    backgroundColor: C.bg,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  progressRow: {flexDirection: 'row', gap: 8, alignItems: 'center'},
  dot: {width: 10, height: 10, borderRadius: 5},
  dotPending: {backgroundColor: C.border},
  googleBtn: {
    width: '100%',
    backgroundColor: C.white,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 24,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  gIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  gIconText: {color: '#4285F4', fontSize: 17, fontWeight: '900'},
  googleBtnText: {color: C.ink, fontSize: F.body, fontWeight: 'bold'},
  scroll: {flex: 1},
  scrollContent: {flexGrow: 1},
  stepWrap: {flex: 1, padding: 24, paddingTop: 44},
  heroRow: {flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16},
  logoCircle: {
    backgroundColor: C.elder, alignItems: 'center', justifyContent: 'center',
    transform: [{rotate: '-4deg'}],
    shadowColor: C.elder, shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },
  logoChar: {color: C.washi, fontWeight: '900'},
  heroTextBlock: {flex: 1},
  heroTitle: {fontSize: F.xl, fontWeight: '800', color: C.ink, letterSpacing: 3},
  heroSub: {fontSize: F.xs, color: C.sub, letterSpacing: 0.5, marginTop: 4},
  helpBox: {
    backgroundColor: C.washi, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 16,
  },
  helpText: {fontSize: F.sm, color: C.sub, lineHeight: 26, textAlign: 'center'},
  warningText: {fontSize: F.xs, color: C.sub, lineHeight: 20, marginBottom: 20, textAlign: 'center'},
  roleBtn: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 18,
    padding: 22, marginBottom: 16, minHeight: 88,
    shadowColor: '#000', shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.18, shadowRadius: 8, elevation: 5,
  },
  roleBtnIcon: {fontSize: 42, marginRight: 18},
  roleBtnInfo: {flex: 1},
  roleBtnLabel: {fontSize: F.md, fontWeight: '700', color: C.white, marginBottom: 4},
  roleBtnSub: {fontSize: F.sm, color: 'rgba(255,255,255,0.78)'},
  codeBadge: {
    borderRadius: 20, paddingVertical: 5, paddingHorizontal: 14,
    marginBottom: 12, alignSelf: 'flex-start',
  },
  codeBadgeText: {fontSize: F.xs, fontWeight: '700', letterSpacing: 0.5},
  stepTitle: {fontSize: F.lg, fontWeight: '800', color: C.ink, marginBottom: 8},
  stepHint: {fontSize: F.sm, color: C.sub, lineHeight: 26, marginBottom: 28},
  label: {
    fontSize: F.xs, fontWeight: '700', color: C.sub, marginBottom: 8,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16,
    fontSize: F.body, color: C.ink, marginBottom: 20, minHeight: 58,
  },
  codeInput: {
    fontSize: F.xl, fontWeight: '800', letterSpacing: 10,
    textAlign: 'center', minHeight: 72,
  },
  highlightBox: {
    borderWidth: 1.5, borderColor: C.orange, backgroundColor: C.washi,
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 20,
  },
  highlightText: {fontSize: F.xs, color: C.orange, textAlign: 'center', fontWeight: '600'},
  primaryBtn: {
    borderRadius: 16, paddingVertical: 20, alignItems: 'center',
    justifyContent: 'center', marginTop: 8, minHeight: 64,
    shadowColor: '#000', shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  primaryBtnText: {color: C.white, fontSize: F.body, fontWeight: '700'},
  outlineBtn: {
    borderRadius: 16, paddingVertical: 18, alignItems: 'center',
    justifyContent: 'center', minHeight: 58, borderWidth: 2,
  },
  outlineBtnText: {fontSize: F.sm, fontWeight: '700'},
  skipBtn: {paddingVertical: 16, alignItems: 'center', minHeight: 48, marginTop: 8},
  skipBtnText: {color: C.sub, fontSize: F.sm, textDecorationLine: 'underline'},
  actionRow: {flexDirection: 'row', gap: 12, marginBottom: 16},
  halfBtn: {
    flex: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    justifyContent: 'center', minHeight: 54, borderWidth: 2,
  },
  halfBtnText: {fontSize: F.sm, fontWeight: '700'},
  qrCard: {
    backgroundColor: C.washi, borderRadius: 20, padding: 24,
    alignItems: 'center', marginBottom: 16,
    borderWidth: 1.5, borderColor: C.border,
    shadowColor: '#000', shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  backupCodeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, marginBottom: 16, paddingVertical: 10, paddingHorizontal: 20,
    backgroundColor: C.washi, borderRadius: 12, borderWidth: 1, borderColor: C.border,
  },
  backupCodeLabel: {fontSize: F.xs, color: C.sub, fontWeight: '600', letterSpacing: 0.5},
  backupCodeValue: {fontSize: F.xl, fontWeight: '900', letterSpacing: 6},
  confirmCard: {
    backgroundColor: C.washi, borderRadius: 20, padding: 28,
    alignItems: 'center', marginBottom: 24,
    borderWidth: 1.5, borderColor: C.border,
  },
  confirmIcon: {fontSize: 56, marginBottom: 12},
  confirmName: {fontSize: F.lg, fontWeight: '800', color: C.ink, marginBottom: 4},
  confirmAge: {fontSize: F.body, color: C.sub},
  scanCenter: {
    flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111',
  },
  scanMsg: {color: C.white, fontSize: F.sm, textAlign: 'center', lineHeight: 26},
  overlay: {position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.65)'},
  scanBox: {position: 'absolute', alignSelf: 'center', top: '30%'},
  corner: {position: 'absolute', width: 28, height: 28},
  cornerTL: {top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderColor: C.family},
  cornerTR: {top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderColor: C.family},
  cornerBL: {bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: C.family},
  cornerBR: {bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderColor: C.family},
  scanInstruction: {
    position: 'absolute', bottom: 80, left: 0, right: 0,
    alignItems: 'center', paddingHorizontal: 32,
  },
  scanInstructionText: {
    color: C.white, fontSize: F.sm, fontWeight: '600', textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 4,
  },
  scanCloseBtn: {
    position: 'absolute', top: 20, right: 16,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  scanCloseBtnText: {color: C.white, fontSize: F.xs, fontWeight: '700'},
});
