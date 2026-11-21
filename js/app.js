/* 練琴小幫手（© 悠樂媽媽 製作，僅供個人與教學非商業使用） — 畫面、聲音、練習流程、練習建議、紀錄 */
(function () {
'use strict';
const E = window.Engine;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('瀏覽器無法儲存資料'); return false; } }
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LV_COLOR = { g: 'var(--ok)', y: 'var(--warn)', r: 'var(--bad)' };
const PAPER = { ok: '#2f9e5b', sharp: '#e0782a', flat: '#2f6fbf', bad: '#cf4339', warn: '#c58c0c', ink: '#1c211f' };
const ACC = { 2: '##', 1: '#', 0: '', '-1': 'b', '-2': 'bb' };

/* ---------- 設定與狀態 ---------- */
const settings = Object.assign({ A: 440, gate: 0.01, latency: null, deviceId: '', demoVol: 0.7, clickVol: 0.55, tol: {}, theme: '', lastSong: 'demo-twinkle', mode: 'advanced',
  voice: true, mascot: true, stars: 0, dsTuning: 'just', accVol: 0.5, partSel: {}, yt: {}, demoSrc: 'synth', refPlay: true, refTiming: false, accOn: true },
  store.get('lr.settings', {}));
const saveSettings = () => store.set('lr.settings', settings);
const st = {
  userSongs: store.get('lr.songs', []), song: null, events: [], flat: [], results: [], mLevels: {},
  sel: null, extend: false, mode: settings.mode, speed: 100, run: null, coach: null, lastRec: null, lastSum: null, view: 'practice', boxes: []
};
const allSongs = () => window.BUILTIN_SONGS.map(s => Object.assign({ builtin: true }, s)).concat(st.userSongs).concat(st.tempSongs || []);
const tolFor = mode => {
  // 人聲有自然的滑音與抖音，預設容許度略寬；老師在設定改過的數字優先
  const vocal = st.song && E.INSTR[st.song.instrument] && E.INSTR[st.song.instrument].vocal;
  const d = Object.assign({}, E.MODES[mode], vocal ? E.VOICE_TOL[mode] : {}), t = (settings.tol || {})[(vocal ? 'v-' : '') + mode] || {};
  return { pg: t.pg ?? d.pg, py: t.py ?? d.py, rg: d.rg == null ? null : (t.rg ?? d.rg), ry: d.ry == null ? null : (t.ry ?? d.ry) };
};
const inst = () => E.INSTR[st.song.instrument];
const FUN = window.FUN || { event() {}, talk() {}, say() {}, init() {}, renderStars() {}, line: () => '', GUIDE: {} };
const trans = () => inst().transpose + (st.shift || 0);
/* 導音：主音下方半音（小調用和聲小音階的升七級） */
function isLeading(ev) {
  if (ev.midi == null) return false;
  const m = st.song.measures[ev.mi];
  const tonic = ((((m.fifths != null ? m.fifths : st.song.fifths) * 7) % 12 + 12) % 12 + ((m.minor != null ? m.minor : st.song.minor) ? 9 : 0)) % 12;
  return ((ev.midi + 1) % 12 + 12) % 12 === tonic;
}
const evMidis = e => [e.midi].concat((e.note.chord || []).map(c => c.midi));
const hasChord = () => st.song.measures.some(m => m.notes.some(n => n.chord && n.chord.length));

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function applyTheme() { if (settings.theme) document.documentElement.setAttribute('data-theme', settings.theme); else document.documentElement.removeAttribute('data-theme'); }

/* ================= 聲音 ================= */
const AU = { ctx: null, master: null, mic: null, det: null, buf: null, frames: [], rec: false, chunks: [], recT0: null, live: null, listeners: new Set() };
async function ac() {
  if (!AU.ctx) {
    AU.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    AU.master = AU.ctx.createGain(); AU.master.connect(AU.ctx.destination);
  }
  if (AU.ctx.state !== 'running') await AU.ctx.resume();
  return AU.ctx;
}
const latency = () => settings.latency != null ? settings.latency
  : ((AU.ctx && (AU.ctx.outputLatency || AU.ctx.baseLatency)) || 0.01) + 2 * E.HOP / (AU.ctx ? AU.ctx.sampleRate : 48000);

async function openMic() {
  if (AU.mic) return true;
  const ctx = await ac();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('這個瀏覽器不支援麥克風，請改用 Chrome 或 Edge'); return false; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: {
      deviceId: settings.deviceId ? { exact: settings.deviceId } : undefined,
      echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  } catch (e) {
    toast(e.name === 'NotAllowedError' ? '麥克風被拒絕了：請點網址列左側的圖示，允許使用麥克風' : '無法開啟麥克風：' + e.message, 5000);
    return false;
  }
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(E.HOP, 1, 1);
  const mute = ctx.createGain(); mute.gain.value = 0;
  src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
  AU.det = E.makeDetector(ctx.sampleRate, st.song && (inst().vocal || inst().low < 50) ? 70 : 150); AU.buf = new Float32Array(E.FRAME); AU.ring = new Float32Array(E.CHORD_WIN);
  proc.onaudioprocess = e => {
    const inp = e.inputBuffer.getChannelData(0), B = AU.buf;
    B.copyWithin(0, inp.length); B.set(inp, B.length - inp.length);
    AU.ring.copyWithin(0, inp.length); AU.ring.set(inp, AU.ring.length - inp.length);
    const fr = AU.det(B);
    fr.t = ctx.currentTime - (E.FRAME / 2) / ctx.sampleRate;
    if (AU.rec) {
      if (AU.recT0 == null) AU.recT0 = ctx.currentTime - inp.length / ctx.sampleRate;
      AU.frames.push(fr); AU.chunks.push(new Float32Array(inp));
    }
    AU.live = fr;
    AU.listeners.forEach(fn => fn(fr));
  };
  AU.mic = { stream, src, proc, mute };
  $('#micpill').classList.add('on'); $('#micBtn').textContent = '關閉'; $('#micText').textContent = '收音中';
  listDevices();
  return true;
}
function closeMic() {
  if (!AU.mic) return;
  AU.mic.stream.getTracks().forEach(t => t.stop());
  try { AU.mic.src.disconnect(); AU.mic.proc.disconnect(); } catch (e) {}
  AU.mic = null; AU.live = null;
  $('#micpill').classList.remove('on'); $('#micBtn').textContent = '開啟'; $('#micText').textContent = '麥克風未開啟';
}
async function listDevices() {
  try {
    const ds = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    const sel = $('#devSel');
    sel.innerHTML = '<option value="">系統預設</option>' + ds.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || '麥克風 ' + (i + 1))}</option>`).join('');
    sel.value = settings.deviceId || '';
  } catch (e) {}
}

/* 合成音色：示範旋律、節拍器、標準音 */
function tone(ctx, dest, midi, t, dur, kind, vol) {
  const f = E.freq(midi, settings.A), end = t + dur, nodes = [];
  const g = ctx.createGain(); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  if (kind === 'violin') {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(6000, f * 7); lp.Q.value = 0.7; lp.connect(g);
    const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 2800; body.gain.value = 3; body.Q.value = 1;
    body.connect(lp);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = o2.type = 'sawtooth'; o1.frequency.value = o2.frequency.value = f; o2.detune.value = 5;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.6;
    lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + Math.min(0.25, dur * 0.4)); lg.gain.linearRampToValueAtTime(dur > 0.5 ? 14 : 0, t + Math.min(0.6, dur * 0.8));
    lfo.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune);
    o1.connect(body); o2.connect(body);
    g.gain.exponentialRampToValueAtTime(vol * 0.5, t + 0.06);
    nodes.push(o1, o2, lfo);
  } else if (kind === 'recorder') {
    [[1, 1], [2, 0.12], [3, 0.05]].forEach(([h, a]) => {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * h; og.gain.value = a;
      o.connect(og); og.connect(g); nodes.push(o);
    });
    g.gain.exponentialRampToValueAtTime(vol * 0.7, t + 0.03);
  } else if (kind === 'voice') {
    // 人聲：鋸齒波通過「啊」母音的兩個共振峰，加上自然的抖音
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.3;
    lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + Math.min(0.3, dur * 0.4)); lg.gain.linearRampToValueAtTime(dur > 0.6 ? 18 : 0, t + Math.min(0.8, dur * 0.8));
    lfo.connect(lg); lg.connect(o.detune);
    [[800, 6, 1], [1200, 8, 0.55], [2600, 10, 0.18]].forEach(([fc, q, a]) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fc; bp.Q.value = q;
      const gg = ctx.createGain(); gg.gain.value = a * 3; o.connect(bp); bp.connect(gg); gg.connect(g);
    });
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f * 1.5; const gl = ctx.createGain(); gl.gain.value = 0.5; o.connect(lp); lp.connect(gl); gl.connect(g);
    g.gain.exponentialRampToValueAtTime(vol * 0.6, t + 0.08);
    nodes.push(o, lfo);
  } else if (kind === 'piano') {
    // 鋼琴：快速起音、慢慢衰減
    [[1, 1, 'triangle'], [2, 0.35, 'sine'], [3, 0.12, 'sine'], [4, 0.06, 'sine']].forEach(([h, a, ty]) => {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = ty; o.frequency.value = f * h; og.gain.value = a;
      o.connect(og); og.connect(g); nodes.push(o);
    });
    g.gain.exponentialRampToValueAtTime(vol * 0.55, t + 0.008);
    g.gain.exponentialRampToValueAtTime(vol * 0.18, t + Math.min(dur, 1.2));
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.15);
    nodes.forEach(o => { o.start(t); o.stop(end + 0.2); });
    return nodes;
  } else {
    [[1, 1], [2, 0.3], [3, 0.15]].forEach(([h, a]) => {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * h; og.gain.value = a;
      o.connect(og); og.connect(g); nodes.push(o);
    });
    g.gain.exponentialRampToValueAtTime(vol * 0.6, t + 0.05);
  }
  const rel = Math.min(0.06, dur * 0.25);
  g.gain.setValueAtTime(g.gain.value || vol * 0.5, Math.max(t + 0.06, end - rel));
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.02);
  nodes.forEach(o => { o.start(t); o.stop(end + 0.08); });
  return nodes;
}
function click(ctx, t, down, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'triangle'; o.frequency.value = down ? 1660 : 1180;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g); g.connect(AU.master); o.start(t); o.stop(t + 0.07);
  return o;
}

/* ================= 樂曲載入 ================= */
function loadSong(id) {
  const raw = allSongs().find(s => s.id === id) || allSongs()[0];
  try { st.song = E.normalizeSong(Object.assign({}, raw, { part: (settings.partSel || {})[raw.id] || 0 })); }
  catch (e) { toast('樂譜有問題：' + e.message, 5000); return; }
  st.song.id = raw.id; st.song.builtin = !!raw.builtin;
  st.events = E.buildEvents(st.song);
  st.shift = (settings.shiftBy || {})[raw.id] || 0;
  if ($('#shiftOut')) $('#shiftOut').textContent = (st.shift > 0 ? '+' : '') + st.shift;
  // 人聲要聽得到更低的音（男低音約 80 Hz）
  if (AU.ctx && AU.mic) AU.det = E.makeDetector(AU.ctx.sampleRate, inst().vocal || inst().low < 50 ? 70 : 150);
  st.ref = null; loadRef();
  st.results = []; st.sel = null; st.coach = null; st.lastRec = null; st.lastSum = null;
  st.mLevels = Object.assign({}, (store.get('lr.progress', {})[raw.id] || {}).levels || {});
  settings.lastSong = raw.id; saveSettings();
  renderSongHead(); renderScore(); renderRange(); renderReport();
}
function renderSongHead() {
  const s = st.song;
  $('#songTitle').textContent = s.title;
  const chips = [E.INSTR[s.instrument].name, E.keyLabel(s.fifths, s.minor), `${s.timeNum}/${s.timeDen} 拍`, `♩ = ${s.tempo}`, `${s.measures.length} 小節`];
  if (s.composer) chips.unshift(s.composer);
  $('#songMeta').innerHTML = chips.map(c => `<span class="chip">${esc(c)}</span>`).join('') +
    (s.notesText ? `<span class="chip" style="border-style:dashed">${esc(s.notesText)}</span>` : '') +
    (inst().note ? `<span class="chip" style="border-style:dashed">${esc(inst().note)}</span>` : '') +
    (hasChord() ? `<span class="chip" style="border-style:dashed">含雙音：判斷兩個音有沒有拉到，以及${settings.dsTuning === 'equal' ? '平均律' : '純律'}音程準不準</span>` : '');
  if (st.shift) $('#songMeta').innerHTML += `<span class="chip" style="border-style:dashed">移調 ${st.shift > 0 ? '+' : ''}${st.shift}：實際${inst().verb}${st.shift > 0 ? '高' : '低'} ${Math.abs(st.shift)} 個半音</span>`;
  if (st.returnTo && st.song.id !== st.returnTo) $('#songMeta').innerHTML += '<button class="btn sm" id="btnReturn">回原曲</button>';
  const br = $('#btnReturn'); if (br) br.onclick = () => { const id = st.returnTo; st.returnTo = null; loadSong(id); };
  renderEnsemble();
  $('#songSelect').innerHTML = allSongs().map(x => `<option value="${esc(x.id)}">${esc(x.title)}${x.builtin ? '（範例）' : x.temp ? '（練習用）' : ''}</option>`).join('');
  $('#songSelect').value = s.id;
  updateSpeedOut();
}

/* ================= 樂譜繪製 ================= */
function lastEventOf(n) {
  let best = null;
  st.events.forEach(e => { if (e.parts.includes(n) && st.results[e.idx]) best = e; });
  return best || st.events.find(e => e.parts.includes(n));
}
function noteColor(n) {
  const ev = lastEventOf(n);
  const r = ev && st.results[ev.idx];
  if (!r || !r.p) return null;
  const s = r.p.status;
  if (s === 'ok') return r.level === 'g' ? PAPER.ok : PAPER.ink;
  if (s === 'sharp') return PAPER.sharp;
  if (s === 'flat') return PAPER.flat;
  if (s === 'wrong' || s === 'missing' || s === 'chordmiss') return PAPER.bad;
  if (s === 'chord' && r.p.level) return { g: PAPER.ok, y: PAPER.warn, r: PAPER.bad }[r.p.level];
  return null;
}
/* 歌詞列：歌詞、首調唱名、固定唱名 */
function lyricMode() {
  const m = settings.lyricMode || 'auto';
  if (m !== 'auto') return m;
  const hasLy = st.song.measures.some(x => x.notes.some(n => n.lyric));
  if (hasLy) return 'lyric';
  return inst().vocal ? 'movable' : 'none';
}
function lyricText(n, m, mode) {
  if (n.rest || n.tieStop) return '';
  if (mode === 'lyric') return n.lyric || '';
  if (mode === 'movable') return E.solfege(n, { fifths: m.fifths, minor: m.minor }, true);
  if (mode === 'fixed') return E.solfege(n, st.song, false);
  return '';
}
const annots = () => (store.get('lr.annot', {})[st.song.id] || {});
function renderScore() {
  const host = $('#score'); host.innerHTML = '';
  const song = st.song; if (!song) return;
  if (!window.Vex || !window.Vex.Flow) { host.innerHTML = '<div class="score-empty">樂譜元件載入失敗。請確認電腦有連上網路，再重新整理頁面。</div>'; return; }
  const VF = Vex.Flow;
  const W = Math.max(300, host.clientWidth);
  const lmode = lyricMode();
  const hasDyn = song.measures.some(m => m.notes.some(n => n.dyn || n.wedge));
  const extra = (lmode !== 'none' ? 24 : 0) + (hasDyn ? 18 : 0);
  const AN = annots();
  const keyW = f => f ? 10 * Math.abs(f) + 10 : 0;
  const hdr = (i, first) => {
    const m = song.measures[i], prev = song.measures[i - 1];
    let w = 0;
    if (first) w += 40 + keyW(m.fifths);
    else if (prev && prev.fifths !== m.fifths) w += keyW(m.fifths) + keyW(prev.fifths) * 0.6;
    if (i === 0 || (m.attr && m.attr.time)) w += 30;
    if (m.attr && m.attr.repStart) w += 12;
    return w;
  };
  const lines = []; let cur = [], cw = 0;
  song.measures.forEach((m, i) => {
    const base = 40 + m.notes.reduce((a, n) => a + (n.dur >= 2 ? 34 : n.dur >= 1 ? 36 : 28) + (n.alter ? 10 : 0) + (n.dots ? 6 : 0) + (lmode !== 'none' && n.lyric && n.lyric.length > 1 ? 10 * (n.lyric.length - 1) : 0), 0);
    let need = base + hdr(i, !cur.length);
    if (cur.length && cw + need > W - 4) { lines.push(cur); cur = []; cw = 0; need = base + hdr(i, true); }
    cur.push({ i, need, first: !cur.length }); cw += need;
  });
  if (cur.length) lines.push(cur);
  const LH = 150 + extra, TOP = 40;
  const renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
  renderer.resize(W, lines.length * LH + 10);
  const ctx = renderer.getContext();
  st.boxes = []; st.headers = [];
  const ABOVE = VF.Modifier.Position.ABOVE, BELOW = VF.Modifier.Position.BELOW;
  const lastI = song.measures.length - 1;
  // 一房的連續範圍
  const voltaType = i => {
    const e = song.measures[i].attr && song.measures[i].attr.ending; if (!e) return null;
    const same = k => k >= 0 && k <= lastI && song.measures[k].attr && song.measures[k].attr.ending && song.measures[k].attr.ending.join() === e.join();
    const p = same(i - 1), nx = same(i + 1);
    return { label: e.join(',') + '.', type: !p && !nx ? VF.Volta.type.BEGIN_END : !p ? VF.Volta.type.BEGIN : !nx ? VF.Volta.type.END : VF.Volta.type.MID };
  };
  lines.forEach((ln, li) => {
    const tot = ln.reduce((a, x) => a + x.need, 0);
    let scale = (W - 4) / tot;
    if (li === lines.length - 1 && lines.length > 1 && scale > 1.3) scale = 1.3;
    if (lines.length === 1 && scale > 1.6) scale = 1.6;
    let x = 2; const y = li * LH + TOP;
    ln.forEach((it, j) => {
      const m = song.measures[it.i], a = m.attr || {}, prev = song.measures[it.i - 1], w = it.need * scale;
      const keyName = E.FIFTHS_KEY[m.fifths];
      const stave = new VF.Stave(x, y, w);
      const clef = song.clef === 'treble8vb' ? 'treble' : song.clef;
      if (j === 0) { if (inst().transpose === -12 && inst().vocal) stave.addClef('treble', 'default', '8vb'); else stave.addClef(clef); if (m.fifths) stave.addKeySignature(keyName); }
      else if (prev && prev.fifths !== m.fifths) stave.addKeySignature(keyName, E.FIFTHS_KEY[prev.fifths]);
      if (it.i === 0 || a.time) stave.addTimeSignature(m.ts[0] + '/' + m.ts[1]);
      if (a.repStart) stave.setBegBarType(VF.Barline.type.REPEAT_BEGIN);
      if (a.repEnd) stave.setEndBarType(VF.Barline.type.REPEAT_END);
      else if (it.i === lastI || a.fine) stave.setEndBarType(it.i === lastI ? VF.Barline.type.END : VF.Barline.type.DOUBLE);
      const vt = voltaType(it.i); if (vt) stave.setVoltaType(vt.type, vt.label, -8);
      try {
        if (a.segno) stave.setRepetitionTypeLeft(VF.Repetition.type.SEGNO_LEFT, -6);
        if (a.coda) stave.setRepetitionTypeLeft(VF.Repetition.type.CODA_LEFT, -6);
        if (a.jump || a.fine || a.toCoda) {
          const t = a.jump ? (a.jump === 'dc' ? 'D.C.' : 'D.S.') + (a.al === 'fine' ? ' al Fine' : a.al === 'coda' ? ' al Coda' : '') : a.fine ? 'Fine' : 'To Coda';
          stave.setText(t, ABOVE, { justification: VF.TextNote.Justification.RIGHT, shift_y: -2 });
        }
        const tt = [a.tempoText, a.tempo && !a.tempoText && it.i ? '♩=' + a.tempo : '', a.rit ? 'rit.' : '', a.accel ? 'accel.' : '', a.atempo ? 'a tempo' : '', a.text].filter(Boolean).join('  ');
        if (it.i === 0 && !a.tempoText) stave.setTempo({ duration: 'q', bpm: song.tempo }, -2);
        if (tt) stave.setText(tt, ABOVE, { justification: VF.TextNote.Justification.LEFT, shift_x: 6, shift_y: it.i === 0 ? -14 : -2 });
      } catch (e) {}
      stave.setContext(ctx).draw();
      const notes = m.notes.map(n => {
        const k1 = p => `${p.step.toLowerCase()}${ACC[p.alter]}/${p.octave}`;
        const REST = { treble: ['d/5', 'b/4'], alto: ['e/4', 'c/4'], tenor: ['c/4', 'a/3'], bass: ['f/3', 'd/3'] }[clef] || ['d/5', 'b/4'];
        const keys = n.rest ? [n.type === 'w' ? REST[0] : REST[1]] : [n].concat(n.chord || []).sort((p, q) => p.midi - q.midi).map(k1);
        const sn = new VF.StaveNote({ keys, clef, duration: n.type + 'd'.repeat(n.dots) + (n.rest ? 'r' : ''), auto_stem: true });
        if (n.dots) VF.Dot.buildAndAttach([sn], { all: true });
        const add = (mod) => { try { sn.addModifier(mod, 0); } catch (e) {} };
        (n.art || []).forEach(t => {
          const code = { st: 'a.', ten: 'a-', acc: 'a>', marc: 'a^', fer: 'a@a' }[t];
          if (code) add(new VF.Articulation(code).setPosition(t === 'fer' ? ABOVE : (n.midi >= 71 ? ABOVE : BELOW)));
          if (t === 'tr') add(new VF.Ornament('tr'));
        });
        if (n.bow) add(new VF.Articulation(n.bow === 'down' ? 'am' : 'a|').setPosition(ABOVE));
        const an = AN[it.i + ':' + n.ni];
        const fing = an && an.fing != null ? an.fing : n.fing;
        if (fing != null) add(new VF.Annotation(String(fing)).setFont('Arial', 10, 'bold').setVerticalJustification(VF.Annotation.VerticalJustify.TOP));
        if (n.dyn) add(new VF.Annotation(n.dyn).setFont('Times New Roman', 13, 'bold', 'italic').setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM));
        if (n.breath) add(new VF.Annotation(',').setFont('Times New Roman', 18, 'bold').setVerticalJustification(VF.Annotation.VerticalJustify.TOP));
        const c = noteColor(n); if (c) sn.setStyle({ fillStyle: c, strokeStyle: c });
        n._sn = sn; return sn;
      });
      const tuplets = []; let grp = [];
      m.notes.forEach((n, k) => { if (n.triplet) { grp.push(notes[k]); if (grp.length === 3) { tuplets.push(new VF.Tuplet(grp)); grp = []; } } else grp = []; });
      const voice = new VF.Voice({ num_beats: m.ts[0], beat_value: m.ts[1] }).setMode(VF.Voice.Mode.SOFT);
      voice.addTickables(notes);
      try { VF.Accidental.applyAccidentals([voice], keyName); } catch (e) {}
      let beams = [];
      try { beams = VF.Beam.generateBeams(notes, { groups: VF.Beam.getDefaultBeamGroups(m.ts[0] + '/' + m.ts[1]) }); } catch (e) {}
      new VF.Formatter().joinVoices([voice]).format([voice], Math.max(20, stave.getNoteEndX() - stave.getNoteStartX() - 10));
      voice.draw(ctx, stave);
      beams.forEach(b => b.setContext(ctx).draw());
      tuplets.forEach(t => t.setContext(ctx).draw());
      m.notes.forEach(n => {
        n._x = n._sn.getAbsoluteX() + 6; n._line = li;
        // 這個音有沒有印出臨時記號
        n._accShown = null;
        try { const mods = n._sn.getModifiersByType ? n._sn.getModifiersByType('Accidental') : []; if (mods && mods.length) n._accShown = n.alter; } catch (e) {}
        try { const bb = n._sn.getBoundingBox(); n._bb = { x: bb.getX(), y: bb.getY(), w: bb.getW(), h: bb.getH() }; } catch (e) { n._bb = null; }
      });
      const top = stave.getYForLine(0), bot = stave.getYForLine(4);
      st.boxes[it.i] = { x, y: top - 40, w, h: bot - top + 40 + 46 + extra, top, bot, start: stave.getNoteStartX(), line: li };
      if (j === 0 || (prev && prev.fifths !== m.fifths) || a.time) {
        const clefEnd = j === 0 ? x + 36 : x;
        const tsW = (it.i === 0 || a.time) ? 26 : 0;
        st.headers.push({ m: it.i, x, clefEnd, keyEnd: stave.getNoteStartX() - tsW - 4, timeEnd: stave.getNoteStartX() - 2, top, bot, hasClef: j === 0, hasKey: !!m.fifths && (j === 0 || (prev && prev.fifths !== m.fifths)), hasTime: !!tsW });
      }
      x += w;
    });
  });
  // 連結線、圓滑線、漸強漸弱
  const flat = []; song.measures.forEach(m => m.notes.forEach(n => flat.push(n)));
  st.flat = flat;
  flat.forEach((n, i) => {
    if (!n.tieStart) return;
    const nx = flat[i + 1]; if (!nx || nx.rest || nx.midi !== n.midi) return;
    try {
      const T = (a, b) => new VF.StaveTie({ first_note: a, last_note: b, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
      if (n._line === nx._line) T(n._sn, nx._sn); else { T(n._sn, null); T(null, nx._sn); }
    } catch (e) {}
  });
  let slurFrom = null, wedgeFrom = null;
  flat.forEach(n => {
    if (n.slur === 'start') slurFrom = n;
    if (n.slur === 'stop' && slurFrom) {
      if (slurFrom._line === n._line && slurFrom !== n) try { new VF.Curve(slurFrom._sn, n._sn, { cps: [{ x: 0, y: 12 }, { x: 0, y: 12 }] }).setContext(ctx).draw(); } catch (e) {}
      slurFrom = null;
    }
    if (n.wedge) wedgeFrom = n;
    if ((n.wedgeEnd || n.dyn) && wedgeFrom && wedgeFrom !== n) {
      if (wedgeFrom._line === n._line) try {
        const hp = new VF.StaveHairpin({ first_note: wedgeFrom._sn, last_note: n._sn }, wedgeFrom.wedge === 'cresc' ? VF.StaveHairpin.type.CRESC : VF.StaveHairpin.type.DECRESC);
        hp.setContext(ctx).setPosition(BELOW).setRenderOptions({ height: 8, y_shift: 6 + (lmode !== 'none' ? 20 : 0), left_shift_px: 0, right_shift_px: 0 }).draw();
      } catch (e) {}
      wedgeFrom = null;
    }
  });
  drawOverlay();
}

function drawOverlay() {
  const ov = $('#overlay'); ov.innerHTML = '';
  const song = st.song; if (!song) return;
  const [a, b] = st.sel || [-1, -1];
  const memo = settings.memo || 0;
  st.boxes.forEach((bx, i) => {
    if (!bx) return;
    const d = document.createElement('div');
    d.className = 'mbox' + (st.mLevels[i] ? ' lv-' + st.mLevels[i] : '') + (i >= a && i <= b ? ' sel' : '');
    Object.assign(d.style, { left: bx.x + 'px', top: bx.y + 'px', width: bx.w + 'px', height: bx.h + 'px' });
    d.innerHTML = `<span class="no">${i + 1}</span><span class="lamp" title="${({ g: '綠燈：完全正確', y: '黃燈：稍微不準', r: '紅燈：需要重拉' })[st.mLevels[i]] || '還沒練'}"></span>`;
    d.dataset.m = i;
    d.addEventListener('click', ev => { if (st.explain) return; onMeasureClick(i, ev.shiftKey); });
    // 背譜：把音符遮起來，只留燈號
    const hide = memo >= 3 || (memo === 2 && !(bx.x < 10 || (st.boxes[i - 1] && st.boxes[i - 1].line !== bx.line))) || (memo === 1 && i % 2 === 1);
    if (hide) { const mk = document.createElement('div'); mk.className = 'memo-mask'; mk.style.top = '30px'; mk.style.height = (bx.bot - bx.top + 36) + 'px'; d.appendChild(mk); }
    ov.appendChild(d);
  });
  // 歌詞、唱名：對齊在同一條基準線
  const lmode = lyricMode();
  if (lmode !== 'none') song.measures.forEach((m, mi) => m.notes.forEach(n => {
    const bx = st.boxes[mi], t = lyricText(n, m, lmode); if (!bx || !t || n._x == null) return;
    const sp = document.createElement('span'); sp.className = 'lyr'; sp.textContent = t;
    sp.style.left = n._x + 'px'; sp.style.top = (bx.bot + (song.measures.some(x => x.notes.some(y => y.dyn || y.wedge)) ? 40 : 26)) + 'px'; ov.appendChild(sp);
  }));
  const AN = annots();
  // 老師批註
  song.measures.forEach((m, mi) => m.notes.forEach(n => {
    const an = AN[mi + ':' + n.ni]; const bx = st.boxes[mi];
    if (!an || !an.text || !bx || n._x == null) return;
    const t = document.createElement('span'); t.className = 'annot'; t.textContent = an.text;
    t.style.left = n._x + 'px'; t.style.top = (bx.top - 46) + 'px'; ov.appendChild(t);
  }));
  st.events.forEach(ev => {
    const r = st.results[ev.idx]; if (!r) return;
    if (lastEventOf(ev.note) !== ev) return;
    const n = ev.note, bx = st.boxes[ev.mi]; if (!bx || n._x == null) return;
    const showC = r.p && r.p.cents != null && (r.p.status === 'sharp' || r.p.status === 'flat' || (r.p.status === 'chord' && r.p.level && r.p.level !== 'g'));
    if (showC) {
      const mk = document.createElement('span'); mk.className = 'mark';
      mk.style.left = n._x + 'px'; mk.style.top = (bx.top - 30) + 'px';
      mk.style.color = r.p.cents > 0 ? PAPER.sharp : PAPER.flat;
      if (r.p.status === 'chord') mk.title = '雙音音程偏寬（+）或偏窄（−）的音分數';
      mk.textContent = (r.p.cents > 0 ? '+' : '') + Math.round(r.p.cents);
      ov.appendChild(mk);
    }
    if (r.r && !r.r.skipped) {
      let sym = '', lv = null;
      if (r.r.onsetLevel && r.r.onsetLevel !== 'g' && r.r.dt != null) { sym += r.r.dt < 0 ? '←' : '→'; lv = r.r.onsetLevel; }
      if (r.r.lengthLevel && r.r.lengthLevel !== 'g') { sym += '⌐'; lv = E.worst(lv, r.r.lengthLevel); }
      if (r.r.restIssue) { sym += '♪'; lv = 'y'; }
      if (sym) {
        const mk = document.createElement('span'); mk.className = 'mark';
        mk.style.left = n._x + 'px'; mk.style.top = (bx.bot + 26) + 'px';
        mk.style.color = lv === 'r' ? PAPER.bad : PAPER.warn; mk.textContent = sym;
        ov.appendChild(mk);
      }
    }
  });
  if (st.explain) drawHotspots(ov);
  const c = document.createElement('div'); c.className = 'cursor'; c.id = 'cursor'; c.hidden = true; ov.appendChild(c);
}

/* ================= 點記號看說明 ================= */
function drawHotspots(ov) {
  const song = st.song, X = window.EXPLAIN; if (!X) return;
  const spot = (x, y, w, h, fn, label) => {
    const d = document.createElement('button'); d.className = 'hot'; d.type = 'button'; d.title = label;
    Object.assign(d.style, { left: x + 'px', top: y + 'px', width: Math.max(14, w) + 'px', height: Math.max(14, h) + 'px' });
    d.addEventListener('click', e => { e.stopPropagation(); fn(e); });
    ov.appendChild(d);
  };
  st.headers.forEach(h => {
    const m = song.measures[h.m];
    if (h.hasClef) spot(h.x + 2, h.top - 14, h.clefEnd - h.x - 2, h.bot - h.top + 30, e => showExplain(e, ...X.clef(song.clef === 'treble8vb' ? 'treble' : song.clef)), '譜號');
    if (h.hasKey) spot(h.clefEnd, h.top - 6, Math.max(14, h.keyEnd - h.clefEnd), h.bot - h.top + 12, e => showExplain(e, ...X.key(m.fifths, m.minor, E.keyLabel(m.fifths, m.minor), song.instrument === 'violin')), '調號');
    if (h.hasTime) spot(h.keyEnd, h.top - 2, h.timeEnd - h.keyEnd, h.bot - h.top + 4, e => showExplain(e, ...X.time(m.ts[0], m.ts[1])), '拍號');
  });
  song.measures.forEach((m, mi) => {
    const bx = st.boxes[mi]; if (!bx) return;
    const items = X.measure(m.attr);
    if (items.length) spot(bx.x + 2, bx.y, bx.w - 4, 26, e => showExplain(e, items.map(i => i[0]).join('・'), items.map(i => `<b>${i[0]}</b>：${i[1]}`).join('<br>')), '小節記號');
    m.notes.forEach(n => {
      if (n._x == null) return;
      const bb = n._bb;
      const x = bb ? bb.x - 4 : n._x - 10, y = bb ? Math.min(bb.y - 6, bx.top - 10) : bx.top - 10;
      const w = bb ? bb.w + 8 : 22, h = bb ? Math.max(bb.h + 12, bx.bot - bx.top + 20) : bx.bot - bx.top + 20;
      spot(x, y, w, h + (lyricMode() !== 'none' || n.dyn ? 26 : 0), e => {
        const mv = lyricMode() === 'movable' || inst().vocal ? E.solfege(n, { fifths: m.fifths, minor: m.minor }, true) : null;
        const an = annots()[mi + ':' + n.ni];
        const ctx = { movable: mv && mv !== E.SOLF[n.step] ? mv : null, accShown: n._accShown, finger: n.rest ? null : st.song.instrument === 'violin' && n.fing == null && !(an && an.fing != null) ? E.violinFinger(n.midi) + (n.midi > 83 ? '（需要換把位，請照老師指法）' : '') : /recorder-(s|t)/.test(st.song.instrument) ? E.recorderFinger(n.midi, settings.recSys) + '（拇指｜左手｜右手）' : null, annot: an && an.text };
        const ex = X.note(n, ctx);
        showExplain(e, ex.title, ex.body, ex.play ? n : null, { mi, ni: n.ni });
      }, n.rest ? '休止符' : '音符');
    });
  });
}
function showExplain(e, title, body, note, where) {
  const box = $('#explainBox');
  box.querySelector('h4').textContent = title;
  box.querySelector('.ex-body').innerHTML = body;
  const playBtn = box.querySelector('.ex-play'), annBtn = box.querySelector('.ex-annot');
  playBtn.hidden = !note; annBtn.hidden = !where;
  playBtn.onclick = async () => {
    const ctx = await ac(); const out = ctx.createGain(); out.gain.value = settings.demoVol; out.connect(AU.master);
    const spb = 60 / st.song.tempo; const d = Math.max(0.3, note.dur * spb);
    [note.midi].concat((note.chord || []).map(c => c.midi)).forEach(m => tone(ctx, out, m + trans(), ctx.currentTime + 0.05, d, inst().synth, 0.45));
  };
  annBtn.onclick = () => editAnnot(where);
  box.hidden = false;
  const r = $('.score-wrap').getBoundingClientRect();
  const bw = Math.min(340, r.width - 20);
  box.style.width = bw + 'px';
  let left = e.clientX - r.left + 12; if (left + bw > r.width - 6) left = Math.max(6, e.clientX - r.left - bw - 12);
  box.style.left = left + 'px'; box.style.top = (e.clientY - r.top + 12) + 'px';
  FUN.say((title + '。' + body.replace(/<[^>]+>/g, '')).slice(0, 300));
}
function editAnnot(where) {
  const all = store.get('lr.annot', {}); const A = all[st.song.id] = all[st.song.id] || {};
  const key = where.mi + ':' + where.ni, cur = A[key] || {};
  const box = $('#explainBox');
  box.querySelector('.ex-body').innerHTML = `<label class="muted" for="anText">老師批註（會顯示在音符上方）</label><input id="anText" class="ex-in" value="${esc(cur.text || '')}" maxlength="40" placeholder="例如：手腕放鬆、這裡換把位">
    <label class="muted" for="anFing">指法數字（0–4，留空表示不改）</label><input id="anFing" class="ex-in" value="${esc(cur.fing != null ? cur.fing : '')}" maxlength="1" inputmode="numeric">
    <div class="field"><button class="btn primary" id="anSave">儲存</button><button class="btn" id="anDel">刪除批註</button></div>`;
  $('#anSave').onclick = () => {
    const t = $('#anText').value.trim(), f = $('#anFing').value.trim();
    if (!t && !/^[0-4]$/.test(f)) delete A[key]; else A[key] = { text: t || undefined, fing: /^[0-4]$/.test(f) ? f : undefined };
    store.set('lr.annot', all); box.hidden = true; renderScore(); toast('已儲存批註');
  };
  $('#anDel').onclick = () => { delete A[key]; store.set('lr.annot', all); box.hidden = true; renderScore(); toast('已刪除批註'); };
}
function setLamp(i) {
  const d = $(`.mbox[data-m="${i}"]`); if (!d) return;
  d.classList.remove('lv-g', 'lv-y', 'lv-r'); if (st.mLevels[i]) d.classList.add('lv-' + st.mLevels[i]);
}
function noteAtBeat(beat) {
  let lo = 0, hi = st.events.length - 1;
  if (hi < 0) return null;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (st.events[m].start <= beat + 1e-6) lo = m; else hi = m - 1; }
  const ev = st.events[lo];
  let k = 0; while (k + 1 < ev.parts.length && ev.partStarts[k + 1] <= beat + 1e-6) k++;
  return ev.parts[k];
}
function showCursor(n) {
  const c = $('#cursor'); if (!c) return;
  if (!n) { c.hidden = true; $$('.mbox.playing').forEach(x => x.classList.remove('playing')); return; }
  const bx = st.boxes[n.mi]; if (!bx) return;
  c.hidden = false;
  c.style.left = (n._x - 1) + 'px'; c.style.top = (bx.top - 18) + 'px'; c.style.height = (bx.bot - bx.top + 36) + 'px';
  $$('.mbox.playing').forEach(x => { if (+x.dataset.m !== n.mi) x.classList.remove('playing'); });
  const d = $(`.mbox[data-m="${n.mi}"]`); if (d) d.classList.add('playing');
  if (st.run && !st._scrollLock) {
    const r = c.getBoundingClientRect();
    if (r.top < 90 || r.bottom > innerHeight - 40) { st._scrollLock = true; window.scrollBy({ top: r.top - innerHeight * 0.35, behavior: 'smooth' }); setTimeout(() => st._scrollLock = false, 600); }
  }
}

/* ================= 範圍選取 ================= */
function onMeasureClick(i, shift) {
  if (st.run) return;
  if (st.review) { reviewMeasure(i); return; }
  if ((shift || st.extend) && st.sel) st.sel = [Math.min(st.sel[0], i), Math.max(st.sel[1], i)];
  else if (st.sel && st.sel[0] === i && st.sel[1] === i) st.sel = null;
  else st.sel = [i, i];
  st.extend = false;
  if (st.mode === 'contest' && st.sel) toast('比賽模式固定拉全曲；選取的範圍會用在「聆聽示範」與進階模式');
  renderRange(); drawOverlay(); renderReport();
}
function renderRange() {
  const s = st.sel;
  $('#rangeLabel').textContent = !s ? '全曲' : s[0] === s[1] ? `第 ${s[0] + 1} 小節` : `第 ${s[0] + 1}–${s[1] + 1} 小節`;
  $('#btnExtend').setAttribute('aria-pressed', st.extend);
  $('#btnAll').hidden = !s;
}
const rangeFor = kind => {
  const last = st.song.measures.length - 1;
  if (kind === 'contest' || !st.sel) return [0, last];
  return st.sel;
};
/* 紙面第 a–b 小節，在演奏順序（含反覆）裡是第幾段 */
function perfRange(a, b) {
  const pm = st.song.pm, last = st.song.measures.length - 1;
  if (a === 0 && b === last) return [0, pm.length - 1];
  const pa = pm.findIndex(p => p.mi === a);
  let pb = pm.findIndex((p, k) => k >= pa && p.mi === b);
  if (pb < 0) pb = pm.length - 1;
  return [Math.max(0, pa), pb];
}
const evsIn = (pa, pb) => st.events.filter(e => e.pk >= pa && e.pk <= pb);

/* ================= 播放示範 ================= */
function stopAll(user) {
  const R = st.run; if (!R) return;
  (R.nodes || []).forEach(n => { try { n.stop(); } catch (e) {} });
  cancelAnimationFrame(R.raf); clearTimeout(R.loopT); clearInterval(R.countT);
  if (R.listener) AU.listeners.delete(R.listener);
  $('#count').classList.remove('show');
  if (R.kind === 'timed' && !R.done) finishTimed(true);
  else if (R.kind === 'wait' && !R.done) finishWait(true);
  else if (R.kind === 'teacherRec' && !R.done) { finishTeacherRec(); return; }
  AU.rec = false;
  st.run = null;
  if (user && st.coach) { st.coach.paused = true; }
  showCursor(null); setRunning(false);
}
function setRunning(on) {
  $('#btnStop').disabled = !on;
  $('#btnStart').disabled = on; $('#btnDemo').disabled = on;
  $$('#modes button').forEach(b => b.disabled = on);
  $('#songSelect').disabled = on;
  $$('#ens button, #ens select, #ens input').forEach(b => { if (b.id !== 'btnTeacherRec') b.disabled = on; });
}

/* 拍點 → 時間：固定速度，或照老師錄音的速度與彈性 */
const gridMap = (t0, base, spb) => E.makeTimeMap([{ beat: base, t: t0 }, { beat: base + 1, t: t0 + spb }]);
const refUsable = () => !!(st.ref && st.ref.align && st.ref.align.confidence >= 0.5);
function refMap(pa, pb, t0, rate) {
  const A = st.ref.align, last = st.song.pm.length - 1;
  const first = st.events.find(e => e.pk >= pa && A.onsets[e.idx] != null);
  const r0 = A.onsets[first.idx];
  const anchors = st.events.filter(e => e.pk >= Math.max(0, pa - 1) && e.pk <= Math.min(last, pb + 1) && A.onsets[e.idx] != null)
    .map(e => ({ beat: e.start, t: t0 + (A.onsets[e.idx] - r0) / rate }));
  if (pb >= last - 1 && A.endT) anchors.push({ beat: st.song.totalBeats, t: t0 + (A.endT - r0) / rate });
  return { tm: E.makeTimeMap(anchors), r0, firstBeat: first.start };
}
function scheduleClicks(ctx, nodes, tm, pa, pb, withCount, pass = 0) {
  const song = st.song, pm = song.pm;
  const metro = metroMode(pass);
  const first = song.measures[pm[pa].mi];
  const ts0 = first.ts || [song.timeNum, song.timeDen];
  const unit0 = 4 / ts0[1], full0 = first.full || song.fullBeats;
  const pick = pa === 0 ? song.pickup : 0;
  const base = pm[pa].start;
  if (withCount) {
    // 預備拍：一整小節，弱起時對齊到小節線
    for (let bt = base - pick - full0, k = 0; bt < base - 1e-6; bt += unit0, k++)
      nodes.push(click(ctx, tm.t(bt), k === 0, settings.clickVol));
  }
  if (metro === 'off' || pb < pa) return;
  for (let k = pa; k <= pb; k++) {
    const P = pm[k], m = song.measures[P.mi], ts = m.ts || [song.timeNum, song.timeDen], unit = 4 / ts[1];
    const off = k === 0 ? song.pickup : 0;
    for (let i = 0; i < ts[0]; i++) {
      const bt = P.start - off + i * unit;
      if (bt < P.start - 1e-6 || bt >= P.start + P.dur - 1e-6) continue;
      const down = i === 0;
      if (metro === 'down' && !down) continue;
      nodes.push(click(ctx, tm.t(bt), down, settings.clickVol * 0.7));
    }
  }
}
/* 持續主音：一直響著主音和五度，用耳朵比對音準 */
function droneNotes() {
  const song = st.song;
  const tonic = ((song.fifths * 7) % 12 + 12) % 12 + (song.minor ? 9 : 0);
  const low = inst().low || 55;
  let m = 36 + (tonic % 12); while (m < low - 12) m += 12; while (m >= low) m -= 12;
  return [m, m + 7];
}
function scheduleDrone(ctx, nodes, t0, t1) {
  if (!$('#optDrone') || !$('#optDrone').checked) return;
  const out = ctx.createGain(); out.gain.value = 0.0001; out.connect(AU.master);
  const s0 = Math.max(ctx.currentTime + 0.02, t0);
  out.gain.setValueAtTime(0.0001, s0); out.gain.exponentialRampToValueAtTime(settings.droneVol || 0.22, s0 + 0.6);
  out.gain.setValueAtTime(settings.droneVol || 0.22, Math.max(s0 + 0.6, t1 - 0.5)); out.gain.exponentialRampToValueAtTime(0.0001, t1);
  droneNotes().forEach((m, i) => {
    const f = E.freq(m + (inst().transpose < 0 ? 0 : 0), settings.A);
    [[1, 0.6, 'sine'], [2, 0.25, 'sine'], [3, 0.1, 'triangle']].forEach(([h, a, ty]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = ty; o.frequency.value = f * h; g.gain.value = a * (i ? 0.6 : 1);
      o.connect(g); g.connect(out); o.start(s0); o.stop(t1 + 0.05); nodes.push(o);
    });
  });
}
/* 節拍器模式：每拍／只有第一拍／漸隱（循環時越來越少）／關 */
function metroMode(pass) {
  if (!$('#optMetro').checked) return 'off';
  const m = settings.metroMode || 'all';
  if (m !== 'fade') return m;
  return pass <= 0 ? 'all' : pass === 1 ? 'down' : 'off';
}
/* 樂團伴奏：其他聲部用合成音跟著同一條時間軸 */
function scheduleAccomp(ctx, nodes, tm, fromBeat, toBeat) {
  const song = st.song;
  if (!song.parts || song.parts.length < 2 || !settings.accOn) return;
  const out = ctx.createGain(); out.gain.value = settings.accVol * settings.demoVol; out.connect(AU.master);
  song.parts.forEach((p, i) => {
    if (i === song.partIndex) return;
    const I = E.INSTR[p.instrument];
    E.partTimeline(song, i).forEach(n => {
      if (n.beat + n.dur <= fromBeat + 1e-6 || n.beat >= toBeat - 1e-6) return;
      const b0 = Math.max(n.beat, fromBeat), b1 = Math.min(n.beat + n.dur, toBeat);
      const t = tm.t(b0), d = tm.t(b1) - t; if (d <= 0.02) return;
      n.midis.forEach(m => nodes.push(...tone(ctx, out, m + I.transpose, t, d, I.synth, n.midis.length > 1 ? 0.3 : 0.42)));
    });
  });
}
function playRefAudio(ctx, nodes, when, offset, untilOffset, vol) {
  const buf = st.ref && st.ref.buffer; if (!buf) return;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = vol * (st.ref.gain || 1); src.connect(g); g.connect(AU.master);
  if (offset < 0) { when -= offset; offset = 0; }
  const dur = untilOffset ? Math.max(0.05, untilOffset - offset) : undefined;
  src.start(Math.max(ctx.currentTime, when), offset, dur);
  nodes.push(src);
}
const rangeLabel = (a, b) => a === b ? `第 ${a + 1} 小節` : `第 ${a + 1}–${b + 1} 小節`;

async function playDemo(range) {
  const ctx = await ac(); stopAll();
  const song = st.song, [a, b] = range || rangeFor('demo');
  const [pa, pb] = perfRange(a, b);
  const base = song.pm[pa].start, endBeat = song.pm[pb].start + song.pm[pb].dur;
  const t0 = ctx.currentTime + 0.3, nodes = [];
  const useRef = settings.demoSrc === 'ref' && refUsable() && st.ref.buffer;
  let tm, label;
  if (useRef) {
    const m = refMap(pa, pb, t0, 1); tm = m.tm;
    playRefAudio(ctx, nodes, t0, m.r0, m.r0 + (tm.t(endBeat) - t0) + 0.3, settings.demoVol);
    label = '示範錄音';
  } else {
    tm = E.gridTimeMap(song, st.events, pa, pb, t0, st.speed / 100);
    const out = ctx.createGain(); out.gain.value = settings.demoVol; out.connect(AU.master);
    evsIn(pa, pb).filter(e => e.midi != null).forEach(e => {
      const t = tm.t(e.start), d = tm.t(e.start + e.dur) - t;
      evMidis(e).forEach(m => nodes.push(...tone(ctx, out, m + trans(), t, d, inst().synth, e.note.chord ? 0.35 : 0.5)));
    });
    scheduleClicks(ctx, nodes, tm, pa, pb, false);
    label = `合成音・♩ = ${Math.round(tm.startBpm * st.speed / 100)}`;
  }
  scheduleAccomp(ctx, nodes, tm, base, endBeat);
  scheduleDrone(ctx, nodes, tm.t(base) - 0.2, tm.t(endBeat) + 0.3);
  st.run = { kind: 'demo', tm, base, endT: tm.t(endBeat), nodes, range: [a, b] };
  setRunning(true);
  $('#status').innerHTML = `示範播放中：<strong>${rangeLabel(a, b)}</strong>　${esc(label)}${song.parts.length > 1 && settings.accOn ? '・含其他聲部' : ''}`;
  const tick = () => {
    const R = st.run; if (!R || R.kind !== 'demo') return;
    const now = ctx.currentTime;
    if (now >= R.endT + 0.1) {
      showCursor(null);
      if ($('#optLoop').checked) { R.loopT = setTimeout(() => playDemo(R.range), 300); return; }
      st.run = null; setRunning(false); $('#status').textContent = '示範結束。可以按「開始練習」跟著拉。'; return;
    }
    if (now >= R.tm.t(R.base) - 0.02) showCursor(noteAtBeat(R.tm.beat(now)));
    R.raf = requestAnimationFrame(tick);
  };
  st.run.raf = requestAnimationFrame(tick);
}

/* ================= 進階／比賽：跟節拍（或跟老師錄音）練習 ================= */
function recSlice(t0, t1) {
  if (AU.recT0 == null || !AU.chunks.length) return null;
  const sr = AU.ctx.sampleRate, L = AU.chunks[0].length;
  const i0 = Math.round((t0 - AU.recT0) * sr), i1 = Math.round((t1 - AU.recT0) * sr);
  if (i0 < 0 || i1 > AU.chunks.length * L || i1 <= i0) return null;
  const out = new Float32Array(i1 - i0);
  for (let i = i0, o = 0; i < i1;) {
    const c = AU.chunks[Math.floor(i / L)], off = i % L, n = Math.min(L - off, i1 - i);
    out.set(c.subarray(off, off + n), o); o += n; i += n;
  }
  return out;
}
async function startTimed() {
  const ctx = await ac();
  if (!await openMic()) return;
  stopAll();
  const song = st.song, mode = st.mode, [a, b] = rangeFor(mode);
  const [pa, pb] = perfRange(a, b);
  const base = song.pm[pa].start, endBeat = song.pm[pb].start + song.pm[pb].dur;
  const pick = pa === 0 ? song.pickup : 0;
  const full0 = song.measures[song.pm[pa].mi].full || song.fullBeats;
  const useRefT = settings.refTiming && refUsable();
  const playRef = useRefT && settings.refPlay && st.ref.buffer && mode !== 'contest';
  const rate = playRef ? 1 : st.speed / 100;
  let tm, t0, r0 = 0;
  if (useRefT) {
    const spbHead = refMap(pa, pb, 0, rate).tm.spbHead;
    t0 = ctx.currentTime + 0.35 + (full0 + pick) * spbHead;
    const m = refMap(pa, pb, t0, rate); tm = m.tm; r0 = m.r0;
  } else {
    const probe = E.gridTimeMap(song, st.events, pa, pb, 0, st.speed / 100);
    t0 = ctx.currentTime + 0.35 + (full0 + pick) * probe.spbHead;
    tm = E.gridTimeMap(song, st.events, pa, pb, t0, st.speed / 100);
  }
  const evs = evsIn(pa, pb);
  evs.forEach(e => { st.results[e.idx] = null; });
  for (let m = a; m <= b; m++) delete st.mLevels[m];
  renderScore();
  const nodes = [];
  st.loopPass = st.loopPass || 0;
  scheduleClicks(ctx, nodes, tm, pa, pb, true, st.loopPass);
  scheduleDrone(ctx, nodes, tm.t(base) - 0.2, tm.t(endBeat) + 0.3);
  if ($('#optGuide').checked && mode !== 'contest') {
    const out = ctx.createGain(); out.gain.value = settings.demoVol * 0.45; out.connect(AU.master);
    evs.filter(e => e.midi != null).forEach(e => {
      const t = tm.t(e.start), d = tm.t(e.start + e.dur) - t;
      evMidis(e).forEach(m => nodes.push(...tone(ctx, out, m + trans(), t, d, inst().synth, 0.4)));
    });
  }
  if (playRef) playRefAudio(ctx, nodes, tm.t(base), r0, r0 + (tm.t(endBeat) - tm.t(base)) + 0.3, settings.demoVol * 0.8);
  scheduleAccomp(ctx, nodes, tm, base, endBeat);
  AU.frames = []; AU.chunks = []; AU.recT0 = null; AU.rec = true;
  const lat = latency();
  st.run = { kind: 'timed', mode, tm, base, a, b, pa, pb, evs, nodes, lat, endT: tm.t(endBeat), graded: new Set(), startedAt: Date.now(), tol: tolFor(mode), useRefT, loud: 0 };
  setRunning(true);
  FUN.event('start');
  // 預備拍倒數
  const ts0 = song.measures[song.pm[pa].mi].ts || [song.timeNum, song.timeDen];
  const unit = 4 / ts0[1], countN = Math.round(full0 / unit);
  const countFrom = base - pick - full0;
  const cEl = $('#count');
  st.run.countT = setInterval(() => {
    const R = st.run; if (!R) return;
    const bt = R.tm.beat(ctx.currentTime);
    if (bt >= base - pick - 0.02) { cEl.classList.remove('show'); clearInterval(R.countT); return; }
    const k = Math.floor((bt - countFrom) / unit);
    if (k >= 0 && k < countN) { cEl.textContent = k + 1; cEl.classList.add('show'); }
  }, 30);
  $('#status').innerHTML = `${E.MODES[mode].name}：<strong>${rangeLabel(a, b)}</strong>　預備拍後開始，` +
    (useRefT ? `照示範錄音的速度${playRef ? '（同時播放錄音）' : ''}` : `♩ = ${Math.round(tm.startBpm * st.speed / 100)}`) +
    (st.coach && !st.coach.paused ? `　<span class="muted">特訓中・連續綠燈 ${st.coach.streak}/3</span>` : '');
  const tick = () => {
    const R = st.run; if (!R || R.kind !== 'timed') return;
    const now = ctx.currentTime;
    if (now >= R.tm.t(R.base) - 0.05) showCursor(now < R.endT ? noteAtBeat(R.tm.beat(now)) : null);
    if (AU.live && AU.live.rms > 0.45) { if (++R.loud === 50) FUN.event('loud'); } else R.loud = Math.max(0, R.loud - 1);
    for (let k = R.pa; k <= R.pb; k++) {
      if (R.graded.has(k)) continue;
      const P = st.song.pm[k];
      const endB = Math.max(P.start + P.dur, ...R.evs.filter(e => e.pk === k).map(e => e.start + e.dur));
      if (now > R.tm.t(endB) + R.lat + 0.32) gradeMeasure(k);
    }
    if (now > R.endT + R.lat + 0.45) { finishTimed(false); return; }
    R.raf = requestAnimationFrame(tick);
  };
  st.run.raf = requestAnimationFrame(tick);
}
function gradeMeasure(pk, quiet) {
  const R = st.run; R.graded.add(pk);
  const m = st.song.pm[pk].mi;
  const tr = trans(), tm = R.tm;
  let lv = null, notes = 0, bad = 0, missing = 0;
  R.evs.filter(e => e.pk === pk).forEach(ev => {
    const prev = st.events[ev.idx - 1];
    const inRange = prev && prev.pk >= R.pa;
    const s = tm.t(ev.start), d = tm.t(ev.start + ev.dur) - s;
    const res = E.analyzeEvent(ev, AU.frames, {
      s: s + R.lat, d, A: settings.A, transpose: tr, gate: settings.gate, tol: R.tol,
      prevMidi: inRange ? prev.midi : null, prevD: inRange ? tm.t(prev.start + prev.dur) - tm.t(prev.start) : null,
      sr: AU.ctx.sampleRate, getSamples: recSlice, dsTuning: settings.dsTuning, openStrings: inst().open,
      vocal: !!inst().vocal, expressive: settings.intonation === 'expressive', leading: isLeading(ev)
    });
    st.results[ev.idx] = res;
    if (res.level) lv = E.worst(lv, res.level);
    if (ev.midi != null && res.p) {
      notes++;
      if (['wrong', 'missing', 'chordmiss'].includes(res.p.status)) bad++;
      if (res.p.status === 'missing') missing++;
    }
  });
  if (lv) { st.mLevels[m] = lv; setLamp(m); }
  if (lv && !quiet) FUN.event('measure', { m, level: lv, chaos: notes > 0 && bad / notes >= 0.5, silent: notes > 0 && missing === notes });
}
function finishTimed(stopped) {
  const R = st.run; if (!R || R.done) return;
  R.done = true; AU.rec = false;
  cancelAnimationFrame(R.raf); clearInterval(R.countT); $('#count').classList.remove('show');
  (R.nodes || []).forEach(n => { try { n.stop(); } catch (e) {} });
  const now = AU.ctx.currentTime;
  for (let k = R.pa; k <= R.pb; k++) {
    if (R.graded.has(k)) continue;
    const P = st.song.pm[k];
    if (R.tm.t(P.start + P.dur) + R.lat < now) gradeMeasure(k, true);
  }
  const done = [...new Set([...R.graded].map(k => st.song.pm[k].mi))];
  st.lastRec = AU.chunks.length ? { chunks: AU.chunks, sr: AU.ctx.sampleRate, recT0: AU.recT0, tm: R.tm, base: R.base, lat: R.lat } : null;
  if (!done.length) { st.run = null; setRunning(false); showCursor(null); $('#status').textContent = '已停止。'; renderScore(); return; }
  const evs = R.evs.filter(e => R.graded.has(e.pk));
  const sum = E.summarize(st.song, evs, st.results);
  sum.mode = R.mode; sum.range = [Math.min(...done), Math.max(...done)]; sum.speed = R.useRefT ? null : st.speed; sum.partial = stopped; sum.refTiming = !!R.useRefT; sum.at = Date.now();
  try { st.dynNotes = analyzeDynamics(R); } catch (e) { st.dynNotes = []; }
  if (st.stage) stageEnd(sum);
  st.lastSum = sum;
  const prev = prevSession(sum);
  saveSession(sum, (Date.now() - R.startedAt) / 1000);
  renderScore();
  const coachMsg = coachAfter(sum, stopped);
  renderReport();
  if (!stopped) { FUN.event('finish', { sum, improved: prev ? sum.score - prev.score : 0 }); speakIssues(); }
  const loop = !stopped && R.mode !== 'contest' && ($('#optLoop').checked || (st.coach && !st.coach.paused));
  $('#status').innerHTML = `完成：<strong>${sum.score} 分</strong>　綠 ${sum.counts.g}・黃 ${sum.counts.y}・紅 ${sum.counts.r}` + (coachMsg ? `　<span class="muted">${esc(coachMsg)}</span>` : '') + (loop ? '　<span class="muted">幾秒後再來一次…</span>' : '');
  if (loop) {
    st.run = { kind: 'gap', nodes: [], done: true };
    st.loopPass = (st.loopPass || 0) + 1;
    st.run.loopT = setTimeout(() => { if (st.run && st.run.kind === 'gap') { st.run = null; startTimed(); } }, settings.voice ? 4200 : 2200);
  } else { st.loopPass = 0; st.run = null; setRunning(false); showCursor(null); }
}
function prevSession(sum) {
  const S = (store.get('lr.sessions', {})[st.song.id] || []).filter(s => s.mode === sum.mode && s.range && s.range[0] === sum.range[0] && s.range[1] === sum.range[1] && !s.partial);
  return S[S.length - 1] || null;
}
/* 給小朋友聽的簡單說明（最多兩件事） */
function kidText(ev, res) {
  const where = `第 ${ev.mi + 1} 小節`;
  const p = res.p, r = res.r;
  if (p) {
    if (['wrong', 'missing', 'chordmiss'].includes(p.status)) return `${where}有一個音${inst().verb}錯了，先按聆聽示範聽一聽。`;
    if (p.status === 'sharp') return `${where}有一個音高了一點點，${st.song.instrument === 'violin' || inst().synth === 'violin' ? '手指往後退一點點' : '吹輕一點'}。`;
    if (p.status === 'flat') return `${where}有一個音低了一點點，${st.song.instrument === 'violin' || inst().synth === 'violin' ? '手指往前一點點' : '氣吹多一點點'}。`;
    if (p.status === 'chord' && p.level && p.level !== 'g') return `${where}的雙音不太和諧，兩個音再對準一點。`;
  }
  if (r && !r.skipped) {
    if (r.onsetLevel && r.onsetLevel !== 'g' && r.dt != null) return r.dt < 0 ? `${where}太快進來了，等一下拍子。` : `${where}慢了一點點，早一點準備。`;
    if (r.lengthLevel && r.lengthLevel !== 'g') return `${where}有一個音太短了，要拉長一點。`;
    if (r.restIssue) return `${where}的休止符要停下來喔。`;
  }
  return '';
}
function speakIssues() {
  if (!settings.voice) return;
  const out = [];
  for (const ev of st.events) {
    const r = st.results[ev.idx]; if (!r || !r.level || r.level === 'g') continue;
    const t = kidText(ev, r); if (t && !out.includes(t)) out.push(t);
    if (out.length >= 2) break;
  }
  if (out.length) setTimeout(() => FUN.say(out.join(''), { interrupt: false }), 300);
}

/* ================= 初學：等你拉對 ================= */
async function startWait() {
  if (!await openMic()) return;
  stopAll();
  const [a, b] = rangeFor('beginner');
  const [pa, pb] = perfRange(a, b);
  const evs = evsIn(pa, pb).filter(e => e.midi != null);
  if (!evs.length) { toast('這個範圍沒有音符'); return; }
  evs.forEach(e => st.results[e.idx] = null);
  for (let m = a; m <= b; m++) delete st.mLevels[m];
  renderScore();
  const R = st.run = { kind: 'wait', evs, i: 0, a, b, good: [], cwins: [], armed: true, peak: 0, wrong: 0, wrongSemi: null, wrongCnt: 0, heard: [], startedAt: Date.now(), tol: tolFor('beginner'), tick: 0, miss: 0 };
  R.listener = fr => waitFrame(fr);
  AU.listeners.add(R.listener);
  setRunning(true); $('#btnHint').hidden = false;
  FUN.event('start');
  waitPrompt();
}
function waitPrompt() {
  const R = st.run, ev = R.evs[R.i]; if (!ev) return;
  showCursor(ev.note);
  const isV = st.song.instrument === 'violin';
  const notes = [ev.midi].concat((ev.note.chord || []).map(c => c.midi));
  const isR = /recorder-(s|t)/.test(st.song.instrument);
  const fing = isV ? `（${notes.map(m => E.violinFinger(m)).join('＋')}）` : isR ? `<br><span class="num" style="font-size:20px;letter-spacing:.1em">${E.recorderFinger(ev.midi, settings.recSys)}</span>` : '';
  $('#status').innerHTML = `請${inst().verb}：<strong>${esc(E.noteLabel(ev.note))}</strong>${fing}<br><span class="muted">第 ${ev.mi + 1} 小節・第 ${ev.note.k} 個音　${ev.note.chord ? '兩個音一起拉，' : ''}${inst().verb}準並穩住一下就會往下走</span>`;
  if (settings.voice) FUN.say(isV ? notes.map(m => E.violinFinger(m).replace(' 弦 ', ' 弦，')).join('，和') : E.SOLF[ev.note.step], { rate: 1.05 });
}
function waitAccept(ev, res, fr) {
  const R = st.run;
  st.results[ev.idx] = res;
  const next = R.evs[R.i + 1];
  if (!next || next.pk !== ev.pk) {
    st.mLevels[ev.mi] = R.evs.filter(e => e.pk === ev.pk).reduce((l, e) => E.worst(l, st.results[e.idx] && st.results[e.idx].level), 'g');
    setLamp(ev.mi);
    FUN.event('measure', { m: ev.mi, level: st.mLevels[ev.mi] });
  }
  R.i++; R.good = []; R.cwins = []; R.wrong = 0; R.heard = []; R.wrongSemi = null; R.wrongCnt = 0; R.miss = 0; R.prevSemi = ev.midi + trans();
  R.armed = !(next && next.midi === ev.midi); R.peak = fr.rms;
  if (!next) { finishWait(false); return; }
  waitPrompt();
}
function waitFrame(fr) {
  const R = st.run; if (!R || R.kind !== 'wait' || R.done) return;
  const ev = R.evs[R.i]; if (!ev) return;
  const target = ev.midi + trans();
  const v = E.isVoiced(fr, settings.gate);
  if (!R.armed) {
    if (!v || fr.rms < 0.45 * R.peak) R.armed = true; else { R.peak = Math.max(R.peak, fr.rms); return; }
  }
  if (ev.note.chord) {
    // 雙音：每 4 個音框看一次頻譜
    if (fr.rms < settings.gate) { R.cwins = []; R.miss = 0; return; }
    if (++R.tick % 4) return;
    const targets = [ev.note].concat(ev.note.chord).map(p => p.midi + trans()).sort((x, y) => x - y);
    const w = E.chordFrame(AU.ring.slice(), AU.ctx.sampleRate, targets, settings.A);
    const o = { A: settings.A, tol: R.tol, dsTuning: settings.dsTuning, openStrings: inst().open };
    const j = E.chordJudge([w], targets, o);
    if (j.status === 'chord') {
      R.cwins.push(w); R.miss = 0; R.peak = Math.max(R.peak, fr.rms);
      if (R.cwins.length >= 4) {
        const p = E.chordJudge(R.cwins.slice(1), targets, o);
        const res = { p, r: null, wait: { wrong: R.wrong, heard: R.heard.slice() } };
        res.level = E.worst(p.level, R.wrong >= 3 ? 'r' : R.wrong ? 'y' : null);
        waitAccept(ev, res, fr);
      }
    } else {
      R.cwins = [];
      if (++R.miss === 10) { R.wrong++; (j.missing || []).forEach(x => x.heard != null && R.heard.push(x.heard)); if (R.wrong === 4) FUN.event('wrongMany'); }
    }
    return;
  }
  if (!v) { R.good = []; R.wrongSemi = null; R.wrongCnt = 0; return; }
  const c = E.cents(fr.f, target, settings.A);
  if (Math.abs(c) <= 50) {
    R.good.push(c); R.peak = Math.max(R.peak, fr.rms); R.wrongCnt = 0;
    if (R.good.length >= 9) {
      const cm = E.median(R.good.slice(2)), ac = Math.abs(cm), tol = R.tol;
      const p = { status: ac <= tol.pg ? 'ok' : cm > 0 ? 'sharp' : 'flat', level: ac <= tol.pg ? 'g' : ac <= tol.py ? 'y' : 'r', cents: cm };
      const res = { p, r: null, wait: { wrong: R.wrong, heard: R.heard.slice() } };
      res.level = E.worst(p.level, R.wrong >= 3 ? 'r' : R.wrong ? 'y' : null);
      waitAccept(ev, res, fr);
    }
  } else {
    R.good = [];
    const sm = Math.round(E.midiFloat(fr.f, settings.A));
    if (sm === R.prevSemi) return; // 上一個音的餘音，不算拉錯
    if (sm === R.wrongSemi) { if (++R.wrongCnt === 14) { R.wrong++; R.heard.push(sm); if (R.wrong === 4) FUN.event('wrongMany'); } }
    else { R.wrongSemi = sm; R.wrongCnt = 1; }
  }
}
function finishWait(stopped) {
  const R = st.run; if (!R || R.done) return;
  R.done = true; AU.listeners.delete(R.listener); $('#btnHint').hidden = true;
  const evs = R.evs.slice(0, R.i);
  if (evs.length) {
    const lastMi = R.evs[R.i] ? R.evs[R.i].mi : null;
    const fullEvs = evs.filter(e => e.mi !== lastMi);
    const sum = E.summarize(st.song, fullEvs.length ? fullEvs : evs, st.results);
    sum.mode = 'beginner'; sum.speed = null; sum.partial = stopped; sum.at = Date.now(); st.dynNotes = [];
    const ms = Object.keys(sum.levels).map(Number); sum.range = ms.length ? [Math.min(...ms), Math.max(...ms)] : [R.a, R.a];
    st.lastSum = sum;
    const prev = prevSession(sum);
    if (ms.length) saveSession(sum, (Date.now() - R.startedAt) / 1000);
    $('#status').innerHTML = stopped ? '已停止。' : `全部${inst().verb}完了！<strong>${sum.score} 分</strong>　接下來可以試試進階模式，加上節奏。`;
    if (!stopped) { FUN.event('finish', { sum, improved: prev ? sum.score - prev.score : 0 }); speakIssues(); }
  }
  st.lastRec = null;
  st.run = null; setRunning(false); showCursor(null);
  renderScore(); renderReport();
}
async function hintTone() {
  const R = st.run; if (!R || R.kind !== 'wait') return;
  const ev = R.evs[R.i]; if (!ev) return;
  const ctx = await ac();
  const out = ctx.createGain(); out.gain.value = settings.demoVol; out.connect(AU.master);
  evMidis(ev).forEach(m => tone(ctx, out, m + trans(), ctx.currentTime + 0.05, 1.2, inst().synth, ev.note.chord ? 0.35 : 0.5));
  R.armed = false; R.peak = 1; setTimeout(() => { if (st.run === R) { R.armed = true; } }, 1400);
}

/* ================= 聽自己的演奏 ================= */
async function playMine() {
  const L = st.lastRec; if (!L) return;
  const ctx = await ac(); stopAll();
  const len = L.chunks.reduce((a, c) => a + c.length, 0);
  const buf = ctx.createBuffer(1, len, L.sr), d = buf.getChannelData(0);
  let o = 0; L.chunks.forEach(c => { d.set(c, o); o += c.length; });
  let peak = 0; for (let i = 0; i < len; i += 7) peak = Math.max(peak, Math.abs(d[i]));
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = peak > 0 ? Math.min(8, 0.8 / peak) : 1;
  src.connect(g); g.connect(AU.master);
  const start = ctx.currentTime + 0.1; src.start(start);
  st.run = { kind: 'mine', nodes: [src], start, L, endT: start + len / L.sr };
  setRunning(true);
  $('#status').innerHTML = '正在播放<strong>你剛剛的演奏</strong>，游標會跟著走。';
  const tick = () => {
    const R = st.run; if (!R || R.kind !== 'mine') return;
    const now = ctx.currentTime;
    if (now >= R.endT) { st.run = null; setRunning(false); showCursor(null); $('#status').textContent = '播放結束。'; return; }
    const beat = L.tm.beat(L.recT0 + (now - R.start) - L.lat);
    showCursor(beat >= L.base ? noteAtBeat(beat) : null);
    R.raf = requestAnimationFrame(tick);
  };
  st.run.raf = requestAnimationFrame(tick);
}

/* ================= 示範錄音（老師拉奏版、網路 mp3） ================= */
const IDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('lianqinshi', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('refs');
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async req(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => { const q = fn(db.transaction('refs', mode).objectStore('refs')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  },
  get(k) { return this.req('readonly', s => s.get(k)); },
  put(k, v) { return this.req('readwrite', s => s.put(v, k)); },
  del(k) { return this.req('readwrite', s => s.delete(k)); }
};
const refKey = () => st.song.id + '|' + st.song.partIndex;
function ctxOnly() {
  if (!AU.ctx) { AU.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); AU.master = AU.ctx.createGain(); AU.master.connect(AU.ctx.destination); }
  return AU.ctx;
}
async function decodeRef(r) {
  const ctx = ctxOnly();
  let buf;
  if (r.kind === 'pcm') { const d = new Float32Array(r.data); buf = ctx.createBuffer(1, d.length, r.sr); buf.getChannelData(0).set(d); }
  else buf = await ctx.decodeAudioData(await r.blob.arrayBuffer());
  return buf;
}
const monoOf = buf => {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) out[i] += d[i] / buf.numberOfChannels; }
  return out;
};
const peakGain = x => { let p = 0; for (let i = 0; i < x.length; i += 5) p = Math.max(p, Math.abs(x[i])); return p > 0 ? Math.min(6, 0.85 / p) : 1; };
async function loadRef() {
  const key = refKey();
  try {
    const r = await IDB.get(key);
    if (refKey() !== key) return;
    if (!r) { st.ref = null; renderEnsemble(); return; }
    st.ref = { name: r.name, kind: r.kind, align: r.align, savedAt: r.savedAt };
    renderEnsemble();
    const buf = await decodeRef(r);
    if (refKey() !== key || !st.ref) return;
    st.ref.buffer = buf; st.ref.gain = peakGain(monoOf(buf));
    renderEnsemble();
  } catch (e) { st.ref = null; renderEnsemble(); }
}
async function setRef(samples, sr, meta) {
  const key = refKey();
  const msg = $('#refMsg');
  try {
    msg.textContent = '分析示範錄音中… 0%';
    const frames = await E.analyzeBufferAsync(samples, sr, p => { msg.textContent = `分析示範錄音中… ${Math.round(p * 100)}%`; });
    const rms = frames.map(f => f.rms).sort((a, b) => a - b);
    const gate = Math.max(0.002, 0.06 * (rms[Math.floor(rms.length * 0.9)] || 0.05));
    msg.textContent = '對齊樂譜中…';
    await new Promise(r => setTimeout(r, 20));
    const align = E.alignReference(frames, st.events, { A: settings.A, gate, transpose: trans() });
    if (!align) throw new Error('錄音裡沒有聽到聲音');
    const rec = Object.assign({ align, savedAt: Date.now() }, meta);
    await IDB.put(key, rec);
    if (refKey() !== key) return;
    await loadRef();
    const c = Math.round(align.confidence * 100);
    const verdict = align.confidence >= 0.75 ? '對齊得很好，可以照錄音的速度評分。' : align.confidence >= 0.5 ? '大致對得上，評分時速度可能有些誤差。' : '和樂譜對不太起來（可能是不同版本、有伴奏或不同調），只能當聆聽用。';
    msg.textContent = `完成：對齊可信度 ${c}%。${verdict}`;
    if (align.confidence >= 0.5) { settings.demoSrc = 'ref'; saveSettings(); renderEnsemble(); }
  } catch (e) { msg.textContent = '處理錄音失敗：' + e.message; }
}
async function importRefFile(file) {
  if (!file) return;
  const ctx = ctxOnly();
  $('#refMsg').textContent = '讀取檔案中…';
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    if (buf.duration > 900) throw new Error('錄音超過 15 分鐘，請剪成單首曲子再上傳');
    await setRef(monoOf(buf), buf.sampleRate, { kind: 'file', blob: file, name: file.name });
  } catch (e) { $('#refMsg').textContent = '無法讀取這個檔案：' + (e.message || '格式不支援，請用 mp3、m4a、wav'); }
}
async function startTeacherRec() {
  const ctx = await ac();
  if (!await openMic()) return;
  stopAll();
  const song = st.song, spb = 60 / song.tempo, nodes = [];
  const t0 = ctx.currentTime + 0.3 + (song.fullBeats + song.pickup) * spb;
  const tmC = gridMap(t0, 0, spb);
  for (let bt = -song.pickup - song.fullBeats, k = 0; bt < -1e-6; bt += 4 / song.timeDen, k++) nodes.push(click(ctx, tmC.t(bt), k === 0, settings.clickVol));
  AU.frames = []; AU.chunks = []; AU.recT0 = null; AU.rec = true;
  st.run = { kind: 'teacherRec', nodes, startedAt: Date.now() };
  setRunning(true);
  const b = $('#btnTeacherRec'); b.textContent = '停止錄音'; b.disabled = false;
  $('#refMsg').textContent = '錄音中：聽完預備拍後，請老師從第一小節拉到最後。拉完按「停止錄音」。';
  $('#status').innerHTML = '<strong>正在錄老師示範</strong>　拉完請按「停止錄音」';
}
function finishTeacherRec() {
  const R = st.run; if (!R || R.done) return;
  R.done = true; AU.rec = false;
  st.run = null; setRunning(false);
  $('#btnTeacherRec').textContent = '錄老師示範';
  const L = AU.chunks.reduce((a, c) => a + c.length, 0);
  if (L < AU.ctx.sampleRate * 2) { $('#refMsg').textContent = '錄音太短，沒有存起來。'; return; }
  const x = new Float32Array(L); let o = 0; AU.chunks.forEach(c => { x.set(c, o); o += c.length; });
  const d = new Date();
  setRef(x, AU.ctx.sampleRate, { kind: 'pcm', data: x.buffer.slice(0), sr: AU.ctx.sampleRate, name: `老師錄音 ${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` });
  $('#status').textContent = '錄好了，正在分析…';
}

/* 示範錄音、伴奏、聲部的面板 */
function renderEnsemble() {
  const host = $('#ens'); if (!host || !st.song) return;
  const song = st.song, multi = song.parts.length > 1;
  const partsHtml = multi
    ? `<div class="ens-row"><label for="partSel">我的聲部</label><select id="partSel">${song.parts.map((p, i) => `<option value="${i}" ${i === song.partIndex ? 'selected' : ''}>${esc(p.name)}（${esc(E.INSTR[p.instrument].name)}）</option>`).join('')}</select></div>
       <div class="ens-row"><label class="toggle"><input type="checkbox" id="optAcc" ${settings.accOn ? 'checked' : ''}>其他聲部伴奏</label>
       <label for="accVol" class="muted">音量</label><input type="range" id="accVol" min="0" max="1" step="0.05" value="${settings.accVol}"></div>
       <p class="ens-note">聆聽示範與練習時，其他 ${song.parts.length - 1} 個聲部會一起演奏，像在樂團裡合奏。評分只看你的聲部。</p>`
    : `<p class="ens-note">這首只有一個聲部。樂團分部譜請匯入含多個聲部的 MusicXML，伴奏就會出現在這裡。</p>`;
  const R = st.ref;
  const refInfo = R
    ? `<b>${esc(R.name || '示範錄音')}</b>　<span class="muted">對齊可信度 ${Math.round((R.align ? R.align.confidence : 0) * 100)}%${R.buffer ? '' : '・載入中'}</span>`
    : '<span class="muted">還沒有示範錄音。可以上傳老師拉的錄音、網路下載的 mp3，或直接在這裡錄老師拉一次。</span>';
  const yt = (settings.yt || {})[song.id] || song.youtube || '';
  host.querySelector('.ens-body').innerHTML = `
    <div class="ens-col">
      <h4>示範錄音（${esc(song.parts[song.partIndex].name)}）</h4>
      <p class="ens-row">${refInfo}</p>
      <div class="ens-row">
        <label class="btn" for="refFile">上傳錄音檔</label><input type="file" id="refFile" accept="audio/*,.mp3,.m4a,.wav,.ogg" hidden>
        <button class="btn" id="btnTeacherRec">${st.run && st.run.kind === 'teacherRec' ? '停止錄音' : '錄老師示範'}</button>
        ${R ? '<button class="btn danger" id="btnRefDel">刪除錄音</button>' : ''}
      </div>
      ${R ? `<div class="ens-row"><label for="demoSrc">「聆聽示範」播放</label><select id="demoSrc"><option value="synth" ${settings.demoSrc !== 'ref' ? 'selected' : ''}>合成音（可調速度）</option><option value="ref" ${settings.demoSrc === 'ref' ? 'selected' : ''} ${refUsable() ? '' : 'disabled'}>示範錄音</option></select></div>
      <div class="ens-row"><label class="toggle"><input type="checkbox" id="optRefTiming" ${settings.refTiming ? 'checked' : ''} ${refUsable() ? '' : 'disabled'}>練習時照錄音的速度和彈性評分</label></div>
      <div class="ens-row"><label class="toggle"><input type="checkbox" id="optRefPlay" ${settings.refPlay ? 'checked' : ''} ${refUsable() ? '' : 'disabled'}>同時播放錄音（固定原速）</label></div>` : ''}
      <p class="ens-note" id="refMsg"></p>
    </div>
    <div class="ens-col">
      <h4>樂團聲部與伴奏</h4>${partsHtml}
      <h4 style="margin-top:14px">YouTube 參考</h4>
      <div class="ens-row"><input type="url" id="ytIn" placeholder="貼上 YouTube 網址" value="${esc(yt)}"><button class="btn" id="btnYt">儲存</button>${yt ? `<button class="btn" id="btnYtPlay">在頁面播放</button><a class="btn" href="${esc(yt)}" target="_blank" rel="noopener">到 YouTube 開啟</a>` : ''}</div>
      <div id="ytEmbed"></div>
      <p class="ens-note">YouTube 可以在這裡播放給你聽，但無法分析或評分（YouTube 不提供音訊下載）。要對照評分，請上傳錄音檔或匯入樂譜。</p>
    </div>`;
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  on('#partSel', 'change', e => { settings.partSel = settings.partSel || {}; settings.partSel[song.id] = +e.target.value; saveSettings(); loadSong(song.id); });
  on('#optAcc', 'change', e => { settings.accOn = e.target.checked; saveSettings(); });
  on('#accVol', 'input', e => { settings.accVol = +e.target.value; saveSettings(); });
  on('#refFile', 'change', e => { importRefFile(e.target.files[0]); e.target.value = ''; });
  on('#btnTeacherRec', 'click', () => { if (st.run && st.run.kind === 'teacherRec') stopAll(true); else startTeacherRec(); });
  on('#btnRefDel', 'click', async e => {
    const b = e.currentTarget;
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '確定刪除？'; setTimeout(() => { b.dataset.armed = ''; b.textContent = '刪除錄音'; }, 3000); return; }
    await IDB.del(refKey()); st.ref = null; settings.demoSrc = 'synth'; saveSettings(); renderEnsemble(); toast('已刪除示範錄音');
  });
  on('#demoSrc', 'change', e => { settings.demoSrc = e.target.value; saveSettings(); });
  on('#optRefTiming', 'change', e => { settings.refTiming = e.target.checked; saveSettings(); });
  on('#optRefPlay', 'change', e => { settings.refPlay = e.target.checked; saveSettings(); });
  on('#btnYtPlay', 'click', () => {
    const m = String(yt).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    const box = $('#ytEmbed');
    if (box.innerHTML) { box.innerHTML = ''; $('#btnYtPlay').textContent = '在頁面播放'; return; }
    if (!m) { toast('看不懂這個 YouTube 網址'); return; }
    box.innerHTML = `<div class="yt-box"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}?rel=0" title="YouTube 參考" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
    $('#btnYtPlay').textContent = '關閉影片';
  });
  on('#btnYt', 'click', () => {
    const v = $('#ytIn').value.trim();
    if (v && !/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(v)) { toast('請貼 YouTube 的網址（https://www.youtube.com/… 或 https://youtu.be/…）'); return; }
    settings.yt = settings.yt || {}; settings.yt[song.id] = v; saveSettings(); renderEnsemble(); toast(v ? '已儲存 YouTube 連結' : '已清除連結');
  });
  host.classList.toggle('has', !!R || multi);
}

/* ================= 教學引擎：特訓處方 ================= */
function weakGroups(sum) {
  const ms = Object.keys(sum.levels).map(Number).filter(m => sum.levels[m] !== 'g').sort((x, y) => x - y);
  const groups = [];
  ms.forEach(m => {
    const g = groups[groups.length - 1];
    if (g && m === g[1] + 1 && g[1] - g[0] < 1) g[1] = m; else groups.push([m, m]);
  });
  const sev = g => { let s = 0; for (let m = g[0]; m <= g[1]; m++) s += sum.levels[m] === 'r' ? 2 : 1; return s; };
  return groups.sort((x, y) => sev(y) - sev(x) || x[0] - y[0]);
}
function startCoach() {
  const sum = st.lastSum; if (!sum) return;
  const q = weakGroups(sum); if (!q.length) return;
  st.coach = { queue: q, cur: q[0], streak: 0, speed: Math.min(st.speed, 70), passed: [] };
  applyCoach(); startTimed();
}
function applyCoach() {
  const C = st.coach;
  st.mode = 'advanced'; settings.mode = 'advanced'; renderModes();
  st.sel = C.cur.slice(); st.speed = C.speed; $('#speed').value = C.speed; updateSpeedOut();
  renderRange(); drawOverlay();
}
function coachAfter(sum, stopped) {
  const C = st.coach; if (!C || C.paused || stopped) return '';
  const [a, b] = C.cur; let allG = true;
  for (let m = a; m <= b; m++) if (sum.levels[m] !== 'g') allG = false;
  C.streak = allG ? C.streak + 1 : 0;
  if (C.streak < 3) return allG ? `綠燈！再連續 ${3 - C.streak} 次就升速` : '再試一次，注意下面列出的錯誤';
  C.streak = 0;
  if (C.speed < 100) { C.speed = Math.min(100, C.speed + 10); applyCoach(); FUN.event('coachUp', { speed: C.speed }); return `連續 3 次綠燈，速度提高到 ${C.speed}%`; }
  C.passed.push(C.cur); C.queue.shift();
  if (C.queue.length) { C.cur = C.queue[0]; C.speed = 70; applyCoach(); FUN.event('coachPass'); return `第 ${a + 1}${a !== b ? '–' + (b + 1) : ''} 小節過關！換下一段`; }
  st.coach = null; $('#optLoop').checked = false;
  setTimeout(() => { toast('全部弱點都過關了！試試比賽模式完整拉一次', 5000); FUN.event('levelDone'); }, 300);
  return '全部過關';
}

/* ================= 報告 ================= */
function renderReport() {
  const el = $('#report'); const sum = st.lastSum, song = st.song;
  if (!song) return;
  if (!sum) {
    const rv = reviewList();
    const due = assignList().filter(a => a.song === song.id && !assignDone(a).done);
    const top = (rv.length ? `<div class="coach" style="margin-bottom:12px"><h3>今天先複習</h3>前幾天紅燈、後來練好的小節：${rv.map(m => '第 ' + (m + 1) + ' 小節').join('、')}。先各拉一次，確認還記得。<br><button class="btn primary" id="btnRv">開始複習</button></div>` : '') +
      (due.length ? `<div class="coach" style="margin-bottom:12px"><h3>老師的作業</h3>${due.map(a => `${a.range ? '第 ' + (a.range[0] + 1) + '–' + (a.range[1] + 1) + ' 小節，' : ''}${E.MODES[a.mode].short}模式${a.speed ? '速度 ' + a.speed + '%' : ''}，${a.goal === 'green' ? '全部綠燈' : '沒有紅燈'}連續 ${a.times} 次（目前 ${assignDone(a).streak} 次）${a.note ? '。' + esc(a.note) : ''}`).join('<br>')}</div>` : '');
    el.innerHTML = `<div class="card empty-tips">${top}<h3>開始之前</h3><ol>
      <li>夾好麥克風，按右上角「開啟」，拉一下確認綠色音量條會動。</li>
      <li>先到「調音」把四條弦調到綠色。</li>
      <li>選模式：第一次練新曲用<b>初學模式</b>；熟悉後用<b>進階模式</b>；上台前用<b>比賽模式</b>。</li>
      <li>不確定旋律時，按「聆聽示範」，也可以點選小節只聽那一段。</li></ol>
      <p class="muted" style="font-size:13px">建議戴耳機聽節拍器和示範，麥克風只收你的琴聲，判斷最準。</p><p class="muted" style="font-size:13px">小幫手只幫你檢查音準和節奏的對錯；指法、弓法、怎麼表現音樂，請照老師上課教的。</p></div>
      <div class="card"><h3>${esc(E.MODES[st.mode].name)}</h3><p style="font-size:14px">${esc(E.MODES[st.mode].desc)}</p>
      ${tolLine(st.mode)}${measureDetail()}</div>`;
    const b = $('#btnRv'); if (b) b.onclick = () => { const rv2 = reviewList(); st.coach = { queue: rv2.map(m => [m, m]), cur: [rv2[0], rv2[0]], streak: 0, speed: 100, passed: [] }; applyCoach(); startTimed(); };
    return;
  }
  const items = [];
  st.events.forEach(ev => {
    const r = st.results[ev.idx]; if (!r || !r.level) return;
    if (st.sel && (ev.mi < st.sel[0] || ev.mi > st.sel[1])) return;
    const msgs = E.describe(song, ev, r); if (!msgs.length) return;
    if (r.p && r.p.status === 'wrong' && r.p.octave && /recorder/.test(song.instrument)) msgs[0] = { lv: 'r', t: r.p.heard > r.p.heard - 12 && r.p.cents > 0 ? '吹太用力，跳到高八度了；氣放輕一點' : '音低了一個八度，氣要再多一點' };
    items.push({ ev, lv: r.level, msgs });
  });
  // 先講最重要的：紅燈優先，再看黃燈；小朋友一次只看 3 件事
  const RK = { r: 0, y: 1, g: 2 };
  const top = items.slice().sort((x, y) => RK[x.lv] - RK[y.lv] || x.ev.idx - y.ev.idx).slice(0, 3);
  const restN = items.length - top.length;
  const groups = weakGroups(sum);
  const coachBox = st.coach && !st.coach.paused
    ? `<div class="coach"><h3>小琴陪你加強中</h3>正在練第 ${st.coach.cur[0] + 1}${st.coach.cur[0] !== st.coach.cur[1] ? '–' + (st.coach.cur[1] + 1) : ''} 小節，速度 ${st.coach.speed}%，連續綠燈 ${st.coach.streak}/3。剩 ${st.coach.queue.length} 段要過關。</div>`
    : groups.length
      ? `<div class="coach"><h3>小琴的練習小撇步</h3>可以先把${groups.slice(0, 3).map(g => `第 ${g[0] + 1}${g[0] !== g[1] ? '–' + (g[1] + 1) : ''} 小節`).join('、')}單獨拿出來，用 70% 速度循環練。連續 3 次綠燈會自動加速 10%，到原速後換下一段。（如果老師有指定不同的練法，請照老師的方式。）<br><button class="btn primary" id="btnCoach">小琴陪你加強</button></div>`
      : `<div class="coach"><h3>小琴的練習小撇步</h3>${sum.mode === 'contest' ? '全部綠燈！音準和節奏都通過比賽模式的檢查。音色和音樂表現，記得上課時請老師聽聽看喔！' : '這次全部綠燈！可以提高速度，或改用比賽模式從頭到尾拉一次。'}</div>`;
  const bias = sum.pitchBias == null ? '' : Math.abs(sum.pitchBias) < 3 ? '沒有明顯偏向' : sum.pitchBias > 0 ? `整體偏高 ${sum.pitchBias} cents` : `整體偏低 ${-sum.pitchBias} cents`;
  const drift = sum.drift == null ? '' : Math.abs(sum.drift) < 15 ? '速度穩定' : sum.drift < 0 ? '越拉越快' : '越拉越慢';
  el.innerHTML = `<div class="card">
      <div class="eyebrow">${esc(E.MODES[sum.mode].name)}${sum.refTiming ? '・照示範錄音速度' : sum.speed ? '・速度 ' + sum.speed + '%' : ''}${sum.partial ? '・中途停止' : ''}</div>
      <div class="scorebig"><b class="num">${sum.score}</b><span class="muted">分</span></div>
      <div class="lamps"><span><i style="background:var(--ok)"></i>${sum.counts.g} 小節</span><span><i style="background:var(--warn)"></i>${sum.counts.y} 小節</span><span><i style="background:var(--bad)"></i>${sum.counts.r} 小節</span></div>
      <dl class="kv">
        <dt>音準平均誤差</dt><dd class="num">${sum.pitchAbs == null ? '—' : '±' + sum.pitchAbs + ' cents'}　<span class="muted">${bias}</span></dd>
        ${sum.mode !== 'beginner' ? `<dt>節奏穩定度</dt><dd class="num">${sum.rhythmStd == null ? '—' : '±' + sum.rhythmStd + ' 毫秒'}　<span class="muted">${sum.rhythmMean == null ? '' : (Math.abs(sum.rhythmMean) < 15 ? '拍點準確' : sum.rhythmMean < 0 ? '習慣搶拍 ' + (-sum.rhythmMean) + ' 毫秒' : '習慣晚進 ' + sum.rhythmMean + ' 毫秒')}</span></dd>
        <dt>速度</dt><dd>${drift || '—'}</dd>` : ''}
        ${sum.pitchDrift != null && Math.abs(sum.pitchDrift) >= 15 ? `<dt>音高走向</dt><dd class="num">${sum.pitchDrift < 0 ? '越' + inst().verb + '越低' : '越' + inst().verb + '越高'}（前後差約 ${Math.abs(sum.pitchDrift)} cents）</dd>` : ''}
        ${sum.vibrato ? `<dt>抖音</dt><dd class="num">${sum.vibrato.n} 個長音有抖音，平均每秒 ${sum.vibrato.rate} 次、幅度 ±${sum.vibrato.width} cents<span class="muted">（僅供參考，抖音的速度與幅度請照老師要求）</span></dd>` : ''}
      </dl>
      ${(st.dynNotes || []).length ? `<div class="dyn-notes"><b>音量與音色（僅供參考）</b><ul>${st.dynNotes.slice(0, 4).map(t => '<li>' + esc(t) + '</li>').join('')}</ul></div>` : ''}
      ${tolLine(sum.mode)}
      <div class="field" style="margin-top:14px">${st.lastRec ? '<button class="btn" id="btnMine">聽自己的演奏</button>' : ''}<button class="btn" id="btnDemoSel">聽示範（同一段）</button></div>
      ${coachBox}
    </div>
    <div class="card">
      <h3>先改這 ${top.length} 件事${st.sel ? `<span class="muted" style="font-weight:400;font-size:14px">（只顯示所選小節）</span>` : ''}</h3>
      ${items.length ? `<ul class="issues">${top.map(issueLi).join('')}</ul>
        ${restN > 0 ? `<details class="more"><summary>其他 ${restN} 個小問題（給老師或想看全部時）</summary><ul class="issues">${items.filter(it => !top.includes(it)).map(issueLi).join('')}</ul></details>` : ''}` : '<p class="muted">沒有需要修正的地方，很棒！</p>'}
      <div class="field" style="margin-top:12px">${rhythmVariantOK() ? '<button class="btn" id="btnVariant">節奏變化練習（快速段落）</button>' : ''}<button class="btn" id="btnReview" title="老師可以依自己的聽感修正燈號，幫小幫手調整標準">${st.review ? '結束老師覆核' : '老師覆核燈號'}</button></div>
      ${st.review ? '<p class="ens-note">覆核中：點樂譜上的小節，依老師的聽感切換 綠 → 黃 → 紅。累積 10 個小節以上，到「設定」→「評分校正」看建議的標準。</p>' : ''}
    </div>`;
  const bv = $('#btnVariant'); if (bv) bv.onclick = startVariant;
  $('#btnReview').onclick = () => { st.review = !st.review; renderReport(); drawOverlay(); };
  const bc = $('#btnCoach'); if (bc) bc.onclick = startCoach;
  const bm = $('#btnMine'); if (bm) bm.onclick = playMine;
  $('#btnDemoSel').onclick = () => playDemo(sum.range);
  $$('.issues li').forEach(li => li.onclick = () => {
    const m = +li.dataset.m; st.sel = [m, m]; renderRange(); drawOverlay();
    const bx = $(`.mbox[data-m="${m}"]`); if (bx) bx.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
function issueLi(it) {
  const song = st.song, n = it.ev.note;
  const fing = n.fing != null ? `樂譜指法：${n.fing}` : (song.instrument === 'violin' && it.ev.midi != null ? `參考指法：${E.violinFinger(it.ev.midi)}${it.ev.midi > 83 ? '（需換把位，請照老師指法）' : ''}` : '');
  return `<li data-m="${it.ev.mi}"><span class="dot" style="background:${LV_COLOR[it.lv]}"></span><div>
    <div class="w">${esc(E.whereLabel(song, it.ev))}</div>
    <div class="t">${it.msgs.map(m => esc(m.t)).join('；')}</div>
    ${fing ? `<div class="f">${esc(fing)}</div>` : ''}</div></li>`;
}
function tolLine(mode) {
  const t = tolFor(mode);
  return `<p class="muted" style="font-size:13px;margin-top:12px">標準：音準綠燈 ±${t.pg}、黃燈 ±${t.py} cents${t.rg != null ? `；起音綠燈 ±${t.rg}、黃燈 ±${t.ry} 毫秒` : '；不判斷節奏'}（可在設定調整）</p>`;
}
function measureDetail() {
  if (!st.sel || !st.song) return '';
  const [a, b] = st.sel;
  const evs = st.events.filter(e => e.mi >= a && e.mi <= b && e.midi != null);
  if (st.song.instrument !== 'violin') return `<p style="font-size:14px">第 ${a + 1}${a !== b ? '–' + (b + 1) : ''} 小節的音：${evs.map(e => E.noteLabel(e.note)).join('、')}</p>`;
  return `<p style="font-size:14px;margin-top:12px"><b>第 ${a + 1}${a !== b ? '–' + (b + 1) : ''} 小節參考指法（第一把位）</b><br>${evs.map(e => `${E.noteLabel(e.note)}＝${E.violinFinger(e.midi)}`).join('　')}</p>`;
}

/* ================= 練習紀錄 ================= */
function saveSession(sum, secs) {
  const all = store.get('lr.sessions', {});
  const id = st.song.id;
  (all[id] = all[id] || []).push({
    at: Date.now(), secs: Math.round(secs), mode: sum.mode, speed: sum.speed, range: sum.range, partial: sum.partial,
    score: sum.score, counts: sum.counts, levels: sum.levels, pitchAbs: sum.pitchAbs, pitchBias: sum.pitchBias,
    rhythmStd: sum.rhythmStd, rhythmMean: sum.rhythmMean, drift: sum.drift, notes: sum.notes, pitchDrift: sum.pitchDrift, vibrato: sum.vibrato
  });
  recordBasics(sum);
  if (all[id].length > 300) all[id] = all[id].slice(-300);
  store.set('lr.sessions', all);
  const pr = store.get('lr.progress', {});
  const hist = (pr[id] || {}).hist || {};
  const day = new Date().toISOString().slice(0, 10);
  Object.entries(sum.levels).forEach(([m, l]) => { const h = hist[m] = hist[m] || []; h.push([day, l]); if (h.length > 20) h.shift(); });
  pr[id] = { levels: Object.assign({}, (pr[id] || {}).levels, sum.levels), hist, at: Date.now() };
  store.set('lr.progress', pr);
}
function renderLog() {
  const sel = $('#logSong');
  const sessAll = store.get('lr.sessions', {});
  sel.innerHTML = allSongs().map(s => `<option value="${esc(s.id)}">${esc(s.title)}（${(sessAll[s.id] || []).length} 次）</option>`).join('');
  sel.value = sel.dataset.v || (st.song && st.song.id) || '';
  const id = sel.value, song = allSongs().find(s => s.id === id);
  const S = sessAll[id] || [];
  const body = $('#logBody');
  if (!S.length) { body.innerHTML = `<div class="card panel"><h3>還沒有紀錄</h3><p class="muted">在練習頁拉完一次（任何模式），這裡就會開始記錄：哪些小節最常出錯、哪些音常偏高或偏低、節奏穩不穩，以及練習前後的進步。</p></div>`; return; }
  const totalMin = Math.round(S.reduce((a, s) => a + (s.secs || 0), 0) / 60);
  const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  const k = Math.min(3, Math.floor(S.length / 2));
  const first = k ? avg(S.slice(0, k).map(s => s.score)) : null, last = k ? avg(S.slice(-k).map(s => s.score)) : null;
  // 常錯小節
  const mCnt = {};
  S.forEach(s => Object.entries(s.levels || {}).forEach(([m, l]) => { mCnt[m] = mCnt[m] || { r: 0, y: 0, n: 0 }; mCnt[m].n++; if (l !== 'g') mCnt[m][l]++; }));
  const worstM = Object.entries(mCnt).map(([m, c]) => ({ m: +m, w: c.r * 2 + c.y, ...c })).filter(x => x.w > 0).sort((a, b) => b.w - a.w).slice(0, 6);
  const maxW = Math.max(1, ...worstM.map(x => x.w));
  // 常偏的音
  const nAgg = {};
  S.forEach(s => (s.notes || []).forEach(n => { (nAgg[n.m] = nAgg[n.m] || []).push(n.c); }));
  const tr = E.INSTR[(song && song.instrument) || 'violin'].transpose;
  const nList = Object.entries(nAgg).filter(([, a]) => a.length >= 3).map(([m, a]) => ({ m: +m, c: Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10, n: a.length }))
    .sort((a, b) => Math.abs(b.c) - Math.abs(a.c)).slice(0, 8);
  const rs = S.filter(s => s.rhythmStd != null);
  body.innerHTML = `
    <div class="kpis">
      <div class="card kpi"><div class="v num">${S.length}</div><div class="l">練習次數・共 ${totalMin} 分鐘</div></div>
      <div class="card kpi"><div class="v num">${S[S.length - 1].score}</div><div class="l">最近一次分數</div></div>
      <div class="card kpi"><div class="v num">${first == null ? '—' : (last - first >= 0 ? '+' : '') + (last - first)}</div><div class="l">改善幅度（前 ${k || '-'} 次 ${first ?? '—'} → 後 ${k || '-'} 次 ${last ?? '—'} 分）</div></div>
      <div class="card kpi"><div class="v num">${rs.length ? '±' + rs[rs.length - 1].rhythmStd : '—'}</div><div class="l">節奏穩定度（毫秒，越小越穩）${rs.length > 1 ? `・第一次 ±${rs[0].rhythmStd}` : ''}</div></div>
    </div>
    <div class="card panel chart"><h3>分數變化</h3>${scoreChart(S)}</div>
    <div class="grid2">
      <div class="card panel"><h3>最常出錯的小節</h3>
        ${worstM.length ? `<div class="blist">${worstM.map(x => `<div class="brow" data-m="${x.m}" style="cursor:pointer" title="點一下到練習頁練這一小節"><span>第 ${x.m + 1} 小節</span><span class="track"><b style="left:0;width:${x.w / maxW * 100}%;background:var(--bad);opacity:${.45 + .55 * x.r / Math.max(1, x.r + x.y)}"></b></span><span class="muted num">紅${x.r} 黃${x.y}</span></div>`).join('')}</div><p class="muted" style="font-size:13px">點小節可直接去練。</p>` : '<p class="muted">目前沒有常錯的小節。</p>'}
      </div>
      <div class="card panel"><h3>常偏高或偏低的音</h3>
        ${nList.length ? `<div class="blist">${nList.map(x => {
          const w = Math.min(50, Math.abs(x.c)) / 50 * 50;
          return `<div class="brow"><span>${esc(E.midiName(x.m, song && song.fifths < 0))}</span><span class="track"><span class="mid"></span><b style="${x.c >= 0 ? 'left:50%' : 'right:50%'};width:${w}%;background:${x.c >= 0 ? 'var(--sharp)' : 'var(--flat)'}"></b></span><span class="num" style="color:${x.c >= 0 ? 'var(--sharp)' : 'var(--flat)'}">${x.c > 0 ? '+' : ''}${x.c}</span></div>`;
        }).join('')}</div><p class="muted" style="font-size:13px">左藍偏低、右橙偏高，單位 cents；至少出現 3 次才列入。${tr ? '音名為譜面寫法。' : ''}</p>` : '<p class="muted">資料還不夠，多練幾次就會出現。</p>'}
      </div>
    </div>
    <div class="card panel" style="margin-top:18px"><h3>每次練習</h3><div class="tablewrap"><table>
      <thead><tr><th>時間</th><th>模式</th><th>速度</th><th>範圍</th><th>分數</th><th>綠／黃／紅</th><th>音準</th><th>節奏</th></tr></thead>
      <tbody>${S.slice().reverse().slice(0, 40).map(s => `<tr><td class="num">${new Date(s.at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td>${E.MODES[s.mode] ? E.MODES[s.mode].short : s.mode}</td><td class="num">${s.speed ? s.speed + '%' : '—'}</td><td class="num">${s.range ? (s.range[0] + 1) + (s.range[1] !== s.range[0] ? '–' + (s.range[1] + 1) : '') : '—'}</td><td class="num"><b>${s.score}</b></td><td class="num">${s.counts.g}／${s.counts.y}／${s.counts.r}</td><td class="num">${s.pitchAbs == null ? '—' : '±' + s.pitchAbs}</td><td class="num">${s.rhythmStd == null ? '—' : '±' + s.rhythmStd}</td></tr>`).join('')}</tbody></table></div></div>`;
  $$('#logBody .brow[data-m]').forEach(r => r.onclick = () => {
    if (!st.song || st.song.id !== id) loadSong(id);
    const m = +r.dataset.m; st.sel = [m, m]; st.mode = 'advanced'; renderModes(); renderRange(); drawOverlay(); renderReport(); showView('practice');
  });
}
function scoreChart(S) {
  const W = 760, H = 220, L = 36, R = 12, T = 12, B = 28;
  const pts = S.slice(-60);
  const x = i => L + (pts.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (pts.length - 1));
  const y = v => T + (100 - v) / 100 * (H - T - B);
  const grid = [0, 25, 50, 75, 100].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`).join('');
  const path = pts.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.score).toFixed(1)}`).join('');
  const area = path + `L${x(pts.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const MC = { beginner: 'var(--flat)', advanced: 'var(--accent)', contest: 'var(--rosin)' };
  const dots = pts.map((s, i) => `<circle cx="${x(i)}" cy="${y(s.score)}" r="${i === pts.length - 1 ? 5 : 3.5}" fill="${MC[s.mode] || 'var(--accent)'}"><title>${new Date(s.at).toLocaleDateString('zh-TW')} ${E.MODES[s.mode] ? E.MODES[s.mode].short : ''} ${s.score} 分</title></circle>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="每次練習的分數">${grid}<path d="${area}" fill="var(--accent)" opacity=".08"/><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>${dots}
    <text x="${L}" y="${H - 6}" font-size="11" fill="var(--muted)">第 1 次</text><text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="11" fill="var(--muted)">最近</text></svg>
    <div class="legend" style="margin-top:4px"><span><i style="background:var(--flat)"></i>初學</span><span><i style="background:var(--accent)"></i>進階</span><span><i style="background:var(--rosin)"></i>比賽</span></div>`;
}

/* ================= 調音器 ================= */
const TU = { mode: 'violin', hist: [], target: null };
const STRING_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const stringsOf = () => { const I = st.song && inst(); const open = I && I.open ? I.open : [55, 62, 69, 76]; return open.map(m => [STRING_NAMES[m % 12], m]); };
function buildTuner() {
  let g = '';
  for (let c = -50; c <= 50; c += 5) {
    const a = c / 50 * 60 * Math.PI / 180, r1 = 160, r2 = c % 25 === 0 ? 140 : 150;
    const col = Math.abs(c) <= 3 ? 'var(--ok)' : 'var(--muted)';
    g += `<line x1="${200 + r1 * Math.sin(a)}" y1="${210 - r1 * Math.cos(a)}" x2="${200 + r2 * Math.sin(a)}" y2="${210 - r2 * Math.cos(a)}" stroke="${col}" stroke-width="${c % 25 === 0 ? 2 : 1}"/>`;
    if (c % 25 === 0) g += `<text x="${200 + 120 * Math.sin(a)}" y="${214 - 120 * Math.cos(a)}" text-anchor="middle" font-size="12" fill="var(--muted)">${c > 0 ? '+' + c : c}</text>`;
  }
  const a3 = 3 / 50 * 60 * Math.PI / 180;
  g += `<path d="M${200 - 172 * Math.sin(a3)},${210 - 172 * Math.cos(a3)} A172,172 0 0 1 ${200 + 172 * Math.sin(a3)},${210 - 172 * Math.cos(a3)}" stroke="var(--ok)" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  g += `<text x="40" y="200" font-size="13" fill="var(--flat)">偏低</text><text x="360" y="200" text-anchor="end" font-size="13" fill="var(--sharp)">偏高</text>`;
  $('#tTicks').innerHTML = g;
  renderStrings();
}
function renderStrings() {
  const host = $('#tStrings');
  if (TU.mode === 'violin') host.innerHTML = stringsOf().map(([n, m]) => `<button data-m="${m}"><b>${n}</b><span class="num">${E.freq(m, settings.A).toFixed(1)} Hz</span></button>`).join('');
  else if (TU.mode === 'pipe') {
    // 起音器：主和弦＋每個聲部的第一個音
    const song = st.song, tonic = ((song.fifths * 7) % 12 + 12) % 12 + (song.minor ? 9 : 0);
    let root = 48 + (tonic % 12); if (root < 53) root += 12;
    const triad = song.minor ? [root, root + 3, root + 7] : [root, root + 4, root + 7];
    const firsts = song.parts.map((p, i) => { const n = p.measures.flatMap(m => m.notes).find(x => !x.rest); return n ? { name: p.name, m: n.midi + E.INSTR[p.instrument].transpose + (i === song.partIndex ? (st.shift || 0) : 0) } : null; }).filter(Boolean);
    host.innerHTML = `<button data-chord="${triad.map(m => m + (st.shift || 0)).join(',')}"><b>主和弦</b><span>${E.keyLabel(song.fifths, song.minor).split('（')[0]}</span></button>` + firsts.map(x => `<button data-m="${x.m}"><b>${esc(x.name)}</b><span>起音 ${E.midiName(x.m)}</span></button>`).join('');
  }
  else host.innerHTML = `<button data-m="69"><b>A</b><span class="num">${settings.A} Hz</span></button><button data-m="72"><b>C</b><span>Do</span></button><button data-m="79"><b>G</b><span>Sol</span></button><button data-m="84"><b>C</b><span>高音 Do</span></button>`;
  $$('#tStrings button').forEach(b => b.onclick = async () => {
    const ctx = await ac(); const out = ctx.createGain(); out.gain.value = settings.demoVol; out.connect(AU.master);
    if (b.dataset.chord) b.dataset.chord.split(',').forEach((m, i) => tone(ctx, out, +m, ctx.currentTime + 0.05 + i * 0.35, 3 - i * 0.35, 'piano', 0.4));
    else tone(ctx, out, +b.dataset.m, ctx.currentTime + 0.05, 2.2, TU.mode === 'pipe' ? 'voice' : 'pure', 0.5);
  });
}
function tunerFrame(fr) {
  if (st.view !== 'tuner') return;
  if (!E.isVoiced(fr, settings.gate)) { TU.quiet = (TU.quiet || 0) + 1; if (TU.quiet > 30) TU.hist = []; return; }
  TU.quiet = 0;
  TU.hist.push(fr.f); if (TU.hist.length > 7) TU.hist.shift();
  const f = E.median(TU.hist);
  let target, label, sub = '';
  if (TU.mode === 'violin') {
    let best = null;
    stringsOf().forEach(([n, m]) => { const c = E.cents(f, m, settings.A); if (!best || Math.abs(c) < Math.abs(best.c)) best = { n, m, c }; });
    target = best.m; label = best.n + ' 弦';
    if (Math.abs(best.c) > 150) { sub = '離空弦很遠，請只拉空弦'; }
  } else {
    target = Math.round(E.midiFloat(f, settings.A)); label = E.midiName(target);
    if (st.song && st.song.instrument === 'recorder-s') sub = `高音直笛譜上寫 ${E.midiName(target - 12)}`;
    if (TU.mode === 'pipe') sub = `唱名 ${E.solfege({ midi: target, step: 'C' }, st.song, true)}（首調）`;
  }
  const c = E.cents(f, target, settings.A);
  const cc = Math.max(-50, Math.min(50, c));
  $('#tNeedle').style.transform = `rotate(${cc / 50 * 60}deg)`;
  const col = Math.abs(c) <= 3 ? 'var(--ok)' : Math.abs(c) <= 10 ? 'var(--warn)' : (c > 0 ? 'var(--sharp)' : 'var(--flat)');
  $('#tNeedle').setAttribute('stroke', col);
  $('#tNote').textContent = label; $('#tNote').style.color = col;
  const advice = TU.mode === 'violin' ? (c > 0 ? '太高，放鬆一點' : '太低，轉緊一點') : TU.mode === 'pipe' ? (c > 0 ? '唱高了，放鬆一點' : '唱低了，氣息撐住') : (c > 0 ? '偏高' : '偏低');
  $('#tSub').textContent = `${f.toFixed(1)} Hz　${c > 0 ? '+' : ''}${c.toFixed(1)} cents　${Math.abs(c) <= 3 ? '準了' : advice}${sub ? '　' + sub : ''}`;
  $$('#tStrings button').forEach(b => b.classList.toggle('on', +b.dataset.m === target));
}

/* ================= 即時音高小表 ================= */
let liveRaf;
function liveLoop() {
  const fr = AU.live;
  const lvl = fr ? Math.min(1, fr.rms * 9) : 0;
  $('#micLvl').style.width = (lvl * 100) + '%';
  $('#micLvl').style.background = fr && fr.rms > 0.5 ? 'var(--bad)' : 'var(--ok)';
  if (st.view === 'practice') {
    if (fr && E.isVoiced(fr, settings.gate) && st.song) {
      const tr = trans();
      const mf = E.midiFloat(fr.f, settings.A), m = Math.round(mf), c = (mf - m) * 100;
      $('#liveNote').textContent = E.midiName(m - tr, st.song.fifths < 0);
      $('#livePin').style.left = `calc(${50 + Math.max(-50, Math.min(50, c))}% - 1.5px)`;
      $('#liveCents').textContent = (c > 0 ? '+' : '') + c.toFixed(0) + ' c';
    } else { $('#liveNote').textContent = '—'; $('#liveCents').textContent = '　'; $('#livePin').style.left = 'calc(50% - 1.5px)'; }
  }
  liveRaf = requestAnimationFrame(liveLoop);
}

/* ================= 曲庫 ================= */
function renderLibrary() {
  const pr = store.get('lr.progress', {}), sess = store.get('lr.sessions', {});
  $('#songList').innerHTML = allSongs().filter(s => !s.temp).map(s => {
    const n = (sess[s.id] || []).length, last = n ? sess[s.id][n - 1].score : null;
    let keyTxt = ''; try { keyTxt = typeof s.key === 'string' ? s.key : E.FIFTHS_KEY[s.fifths]; } catch (e) {}
    return `<div class="card song"><div><h3>${esc(s.title)}${s.builtin ? '<span class="tag">範例</span>' : ''}</h3>
      <div class="info">${s.parts && s.parts.length > 1 ? s.parts.length + ' 個聲部' : esc((E.INSTR[s.instrument || (s.parts && s.parts[0].instrument)] || E.INSTR.violin).name)}・${esc(s.time || (s.timeNum + '/' + s.timeDen))}・${(s.measures || s.parts[0].measures).length} 小節${n ? `・練過 ${n} 次・最近 ${last} 分` : ''}</div></div>
      <div class="acts"><button class="btn primary" data-open="${esc(s.id)}">練習</button><button class="btn" data-copy="${esc(s.id)}">複製文字</button>${s.builtin ? '' : `<button class="btn danger" data-del="${esc(s.id)}">刪除</button>`}</div></div>`;
  }).join('');
  $$('[data-open]').forEach(b => b.onclick = () => { loadSong(b.dataset.open); showView('practice'); });
  $$('[data-copy]').forEach(b => b.onclick = async () => {
    const s = allSongs().find(x => x.id === b.dataset.copy);
    let txt; try { txt = JSON.stringify(E.songToJSON(E.normalizeSong(s.measures[0].notes ? s : s))); } catch (e) { txt = JSON.stringify(s); }
    try { await navigator.clipboard.writeText(txt); toast('已複製，可以貼給 Claude 修改或分享'); } catch (e) { $('#pasteIn').value = txt; toast('已放到右邊文字框'); }
  });
  $$('[data-del]').forEach(b => b.onclick = () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '確定刪除？'; setTimeout(() => { b.dataset.armed = ''; b.textContent = '刪除'; }, 3000); return; }
    st.userSongs = st.userSongs.filter(x => x.id !== b.dataset.del); store.set('lr.songs', st.userSongs);
    if (st.song && st.song.id === b.dataset.del) loadSong('demo-twinkle');
    renderLibrary(); toast('已刪除');
  });
}
function addSong(song) {
  const plain = song.source === 'musicxml' ? Object.assign({ id: song.id }, E.songToJSON(song)) : song;
  st.userSongs.push(plain); store.set('lr.songs', st.userSongs);
  renderLibrary(); loadSong(plain.id); showView('practice');
  toast(`已加入「${plain.title}」，請先核對樂譜是否和原譜一樣` + (song.warnings && song.warnings.length ? '。' + song.warnings.join('') : ''), 6000);
}
function importText(text) {
  text = text.trim();
  if (text.startsWith('<')) { const s = E.parseMusicXML(text); addSong(s); return; }
  const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error('找不到樂譜內容（應該是 { 開頭、} 結尾的文字）');
  const obj = JSON.parse(m[0]);
  const s = E.normalizeSong(obj); // 檢查
  obj.id = s.id; obj.instrument = s.instrument;
  addSong(obj);
}
async function importFile(file) {
  try {
    if (/\.mxl$/i.test(file.name)) {
      if (!window.JSZip) throw new Error('解壓縮元件沒有載入，請確認網路連線');
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      let path = null;
      const cont = zip.file('META-INF/container.xml');
      if (cont) { const m = (await cont.async('string')).match(/full-path="([^"]+)"/); if (m) path = m[1]; }
      if (!path) path = Object.keys(zip.files).find(n => /\.(xml|musicxml)$/i.test(n) && !n.startsWith('META-INF'));
      if (!path) throw new Error('壓縮檔裡找不到樂譜');
      addSong(E.parseMusicXML(await zip.file(path).async('string')));
    } else importText(await file.text());
  } catch (e) { toast('匯入失敗：' + e.message, 6000); }
}

/* ================= 設定 ================= */
function renderSettings() {
  const As = [438, 439, 440, 441, 442, 443];
  ['#setA', '#tA'].forEach(s => { $(s).innerHTML = As.map(a => `<option ${a === settings.A ? 'selected' : ''}>${a}</option>`).join(''); });
  $('#setTheme').value = settings.theme || '';
  $('#volDemo').value = settings.demoVol; $('#volClick').value = settings.clickVol;
  $('#setVoice').checked = !!settings.voice; $('#setMascot').checked = settings.mascot !== false; $('#setDs').value = settings.dsTuning || 'just';
  $('#voiceNote').textContent = FUN.canSpeak && FUN.canSpeak() ? '' : '這個瀏覽器不支援語音，請改用 Chrome 或 Edge。';
  $('#gateOut').textContent = `目前門檻 ${settings.gate.toFixed(4)}`;
  $('#calOut').textContent = settings.latency != null ? `已校正：${Math.round(settings.latency * 1000)} 毫秒` : '尚未校正（使用預估值）';
  const rows = Object.entries(E.MODES).map(([k, m]) => {
    const t = tolFor(k);
    const inp = (f, v) => v == null ? '<span class="muted">不判斷</span>' : `<input type="number" min="1" max="500" data-mode="${k}" data-f="${f}" value="${v}">`;
    return `<tr><td>${m.short}</td><td>${inp('pg', t.pg)}</td><td>${inp('py', t.py)}</td><td>${inp('rg', t.rg)}</td><td>${inp('ry', t.ry)}</td></tr>`;
  }).join('');
  $('#tolTable').innerHTML = `<thead><tr><th>模式</th><th>音準綠<br>(cents)</th><th>音準黃<br>(cents)</th><th>起音綠<br>(毫秒)</th><th>起音黃<br>(毫秒)</th></tr></thead><tbody>${rows}</tbody>`;
  $$('#tolTable input').forEach(i => i.onchange = () => {
    const v = Math.max(1, +i.value || 1); settings.tol[i.dataset.mode] = settings.tol[i.dataset.mode] || {};
    settings.tol[i.dataset.mode][i.dataset.f] = v; saveSettings(); toast('已更新標準');
  });
}
async function measureGate() {
  if (!await openMic()) return;
  const vals = []; const fn = fr => vals.push(fr.rms); AU.listeners.add(fn);
  $('#gateOut').textContent = '測量中，請保持安靜…';
  setTimeout(() => {
    AU.listeners.delete(fn);
    vals.sort((a, b) => a - b);
    const p90 = vals[Math.floor(vals.length * 0.9)] || 0.003;
    settings.gate = Math.min(0.05, Math.max(0.004, p90 * 2.5)); saveSettings();
    $('#gateOut').textContent = `完成：門檻 ${settings.gate.toFixed(4)}` + (p90 > 0.015 ? '（環境有點吵，建議換安靜的地方）' : '');
  }, 2000);
}
async function calibrate() {
  if (!await openMic()) return;
  const ctx = await ac(); stopAll();
  const spb = 60 / 90, lead = 2, n = 8, t0 = ctx.currentTime + 0.5 + lead * spb;
  for (let k = -lead; k < n; k++) click(ctx, t0 + k * spb, k === -lead || k === 0, Math.max(0.4, settings.clickVol));
  AU.frames = []; AU.chunks = []; AU.recT0 = null; AU.rec = true;
  $('#calOut').textContent = '跟著拍手…';
  setTimeout(() => {
    AU.rec = false;
    const fr = AU.frames, offs = [];
    for (let k = 0; k < n; k++) {
      const c = t0 + k * spb;
      const pre = E.between(fr, c - 0.32, c - 0.12).map(f => f.rms);
      const baseR = pre.length ? E.median(pre) : 0.001;
      const win = E.between(fr, c - 0.15, c + 0.45);
      const hit = win.find(f => f.rms > Math.max(settings.gate * 1.5, baseR * 3.5));
      if (hit) offs.push(hit.t - c + 0.015);
    }
    if (offs.length >= 5) {
      settings.latency = Math.max(0, Math.min(0.4, E.median(offs))); saveSettings();
      $('#calOut').textContent = `已校正：${Math.round(settings.latency * 1000)} 毫秒（${offs.length}/8 次有效）`;
    } else $('#calOut').textContent = `只聽到 ${offs.length}/8 下，請把麥克風靠近一點再試一次`;
  }, (0.5 + (lead + n) * spb + 0.6) * 1000);
}

/* ================= 介面切換 ================= */
function showView(v) {
  if (st.run && v !== 'practice') stopAll(true);
  st.view = v;
  if (st.view === 'sing' && v !== 'sing' && window.SING) window.SING.stop();
  ['practice', 'basics', 'sing', 'tuner', 'library', 'log', 'settings'].forEach(x => { const el = $('#v-' + x); if (el) el.hidden = x !== v; });
  $$('nav button').forEach(b => { if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (v === 'library') { renderLibrary(); renderAssign(); }
  if (v === 'basics') renderBasics();
  if (v === 'sing' && window.SING) window.SING.render();
  if (v === 'log') renderLog();
  if (v === 'settings') { renderSettings(); listDevices(); renderCalib(); }
  if (v === 'tuner') { renderSettings(); renderStrings(); if (!AU.mic) $('#tSub').textContent = '按右上角「開啟」麥克風，拉一條空弦'; }
  if (v === 'practice') requestAnimationFrame(() => { renderScore(); });
  window.scrollTo({ top: 0 });
}
function renderModes() {
  $$('#modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === st.mode));
  const contest = st.mode === 'contest';
  $('#optGuide').disabled = contest; if (contest) $('#optGuide').checked = false;
  $('#optLoop').disabled = contest; if (contest) $('#optLoop').checked = false;
  $('#optMetro').disabled = st.mode === 'beginner';
  $('#speed').disabled = st.mode === 'beginner';
  $('#rangebar').style.opacity = contest ? 0.55 : 1;
  const bs = $('#btnStage'); if (bs) bs.hidden = !contest;
  if (!st.run) $('#status').textContent = st.mode === 'beginner' ? '按「開始練習」，照著提示一個音一個音拉。' : contest ? '比賽模式：按「開始練習」後聽一小節預備拍，從頭拉到尾。' : '按「開始練習」，先聽一小節預備拍再進來。';
}
function updateSpeedOut() {
  const s = st.song; if (!s) return;
  $('#speedOut').textContent = `${st.speed}%　♩ = ${Math.round(s.tempo * st.speed / 100)}`;
}

/* ================= 事件綁定 ================= */
function bind() {
  $$('nav button').forEach(b => b.onclick = () => showView(b.dataset.view));
  $('#micBtn').onclick = async () => { if (AU.mic) { stopAll(true); closeMic(); } else if (await openMic()) toast('麥克風已開啟，試著拉一個音'); };
  $('#songSelect').onchange = e => loadSong(e.target.value);
  $$('#modes button').forEach(b => b.onclick = () => { st.mode = b.dataset.mode; settings.mode = st.mode; saveSettings(); st.coach = null; renderModes(); renderReport(); });
  $('#btnStart').onclick = () => { if (st.coach) st.coach.paused = false; st.mode === 'beginner' ? startWait() : startTimed(); };
  $('#btnDemo').onclick = () => playDemo();
  $('#btnStop').onclick = () => { stopAll(true); };
  $('#btnHint').onclick = hintTone;
  $('#speed').oninput = e => { st.speed = +e.target.value; updateSpeedOut(); };
  // 顯示列：點記號看說明、譜下文字、移調、背譜、節拍器打法、持續主音
  $('#btnExplain').onclick = () => {
    st.explain = !st.explain; $('#btnExplain').setAttribute('aria-pressed', st.explain); $('#explainBox').hidden = true; drawOverlay();
    if (st.explain) FUN.talk('點樂譜上的任何記號，小琴就告訴你它是什麼意思！', 'happy', 'bounce', { ms: 4000 });
  };
  $('#exClose').onclick = () => { $('#explainBox').hidden = true; FUN.stopSpeak && FUN.stopSpeak(); };
  $('#lyricMode').value = settings.lyricMode || 'auto';
  $('#lyricMode').onchange = e => { settings.lyricMode = e.target.value; saveSettings(); renderScore(); };
  const setShift = d => { st.shift = Math.max(-12, Math.min(12, (st.shift || 0) + d)); $('#shiftOut').textContent = (st.shift > 0 ? '+' : '') + st.shift; (settings.shiftBy = settings.shiftBy || {})[st.song.id] = st.shift; saveSettings(); renderSongHead(); };
  $('#shiftDown').onclick = () => setShift(-1); $('#shiftUp').onclick = () => setShift(1);
  $('#memoSel').value = String(settings.memo || 0);
  $('#memoSel').onchange = e => { settings.memo = +e.target.value; saveSettings(); drawOverlay(); };
  $('#metroMode').value = settings.metroMode || 'all';
  $('#metroMode').onchange = e => { settings.metroMode = e.target.value; saveSettings(); };
  $('#optDrone').checked = !!settings.drone;
  $('#optDrone').onchange = e => { settings.drone = e.target.checked; saveSettings(); if (e.target.checked) toast(`持續主音：${droneNotes().map(m => E.midiName(m)).join('＋')}，用耳朵比對每個音`); };
  $('#btnExtend').onclick = () => { if (!st.sel) { toast('先點一個小節當起點'); return; } st.extend = !st.extend; renderRange(); };
  $('#btnAll').onclick = () => { st.sel = null; renderRange(); drawOverlay(); renderReport(); };
  $('#fileIn').onchange = async e => { const fs = [...e.target.files]; for (const f of fs) await importFile(f); e.target.value = ''; };
  $('#btnPaste').onclick = () => { try { importText($('#pasteIn').value); $('#pasteIn').value = ''; $('#pasteMsg').textContent = ''; } catch (e) { $('#pasteMsg').textContent = '無法加入：' + e.message; } };
  $('#logSong').onchange = e => { e.target.dataset.v = e.target.value; renderLog(); };
  $$('#tunerMode button').forEach(b => b.onclick = () => { TU.mode = b.dataset.tm; TU.hist = []; $$('#tunerMode button').forEach(x => x.setAttribute('aria-pressed', x === b)); renderStrings(); });
  const setA = v => { settings.A = +v; saveSettings(); renderSettings(); renderStrings(); };
  $('#setA').onchange = e => setA(e.target.value); $('#tA').onchange = e => setA(e.target.value);
  $('#setTheme').onchange = e => { settings.theme = e.target.value; saveSettings(); applyTheme(); };
  $('#volDemo').oninput = e => { settings.demoVol = +e.target.value; saveSettings(); };
  $('#volClick').oninput = e => { settings.clickVol = +e.target.value; saveSettings(); };
  $('#devSel').onchange = async e => { settings.deviceId = e.target.value; saveSettings(); if (AU.mic) { closeMic(); await openMic(); } };
  $('#btnGate').onclick = measureGate; $('#btnCal').onclick = calibrate;
  $('#btnTolReset').onclick = () => { settings.tol = {}; saveSettings(); renderSettings(); toast('已恢復預設標準'); };
  $('#btnBackup').onclick = async () => {
    const data = JSON.stringify({ v: 1, songs: st.userSongs, sessions: store.get('lr.sessions', {}), progress: store.get('lr.progress', {}), settings });
    try { await navigator.clipboard.writeText(data); toast('備份文字已複製，貼到記事本存起來'); } catch (e) { const b = $('#backupBox'); b.hidden = false; b.value = data; b.select(); toast('請手動複製下面的文字'); }
  };
  $('#btnRestore').onclick = () => {
    const b = $('#backupBox');
    if (b.hidden || !b.value.trim()) { b.hidden = false; b.value = ''; b.focus(); toast('把備份文字貼進框框，再按一次「從備份還原」'); return; }
    try {
      const d = JSON.parse(b.value);
      if (d.songs) { st.userSongs = d.songs; store.set('lr.songs', d.songs); }
      if (d.sessions) store.set('lr.sessions', d.sessions);
      if (d.progress) store.set('lr.progress', d.progress);
      b.value = ''; b.hidden = true; toast('還原完成'); loadSong(settings.lastSong);
    } catch (e) { toast('備份文字格式不對'); }
  };
  $('#btnWipe').onclick = e => {
    const b = e.currentTarget;
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '再按一次確定清除（無法復原）'; setTimeout(() => { b.dataset.armed = ''; b.textContent = '清除所有練習紀錄'; }, 4000); return; }
    store.set('lr.sessions', {}); store.set('lr.progress', {}); st.mLevels = {}; drawOverlay(); toast('紀錄已清除');
    b.dataset.armed = ''; b.textContent = '清除所有練習紀錄';
  };
  document.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select')) return;
    if (e.code === 'Space' && st.view === 'practice') { e.preventDefault(); if (st.run) stopAll(true); else $('#btnStart').click(); }
    if (e.key === 'Escape' && st.run) stopAll(true);
  });
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (st.view === 'practice' && !st.run) renderScore(); }, 200); });
  AU.listeners.add(tunerFrame);
  // 模擬上台、網址匯入、週報、設定
  $('#btnStage').onclick = () => startStage();
  $('#stageCancel').onclick = () => { st.stage = null; $('#stage').hidden = true; };
  $('#btnUrl').onclick = () => importUrl($('#urlIn').value);
  $('#btnWeek').onclick = downloadReport;
  bindDrop();
  $('#setRecSys').value = settings.recSys || 'german';
  $('#setRecSys').onchange = e => { settings.recSys = e.target.value; saveSettings(); };
  $('#setInton').value = settings.intonation || 'equal';
  $('#setInton').onchange = e => { settings.intonation = e.target.value; saveSettings(); };
  $('#setBreak').value = settings.breakMin || 20;
  $('#setBreak').onchange = e => { settings.breakMin = Math.max(5, +e.target.value || 20); saveSettings(); };
  $('#setStageLimit').value = settings.stageLimit || '';
  $('#setStageLimit').onchange = e => { settings.stageLimit = +e.target.value || 0; saveSettings(); };
  $('#setStageMemo').checked = !!settings.stageMemo;
  $('#setStageMemo').onchange = e => { settings.stageMemo = e.target.checked; saveSettings(); };
  // 小琴與語音
  const renderVoiceBtn = () => { const b = $('#voiceBtn'); b.setAttribute('aria-pressed', settings.voice); b.querySelector('span').textContent = settings.voice ? '語音開' : '語音關'; };
  $('#voiceBtn').onclick = () => { settings.voice = !settings.voice; saveSettings(); renderVoiceBtn(); renderSettings(); if (settings.voice) FUN.talk('語音小幫手打開了！', 'cheer', 'bounce'); else FUN.stopSpeak && FUN.stopSpeak(); };
  renderVoiceBtn();
  $$('.speak').forEach(b => b.onclick = () => FUN.talk(FUN.GUIDE[b.dataset.guide] || '', 'happy', 'bounce', { ms: 12000 }));
  FUN.onMascotClick = () => FUN.talk(FUN.GUIDE[st.view] || FUN.GUIDE.practice, 'happy', 'bounce', { ms: 12000 });
  $('#setVoice').onchange = e => { settings.voice = e.target.checked; saveSettings(); renderVoiceBtn(); };
  $('#setMascot').onchange = e => { settings.mascot = e.target.checked; saveSettings(); FUN.setMascot(settings.mascot); };
  $('#setDs').onchange = e => { settings.dsTuning = e.target.value; saveSettings(); if (st.song) renderSongHead(); };
}

/* ================= 節奏變化練習（快速段落用附點節奏練） ================= */
function rhythmVariantOK() {
  if (!st.song || !st.sel || st.song.basicsVariant) return false;
  const [a, b] = st.sel;
  return st.song.measures.slice(a, b + 1).some(m => m.notes.filter(n => !n.rest && (n.type === '8' || n.type === '16') && !n.dots).length >= 4);
}
function startVariant() {
  const song = st.song, [a, b] = st.sel;
  const ACCS = { 2: '##', 1: '#', 0: '', '-1': 'b', '-2': 'bb' };
  const tok = (n, type, dots) => (n.rest ? 'R' : [n].concat(n.chord || []).map(p => p.step + ACCS[p.alter] + p.octave).join('+')) + ':' + type + '.'.repeat(dots);
  const build = kind => song.measures.slice(a, b + 1).map(m => {
    const out = []; const ns = m.notes;
    for (let i = 0; i < ns.length; i++) {
      const n = ns[i], nx = ns[i + 1];
      const pair = nx && !n.rest && !nx.rest && n.type === nx.type && (n.type === '8' || n.type === '16') && !n.dots && !nx.dots && !n.triplet;
      if (pair) {
        const half = n.type === '8' ? '16' : '32';
        if (kind === 'long') out.push(tok(n, n.type, 1), tok(nx, half, 0)); else out.push(tok(n, half, 0), tok(nx, n.type, 1));
        i++;
      } else out.push(tok(n, n.type, n.dots));
    }
    return out.join(' ');
  });
  const mk = (kind, label) => ({ id: 'v-' + kind + '-' + song.id + '-' + a + '-' + b, title: `${song.title}（第 ${a + 1}${a !== b ? '–' + (b + 1) : ''} 小節・${label}）`, composer: '節奏變化練習', instrument: song.instrument, tempo: Math.round(song.tempo * 0.8), time: song.measures[a].ts.join('/'), key: E.FIFTHS_KEY[song.measures[a].fifths] + (song.measures[a].minor ? 'm' : ''), measures: build(kind), notes: '把兩個一樣長的快音改成「長—短」或「短—長」來練，手指會更穩。兩種都綠燈後，回原曲試試看。', temp: true, basicsVariant: true });
  st.tempSongs = (st.tempSongs || []).filter(x => !x.id.includes(song.id + '-' + a + '-' + b)).concat([mk('long', '長短節奏'), mk('short', '短長節奏')]);
  st.returnTo = song.id;
  loadSong(st.tempSongs[st.tempSongs.length - 2].id);
  toast('已建立兩種節奏變化（長短、短長），在「換一首」可以切換，練完按「回原曲」');
}

/* ================= 老師覆核與評分校正 ================= */
function reviewMeasure(i) {
  const cyc = { g: 'y', y: 'r', r: 'g' };
  st.teacherLv = st.teacherLv || {};
  const cur = st.teacherLv[i] || st.mLevels[i] || 'g';
  const next = cyc[cur]; st.teacherLv[i] = next;
  // 收集這一小節系統量到的數字，和老師的判斷配對
  const evs = st.events.filter(e => e.mi === i && st.results[e.idx]);
  if (!evs.length) { toast('這一小節還沒有評分資料'); return; }
  const last = evs.reduce((m, e) => Math.max(m, e.pk), -1);
  const mine = evs.filter(e => e.pk === last);
  const maxC = Math.max(0, ...mine.map(e => { const p = st.results[e.idx].p; return p && p.cents != null && !['wrong', 'missing', 'chordmiss'].includes(p.status) ? Math.abs(p.judged != null ? p.judged : p.cents) : 0; }));
  const maxT = Math.max(0, ...mine.map(e => { const r = st.results[e.idx].r; return r && r.dt != null ? Math.abs(r.dt * 1000) : 0; }));
  const wrong = mine.some(e => { const p = st.results[e.idx].p; return p && ['wrong', 'missing', 'chordmiss'].includes(p.status); });
  const all = store.get('lr.calib', []);
  const key = st.song.id + ':' + i + ':' + (st.lastSum && st.lastSum.at || '');
  const rec = { key, mode: st.lastSum ? st.lastSum.mode : st.mode, vocal: !!inst().vocal, sys: st.mLevels[i], teacher: next, maxC: Math.round(maxC), maxT: Math.round(maxT), wrong };
  const k = all.findIndex(x => x.key === key); if (k >= 0) all[k] = rec; else all.push(rec);
  store.set('lr.calib', all.slice(-500));
  st.mLevels[i] = next; setLamp(i);
  toast(`第 ${i + 1} 小節：老師判定 ${({ g: '綠', y: '黃', r: '紅' })[next]}燈（已記錄 ${all.length} 筆）`);
}
/* 依老師的判斷，找出最吻合的容許度 */
function calibSuggest(mode, vocal) {
  const D = store.get('lr.calib', []).filter(x => x.mode === mode && !!x.vocal === !!vocal && !x.wrong);
  if (D.length < 10) return { n: D.length };
  const lvl = (c, t, pg, py, rg, ry) => { const a = c <= pg && (rg == null || t <= rg) ? 'g' : c <= py && (ry == null || t <= ry) ? 'y' : 'r'; return a; };
  let best = null;
  const base = tolFor(mode);
  for (let pg = 5; pg <= 40; pg += 1) for (let py = pg + 5; py <= 80; py += 5) {
    const tryR = base.rg == null ? [[null, null]] : [[base.rg, base.ry], [base.rg * 0.75, base.ry * 0.75], [base.rg * 1.25, base.ry * 1.25], [base.rg * 1.5, base.ry * 1.5]];
    tryR.forEach(([rg, ry]) => {
      const agree = D.filter(x => lvl(x.maxC, x.maxT, pg, py, rg, ry) === x.teacher).length;
      if (!best || agree > best.agree) best = { pg, py, rg: rg && Math.round(rg), ry: ry && Math.round(ry), agree };
    });
  }
  const now = D.filter(x => lvl(x.maxC, x.maxT, base.pg, base.py, base.rg, base.ry) === x.teacher).length;
  return { n: D.length, best, nowAgree: now };
}
function renderCalib() {
  const host = $('#calibBox'); if (!host) return;
  const rows = Object.keys(E.MODES).flatMap(m => [false, true].map(v => ({ m, v, r: calibSuggest(m, v) }))).filter(x => x.r.n > 0);
  host.innerHTML = rows.length ? rows.map(({ m, v, r }) => r.best
    ? `<div class="field"><b>${E.MODES[m].short}${v ? '（人聲）' : ''}</b>　${r.n} 筆，目前吻合 ${Math.round(r.nowAgree / r.n * 100)}%；建議 音準綠 ±${r.best.pg}、黃 ±${r.best.py}${r.best.rg ? `、起音綠 ±${r.best.rg}、黃 ±${r.best.ry} 毫秒` : ''}，可吻合 ${Math.round(r.best.agree / r.n * 100)}%　<button class="btn sm" data-cal="${m}|${v ? 1 : 0}">套用</button></div>`
    : `<div class="field"><b>${E.MODES[m].short}${v ? '（人聲）' : ''}</b>　已有 ${r.n} 筆，再覆核 ${10 - r.n} 個小節就能算建議值。</div>`).join('')
    : '<p class="muted">還沒有覆核資料。在練習報告按「老師覆核燈號」，依老師的聽感點小節修正燈號。</p>';
  host.querySelectorAll('[data-cal]').forEach(b => b.onclick = () => {
    const [m, v] = b.dataset.cal.split('|'); const r = calibSuggest(m, v === '1');
    const k = (v === '1' ? 'v-' : '') + m; settings.tol[k] = Object.assign({}, settings.tol[k], { pg: r.best.pg, py: r.best.py }, r.best.rg ? { rg: r.best.rg, ry: r.best.ry } : {});
    saveSettings(); renderSettings(); toast('已套用老師校正後的標準');
  });
}

/* ================= 隔天複習 ================= */
function reviewList() {
  const pr = (store.get('lr.progress', {})[st.song.id] || {}).hist || {};
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  Object.entries(pr).forEach(([m, h]) => {
    const had = h.some(([d, l]) => l === 'r' && d < today);
    const doneToday = h.some(([d, l]) => d === today && l === 'g');
    const lastDay = h.length ? h[h.length - 1][0] : today;
    if (had && !doneToday && lastDay < today) out.push(+m);
  });
  return out.sort((a, b) => a - b).slice(0, 4);
}

/* ================= 音量（力度）與音色（僅供參考） ================= */
const DYN_LV = { ppp: 1, pp: 2, p: 3, mp: 4, mf: 5, f: 6, ff: 7, fff: 8 };
function analyzeDynamics(R) {
  const notes = [];
  if (!AU.frames.length) return [];
  let mark = null;
  const tone = [];
  R.evs.forEach(ev => {
    if (ev.note.dyn && DYN_LV[ev.note.dyn]) mark = ev.note.dyn;
    if (ev.midi == null) return;
    const s = R.tm.t(ev.start) + R.lat, d = R.tm.t(ev.start + ev.dur) - R.tm.t(ev.start);
    const fr = E.between(AU.frames, s + Math.min(0.08, d * 0.25), s + d * 0.85).filter(f => f.rms > settings.gate);
    if (fr.length < 3) return;
    const db = 20 * Math.log10(E.median(fr.map(f => f.rms)));
    notes.push({ ev, db, mark, wedge: ev.note.wedge, wedgeEnd: ev.note.wedgeEnd });
    // 音色：大聲但週期性差（沙沙聲、壓弦太重）
    if (!inst().vocal && inst().synth === 'violin' && d >= 0.3) {
      const loud = fr.filter(f => f.rms > settings.gate * 4);
      if (loud.length >= 5 && loud.filter(f => f.c < 0.78).length / loud.length > 0.45) tone.push(ev.mi);
    }
  });
  const out = [];
  // 力度記號：相鄰兩段標記不同時，音量要跟著變
  const secs = []; notes.forEach(n => { const last = secs[secs.length - 1]; if (!last || last.mark !== n.mark) secs.push({ mark: n.mark, dbs: [n.db], mi: n.ev.mi }); else last.dbs.push(n.db); });
  for (let i = 1; i < secs.length; i++) {
    const A = secs[i - 1], B = secs[i]; if (!A.mark || !B.mark) continue;
    const want = DYN_LV[B.mark] - DYN_LV[A.mark]; if (Math.abs(want) < 2) continue;
    const got = E.median(B.dbs) - E.median(A.dbs);
    if (want > 0 && got < 3) out.push(`第 ${B.mi + 1} 小節標 ${B.mark}，比前面 ${A.mark} 應該大聲，但只差 ${got.toFixed(1)} dB；弓速快一點、多用點重量。`);
    if (want < 0 && got > -3) out.push(`第 ${B.mi + 1} 小節標 ${B.mark}，比前面 ${A.mark} 應該小聲，但只差 ${(-got).toFixed(1)} dB；弓速慢一點、靠指板一點。`);
  }
  // 漸強、漸弱
  let w = null;
  notes.forEach(n => {
    if (n.wedge) w = n;
    else if (w && (n.wedgeEnd || n.ev.note.dyn)) {
      const diff = n.db - w.db;
      if (w.wedge === 'cresc' && diff < 2) out.push(`第 ${w.ev.mi + 1} 小節的漸強沒有變大聲（前後只差 ${diff.toFixed(1)} dB）。`);
      if (w.wedge === 'dim' && diff > -2) out.push(`第 ${w.ev.mi + 1} 小節的漸弱沒有變小聲（前後只差 ${(-diff).toFixed(1)} dB）。`);
      w = null;
    }
  });
  [...new Set(tone)].slice(0, 3).forEach(m => out.push(`第 ${m + 1} 小節的聲音有沙沙聲，可能弓壓太重或弓速太慢（請老師確認運弓）。`));
  return out;
}

/* ================= 基本功 ================= */
function basicsProg() { return store.get('lr.basics', {}); }
function recordBasics(sum) {
  const id = st.song.id; if (!id.startsWith('b-')) return;
  const P = basicsProg(), it = P[id] = P[id] || { best: 0, tries: 0 };
  it.tries++; it.best = Math.max(it.best, sum.score); it.last = sum.score; it.at = Date.now();
  const goal = (allSongs().find(x => x.id === id) || {}).goal || { mode: 'advanced', speed: 100 };
  const ok = !sum.partial && sum.counts.r === 0 && sum.counts.y === 0 && sum.mode === goal.mode || (goal.mode === 'advanced' && sum.mode === 'contest' && sum.counts.r === 0 && sum.counts.y === 0);
  if (ok && (sum.speed == null || sum.speed >= (goal.speed || 100))) {
    if (!it.passed) { it.passed = Date.now(); setTimeout(() => { FUN.confetti && FUN.confetti(140); FUN.talk(`「${st.song.title}」過關了！基本功又長大一點！`, 'cheer', 'jump'); FUN.addStars && FUN.addStars(5); }, 800); }
  }
  const day = new Date().toISOString().slice(0, 10);
  (P._days = P._days || {})[day] = (P._days[day] || 0) + 1;
  store.set('lr.basics', P);
}
function renderBasics() {
  const host = $('#v-basics'); if (!host) return;
  const curInst = st.song ? st.song.instrument : 'violin';
  const bi = settings.basicsInst || (E.isVocal(curInst) ? 'voice' : /recorder/.test(curInst) ? 'recorder-s' : ['viola', 'cello'].includes(curInst) ? curInst : 'violin');
  const P = basicsProg(), L = window.BASICS.levels(bi);
  const day = new Date().toISOString().slice(0, 10), todayN = (P._days || {})[day] || 0;
  const streak = (() => { let n = 0; const d = new Date(); for (;;) { const k = d.toISOString().slice(0, 10); if ((P._days || {})[k]) { n++; d.setDate(d.getDate() - 1); } else break; } return n; })();
  const all = L.flatMap(l => l.items), passed = all.filter(x => (P['b-' + x.id] || {}).passed).length;
  host.innerHTML = `<div class="songhead"><div><div class="eyebrow">基本功</div><h1>每天先練基本功</h1>
      <p class="muted" style="max-width:62ch">空弦、音階、琶音是每一首曲子的基礎。每一項在進階模式拉到<b>全部綠燈</b>（第 5 級要比賽模式）就過關。練習的順序和速度，請以老師的安排為主。</p></div>
      <label class="mini-field">樂器 <select id="bInst">${[['violin', '小提琴'], ['viola', '中提琴'], ['cello', '大提琴'], ['recorder-s', '直笛'], ['voice', '人聲（合唱）']].map(([v, n]) => `<option value="${v}" ${v === bi ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    <div class="kpis"><div class="card kpi"><div class="v num">${passed}/${all.length}</div><div class="l">已過關的基本功</div></div>
      <div class="card kpi"><div class="v num">${todayN}</div><div class="l">今天練了幾次</div></div>
      <div class="card kpi"><div class="v num">${streak}</div><div class="l">連續練習天數</div></div>
      <div class="card kpi"><div class="v">${todayN >= 3 ? '完成' : '還差 ' + (3 - todayN) + ' 次'}</div><div class="l">今日目標：基本功 3 次</div></div></div>
    ${L.map(l => `<div class="card panel basics-lv"><h3>${esc(l.name)}</h3><div class="b-items">${l.items.map(x => {
      const p = P['b-' + x.id] || {};
      return `<div class="b-item ${p.passed ? 'pass' : ''}"><div><b>${esc(x.name)}</b><div class="muted" style="font-size:13px">${p.passed ? '已過關 ★' : p.tries ? `最佳 ${p.best} 分・練了 ${p.tries} 次` : '還沒練'}・目標：${E.MODES[x.goal.mode].short}模式全綠</div></div><button class="btn ${p.passed ? '' : 'primary'}" data-bid="${x.id}">${p.passed ? '再練' : '練習'}</button></div>`;
    }).join('')}</div></div>`).join('')}`;
  $('#bInst').onchange = e => { settings.basicsInst = e.target.value; saveSettings(); renderBasics(); };
  host.querySelectorAll('[data-bid]').forEach(b => b.onclick = () => {
    const item = all.find(x => x.id === b.dataset.bid); const song = item.make();
    song.id = 'b-' + item.id; song.temp = true; song.goal = item.goal;
    st.tempSongs = (st.tempSongs || []).filter(x => x.id !== song.id).concat([song]);
    loadSong(song.id); st.song.goal = item.goal;
    st.mode = item.goal.mode; settings.mode = st.mode; renderModes(); st.speed = 100; $('#speed').value = 100; updateSpeedOut();
    showView('practice');
    FUN.talk(`基本功「${item.name}」，${E.MODES[item.goal.mode].short}模式全部綠燈就過關！`, 'happy', 'bounce', { ms: 4000 });
  });
}

/* ================= 模擬上台（比賽模式） ================= */
async function startStage() {
  if (!await openMic()) return;
  const steps = [
    ['走上台，站好，深呼吸。', 2500], ['向評審鞠躬。', 2500],
    [inst().vocal ? '聽起音器的音，在心裡唱一次第一個音。' : '輕輕拉一下 A 弦，確認音準。', 4000],
    ['準備好了。聽完預備拍就開始，中間不能停喔！', 2500]
  ];
  st.stage = { startedAt: Date.now(), limit: (settings.stageLimit || 0) * 60 };
  const ov = $('#stage'); ov.hidden = false;
  for (const [t, ms] of steps) { ov.querySelector('p').textContent = t; FUN.say(t); await new Promise(r => setTimeout(r, ms)); if (!st.stage) return; }
  if (inst().vocal) { const ctx = await ac(); const n = st.events.find(e => e.midi != null); if (n) { const out = ctx.createGain(); out.gain.value = settings.demoVol; out.connect(AU.master); tone(ctx, out, n.midi + trans(), ctx.currentTime + 0.05, 1.5, 'voice', 0.5); } }
  ov.hidden = true;
  st.mode = 'contest'; renderModes();
  if (settings.memo == null || settings.memo < 3) { st._memoBefore = settings.memo || 0; settings.memo = settings.stageMemo ? 3 : (settings.memo || 0); drawOverlay(); }
  startTimed();
}
function stageEnd(sum) {
  if (!st.stage) return;
  const secs = (Date.now() - st.stage.startedAt) / 1000, lim = st.stage.limit;
  st.stage = null;
  if (st._memoBefore != null) { settings.memo = st._memoBefore; st._memoBefore = null; drawOverlay(); }
  const msg = lim && secs > lim ? `演奏時間 ${Math.floor(secs / 60)} 分 ${Math.round(secs % 60)} 秒，超過比賽限制 ${lim / 60} 分鐘！` : `模擬上台完成，總時間 ${Math.floor(secs / 60)} 分 ${Math.round(secs % 60)} 秒。`;
  toast(msg, 6000); FUN.say(msg + '記得最後再鞠躬一次喔！', { interrupt: false });
}

/* ================= 老師指定作業 ================= */
function assignList() { return store.get('lr.assign', []); }
function assignDone(a) {
  const S = (store.get('lr.sessions', {})[a.song] || []).filter(s => s.at >= a.from && s.mode === a.mode && (!a.speed || (s.speed || 0) >= a.speed) && (!a.range || (s.range && s.range[0] <= a.range[0] && s.range[1] >= a.range[1])));
  const good = S.filter(s => s.counts.r === 0 && (a.goal === 'green' ? s.counts.y === 0 : true));
  let run = 0, best = 0; S.forEach(s => { if (good.includes(s)) { run++; best = Math.max(best, run); } else run = 0; });
  return { tries: S.length, streak: best, done: best >= (a.times || 1) };
}
function renderAssign() {
  const host = $('#assignBox'); if (!host) return;
  const L = assignList();
  host.innerHTML = `${L.length ? L.map((a, i) => { const d = assignDone(a); const s = allSongs().find(x => x.id === a.song); return `<div class="b-item ${d.done ? 'pass' : ''}"><div><b>${esc(s ? s.title : '（找不到曲子）')}</b>${a.range ? ` 第 ${a.range[0] + 1}–${a.range[1] + 1} 小節` : ''}<div class="muted" style="font-size:13px">${E.MODES[a.mode].short}模式${a.speed ? '・速度 ' + a.speed + '%' : ''}・${a.goal === 'green' ? '全部綠燈' : '沒有紅燈'}連續 ${a.times} 次${a.due ? '・' + a.due + ' 前' : ''}${a.note ? '・' + esc(a.note) : ''}<br>${d.done ? '已完成 ★' : `目前連續 ${d.streak}/${a.times} 次・練了 ${d.tries} 次`}</div></div><div class="acts"><button class="btn sm primary" data-ago="${i}">去練</button><button class="btn sm" data-adel="${i}">移除</button></div></div>`; }).join('') : '<p class="muted">目前沒有老師指定的作業。</p>'}
    <details><summary>老師：建立作業</summary>
      <div class="field"><label>曲子 <select id="asSong">${allSongs().filter(s => !s.temp).map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('')}</select></label>
      <label>小節 <input id="asFrom" type="number" min="1" value="1" style="width:60px">–<input id="asTo" type="number" min="1" placeholder="全曲" style="width:60px"></label></div>
      <div class="field"><label>模式 <select id="asMode"><option value="beginner">初學</option><option value="advanced" selected>進階</option><option value="contest">比賽</option></select></label>
      <label>速度 <input id="asSpeed" type="number" min="40" max="120" value="100" style="width:64px">%</label>
      <label>目標 <select id="asGoal"><option value="green">全部綠燈</option><option value="nored">沒有紅燈</option></select></label>
      <label>連續 <input id="asTimes" type="number" min="1" max="10" value="3" style="width:50px"> 次</label></div>
      <div class="field"><label>期限 <input id="asDue" type="date"></label><input id="asNote" placeholder="給孩子的話（選填）" maxlength="40" style="flex:1"></div>
      <div class="field"><button class="btn primary" id="asMake">產生作業代碼</button></div>
      <textarea id="asCode" readonly hidden></textarea>
      <p class="ens-note">把作業代碼傳給學生（可用 LINE），學生貼到下面的框框加入。曲子是自己匯入的，也要把曲子的文字一起傳。</p>
    </details>
    <div class="field"><input id="asImport" placeholder="貼上老師給的作業代碼" style="flex:1"><button class="btn" id="asAdd">加入作業</button></div>`;
  host.querySelectorAll('[data-ago]').forEach(b => b.onclick = () => { const a = L[+b.dataset.ago]; loadSong(a.song); st.mode = a.mode; renderModes(); if (a.range) { st.sel = a.range.slice(); renderRange(); drawOverlay(); } if (a.speed) { st.speed = a.speed; $('#speed').value = a.speed; updateSpeedOut(); } showView('practice'); });
  host.querySelectorAll('[data-adel]').forEach(b => b.onclick = () => { const L2 = assignList(); L2.splice(+b.dataset.adel, 1); store.set('lr.assign', L2); renderAssign(); });
  $('#asMake').onclick = () => {
    const to = $('#asTo').value ? +$('#asTo').value - 1 : null, from = +$('#asFrom').value - 1;
    const a = { v: 1, song: $('#asSong').value, range: to != null ? [from, Math.max(from, to)] : null, mode: $('#asMode').value, speed: +$('#asSpeed').value || null, goal: $('#asGoal').value, times: +$('#asTimes').value || 1, due: $('#asDue').value || null, note: $('#asNote').value.trim() || null };
    const code = '練琴作業:' + btoa(unescape(encodeURIComponent(JSON.stringify(a))));
    const t = $('#asCode'); t.hidden = false; t.value = code; t.select();
    try { navigator.clipboard.writeText(code); toast('作業代碼已複製'); } catch (e) {}
  };
  $('#asAdd').onclick = () => {
    try {
      const raw = $('#asImport').value.trim().replace(/^練琴作業:/, '');
      const a = JSON.parse(decodeURIComponent(escape(atob(raw)))); a.from = Date.now();
      if (!allSongs().find(s => s.id === a.song)) toast('作業已加入，但這台電腦還沒有這首曲子，請先匯入曲子', 5000);
      const L2 = assignList(); L2.push(a); store.set('lr.assign', L2); renderAssign(); toast('已加入老師的作業');
    } catch (e) { toast('作業代碼不正確'); }
  };
}

/* ================= 練習報告（下載給老師） ================= */
function downloadReport() {
  const all = store.get('lr.sessions', {}), since = Date.now() - 7 * 864e5;
  const rows = [];
  Object.entries(all).forEach(([id, S]) => {
    const s = allSongs().find(x => x.id === id), name = s ? s.title : id;
    const W = S.filter(x => x.at >= since); if (!W.length) return;
    const mins = Math.round(W.reduce((a, x) => a + (x.secs || 0), 0) / 60);
    const mCnt = {}; W.forEach(x => Object.entries(x.levels || {}).forEach(([m, l]) => { if (l !== 'g') mCnt[m] = (mCnt[m] || 0) + (l === 'r' ? 2 : 1); }));
    const worst = Object.entries(mCnt).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m]) => +m + 1);
    rows.push({ name, n: W.length, mins, first: W[0].score, last: W[W.length - 1].score, best: Math.max(...W.map(x => x.score)), worst, pitch: W[W.length - 1].pitchAbs, rhythm: W[W.length - 1].rhythmStd });
  });
  const P = basicsProg(); const passed = Object.entries(P).filter(([k, v]) => k.startsWith('b-') && v.passed && v.passed >= since).length;
  const d = new Date();
  const html = `<!doctype html><meta charset="utf-8"><title>練琴小幫手週報</title><style>body{font:15px/1.7 "Microsoft JhengHei",sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1c211f}h1{font-size:22px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}small{color:#68716c}</style>
<h1>練琴小幫手・一週練習報告</h1><p>${d.toLocaleDateString('zh-TW')} 產生（最近 7 天）。這份報告只記錄音準與節奏的檢查結果，給老師上課時參考。</p>
<table><tr><th>曲子</th><th>次數</th><th>分鐘</th><th>分數（第一次→最近／最佳）</th><th>常錯小節</th><th>最近音準</th><th>最近節奏</th></tr>
${rows.map(r => `<tr><td>${esc(r.name)}</td><td>${r.n}</td><td>${r.mins}</td><td>${r.first} → ${r.last}／${r.best}</td><td>${r.worst.join('、') || '—'}</td><td>${r.pitch == null ? '—' : '±' + r.pitch + ' cents'}</td><td>${r.rhythm == null ? '—' : '±' + r.rhythm + ' 毫秒'}</td></tr>`).join('') || '<tr><td colspan="7">這週還沒有練習紀錄</td></tr>'}</table>
<p>本週新過關的基本功：${passed} 項。星星總數：${settings.stars || 0}。</p><p><small>練琴小幫手　悠樂媽媽 製作・僅供個人與教學非商業使用</small></p>`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = `練琴週報_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.html`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast('已下載練習週報，可以用 LINE 傳給老師');
}

/* ================= 休息提醒 ================= */
const HEALTH = { practiceMs: 0, lastTick: Date.now(), lastBreakTip: 0, lastPosture: Date.now() };
setInterval(() => {
  const now = Date.now(), dt = now - HEALTH.lastTick; HEALTH.lastTick = now;
  if (st.run && ['timed', 'wait', 'gap'].includes(st.run.kind)) HEALTH.practiceMs += dt;
  else if (!st.run) HEALTH.practiceMs = Math.max(0, HEALTH.practiceMs - dt * 0.5);
  const lim = (settings.breakMin || 20) * 60000;
  if (HEALTH.practiceMs > lim && now - HEALTH.lastBreakTip > 5 * 60000) {
    HEALTH.lastBreakTip = now; HEALTH.practiceMs = 0;
    FUN.talk(`已經練了 ${settings.breakMin || 20} 分鐘，休息 5 分鐘：喝水、甩甩手、動動肩膀和脖子！`, 'sleepy', 'wobble', { ms: 9000 });
  } else if (st.run && st.run.kind === 'timed' && now - HEALTH.lastPosture > 8 * 60000) {
    HEALTH.lastPosture = now;
    FUN.bubble && FUN.bubble(['肩膀放鬆，不要聳肩喔～', '琴不要往下掉，下巴輕輕靠著就好。', '站直，兩腳和肩膀一樣寬。', '手腕放鬆，手指像在彈鋼琴一樣圓圓的。'][Math.floor(Math.random() * 4)], 4000);
  }
}, 5000);

/* ================= 從網址匯入、一次拖曳多個檔案 ================= */
async function importUrl(url) {
  url = url.trim(); if (!url) return;
  if (!/^https:\/\//i.test(url)) { toast('請貼 https:// 開頭的網址'); return; }
  const m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
  if (m) url = `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
  try {
    const r = await fetch(url); if (!r.ok) throw new Error('下載失敗（' + r.status + '）');
    const name = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'score.musicxml';
    const blob = await r.blob();
    await importFile(new File([blob], name));
  } catch (e) {
    toast('這個網站不允許直接匯入。請先把 MusicXML 檔下載到電腦，再拖曳進來。', 6000);
  }
}
function bindDrop() {
  const zone = $('#v-library'); if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dropping'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dropping'));
  zone.addEventListener('drop', async e => {
    e.preventDefault(); zone.classList.remove('dropping');
    const files = [...e.dataTransfer.files].filter(f => /\.(json|txt|xml|musicxml|mxl)$/i.test(f.name));
    if (!files.length) { toast('請拖曳 MusicXML（.musicxml、.xml、.mxl）或練琴小幫手文字檔'); return; }
    for (const f of files) await importFile(f);
    if (files.length > 1) toast(`已匯入 ${files.length} 首，請到曲庫核對`, 5000);
  });
}

/* ================= 啟動 ================= */
FUN.init(settings, saveSettings);
applyTheme(); bind(); buildTuner(); renderSettings();
setTimeout(() => FUN.bubble && FUN.bubble(FUN.line('hello') + '（點我可以聽說明）', 6000), 800);
st.mode = E.MODES[settings.mode] ? settings.mode : 'advanced';
renderModes();
loadSong(settings.lastSong);
liveLoop();
if (location.protocol === 'file:' && !navigator.mediaDevices) toast('請用 Chrome 或 Edge 開啟這個檔案', 5000);

window.__lr = { st, AU, settings, setRef, loadSong, refUsable };
window.LR = { st, AU, settings, store, IDB, E, FUN, ac, openMic, latency, click, toast, save: saveSettings, importFile };
if (window.SING) window.SING.init(window.LR);

/* 自我測試：在主控台輸入 selfTest() 會合成一段有錯的演奏並跑完整評分 */
window.selfTest = async function () {
  const song = st.song, sr = 48000, spb = 60 / song.tempo, t0 = 0.6, tr = inst().transpose;
  const total = t0 + song.totalBeats * spb + 0.6, x = new Float32Array(Math.ceil(total * sr));
  const P = { 2: { c: 18 }, 5: { late: 0.12 }, 8: { semi: 1 }, 11: { short: 0.45 } };
  st.events.forEach(e => {
    if (e.midi == null) return; const p = P[e.idx] || {};
    const f = E.freq(e.midi + tr + (p.semi || 0), settings.A) * Math.pow(2, (p.c || 0) / 1200);
    const s = t0 + e.start * spb + (p.late || 0), n = Math.floor(e.dur * spb * (p.short || 0.92) * sr), a = Math.floor(s * sr);
    let ph = 0;
    for (let i = 0; i < n && a + i < x.length; i++) {
      const t = i / sr, env = Math.min(1, t / 0.03) * Math.min(1, (n - i) / sr / 0.02);
      ph += 2 * Math.PI * f * (1 + 0.003 * Math.sin(2 * Math.PI * 5.5 * t)) / sr;
      let v = 0; for (let h = 1; h <= 8; h++) v += Math.sin(h * ph) / h;
      x[a + i] += 0.2 * env * v;
    }
  });
  const frames = E.analyzeBuffer(x, sr);
  const tol = tolFor('contest'); st.results = []; st.mLevels = {};
  st.events.forEach(ev => {
    const prev = st.events[ev.idx - 1];
    st.results[ev.idx] = E.analyzeEvent(ev, frames, { s: t0 + ev.start * spb, d: ev.dur * spb, A: settings.A, transpose: tr, gate: settings.gate, tol, prevMidi: prev ? prev.midi : null, prevD: prev ? prev.dur * spb : null });
    if (st.results[ev.idx].level) st.mLevels[ev.mi] = E.worst(st.mLevels[ev.mi], st.results[ev.idx].level);
  });
  const sum = E.summarize(song, st.events, st.results); sum.mode = 'contest'; sum.speed = 100; sum.range = [0, song.measures.length - 1];
  st.lastSum = sum; renderScore(); renderReport();
  return sum;
};
})();
