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

// 컨디션 요인: type 'bool'(예/아니오) | 'number', scope 'check'(체크할 때마다) | 'day'(하루 한 번)
function defaultFactors() {
  const fac = (name, emoji, type, scope, unit = '') => ({ id: uid(), name, emoji, type, scope, unit });
  return [
    fac('마지막 식사 후', '🍚', 'number', 'check', '시간'),
    fac('배부름 (0~10)', '🍽️', 'number', 'check', '점'),
    fac('커피·카페인', '☕', 'number', 'check', '잔'),
    fac('낮잠', '😴', 'bool', 'day'),
    fac('운동', '🏃', 'bool', 'day'),
  ];
}

function createDefaults() {
  const cat = (name, emoji) => ({ id: uid(), name, emoji });
  const breath = cat('호흡', '🫁');
  const body = cat('몸 움직이기', '🚶');
  const sense = cat('감각 깨우기', '💧');
  const env = cat('환경 바꾸기', '📵');
  const mind = cat('생각 정리', '📝');
  const rest = cat('휴식', '🛋️');
  const sound = cat('소리·음악', '🎧');
  const act = (name, emoji, c) => ({ id: uid(), name, emoji, categoryId: c.id });
  const trig = (name, emoji) => ({ id: uid(), name, emoji });

  return {
    version: 1,
    // aliases: 예전 기본 이름. '기본 불러오기' 때 같은 항목으로 보고 건너뛴다
    emotions: [
      { id: uid(), name: '남은 체력', emoji: '🔋', color: '#8EC5FF', direction: 'good', threshold: 5 },
      { id: uid(), name: '남은 정신력', emoji: '🧠', color: '#E3A6FF', direction: 'good', threshold: 5 },
      { id: uid(), name: '놀고 싶은 마음', emoji: '🎮', color: '#FF9AA2', direction: 'bad', threshold: 6, aliases: ['놀고 싶음'] },
      { id: uid(), name: '미루고 싶은 마음', emoji: '🐢', color: '#C9B6A6', direction: 'bad', threshold: 5 },
      { id: uid(), name: '집중하고 싶은 마음', emoji: '🎯', color: '#9ED9B5', direction: 'good', threshold: 5, aliases: ['집중하고 싶음'] },
    ],
    categories: [breath, body, sense, env, mind, rest, sound],
    actions: [
      act('4-7-8 호흡', '🌬️', breath),
      act('눈 감고 심호흡 1분', '😌', breath),
      act('박스 호흡 (4-4-4-4)', '🔲', breath),
      act('산책', '🚶', body),
      act('스트레칭', '🤸', body),
      act('제자리 뛰기 30초', '🏃', body),
      act('찬물 세수', '💦', sense),
      act('물 한 잔 마시기', '🥤', sense),
      act('양치하기', '🪥', sense),
      act('폰 다른 방에 두기', '📵', env),
      act('책상 정리', '🧹', env),
      act('공부 장소 옮기기', '🚪', env),
      act('타이머 25분 맞추기', '⏲️', env),
      act('떠오르는 생각 적기', '📝', mind),
      act('오늘 할 일 3개 쓰기', '✅', mind),
      act('걱정 적고 덮어두기', '🗒️', mind),
      act('눈 감고 5분 쉬기', '😪', rest),
      act('백색소음 틀기', '🌧️', sound),
      act('좋아하는 노래 한 곡 듣기', '🎵', sound),
    ],
    triggers: [
      trig('유튜브 본 직후', '📺'),
      trig('SNS 하고 나서', '📱'),
      trig('게임 하고 나서', '🎮'),
      trig('밥 먹은 후', '🍚'),
      trig('피곤함', '😪'),
      trig('연락 받음', '💬'),
      trig('친구와 놀고 옴', '🧑‍🤝‍🧑'),
      trig('공부가 막힘', '🧱'),
      trig('공부할 양이 많음', '📚'),
      trig('시험·마감 다가옴', '⏰'),
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
  if (!Array.isArray(data.factors)) data.factors = defaultFactors();
  for (const k of COLLECTIONS) if (!Array.isArray(data[k])) data[k] = [];
  if (!data.sleepLog || typeof data.sleepLog !== 'object') data.sleepLog = {};
  if (!data.dayLog || typeof data.dayLog !== 'object') data.dayLog = {};
  // 컨디션이 5단계(1~5)였던 기록을 0~10점으로 옮긴다
  if (data.conditionScale !== 10) {
    for (const c of data.checkins) if (c.condition != null) c.condition = Math.round((c.condition - 1) * 2.5);
    data.conditionScale = 10;
  }
}

function persist() {
  adapter.save(data).catch((err) => console.error('저장 실패', err));
}

function freshData() {
  const d = createDefaults();
  d.emotions = d.emotions.map(({ aliases, ...e }) => e);
  return d;
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
export function addMissingDefaults(col) {
  const tpl = createDefaults();
  const names = new Set(data[col].map((x) => x.name));
  let added = 0;
  for (const { aliases = [], ...item } of tpl[col]) {
    if ([item.name, ...aliases].some((n) => names.has(n))) continue;
    const copy = { ...item, id: uid() };
    if (col === 'actions') {
      const tplCat = tpl.categories.find((c) => c.id === item.categoryId);
      let cat = data.categories.find((c) => c.name === tplCat.name);
      if (!cat) {
        cat = { ...tplCat, id: uid() };
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
