import { dayKey } from './store.js';

// 통계 계산
// 흔들림 지수: 0~10, 높을수록 공부하기 어려운 상태.
// "높을수록 좋은" 마음(direction: 'good')은 10에서 빼서 같은 방향으로 맞춘다.

export const badness = (e, v) => (e.direction === 'good' ? 10 - v : v);
export const isOk = (e, v) => (e.direction === 'good' ? v >= e.threshold : v <= e.threshold);
// 양수 = 좋아짐
export const improvement = (e, before, after) => (e.direction === 'good' ? after - before : before - after);

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const emotionsFor = (d, emo) => (emo === 'all' ? d.emotions : d.emotions.filter((e) => e.id === emo));
const findCheckin = (d, id) => d.checkins.find((c) => c.id === id);

export function checkinBadness(d, c, emo = 'all') {
  const emos = emotionsFor(d, emo).filter((e) => c.scores[e.id] != null);
  return mean(emos.map((e) => badness(e, c.scores[e.id])));
}

// 진정하고 나서 다시 잰 체크는 빼고, "평소에" 잰 체크만 패턴 분석에 쓴다
export function naturalCheckins(d) {
  const after = new Set(d.sessions.map((s) => s.afterId).filter(Boolean));
  return d.checkins.filter((c) => !after.has(c.id));
}

export function sessionImprovement(d, s, emo = 'all') {
  const b = findCheckin(d, s.beforeId);
  const a = findCheckin(d, s.afterId);
  if (!b || !a) return null;
  const emos = Array.isArray(emo) ? d.emotions.filter((e) => emo.includes(e.id)) : emotionsFor(d, emo);
  const vals = emos
    .filter((e) => b.scores[e.id] != null && a.scores[e.id] != null)
    .map((e) => improvement(e, b.scores[e.id], a.scores[e.id]));
  return mean(vals);
}

const completed = (d) => d.sessions.filter((s) => s.afterId);

function aggregate(d, emo, keysOf) {
  const map = new Map();
  for (const s of completed(d)) {
    const imp = sessionImprovement(d, s, emo);
    if (imp == null) continue;
    for (const k of new Set(keysOf(s))) {
      const g = map.get(k) || { sum: 0, n: 0, yes: 0, answered: 0 };
      g.sum += imp;
      g.n++;
      if (s.startedStudy != null) {
        g.answered++;
        if (s.startedStudy) g.yes++;
      }
      map.set(k, g);
    }
  }
  return map;
}

const summarize = (g) => ({ n: g.n, avg: g.sum / g.n, studyRate: g.answered ? g.yes / g.answered : null });

export function byAction(d, emo = 'all') {
  const map = aggregate(d, emo, (s) => s.actionIds);
  return d.actions
    .filter((a) => map.has(a.id))
    .map((a) => ({ action: a, ...summarize(map.get(a.id)) }))
    .sort((x, y) => y.avg - x.avg);
}

export function byCategory(d, emo = 'all') {
  const catOf = (id) => d.actions.find((a) => a.id === id)?.categoryId ?? null;
  const map = aggregate(d, emo, (s) => s.actionIds.filter((id) => d.actions.some((a) => a.id === id)).map(catOf));
  return [...d.categories, { id: null, name: '미분류', emoji: '📦' }]
    .filter((c) => map.has(c.id))
    .map((c) => ({ category: c, ...summarize(map.get(c.id)) }))
    .sort((x, y) => y.avg - x.avg);
}

// 효과 좋았던 방법 → 안 해본 방법 → 효과 없던 방법 순
export function recommend(d, targetIds) {
  const map = aggregate(d, targetIds.length ? targetIds : 'all', (s) => s.actionIds);
  const tier = (r) => (r.avg == null ? 1 : r.avg > 0 ? 0 : 2);
  return d.actions
    .map((a) => {
      const g = map.get(a.id);
      return { action: a, n: g?.n || 0, avg: g ? g.sum / g.n : null };
    })
    .sort((x, y) => tier(x) - tier(y) || (y.avg ?? 0) - (x.avg ?? 0));
}

function groupBadness(d, emo, groups) {
  const nat = naturalCheckins(d);
  return groups.map(([label, test]) => {
    const vals = nat.filter(test).map((c) => checkinBadness(d, c, emo)).filter((v) => v != null);
    return { label, n: vals.length, avg: mean(vals) };
  });
}

export function byTrigger(d, emo = 'all') {
  return groupBadness(
    d,
    emo,
    d.triggers.map((t) => [`${t.emoji} ${t.name}`, (c) => (c.triggerIds || []).includes(t.id)])
  )
    .filter((g) => g.n)
    .sort((a, b) => b.avg - a.avg);
}

// 기울기: x가 1 오를 때 흔들림이 얼마나 변하는지 (데이터 3개 이상, x가 다양할 때만)
function slope(points) {
  if (points.length < 3) return null;
  const mx = mean(points.map((p) => p[0]));
  const my = mean(points.map((p) => p[1]));
  const sxx = points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  if (!sxx) return null;
  return points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / sxx;
}

// 값(x)별 흔들림 평균 + 기울기
function byNumber(d, emo, valueOf, labelOf) {
  const points = naturalCheckins(d)
    .map((c) => [valueOf(c), checkinBadness(d, c, emo)])
    .filter(([x, y]) => x != null && y != null);
  const groups = new Map();
  for (const [x, y] of points) groups.set(x, [...(groups.get(x) || []), y]);
  const rows = [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([x, ys]) => ({ label: labelOf(x), n: ys.length, avg: mean(ys) }));
  return { rows, slope: slope(points), n: points.length };
}

export const byConditionScore = (d, emo = 'all') => byNumber(d, emo, (c) => c.condition ?? null, (x) => `🌡️ ${x}점`);

export const bySleep = (d, emo = 'all') =>
  byNumber(d, emo, (c) => {
    const s = d.sleepLog?.[dayKey(c.at)] ?? c.sleep ?? null;
    return s == null ? null : Math.round(s);
  }, (x) => `🛌 ${x}시간`);

export function byTimeSlot(d, emo = 'all') {
  const hour = (c) => new Date(c.at).getHours();
  return groupBadness(d, emo, [
    ['🌅 새벽 0~6시', (c) => hour(c) < 6],
    ['☀️ 오전 6~12시', (c) => hour(c) >= 6 && hour(c) < 12],
    ['🌤️ 오후 12~18시', (c) => hour(c) >= 12 && hour(c) < 18],
    ['🌆 저녁 18~22시', (c) => hour(c) >= 18 && hour(c) < 22],
    ['🌙 밤 22~24시', (c) => hour(c) >= 22],
  ]).filter((g) => g.n);
}

export function byWeekday(d, emo = 'all') {
  const names = ['일', '월', '화', '수', '목', '금', '토'];
  return groupBadness(
    d,
    emo,
    [1, 2, 3, 4, 5, 6, 0].map((w) => [`${names[w]}요일`, (c) => new Date(c.at).getDay() === w])
  ).filter((g) => g.n);
}

export function recentDays(d, emo = 'all', days = 14) {
  const key = (v) => new Date(v).toDateString();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const k = key(day);
    const [g] = groupBadness(d, emo, [[`${day.getMonth() + 1}/${day.getDate()}`, (c) => key(c.at) === k]]);
    out.push(g);
  }
  return out;
}

export function overview(d) {
  const answered = d.sessions.filter((s) => s.startedStudy != null);
  const nat = naturalCheckins(d).map((c) => checkinBadness(d, c)).filter((v) => v != null);
  return {
    checks: d.checkins.length,
    sessions: completed(d).length,
    studyRate: answered.length ? answered.filter((s) => s.startedStudy).length / answered.length : null,
    avgBadness: mean(nat),
  };
}
