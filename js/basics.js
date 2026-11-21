/* 練琴小幫手（© 悠樂媽媽 製作，僅供個人與教學非商業使用） — 基本功（空弦、音階、琶音、換弦、長音），分級檢核 */
(function () {
'use strict';
const B = {};
const LET = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACC = { 2: '##', 1: '#', 0: '', '-1': 'b', '-2': 'bb' };
const SCALE = {
  major: [0, 2, 4, 5, 7, 9, 11],
  harm: [0, 2, 3, 5, 7, 8, 11],
  melUp: [0, 2, 3, 5, 7, 9, 11],
  natural: [0, 2, 3, 5, 7, 8, 10]
};
/* 依調的字母拼音，算出正確的升降（例如 F 大調用 Bb 不用 A#） */
function spell(tonicLetter, tonicMidi, degree, semis) {
  const li = (LET.indexOf(tonicLetter) + degree) % 7, letter = LET[li];
  const oct = Math.floor((tonicMidi + semis) / 12) - 1;
  let alter = ((tonicMidi + semis) % 12) - NAT[letter];
  if (alter > 6) alter -= 12; if (alter < -6) alter += 12;
  let octave = oct;
  // 跨過 B→C 時八度要算對
  const midi = 12 * (octave + 1) + NAT[letter] + alter;
  if (midi - (tonicMidi + semis) === 12) octave--; else if (midi - (tonicMidi + semis) === -12) octave++;
  return letter + (ACC[alter] || '') + octave;
}
/* 產生一首練習曲（練琴小幫手格式） */
B.make = function (o) {
  // o: { title, tonic:'G', tonicMidi:55, mode:'major'|'minor', minorType:'harm'|'mel', octaves, rhythm:'q'|'8'|'16', arp, tempo, instrument }
  const letter = o.tonic[0];
  const up = [], down = [];
  const per = o.arp ? 3 : 7;
  const shape = o.arp ? (o.mode === 'minor' ? [0, 3, 7] : [0, 4, 7]) : (o.mode === 'minor' ? (o.minorType === 'mel' ? SCALE.melUp : SCALE.harm) : SCALE.major);
  const degs = o.arp ? [0, 2, 4] : [0, 1, 2, 3, 4, 5, 6];
  for (let k = 0; k < o.octaves; k++) for (let i = 0; i < per; i++) up.push(spell(letter, o.tonicMidi, degs[i] + 7 * k, shape[i] + 12 * k));
  const top = spell(letter, o.tonicMidi, 7 * o.octaves, 12 * o.octaves);
  let downShape = shape, downDegs = degs;
  if (o.mode === 'minor' && o.minorType === 'mel' && !o.arp) downShape = SCALE.natural; // 旋律小音階下行用自然小音階
  for (let k = o.octaves - 1; k >= 0; k--) for (let i = per - 1; i >= 0; i--) down.push(spell(letter, o.tonicMidi, downDegs[i] + 7 * k, downShape[i] + 12 * k));
  const seq = up.concat([top]).concat(down.slice(0, -1));
  const per4 = { q: 4, '8': 8, '16': 16 }[o.rhythm || 'q'];
  const measures = [];
  for (let i = 0; i < seq.length; i += per4) {
    const chunk = seq.slice(i, i + per4);
    measures.push(chunk.map((p, j) => p + (j === 0 ? ':' + (o.rhythm || 'q') + (o.slur && chunk.length > 1 ? '{(}' : '') : (o.slur && j === chunk.length - 1 && chunk.length > 1 ? '{)}' : ''))).join(' '));
  }
  // 最後一小節補滿，再加一個長音主音
  const last = measures[measures.length - 1].split(' ').length;
  if (last < per4) {
    const fill = per4 - last;
    const restDur = { q: ['q', 'h', 'h.', 'w'], '8': ['8', 'q', 'q.', 'h', 'h8', 'h.', 'h.8'], '16': [] }[o.rhythm || 'q'];
    if ((o.rhythm || 'q') === 'q') measures[measures.length - 1] += ' R:' + ['q', 'h', 'h.'][fill - 1];
    else { const beats = fill * ({ '8': 0.5, '16': 0.25 }[o.rhythm]); const parts = []; let b = beats; [[2, 'h'], [1, 'q'], [0.5, '8'], [0.25, '16']].forEach(([v, t]) => { while (b >= v - 1e-9) { parts.push('R:' + t); b -= v; } }); measures[measures.length - 1] += ' ' + parts.join(' '); }
  }
  measures.push(spell(letter, o.tonicMidi, 0, 0) + ':w');
  const keyName = o.tonic + (o.mode === 'minor' ? 'm' : '');
  return {
    title: o.title, composer: '基本功', instrument: o.instrument || 'violin', tempo: o.tempo || 60, time: '4/4', key: keyName,
    notes: o.notes || '', measures, basics: true
  };
};
/* 空弦長弓、換弦 */
B.openStrings = function (inst, rhythm, tempo) {
  const S = { violin: ['G3', 'D4', 'A4', 'E5'], viola: ['C3', 'G3', 'D4', 'A4'], cello: ['C2', 'G2', 'D3', 'A3'] }[inst] || ['G3', 'D4', 'A4', 'E5'];
  if (rhythm === 'w') return { title: '空弦長弓', instrument: inst, tempo, time: '4/4', key: 'C', notes: '每條弦拉一整個全音符，一弓拉滿，聲音大小一樣、不抖。', measures: S.flatMap(n => [n + ':w{dn}', n + ':w{up}']) };
  // 換弦：相鄰兩弦來回
  const ms = [];
  for (let i = 0; i < 3; i++) { ms.push(`${S[i]}:8{dn} ${S[i + 1]} ${S[i]} ${S[i + 1]} ${S[i]} ${S[i + 1]} ${S[i]} ${S[i + 1]}`); }
  for (let i = 3; i > 0; i--) { ms.push(`${S[i]}:8{dn} ${S[i - 1]} ${S[i]} ${S[i - 1]} ${S[i]} ${S[i - 1]} ${S[i]} ${S[i - 1]}`); }
  ms.push(S[1] + ':w');
  return { title: '換弦練習', instrument: inst, tempo, time: '4/4', key: 'C', notes: '相鄰兩條弦來回，手臂高度換得乾淨，不要碰到別條弦。', measures: ms };
};
/* 直笛：長音、吐音 */
B.recorder = {
  long: () => ({ title: '直笛長音', instrument: 'recorder-s', tempo: 60, time: '4/4', key: 'C', notes: '每個音吹滿 4 拍，氣要穩、音不能晃。', measures: ['G4:w', 'A4:w', 'B4:w', 'C5:w', 'D5:w', 'E4:w', 'D4:w', 'C4:w'] }),
  tongue: () => ({ title: '直笛吐音', instrument: 'recorder-s', tempo: 72, time: '4/4', key: 'C', notes: '每個音都用舌頭輕輕說「tu」，音頭清楚、不要用吹的。', measures: ['G4:8 G4 G4 G4 A4 A4 A4 A4', 'B4:8 B4 B4 B4 A4 A4 A4 A4', 'G4:8 G4 A4 A4 B4 B4 C5 C5', 'G4:w'] })
};
/* 人聲：長音、和弦琶音 */
B.voice = {
  long: () => ({ title: '長音穩定', instrument: 'voice', tempo: 60, time: '4/4', key: 'C', notes: '每個長音吸飽氣，唱滿 4 拍，音高不往下掉。', measures: ['C4:w', 'E4:w', 'G4:w', 'E4:w', 'C4:w'], lyrics: ['A', 'A', 'A', 'A', 'A'] }),
  arp: () => ({ title: '和弦琶音（Do Mi Sol）', instrument: 'voice', tempo: 72, time: '4/4', key: 'C', notes: '唱 Do-Mi-Sol-Do 再下來，每個音都要對準，不要用滑的。', measures: ['C4 E4 G4 C5', 'G4 E4 C4:h'] })
};

/* 分級清單 */
B.levels = function (inst) {
  const L = [];
  const v = inst === 'violin';
  if (v || inst === 'viola' || inst === 'cello') {
    L.push({ lv: 1, name: '第 1 級：空弦', items: [
      { id: 'open-long', name: '空弦長弓（全音符）', make: () => B.openStrings(inst, 'w', 60), goal: { mode: 'advanced', speed: 100 } },
      { id: 'open-cross', name: '換弦（八分音符）', make: () => B.openStrings(inst, '8', 60), goal: { mode: 'advanced', speed: 100 } }
    ] });
  }
  if (v) {
    L.push({ lv: 2, name: '第 2 級：一個八度音階（第一把位）', items: [
      { id: 'sc-D1', name: 'D 大調音階', make: () => B.make({ title: 'D 大調音階（一個八度）', tonic: 'D', tonicMidi: 62, mode: 'major', octaves: 1, rhythm: 'q', tempo: 72 }), goal: { mode: 'advanced', speed: 100 } },
      { id: 'sc-A1', name: 'A 大調音階', make: () => B.make({ title: 'A 大調音階（一個八度）', tonic: 'A', tonicMidi: 69, mode: 'major', octaves: 1, rhythm: 'q', tempo: 72 }), goal: { mode: 'advanced', speed: 100 } },
      { id: 'sc-G1', name: 'G 大調音階', make: () => B.make({ title: 'G 大調音階（一個八度）', tonic: 'G', tonicMidi: 55, mode: 'major', octaves: 1, rhythm: 'q', tempo: 72 }), goal: { mode: 'advanced', speed: 100 } },
      { id: 'sc-C1', name: 'C 大調音階', make: () => B.make({ title: 'C 大調音階（一個八度）', tonic: 'C', tonicMidi: 60, mode: 'major', octaves: 1, rhythm: 'q', tempo: 72 }), goal: { mode: 'advanced', speed: 100 } }
    ] });
    L.push({ lv: 3, name: '第 3 級：琶音與八分音符音階', items: [
      { id: 'ar-D1', name: 'D 大調琶音', make: () => B.make({ title: 'D 大調琶音', tonic: 'D', tonicMidi: 62, mode: 'major', octaves: 1, arp: true, rhythm: 'q', tempo: 72 }), goal: { mode: 'advanced', speed: 100 } },
      { id: 'ar-G1', name: 'G 大調琶音', make: () => B.make({ title: 'G 大調琶音', tonic: 'G', tonicMidi: 55, mode: 'major', octaves: 1, arp: true, rhythm: 'q', tempo: 72 }), goal: { mode: 'advanced', speed: 100 } },
      { id: 'sc-D1-8', name: 'D 大調音階（八分音符、兩音一弓）', make: () => B.make({ title: 'D 大調音階（八分音符）', tonic: 'D', tonicMidi: 62, mode: 'major', octaves: 1, rhythm: '8', tempo: 72 }), goal: { mode: 'advanced', speed: 100 } },
      { id: 'sc-am1', name: 'a 小調音階（和聲小音階）', make: () => B.make({ title: 'a 小調和聲小音階', tonic: 'A', tonicMidi: 69, mode: 'minor', minorType: 'harm', octaves: 1, rhythm: 'q', tempo: 72 }), goal: { mode: 'advanced', speed: 100 } }
    ] });
    L.push({ lv: 4, name: '第 4 級：兩個八度（第一把位）', items: [
      { id: 'sc-G2', name: 'G 大調兩個八度', make: () => B.make({ title: 'G 大調音階（兩個八度）', tonic: 'G', tonicMidi: 55, mode: 'major', octaves: 2, rhythm: '8', tempo: 72 }), goal: { mode: 'advanced', speed: 100 } },
      { id: 'sc-A2', name: 'A 大調兩個八度', make: () => B.make({ title: 'A 大調音階（兩個八度）', tonic: 'A', tonicMidi: 57, mode: 'major', octaves: 2, rhythm: '8', tempo: 72 }), goal: { mode: 'advanced', speed: 100 } },
      { id: 'ar-G2', name: 'G 大調琶音兩個八度', make: () => B.make({ title: 'G 大調琶音（兩個八度）', tonic: 'G', tonicMidi: 55, mode: 'major', octaves: 2, arp: true, rhythm: '8', tempo: 72 }), goal: { mode: 'advanced', speed: 100 } },
      { id: 'sc-gm2', name: 'g 小調旋律小音階兩個八度', make: () => B.make({ title: 'g 小調旋律小音階（兩個八度）', tonic: 'G', tonicMidi: 55, mode: 'minor', minorType: 'mel', octaves: 2, rhythm: '8', tempo: 72 }), goal: { mode: 'advanced', speed: 100 } }
    ] });
    L.push({ lv: 5, name: '第 5 級：三個八度（比賽常考，需換把位）', items: [
      { id: 'sc-G3', name: 'G 大調三個八度', make: () => B.make({ title: 'G 大調音階（三個八度）', tonic: 'G', tonicMidi: 55, mode: 'major', octaves: 3, rhythm: '8', tempo: 80, notes: '換把位的指法請照老師指定的。' }), goal: { mode: 'contest', speed: 100 } },
      { id: 'sc-A3', name: 'A 大調三個八度', make: () => B.make({ title: 'A 大調音階（三個八度）', tonic: 'A', tonicMidi: 57, mode: 'major', octaves: 3, rhythm: '8', tempo: 80, notes: '換把位的指法請照老師指定的。' }), goal: { mode: 'contest', speed: 100 } },
      { id: 'ar-G3', name: 'G 大調琶音三個八度', make: () => B.make({ title: 'G 大調琶音（三個八度）', tonic: 'G', tonicMidi: 55, mode: 'major', octaves: 3, arp: true, rhythm: '8', tempo: 80, notes: '換把位的指法請照老師指定的。' }), goal: { mode: 'contest', speed: 100 } }
    ] });
  }
  if (/recorder/.test(inst)) {
    L.push({ lv: 1, name: '第 1 級：長音與吐音', items: [
      { id: 'rec-long', name: '長音', make: B.recorder.long, goal: { mode: 'advanced', speed: 100 } },
      { id: 'rec-tongue', name: '吐音', make: B.recorder.tongue, goal: { mode: 'advanced', speed: 100 } }
    ] });
    L.push({ lv: 2, name: '第 2 級：音階', items: [
      { id: 'rec-C', name: 'C 大調音階', make: () => B.make({ title: '直笛 C 大調音階', tonic: 'C', tonicMidi: 60, mode: 'major', octaves: 1, rhythm: 'q', tempo: 72, instrument: 'recorder-s' }), goal: { mode: 'advanced', speed: 100 } },
      { id: 'rec-G', name: 'G 大調音階', make: () => B.make({ title: '直笛 G 大調音階', tonic: 'G', tonicMidi: 67, mode: 'major', octaves: 1, rhythm: 'q', tempo: 72, instrument: 'recorder-s' }), goal: { mode: 'advanced', speed: 100 } },
      { id: 'rec-F', name: 'F 大調音階', make: () => B.make({ title: '直笛 F 大調音階', tonic: 'F', tonicMidi: 65, mode: 'major', octaves: 1, rhythm: 'q', tempo: 72, instrument: 'recorder-s' }), goal: { mode: 'advanced', speed: 100 } }
    ] });
  }
  if (E_isVocal(inst)) {
    L.push({ lv: 1, name: '第 1 級：暖身與長音', items: [
      { id: 'v-long', name: '長音穩定', make: B.voice.long, goal: { mode: 'advanced', speed: 100 } },
      { id: 'v-arp', name: '和弦琶音', make: B.voice.arp, goal: { mode: 'advanced', speed: 100 } },
      { id: 'v-scale', name: 'C 大調音階', make: () => B.make({ title: '人聲 C 大調音階', tonic: 'C', tonicMidi: 60, mode: 'major', octaves: 1, rhythm: 'q', tempo: 72, instrument: 'voice' }), goal: { mode: 'advanced', speed: 100 } }
    ] });
  }
  return L;
};
const E_isVocal = i => window.Engine && window.Engine.isVocal(i);
window.BASICS = B;
})();
