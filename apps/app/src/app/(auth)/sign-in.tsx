import { useSignIn } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SocialButtons } from '@/components/SocialButtons';
import { Button, ErrorText, Input, styles } from '@/components/ui';
import { clerkMessage } from '@/lib/clerkMessage';

export default function SignInScreen() {
  const { signIn } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 실패하면 Clerk 오류를 한국어로 바꿔 보이고, 성공하면 true를 돌려준다.
  async function run(fn: () => Promise<{ error: unknown } | void>) {
    setPending(true);
    setError(null);
    try {
      const r = await fn();
      if (r?.error) return void setError(clerkMessage(r.error));
    } catch (e) {
      setError(clerkMessage(e));
    } finally {
      setPending(false);
    }
  }

  const finish = () => signIn.finalize();

  const submit = () =>
    run(async () => {
      const { error } = await signIn.password({ emailAddress: email, password });
      if (error) return { error };
      if (signIn.status === 'complete') return finish();
      // 새 기기 확인과 2단계 인증은 이메일 코드로 한다.
      if (signIn.status === 'needs_client_trust' || signIn.status === 'needs_second_factor') {
        const sent = await signIn.mfa.sendEmailCode();
        if (sent.error) return sent;
        return setStep('code');
      }
      setError('로그인을 마치지 못했습니다. 다른 방법으로 시도해 주세요.');
    });

  const verify = () =>
    run(async () => {
      const { error } = await signIn.mfa.verifyEmailCode({ code });
      if (error) return { error };
      if (signIn.status === 'complete') return finish();
      setError('로그인을 마치지 못했습니다. 처음부터 다시 시도해 주세요.');
    });

  if (step === 'code') {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>이메일 인증</Text>
        <Text>{email}로 보낸 인증 코드를 입력해 주세요.</Text>
        <Input value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="인증 코드" />
        <ErrorText>{error}</ErrorText>
        <Button label="확인" disabled={pending || !code} onPress={verify} />
        <Button label="코드 다시 받기" secondary disabled={pending} onPress={() => run(() => signIn.mfa.sendEmailCode())} />
        <Button
          label="처음부터 다시"
          secondary
          onPress={async () => {
            await signIn.reset();
            setCode('');
            setError(null);
            setStep('form');
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>로그인</Text>
      <Input value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" placeholder="이메일" />
      <Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" placeholder="비밀번호" />
      <ErrorText>{error}</ErrorText>
      <Button label="로그인" disabled={pending || !email || !password} onPress={submit} />
      <Link href="/sign-up">회원가입</Link>
      <SocialButtons />
      <Button label="사고 현장 모드" secondary onPress={() => router.push('/scene')} />
    </View>
  );
}
