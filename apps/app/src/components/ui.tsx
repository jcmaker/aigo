import { Pressable, StyleSheet, Text, TextInput, type TextInputProps } from 'react-native';

// 기능 확인용 최소 스타일. 디자인 작업은 하지 않는다.
export function Input(props: TextInputProps) {
  return <TextInput autoCapitalize="none" autoCorrect={false} style={styles.input} {...props} />;
}

export function Button({ label, onPress, disabled, secondary }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}
    >
      <Text style={secondary ? styles.secondaryText : styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export const ErrorText = ({ children }: { children?: string | null }) =>
  children ? <Text style={styles.error}>{children}</Text> : null;

export const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center' },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#111' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  secondaryText: { color: '#111', fontWeight: '600' },
  error: { color: '#c00' },
});
