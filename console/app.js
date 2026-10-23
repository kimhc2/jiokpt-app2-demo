// import 를 정적으로 쓰면 CDN 을 못 받았을 때 모듈 전체가 실행되지 않아
// 설정 안내조차 뜨지 않고 죽은 화면만 남습니다. 그래서 검사를 먼저 하고
// 라이브러리는 동적으로 불러옵니다.
// Supabase 주소가 실제 값인지 확인합니다. 자리표시자인 채로 두면
// 엉뚱한 곳에 접속을 시도해 알 수 없는 오류만 뜨기 때문입니다.
const CONFIGURED = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i
  .test((window.SUPABASE_URL || '').trim().replace(/\/$/, ''))
  && /^(ey[A-Za-z0-9._-]{20,}|sb_publishable_[A-Za-z0-9._-]{10,})$/
       .test((window.SUPABASE_ANON_KEY || '').trim());

if (!CONFIGURED) {
  document.body.innerHTML =
    '<div style="max-width:520px;margin:15vh auto;font:15px/1.7 -apple-system,sans-serif">' +
    '<h2>설정이 필요합니다</h2>' +
    '<p><code>teacher-web/config.js</code> 를 열어 Supabase <b>Project URL</b> 과 ' +
    '<b>anon public 키</b>를 채워 주세요.</p>' +
    '<p style="color:#6b7280">Supabase 대시보드 → Project Settings → Data API 에 있습니다.</p>' +
    '<p style="color:#6b7280">자세한 순서는 <code>설치_안내.md</code> 에 있습니다.</p></div>';
  throw new Error('config.js 가 설정되지 않았습니다');
}

let createClient;
try {
  ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm'));
} catch (e) {
  document.body.innerHTML =
    '<div style="max-width:480px;margin:14vh auto;padding:0 22px;' +
    'font:15px/1.7 -apple-system,sans-serif">' +
    '<h2>연결에 필요한 파일을 받지 못했습니다</h2>' +
    '<p>인터넷 연결을 확인해 주세요. 회사나 학교 네트워크가 ' +
    '<code>cdn.jsdelivr.net</code> 을 막고 있으면 이 화면이 뜹니다.</p>' +
    '<p style="color:#6b7280">새로고침해도 같으면 담당자에게 알려주세요.</p></div>';
  throw e;
}

const sb = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// 앱 개편 — 주간 리포트 카드 · 캐릭터 · 설문 문항은 학생 앱과 같은 파일 (shared/)
import * as WK from './weekly.js';
import { SV, SV_COLS } from './survey.js';

// 이벤트 종류 정의. positive 는 학부모 리포트에서 따로 집계됩니다.
// 수업 중 찍는 버튼. 칭찬은 리포트에서 따로 다루기로 해서 빼두었습니다.
const TYPES = [
  { key: 'drowsy',      icon: '😴', label: '졸음' },
  { key: 'distracted',  icon: '📱', label: '딴짓' },
  { key: 'away',        icon: '🚪', label: '이탈' },
];

// 표시용. 예전에 기록된 종류도 화면에서 깨지지 않게 남겨둡니다.
const TYPE_MAP = Object.fromEntries([
  ...TYPES,
  { key: 'slow',        icon: '🐢', label: '진도지연' },
  { key: 'good',        icon: '👍', label: '집중', positive: true },
  { key: 'no_response', icon: '🔇', label: '무응답' },
].map(t => [t.key, t]));

const state = {
  me: null,          // profiles 행
  students: [],      // 조직 전체 학생
  picked: new Set(), // 수업 시작 시 선택된 학생
  session: null,     // 진행 중인 class_sessions 행
  roster: [],        // 이번 수업 참여 학생
  events: [],        // 이번 수업 기록 (최신순)
  timer: null,
  selected: new Set(),   // 학생 관리에서 체크한 학생
  archived: false,       // 제거된 학생 보기 모드
  archivedCache: [],
  staff: [],             // 같은 조직 선생님 (18_scale.sql 의 staff_list)
  hasHomeroom: false,    // 담임 배정 기능을 쓸 수 있는가 (18_scale.sql 적용 여부)
  scope: 'all',          // 홈 · 수업 시작 목록 범위: mine(내 학생) | all
  rosterHome: 'all',     // 학생 관리 담임 필터: all | mine | none | <선생님 id>
  rosterQ: '',           // 학생 관리 검색어
};

// 화면 설정은 기기에 기억해 둡니다 (계정마다 따로)
const pref = {
  get(k) { try { return localStorage.getItem(`jp.${state.me?.id}.${k}`); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`jp.${state.me?.id}.${k}`, v); } catch { /* 무시 */ } },
};

/* ------------------------------------------------------------------ */
/* 유틸                                                                */
/* ------------------------------------------------------------------ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function hhmm(ts) {
  return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function elapsed(from) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(from)) / 1000));
  const m = Math.floor(s / 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

let toastTimer;
function toast(msg, undoFn) {
  const t = $('#toast');
  t.replaceChildren(el('span', null, msg));
  if (undoFn) {
    const b = el('button', null, '취소');
    b.onclick = () => { t.hidden = true; clearTimeout(toastTimer); undoFn(); };
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, undoFn ? 5000 : 2500);
}

function fail(e) {
  console.error(e);
  toast('오류: ' + (e?.message ?? e));
}

function show(name) {
  $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
  $$('.navbtn').forEach(b => b.classList.toggle('on', b.dataset.go === name));
  $('#topbar').hidden = (name === 'login');
}

/* ------------------------------------------------------------------ */
/* 인증                                                                */
/* ------------------------------------------------------------------ */
$('#loginForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  $('#loginError').hidden = true;
  const { error } = await sb.auth.signInWithPassword({
    email: $('#email').value.trim(),
    password: $('#password').value,
  });
  if (error) {
    $('#loginError').textContent = '로그인 실패: ' + error.message;
    $('#loginError').hidden = false;
  }
});

$('#logout').onclick = () => sb.auth.signOut();

sb.auth.onAuthStateChange((_evt, session) => {
  if (session) boot().catch(fail);
  else { state.me = null; show('login'); }
});

async function boot() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return show('login');

  const { data: me, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (error) return fail(error);

  if (!['teacher', 'admin'].includes(me.role)) {
    return alert('선생님 계정이 아닙니다. 03_setup.sql 로 role 을 teacher 또는 admin 으로 설정하세요.');
  }
  if (!me.org_id) {
    return alert('조직이 설정되지 않았습니다. 03_setup.sql 을 실행하세요.');
  }

  state.me = me;
  $('#whoami').textContent = `${me.name} · ${me.role === 'admin' ? '관리자' : '선생님'}`;

  // 관리자가 만든 선생님 계정은 첫 로그인 때 비밀번호부터 바꿉니다
  if (me.must_change_password) {
    $('#pw1').value = ''; $('#pw2').value = ''; $('#pwError').hidden = true;
    show('password');
    $('#topbar').hidden = true;
    return;
  }

  $('#navStaff').hidden = me.role !== 'admin';

  await checkSetup();
  await loadStudents();
  await loadStaff();
  initScope();
  await loadMonitor();
  startClock();
  show('home');
  checkHealthBadge().catch(() => {});
  checkSurveyDot().catch(() => {});
}

$('#pwSave').onclick = async () => {
  const a = $('#pw1').value, b = $('#pw2').value, err = $('#pwError');
  err.hidden = true;
  if (a.length < 8) { err.textContent = '8자 이상으로 정해 주세요.'; err.hidden = false; return; }
  if (a !== b) { err.textContent = '두 번 입력한 비밀번호가 다릅니다.'; err.hidden = false; return; }
  const btn = $('#pwSave'); btn.disabled = true;
  try {
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) throw error;
    const { error: e2 } = await sb.from('profiles').update({ must_change_password: false }).eq('id', state.me.id);
    if (e2) throw e2;
    $('#pw1').value = ''; $('#pw2').value = '';
    toast('비밀번호를 바꿨습니다');
    await boot();
  } catch (e) {
    err.textContent = e?.message ?? String(e); err.hidden = false;
  } finally { btn.disabled = false; }
};

/* ---- 담임 · 보기 범위 ---- */
// 18_scale.sql 을 아직 실행하지 않은 서버에서도 콘솔이 그대로 돌아가도록,
// staff_list 를 못 읽으면 담임 기능만 숨깁니다.
async function loadStaff() {
  const { data, error } = await sb.from('staff_list').select('*').order('name');
  state.hasHomeroom = !error && state.students.every((s) => 'homeroom_id' in s);
  state.staff = error ? [] : (data ?? []);
  $('#scopeSeg').hidden = !state.hasHomeroom;
  $('#rosterHome').hidden = !state.hasHomeroom;
  $('#bulkHome').hidden = !state.hasHomeroom;
  fillHomeroomSelects();
}

const staffName = (id) => state.staff.find((t) => t.id === id)?.name ?? '';

function fillHomeroomSelects() {
  const opts = (first) => [first, ...state.staff.map((t) => [t.id, t.name + (t.id === state.me.id ? ' (나)' : '')])];
  const fill = (sel, items, value) => {
    sel.replaceChildren(...items.map(([v, label]) => { const o = el('option', null, label); o.value = v; return o; }));
    sel.value = value;
  };
  fill($('#rosterHome'), [['all', '담임: 전체'], ['mine', '내 학생'], ['none', '담임 미지정'],
    ...state.staff.map((t) => [t.id, `담임: ${t.name}`])], state.rosterHome);
  if (![...$('#rosterHome').options].some((o) => o.value === state.rosterHome)) {
    state.rosterHome = 'all'; $('#rosterHome').value = 'all';
  }
  fill($('#bulkHome'), [['', '선택 학생 담임 지정…'], ['none', '담임 미지정으로'],
    ...opts(['', '']).slice(1)], '');
}

function initScope() {
  const saved = pref.get('scope');
  const hasMine = state.students.some((s) => s.homeroom_id === state.me.id);
  state.scope = !state.hasHomeroom ? 'all' : (saved || (hasMine ? 'mine' : 'all'));
  paintScope();
}

function paintScope() {
  $$('#scopeSeg button, #sentScope button, #wkScope button, #svScope button').forEach((b) => b.classList.toggle('on', b.dataset.scope === state.scope));
}

$$('#scopeSeg button').forEach((b) => b.onclick = () => {
  state.scope = b.dataset.scope;
  pref.set('scope', state.scope);
  paintScope();
  renderMonitor();
  renderStartList();
});

// 보낸 리포트 화면의 범위 버튼도 같은 설정을 씁니다
$$('#sentScope button').forEach((b) => b.onclick = () => {
  state.scope = b.dataset.scope;
  pref.set('scope', state.scope);
  paintScope();
  renderMonitor();
  renderStartList();
  loadSent().catch(fail);
});

// 주간 리포트 · 설문 화면의 범위 버튼도 같은 설정을 씁니다
$$('#wkScope button, #svScope button').forEach((b) => b.onclick = () => {
  state.scope = b.dataset.scope;
  pref.set('scope', state.scope);
  paintScope();
  if (!$('#view-weekly').hidden) loadWeeklyPage().catch(fail);
  if (!$('#view-survey').hidden) loadSurveyPage().catch(fail);
});

// '내 학생' 보기일 때 이 학생을 보여 줄지
function inScope(studentId) {
  if (state.scope !== 'mine' || !state.hasHomeroom) return true;
  return state.students.find((s) => s.id === studentId)?.homeroom_id === state.me.id;
}

// 설정이 덜 된 상태로 수업을 시작하려다 실패하는 일이 많아서, 부팅할 때
// 뭐가 빠졌는지 먼저 확인해 화면에 남겨 둡니다.
async function checkSetup() {
  const warn = $('#setupWarn');
  const { data, error } = await sb.rpc('setup_check');

  if (error) {
    warn.innerHTML =
      '<b>설정 점검 실패</b><br>' + esc(error.message) +
      '<br>06_changes.sql 을 아직 실행하지 않았다면 먼저 실행하세요.';
    warn.hidden = false;
    return;
  }

  const bad = [];
  if (!data.org_id)        bad.push('조직이 설정되지 않았습니다 → <code>03_setup.sql</code> 실행');
  if (!data.has_settings)  bad.push('알림 설정이 없습니다 → <code>03_setup.sql</code> 실행');
  if (!data.student_count) bad.push('등록된 학생이 없습니다 → 학생 관리에서 추가하거나 CSV 로 넣으세요');

  if (bad.length) {
    warn.innerHTML = '<b>수업을 시작하기 전에 확인하세요</b><ul>' +
      bad.map((x) => '<li>' + x + '</li>').join('') + '</ul>';
    warn.hidden = false;
  } else {
    warn.hidden = true;
  }
}

function esc(v) {
  const d = document.createElement('div');
  d.textContent = String(v ?? '');
  return d.innerHTML;
}

/* ------------------------------------------------------------------ */
/* 데이터 로드                                                          */
/* ------------------------------------------------------------------ */
async function loadStudents() {
  const { data, error } = await sb.from('students')
    .select('*').eq('active', true).order('name');
  if (error) return fail(error);
  state.students = data;
}

/* ------------------------------------------------------------------ */
/* 모니터링                                                             */
/*                                                                     */
/* 학생 50명이 전부 다른 시각에 시작합니다. 그래서 "지금 진행 중인 학생들"을 */
/* 한 화면에 띄워두고, 시작·종료만 개별로 합니다.                          */
/* ------------------------------------------------------------------ */
async function loadMonitor() {
  const { data: ongoing, error } = await sb.from('ongoing_sessions')
    .select('*').order('started_at', { ascending: true });
  if (error) { fail(error); return; }
  state.sessions = ongoing ?? [];

  const ids = state.sessions.map((s) => s.session_id);
  if (ids.length) {
    const { data: evs } = await sb.from('events')
      .select('*').in('session_id', ids)
      .order('created_at', { ascending: false });
    state.events = evs ?? [];
  } else {
    state.events = [];
  }

  renderMonitor();
  loadDone();
}

function elapsedText(from) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(from)) / 60000));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function renderMonitor() {
  const grid = $('#monGrid');
  grid.replaceChildren();

  const shown = state.sessions.filter((s) => inScope(s.student_id));
  $('#monCount').textContent = state.scope === 'mine' && shown.length !== state.sessions.length
    ? `진행 중 ${shown.length}명 · 전체 ${state.sessions.length}명`
    : `진행 중 ${state.sessions.length}명`;
  $('#monEmpty').hidden = shown.length > 0;

  const stale = state.sessions.filter((s) => s.minutes >= 240).length;
  $('#monSub').textContent = stale
    ? `${stale}명은 4시간 넘게 진행 중입니다 — 종료를 잊지 않았는지 확인하세요`
    : (state.sessions.length ? '기록 버튼을 누르면 학생에게 바로 알림이 갑니다' : '');

  for (const sess of shown) {
    const counts = countsFor(sess.session_id);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const negatives = Object.entries(counts)
      .filter(([k]) => !TYPE_MAP[k]?.positive)
      .reduce((a, [, v]) => a + v, 0);

    const long = (Date.now() - new Date(sess.started_at)) / 60000 >= 240;
    const card = el('div', 'scard' + (negatives >= 3 ? ' hot' : '') + (long ? ' long' : ''));

    // ---- 이름 · 경과시간 · 종료 ----
    const top = el('div', 'stop');
    const who = el('div', 'swho');
    who.append(el('span', 'sname', sess.student_name));
    if (sess.student_grade) who.append(el('span', 'sgrade', sess.student_grade));
    top.append(who);
    top.append(el('span', 'spacer'));

    const clock = el('span', 'sclock', elapsedText(sess.started_at));
    clock.dataset.since = sess.started_at;
    if (long) clock.title = '4시간 넘게 진행 중입니다';
    top.append(clock);

    const endBtn = el('button', 'ghost tiny', '종료');
    endBtn.onclick = () => endSession(sess);
    top.append(endBtn);
    card.append(top);

    if (sess.title) card.append(el('div', 'stitle', sess.title));

    // ---- 카운트 칩 (누르면 그 종류 최근 1건 삭제) ----
    const cbox = el('div', 'counts');
    const order = [...TYPES.map((t) => t.key),
                   ...Object.keys(TYPE_MAP).filter((k) => !TYPES.some((t) => t.key === k))];
    for (const key of order) {
      if (!counts[key]) continue;
      const t = TYPE_MAP[key] ?? { icon: '•', label: key };
      const chip = el('button', 'cnt' + (t.positive ? ' good' : ''),
                      `${t.icon} ${counts[key]} ✕`);
      chip.title = `${t.label} 가장 최근 기록 1건 삭제`;
      chip.onclick = () => removeLast(sess, key);
      cbox.append(chip);
    }
    if (total >= 3) {
      const clr = el('button', 'cnt clear', '전체 지우기');
      clr.title = '이 학생의 이번 수업 기록을 모두 삭제';
      clr.onclick = () => clearSession(sess, total);
      cbox.append(clr);
    }
    card.append(cbox);

    // ---- 기록 버튼 ----
    const acts = el('div', 'acts');
    for (const t of TYPES) {
      const b = el('button', 'act');
      b.append(el('b', null, t.icon), document.createTextNode(t.label));
      b.onclick = () => record(sess, t);
      acts.append(b);
    }
    card.append(acts);

    grid.append(card);
  }
}

// 경과 시간만 30초마다 갱신합니다. 카드를 다시 그리면 누르던 버튼이 튑니다.
function startClock() {
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    for (const c of $$('#monGrid .sclock')) {
      c.textContent = elapsedText(c.dataset.since);
    }
  }, 30000);
}

function countsFor(sessionId) {
  const c = {};
  for (const e of state.events) {
    if (e.session_id === sessionId) c[e.type] = (c[e.type] || 0) + 1;
  }
  return c;
}

/* ---- 기록 ---- */
async function record(sess, type) {
  // 심각도는 1로 고정합니다. 수업 중에 등급까지 고르게 하면 손이 느려지고,
  // 선생님마다 기준이 달라져 누적 수치를 비교할 수 없게 됩니다.
  // events.severity 컬럼은 그대로 두었으니 나중에 필요하면 다시 쓸 수 있습니다.
  const severity = 1;
  const { data, error } = await sb.from('events').insert({
    org_id: state.me.org_id,
    session_id: sess.session_id,
    student_id: sess.student_id,
    teacher_id: state.me.id,
    type: type.key,
    severity,
  }).select().single();
  if (error) return fail(error);

  state.events.unshift(data);
  renderMonitor();

  toast(`${sess.student_name} · ${type.label}`, () => undo(data.id));

  // 학생에게 즉시 알림 + 임계치를 넘으면 학부모에게 1회.
  // 판단은 서버(notify)가 합니다. 버튼 반응이 느려지지 않도록 기다리지 않습니다.
  sb.functions.invoke('notify', { body: { action: 'event', event_id: data.id } })
    .then(({ error }) => { if (error) console.warn('알림 발송 실패', error); })
    .catch((e) => console.warn('알림 발송 실패', e));
}

async function undo(eventId) {
  const { error } = await sb.from('events').delete().eq('id', eventId);
  if (error) return fail(error);
  state.events = state.events.filter((e) => e.id !== eventId);
  renderMonitor();
  toast('기록을 취소했습니다');
}

async function removeLast(sess, type) {
  const hit = state.events.find((e) => e.session_id === sess.session_id && e.type === type);
  if (!hit) return;
  const t = TYPE_MAP[type] ?? { label: type };

  const { error } = await sb.from('events').delete().eq('id', hit.id);
  if (error) return fail(error);

  state.events = state.events.filter((e) => e.id !== hit.id);
  renderMonitor();

  const left = state.events.filter((e) => e.session_id === sess.session_id && e.type === type).length;
  toast(`${sess.student_name} · ${t.label} 1건 삭제` + (left ? ` (${left}건 남음)` : ''));
}

async function clearSession(sess, total) {
  if (!confirm(
    `${sess.student_name} 학생의 이번 수업 기록 ${total}건을 모두 지울까요?\n\n되돌릴 수 없습니다.`
  )) return;

  const ids = state.events.filter((e) => e.session_id === sess.session_id).map((e) => e.id);
  const { error } = await sb.from('events').delete().in('id', ids);
  if (error) return fail(error);

  state.events = state.events.filter((e) => e.session_id !== sess.session_id);
  renderMonitor();
  toast(`${sess.student_name} 학생 기록 ${ids.length}건을 지웠습니다`);
}

/* ---- 시작 / 종료 ---- */
async function startSession(student) {
  $('#startError').hidden = true;
  try {
    const { data, error } = await sb.from('class_sessions').insert({
      org_id: state.me.org_id,
      teacher_id: state.me.id,
      student_id: student.id,
      title: $('#sessionTitle').value.trim() ||
             new Date().toLocaleDateString('ko-KR') + ' 수업',
    }).select().single();

    if (error) {
      // class_sessions_one_ongoing 유니크 인덱스
      if (error.code === '23505') {
        toast(`${student.name} 학생은 이미 수업 중입니다`);
        await loadMonitor();
        renderStartList();
        return;
      }
      throw Object.assign(error, { step: '수업 만들기' });
    }

    await loadMonitor();
    renderStartList();
    toast(`${student.name} 수업 시작`);

    // 시작 알림. 응답을 기다리지 않습니다 - 다음 학생을 바로 시작할 수 있어야 합니다.
    sb.functions.invoke('notify', { body: { action: 'session_start', session_id: data.id } })
      .then(({ error }) => { if (error) console.warn('시작 알림 실패', error); })
      .catch((e) => console.warn('시작 알림 실패', e));
  } catch (e) {
    showStartError(e);
    closeDrawer();
  }
}

function endSession(sess) {
  openReport(sess);
}

/* ------------------------------------------------------------------ */
/* 데일리 리포트 입력                                                    */
/*                                                                     */
/* 정답률·달성률·체류시간·누적·학년 대비 순위는 전부 서버가 계산합니다.     */
/* 선생님이 매번 계산해서 넣게 하면 50명 중 반드시 실수가 납니다.          */
/* ------------------------------------------------------------------ */
let reportFor = null;

function openReport(sess) {
  reportFor = sess;
  const st = state.students.find((x) => x.id === sess.student_id) ?? {};
  const mins = Math.max(0, Math.round((Date.now() - new Date(sess.started_at)) / 60000));

  $('#rpWho').textContent = `${sess.student_name} 데일리 리포트`;
  $('#rpMeta').textContent =
    `${sess.title || '수업'} · ${hhmm(sess.started_at)} 시작 · ${mins}분 진행` +
    (st.stage ? ` · 스테이지 ${st.stage} · 하루 목표 ${st.daily_goal_problems ?? st.stage * 25}문제` : '') +
    ` · 의무 ${st.mandatory_minutes ?? 60}분`;

  $('#rpAssigned').value = st.daily_goal_problems ?? (st.stage ?? 1) * 25;
  $('#rpSolved').value = '';
  $('#rpCorrect').value = '';
  $('#rpStay').value = mins;
  $('#rpMemo').value = '';
  $('#rpError').hidden = true;

  $('#reportModal').hidden = false;
  $('#reportScrim').hidden = false;
  updateCalc();
  setTimeout(() => $('#rpSolved').focus(), 60);
}

function closeReport() {
  $('#reportModal').hidden = true;
  $('#reportScrim').hidden = true;
  reportFor = null;
}

function updateCalc() {
  if (!reportFor) return;
  const st = state.students.find((x) => x.id === reportFor.student_id) ?? {};
  const assigned = Number($('#rpAssigned').value) || 0;
  const solved   = Number($('#rpSolved').value)   || 0;
  const correct  = Number($('#rpCorrect').value)  || 0;
  const stay     = Number($('#rpStay').value)     || 0;

  const accuracy   = solved   ? Math.round(correct * 100 / solved)   : 0;
  const completion = assigned ? Math.round(solved  * 100 / assigned) : 0;
  const targetAcc  = st.target_accuracy ?? 70;
  const mustMin    = st.mandatory_minutes ?? 60;      // 진행바·판정 공통 기준

  const box = $('#rpCalc');
  box.replaceChildren();

  const cell = (label, value, cls) => {
    const c = el('div', 'calcCell');
    c.append(el('span', null, label));
    const b = el('b', cls || null, value);
    c.append(b);
    return c;
  };

  box.append(
    cell('정답률', solved ? `${accuracy}%` : '—',
         solved ? (accuracy >= targetAcc ? 'ok' : 'bad') : null),
    cell('할당 달성', assigned ? `${completion}%` : '—',
         assigned ? (completion >= 100 ? 'ok' : 'bad') : null),
    cell('순공', `${Math.floor(stay / 60)}h ${stay % 60}m`,
         stay >= mustMin ? 'ok' : 'bad'),
  );

  // 오공완 = 순공 의무 시간 이상 또는 할당량 완료 (10/22 확정)
  const taskOk = assigned > 0 && solved >= assigned;
  const ok = stay >= mustMin || taskOk;
  const pts = (taskOk ? 6 : 0) + (stay >= mustMin ? 4 : 0) + Math.min(4, Math.max(0, Math.floor((stay - mustMin) / 30)));

  const v = el('div', 'verdict ' + (ok ? 'ok' : 'bad'));
  v.textContent = (ok
    ? `오공완 · ${[stay >= mustMin && '순공 1시간 채움', taskOk && '할당량 완료'].filter(Boolean).join(' · ')}`
    : `아쉬운 날 — 순공 ${stay}분 (1시간 미만) · 할당 ${completion}%`) + ` · 학생 랭킹 +${pts}점`;
  box.append(v);
}

['#rpAssigned', '#rpSolved', '#rpCorrect', '#rpStay'].forEach((sel) => {
  $(sel).addEventListener('input', updateCalc);
});

$('#rpClose').onclick = closeReport;
$('#reportScrim').onclick = closeReport;
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#reportModal').hidden) closeReport();
});

$('#rpSkip').onclick = async () => {
  const sess = reportFor;
  if (!sess) return;
  if (!confirm(
    `${sess.student_name} 학생의 수업을 리포트 없이 종료할까요?\n\n` +
    `보호자에게는 기록만 담긴 간단한 안내가 갑니다. 나중에 리포트를 추가할 수 없습니다.`
  )) return;
  closeReport();
  await finishSession(sess, null);
};

$('#rpSubmit').onclick = async () => {
  const sess = reportFor;
  if (!sess) return;

  const assigned = Number($('#rpAssigned').value);
  const solved   = Number($('#rpSolved').value);
  const correct  = Number($('#rpCorrect').value);
  const stay     = Number($('#rpStay').value);

  const bad = [];
  if (!Number.isFinite(assigned) || assigned < 0) bad.push('할당 문제 수를 확인하세요.');
  if (!Number.isFinite(solved) || solved < 0 || $('#rpSolved').value === '')
    bad.push('푼 문제 수를 입력하세요.');
  if (!Number.isFinite(correct) || correct < 0 || $('#rpCorrect').value === '')
    bad.push('맞은 문제 수를 입력하세요.');
  if (correct > solved) bad.push('맞은 문제 수가 푼 문제 수보다 클 수 없습니다.');
  if (!Number.isFinite(stay) || stay < 0) bad.push('체류 시간을 확인하세요.');

  if (bad.length) {
    $('#rpError').innerHTML = bad.map(esc).join('<br>');
    $('#rpError').hidden = false;
    return;
  }

  const btn = $('#rpSubmit');
  btn.disabled = true;
  btn.textContent = '저장 중...';
  const payload = { assigned, solved, correct, stay, memo: $('#rpMemo').value.trim() };
  closeReport();
  await finishSession(sess, payload);
  btn.disabled = false;
  btn.textContent = '종료하고 리포트 발송';
};

// 종료 → 리포트 저장 → 보호자 발송. 순서가 중요합니다.
// 체류 시간을 서버가 종료 시각으로 계산하므로 종료가 먼저여야 합니다.
async function finishSession(sess, report) {
  const { error } = await sb.from('class_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', sess.session_id);
  if (error) return fail(error);

  if (report) {
    const { error: e2 } = await sb.rpc('save_session_report', {
      p_session: sess.session_id,
      p_assigned: report.assigned,
      p_solved: report.solved,
      p_correct: report.correct,
      p_stay_min: report.stay,
      p_memo: report.memo || null,
    });
    if (e2) {
      await loadMonitor();
      return fail(e2);
    }
  }

  await loadMonitor();
  renderStartList();
  toast(`${sess.student_name} 수업 종료`);
  sendSummary(sess.session_id, sess.student_name);
}

// 보호자에게 발송. 리포트를 입력했으면 데일리 리포트가, 아니면 간단한 안내가 갑니다.
// 같은 수업의 재발송은 DB 유니크 인덱스가 막습니다.
async function sendSummary(sessionId, who) {
  try {
    const { data, error } = await sb.functions.invoke('notify', {
      body: { action: 'session_summary', session_id: sessionId },
    });
    if (error) throw error;

    const all = (data.detail ?? []).flatMap((d) => d.results ?? []);
    const what = data.has_report ? '데일리 리포트' : '수업 안내';

    if (data.sent > 0) toast(`${who ?? ''} 보호자에게 ${what}를 보냈습니다`.trim());
    else if (all.includes('duplicate')) toast('이미 보낸 리포트입니다');
    else toast(`${who ?? ''} 보호자가 알림을 켜지 않아 발송되지 않았습니다`.trim());
  } catch (e) {
    toast('발송 실패: ' + (e?.message ?? e));
    console.error('보호자 발송 실패', e);
  }
}

/* ---- 오늘 마친 수업 ---- */
async function loadDone() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);

  const { data } = await sb.from('session_summaries')
    .select('*').eq('status', 'ended')
    .gte('started_at', from.toISOString())
    .order('ended_at', { ascending: false }).limit(60);

  const box = $('#doneList');
  box.replaceChildren();
  if (!data || !data.length) {
    return box.append(el('p', 'empty', '아직 없습니다.'));
  }

  for (const r of data) {
    const row = el('div', 'item');
    row.append(el('span', 'when', r.ended_at ? hhmm(r.ended_at) : ''));
    row.append(el('span', 'grow', r.student_grade
      ? `${r.student_name} · ${r.student_grade}` : r.student_name));

    const chips = el('span', 'counts');
    if (r.drowsy_count)     chips.append(el('span', 'cnt flat', `😴 ${r.drowsy_count}`));
    if (r.distracted_count) chips.append(el('span', 'cnt flat', `📱 ${r.distracted_count}`));
    if (r.away_count)       chips.append(el('span', 'cnt flat', `🚪 ${r.away_count}`));
    if (!chips.childElementCount) chips.append(el('span', 'muted small', '특이사항 없음'));
    row.append(chips);

    const b = el('button', 'ghost tiny', '요약');
    b.onclick = () => openSummary(r);
    row.append(b);
    box.append(row);
  }
}

/* ------------------------------------------------------------------ */
/* 수업 시작 사이드바                                                    */
/* ------------------------------------------------------------------ */
function openDrawer() {
  $('#startPanel').hidden = false;
  $('#drawerScrim').hidden = false;
  renderStartList();
  setTimeout(() => $('#stuSearch').focus(), 60);
}
function closeDrawer() {
  $('#startPanel').hidden = true;
  $('#drawerScrim').hidden = true;
}

$('#openStart').onclick = openDrawer;
$('#closeStart').onclick = closeDrawer;
$('#drawerScrim').onclick = closeDrawer;
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#startPanel').hidden) closeDrawer();
});

$('#stuSearch').addEventListener('input', renderStartList);

function renderStartList() {
  const q = $('#stuSearch').value.trim().toLowerCase();
  const busy = new Set(state.sessions.filter((s) => inScope(s.student_id)).map((s) => s.student_id));
  const box = $('#startList');
  box.replaceChildren();

  const list = state.students.filter((s) =>
    inScope(s.id) &&
    (!q || s.name.toLowerCase().includes(q) || (s.grade ?? '').toLowerCase().includes(q) ||
     (s.external_id ?? '').includes(q)));

  const free = list.filter((s) => !busy.has(s.id));
  $('#startCount').textContent = state.students.length
    ? `대기 ${free.length}명 · 진행 중 ${busy.size}명`
    : '등록된 학생이 없습니다. 학생 관리에서 먼저 추가하세요.';

  if (!list.length) {
    return box.append(el('p', 'empty', q ? '검색 결과가 없습니다.' : '등록된 학생이 없습니다.'));
  }

  for (const s of list) {
    const row = el('div', 'item');
    row.append(el('span', 'grow', s.grade ? `${s.name} · ${s.grade}` : s.name));

    if (busy.has(s.id)) {
      row.append(el('span', 'badge ok', '진행 중'));
    } else {
      const b = el('button', 'primary tiny', '시작');
      b.onclick = () => startSession(s);
      row.append(b);
    }
    box.append(row);
  }
}

/* ------------------------------------------------------------------ */
/* 수업 요약 (학생 한 명)                                                */
/* ------------------------------------------------------------------ */
async function openSummary(row) {
  $('#sumTitle').textContent = `${row.student_name} · ${row.title || '수업'}`;

  const mins = row.ended_at
    ? Math.round((new Date(row.ended_at) - new Date(row.started_at)) / 60000) : null;
  $('#sumMeta').textContent =
    new Date(row.started_at).toLocaleString('ko-KR') + (mins != null ? ` · ${mins}분` : '');

  const { data: evs } = await sb.from('events')
    .select('*').eq('session_id', row.session_id)
    .order('created_at', { ascending: true });

  const box = $('#sumTable');
  box.replaceChildren();

  if (!evs || !evs.length) {
    box.append(el('p', 'empty', '기록이 없습니다. 특이사항 없이 마쳤습니다.'));
  } else {
    for (const e of evs) {
      const t = TYPE_MAP[e.type] ?? { icon: '•', label: e.type };
      const item = el('div', 'item');
      item.append(el('span', 'when', hhmm(e.created_at)));
      item.append(el('span', 'grow', `${t.icon} ${t.label}` +
        (!t.positive && e.severity > 1 ? ` (심각도 ${e.severity})` : '')));
      box.append(item);
    }
  }

  const rb = $('#resendBtn');
  rb.onclick = () => sendSummary(row.session_id, row.student_name);
  rb.disabled = false;
  rb.textContent = '요약 다시 보내기';
  show('summary');
}

/* ------------------------------------------------------------------ */
/* 학생 관리                                                            */
/* ------------------------------------------------------------------ */
$('#addStudentForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const { error } = await sb.from('students').insert({
    org_id: state.me.org_id,
    external_id: $('#stExt').value.trim() || null,
    name:   $('#stName').value.trim(),
    grade:  $('#stGrade').value.trim() || null,
    school: $('#stSchool').value.trim() || null,
  });
  if (error) return fail(error);
  ev.target.reset();
  await loadStudents();
  await renderRoster();
  toast('학생을 추가했습니다');
});

// 담임 필터 + 검색. 학생이 수백 명이 되면 한 목록으로는 찾을 수가 없습니다.
function filterRoster(src) {
  const q = state.rosterQ.trim().toLowerCase();
  const h = state.rosterHome;
  return src.filter((s) => {
    if (state.hasHomeroom && !state.archived) {
      if (h === 'mine' && s.homeroom_id !== state.me.id) return false;
      if (h === 'none' && s.homeroom_id) return false;
      if (h !== 'all' && h !== 'mine' && h !== 'none' && s.homeroom_id !== h) return false;
    }
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || (s.external_id ?? '').toLowerCase().includes(q) ||
           (s.grade ?? '').toLowerCase().includes(q);
  });
}

async function renderRoster() {
  const box = $('#rosterList');
  box.replaceChildren();

  const all = state.archived ? await loadArchived() : state.students;
  const list = filterRoster(all);
  $('#rosterTitle').textContent = state.archived ? '제거된 학생' : '학생 명단';
  $('#archToggle').textContent = state.archived ? '명단으로 돌아가기' : '제거된 학생 보기';
  $('#removeSel').textContent = state.archived ? '선택 복원' : '선택 제거';
  $('#rosterCount').textContent = list.length === all.length ? `${all.length}명` : `${list.length}명 / 전체 ${all.length}명`;
  // 보이지 않는 학생이 선택된 채로 남아 있으면 엉뚱한 학생이 처리됩니다
  const visible = new Set(list.map((s) => s.id));
  for (const id of [...state.selected]) if (!visible.has(id)) state.selected.delete(id);

  if (!list.length) {
    updateSelCount();
    return box.append(el('p', 'empty', state.archived
      ? '제거된 학생이 없습니다.'
      : all.length ? '조건에 맞는 학생이 없습니다.' : '등록된 학생이 없습니다. 위에서 추가하거나 CSV 로 넣으세요.'));
  }

  // 알림 연결 상태. PWA 는 보호자가 아이콘을 지우면 알림이 끊기므로
  // 끊긴 사람을 골라낼 수 있어야 운영이 됩니다.
  const [{ data: st }, { data: links }, { data: accts }] = await Promise.all([
    sb.from('student_notify_status').select('*'),
    sb.from('parent_link_status').select('*').eq('status', 'approved'),
    sb.from('student_account_status').select('*'),
  ]);
  const status = Object.fromEntries((st ?? []).map((r) => [r.student_id, r]));
  const acct = Object.fromEntries((accts ?? []).map((r) => [r.student_id, r]));

  // 형제자매는 보호자 계정 하나로 묶입니다(앱에서 학부모가 직접 합칩니다).
  // 묶인 뒤에는 동생 쪽 -p 계정이 비어 버리므로, 모르고 다시 발급하면
  // 링크가 끊깁니다. 그래서 같은 보호자에 걸린 다른 자녀를 표시해 둡니다.
  const nameOf = Object.fromEntries(list.map((s) => [s.id, s.name]));
  const byParent = {};
  for (const l of links ?? []) {
    (byParent[l.parent_id] ??= []).push(l.student_id);
  }
  const siblingsOf = (studentId) => {
    const link = (links ?? []).find((l) => l.student_id === studentId);
    if (!link) return [];
    return (byParent[link.parent_id] ?? [])
      .filter((id) => id !== studentId)
      .map((id) => nameOf[id])
      .filter(Boolean);
  };

  for (const s of list) {
    const n = status[s.id];
    // 보호자는 학생 한 명당 한 분입니다 (06_changes.sql 유니크 인덱스)
    const parent = (links ?? []).find((l) => l.student_id === s.id) ?? null;
    const card = el('div', 'rcard' +
      (state.selected.has(s.id) ? ' sel' : '') + (state.archived ? ' arch' : ''));

    // ---- 체크박스 + 이름 + 상태 ----
    const head = el('div', 'rhead');

    const pick = el('label', 'rpick');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = state.selected.has(s.id);
    cb.onchange = () => {
      cb.checked ? state.selected.add(s.id) : state.selected.delete(s.id);
      card.classList.toggle('sel', cb.checked);
      updateSelCount();
    };
    pick.append(cb);
    head.append(pick);

    head.append(el('span', 'rname', s.grade ? `${s.name} · ${s.grade}` : s.name));

    if (!state.archived) {
      const pb = el('span', 'badge' + (parent && parent.has_push ? ' ok' : ' bad'));
      pb.textContent = !parent
        ? '보호자 미연결'
        : `${parent.parent_name} · ${parent.has_push ? '알림 켜짐' : '알림 꺼짐'}`;
      head.append(pb);

      if (n) {
        const sbg = el('span', 'badge' + (n.student_devices > 0 ? ' ok' : ''));
        sbg.textContent = !n.student_claimed
          ? '학생 미연결'
          : (n.student_devices > 0 ? '학생 알림 켜짐' : '학생 알림 꺼짐');
        head.append(sbg);
      }
    } else {
      head.append(el('span', 'badge', '명단에서 제거됨'));
    }
    card.append(head);

    if (state.archived) { box.append(card); continue; }

    // ---- 식별번호 · 로그인 계정 ----
    // 로그인 아이디는 식별번호에서 바로 나옵니다(184046-s / 184046-p).
    // 임시 비밀번호는 발급할 때만 보이고 저장하지 않습니다.
    const a = acct[s.id] ?? {};
    const codes = el('div', 'rcodes');

    const idLine = el('div', 'codeline');
    idLine.append(el('span', 'muted small', '식별번호'));
    idLine.append(el('span', 'code' + (s.external_id ? '' : ' used'),
                     s.external_id || '없음'));
    codes.append(idLine);

    if (s.external_id) {
      const mk = (label, loginId, has) => {
        const w = el('div', 'codeline');
        w.append(el('span', 'muted small', label));
        w.append(el('span', 'rext', loginId));
        w.append(el('span', 'badge' + (has ? ' ok' : ' bad'), has ? '발급됨' : '미발급'));
        return w;
      };
      codes.append(mk('학생', `${s.external_id}-s`, a.has_student_account));
      codes.append(mk('보호자', `${s.external_id}-p`, a.has_parent_account));

      // 형제자매와 보호자 계정을 합친 경우, 실제로 쓰는 아이디는 형·누나 것입니다.
      // 이 학생의 -p 로 계정을 다시 발급하면 합쳐 둔 연결이 끊깁니다.
      const sibs = siblingsOf(s.id);
      if (sibs.length) {
        const w = el('div', 'codeline');
        w.append(el('span', 'muted small', '보호자 공유'));
        w.append(el('span', 'rext', sibs.join(', ') + ' 와 같은 계정'));
        codes.append(w);
      }

      const issue = el('button', 'ghost tiny',
        (a.has_student_account && a.has_parent_account) ? '비밀번호 재발급' : '계정 발급');
      issue.onclick = () => issueAccounts([s.id],
        a.has_student_account && a.has_parent_account, s.name);
      codes.append(issue);
    } else {
      codes.append(el('span', 'muted small', '식별번호를 넣어야 계정을 만들 수 있습니다'));
    }

    card.append(codes);

    // ---- 스테이지 · 하루 목표 ----
    // 스테이지가 하루 목표(25/50/75/100)를 그대로 정합니다.
    // 그날 사정이 다르면 리포트 입력창에서 할당 문제 수만 바꾸면 됩니다.
    const goals = el('div', 'rgoals');
    goals.append(el('span', 'lbl', '스테이지'));

    const sel = el('select', 'sel tiny');
    for (let i = 1; i <= 4; i++) {
      const o = el('option', null, `${i} · 하루 ${i * 25}문제`);
      o.value = String(i);
      if ((s.stage ?? 1) === i) o.selected = true;
      sel.append(o);
    }
    sel.onchange = () => applyStage([s.id], Number(sel.value), s.name);
    goals.append(sel);

    const daily = s.daily_goal_problems ?? (s.stage ?? 1) * 25;
    const note = el('span', 'goalNote');
    note.innerHTML = `하루 목표 <b>${daily}문제</b> · 의무 ${s.mandatory_minutes ?? 60}분`;
    goals.append(note);

    // ---- 담임 ----
    if (state.hasHomeroom) {
      goals.append(el('span', 'spacer'));
      goals.append(el('span', 'lbl', '담임'));
      const hs = el('select', 'sel tiny');
      const none = el('option', null, '미지정'); none.value = '';
      hs.append(none);
      for (const tch of state.staff) {
        const o = el('option', null, tch.name + (tch.id === state.me.id ? ' (나)' : ''));
        o.value = tch.id;
        hs.append(o);
      }
      hs.value = s.homeroom_id ?? '';
      hs.onchange = () => applyHomeroom([s.id], hs.value || null, s.name);
      goals.append(hs);
    }
    card.append(goals);

    // ---- 연결된 보호자 (한 명) ----
    if (parent) {
      const pw = el('div', 'rparents');
      pw.append(el('span', 'muted small', '연결된 보호자'));
      const plist = el('div', 'plist');
      const tag = el('span', 'ptag' + (parent.has_push ? '' : ' off'));
      tag.append(el('span', null, parent.parent_name));
      tag.append(el('span', 'muted small', parent.has_push ? '알림 켜짐' : '알림 꺼짐'));
      const rb = el('button', 'linkbtn', '해지');
      rb.onclick = () => revokeParent(s, parent);
      tag.append(rb);
      plist.append(tag);
      pw.append(plist);
      card.append(pw);
    }

    box.append(card);
  }

  updateSelCount();
}

async function loadArchived() {
  const { data, error } = await sb.from('students')
    .select('*').eq('active', false).order('name');
  if (error) { fail(error); return []; }
  state.archivedCache = data ?? [];
  return state.archivedCache;
}

function updateSelCount() {
  const n = state.selected.size;
  $('#selCount').textContent = n ? `${n}명 선택됨` : '';
  $('#removeSel').disabled = n === 0;
  $('#bulkStage').disabled = n === 0 || state.archived;
  $('#bulkHome').disabled = n === 0 || state.archived;
  $('#issueSel').disabled = n === 0 || state.archived;
  const all = $('#selAll');
  const total = ($('#rosterList').querySelectorAll('.rcard') || []).length;
  all.checked = total > 0 && n === total;
}

$('#selAll').onchange = () => {
  const on = $('#selAll').checked;
  state.selected = new Set();
  if (on) {
    const src = filterRoster(state.archived ? state.archivedCache ?? [] : state.students);
    for (const s of src) state.selected.add(s.id);
  }
  renderRoster().catch(fail);
};

let searchTimer;
$('#rosterSearch').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.rosterQ = $('#rosterSearch').value; renderRoster().catch(fail); }, 200);
});
$('#rosterHome').onchange = () => {
  state.rosterHome = $('#rosterHome').value;
  state.selected.clear();
  renderRoster().catch(fail);
};

async function applyHomeroom(ids, teacherId, who) {
  if (!ids.length) return;
  const label = teacherId ? `담임 ${staffName(teacherId)}` : '담임 미지정';
  if (ids.length > 1 && !confirm(`선택한 ${ids.length}명을 ${label}(으)로 바꿀까요?`)) { await renderRoster(); return; }
  const { data, error } = await sb.rpc('set_homeroom', { p_students: ids, p_teacher: teacherId });
  if (error) { fail(error); await renderRoster(); return; }
  await loadStudents();
  await loadStaff();
  await renderRoster();
  toast(who ? `${who} 학생 · ${label}` : `${data}명을 ${label}(으)로 바꿨습니다`);
}

$('#bulkHome').onchange = async () => {
  const sel = $('#bulkHome');
  const v = sel.value;
  const ids = [...state.selected];
  sel.value = '';
  if (v && ids.length) await applyHomeroom(ids, v === 'none' ? null : v);
};

/* ------------------------------------------------------------------ */
/* 계정 발급                                                            */
/*                                                                     */
/* 임시 비밀번호는 발급 응답에만 담겨 옵니다. DB 에 평문으로 남기지 않으므로 */
/* 이 화면을 닫으면 다시 볼 수 없습니다 - 그래서 복사/내려받기를 크게 뒀습니다. */
/* ------------------------------------------------------------------ */
let acctRows = [];

async function issueAccounts(ids, reset, who) {
  if (!ids.length) return;
  const label = reset ? '비밀번호를 재발급' : '계정을 발급';
  if (!confirm(
    (who ? `${who} 학생의 ` : `선택한 ${ids.length}명의 `) + `${label}할까요?\n\n` +
    (reset
      ? '이전 임시 비밀번호는 즉시 못 쓰게 됩니다. 이미 본인이 바꾼 비밀번호도 초기화됩니다.'
      : '학생·보호자 계정이 각각 만들어지고 임시 비밀번호가 한 번만 표시됩니다.')
  )) return;

  const btn = $('#issueSel');
  if (btn) { btn.disabled = true; btn.textContent = '발급 중...'; }

  try {
    const { data, error } = await sb.functions.invoke('provision', {
      body: { action: reset ? 'reset' : 'create', student_ids: ids, who: 'both' },
    });
    if (error) throw error;

    acctRows = (data.rows ?? []).filter((r) => r.student_password || r.parent_password);
    renderAcctTable(data);
    $('#acctModal').hidden = false;
    $('#acctScrim').hidden = false;

    await loadStudents();
    await renderRoster();
  } catch (e) {
    fail(e);
  } finally {
    if (btn) { btn.textContent = '선택 학생 계정 발급'; }
    updateSelCount();
  }
}

function renderAcctTable(data) {
  const t = $('#acctTable');
  t.replaceChildren();

  const head = document.createElement('tr');
  ['이름', '식별번호', '학생 아이디', '학생 임시비번', '보호자 아이디', '보호자 임시비번']
    .forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      head.append(th);
    });
  t.append(head);

  for (const r of data.rows ?? []) {
    const tr = document.createElement('tr');
    const cell = (v, cls) => {
      const td = document.createElement('td');
      if (cls && v) { const sp = el('span', cls, v); td.append(sp); }
      else td.append(document.createTextNode(v ?? '—'));
      if (!v) td.className = 'dim';
      return td;
    };
    tr.append(
      cell(r.name),
      cell(r.external_id, 'mono'),
      cell(r.student_login, 'mono'),
      cell(r.student_password, 'pw'),
      cell(r.parent_login, 'mono'),
      cell(r.parent_password, 'pw'),
    );
    t.append(tr);
  }

  const box = $('#acctProblems');
  if (data.problems?.length) {
    box.innerHTML = '<b>처리하지 못한 건</b><ul>' +
      data.problems.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    box.hidden = false;
  } else {
    box.hidden = true;
  }
}

// 시트·코다에 그대로 붙여넣을 수 있게 탭으로 구분합니다
function acctTSV() {
  const head = ['이름', '식별번호', '학생 아이디', '학생 임시비번', '보호자 아이디', '보호자 임시비번'];
  const lines = [head.join('\t')];
  for (const r of acctRows) {
    lines.push([r.name, r.external_id, r.student_login ?? '', r.student_password ?? '',
                r.parent_login ?? '', r.parent_password ?? ''].join('\t'));
  }
  return lines.join('\n');
}

$('#acctCopy').onclick = async () => {
  const btn = $('#acctCopy');
  try {
    await navigator.clipboard.writeText(acctTSV());
    btn.textContent = '복사했습니다 — 시트에 붙여넣으세요';
    setTimeout(() => { btn.textContent = '시트에 붙여넣기용 복사'; }, 2600);
  } catch {
    // 클립보드가 막힌 환경에서는 직접 선택할 수 있게 보여줍니다
    prompt('아래 내용을 복사해 시트에 붙여넣으세요', acctTSV());
  }
};

$('#acctCsv').onclick = () => {
  const csv = '\ufeff' + acctTSV().split('\n')
    .map((line) => line.split('\t').map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  const d = new Date();
  a.href = url;
  a.download = `수학지옥pt_계정_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function closeAcct() {
  $('#acctModal').hidden = true;
  $('#acctScrim').hidden = true;
  acctRows = [];
}
$('#acctClose').onclick = closeAcct;
$('#acctDone').onclick = closeAcct;
$('#acctScrim').onclick = closeAcct;

$('#issueSel').onclick = () => {
  const ids = [...state.selected];
  const allHave = ids.every((id) => {
    const s = state.students.find((x) => x.id === id);
    return s && s.profile_id;
  });
  issueAccounts(ids, allHave);
};

// 스테이지를 바꾸면 하루 목표와 리포트 할당 기본값이 함께 갱신됩니다.
async function applyStage(ids, stage, who) {
  if (!ids.length || !stage) return;
  const label = `스테이지 ${stage} (하루 ${stage * 25}문제)`;
  if (!confirm(
    (who ? `${who} 학생을 ` : `선택한 ${ids.length}명을 `) + `${label} 로 바꿀까요?\n\n` +
    `리포트 입력창의 할당 기본값이 함께 바뀝니다. 그날 사정이 다르면 리포트에서 고치면 됩니다.`
  )) { await renderRoster(); return; }

  const { data, error } = await sb.rpc('set_student_stage', {
    p_students: ids, p_stage: stage,
  });
  if (error) { fail(error); await renderRoster(); return; }

  await loadStudents();
  await renderRoster();
  toast(`${data}명을 ${label} 로 변경했습니다`);
}

$('#bulkStage').onchange = async () => {
  const sel = $('#bulkStage');
  const stage = Number(sel.value);
  const ids = [...state.selected];
  sel.value = '';
  if (stage && ids.length) await applyStage(ids, stage);
};

$('#archToggle').onclick = () => {
  state.archived = !state.archived;
  state.selected.clear();
  renderRoster().catch(fail);
};

// 명단 제거는 되돌릴 수 있게 보관 처리(active=false)로 합니다.
// 수업 기록을 함께 지우는 건 되돌릴 수 없으니 보관 화면에서만 하도록 했습니다.
$('#removeSel').onclick = async () => {
  const ids = [...state.selected];
  if (!ids.length) return;

  if (state.archived) {
    if (!confirm(`${ids.length}명을 명단으로 복원할까요?`)) return;
    const { error } = await sb.from('students').update({ active: true }).in('id', ids);
    if (error) return fail(error);
    toast(`${ids.length}명을 복원했습니다`);
  } else {
    if (!confirm(
      `${ids.length}명을 명단에서 제거할까요?\n\n` +
      `수업 시작 목록에서 사라집니다. 지금까지의 수업 기록과 보호자 연결은 ` +
      `그대로 보관되고, "제거된 학생 보기"에서 되돌릴 수 있습니다.`
    )) return;
    const { error } = await sb.from('students').update({ active: false }).in('id', ids);
    if (error) return fail(error);
    toast(`${ids.length}명을 명단에서 제거했습니다`);
  }

  state.selected.clear();
  await loadStudents();
  await renderRoster();
};

/* ------------------------------------------------------------------ */
/* CSV 일괄 등록                                                        */
/* ------------------------------------------------------------------ */

// 따옴표와 줄바꿈이 든 필드까지 처리하는 최소 CSV 파서
function parseCSV(text) {
  text = text.replace(/^﻿/, '');            // 엑셀이 붙이는 BOM 제거
  const rows = [];
  let row = [], cell = '', quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; }
    else if (c === ',' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

// 엑셀(윈도우)이 저장한 CSV 는 대개 euc-kr 이라 UTF-8 로 읽으면 글자가 깨집니다.
async function decodeCSVFile(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try { return new TextDecoder('euc-kr').decode(buf); }
    catch { return new TextDecoder('utf-8').decode(buf); }
  }
}

$('#csvTemplate').onclick = () => {
  // BOM 을 붙여야 엑셀에서 열 때 한글이 깨지지 않습니다
  const csv = '﻿이름,학년,학교\n김민준,고2,온라인\n이서연,고1,\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = '수학지옥pt_학생명단_양식.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

$('#csvImport').onclick = async () => {
  const btn = $('#csvImport');
  const out = $('#csvResult');
  out.hidden = true;

  let text = $('#csvPaste').value.trim();
  const file = $('#csvFile').files?.[0];
  if (!text && file) text = await decodeCSVFile(file);

  if (!text) {
    out.className = 'notice err';
    out.textContent = 'CSV 내용을 붙여넣거나 파일을 선택하세요.';
    out.hidden = false;
    return;
  }

  const rows = parseCSV(text);
  if (!rows.length) {
    out.className = 'notice err';
    out.textContent = '읽을 수 있는 줄이 없습니다.';
    out.hidden = false;
    return;
  }

  // 머리글 판별. 식별번호로 시작하는 새 서식과, 이름으로 시작하는 옛 서식을 모두 받습니다.
  const first = (rows[0][0] ?? '').trim();
  const isIdHeader = /^(식별번호|학생식별번호|id|번호)$/i.test(first);
  const isNameHeader = /^(이름|성명|name)$/i.test(first);
  const hasHeader = isIdHeader || isNameHeader;
  const body = hasHeader ? rows.slice(1) : rows;

  // 첫 칸이 숫자면 식별번호가 있는 서식으로 봅니다
  const withId = isIdHeader ||
    (!hasHeader && body.length > 0 && /^\d{3,}$/.test((body[0][0] ?? '').trim()));

  const existingName = new Set(state.students.map((s) => s.name));
  const existingExt = new Set(state.students.map((s) => s.external_id).filter(Boolean));
  const seen = new Set();
  const toAdd = [];
  const skipped = [];
  const bad = [];

  body.forEach((r, i) => {
    const ext    = withId ? (r[0] ?? '').trim() : '';
    const name   = (r[withId ? 1 : 0] ?? '').trim();
    const grade  = (r[withId ? 2 : 1] ?? '').trim();
    const school = (r[withId ? 3 : 2] ?? '').trim();
    const lineNo = hasHeader ? i + 2 : i + 1;

    if (!name) { bad.push(`${lineNo}번째 줄: 이름이 비어 있음`); return; }
    if (name.length > 20) { bad.push(`${lineNo}번째 줄: 이름이 너무 깁니다 (${name.slice(0, 10)}…)`); return; }
    if (withId && !ext) { bad.push(`${lineNo}번째 줄: 식별번호가 비어 있음 (${name})`); return; }
    if (ext && (existingExt.has(ext) || seen.has(ext))) { skipped.push(`${name}(${ext})`); return; }
    if (!ext && (existingName.has(name) || seen.has(name))) { skipped.push(name); return; }

    seen.add(ext || name);
    toAdd.push({
      org_id: state.me.org_id,
      external_id: ext || null,
      name,
      grade: grade || null,
      school: school || null,
    });
  });

  if (!toAdd.length) {
    out.className = 'notice err';
    out.innerHTML = '<b>새로 추가할 학생이 없습니다</b>' +
      (skipped.length ? `<br>이미 있는 이름 ${skipped.length}명: ${esc(skipped.join(', '))}` : '') +
      (bad.length ? '<ul>' + bad.map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>' : '');
    out.hidden = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = '등록 중...';
  const { error } = await sb.from('students').insert(toAdd);
  btn.disabled = false;
  btn.textContent = '불러오기';

  if (error) {
    out.className = 'notice err';
    out.innerHTML = `<b>등록 실패</b><br>${esc(error.message)}` +
      (error.code ? ` <code>${esc(error.code)}</code>` : '');
    out.hidden = false;
    return;
  }

  out.className = 'notice';
  out.innerHTML = `<b>${toAdd.length}명을 등록했습니다</b>` +
    (skipped.length ? `<br>이미 있어서 건너뛴 이름 ${skipped.length}명: ${esc(skipped.join(', '))}` : '') +
    (bad.length ? '<br>건너뛴 줄:<ul>' + bad.map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>' : '');
  out.hidden = false;

  $('#csvPaste').value = '';
  $('#csvFile').value = '';
  await loadStudents();
  await renderRoster();
};

// 보호자용 코드 재발급. 이미 연결된 보호자는 그대로 유지됩니다.
async function rotateLink(student) {
  if (!confirm(
    `${student.name} 학생의 보호자용 코드를 새로 발급할까요?\n\n` +
    `기존 코드는 즉시 무효가 됩니다. 이미 연결된 보호자는 그대로 유지됩니다.`
  )) return;

  const { data, error } = await sb.rpc('rotate_link_code', { p_student: student.id });
  if (error) return fail(error);
  await loadStudents();
  await renderRoster();
  toast(`새 보호자 코드: ${data}`);
}

// 학생 연결 해지 + 새 학생용 코드. 수업 기록은 남습니다.
async function resetClaim(student) {
  const connected = !student.claim_code;
  if (!confirm(
    connected
      ? `${student.name} 학생의 계정 연결을 해지할까요?\n\n` +
        `새 학생용 코드가 발급됩니다. 지금까지의 수업 기록은 그대로 남습니다.`
      : `${student.name} 학생의 학생용 코드를 새로 발급할까요?\n\n기존 코드는 무효가 됩니다.`
  )) return;

  const { data, error } = await sb.rpc('reset_student_claim', { p_student: student.id });
  if (error) return fail(error);
  await loadStudents();
  await renderRoster();
  toast(`새 학생 코드: ${data}`);
}

// 학부모 연결 해지. 같은 코드를 다시 넣으면 재연결되므로,
// 완전히 차단하려면 보호자용 코드도 재발급해야 합니다.
async function revokeParent(student, link) {
  if (!confirm(
    `${link.parent_name} 님의 ${student.name} 학생 연결을 해지할까요?\n\n` +
    `해지 후에는 기록을 볼 수 없고 알림도 가지 않습니다.\n` +
    `단, 같은 코드를 다시 입력하면 재연결됩니다. 완전히 차단하려면 ` +
    `보호자용 코드도 재발급하세요.`
  )) return;

  const { error } = await sb.from('parent_links')
    .update({ status: 'revoked' }).eq('id', link.link_id);
  if (error) return fail(error);
  await renderRoster();
  toast(`${link.parent_name} 님의 연결을 해지했습니다`);
}

/* ------------------------------------------------------------------ */
/* 보낸 리포트                                                          */
/*                                                                     */
/* 수업을 마치며 보낸 데일리 리포트를 기간 · 학생별로 다시 봅니다.          */
/* 리포트 숫자는 session_reports, 보호자에게 갔는지는 notifications        */
/* (session_summary 는 보호자에게만 갑니다).                               */
/* ------------------------------------------------------------------ */
const NOTI_STATUS = {
  sent: ['발송됨', 'ok'], failed: ['발송 실패', 'bad'], skipped: ['기기 없음', 'warn'], queued: ['보내는 중', ''],
};
const WEEKDAY = '일월화수목금토';

async function loadSent() {
  const days = Number($('#sentRange').value);
  let since = null;
  if (days === 1) { const d = new Date(); d.setHours(0, 0, 0, 0); since = d.toISOString(); }
  else if (days) since = daysAgo(days);

  $('#sentScope').hidden = !state.hasHomeroom;
  paintScope();
  const statBox = $('#sentStats');
  statBox.replaceChildren(el('p', 'muted small', '불러오는 중…'));

  let qs = sb.from('session_summaries')
    .select('session_id, student_id, student_name, student_grade, title, started_at, ended_at, teacher_id')
    .eq('status', 'ended').order('ended_at', { ascending: false }).limit(1000);
  let qr = sb.from('session_reports')
    .select('session_id, assigned, solved, correct, stay_minutes, memo, teacher_id');
  let qn = sb.from('notifications')
    .select('session_id, status, title, body, created_at')
    .eq('org_id', state.me.org_id).eq('kind', 'session_summary');
  if (since) { qs = qs.gte('ended_at', since); qr = qr.gte('created_at', since); qn = qn.gte('created_at', since); }
  const [{ data: ss, error: e1 }, { data: rs, error: e2 }, { data: ns, error: e3 }] = await Promise.all([qs, qr, qn]);
  if (e1 || e2 || e3) throw (e1 || e2 || e3);

  const reportOf = Object.fromEntries((rs ?? []).map((r) => [r.session_id, r]));
  // 보호자가 둘 이상이면 한 명이라도 받았으면 '발송됨'
  const notiOf = {};
  for (const n of ns ?? []) {
    const cur = notiOf[n.session_id];
    const rank = { sent: 3, queued: 2, failed: 1, skipped: 0 };
    if (!cur || rank[n.status] > rank[cur.status]) notiOf[n.session_id] = n;
  }

  const q = $('#sentSearch').value.trim().toLowerCase();
  const withNoReport = $('#sentNoReport').checked;
  const rows = (ss ?? []).filter((s) => inScope(s.student_id)
    && (!q || (s.student_name ?? '').toLowerCase().includes(q))
    && (withNoReport || reportOf[s.session_id]));

  const reps = rows.map((s) => reportOf[s.session_id]).filter(Boolean);
  const solved = reps.reduce((a, r) => a + r.solved, 0);
  const correct = reps.reduce((a, r) => a + r.correct, 0);
  const notified = rows.filter((s) => reportOf[s.session_id] && notiOf[s.session_id]);
  const reached = notified.filter((s) => notiOf[s.session_id].status === 'sent').length;
  const stat = (label, value, cls) => {
    const d = el('div', 'stat' + (cls ? ' ' + cls : ''));
    d.append(el('span', null, label), el('b', null, value));
    return d;
  };
  statBox.replaceChildren(
    stat('보낸 리포트', `${reps.length.toLocaleString()}건`, null),
    stat('학생', `${new Set(rows.filter((s) => reportOf[s.session_id]).map((s) => s.student_id)).size}명`, null),
    stat('평균 정답률', solved ? `${Math.round(correct * 100 / solved)}%` : '—', null),
    stat('보호자에게 도착', notified.length ? `${reached}/${notified.length}건` : '—',
      notified.length && reached < notified.length ? 'warn' : 'ok'),
  );

  const tb = $('#sentTable');
  tb.replaceChildren();
  $('#sentEmpty').hidden = rows.length > 0;
  if (!rows.length) return;

  const head = document.createElement('tr');
  [['날짜'], ['학생'], ['할당', 'num'], ['푼 문제', 'num'], ['맞은 문제', 'num'], ['정답률', 'num'], ['체류', 'num'],
    ['메모'], ['보낸 선생님'], ['보호자 알림'], ['']].forEach(([h, cls]) => {
    const th = document.createElement('th'); th.textContent = h; if (cls) th.className = cls; head.append(th);
  });
  tb.append(head);

  const td = (v, cls) => { const c = document.createElement('td'); c.textContent = v ?? '—'; if (cls) c.className = cls; return c; };
  for (const s of rows) {
    const r = reportOf[s.session_id];
    const n = notiOf[s.session_id];
    const d = new Date(s.ended_at ?? s.started_at);
    const tr = document.createElement('tr');
    if (!r) tr.className = 'noReport';
    tr.append(
      td(`${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY[d.getDay()]}) ${hhmm(d)}`, 'dim'),
      td(s.student_grade ? `${s.student_name} · ${s.student_grade}` : s.student_name),
      td(r ? r.assigned : null, 'num'),
      td(r ? r.solved : null, 'num'),
      td(r ? r.correct : null, 'num'),
      td(r ? (r.solved ? `${Math.round(r.correct * 100 / r.solved)}%` : '0%') : null, 'num'),
      td(r ? `${r.stay_minutes}분` : null, 'num'),
      td(r ? (r.memo || '') : '리포트 없이 종료', 'memo'),
      td(staffName(r?.teacher_id ?? s.teacher_id) || null, 'dim'),
    );
    const nc = document.createElement('td');
    if (n) {
      const [label, cls] = NOTI_STATUS[n.status] ?? [n.status, ''];
      const b = el('span', 'badge' + (cls ? ' ' + cls : ''), label);
      b.title = `${n.title}\n${n.body}`;   // 보호자가 받은 문구
      nc.append(b);
    } else nc.textContent = '—';
    tr.append(nc);
    const bc = document.createElement('td');
    if (r) {
      const rb = el('button', 'ghost tiny', '리포트');
      rb.onclick = () => openParentReport(s, n).catch(fail);
      bc.append(rb, document.createTextNode(' '));
    }
    const b = el('button', 'ghost tiny', '기록');
    b.onclick = () => openSummary(s).catch(fail);
    bc.append(b);
    tr.append(bc);
    tb.append(tr);
  }
}
/* ---- 리포트 보기: 학부모 앱 화면 그대로 ----
   카드는 학부모 앱(app/app.js)의 reportCard 를 그대로 옮긴 것이고,
   모양은 학부모 앱 사이트의 styles.css 를 그대로 불러 iframe 안에 그립니다.
   학부모 앱의 reportCard 를 고치면 아래 parentReportCard 도 같이 고칩니다. */
const PARENT_APP = window.PARENT_APP_URL || 'https://lambent-truffle-e3280c.netlify.app';

function parentReportCard(r, sum) {
  const card = el('div', 'report');
  const pin  = (n) => Math.max(0, Math.min(100, n));

  const head = el('div', 'repHead');
  const who = el('div', 'who');
  who.append(el('strong', null,
    `${r.student_name}${r.student_grade ? ' · ' + r.student_grade : ''} 수학`));
  const d = new Date(r.started_at);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  who.append(el('span', null,
    `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]}) 지옥방`));
  head.append(who);

  const tier = Math.max(1, Math.min(4, Number(r.stage) || 1));
  const stage = el('div', 'stage s' + tier);
  const gauge = el('div', 'gauge');
  gauge.setAttribute('aria-hidden', 'true');
  const bars = el('span', 'gBars');
  for (let i = 1; i <= 4; i++) bars.append(el('i', i <= tier ? 'on' : null));
  gauge.append(el('span', 'gLab', 'STAGE'), el('span', 'gNum', String(tier)), bars);
  stage.append(el('em', 'srOnly', `스테이지 ${r.stage}`),
               gauge,
               el('span', null, `하루 ${r.daily_goal_problems}문제`));
  head.append(stage);
  card.append(head);

  const body = el('div', 'repBody');

  const metric = (label, valueEl, pct, color, o = {}) => {
    const m = el('div', 'metric');
    const top = el('div', 'metricTop');
    top.append(el('span', 'lbl', label), valueEl);
    m.append(top);
    const track = el('div', 'track');
    const fill = el('div', 'fill ' + color);
    fill.style.width = pin(pct) + '%';
    track.append(fill);
    if (o.goal != null && o.goal > 2 && o.goal < 98) {
      const g = el('div', 'goal');
      g.style.left = pin(o.goal) + '%';
      g.title = '목표';
      track.append(g);
    }
    m.append(track);
    if (o.tag) {
      const note = el('div', 'metricNote ' + (o.cls || ''));
      note.append(el('span', 'tag', o.tag));
      if (o.note) note.append(el('span', 'noteText', o.note));
      m.append(note);
    }
    return m;
  };
  const val = (strong, rest) => {
    const v = el('span', 'val');
    const b = el('b', null, strong);
    if (/[가-힣]/.test(String(strong))) b.className = 'txt';
    v.append(b);
    if (rest) v.append(el('span', null, rest));
    return v;
  };
  const ramp = (pct) => pct >= 100 ? 'jade' : pct >= 85 ? 'gold' : pct >= 70 ? 'flame' : 'fire';
  const rampCls = (pct) => pct >= 100 ? 'ok' : pct >= 85 ? 'warn' : pct >= 70 ? 'mid' : 'bad';

  const over = r.completion >= 120;
  body.append(metric('문제 수', val(String(r.solved), ` / ${r.assigned}`),
    r.completion,
    ramp(r.completion) + (over ? ' over' : ''),
    { tag: over ? '초과' : (r.completion >= 100 ? '달성' : '미달'),
      cls: rampCls(r.completion),
      note: r.completion >= 100 ? `할당의 ${r.completion}%` : `${r.assigned - r.solved}문제 남음` }));

  const accOk  = r.accuracy >= r.target_accuracy;
  const accGap = r.target_accuracy - r.accuracy;
  const accRel = r.target_accuracy > 0 ? r.accuracy * 100 / r.target_accuracy : 100;
  body.append(metric('정답률', val(`${r.accuracy}%`, ` / 목표 ${r.target_accuracy}%`),
    r.accuracy,
    ramp(accRel),
    { goal: r.target_accuracy,
      tag: accOk ? '달성' : '미달',
      cls: rampCls(accRel),
      note: accOk ? `목표보다 ${r.accuracy - r.target_accuracy}%p 위` : `목표까지 ${accGap}%p` }));

  const h = Math.floor(r.stay_minutes / 60), mm = r.stay_minutes % 60;
  const mH = Math.floor(r.mandatory_minutes / 60);
  const mM = r.mandatory_minutes % 60;
  const stayPct = r.stay_minutes * 100 / r.mandatory_minutes;
  body.append(metric('지옥방 체류',
    val(h > 0 ? `${h}h ${mm}m` : `${mm}m`,
        ` / 의무 ${mH > 0 ? mH + 'h' : ''}${mM ? ' ' + mM + 'm' : ''}`.trimEnd()),
    stayPct,
    r.stay_ok ? 'jade' : ramp(stayPct),
    { tag: r.stay_ok ? '충족' : '미달',
      cls: r.stay_ok ? 'ok' : rampCls(stayPct),
      note: r.stay_ok ? '의무 시간 채움' : `의무까지 ${r.mandatory_minutes - r.stay_minutes}분` }));

  const pc = r.grade_percentile;
  body.append(metric('학습량 순위', val(`상위 ${pc}%`),
    100 - pc,
    pc <= 10 ? 'jade' : pc <= 30 ? 'gold' : pc <= 60 ? 'flame' : 'fire',
    { tag: pc <= 10 ? '최상위' : pc <= 30 ? '상위' : pc <= 60 ? '중위' : '하위',
      cls: pc <= 10 ? 'ok' : pc <= 30 ? 'warn' : pc <= 60 ? 'mid' : 'bad',
      note: `같은 학년 기준` }));

  if (sum) {
    const neg = sum.negative_count ?? 0;
    const w = el('div', 'repWarn ' + (neg >= 3 ? 'bad' : neg > 0 ? 'mid' : 'ok'));
    const wt = el('div', 'repWarnTop');
    wt.append(el('span', 'lbl', '수업 중 경고'),
              el('b', null, neg > 0 ? `${neg}회` : '없음'));
    w.append(wt);
    if (neg > 0) {
      const parts = [];
      if (sum.drowsy_count)     parts.push(`졸음 ${sum.drowsy_count}`);
      if (sum.distracted_count) parts.push(`딴짓 ${sum.distracted_count}`);
      if (sum.away_count)       parts.push(`자리 이탈 ${sum.away_count}`);
      w.append(el('p', null, parts.join(' · ') +
        (neg >= 3 ? ' · 한 수업 3회 이상은 보호자 즉시 알림 기준입니다' : '')));
    } else {
      w.append(el('p', null, '졸음 · 딴짓 · 자리 이탈 기록 없이 수업을 마쳤습니다'));
    }
    body.append(w);
  }

  const split = el('div', 'repSplit');
  const a = el('div', 'repBox a');
  a.append(el('span', null, '누적 문제'));
  const ab = el('b', null, r.cumulative_problems.toLocaleString('ko-KR'));
  ab.append(el('small', null, `+${r.solved}`));
  a.append(ab);
  const b = el('div', 'repBox b');
  b.append(el('span', null, '1만 문제까지'));
  const bb = el('b', null, r.to_ten_thousand.toLocaleString('ko-KR'));
  bb.append(el('small', null, '문제'));
  b.append(bb);
  split.append(a, b);
  body.append(split);

  const tenk = el('div', 'tenk');
  const tt = el('div', 'tenkTop');
  tt.append(el('span', null, '1만 문제 진행'),
            el('b', null, `${Math.floor(pin(r.cumulative_problems / 100))}%`));
  const tTrack = el('div', 'track thin');
  const tFill = el('div', 'fill fire');
  tFill.style.width = pin(r.cumulative_problems / 100) + '%';
  tTrack.append(tFill);
  tenk.append(tt, tTrack);
  body.append(tenk);

  if (r.memo) {
    const memo = el('div', 'repMemo');
    memo.append(el('span', null, '선생님 메모'), document.createTextNode(r.memo));
    body.append(memo);
  }

  const v = el('div', 'repVerdict ' + (r.participation_ok ? 'ok' : 'bad'));
  v.append(el('span', 'vMark', r.participation_ok ? '통과' : '미달'));
  const vt = el('div', 'vText');
  vt.append(el('strong', null, r.participation_ok ? '정상 참여' : '참여 미달'),
            el('span', null,
               `할당 ${r.completion}% · ${r.stay_ok ? '의무 시간 충족' : '의무 시간 미달'}`));
  v.append(vt);
  body.append(v);

  card.append(body);
  return card;
}

async function openParentReport(s, noti) {
  const [{ data: rep, error: e1 }, { data: sum, error: e2 }] = await Promise.all([
    sb.from('daily_reports').select('*').eq('session_id', s.session_id).maybeSingle(),
    sb.from('session_summaries').select('*').eq('session_id', s.session_id).maybeSingle(),
  ]);
  if (e1 || e2) throw (e1 || e2);
  if (!rep) return toast('이 수업은 리포트 없이 종료됐습니다');

  const d = new Date(s.ended_at ?? s.started_at);
  $('#pvTitle').textContent = `${s.student_name} · ${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY[d.getDay()]}) 리포트`;
  const push = $('#pvPush');
  push.hidden = !noti;
  if (noti) push.textContent = `보호자 알림 (${(NOTI_STATUS[noti.status] ?? [noti.status])[0]}): ${noti.title} — ${noti.body}`;

  const frame = $('#pvFrame');
  frame.style.height = '480px';
  frame.srcdoc = '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.css">' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600;700&display=swap">' +
    `<link rel="stylesheet" href="${PARENT_APP}/styles.css">` +
    '<style>body::before,body::after{display:none!important}html,body{min-width:0!important}body{margin:0;padding:14px}</style>' +
    '</head><body>' + parentReportCard(rep, sum).outerHTML + '</body></html>';
  // 글꼴 · 스타일이 다 들어온 뒤 높이를 내용에 맞춥니다
  frame.onload = () => {
    const fit = () => { try { frame.style.height = frame.contentDocument.documentElement.scrollHeight + 'px'; } catch { /* 무시 */ } };
    fit(); setTimeout(fit, 400); setTimeout(fit, 1200);
  };
  $('#pvModal').hidden = false;
  $('#pvScrim').hidden = false;
}
function closeParentReport() { $('#pvModal').hidden = true; $('#pvScrim').hidden = true; }
$('#pvClose').onclick = closeParentReport;
$('#pvScrim').onclick = closeParentReport;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#pvModal').hidden) closeParentReport(); });

$('#sentRange').onchange = () => loadSent().catch(fail);
$('#sentNoReport').onchange = () => loadSent().catch(fail);
$('#sentReload').onclick = () => loadSent().catch(fail);
{
  let t;
  $('#sentSearch').oninput = () => { clearTimeout(t); t = setTimeout(() => loadSent().catch(fail), 250); };
}

/* ------------------------------------------------------------------ */
/* 알림 현황                                                            */
/*                                                                     */
/* 알림이 안 간 걸 학부모 문의로 먼저 알게 되면 늦습니다. 최근 7일 동안      */
/* 못 보낸 알림과, 애초에 알림을 받을 수 없는 학생을 한 화면에 모읍니다.     */
/* ------------------------------------------------------------------ */
const KIND = {
  student_instant: '학생 즉시 알림', parent_instant: '보호자 집중 이탈',
  session_summary: '수업 종료 리포트', session_start: '수업 시작', weekly_report: '주간 리포트',
};
const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString();

async function countNotif(status, since) {
  const { count, error } = await sb.from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', state.me.org_id).eq('status', status).gte('created_at', since);
  if (error) throw error;
  return count ?? 0;
}

// 홈 위쪽 경고 + 메뉴 빨간 점: 최근 24시간에 못 보낸 알림이 있으면
async function checkHealthBadge() {
  const since = daysAgo(1);
  const [failed, skipped] = await Promise.all([countNotif('failed', since), countNotif('skipped', since)]);
  const n = failed + skipped;
  $('#healthDot').hidden = n === 0;
  const w = $('#healthWarn');
  if (!n) { w.hidden = true; return; }
  w.replaceChildren();
  w.append(el('b', null, `최근 24시간 동안 못 보낸 알림 ${n}건`),
           document.createTextNode(failed ? ` (발송 실패 ${failed} · 기기 없음 ${skipped}) ` : ' (받을 기기 없음) '));
  const b = el('button', 'ghost tiny', '알림 현황 보기');
  b.onclick = () => go('health');
  w.append(b);
  w.hidden = false;
}

async function loadHealth() {
  const since = daysAgo(7);
  const statBox = $('#healthStats');
  statBox.replaceChildren(el('p', 'muted small', '불러오는 중…'));

  const [sent, failed, skipped] = await Promise.all(
    ['sent', 'failed', 'skipped'].map((s) => countNotif(s, since)));
  const total = sent + failed + skipped;
  const stat = (label, value, cls) => {
    const d = el('div', 'stat' + (cls ? ' ' + cls : ''));
    d.append(el('span', null, label), el('b', null, value));
    return d;
  };
  statBox.replaceChildren(
    stat('보낸 알림', `${sent.toLocaleString()}건`, 'ok'),
    stat('못 받음 (기기 없음)', `${skipped.toLocaleString()}건`, skipped ? 'warn' : null),
    stat('발송 실패', `${failed.toLocaleString()}건`, failed ? 'bad' : null),
    stat('도달률', total ? `${Math.round(sent * 100 / total)}%` : '—', null),
  );

  // ---- 연결 점검: 애초에 알림을 받을 수 없는 학생 ----
  const [{ data: ns, error: e1 }, { data: links, error: e2 }] = await Promise.all([
    sb.from('student_notify_status').select('*'),
    sb.from('parent_link_status').select('*').eq('status', 'approved'),
  ]);
  if (e1 || e2) return fail(e1 || e2);
  const parentOf = Object.fromEntries((links ?? []).map((l) => [l.student_id, l]));
  const rows = (ns ?? []).filter((r) => inScope(r.student_id)).map((r) => {
    const st = state.students.find((s) => s.id === r.student_id);
    const p = parentOf[r.student_id];
    const f = {
      noParent: !Number(r.parents_linked),
      parentOff: Number(r.parents_linked) > 0 && !Number(r.parents_subscribed),
      noStudent: !r.student_claimed,
      studentOff: r.student_claimed && !Number(r.student_devices),
    };
    const issues = [];
    if (f.noParent) issues.push(['보호자 미연결', 'bad']);
    if (f.parentOff) issues.push([`${p?.parent_name ?? '보호자'} 알림 꺼짐`, 'bad']);
    if (f.noStudent) issues.push(['학생 계정 없음', '']);
    if (f.studentOff) issues.push(['학생 알림 꺼짐', '']);
    return { r, st, f, issues };
  });
  const bad = rows.filter((x) => x.issues.length);
  const cnt = (k) => rows.filter((x) => x.f[k]).length;
  $('#linkScope').textContent = state.scope === 'mine' ? '· 내 학생' : '· 전체 학생';
  $('#linkStats').replaceChildren(
    stat('점검 대상', `${rows.length}명`, null),
    stat('보호자 미연결', `${cnt('noParent')}명`, cnt('noParent') ? 'bad' : 'ok'),
    stat('보호자 알림 꺼짐', `${cnt('parentOff')}명`, cnt('parentOff') ? 'bad' : 'ok'),
    stat('학생 알림 꺼짐', `${cnt('studentOff')}명`, cnt('studentOff') ? 'warn' : 'ok'),
  );
  const box = $('#linkList');
  box.replaceChildren();
  if (!bad.length) box.append(el('p', 'empty', '모든 학생과 보호자가 알림을 받을 수 있습니다.'));
  for (const { r, st, issues } of bad) {
    const row = el('div', 'item wrap');
    row.append(el('span', 'grow', `${r.student_name}${st?.grade ? ' · ' + st.grade : ''}` +
      (state.hasHomeroom && st?.homeroom_id ? `  ·  담임 ${staffName(st.homeroom_id)}` : '')));
    for (const [txt, cls] of issues) row.append(el('span', 'badge' + (cls ? ' ' + cls : ''), txt));
    box.append(row);
  }

  // ---- 최근 못 보낸 알림 ----
  const { data: fails, error: e3 } = await sb.from('notifications')
    .select('created_at, kind, status, error, student_id, recipient:recipient_id(name, login_id, role), student:student_id(name)')
    .eq('org_id', state.me.org_id).in('status', ['failed', 'skipped'])
    .gte('created_at', since).order('created_at', { ascending: false }).limit(100);
  if (e3) return fail(e3);
  const list = (fails ?? []).filter((n) => !n.student_id || inScope(n.student_id));
  const tb = $('#failTable');
  tb.replaceChildren();
  $('#failEmpty').hidden = list.length > 0;
  if (!list.length) return;
  const head = document.createElement('tr');
  ['시각', '학생', '받는 사람', '종류', '결과', '사유'].forEach((h) => { const th = document.createElement('th'); th.textContent = h; head.append(th); });
  tb.append(head);
  for (const n of list) {
    const tr = document.createElement('tr');
    const td = (v, cls) => { const c = document.createElement('td'); c.textContent = v ?? '—'; if (cls) c.className = cls; return c; };
    const d = new Date(n.created_at);
    tr.append(
      td(`${d.getMonth() + 1}/${d.getDate()} ${hhmm(n.created_at)}`, 'dim'),
      td(n.student?.name),
      td(n.recipient ? `${n.recipient.name}${n.recipient.login_id ? ' (' + n.recipient.login_id + ')' : ''}` : null),
      td(KIND[n.kind] ?? n.kind),
      td(n.status === 'failed' ? '발송 실패' : '기기 없음'),
      td(n.status === 'skipped' ? '알림을 켠 기기가 없습니다' : n.error, 'dim'),
    );
    tb.append(tr);
  }
}
$('#healthReload').onclick = () => loadHealth().catch(fail);

/* ------------------------------------------------------------------ */
/* 선생님 관리 (관리자)                                                  */
/* ------------------------------------------------------------------ */
let tRows = [];
// Edge Function 이 4xx 로 답하면 본문은 error.context(Response) 에서 꺼내야 합니다
async function fnError(data, error) {
  if (data?.error) return data.error;
  if (!error) return null;
  try { const b = await error.context?.json?.(); if (b?.error) return b.error; } catch { /* 본문 없음 */ }
  return error.message ?? String(error);
}
function showTeacherPw(title, t) {
  tRows = [t];
  $('#tModalTitle').textContent = title;
  const tb = $('#tTable');
  tb.replaceChildren();
  const head = document.createElement('tr');
  ['이름', '로그인 이메일', '권한', '임시 비밀번호'].forEach((h) => { const th = document.createElement('th'); th.textContent = h; head.append(th); });
  const tr = document.createElement('tr');
  const td = (v, cls) => { const c = document.createElement('td'); if (cls) c.append(el('span', cls, v)); else c.textContent = v; return c; };
  tr.append(td(t.name), td(t.email ?? '—', 'mono'), td(t.role === 'admin' ? '관리자' : '선생님'), td(t.password, 'pw'));
  tb.append(head, tr);
  $('#tModal').hidden = false; $('#tScrim').hidden = false;
}
function closeT() { $('#tModal').hidden = true; $('#tScrim').hidden = true; tRows = []; }
$('#tClose').onclick = closeT; $('#tDone').onclick = closeT; $('#tScrim').onclick = closeT;
$('#tCopy').onclick = async () => {
  const t = tRows[0]; if (!t) return;
  const text = `수학지옥pt 선생님 콘솔\n주소: ${location.origin}\n이메일: ${t.email}\n임시 비밀번호: ${t.password}\n(첫 로그인 때 비밀번호를 바꿉니다)`;
  try { await navigator.clipboard.writeText(text); toast('복사했습니다'); } catch { prompt('복사해서 전달하세요', text); }
};

async function renderStaff() {
  await loadStaff();
  const box = $('#staffList');
  box.replaceChildren();
  if (!state.hasHomeroom) {
    return box.append(el('p', 'empty', '서버에 18_scale.sql 을 먼저 적용해야 선생님 관리를 쓸 수 있습니다.'));
  }
  for (const t of state.staff) {
    const row = el('div', 'item staffRow');
    const g = el('span', 'grow');
    g.append(el('b', null, t.name + (t.id === state.me.id ? ' (나)' : '')));
    if (t.email) g.append(el('span', 'rext', t.email));
    row.append(g);
    row.append(el('span', 'badge' + (t.role === 'admin' ? '' : ' ok'), t.role === 'admin' ? '관리자' : '선생님'));
    if (t.must_change_password) row.append(el('span', 'badge', '첫 로그인 전'));
    row.append(el('span', 'muted small', `담당 ${t.student_count ?? 0}명`));
    if (t.id !== state.me.id) {
      const rb = el('button', 'ghost tiny', '비밀번호 재발급');
      rb.onclick = async () => {
        if (!confirm(`${t.name} 선생님의 비밀번호를 재발급할까요?\n\n지금 비밀번호는 바로 못 쓰게 되고, 첫 로그인 때 다시 바꾸게 됩니다.`)) return;
        const { data, error } = await sb.functions.invoke('provision', { body: { action: 'reset_teacher', teacher_id: t.id } });
        const msg = await fnError(data, error);
        if (msg) return toast('재발급 실패: ' + msg);
        showTeacherPw('비밀번호 재발급', data.teacher);
        renderStaff().catch(fail);
      };
      row.append(rb);
    }
    box.append(row);
  }
}

$('#addTeacherForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const body = { action: 'create_teacher', name: $('#tName').value.trim(), email: $('#tEmail').value.trim(), role: $('#tRole').value };
  const btn = ev.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const { data, error } = await sb.functions.invoke('provision', { body });
    const msg = await fnError(data, error);
    if (msg) return toast('만들지 못했습니다: ' + msg);
    ev.target.reset();
    showTeacherPw('선생님 계정을 만들었습니다', data.teacher);
    await renderStaff();
  } finally { btn.disabled = false; }
});

/* ------------------------------------------------------------------ */
/* 주간 리포트 (금)                                                      */
/*                                                                     */
/* 학생마다 카드가 있고, 기록으로 정할 수 있는 건 미리 눌러져 있습니다.     */
/* 다른 것만 바꾸고 제출하면 전원 리포트가 만들어지고(아직 안 보임),        */
/* '앱으로 보내기'를 눌러야 학생 · 보호자 앱에 도착하고 랭킹에 들어갑니다.   */
/* 카드 · 계산은 shared/weekly.js — 학생 앱과 같은 코드라 화면이 똑같습니다. */
/* ------------------------------------------------------------------ */
const wkS = { ws: WK.weekStartOf(), list: [], wr: {} };

$('#wkPrev').onclick = () => { wkS.ws = WK.addDays(wkS.ws, -7); loadWeeklyPage().catch(fail); };
$('#wkNext').onclick = () => { wkS.ws = WK.addDays(wkS.ws, 7); loadWeeklyPage().catch(fail); };

async function loadWeeklyPage() {
  const ws = wkS.ws, thisWs = WK.weekStartOf();
  $('#wkTitle').textContent = ws === thisWs ? '이번 주 주간 리포트' : `${WK.weekLabel(ws)} 주간 리포트`;
  $('#wkRange').textContent = WK.weekRange(ws);
  $('#wkNext').disabled = ws >= thisWs;
  $('#wkGallery').replaceChildren();
  const studs = state.students.filter((s) => inScope(s.id));
  const ids = studs.map((s) => s.id);
  if (!ids.length) { $('#wkCards').innerHTML = '<p class="empty">학생이 없습니다.</p>'; return; }
  const from = WK.parseDay(WK.addDays(ws, -7)).toISOString(), to = WK.parseDay(WK.addDays(ws, 7)).toISOString();
  const [reps, sums, sched, wrs] = await Promise.all([
    sb.from('daily_reports').select('*').in('student_id', ids).gte('started_at', from).lt('started_at', to),
    sb.from('session_summaries').select('session_id, student_id, negative_count').in('student_id', ids).gte('started_at', from).lt('started_at', to),
    sb.from('student_schedule').select('*').in('student_id', ids),
    sb.from('weekly_reports').select('*').in('student_id', ids).lte('week_start', ws).order('week_start', { ascending: false }),
  ]);
  for (const r of [reps, sums, sched, wrs]) if (r.error) throw r.error;
  const by = (rows, id) => (rows.data ?? []).filter((x) => x.student_id === id);
  wkS.wr = {};
  wkS.list = studs.map((st) => {
    const mine = by(wrs, st.id);
    const wr = mine.find((w) => w.week_start === ws) ?? null;
    wkS.wr[st.id] = wr;
    const s = WK.assembleWeek({
      student: st, schedule: by(sched, st.id), reps: by(reps, st.id), sums: by(sums, st.id), wr,
      prevWr: mine.find((w) => w.week_start === WK.addDays(ws, -7)) ?? null,
      scores: mine.filter((w) => w.week_start < ws && w.sent_at && w.test_score != null).map((w) => w.test_score),
      ws, teacher: wr?.teacher_name || state.me.name,
    });
    s.test.correct = wr?.test_correct ?? null;
    s.learnTxt = s.learn.join(', ');
    s.nextTxt = s.nextL.join(', ');
    return s;
  });
  drawWeeklyCards();
}

const opts = (obj, cur) => Object.keys(obj).map((k) => `<option ${k === cur ? 'selected' : ''}>${esc(k)}</option>`).join('');
function stuCard(s, i) {
  const w = WK.wkSum(s.jb), b = WK.bar3(s), u = WK.ups(s), has = s.score !== '';
  const sent = wkS.wr[s.id]?.sent_at;
  const correctSel = `<select class="sel" data-i="${i}" data-f="correct" title="맞은 문항 수"><option value="">맞은 문항</option>${Array.from({ length: s.test.total + 1 }, (_, n) => `<option value="${n}" ${s.test.correct === n ? 'selected' : ''}>${n}개</option>`).join('')}</select>`;
  return `<div class="cs ${sent ? 'sent' : ''}">
    <div class="cs-h"><div class="row" style="justify-content:space-between"><div><b>${esc(s.n)}</b> <span class="muted small">${esc(s.gr)} · STAGE ${s.st}</span></div>${sent ? `<span class="pill p-mint">앱으로 보냄 ${new Date(sent).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>` : wkS.wr[s.id]?.id && wkS.wr[s.id]?.updated_at > wkS.wr[s.id]?.created_at ? '<span class="pill p-gray">저장됨 · 안 보냄</span>' : ''}</div>
      <div class="auto">지옥방 <b>${w.came}/${s.jb.length}</b> · 순공 <b>${WK.hm(w.min) || '0분'}</b> · 문제 <b>${w.sol}</b>/${w.goal} · 정답률 <b>${w.acc}%</b> · 딴짓 <b>${w.warn}회</b></div></div>
    <div class="cs-bd ${b.all ? 'ok' : ''}">${b.all ? '🏅 주간 기준 4/4 통과 → 보내면 학생 앱에 다음 주 황금 오라' : `주간 기준 ${b.pass}/4 · 못 넘은 것: ${b.items.filter((x) => !x.ok).map((x) => x.t).join(', ')}`}</div>
    <div class="cs-up">${u.length ? `🎉 지난주보다 좋아진 점 (자동): ${u.slice(0, 4).map((x) => `${x.t} ${x.v}`).join(' · ')}` : s.prev ? '지난주보다 좋아진 점 없음 → 리포트 맨 위에 주간 기준 칸이 먼저 나와요' : '지난주 기록이 없어 비교하지 않아요'}</div>
    <div class="cs-r"><span class="cl">형성평가</span><input class="sc" data-i="${i}" data-f="total" value="${s.test.total}" inputmode="numeric" title="문항 수" style="width:52px"><span class="muted small">문항 중</span>${correctSel}<span class="muted small">또는</span><input class="sc" data-i="${i}" data-f="score" value="${s.score}" placeholder="—" inputmode="numeric"><span class="muted small">점 · 지난번 ${s.test.prev ?? '–'}</span></div>
    <div class="cs-r"><span class="cl">범위</span><input class="tx" data-i="${i}" data-f="range" value="${esc(s.test.range)}" placeholder="예: 공통수학1 · 다항식의 연산"></div>
    ${has ? '' : `<div class="cs-r alt"><span class="cl">대신 넣을 말</span><select class="sel" data-i="${i}" data-f="point">${opts(WK.POINT, s.point)}</select><span class="hint">점수가 없으면 형성평가 칸 대신 이 말이 들어가요 (응시 여부는 안 나와요)</span></div>`}
    ${WK.EVAL.map((e) => `<div class="cs-r"><span class="cl">${e.t}${WK.AUTOK.includes(e.k) ? '<em>기록 반영</em>' : ''}</span><div class="seg3">${[3, 2, 1].map((v) => `<button class="l${v} ${s.ev[e.k] === v ? 'on' : ''}" data-i="${i}" data-e="${e.k}" data-v="${v}">${WK.LV[v]}</button>`).join('')}</div></div>`).join('')}
    <div class="cs-r"><span class="cl">한마디</span><select class="sel" data-i="${i}" data-f="good">${opts(WK.GOOD, s.good)}</select><select class="sel" data-i="${i}" data-f="more">${opts(WK.MORE, s.more)}</select></div>
    <div class="cs-r"><span class="cl">배운 단원</span><input class="tx" data-i="${i}" data-f="learnTxt" value="${esc(s.learnTxt)}" placeholder="쉼표로 나눠 적기"></div>
    <div class="cs-r"><span class="cl">다음 주 진도</span><input class="tx" data-i="${i}" data-f="nextTxt" value="${esc(s.nextTxt)}" placeholder="쉼표로 나눠 적기"></div>
    <div class="cs-r"><span class="cl">다음 주</span><div class="stg">${[s.st - 1, s.st, s.st + 1].filter((v) => v >= 1 && v <= 4).map((v) => `<button class="${v === s.next ? 'on' : ''} ${v > s.st && s.up ? 'up' : ''}" data-i="${i}" data-n="${v}">${v > s.st ? '↑ ' : v < s.st ? '↓ ' : ''}STAGE ${v}${v > s.st && s.up ? ' 추천' : ''}</button>`).join('')}</div></div>
  </div>`;
}
function drawWeeklyCards() {
  const box = $('#wkCards');
  box.innerHTML = wkS.list.map(stuCard).join('');
  $('#wkSubmit').textContent = `제출하고 ${wkS.list.length}명 주간 리포트 만들기`;
  const redraw = () => { const y = window.scrollY; drawWeeklyCards(); window.scrollTo(0, y); };
  $$('.sc', box).forEach((inp) => inp.onchange = () => {
    const s = wkS.list[inp.dataset.i], v = inp.value.replace(/\D/g, '');
    if (inp.dataset.f === 'total') { s.test.total = Math.max(1, Math.min(100, +v || 20)); if (s.test.correct != null) s.score = String(Math.round(s.test.correct / s.test.total * 100)); }
    else { s.score = v === '' ? '' : String(Math.min(100, +v)); s.test.correct = v === '' ? null : Math.round(+s.score * s.test.total / 100); s.test.score = s.score === '' ? null : +s.score; }
    if (s.score === '' || s.score == null) s.test.score = null;
    s.ev.under = WK.autoEval(s.jb, s.score === '' ? null : +s.score).under;
    redraw();
  });
  $$('select.sel', box).forEach((e) => e.onchange = () => {
    const s = wkS.list[e.dataset.i];
    if (e.dataset.f === 'correct') {
      s.test.correct = e.value === '' ? null : +e.value;
      s.score = e.value === '' ? '' : String(Math.round(+e.value / s.test.total * 100));
      s.test.score = s.score === '' ? null : +s.score;
      s.ev.under = WK.autoEval(s.jb, s.test.score).under;
      redraw();
    } else s[e.dataset.f] = e.value;
  });
  $$('input.tx', box).forEach((e) => e.oninput = () => {
    const s = wkS.list[e.dataset.i];
    if (e.dataset.f === 'range') s.test.range = e.value; else s[e.dataset.f] = e.value;
  });
  $$('.seg3 button', box).forEach((b) => b.onclick = () => {
    wkS.list[b.dataset.i].ev[b.dataset.e] = +b.dataset.v;
    b.parentNode.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  });
  $$('.stg button', box).forEach((b) => b.onclick = () => {
    wkS.list[b.dataset.i].next = +b.dataset.n;
    b.parentNode.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  });
}

// 시트에서 복사한 점수 붙여넣기: "이름<탭>점수" 줄마다, 또는 점수만 화면 순서대로
$('#wkPaste').onclick = () => {
  const old = $('#wkPasteBox');
  if (old) { old.remove(); return; }
  const box = el('div', 'pasteBox'); box.id = 'wkPasteBox';
  box.innerHTML = `<p class="muted small">시트에서 <b>이름 · 점수</b> 두 열을 복사해 붙여 넣거나, 점수 열만 화면 순서대로 붙여 넣으세요. 빈칸은 '대신 넣을 말'이 들어가요.</p>
    <textarea id="wkPasteTx" rows="6" placeholder="김민서	88&#10;이준호	76"></textarea>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:8px"><button class="ghost tiny" id="wkPasteNo">닫기</button><button class="primary" id="wkPasteGo">넣기</button></div>`;
  $('#wkCards').before(box);
  $('#wkPasteNo').onclick = () => box.remove();
  $('#wkPasteGo').onclick = () => {
    const lines = $('#wkPasteTx').value.split(/\r?\n/).map((l) => l.split('\t').map((x) => x.trim()));
    const named = lines.some((c) => c.length > 1 && /[가-힣]/.test(c[0]));
    let n = 0;
    const put = (s, v) => { v = String(v ?? '').replace(/\D/g, ''); s.score = v === '' ? '' : String(Math.min(100, +v)); s.test.score = s.score === '' ? null : +s.score; s.test.correct = s.score === '' ? null : Math.round(+s.score * s.test.total / 100); s.ev.under = WK.autoEval(s.jb, s.test.score).under; n++; };
    if (named) for (const [nm, v] of lines) { const s = wkS.list.find((x) => x.n === nm); if (s) put(s, v); }
    else lines.forEach(([v], i) => { if (wkS.list[i]) put(wkS.list[i], v); });
    box.remove(); drawWeeklyCards();
    toast(`${n}명 점수를 넣었습니다 · 빈칸인 학생은 '대신 넣을 말'이 들어가요`);
  };
};

// 제출: 전원 저장(아직 앱에는 안 보임) → 미리보기 모음
$('#wkSubmit').onclick = async () => {
  const btn = $('#wkSubmit'); btn.disabled = true;
  try {
    const rows = wkS.list.map((s) => ({
      org_id: state.me.org_id, student_id: s.id, week_start: s.ws, teacher_id: state.me.id, teacher_name: state.me.name,
      test_total: s.test.total, test_correct: s.score === '' ? null : s.test.correct, test_score: s.score === '' ? null : +s.score,
      test_range: s.test.range || null, point_key: s.point, ev: s.ev, good_key: s.good, more_key: s.more,
      learn: s.learnTxt.split(',').map((x) => x.trim()).filter(Boolean), next_learn: s.nextTxt.split(',').map((x) => x.trim()).filter(Boolean),
      next_stage: s.next, gold: WK.bar3(s).all, updated_at: new Date().toISOString(),
    }));
    const { data, error } = await sb.from('weekly_reports').upsert(rows, { onConflict: 'student_id,week_start' }).select('*');
    if (error) throw error;
    for (const w of data ?? []) wkS.wr[w.student_id] = w;
    wkS.list.forEach((s) => { s.learn = rows.find((r) => r.student_id === s.id).learn; s.nextL = rows.find((r) => r.student_id === s.id).next_learn; s.gold = WK.bar3(s).all; });
    drawGallery();
  } catch (e) { fail(e); } finally { btn.disabled = false; }
};

const wkFile = (s) => `${s.n}_주간레포트.png`;
function drawGallery() {
  const g = $('#wkGallery');
  const unsent = wkS.list.filter((s) => !wkS.wr[s.id]?.sent_at);
  g.innerHTML = `<div class="gal-h"><div><b style="font-size:18px;font-weight:900">주간 리포트 ${wkS.list.length}장이 만들어졌어요</b><div class="muted small">보호자에게 가는 화면 그대로입니다. '앱으로 보내기'를 누르면 학생 · 보호자 앱에 도착하고, 형성평가 점수가 랭킹에 바로 들어가요.</div></div>
    <div class="row"><button class="btn sm ghost press" id="sendApp" style="width:auto;padding:0 16px" ${unsent.length ? '' : 'disabled'}>${unsent.length ? `앱으로 보내기 (${unsent.length}명)` : '모두 보냈어요'}</button><button class="btn sm press" id="zipAll" style="width:auto;padding:0 18px">⬇ 전체 저장 (zip)</button></div></div>
    <div class="gal">${wkS.list.map((s, i) => `<div class="gi"><div class="gthumb"><div class="gscale">${WK.weeklyCard({ ...s, sent: wkS.wr[s.id]?.sent_at })}</div></div><div class="gname">${esc(wkFile(s))}</div><button class="btn sm ghost press one" data-i="${i}">이 장만 저장</button></div>`).join('')}</div>`;
  g.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#sendApp').onclick = sendWeekly;
  $('#zipAll').onclick = saveWeeklyZip;
  $$('.one', g).forEach((b) => b.onclick = () => saveWeeklyOne(wkS.list[b.dataset.i]));
}
async function sendWeekly() {
  const unsent = wkS.list.filter((s) => !wkS.wr[s.id]?.sent_at);
  if (!unsent.length) return;
  if (!confirm(`${unsent.length}명에게 주간 리포트를 보낼까요?\n학생 · 보호자 앱에 도착하고, 형성평가 점수가 랭킹에 바로 들어갑니다.`)) return;
  const btn = $('#sendApp'); btn.disabled = true; btn.textContent = '보내는 중…';
  try {
    const { data, error } = await sb.functions.invoke('notify', { body: { action: 'weekly_report', week_start: wkS.ws, student_ids: unsent.map((s) => s.id) } });
    if (error) throw error;
    toast(`${data.count}명에게 보냈습니다 · 형성평가 점수는 랭킹에 바로 반영됐어요`);
    await loadWeeklyPage(); drawGallery();
  } catch (e) { fail(e); btn.disabled = false; }
}
async function weeklyPng(s) {
  const host = document.createElement('div');
  host.className = 'jp2';
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:640px;background:#FFF7F0';
  host.innerHTML = WK.weeklyCard({ ...s, sent: wkS.wr[s.id]?.sent_at }, { img: true });
  document.body.appendChild(host);
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all([...host.querySelectorAll('img')].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
  const cv = await html2canvas(host.firstElementChild, { scale: 2, backgroundColor: '#FFF7F0', useCORS: true });
  host.remove();
  return new Promise((r) => cv.toBlob(r, 'image/png'));
}
function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
async function saveWeeklyOne(s) {
  if (typeof html2canvas === 'undefined') return toast('이미지 도구를 불러오지 못했어요 (인터넷 연결 확인)');
  toast(`${wkFile(s)} 만드는 중…`);
  downloadBlob(await weeklyPng(s), wkFile(s));
}
async function saveWeeklyZip() {
  if (typeof html2canvas === 'undefined' || typeof JSZip === 'undefined') return toast('이미지 도구를 불러오지 못했어요 (인터넷 연결 확인)');
  const zip = new JSZip(), btn = $('#zipAll');
  for (let i = 0; i < wkS.list.length; i++) { btn.textContent = `만드는 중 ${i + 1}/${wkS.list.length}`; zip.file(wkFile(wkS.list[i]), await weeklyPng(wkS.list[i])); }
  const head = ['이름', '학년', '스테이지', '형성평가', '맞은 문항', '대신 넣은 말', ...WK.EVAL.map((e) => e.t), '잘한 점', '보완할 점', '다음 주 스테이지', '지옥방', '순공(분)', '푼 문제', '할당', '정답률', '주간 기준', '앱으로 보냄'];
  const rows = wkS.list.map((s) => { const w = WK.wkSum(s.jb); return [s.n, s.gr, s.st, s.score, s.test.correct ?? '', s.score === '' ? s.point : '', ...WK.EVAL.map((e) => WK.LV[s.ev[e.k]]), s.good, s.more, s.next, `${w.came}/${s.jb.length}`, w.min, w.sol, w.goal, w.acc + '%', `${WK.bar3(s).pass}/4`, wkS.wr[s.id]?.sent_at ? '보냄' : '']; });
  zip.file('주간레포트_결과표.csv', '﻿' + [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n'));
  downloadBlob(await zip.generateAsync({ type: 'blob' }), `주간레포트_${WK.weekLabel(wkS.ws).replace(/\s/g, '')}.zip`);
  btn.textContent = '⬇ 전체 저장 (zip)';
  toast(`이미지 ${wkS.list.length}장 + 결과표를 zip 하나로 저장했어요`);
}

/* ------------------------------------------------------------------ */
/* 설문 현황                                                            */
/*   보내기는 서버가 정해진 때에 자동(pg_cron → notify), 답이 없으면 다음 날  */
/*   한 번 더. 선생님은 빨간 칸(살펴볼 답)을 눌러 보고 확인 메모를 남깁니다.  */
/* ------------------------------------------------------------------ */
let svRows = [];
async function loadSurveyPage() {
  const studs = state.students.filter((s) => inScope(s.id));
  const ids = studs.map((s) => s.id);
  const { data, error } = ids.length ? await sb.from('surveys').select('*').in('student_id', ids) : { data: [] };
  if (error) throw error;
  svRows = data ?? [];
  const keys = SV_COLS;
  const cell = (st, col) => {
    const c = svRows.find((x) => x.student_id === st.id && x.kind === col.kind && x.target === col.target);
    const d = (ts) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric' });
    if (!c) return `<span class="svc plan">${col.kind === 'class' ? '시간표 없음' : '–'}</span>`;
    if (c.answered_at && c.flags?.length) return `<button class="svc flag press" data-id="${c.id}">⚠ ${esc(c.flags[0])}${c.flags.length > 1 ? ` 외 ${c.flags.length - 1}` : ''}</button>`;
    if (c.answered_at) return `<button class="svc ok press" data-id="${c.id}">응답 ✓</button>`;
    if (c.sent_at) return `<span class="svc wait">${d(c.sent_at)} 보냄${c.reminded_at ? ' · 다시 알림 1번' : ''}</span>`;
    return `<span class="svc plan">${d(c.due_at)} 예정</span>`;
  };
  const memoOf = (st) => svRows.find((x) => x.student_id === st.id && x.memo)?.memo ?? '';
  const waiting = svRows.filter((x) => x.sent_at && !x.answered_at);
  const flags = svRows.filter((x) => x.flags?.length);
  $('#svFlagN').textContent = `살펴볼 답 ${flags.length}건`;
  $('#svWaitN').textContent = `미응답 ${waiting.length}건`;
  $('#svRe').textContent = `미응답 ${waiting.length}건 다시 알림`;
  $('#svRe').disabled = !waiting.length;
  $('#svSch').innerHTML = keys.map((k) => `<div><div class="row" style="justify-content:space-between"><b>${k.t}</b><span class="tg">자동</span></div><div class="muted small" style="margin-top:4px">${k.who} 앱 · ${k.when}</div><div class="muted small">${SV[k.kind].items.length}문항 · 안 하면 다음 날 한 번 더 알림</div></div>`).join('');
  $('#svTable').innerHTML = `<thead><tr><th>학생</th>${keys.map((k) => `<th>${k.t}</th>`).join('')}<th>확인 메모</th></tr></thead><tbody>${studs.map((st) => `<tr><td><b>${esc(st.name)}</b><div class="muted small">${esc(st.grade || '')}</div></td>${keys.map((k) => `<td>${cell(st, k)}</td>`).join('')}<td><input class="memo" data-st="${st.id}" value="${esc(memoOf(st))}" placeholder="예: 10/24 통화 완료"></td></tr>`).join('')}</tbody>`;
  $$('#svTable .svc[data-id]').forEach((b) => b.onclick = () => showSurveyAnswer(b.dataset.id));
  $$('#svTable .memo').forEach((inp) => inp.onchange = async () => {
    const { error: e } = await sb.from('surveys').update({ memo: inp.value.trim() || null }).eq('student_id', inp.dataset.st);
    if (e) fail(e); else { toast('확인 메모를 저장했습니다'); checkSurveyDot(); }
  });
}
function showSurveyAnswer(id) {
  const c = svRows.find((x) => x.id === id), st = state.students.find((s) => s.id === c.student_id), f = SV[c.kind];
  $('#svDetail').innerHTML = `<div class="svd"><div class="row" style="justify-content:space-between"><b style="font-size:16px;font-weight:900">${esc(st?.name)} · ${f.t}${c.target === 'parent' ? ' (보호자)' : ''}</b>${c.flags?.length ? `<span class="pill p-pink">⚠ ${c.flags.map(esc).join(' · ')}</span>` : '<span class="pill p-mint">응답 ✓</span>'}</div>
    ${f.items.map((it) => `<div class="svq"><span>${esc(it.title)}</span><b>${esc(c.answers?.[it.k]?.v ?? '—')}</b></div>`).join('')}
    <div class="muted small" style="margin-top:8px">${new Date(c.answered_at).toLocaleString('ko-KR')} 응답 · 확인하면 '확인 메모'에 남겨 두세요.</div></div>`;
  $('#svDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
$('#svRe').onclick = async () => {
  const ids = svRows.filter((x) => x.sent_at && !x.answered_at).map((x) => x.id);
  if (!ids.length || !confirm(`미응답 ${ids.length}건에 다시 알림을 보낼까요?`)) return;
  try {
    const { data, error } = await sb.functions.invoke('notify', { body: { action: 'survey_remind', survey_ids: ids } });
    if (error) throw error;
    toast(`다시 알림 ${data.count}건 · 기기에 도착 ${data.sent}건 (알림을 안 켠 사람은 앱을 열면 보여요)`);
    loadSurveyPage().catch(fail);
  } catch (e) { fail(e); }
};
$('#svCsv').onclick = () => {
  const studs = state.students.filter((s) => inScope(s.id));
  const lab = (c) => (!c ? '' : c.answered_at ? '응답' : c.sent_at ? '미응답' : '예정');
  const head = ['학생', ...SV_COLS.map((k) => k.t), '살펴볼 답', '확인 메모'];
  const rows = studs.map((st) => {
    const mine = svRows.filter((x) => x.student_id === st.id);
    return [st.name, ...SV_COLS.map((k) => lab(mine.find((x) => x.kind === k.kind && x.target === k.target))),
      mine.flatMap((x) => (x.flags ?? []).map((f) => `${SV[x.kind].t}: ${f}`)).join(' / '), mine.find((x) => x.memo)?.memo ?? ''];
  });
  downloadBlob(new Blob(['﻿' + [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')], { type: 'text/csv' }), '설문_응답현황.csv');
};
// 메뉴의 빨간 점: 살펴볼 답이 있는데 확인 메모가 없는 설문
async function checkSurveyDot() {
  const { count } = await sb.from('surveys').select('id', { count: 'exact', head: true }).neq('flags', '{}').is('memo', null);
  $('#svDot').hidden = !count;
}

/* ------------------------------------------------------------------ */
/* 네비게이션                                                           */
/* ------------------------------------------------------------------ */
function go(to) {
  if (to === 'roster')      { show('roster'); renderRoster().catch(fail); }
  else if (to === 'home')   { show('home'); loadMonitor().catch(fail); checkHealthBadge().catch(() => {}); }
  else if (to === 'health') { show('health'); loadHealth().catch(fail); }
  else if (to === 'sent')   { show('sent'); loadSent().catch(fail); }
  else if (to === 'weekly') { show('weekly'); paintScope(); loadWeeklyPage().catch(fail); }
  else if (to === 'survey') { show('survey'); paintScope(); loadSurveyPage().catch(fail); }
  else if (to === 'staff')  { if (state.me?.role !== 'admin') return; show('staff'); renderStaff().catch(fail); }
  else                      { show(to); }
}
$$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
