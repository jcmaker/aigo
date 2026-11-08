// analysis.ts(formatTime)가 api.ts를 거쳐 Clerk를 불러오고, Clerk는 타이머를 남긴다.
jest.mock('@clerk/expo', () => ({ useAuth: jest.fn() }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button, SegmentGauge, SegmentedControl, TimeChip, statusTone } from './index';

test('버튼은 비활성일 때 누를 수 없고 role이 button이다', async () => {
  const onPress = jest.fn();
  await render(<Button label="올리고 분석 시작" onPress={onPress} disabled />);
  await fireEvent.press(screen.getByRole('button', { name: '올리고 분석 시작' }));
  expect(onPress).not.toHaveBeenCalled();
});

test('시각 칩은 "0:11 장면으로 이동"으로 읽히고 누르면 초를 넘긴다', async () => {
  const onPress = jest.fn();
  await render(<TimeChip seconds={11.6} onPress={onPress} />);
  await fireEvent.press(screen.getByRole('button', { name: '0:11 장면으로 이동' }));
  expect(onPress).toHaveBeenCalledWith(11.6);
});

test('게이지는 라벨과 값을 읽을 수 있게 노출한다', async () => {
  await render(<SegmentGauge segments={['on', 'off']} label="예상 범위" value="20~40%" />);
  expect(screen.getByLabelText('예상 범위 20~40%')).toBeTruthy();
});

test('탭 전환은 선택 상태를 알린다', async () => {
  const onChange = jest.fn();
  await render(<SegmentedControl options={[{ value: 'a', label: '요약' }, { value: 'b', label: '근거' }]} value="a" onChange={onChange} />);
  expect(screen.getByRole('tab', { name: '요약', selected: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: '근거' }));
  expect(onChange).toHaveBeenCalledWith('b');
});

test('상태 색 매핑', async () => {
  expect([statusTone('done'), statusTone('queued'), statusTone('failed'), statusTone('created')]).toEqual(['good', 'warn', 'bad', 'neutral']);
});
