import React, {useState} from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import {
  signInWithGoogle,
  saveFamilySession,
  googleErrorMessage,
} from '../../services/GoogleAuthService';

const C = {
  bg: '#EFEAD9', card: '#FAF6E8', border: '#DCD3B8',
  primary: '#274A6E', ink: '#1F2A3A', sub: '#7B7A6A',
  green: '#6E8E5E', white: '#FFFFFF',
};

interface Props {
  onLoginSuccess: () => void;
}

export default function FamilyLoginScreen({onLoginSuccess}: Props) {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const user = await signInWithGoogle();
      if (!user) {return;} // 使用者取消
      await saveFamilySession(user);
      onLoginSuccess();
    } catch (e: unknown) {
      const msg = googleErrorMessage(e);
      if (msg) {Alert.alert('登入失敗', msg);}
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.logo}>默</Text>
        <Text style={styles.title}>默伴守護</Text>
        <Text style={styles.subtitle}>家屬登入</Text>

        <TouchableOpacity
          style={[styles.googleBtn, loading && {opacity: 0.6}]}
          onPress={handleGoogleLogin}
          disabled={loading}
          activeOpacity={0.8}>
          {loading ? (
            <ActivityIndicator color={C.primary} />
          ) : (
            <>
              <View style={styles.gIcon}>
                <Text style={styles.gIconText}>G</Text>
              </View>
              <Text style={styles.googleBtnText}>使用 Google 登入</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.hint}>
          使用您的 Google 帳號登入，即可管理家中長輩
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center'},
  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 32,
    width: '85%', alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  logo: {fontSize: 48, color: C.primary, fontWeight: 'bold', marginBottom: 4},
  title: {fontSize: 22, color: C.ink, fontWeight: 'bold', marginBottom: 4},
  subtitle: {fontSize: 16, color: C.sub, marginBottom: 28},
  googleBtn: {
    width: '100%', backgroundColor: C.white,
    borderRadius: 10, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
    marginBottom: 16,
  },
  gIcon: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1, borderColor: C.border,
  },
  gIconText: {color: '#4285F4', fontSize: 16, fontWeight: '900'},
  googleBtnText: {color: C.ink, fontSize: 18, fontWeight: 'bold'},
  hint: {fontSize: 13, color: C.sub, textAlign: 'center'},
});
