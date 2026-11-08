import { Image } from 'react-native';

// 가로 로고(2172x724). 밝은 바탕용.
export function Wordmark({ height = 40 }: { height?: number }) {
  return (
    <Image
      accessibilityLabel="AIGO"
      source={require('../../assets/brand/wordmark-dark.png')}
      style={{ height, width: height * 3, alignSelf: 'flex-start' }}
      resizeMode="contain"
    />
  );
}
