import React, {useState, useRef, useEffect} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {Camera, useCameraDevice, useCodeScanner} from 'react-native-vision-camera';

// 由 OnboardingScreen 抽出，供 onboarding 與家屬儀表板「新增長輩」共用。
// 掃描長輩端顯示的 QR Code，解析出 6 位數配對碼後透過 onFound 回傳。

const C = {
  family: '#6E8E5E',
  white:  '#FFFFFF',
};

const F = {xs: 14, sm: 17, body: 19};

export default function FamilyQRScanner({
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

const s = StyleSheet.create({
  primaryBtn: {
    borderRadius: 16, paddingVertical: 20, alignItems: 'center',
    justifyContent: 'center', marginTop: 8, minHeight: 64,
    shadowColor: '#000', shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  primaryBtnText: {color: C.white, fontSize: F.body, fontWeight: '700'},
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
