import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '@/components/ui';
import { color, radius, space, type as t } from '@/theme';

// 블랙박스마다 방법이 달라 단정하지 않는다.
const FIND_TIPS = [
  '대부분 블랙박스 제조사 앱(와이파이 연결)에서 휴대폰으로 저장할 수 있어요',
  '메모리카드를 빼서 휴대폰이나 PC로 옮겨도 돼요',
  '사고 영상은 보통 "충격"이나 "이벤트" 폴더에 따로 저장돼요',
  '사고 앞뒤가 함께 담긴 2분 이하 영상이면 돼요',
  '원본 영상은 지우지 말고 보관해 두세요',
];
// 접히는 "블랙박스 영상, 어떻게 찾나요?" 안내. 내 분석 빈 화면(ADR 0031)과 영상 분석하기 화면(ADR 0036)이 함께 쓴다.
export function FindVideoTips() {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ backgroundColor: color.white, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, paddingHorizontal: space[4] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="블랙박스 영상, 어떻게 찾나요?"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space[2] }}
      >
        <Icon name="dashcam" size={18} color={color.mintDeep} />
        <Text style={[t.body, { flex: 1, fontWeight: '700', color: color.gray12 }]}>블랙박스 영상, 어떻게 찾나요?</Text>
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}><Icon name="chevron" size={16} color={color.gray11} /></View>
      </Pressable>
      {open ? (
        <View style={{ gap: space[2], paddingBottom: space[4] }}>
          {FIND_TIPS.map((tip) => (
            <View key={tip} style={{ flexDirection: 'row', gap: space[2] }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 8, backgroundColor: color.mintDeep }} />
              <Text style={[t.body, { flex: 1, fontSize: 14.5, lineHeight: 21, color: color.gray12 }]}>{tip}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
