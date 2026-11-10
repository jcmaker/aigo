// 사고 현장 모드: 질문 카드에 답하면 상황에 맞는 안내를 고른다. 인터넷 없이 규칙으로만 동작한다.
// 출처는 docs/adr/0025-app-scene-guide.md에 적는다(도로교통법 제54조, 보험 약관 사고 대처요령, 금융감독원,
// 한국도로공사 비트밖스·긴급견인, 서울시설공단 시설물 파손 안내, 정책브리핑 동물 찻길 사고, 정부보장사업).
import type { IconName } from '@/components/ui';

export type Kind = 'car' | 'person' | 'bike' | 'parked' | 'object' | 'animal' | 'debris' | 'etc';
export type Injury = 'yes' | 'no' | 'unsure';
export type Place = 'highway' | 'road' | 'lot';
export type Other = 'here' | 'left' | 'drunk' | 'dispute';
export type How = 'ihit' | 'hitme' | 'both' | 'etc';
export type Surface = 'crack' | 'object' | 'etc';
export type Answers = { help?: boolean; kind?: Kind; how?: How; surface?: Surface; fire?: boolean; injury?: Injury; place?: Place; other?: Other; drivable?: boolean };
/** 기타를 고르고 직접 적은 말. 요약에만 쓴다. */
export type Notes = { kind?: string; how?: string; surface?: string };

export type QuestionId = keyof Answers;
/** input이 있으면 누를 때 바로 넘어가지 않고 글 입력칸을 연다(값은 안내 문구). */
export type Option = { value: string; label: string; sub?: string; icon: IconName; danger?: boolean; input?: string };
/** bare면 아이콘을 틀 없이 크게 보여 준다. */
export type Question = { id: QuestionId; title: string; sub?: string; grid?: boolean; bare?: boolean; options: Option[] };

export type GuideAction = 'call112' | 'call119' | 'callEx' | 'insurer' | 'photo';
export type GuideStep = { id: string; icon: IconName; title: string; detail: string; actions?: GuideAction[]; urgent?: boolean };
export type Guide = { summary: string[]; now: GuideStep[]; later: GuideStep[] };

const WITH_PERSON: Kind[] = ['person', 'bike'];
const WITH_OTHER: Kind[] = ['car', 'person', 'bike', 'etc'];
const WITH_HOW: Kind[] = ['car', 'bike'];

export const QUESTIONS: Record<QuestionId, Question> = {
  help: {
    id: 'help', title: '도움이 필요하신가요?', sub: '답하면 할 일을 순서대로 알려 드려요.',
    options: [{ value: 'yes', label: '시작하기', icon: 'arrow' }],
  },
  how: {
    id: 'how', title: '어떻게 부딪혔나요?', bare: true,
    options: [
      { value: 'ihit', label: '내가 가서 부딪혔어요', icon: 'carmove' },
      { value: 'hitme', label: '나는 멈춰 있는데 상대가 와서 부딪혔어요', icon: 'carhit' },
      { value: 'both', label: '둘 다 움직이는 중이었어요', icon: 'collide' },
      { value: 'etc', label: '기타', icon: 'more', input: '단어로 간단히 입력해 주세요' },
    ],
  },
  fire: {
    id: 'fire', title: '연기가 나거나 불이 보이나요?', sub: '타는 냄새가 나도 "네"를 골라 주세요.',
    options: [
      { value: 'yes', label: '네, 연기나 불이 있어요', icon: 'fire', danger: true },
      { value: 'no', label: '아니요', icon: 'check' },
    ],
  },
  kind: {
    id: 'kind', title: '무엇과 부딪혔나요?', sub: '사고 상대를 선택해 주세요.', grid: true, bare: true,
    options: [
      { value: 'car', label: '다른 차', sub: '승용차, 화물차 등', icon: 'car' },
      { value: 'person', label: '사람', sub: '보행자, 운전자 등', icon: 'user' },
      { value: 'bike', label: '이륜 이동수단', sub: '자전거, 오토바이, 킥보드 등', icon: 'bike' },
      { value: 'parked', label: '주차된 차', sub: '길가·주차장에 선 차', icon: 'parking' },
      { value: 'object', label: '고정물', sub: '벽, 가드레일, 전봇대 등', icon: 'barrier' },
      { value: 'animal', label: '동물', sub: '개, 고양이, 야생동물 등', icon: 'paw' },
      { value: 'debris', label: '도로 상태', sub: '포트홀, 낙하물, 빙판 등', icon: 'roadcrack' },
      { value: 'etc', label: '기타', sub: '위 항목에 없는 경우', icon: 'more', input: '단어로 입력해 주세요' },
    ],
  },
  surface: {
    id: 'surface', title: '도로가 어땠나요?', bare: true,
    options: [
      { value: 'crack', label: '도로가 갈라졌어요', sub: '파인 곳, 포트홀 포함', icon: 'roadcrack' },
      { value: 'object', label: '도로 위에 떨어져 있던 물체 때문이에요', icon: 'rock' },
      { value: 'etc', label: '기타', icon: 'more', input: '단어로 간단히 입력해 주세요' },
    ],
  },
  injury: {
    id: 'injury', title: '다친 사람이 있나요?', sub: '나, 동승자, 상대방 모두 포함해요.',
    options: [
      { value: 'yes', label: '네, 있어요', icon: 'medical', danger: true },
      { value: 'no', label: '아니요, 다친 사람은 없어요', icon: 'check' },
      { value: 'unsure', label: '잘 모르겠어요', sub: '다친 사람이 있다고 보고 안내해요', icon: 'users' },
    ],
  },
  place: {
    id: 'place', title: '어디에서 났나요?',
    options: [
      { value: 'highway', label: '고속도로·자동차전용도로', icon: 'tow' },
      { value: 'road', label: '일반 도로', icon: 'car' },
      { value: 'lot', label: '주차장·골목', icon: 'parking' },
    ],
  },
  other: {
    id: 'other', title: '상대방은 지금 어떤가요?',
    options: [
      { value: 'here', label: '현장에 함께 있어요', icon: 'users' },
      { value: 'left', label: '그냥 떠났어요', icon: 'exit' },
      { value: 'drunk', label: '술을 마신 것 같아요', icon: 'warnsign' },
      { value: 'dispute', label: '누구 잘못인지 다투고 있어요', icon: 'message' },
    ],
  },
  drivable: {
    id: 'drivable', title: '차를 움직일 수 있나요?',
    options: [
      { value: 'yes', label: '네, 움직일 수 있어요', icon: 'carmove' },
      { value: 'no', label: '아니요, 견인이 필요해요', icon: 'tow' },
    ],
  },
};

/** 다음에 물을 질문. 다 답했으면 null. 연기·불이면 거기서 끝낸다. */
export function nextQuestion(a: Answers): QuestionId | null {
  if (!a.help) return 'help';
  if (!a.kind) return 'kind';
  if (WITH_HOW.includes(a.kind) && !a.how) return 'how';
  if (a.kind === 'debris' && !a.surface) return 'surface';
  if (a.fire === undefined) return 'fire';
  if (a.fire) return null;
  if (!a.injury) return 'injury';
  if (!a.place) return 'place';
  if (WITH_OTHER.includes(a.kind) && !a.other) return 'other';
  if (a.drivable === undefined) return 'drivable';
  return null;
}

/** 답한 순서대로의 질문 목록. 진행 표시와 "이전"에 쓴다. */
export function askedQuestions(a: Answers): QuestionId[] {
  const out: QuestionId[] = [];
  const probe: Answers = {};
  for (;;) {
    const q = nextQuestion(probe);
    if (!q || a[q] === undefined) break;
    out.push(q);
    (probe as Record<string, unknown>)[q] = a[q];
  }
  return out;
}

/** 이 답 조합에서 물을 질문 수(진행 표시용 추정). */
export function totalQuestions(a: Answers): number {
  const how = !a.kind || WITH_HOW.includes(a.kind) || a.kind === 'debris' ? 1 : 0; // 방식 또는 도로 상태
  const head = 3 + how; // 도움, 유형, (방식), 연기
  if (a.fire) return head;
  const other = !a.kind || WITH_OTHER.includes(a.kind) ? 1 : 0;
  return head + 3 + other; // 부상, 장소, (상대), 이동
}

export function setAnswer(a: Answers, id: QuestionId, value: string): Answers {
  const v = id === 'help' || id === 'fire' || id === 'drivable' ? value === 'yes' : value;
  return { ...a, [id]: v } as Answers;
}

const S = (id: string, icon: IconName, title: string, detail: string, extra: Partial<GuideStep> = {}): GuideStep => ({ id, icon, title, detail, ...extra });

const FIRE: GuideStep[] = [
  S('fire-out', 'exit', '차에서 멀리 떨어지기', '동승자와 함께 차에서 내려 멀리 떨어지세요. 짐은 챙기지 마세요.', { urgent: true }),
  S('fire-119', 'fire', '119에 신고하기', '위치와 차에서 연기나 불이 난다는 걸 말해요. 전기차라면 전기차라고 꼭 알려 주세요.', { actions: ['call119'], urgent: true }),
  S('fire-no', 'warnsign', '직접 끄려고 하지 않기', '불이 커지면 바로 더 멀리 피하세요. 진압은 소방관에게 맡겨요.'),
  S('fire-road', 'hazard', '도로 위에 서 있지 않기', '뒤에서 오는 차에 치이지 않게 가드레일 밖이나 인도로 피하세요.'),
];

const KIND_LABEL: Record<Kind, string> = { car: '다른 차', person: '사람', bike: '자전거·오토바이·킥보드', parked: '주차된 차', object: '고정물', animal: '동물', debris: '도로 상태', etc: '기타' };
const SURFACE_LABEL: Record<Surface, string> = { crack: '도로 갈라짐', object: '떨어진 물체', etc: '기타' };
const HOW_LABEL: Record<How, string> = { ihit: '내가 부딪힘', hitme: '상대가 부딪혀 옴', both: '둘 다 움직이던 중', etc: '기타' };
const PLACE_LABEL: Record<Place, string> = { highway: '고속도로', road: '일반 도로', lot: '주차장·골목' };

/** 답에 맞는 안내를 만든다. 지금 할 일은 공통 뼈대(안전 → 구호·신고 → 증거 → 정보 → 차 → 보험) 사이에 유형별 단계를 끼운다. */
export function buildGuide(a: Answers, notes: Notes = {}): Guide {
  if (a.fire) return { summary: ['연기·불'], now: FIRE, later: [] };
  const kind = a.kind ?? 'car';
  const hurt = a.injury !== 'no' || WITH_PERSON.includes(kind);
  const now: GuideStep[] = [];
  const later: GuideStep[] = [];

  // 1. 안전
  if (a.place === 'highway') {
    now.push(S('hw-light', 'trunk', '비상등 켜고 트렁크 열기', '뒤에서 오는 차에 멈춘 차가 있다는 걸 알려요.', { urgent: true }));
    now.push(S('hw-out', 'exit', '가드레일 밖으로 대피', '차 안이나 차 앞뒤에 서 있지 마세요. 동승자도 함께 나가요.', { urgent: true }));
  } else {
    now.push(S('light', 'hazard', '비상등 켜기', '뒤차가 사고를 알 수 있게 해요. 차가 오가는 곳이면 인도나 길 밖으로 피하세요.'));
  }

  // 2. 구호·신고
  if (hurt) {
    now.push(S('call119', 'medical', '119에 전화하기', '위치, 다친 사람 수, 의식이 있는지, 피가 나는지 말해요. 전화를 끊지 말고 안내를 따르세요.', { actions: ['call119'], urgent: true }));
    now.push(S('care', 'user', '다친 사람 곁에 있기', '목이나 허리를 다쳤을 수 있으면 옮기지 마세요. 불이나 차에 치일 위험이 있을 때만 옮겨요. 피가 나면 깨끗한 천으로 눌러 주세요.'));
    now.push(S('call112-hurt', 'siren', '112에 신고하기', '사람이 다친 사고는 경찰 신고가 필요해요. 상대가 괜찮다고 해도 그냥 보내지 마세요.', { actions: ['call112'] }));
  }
  if (kind === 'object') now.push(S('object-112', 'siren', '112에 신고하기', '가드레일·전봇대 같은 시설물을 부쉈다면 신고하고 보험사에 대물 접수를 해요. 그냥 떠나면 도주로 볼 수 있어요.', { actions: ['call112'] }));
  if (kind === 'animal') {
    now.push(S('animal-touch', 'paw', '동물은 직접 치우지 않기', '도로에 들어가 치우다가 2차 사고가 날 수 있어요. 차 안이나 안전한 곳에서 신고만 하세요.'));
    now.push(S('animal-call', 'phone', '동물 사고 신고하기', a.place === 'highway' ? '고속도로는 한국도로공사 1588-2504로 신고해요.' : '일반 도로는 지역번호 + 120(다산콜센터)이나 128로 신고해요. 동물이 살아 있으면 야생동물구조관리센터에 알려요.', a.place === 'highway' ? { actions: ['callEx'] } : {}));
  }
  if (kind === 'debris' && a.surface === 'crack') now.push(S('debris-112', 'siren', '도로 파손 알리기', `갈라지거나 파인 곳의 위치를 112에 알려 다른 차의 사고를 막아요.${a.place === 'highway' ? ' 고속도로는 1588-2504로도 알릴 수 있어요.' : ''}`, { actions: a.place === 'highway' ? ['call112', 'callEx'] : ['call112'] }));
  else if (kind === 'debris') now.push(S('debris-112', 'siren', '112에 신고하기', '떨어진 물체의 위치와 모양을 알려요. 물체를 떨어뜨린 차를 봤다면 번호와 차종도 말해요. 다쳤다면 가해 차량을 몰라도 보상받을 길이 있어요(아래 사고 뒤 할 일).', { actions: ['call112'] }));
  if (a.other === 'left') now.push(S('hitrun', 'siren', '112에 바로 신고하기', '떠난 차의 번호, 색, 차종, 간 방향을 기억나는 대로 말해요. 주변 블랙박스나 CCTV도 단서가 돼요.', { actions: ['call112'], urgent: true }));
  if (a.other === 'drunk') now.push(S('drunk', 'siren', '112에 신고하기', '상대가 술을 마신 것 같으면 경찰이 와서 확인하게 해요. 직접 따지지 마세요.', { actions: ['call112'], urgent: true }));
  if (a.other === 'dispute' && !hurt) now.push(S('dispute', 'siren', '다툼이 있으면 112', '누구 잘못인지 다투면 경찰을 불러 사고 내용을 기록해 두는 게 좋아요.', { actions: ['call112'] }));

  // 3. 증거
  if (kind !== 'animal') {
    now.push(a.place === 'highway'
      ? S('photo', 'camera', '안전한 곳에서만 사진 찍기', '도로 안으로 들어가지 마세요. 가드레일 밖에서 찍을 수 있는 만큼만 찍고, 나머지는 블랙박스 영상으로 충분해요.', { actions: ['photo'] })
      : S('photo', 'camera', '차 옮기기 전에 사진 찍기', '멀리서 사고 전체가 한 화면에 들어오게, 부서진 곳은 가까이서, 차선·신호등·표지판과 상대 번호판까지 찍어요.', { actions: ['photo'] }));
  }
  if (WITH_OTHER.includes(kind) || kind === 'object') now.push(S('witness', 'users', '본 사람 연락처 받기', '사고를 본 사람이 있으면 이름과 연락처를 받아 두세요. 나중에 과실을 따질 때 도움이 돼요.'));

  // 4. 정보
  if (kind === 'parked') now.push(S('owner', 'parking', '차 주인에게 연락하기', '차 앞의 연락처로 전화해요. 연락처가 없으면 관리사무소나 112에 알려요. 메모만 남기고 떠나는 건 충분하지 않을 수 있어요.', { actions: ['call112'] }));
  if (WITH_OTHER.includes(kind) && a.other !== 'left') {
    const detail = a.how === 'hitme'
      ? '상대의 이름·연락처·차량번호·보험사를 꼭 받아 두고, 상대 보험사로 사고 접수를 해 달라고 요청해요. 내 정보도 알려 주세요.'
      : a.how === 'ihit'
        ? '내 이름·연락처·차량번호를 먼저 알려 주세요. 사고를 낸 쪽이 꼭 해야 하는 일이에요. 상대가 괜찮다고 해도 문자로 남겨 두고, 상대 정보와 보험사도 받아요.'
        : '내 이름·연락처·차량번호를 문자로 보내고, 상대 정보와 보험사도 받아요.';
    now.push(S('info', 'idcard', '정보 주고받기', `${detail} "제 잘못이에요" 같은 말은 하지 마세요. 과실은 영상과 증거로 정해져요.`));
  }

  // 5. 차
  if (a.drivable) {
    now.push(S('move', 'carmove', '안전한 곳으로 옮기고 엔진 끄기', '사진을 찍은 뒤 갓길이나 가까운 안전한 곳으로 옮겨요. 다친 사람이 있으면 구급대가 올 때까지 기다려요.'));
  } else {
    if (a.place === 'highway') now.push(S('triangle', 'warnsign', '안전삼각대는 할 수 있을 때만', '도로 위를 무리하게 걷지 마세요. 뒤차가 충분히 볼 수 있는 곳에 두고, 커브나 오르막 뒤라면 더 멀리 둬요.'));
    now.push(a.place === 'highway'
      ? S('tow-hw', 'tow', '무료 견인 부르기', '한국도로공사가 가까운 휴게소·졸음쉼터까지 무료로 옮겨 줘요(24시간). 먼저 온 견인차에 바로 맡기지 마세요.', { actions: ['callEx', 'insurer'] })
      : S('tow', 'tow', '견인은 보험사에 먼저', '가입한 보험사 긴급출동은 일정 거리까지 무료예요. 사설 견인차라면 요금을 먼저 묻고 영수증과 차량번호를 받아 두세요.', { actions: ['insurer'] }));
  }

  // 6. 보험
  now.push(S('insurer', 'shield', '보험사에 사고 접수', kind === 'object' ? '시설물 파손은 보험사에 대물 접수를 해요.' : '현장에서 바로 접수하면 처리가 빨라요.', { actions: ['insurer'] }));

  // 사고 뒤 할 일
  later.push(S('clinic', 'hospital', '안 아파도 병원 진료 받기', '사고 직후에는 통증이 없어도 다친 곳이 있을 수 있어요. 며칠 안에 진료를 받아 두세요.'));
  if (kind !== 'animal' || a.drivable === false) later.push(S('rental', 'car', '렌터카는 서둘러 정하지 않기', '렌터카 대신 교통비를 현금으로 받는 방법도 있어요. 보험사에 물어보고 정해도 늦지 않아요.'));
  if (WITH_OTHER.includes(kind)) later.push(S('settle', 'handshake', '합의는 시간을 두고', '현장에서 합의서를 쓰거나 돈을 주고받지 마세요. 증거를 모은 뒤 보험사와 차분히 정해요.'));
  if (WITH_PERSON.includes(kind)) later.push(S('expert', 'shield', '보험사·전문가와 상담하기', '사람이 다친 사고는 보험이 있어도 신호위반·중앙선 침범 같은 중대한 위반이 있으면 형사 절차가 이어질 수 있어요.'));
  if (kind === 'bike' || a.other === 'left' || (kind === 'debris' && a.surface !== 'crack')) later.push(S('uninsured', 'shield', '상대 보험이 없거나 모를 때', '내 자동차보험의 무보험차상해로 먼저 보상받거나, 다쳤다면 정부보장사업(1544-0049)을 신청할 수 있어요. 사고일로부터 3년 안에 신청해요.'));
  if (kind === 'debris' && a.surface === 'crack') later.push(S('road-claim', 'file', '도로 관리하는 곳에 배상 청구', '파인 도로 때문에 차가 상했다면 도로를 관리하는 곳(일반 도로는 시·군·구청, 고속도로는 한국도로공사)에 배상을 청구할 수 있어요. 파손 부위와 위치 사진을 꼭 남겨 두세요.'));
  if (a.how === 'hitme' && a.other !== 'left') later.push(S('claim', 'shield', '상대가 접수를 미루면', '상대가 연락을 피하거나 보험 접수를 미루면, 상대 보험사에 직접 손해배상을 청구할 수 있어요.'));
  if (kind === 'car' && a.injury === 'no' && a.other === 'here') later.push(S('quick', 'file', '가벼운 사고라면 신속처리 협의서', '둘 다 보험이 있고 과실에 동의하면 손해보험협회 협의서로 빠르게 처리할 수 있어요.'));

  const kindLabel = kind === 'etc' && notes.kind ? notes.kind : KIND_LABEL[kind];
  const howLabel = a.how === 'etc' && notes.how ? notes.how : a.how ? HOW_LABEL[a.how] : null;
  // 기타에 적은 말도 요약 칩으로 함께 보여 준다.
  const surfaceLabel = a.surface === 'etc' && notes.surface ? notes.surface : a.surface ? SURFACE_LABEL[a.surface] : null;
  const summary = [PLACE_LABEL[a.place ?? 'road'], kindLabel, ...(howLabel ? [howLabel] : []), ...(surfaceLabel ? [surfaceLabel] : []), hurt ? '다친 사람 있음' : '다친 사람 없음'];
  return { summary, now, later };
}
