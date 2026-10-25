import { notificationChanged, studyDayScore } from './rules.js?v=ranking4';
// 수학지옥pt 학생·보호자 앱 (개편판)
//
// 로그인 · 알림 · 화면 이동 · 자녀 추가는 운영 앱과 같은 코드입니다.
// 바뀐 것: 밝은 화면 · 탭바(학생) · 닉네임 뽑기 · 리그 · 꾸미기 · 주간 리포트 · 앱 안 설문,
//          리포트가 오는 순간 점수 · 순위 축하 화면.
//
// import 를 정적으로 쓰면 CDN 을 못 받았을 때 모듈 전체가 실행되지 않아
// 설정 안내조차 뜨지 않고 죽은 화면만 남습니다. 그래서 검사를 먼저 하고
// 라이브러리는 동적으로 불러옵니다.
const CONFIGURED = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i
  .test((window.SUPABASE_URL || '').trim().replace(/\/$/, ''))
  && /^(ey[A-Za-z0-9._-]{20,}|sb_publishable_[A-Za-z0-9._-]{10,})$/
       .test((window.SUPABASE_ANON_KEY || '').trim());

if (!CONFIGURED) {
  document.body.innerHTML =
    '<div style="max-width:480px;margin:14vh auto;padding:0 22px;font:15px/1.7 sans-serif">' +
    '<h2>설정이 필요합니다</h2><p><code>config.js</code> 에 Supabase 주소와 공개 키를 채워 주세요.</p></div>';
  throw new Error('config.js 가 설정되지 않았습니다');
}

let createClient;
try {
  ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm'));
} catch (e) {
  document.body.innerHTML =
    '<div style="max-width:480px;margin:14vh auto;padding:0 22px;font:15px/1.7 sans-serif">' +
    '<h2>연결에 필요한 파일을 받지 못했습니다</h2>' +
    '<p>인터넷 연결을 확인해 주세요. 회사나 학교 네트워크가 <code>cdn.jsdelivr.net</code> 을 막고 있으면 이 화면이 뜹니다.</p></div>';
  throw e;
}

import { CHARS, ITEMS, EFFECTS, isOpen, progress, pib } from './look.js?v=ranking4';
import * as WK from './weekly.js?v=ranking4';
import { SV, SV_COLS } from './survey.js?v=ranking4';
import { checkinPrompt, mountCheckin } from './checkin.js?v=ranking4';

/* ---- 자동 로그인 (운영 앱과 같음) ---- */
const AUTO_KEY = 'jp.autoLogin';
const SAVED_ID_KEY = 'jp.savedLogin';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 사생활 보호 모드 등 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
};
const autoLogin = () => store.get(AUTO_KEY) !== '0';
const authStorage = {
  getItem(k) { try { return (autoLogin() ? localStorage : sessionStorage).getItem(k); } catch { return null; } },
  setItem(k, v) { try { (autoLogin() ? localStorage : sessionStorage).setItem(k, v); } catch { /* 무시 */ } },
  removeItem(k) {
    try { localStorage.removeItem(k); } catch { /* 무시 */ }
    try { sessionStorage.removeItem(k); } catch { /* 무시 */ }
  },
};

const sb = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
  auth: { storage: authStorage, persistSession: true, autoRefreshToken: true },
});

const TYPE = {
  drowsy: { icon: '😴', label: '졸음' },
  distracted: { icon: '📱', label: '딴짓' },
  away: { icon: '🚪', label: '자리 이탈' },
  slow: { icon: '🐢', label: '진도 지연' },
  good: { icon: '👍', label: '집중', positive: true },
};

const state = {
  uid: null,
  me: null,
  mode: null,        // 'parent' | 'student'
  own: null,         // 학생 본인일 때 자기 students 행
  children: [],      // 학부모일 때 자녀 목록
  kid: {},           // student_id -> 불러 둔 기록 (아래 loadKid)
  league: null,      // 학생 본인의 이번 주 리그
  pushRegistered: false,
  newestAlertId: null,
  alerts: [],
  route: null,
  installPrompt: null,
  swReg: null,
  words: null,       // 닉네임 재료
};

/* ------------------------------------------------------------------ */
/* 유틸                                                                */
/* ------------------------------------------------------------------ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
function hhmm(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const DAY = 86400000;
function dayLabel(ts) {
  const d = new Date(ts), today = new Date();
  const same = (a, b) => a.toDateString() === b.toDateString();
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (same(d, today)) return '오늘';
  if (same(d, yest)) return '어제';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
const ymOf = (ts) => dayKey(ts).slice(0, 7);
function dayStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function dateHead(ts) {
  const d = new Date(ts);
  const year = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}년 ` : '';
  const base = `${year}${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
  const rel = dayLabel(ts);
  return rel === '오늘' || rel === '어제' ? `${rel} · ${base}` : base;
}
const hm = WK.hm;
const todayKey = () => WK.kstDayKey(Date.now());

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}
function fail(e) { console.error(e); toast(e?.message ?? String(e)); }
function banner(t, b, ms = 3200) {
  $('#bannerT').textContent = t; $('#bannerB').textContent = b; $('#banner').classList.add('show');
  clearTimeout(banner.t); banner.t = setTimeout(() => $('#banner').classList.remove('show'), ms);
}
function sheet(html) {
  overlayFocus = document.activeElement;
  const sh = $('#sheet'); sh.innerHTML = html; sh.inert = false; sh.setAttribute('aria-hidden', 'false');
  sh.classList.add('show'); $('#dim').classList.add('show');
  requestAnimationFrame(() => { if (sh.classList.contains('show')) sh.querySelector('button,input,textarea')?.focus(); });
}
let overlayFocus = null;
function closeSheet() {
  const sh = $('#sheet'); sh.classList.remove('show'); sh.inert = true; sh.setAttribute('aria-hidden', 'true');
  $('#dim').classList.remove('show');
  if (overlayFocus?.isConnected) overlayFocus.focus();
}
document.addEventListener('keydown', (e) => {
  const panel = document.querySelector('#cele.show, #sheet.show'); if (!panel) return;
  if (e.key === 'Escape') { closeSheet(); closeCele(); return; }
  if (e.key !== 'Tab') return;
  const items = [...panel.querySelectorAll('button:not(:disabled),input,textarea,select,[tabindex="0"]')];
  const first = items[0], last = items[items.length - 1]; if (!first) return;
  if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
});
$('#dim').onclick = closeSheet;
let celebrationTimer = null;
function scheduleCelebration(fn, onShown) {
  clearTimeout(celebrationTimer);
  const version = viewVersion;
  celebrationTimer = setTimeout(() => {
    celebrationTimer = null;
    if (version !== viewVersion || state.route?.v !== 'home') return;
    onShown(); fn();
  }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200);
}
function cele(html) {
  overlayFocus = document.activeElement;
  const c = $('#cele'); c.innerHTML = html; c.inert = false; c.setAttribute('aria-hidden', 'false'); c.classList.add('show');
  c.querySelector('button')?.focus(); confetti();
}
function closeCele() {
  clearTimeout(celebrationTimer); celebrationTimer = null;
  const c = $('#cele'); const open = c.classList.contains('show'); c.classList.remove('show'); c.inert = true; c.setAttribute('aria-hidden', 'true');
  if (open && overlayFocus?.isConnected) overlayFocus.focus();
}
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#fx'), ctx = cv.getContext('2d'); cv.width = innerWidth; cv.height = innerHeight;
  const cols = ['#FF6B35', '#FFC83D', '#22B99A', '#3D8BFF', '#8B6CFF', '#FF6FA8'];
  const ps = Array.from({ length: 90 }, () => ({ x: cv.width / 2 + (Math.random() - 0.5) * 80, y: cv.height * 0.42, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 10 - 3, r: Math.random() * 5 + 3, c: cols[Math.floor(Math.random() * 6)], a: Math.random() * 6 }));
  let f = 0;
  (function tick() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach((p) => { p.vy += 0.32; p.x += p.vx; p.y += p.vy; p.a += 0.2; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6); ctx.restore(); });
    if (++f < 120) requestAnimationFrame(tick); else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}
function animBars(root = $('#view-main')) {
  setTimeout(() => $$('[data-w]', root).forEach((i) => { i.style.width = i.dataset.w; }), 80);
}
function countUp(e, to, ms = 900) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { e.textContent = to; return; }
  const t0 = performance.now();
  (function s(t) { if (!e.isConnected) return; const k = Math.min(1, (t - t0) / ms); e.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(s); })(t0);
}

/* ------------------------------------------------------------------ */
/* 화면 이동                                                            */
/*   화면을 바꿀 때마다 브라우저 기록에 한 칸씩 쌓아서, 휴대폰 뒤로 가기가  */
/*   앱을 닫지 않고 바로 앞 화면으로 돌아가게 합니다.                       */
/*   학생 탭(홈 · 랭킹 · 꾸미기 · 기록 · 나)끼리는 쌓지 않고 바꿔 끼웁니다.  */
/* ------------------------------------------------------------------ */
let viewVersion = 0;
const TABS = ['home', 'rank', 'deco', 'rec', 'me'];
function go(route, { replace = false } = {}) {
  const tabSwitch = state.mode === 'student' && TABS.includes(route.v) && TABS.includes(state.route?.v);
  if (replace || tabSwitch) history.replaceState(route, ''); else history.pushState(route, '');
  return render(route).catch(fail);
}
function findKid(id) { return [state.own, ...state.children].find((k) => k && k.id === id) ?? null; }

async function render(r) {
  viewVersion++;
  if (!state.me) return show('auth');
  closeSheet(); closeCele();
  state.route = r;
  const kid = r.kid ? findKid(r.kid) : state.own;
  switch (r.v) {
    case 'nick':     return scrNick();
    case 'rank':     return scrRank(r);
    case 'deco':     return scrDeco();
    case 'rec':      return scrRec();
    case 'me':       return scrMe();
    case 'student':  return kid ? scrKid(kid) : scrHome();
    case 'detail':   return kid ? scrDetail(kid, r.s) : scrHome();
    case 'weekly':   return kid ? scrWeekly(kid, r.w) : scrHome();
    case 'weeklies': return kid ? scrWeeklies(kid) : scrHome();
    case 'survey':   return kid ? scrSurvey(kid, r.id) : scrHome();
    case 'growth':   return kid ? openGrowth(kid, r.ym) : scrHome();
    case 'history':  return kid ? openHistory(kid, r.order) : scrHome();
    case 'alerts':   return kid ? openAlerts(kid) : scrHome();
    case 'addchild': return showAddChild();
    case 'password': show('password'); $('#pwBack').hidden = false; return;
    default:         return scrHome();
  }
}
addEventListener('popstate', (e) => {
  if (!state.me) return;
  const r = e.state && e.state.v !== 'auth' ? e.state : { v: 'home' };
  render(r).catch(fail);
});

function show(name) {
  $('#bootStatus')?.remove();
  $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + name; });
  if (name !== 'main') $('#tabbar').hidden = true;
  window.scrollTo(0, 0);
}

// 로그인 뒤 화면 한 장을 그립니다. tab 을 주면 학생 탭바를 켭니다.
function mount(html, { tab = null } = {}) {
  show('main');
  const v = $('#view-main');
  // 알림 안내 카드는 화면을 옮겨 다닙니다. 지우지 않도록 먼저 빼 둡니다.
  const nc = $('#notifyCard');
  if (nc && v.contains(nc)) { nc.hidden = true; document.body.append(nc); }
  v.className = 'view enter';
  v.innerHTML = html;
  setTimeout(() => v.classList.remove('enter'), 800);
  const tb = $('#tabbar');
  if (tab && state.mode === 'student') {
    const pending = (state.kid[state.own.id]?.surveys ?? []).length;
    tb.hidden = false;
    tb.innerHTML = [['home', '🏠', '홈'], ['rank', '🏆', '랭킹'], ['deco', '🎨', '꾸미기'], ['rec', '📅', '기록'], ['me', '🙂', '나']]
      .map(([k, ic, t]) => `<button class="${k === tab ? 'on' : ''} ${k === 'me' && pending ? 'dot' : ''}" data-tab="${k}"><span class="ic">${ic}</span>${t}</button>`).join('');
    $$('button', tb).forEach((b) => { b.onclick = () => go({ v: b.dataset.tab }); });
  } else tb.hidden = true;
  $$('[data-back]', v).forEach((b) => { b.onclick = () => history.back(); });
  animBars(v);
  return v;
}
const head = (title, { back = true, right = '' } = {}) =>
  `<div class="hd">${back ? '<button class="back press" data-back aria-label="뒤로">‹</button>' : ''}<b>${title}</b>${right}</div>`;

/* ------------------------------------------------------------------ */
/* 설치 · 알림 (운영 앱과 같음)                                          */
/* ------------------------------------------------------------------ */
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; if (state.me) renderNotifyCard(); });
addEventListener('appinstalled', () => { state.installPrompt = null; renderNotifyCard(); });

function b64ToU8(b64) {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  if (state.swReg) return state.swReg;
  state.swReg = await navigator.serviceWorker.register('sw.js');
  return state.swReg;
}
async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await registerSW();
  return reg ? await reg.pushManager.getSubscription() : null;
}
// 공개 키: config.js 에 있으면 그것(운영), 없으면 서버에서 받음(사본 — 서버가 직접 만든 키)
let vapidCache = null;
async function vapidKey() {
  if (window.VAPID_PUBLIC_KEY && window.VAPID_PUBLIC_KEY !== 'B...') return window.VAPID_PUBLIC_KEY;
  if (vapidCache) return vapidCache;
  const { data } = await sb.rpc('vapid_public_key');
  vapidCache = data || null;
  return vapidCache;
}
async function claimSub(sub) {
  const j = sub.toJSON();
  const { error } = await sb.rpc('claim_push_subscription', {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent.slice(0, 300),
  });
  if (error) throw error;
  state.pushRegistered = true;
}
async function enablePush() {
  const key = await vapidKey();
  if (!key) throw new Error('알림 키를 아직 받지 못했습니다. 잠시 후 다시 눌러 주세요');
  const reg = await registerSW();
  if (!reg) throw new Error('이 브라우저는 알림을 지원하지 않습니다');
  if (await Notification.requestPermission() !== 'granted') throw new Error('알림이 허용되지 않았습니다');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
  await claimSub(sub);
  toast('알림이 켜졌습니다');
}
// 알림이 조용히 끊기는 두 경로(구독 갱신 · 구독만 버려짐)를 권한이 있을 때 조용히 고칩니다.
async function refreshSubscription() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return;
    const reg = await registerSW(); if (!reg) return;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const key = await vapidKey();
      if (!key) return;
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
    }
    await claimSub(sub);
  } catch (e) { console.warn('구독 갱신 실패', e); }
}
async function checkPushRegistered() {
  try {
    const { data } = await sb.from('push_subscriptions').select('id').eq('user_id', state.uid).limit(1);
    state.pushRegistered = (data?.length ?? 0) > 0;
  } catch { state.pushRegistered = false; }
}

// 알림 안내 카드. 정상일 때는 아예 숨깁니다 — 할 일 없는 안내가 중요한 안내를 묻습니다.
async function renderNotifyCard(host) {
  const card = $('#notifyCard');
  if (host) host.prepend(card);
  const title = $('#notifyTitle'), text = $('#notifyText'), btn = $('#notifyBtn');
  card.hidden = false; btn.hidden = true; btn.onclick = null;
  $$('#notifyCard ol').forEach((n) => n.remove());
  if (isIOS() && !isStandalone()) {
    title.textContent = '홈 화면에 추가하면 알림이 와요';
    text.textContent = '아이폰은 홈 화면에 추가한 뒤에만 알림을 받을 수 있어요.';
    const ol = el('ol');
    ol.append(el('li', null, '화면 아래 공유 버튼'), el('li', null, '"홈 화면에 추가"'), el('li', null, '홈 화면 아이콘으로 다시 들어오기'));
    $('.calloutBody', card).append(ol);
    return;
  }
  if (!isStandalone() && state.installPrompt) {
    title.textContent = '앱으로 설치하세요';
    text.textContent = '홈 화면에 아이콘이 생기고, 리포트가 오면 바로 알려 드려요.';
    btn.textContent = '설치'; btn.hidden = false;
    btn.onclick = async () => { const p = state.installPrompt; state.installPrompt = null; await p.prompt(); await p.userChoice; renderNotifyCard(); };
    return;
  }
  if (!pushSupported()) { title.textContent = '이 브라우저는 알림을 지원하지 않아요'; text.textContent = '안드로이드는 크롬 또는 삼성 인터넷, 아이폰은 Safari 를 써 주세요.'; return; }
  if (Notification.permission === 'denied') { title.textContent = '알림이 차단되어 있어요'; text.textContent = '브라우저 설정 → 사이트 설정 → 알림에서 허용으로 바꿔 주세요.'; return; }
  const sub = await currentSubscription();
  if (Notification.permission === 'granted' && sub && state.pushRegistered) { card.hidden = true; return; }
  title.textContent = '알림을 켜 주세요';
  text.textContent = state.mode === 'student' ? '리포트가 오면 점수랑 순위를 바로 알려 줄게!' : '수업이 끝날 때마다 리포트를 보내 드립니다.';
  btn.textContent = '알림 켜기'; btn.hidden = false;
  btn.onclick = async () => { btn.disabled = true; try { await enablePush(); } catch (e) { fail(e); } btn.disabled = false; renderNotifyCard(); };
}

/* ------------------------------------------------------------------ */
/* 로그인 (운영 앱과 같음)                                               */
/* ------------------------------------------------------------------ */
const LOGIN_DOMAIN = window.LOGIN_DOMAIN || 'students.suhakjiok.kr';
const toEmail = (loginId) => `${loginId.trim().toLowerCase()}@${LOGIN_DOMAIN}`;
let lastLoginId = null;

async function savePasswordToPhone(id, password) {
  if (!('PasswordCredential' in window) || !navigator.credentials?.store) return;
  try { await navigator.credentials.store(new window.PasswordCredential({ id, password, name: id })); } catch { /* 거절 */ }
}
async function prefillLogin() {
  $('#fAuto').checked = autoLogin();
  const saved = store.get(SAVED_ID_KEY);
  $('#fRemember').checked = store.get('jp.remember') !== '0';
  if (saved && !$('#fLogin').value) $('#fLogin').value = saved;
  if (!$('#fRemember').checked || !('PasswordCredential' in window)) return;
  try {
    const c = await navigator.credentials.get({ password: true, mediation: 'optional' });
    if (c?.password) {
      if (!$('#fLogin').value) $('#fLogin').value = c.id;
      if (c.id === $('#fLogin').value.trim().toLowerCase()) $('#fPassword').value = c.password;
    }
  } catch { /* 지원하지 않거나 거절 */ }
}

$('#authForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = $('#authSubmit'), err = $('#authError');
  btn.disabled = true; err.hidden = true;
  const raw = $('#fLogin').value.trim().toLowerCase();
  if (!/^[a-z0-9._-]+-(s|p)$/.test(raw)) {
    err.textContent = '아이디 형식이 올바르지 않습니다. 예: 184046-s (학생) / 184046-p (보호자)';
    err.hidden = false; btn.disabled = false; return;
  }
  store.set(AUTO_KEY, $('#fAuto').checked ? '1' : '0');
  const remember = $('#fRemember').checked;
  store.set('jp.remember', remember ? '1' : '0');
  const password = $('#fPassword').value;
  const { error } = await sb.auth.signInWithPassword({ email: toEmail(raw), password });
  if (error) {
    err.textContent = /invalid/i.test(error.message) ? '아이디 또는 비밀번호가 맞지 않습니다. 안내문을 다시 확인해 주세요.' : error.message;
    err.hidden = false;
  } else {
    lastLoginId = raw;
    if (remember) { store.set(SAVED_ID_KEY, raw); savePasswordToPhone(raw, password); } else store.del(SAVED_ID_KEY);
  }
  btn.disabled = false;
});

async function signOut() {
  await sb.auth.signOut();
  Object.assign(state, { me: null, children: [], own: null, kid: {}, league: null, pushRegistered: false });
  $('#fPassword').value = '';
  history.replaceState({ v: 'auth' }, '');
}
$('#signOutFromConnect').onclick = signOut;
$('#pwSignOut').onclick = signOut;
$('#pwBack').onclick = () => history.back();
$('#addBack').onclick = () => history.back();

$('#pwSave').onclick = async () => {
  const err = $('#pwError'), a = $('#pw1').value, b = $('#pw2').value;
  err.hidden = true;
  if (a.length < 6) { err.textContent = '비밀번호는 6자 이상이어야 합니다.'; err.hidden = false; return; }
  if (a !== b) { err.textContent = '두 번 입력한 비밀번호가 다릅니다.'; err.hidden = false; return; }
  const btn = $('#pwSave'); btn.disabled = true;
  try {
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) throw error;
    await sb.from('profiles').update({ must_change_password: false }).eq('id', state.uid);
    $('#pw1').value = ''; $('#pw2').value = '';
    const id = lastLoginId || store.get(SAVED_ID_KEY);
    if (id && store.get('jp.remember') !== '0') savePasswordToPhone(id, a);
    const first = state.me.must_change_password;
    state.me.must_change_password = false;
    toast('비밀번호를 바꿨습니다');
    if (first) await afterLogin(); else history.back();
  } catch (e) { err.textContent = e.message ?? String(e); err.hidden = false; } finally { btn.disabled = false; }
};

sb.auth.onAuthStateChange((_e, session) => {
  if (session) {
    // 토큰이 갱신될 때마다 이 알림이 옵니다. 이미 들어와 있으면 다시 부팅하지 않습니다.
    if (state.me && state.uid === session.user.id) return;
    boot().catch(fail);
  } else { state.uid = null; state.me = null; show('auth'); prefillLogin(); }
});

/* ------------------------------------------------------------------ */
/* 부팅                                                                */
/* ------------------------------------------------------------------ */
async function boot() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return show('auth');
  state.uid = user.id;
  const { data: me, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (error) return fail(error);
  state.me = me;
  if (['teacher', 'admin'].includes(me.role)) { show('auth'); return toast('선생님 계정입니다. 선생님 콘솔을 이용하세요.'); }
  // 임시 비밀번호를 그대로 쓰는 동안에는 기록을 보여주지 않습니다.
  if (me.must_change_password) { show('password'); $('#pwBack').hidden = true; return; }
  await afterLogin();
}

async function afterLogin() {
  await loadStudents();
  if (!state.own && !state.children.length) {
    const merged = !!state.me?.merged_into;
    $('#connectDefault').hidden = merged; $('#connectMerged').hidden = !merged;
    return show('connect');
  }
  await checkPushRegistered();
  await refreshSubscription();
  await loadAlerts();
  const t = targetFromUrl();
  // 학생이 아직 닉네임이 없으면 처음 한 번 이름 뽑기부터
  const first = state.mode === 'student' && !state.own.nickname ? { v: 'nick', first: true } : { v: 'home' };
  history.replaceState(first, '');
  await render(first);
  lastLoadedAt = Date.now();
  startPolling();
  if (t && first.v === 'home') openTarget(t);
}

let lastLoadedAt = Date.now();

// 푸시가 왔거나 앱으로 돌아왔을 때. 읽고 있는 화면은 빼앗지 않습니다.
async function refreshNow(why) {
  if (!state.me) return;
  const v = state.route?.v;
  const redraw = ['home', 'student', 'rank', 'rec', 'me'].includes(v);
  try {
    await loadStudents();
    state.kid = {};
    if (!redraw) { if (why) toast(why + ' — 뒤로 가면 최신 내용이 보입니다'); return; }
    await render(state.route);
    lastLoadedAt = Date.now();
  } catch (e) { console.warn('갱신 실패', e); }
}

// 서비스워커 메시지가 오지 않는 경우에도 최신이어야 합니다. 최신 알림 한 건만 비교합니다.
let pollTimer = null;
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    if (!['home', 'student', 'rank', 'rec'].includes(state.route?.v)) return;
    try {
      const { data } = await sb.from('notifications').select('id').eq('recipient_id', state.uid)
        .order('created_at', { ascending: false }).limit(1);
      const newest = data?.[0]?.id ?? null;
      if (notificationChanged(state.newestAlertId, newest)) { state.newestAlertId = newest; await refreshNow(); }
    } catch (e) { console.warn('확인 실패', e); }
  }, 20000);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || Date.now() - lastLoadedAt < 10000) return;
  refreshNow();
});

// sw.js 가 앱을 새로 열 때 붙여 보내는 값
function targetFromUrl() {
  const q = new URLSearchParams(location.search);
  const t = { session_id: q.get('s'), student_id: q.get('st'), view: q.get('v'), week_start: q.get('w'), survey_id: q.get('sv') };
  if (!t.student_id && !t.survey_id) return null;
  history.replaceState({}, '', location.pathname);
  return t;
}
// 알림이 가리키는 화면을 엽니다. 뒤로 가기가 학생 화면 → 첫 화면 순이 되도록 학생 화면을 먼저 쌓습니다.
function openTarget(t) {
  if (!t) return;
  const kid = findKid(t.student_id) ?? state.own ?? state.children[0];
  if (!kid) return;
  if (state.mode !== 'student') history.pushState({ v: 'student', kid: kid.id }, '');
  if (t.view === 'survey' && t.survey_id) return go({ v: 'survey', kid: kid.id, id: t.survey_id });
  if (t.view === 'weekly' && t.week_start) return go({ v: 'weekly', kid: kid.id, w: t.week_start });
  if (t.session_id) return go({ v: 'detail', kid: kid.id, s: t.session_id });
  render(state.mode === 'student' ? { v: 'home' } : { v: 'student', kid: kid.id }).catch(fail);
}

/* ------------------------------------------------------------------ */
/* 데이터                                                               */
/* ------------------------------------------------------------------ */
async function loadStudents() {
  // RLS 가 걸러줍니다. 학부모는 연결된 자녀만, 학생은 자기 자신만 보입니다.
  const { data, error } = await sb.from('students').select('*').order('name');
  if (error) throw error;
  state.own = (data ?? []).find((s) => s.profile_id === state.uid) ?? null;
  state.children = (data ?? []).filter((s) => s.profile_id !== state.uid);
  state.mode = state.own ? 'student' : 'parent';
}

// 학생 한 명의 최근 3주 기록 · 시간표 · 주간 리포트 · 설문 · 공부 통계
async function loadKid(kid, force = false) {
  const c = state.kid[kid.id];
  if (c && !force && Date.now() - c.at < 15000) return c;
  const ws = WK.weekStartOf();
  const fromTs = WK.parseDay(WK.addDays(ws, -21)).toISOString();
  const [reps, sums, sched, weekly, sv, stats, hist, ci] = await Promise.all([
    sb.from('daily_reports').select('*').eq('student_id', kid.id).gte('started_at', fromTs).order('started_at'),
    sb.from('session_summaries').select('*').eq('student_id', kid.id).eq('status', 'ended').gte('started_at', fromTs),
    sb.from('student_schedule').select('*').eq('student_id', kid.id),
    sb.from('weekly_reports').select('*').eq('student_id', kid.id).not('sent_at', 'is', null).order('week_start', { ascending: false }).limit(16),
    sb.from('surveys').select('*').eq('student_id', kid.id).not('sent_at', 'is', null).is('answered_at', null).is('archived_at', null),
    sb.rpc('student_stats', { p_student: kid.id }),
    state.mode === 'student' ? sb.from('league_history').select('*').eq('student_id', kid.id) : Promise.resolve({ data: [] }),
    sb.rpc('list_checkins', { p_student: kid.id }),
  ]);
  for (const r of [reps, sums, sched, weekly, sv, stats, hist, ci]) if (r.error) throw r.error;
  const out = {
    at: Date.now(), ws,
    reps: (reps.data ?? []).map(r => ({...r, participation_ok: r.day_ok ?? r.participation_ok})), sums: sums.data ?? [], sched: sched.data ?? [], weekly: weekly.data ?? [],
    surveys: [...(ci.data?.items ?? []), ...(sv.data ?? []).filter((x) => x.target === (state.mode === 'student' ? 'student' : 'parent') && (!x.deferred_until || new Date(x.deferred_until) <= new Date()))],
    adjustments: ci.data?.adjustments ?? [],
    stats: stats.data ?? {}, hist: hist.data ?? [],
  };
  state.kid[kid.id] = out;
  return out;
}
async function loadLeague() {
  const { data, error } = await sb.rpc('my_league');
  if (error) throw error;
  state.league = data;
  return data;
}
const myRow = (L) => L?.members?.find((m) => m.me) ?? (L?.personal ? { ...L.personal, me: true } : null);
const myRank = (L) => L?.members?.find((m) => m.me)?.rank ?? 0;

const effortTitle = n => n >= 14 ? '꾸준한 도전자' : n >= 7 ? '스스로 도전가' : n >= 3 ? '추가 노력가' : n >= 1 ? '한 걸음 더' : '나의 첫 도전';
function effortCard(stats = {}) {
  const n = stats.extra_days || 0, next = n < 3 ? 3 : n < 7 ? 7 : n < 14 ? 14 : null;
  const reward = n < 3 ? '도전 별빛 효과' : n < 7 ? '혜성 머리핀' : '꾸준한 도전자 칭호';
  return `<div class="card"><div class="row" style="justify-content:space-between"><b>🌟 추가 노력 별 ${n}개</b><span class="pill p-sun">${effortTitle(n)}</span></div><p class="muted small" style="margin-top:8px">문제 목표보다 25% 더 풀거나, 확인한 학습시간을 15분 더 채우면 하루 별 1개. 추가 공부는 선택이에요.</p>${next ? `<div class="bar" style="margin-top:10px"><i data-w="${Math.min(100,n*100/next)}%"></i></div><p class="muted small" style="margin-top:5px">별 ${next}개까지 ${next-n}개 · ${reward}</p>` : '<p class="muted small" style="margin-top:8px">함께 쌓은 도전이 멋져요. 추가 학습도 누적 기록에 계속 남아요.</p>'}</div>`;
}

// 오늘 · 이번 주 지옥방 상태
function todayInfo(kid, c) {
  const tk = todayKey();
  const todayReps = c.reps.filter((r) => WK.kstDayKey(r.started_at) === tk);
  const dow = ((new Date(WK.parseDay(tk)).getDay() + 6) % 7) + 1;   // 1 월 ~ 7 일
  const frozen = c.stats.week_plans?.filter(p => p.week_start === c.ws) || [];
  const plannedToday = frozen.find(p => p.day === tk);
  const jiokToday = frozen.length ? (plannedToday ? {start_min: null} : null) : c.sched.find(s => s.kind === 'jiok' && s.weekday === dow);
  const rep = todayReps[todayReps.length - 1] ?? null;
  const progress = c.stats.week_progress?.days?.find(d => d.day === tk);
  return { rep, jiokToday, dow, progress, stage: frozen[0]?.stage || kid.stage, goal: progress?.goal ?? kid.stage * 25, minutesGoal: progress?.minutes_goal ?? kid.mandatory_minutes ?? 60 };
}
function weekChips(kid, c) {
  const tk = todayKey();
  return ['월', '화', '수', '목', '금'].map((d, i) => {
    const k = WK.addDays(c.ws, i);
    const reps = c.reps.filter((r) => WK.kstDayKey(r.started_at) === k);
    const frozen = c.stats.week_plans?.filter(p => p.week_start === c.ws) || [];
    const jiok = frozen.length ? frozen.some(p => p.day === k) : c.sched.some(s => s.kind === 'jiok' && s.weekday === i + 1);
    const cls = c.sched.some((s) => s.kind === 'class' && s.weekday === i + 1);
    if (reps.length) { const progress = c.stats.week_progress?.days?.find(d => d.day === k); const ok = progress?.ok ?? reps.some(r => r.participation_ok); return `<div class="day ${ok ? 'ok' : progress?.due === false ? 'today' : 'miss'}">${d}<i>${ok ? '🔥' : progress?.due === false ? '진행 중' : '노력'}</i></div>`; }
    if (k === tk) return `<div class="day today">${d}<i>${jiok ? '오늘' : i === 4 ? '형성평가' : cls ? '수업' : '오늘'}</i></div>`;
    if (jiok && k < tk) return `<div class="day miss">${d}<i>–</i></div>`;
    if (i === 4) return `<div class="day test">${d}<i>형성평가</i></div>`;
    return `<div class="day">${d}<i>${jiok ? '지옥방' : cls ? '수업' : '·'}</i></div>`;
  }).join('');
}
const legacyPrompt = s => `<div class="card"><b>${esc(SV[s.kind]?.t || '학습 설문')}</b><p class="muted small">답변은 선택이에요.</p><div class="row wrap"><button class="btn sm press" data-sv="${s.id}">답하기</button><button class="btn sm ghost press" data-ci-later="${s.id}">나중에</button><button class="btn sm ghost press" data-ci-skip="${s.id}">건너뛰기</button></div></div>`;
const pendingCard = (kid,c) => `${(c.adjustments||[]).map(a=>`<div class="card"><b>이렇게 바꿨어요</b><p style="white-space:pre-wrap">${esc(a.adjustment)}</p>${a.next_plan?`<p class="muted small">다음 계획 · ${esc(a.next_plan)}</p>`:''}</div>`).join('')}${c.surveys[0]?(c.surveys[0].version===2?checkinPrompt(c.surveys[0]):legacyPrompt(c.surveys[0])):''}`;
function bindSurveyCards(kid) {
 $$('[data-sv]').forEach(b=>b.onclick=()=>go({v:'survey',kid:kid.id,id:b.dataset.sv}));
 $$('[data-ci-later],[data-ci-skip]').forEach(b=>b.onclick=async()=>{
  if(b.disabled)return;b.disabled=true;
  const skip=!!b.dataset.ciSkip,id=b.dataset.ciSkip||b.dataset.ciLater,row=state.kid[kid.id]?.surveys.find(s=>s.id===id);
  if(!row)return;
  const {error}=row.version===2?await sb.rpc('act_checkin',{p_id:id,p_action:skip?'skip':'defer',p_answers:row.answers||{},p_revision:row.revision}):await sb.rpc('defer_legacy_survey',{p_id:id,p_skip:skip});
  if(error){toast(error.message);b.disabled=false;return;}
  delete state.kid[kid.id];toast(skip?'건너뛰었어요':'다음 날 다시 볼 수 있어요');go({...state.route});
 });
}

/* ------------------------------------------------------------------ */
/* 홈                                                                  */
/* ------------------------------------------------------------------ */
async function scrHome() {
  const viewAtStart = viewVersion;
  if (state.mode === 'parent') return scrParentHome();
  const kid = state.own;
  const [c, L] = await Promise.all([loadKid(kid), loadLeague().catch(() => null)]);
  const T = todayInfo(kid, c), r = T.rep;
  const d = new Date();
  const say = r ? (r.participation_ok ? (r.pt_over ? `오늘 오공완! 순공도 ${r.stay_minutes - r.mandatory_minutes}분 더 했어 🔥` : '오늘 오공완! 이대로만 가자 🔥') : '오늘 해낸 공부가 쌓였어. 다음 목표도 한 걸음씩!')
    : T.jiokToday ? `오늘 할당량 ${T.goal}문제, 같이 끝내 보자!` : T.dow === 5 ? '오늘은 이번 주 배운 걸 확인해 보자' : '오늘은 지옥방 없는 날. 푹 쉬고 다음에 달리자';
  const me = myRow(L);
  if (viewAtStart !== viewVersion) return;
  const v = mount(`
    <div class="row" style="justify-content:space-between;margin:2px 0 10px"><div><div class="muted small">${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}요일</div><b style="font-size:19px;font-weight:900">${esc(kid.nickname || kid.name)}</b></div><span class="pill p-fire">🔥 연속 오공완 ${c.stats.streak ?? 0}번</span></div>
    <div id="ncHost"></div>
    <div class="hero">
      <div class="row" style="align-items:flex-end">${pib(kid.look, 112, r?.participation_ok ? 'm-cheer m-settle' : 'm-idle')}
        <div style="flex:1;padding-bottom:16px"><div class="say">${say}</div></div></div>
      <div class="card" style="margin:12px 0 0;box-shadow:none">
        <div class="row" style="justify-content:space-between;margin-bottom:10px"><b style="font-weight:900">오늘 지옥방</b><span class="pill p-sun">STAGE ${T.stage} · 오늘 목표 ${T.goal}문제</span></div>
        <div class="kv"><span>오늘 할당량</span><b>${T.progress?.solved ?? r?.solved ?? 0}<span class="muted" style="font-size:13px;font-weight:700"> / ${T.goal}문제</span></b></div>
        <div class="bar" style="margin-bottom:12px"><i data-w="${Math.min(100, (T.progress?.solved ?? r?.solved ?? 0) * 100 / T.goal)}%"></i></div>
        <div class="kv"><span>순공시간</span><b>${hm(T.progress?.minutes ?? r?.stay_minutes ?? 0)}<span class="muted" style="font-size:13px;font-weight:700"> / ${hm(T.minutesGoal)}</span></b></div>
        <div class="bar"><i class="mint" data-w="${Math.min(100, (T.progress?.minutes ?? r?.stay_minutes ?? 0) * 100 / T.minutesGoal)}%"></i></div>
        ${r ? '' : `<p class="muted small" style="margin-top:10px">${T.jiokToday ? '오늘 예정된 학습 · ' : ''}확인된 학습 기록은 하루씩 합산돼요. 조금씩 해낸 공부도 쌓여요.</p>`}
      </div>
    </div>
    ${pendingCard(kid, c)}
    ${effortCard(c.stats)}
    <div class="grid2">
      <button class="mini press" data-go="rank"><small>꾸준함 등급 · ${esc(L?.tier_name ?? '불씨')}</small><b>${L?.eligible ? (myRank(L) ? myRank(L) + '위' : '–') : '준비주'}</b> <span class="muted small">${L?.eligible ? '/ ' + L.members.length + '명' : '다음 주부터 함께'}</span></button>
      <div class="mini"><small>이번 주 랭킹 점수</small><b>${fp(L?.personal?.points)}점</b></div>
    </div>
    ${rankingBreakdown(L?.personal)}
    <div class="card"><b style="font-weight:900">이번 주</b>
      <div class="week">${weekChips(kid, c)}</div>
      <p class="muted small" style="margin-top:10px">기본 목표를 채우면 100점, 초과 공부와 형성평가는 순위에 가산돼요. <b style="color:var(--sky)">시험 성적과 순위에 관계없이 꾸준함 등급이 올라가요.</b></p></div>`, { tab: 'home' });
  $$('[data-go]', v).forEach((b) => { b.onclick = () => go({ v: b.dataset.go }); });
  bindSurveyCards(kid);
  await renderNotifyCard($('#ncHost'));
  checkCelebrate(kid, c, L);
}

// 리포트가 새로 왔으면 축하 화면 (처음 들어온 날은 지난 기록으로 축하하지 않음)
function checkCelebrate(kid, c, L) {
  const key = 'jp.seen.' + kid.id;
  let seen; try { seen = JSON.parse(store.get(key) || 'null'); } catch { seen = null; }
  const lastRep = [...c.reps].sort((a, b) => (a.reported_at < b.reported_at ? -1 : 1)).pop();
  const lastWk = c.weekly[0];
  const now = { rep: lastRep?.session_id ?? null, wk: lastWk?.id ?? null };
  if (!seen) { store.set(key, JSON.stringify(now)); return; }
  const acknowledged = () => store.set(key, JSON.stringify(now));
  const newReport = lastRep && lastRep.session_id !== seen.rep && Date.now() - new Date(lastRep.reported_at) < 3 * DAY;
  if (lastWk && lastWk.id !== seen.wk && Date.now() - new Date(lastWk.sent_at) < 3 * DAY) return celebrateWeekly(kid, c, L, lastWk, newReport ? lastRep : null, acknowledged);
  if (newReport) return celebrateReport(kid, L, lastRep, acknowledged);
  acknowledged();
}
function rankPills(_before, after, color = 'fire') {
  return after ? `<div class="pill p-${color}" style="margin-bottom:14px">현재 ${after}위${after === 1 ? ' 👑' : ''}</div>` : '';
}
function celebrateReport(kid, L, r, onShown = () => {}) {
  const after = myRank(L), before = null;
  banner(r.participation_ok ? '오공완 리포트가 도착했어요' : '오늘 리포트가 도착했어요', `문제 ${r.solved}/${r.assigned} · 확인한 학습시간 ${hm(r.stay_minutes)}`);
  scheduleCelebration(() => {
    cele(`
      <div style="font-size:13px;font-weight:900;color:var(--fire);letter-spacing:1px">${r.participation_ok ? '오늘 공부 완료!' : '오늘 리포트 도착!'}</div>
      <div class="big" style="margin:6px 0 4px;font-size:34px"><span id="cu">0</span>점</div><p class="muted small">이번 주 랭킹 총점 · 오늘의 노력도 쌓였어요</p>
      <div style="margin:4px 0 10px">${pib(kid.look, 120, 'm-cheer m-settle')}</div>
      <div class="card" style="width:100%;margin-bottom:10px">${pointRows(r)}</div>
      ${rankPills(before, after)}
      <button class="btn press" id="seeRank">랭킹에서 보기</button>
      <button class="btn ghost press" id="closeC" style="margin-top:8px">닫기</button>`);
    $('#cu').textContent = fp(L?.personal?.points);
    $('#seeRank').onclick = () => { closeCele(); go({ v: 'rank' }); };
    $('#closeC').onclick = closeCele;
  }, onShown);
}
function pointRows(r) {
  const goal = r.daily_goal_problems || r.assigned || 1, minutes = r.mandatory_minutes || 60;
  return `<div class="rc"><span>이번 기록의 풀이량</span><b>${r.solved}문제</b></div><div class="rc"><span>확인한 학습시간</span><b>${hm(r.stay_minutes)}</b></div><p class="muted small">하루 기록을 합산해 문제 목표 60%·학습시간 40%로 계산해요. 목표를 넘긴 문제와 시간은 추가 점수로 반영해요. 주간 내역에서 실제 합산 점수를 확인할 수 있어요.</p>`;
}
async function celebrateWeekly(kid, c, L, w, daily = null, onShown = () => {}) {
  const prev = c.weekly.find((x) => x.week_start < w.week_start && x.test_score != null)?.test_score ?? null;
  const s = w.test_score, ts = s == null ? 0 : Math.round(s / 4), g = s != null && prev != null && s > prev ? 5 : 0;
  const gain = w.week_start === c.ws ? Number(L?.personal?.test_points||0)+Number(L?.personal?.growth_points||0) : 0;
  banner(w.gold ? '🏅 이번 주 기준 통과!' : '주간 리포트가 왔어요', s != null ? `형성평가 ${s}점${g ? ` · 지난번보다 +${s - prev}점` : ''}` : '이번 주 리포트가 왔어요');
  scheduleCelebration(() => {
    cele(`
      <div style="font-size:13px;font-weight:900;color:var(--sky);letter-spacing:1px">${s != null ? '이번 주 배운 만큼 성장했어요' : '주간 리포트 도착'}</div>
      ${s != null ? `<div class="big" style="margin:6px 0">${s}점</div>${prev != null ? `<div class="muted small" style="margin-bottom:10px">지난번 ${prev}점 → 이번 ${s}점 (${s - prev >= 0 ? '+' : ''}${s - prev})</div>` : ''}` : ''}
      ${pib(kid.look, 120, 'm-cheer m-settle')}
      ${w.week_start === c.ws ? rankingBreakdown(L?.personal) : '<p class="muted small">시험 점수는 해당 주의 랭킹 내역에서 확인할 수 있어요.</p>'}
      ${w.gold ? '<div class="pill p-sun" style="font-size:13px;margin-bottom:10px">🏅 다음 주 한 주 동안 황금 오라!</div>' : ''}
      ${daily ? `<div class="card" style="width:100%;margin:8px 0"><b>오늘 공부도 함께 확인해요</b>${pointRows(daily)}</div>` : ''}
      ${gain ? rankPills(null, myRank(L), 'sky') : ''}
      <button class="btn press" id="seeW" style="background:var(--sky);box-shadow:none">주간 리포트 보기</button>
      ${gain ? '<button class="btn ghost press" id="seeR" style="margin-top:8px">랭킹 보기</button>' : ''}<button class="btn ghost press" id="closeW" style="margin-top:8px">닫기</button>`);
    $('#closeW').onclick = closeCele;
    $('#seeW').onclick = () => { closeCele(); go({ v: 'weekly', w: w.week_start }); };
    const sr = $('#seeR'); if (sr) sr.onclick = () => { closeCele(); go({ v: 'rank', anim: true, gain }); };
  }, onShown);
}

/* ---- 보호자: 자녀 목록 ---- */
async function scrParentHome() {
  const viewAtStart = viewVersion;
  const kids = state.children;
  const cs = await Promise.all(kids.map((k) => loadKid(k).catch(() => null)));
  await loadAlerts();
  if (viewAtStart !== viewVersion) return;
  const v = mount(`
    ${head('자녀 공부 기록', { back: false, right: '<button class="back press" id="menuBtn" aria-label="메뉴">⋯</button>' })}
    <div id="ncHost"></div>
    ${kids.map((k, i) => {
      const c = cs[i], last = c?.reps[c.reps.length - 1];
      const unread = state.alerts.filter((n) => !n.read_at && alertFor(n, k)).length;
      return `<button class="kid press" data-kid="${k.id}"><span class="av">${pib(k.look, 48)}</span>
        <span class="main"><b>${esc(k.name)}</b><small>${esc(k.grade || '')} · STAGE ${k.stage}</small>
          <p>${last ? `최근 지옥방 ${dayLabel(last.started_at)}` : '아직 리포트가 없어요'} · 🔥 연속 오공완 ${c?.stats.streak ?? 0}번</p></span>
        <span class="side">${last ? `<span class="pill ${last.participation_ok ? 'p-mint' : 'p-gray'}">${last.participation_ok ? '오공완' : '노력 기록'}</span>` : ''}${unread ? `<span class="badge">새 알림 ${unread}</span>` : ''}${c?.surveys.length ? '<span class="pill p-grape">설문</span>' : ''}</span></button>`;
    }).join('')}
    <button class="btn ghost press" id="addChild">＋ 자녀 추가</button>`);
  $$('[data-kid]', v).forEach((b) => { b.onclick = () => go({ v: 'student', kid: b.dataset.kid }); });
  $('#addChild').onclick = () => go({ v: 'addchild' });
  $('#menuBtn').onclick = menuSheet;
  await renderNotifyCard($('#ncHost'));
}

/* ---- 보호자: 자녀 한 명 (보호자 화면에는 랭킹 · 닉네임이 없습니다. 스트릭만) ---- */
async function scrKid(kid) {
  const viewAtStart = viewVersion;
  if (state.mode === 'student') return scrHome();
  const c = await loadKid(kid);
  await loadAlerts();
  const last = c.reps[c.reps.length - 1];
  const lastW = c.weekly[0];
  const unread = state.alerts.filter((n) => !n.read_at && alertFor(n, kid)).length;
  if (viewAtStart !== viewVersion) return;
  const v = mount(`
    ${head(esc(kid.name), { right: `<span class="pill p-sun">STAGE ${kid.stage}</span>` })}
    <div class="hero"><div class="row" style="align-items:flex-end">${pib(kid.look, 100, 'm-idle')}
      <div style="flex:1;padding-bottom:14px"><div class="say">🔥 연속 오공완 <b>${c.stats.streak ?? 0}번</b>${c.stats.streak ? '! 잘 이어 가고 있어요' : ''}</div></div></div>
      <div class="week">${weekChips(kid, c)}</div></div>
    ${pendingCard(kid, c)}
    ${last ? `<button class="card press navBtn" id="lastRep" style="display:block;text-align:left">
        <div class="row" style="justify-content:space-between"><b style="font-weight:900">${dayLabel(last.started_at) === '오늘' ? '오늘 리포트' : '최근 리포트'} · ${dayLabel(last.started_at)}</b><span class="pill ${last.participation_ok ? 'p-mint' : 'p-gray'}">${last.participation_ok ? '오공완' : '노력 기록'}</span></div>
        <div class="muted small" style="margin-top:6px;font-weight:700">문제 ${last.solved}/${last.assigned} · 정답률 ${last.accuracy}% · 순공 ${hm(last.stay_minutes)}</div></button>` : '<div class="card empty">아직 지옥방 리포트가 없어요</div>'}
    ${lastW ? `<button class="card press navBtn" id="lastW" style="display:block;text-align:left"><div class="row" style="justify-content:space-between"><b style="font-weight:900">주간 리포트 · ${WK.weekLabel(lastW.week_start)}</b><span class="pill p-sky">${lastW.test_score != null ? `형성평가 ${lastW.test_score}점` : '이번 주 학습 포인트'}</span></div><div class="muted small" style="margin-top:6px;font-weight:700">눌러서 한 주 기록 보기${lastW.gold ? ' · 🏅 기준 통과' : ''}</div></button>` : ''}
    <div class="navList">
      <button class="navBtn press" data-nav="growth"><span>공부 달력 · 누적 기록</span><span class="chev">›</span></button>
      <button class="navBtn press" data-nav="weeklies"><span>주간 리포트 모아보기</span><span class="chev">›</span></button>
      <button class="navBtn press" data-nav="history"><span>지난 지옥방 전체</span><span class="chev">›</span></button>
      <button class="navBtn press" data-nav="alerts"><span>알림 모아보기${unread ? `<em class="badge">새 알림 ${unread}</em>` : ''}</span><span class="chev">›</span></button>
    </div>`);
  const lr = $('#lastRep'); if (lr) lr.onclick = () => go({ v: 'detail', kid: kid.id, s: last.session_id });
  const lw = $('#lastW'); if (lw) lw.onclick = () => go({ v: 'weekly', kid: kid.id, w: lastW.week_start });
  $$('[data-nav]', v).forEach((b) => { b.onclick = () => go({ v: b.dataset.nav, kid: kid.id }); });
  bindSurveyCards(kid);
}

/* ------------------------------------------------------------------ */
/* 닉네임 뽑기 — 미리 만든 이름 중에서 돌려서 고르기 (직접 짓지 않음)       */
/* ------------------------------------------------------------------ */
let tone = 1, cands = [], pick = -1;
async function loadWords() {
  if (state.words) return state.words;
  const [{ data: w }, { data: taken }] = await Promise.all([
    sb.from('nickname_words').select('word, kind, tone'), sb.rpc('nicknames_taken')]);
  state.words = { adj: (w ?? []).filter((x) => x.kind === 'adj'), noun: (w ?? []).filter((x) => x.kind === 'noun'), taken: new Set(taken ?? []) };
  return state.words;
}
function namesBy(t) {
  const W = state.words, out = [];
  for (const a of W.adj) for (const n of W.noun) {
    if (Math.abs(a.tone - n.tone) > 1) continue;
    const tt = (a.tone + n.tone) / 2;
    if (t === 0 && tt > 0.5) continue; if (t === 2 && tt < 1.5) continue; if (t === 1 && (tt < 0.5 || tt > 1.5)) continue;
    const nm = a.word + ' ' + n.word;
    if (!W.taken.has(nm)) out.push(nm);
  }
  return out;
}
async function scrNick() {
  const viewAtStart = viewVersion;
  const kid = state.own; if (!kid) return scrHome();
  await loadWords();
  const first = !kid.nickname;
  const until = kid.nickname_at ? new Date(new Date(kid.nickname_at).getTime() + 14 * DAY) : null;
  const locked = !first && until && until > new Date();
  cands = []; pick = -1;
  if (viewAtStart !== viewVersion) return;
  const v = mount(`
    ${head('랭킹에 쓸 이름 뽑기', { back: !first, right: first ? '<span class="pill p-fire">처음 한 번</span>' : '' })}
    <div style="text-align:center;margin:2px 0 10px">${pib(kid.look, 120, 'm-idle')}</div>
    <p class="muted small" style="text-align:center;margin-bottom:12px">랭킹에서 친구들에게 보일 이름이에요.<br>마음에 드는 이름이 나올 때까지 돌려 보세요!</p>
    ${locked ? `<div class="card" style="text-align:center"><b>지금 이름: ${esc(kid.nickname)}</b><p class="muted small" style="margin-top:6px">${until.getMonth() + 1}월 ${until.getDate()}일부터 다시 바꿀 수 있어요</p></div>` : `
    <div class="tone" id="tone">${['귀여운', '반반', '멋있는'].map((t, i) => `<button class="${i === tone ? 'on' : ''}" data-t="${i}">${t}</button>`).join('')}</div>
    <div class="slot" id="slot" style="margin:12px 0"><span id="slotT">${esc(kid.nickname || '?')}</span></div>
    <div id="cands"></div>
    <button class="btn press" id="spin" style="margin-top:6px">🎲 이름 돌리기</button>
    <p class="muted small" style="text-align:center;margin-top:10px">정한 이름은 2주 뒤에 다시 바꿀 수 있어요</p>`}`);
  if (locked) return;
  $$('#tone button', v).forEach((b) => { b.onclick = () => { tone = +b.dataset.t; $$('#tone button').forEach((x) => x.classList.toggle('on', x === b)); }; });
  $('#spin').onclick = () => {
    if ($('#spin').disabled) return;
    $('#spin').disabled = true;
    const pool = namesBy(tone), slot = $('#slot'), t = $('#slotT');
    if (!pool.length) { $('#spin').disabled = false; return toast('남은 이름이 없어요. 다른 분위기를 골라 주세요'); }
    slot.classList.add('spin'); pick = -1;
    let n = 0;
    const iv = setInterval(() => {
      if (!slot.isConnected) { clearInterval(iv); return; }
      t.textContent = pool[Math.floor(Math.random() * pool.length)];
      if (++n > 16) {
        clearInterval(iv); slot.classList.remove('spin');
        const set = new Set(); while (set.size < 3 && set.size < pool.length) set.add(pool[Math.floor(Math.random() * pool.length)]);
        cands = [...set]; t.textContent = '셋 중에 골라요!'; drawCands(); $('#spin').disabled = false;
      }
    }, 70);
  };
}
function drawCands() {
  const box = $('#cands'); if (!box) return;
  box.innerHTML = cands.map((c, i) => `<button class="cand press ${i === pick ? 'sel' : ''}" data-i="${i}">${esc(c)}<small>${i === pick ? '선택됨 ✓' : '이걸로'}</small></button>`).join('')
    + (pick >= 0 ? '<button class="btn press" id="useNick" style="margin:4px 0 8px;background:var(--text);box-shadow:none">이 이름으로 정하기</button>' : '');
  $$('.cand', box).forEach((b) => { b.onclick = () => { pick = +b.dataset.i; drawCands(); }; });
  const u = $('#useNick');
  if (u) u.onclick = async () => {
    u.disabled = true;
    const { data, error } = await sb.rpc('set_my_nickname', { p_nick: cands[pick] });
    if (error) { u.disabled = false; state.words = null; return toast(error.message); }
    state.own.nickname = data; state.own.nickname_at = new Date().toISOString();
    toast('이름을 정했어요! 랭킹에 이렇게 보여요');
    setTimeout(() => go({ v: 'home' }, { replace: true }), 800);
  };
}

/* ------------------------------------------------------------------ */
/* 랭킹 — 같은 스테이지의 주간 고정 그룹                                             */
/* ------------------------------------------------------------------ */
const fp = value => Number(value || 0).toLocaleString('ko-KR', {maximumFractionDigits:2});
function rankingBreakdown(p, title='이번 주 랭킹 점수') {
 if(!p)return '';
 if(p.policy_applied===false)return `<div class="card"><b>이전 기준으로 보관한 점수 · ${fp(p.points)}점</b><p class="muted small">새 가산 규칙을 과거 기록에 다시 적용하지 않았어요.</p></div>`;
 return `<div class="card ranking-breakdown"><b>${title} · ${fp(p.points)}점</b><div class="rc"><span>기본 학습</span><b>${fp(p.base_points)}점</b></div><div class="rc"><span>목표 초과 학습</span><b>+${fp(p.extra_points)}점</b></div><div class="rc"><span>형성평가${p.test_score==null?' · 미발송/미입력':''}</span><b>+${fp(p.test_points)}점</b></div><div class="rc"><span>성장·90점 이상 유지 보너스</span><b>+${fp(p.growth_points)}점</b></div><p class="muted small">기본 목표 달성은 ${fp(p.base_points)}/100점이에요. 완주 보상과 꾸준함 등급은 기본 목표로 판단해요.</p></div>`;
}
async function scrRank(r = {}) {
 const viewAtStart=viewVersion;
 const [L]=await Promise.all([loadLeague(),loadKid(state.own)]);
 if(viewAtStart!==viewVersion)return;
 if(!L)return mount(`${head('랭킹',{back:false})}<div class="card empty">주간 목표를 준비하고 있어요.</div>`,{tab:'rank'});
 const p=L.personal||{},M=L.members||[];
 const v=mount(`${head('학습 리그',{back:false,right:'<button class="pill p-gray press" id="rules">점수 규칙 ⓘ</button>'})}
 <div class="card" style="background:var(--mintbg)"><b>${!L.eligible?'이번 주는 준비주 또는 목표 대기 중이에요. 다음 주 목표를 선생님과 확인해 주세요.':p.complete?'이번 주 기본 목표를 모두 채웠어요! 초과 공부와 시험 점수도 순위에 더해져요.':`기본 목표 ${p.completed||0}/${p.total||0}일 완료 · 남은 공부도 이어 가 보자!`}</b><p class="small">꾸준함 등급 ${esc(L.tier_name)} · 기본 목표를 모두 완주하면 마감 후 등급 상승${L.tier>=5?' · 현재 최고 등급':''}</p></div>
 ${rankingBreakdown(p)}
 <p class="muted small">STAGE ${L.stage} · 실제 학생 ${M.length}명 · 동점은 공동 순위 · 월요일에 지난주 정산</p>
 <div id="lb">${M.length?M.map(x=>lrow(x,0,L.stage)).join(''):'<div class="card empty">아직 비교할 주간 목표가 준비되지 않았어요. 공부 기록과 누적 보상은 계속 남아요.</div>'}</div>
 <p class="muted small">주중 순위는 진행 중이에요. 같은 날의 기록은 합산하고, 예정일 밖에서 한 추가 공부도 가산해요. 형성평가 점수는 리포트를 발송하면 반영돼요.</p>`,{tab:'rank'});
 $('#rules',v).onclick=rulesSheet;
}
function lrow(x,_i,stage) {
 const gold=x.look?.fx==='gold';
 return `<div class="lrow ${x.me?'me':''} ${x.rank===1?'top':''}"><span class="rk">${x.ties>1?'공동 ':''}${x.rank}</span><span class="av ${gold?'gav':''}">${pib(x.look,32)}</span><span class="nm">${esc(x.nick)}${x.me?' <span style="color:var(--fire)">(나)</span>':''}<small>STAGE ${x.stage??stage}${x.me?` · 기본 ${fp(x.breakdown?.base_points)} + 초과 ${fp(x.breakdown?.extra_points)} + 시험·보너스 ${fp(Number(x.breakdown?.test_points||0)+Number(x.breakdown?.growth_points||0))}`:''}</small></span><span class="pt">${fp(x.points)}점</span></div>`;
}
function rulesSheet() {
 const p=state.league?.policy||{},problem=p.problem_weight??60,time=p.time_weight??40,div=p.test_divisor??4,bonus=p.bonus??5,high=p.high_score??90;
 sheet(`<b style="font-size:18px;font-weight:900">랭킹과 보상 규칙</b><div class="card" style="margin-top:12px;box-shadow:none">
 <p>예정된 학습일마다 문제 목표 ${problem}% + 확인한 학습시간 ${time}%를 계산해요. 기본 점수는 예정일 평균으로 최대 100점이에요.</p>
 <p>목표를 넘긴 문제와 시간은 같은 비중으로 추가 점수를 받아요. 추가 점수에는 상한이 없어요. 예정일 밖의 공부는 그날의 목표 대비 학습량을 추가 점수로 넣고, 주간 예정일 수로 나눠요.</p>
 <p>발송된 형성평가 점수 ÷ ${div} = 최대 ${100/div}점. 직전 발송 시험보다 오르거나, 직전과 이번 시험 모두 ${high}점 이상이면 +${bonus}점이에요. 둘 다 해당해도 한 번만, 첫 시험은 이 보너스가 없어요.</p></div>
 <p class="small">예정일마다 문제와 시간을 모두 채우면 기본 100점. 모두 두 배 공부하면 학습 200점이 돼요. 이 점수에 형성평가와 보너스를 더해 순위를 매겨요. 점수는 소수 둘째 자리까지 표시하고 동점은 공동 순위예요.</p>
 <p class="small">완주·연속 기록은 기본 목표로 판단해요. 결석을 시험·추가 점수로 메우지 않아요. 마감한 주에 기본 80점을 달성하면 포도 파이뿔·메달, 마감한 주의 기본 목표를 100점 완주하면 왕관·꾸준함 등급 상승을 받아요. 순위와는 별개예요.</p>
 <p class="small">문제를 목표보다 25% 더 풀거나, 확인한 학습시간을 15분 더 채우면 하루 별 하나. 별 3개는 도전 별빛, 7개는 혜성 머리핀이에요. 누적 보상은 이미 얻은 것을 유지해요. 딸기는 오공완 3일, 하트는 7일이에요.</p>
 <button class="btn press" id="okRules">알겠어요</button>`);
 $('#okRules').onclick=closeSheet;
}

/* ------------------------------------------------------------------ */
/* 꾸미기 — 공부 기록으로만 열림 (재화 · 뽑기 · 결제 없음)                  */
/* ------------------------------------------------------------------ */
let decoTab = 'ch';
let decoSaving = false;
async function scrDeco() {
  const viewAtStart = viewVersion;
  const kid = state.own;
  const c = await loadKid(kid);
  const S = c.stats, look = { ch: 'pi_red', item: 'none', fx: 'none', ...(kid.look || {}) };
  const list = decoTab === 'ch' ? CHARS : decoTab === 'item' ? ITEMS : EFFECTS;
  const key = decoTab === 'ch' ? 'ch' : decoTab === 'item' ? 'item' : 'fx';
  const opened = list.filter((x) => isOpen(x, S)).length;
  let lastPart = null;
  if (viewAtStart !== viewVersion) return;
  const v = mount(`
    ${head('꾸미기', { back: false, right: `<span class="pill p-pink">${opened} / ${list.length} 모음</span>` })}
    <div class="stagebox" id="stg">${pib(look, 170, 'm-idle')}</div>
    <div class="seg">${[['ch', '캐릭터'], ['item', '소품'], ['fx', '효과']].map(([k, t]) => `<button class="${k === decoTab ? 'on' : ''}" data-k="${k}">${t}</button>`).join('')}</div>
    <div class="items">${list.map((x) => {
      const open = isOpen(x, S), on = look[key] === x.id;
      const th = decoTab === 'ch' ? `<img src="chars/${x.id}.png" style="height:70px" class="${open ? '' : 'lock'}" alt="">`
        : x.id === 'none' ? '<span style="font-size:26px;color:var(--muted);padding-bottom:20px">✕</span>'
        : pib(decoTab === 'item' ? { ch: look.ch, item: x.id, fx: 'none' } : { ch: look.ch, item: 'none', fx: x.id }, 56, open ? '' : 'lock');
      const prog = !open && x.need && !['cheer'].includes(x.need[0]) ? `<div class="bar"><i data-w="${Math.round(progress(x, S) * 100)}%"></i></div>` : '';
      return `<button class="it press ${on ? 'on' : ''} ${open ? '' : 'locked'} ${x.weekly && open ? 'wk' : ''}" data-id="${x.id}">${x.weekly && open ? `<span class="wkt">${x.weekly}</span>` : ''}<div class="th">${th}</div>${x.name}${open ? '' : `<span class="lk">🔒</span><span class="cond">${x.cond}</span>${prog}`}</button>`;
    }).join('')}</div>
    <p class="muted small" style="margin-top:12px;text-align:center">공부한 만큼 하나씩 열려요<br>꾸민 모습은 랭킹에서 친구들에게 보여요</p>`, { tab: 'deco' });
  void lastPart;
  $$('.seg button', v).forEach((b) => { b.onclick = () => { if (decoSaving) return; decoTab = b.dataset.k; scrDeco(); }; });
  $$('.it', v).forEach((b) => {
    b.onclick = async () => {
      const x = list.find((y) => y.id === b.dataset.id);
      if (!isOpen(x, S)) return toast(`🔒 ${x.cond} 달성하면 열려요`);
      if (decoSaving) return;
      decoSaving = true;
      $$('.it, .seg button', v).forEach((e) => { e.disabled = true; });
      const next = { ...look, [key]: x.id };
      $$('.it', v).forEach((e) => e.classList.toggle('on', e === b));
      const stg = $('#stg', v); stg.innerHTML = pib(next, 170, 'boing');
      setTimeout(() => { const p = $('.pw', stg); if (p) { p.classList.remove('boing'); p.classList.add('m-idle'); } }, 600);
      try {
        const { data, error } = await sb.rpc('set_my_look', { p_look: next });
        if (error) throw error;
        kid.look = data; Object.assign(look, data);
      } catch (e) {
        toast(e.message || '저장하지 못했어요. 다시 골라 주세요');
        if (v.isConnected && state.route?.v === 'deco') { stg.innerHTML = pib(look, 170, 'm-idle'); $$('.it', v).forEach(e => e.classList.toggle('on', e.dataset.id === look[key])); }
      } finally {
        decoSaving = false;
        if (v.isConnected) $$('.it, .seg button', v).forEach((e) => { e.disabled = false; });
      }
    };
  });
}

/* ------------------------------------------------------------------ */
/* 기록 탭 (학생)                                                        */
/* ------------------------------------------------------------------ */
async function scrRec() {
  const viewAtStart = viewVersion;
  const kid = state.own;
  const c = await loadKid(kid);
  await loadAlerts();
  const last = c.reps[c.reps.length - 1], lastW = c.weekly[0];
  const unread = state.alerts.filter((n) => !n.read_at).length;
  if (viewAtStart !== viewVersion) return;
  const v = mount(`
    ${head('기록', { back: false })}
    ${lastW ? `<button class="card press navBtn" id="lastW" style="display:block;text-align:left"><div class="row" style="justify-content:space-between"><b style="font-weight:900">📊 주간 리포트 · ${WK.weekLabel(lastW.week_start)}</b><span class="pill p-sky">${lastW.test_score != null ? `형성평가 ${lastW.test_score}점` : '학습 포인트'}</span></div><div class="muted small" style="margin-top:6px;font-weight:700">${lastW.gold ? '🏅 기준 통과 · ' : ''}눌러서 한 주 기록 보기</div></button>` : '<div class="card"><b style="font-weight:900">📊 주간 리포트</b><p class="muted small" style="margin-top:4px">금요일 형성평가가 끝나면 여기에 와요</p></div>'}
    ${last ? `<button class="card press navBtn" id="lastRep" style="display:block;text-align:left"><div class="row" style="justify-content:space-between"><b style="font-weight:900">🔥 최근 지옥방 · ${dayLabel(last.started_at)}</b><span class="pill ${last.participation_ok ? 'p-mint' : 'p-gray'}">${last.participation_ok ? '오공완' : '노력 기록'}</span></div><div class="muted small" style="margin-top:6px;font-weight:700">문제 ${last.solved}/${last.assigned} · 정답률 ${last.accuracy}% · 순공 ${hm(last.stay_minutes)}</div></button>` : ''}
    <div class="navList">
      <button class="navBtn press" data-nav="growth"><span>공부 달력 · 누적 기록</span><span class="chev">›</span></button>
      <button class="navBtn press" data-nav="weeklies"><span>주간 리포트 모아보기</span><span class="chev">›</span></button>
      <button class="navBtn press" data-nav="history"><span>지난 지옥방 전체</span><span class="chev">›</span></button>
      <button class="navBtn press" data-nav="alerts"><span>받은 알림${unread ? `<em class="badge">새 알림 ${unread}</em>` : ''}</span><span class="chev">›</span></button>
    </div>`, { tab: 'rec' });
  const lr = $('#lastRep'); if (lr) lr.onclick = () => go({ v: 'detail', kid: kid.id, s: last.session_id });
  const lw = $('#lastW'); if (lw) lw.onclick = () => go({ v: 'weekly', kid: kid.id, w: lastW.week_start });
  $$('[data-nav]', v).forEach((b) => { b.onclick = () => go({ v: b.dataset.nav, kid: kid.id }); });
}

/* ------------------------------------------------------------------ */
/* 나 탭 (학생)                                                         */
/* ------------------------------------------------------------------ */
async function scrMe() {
  const viewAtStart = viewVersion;
  const kid = state.own;
  const c = await loadKid(kid);
  const until = kid.nickname_at ? new Date(new Date(kid.nickname_at).getTime() + 14 * DAY) : null;
  if (viewAtStart !== viewVersion) return;
  const v = mount(`
    ${head('나', { back: false })}
    <div class="meTop">${pib(kid.look, 130, 'm-idle')}<div class="nick">${esc(kid.nickname || '이름을 정해 주세요')}</div>
      <div class="muted small">${esc(kid.name)} · ${esc(kid.grade || '')} · STAGE ${kid.stage}</div><span class="pill p-sun" style="margin-top:8px">🌟 ${effortTitle(c.stats.extra_days || 0)}</span></div>
    <div id="ncHost" style="margin-top:12px"></div>
    ${c.surveys.map(s=>s.version===2?checkinPrompt(s):legacyPrompt(s)).join('')}
    <div class="navList">
      <button class="navBtn press" id="nickBtn"><span>랭킹 이름 바꾸기 <small class="muted">${until && until > new Date() ? `${until.getMonth() + 1}/${until.getDate()}부터` : '2주에 한 번'}</small></span><span class="chev">›</span></button>
      <button class="navBtn press" id="notiBtn"><span>알림 다시 설정하기</span><span class="chev">›</span></button>
      <button class="navBtn press" id="pwBtn"><span>비밀번호 바꾸기</span><span class="chev">›</span></button>
      <button class="navBtn press" id="outBtn"><span style="color:var(--red)">로그아웃</span><span class="chev">›</span></button>
    </div>`, { tab: 'me' });
  bindSurveyCards(kid);
  $('#nickBtn').onclick = () => go({ v: 'nick' });
  $('#notiBtn').onclick = async () => { try { await enablePush(); } catch (e) { fail(e); } renderNotifyCard($('#ncHost')); };
  $('#pwBtn').onclick = () => go({ v: 'password' });
  $('#outBtn').onclick = signOut;
  await renderNotifyCard($('#ncHost'));
  void v;
}

// 보호자 메뉴
function menuSheet() {
  sheet(`<div class="navList">
    <button class="navBtn press" id="mNoti"><span>알림 다시 설정하기</span></button>
    <button class="navBtn press" id="mPw"><span>비밀번호 바꾸기</span></button>
    <button class="navBtn press" id="mOut"><span style="color:var(--red)">로그아웃</span></button>
    <button class="navBtn press" id="mClose"><span>닫기</span></button></div>`);
  $('#mNoti').onclick = async () => { closeSheet(); try { await enablePush(); } catch (e) { fail(e); } renderNotifyCard(); };
  $('#mPw').onclick = () => { closeSheet(); go({ v: 'password' }); };
  $('#mOut').onclick = () => { closeSheet(); signOut(); };
  $('#mClose').onclick = closeSheet;
}

/* ------------------------------------------------------------------ */
/* 데일리 리포트 · 수업 상세                                             */
/* ------------------------------------------------------------------ */
function reportCard(r, sum, { student = false } = {}) {
  r = { ...r, participation_ok: r.day_ok ?? r.participation_ok };
  const d = new Date(r.started_at);
  const tier = Math.max(1, Math.min(4, Number(r.stage) || 1));
  const tag = (ok, warn, t) => `<span class="tag ${ok ? 'ok' : warn ? 'warn' : 'bad'}">${t}</span>`;
  const metric = (label, val, small, pct, note, cls = '') => `<div class="metric"><div class="top"><span>${label}</span><b>${val}<small>${small}</small></b></div>
    <div class="bar"><i class="${cls}" data-w="${Math.max(0, Math.min(100, pct))}%"></i></div><div class="note">${note}</div></div>`;
  const neg = sum?.negative_count ?? 0;
  const parts = [sum?.drowsy_count && `졸음 ${sum.drowsy_count}`, sum?.distracted_count && `딴짓 ${sum.distracted_count}`, sum?.away_count && `자리 이탈 ${sum.away_count}`].filter(Boolean);
  const pc = r.grade_percentile;
  return `<div class="rep">
    <div class="repHead"><div><strong>${esc(r.student_name)}${r.student_grade ? ' · ' + esc(r.student_grade) : ''}</strong>
      <span>${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]}) 지옥방</span></div>
      <div class="gauge" aria-label="스테이지 ${tier}"><span class="gLab">STAGE</span><span class="gNum">${tier}</span><span class="gBars">${[1, 2, 3, 4].map((i) => `<i class="${i <= tier ? 'on' : ''}"></i>`).join('')}</span></div></div>
    <div class="repBody">
      ${metric('오늘 할당량', r.solved, ` / ${r.assigned}문제`, r.completion, `${tag(r.completion >= 100, r.completion >= 85, r.completion >= 100 ? '완료' : '조금 남음')} ${r.completion >= 100 ? `할당량의 ${r.completion}%` : `${r.assigned - r.solved}문제 남음`}`)}
      ${metric('정답률', `${r.accuracy}%`, ` / 목표 ${r.target_accuracy}%`, r.accuracy, `${tag(r.accuracy >= r.target_accuracy, r.accuracy >= r.target_accuracy - 10, r.accuracy >= r.target_accuracy ? '달성' : '조금 아쉬움')}`, 'mint')}
      ${metric('순공시간', hm(r.stay_minutes), ' / '+hm(r.mandatory_minutes), r.stay_minutes * 100 / r.mandatory_minutes, `${tag(r.stay_ok, false, r.stay_ok ? '채움' : '조금 모자람')} ${r.stay_ok ? (r.stay_minutes > r.mandatory_minutes ? `${r.stay_minutes - r.mandatory_minutes}분 더 했어요` : '목표 시간을 채웠어요') : `${r.mandatory_minutes - r.stay_minutes}분 모자라요`}`, 'mint')}
      
      <div class="warnBox">${neg ? `수업 중 경고 <b>${neg}회</b> · ${parts.join(' · ')}` : '졸음 · 딴짓 · 자리 이탈 없이 끝까지 했어요'}</div>
      <div class="split"><div><span>누적 문제</span><b>${r.cumulative_problems.toLocaleString('ko-KR')}<small>+${r.solved}</small></b></div><div><span>1만 문제까지</span><b>${r.to_ten_thousand.toLocaleString('ko-KR')}</b></div></div>
      ${r.memo ? `<div class="memoBox">선생님 메모 · ${esc(r.memo)}</div>` : ''}
      ${student ? `<div class="ptsBox"><b style="font-weight:900;font-size:13px">오늘의 학습 기록</b>${pointRows(r)}</div>` : ''}
      <div class="verdict ${r.participation_ok ? 'ok' : 'bad'}"><span class="vMark">${r.participation_ok ? '🔥' : '💪'}</span>
        <div><strong>${r.participation_ok ? '오공완' : '노력 기록'}</strong><span>${[r.stay_ok ? '순공 1시간 채움' : '순공 1시간 미만', r.task_ok ? '할당량 완료' : `할당량 ${r.completion}%`].join(' · ')}</span></div></div>
    </div></div>`;
}

async function scrDetail(kid, sessionId) {
  const viewAtStart = viewVersion;
  const [{ data: sum }, { data: evs }, { data: rep }] = await Promise.all([
    sb.from('session_summaries').select('*').eq('session_id', sessionId).eq('student_id', kid.id).maybeSingle(),
    sb.from('events').select('*').eq('session_id', sessionId).eq('student_id', kid.id).order('created_at'),
    sb.from('daily_reports').select('*').eq('session_id', sessionId).maybeSingle(),
  ]);
  if (state.route?.v !== 'detail') return;
  const rows = (evs ?? []).map((e) => { const t = TYPE[e.type] ?? { icon: '•', label: e.type }; return `<div class="row"><span class="when">${hhmm(e.created_at)}</span><div class="grow"><b>${t.icon} ${t.label}</b>${e.memo ? `<p>${esc(e.memo)}</p>` : ''}</div></div>`; }).join('');
  if (viewAtStart !== viewVersion) return;
  mount(`${head(sum ? `${dayLabel(sum.started_at)} 지옥방` : '지옥방')}
    ${rep ? reportCard(rep, sum, { student: state.mode === 'student' }) : ''}
    <div class="card"><b style="font-weight:900">수업 중 기록</b>
      ${sum ? `<p class="muted small" style="margin:2px 0 6px">${new Date(sum.started_at).toLocaleString('ko-KR')}${sum.ended_at ? ` · ${Math.round((new Date(sum.ended_at) - new Date(sum.started_at)) / 60000)}분` : ''}</p>` : ''}
      <div class="list">${rows || '<p class="empty">이 수업에는 기록이 없어요</p>'}</div></div>`);
}

/* ------------------------------------------------------------------ */
/* 주간 리포트                                                           */
/* ------------------------------------------------------------------ */
function weekObj(kid, c, ws) {
  const wr = c.weekly.find((w) => w.week_start === ws) ?? null;
  const prevWr = c.weekly.find((w) => w.week_start === WK.addDays(ws, -7)) ?? null;
  const scores = c.weekly.filter((w) => w.week_start < ws && w.test_score != null).map((w) => w.test_score);
  let rankText = '';
  if (state.mode === 'student') {
    const h = c.hist.find((x) => x.week_start === ws);
    if (h) rankText = `${h.rank}위${h.promoted ? ' · 꾸준함 등급 상승!' : ''}`;
    else if (ws === c.ws && state.league) rankText = `지금 ${myRank(state.league)}위 · 주중 임시 순위`;
  }
  return WK.assembleWeek({ student: kid, schedule: c.sched, reps: c.reps, sums: c.sums, wr, prevWr, scores, ws, teacher: wr?.teacher_name, rankText, plans: c.stats.week_plans });
}
async function scrWeekly(kid, ws) {
  const viewAtStart = viewVersion;
  const c = await loadKid(kid);
  if (state.mode === 'student' && !state.league) await loadLeague().catch(() => null);
  const rankingResult = state.mode === 'student' ? await sb.rpc('ranking_summary',{p_student:kid.id,p_week:ws}) : {data:null};
  if(rankingResult.error)throw rankingResult.error;
  const s = weekObj(kid, c, ws);
  const B = WK.bar3(s);
  const goldNow = state.mode === 'student' && s.gold && ws === WK.addDays(c.ws, -7);
  if (viewAtStart !== viewVersion) return;
  mount(`${head('주간 리포트', { right: `<span class="pill p-sky">${s.label}</span>` })}
    ${WK.weeklyCard(s, { rank: state.mode === 'student', ch: kid.look?.ch })}
    ${rankingBreakdown(rankingResult.data,'이 주의 랭킹 점수')}
    ${goldNow && B.all ? '<button class="btn press" id="useGold" style="margin-top:10px;background:linear-gradient(90deg,#F5B700,#FF8A3D)">🏅 황금 오라 바로 쓰기</button>' : ''}
    <p class="muted small" style="text-align:center;margin-top:10px">${state.mode === 'student' ? '' : '보호자 화면에는 랭킹이 보이지 않아요'}</p>`);
  const g = $('#useGold');
  if (g) g.onclick = async () => {
    const { data, error } = await sb.rpc('set_my_look', { p_look: { ...kid.look, fx: 'gold' } });
    if (error) return toast(error.message);
    kid.look = data; decoTab = 'fx'; go({ v: 'deco' });
    toast('황금 오라를 썼어요! 이번 주 동안 랭킹에서도 보여요');
  };
}
async function scrWeeklies(kid) {
  const viewAtStart = viewVersion;
  const c = await loadKid(kid);
  if (viewAtStart !== viewVersion) return;
  mount(`${head('주간 리포트 모아보기')}
    <div class="card"><div class="list">${c.weekly.map((w) => `<div class="row" data-w="${w.week_start}" style="cursor:pointer"><span class="when">${WK.weekLabel(w.week_start)}</span><div class="grow"><b>${w.test_score != null ? `형성평가 ${w.test_score}점` : '이번 주 학습 포인트'}${w.gold ? ' · 🏅' : ''}</b><p>${WK.weekRange(w.week_start)}</p></div><span class="chev">›</span></div>`).join('') || '<p class="empty">아직 받은 주간 리포트가 없어요</p>'}</div></div>`);
  $$('[data-w].row').forEach((r) => { r.onclick = () => go({ v: 'weekly', kid: kid.id, w: r.dataset.w }); });
}

/* ------------------------------------------------------------------ */
/* 설문 — 지금 쓰는 개강 후 설문 문항 그대로 (이름 · 학년은 앱이 아니까 뺌)  */
/* 문항 키는 서버 survey_flags() 와 같아야 합니다.                          */
/* ------------------------------------------------------------------ */
let svState = { id: null, step: -1, ans: {} };
async function scrSurvey(kid, id) {
  const viewAtStart = viewVersion;
  const c = await loadKid(kid, true);
  const row = c.surveys.find((s) => s.id === id);
  if (!row) {
    if (viewAtStart !== viewVersion) return;
  mount(`${head('설문')}<div class="card empty">이미 답했거나 아직 열리지 않은 설문이에요. 고마워요!</div>`);
    return;
  }
  if (row.version === 2) {
    if (viewAtStart !== viewVersion) return;
    mount(`${head('학습 체크인')}<div id="checkinRoot"></div>`);
    const leave=()=>{delete state.kid[kid.id];go(state.mode==='student'?{v:'home',kid:kid.id}:{v:'student',kid:kid.id});};
    mountCheckin($('#checkinRoot'),row,{
      leave,
      save:async ({action,answers,revision})=>{
        const {data,error}=await sb.rpc('act_checkin',{p_id:id,p_action:action,p_answers:answers,p_revision:revision});
        if(error)throw error;delete state.kid[kid.id];return data;
      },
      onDone:result=>{mount(`${head('학습 체크인')}<div class="card"><b>${result.status==='skipped'?'건너뛰었어요':'남긴 내용을 전달했어요'}</b><p class="muted">${esc(row.schema.thanks)}</p><button class="btn press" id="ciDone">공부 화면으로</button></div>`);$('#ciDone').onclick=leave;}
    });
    return;
  }
  if (svState.id !== id) svState = { id, step: -1, ans: {} };
  const f = SV[row.kind];
  const step = svState.step;
  if (step < 0) {
    if (viewAtStart !== viewVersion) return;
  mount(`${head('설문', { right: '<span class="pill p-grape">1분 설문</span>' })}
      <div class="hero" style="text-align:center">${pib(kid.look, 110, 'm-idle')}<div class="say" style="margin-top:6px;text-align:left">${f.h1} ${f.lede}</div></div>
      <div class="card"><div class="row" style="justify-content:space-between"><b style="font-weight:900">📝 ${f.t}</b><span class="pill p-gray">${f.items.length}문항</span></div>
        <p class="muted small" style="margin:6px 0 12px">고르기만 하면 바로 다음 문항으로 넘어가요.</p>
        <button class="btn press" id="svGo">지금 답하기</button></div>`);
    $('#svGo').onclick = () => { svState.step = 0; scrSurvey(kid, id); };
    return;
  }
  if (step >= f.items.length) {
    const { error } = await sb.rpc('answer_survey', { p_id: id, p_answers: svState.ans });
    if (error) { toast(error.message); svState.step = f.items.length - 1; return scrSurvey(kid, id); }
    delete state.kid[kid.id];
    svState = { id: null, step: -1, ans: {} };
    if (viewAtStart !== viewVersion) return;
  mount(`<div style="text-align:center;padding-top:60px">${pib(kid.look, 150, 'm-cheer m-settle')}
      <div class="big" style="margin:14px 0 8px;font-size:26px">고마워요!</div>
      <p class="muted" style="line-height:1.6">${f.thanks}</p>
      <button class="btn press" style="margin-top:22px" id="svBack">확인</button></div>`);
    confetti();
    $('#svBack').onclick = () => go(state.mode === 'student' ? { v: 'home' } : { v: 'student', kid: kid.id }, { replace: true });
    return;
  }
  const it = f.items[step];
  const cur = svState.ans[it.k];
  const body = it.type === 'memo'
    ? `<textarea class="memo" id="svMemo" placeholder="${esc(it.ph)}">${esc(cur?.v || '')}</textarea>
       <button class="btn press" id="svNext" style="margin-top:12px">${step === f.items.length - 1 ? '제출하기' : '다음'}</button>
       <button class="btn ghost press" id="svSkip" style="margin-top:8px">없어요 · 건너뛰기</button>`
    : it.opts.map((o, i) => `<button class="cand press ${cur?.v === o ? 'sel' : ''}" data-i="${i}">${esc(o)}<small>${it.type === 'scale' ? (i + 1) + ' / ' + it.opts.length : ''}</small></button>`).join('');
  let advancing = false;
  if (viewAtStart !== viewVersion) return;
  const v = mount(`<div class="row" style="justify-content:space-between;margin:4px 0 10px"><button class="back press" id="svPrev">‹</button><span class="pill p-grape">${f.t} · ${step + 1} / ${f.items.length}</span></div>
    <div class="bar" style="margin-bottom:22px"><i data-w="${Math.round((step + 1) / f.items.length * 100)}%"></i></div>
    <div class="qTitle">${esc(it.title)}</div>${body}`);
  $('#svPrev').onclick = () => { svState.step--; scrSurvey(kid, id); };
  $$('[data-i]', v).forEach((b) => {
    b.onclick = () => {
      if (advancing) return; advancing = true;
      $$('[data-i]', v).forEach((x) => { x.disabled = true; });
      const i = +b.dataset.i;
      svState.ans[it.k] = { v: it.opts[i], i: i + 1 };
      $$('[data-i]', v).forEach((x) => x.classList.toggle('sel', x === b));
      setTimeout(() => { if (!v.isConnected || state.route?.v !== 'survey' || svState.id !== id || svState.step !== step) return; svState.step = step + 1; scrSurvey(kid, id); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280);
    };
  });
  const nx = $('#svNext');
  if (nx) nx.onclick = () => { if (advancing) return; advancing = true; const t = $('#svMemo').value.trim(); if (t) svState.ans[it.k] = { v: t }; else delete svState.ans[it.k]; svState.step++; scrSurvey(kid, id); };
  const sk = $('#svSkip');
  if (sk) sk.onclick = () => { if (advancing) return; advancing = true; delete svState.ans[it.k]; svState.step++; scrSurvey(kid, id); };
}

/* ------------------------------------------------------------------ */
/* 받은 알림 (운영 앱과 같은 동작)                                        */
/* ------------------------------------------------------------------ */
async function loadAlerts() {
  const { data } = await sb.from('notifications').select('*').eq('recipient_id', state.uid)
    .order('created_at', { ascending: false }).limit(100);
  state.alerts = data ?? [];
  state.newestAlertId = state.alerts[0]?.id ?? state.newestAlertId;
}
function alertFor(n, kid) { const sid = n.payload?.student_id ?? n.student_id; return !sid || sid === kid.id; }

async function openAlerts(kid) {
  await loadAlerts();
  if (state.route?.v !== 'alerts') return;
  const mine = state.alerts.filter((n) => alertFor(n, kid));
  const v = mount(`${head('받은 알림')}<div class="card"><div class="list" id="alList"></div></div>`);
  const box = $('#alList', v);
  let lastDay = null;
  const addRows = (rows) => {
    for (const n of rows) {
      const k = dayKey(n.created_at);
      if (k !== lastDay) { lastDay = k; box.append(el('div', 'dayHead' + (dayLabel(n.created_at) === '오늘' ? ' today' : ''), dateHead(n.created_at))); }
      const row = el('div', 'row' + (n.read_at ? '' : ' unread'));
      row.append(el('span', 'when', hhmm(n.created_at)));
      const g = el('div', 'grow'); g.append(el('b', null, n.title), el('p', null, n.body)); row.append(g);
      const p = n.payload ?? {};
      if (p.session_id || p.week_start || p.survey_id || p.checkin_case) {
        row.style.cursor = 'pointer';
        row.onclick = () => (p.checkin_case ? openTarget(p) : p.view === 'survey' ? go({ v: 'survey', kid: kid.id, id: p.survey_id })
          : p.view === 'weekly' ? go({ v: 'weekly', kid: kid.id, w: p.week_start }) : go({ v: 'detail', kid: kid.id, s: p.session_id }));
      }
      box.append(row);
    }
  };
  if (!mine.length) box.append(el('p', 'empty', '받은 알림이 없어요'));
  addRows(mine);
  if (state.alerts.length >= 100) {
    let oldest = state.alerts[state.alerts.length - 1].created_at;
    const more = el('button', 'btn ghost sm press', '이전 알림 더 보기');
    more.onclick = async () => {
      more.disabled = true;
      const { data, error } = await sb.from('notifications').select('*').eq('recipient_id', state.uid).lt('created_at', oldest)
        .order('created_at', { ascending: false }).limit(100);
      if (error) { more.disabled = false; return fail(error); }
      const rows = data ?? []; if (rows.length) oldest = rows[rows.length - 1].created_at;
      addRows(rows.filter((n) => alertFor(n, kid)));
      if (rows.length < 100) more.remove(); else more.disabled = false;
    };
    box.parentNode.append(more);
  }
  const unread = mine.filter((n) => !n.read_at).map((n) => n.id);
  if (unread.length) await sb.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unread);
}

/* ------------------------------------------------------------------ */
/* 공부 달력 · 누적 기록 (운영 앱과 같은 계산, 오공완 = 순공 1시간 또는 할당량 완료) */
/* ------------------------------------------------------------------ */
async function openGrowth(kid, ym) {
  const [{ data: reps, error }, { data: sums }, attendance] = await Promise.all([
    sb.from('daily_reports').select('session_id, started_at, solved, stay_minutes, participation_ok')
      .eq('student_id', kid.id).order('started_at', { ascending: true }).limit(2000),
    sb.from('session_summaries').select('session_id, started_at').eq('student_id', kid.id).eq('status', 'ended')
      .order('started_at', { ascending: false }).limit(500),
    sb.rpc('student_attendance_days', {p_student: kid.id}),
  ]);
  if (state.route?.v !== 'growth') return;
  if (error) return fail(error);
  const v = mount(`${head('공부 달력 · 누적 기록')}<div id="gBody"></div>`);
  const body = $('#gBody', v);

  const days = new Map();
  for (const r of reps ?? []) {
    const k = dayKey(r.started_at);
    const d = days.get(k) ?? { solved: 0, stay: 0, ok: false, reported: true, sid: null };
    d.solved += r.solved; d.stay += r.stay_minutes; d.ok = d.ok || r.participation_ok; d.sid = r.session_id;
    days.set(k, d);
  }
  if (attendance.error) return fail(attendance.error);
  for (const a of attendance.data ?? []) { const d = days.get(a.day); if (d) d.ok = a.ok; }
  for (const s of sums ?? []) { const k = dayKey(s.started_at); if (!days.has(k)) days.set(k, { solved: 0, stay: 0, ok: false, reported: false, sid: s.session_id }); }

  const nowYm = ymOf(Date.now());
  const minYm = days.size ? [...days.keys()].sort()[0].slice(0, 7) : nowYm;
  let cur = ym && ym >= minYm && ym <= nowYm ? ym : nowYm;

  const cal = el('div', 'card');
  const hd = el('div', 'calHead');
  const prev = el('button', 'calNav', '‹'), next = el('button', 'calNav', '›');
  const title = el('h3');
  hd.append(prev, title, next);
  const sumLine = el('p', 'calSum'), grid = el('div', 'calGrid'), legend = el('div', 'calLegend');
  for (const [c, t] of [['ok', '오공완'], ['bad', '노력 기록'], ['none', '리포트 없음']]) { const s = el('span'); s.append(el('i', c), document.createTextNode(t)); legend.append(s); }
  legend.append(el('span', 'calHint', '칸 숫자 = 그날 푼 문제'));
  cal.append(hd, sumLine, grid, legend);
  body.append(cal);

  const shift = (vv, n) => { const [y, m] = vv.split('-').map(Number); return ymOf(new Date(y, m - 1 + n, 1)); };
  const draw = (vv) => {
    const [y, m] = vv.split('-').map(Number);
    title.textContent = `${y}년 ${m}월`;
    prev.disabled = vv <= minYm; next.disabled = vv >= nowYm;
    grid.replaceChildren();
    WEEK.forEach((w, i) => grid.append(el('span', 'calWk' + (i === 0 ? ' sun' : ''), w)));
    for (let i = new Date(y, m - 1, 1).getDay(); i > 0; i--) grid.append(el('span'));
    const tk = dayKey(Date.now());
    let nDays = 0, nOk = 0, nSolved = 0;
    for (let dd = 1, last = new Date(y, m, 0).getDate(); dd <= last; dd++) {
      const k = `${y}-${pad(m)}-${pad(dd)}`, info = days.get(k);
      const cell = el(info ? 'button' : 'span', 'calDay' + (k === tk ? ' today' : ''));
      cell.append(el('span', 'd', String(dd)));
      if (info) {
        nDays++;
        cell.classList.add(info.reported ? (info.ok ? 'ok' : 'bad') : 'none');
        cell.append(el('b', 'n', info.reported ? String(info.solved) : '–'));
        if (info.reported) { nSolved += info.solved; if (info.ok) nOk++; }
        cell.onclick = () => go({ v: 'detail', kid: kid.id, s: info.sid });
      }
      grid.append(cell);
    }
    sumLine.replaceChildren();
    if (nDays) sumLine.append('지옥방 ', el('b', null, `${nDays}일`), ' · 오공완 ', el('b', null, `${nOk}일`), ' · 푼 문제 ', el('b', null, nSolved.toLocaleString('ko-KR')));
    else sumLine.textContent = '이 달에는 기록이 없어요.';
  };
  const setMonth = (vv) => { cur = vv; state.route = { ...state.route, ym: vv }; history.replaceState(state.route, ''); draw(vv); };
  prev.onclick = () => setMonth(shift(cur, -1));
  next.onclick = () => setMonth(shift(cur, 1));
  draw(cur);

  const list = [...days.entries()].filter(([, d]) => d.reported).sort(([a], [b]) => (a < b ? -1 : 1));
  if (!list.length) { const c = el('div', 'card'); c.append(el('b', null, '누적 기록'), el('p', 'empty', '리포트가 쌓이면 누적 그래프가 그려져요.')); body.append(c); return; }
  const toMs = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  const series = (pick) => {
    let acc = 0; const pts = [{ t: toMs(list[0][0]), v: 0 }];
    for (const [k, d] of list) { acc += pick(d); pts.push({ t: toMs(k) + DAY, v: acc }); }
    const end = dayStart(Date.now()) + DAY; if (end > pts[pts.length - 1].t) pts.push({ t: end, v: acc });
    return { pts, total: acc };
  };
  const nowM = ymOf(Date.now()), thisMonth = list.filter(([k]) => k.startsWith(nowM));
  const first = new Date(toMs(list[0][0]));
  const since = `${first.getMonth() + 1}월 ${first.getDate()}일부터 ${list.length}일`;
  const p = series((d) => d.solved);
  const c1 = el('div', 'card');
  c1.innerHTML = `<b style="font-weight:900">누적 푼 문제</b><div class="cumBig"><b>${p.total.toLocaleString('ko-KR')}</b><small>문제</small></div><p class="cumSub">${since} · 이번 달 +${thisMonth.reduce((s, [, d]) => s + d.solved, 0).toLocaleString('ko-KR')}문제</p>`;
  c1.append(cumChart(p.pts, { color: '#FF6B35', label: '누적 푼 문제 그래프', fmt: (x) => Math.round(x).toLocaleString('ko-KR') }));
  body.append(c1);
  const sv = series((d) => d.stay);
  const H = Math.floor(sv.total / 60), M = sv.total % 60;
  const c2 = el('div', 'card');
  c2.innerHTML = `<b style="font-weight:900">누적 순공시간</b><div class="cumBig">${H ? `<b>${H.toLocaleString('ko-KR')}</b><small>시간</small>` : ''}${M || !H ? `<b>${M}</b><small>분</small>` : ''}</div><p class="cumSub">${since} · 이번 달 +${hm(thisMonth.reduce((t, [, d]) => t + d.stay, 0))}</p>`;
  c2.append(cumChart(sv.pts.map((q) => ({ t: q.t, v: q.v / 60 })), { color: '#22B99A', label: '누적 순공시간 그래프', fmt: (x) => `${x >= 10 || x === 0 ? Math.round(x) : +x.toFixed(1)}h` }));
  body.append(c2);
}
function niceMax(x) { if (!(x > 0)) return 1; const p = 10 ** Math.floor(Math.log10(x)); for (const m of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (m * p >= x) return m * p; return 10 * p; }
function cumChart(pts, { color, fmt, label }) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 320, H = 158, L = 40, R = 312, T = 10, B = 128;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'cumChart'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
  const add = (parent, tag, attrs, text) => { const n = document.createElementNS(NS, tag); for (const [k, x] of Object.entries(attrs)) n.setAttribute(k, x); if (text != null) n.textContent = text; parent.append(n); return n; };
  const top = niceMax(pts[pts.length - 1].v * 1.04);
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const x = (t) => (L + (t1 > t0 ? (t - t0) / (t1 - t0) : 1) * (R - L)).toFixed(1);
  const y = (val) => (B - (val / top) * (B - T)).toFixed(1);
  const id = 'cg' + Math.random().toString(36).slice(2, 8);
  const grad = add(add(svg, 'defs', {}), 'linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
  add(grad, 'stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '.32' });
  add(grad, 'stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0' });
  for (const val of [0, top / 2, top]) { add(svg, 'line', { x1: L, x2: R, y1: y(val), y2: y(val), class: 'grid' }); add(svg, 'text', { x: L - 6, y: +y(val) + 3.5, 'text-anchor': 'end' }, fmt(val)); }
  const line = pts.map((q, i) => `${i ? 'L' : 'M'}${x(q.t)},${y(q.v)}`).join(' ');
  add(svg, 'path', { d: `${line} L${x(t1)},${B} L${x(t0)},${B} Z`, fill: `url(#${id})` });
  add(svg, 'path', { d: line, fill: 'none', stroke: color, 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  const end = pts[pts.length - 1];
  add(svg, 'circle', { cx: x(end.t), cy: y(end.v), r: 7, fill: color, opacity: '.22' });
  add(svg, 'circle', { cx: x(end.t), cy: y(end.v), r: 3.6, fill: color });
  const d0 = new Date(t0);
  add(svg, 'text', { x: L, y: H - 8, 'text-anchor': 'start' }, `${d0.getMonth() + 1}/${d0.getDate()}`);
  add(svg, 'text', { x: R, y: H - 8, 'text-anchor': 'end', class: 'now' }, '오늘');
  return svg;
}

/* ---- 지난 지옥방 전체 ---- */
const histOrder = () => (store.get('jp.histOrder') === 'asc' ? 'asc' : 'desc');
async function openHistory(kid, order = histOrder()) {
  const [{ data }, { data: reps }] = await Promise.all([
    sb.from('session_summaries').select('*').eq('student_id', kid.id).eq('status', 'ended').order('started_at', { ascending: false }).limit(200),
    sb.from('daily_reports').select('session_id, participation_ok, day_ok, solved, assigned, stay_minutes').eq('student_id', kid.id).limit(500),
  ]);
  if (state.route?.v !== 'history') return;
  const repBy = Object.fromEntries((reps ?? []).map((r) => [r.session_id, {...r, participation_ok: r.day_ok ?? r.participation_ok}]));
  const v = mount(`${head('지난 지옥방 전체')}<div class="card"><div class="listHead"><h3>지옥방 ${data?.length ?? 0}회</h3><div class="sortSeg"><button class="sortBtn" data-o="desc">최신순</button><button class="sortBtn" data-o="asc">오래된순</button></div></div><div class="list" id="hList"></div></div>`);
  const draw = (ord) => {
    $$('.sortBtn', v).forEach((b) => b.classList.toggle('on', b.dataset.o === ord));
    const rows = ord === 'asc' ? [...(data ?? [])].reverse() : (data ?? []);
    $('#hList', v).innerHTML = rows.map((s) => { const r = repBy[s.session_id]; return `<div class="row" data-s="${s.session_id}" style="cursor:pointer"><span class="when">${dayLabel(s.started_at)}</span><div class="grow"><b>${r ? (r.participation_ok ? '🔥 오공완' : '노력 기록') : '리포트 없이 끝남'}</b><p>${r ? `문제 ${r.solved}/${r.assigned} · 순공 ${hm(r.stay_minutes)}` : ''}${s.negative_count ? `${r ? ' · ' : ''}경고 ${s.negative_count}회` : ''}</p></div><span class="chev">›</span></div>`; }).join('') || '<p class="empty">아직 기록이 없어요</p>';
    $$('[data-s]', v).forEach((row) => { row.onclick = () => go({ v: 'detail', kid: kid.id, s: row.dataset.s }); });
  };
  $$('.sortBtn', v).forEach((b) => { b.onclick = () => { store.set('jp.histOrder', b.dataset.o); state.route = { ...state.route, order: b.dataset.o }; history.replaceState(state.route, ''); draw(b.dataset.o); }; });
  draw(order);
}

/* ------------------------------------------------------------------ */
/* 자녀 추가 — 형제자매 계정 합치기 (운영 앱과 같음)                       */
/* ------------------------------------------------------------------ */
function showAddChild() { $('#addLogin').value = ''; $('#addPw').value = ''; $('#addError').hidden = true; show('addchild'); }
$('#addSubmit').onclick = async () => {
  const btn = $('#addSubmit'), err = $('#addError');
  const loginId = $('#addLogin').value.trim().toLowerCase(), password = $('#addPw').value;
  err.hidden = true;
  if (!/^[a-z0-9._-]+-p$/.test(loginId)) { err.textContent = '보호자 아이디 형식이 아닙니다. 식별번호 뒤에 -p 를 붙인 형태입니다. 예: 184047-p'; err.hidden = false; return; }
  if (!password) { err.textContent = '비밀번호를 입력해 주세요.'; err.hidden = false; return; }
  btn.disabled = true; btn.textContent = '확인 중…';
  try {
    const { data, error } = await sb.functions.invoke('link-sibling', { body: { login_id: loginId, password } });
    const msg = data?.error ?? (error ? await readFnError(error) : null);
    if (msg) throw new Error(msg);
    const names = data?.names ?? [];
    await loadStudents(); state.kid = {};
    await go({ v: 'home' }, { replace: true });
    toast(names.length ? `${names.join(', ')} 학생이 추가되었습니다` : '자녀가 추가되었습니다');
  } catch (e) { err.textContent = e?.message ?? '추가하지 못했습니다. 잠시 후 다시 시도해 주세요.'; err.hidden = false; } finally { btn.disabled = false; btn.textContent = '자녀 추가하기'; }
};
async function readFnError(error) {
  try { const body = await error.context?.json?.(); if (body?.error) return body.error; } catch { /* 아래 기본 문구 */ }
  return '추가하지 못했습니다. 아이디와 비밀번호를 다시 확인해 주세요.';
}

/* ------------------------------------------------------------------ */
/* 알림을 눌러 들어온 경우 · 푸시 도착                                    */
/* ------------------------------------------------------------------ */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.kind === 'notification-click') return openTarget(e.data.target ?? {});
    if (e.data?.kind === 'push-arrived') return refreshNow();
  });
  registerSW().catch(() => {});
}
