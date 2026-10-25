// 캐릭터 · 소품 · 효과 — 앱과 콘솔이 같이 씁니다 (build_site.py 가 두 폴더에 복사).
// 열림 조건은 서버 look_unlocked() (19_app2.sql) 와 같아야 합니다. 여기는 화면 표시용,
// 실제로 고를 수 있는지는 서버가 다시 확인합니다.

// need: [통계 키, 기준] — 서버 student_stats() 의 키와 같음
export const CHARS = [
  { id: 'pi_red',   name: '파이뿔',     cond: '처음부터' },
  { id: 'pi_sky',   name: '하늘 파이뿔', cond: '첫 오공완',        need: ['ok', 1] },
  { id: 'pi_mint',  name: '민트 파이뿔', cond: '오공완 5번',       need: ['ok', 5] },
  { id: 'pi_grape', name: '포도 파이뿔', cond: '랭킹 TOP3 들기',   need: ['top3', 1] },
  { id: 'pi_pink',  name: '딸기 파이뿔', cond: '오공완 3번',       need: ['ok', 3] },
  { id: 'root',     name: '루트뿔',     cond: '형성평가 80점',    need: ['best_test', 80] },
  { id: 'inf',      name: '무한뿔',     cond: '연속 오공완 14번', need: ['streak_best', 14] },
  { id: 'sigma',    name: '시그마뿔',   cond: '누적 1,000문제',   need: ['solved', 1000] },
  { id: 'div',      name: '나누기뿔',   cond: '4주 연속 완주',         need: ['weeks', 4] },
];

// 소품 15개 — 칸은 '소품' 하나라 한 번에 하나만 씁니다 (10/23 결정)
export const ITEMS = [
  { id: 'none',       name: '없음' },
  { id: 'ribbon',     name: '리본',        part: '머리', cond: '처음부터' },
  { id: 'star_pin',   name: '별 머리핀',    part: '머리', cond: '첫 오공완',          need: ['ok', 1] },
  { id: 'blush',      name: '하트 볼터치',  part: '얼굴', cond: '오공완 3번',         need: ['ok', 3] },
  { id: 'flower',     name: '꽃핀',        part: '머리', cond: '연속 오공완 3번',    need: ['streak_best', 3] },
  { id: 'beanie',     name: '비니',        part: '머리', cond: '순공 5시간',         need: ['stay', 300] },
  { id: 'glasses',    name: '동글 안경',    part: '얼굴', cond: '순공 10시간',        need: ['stay', 600] },
  { id: 'sunglasses', name: '선글라스',     part: '얼굴', cond: '누적 300문제',       need: ['solved', 300] },
  { id: 'headphone',  name: '헤드폰',      part: '머리', cond: '오공완 10번',        need: ['ok', 10] },
  { id: 'scarf',      name: '목도리',      part: '목·몸', cond: '2주 연속 완주',          need: ['weeks', 2] },
  { id: 'bowtie',     name: '나비넥타이',   part: '목·몸', cond: '형성평가 70점',     need: ['best_test', 70] },
  { id: 'cap',        name: '학사모',      part: '머리', cond: '형성평가 +10점 성장', need: ['test_growth', 10] },
  { id: 'medal',      name: '메달',        part: '목·몸', cond: '랭킹 TOP3 들기',    need: ['top3', 1] },
  { id: 'wings',      name: '작은 악마 날개', part: '목·몸', cond: '연속 오공완 10번', need: ['streak_best', 10] },
  { id: 'halo',       name: '천사 고리',    part: '머리', cond: '황금 오라 받기',     need: ['gold_ever', 1] },
  { id: 'crown',      name: '왕관',        part: '머리', cond: '랭킹 1위',           need: ['rank1', 1] },
];

export const EFFECTS = [
  { id: 'none',   name: '없음' },
  { id: 'gold',   name: '황금 오라',  cond: '지난주 기준 통과', weekly: '이번 주 한정', need: ['gold_now', 1] },
  { id: 'spark',  name: '반짝반짝',   cond: '처음부터' },
  { id: 'orbit',  name: '수학 궤도',  cond: '누적 500문제',     need: ['solved', 500] },
  { id: 'aura',   name: '불꽃 오라',  cond: '연속 오공완 7번',  need: ['streak_best', 7] },
  { id: 'hearts', name: '하트 퐁퐁',  cond: '오공완 7번',       need: ['ok', 7] },
  { id: 'ring',   name: '무지개 링',  cond: '리그 승급',        need: ['promoted', 1] },
];

const statVal = (s, k) => (k === 'gold_now' ? (s?.gold_now ? 1 : 0) : Number(s?.[k] ?? 0));
export const isOpen = (x, stats) => !x.need || statVal(stats, x.need[0]) >= x.need[1];
export const progress = (x, stats) => (x.need ? Math.min(1, statVal(stats, x.need[0]) / x.need[1]) : 1);

// 스티커 그림이 준비된 소품은 PNG(투명 배경, 캐릭터 411×520 칸 + 위로 150px = 411×670)를 씁니다.
// 없는 것은 아래 임시 SVG 를 그립니다. 그림을 넣으면 이 목록에 id 만 추가하면 됩니다.
export const ITEM_PNG = new Set(['ribbon', 'flower', 'star_pin', 'cap', 'crown', 'beanie', 'headphone', 'halo',
  'glasses', 'sunglasses', 'blush', 'scarf', 'bowtie', 'medal', 'wings']);
// 몸 뒤에 그리는 소품
const ITEM_BACK = new Set(['wings']);

// 임시 소품 그림 (캐릭터 그림 좌표 411×520 기준)
const ITEM_SVG = {
  none: '',
  ribbon: `<g transform="translate(300 118) rotate(18)"><path d="M0 0 C-34 -30 -52 -4 -40 16 C-30 30 -10 18 0 0 Z" fill="#FF6FA8" stroke="#C93A74" stroke-width="4"/><path d="M0 0 C34 -30 52 -4 40 16 C30 30 10 18 0 0 Z" fill="#FF6FA8" stroke="#C93A74" stroke-width="4"/><path d="M-6 6 L-20 40 L-6 34 L2 44 L6 8Z" fill="#FF8DBB" stroke="#C93A74" stroke-width="3"/><circle r="11" fill="#FF97C2" stroke="#C93A74" stroke-width="4"/><path d="M-30 -8 C-26 -14 -20 -14 -16 -10" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/></g>`,
  flower: `<g transform="translate(96 108)">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-17" rx="12" ry="17" transform="rotate(${a})" fill="#FFE27A" stroke="#E0A400" stroke-width="3"/>`).join('')}<circle r="10" fill="#FF8A3D" stroke="#D7621A" stroke-width="3"/><circle cx="-3" cy="-3" r="3" fill="#fff" opacity=".8"/></g>`,
  glasses: `<g transform="rotate(17 196 186)" fill="none" stroke="#3B2A22" stroke-width="7"><circle cx="138" cy="180" r="44" fill="rgba(255,255,255,.18)"/><circle cx="256" cy="180" r="44" fill="rgba(255,255,255,.18)"/><path d="M182 176 Q197 166 212 176"/><path d="M110 156 Q118 146 130 150" stroke="#fff" stroke-width="5" opacity=".7"/></g>`,
  cap: `<g transform="translate(236 46) rotate(16)"><path d="M-46 8 L-40 34 Q0 50 40 34 L46 8 Z" fill="#2B2F3A" stroke="#14161c" stroke-width="4"/><path d="M-92 0 L0 -36 L92 0 L0 36 Z" fill="#3A4050" stroke="#14161c" stroke-width="4" stroke-linejoin="round"/><path d="M0 0 L60 14 L62 50" stroke="#FFC83D" stroke-width="5" fill="none"/><circle cx="62" cy="54" r="8" fill="#FFC83D" stroke="#C79300" stroke-width="3"/><path d="M-50 -10 L-10 -26" stroke="#fff" stroke-width="4" opacity=".35" stroke-linecap="round"/></g>`,
  crown: `<g transform="translate(234 40) rotate(15)"><path d="M-50 22 L-56 -22 L-26 2 L0 -34 L26 2 L56 -22 L50 22 Z" fill="#FFD23F" stroke="#C48A00" stroke-width="5" stroke-linejoin="round"/><rect x="-52" y="18" width="104" height="16" rx="6" fill="#FFC21A" stroke="#C48A00" stroke-width="5"/><circle cx="0" cy="-34" r="7" fill="#FF5B6B" stroke="#C48A00" stroke-width="3"/><circle cx="-56" cy="-22" r="6" fill="#62C7FF" stroke="#C48A00" stroke-width="3"/><circle cx="56" cy="-22" r="6" fill="#62C7FF" stroke="#C48A00" stroke-width="3"/><circle cx="0" cy="26" r="5" fill="#FF5B6B"/><path d="M-36 6 L-20 -6" stroke="#fff" stroke-width="5" opacity=".7" stroke-linecap="round"/></g>`,
  star_pin: `<g transform="translate(104 104) rotate(-14)"><path d="M0 -30 L9 -9 L31 -8 L13 6 L20 28 L0 15 L-20 28 L-13 6 L-31 -8 L-9 -9 Z" fill="#FFD84A" stroke="#D49A00" stroke-width="4" stroke-linejoin="round"/><path d="M-8 -12 L-2 -20" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><rect x="14" y="8" width="44" height="7" rx="3" fill="#B9C2CF" transform="rotate(30)"/></g>`,
  beanie: `<g transform="translate(222 70) rotate(12)"><path d="M-104 30 C-100 -60 100 -60 104 30 Z" fill="#5BA8FF" stroke="#2D6FC2" stroke-width="5"/><rect x="-110" y="20" width="220" height="34" rx="16" fill="#3D8BFF" stroke="#2D6FC2" stroke-width="5"/>${[-80, -50, -20, 10, 40, 70].map((x) => `<path d="M${x} 24 V50" stroke="#2D6FC2" stroke-width="3" opacity=".5"/>`).join('')}<circle cy="-52" r="20" fill="#FFF3D6" stroke="#E0C89A" stroke-width="4"/></g>`,
  headphone: `<g transform="rotate(14 214 170)"><path d="M88 196 C80 40 340 40 336 196" fill="none" stroke="#2B2F3A" stroke-width="14" stroke-linecap="round"/><rect x="66" y="160" width="42" height="74" rx="18" fill="#FF6B35" stroke="#B9431A" stroke-width="5"/><rect x="318" y="160" width="42" height="74" rx="18" fill="#FF6B35" stroke="#B9431A" stroke-width="5"/><path d="M76 176 V214" stroke="#fff" stroke-width="5" opacity=".5" stroke-linecap="round"/></g>`,
  halo: `<g transform="translate(222 18) rotate(12)"><ellipse rx="78" ry="20" fill="none" stroke="#FFD84A" stroke-width="13"/><ellipse rx="78" ry="20" fill="none" stroke="#FFF6B8" stroke-width="4"/></g>`,
  sunglasses: `<g transform="rotate(17 196 186)"><path d="M92 160 H184 V196 Q182 226 138 226 Q96 226 94 196 Z" fill="#1E2230" stroke="#0E1018" stroke-width="5"/><path d="M210 160 H302 V196 Q300 226 256 226 Q212 226 212 196 Z" fill="#1E2230" stroke="#0E1018" stroke-width="5"/><path d="M184 168 Q197 160 210 168" stroke="#0E1018" stroke-width="7" fill="none"/><path d="M108 172 L130 172" stroke="#8FB4FF" stroke-width="6" stroke-linecap="round" opacity=".8"/><path d="M226 172 L248 172" stroke="#8FB4FF" stroke-width="6" stroke-linecap="round" opacity=".8"/></g>`,
  blush: `<g fill="#FF6FA8" opacity=".85">${[[128, 236], [292, 214]].map(([x, y]) => `<path transform="translate(${x} ${y}) scale(.9)" d="M0 8 C-14 -6 -26 4 -14 16 L0 28 L14 16 C26 4 14 -6 0 8 Z"/>`).join('')}</g>`,
  scarf: `<g><path d="M150 268 C190 300 270 296 312 258 L322 282 C280 324 186 330 142 294 Z" fill="#FF5B6B" stroke="#C2303D" stroke-width="5"/><path d="M262 296 L282 380 L250 384 L236 304 Z" fill="#FF5B6B" stroke="#C2303D" stroke-width="5"/>${[0, 1, 2].map((i) => `<path d="M${170 + i * 40} ${284 + i * 2} l10 -16" stroke="#fff" stroke-width="5" opacity=".55" stroke-linecap="round"/>`).join('')}</g>`,
  bowtie: `<g transform="translate(232 284) rotate(-8)"><path d="M0 0 L-40 -24 L-40 24 Z" fill="#8B6CFF" stroke="#5A3FCC" stroke-width="5" stroke-linejoin="round"/><path d="M0 0 L40 -24 L40 24 Z" fill="#8B6CFF" stroke="#5A3FCC" stroke-width="5" stroke-linejoin="round"/><circle r="10" fill="#A891FF" stroke="#5A3FCC" stroke-width="4"/></g>`,
  medal: `<g><path d="M196 270 L222 330 L248 270" fill="none" stroke="#3D8BFF" stroke-width="12" stroke-linejoin="round"/><circle cx="222" cy="344" r="24" fill="#FFD23F" stroke="#C48A00" stroke-width="5"/><path d="M222 330 L227 340 L238 341 L230 348 L232 359 L222 353 L212 359 L214 348 L206 341 L217 340 Z" fill="#FFF3B0"/></g>`,
  wings: `<g fill="#3B2A55" stroke="#1E1430" stroke-width="5" stroke-linejoin="round"><path d="M318 286 C356 250 404 256 410 282 C390 280 386 296 396 306 C376 300 366 314 372 326 C352 316 336 322 330 330 Z"/><path d="M118 300 C84 270 46 278 42 300 C60 298 62 312 54 320 C70 316 78 328 74 338 C90 330 104 334 110 340 Z" opacity=".9"/></g>`,
};

export function fxHTML(e, front) {
  if (e === 'gold' && !front) return '<div class="gold"><i></i></div>';
  if (e === 'gold' && front) return [[14, 30, 0], [80, 22, 0.7], [86, 60, 1.3], [10, 70, 1.9], [50, 8, 1]].map(([x, y, d]) => `<span class="ember" style="left:${x}%;top:${y}%;animation-delay:${d}s">✦</span>`).join('');
  if (e === 'aura' && !front) return '<div class="aura"></div>';
  if (e === 'ring' && !front) return '<div class="ring"></div>';
  if (e === 'orbit' && front) return '<div class="orbit">' + ['π', '√', '∞', 'Σ'].map((s, i) => { const a = i * Math.PI / 2; return `<span style="left:${50 + 46 * Math.cos(a)}%;top:${50 + 46 * Math.sin(a)}%;transform:translate(-50%,-50%)">${s}</span>`; }).join('') + '</div>';
  if (e === 'spark' && front) return [[8, 18, 0], [82, 12, 0.6], [90, 52, 1.1], [4, 60, 0.3], [60, 4, 1.4]].map(([x, y, d]) => `<span class="spark" style="left:${x}%;top:${y}%;animation-delay:${d}s">✦</span>`).join('');
  if (e === 'hearts' && front) return [[20, 0], [48, 0.8], [74, 1.6]].map(([x, d]) => `<span class="hrt" style="left:${x}%;animation-delay:${d}s">♥</span>`).join('');
  return '';
}

const DEFAULT_LOOK = { ch: 'pi_red', item: 'none', fx: 'none' };

// 캐릭터 한 마리 (효과 뒤 · 몸 · 소품 · 효과 앞)
export function pib(look, w, cls = '') {
  const l = { ...DEFAULT_LOOK, ...(look || {}) };
  const ch = CHARS.find((c) => c.id === l.ch) ?? CHARS[0];
  const fs = Math.max(9, w * 0.09);
  const item = ITEM_PNG.has(l.item)
    ? `<img class="itemimg${ITEM_BACK.has(l.item) ? ' back' : ''}" src="items/${l.item}.png" alt="">`
    : `<svg class="item" viewBox="0 0 411 520">${ITEM_SVG[l.item] || ''}</svg>`;
  return `<span class="pw ${cls}" style="width:${w}px;--fs:${fs}px"><span class="fxb">${fxHTML(l.fx, false)}</span>` +
    `<img class="body" src="chars/${ch.id}.png" alt="${ch.name}">${item}<span class="fxf">${fxHTML(l.fx, true)}</span></span>`;
}
