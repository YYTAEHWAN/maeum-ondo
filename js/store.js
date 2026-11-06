import { localAdapter } from './storage.js';

// 저장 방식을 바꾸려면 이 줄만 다른 어댑터로 교체하면 된다 (storage.js 참고).
const adapter = localAdapter;

const COLLECTIONS = ['emotions', 'categories', 'actions', 'triggers', 'factors', 'checkins', 'sessions'];
let data = null;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (v) => {
  const d = new Date(v);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// 어제 기록 항목 (홈 화면에서 하루 한 번): type 'scale'(0~10 게이지) | 'number' | 'bool' | 'time'
// 수면 시간은 sleepLog로 따로 저장한다
function defaultFactors() {
  const fac = (name, emoji, type, unit = '', aliases) => ({ id: uid(), name, emoji, type, scope: 'day', unit, aliases });
  return [fac('개운함', '🌤️', 'scale', '', ['개운함 (0~10)', '잠의 질 (0~10)', '잠의 질']), fac('잠든 시간', '🕚', 'time')];
}

// 몸 컨디션으로 분류할 마음 항목 (예전 데이터를 나눌 때 사용)
const BODY_NAMES = ['남은 체력', '남은 정신력', '졸림', '피곤함'];

// 뇌과학(각성 조절·도파민·자율신경)과 스포츠 코칭(루틴·회복·부하 관리) 관점의 기본값
// aliases: 예전 기본 이름. '기본 불러오기' 때 같은 항목으로 보고 건너뛴다
function createDefaults() {
  const cat = (name, emoji, aliases) => ({ id: uid(), name, emoji, aliases });
  const breath = cat('호흡 조절', '🫁', ['호흡']);
  const body = cat('몸 깨우기', '🏃', ['몸 움직이기']);
  const sense = cat('감각 리셋', '🧊', ['감각 깨우기']);
  const env = cat('환경 설계', '🚪', ['환경 바꾸기']);
  const mind = cat('생각 정리', '📝');
  const routine = cat('시작 루틴', '🏁');
  const rest = cat('회복·휴식', '🔋', ['휴식']);
  const sound = cat('소리·음악', '🎧');
  const act = (name, emoji, c, aliases) => ({ id: uid(), name, emoji, categoryId: c.id, aliases });
  // unit이 있으면 고른 뒤에 숫자를 더 적을 수 있다 (적는 건 선택)
  const trig = (name, emoji, unit, aliases) => ({ id: uid(), name, emoji, ...(unit ? { detail: true, unit } : {}), aliases });
  // group: 'body'(몸 컨디션) | 'mind'(마음)
  const emo = (group, name, emoji, color, direction, threshold, more = {}) => ({ id: uid(), group, name, emoji, color, direction, threshold, ...more });

  return {
    version: 1,
    model: 2,
    emotions: [
      emo('body', '남은 체력', '🔋', '#8EC5FF', 'good', 5),
      emo('body', '남은 정신력', '🧠', '#E3A6FF', 'good', 5),
      emo('mind', '놀고 싶은 마음', '🎮', '#FF9AA2', 'bad', 6, { aliases: ['놀고 싶음'] }),
      emo('mind', '미루고 싶은 마음', '🐢', '#C9B6A6', 'bad', 5),
      emo('mind', '집중하고 싶은 마음', '🎯', '#9ED9B5', 'good', 5, { aliases: ['집중하고 싶음'] }),
      // extra: 처음 설치할 땐 넣지 않고, '기본 불러오기'에서 골라서 추가한다
      emo('body', '졸림', '😪', '#C9B6A6', 'bad', 5, { extra: true, desc: '각성이 너무 낮아 처지는 상태' }),
      emo('mind', '폰 보고 싶은 마음', '📱', '#FFB38A', 'bad', 5, { extra: true, desc: '알림·쇼츠가 자꾸 떠오르는 정도' }),
      emo('mind', '잡생각', '🌀', '#B5B9FF', 'bad', 5, { extra: true, desc: '딴생각이 계속 끼어드는 정도' }),
      emo('mind', '불안·긴장', '😰', '#B5B9FF', 'bad', 5, { extra: true, aliases: ['불안함'], desc: '각성이 너무 높아 들뜬 상태' }),
      emo('mind', '짜증', '😤', '#FF9AA2', 'bad', 5, { extra: true, desc: '예민하고 날이 선 정도' }),
      emo('mind', '지루함', '🥱', '#FFD97A', 'bad', 5, { extra: true, desc: '공부가 재미없고 따분한 정도' }),
      emo('mind', '의욕', '🔥', '#FFB38A', 'good', 5, { extra: true, desc: '해 보고 싶은 마음이 얼마나 있는지' }),
      emo('mind', '자신감', '💪', '#8EC5FF', 'good', 5, { extra: true, desc: '오늘 할 걸 해낼 수 있을 것 같은 느낌' }),
      emo('mind', '차분함', '🍃', '#9ED9B5', 'good', 5, { extra: true, desc: '마음이 가라앉아 안정된 정도' }),
    ],
    categories: [breath, body, sense, env, mind, routine, rest, sound],
    actions: [
      // 날숨을 길게 → 부교감신경, 가장 빨리 가라앉는 방법들
      act('생리적 한숨 3번 (들숨 두 번 + 긴 날숨)', '😮‍💨', breath),
      act('4-7-8 호흡', '🌬️', breath),
      act('박스 호흡 (4-4-4-4)', '🔲', breath),
      act('날숨 길게 1분 (4초 들숨 · 8초 날숨)', '🍃', breath, ['눈 감고 심호흡 1분']),
      // 무기력·졸림 → 각성 올리기
      act('산책 10분', '🚶', body, ['산책']),
      act('스트레칭', '🤸', body),
      act('제자리 뛰기 30초', '🏃', body),
      act('스쿼트 15개', '🦵', body),
      // 감각 자극으로 상태 전환
      act('찬물 세수', '💦', sense),
      act('물 한 잔 마시기', '🥤', sense),
      act('창밖 멀리 20초 보기', '🪟', sense),
      act('양치하기', '🪥', sense),
      // 의지력 대신 환경으로 유혹 차단
      act('폰 다른 방에 두기', '📵', env),
      act('방해 앱 차단 켜기', '🔒', env),
      act('책상 위 공부 책만 남기기', '🧹', env, ['책상 정리']),
      act('공부 장소 옮기기', '🚪', env),
      // 작업 기억 비우기
      act('떠오르는 생각 다 적기', '📝', mind, ['떠오르는 생각 적기']),
      act('걱정 적고 덮어두기', '🗒️', mind),
      act('오늘 할 일 3개 쓰기', '✅', mind),
      // 선수들의 경기 전 루틴처럼 시작을 자동화
      act('첫 할 일 2분짜리로 쪼개기', '✂️', routine),
      act('딱 5분만 하기로 약속', '⏳', routine),
      act('잘 풀리는 장면 30초 떠올리기', '🎬', routine),
      act('타이머 25분 맞추기', '⏲️', routine),
      act('나만의 시작 루틴 하기', '🏁', routine),
      // 연료가 바닥났을 때
      act('눈 감고 5분 쉬기', '😪', rest),
      act('파워냅 20분', '💤', rest),
      act('누워서 몸 이완 10분 (NSDR)', '🧘', rest),
      act('간단한 간식 먹기', '🍌', rest),
      act('가사 없는 음악 틀기', '🎼', sound),
      act('백색소음 틀기', '🌧️', sound),
      act('좋아하는 노래 한 곡 듣기', '🎵', sound),
    ],
    triggers: [
      // 고자극 콘텐츠 → 공부가 상대적으로 지루해짐
      trig('유튜브 본 직후', '📺'),
      trig('쇼츠·릴스 본 직후', '⚡'),
      trig('SNS 하고 나서', '📱'),
      trig('게임 하고 나서', '🎮'),
      trig('연락 받음', '💬'),
      trig('친구와 놀고 옴', '🧑‍🤝‍🧑'),
      trig('친구가 노는 걸 봄', '👀'),
      // 몸 상태 (고르면 숫자를 더 적을 수 있는 것도 있다)
      trig('밥 먹은 지 꽤 됨', '🍚', '시간 지남', ['마지막 식사 후']),
      trig('밥을 못 먹음', '🙅'),
      trig('배부르게 먹음', '🍽️', '점 (배부름 0~10)', ['배부름 (0~10)']),
      trig('배고픔', '🥺'),
      trig('커피·카페인 마심', '☕', '잔', ['커피·카페인']),
      trig('물을 별로 안 마심', '💧', '잔 마심', ['오늘 마신 물']),
      trig('오래 앉아 있었음', '🪑', '분째', ['마지막 휴식 후']),
      trig('낮잠 잠', '😴', '분'),
      trig('운동함', '🏃'),
      // 과제가 주는 부담
      trig('어디서부터 할지 모르겠음', '🌫️'),
      trig('문제가 안 풀림', '🧱', '', ['공부가 막힘']),
      trig('공부할 양이 많음', '📚'),
      trig('시험·마감 다가옴', '⏰'),
      trig('결과가 안 좋았음', '📉'),
      trig('남과 비교함', '🪞'),
      // 그 밖의 스트레스
      trig('잔소리·다툼', '💢'),
      trig('날씨 탓', '🌧️'),
      trig('그냥 이유 없이', '🌀'),
    ],
    factors: defaultFactors(),
    checkins: [],
    sessions: [],
    sleepLog: {},
    dayLog: {},
    conditionScale: 10,
  };
}

function normalize() {
  data.version ||= 1;
  // 컨디션 요인이 생기기 전에 쓰던 데이터에는 기본 요인을 넣어 준다
  if (!Array.isArray(data.factors)) data.factors = defaultFactors().map(stripAliases);
  for (const k of COLLECTIONS) if (!Array.isArray(data[k])) data[k] = [];
  if (!data.sleepLog || typeof data.sleepLog !== 'object') data.sleepLog = {};
  if (!data.dayLog || typeof data.dayLog !== 'object') data.dayLog = {};
  // 컨디션이 5단계(1~5)였던 기록을 0~10점으로 옮긴다
  if (data.conditionScale !== 10) {
    for (const c of data.checkins) if (c.condition != null) c.condition = Math.round((c.condition - 1) * 2.5);
    data.conditionScale = 10;
  }
  if (data.model !== 2) migrateToModel2();
  // '0~10' 숫자 항목은 게이지로 바꾼다 (이름의 '(0~10)'은 게이지가 대신 보여 준다)
  for (const f of data.factors) {
    if (f.type === 'number' && /0\s*~\s*10/.test(f.name)) {
      f.type = 'scale';
      f.unit = '';
      f.name = f.name.replace(/\s*\(\s*0\s*~\s*10\s*\)/, '').trim() || f.name;
    }
  }
}

// 구조 변경: 마음을 몸 컨디션/마음으로 나누고,
// 체크할 때마다 적던 컨디션 요인(식사·카페인 등)은 '오늘 있었던 일'로 옮긴다
function migrateToModel2() {
  for (const e of data.emotions) e.group ||= BODY_NAMES.includes(e.name) ? 'body' : 'mind';
  for (const f of data.factors.filter((x) => x.scope === 'check')) {
    const isNum = f.type === 'number';
    data.triggers.push({ id: f.id, name: f.name, emoji: f.emoji, ...(isNum ? { detail: true, unit: f.unit || '' } : {}) });
    for (const c of data.checkins) {
      const v = c.factors?.[f.id];
      if (v == null || v === false || v === '' || (isNum && Number(v) === 0)) continue;
      c.triggerIds = [...(c.triggerIds || []), f.id];
      if (isNum) c.triggerValues = { ...c.triggerValues, [f.id]: v };
    }
  }
  data.factors = data.factors.filter((x) => x.scope !== 'check');
  data.model = 2;
}

function persist() {
  adapter.save(data).catch((err) => console.error('저장 실패', err));
}

// 기본값 설명용 필드는 실제 데이터에 저장하지 않는다
const stripAliases = ({ aliases, extra, desc, ...item }) => item;
const namesOf = (item) => [item.name, ...(item.aliases || [])];

function freshData() {
  const d = createDefaults();
  for (const k of COLLECTIONS) d[k] = d[k].filter((x) => !x.extra).map(stripAliases);
  return d;
}

// 아직 없는 기본 항목 (설명·extra 표시 포함, 고르는 화면용)
export function missingDefaults(col) {
  const names = new Set(data[col].map((x) => x.name));
  return createDefaults()[col].filter((item) => !namesOf(item).some((n) => names.has(n)));
}

export async function init() {
  data = await adapter.load();
  if (!data) data = freshData();
  normalize();
  persist();
}

export const get = () => data;
export const find = (col, id) => data[col].find((x) => x.id === id);

// ---------- 공통 CRUD (마음 항목·카테고리·행동·상황) ----------
export function upsert(col, item) {
  const existing = item.id && find(col, item.id);
  if (existing) Object.assign(existing, item);
  else data[col].push({ ...item, id: uid() });
  persist();
  return existing || data[col][data[col].length - 1];
}

export function remove(col, id) {
  data[col] = data[col].filter((x) => x.id !== id);
  if (col === 'categories') {
    for (const a of data.actions) if (a.categoryId === id) a.categoryId = null;
  }
  persist();
}

// ---------- 마음 체크 ----------
export function addCheckin(fields) {
  const c = { id: uid(), at: new Date().toISOString(), scores: {}, triggerIds: [], condition: null, memo: '', ...fields };
  data.checkins.push(c);
  persist();
  return c;
}

export function updateCheckin(id, fields) {
  const c = find('checkins', id);
  if (!c) return;
  // 삭제된 마음 항목의 예전 점수는 그대로 둔다
  Object.assign(c, fields, { scores: { ...c.scores, ...fields.scores } });
  persist();
}

export function removeCheckin(id) {
  data.checkins = data.checkins.filter((c) => c.id !== id);
  data.sessions = data.sessions.filter((s) => s.beforeId !== id && s.afterId !== id);
  persist();
}

export const afterIds = () => new Set(data.sessions.map((s) => s.afterId).filter(Boolean));

// ---------- 진정 세션 (체크 → 행동 → 다시 체크) ----------
export function startSession({ beforeId, actionIds, minutes }) {
  const s = { id: uid(), at: new Date().toISOString(), beforeId, afterId: null, actionIds, minutes, startedStudy: null };
  data.sessions.push(s);
  persist();
  return s;
}

export function completeSession(id, afterId) {
  const s = find('sessions', id);
  if (s) s.afterId = afterId;
  persist();
}

export function updateSession(id, fields) {
  const s = find('sessions', id);
  if (s) Object.assign(s, fields);
  persist();
}

export function removeSession(id, withCheckins) {
  const s = find('sessions', id);
  if (!s) return;
  data.sessions = data.sessions.filter((x) => x.id !== id);
  if (withCheckins) {
    // 다른 세션이 쓰고 있는 체크는 남긴다
    const used = new Set(data.sessions.flatMap((x) => [x.beforeId, x.afterId]));
    const drop = [s.beforeId, s.afterId].filter((cid) => cid && !used.has(cid));
    data.checkins = data.checkins.filter((c) => !drop.includes(c.id));
  }
  persist();
}

export function pendingSession() {
  return [...data.sessions].reverse().find((s) => !s.afterId) || null;
}

// ---------- 잠 (하루에 한 번) ----------
export const getSleep = (day) => data.sleepLog[day] ?? null;

export function setSleep(day, hours) {
  data.sleepLog[day] = hours;
  persist();
}

// 예전 기록은 체크마다 잠 시간을 따로 가지고 있었다
export const sleepOf = (c) => data.sleepLog[dayKey(c.at)] ?? c.sleep ?? null;

// 하루 한 번 적는 컨디션 요인 (낮잠, 운동 등)
export const getDay = (day) => data.dayLog[day] || {};

export function setDayFactors(day, values) {
  data.dayLog[day] = { ...getDay(day), ...values };
  persist();
}

// ---------- 기본 항목 불러오기 ----------
// 이름이 같은 항목은 건너뛰고, 없는 기본 항목만 추가한다
// only: 이 이름들만 추가 (없으면 전부)
export function addMissingDefaults(col, only) {
  const tpl = createDefaults();
  const names = new Set(data[col].map((x) => x.name));
  let added = 0;
  for (const item of tpl[col]) {
    if (namesOf(item).some((n) => names.has(n))) continue;
    if (only && !only.includes(item.name)) continue;
    const copy = { ...stripAliases(item), id: uid() };
    if (col === 'actions') {
      // 예전 이름의 카테고리가 있으면 그 카테고리에 넣는다
      const tplCat = tpl.categories.find((c) => c.id === item.categoryId);
      let cat = data.categories.find((c) => namesOf(tplCat).includes(c.name));
      if (!cat) {
        cat = { ...stripAliases(tplCat), id: uid() };
        data.categories.push(cat);
      }
      copy.categoryId = cat.id;
    }
    data[col].push(copy);
    added++;
  }
  persist();
  return added;
}

// ---------- 백업 ----------
export function replaceAll(next) {
  data = next;
  normalize();
  persist();
}

export function reset() {
  data = freshData();
  persist();
}
