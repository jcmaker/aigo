import { useSSO } from '@clerk/expo';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { clerkMessage } from '@/lib/clerkMessage';
import { Text } from 'react-native';
import { color, type as t } from '@/theme';
import { Button } from './ui';

// 브라우저에서 앱으로 돌아온 인증 세션을 마무리한다.
WebBrowser.maybeCompleteAuthSession();

const PROVIDERS = [
  { strategy: 'oauth_google', label: 'Google로 계속하기' },
  { strategy: 'oauth_apple', label: 'Apple로 계속하기' },
  { strategy: 'oauth_facebook', label: 'Facebook으로 계속하기' },
] as const;

export function SocialButtons() {
  const { startSSOFlow } = useSSO();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(strategy: (typeof PROVIDERS)[number]['strategy']) {
    setPending(true);
    setError(null);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy,
        redirectUrl: AuthSession.makeRedirectUri({ scheme: 'aigo', path: 'callback' }),
      });
      // 로그인이 되면 (tabs)로 보내는 일은 루트 레이아웃의 Stack.Protected가 한다.
      if (createdSessionId) await setActive!({ session: createdSessionId });
      else setError('로그인을 마치지 못했습니다. 다른 방법으로 시도해 주세요.');
    } catch (e) {
      setError(clerkMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {PROVIDERS.map((p) => (
        <Button key={p.strategy} label={p.label} variant="secondary" disabled={pending} onPress={() => start(p.strategy)} />
      ))}
      {error ? <Text style={[t.caption, { color: color.danger600 }]}>{error}</Text> : null}
    </>
  );
}
