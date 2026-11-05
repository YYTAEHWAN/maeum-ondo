import { localAdapter } from './storage.js';

// 저장 방식을 바꾸려면 이 줄만 다른 어댑터로 교체하면 된다 (storage.js 참고).
const adapter = localAdapter;

const COLLECTIONS = ['emotions', 'categories', 'actions', 'triggers', 'checkins', 'sessions'];
let data = null;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function createDefaults() {
  const cat = (name, emoji) => ({ id: uid(), name, emoji });
  const breath = cat('호흡', '🫁');
  const body = cat('몸 움직이기', '🚶');
  const sense = cat('감각 깨우기', '💧');
  const env = cat('환경 바꾸기', '📵');
  const mind = cat('생각 정리', '📝');
  const act = (name, emoji, c) => ({ id: uid(), name, emoji, categoryId: c.id });
  const trig = (name, emoji) => ({ id: uid(), name, emoji });

  return {
    version: 1,
    emotions: [
      { id: uid(), name: '놀고 싶음', emoji: '🎮', color: '#FF9AA2', direction: 'bad', threshold: 4 },
      { id: uid(), name: '불안함', emoji: '😰', color: '#B5B9FF', direction: 'bad', threshold: 5 },
      { id: uid(), name: '짜증', emoji: '😤', color: '#FFB38A', direction: 'bad', threshold: 5 },
      { id: uid(), name: '집중하고 싶음', emoji: '🎯', color: '#9ED9B5', direction: 'good', threshold: 5 },
    ],
    categories: [breath, body, sense, env, mind],
    actions: [
      act('4-7-8 호흡', '🌬️', breath),
      act('눈 감고 심호흡 1분', '😌', breath),
      act('산책', '🚶', body),
      act('스트레칭', '🤸', body),
      act('찬물 세수', '💦', sense),
      act('물 한 잔 마시기', '🥤', sense),
      act('폰 다른 방에 두기', '📵', env),
      act('책상 정리', '🧹', env),
      act('떠오르는 생각 적기', '📝', mind),
      act('오늘 할 일 3개 쓰기', '✅', mind),
    ],
    triggers: [
      trig('유튜브 본 직후', '📺'),
      trig('SNS 하고 나서', '📱'),
      trig('밥 먹은 후', '🍚'),
      trig('피곤함', '😪'),
      trig('연락 받음', '💬'),
      trig('공부가 막힘', '🧱'),
      trig('그냥 이유 없이', '🌀'),
    ],
    checkins: [],
    sessions: [],
  };
}

function normalize() {
  data.version ||= 1;
  for (const k of COLLECTIONS) if (!Array.isArray(data[k])) data[k] = [];
}

function persist() {
  adapter.save(data).catch((err) => console.error('저장 실패', err));
}

export async function init() {
  data = await adapter.load();
  if (!data) data = createDefaults();
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
  const c = { id: uid(), at: new Date().toISOString(), scores: {}, triggerIds: [], fatigue: null, sleep: null, memo: '', ...fields };
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

// ---------- 백업 ----------
export function replaceAll(next) {
  data = next;
  normalize();
  persist();
}

export function reset() {
  data = createDefaults();
  persist();
}
