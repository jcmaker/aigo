import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

type Api = <T>(path: string, init?: RequestInit) => Promise<T>;

// 앱이 켜져 있을 때도 배너를 보인다.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** 알림 data에서 분석 번호를 꺼낸다. 숫자가 아니면 null. */
export function analysisIdFrom(data: unknown): number | null {
  const id = (data as { analysis_id?: unknown } | null | undefined)?.analysis_id;
  const n = typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** 이 기기의 Expo 푸시 토큰. 받을 수 없으면(EAS 프로젝트 ID 없음, 에뮬레이터 등) null. */
async function currentToken(): Promise<string | null> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn('[push] EAS 프로젝트 ID가 없어 푸시를 건너뜁니다.');
    return null;
  }
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

/**
 * 푸시 토큰을 서버에 등록한다. ask=true면 권한이 없을 때 요청한다(첫 분석 제출 뒤).
 * 어떤 이유로든 실패해도 앱을 멈추지 않고 로그만 남긴다.
 */
export async function registerPush(api: Api, ask: boolean): Promise<void> {
  try {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
    if (Platform.OS === 'android') {
      // Android 13 이상은 채널이 있어야 권한 창이 뜬다.
      await Notifications.setNotificationChannelAsync('default', { name: '분석 알림', importance: Notifications.AndroidImportance.DEFAULT });
    }
    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted && ask) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    const token = await currentToken();
    if (token) await api('/api/v1/devices', { method: 'POST', body: JSON.stringify({ token, platform: Platform.OS }) });
  } catch (e) {
    console.warn('[push] 등록하지 못했습니다.', e);
  }
}

/** 로그아웃 전에 토큰을 지운다. 실패하거나 3초가 넘으면 포기한다(로그아웃을 막지 않는다). */
export async function unregisterPush(api: Api): Promise<void> {
  const run = async () => {
    try {
      const token = await currentToken();
      if (token) await api(`/api/v1/devices?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('[push] 토큰을 지우지 못했습니다.', e);
    }
  };
  let timer: ReturnType<typeof setTimeout>;
  await Promise.race([run(), new Promise<void>((resolve) => (timer = setTimeout(resolve, 3000)))]);
  clearTimeout(timer!);
}
