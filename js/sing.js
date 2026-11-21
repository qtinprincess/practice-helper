/* 練琴小幫手（© 悠樂媽媽 製作，僅供個人與教學非商業使用） — 跟唱（不用樂譜：用一段清唱錄音當標準，跟著唱、看音高曲線、評分） */
(function () {
'use strict';
const S = {};
let L = null, E = null;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const st = { ref: null, run: null, last: null };
const listKey = 'lr.singList';
const getList = () => L.store.get(listKey, []);

/* 錄音 → 音高曲線（每 10 毫秒一點，半音為單位） */
async function contourOf(samples, sr, onP) {
  const frames = await E.analyzeBufferAsync(samples, sr, onP, 70);
  const rms = frames.map(f => f.rms).slice().sort((a, b) => a - b);
  const gate = Math.max(0.003, 0.08 * (rms[Math.floor(rms.length * 0.9)] || 0.05));
  const pts = frames.map(f => ({ t: f.t, m: E.isVoiced(f, gate) && f.c > 0.85 ? E.midiFloat(f.f, L.settings.A) : null, r: f.rms }));
  // 去掉單點跳動：前後都沒聲音的孤立點不要
  for (let i = 1; i < pts.length - 1; i++) if (pts[i].m != null && pts[i - 1].m == null && pts[i + 1].m == null) pts[i].m = null;
  const voiced = pts.filter(p => p.m != null).length / Math.max(1, pts.length);
  return { pts, voiced, gate };
}
/* 樂句：有聲音的段落，中間停超過 0.35 秒就算新的一句 */
function phrasesOf(pts) {
  const out = []; let cur = null, gap = 0;
  pts.forEach(p => {
    if (p.m != null) { if (!cur) cur = { t0: p.t, t1: p.t }; cur.t1 = p.t; gap = 0; }
    else if (cur) { gap += 0.0107; if (gap > 0.35) { if (cur.t1 - cur.t0 > 0.4) out.push(cur); cur = null; gap = 0; } }
  });
  if (cur && cur.t1 - cur.t0 > 0.4) out.push(cur);
  return out;
}

S.render = function () {
  const host = $('#v-sing'); if (!host) return;
  const list = getList();
  host.innerHTML = `
  <div class="songhead"><div><div class="eyebrow">跟唱</div><h1>跟著錄音唱</h1>
    <p class="muted" style="max-width:62ch">不用樂譜也能練唱。先放一段<b>清唱錄音</b>當標準（老師或自己唱的都可以），再戴耳機跟著唱，小幫手會畫出兩條音高線，告訴你哪一句偏高、偏低或慢了。</p></div>
    <button class="speak" id="singGuide">聽說明</button></div>
  <div class="sing-grid">
    <div class="card panel">
      <h3>1. 選標準錄音</h3>
      <div class="field"><label class="btn" for="singFile">上傳清唱錄音</label><input type="file" id="singFile" accept="audio/*,.mp3,.m4a,.wav" hidden>
        <button class="btn" id="singRec">${st.run && st.run.kind === 'rec' ? '停止錄音' : '現場錄一段'}</button></div>
      <p class="ens-note">請用自己或老師錄的清唱，或有權使用的人聲音檔。有樂團伴奏的歌曲 mp3 抓不準旋律；YouTube 影片無法分析。</p>
      <div class="sing-list">${list.length ? list.map(x => `<div class="sing-item ${st.ref && st.ref.id === x.id ? 'on' : ''}"><button class="linkish" data-sid="${esc(x.id)}">${esc(x.name)}</button><span class="muted num">${fmt(x.dur || 0)}${x.best != null ? '・最佳 ' + x.best + ' 分' : ''}</span><button class="btn sm danger" data-sdel="${esc(x.id)}">刪除</button></div>`).join('') : '<p class="muted">還沒有標準錄音。</p>'}</div>
      <p class="ens-note" id="singMsg"></p>
    </div>
    <div class="card panel">
      <h3>2. 跟著唱</h3>
      <p class="muted" id="singNow">${st.ref ? '目前標準：<b>' + esc(st.ref.name) + '</b>' : '先選一段標準錄音。'}</p>
      <div class="field">
        <button class="btn primary" id="singGo" ${st.ref ? '' : 'disabled'}>開始跟唱</button>
        <button class="btn" id="singListen" ${st.ref ? '' : 'disabled'}>先聽一次</button>
        <button class="btn" id="singStop" disabled>停止</button>
      </div>
      <div class="field">
        <label class="toggle"><input type="checkbox" id="singOct" ${L.settings.singOct !== false ? 'checked' : ''}>男生、女生差八度也算對</label>
        <label class="mini-field">錄音音量 <input type="range" id="singVol" min="0" max="1" step="0.05" value="${L.settings.singVol ?? 0.7}"></label>
      </div>
      <p class="ens-note">戴耳機唱，麥克風只收你的聲音。綠點＝準（±25 cents）、黃點＝差一點、紅點＝偏離較多。</p>
    </div>
  </div>
  <div class="card sing-canvas-wrap"><canvas id="singCanvas" height="260"></canvas><div class="sing-legend"><span><i class="ref"></i>標準</span><span><i style="background:var(--ok)"></i>你（準）</span><span><i style="background:var(--warn)"></i>差一點</span><span><i style="background:var(--bad)"></i>偏離</span><span class="num" id="singClock"></span></div></div>
  <div id="singReport"></div>`;
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  on('#singGuide', 'click', () => L.FUN.talk('跟唱的用法：先上傳或錄一段清唱當標準。戴上耳機，按開始跟唱，跟著錄音一起唱。灰色的線是標準，彩色的點是你。綠色代表唱得準。', 'happy', 'bounce', { ms: 12000 }));
  on('#singFile', 'change', e => { importFile(e.target.files[0]); e.target.value = ''; });
  on('#singRec', 'click', () => { if (st.run && st.run.kind === 'rec') stopRun(); else recordRef(); });
  host.querySelectorAll('[data-sid]').forEach(b => b.addEventListener('click', () => loadRef(b.dataset.sid)));
  host.querySelectorAll('[data-sdel]').forEach(b => b.addEventListener('click', async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '確定？'; setTimeout(() => { b.dataset.armed = ''; b.textContent = '刪除'; }, 3000); return; }
    await L.IDB.del('sing:' + b.dataset.sdel); L.store.set(listKey, getList().filter(x => x.id !== b.dataset.sdel));
    if (st.ref && st.ref.id === b.dataset.sdel) st.ref = null; S.render();
  }));
  on('#singGo', 'click', () => start(true));
  on('#singListen', 'click', () => start(false));
  on('#singStop', 'click', stopRun);
  on('#singOct', 'change', e => { L.settings.singOct = e.target.checked; L.save(); });
  on('#singVol', 'input', e => { L.settings.singVol = +e.target.value; L.save(); });
  sizeCanvas(); draw(0);
  if (st.last) report(st.last);
};
function sizeCanvas() {
  const c = $('#singCanvas'); if (!c) return;
  const w = c.parentElement.clientWidth - 2, dpr = devicePixelRatio || 1;
  c.width = w * dpr; c.height = 260 * dpr; c.style.width = w + 'px'; c.style.height = '260px';
}
async function importFile(file) {
  if (!file) return;
  const ctx = await L.ac(); const msg = $('#singMsg');
  try {
    msg.textContent = '讀取中…';
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    if (buf.duration > 600) throw new Error('錄音超過 10 分鐘');
    const x = mono(buf);
    await saveRef(x, buf.sampleRate, file.name.replace(/\.[^.]+$/, ''), { kind: 'file', blob: file });
  } catch (e) { msg.textContent = '無法讀取：' + (e.message || '格式不支援'); }
}
const mono = buf => { if (buf.numberOfChannels === 1) return buf.getChannelData(0); const o = new Float32Array(buf.length); for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) o[i] += d[i] / buf.numberOfChannels; } return o; };
async function saveRef(x, sr, name, meta) {
  const msg = $('#singMsg');
  const cont = await contourOf(x, sr, p => { msg.textContent = `分析旋律中… ${Math.round(p * 100)}%`; });
  if (cont.voiced < 0.15) { msg.textContent = '這段錄音幾乎抓不到旋律（可能伴奏太大聲，或不是人聲）。請改用清唱錄音。'; return; }
  const id = 's' + Date.now().toString(36);
  const rec = Object.assign({ name, sr, dur: x.length / sr, cont: { pts: cont.pts.map(p => [Math.round(p.t * 1000) / 1000, p.m == null ? null : Math.round(p.m * 100) / 100]) } }, meta);
  if (meta.kind === 'pcm') rec.data = x.buffer.slice(0);
  await L.IDB.put('sing:' + id, rec);
  const list = getList(); list.unshift({ id, name, dur: rec.dur }); L.store.set(listKey, list);
  msg.textContent = cont.voiced < 0.35 ? '已加入。提醒：這段錄音有很多地方抓不到音高，評分可能不準。' : '已加入，可以開始跟唱了！';
  await loadRef(id);
}
async function loadRef(id) {
  const r = await L.IDB.get('sing:' + id); if (!r) return;
  const ctx = await L.ac();
  let buf;
  if (r.kind === 'pcm') { const d = new Float32Array(r.data); buf = ctx.createBuffer(1, d.length, r.sr); buf.getChannelData(0).set(d); }
  else buf = await ctx.decodeAudioData(await r.blob.arrayBuffer());
  const pts = r.cont.pts.map(([t, m]) => ({ t, m }));
  let peak = 0; const d = buf.getChannelData(0); for (let i = 0; i < d.length; i += 7) peak = Math.max(peak, Math.abs(d[i]));
  st.ref = { id, name: r.name, buf, gain: peak > 0 ? Math.min(6, 0.85 / peak) : 1, pts, phrases: phrasesOf(pts), dur: buf.duration };
  const ms = pts.filter(p => p.m != null).map(p => p.m).sort((a, b) => a - b);
  st.ref.lo = Math.floor((ms[Math.floor(ms.length * 0.02)] || 55) - 3); st.ref.hi = Math.ceil((ms[Math.floor(ms.length * 0.98)] || 72) + 3);
  st.last = null; S.render();
}
async function recordRef() {
  const ctx = await L.ac(); if (!await L.openMic()) return;
  L.AU.chunks = []; L.AU.frames = []; L.AU.recT0 = null; L.AU.rec = true;
  st.run = { kind: 'rec', t0: ctx.currentTime };
  S.render(); $('#singMsg').textContent = '錄音中…唱完按「停止錄音」。';
  const tick = () => { if (!st.run || st.run.kind !== 'rec') return; $('#singClock').textContent = '錄音 ' + fmt(ctx.currentTime - st.run.t0); st.run.raf = requestAnimationFrame(tick); };
  tick();
}
async function start(withMic) {
  const R0 = st.ref; if (!R0) return;
  const ctx = await L.ac();
  if (withMic && !await L.openMic()) return;
  stopRun();
  const src = ctx.createBufferSource(); src.buffer = R0.buf;
  const g = ctx.createGain(); g.gain.value = (L.settings.singVol ?? 0.7) * R0.gain; src.connect(g); g.connect(L.AU.master);
  const t0 = ctx.currentTime + (withMic ? 1.2 : 0.2);
  src.start(t0);
  // 預備：三聲提示
  if (withMic) [0, 0.4, 0.8].forEach((d, i) => L.click(ctx, ctx.currentTime + d, i === 0, L.settings.clickVol));
  const me = [];
  const lat = L.latency();
  const listener = fr => { if (!st.run || st.run.kind !== 'sing') return; me.push({ t: fr.t - lat - t0, m: E.isVoiced(fr, L.settings.gate) && fr.c > 0.85 ? E.midiFloat(fr.f, L.settings.A) : null }); };
  if (withMic) L.AU.listeners.add(listener);
  st.run = { kind: withMic ? 'sing' : 'listen', src, t0, me, listener };
  $('#singStop').disabled = false; $('#singGo').disabled = true; $('#singListen').disabled = true;
  if (withMic) L.FUN.event('start');
  const tick = () => {
    const R = st.run; if (!R || (R.kind !== 'sing' && R.kind !== 'listen')) return;
    const now = ctx.currentTime - R.t0;
    draw(now, R.kind === 'sing' ? R.me : null);
    $('#singClock').textContent = fmt(Math.max(0, now)) + ' / ' + fmt(R0.dur);
    if (now > R0.dur + 0.4) { finish(); return; }
    R.raf = requestAnimationFrame(tick);
  };
  tick();
}
function stopRun() {
  const R = st.run; if (!R) return;
  cancelAnimationFrame(R.raf);
  if (R.kind === 'rec') {
    L.AU.rec = false; st.run = null;
    const n = L.AU.chunks.reduce((a, c) => a + c.length, 0);
    if (n < L.AU.ctx.sampleRate * 2) { S.render(); $('#singMsg').textContent = '錄音太短，沒有存起來。'; return; }
    const x = new Float32Array(n); let o = 0; L.AU.chunks.forEach(c => { x.set(c, o); o += c.length; });
    const d = new Date();
    S.render();
    saveRef(x, L.AU.ctx.sampleRate, `我的清唱 ${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, { kind: 'pcm' });
    return;
  }
  try { R.src.stop(); } catch (e) {}
  if (R.listener) L.AU.listeners.delete(R.listener);
  if (R.kind === 'sing') { finish(true); return; }
  st.run = null; const b = $('#singStop'); if (b) b.disabled = true; const g = $('#singGo'); if (g) g.disabled = false; const l = $('#singListen'); if (l) l.disabled = false;
}

/* 畫面：標準是灰色粗線，自己是彩色點 */
function draw(now, me) {
  const c = $('#singCanvas'); if (!c) return;
  const ctx = c.getContext('2d'), dpr = devicePixelRatio || 1, W = c.width / dpr, H = c.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const cs = getComputedStyle(document.documentElement);
  const col = n => cs.getPropertyValue(n).trim() || '#888';
  ctx.fillStyle = col('--paper'); ctx.fillRect(0, 0, W, H);
  const R0 = st.ref;
  if (!R0) { ctx.fillStyle = '#8a938e'; ctx.font = '14px sans-serif'; ctx.fillText('選一段標準錄音後，這裡會顯示旋律線', 16, H / 2); return; }
  const span = 8, x0 = now - span * 0.35;
  const X = t => (t - x0) / span * W;
  const Y = m => H - 14 - (m - R0.lo) / (R0.hi - R0.lo) * (H - 28);
  // 半音格線、八度標名
  ctx.lineWidth = 1;
  for (let m = Math.ceil(R0.lo); m <= R0.hi; m++) {
    ctx.strokeStyle = m % 12 === 0 ? 'rgba(45,90,76,.25)' : 'rgba(0,0,0,.05)';
    ctx.beginPath(); ctx.moveTo(0, Y(m)); ctx.lineTo(W, Y(m)); ctx.stroke();
    if (m % 12 === 0) { ctx.fillStyle = '#8a938e'; ctx.font = '11px sans-serif'; ctx.fillText(E.midiName(m), 4, Y(m) - 3); }
  }
  // 標準
  ctx.strokeStyle = 'rgba(28,33,31,.28)'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); let pen = false;
  R0.pts.forEach(p => { if (p.t < x0 - 0.1 || p.t > x0 + span + 0.1) { pen = false; return; } if (p.m == null) { pen = false; return; } if (!pen) { ctx.moveTo(X(p.t), Y(p.m)); pen = true; } else ctx.lineTo(X(p.t), Y(p.m)); });
  ctx.stroke();
  // 現在位置
  ctx.strokeStyle = 'rgba(168,116,44,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(now), 0); ctx.lineTo(X(now), H); ctx.stroke();
  // 自己
  if (me) {
    const oct = L.settings.singOct !== false;
    me.forEach(p => {
      if (p.m == null || p.t < x0 || p.t > now) return;
      const r = refAt(p.t);
      let m = p.m, d = null;
      if (r != null) { d = m - r; if (oct) { const k = Math.round(d / 12); d -= 12 * k; m -= 12 * k; } }
      ctx.fillStyle = d == null ? '#9aa39e' : Math.abs(d) <= 0.25 ? col('--ok') : Math.abs(d) <= 0.5 ? col('--warn') : col('--bad');
      ctx.beginPath(); ctx.arc(X(p.t), Y(Math.max(R0.lo, Math.min(R0.hi, m))), 2.6, 0, Math.PI * 2); ctx.fill();
    });
  }
}
function refAt(t) {
  const P = st.ref.pts; let lo = 0, hi = P.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (P[m].t < t) lo = m + 1; else hi = m; }
  const p = P[lo]; return p && Math.abs(p.t - t) < 0.03 ? p.m : null;
}

/* 評分 */
function finish(stopped) {
  const R = st.run; st.run = null;
  if (R.listener) L.AU.listeners.delete(R.listener);
  try { R.src.stop(); } catch (e) {}
  const me = R.me, R0 = st.ref, oct = L.settings.singOct !== false;
  // 找整體延遲：在 ±0.4 秒內找最對得上的位移
  const mm = new Map(); me.forEach(p => { if (p.m != null) mm.set(Math.round(p.t * 100), p.m); });
  const meAt = t => { for (const d of [0, 1, -1]) { const v = mm.get(Math.round(t * 100) + d); if (v != null) return v; } return null; };
  const score = lag => {
    let hit = 0, n = 0;
    R0.pts.forEach(p => { if (p.m == null || p.t > (stopped ? me[me.length - 1]?.t || 0 : 1e9)) return; const u = meAt(p.t + lag); if (u == null) return; n++; let d = u - p.m; if (oct) d -= 12 * Math.round(d / 12); if (Math.abs(d) <= 0.5) hit++; });
    return n ? hit / n : 0;
  };
  let bestLag = 0, best = -1;
  for (let lag = -0.4; lag <= 0.41; lag += 0.02) { const s = score(lag); if (s > best) { best = s; bestLag = lag; } }
  const endT = stopped ? (me.length ? me[me.length - 1].t : 0) : R0.dur;
  const ph = R0.phrases.filter(p => p.t0 < endT).map((p, i) => {
    let n = 0, sung = 0, hits = 0; const ds = [];
    R0.pts.forEach(q => {
      if (q.m == null || q.t < p.t0 || q.t > p.t1) return; n++;
      const u = meAt(q.t + bestLag); if (u == null) return; sung++;
      let d = (u - q.m) * 100; if (oct) d -= 1200 * Math.round(d / 1200);
      ds.push(d); if (Math.abs(d) <= 50) hits++;
    });
    const near = ds.filter(d => Math.abs(d) <= 100);
    const bias = near.length ? E.median(near) : null;
    return { i: i + 1, t0: p.t0, t1: p.t1, cover: n ? sung / n : 0, acc: sung ? hits / sung : 0, bias, spread: near.length > 3 ? E.std(near) : 0 };
  });
  const tot = ph.reduce((a, p) => a + (p.t1 - p.t0), 0) || 1;
  const w = p => (p.t1 - p.t0) / tot;
  const cover = ph.reduce((a, p) => a + p.cover * w(p), 0), acc = ph.reduce((a, p) => a + p.acc * w(p), 0);
  const scoreV = Math.round(100 * (0.75 * acc * Math.min(1, cover / 0.7) + 0.25 * Math.min(1, cover / 0.7)));
  const biases = ph.filter(p => p.bias != null);
  const drift = biases.length >= 4 ? Math.round((E.mean(biases.slice(-2).map(p => p.bias)) - E.mean(biases.slice(0, 2).map(p => p.bias)))) : null;
  const res = { score: scoreV, cover: Math.round(cover * 100), acc: Math.round(acc * 100), lag: Math.round(bestLag * 1000), phrases: ph, drift, bias: biases.length ? Math.round(E.mean(biases.map(p => p.bias))) : null, stopped };
  st.last = res;
  const list = getList(); const it = list.find(x => x.id === R0.id);
  if (it && !stopped) { it.best = Math.max(it.best || 0, scoreV); it.last = scoreV; L.store.set(listKey, list); }
  S.render();
  if (!stopped) L.FUN.event('finish', { sum: { score: scoreV, counts: { g: scoreV >= 90 ? 1 : 0, y: scoreV < 90 ? 1 : 0, r: 0 } }, improved: 0 });
}
function report(r) {
  const tips = [];
  if (r.cover < 50) tips.push('有不少句子沒有唱到或聲音太小，靠近麥克風、唱大聲一點。');
  if (r.bias != null && r.bias < -15) tips.push(`整體偏低約 ${-r.bias} cents：吸飽氣、想著「往上」唱，嘴巴打開一點。`);
  if (r.bias != null && r.bias > 15) tips.push(`整體偏高約 ${r.bias} cents：肩膀和喉嚨放鬆，不要擠。`);
  if (r.drift != null && r.drift < -20) tips.push(`越唱越低（後面比前面低了約 ${-r.drift} cents），長句子要留氣、句尾撐住。`);
  if (r.lag > 150) tips.push(`你平均比錄音慢 ${(r.lag / 1000).toFixed(2)} 秒，先多聽幾次，記住旋律再跟。`);
  if (r.lag < -150) tips.push(`你平均比錄音快 ${(-r.lag / 1000).toFixed(2)} 秒，不要急，跟著錄音的拍子。`);
  if (!tips.length) tips.push('唱得很穩！可以試試不開錄音聲音（音量拉到 0）自己唱一次。');
  const rows = r.phrases.map(p => {
    const lv = p.cover < 0.5 ? 'r' : p.acc >= 0.8 ? 'g' : p.acc >= 0.55 ? 'y' : 'r';
    const msg = p.cover < 0.5 ? '這一句沒唱到或太小聲' : p.bias != null && Math.abs(p.bias) > 15 ? `整句偏${p.bias > 0 ? '高' : '低'} ${Math.round(Math.abs(p.bias))} cents` : p.spread > 40 ? '音高搖晃，練習用氣息穩住' : '很準';
    return `<li><span class="dot" style="background:var(--${lv === 'g' ? 'ok' : lv === 'y' ? 'warn' : 'bad'})"></span><div><div class="w">第 ${p.i} 句（${fmt(p.t0)}–${fmt(p.t1)}）</div><div class="t">${msg}　<span class="muted num">準確 ${Math.round(p.acc * 100)}%</span></div></div></li>`;
  }).join('');
  $('#singReport').innerHTML = `<div class="report"><div class="card"><div class="eyebrow">跟唱結果${r.stopped ? '・中途停止' : ''}</div>
    <div class="scorebig"><b class="num">${r.score}</b><span class="muted">分</span></div>
    <dl class="kv"><dt>唱到的比例</dt><dd class="num">${r.cover}%</dd><dt>唱到的音準確度</dt><dd class="num">${r.acc}%（±50 cents 內）</dd><dt>整體音高</dt><dd class="num">${r.bias == null ? '—' : (Math.abs(r.bias) < 10 ? '很準' : (r.bias > 0 ? '偏高 ' : '偏低 ') + Math.abs(r.bias) + ' cents')}</dd><dt>拍子</dt><dd class="num">${Math.abs(r.lag) < 100 ? '跟得很好' : r.lag > 0 ? '慢 ' + (r.lag / 1000).toFixed(2) + ' 秒' : '快 ' + (-r.lag / 1000).toFixed(2) + ' 秒'}</dd></dl>
    <div class="coach"><h3>小琴的練習小撇步</h3>${tips.map(esc).join('<br>')}<br><span class="muted">合唱的咬字、音色和表情，請照指揮老師的要求。</span></div></div>
    <div class="card"><h3>每一句</h3><ul class="issues">${rows || '<li>沒有資料</li>'}</ul></div></div>`;
}
S.init = function (api) { L = api; E = api.E; window.addEventListener('resize', () => { if (L.st.view === 'sing') { sizeCanvas(); draw(st.run ? L.AU.ctx.currentTime - st.run.t0 : 0, st.run && st.run.me); } }); };
S.stop = stopRun;
window.SING = S;
})();
