import { askedQuestions, buildGuide, nextQuestion, setAnswer, type Answers } from './scene-guide';

const answer = (pairs: [keyof Answers, string][]) => pairs.reduce<Answers>((a, [k, v]) => setAnswer(a, k, v), { help: true, how: 'both', surface: 'object' });
const ids = (a: Answers) => buildGuide(a).now.map((s) => s.id);

test('첫 질문은 도움, 그다음 유형, 차·이륜차는 부딪힌 방식, 그다음 연기', () => {
  expect(nextQuestion({})).toBe('help');
  expect(nextQuestion({ help: true })).toBe('kind');
  expect(nextQuestion({ help: true, kind: 'car' })).toBe('how');
  expect(nextQuestion({ help: true, kind: 'animal' })).toBe('fire');
});

test('멈춰 있는데 부딪혀 온 경우: 상대 보험 접수 요청과 직접 청구 안내', () => {
  const a = { ...answer([['kind', 'car'], ['fire', 'no'], ['injury', 'no'], ['place', 'road'], ['other', 'here'], ['drivable', 'yes']]), how: 'hitme' as const };
  expect(buildGuide(a).now.find((s) => s.id === 'info')?.detail).toContain('상대 보험사로 사고 접수');
  expect(buildGuide(a).later.map((s) => s.id)).toContain('claim');
});

test('연기·불이면 질문을 끝내고 대피 안내만 준다', () => {
  const a = answer([['kind', 'car'], ['fire', 'yes']]);
  expect(nextQuestion(a)).toBeNull();
  expect(ids(a)[0]).toBe('fire-out');
});

test('차 대 차는 상대 질문을 묻고, 동물은 묻지 않는다', () => {
  expect(nextQuestion(answer([['fire', 'no'], ['kind', 'car'], ['injury', 'no'], ['place', 'road']]))).toBe('other');
  expect(nextQuestion(answer([['fire', 'no'], ['kind', 'animal'], ['injury', 'no'], ['place', 'road']]))).toBe('drivable');
});

test('사람과의 사고는 다친 사람이 없다고 답해도 119와 112를 안내한다', () => {
  const g = ids(answer([['fire', 'no'], ['kind', 'person'], ['injury', 'no'], ['place', 'road'], ['other', 'here'], ['drivable', 'yes']]));
  expect(g).toEqual(expect.arrayContaining(['call119', 'call112-hurt', 'info']));
});

test('모르겠어요는 다친 사람이 있는 흐름이다', () => {
  expect(ids(answer([['fire', 'no'], ['kind', 'car'], ['injury', 'unsure'], ['place', 'road'], ['other', 'here'], ['drivable', 'yes']]))).toContain('call119');
});

test('유형별 단계: 주차된 차는 차주 연락, 시설물은 112, 동물은 직접 치우지 않기', () => {
  const base: [keyof Answers, string][] = [['fire', 'no'], ['injury', 'no'], ['place', 'lot'], ['drivable', 'yes']];
  expect(ids(answer([...base, ['kind', 'parked']]))).toContain('owner');
  expect(ids(answer([...base, ['kind', 'object']]))).toContain('object-112');
  expect(ids(answer([...base, ['kind', 'animal']]))).toContain('animal-touch');
});

test('고속도로에서 차가 못 움직이면 대피가 먼저이고 무료 견인이 나온다', () => {
  const g = ids(answer([['fire', 'no'], ['kind', 'car'], ['injury', 'no'], ['place', 'highway'], ['other', 'here'], ['drivable', 'no']]));
  expect(g.slice(0, 2)).toEqual(['hw-light', 'hw-out']);
  expect(g).toContain('tow-hw');
  expect(g).not.toContain('light');
});

test('상대가 떠나면 정보 주고받기 대신 신고, 사고 뒤에 무보험·정부보장 안내', () => {
  const a = answer([['fire', 'no'], ['kind', 'car'], ['injury', 'yes'], ['place', 'road'], ['other', 'left'], ['drivable', 'yes']]);
  expect(ids(a)).toContain('hitrun');
  expect(ids(a)).not.toContain('info');
  expect(buildGuide(a).later.map((s) => s.id)).toContain('uninsured');
});

test('사진은 차 옮기기보다 먼저, 단계 id는 겹치지 않는다', () => {
  const kinds = ['car', 'person', 'bike', 'parked', 'object', 'animal', 'debris', 'etc'];
  for (const kind of kinds) for (const place of ['highway', 'road', 'lot']) for (const drivable of ['yes', 'no']) {
    const a = answer([['kind', kind], ['fire', 'no'], ['injury', 'no'], ['place', place], ...(nextQuestion(answer([['kind', kind], ['fire', 'no'], ['injury', 'no'], ['place', place]])) === 'other' ? [['other', 'here'] as [keyof Answers, string]] : []), ['drivable', drivable]]);
    expect(nextQuestion(a)).toBeNull();
    const g = ids(a);
    expect(new Set(g).size).toBe(g.length);
    if (g.includes('photo') && g.includes('move')) expect(g.indexOf('photo')).toBeLessThan(g.indexOf('move'));
  }
});

test('도로 상태: 갈라짐이면 도로 관리 주체 배상, 떨어진 물체면 정부보장사업 안내', () => {
  expect(nextQuestion({ help: true, kind: 'debris' })).toBe('surface');
  const base: [keyof Answers, string][] = [['kind', 'debris'], ['fire', 'no'], ['injury', 'no'], ['place', 'road'], ['drivable', 'yes']];
  const crack = buildGuide(answer([...base, ['surface', 'crack']]));
  expect(crack.later.map((s) => s.id)).toContain('road-claim');
  expect(crack.later.map((s) => s.id)).not.toContain('uninsured');
  const obj = buildGuide(answer([...base, ['surface', 'object']]));
  expect(obj.later.map((s) => s.id)).toContain('uninsured');
  expect(buildGuide(answer([...base, ['surface', 'etc']]), { surface: '빙판' }).summary).toContain('빙판');
});

test('이전으로 돌아가기용 답한 질문 목록', () => {
  expect(askedQuestions({ help: true, kind: 'animal', fire: false })).toEqual(['help', 'kind', 'fire']);
});
