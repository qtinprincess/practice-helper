/* 練琴小幫手（© 悠樂媽媽 製作，僅供個人與教學非商業使用） — 小琴（語音小幫手、鼓勵動畫、星星、詼諧提醒） */
(function () {
'use strict';
const F = {};
let S = null, save = () => {};
const $ = s => document.querySelector(s);
const pick = a => a[Math.floor(Math.random() * a.length)];

/* ---------- 語音 ---------- */
let voice = null;
function chooseVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  voice = vs.find(v => /zh[-_]TW/i.test(v.lang)) || vs.find(v => /zh[-_](HK|Hant)/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { chooseVoice(); speechSynthesis.onvoiceschanged = chooseVoice; }
F.canSpeak = () => 'speechSynthesis' in window;
F.say = function (text, opts = {}) {
  if (!S || !S.voice || !F.canSpeak()) return;
  if (opts.interrupt !== false) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/cents/g, '音分').replace(/♯/g, '升').replace(/♭/g, '降'));
  u.lang = 'zh-TW'; if (voice) u.voice = voice;
  u.rate = opts.rate || 0.95; u.pitch = 1.15; u.volume = 1;
  speechSynthesis.speak(u);
};
F.stopSpeak = () => { if (F.canSpeak()) speechSynthesis.cancel(); };

/* ---------- 小琴角色 ---------- */
const FACES = {
  happy: '<circle cx="34" cy="44" r="3.2"/><circle cx="54" cy="44" r="3.2"/><path d="M36 54 Q44 61 52 54" stroke-width="2.6" fill="none"/>',
  cheer: '<path d="M30 44 Q34 39 38 44" stroke-width="2.6" fill="none"/><path d="M50 44 Q54 39 58 44" stroke-width="2.6" fill="none"/><path d="M35 52 Q44 64 53 52 Z"/>',
  think: '<circle cx="34" cy="44" r="3"/><circle cx="54" cy="44" r="3"/><path d="M38 56 L50 55" stroke-width="2.6"/>',
  dizzy: '<path d="M31 41 l6 6 M37 41 l-6 6 M51 41 l6 6 M57 41 l-6 6" stroke-width="2.4"/><path d="M37 57 Q41 53 44 57 Q47 61 51 57" stroke-width="2.4" fill="none"/>',
  sleepy: '<path d="M30 45 L38 45 M50 45 L58 45" stroke-width="2.6"/><circle cx="44" cy="56" r="3"/>',
  wow: '<circle cx="34" cy="44" r="3.6"/><circle cx="54" cy="44" r="3.6"/><ellipse cx="44" cy="56" rx="4" ry="5"/>'
};
function mascotSVG() {
  return `<svg viewBox="0 0 88 120" aria-hidden="true">
    <g class="body">
      <path d="M44 6 C52 6 56 14 56 22 C56 28 66 30 68 40 C70 50 62 52 62 58 C62 64 74 68 74 84 C74 102 60 114 44 114 C28 114 14 102 14 84 C14 68 26 64 26 58 C26 52 18 50 20 40 C22 30 32 28 32 22 C32 14 36 6 44 6 Z" fill="var(--fun-body)" stroke="var(--fun-line)" stroke-width="2.5"/>
      <path d="M38 76 Q36 84 40 90 M50 76 Q52 84 48 90" stroke="var(--fun-line)" stroke-width="2" fill="none"/>
      <rect x="40" y="94" width="8" height="12" rx="2" fill="var(--fun-line)"/>
      <circle cx="26" cy="52" r="4" fill="var(--fun-cheek)"/><circle cx="62" cy="52" r="4" fill="var(--fun-cheek)"/>
      <g class="face" fill="var(--fun-line)" stroke="var(--fun-line)" stroke-linecap="round">${FACES.happy}</g>
      <g class="dress">${dressSVG(stageOf(S ? S.stars || 0 : 0).i)}</g>
    </g>
  </svg>`;
}
/* 裝扮：小樹苗以後依序解鎖 領結 → 音符帽 → 披風 → 皇冠 */
function dressSVG(i) {
  let g = '';
  if (i >= 2) g += '<path d="M36 66 L44 70 L36 74 Z M52 66 L44 70 L52 74 Z" fill="#cf4339"/><circle cx="44" cy="70" r="2.2" fill="#a8322a"/>';
  if (i >= 4) g += '<path d="M10 70 Q6 96 16 110 L28 96 Z M78 70 Q82 96 72 110 L60 96 Z" fill="#2f6fbf" opacity=".85"/>';
  if (i >= 3 && i < 6) g += '<path d="M30 14 Q44 -2 58 14 Z" fill="#2d5a4c"/><rect x="28" y="13" width="32" height="4" rx="2" fill="#1e3e34"/><text x="44" y="11" text-anchor="middle" font-size="9" fill="#fff">♪</text>';
  if (i >= 6) g += '<path d="M30 16 L32 4 L38 11 L44 1 L50 11 L56 4 L58 16 Z" fill="#e3b33a" stroke="#a8742c" stroke-width="1.2"/><circle cx="44" cy="8" r="1.6" fill="#cf4339"/>';
  return g;
}
function ensureDom() {
  if ($('#fun')) return;
  const style = document.createElement('style');
  style.textContent = `
  :root{--fun-body:#d9a35f;--fun-line:#3b2a1a;--fun-cheek:#f0a08a;--fun-bubble:#ffffff;--fun-ink:#1c211f}
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--fun-bubble:#26302b;--fun-ink:#e6ebe8}}
  :root[data-theme="dark"]{--fun-bubble:#26302b;--fun-ink:#e6ebe8}
  #fun{position:fixed;right:calc(14px + env(safe-area-inset-right,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:45;display:flex;align-items:flex-end;gap:8px;pointer-events:none}
  #fun .mascot{width:72px;height:98px;pointer-events:auto;cursor:pointer;filter:drop-shadow(0 4px 6px rgba(0,0,0,.15));transform-origin:50% 100%}
  #fun .mascot svg{width:100%;height:100%}
  #fun .bubble{max-width:min(320px,calc(100vw - 120px));background:var(--fun-bubble);color:var(--fun-ink);border:1px solid var(--line,#ddd);border-radius:16px 16px 4px 16px;padding:10px 14px;font-size:15px;line-height:1.55;box-shadow:0 6px 20px rgba(0,0,0,.12);opacity:0;transform:translateY(8px) scale(.96);transition:all .25s;pointer-events:auto}
  #fun .bubble.show{opacity:1;transform:none}
  #fun.hide-mascot .mascot{display:none}
  .fun-bounce{animation:funBounce .7s ease}
  .fun-jump{animation:funJump .9s ease}
  .fun-wobble{animation:funWobble 1s ease}
  .fun-spin{animation:funSpin 1s ease}
  @keyframes funBounce{0%,100%{transform:none}30%{transform:translateY(-10px) scale(1.04,.96)}60%{transform:translateY(0) scale(.97,1.03)}}
  @keyframes funJump{0%,100%{transform:none}25%{transform:translateY(-26px) rotate(-6deg)}50%{transform:translateY(0)}70%{transform:translateY(-12px) rotate(5deg)}}
  @keyframes funWobble{0%,100%{transform:none}20%{transform:rotate(-12deg)}40%{transform:rotate(10deg)}60%{transform:rotate(-8deg)}80%{transform:rotate(5deg)}}
  @keyframes funSpin{0%{transform:none}100%{transform:rotate(360deg)}}
  .garden{position:fixed;inset:0;z-index:70;background:rgba(15,20,18,.45);display:grid;place-items:center;padding:16px}
  .garden[hidden]{display:none}
  .garden-card{position:relative;background:var(--surface,#fff);color:var(--ink,#1c211f);border-radius:18px;padding:20px 22px;width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.25)}
  .garden-card h3{margin:2px 0 10px;font-family:var(--display,serif);font-size:22px}
  .g-x{position:absolute;right:12px;top:8px;border:0;background:none;font-size:24px;color:var(--muted,#888);cursor:pointer}
  .g-plant{width:min(240px,70vw);height:auto;display:block;margin:0 auto;animation:grow .8s ease}
  @keyframes grow{0%{transform:scale(.85);opacity:.4}100%{transform:none;opacity:1}}
  .g-bar{height:10px;border-radius:5px;background:var(--sunk,#eee);overflow:hidden;margin:12px 0 6px}
  .g-bar b{display:block;height:100%;background:linear-gradient(90deg,#5cc07d,#e3b33a);border-radius:5px}
  .g-note{font-size:14px;margin:4px 0 12px}
  .g-stages{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
  .g-stages div{display:flex;flex-direction:column;align-items:center;font-size:11px;color:var(--muted,#888);filter:grayscale(1) opacity(.45)}
  .g-stages div.got{filter:none;color:var(--ink,#1c211f)}
  .g-stages svg{width:100%;height:auto;border-radius:8px}
  .g-tip{font-size:12.5px;color:var(--muted,#888);margin:12px 0 0}
  .pill-plant{width:22px;height:22px;border-radius:6px}
  @media (max-width:520px){.g-stages{grid-template-columns:repeat(4,minmax(0,1fr))}}
  #funCanvas{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:44}
  .starpop{position:absolute;font:700 14px var(--body,system-ui);color:#c58c0c;pointer-events:none;animation:starPop 1.1s ease forwards;white-space:nowrap}
  @keyframes starPop{0%{opacity:0;transform:translate(-50%,6px) scale(.6)}20%{opacity:1;transform:translate(-50%,-6px) scale(1.15)}100%{opacity:0;transform:translate(-50%,-34px) scale(1)}}
  .mbox.lv-g .lamp{animation:lampPop .5s ease}
  @keyframes lampPop{0%{transform:scale(.4)}60%{transform:scale(1.5)}100%{transform:scale(1)}}
  .combo{position:fixed;left:50%;top:22%;transform:translate(-50%,-50%);font:700 clamp(28px,6vw,52px) var(--display,serif);color:var(--accent,#2d5a4c);pointer-events:none;z-index:46;animation:combo 1.4s ease forwards;text-shadow:0 2px 0 var(--bg,#fff)}
  @keyframes combo{0%{opacity:0;transform:translate(-50%,-30%) scale(.6)}20%{opacity:1;transform:translate(-50%,-50%) scale(1.1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-70%) scale(1)}}
  @media (prefers-reduced-motion:reduce){.fun-bounce,.fun-jump,.fun-wobble,.fun-spin,.starpop,.combo,.mbox.lv-g .lamp{animation:none!important}}
  `;
  document.head.appendChild(style);
  const box = document.createElement('div'); box.id = 'fun';
  box.innerHTML = `<div class="bubble" id="funBubble" role="status" aria-live="polite"></div><div class="mascot" id="funMascot" title="小琴（點我聽說明）">${mascotSVG()}</div>`;
  document.body.appendChild(box);
  const cv = document.createElement('canvas'); cv.id = 'funCanvas'; document.body.appendChild(cv);
  $('#funMascot').addEventListener('click', () => { if (F.onMascotClick) F.onMascotClick(); });
}

F.mood = function (m, anim) {
  const face = document.querySelector('#funMascot .face'); if (!face) return;
  face.innerHTML = FACES[m] || FACES.happy;
  const el = $('#funMascot');
  if (anim) { el.classList.remove('fun-bounce', 'fun-jump', 'fun-wobble', 'fun-spin'); void el.offsetWidth; el.classList.add('fun-' + anim); }
  clearTimeout(F._moodT);
  if (m !== 'happy') F._moodT = setTimeout(() => F.mood('happy'), 6000);
};
F.bubble = function (text, ms = 5200) {
  const b = $('#funBubble'); if (!b) return;
  b.textContent = text; b.classList.add('show');
  clearTimeout(F._bT); F._bT = setTimeout(() => b.classList.remove('show'), ms);
};
/* 說一句話：泡泡＋語音＋表情 */
F.talk = function (text, mood = 'happy', anim = 'bounce', opts = {}) {
  F.bubble(text, opts.ms); F.mood(mood, anim); F.say(text, opts);
};

/* ---------- 彩帶 ---------- */
let parts = [], rafId = 0;
F.confetti = function (n = 120) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#funCanvas'); if (!cv) return;
  const dpr = devicePixelRatio || 1; cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cols = ['#2f9e5b', '#d49a12', '#e0782a', '#2f6fbf', '#cf4339', '#86c4ad'];
  for (let i = 0; i < n; i++) parts.push({
    x: innerWidth * (0.2 + Math.random() * 0.6), y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 11 - 4,
    r: 4 + Math.random() * 5, c: pick(cols), a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, life: 0, note: Math.random() < 0.18
  });
  if (!rafId) {
    const step = () => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(p => {
        p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va; p.life++;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
        if (p.note) { ctx.font = `${p.r * 4}px serif`; ctx.fillText('♪', -p.r, p.r); }
        else ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        ctx.restore();
      });
      parts = parts.filter(p => p.y < innerHeight + 40 && p.life < 260);
      if (parts.length) rafId = requestAnimationFrame(step); else { rafId = 0; ctx.clearRect(0, 0, innerWidth, innerHeight); }
    };
    rafId = requestAnimationFrame(step);
  }
};
F.starPop = function (el, text = '+1 ★') {
  if (!el) return;
  const s = document.createElement('span'); s.className = 'starpop'; s.textContent = text;
  const r = el.getBoundingClientRect();
  s.style.left = (r.left + r.width / 2 + scrollX) + 'px'; s.style.top = (r.top + scrollY - 6) + 'px';
  s.style.position = 'absolute'; document.body.appendChild(s);
  setTimeout(() => s.remove(), 1200);
};
F.combo = function (text) {
  const d = document.createElement('div'); d.className = 'combo'; d.textContent = text; document.body.appendChild(d);
  setTimeout(() => d.remove(), 1500);
};

/* ---------- 星星與稱號 ---------- */
const STAGES = [
  { at: 0, name: '小種子', title: '小種子', unlock: '' },
  { at: 10, name: '小豆芽', title: '小豆芽', unlock: '' },
  { at: 50, name: '小樹苗', title: '小琴童', unlock: '小琴戴上紅色領結' },
  { at: 150, name: '長出花苞', title: '小樂手', unlock: '小琴戴上音符帽' },
  { at: 350, name: '開花了', title: '小首席', unlock: '小琴披上藍色披風' },
  { at: 700, name: '結出音符果', title: '小音樂家', unlock: '音符果實會發光' },
  { at: 1500, name: '音樂大樹', title: '琴房大師', unlock: '小琴戴上金色皇冠' }
];
const TITLES = STAGES.map(x => [x.at, x.title]);
function stageOf(n) { let i = 0; STAGES.forEach((x, k) => { if (n >= x.at) i = k; }); return Object.assign({ i }, STAGES[i]); }
F.stageOf = stageOf;
F.title = n => stageOf(n).title;
F.nextTitle = n => { const x = STAGES.find(t => t.at > n); return x ? [x.at, x.title] : null; };

/* 音樂樹：依星星數畫出植物（0＝種子 … 6＝大樹），frac 是這一階段長了多少 */
function plantSVG(i, frac) {
  const g = Math.min(1, frac || 0);
  let p = '<rect x="0" y="0" width="240" height="240" fill="var(--fun-sky, #eef5f1)" rx="18"/>';
  p += '<ellipse cx="120" cy="214" rx="90" ry="16" fill="#8a6a45"/><ellipse cx="120" cy="208" rx="80" ry="12" fill="#a8845a"/>';
  const leaf = (x, y, r, a, c = '#3f9a63') => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.45}" transform="rotate(${a} ${x} ${y})" fill="${c}"/>`;
  if (i === 0) {
    p += `<ellipse cx="120" cy="204" rx="${10 + 2 * g}" ry="7" fill="#7a5130"/><path d="M120 197 q2 -${4 + 8 * g} 6 -${6 + 10 * g}" stroke="#4fb071" stroke-width="3" fill="none" opacity="${g}"/>`;
    return p;
  }
  const h = [0, 40, 85, 115, 135, 150, 165][i] + g * 15;
  const top = 206 - h;
  const trunkW = [0, 3, 5, 7, 9, 11, 16][i];
  p += `<path d="M120 206 C${118 - trunkW / 2} ${206 - h * 0.4} ${122 + trunkW / 3} ${206 - h * 0.7} 120 ${top}" stroke="${i >= 3 ? '#7b5533' : '#4fa36a'}" stroke-width="${trunkW}" fill="none" stroke-linecap="round"/>`;
  if (i === 1) { p += leaf(110, top + 8, 12, -30, '#5cc07d') + leaf(130, top + 8, 12, 30, '#5cc07d'); return p; }
  if (i === 2) { p += leaf(104, top + 22, 16, -25) + leaf(136, top + 30, 16, 25) + leaf(110, top + 2, 13, -40, '#5cc07d') + leaf(130, top + 4, 13, 40, '#5cc07d'); return p; }
  // 樹冠
  const R = [0, 0, 0, 38, 48, 58, 78][i] + g * 6;
  const cy = top + R * 0.35;
  p += `<circle cx="120" cy="${cy}" r="${R}" fill="#3f9a63"/><circle cx="${120 - R * 0.55}" cy="${cy + R * 0.25}" r="${R * 0.62}" fill="#46a86c"/><circle cx="${120 + R * 0.55}" cy="${cy + R * 0.2}" r="${R * 0.64}" fill="#3a9160"/><circle cx="120" cy="${cy - R * 0.35}" r="${R * 0.6}" fill="#4fb071"/>`;
  const spots = [[-0.5, -0.1], [0.45, -0.25], [0.05, 0.25], [-0.2, -0.55], [0.6, 0.35], [-0.65, 0.4], [0.25, -0.6], [-0.05, -0.05]];
  if (i === 3) spots.slice(0, 5).forEach(([dx, dy]) => { p += `<circle cx="${120 + dx * R}" cy="${cy + dy * R}" r="5" fill="#f2b6c4"/><circle cx="${120 + dx * R}" cy="${cy + dy * R}" r="2" fill="#e07a95"/>`; });
  if (i >= 4) spots.slice(0, i === 4 ? 6 : 8).forEach(([dx, dy]) => { const x = 120 + dx * R, y = cy + dy * R; p += [0, 72, 144, 216, 288].map(a => `<ellipse cx="${x}" cy="${y - 5}" rx="3" ry="5" transform="rotate(${a} ${x} ${y})" fill="#f7c6d3"/>`).join('') + `<circle cx="${x}" cy="${y}" r="2.6" fill="#e3b33a"/>`; });
  if (i >= 5) [[-0.3, 0.55], [0.35, 0.6], [0.7, 0.05], [-0.75, 0.1]].forEach(([dx, dy]) => { const x = 120 + dx * R, y = cy + dy * R; p += `<text x="${x}" y="${y}" font-size="${i >= 6 ? 20 : 16}" text-anchor="middle" fill="${i >= 6 ? '#e3b33a' : '#cf4339'}" ${i >= 6 ? 'filter="url(#glow)"' : ''}>♪</text>`; });
  if (i >= 6) p = '<defs><filter id="glow"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' + p + '<text x="200" y="40" font-size="22" fill="#e3b33a">✦</text><text x="36" y="60" font-size="16" fill="#e3b33a">✦</text>';
  return p;
}
F.plantSVG = plantSVG;
/* 「我的音樂樹」視窗 */
F.openGarden = function () {
  const n = S.stars || 0, sg = stageOf(n), nx = STAGES[sg.i + 1];
  const frac = nx ? (n - sg.at) / (nx.at - sg.at) : 1;
  let box = $('#garden');
  if (!box) { box = document.createElement('div'); box.id = 'garden'; box.className = 'garden'; document.body.appendChild(box); }
  box.innerHTML = `<div class="garden-card" role="dialog" aria-label="我的音樂樹"><button class="g-x" aria-label="關閉">×</button>
    <div class="eyebrow">我的音樂樹</div><h3>${sg.name}${sg.name !== sg.title ? "・" + sg.title : ""}</h3>
    <svg viewBox="0 0 240 240" class="g-plant">${plantSVG(sg.i, frac)}</svg>
    <div class="g-bar"><b style="width:${Math.round(frac * 100)}%"></b></div>
    <p class="g-note">★ ${n} 顆星${nx ? `，再 ${nx.at - n} 顆就會長成「${nx.name}」${nx.unlock ? '，' + nx.unlock : ''}！` : '，已經長成最高的音樂大樹了！'}</p>
    <div class="g-stages">${STAGES.map((x, k) => `<div class="${k <= sg.i ? 'got' : ''}"><svg viewBox="0 0 240 240">${plantSVG(k, 1)}</svg><span>${x.name}</span><small>${x.at} ★</small></div>`).join('')}</div>
    <p class="g-tip">綠燈小節 +1 ★、整首全綠 +3 ★、基本功過關 +5 ★。每天練一點，樹就會一直長大！</p></div>`;
  box.hidden = false;
  box.querySelector('.g-x').onclick = () => { box.hidden = true; };
  box.onclick = e => { if (e.target === box) box.hidden = true; };
};
F.addStars = function (k, el) {
  if (!k) return;
  const before = stageOf(S.stars || 0).i;
  S.stars = (S.stars || 0) + k; save();
  F.renderStars();
  if (el) F.starPop(el, `+${k} ★`);
  const sg = stageOf(S.stars);
  if (sg.i !== before) setTimeout(() => {
    F.confetti(180);
    const d = document.querySelector('#funMascot .dress'); if (d) d.innerHTML = dressSVG(sg.i);
    F.talk(`長大了！你的音樂樹變成「${sg.name}」，你現在是「${sg.title}」！${sg.unlock ? sg.unlock + '！' : ''}`, 'cheer', 'spin');
    F.openGarden();
  }, 600);
};
F.renderStars = function () {
  const el = $('#starPill'); if (!el) return;
  const n = S.stars || 0, nx = F.nextTitle(n);
  const sg = stageOf(n), nxs = STAGES[sg.i + 1], frac = nxs ? (n - sg.at) / (nxs.at - sg.at) : 1;
  el.innerHTML = `<svg viewBox="0 0 240 240" class="pill-plant">${plantSVG(sg.i, frac)}</svg><b>★ ${n}</b><span>${sg.title}</span>`;
  el.title = (nx ? `再 ${nx[0] - n} 顆星長大成「${nxs.name}」` : '已經是最高的音樂大樹了！') + '（點我看音樂樹）';
  el.style.cursor = 'pointer'; el.onclick = F.openGarden;
};

/* ---------- 台詞 ---------- */
const L = {
  hello: ['你好，我是小琴！今天也要一起練琴喔。', '嗨！小琴等你好久了，我們開始吧！'],
  start: ['準備好了嗎？聽完預備拍再進來喔。', '深呼吸，肩膀放鬆，我們開始！', '弓放好了嗎？預備拍之後開始！'],
  measureGood: ['好聽！', '這一小節好穩！', '耳朵好厲害！', '漂亮！', '對了對了！'],
  combo5: ['連續 5 小節綠燈！手指在跳舞！', '五連綠！停不下來了！'],
  combo10: ['十連綠燈！你是不是偷偷練過？', '十個綠燈！小琴要拍手了！'],
  allGreen: ['全部綠燈！太厲害了，給你一個大大的讚！', '音準節奏都過關！上課拉給老師聽，讓老師也嚇一跳！', '全綠！小琴要放彩帶了！'],
  improved: n => [`比上次進步 ${n} 分！努力有看到喔！`, `進步 ${n} 分！再練幾次會更棒！`],
  ok: ['很不錯！把黃燈和紅燈的地方再練一下就更好了。', '有進步的空間，我們一起把紅燈變綠燈！'],
  tough: ['這段有點難，沒關係，我們放慢速度一小節一小節來。', '別灰心！大音樂家也是一小節一小節練出來的。'],
  // 詼諧提醒（亂拉、不耐煩）
  chaos: ['哎呀～小提琴說它頭好暈，我們把速度調慢一點好不好？', '這是新的曲子嗎？小琴好像沒聽過耶～我們照譜來好嗎？', '弓好像在跳霹靂舞，請它乖乖走直線～', '琴弦在偷偷笑喔！我們按「聆聽示範」先聽一次？'],
  loud: ['哇！好大聲，連隔壁的貓都嚇醒了～輕一點會更好聽喔。', '小琴的耳朵快爆炸了！弓的力氣小一點點～'],
  wrongMany: ['嘿嘿，這個音躲起來了嗎？按「提示音」聽聽它在哪裡～', '手指迷路了嗎？看看上面寫的指法，小琴陪你慢慢找。', '再試一次！聽完提示音，手指輕輕放下去。'],
  restless: ['不要急不要急，深呼吸，數到三再開始～', '一直重來會累喔，先喝口水，再慢慢拉一次？'],
  sleepy: ['咦？你睡著了嗎？小琴在等你喔～', '有人在嗎？小琴聽不到琴聲耶～'],
  coachUp: s => [`連續三次綠燈！速度提高到 ${s}%，挑戰看看！`],
  coachPass: ['這一段過關了！換下一段！'],
  levelDone: ['難的地方都過關了！最後用比賽模式從頭拉一次，再拉給老師聽聽看吧！']
};
F.line = (k, arg) => { const v = L[k]; return pick(typeof v === 'function' ? v(arg) : v); };

/* ---------- 情緒判斷（由小幫手呼叫） ---------- */
const memo = { lastFun: 0, starts: [], combo: 0 };
const rateOk = (gap = 15000) => { const n = Date.now(); if (n - memo.lastFun < gap) return false; memo.lastFun = n; return true; };
F.event = function (type, d = {}) {
  if (!S) return;
  switch (type) {
    case 'start': {
      const now = Date.now();
      memo.starts = memo.starts.filter(t => now - t < 45000); memo.starts.push(now); memo.combo = 0; memo.reds = 0; memo.silent = 0;
      if (memo.starts.length >= 4 && rateOk()) F.talk(F.line('restless'), 'think', 'wobble');
      else if (Math.random() < 0.35) F.talk(F.line('start'), 'happy', 'bounce', { ms: 3000 });
      break;
    }
    case 'measure': {
      const el = document.querySelector(`.mbox[data-m="${d.m}"] .lamp`);
      if (d.level === 'g') {
        memo.combo++; memo.reds = 0; memo.silent = 0;
        F.addStars(1, el);
        if (memo.combo === 5) { F.combo('5 連綠燈！'); F.talk(F.line('combo5'), 'cheer', 'jump', { ms: 3000 }); }
        else if (memo.combo === 10) { F.combo('10 連綠燈！'); F.confetti(80); F.talk(F.line('combo10'), 'cheer', 'jump', { ms: 3000 }); }
        else if (memo.combo % 3 === 0) F.mood('cheer', 'bounce');
      } else {
        memo.combo = 0;
        if (d.level === 'r') memo.reds = (memo.reds || 0) + 1; else memo.reds = 0;
        if (d.silent) memo.silent = (memo.silent || 0) + 1; else memo.silent = 0;
        if (memo.silent >= 2 && rateOk()) F.talk(F.line('sleepy'), 'sleepy', 'wobble');
        else if (d.chaos && memo.reds >= 3 && rateOk()) F.talk(F.line('chaos'), 'dizzy', 'spin');
      }
      break;
    }
    case 'loud': if (rateOk(20000)) F.talk(F.line('loud'), 'wow', 'wobble'); break;
    case 'wrongMany': if (rateOk(12000)) F.talk(F.line('wrongMany'), 'think', 'wobble'); break;
    case 'waitGood': F.addStars(d.stars || 0, d.el); if (Math.random() < 0.25) F.mood('cheer', 'bounce'); break;
    case 'finish': {
      const s = d.sum; if (!s) break;
      if (s.counts.r === 0 && s.counts.y === 0 && (s.counts.g || 0) > 0) { F.confetti(); F.addStars(3); F.talk(F.line('allGreen'), 'cheer', 'jump'); }
      else if (d.improved > 0) F.talk(F.line('improved', d.improved), 'cheer', 'bounce');
      else if (s.score >= 60) F.talk(F.line('ok'), 'happy', 'bounce');
      else F.talk(F.line('tough'), 'think', 'bounce');
      break;
    }
    case 'coachUp': F.confetti(60); F.talk(F.line('coachUp', d.speed), 'cheer', 'jump'); break;
    case 'coachPass': F.confetti(90); F.talk(F.line('coachPass'), 'cheer', 'jump'); break;
    case 'levelDone': F.confetti(200); F.talk(F.line('levelDone'), 'cheer', 'jump'); break;
  }
};

/* ---------- 給幼兒聽的說明 ---------- */
F.GUIDE = {
  practice: '你好，我是練琴小幫手小琴！我會陪你在家練習，幫你聽音準和節奏。請大人先幫你把麥克風夾在衣服上，然後按右上角的「開啟」。想知道歌怎麼拉，就按「聆聽示範」。準備好了，按綠色的「開始練習」。拉完之後，看每一小節右上角的燈：綠燈是很棒，黃燈是差一點點，紅燈要再拉一次。',
  tuner: '這裡是調音。拉一條空弦，看中間的指針。指針跑到中間、變成綠色，就是調好了。不會轉弦軸的話，請大人幫忙。',
  library: '這裡是曲庫，放著所有的歌。按「練習」就可以開始練那一首。',
  log: '這裡是你的練習紀錄。線越往上，表示你越來越厲害喔！',
  settings: '這裡是給大人用的設定。第一次使用時，請大人幫你測量噪音，再做延遲校正。'
};

F.init = function (settings, saver) {
  S = settings; save = saver;
  ensureDom();
  F.renderStars();
  if (S.mascot === false) $('#fun').classList.add('hide-mascot');
};
F.setMascot = on => { const b = $('#fun'); if (b) b.classList.toggle('hide-mascot', !on); };
window.FUN = F;
})();
