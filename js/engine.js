/* 練琴小幫手（© 悠樂媽媽 製作，僅供個人與教學非商業使用） — 評分引擎（純運算，不碰畫面）
 * 1. 樂譜解析：練琴小幫手格式（JSON）與 MusicXML
 * 2. 音高偵測：YIN + 多週期精修（音分精度）
 * 3. 音準引擎：音名、八度、cents 偏差、穩定度
 * 4. 節奏引擎：起音時間、音長、休止符、速度穩定度
 * 5. 整合成小節燈號與文字說明
 */
(function (root) {
'use strict';
const E = {};

/* ---------- 基本樂理 ---------- */
E.STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
E.SOLF = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
E.midiName = (m, preferFlat) => (preferFlat ? FLAT : SHARP)[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
E.toMidi = (step, alter, oct) => 12 * (oct + 1) + E.STEP[step] + alter;
E.freq = (m, A) => A * Math.pow(2, (m - 69) / 12);
E.cents = (f, m, A) => 1200 * Math.log2(f / E.freq(m, A));
E.midiFloat = (f, A) => 69 + 12 * Math.log2(f / A);

E.DUR = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25, '32': 0.125 };
E.DUR_NAME = { w: '全音符', h: '二分音符', q: '四分音符', '8': '八分音符', '16': '十六分音符', '32': '三十二分音符' };
E.KEY = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
  Am: 0, Em: 1, Bm: 2, 'F#m': 3, 'C#m': 4, 'G#m': 5, 'D#m': 6, 'A#m': 7, Dm: -1, Gm: -2, Cm: -3, Fm: -4, Bbm: -5, Ebm: -6, Abm: -7 };
E.FIFTHS_KEY = { '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F', '0': 'C', '1': 'G', '2': 'D', '3': 'A', '4': 'E', '5': 'B', '6': 'F#', '7': 'C#' };
E.keyLabel = (fifths, minor) => {
  const MIN = { '-7': 'Ab', '-6': 'Eb', '-5': 'Bb', '-4': 'F', '-3': 'C', '-2': 'G', '-1': 'D', '0': 'A', '1': 'E', '2': 'B', '3': 'F#', '4': 'C#', '5': 'G#', '6': 'D#', '7': 'A#' };
  const n = minor ? MIN[fifths] : E.FIFTHS_KEY[fifths];
  const zh = n.replace('#', '♯').replace('b', '♭');
  const count = fifths === 0 ? '無升降' : (fifths > 0 ? fifths + ' 個升記號' : (-fifths) + ' 個降記號');
  return `${zh} ${minor ? '小調' : '大調'}（${count}）`;
};

E.INSTR = {
  violin: { name: '小提琴', verb: '拉', transpose: 0, low: 55, high: 100, synth: 'violin' },
  'recorder-s': { name: '高音直笛', verb: '吹', transpose: 12, low: 60, high: 86, synth: 'recorder',
    note: '高音直笛實際聲音比譜面高一個八度，系統已自動換算。' },
  'recorder-a': { name: '中音直笛', verb: '吹', transpose: 0, low: 65, high: 91, synth: 'recorder' },
  viola: { name: '中提琴', verb: '拉', transpose: 0, low: 48, high: 88, synth: 'violin', clef: 'alto', open: [48, 55, 62, 69] },
  cello: { name: '大提琴', verb: '拉', transpose: 0, low: 36, high: 76, synth: 'violin', clef: 'bass', open: [36, 43, 50, 57] },
  piano: { name: '鋼琴', verb: '彈', transpose: 0, low: 21, high: 108, synth: 'piano' },
  'recorder-t': { name: '次中音直笛', verb: '吹', transpose: 0, low: 60, high: 86, synth: 'recorder' },
  'recorder-b': { name: '低音直笛', verb: '吹', transpose: 12, low: 53, high: 79, synth: 'recorder', clef: 'bass', note: '低音直笛譜面寫在低音譜號，實際聲音高一個八度，系統已自動換算。' },
  // 合唱：男高音照慣例寫在高音譜號、實際低八度
  voice: { name: '人聲', verb: '唱', transpose: 0, low: 48, high: 84, synth: 'voice', vocal: true },
  soprano: { name: '女高音', verb: '唱', transpose: 0, low: 60, high: 81, synth: 'voice', vocal: true },
  alto: { name: '女低音', verb: '唱', transpose: 0, low: 55, high: 74, synth: 'voice', vocal: true },
  tenor: { name: '男高音', verb: '唱', transpose: -12, low: 48, high: 69, synth: 'voice', vocal: true, clef: 'treble',
    note: '男高音譜面寫在高音譜號，實際唱低一個八度，系統已自動換算。' },
  bass: { name: '男低音', verb: '唱', transpose: 0, low: 40, high: 62, synth: 'voice', vocal: true, clef: 'bass' }
};
// 人聲的容許度：人聲有自然的滑音與抖音，各模式略寬於弦樂
E.VOICE_TOL = { beginner: { pg: 30, py: 60 }, advanced: { pg: 20, py: 40, rg: 80, ry: 160 }, contest: { pg: 15, py: 30, rg: 60, ry: 120 } };
E.isVocal = inst => !!(E.INSTR[inst] && E.INSTR[inst].vocal);
// 唱名：首調（以主音為 Do）或固定調（C 為 Do）
E.solfege = function (n, song, movable) {
  if (n.rest) return '';
  if (!movable) return E.SOLF[n.step] + (n.alter > 0 ? '♯' : n.alter < 0 ? '♭' : '');
  const majorTonic = ((song.fifths * 7) % 12 + 12) % 12;
  const deg = ((n.midi - majorTonic) % 12 + 12) % 12;
  return ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'][deg];
};
E.INSTR.violin.open = [55, 62, 69, 76];

E.MODES = {
  beginner: { name: '初學模式', short: '初學', wait: true, pg: 25, py: 50, rg: null, ry: null,
    desc: '游標會停在每個音上，等你拉對才往下走，可以慢慢想、隨時停頓。只判斷音準，容許度較寬。' },
  advanced: { name: '進階模式', short: '進階', wait: false, pg: 15, py: 35, rg: 60, ry: 130,
    desc: '跟著節拍器演奏，音準與節奏同時判斷。可以點選小節反覆練習，也可以調慢速度。' },
  contest: { name: '比賽模式', short: '比賽', wait: false, full: true, pg: 10, py: 25, rg: 40, ry: 90,
    desc: '依設定速度從第一小節連續拉到最後，中途不停。採全國賽等級標準：音準 ±10 音分、起音 ±40 毫秒內才算綠燈。' }
};

/* ---------- 小工具 ---------- */
const median = a => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) * (x - m)))); };
E.median = median; E.mean = mean; E.std = std;
const RANK = { g: 0, y: 1, r: 2 };
E.worst = (...ls) => ls.filter(Boolean).reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'g');

/* ---------- 練琴小幫手樂譜格式 ----------
 * { "title":"小星星", "composer":"", "instrument":"violin", "tempo":80, "time":"4/4", "key":"D",
 *   "measures":["D4 D4 A4 A4", "B4 B4 A4:h", ...] }
 * 音符：音名(#,b,##,bb,n)+八度[:時值][.附點][t三連音][~連結線]   休止符：R[:時值]
 * 時值：w 全 / h 二分 / q 四分 / 8 / 16 / 32。省略時值＝沿用同小節前一個（每小節開頭預設四分音符）。
 */
const TOK = /^(R|[A-G](?:##|bb|#|b|n)?-?\d(?:\+[A-G](?:##|bb|#|b|n)?-?\d)*)(?::(w|h|q|8|16|32)(\.{0,2})(t?))?(~?)$/;
const DYN = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'fp', 'sf', 'sfz'];
E.DYN = DYN;
function applyTags(n, tags) {
  tags.split(/[,，]/).map(t => t.trim()).filter(Boolean).forEach(t => {
    const art = { st: 'st', stacc: 'st', '.': 'st', ten: 'ten', '-': 'ten', acc: 'acc', '>': 'acc', marc: 'marc', '^': 'marc', fer: 'fer', tr: 'tr' }[t];
    if (art) { (n.art = n.art || []).push(art); return; }
    if (t === '(') { n.slur = 'start'; return; }
    if (t === ')') { n.slur = 'stop'; return; }
    if (DYN.includes(t)) { n.dyn = t; return; }
    if (t === '<' || t === 'cresc') { n.wedge = 'cresc'; return; }
    if (t === '>>' || t === 'dim') { n.wedge = 'dim'; return; }
    if (t === '!') { n.wedgeEnd = true; return; }
    if (t === 'up' || t === 'V') { n.bow = 'up'; return; }
    if (t === 'dn' || t === 'down') { n.bow = 'down'; return; }
    if (t === 'br' || t === ',') { n.breath = true; return; }
    let m;
    if ((m = t.match(/^f?([0-4])$/))) { n.fing = m[1]; return; }
    if ((m = t.match(/^pos([1-7])$/))) { n.pos = +m[1]; return; }
    if ((m = t.match(/^str([GDAEC])$/i))) { n.str = m[1].toUpperCase(); return; }
    throw new Error(`看不懂的記號「${t}」`);
  });
}
E.parseToken = function (tok, carry) {
  let tags = null;
  const tm = tok.match(/^(.*)\{([^}]*)\}$/);
  if (tm) { tok = tm[1]; tags = tm[2]; }
  const m = tok.match(TOK);
  if (!m) throw new Error(`看不懂的音符「${tok}」`);
  let type = carry.type, dots = carry.dots, trip = carry.trip;
  if (m[2]) { type = m[2]; dots = m[3].length; trip = !!m[4]; carry.type = type; carry.dots = dots; carry.trip = trip; }
  const n = { type, dots, triplet: trip, tieStart: !!m[5] };
  if (m[1] === 'R') n.rest = true;
  else {
    // 雙音寫成 D4+A4；最高音當主音，其餘放在 chord
    const ps = m[1].split('+').map(x => {
      const pm = x.match(/^([A-G])(##|bb|#|b|n)?(-?\d)$/);
      const p = { step: pm[1], alter: { '##': 2, bb: -2, '#': 1, b: -1, n: 0 }[pm[2]] || 0, octave: +pm[3] };
      p.midi = E.toMidi(p.step, p.alter, p.octave);
      return p;
    }).sort((a, b) => b.midi - a.midi);
    Object.assign(n, ps[0]);
    if (ps.length > 1) n.chord = ps.slice(1);
  }
  n.dur = E.DUR[type] * (dots === 1 ? 1.5 : dots === 2 ? 1.75 : 1) * (trip ? 2 / 3 : 1);
  if (tags) applyTags(n, tags);
  return n;
};

/* ---------- 2. 小節記號（反覆、跳躍、速度、拍號、調號） ---------- */
E.parseMeasureToken = function (t, attr) {
  let m;
  if (t === '|:') { attr.repStart = true; return true; }
  if ((m = t.match(/^:\|(?:x(\d))?$/))) { attr.repEnd = +(m[1] || 2); return true; }
  if ((m = t.match(/^\[([1-4](?:,[1-4])*)$/))) { attr.ending = m[1].split(',').map(Number); return true; }
  if ((m = t.match(/^T=(\d{2,3})(?::(.+))?$/))) { attr.tempo = +m[1]; if (m[2]) attr.tempoText = m[2].replace(/_/g, ' '); return true; }
  if (/^rit\.?$|^rall\.?$/i.test(t)) { attr.rit = true; return true; }
  if (/^accel\.?$/i.test(t)) { attr.accel = true; return true; }
  if (/^a_?tempo$/i.test(t)) { attr.atempo = true; return true; }
  if ((m = t.match(/^M=(\d+)\/(\d+)$/))) { attr.time = [+m[1], +m[2]]; return true; }
  if ((m = t.match(/^K=(.+)$/))) { attr.key = keyToFifths(m[1]); return true; }
  const J = { 'D.C.': ['dc', null], 'D.C.al.Fine': ['dc', 'fine'], 'D.C.al.Coda': ['dc', 'coda'], 'D.S.': ['ds', null], 'D.S.al.Fine': ['ds', 'fine'], 'D.S.al.Coda': ['ds', 'coda'] }[t];
  if (J) { attr.jump = J[0]; attr.al = J[1]; return true; }
  if (/^Fine$/i.test(t)) { attr.fine = true; return true; }
  if (/^Segno$/i.test(t)) { attr.segno = true; return true; }
  if (/^To\.?Coda$/i.test(t)) { attr.toCoda = true; return true; }
  if (/^Coda$/i.test(t)) { attr.coda = true; return true; }
  if ((m = t.match(/^text=(.+)$/))) { attr.text = m[1].replace(/_/g, ' '); return true; }
  return false;
};

function keyToFifths(k) {
  if (typeof k === 'number') return { fifths: Math.max(-7, Math.min(7, k)), minor: false };
  const s = String(k || 'C').trim().replace('♯', '#').replace('♭', 'b').replace(/\s*(major|大調)$/i, '');
  let minor = /m$|minor$|小調$/i.test(s);
  const base = s.replace(/\s*(minor|小調)$/i, '').replace(/m$/, '');
  const name = base.charAt(0).toUpperCase() + base.slice(1) + (minor ? 'm' : '');
  if (!(name in E.KEY)) throw new Error(`看不懂的調號「${k}」`);
  return { fifths: E.KEY[name], minor };
}

function attachLyrics(measures, lyrics) {
  if (!Array.isArray(lyrics)) return;
  measures.forEach((m, i) => {
    const words = String(lyrics[i] || '').trim().split(/\s+/).filter(Boolean);
    let k = 0;
    m.notes.forEach(n => { if (!n.rest && !n.tieStop && k < words.length) { const w = words[k++]; if (w !== '_') n.lyric = w; } });
  });
}
E.attachLyrics = attachLyrics;
function parseMeasureList(list, label) {
  if (!Array.isArray(list) || !list.length) throw new Error(`${label}沒有小節（measures）`);
  const measures = list.map((ms, i) => {
    const carry = { type: 'q', dots: 0, trip: false }; // 時值只在同一小節內沿用
    let notes;
    const attr = {};
    if (typeof ms === 'string') {
      const toks = ms.trim().split(/\s+/).filter(Boolean);
      try { notes = toks.filter(t => !E.parseMeasureToken(t, attr)).map(t => E.parseToken(t, carry)); }
      catch (e) { throw new Error(`${label}第 ${i + 1} 小節：${e.message}`); }
      if (!notes.length) throw new Error(`${label}第 ${i + 1} 小節沒有音符`);
    } else if (ms && Array.isArray(ms.notes)) { notes = ms.notes.map(n => Object.assign({}, n, n.chord ? { chord: n.chord.map(c => Object.assign({}, c)) } : {})); Object.assign(attr, ms.attr || {}); }
    else throw new Error(`${label}第 ${i + 1} 小節格式不對`);
    return { notes, attr };
  });
  E.linkTies(measures);
  return measures;
}

/* 一首曲子可以有好幾個聲部（樂團用）；練習時選一個聲部當「我的聲部」，其他聲部當伴奏 */
E.normalizeSong = function (o) {
  if (!o) throw new Error('沒有樂譜內容');
  const [num, den] = String(o.time || '4/4').split('/').map(Number);
  if (!num || !den) throw new Error('拍號格式要像 "4/4"、"3/4"、"6/8"');
  const k = keyToFifths(o.key ?? 0);
  const song = {
    id: o.id || ('u-' + Date.now().toString(36)),
    title: o.title || '未命名樂曲', composer: o.composer || '',
    tempo: +o.tempo || 80, timeNum: num, timeDen: den, fifths: k.fifths, minor: k.minor,
    source: o.source || 'text', notesText: o.notes || '', youtube: o.youtube || ''
  };
  if (Array.isArray(o.parts) && o.parts.length) {
    song.parts = o.parts.map((p, i) => ({
      name: p.name || `第 ${i + 1} 部`, instrument: E.INSTR[p.instrument] ? p.instrument : 'violin', clef: p.clef || null,
      measures: (() => { const ms = parseMeasureList(p.measures, o.parts.length > 1 ? `「${p.name || '第 ' + (i + 1) + ' 部'}」` : ''); attachLyrics(ms, p.lyrics); return ms; })(),
      timeline: p.timeline || null
    }));
  } else {
    const ms0 = parseMeasureList(o.measures, ''); attachLyrics(ms0, o.lyrics);
    song.parts = [{ name: '主旋律', instrument: E.INSTR[o.instrument] ? o.instrument : 'violin', clef: o.clef || null, measures: ms0 }];
  }
  E.selectPart(song, Math.min(+o.part || 0, song.parts.length - 1));
  return song;
};

E.selectPart = function (song, i) {
  const p = song.parts[i];
  song.partIndex = i; song.measures = p.measures; song.instrument = p.instrument;
  song.clef = p.clef || E.INSTR[p.instrument].clef || 'treble';
  return song;
};

E.linkTies = function (measures) {
  let prev = null;
  measures.forEach(m => m.notes.forEach(n => {
    if (n.rest) { prev = null; return; }
    n.tieStop = !!(prev && prev.tieStart && prev.midi === n.midi);
    prev = n;
  }));
};

/* 某個聲部的完整發聲時間表（伴奏用）：[{beat, dur, midis}] */
E.partTimeline = function (song, i) {
  const p = song.parts[i];
  if (p.timeline) {
    if (!song.pm) return p.timeline;
    // MusicXML 的時間表是照紙面順序；依演奏順序（反覆）展開
    const ws = []; let b = 0; song.measures.forEach(m => { ws.push(b); b += m.written != null ? m.written : m.notes.reduce((a, n) => a + n.dur, 0); });
    const out = [];
    song.pm.forEach(P => {
      const w0 = ws[P.mi], w1 = w0 + P.dur;
      p.timeline.forEach(x => { if (x.beat >= w0 - 1e-6 && x.beat < w1 - 1e-6) out.push({ beat: x.beat - w0 + P.start, dur: x.dur, midis: x.midis }); });
    });
    return out;
  }
  const evs = E.buildEvents({ measures: p.measures, timeNum: song.timeNum, timeDen: song.timeDen, fifths: song.fifths, minor: song.minor });
  return evs.filter(e => e.midi != null).map(e => ({ beat: e.start, dur: e.dur, midis: [e.midi].concat((e.note.chord || []).map(c => c.midi)) }));
};

/* 轉回練琴小幫手文字格式（匯出 / 備份用） */
E.songToJSON = function (song) {
  const ACC = { 2: '##', 1: '#', 0: '', '-1': 'b', '-2': 'bb' };
  const tagsOf = n => {
    const t = [];
    (n.art || []).forEach(a => t.push(a));
    if (n.slur === 'start') t.push('('); if (n.slur === 'stop') t.push(')');
    if (n.dyn) t.push(n.dyn); if (n.wedge === 'cresc') t.push('<'); if (n.wedge === 'dim') t.push('dim'); if (n.wedgeEnd) t.push('!');
    if (n.bow) t.push(n.bow === 'up' ? 'up' : 'dn'); if (n.fing != null) t.push('f' + n.fing); if (n.pos) t.push('pos' + n.pos); if (n.str) t.push('str' + n.str); if (n.breath) t.push('br');
    return t.length ? '{' + t.join(',') + '}' : '';
  };
  const attrToks = a => {
    const t = [];
    if (!a) return t;
    if (a.repStart) t.push('|:'); if (a.ending) t.push('[' + a.ending.join(','));
    if (a.tempo) t.push('T=' + a.tempo + (a.tempoText ? ':' + a.tempoText.replace(/ /g, '_') : ''));
    if (a.time) t.push('M=' + a.time.join('/')); if (a.key) t.push('K=' + E.FIFTHS_KEY[a.key.fifths] + (a.key.minor ? 'm' : ''));
    if (a.rit) t.push('rit.'); if (a.accel) t.push('accel.'); if (a.atempo) t.push('a_tempo');
    if (a.segno) t.push('Segno'); if (a.coda) t.push('Coda'); if (a.text) t.push('text=' + a.text.replace(/ /g, '_'));
    if (a.fine) t.push('Fine'); if (a.toCoda) t.push('To.Coda');
    if (a.jump) t.push((a.jump === 'dc' ? 'D.C.' : 'D.S.') + (a.al ? (a.al === 'fine' ? 'al.Fine' : 'al.Coda') : ''));
    if (a.repEnd) t.push(':|' + (a.repEnd > 2 ? 'x' + a.repEnd : ''));
    return t;
  };
  const PRE = /^(\|:|\[|T=|M=|K=|rit|accel|a_tempo|Segno|Coda|text=)/;
  const ms = measures => measures.map(m => { const at = attrToks(m.attr); return at.filter(t => PRE.test(t)).concat(m.notes.map(n =>
    (n.rest ? 'R' : [n].concat(n.chord || []).map(p => p.step + ACC[p.alter] + p.octave).join('+')) + ':' + n.type + '.'.repeat(n.dots) + (n.triplet ? 't' : '') + (n.tieStart ? '~' : '') + tagsOf(n)
  ), at.filter(t => !PRE.test(t))).join(' '); });
  const out = {
    title: song.title, composer: song.composer, tempo: song.tempo,
    time: song.timeNum + '/' + song.timeDen, key: E.FIFTHS_KEY[song.fifths] + (song.minor ? 'm' : ''),
    notes: song.notesText || undefined, youtube: song.youtube || undefined
  };
  const ly = measures => measures.some(m => m.notes.some(n => n.lyric)) ? measures.map(m => m.notes.filter(n => !n.rest && !n.tieStop).map(n => n.lyric || '_').join(' ')) : undefined;
  if (song.parts.length > 1) out.parts = song.parts.map(p => ({ name: p.name, instrument: p.instrument, clef: p.clef || undefined, measures: ms(p.measures), lyrics: ly(p.measures), timeline: p.timeline || undefined }));
  else { out.instrument = song.parts[0].instrument; if (song.parts[0].clef) out.clef = song.parts[0].clef; out.measures = ms(song.parts[0].measures); out.lyrics = ly(song.parts[0].measures); }
  return out;
};

/* ---------- MusicXML（支援多聲部、雙音、鋼琴雙譜表伴奏） ---------- */
E.guessInstrument = function (name) {
  const s = (name || '').toLowerCase();
  if (/recorder|直笛/.test(s) && /tenor|次中/.test(s)) return 'recorder-t';
  if (/recorder|直笛/.test(s) && /bass|低音/.test(s)) return 'recorder-b';
  if (/soprano|女高/.test(s)) return 'soprano';
  if (/alto|女低/.test(s) && !/rec|直笛|sax/.test(s)) return 'alto';
  if (/tenor|男高/.test(s) && !/sax/.test(s)) return 'tenor';
  if (/baritone|男中|男低|bass voice/.test(s)) return 'bass';
  if (/voice|vocal|choir|chorus|人聲|合唱/.test(s)) return 'voice';
  if (/viola|中提琴/.test(s)) return 'viola';
  if (/cello|violoncello|大提琴|bass|低音提琴/.test(s)) return 'cello';
  if (/piano|鋼琴|keyboard|organ|harp/.test(s)) return 'piano';
  if (/alto rec|中音直笛/.test(s)) return 'recorder-a';
  if (/recorder|直笛|flute|長笛/.test(s)) return 'recorder-s';
  return 'violin';
};
E.parseMusicXML = function (xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('MusicXML 檔案格式錯誤');
  const q = (el, s) => el.querySelector(s);
  const txt = (el, s) => { const x = el && el.querySelector(s); return x ? x.textContent.trim() : null; };
  const partEls = [...doc.querySelectorAll('part')];
  if (!partEls.length) throw new Error('MusicXML 裡找不到聲部');
  const title = txt(doc, 'work-title') || txt(doc, 'movement-title') || '匯入的樂譜';
  let composer = '';
  doc.querySelectorAll('creator').forEach(c => { if (!composer || c.getAttribute('type') === 'composer') composer = c.textContent.trim(); });
  const names = {};
  doc.querySelectorAll('score-part').forEach(sp => { names[sp.getAttribute('id')] = txt(sp, 'part-name') || ''; });
  const TYPE = { whole: 'w', half: 'h', quarter: 'q', eighth: '8', '16th': '16', '32nd': '32', breve: 'w' };
  let fifths = 0, minor = false, num = 4, den = 4, tempo = null, gotKey = false, gotTime = false, first = true;
  let warnChord = false, warnVoice = false;
  const parts = partEls.map((part, pi) => {
    let divisions = 1, clef = null, beat = 0, curEnding = null;
    const measures = [], timeline = [];
    part.querySelectorAll(':scope > measure').forEach(me => {
      const notes = [], attr = {}; let pos = 0, maxPos = 0, lastStart = 0, pendDyn = null, pendWedge = null;
      const isFirstMeasure = measures.length === 0;
      for (const el of me.children) {
        if (el.tagName === 'barline') {
          const rp = q(el, 'repeat'); if (rp) { if (rp.getAttribute('direction') === 'forward') attr.repStart = true; else attr.repEnd = +(rp.getAttribute('times') || 2); }
          if (en && en.getAttribute('type') === 'start') { attr.ending = (en.getAttribute('number') || '1').split(/[, ]+/).map(Number).filter(Boolean); curEnding = attr.ending; }
          if (en && (en.getAttribute('type') === 'stop' || en.getAttribute('type') === 'discontinue')) { attr.ending = attr.ending || curEnding; curEnding = null; attr._endStop = true; }
          if (q(el, 'segno')) attr.segno = true; if (q(el, 'coda')) attr.coda = true;
        } else if (el.tagName === 'attributes') {
          const dv = txt(el, 'divisions'); if (dv) divisions = +dv;
          const fx = txt(el, 'key fifths');
          if (fx != null) { if (!gotKey) { fifths = +fx; minor = txt(el, 'key mode') === 'minor'; gotKey = true; } else if (!isFirstMeasure) attr.key = { fifths: +fx, minor: txt(el, 'key mode') === 'minor' }; }
          const b = txt(el, 'time beats'), bt = txt(el, 'time beat-type');
          if (b && bt) { if (!gotTime) { num = +b; den = +bt; gotTime = true; } else if (!isFirstMeasure) attr.time = [+b, +bt]; }
          if (!clef) {
            const ce = [...el.querySelectorAll('clef')].find(c => !c.getAttribute('number') || c.getAttribute('number') === '1');
            if (ce) { const sg = txt(ce, 'sign'), ln = txt(ce, 'line'); clef = sg === 'F' ? 'bass' : sg === 'C' ? (ln === '4' ? 'tenor' : 'alto') : 'treble'; }
          }
        } else if (el.tagName === 'direction' || el.tagName === 'sound') {
          const snd = el.tagName === 'sound' ? el : q(el, 'sound');
          let tp = null;
          if (snd && snd.getAttribute('tempo')) tp = Math.round(+snd.getAttribute('tempo'));
          const pm = txt(el, 'per-minute'), bu = txt(el, 'beat-unit');
          if (pm && tp == null) tp = Math.round(+pm * ({ half: 2, eighth: 0.5, quarter: 1 }[bu] || 1) * (q(el, 'beat-unit-dot') ? 1.5 : 1));
          if (tp) { if (tempo == null) tempo = tp; else attr.tempo = tp; }
          if (snd) {
            if (snd.getAttribute('dacapo') === 'yes') attr.jump = 'dc';
            if (snd.getAttribute('dalsegno')) attr.jump = 'ds';
            if (snd.getAttribute('fine')) attr.fine = true;
            if (snd.getAttribute('tocoda')) attr.toCoda = true;
            if (snd.getAttribute('segno')) attr.segno = true;
            if (snd.getAttribute('coda')) attr.coda = true;
          }
          if (el.tagName === 'direction') {
            if (q(el, 'direction-type segno')) attr.segno = true;
            if (q(el, 'direction-type coda')) { if (attr.toCoda) {} else attr.coda = true; }
            const w = [...el.querySelectorAll('words')].map(x => x.textContent.trim()).join(' ');
            if (w) {
              if (/rit|rall/i.test(w)) attr.rit = true;
              else if (/accel/i.test(w)) attr.accel = true;
              else if (/a\s*tempo|tempo\s*I/i.test(w)) attr.atempo = true;
              if (/D\.?\s*C\./i.test(w)) { attr.jump = 'dc'; attr.al = /fine/i.test(w) ? 'fine' : /coda/i.test(w) ? 'coda' : null; }
              else if (/D\.?\s*S\./i.test(w)) { attr.jump = 'ds'; attr.al = /fine/i.test(w) ? 'fine' : /coda/i.test(w) ? 'coda' : null; }
              else if (/^fine$/i.test(w)) attr.fine = true;
              else if (/to\s*coda/i.test(w)) { attr.toCoda = true; attr.coda = false; }
              else if (!/rit|rall|accel|tempo/i.test(w) && w.length <= 24) { if (tp && !attr.tempoText) attr.tempoText = w; else if (!tp && isFirstMeasure && !attr.tempoText) attr.tempoText = w; else attr.text = w; }
            }
            const dy = q(el, 'dynamics'); if (dy && dy.firstElementChild) pendDyn = dy.firstElementChild.tagName;
            const wg = q(el, 'wedge'); if (wg) pendWedge = wg.getAttribute('type');
          }
        } else if (el.tagName === 'backup') { pos -= +(txt(el, 'duration') || 0); }
        else if (el.tagName === 'forward') { pos += +(txt(el, 'duration') || 0); maxPos = Math.max(maxPos, pos); }
        else if (el.tagName === 'note') {
          if (q(el, 'grace') || q(el, 'cue')) continue;
          const isChord = !!q(el, ':scope > chord');
          const durDiv = +(txt(el, ':scope > duration') || 0);
          const start = isChord ? lastStart : pos;
          if (!isChord) { lastStart = pos; pos += durDiv; maxPos = Math.max(maxPos, pos); }
          const p = q(el, ':scope > pitch');
          const pitch = p ? { step: txt(p, 'step'), alter: Math.round(+(txt(p, 'alter') || 0)), octave: +txt(p, 'octave') } : null;
          if (pitch) pitch.midi = E.toMidi(pitch.step, pitch.alter, pitch.octave);
          // 伴奏時間表：收全部的音（所有聲部、雙音、鋼琴左右手）
          if (pitch && !q(el, ':scope > rest')) {
            const tieStop = [...el.querySelectorAll(':scope > tie')].some(t => t.getAttribute('type') === 'stop');
            const prevT = tieStop && timeline.slice().reverse().find(x => x.midis[0] === pitch.midi && Math.abs(x.beat + x.dur - (beat + start / divisions)) < 1e-3);
            if (prevT) prevT.dur += durDiv / divisions;
            else timeline.push({ beat: beat + start / divisions, dur: durDiv / divisions, midis: [pitch.midi] });
          }
          // 樂譜顯示與評分：只取第一譜表、第一聲部
          const v = txt(el, ':scope > voice'), stf = txt(el, ':scope > staff');
          if ((v && v !== '1') || (stf && stf !== '1')) { if (v && v !== '1') warnVoice = true; continue; }
          if (isChord) {
            warnChord = true;
            const last = notes[notes.length - 1];
            if (pitch && last && !last.rest) {
              const c = Object.assign({}, pitch);
              if (c.midi > last.midi) { const top = { step: last.step, alter: last.alter, octave: last.octave, midi: last.midi }; Object.assign(last, c); Object.assign(c, top); }
              (last.chord = last.chord || []).push(c);
            }
            continue;
          }
          const dur = durDiv / divisions;
          let type = TYPE[txt(el, ':scope > type')];
          const dots = el.querySelectorAll(':scope > dot').length;
          const tm = q(el, 'time-modification');
          const trip = !!(tm && txt(tm, 'actual-notes') === '3' && txt(tm, 'normal-notes') === '2');
          if (!type) type = dur >= 4 ? 'w' : dur >= 2 ? 'h' : dur >= 1 ? 'q' : dur >= 0.5 ? '8' : dur >= 0.25 ? '16' : '32';
          const n = { type, dots, triplet: trip, dur: dur || E.DUR[type] };
          if (pendDyn && E.DYN.includes(pendDyn)) { n.dyn = pendDyn; pendDyn = null; }
          if (pendWedge) { if (pendWedge === 'crescendo') n.wedge = 'cresc'; else if (pendWedge === 'diminuendo') n.wedge = 'dim'; else if (pendWedge === 'stop') n.wedgeEnd = true; pendWedge = null; }
          const nt = q(el, 'notations');
          if (nt) {
            const add = a => (n.art = n.art || []).push(a);
            if (q(nt, 'staccato') || q(nt, 'staccatissimo')) add('st');
            if (q(nt, 'tenuto')) add('ten');
            if (q(nt, 'accent')) add('acc');
            if (q(nt, 'strong-accent')) add('marc');
            if (q(nt, 'fermata')) add('fer');
            if (q(nt, 'trill-mark')) add('tr');
            const sl = q(nt, 'slur'); if (sl) n.slur = sl.getAttribute('type') === 'start' ? 'start' : sl.getAttribute('type') === 'stop' ? 'stop' : undefined;
            if (q(nt, 'up-bow')) n.bow = 'up'; if (q(nt, 'down-bow')) n.bow = 'down';
            const fg = txt(nt, 'fingering'); if (fg && /^[0-4]$/.test(fg)) n.fing = fg;
            const ndy = q(nt, 'dynamics'); if (ndy && ndy.firstElementChild && E.DYN.includes(ndy.firstElementChild.tagName)) n.dyn = ndy.firstElementChild.tagName;
            if (q(nt, 'breath-mark') || q(el, 'articulations breath-mark')) n.breath = true;
          }
          if (q(el, ':scope > rest') || !pitch) n.rest = true;
          else {
            Object.assign(n, pitch);
            el.querySelectorAll(':scope > tie').forEach(t => { if (t.getAttribute('type') === 'start') n.tieStart = true; });
            const ly = q(el, 'lyric text'); if (ly) n.lyric = ly.textContent.trim();
          }
          notes.push(n);
        }
      }
      if (!notes.length) notes.push({ rest: true, type: 'w', dots: 0, dur: maxPos / divisions || 4 });
      if (curEnding && !attr.ending) attr.ending = curEnding;
      delete attr._endStop;
      measures.push({ notes, attr });
      beat += maxPos / divisions || notes.reduce((a, n) => a + n.dur, 0);
    });
    E.linkTies(measures);
    const name = names[part.getAttribute('id')] || `第 ${pi + 1} 部`;
    const instrument = E.guessInstrument(name);
    return { name, instrument, clef: clef && clef !== 'treble' ? clef : (E.INSTR[instrument].clef || null), measures, timeline };
  });
  const usable = parts.filter(p => p.measures.some(m => m.notes.some(n => !n.rest)));
  if (!usable.length) throw new Error('MusicXML 裡沒有讀到音符');
  const n = Math.min(...usable.map(p => p.measures.length));
  usable.forEach(p => { p.measures = p.measures.slice(0, n); });
  const song = {
    id: 'u-' + Date.now().toString(36), title, composer, tempo: tempo || 80,
    timeNum: num, timeDen: den, fifths, minor, source: 'musicxml', parts: usable,
    warnings: [warnChord ? '樂譜有雙音：會分別判斷每個音有沒有拉到，以及音程準不準。' : '', warnVoice ? '同一行有多個聲部時，評分只取第一聲部。' : '', usable.length > 1 ? `共有 ${usable.length} 個聲部，可在練習頁選「我的聲部」，其他聲部當伴奏。` : ''].filter(Boolean)
  };
  E.selectPart(song, 0);
  return song;
};

/* 每小節實際的拍號、調號（記號會往後延續） */
E.resolveAttrs = function (song) {
  let ts = [song.timeNum, song.timeDen], key = { fifths: song.fifths, minor: song.minor };
  song.measures.forEach(m => {
    m.attr = m.attr || {};
    if (m.attr.time) ts = m.attr.time;
    if (m.attr.key) key = m.attr.key;
    m.ts = ts; m.fifths = key.fifths; m.minor = key.minor; m.full = ts[0] * 4 / ts[1];
    m.written = m.notes.reduce((a, n) => a + n.dur, 0);
  });
};

/* 展開反覆記號、一房二房、D.C.／D.S.、Fine、Coda，得到實際演奏的小節順序 */
E.unroll = function (measures) {
  const n = measures.length, order = [];
  let i = 0, repStart = 0, pass = 1, jumped = false, guard = 0;
  const A = k => measures[k].attr || {};
  while (i < n && guard++ < 5000) {
    const a = A(i);
    if (a.repStart && !(order.length && order[order.length - 1] === i)) { if (repStart !== i) pass = 1; repStart = i; }
    if (a.ending) {
      // 一房二房：第幾次就走第幾房；D.C./D.S. 回頭之後走最後一房
      let j = i, k = i; while (j > 0 && A(j - 1).ending) j--; while (k < n - 1 && A(k + 1).ending) k++;
      let mx = 0; for (let x = j; x <= k; x++) mx = Math.max(mx, ...A(x).ending);
      const want = jumped ? mx : pass;
      if (!a.ending.includes(want)) { i++; continue; }
    }
    order.push(i);
    if (jumped && a.fine) break;
    if (jumped && a.toCoda) { const c = measures.findIndex((m, k) => k > i && (m.attr || {}).coda); if (c >= 0) { i = c; continue; } }
    if (a.repEnd && !jumped && pass < a.repEnd) { pass++; i = repStart; continue; }
    if (a.repEnd) pass = 1;
    if (a.jump && !jumped) {
      jumped = true; pass = 1;
      i = a.jump === 'ds' ? Math.max(0, measures.findIndex(m => (m.attr || {}).segno)) : 0;
      repStart = i; continue;
    }
    i++;
  }
  return order;
};

/* 時間軸：照演奏順序把音符排成「要演奏的事件」（連結線合併） */
E.buildEvents = function (song) {
  E.resolveAttrs(song);
  const order = song.measures.length ? E.unroll(song.measures) : [];
  // 每個小節第一次出現的位置（給舊程式用的 startBeat）
  song.measures.forEach((m, mi) => {
    let k = 0;
    m.notes.forEach((n, ni) => { n.mi = mi; n.ni = ni; if (!n.rest) n.k = ++k; });
  });
  let beat = 0; const ev = [], pm = [];
  order.forEach((mi, pk) => {
    const m = song.measures[mi];
    pm.push({ pk, mi, start: beat, dur: m.written, full: m.full });
    if (m.startBeat == null || !song._seen || !song._seen.has(mi)) { m.startBeat = beat; m.durBeats = m.written; (song._seen = song._seen || new Set()).add(mi); }
    m.notes.forEach(n => {
      if (n.startBeat == null || n._firstPk == null) { n.startBeat = beat; n._firstPk = pk; }
      const last = ev[ev.length - 1];
      if (n.tieStop && last && last.open && last.midi === n.midi) {
        last.dur += n.dur; last.parts.push(n); last.partStarts.push(beat); last.open = !!n.tieStart;
      } else {
        ev.push({ idx: ev.length, start: beat, dur: n.dur, midi: n.rest ? null : n.midi, mi, pk, note: n, parts: [n], partStarts: [beat], open: !!n.tieStart });
      }
      beat += n.dur;
    });
  });
  delete song._seen;
  song.pm = pm;
  song.order = order;
  song.fullBeats = song.measures.length ? song.measures[0].full : 4;
  song.pickup = song.measures.length > 1 && song.measures[0].written < song.fullBeats - 1e-6 ? song.fullBeats - song.measures[0].written : 0;
  song.totalBeats = beat;
  return ev;
};

/* 固定速度的時間軸，包含速度記號、漸慢、漸快、回原速、延長記號 */
E.gridTimeMap = function (song, events, pkA, pkB, t0, speed) {
  const pm = song.pm;
  let bpm = song.tempo, base = song.tempo;
  const apply = (a, mStart, mDur) => {
    if (a.tempo) { bpm = a.tempo; base = a.tempo; }
    if (a.atempo) bpm = base;
    if (a.rit) return { from: bpm, to: bpm * 0.8, start: mStart, dur: mDur };
    if (a.accel) return { from: bpm, to: bpm * 1.2, start: mStart, dur: mDur };
    return null;
  };
  for (let k = 0; k < pkA; k++) { const r = apply(song.measures[pm[k].mi].attr || {}, pm[k].start, pm[k].dur); if (r) bpm = r.to; }
  const anchors = []; let t = t0, ramp = null;
  const bpmAt = b => ramp && b >= ramp.start ? ramp.from + (ramp.to - ramp.from) * Math.min(1, (b - ramp.start) / (ramp.dur || 1)) : bpm;
  for (let k = pkA; k <= pkB; k++) {
    const P = pm[k];
    const r = apply(song.measures[P.mi].attr || {}, P.start, P.dur);
    if (r) ramp = r; else if (ramp && ramp.start + ramp.dur <= P.start) { bpm = ramp.to; ramp = null; }
    if (ramp && (song.measures[P.mi].attr || {}).atempo) ramp = null;
    const evs = events.filter(e => e.pk === k);
    let b = P.start;
    anchors.push({ beat: b, t });
    evs.forEach(e => {
      if (e.start > b + 1e-9) { const mid = (b + e.start) / 2; t += (e.start - b) * 60 / (bpmAt(mid) * speed); b = e.start; anchors.push({ beat: b, t }); }
      const end = e.start + e.dur;
      const endInBar = Math.min(end, P.start + P.dur);
      const mid = (e.start + endInBar) / 2;
      t += (endInBar - e.start) * 60 / (bpmAt(mid) * speed);
      b = endInBar;
      // 延長記號：多停留約八成的時值
      if ((e.note.art || []).includes('fer') || e.parts.some(p => (p.art || []).includes('fer'))) t += e.dur * 60 / (bpmAt(mid) * speed) * 0.8;
      anchors.push({ beat: b, t });
    });
    if (b < P.start + P.dur - 1e-9) { t += (P.start + P.dur - b) * 60 / (bpmAt(b) * speed); anchors.push({ beat: P.start + P.dur, t }); }
  }
  // 去掉重複拍點，保留最後的（延長記號會讓同一拍有兩個時間點）
  const out = [];
  anchors.forEach(a => { if (out.length && Math.abs(out[out.length - 1].beat - a.beat) < 1e-9) out[out.length - 1] = a; else out.push(a); });
  const tm = E.makeTimeMap(out);
  tm.startBpm = bpm;
  return tm;
};

E.beatLabel = function (song, ev) {
  const P = song.pm ? song.pm[ev.pk] : null;
  const m = song.measures[ev.mi];
  const ts = m.ts || [song.timeNum, song.timeDen];
  const unit = 4 / ts[1];
  const mStart = P ? P.start : m.startBeat;
  let pos = (ev.start - mStart) / unit;
  if (ev.mi === 0) pos += song.pickup / unit;
  const b = Math.floor(pos + 1e-6) + 1, fr = pos - (b - 1);
  if (fr < 0.02) return `第 ${b} 拍`;
  if (Math.abs(fr - 0.5) < 0.02) return `第 ${b} 拍後半`;
  return `第 ${b} 拍之後`;
};

E.noteLabel = function (n) {
  if (n.rest) return '休止符';
  const acc = { 2: '𝄪', 1: '♯', 0: '', '-1': '♭', '-2': '𝄫' }[n.alter];
  if (n.chord && n.chord.length) {
    const one = p => p.step + { 2: '𝄪', 1: '♯', 0: '', '-1': '♭', '-2': '𝄫' }[p.alter] + p.octave;
    return [n].concat(n.chord).map(one).reverse().join('＋') + '（雙音）';
  }
  return `${n.step}${acc}${n.octave}`;
};

/* 直笛指法（高音直笛譜面 C4–D5）：● 按住、○ 放開、◐ 半孔；格式：拇指｜左手 1 2 3｜右手 4 5 6 7 */
E.RECORDER_FING = {
  german: { 60: '●｜●●●｜●●●●', 62: '●｜●●●｜●●●○', 64: '●｜●●●｜●●○○', 65: '●｜●●●｜●○○○', 67: '●｜●●●｜○○○○', 69: '●｜●●○｜○○○○', 70: '●｜●○●｜●○○○', 71: '●｜●○○｜○○○○', 72: '●｜○●○｜○○○○', 74: '○｜○●○｜○○○○' },
  baroque: { 60: '●｜●●●｜●●●●', 62: '●｜●●●｜●●●○', 64: '●｜●●●｜●●○○', 65: '●｜●●●｜●○●●', 66: '●｜●●●｜○●●○', 67: '●｜●●●｜○○○○', 69: '●｜●●○｜○○○○', 70: '●｜●○●｜●○○○', 71: '●｜●○○｜○○○○', 72: '●｜○●○｜○○○○', 74: '○｜○●○｜○○○○' }
};
E.recorderFinger = function (writtenMidi, system) {
  const t = E.RECORDER_FING[system === 'baroque' ? 'baroque' : 'german'][writtenMidi];
  return t ? `${system === 'baroque' ? '英式' : '德式'}指法 ${t}` : '這個音請看課本或老師的指法表';
};

/* 小提琴第一把位參考指法 */
E.violinFinger = function (midi) {
  const S = [['E', 76], ['A', 69], ['D', 62], ['G', 55]];
  const F = ['空弦', '低1指', '1指', '低2指', '高2指', '3指', '高3指', '4指'];
  if (midi < 55) return '低於小提琴音域';
  for (const [name, open] of S) if (midi >= open && midi - open <= 7) {
    if (midi - open === 7 && name !== 'E') continue; // 4 指音優先用下一條空弦
    return `${name} 弦 ${F[midi - open]}`;
  }
  for (const [name, open] of S) if (midi >= open && midi - open <= 7) return `${name} 弦 ${F[midi - open]}`;
  return 'E 弦 需換把位';
};

/* ---------- 音高偵測（YIN＋多週期精修） ---------- */
E.FRAME = 2048;
E.HOP = 512;
E.makeDetector = function (sr, fmin = 150) {
  const N = E.FRAME;
  const tauMax = Math.min(N - 600, Math.ceil(sr / fmin));
  const tauMin = Math.max(2, Math.floor(sr / 2800));
  const raw = new Float64Array(tauMax + 3), d = new Float64Array(tauMax + 3);
  const W = N - tauMax - 2;
  return function (buf) {
    let e = 0; for (let i = 0; i < N; i++) e += buf[i] * buf[i];
    const rms = Math.sqrt(e / N);
    if (rms < 2e-4) return { f: 0, c: 0, rms };
    for (let tau = 1; tau <= tauMax + 1; tau++) {
      let s = 0; for (let i = 0; i < W; i++) { const x = buf[i] - buf[i + tau]; s += x * x; }
      raw[tau] = s;
    }
    d[0] = 1; let run = 0;
    for (let tau = 1; tau <= tauMax + 1; tau++) { run += raw[tau]; d[tau] = run > 0 ? raw[tau] * tau / run : 1; }
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (d[t] < 0.15) { while (t + 1 <= tauMax && d[t + 1] < d[t]) t++; tau = t; break; }
    }
    if (tau < 0) {
      let mn = 9, mi = -1; for (let t = tauMin; t <= tauMax; t++) if (d[t] < mn) { mn = d[t]; mi = t; }
      if (mn > 0.35) return { f: 0, c: 1 - mn, rms };
      tau = mi;
    }
    const c = 1 - d[tau];
    let tf = tau;
    if (tau > tauMin && tau < tauMax) { const a = d[tau - 1], b = d[tau], g = d[tau + 1], den = a + g - 2 * b; if (den > 0) tf = tau + (a - g) / (2 * den); }
    const k = Math.floor((tauMax - 2) / tf);
    if (k >= 2) {
      const ct = Math.round(k * tf); let bt = ct, bv = raw[ct];
      for (let t = Math.max(2, ct - 3); t <= Math.min(tauMax, ct + 3); t++) if (raw[t] < bv) { bv = raw[t]; bt = t; }
      const a = raw[bt - 1], b = raw[bt], g = raw[bt + 1], den = a + g - 2 * b;
      const tk = den > 0 ? bt + (a - g) / (2 * den) : bt;
      const tf2 = tk / k;
      if (Math.abs(tf2 - tf) / tf < 0.03) tf = tf2;
    }
    return { f: sr / tf, c, rms };
  };
};

/* 把一整段聲音切成音框（離線分析、自我測試用） */
E.analyzeBuffer = function (samples, sr, t0 = 0, fmin) {
  const det = E.makeDetector(sr, fmin), N = E.FRAME, H = E.HOP, frames = [];
  for (let end = N; end <= samples.length; end += H) {
    const r = det(samples.subarray(end - N, end));
    r.t = t0 + (end - N / 2) / sr;
    frames.push(r);
  }
  return frames;
};

E.isVoiced = (f, gate) => f.f > 0 && f.c > 0.8 && f.rms > gate;

E.between = function (frames, a, b) {
  let lo = 0, hi = frames.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (frames[m].t < a) lo = m + 1; else hi = m; }
  const out = [];
  for (let i = lo; i < frames.length && frames[i].t <= b; i++) out.push(frames[i]);
  return out;
};

/* ---------- 音準引擎 ---------- */
E.pitchEngine = function (ev, frames, o) {
  const target = ev.midi + o.transpose, s = o.s, d = o.d;
  const a = s + (o.vocal ? Math.min(0.15, 0.3 * d) : Math.min(0.08, 0.25 * d)), b = s + d - Math.min(0.06, 0.15 * d);
  const body = E.between(frames, a, b);
  if (body.length < 2) return { status: 'nodata', level: null };
  const v = body.filter(f => E.isVoiced(f, o.gate));
  const frac = v.length / body.length;
  if (frac < 0.25) return { status: 'missing', level: 'r', voicedFrac: frac };
  const dev = v.map(f => E.cents(f.f, target, o.A));
  const med = median(dev);
  if (Math.abs(med) > 50 && !(ev.note.art || []).includes('tr')) {
    const semis = Math.round(med / 100);
    return { status: 'wrong', level: 'r', heard: target + semis, cents: med, octave: semis !== 0 && semis % 12 === 0 };
  }
  if ((ev.note.art || []).includes('tr')) {
    // 顫音：主音和上方音快速交替，只檢查主音有沒有出現
    const hit = dev.filter(x => Math.abs(x) <= 60);
    return hit.length >= dev.length * 0.2 ? { status: 'ok', level: 'g', cents: median(hit), trill: true, voicedFrac: frac } : { status: 'wrong', level: 'y', heard: target + Math.round(med / 100), cents: med, trill: true };
  }
  const near = dev.filter(c => Math.abs(c) <= 70);
  let c = median(near);
  // 表情音準：導音（主音下方半音）可以偏高，最多 12 音分 不扣分
  if (o.expressive && o.leading && c > 0) c = Math.max(0, c - Math.min(12, c));
  const ac = Math.abs(c);
  const res = {
    status: ac <= o.tol.pg ? 'ok' : (c > 0 ? 'sharp' : 'flat'),
    level: ac <= o.tol.pg ? 'g' : ac <= o.tol.py ? 'y' : 'r',
    cents: median(near), judged: c, stability: std(near), voicedFrac: frac
  };
  // 抖音：音高規律起伏 4.5–8 次／秒
  if (near.length >= 12 && d >= 0.5) {
    const ts = v.filter((f, i) => Math.abs(dev[i]) <= 70).map(f => f.t);
    let cross = 0; const m0 = median(near);
    for (let i = 1; i < near.length; i++) if ((near[i] - m0) * (near[i - 1] - m0) < 0) cross++;
    const span = ts[ts.length - 1] - ts[0];
    const rate = span > 0 ? cross / 2 / span : 0;
    const width = (Math.max(...near) - Math.min(...near)) / 2;
    if (rate >= 4 && rate <= 9 && width >= 8) res.vibrato = { rate: Math.round(rate * 10) / 10, width: Math.round(width) };
  }
  if (o.vocal && d >= 0.35) {
    // 人聲常見問題：從下面滑上來、尾音往下掉、聲音搖晃太大
    const vv = f => E.isVoiced(f, o.gate);
    const head = E.between(frames, s, s + Math.min(0.2, 0.3 * d)).filter(vv).map(f => E.cents(f.f, target, o.A)).filter(x => Math.abs(x) < 250);
    const tail = E.between(frames, s + d * 0.75, s + d - 0.03).filter(vv).map(f => E.cents(f.f, target, o.A)).filter(x => Math.abs(x) < 250);
    res.vocal = {};
    if (head.length >= 3 && median(head.slice(0, 3)) < res.cents - 60) res.vocal.scoop = Math.round(res.cents - median(head.slice(0, 3)));
    if (tail.length >= 3 && median(tail) < res.cents - 30) res.vocal.droop = Math.round(res.cents - median(tail));
    if (res.vibrato && res.vibrato.width > 60) res.vocal.wobble = res.vibrato.width;
    if (res.vocal.scoop || res.vocal.droop || res.vocal.wobble) res.level = E.worst(res.level, 'y');
  }
  return res;
};

/* ---------- 節奏引擎 ---------- */
E.rhythmEngine = function (ev, frames, o) {
  const s = o.s, d = o.d, gate = o.gate, res = { level: 'g' };
  // 雙音時單音偵測不可靠，「有沒有聲音」改看音量
  const voiced = o.chord ? (f => f.rms > gate) : (f => E.isVoiced(f, gate));
  if (ev.midi == null) {
    if (d >= 0.15) {
      const body = E.between(frames, s + Math.min(0.08, 0.25 * d), s + d - Math.min(0.06, 0.2 * d));
      if (body.length >= 3) {
        const vf = body.filter(voiced).length / body.length;
        res.restSound = vf;
        if (vf > 0.6) { res.restIssue = true; res.level = 'y'; }
      }
    }
    return res;
  }
  const target = ev.midi + o.transpose;
  const W1 = Math.min(0.25, 0.5 * (o.prevD || 0.5)), W2 = Math.min(0.3, 0.6 * d);
  const win = E.between(frames, s - W1, s + W2);
  // 雙音的音高偵測不可靠，起音改用音量變化判斷
  const samePrev = o.chord || (o.prevMidi != null && o.prevMidi + o.transpose === target);
  const semi = f => voiced(f) ? Math.round(E.midiFloat(f.f, o.A)) : null;
  let onset = null, how = null;
  if (!samePrev) {
    for (let i = 0; i + 2 < win.length; i++) {
      if ([0, 1, 2].every(j => semi(win[i + j]) === target)) { onset = win[i].t; how = 'pitch'; break; }
    }
    if (onset == null) {
      const prevSemi = o.prevMidi != null ? o.prevMidi + o.transpose : null;
      for (let i = 0; i + 2 < win.length; i++) {
        const s0 = semi(win[i]);
        if (s0 != null && s0 !== prevSemi && semi(win[i + 1]) === s0 && semi(win[i + 2]) === s0) { onset = win[i].t; how = 'newpitch'; break; }
      }
    }
  }
  if (onset == null) {
    let best = 0, bi = -1;
    for (let i = 3; i < win.length; i++) {
      const pre = Math.min(win[i - 1].rms, win[i - 2].rms, win[i - 3].rms);
      const r = win[i].rms / (pre + 1e-5);
      if (r > best && win[i].rms > gate) { best = r; bi = i; }
    }
    if (best > 1.6) { onset = win[bi].t; how = 'energy'; }
  }
  if (onset != null) {
    res.dt = onset - s; res.how = how;
    const ms = Math.abs(res.dt) * 1000;
    res.onsetLevel = ms <= o.tol.rg ? 'g' : ms <= o.tol.ry ? 'y' : 'r';
  } else if (!samePrev) { res.unclear = true; res.onsetLevel = 'y'; }
  const st = onset != null ? Math.max(onset, s - 0.05) : s, en = s + d * 0.85;
  const arts = ev.note.art || [];
  if (en - st > 0.06 && !arts.includes('fer')) {
    const span = E.between(frames, st, en);
    if (span.length >= 3) {
      res.lengthRatio = span.filter(voiced).length / span.length;
      if (arts.includes('st')) {
        // 斷奏：本來就要短，太長才提醒
        res.staccato = true;
        res.lengthLevel = res.lengthRatio <= 0.8 ? 'g' : 'y';
      } else res.lengthLevel = res.lengthRatio >= 0.75 ? 'g' : res.lengthRatio >= 0.45 ? 'y' : 'r';
    }
  }
  res.level = E.worst(res.onsetLevel, res.lengthLevel);
  return res;
};

/* ---------- 雙音引擎 ----------
 * 單音偵測遇到雙音會聽成別的音（D4＋A4 會變成 D3），所以改用頻譜：
 * 樂譜已經告訴我們是哪兩個音，就到每個音「不和另一個音重疊的泛音」位置找峰值，
 * 分別量出兩個音的實際頻率，再用比賽重視的「純律音程」判斷準不準。
 */
E.fft = function (re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nc = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nc;
      }
    }
  }
};
const HANN = {};
const hann = L => HANN[L] || (HANN[L] = Float64Array.from({ length: L }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (L - 1))));
E.CHORD_WIN = 8192;
E.CHORD_FFT = 16384;

/* 一個視窗：回傳每個目標音有沒有聽到、實際頻率 */
E.chordFrame = function (x, sr, targets, A) {
  const L = x.length, N = E.CHORD_FFT, w = hann(L);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < L; i++) re[i] = x[i] * w[i];
  E.fft(re, im);
  const half = N >> 1, mag = new Float64Array(half);
  for (let k = 0; k < half; k++) mag[k] = 0.5 * Math.log(re[k] * re[k] + im[k] * im[k] + 1e-24);
  const hz = sr / N;
  let gmax = -1e9; for (let k = Math.floor(120 / hz); k < Math.min(half - 1, 6000 / hz); k++) if (mag[k] > gmax) gmax = mag[k];
  const floor = gmax + Math.log(0.02); // 比最強峰值低 34 dB 以內才算有聲音
  const peakNear = (f, 音分, excl) => {
    const k0 = Math.max(2, Math.floor(f * Math.pow(2, -音分 / 1200) / hz)), k1 = Math.min(half - 2, Math.ceil(f * Math.pow(2, 音分 / 1200) / hz));
    let best = null;
    for (let k = k0; k <= k1; k++) {
      if (mag[k] < mag[k - 1] || mag[k] < mag[k + 1] || mag[k] < floor) continue;
      if (excl && Math.abs(1200 * Math.log2(k * hz / f)) < excl) continue;
      if (!best || mag[k] > mag[best]) best = k;
    }
    if (best == null) return null;
    const a = mag[best - 1], b = mag[best], c = mag[best + 1], den = a - 2 * b + c;
    const p = den < 0 ? 0.5 * (a - c) / den : 0;
    return { f: (best + p) * hz, mag: b - 0.25 * (a - c) * p };
  };
  const sep = Math.max(18, 3 * sr / L); // 兩個泛音靠這麼近就分不開
  const fs = targets.map(m => E.freq(m, A));
  return targets.map((m, ti) => {
    const f0 = fs[ti], ests = [], shared = [];
    let present = false, canSep = false;
    for (let h = 1; h <= 8; h++) {
      const fh = f0 * h; if (fh > 6000) break;
      const coll = fs.some((fo, oi) => oi !== ti && Array.from({ length: 16 }, (_, g) => fo * (g + 1)).some(x => Math.abs(x - fh) < sep));
      if (!coll && h <= 4) canSep = true;
      const pk = peakNear(fh, 70);
      if (!pk) continue;
      // 找到的峰其實是另一個音的泛音（例如只拉 D4 時，D4 的第 7 泛音落在 B4 第 4 泛音附近），不算
      if (!coll && fs.some((fo, oi) => oi !== ti && Math.abs(pk.f / fo - Math.round(pk.f / fo)) * fo < sep && Math.round(pk.f / fo) >= 1)) continue;
      const amp = Math.exp(pk.mag - gmax);
      if (coll) shared.push({ f: pk.f / h, w: amp });
      else { ests.push({ f: pk.f / h, w: amp / h }); if (h <= 4) present = true; }
    }
    const use = ests.length ? ests : shared;
    const f = use.length ? use.reduce((a, e) => a + e.f * e.w, 0) / use.reduce((a, e) => a + e.w, 0) : 0;
    let heard = null;
    if (!present && canSep) {
      const pk = peakNear(f0, 260, 70);
      if (pk) heard = Math.round(E.midiFloat(pk.f, A));
    }
    // 八度、同音這種「所有泛音都重疊」的情況，才用重疊的泛音粗估
    const sharedOnly = !canSep && shared.length > 0;
    return { m, f: canSep ? (ests.length ? f : 0) : f, present: canSep ? present : sharedOnly, shared: sharedOnly, heard };
  });
};

E.INTERVAL_NAME = { 0: '同音', 1: '小二度', 2: '大二度', 3: '小三度', 4: '大三度', 5: '完全四度', 6: '增四度', 7: '完全五度', 8: '小六度', 9: '大六度', 10: '小七度', 11: '大七度', 12: '八度' };
E.JUST = { 0: 0, 2: 203.9, 3: 315.6, 4: 386.3, 5: 498.0, 7: 702.0, 8: 813.7, 9: 884.4, 12: 1200 };
E.intervalRef = (semis, tuning) => {
  if (tuning === 'equal') return semis * 100;
  const oct = Math.floor(semis / 12), r = semis % 12;
  return oct * 1200 + (E.JUST[r] != null ? E.JUST[r] : r * 100);
};
E.intervalName = s => s <= 12 ? E.INTERVAL_NAME[s] : (s === 24 ? '兩個八度' : E.INTERVAL_NAME[s % 12] + '（加八度）');

/* 把多個視窗的結果整合成一個雙音的判斷 */
E.chordJudge = function (wins, targets, o) {
  if (!wins.length) return { status: 'chordmiss', level: 'r', missing: targets.map(m => ({ m, heard: null })), notes: [] };
  const notes = targets.map((m, i) => {
    const pres = wins.filter(w => w[i].present);
    const fsel = pres.map(w => w[i].f).filter(f => f > 0);
    const heardList = wins.map(w => w[i].heard).filter(h => h != null);
    return {
      m, presentFrac: pres.length / wins.length, shared: pres.some(w => w[i].shared),
      f: fsel.length ? median(fsel) : 0, heard: heardList.length ? median(heardList) : null
    };
  });
  notes.forEach(n => { n.cents = n.f ? E.cents(n.f, n.m, o.A) : null; });
  const missing = notes.filter(n => n.presentFrac < 0.5 || n.cents == null || Math.abs(n.cents) > 50);
  if (missing.length) return { status: 'chordmiss', level: 'r', missing: missing.map(n => ({ m: n.m, heard: n.heard != null && n.heard !== n.m ? n.heard : null })), notes };
  // 相鄰兩音的音程
  const pairs = [];
  for (let i = 0; i + 1 < notes.length; i++) {
    const lo = notes[i], hi = notes[i + 1], semis = hi.m - lo.m;
    const actual = 1200 * Math.log2(hi.f / lo.f), ref = E.intervalRef(semis, o.dsTuning);
    const dev = actual - ref, rough = lo.shared || hi.shared;
    let lv = Math.abs(dev) <= o.tol.pg ? 'g' : Math.abs(dev) <= o.tol.py ? 'y' : 'r';
    if (rough && lv === 'r') lv = 'y';
    // 以空弦（拉不歪）或低音為基準，建議調整另一個音
    const OPEN = o.openStrings || [55, 62, 69, 76];
    const hiOpen = OPEN.includes(hi.m) && !OPEN.includes(lo.m);
    const fix = hiOpen ? { m: lo.m, by: dev } : { m: hi.m, by: -dev }; // by>0 表示要調高
    pairs.push({ lo: lo.m, hi: hi.m, semis, actual, ref, dev, level: lv, rough, fix });
  }
  const worstPair = pairs.reduce((a, b) => (Math.abs(b.dev) > Math.abs(a.dev) ? b : a), pairs[0]);
  let level = pairs.reduce((l, p) => E.worst(l, p.level), 'g');
  const avg = mean(notes.map(n => n.cents));
  let shift = null;
  if (notes.every(n => Math.sign(n.cents) === Math.sign(avg)) && Math.abs(avg) > o.tol.py) { shift = avg; level = E.worst(level, 'y'); }
  return { status: 'chord', level, cents: worstPair.dev, pairs, notes: notes.map(n => ({ m: n.m, c: n.cents })), shift };
};

/* 一個雙音事件（需要原始錄音） */
E.chordEngine = function (ev, o) {
  const targets = [ev.note].concat(ev.note.chord).map(p => p.midi + o.transpose).sort((a, b) => a - b);
  const s = o.s, d = o.d, sr = o.sr;
  const a = s + Math.min(0.1, 0.25 * d), b = s + d - Math.min(0.08, 0.15 * d);
  const L = Math.min(E.CHORD_WIN, Math.floor((b - a) * sr));
  if (L < 2048) return { status: 'chord', level: null, short: true };
  const span = L / sr, wins = [];
  let voicedWins = 0, total = 0;
  for (let t = a; t + span <= b + 1e-6; t += span / 2) {
    const x = o.getSamples(t, t + span); if (!x) continue;
    total++;
    let e = 0; for (let i = 0; i < x.length; i++) e += x[i] * x[i];
    if (Math.sqrt(e / x.length) < o.gate) continue;
    voicedWins++;
    wins.push(E.chordFrame(x, sr, targets, o.A));
  }
  if (!total) return { status: 'nodata', level: null };
  if (voicedWins / total < 0.4) return { status: 'missing', level: 'r' };
  return E.chordJudge(wins, targets, o);
};


/* ---------- 示範錄音（老師版、網路 mp3）對齊到樂譜 ----------
 * 先用音高偵測把錄音變成一串音框，再用動態規劃找出「每個音從哪一刻開始」：
 * 音框只能依序屬於一個音，換到下一個音時，如果剛好有起音（音高改變或音量上升）就比較便宜。
 */
E.analyzeBufferAsync = async function (samples, sr, onProgress, fmin) {
  const det = E.makeDetector(sr, fmin), N = E.FRAME, H = E.HOP, frames = [];
  const total = Math.max(1, Math.floor((samples.length - N) / H));
  let k = 0;
  for (let end = N; end <= samples.length; end += H) {
    const r = det(samples.subarray(end - N, end));
    r.t = (end - N / 2) / sr;
    frames.push(r);
    if (++k % 400 === 0) { if (onProgress) onProgress(k / total); await new Promise(res => setTimeout(res, 0)); }
  }
  return frames;
};

E.alignReference = function (frames, events, o) {
  const n = events.length, F = frames.length, S = n + 2;
  if (!F || !n) return null;
  const mf = frames.map(f => E.isVoiced(f, o.gate) ? E.midiFloat(f.f, o.A) : null);
  // 起音強度，再只保留前後 50 毫秒內最強的那一點，避免一個起音被算兩次
  const str = new Float64Array(F);
  for (let i = 2; i < F; i++) {
    const r = frames[i].rms / (Math.min(frames[i - 1].rms, frames[i - 2].rms) + 1e-5);
    const rise = frames[i].rms > o.gate ? Math.max(0, r - 1) : 0;
    // 新的音要「穩定」才算起音：接下來 4 個音框都有聲音、音高不變（排除音尾的閃爍）
    const stable = mf[i] != null && [1, 2, 3, 4].every(k => i + k < F && mf[i + k] != null && Math.abs(mf[i + k] - mf[i]) < 0.5);
    const pch = stable ? (mf[i - 1] == null ? 1.5 : Math.min(2, Math.abs(mf[i] - mf[i - 1]))) : 0;
    // 音高改變是最可靠的起音，優先保留
    str[i] = pch > 0.6 ? 10 + pch : rise > 0.4 ? rise : 0;
  }
  const onset = new Uint8Array(F), W = Math.max(2, Math.round(0.05 / ((frames[1] ? frames[1].t - frames[0].t : 0.0107))));
  for (let i = 0; i < F; i++) {
    if (!str[i]) continue;
    let isMax = true;
    for (let j = Math.max(0, i - W); j <= Math.min(F - 1, i + W); j++) if (str[j] > str[i] || (str[j] === str[i] && j < i)) { isMax = false; break; }
    onset[i] = isMax ? 1 : 0;
  }
  const target = events.map(e => e.midi == null ? null : e.midi + o.transpose);
  // 很弱的「照比例」偏好：只在兩種切法一樣好時（例如同音連拉）決定邊界
  let fv = mf.findIndex(m => m != null), lv = F - 1; while (lv > 0 && mf[lv] == null) lv--;
  const b0 = events[0].start, bTot = events[n - 1].start + events[n - 1].dur - b0;
  const T0 = frames[Math.max(0, fv)].t, T1 = frames[lv].t;
  const expBeat = i => b0 + (frames[i].t - T0) / Math.max(0.1, T1 - T0) * bTot;
  const cost = (i, s) => {
    const m = mf[i];
    if (s === 0 || s === n + 1) return m == null ? 0 : 1;
    const ev = events[s - 1], t = target[s - 1], eb = expBeat(i);
    const out = eb < ev.start ? ev.start - eb : eb > ev.start + ev.dur ? eb - ev.start - ev.dur : 0;
    const bias = 0.0015 * Math.min(out, 4);
    if (t == null) return (m == null ? 0 : 0.7) + bias;
    if (m == null) return 0.9 + bias;
    let d = Math.abs(m - t); d = Math.min(d, Math.abs(d - 12) + 0.5);
    return Math.min(d, 2.5) + bias;
  };
  const back = new Uint8Array(F * S);
  let prev = new Float64Array(S).fill(Infinity), cur = new Float64Array(S);
  prev[0] = cost(0, 0); prev[1] = cost(0, 1) + 0.3;
  for (let i = 1; i < F; i++) {
    for (let s = 0; s < S; s++) {
      const stay = prev[s];
      let adv = Infinity;
      if (s > 0) {
        const toRest = s === n + 1 || target[s - 1] == null;
        adv = prev[s - 1] + (onset[i] ? 0.1 : toRest ? 0.35 : 1.2);
      }
      if (adv < stay) { cur[s] = adv + cost(i, s); back[i * S + s] = 1; }
      else { cur[s] = stay + cost(i, s); back[i * S + s] = 0; }
    }
    const t = prev; prev = cur; cur = t;
  }
  let s = prev[n + 1] <= prev[n] ? n + 1 : n;
  const state = new Int32Array(F);
  for (let i = F - 1; i >= 0; i--) { state[i] = s; if (i > 0 && back[i * S + s]) s--; }
  const onsets = new Array(n).fill(null), centsAt = new Array(n).fill(null);
  const seg = {};
  for (let i = 0; i < F; i++) {
    const st = state[i]; if (st < 1 || st > n) continue;
    if (onsets[st - 1] == null) onsets[st - 1] = frames[i].t;
    (seg[st - 1] = seg[st - 1] || []).push(i);
  }
  let good = 0, tot = 0;
  for (let j = 0; j < n; j++) {
    const idx = seg[j] || [];
    if (target[j] == null) continue;
    const mid = idx.slice(Math.floor(idx.length * 0.25), Math.ceil(idx.length * 0.85)).filter(i => mf[i] != null);
    mid.forEach(i => { tot++; if (Math.abs(mf[i] - target[j]) < 0.75) good++; });
    const near = mid.map(i => (mf[i] - target[j]) * 100).filter(c => Math.abs(c) < 60);
    if (near.length) centsAt[j] = median(near);
  }
  // 修正一：起點落在無聲處時，往後移到真正出聲的那一刻
  const fIdx = tt => { let lo = 0, hi = F - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (frames[m].t < tt) lo = m + 1; else hi = m; } return lo; };
  for (let j = 0; j < n; j++) {
    if (onsets[j] == null || target[j] == null) continue;
    let i = fIdx(onsets[j]);
    if (mf[i] != null) continue;
    const lim = Math.min(F - 1, i + Math.round(0.4 / Math.max(0.005, frames[1].t - frames[0].t)));
    while (i < lim && mf[i] == null) i++;
    if (mf[i] != null) onsets[j] = frames[i].t;
  }
  // 修正二：同音連續時，在兩音之間找最接近「照比例分界」的起音點
  for (let j = 1; j < n; j++) {
    if (target[j] == null || target[j] !== target[j - 1] || onsets[j - 1] == null) continue;
    const st0 = onsets[j - 1], en = j + 1 < n && onsets[j + 1] != null ? onsets[j + 1] : endT;
    if (en - st0 < 0.15) continue;
    const split = st0 + (en - st0) * events[j - 1].dur / (events[j - 1].dur + events[j].dur);
    let best = null;
    for (let i = fIdx(st0 + 0.08); i < F && frames[i].t < en - 0.06; i++) {
      if (!onset[i]) continue;
      if (best == null || Math.abs(frames[i].t - split) < Math.abs(frames[best].t - split)) best = i;
    }
    if (best != null && Math.abs(frames[best].t - split) < (en - st0) * 0.35) {
      let i = best; while (i < F - 1 && mf[i] == null && frames[i].t < en) i++;
      onsets[j] = frames[i].t;
    }
  }
  // 沒對到的音用前後內插補起來
  for (let j = 0; j < n; j++) if (onsets[j] == null) {
    let a = j - 1; while (a >= 0 && onsets[a] == null) a--;
    let b = j + 1; while (b < n && onsets[b] == null) b++;
    if (a >= 0 && b < n) onsets[j] = onsets[a] + (onsets[b] - onsets[a]) * (events[j].start - events[a].start) / (events[b].start - events[a].start || 1);
  }
  const lastF = frames[F - 1].t;
  const endT = (() => { for (let i = F - 1; i >= 0; i--) if (state[i] === n) return frames[i].t; return lastF; })();
  const res = { onsets, centsAt, endT, confidence: tot ? good / tot : 0 };
  if (o.debug) res.debug = { state, onset, mf };
  return res;
};

/* 拍點 ↔ 時間的對照（固定速度或照錄音的彈性速度都用它） */
E.makeTimeMap = function (anchors) {
  // anchors: [{beat, t}]，beat 遞增
  const A = anchors.filter(a => a.t != null).sort((x, y) => x.beat - y.beat);
  const slope = (i, j) => (A[j].t - A[i].t) / (A[j].beat - A[i].beat || 1);
  const head = A.length > 1 ? slope(0, Math.min(A.length - 1, 3)) : 0.6;
  const tail = A.length > 1 ? slope(Math.max(0, A.length - 4), A.length - 1) : 0.6;
  const t = beat => {
    if (!A.length) return 0;
    if (beat <= A[0].beat) return A[0].t + (beat - A[0].beat) * head;
    if (beat >= A[A.length - 1].beat) return A[A.length - 1].t + (beat - A[A.length - 1].beat) * tail;
    let lo = 0, hi = A.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m].beat <= beat) lo = m; else hi = m; }
    return A[lo].t + (beat - A[lo].beat) * slope(lo, hi);
  };
  const beat = time => {
    if (!A.length) return 0;
    if (time <= A[0].t) return A[0].beat + (time - A[0].t) / head;
    if (time >= A[A.length - 1].t) return A[A.length - 1].beat + (time - A[A.length - 1].t) / tail;
    let lo = 0, hi = A.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m].t <= time) lo = m; else hi = m; }
    return A[lo].beat + (time - A[lo].t) / slope(lo, hi);
  };
  return { t, beat, spbHead: head };
};

/* ---------- 整合 ---------- */
E.analyzeEvent = function (ev, frames, o) {
  const chord = !!(ev.note.chord && ev.note.chord.length);
  if (chord) o = Object.assign({}, o, { chord: true });
  const p = ev.midi == null ? null
    : chord ? (o.getSamples ? E.chordEngine(ev, o) : { status: 'chord', level: null })
    : E.pitchEngine(ev, frames, o);
  let r = o.tol.rg == null ? null : E.rhythmEngine(ev, frames, o);
  if (p && p.status === 'missing' && r) r = { level: 'g', skipped: true };
  if (p && p.status === 'nodata') return { p: null, r: null, level: null };
  return { p, r, level: E.worst(p && p.level, r && r.level) };
};

E.describe = function (song, ev, res) {
  const inst = E.INSTR[song.instrument];
  const out = [];
  const p = res.p, r = res.r;
  if (p) {
    if (p.status === 'missing') out.push({ lv: 'r', t: '漏音：沒有聽到這個音' });
    else if (p.status === 'wrong') {
      const heardW = p.heard - inst.transpose;
      out.push({ lv: 'r', t: p.octave ? `${inst.verb}高低差了一個八度` : `${inst.verb}成 ${E.midiName(heardW, song.fifths < 0)}（應為 ${E.noteLabel(ev.note)}）` });
    } else if (p.status === 'sharp' || p.status === 'flat') {
      out.push({ lv: p.level, t: `偏${p.status === 'sharp' ? '高' : '低'} ${Math.round(Math.abs(p.cents))} 音分` });
    } else if (p.status === 'chordmiss') {
      (p.missing || []).forEach(x => {
        const nm = E.midiName(x.m - inst.transpose, song.fifths < 0);
        out.push({ lv: 'r', t: `雙音裡的 ${nm} 沒有聽到${x.heard != null ? `（聽起來像 ${E.midiName(x.heard - inst.transpose, song.fifths < 0)}，可能按錯音）` : '（可能沒拉到這條弦，或按錯音）'}` });
      });
      if (!p.missing) out.push({ lv: 'r', t: '雙音沒有聽到聲音' });
    } else if (p.status === 'chord' && p.pairs) {
      p.pairs.forEach(pr => {
        if (pr.level === 'g') return;
        const nm = m => E.midiName(m - inst.transpose, song.fifths < 0);
        const who = `：把 ${nm(pr.fix.m)} 調${pr.fix.by > 0 ? '高' : '低'}約 ${Math.round(Math.abs(pr.fix.by))} 音分`;
        out.push({ lv: pr.level, t: `雙音${E.intervalName(pr.semis)}太${pr.dev > 0 ? '寬' : '窄'} ${Math.round(Math.abs(pr.dev))} 音分${who}${pr.rough ? '（八度、同音只能粗略判斷）' : ''}` });
      });
      if (p.shift != null) out.push({ lv: 'y', t: `兩個音一起偏${p.shift > 0 ? '高' : '低'}約 ${Math.round(Math.abs(p.shift))} 音分` });
    }
  }
  if (p && p.vocal) {
    if (p.vocal.scoop) out.push({ lv: 'y', t: `起音從下面滑上來（低了約 ${p.vocal.scoop} 音分 才到位），要一開口就唱在音上` });
    if (p.vocal.droop) out.push({ lv: 'y', t: `尾音往下掉約 ${p.vocal.droop} 音分，長音要用氣息撐到最後` });
    if (p.vocal.wobble) out.push({ lv: 'y', t: `聲音搖晃太大（約 ±${p.vocal.wobble} 音分），放鬆喉嚨、穩住氣息` });
  }
  if (res.wait && res.wait.wrong) {
    const heard = [...new Set(res.wait.heard.map(m => E.midiName(m - inst.transpose, song.fifths < 0)))].slice(0, 3).join('、');
    out.push({ lv: res.wait.wrong >= 3 ? 'r' : 'y', t: `先${inst.verb}錯 ${res.wait.wrong} 次${heard ? '（聽到 ' + heard + '）' : ''}` });
  }
  if (r && !r.skipped) {
    if (r.restIssue) out.push({ lv: 'y', t: '休止符沒有停下來' });
    if (r.onsetLevel && r.onsetLevel !== 'g' && r.dt != null)
      out.push({ lv: r.onsetLevel, t: `${r.dt < 0 ? '提前' : '延遲'} ${Math.abs(r.dt).toFixed(2)} 秒` });
    if (r.unclear) out.push({ lv: 'y', t: '起音不清楚，或太晚進來' });
    if (r.staccato && r.lengthLevel === 'y') out.push({ lv: 'y', t: '斷奏要拉短一點，音和音之間要有空隙' });
    else if (r.lengthLevel && r.lengthLevel !== 'g') {
      const n = ev.note;
      const nm = (n.dots ? '附點' : '') + E.DUR_NAME[n.type] + (ev.parts.length > 1 ? '（含連結線）' : '');
      out.push({ lv: r.lengthLevel, t: `${nm}演奏時間不足，只拉了約 ${Math.round(r.lengthRatio * 100)}%` });
    }
  }
  return out;
};

E.whereLabel = function (song, ev) {
  const n = ev.note;
  const nth = n.rest ? '休止符' : `第 ${n.k} 個音 ${E.noteLabel(n)}`;
  let rep = '';
  if (song.pm) { const times = song.pm.filter(p => p.mi === ev.mi); if (times.length > 1) rep = `（第 ${times.findIndex(p => p.pk === ev.pk) + 1} 次）`; }
  return `第 ${ev.mi + 1} 小節${rep}・${nth}・${E.beatLabel(song, ev)}`;
};

/* 一次練習的總結 */
E.summarize = function (song, events, results, range) {
  const levels = {};
  events.forEach(ev => {
    const r = results[ev.idx]; if (!r || !r.level) return;
    levels[ev.mi] = E.worst(levels[ev.mi], r.level);
  });
  const ms = Object.keys(levels).map(Number);
  const cnt = { g: 0, y: 0, r: 0 }; ms.forEach(m => cnt[levels[m]]++);
  const score = ms.length ? Math.round(ms.reduce((a, m) => a + { g: 100, y: 60, r: 0 }[levels[m]], 0) / ms.length) : 0;
  const pitch = [], dts = [], notes = [], pT = [];
  events.forEach(ev => {
    const r = results[ev.idx]; if (!r) return;
    if (r.p && r.p.status === 'chord' && r.p.pairs) {
      pitch.push(r.p.cents);
      r.p.notes.forEach(n => n.c != null && notes.push({ m: n.m - (E.INSTR[song.instrument].transpose), c: Math.round(n.c * 10) / 10 }));
    } else if (r.p && r.p.cents != null && r.p.status !== 'wrong' && r.p.status !== 'chordmiss') { pitch.push(r.p.cents); pT.push({ t: ev.start, c: r.p.cents }); notes.push({ m: ev.midi, c: Math.round(r.p.cents * 10) / 10 }); }
    if (r.r && r.r.dt != null && r.r.how !== 'energy') dts.push({ t: ev.start, dt: r.r.dt * 1000 });
  });
  let drift = null;
  if (dts.length >= 6) {
    const mx = mean(dts.map(x => x.t)), my = mean(dts.map(x => x.dt));
    let num = 0, den = 0; dts.forEach(x => { num += (x.t - mx) * (x.dt - my); den += (x.t - mx) ** 2; });
    drift = den ? num / den * song.fullBeats : 0; // 每小節累積幾毫秒
  }
  return {
    levels, counts: cnt, score,
    pitchAbs: pitch.length ? Math.round(mean(pitch.map(Math.abs)) * 10) / 10 : null,
    pitchBias: pitch.length ? Math.round(mean(pitch) * 10) / 10 : null,
    pitchDrift: (() => {
      if (pT.length < 8) return null;
      const mx = mean(pT.map(x => x.t)), my = mean(pT.map(x => x.c));
      let nu = 0, de = 0; pT.forEach(x => { nu += (x.t - mx) * (x.c - my); de += (x.t - mx) ** 2; });
      return de ? Math.round(nu / de * (pT[pT.length - 1].t - pT[0].t)) : 0;
    })(),
    vibrato: (() => { const vs = events.map(ev => results[ev.idx] && results[ev.idx].p && results[ev.idx].p.vibrato).filter(Boolean); return vs.length ? { n: vs.length, rate: Math.round(mean(vs.map(v => v.rate)) * 10) / 10, width: Math.round(mean(vs.map(v => v.width))) } : null; })(),
    rhythmStd: dts.length >= 3 ? Math.round(std(dts.map(x => x.dt))) : null,
    rhythmMean: dts.length ? Math.round(mean(dts.map(x => x.dt))) : null,
    drift: drift == null ? null : Math.round(drift),
    notes
  };
};

if (typeof module !== 'undefined' && module.exports) module.exports = E;
else root.Engine = E;
})(this);
