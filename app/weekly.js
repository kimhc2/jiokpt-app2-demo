import { normalizeTest } from './rules.js?v=ranking4';
// 주간 리포트 — 앱(학생 · 보호자) · 콘솔(미리보기 · 이미지 저장)이 같은 카드를 씁니다.
// build_site.py 가 app/ 과 teacher-web/ 에 복사합니다. 고칠 때는 shared/ 만 고치세요.
import { pib } from './look.js?v=ranking4';

export const LV = { 3: '좋음', 2: '보통', 1: '노력 필요' };
export const EVAL = [
  { k: 'att', t: '학습 태도', s: { 3: '수업과 지옥방 모두 적극적으로 참여했어요', 2: '정해진 시간에 맞춰 성실하게 참여했어요', 1: '참여가 들쑥날쑥했어요. 시간을 같이 맞춰 볼게요' } },
  { k: 'focus', t: '집중도', s: { 3: '딴짓 없이 끝까지 집중했어요', 2: '대체로 집중했고, 가끔 흐트러졌어요', 1: '집중이 자주 끊겼어요. 지옥방에서 더 챙길게요' } },
  { k: 'task', t: '할당량 수행', s: { 3: '지옥방 할당량을 모두 끝냈어요', 2: '할당량을 대부분 끝냈어요', 1: '할당량을 다 채우지 못한 날이 많았어요' } },
  { k: 'under', t: '개념 이해', s: { 3: '배운 개념을 문제에 잘 적용해요', 2: '기본 개념은 이해했고, 응용 연습이 필요해요', 1: '개념을 한 번 더 짚고 넘어갈게요' } },
  { k: 'wrong', t: '오답 정리', s: { 3: '틀린 문제를 스스로 다시 풀어 봤어요', 2: '오답은 확인했지만 다시 풀기는 부족했어요', 1: '오답 정리가 거의 안 됐어요. 다음 주에 같이 챙길게요' } },
];
export const AUTOK = ['att', 'focus', 'task'];   // 기록으로 미리 눌러 두는 평가
export const GOOD = {
  '끝까지 완주': '이번 주 지옥방을 빠짐없이 끝까지 해냈어요.',
  '정답률 상승': '지난주보다 정답률이 올라 실력이 붙고 있어요.',
  '순공시간 증가': '순공시간이 지난주보다 늘었어요.',
  '형성평가 상승': '형성평가 점수가 지난번보다 올랐어요.',
  '오답 꼼꼼': '틀린 문제를 꼼꼼히 다시 확인했어요.',
  '집중 좋아짐': '공부하는 동안 집중하는 모습이 좋아졌어요.',
};
export const MORE = {
  '정답률 올리기': '다음 주에는 한 문제씩 검산하며 정답률을 올려 봐요.',
  '순공 1시간 채우기': '다음 주에는 지옥방 순공 1시간을 꼭 채워 봐요.',
  '오답 다시 풀기': '다음 주에는 틀린 문제를 다시 풀어 보는 습관을 들여 봐요.',
  '딴짓 줄이기': '다음 주에는 휴대폰을 멀리 두고 집중해 봐요.',
  '지옥방 출석': '다음 주에는 지옥방에 빠짐없이 들어와 봐요.',
};
// 형성평가 점수가 없을 때 그 자리에 들어가는 말 — '응시 안 함'은 쓰지 않음
export const POINT = {
  '개념 다지는 중': '배운 개념을 차근차근 다지고 있어요. 지금 속도면 다음 단원도 충분히 따라올 수 있어요.',
  '푸는 속도 붙음': '문제 푸는 속도가 눈에 띄게 빨라지고 있어요. 다음 주에는 정확도까지 같이 챙겨 볼게요.',
  '꾸준함이 장점': '꾸준함이 가장 큰 장점이에요. 이 리듬을 그대로 이어 가면 성적으로 이어질 거예요.',
  '끝까지 붙잡는 힘': '어려운 문제도 쉽게 넘기지 않고 끝까지 붙잡아요. 이 힘이 곧 실력이 돼요.',
  '리듬 다시 찾기': '이번 주는 공부 리듬을 다시 찾는 한 주였어요. 다음 주에 같이 페이스를 올려 볼게요.',
};

const W = ['일', '월', '화', '수', '목', '금', '토'];
export const hm = (m) => { const h = Math.floor(m / 60), mm = m % 60; return h ? `${h}시간${mm ? ' ' + mm + '분' : ''}` : `${mm}분`; };
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return ymd(d); };
const kstDay = (ts) => new Date(new Date(ts).toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
export const kstDayKey = (ts) => ymd(kstDay(ts));
// 이번 주 월요일 (한국 시간)
export function weekStartOf(ts = Date.now()) {
  const d = kstDay(ts); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}
// '10월 4주차' — 그 주 목요일이 속한 달 기준
export function weekLabel(ws) {
  const th = parseDay(addDays(ws, 3));
  return `${th.getMonth() + 1}월 ${Math.ceil(th.getDate() / 7)}주차`;
}
export function weekRange(ws) {
  const a = parseDay(ws), b = parseDay(addDays(ws, 4));
  return `${a.getMonth() + 1}/${a.getDate()}(월) ~ ${b.getMonth() + 1}/${b.getDate()}(금)`;
}
const dLabel = (key) => { const d = parseDay(key); return `${d.getMonth() + 1}/${d.getDate()}(${W[d.getDay()]})`; };

/* 한 주의 지옥방 줄: 시간표의 지옥방 요일 + 실제 리포트가 있는 날.
   지나간 지옥방 요일인데 리포트가 없으면 '빠짐' 줄, 아직 안 온 날은 넣지 않습니다. */
function weekRows(ws, schedule, reps, sums) {
  const today = kstDayKey(Date.now());
  const warnBy = Object.fromEntries((sums ?? []).map((x) => [x.session_id, x.negative_count ?? 0]));
  const days = new Map();
  for (const sc of schedule ?? []) {
    if (sc.kind !== 'jiok') continue;
    const k = sc.day || addDays(ws, sc.weekday - 1);
    if (k < ws || k > addDays(ws, 6)) continue;
    if (sc.ends_at ? Date.now() >= new Date(sc.ends_at).getTime() : (k < today || (k === today && Date.now() >= new Date(k + 'T00:00:00+09:00').getTime() + (sc.end_min ?? 1440) * 60000))) days.set(k, { d: dLabel(k), key: k, goal: sc.goal_problems || 0, must: sc.goal_minutes || 60, planned: !!sc.day, sol: 0, cor: 0, min: 0, warn: 0, n: 0 });
  }
  for (const r of reps ?? []) {
    const k = kstDayKey(r.started_at);
    if (k < ws || k > addDays(ws, 6)) continue;
    const x = days.get(k) ?? { d: dLabel(k), key: k, goal: 0, sol: 0, cor: 0, min: 0, warn: 0, n: 0 };
    if (!x.planned) x.goal += r.assigned; x.sol += r.solved; x.cor += r.correct; x.min += r.stay_minutes;
    x.warn += warnBy[r.session_id] ?? 0; x.n++; x.ok = x.sol >= x.goal || x.min >= (x.must || r.mandatory_minutes || 60);
    days.set(k, x);
  }
  // 빠진 날의 할당량은 그 학생 스테이지로
  return [...days.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

export function wkSum(jb) {
  const sum = (f) => jb.reduce((a, x) => a + x[f], 0);
  const sol = sum('sol'), cor = sum('cor');
  return {
    sol, goal: sum('goal'), cor, min: sum('min'), warn: sum('warn'),
    ok: jb.filter((x) => x.n && x.ok !== false && (x.min >= (x.must || 60) || (x.goal > 0 && x.sol >= x.goal))).length,
    came: jb.filter((x) => x.n > 0).length,
    acc: sol ? Math.round(cor / sol * 100) : 0,
  };
}

// 기록으로 미리 정하는 평가 (선생님은 다른 것만 누름) — 안 들어온 주의 집중도는 '보통'
export function autoEval(jb, score) {
  const w = wkSum(jb);
  return {
    att: jb.length && w.came === jb.length ? 3 : w.came > 0 ? 2 : 1,
    focus: w.came === 0 ? 2 : w.warn === 0 ? 3 : w.warn <= 2 ? 2 : 1,
    task: jb.length && w.ok === jb.length ? 3 : w.ok > 0 ? 2 : 1,
    under: score == null || score === '' ? 2 : score >= 85 ? 3 : score >= 65 ? 2 : 1,
    wrong: 2,
  };
}

/* 화면에 쓸 학생 한 명의 주간 데이터를 만듭니다.
   student: students 행 · schedule: student_schedule 행들
   reps/sums: 이번 주와 지난주의 daily_reports · session_summaries
   wr: 이번 주 weekly_reports (없으면 null) · prevWr: 지난주 weekly_reports
   scores: 이번 주 이전에 보낸 형성평가 점수 (최근 순) */
export function assembleWeek({ student, schedule, reps, sums, wr, prevWr, scores, ws, teacher, rankText, plans = [] }) {
  if (wr?.sent_at && wr.report_snapshot?.jb) {
    const frozen = JSON.parse(JSON.stringify(wr.report_snapshot));
    frozen.sent = wr.sent_at; frozen.rk = rankText || '';
    return frozen;
  }
  const frozenPlans = plans.filter(p => p.week_start === ws || p.week_start === addDays(ws, -7));
  if (frozenPlans.some(p => p.week_start === ws)) {
    schedule = frozenPlans.map(p => ({ ...p, kind: 'jiok', weekday: ((parseDay(p.day).getDay()+6)%7)+1, end_min: 1440 }));
    student = { ...student, stage: frozenPlans.find(p => p.week_start === ws).stage || student.stage };
  }
  const jb = weekRows(ws, schedule, reps, sums).map((x) => ({ ...x, goal: x.goal || (x.n ? 0 : student.stage * 25) }));
  const prevRows = weekRows(addDays(ws, -7), schedule, reps, sums);
  const pj = prevRows.filter((x) => x.n);
  const pw = pj.length ? wkSum(pj) : null;
  const test = normalizeTest(wr?.test_total ?? 20, wr?.test_correct, wr?.test_score);
  const score = test.score;
  const ev = wr?.ev && Object.keys(wr.ev).length ? { ...autoEval(jb, score), ...wr.ev } : autoEval(jb, score);
  const start = student.start_date;
  const weekNo = start ? Math.floor((parseDay(ws) - parseDay(weekStartOf(parseDay(start)))) / 6048e5) + 1 : null;
  const classes = (schedule ?? []).filter((x) => x.kind === 'class').length;
  const thisW = wkSum(jb);
  const pending = (schedule ?? []).some(sc => sc.kind === 'jiok' && (!sc.day || sc.week_start === ws) && (sc.ends_at ? new Date(sc.ends_at).getTime() : new Date(addDays(ws, sc.weekday - 1) + 'T00:00:00+09:00').getTime() + (sc.end_min ?? 1440) * 60000) > Date.now());
  return {
    pending,
    id: student.id, n: student.name, gr: student.grade || '', st: student.stage,
    cls: classes ? `1:1 수업 주 ${classes}회` : '',
    ws, label: weekLabel(ws), range: weekRange(ws), weekNo,
    jb,
    prev: pw ? { min: pw.min, sol: pw.sol, acc: pw.acc, ok: pw.ok, warn: pw.warn, ev: prevWr?.sent_at ? prevWr.ev : null } : null,
    test: { score, total: test.total, correct: test.correct, prev: scores?.[0] ?? null, prev2: scores?.[1] ?? null, range: wr?.test_range || '' },
    score: score == null ? '' : String(score),
    learn: wr?.learn ?? [], nextL: wr?.next_learn ?? [],
    next: wr?.next_stage ?? student.stage,
    up: !pending && !!pw && prevRows.length > 0 && pw.ok === prevRows.length && jb.length > 0 && thisW.ok === jb.length && thisW.acc >= 80,
    good: wr?.good_key || '끝까지 완주', more: wr?.more_key || '오답 다시 풀기', point: wr?.point_key || '개념 다지는 중',
    ev, rk: rankText || '', teacher: teacher || '', sent: wr?.sent_at || null, gold: !!wr?.gold,
  };
}

function diff(v, unit = '') {
  if (!v) return '<span class="wd z">지난주와 같음</span>';
  if (v > 0) return `<span class="wd p">지난주보다 +${v}${unit}</span>`;
  return '<span class="wd z">지난주와 비슷</span>';   // 떨어진 수치는 강조하지 않음
}

// 지난주보다 좋아진 점 — 기록으로 자동 계산, 큰 것부터
export function ups(s) {
  const p = s.prev; if (!p) return [];
  const w = wkSum(s.jb), out = [], has = s.score !== '' && s.score != null;
  if (has && s.test.prev != null && +s.score > s.test.prev) out.push({ ic: '📝', t: '형성평가', v: `+${+s.score - s.test.prev}점`, d: `${s.test.prev}점 → ${s.score}점`, w: 9 });
  if (w.min - p.min >= 10) out.push({ ic: '⏱️', t: '순공시간', v: `+${w.min - p.min}분`, d: `${hm(p.min)} → ${hm(w.min)}`, w: 8 });
  if (w.sol && w.acc - p.acc >= 2) out.push({ ic: '🎯', t: '정답률', v: `+${w.acc - p.acc}%p`, d: `${p.acc}% → ${w.acc}%`, w: 7 });
  if (w.ok > p.ok) out.push({ ic: '🔥', t: '오공완', v: `${w.ok}번`, d: `지난주 ${p.ok}번 → 이번 주 ${w.ok}번`, w: 6 });
  if (w.came > 0 && p.warn - w.warn > 0) out.push({ ic: '📵', t: '딴짓 체크', v: `−${p.warn - w.warn}회`, d: `${p.warn}회 → ${w.warn}회`, w: 5 });
  if (w.sol - p.sol > 0) out.push({ ic: '✏️', t: '푼 문제', v: `+${w.sol - p.sol}문제`, d: `${p.sol} → ${w.sol}문제`, w: 4 });
  if (p.ev) EVAL.forEach((e) => { if (s.ev[e.k] > p.ev[e.k]) out.push({ ic: '⬆️', t: e.t, v: LV[s.ev[e.k]], d: `지난주 ${LV[p.ev[e.k]]} → 이번 주 ${LV[s.ev[e.k]]}`, w: 3 }); });
  return out.sort((a, b) => b.w - a.w);
}
const evUp = (s, k) => !!s.prev?.ev && s.ev[k] > s.prev.ev[k];

// 주간 기준 4가지 — 이번 주 기록만으로 판단 (넷 다 넘으면 다음 주 한정 황금 오라)
export function bar3(s) {
  const w = wkSum(s.jb), n = s.jb.length;
  const mins = n ? Math.min(...s.jb.map((x) => x.sol)) : 0;
  const items = [
    { t: '지옥방 모두 오공완', ok: !s.pending && w.ok === n && n > 0, v: `${w.ok}/${n}번` },
    { t: '순공 1시간씩 채우기', ok: !s.pending && n > 0 && s.jb.every((x) => x.min >= 60), v: hm(w.min) || '0분' },
    { t: '정답률 80% 이상', ok: w.sol > 0 && w.acc >= 80, v: w.sol ? w.acc + '%' : '기록 없음' },
    s.st === 1   // STAGE 1(지옥방 1회 25문제)은 하루 50문제 대신 할당량을 다 풀면 통과
      ? { t: '하루 할당량 다 풀기', ok: n > 0 && s.jb.every((x) => x.goal > 0 && x.sol >= x.goal), v: `하루 최소 ${mins}/${s.st * 25}문제` }
      : { t: '하루 50문제 이상', ok: n > 0 && s.jb.every((x) => x.sol >= 50), v: `하루 최소 ${mins}문제` },
  ];
  return { items, pass: items.filter((x) => x.ok).length, all: items.every((x) => x.ok) };
}

function badgeBlock(s, o) {
  const b = bar3(s);
  const rows = b.items.map((x) => `<div class="wbr ${x.ok ? 'ok' : ''}"><span class="wbc">${x.ok ? '✓' : '·'}</span><span>${x.t}</span><b>${x.v}</b></div>`).join('');
  if (b.all) return `<div class="wbadge pass"><div class="wbt">🏅 이번 주 기준 통과! 잘하고 있어요</div>${rows}
      <div class="wbg"><span class="wbo">${pib({ ch: o.ch || 'pi_red', item: 'none', fx: 'gold' }, 46)}</span><div><b>다음 주 한 주 동안 '황금 오라'를 쓸 수 있어요</b><small>${o.rank ? '꾸미기 탭에서 바로 써 보세요' : '기준을 넘은 주마다 학생 앱 캐릭터에 특별한 오라가 생겨요'}</small></div></div></div>`;
  if (b.pass > 0) return `<div class="wbadge part"><div class="wbt">이번 주 기준 ${b.pass} / 4 · ${b.items.filter((x) => !x.ok).map((x) => x.t).join(', ')}만 넘으면 황금 오라!</div>${rows}</div>`;
  return `<div class="wbadge part"><div class="wbt">다음 주 기준 4가지 — 같이 넘어 봐요</div>${rows}</div>`;
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sentText = (ts) => { if (!ts) return '미리보기'; const d = kstDay(ts); return `${d.getMonth() + 1}/${d.getDate()}(${W[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// o: { img: 이미지 저장용 넓은 판, rank: 학생 화면(랭킹 줄 붙음), ch: 학생 캐릭터 }
export function weeklyCard(s, o = {}) {
  const w = wkSum(s.jb), has = s.score !== '' && s.score != null, sc = +s.score, U = ups(s), B = bar3(s), BB = badgeBlock(s, o);
  const P = s.prev ?? { min: 0, sol: 0, acc: 0 };
  const lv = (v) => `<span class="lvb l${v}">${LV[v]}</span>`;
  const jbOk = (x) => (!x.n ? '<span class="lvb l0">빠짐</span>' : (x.ok !== false && (x.min >= (x.must || 60) || (x.goal > 0 && x.sol >= x.goal))) ? '<span class="lvb l3">오공완</span>' : '<span class="lvb l1">아쉬운 날</span>');
  const tr = [['2주 전', s.test.prev2], ['지난주', s.test.prev], ['이번 주', sc]].filter(([, v]) => v != null);
  const testBlock = has ? `
    <div class="wsec"><div class="wt">금요일 형성평가 <small>${esc(s.test.range)}</small></div>
      <div class="wtest"><div><span class="wbig">${sc}</span><span class="wu">점</span><div class="wsub">${s.test.total}문항 중 ${s.test.correct ?? Math.round(sc / 100 * s.test.total)}개 맞음</div>${s.test.prev != null && sc > s.test.prev ? `<span class="wd p">지난번보다 +${sc - s.test.prev}점</span>` : ''}</div>
        <div class="wtr">${tr.map(([t, v], i) => `<div class="${i === tr.length - 1 ? 'now' : ''}"><b>${v}</b><i style="height:${Math.max(8, v * 0.62)}px"></i>${t}</div>`).join('')}</div></div></div>`
    : `
    <div class="wsec"><div class="wt">이번 주 학습 포인트</div>
      <div class="wpoint">${POINT[s.point] ?? ''}</div></div>`;
  const stageLine = s.next > s.st ? `STAGE ${s.st} → ${s.next} 도전 (지옥방 1회 ${s.st * 25} → ${s.next * 25}문제)`
    : s.next < s.st ? `STAGE ${s.next}로 조정 (지옥방 1회 ${s.next * 25}문제)` : `STAGE ${s.st} 유지 (지옥방 1회 ${s.st * 25}문제)`;
  return `<div class="wr ${o.img ? 'img' : ''}">
    <div class="whead"><div class="wbrand">수학지옥PT · 주간 리포트</div>
      <div class="wname">${esc(s.n)} <small>${esc(s.gr)} · STAGE ${s.st}</small></div>
      <div class="wmeta">${s.label} · ${s.range}${s.weekNo ? `<span class="wweek">${[1, 2, 3, 4].map((i) => `<i class="${i <= s.weekNo ? 'on' : ''}"></i>`).join('')} ${s.weekNo <= 4 ? `4주 중 ${s.weekNo}주차` : `${s.weekNo}주차`}</span>` : ''}</div>
      ${U.length ? `<div class="whl">지난주보다 좋아졌어요 · ${U.slice(0, 2).map((u) => `${u.t} <b>${u.v}</b>`).join(' · ')}${U.length > 2 ? ` 외 ${U.length - 2}가지` : ''}${B.all ? ' · 🏅 기준 통과' : ''}</div>` : B.all ? '<div class="whl">이번 주도 탄탄하게 해냈어요! 지금처럼만 하면 충분해요</div>' : ''}</div>
    ${U.length ? `<div class="wup"><div class="wupt">🎉 지난주보다 좋아진 점 <span>${U.length}가지</span></div>
      ${U.map((u) => `<div class="wupr"><span class="wupi">${u.ic}</span><span class="wupk">${u.t}<small>${u.d}</small></span><b>${u.v}</b></div>`).join('')}</div>` : ''}
    ${BB}
    <div class="wtiles">
      <div><small>출석</small><b>지옥방 ${w.came}/${s.jb.length}</b><em>${esc(s.cls)}</em></div>
      <div class="${s.prev && w.min - P.min >= 10 ? 'up' : ''}"><small>순공시간</small><b>${hm(w.min) || '0분'}</b>${s.prev ? diff(w.min - P.min, '분') : ''}</div>
      <div class="${s.prev && w.sol - P.sol > 0 ? 'up' : ''}"><small>푼 문제</small><b>${w.sol}<span> / ${w.goal}</span></b><em>할당량 ${w.goal ? Math.round(w.sol / w.goal * 100) : 0}%</em></div>
      <div class="${s.prev && w.sol && w.acc - P.acc >= 2 ? 'up' : ''}"><small>정답률</small><b>${w.acc}%</b>${w.sol ? (s.prev ? diff(w.acc - P.acc, '%p') : '') : '<span class="wd z">기록 없음</span>'}</div>
    </div>
    ${testBlock}
    <div class="wsec"><div class="wt">지옥방 기록</div>
      <table class="wtab"><tr><th>날짜</th><th>문제</th><th>정답률</th><th>순공</th><th>딴짓</th><th></th></tr>
      ${s.jb.map((x) => `<tr><td>${x.d}</td><td>${x.sol}/${x.goal}</td><td>${x.sol ? Math.round(x.cor / x.sol * 100) + '%' : '–'}</td><td>${x.min ? hm(x.min) : '–'}</td><td>${x.n ? x.warn + '회' : '–'}</td><td>${jbOk(x)}</td></tr>`).join('') || '<tr><td colspan="6">이번 주 지옥방 기록이 없어요</td></tr>'}</table></div>
    ${s.learn.length ? `<div class="wsec"><div class="wt">수업에서 배운 내용</div><div class="wchips">${s.learn.map((u) => `<span>${esc(u)}</span>`).join('')}</div></div>` : ''}
    <div class="wsec"><div class="wt">선생님 평가</div>
      ${EVAL.map((e) => `<div class="wev ${evUp(s, e.k) ? 'up' : ''}"><span class="wek">${e.t}${evUp(s, e.k) ? ' <i class="wupa">↑</i>' : ''}</span>${lv(s.ev[e.k])}<span class="wes">${e.s[s.ev[e.k]]}</span></div>`).join('')}</div>
    <div class="wsec"><div class="wt">선생님 한마디</div><div class="wsay">${GOOD[s.good] ?? ''} ${MORE[s.more] ?? ''}</div></div>
    <div class="wsec"><div class="wt">다음 주</div>
      ${s.nextL.length ? `<div class="wnext"><span>진도</span><b>${s.nextL.map(esc).join(' · ')}</b></div>` : ''}
      <div class="wnext"><span>스테이지</span><b>${stageLine}</b></div>
      ${o.rank && s.rk ? `<div class="wrank">🏆 이번 주 랭킹 <b>${esc(s.rk)}</b></div>` : ''}</div>
    <div class="wfoot">${s.teacher ? `담임 ${esc(s.teacher)} 선생님 · ` : ''}${sentText(s.sent)}</div>
  </div>`;
}
