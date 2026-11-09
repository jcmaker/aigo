import type { TextStyle } from 'react-native';

export const color = {
  brand200: '#EAF0FB',
  brand400: '#9DB4E6',
  brand: '#3A64C4',
  brand600: '#2A4E9E',
  onBrand: '#FFFFFF', // brand 바탕 위 글자·아이콘
  online: '#30A46C', // 기기 연결됨 점
  ink: '#1A2B4C',
  ink2: '#26395E',
  ink3: '#344A73',
  white: '#FFFFFF',
  gray2: '#F9F9F9',
  gray3: '#F0F0F0',
  gray4: '#E8E8E8',
  gray9: '#8D8D8D',
  gray11: '#646464',
  gray12: '#202020',
  warning300: '#FFF4D5',
  warning600: '#DC7B18',
  danger300: '#FFF0EE',
  danger: '#E54D2E',
  danger600: '#CA3214',
  sceneIcon: '#FF7A5C',
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;

export const radius = { card: 24, video: 20, row: 16, input: 14, icon: 12, pill: 999 } as const;

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

export const type = {
  display: { fontSize: 34, fontWeight: '800', letterSpacing: -1, fontVariant: tabular },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, fontVariant: tabular },
  headline: { fontSize: 17, fontWeight: '700', fontVariant: tabular },
  body: { fontSize: 15, fontWeight: '400', fontVariant: tabular },
  label: { fontSize: 13, fontWeight: '600', fontVariant: tabular },
  caption: { fontSize: 13, fontWeight: '400', fontVariant: tabular },
  micro: { fontSize: 11.5, fontWeight: '500', fontVariant: tabular },
} satisfies Record<string, TextStyle>;

// 떠 있는 하단 메뉴가 차지하는 높이: 메뉴 46 + 위 14 + 아래 여백 18. 기기 안전 영역(insets.bottom)은 Screen이 따로 더한다.
export const tabBarSpace = 46 + 14 + 18;
