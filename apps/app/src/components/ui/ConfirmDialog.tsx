import { useState, type ReactNode } from 'react';
import { Modal, Pressable, Text } from 'react-native';
import { color, radius, space, type } from '@/theme';
import { Button } from './Button';
import type { IconName } from './Icon';

export type ConfirmRequest = {
  title: string;
  body?: string;
  confirmLabel: string;
  /** 지우기·탈퇴처럼 되돌릴 수 없으면 빨간 버튼, 아니면 남색 버튼 */
  danger?: boolean;
  icon?: IconName;
  onConfirm: () => void;
};

/**
 * 앱 모양의 확인 창(ADR 0042). 휴대폰 기본 회색 창 대신 쓴다.
 * 사용: const [ask, dialog] = useConfirm(); ask({...}); 화면 JSX 어딘가에 {dialog}를 둔다.
 */
export function useConfirm(): [(r: ConfirmRequest) => void, ReactNode] {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  const close = () => setReq(null);
  const dialog = (
    <Modal visible={!!req} transparent animationType="fade" onRequestClose={close}>
      <Pressable accessibilityLabel="닫기" onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: space[5] }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: color.white, borderRadius: radius.card, padding: space[5], gap: space[3] }}>
          <Text accessibilityRole="header" style={[type.title, { fontSize: 21, color: color.gray12 }]}>{req?.title}</Text>
          {req?.body ? <Text style={[type.body, { fontSize: 15, color: color.gray11, lineHeight: 22 }]}>{req.body}</Text> : null}
          <Button
            label={req?.confirmLabel ?? ''}
            variant={req?.danger ? 'emergency' : 'primary'}
            icon={req?.icon}
            onPress={() => {
              const r = req;
              close();
              r?.onConfirm();
            }}
          />
          <Button label="취소" variant="secondary" onPress={close} />
        </Pressable>
      </Pressable>
    </Modal>
  );
  return [setReq, dialog];
}
