import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';

// 來自 google-services.json 的 Web Client ID（client_type: 3）
const WEB_CLIENT_ID =
  '115371530434-iriisen7si23qn07hf6lga9sksf6p72f.apps.googleusercontent.com';

// 來自 GoogleService-Info.plist 的 CLIENT_ID（iOS OAuth 用戶端）
const IOS_CLIENT_ID =
  '115371530434-367u7qc38ki3ehnlbu8h8m0200kpqmam.apps.googleusercontent.com';

let configured = false;

/** 初始化 Google Sign-In（重複呼叫安全，只會設定一次） */
export function configureGoogle(): void {
  if (configured) {return;}
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID, // Android 會忽略此欄位，不影響現有行為
    offlineAccess: false,
  });
  configured = true;
}

export interface GoogleUser {
  idToken: string | null;
  email: string;
  name: string;
  photo: string;
}

/**
 * 觸發 Google 登入。
 * @returns 登入成功回傳使用者資料；使用者取消則回傳 null。
 * @throws 其他錯誤（無 Play 服務等）往外拋，由呼叫端處理。
 */
export async function signInWithGoogle(): Promise<GoogleUser | null> {
  configureGoogle();
  await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) {
    return null; // 使用者取消
  }
  const {idToken, user} = response.data;
  return {
    idToken: idToken ?? null,
    email: user.email,
    name: user.name ?? '',
    photo: user.photo ?? '',
  };
}

/** 把家屬登入資訊寫入 AsyncStorage */
export async function saveFamilySession(u: GoogleUser): Promise<void> {
  await AsyncStorage.multiSet([
    ['familyToken', u.idToken ?? `google_${u.email}`],
    ['familyEmail', u.email],
    ['familyName', u.name],
    ['familyPhoto', u.photo],
  ]);
}

/** 安全登出 Google（未登入時不拋錯） */
export async function signOutGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // 未曾登入或已登出，忽略
  }
}

/**
 * 把捕捉到的錯誤轉成給使用者看的訊息。
 * @returns 需要提示的訊息字串；若是使用者主動取消則回傳 null（不需跳錯誤）。
 */
export function googleErrorMessage(e: unknown): string | null {
  if (isErrorWithCode(e)) {
    switch (e.code) {
      case statusCodes.SIGN_IN_CANCELLED:
      case statusCodes.IN_PROGRESS:
        return null;
      case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
        return '此裝置未安裝 Google Play 服務';
      default:
        return `錯誤代碼：${e.code}`;
    }
  }
  return (e as Error)?.message || '請稍後再試';
}
