import * as store from './store.js';
import * as stats from './stats.js';

const $app = document.getElementById('app');
const $tabbar = document.getElementById('tabbar');
const $sheet = document.getElementById('sheet-root');

const ui = { view: 'home', params: {}, statsEmo: 'all', historyFilter: 'all', editingSleep: false };
let sheetSubmit = null;

// ---------- 도우미 ----------
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (v) => {
  const d = new Date(v);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtDate = (v) => {
  const d = new Date(v);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`;
};
const dayKey = store.dayKey;
const byAtDesc = (a, b) => b.at.localeCompare(a.at);
const fmtImp = (n) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
const impText = (n) => (n > 0 ? `${n.toFixed(1)}점 좋아졌어요` : n < 0 ? `${(-n).toFixed(1)}점 나빠졌어요` : '변화 없었어요');

function ago(v) {
  const m = Math.max(0, Math.round((Date.now() - new Date(v).getTime()) / 60000));
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function go(view, params = {}) {
  ui.view = view;
  ui.params = params;
  closeSheet();
  render();
  window.scrollTo(0, 0);
}

const actionLabel = (id) => {
  const a = store.find('actions', id);
  return a ? `${a.emoji} ${esc(a.name)}` : '🗑️ 삭제된 방법';
};
const scoreChip = (e, v) =>
  `<span class="chip score-chip" style="--c:${e.color}">${e.emoji} ${esc(e.name)} <b>${v}</b></span>`;
const scoreChips = (c) =>
  store
    .get()
    .emotions.filter((e) => c.scores[e.id] != null)
    .map((e) => scoreChip(e, c.scores[e.id]))
    .join('');
const triggerChips = (c) =>
  (c.triggerIds || [])
    .map((id) => store.find('triggers', id))
    .filter(Boolean)
    .map((t) => {
      const v = c.triggerValues?.[t.id];
      return `<span class="chip">${t.emoji} ${esc(t.name)}${v != null ? ` <b>${v}</b>${esc(t.unit || '')}` : ''}</span>`;
    })
    .join('');
const emptyBox = (emoji, text) => `<div class="empty"><div class="big">${emoji}</div><p>${text}</p></div>`;

function bar(label, value, max, sub, color) {
  const pct = max > 0 ? Math.max(3, (Math.abs(value) / max) * 100) : 3;
  return `<div class="bar-row"><div class="bar-label">${label}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div><div class="bar-val">${sub}</div></div>`;
}

function slider(name, label, value, color, hint = '') {
  return `<div class="slider-row" style="--c:${color}">
    <div class="slider-head"><span>${label} <span class="hint">${hint}</span></span><span class="val">${value}</span></div>
    <div class="slider-line"><span>0</span><input type="range" min="0" max="10" step="1" name="${name}" value="${value}" data-slider><span>10</span></div>
  </div>`;
}

// ---------- 홈 ----------
function viewHome() {
  const d = store.get();
  const now = new Date();
  const h = now.getHours();
  const greet = h < 6 ? '늦은 밤이에요 🌙' : h < 12 ? '좋은 아침이에요 ☀️' : h < 18 ? '좋은 오후예요 🌤️' : '좋은 저녁이에요 🌙';
  const pending = store.pendingSession();
  const last = [...d.checkins].sort(byAtDesc)[0];
  const today = dayKey(now);
  const best = stats.byAction(d)[0];

  let html = `<header class="top"><p class="muted">${fmtDate(now)}</p><h1>${greet}</h1></header>`;

  const sleep = store.getSleep(today);
  const dayFactors = d.factors;
  const dayValues = ui.dayDraft?.values || store.getDay(today);
  const sleepValue = ui.dayDraft ? ui.dayDraft.sleep : sleep;
  html +=
    sleep == null || ui.editingSleep
      ? `<form id="sleep-form" class="card sleep">
          <h3>🌙 어제 기록</h3>
          <p class="muted">하루에 한 번만 적으면 돼요. 비워 둔 칸은 기록하지 않아요.</p>
          <label class="field"><span>🛌 수면 시간 (시간)</span>
            <input type="number" name="sleep" min="0" max="24" step="0.5" inputmode="decimal" placeholder="예: 6.5" value="${sleepValue ?? ''}" required>
          </label>
          ${factorInputs(dayFactors, dayValues)}
          <button class="btn sm ghost add-day-item" type="button" data-act="add-day-factor">＋ 기록할 항목 추가</button>
          <button class="btn primary block" type="submit">저장</button>
        </form>`
      : `<section class="card sleep">
          <div class="spread">
            <span>🌙 어제 <b>${sleep}시간</b> 잤어요</span>
            <button class="btn sm ghost" data-act="edit-sleep">수정</button>
          </div>
          ${factorChips(dayFactors, dayValues)}
        </section>`;

  if (pending) {
    const elapsed = (Date.now() - new Date(pending.at).getTime()) / 60000;
    const pct = Math.min(100, (elapsed / (pending.minutes || 10)) * 100);
    html += `<section class="card pending">
      <div class="spread"><span class="badge mint">진정 중 🌿</span><span class="muted">${ago(pending.at)} 시작</span></div>
      <p class="pending-actions">${pending.actionIds.map(actionLabel).join(' · ')}</p>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <p class="muted">${pct >= 100 ? '시간이 다 됐어요! 마음이 어떤지 볼까요?' : `${pending.minutes}분 해보기로 했어요`}</p>
      <div class="row">
        <button class="btn primary" data-act="after-check" data-id="${pending.id}">다시 마음 체크하기</button>
        <button class="btn ghost" data-act="cancel-session" data-id="${pending.id}">그만두기</button>
      </div>
    </section>`;
  }

  html += `<button class="cta" data-act="new-check">💗 지금 내 마음 체크하기</button>`;

  html += `<div class="tiles">
    <div class="tile"><b>${d.checkins.filter((c) => dayKey(c.at) === today).length}</b><span>오늘 체크</span></div>
    <div class="tile"><b>${d.sessions.filter((s) => dayKey(s.at) === today).length}</b><span>오늘 진정 시도</span></div>
  </div>`;

  if (last) {
    const ok = d.emotions.every((e) => last.scores[e.id] == null || stats.isOk(e, last.scores[e.id]));
    html += `<section class="card">
      <div class="spread"><h3>마지막 체크</h3><span class="muted">${ago(last.at)}</span></div>
      <div>${scoreChips(last)}</div>
      <p class="muted">${ok ? '✨ 공부하기 괜찮은 상태였어요' : '🌊 마음이 조금 출렁였어요'}</p>
    </section>`;
  } else {
    html += `<section class="card">${emptyBox('🌱', '아직 기록이 없어요.<br>공부 전에 마음을 한 번 체크해 볼까요?')}</section>`;
  }

  if (best && best.avg > 0) {
    html += `<section class="card tip">
      <h3>💡 나에게 잘 맞는 방법</h3>
      <p><b>${best.action.emoji} ${esc(best.action.name)}</b> 하고 나면 마음이 평균 <b>${best.avg.toFixed(1)}점</b> 좋아졌어요 <span class="muted">(${best.n}회)</span></p>
    </section>`;
  }
  return html;
}

// ---------- 마음 체크 (새로 / 진정 후 / 수정) ----------
function viewCheck() {
  const d = store.get();
  const { mode, sessionId, checkinId } = ui.params;
  const base = mode === 'edit' ? store.find('checkins', checkinId) : null;
  const session = mode === 'after' ? store.find('sessions', sessionId) : null;
  const ref = session ? store.find('checkins', session.beforeId) : null;
  const isAfter = mode === 'after' || (mode === 'edit' && store.afterIds().has(checkinId));

  const title = mode === 'edit' ? '기록 수정하기 ✏️' : isAfter ? '다시 마음을 살펴볼까요? 🌱' : '지금 마음은 어때요? 💭';
  const sub = mode === 'edit' ? fmtDate(base.at) + ' ' + fmtTime(base.at) : isAfter ? '진정하기 전과 비교해 볼게요' : '솔직하게 0~10점으로 매겨 주세요';

  if (!d.emotions.length) {
    return `<header class="top"><h1>${title}</h1></header>
      <div class="card">${emptyBox('🫥', '측정할 마음 항목이 없어요.<br>관리 탭에서 먼저 추가해 주세요.')}
      <button class="btn primary block" data-act="tab" data-id="manage">관리 탭으로</button></div>`;
  }

  const sliderFor = (e) => {
    const v = base?.scores[e.id] ?? ref?.scores[e.id] ?? 5;
    const hint = ref && ref.scores[e.id] != null ? `아까 ${ref.scores[e.id]}` : '';
    return slider(`score-${e.id}`, `${e.emoji} ${esc(e.name)}`, v, e.color, hint);
  };
  const body = d.emotions.filter((e) => e.group === 'body');
  const mind = d.emotions.filter((e) => e.group !== 'body');

  // 순서: 몸 컨디션 → 오늘 있었던 일 → 그로 인한 마음
  const sections = [
    body.length ? `<h3 class="sec">🔋 몸 컨디션</h3>${body.map(sliderFor).join('')}` : '',
    isAfter
      ? ''
      : `<h3 class="sec">🌊 오늘 있었던 일 <span class="muted">선택</span></h3>
        ${triggerPicker(d.triggers, base?.triggerIds || [], base?.triggerValues || {})}`,
    mind.length ? `<h3 class="sec">💗 마음</h3>${mind.map(sliderFor).join('')}` : '',
  ];

  return `<header class="top">
      <button class="back" data-act="back">‹ 돌아가기</button>
      <h1>${title}</h1><p class="muted">${sub}</p>
    </header>
    <form id="check-form" class="card">
      ${sections.join('')}
      <h3 class="sec">📝 메모 <span class="muted">선택</span></h3>
      <textarea name="memo" class="memo-input" placeholder="지금 떠오르는 생각을 적어도 좋아요">${esc(base?.memo || '')}</textarea>
      <button class="btn primary block" type="submit">${mode === 'edit' ? '수정 완료' : '기록하기'}</button>
    </form>`;
}

// ---------- 검색해서 고르는 칩 목록 ----------
// 선택한 것만 위에 보이고, 검색칸을 누르면 전체 목록이 열린다
const pickItem = (name, value, label, checked) =>
  `<label class="chip" data-text="${label.replace(/"/g, '&quot;')}"><input type="checkbox" id="pk-${name}-${value}" name="${name}" value="${value}" ${checked ? 'checked' : ''}>${label}</label>`;

function picker(kind, placeholder, items, details = '') {
  return `<div class="picker" data-kind="${kind}">
    <div class="picker-selected">${selectedChips(items.filter((i) => i.includes(' checked>')))}</div>
    ${details}
    <input type="search" class="picker-search" placeholder="🔍 ${placeholder}" autocomplete="off" enterkeyhint="done">
    <div class="picker-panel" hidden>
      <div class="chips picker-list">${items.join('')}</div>
      <p class="muted picker-empty" hidden>찾는 항목이 없어요</p>
      <p class="muted picker-hint">✏️ 없으면 검색칸에 이름을 쓰고 바로 추가할 수 있어요</p>
      <button type="button" class="btn sm picker-add" data-act="picker-add" hidden></button>
      <button type="button" class="btn sm ghost block" data-act="picker-close">닫기</button>
    </div>
  </div>`;
}

// 처음 그릴 때와 선택이 바뀔 때 모두 같은 모양으로 선택 칩을 만든다
function selectedChips(itemsOrInputs) {
  return itemsOrInputs
    .map((x) => {
      const el = typeof x === 'string' ? new DOMParser().parseFromString(x, 'text/html').querySelector('label') : x.closest('label');
      return `<button type="button" class="chip picked" data-act="unpick" data-id="${el.querySelector('input').id}">${esc(el.dataset.text)} <span class="x">✕</span></button>`;
    })
    .join('');
}

function refreshPicker(p) {
  p.querySelector('.picker-selected').innerHTML = selectedChips([...p.querySelectorAll('.picker-list input:checked')]);
  // 숫자를 더 적을 수 있는 항목은 고른 것만 입력칸을 연다 (안 고른 칸은 disabled라 저장되지 않음)
  for (const det of p.querySelectorAll('.pick-detail')) {
    const on = p.querySelector(`#${CSS.escape(det.dataset.for)}`).checked;
    det.hidden = !on;
    det.querySelector('input').disabled = !on;
  }
}

function filterPicker(p) {
  const q = p.querySelector('.picker-search').value.trim().toLowerCase();
  let shown = 0;
  for (const label of p.querySelectorAll('.picker-list label')) {
    label.hidden = q && !label.dataset.text.toLowerCase().includes(q);
    if (!label.hidden) shown++;
  }
  p.querySelector('.picker-empty').hidden = shown > 0;
  p.querySelector('.picker-hint').hidden = !!q;
  const raw = p.querySelector('.picker-search').value.trim();
  const exact = [...p.querySelectorAll('.picker-list label')].some((l) => l.dataset.text.toLowerCase().endsWith(` ${q}`));
  const add = p.querySelector('.picker-add');
  add.hidden = !q || exact;
  add.textContent = `＋ "${raw}" 새로 추가`;
}

const openPicker = (p) => (p.querySelector('.picker-panel').hidden = false);
function closePickers(except) {
  for (const p of document.querySelectorAll('.picker')) if (p !== except) p.querySelector('.picker-panel').hidden = true;
}

// 검색칸에 쓴 이름으로 바로 새 항목을 만든다 (관리 탭에 가지 않아도 되게)
// 폼을 다시 그리면 입력한 점수가 사라지므로 칩만 끼워 넣는다
function addFromSearch(p) {
  const search = p.querySelector('.picker-search');
  const name = search.value.trim();
  if (!name) return;
  const t = store.upsert('triggers', { name, emoji: '🌊' });
  p.querySelector('.picker-list').insertAdjacentHTML('beforeend', triggerItem(t, true));
  toast(`"${name}"을(를) 추가했어요. 숫자를 더 적고 싶으면 관리 탭에서 단위를 정해 주세요`);
  search.value = '';
  filterPicker(p);
  refreshPicker(p);
}

// 오늘 있었던 일: 칩으로 고르고, 단위가 있는 항목은 고르면 숫자 칸이 열린다
const triggerItem = (t, checked) => pickItem('trigger', t.id, `${t.emoji} ${esc(t.name)}`, checked);

const triggerDetail = (t, value, open) => `<label class="pick-detail" data-for="pk-trigger-${t.id}" ${open ? '' : 'hidden'}>
    <span class="pd-name">${t.emoji} ${esc(t.name)}</span>
    <input type="number" name="tval-${t.id}" min="0" step="0.5" inputmode="decimal" placeholder="선택" value="${value ?? ''}" ${open ? '' : 'disabled'}>
    <span class="pd-unit">${esc(t.unit)}</span>
  </label>`;

function triggerPicker(triggers, ids, values) {
  const items = triggers.map((t) => triggerItem(t, ids.includes(t.id)));
  const details = triggers
    .filter((t) => t.detail)
    .map((t) => triggerDetail(t, values[t.id], ids.includes(t.id)))
    .join('');
  return picker('trigger', '눌러서 고르거나 검색해요', items, details);
}

// ---------- 어제 기록 항목 입력 (홈 화면) ----------
// 숫자·시각은 입력칸으로, 예/아니오는 칩으로
function factorInputs(factors, values) {
  const nums = factors
    .filter((f) => f.type !== 'bool')
    .map((f) => {
      const v = values[f.id] ?? '';
      // 게이지는 움직였을 때만 값이 저장된다 (안 건드리면 기록 안 함)
      if (f.type === 'scale')
        return `<div class="slider-row gauge ${v === '' ? 'untouched' : ''}" style="--c:var(--sky)">
          <div class="slider-head"><span>${f.emoji} ${esc(f.name)}</span><span class="val">${v === '' ? '–' : v}</span></div>
          <div class="slider-line"><span>0</span><input type="range" min="0" max="10" step="1" value="${v === '' ? 5 : v}" data-gauge="factor-${f.id}" aria-label="${esc(f.name)}"><span>10</span></div>
          <input type="hidden" name="factor-${f.id}" value="${v}">
        </div>`;
      // 시각은 버튼으로 된 선택칸이라 label로 감싸지 않는다 (라벨을 누르면 첫 버튼이 눌리는 것 방지)
      if (f.type === 'time')
        return `<div class="field"><span>${f.emoji} ${esc(f.name)}</span>${timeSelect(`factor-${f.id}`, v)}</div>`;
      return `<label class="field"><span>${f.emoji} ${esc(f.name)}${f.unit ? ` (${esc(f.unit)})` : ''}</span>
        <input type="number" name="factor-${f.id}" min="0" step="0.5" inputmode="decimal" value="${v}"></label>`;
    })
    .join('');
  const bools = factors.filter((f) => f.type === 'bool');
  const chips = bools.length
    ? `<div class="field"><span>했으면 눌러 주세요</span><div class="chips">${bools
        .map((f) => `<label class="chip"><input type="checkbox" name="factor-${f.id}" ${values[f.id] ? 'checked' : ''}>${f.emoji} ${esc(f.name)}</label>`)
        .join('')}</div></div>`
    : '';
  return nums + chips;
}

// 시각 고르기: 오전/오후 · 시 · 분(15분 단위)을 가로로
// 잠드는 시간이 주로 밤 10시~새벽 2시라, 오후는 11시부터 내려가고 오전은 12시부터 올라가게 보여 준다
const pad2 = (n) => String(n).padStart(2, '0');
const hourList = (ap) => (ap === 'am' ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 12]);

// 앱 디자인에 맞춘 선택칸 (기본 select 목록은 꾸밀 수 없어서 직접 만든다)
function tselOptions(options, value) {
  return options
    .map(([v, label]) => `<button type="button" class="tsel-opt ${String(v) === String(value) ? 'on' : ''}" data-act="tsel-pick" data-id="${v}">${label}</button>`)
    .join('');
}
function tsel(name, kind, options, value, placeholder) {
  const cur = options.find(([v]) => String(v) === String(value));
  return `<div class="tsel" data-kind="${kind}">
    <button type="button" class="tsel-btn ${cur ? '' : 'empty'}" data-act="tsel-open" aria-haspopup="listbox">
      <span class="tsel-val">${cur ? cur[1] : placeholder}</span><span class="tsel-arrow">▾</span>
    </button>
    <input type="hidden" name="${name}" value="${cur ? cur[0] : ''}">
    <div class="tsel-menu" data-placeholder="${placeholder}" hidden>${tselOptions(options, value)}</div>
  </div>`;
}
const hourOpts = (ap) => hourList(ap).map((h) => [h, `${h}시`]);

function timeSelect(name, value) {
  let ap = 'pm', h12 = '', m = 0;
  if (value) {
    const [vh, vm] = value.split(':').map(Number);
    const total = (Math.round((vh * 60 + vm) / 15) * 15) % 1440; // 15분 단위로 맞춤
    const h24 = Math.floor(total / 60);
    m = total % 60;
    ap = h24 < 12 ? 'am' : 'pm';
    h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  }
  return `<div class="time-select">
    ${tsel(`${name}-ap`, 'ap', [['pm', '오후'], ['am', '오전']], ap, '오후')}
    ${tsel(`${name}-h`, 'h', hourOpts(ap), h12, '시')}
    ${tsel(`${name}-m`, 'm', [0, 15, 30, 45].map((x) => [pad2(x), `${pad2(x)}분`]), pad2(m), '분')}
  </div>`;
}

function closeTsels(except) {
  for (const t of document.querySelectorAll('.tsel.open')) {
    if (t === except) continue;
    t.classList.remove('open');
    t.querySelector('.tsel-menu').hidden = true;
  }
}
function setTsel(t, value, label) {
  t.querySelector('input').value = value;
  t.querySelector('.tsel-val').textContent = label;
  t.querySelector('.tsel-btn').classList.toggle('empty', value === '');
  for (const o of t.querySelectorAll('.tsel-opt')) o.classList.toggle('on', o.dataset.id === String(value));
}

function readFactors(fd, factors) {
  const out = {};
  for (const f of factors) {
    const v = fd.get(`factor-${f.id}`);
    if (f.type === 'bool') out[f.id] = v !== null; // 체크박스는 선택됐을 때만 값이 온다
    else if (f.type === 'time') {
      const h = Number(fd.get(`factor-${f.id}-h`));
      const pm = fd.get(`factor-${f.id}-ap`) === 'pm';
      out[f.id] = h ? `${pad2((h % 12) + (pm ? 12 : 0))}:${fd.get(`factor-${f.id}-m`) || '00'}` : null;
    }
    else if (v === '' || v === null) out[f.id] = null;
    else out[f.id] = Number(v);
  }
  return out;
}

// '22:00' → '오후 10시', '01:15' → '오전 1시 15분'
function fmtClock(v) {
  if (!v || typeof v !== 'string') return '';
  const [h, m] = v.split(':').map(Number);
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}시${m ? ` ${m}분` : ''}`;
}

function factorChips(factors, values) {
  const chips = factors
    .filter((f) => (f.type === 'bool' ? values[f.id] === true : values[f.id] != null))
    .map((f) => `<span class="chip">${f.emoji} ${esc(f.name)}${f.type === 'bool' ? ' ✓' : f.type === 'scale' ? ` ${values[f.id]}/10` : f.type === 'time' ? ` ${fmtClock(values[f.id])}` : ` ${values[f.id]}${esc(f.unit || '')}`}</span>`)
    .join('');
  return chips ? `<div>${chips}</div>` : '';
}

function submitCheck(form) {
  const fd = new FormData(form);
  const scores = {};
  for (const e of store.get().emotions) {
    const v = fd.get(`score-${e.id}`);
    if (v !== null) scores[e.id] = Number(v);
  }
  const fields = { scores, memo: (fd.get('memo') || '').trim() };
  if (form.querySelector('.picker[data-kind=trigger]')) {
    fields.triggerIds = fd.getAll('trigger');
    fields.triggerValues = {};
    for (const id of fields.triggerIds) {
      const v = fd.get(`tval-${id}`);
      if (v !== null && v !== '') fields.triggerValues[id] = Number(v);
    }
  }

  const { mode, sessionId, checkinId } = ui.params;
  if (mode === 'edit') {
    store.updateCheckin(checkinId, fields);
    toast('수정했어요 ✏️');
    go(ui.params.back || 'history');
  } else if (mode === 'after') {
    const c = store.addCheckin(fields);
    store.completeSession(sessionId, c.id);
    go('outcome', { sessionId });
  } else {
    const c = store.addCheckin(fields);
    go('result', { checkinId: c.id });
  }
}

// ---------- 체크 결과 + 진정 방법 고르기 ----------
function viewResult() {
  const d = store.get();
  const c = store.find('checkins', ui.params.checkinId);
  if (!c) return viewHome();
  const over = d.emotions.filter((e) => c.scores[e.id] != null && !stats.isOk(e, c.scores[e.id]));

  let html = over.length
    ? `<div class="hero"><div class="big">🌊</div><h1>마음이 조금 출렁이네요</h1><p class="muted">잠깐 가라앉혀 볼 수도 있고, 그대로 둬도 괜찮아요.</p></div>
       <div class="card"><h3>기준을 넘은 마음</h3>${over.map((e) => scoreChip(e, c.scores[e.id])).join('')}
       <p class="muted">${over.map((e) => `${e.emoji} ${esc(e.name)}: ${e.threshold}점 ${e.direction === 'good' ? '이상' : '이하'}면 괜찮아요`).join('<br>')}</p></div>`
    : `<div class="hero"><div class="big">✨</div><h1>마음이 차분한 편이에요</h1><p class="muted">기록해 두었어요.</p></div>
       <div class="card">${scoreChips(c)}</div>`;

  if (ui.params.showActions) {
    html += actionPicker(over.map((e) => e.id));
    html += `<button class="btn ghost block" data-act="go-study">지금은 이대로 둘게요</button>`;
  } else if (over.length) {
    // 권하기만 하고 고르는 건 사용자에게 맡긴다
    const tip = stats.recommend(d, over.map((e) => e.id)).find((r) => r.avg > 0);
    html += `${tip ? `<div class="card tip"><p>💡 이럴 땐 <b>${tip.action.emoji} ${esc(tip.action.name)}</b> 하고 나서 평균 ${impText(tip.avg)}</p></div>` : ''}
      <div class="stack">
        <button class="btn primary block" data-act="show-actions">🌿 잠깐 가라앉혀 볼래요</button>
        <button class="btn ghost block" data-act="go-study">지금은 이대로 둘게요</button>
      </div>`;
  } else {
    html += `<div class="stack">
      <button class="btn primary block" data-act="go-study">확인했어요</button>
      <button class="btn ghost block" data-act="show-actions">마음 가라앉히는 방법 보기</button>
    </div>`;
  }
  return html;
}

function actionPicker(targetIds) {
  const d = store.get();
  const recs = stats.recommend(d, targetIds);
  if (!recs.length) {
    return `<div class="card">${emptyBox('🧺', '아직 진정 방법이 없어요.<br>관리 탭에서 추가해 주세요.')}</div>`;
  }
  let shown = 0;
  const items = recs
    .map((r) => {
      const cat = store.find('categories', r.action.categoryId);
      const top = r.avg != null && r.avg > 0 && shown++ < 3;
      const sub = r.avg == null ? '아직 안 해봤어요 🌱' : `평균 ${impText(r.avg)} · ${r.n}회`;
      return `<label class="pick">
        <input type="checkbox" name="action" value="${r.action.id}">
        <span class="em">${r.action.emoji}</span>
        <span class="grow"><span class="name">${esc(r.action.name)} ${top ? '<span class="badge">👍 추천</span>' : ''}</span>
        <span class="sub">${cat ? `${cat.emoji} ${esc(cat.name)} · ` : ''}${sub}</span></span>
        <span class="check">✓</span>
      </label>`;
    })
    .join('');
  return `<form id="pick-form">
    <h2>${targetIds.length ? '어떤 방법으로 가라앉혀 볼까요?' : '어떤 방법을 해볼까요?'}</h2>
    <p class="muted pad">기록이 쌓일수록 나한테 효과 좋았던 방법이 위로 올라와요</p>
    ${items}
    <label class="field"><span>⏱️ 얼마나 해볼까요? (분)</span>
      <input type="number" name="minutes" value="10" min="1" max="180" inputmode="numeric">
    </label>
    <button class="btn primary block" type="submit">🌿 이 방법으로 진정하기</button>
  </form>`;
}

function submitPick(form) {
  const fd = new FormData(form);
  const ids = [...new Set(fd.getAll('action'))];
  if (!ids.length) return toast('방법을 하나 이상 골라 주세요 🙏');
  const minutes = Math.max(1, Number(fd.get('minutes')) || 10);
  store.startSession({ beforeId: ui.params.checkinId, actionIds: ids, minutes });
  toast(`다 하고 나서 다시 체크해 주세요 🌿`);
  go('home');
}

// ---------- 진정 결과 ----------
function viewOutcome() {
  const d = store.get();
  const s = store.find('sessions', ui.params.sessionId);
  const b = s && store.find('checkins', s.beforeId);
  const a = s && store.find('checkins', s.afterId);
  if (!b || !a) return viewHome();

  const rows = d.emotions
    .filter((e) => b.scores[e.id] != null && a.scores[e.id] != null)
    .map((e) => {
      const imp = stats.improvement(e, b.scores[e.id], a.scores[e.id]);
      const cls = imp > 0 ? 'up' : imp < 0 ? 'down' : 'same';
      const label = imp > 0 ? `${imp}점 좋아짐` : imp < 0 ? `${-imp}점 나빠짐` : '그대로';
      return `<div class="delta-row"><span>${e.emoji} ${esc(e.name)}</span>
        <span><span class="muted">${b.scores[e.id]} → </span><b>${a.scores[e.id]}</b> <span class="${cls}">${label}</span></span></div>`;
    })
    .join('');
  const overall = stats.sessionImprovement(d, s) ?? 0;
  const hero =
    overall > 0 ? ['🎉', '마음이 가라앉았어요!'] : overall < 0 ? ['🫧', '오히려 조금 출렁였네요'] : ['🍃', '크게 달라지진 않았어요'];

  return `<div class="hero"><div class="big">${hero[0]}</div><h1>${hero[1]}</h1>
      <p class="muted">${s.actionIds.map(actionLabel).join(' · ')} · ${s.minutes}분</p></div>
    <div class="card">${rows}<p class="muted">평균 ${impText(overall)}</p></div>
    <div class="card">
      <h3>이제 공부 시작할 수 있겠어요?</h3>
      <div class="row">
        <button class="btn primary" data-act="study-yes">네, 시작할게요 📚</button>
        <button class="btn ghost" data-act="study-no">아직이에요 😵‍💫</button>
      </div>
    </div>`;
}

// ---------- 기록 ----------
function viewHistory() {
  const d = store.get();
  const f = ui.historyFilter;
  const used = new Set(d.sessions.flatMap((s) => [s.beforeId, s.afterId]).filter(Boolean));
  const items = [];
  if (f !== 'checks') d.sessions.forEach((s) => items.push({ at: s.at, html: sessionCard(s) }));
  if (f !== 'sessions') d.checkins.filter((c) => !used.has(c.id)).forEach((c) => items.push({ at: c.at, html: checkCard(c) }));
  items.sort(byAtDesc);

  let html = `<header class="top"><h1>기록 📒</h1></header>
    <div class="seg">${[['all', '전체'], ['sessions', '🌿 진정'], ['checks', '💭 체크만']]
      .map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-act="hist-filter" data-id="${k}">${l}</button>`)
      .join('')}</div>`;

  if (!items.length) return html + `<div class="card">${emptyBox('📭', '아직 기록이 없어요')}</div>`;

  let lastDay = '';
  for (const it of items) {
    const k = dayKey(it.at);
    if (k !== lastDay) {
      html += `<div class="date-head">${fmtDate(it.at)}</div>`;
      lastDay = k;
    }
    html += it.html;
  }
  return html;
}

function conditionLine(c) {
  const parts = [];
  // 예전 기록에만 있는 값(종합 컨디션, 피곤함)도 보여 준다
  if (c.condition != null) parts.push(`🌡️ 컨디션 ${c.condition}${c.conditionAuto ? ' (자동)' : ''}`);
  if (c.fatigue != null) parts.push(`😪 피곤함 ${c.fatigue}`);
  const sleep = store.sleepOf(c);
  if (sleep != null) parts.push(`🌙 전날 ${sleep}시간 잠`);
  const factors = factorChips(store.get().factors, store.getDay(dayKey(c.at)));
  return (parts.length ? `<p class="muted">${parts.join(' · ')}</p>` : '') + factors;
}

function checkCard(c) {
  return `<article class="card hist">
    <div class="spread"><span class="tag">💭 체크</span><span class="muted">${fmtTime(c.at)}</span></div>
    <div>${scoreChips(c)}</div>
    <div>${triggerChips(c)}</div>
    ${conditionLine(c)}
    ${c.memo ? `<p class="memo">${esc(c.memo)}</p>` : ''}
    <div class="row end">
      <button class="btn sm ghost" data-act="edit-check" data-id="${c.id}">수정</button>
      <button class="btn sm danger" data-act="del-check" data-id="${c.id}">삭제</button>
    </div>
  </article>`;
}

function sessionCard(s) {
  const d = store.get();
  const b = store.find('checkins', s.beforeId);
  const a = s.afterId && store.find('checkins', s.afterId);
  let body = '';
  if (b && a) {
    body = d.emotions
      .filter((e) => b.scores[e.id] != null && a.scores[e.id] != null)
      .map((e) => {
        const imp = stats.improvement(e, b.scores[e.id], a.scores[e.id]);
        const cls = imp > 0 ? 'up' : imp < 0 ? 'down' : 'same';
        return `<span class="chip score-chip" style="--c:${e.color}">${e.emoji} ${b.scores[e.id]}→${a.scores[e.id]} <span class="${cls}">${imp > 0 ? '▲' : imp < 0 ? '▼' : '='}</span></span>`;
      })
      .join('');
  } else if (b) {
    body = `${scoreChips(b)}<p class="muted">아직 다시 체크하지 않았어요</p>`;
  }
  const study = s.startedStudy === true ? '📚 공부 시작함' : s.startedStudy === false ? '😵‍💫 공부 시작 못함' : '';
  return `<article class="card hist session">
    <div class="spread"><span class="tag mint">🌿 진정</span><span class="muted">${fmtTime(s.at)}</span></div>
    <p class="pending-actions">${s.actionIds.map(actionLabel).join(' · ')} <span class="muted">· ${s.minutes}분</span></p>
    <div>${body}</div>
    ${b ? `<div>${triggerChips(b)}</div>${conditionLine(b)}` : ''}
    ${study ? `<p class="muted">${study}</p>` : ''}
    ${b?.memo ? `<p class="memo">${esc(b.memo)}</p>` : ''}
    ${a?.memo ? `<p class="memo">진정 후: ${esc(a.memo)}</p>` : ''}
    <div class="row end">
      <button class="btn sm ghost" data-act="edit-session" data-id="${s.id}">수정</button>
      ${b ? `<button class="btn sm ghost" data-act="edit-check" data-id="${b.id}">전 체크</button>` : ''}
      ${a ? `<button class="btn sm ghost" data-act="edit-check" data-id="${a.id}">후 체크</button>` : ''}
      <button class="btn sm danger" data-act="del-session" data-id="${s.id}">삭제</button>
    </div>
  </article>`;
}

// ---------- 통계 ----------
function viewStats() {
  const d = store.get();
  const emo = ui.statsEmo === 'all' || store.find('emotions', ui.statsEmo) ? ui.statsEmo : 'all';
  let html = `<header class="top"><h1>통계 📊</h1></header>`;
  if (!d.checkins.length) return html + `<div class="card">${emptyBox('📈', '마음을 체크하면 여기에 패턴이 나타나요')}</div>`;

  const ov = stats.overview(d);
  html += `<div class="tiles">
    <div class="tile"><b>${ov.checks}</b><span>마음 체크</span></div>
    <div class="tile"><b>${ov.sessions}</b><span>진정 완료</span></div>
    <div class="tile"><b>${ov.studyRate == null ? '-' : Math.round(ov.studyRate * 100) + '%'}</b><span>진정 후 공부 시작</span></div>
    <div class="tile"><b>${ov.avgBadness == null ? '-' : ov.avgBadness.toFixed(1)}</b><span>평균 흔들림</span></div>
  </div>`;

  html += `<div class="chips scroll">${[{ id: 'all', emoji: '🌈', name: '마음 전체' }, ...d.emotions]
    .map((e) => `<button class="chip sel ${emo === e.id ? 'on' : ''}" data-act="stats-emo" data-id="${e.id}">${e.emoji} ${esc(e.name)}</button>`)
    .join('')}</div>`;

  const effect = (list, labelOf) => {
    if (!list.length) return `<p class="muted">진정하고 다시 체크한 기록이 생기면 보여요</p>`;
    const max = Math.max(...list.map((x) => Math.abs(x.avg)), 1);
    return list
      .map((x) => bar(labelOf(x), x.avg, max, `${fmtImp(x.avg)} · ${x.n}회`, x.avg >= 0 ? 'var(--mint)' : 'var(--red)'))
      .join('');
  };
  const shake = (list, empty = '아직 데이터가 부족해요') =>
    list.length
      ? list.map((g) => bar(esc(g.label), g.avg, 10, `${g.avg.toFixed(1)} · ${g.n}회`, 'var(--pink)')).join('')
      : `<p class="muted">${empty}</p>`;

  html += `<section class="card"><h3>🌿 어떤 방법이 효과 있었을까?</h3>
    <p class="muted">진정 전후 점수 변화 평균 (+일수록 좋아짐)</p>
    ${effect(stats.byAction(d, emo), (x) => `${x.action.emoji} ${esc(x.action.name)}`)}</section>`;
  html += `<section class="card"><h3>🧺 카테고리별 효과</h3>
    ${effect(stats.byCategory(d, emo), (x) => `${x.category.emoji} ${esc(x.category.name)}`)}</section>`;

  const trend = (r, unit) =>
    r.slope == null
      ? `<p class="muted">${r.n ? '값이 더 다양하게 쌓이면 경향을 계산해요' : ''}</p>`
      : `<p class="trend">${unit} 늘 때 흔들림이 <b>${Math.abs(r.slope).toFixed(1)}점 ${r.slope > 0 ? '올라가요 📈' : '내려가요 📉'}</b> <span class="muted">(${r.n}개 기준)</span></p>`;
  html += `<section class="card"><h3>🌊 오늘 있었던 일과 마음</h3>
    <p class="muted">흔들림 지수 평균 (0~10, 높을수록 공부하기 어려움)${ov.avgBadness != null ? ` · 평소 ${ov.avgBadness.toFixed(1)}` : ''}</p>
    ${shake(stats.byTrigger(d, emo), '체크할 때 있었던 일을 고르면 여기에 쌓여요')}</section>`;
  const tv = stats.byTriggerValue(d, emo);
  if (tv.length)
    html += `<section class="card"><h3>🔢 숫자로 적은 일과 마음</h3>${tv
      .map((r) => `<div class="factor-stat"><b>${r.trigger.emoji} ${esc(r.trigger.name)}</b>${r.trigger.unit ? ` <span class="muted">(${esc(r.trigger.unit)})</span>` : ''}${trend(r, '숫자가 1')}${r.slope == null ? `<p class="muted">지금 ${r.n}개</p>` : ''}</div>`)
      .join('')}</section>`;
  const cond = stats.byConditionScore(d, emo);
  html += `<section class="card"><h3>🔋 몸 컨디션과 마음</h3>
    <p class="muted">몸 컨디션 점수 = 몸 컨디션 항목 평균 (높을수록 좋음)</p>
    ${trend(cond, '몸 컨디션이 1점')}${shake(cond.rows, '마음을 체크하면 보여요')}</section>`;
  const sleep = stats.bySleep(d, emo);
  html += `<section class="card"><h3>🛌 잠과 마음</h3>${trend(sleep, '잠이 1시간')}${shake(sleep.rows, '홈에서 잠 시간을 적으면 보여요')}</section>`;

  const num = (v) => (v == null ? '-' : v.toFixed(1));
  const signed = (v, what) =>
    v == null ? '' : `${what} <b class="${(what === '흔들림' ? -v : v) >= 0 ? 'up' : 'down'}">${fmtImp(v)}점</b>`;
  const factorRows = stats
    .byFactor(d, emo)
    .filter((r) => r.n)
    .map((r) => {
      const f = r.factor;
      const title = `<b>${f.emoji} ${esc(f.name)}</b>`;
      if (f.type === 'bool') {
        const side = (g, label) =>
          `<div class="cmp"><span>${label} <span class="muted">${g.n}회</span></span><span>몸 ${num(g.cond)} · 흔들림 ${num(g.bad)}</span></div>`;
        return `<div class="factor-stat">${title}${side(r.yes, '했을 때')}${side(r.no, '안 했을 때')}</div>`;
      }
      const body =
        r.condSlope == null && r.badSlope == null
          ? `<p class="muted">값이 더 다양하게 쌓이면 경향을 계산해요 (${r.n}개)</p>`
          : `<p>${f.type === 'time' ? '1시간 늦게 잘 때' : f.type === 'scale' ? '1점 높을 때' : `1${esc(f.unit || '')} 늘 때`} ${[signed(r.condSlope, '몸 컨디션'), signed(r.badSlope, '흔들림')].filter(Boolean).join(', ')} <span class="muted">(${r.n}개)</span></p>`;
      return `<div class="factor-stat">${title}${body}</div>`;
    })
    .join('');
  html += `<section class="card"><h3>🌙 어제 기록과 마음</h3>
    ${factorRows || '<p class="muted">홈의 어제 기록에 개운함·잠든 시간 등을 적으면 보여요</p>'}</section>`;
  html += `<section class="card"><h3>🕰️ 시간대별</h3>${shake(stats.byTimeSlot(d, emo))}</section>`;
  html += `<section class="card"><h3>📅 요일별</h3>${shake(stats.byWeekday(d, emo))}</section>`;

  const days = stats.recentDays(d, emo);
  html += `<section class="card"><h3>🗓️ 최근 2주 흔들림</h3><div class="vbars">${days
    .map((g) => `<div class="vbar ${g.n ? '' : 'none'}" title="${g.label}"><span>${g.n ? g.avg.toFixed(1) : ''}</span><i style="height:${g.n ? Math.max(4, g.avg * 10) : 4}%"></i><em>${g.label.split('/')[1]}</em></div>`)
    .join('')}</div></section>`;

  html += `<p class="muted pad">💡 '전체' 흔들림은 마음 항목만으로 계산하고, "높을수록 좋은" 항목은 뒤집어서 계산해요. 진정 후에 다시 잰 체크는 있었던 일·시간 분석에서 빼요.</p>`;
  return html;
}

// ---------- 관리 ----------
function viewManage() {
  const d = store.get();
  const section = (title, addAct, rows, empty, col) => `<section class="card">
    <div class="spread sec-head"><h2 class="sec-title">${title}</h2>
      <span class="head-btns">
        <button class="btn sm ghost" data-act="load-defaults" data-id="${col}">✨ 기본</button>
        <button class="btn sm" data-act="${addAct}">＋ 추가</button>
      </span>
    </div>
    ${rows || `<p class="muted">${empty}</p>`}
  </section>`;
  const item = (left, editAct, delAct, id) => `<div class="list-item">${left}
    <button class="icon-btn" data-act="${editAct}" data-id="${id}" aria-label="수정">✏️</button>
    <button class="icon-btn" data-act="${delAct}" data-id="${id}" aria-label="삭제">🗑️</button></div>`;

  const emotionRows = (group) =>
    d.emotions
      .filter((e) => (group === 'body' ? e.group === 'body' : e.group !== 'body'))
      .map((e) =>
        item(
          `<span class="dot" style="background:${e.color}"></span><span class="grow"><b>${e.emoji} ${esc(e.name)}</b>
           <span class="muted block">${e.direction === 'good' ? '높을수록 좋아요' : '높을수록 안 좋아요'} · 기준 ${e.threshold}점 ${e.direction === 'good' ? '이상' : '이하'}</span></span>`,
          'edit-emotion', 'del-emotion', e.id)
      )
      .join('');
  const categories = d.categories
    .map((c) =>
      item(`<span class="grow"><b>${c.emoji} ${esc(c.name)}</b> <span class="muted">방법 ${d.actions.filter((a) => a.categoryId === c.id).length}개</span></span>`,
        'edit-category', 'del-category', c.id)
    )
    .join('');
  const actions = d.actions
    .map((a) => {
      const c = store.find('categories', a.categoryId);
      return item(`<span class="grow"><b>${a.emoji} ${esc(a.name)}</b> <span class="muted">${c ? `${c.emoji} ${esc(c.name)}` : '미분류'}</span></span>`,
        'edit-action', 'del-action', a.id);
    })
    .join('');
  const triggers = d.triggers
    .map((t) =>
      item(
        `<span class="grow"><b>${t.emoji} ${esc(t.name)}</b>${t.detail ? ` <span class="muted">· 숫자 입력${t.unit ? ` (${esc(t.unit)})` : ''}</span>` : ''}</span>`,
        'edit-trigger', 'del-trigger', t.id)
    )
    .join('');
  const typeLabel = { bool: '했어요/안 했어요', time: '시각', number: '숫자', scale: '0~10 게이지' };
  const factors = d.factors
    .map((f) =>
      item(
        `<span class="grow"><b>${f.emoji} ${esc(f.name)}</b>
         <span class="muted block">${typeLabel[f.type] || '숫자'}${f.unit ? ` (${esc(f.unit)})` : ''}</span></span>`,
        'edit-factor', 'del-factor', f.id)
    )
    .join('');

  return `<header class="top"><h1>관리 🧺</h1><p class="muted">몸 컨디션, 마음, 오늘 있었던 일, 진정 방법을 내 마음대로 바꿔요</p></header>
    <p class="muted pad">✨ 기본: 없는 기본 항목만 골라서 추가해요 (이미 있는 건 그대로)</p>
    ${section('🔋 몸 컨디션', 'add-body', emotionRows('body'), '몸 컨디션 항목을 추가해 주세요', 'emotions')}
    ${section('💗 마음', 'add-mind', emotionRows('mind'), '마음 항목을 추가해 주세요', 'emotions')}
    ${section('🌊 오늘 있었던 일', 'edit-trigger', triggers, '항목을 추가해 주세요', 'triggers')}
    ${section('🌙 어제 기록 항목', 'edit-factor', factors, '수면 시간 말고 더 적고 싶은 걸 추가해요', 'factors')}
    ${section('🗂️ 행동 카테고리', 'edit-category', categories, '카테고리가 없어요', 'categories')}
    ${section('🌿 진정 방법 (행동)', 'edit-action', actions, '진정 방법을 추가해 주세요', 'actions')}
    <section class="card">
      <div class="sec-head"><h2 class="sec-title">💾 백업</h2></div>
      <p class="muted">기록은 이 폰의 브라우저에만 저장돼요. 브라우저 데이터를 지우면 사라지니까 가끔 백업해 두세요.</p>
      <div class="row">
        <button class="btn" data-act="export">내보내기</button>
        <label class="btn" for="import-file">가져오기</label>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>
      <button class="btn sm danger block" data-act="reset" style="margin-top:10px">모든 기록 지우고 처음으로</button>
    </section>`;
}

// ---------- 시트 (추가/수정 폼) ----------
const PALETTE = ['#FF9AA2', '#FFB38A', '#FFD97A', '#9ED9B5', '#8EC5FF', '#B5B9FF', '#E3A6FF', '#C9B6A6'];

function openSheet(title, body, onSubmit) {
  $sheet.innerHTML = `<div class="sheet-backdrop" data-act="close-sheet"></div>
    <form class="sheet" id="sheet-form">
      <div class="sheet-handle"></div>
      <h2>${title}</h2>
      ${body}
      <div class="row">
        <button type="button" class="btn ghost" data-act="close-sheet">취소</button>
        <button type="submit" class="btn primary">저장</button>
      </div>
    </form>`;
  sheetSubmit = onSubmit;
  $sheet.querySelector('input[type=text]')?.focus();
}

function closeSheet() {
  $sheet.innerHTML = '';
  sheetSubmit = null;
}

const nameEmojiFields = (x, placeholder) => `<div class="name-row">
    <label class="field emoji-field"><span>이모지</span><input type="text" name="emoji" value="${esc(x.emoji)}" maxlength="8"></label>
    <label class="field grow"><span>이름</span><input type="text" name="name" value="${esc(x.name)}" required maxlength="30" placeholder="${placeholder}"></label>
  </div>`;

function emotionSheet(id, group = 'mind') {
  const e = (id && store.find('emotions', id)) || { name: '', emoji: '🙂', color: PALETTE[0], direction: 'bad', threshold: 5, group };
  const body = `${nameEmojiFields(e, '예: 귀찮음')}
    <div class="field"><span>종류</span><div class="chips">
      <label class="chip"><input type="radio" name="group" value="body" ${e.group === 'body' ? 'checked' : ''}>🔋 몸 컨디션</label>
      <label class="chip"><input type="radio" name="group" value="mind" ${e.group !== 'body' ? 'checked' : ''}>💗 마음</label>
    </div></div>
    <div class="field"><span>색</span><div class="swatches">${PALETTE.map(
      (c) => `<label class="swatch"><input type="radio" name="color" value="${c}" ${c === e.color ? 'checked' : ''}><span style="background:${c}"></span></label>`
    ).join('')}</div></div>
    <div class="field"><span>점수의 의미</span><div class="chips">
      <label class="chip"><input type="radio" name="direction" value="bad" ${e.direction !== 'good' ? 'checked' : ''}>높을수록 안 좋아요 (예: 놀고 싶음)</label>
      <label class="chip"><input type="radio" name="direction" value="good" ${e.direction === 'good' ? 'checked' : ''}>높을수록 좋아요 (예: 집중력)</label>
    </div></div>
    ${slider('threshold', '공부해도 괜찮은 기준 점수', e.threshold, e.color, '안 좋은 마음은 이하 · 좋은 마음은 이상')}`;
  openSheet(id ? '항목 수정' : '항목 추가', body, (fd) => {
    store.upsert('emotions', {
      id,
      group: fd.get('group') === 'body' ? 'body' : 'mind',
      name: fd.get('name').trim(),
      emoji: fd.get('emoji').trim() || '🙂',
      color: fd.get('color') || PALETTE[0],
      direction: fd.get('direction') === 'good' ? 'good' : 'bad',
      threshold: Number(fd.get('threshold')),
    });
  });
}

function categorySheet(id) {
  const c = (id && store.find('categories', id)) || { name: '', emoji: '🗂️' };
  openSheet(id ? '카테고리 수정' : '카테고리 추가', nameEmojiFields(c, '예: 음악 듣기'), (fd) => {
    store.upsert('categories', { id, name: fd.get('name').trim(), emoji: fd.get('emoji').trim() || '🗂️' });
  });
}

function actionSheet(id) {
  const d = store.get();
  const a = (id && store.find('actions', id)) || { name: '', emoji: '🌿', categoryId: d.categories[0]?.id ?? null };
  const body = `${nameEmojiFields(a, '예: 좋아하는 노래 한 곡 듣기')}
    <label class="field"><span>카테고리</span><select name="categoryId">
      <option value="">미분류</option>
      ${d.categories.map((c) => `<option value="${c.id}" ${c.id === a.categoryId ? 'selected' : ''}>${c.emoji} ${esc(c.name)}</option>`).join('')}
    </select></label>`;
  openSheet(id ? '진정 방법 수정' : '진정 방법 추가', body, (fd) => {
    store.upsert('actions', { id, name: fd.get('name').trim(), emoji: fd.get('emoji').trim() || '🌿', categoryId: fd.get('categoryId') || null });
  });
}

function triggerSheet(id) {
  const t = (id && store.find('triggers', id)) || { name: '', emoji: '🌊' };
  const body = `${nameEmojiFields(t, '예: 시험 일정 확인함')}
    <label class="chip"><input type="checkbox" name="detail" ${t.detail ? 'checked' : ''}>고른 뒤 숫자도 적을래요 (선택 입력)</label>
    <label class="field"><span>숫자 단위 (예: 시간 지남, 잔, 분)</span><input type="text" name="unit" value="${esc(t.unit || '')}" maxlength="12"></label>`;
  openSheet(id ? '오늘 있었던 일 수정' : '오늘 있었던 일 추가', body, (fd) => {
    const unit = (fd.get('unit') || '').trim();
    // 단위만 적어도 숫자 입력을 켜 준다
    const detail = fd.get('detail') !== null || !!unit;
    store.upsert('triggers', { id, name: fd.get('name').trim(), emoji: fd.get('emoji').trim() || '🌊', detail, unit });
  });
}

// 마음 항목은 늘어날수록 체크할 슬라이더가 많아지므로 골라서 추가한다
function emotionDefaultsSheet() {
  const list = store.missingDefaults('emotions');
  if (!list.length) return toast('기본 항목이 이미 다 있어요');
  const body = `<p class="muted">추가할 마음을 골라 주세요. 많을수록 체크할 때 슬라이더가 늘어나요.</p>
    ${list
      .map(
        (e) => `<label class="pick">
          <input type="checkbox" name="pick" value="${esc(e.name)}">
          <span class="em">${e.emoji}</span>
          <span class="grow"><span class="name">${esc(e.name)}</span>
          <span class="sub">${e.group === 'body' ? '🔋 몸 컨디션' : '💗 마음'} · ${e.desc ? `${esc(e.desc)} · ` : ''}${e.direction === 'good' ? '높을수록 좋아요' : '높을수록 안 좋아요'}</span></span>
          <span class="check">✓</span>
        </label>`
      )
      .join('')}`;
  openSheet('✨ 몸 컨디션·마음 항목 추가', body, (fd) => {
    const names = fd.getAll('pick');
    if (!names.length) {
      toast('하나 이상 골라 주세요 🙏');
      return 'keep';
    }
    const n = store.addMissingDefaults('emotions', names);
    toast(`마음 항목 ${n}개를 추가했어요 ✨`);
  });
}

function factorSheet(id) {
  const f = (id && store.find('factors', id)) || { name: '', emoji: '🌙', type: 'scale', unit: '' };
  const radio = (value, label) =>
    `<label class="chip"><input type="radio" name="type" value="${value}" ${(f.type || 'number') === value ? 'checked' : ''}>${label}</label>`;
  const body = `${nameEmojiFields(f, '예: 어제 공부한 시간')}
    <div class="field"><span>기록 방식</span><div class="chips">
      ${radio('scale', '0~10 게이지')}${radio('number', '숫자')}${radio('time', '시각 (예: 23:30)')}${radio('bool', '했어요/안 했어요')}
    </div></div>
    <label class="field"><span>단위 (숫자일 때만, 선택)</span><input type="text" name="unit" value="${esc(f.unit)}" maxlength="10" placeholder="예: 시간, 점, 잔"></label>`;
  openSheet(id ? '어제 기록 항목 수정' : '어제 기록 항목 추가', body, (fd) => {
    const type = ['bool', 'time', 'scale'].includes(fd.get('type')) ? fd.get('type') : 'number';
    store.upsert('factors', {
      id,
      name: fd.get('name').trim(),
      emoji: fd.get('emoji').trim() || '🌙',
      type,
      unit: type === 'number' ? (fd.get('unit') || '').trim() : '',
      scope: 'day',
    });
  });
}

function editSessionSheet(id) {
  const d = store.get();
  const s = store.find('sessions', id);
  const body = `<div class="field"><span>한 방법</span><div class="chips">${d.actions
    .map((a) => `<label class="chip"><input type="checkbox" name="action" value="${a.id}" ${s.actionIds.includes(a.id) ? 'checked' : ''}>${a.emoji} ${esc(a.name)}</label>`)
    .join('')}</div></div>
    <label class="field"><span>시간 (분)</span><input type="number" name="minutes" value="${s.minutes}" min="1" max="180" inputmode="numeric"></label>
    <label class="field"><span>진정 후에 공부 시작했나요?</span><select name="study">
      <option value="">아직 몰라요</option>
      <option value="yes" ${s.startedStudy === true ? 'selected' : ''}>네, 시작했어요</option>
      <option value="no" ${s.startedStudy === false ? 'selected' : ''}>아니요</option>
    </select></label>`;
  openSheet('진정 기록 수정', body, (fd) => {
    const ids = fd.getAll('action');
    if (!ids.length) {
      toast('방법을 하나 이상 골라 주세요 🙏');
      return 'keep';
    }
    const study = fd.get('study');
    store.updateSession(id, {
      actionIds: ids,
      minutes: Math.max(1, Number(fd.get('minutes')) || s.minutes),
      startedStudy: study === '' ? null : study === 'yes',
    });
  });
}

// ---------- 백업 ----------
function exportData() {
  const blob = new Blob([JSON.stringify(store.get(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `maeum-ondo-backup-${dayKey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('백업 파일을 저장했어요 💾');
}

async function importData(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    if (!Array.isArray(obj.emotions) || !Array.isArray(obj.checkins)) throw new Error('형식 오류');
    if (!confirm('지금 기록을 백업 파일 내용으로 바꿀까요?\n지금 기록은 사라져요.')) return;
    store.replaceAll(obj);
    toast('백업을 불러왔어요 📥');
    render();
  } catch {
    toast('올바른 백업 파일이 아니에요 😢');
  }
}

// ---------- 이벤트 ----------
const confirmDelete = (msg, fn) => {
  if (confirm(msg)) {
    fn();
    render();
  }
};

const handlers = {
  tab: (id) => go(id),
  back: () => go(ui.params.back || 'home'),
  'new-check': () => go('check', { mode: 'new' }),
  'after-check': (id) => go('check', { mode: 'after', sessionId: id }),
  'cancel-session': (id) => confirmDelete('진정을 그만둘까요?\n처음 체크한 기록은 남아 있어요.', () => store.removeSession(id, false)),
  'go-study': () => {
    toast('기록했어요');
    go('home');
  },
  'show-actions': () => go('result', { ...ui.params, showActions: true }),
  'study-yes': () => {
    store.updateSession(ui.params.sessionId, { startedStudy: true });
    toast('기록했어요');
    go('home');
  },
  'study-no': () => {
    const s = store.find('sessions', ui.params.sessionId);
    store.updateSession(s.id, { startedStudy: false });
    toast('기록했어요. 다른 방법도 골라볼 수 있어요');
    go('result', { checkinId: s.afterId, showActions: true });
  },
  'hist-filter': (id) => {
    ui.historyFilter = id;
    render();
  },
  'stats-emo': (id) => {
    ui.statsEmo = id;
    render();
  },
  'edit-sleep': () => {
    ui.editingSleep = true;
    render();
  },
  'edit-check': (id) => go('check', { mode: 'edit', checkinId: id, back: 'history' }),
  'del-check': (id) => confirmDelete('이 기록을 지울까요?', () => store.removeCheckin(id)),
  'edit-session': editSessionSheet,
  'del-session': (id) => confirmDelete('이 진정 기록과 전·후 체크를 모두 지울까요?', () => store.removeSession(id, true)),
  'edit-emotion': (id) => emotionSheet(id),
  'add-body': () => emotionSheet(null, 'body'),
  'add-mind': () => emotionSheet(null, 'mind'),
  'del-emotion': (id) => confirmDelete('이 마음 항목을 지울까요?\n예전 기록의 점수는 통계에서 빠져요.', () => store.remove('emotions', id)),
  'edit-category': categorySheet,
  'del-category': (id) => confirmDelete('이 카테고리를 지울까요?\n안에 있던 방법은 미분류로 옮겨져요.', () => store.remove('categories', id)),
  'edit-action': actionSheet,
  'del-action': (id) => confirmDelete('이 진정 방법을 지울까요?\n예전 기록에는 "삭제된 방법"으로 보여요.', () => store.remove('actions', id)),
  'edit-trigger': triggerSheet,
  'del-trigger': (id) => confirmDelete('이 상황을 지울까요?', () => store.remove('triggers', id)),
  unpick: (inputId) => {
    const input = document.getElementById(inputId);
    input.checked = false;
    refreshPicker(input.closest('.picker'));
  },
  'picker-close': () => closePickers(),
  'picker-add': (_, el) => addFromSearch(el.closest('.picker')),
  'edit-factor': factorSheet,
  'tsel-open': (_, el) => {
    const t = el.closest('.tsel');
    const open = !t.classList.contains('open');
    t.classList.toggle('open', open);
    const menu = t.querySelector('.tsel-menu');
    menu.hidden = !open;
    if (open) menu.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  },
  'tsel-pick': (value, el) => {
    const t = el.closest('.tsel');
    setTsel(t, value, el.textContent);
    closeTsels();
    if (t.dataset.kind === 'ap') {
      // 오전/오후를 바꾸면 고른 시는 그대로 두고 순서만 바꾼다
      const hour = t.parentElement.querySelector('.tsel[data-kind=h]');
      const hv = hour.querySelector('input').value;
      hour.querySelector('.tsel-menu').innerHTML = tselOptions(hourOpts(value), hv);
    }
  },
  'add-day-factor': () => {
    // 적던 값이 사라지지 않게 잠깐 보관해 둔다
    const form = document.getElementById('sleep-form');
    if (form) {
      const fd = new FormData(form);
      ui.dayDraft = { sleep: fd.get('sleep'), values: readFactors(fd, store.get().factors) };
    }
    factorSheet();
  },
  'del-factor': (id) => confirmDelete('이 어제 기록 항목을 지울까요?\n예전 기록의 값은 통계에서 빠져요.', () => store.remove('factors', id)),
  'load-defaults': (col) => {
    if (col === 'emotions') return emotionDefaultsSheet();
    const n = store.addMissingDefaults(col);
    toast(n ? `기본 항목 ${n}개를 추가했어요 ✨` : '기본 항목이 이미 다 있어요');
    render();
  },
  export: exportData,
  reset: () => {
    if (confirm('정말 모든 기록을 지우고 처음 상태로 돌아갈까요?') && confirm('되돌릴 수 없어요. 백업은 해두셨나요?')) {
      store.reset();
      toast('처음 상태로 돌아갔어요');
      go('home');
    }
  },
  'close-sheet': closeSheet,
};

document.addEventListener('click', (e) => {
  // 검색 목록 바깥을 누르면 목록을 닫는다
  closePickers(e.target.closest('.picker'));
  closeTsels(e.target.closest('.tsel'));
  const t = e.target.closest('[data-act]');
  if (!t) return;
  handlers[t.dataset.act]?.(t.dataset.id || undefined, t);
});

document.addEventListener('focusin', (e) => {
  if (!e.target.matches('.picker-search')) return;
  const p = e.target.closest('.picker');
  closePickers(p);
  openPicker(p);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.matches('.picker-search')) return;
  // 검색칸에서 엔터를 눌러도 폼이 제출되지 않게: 보이는 첫 항목을 고르거나 새 상황으로 추가
  e.preventDefault();
  const p = e.target.closest('.picker');
  const first = [...p.querySelectorAll('.picker-list label')].find((l) => !l.hidden);
  if (first && e.target.value.trim()) {
    first.querySelector('input').checked = true;
    e.target.value = '';
    filterPicker(p);
    refreshPicker(p);
  } else if (!first && p.dataset.kind === 'trigger') {
    addFromSearch(p);
  }
});

document.addEventListener('input', (e) => {
  if (e.target.matches('.picker-search')) {
    const p = e.target.closest('.picker');
    openPicker(p);
    return filterPicker(p);
  }
  if (e.target.matches('[data-gauge]')) {
    const row = e.target.closest('.slider-row');
    row.querySelector(`input[name="${e.target.dataset.gauge}"]`).value = e.target.value;
    row.querySelector('.val').textContent = e.target.value;
    row.classList.remove('untouched');
    return;
  }
  if (!e.target.matches('[data-slider]')) return;
  const row = e.target.closest('.slider-row');
  row.querySelector('.val').textContent = e.target.value;
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'import-file') importData(e.target);
  if (e.target.closest('.picker-list')) refreshPicker(e.target.closest('.picker'));
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.id === 'check-form') submitCheck(form);
  else if (form.id === 'pick-form') submitPick(form);
  else if (form.id === 'sleep-form') {
    const fd = new FormData(form);
    const today = dayKey(new Date());
    store.setSleep(today, Number(fd.get('sleep')));
    store.setDayFactors(today, readFactors(fd, store.get().factors));
    ui.editingSleep = false;
    ui.dayDraft = null;
    toast('어제 기록을 저장했어요');
    render();
  }
  else if (form.id === 'sheet-form' && sheetSubmit) {
    const result = sheetSubmit(new FormData(form));
    if (result === 'keep') return;
    closeSheet();
    if (result !== 'no-render') render();
  }
});

// ---------- 화면 그리기 ----------
const VIEWS = { home: viewHome, check: viewCheck, result: viewResult, outcome: viewOutcome, history: viewHistory, stats: viewStats, manage: viewManage };
const TABS = [['home', '🏠', '홈'], ['history', '📒', '기록'], ['stats', '📊', '통계'], ['manage', '🧺', '관리']];

function render() {
  $app.innerHTML = (VIEWS[ui.view] || viewHome)();
  const active = TABS.some(([v]) => v === ui.view) ? ui.view : ui.params.back || 'home';
  $tabbar.innerHTML = `<div class="tabs">${TABS.map(
    ([v, i, l]) => `<button class="tab ${active === v ? 'on' : ''}" data-act="tab" data-id="${v}"><span class="ico">${i}</span>${l}</button>`
  ).join('')}</div>`;
}

await store.init();
render();

// 진정 중일 때 홈 화면 진행 막대를 갱신
setInterval(() => {
  if (ui.view === 'home' && !$sheet.innerHTML && store.pendingSession()) render();
}, 30000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
