import React, {useState} from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';


const C = {
  bg: '#EFEAD9', card: '#FAF6E8', border: '#DCD3B8',
  primary: '#274A6E', ink: '#1F2A3A', sub: '#7B7A6A',
  green: '#6E8E5E', white: '#FFFFFF',
};

interface Props {
  onLoginSuccess: () => void;
}

export default function FamilyLoginScreen({onLoginSuccess}: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) {
      Alert.alert('請輸入 Email');
      return;
    }
    setLoading(true);
    try {
      await AsyncStorage.setItem('familyToken', 'local_' + email.trim());
      await AsyncStorage.setItem('familyEmail', email.trim());
      onLoginSuccess();
    } catch (e: any) {
      Alert.alert('登入失敗', e?.message || '請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.logo}>默</Text>
        <Text style={styles.title}>默伴守護</Text>
        <Text style={styles.subtitle}>家屬登入</Text>

        <TextInput
          style={styles.input}
          placeholder="請輸入 Email"
          placeholderTextColor={C.sub}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={[styles.btn, loading && {opacity: 0.6}]}
          onPress={handleLogin}
          disabled={loading}>
          {loading
            ? <ActivityIndicator color={C.white} />
            : <Text style={styles.btnText}>登入 / 註冊</Text>
          }
        </TouchableOpacity>

        <Text style={styles.hint}>
          輸入 Email 即可登入或自動註冊帳號
        </Text>
      </View>
    </KeyboardAvoidingView>
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
  input: {
    width: '100%', backgroundColor: '#FAF7EE',
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 18, color: C.ink, marginBottom: 16,
  },
  btn: {
    width: '100%', backgroundColor: C.primary,
    borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginBottom: 12,
  },
  btnText: {color: C.white, fontSize: 18, fontWeight: 'bold'},
  hint: {fontSize: 13, color: C.sub, textAlign: 'center'},
});