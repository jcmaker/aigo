import { useSignUp } from '@clerk/expo';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SocialButtons } from '@/components/SocialButtons';
import { Button, ErrorText, Input, styles } from '@/components/ui';
import { clerkMessage } from '@/lib/clerkMessage';

export default function SignUpScreen() {
  const { signUp } = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const submit = () =>
    run(async () => {
      const made = await signUp.password({ emailAddress: email, password });
      if (made.error) return made;
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) return sent;
      setStep('code');
    });

  const verify = () =>
    run(async () => {
      const { error } = await signUp.verifications.verifyEmailCode({ code });
      if (error) return { error };
      if (signUp.status === 'complete') return signUp.finalize();
      setError('가입을 마치지 못했습니다. 처음부터 다시 시도해 주세요.');
    });

  if (step === 'code') {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>이메일 인증</Text>
        <Text>{email}로 보낸 인증 코드를 입력해 주세요.</Text>
        <Input value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="인증 코드" />
        <ErrorText>{error}</ErrorText>
        <Button label="확인" disabled={pending || !code} onPress={verify} />
        <Button label="코드 다시 받기" secondary disabled={pending} onPress={() => run(() => signUp.verifications.sendEmailCode())} />
        <Button
          label="이메일 다시 입력"
          secondary
          onPress={async () => {
            await signUp.reset();
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
      <Text style={styles.title}>회원가입</Text>
      <Input value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" placeholder="이메일" />
      <Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="비밀번호 (15자 이상)" />
      <ErrorText>{error}</ErrorText>
      <Button label="가입하기" disabled={pending || !email || !password} onPress={submit} />
      <Link href="/sign-in">이미 계정이 있어요</Link>
      <SocialButtons />
    </View>
  );
}
