// 수학지옥pt 서비스워커
//
// 하는 일이 두 가지뿐입니다.
//   1. 푸시를 받아 알림으로 띄운다
//   2. 알림을 누르면 앱을 열고 해당 화면으로 보낸다
//
// 캐시는 앱 셸만 최소한으로 잡습니다. 기록 데이터는 항상 네트워크에서
// 받아야 하므로 절대 캐시하지 않습니다.

const SHELL = 'shell-v17-app2';
const SHELL_FILES = ['./', './index.html', './styles.css', './shared.css', './app.js', './look.js', './weekly.js',
                     './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(SHELL_FILES))
      .catch(() => {})           // 한 파일이라도 실패해도 설치는 진행
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Supabase 요청은 건드리지 않고, 앱 셸만 오프라인 대비로 돌려줍니다.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit ?? caches.match('./index.html')))
  );
});

// ---- 푸시 수신 ----
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }

  // 앱이 열려 있으면 알림만 띄우고 끝내면 안 됩니다. 화면이 그대로 멈춰
  // 있어서 사용자는 아무 일도 안 일어난 것처럼 느낍니다. 열린 창에 알려서
  // 데이터를 다시 불러오게 합니다.
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      w.postMessage({ kind: 'push-arrived', target: d.data || {} });
    }
  })());

  e.waitUntil(self.registration.showNotification(d.title || '수학지옥pt', {
    body: d.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: d.tag || 'suhakjiok',
    renotify: true,
    data: d.data || {},
    vibrate: [120, 60, 120],
    lang: 'ko',
  }));
});

// ---- 알림 클릭 ----
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data || {};

  e.waitUntil((async () => {
    const base = new URL('./', self.location).href;
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // 앱이 이미 떠 있으면 그 창에 알려주면 됩니다.
    for (const w of wins) {
      if (w.url.startsWith(base)) {
        await w.focus();
        w.postMessage({ kind: 'notification-click', target });
        return;
      }
    }

    // 앱이 꺼져 있으면 postMessage 를 받을 창이 없습니다. 주소에 실어 보내야
    // 새로 열린 앱이 어느 수업을 펼쳐야 하는지 알 수 있습니다.
    // 폰이 잠긴 상태에서 알림을 누르는 게 가장 흔한 경우입니다.
    const url = new URL(base);
    if (target.session_id) url.searchParams.set('s', target.session_id);
    if (target.student_id) url.searchParams.set('st', target.student_id);
    if (target.view) url.searchParams.set('v', target.view);
    if (target.week_start) url.searchParams.set('w', target.week_start);
    if (target.survey_id) url.searchParams.set('sv', target.survey_id);
    await self.clients.openWindow(url.href);
  })());
});
