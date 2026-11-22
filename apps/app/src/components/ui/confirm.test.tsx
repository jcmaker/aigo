import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from './Button';
import { useConfirm } from './ConfirmDialog';

function Demo({ onConfirm }: { onConfirm: () => void }) {
  const [ask, dialog] = useConfirm();
  return (
    <>
      <Button label="지우기" onPress={() => ask({ title: '분석을 지울까요?', body: '되돌릴 수 없어요.', confirmLabel: '삭제', danger: true, onConfirm })} />
      {dialog}
    </>
  );
}

test('확인 창: 취소하면 아무 일도 없고, 확인 버튼을 눌러야 실행한다', async () => {
  const onConfirm = jest.fn();
  await render(<Demo onConfirm={onConfirm} />);
  expect(screen.queryByText('분석을 지울까요?')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '지우기' }));
  expect(screen.getByText('분석을 지울까요?')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '취소' }));
  expect(onConfirm).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '지우기' }));
  await fireEvent.press(screen.getByRole('button', { name: '삭제' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});
