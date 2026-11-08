import { redirectSystemPath } from '../app/+native-intent';

test.each([
  ['aigo://expo-sharing', '/share'],
  ['aigo://callback', '/'],
  ['aigo://callback?rotating_token_nonce=x', '/'],
  ['/upload', '/upload'],
  ['aigo://analyses/1', 'aigo://analyses/1'],
])('%s', (path, expected) => {
  expect(redirectSystemPath({ path, initial: false })).toBe(expected);
});
