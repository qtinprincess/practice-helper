/* 練琴小幫手（© 悠樂媽媽 製作，僅供個人與教學非商業使用） — 樂譜記號說明（點一下樂譜上的記號就會出現） */
(function () {
'use strict';
const X = {};
const DUR = {
  w: ['全音符', '4 拍', '空心、沒有符桿的音符。四分音符當一拍時，要拉滿 4 拍。'],
  h: ['二分音符', '2 拍', '空心、有符桿。拉 2 拍，心裡數「1、2」。'],
  q: ['四分音符', '1 拍', '實心、有符桿。最常見的一拍音符。'],
  '8': ['八分音符', '半拍', '有一條旗子（或一條橫槓連在一起）。兩個八分音符合起來是一拍。'],
  '16': ['十六分音符', '四分之一拍', '有兩條旗子或兩條橫槓。四個十六分音符合起來是一拍。'],
  '32': ['三十二分音符', '八分之一拍', '有三條旗子或橫槓，非常快。']
};
const REST = { w: '全休止符：掛在第四線下面的小黑塊。休息一整個小節。', h: '二分休止符：坐在第三線上的小黑塊。休息 2 拍。', q: '四分休止符：像閃電的符號。休息 1 拍。', '8': '八分休止符：像數字 7。休息半拍。', '16': '十六分休止符：兩個勾的 7。休息四分之一拍。', '32': '三十二分休止符：三個勾。休息八分之一拍。' };
const SOLF = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const ACC_NAME = { 2: '重升記號 𝄪（升高兩個半音）', 1: '升記號 ♯（升高半音）', 0: '還原記號 ♮（回到原本的音）', '-1': '降記號 ♭（降低半音）', '-2': '重降記號 𝄫（降低兩個半音）' };
X.DYN = {
  ppp: ['ppp', '極弱', '非常非常小聲，像在說悄悄話。'],
  pp: ['pp', '很弱（pianissimo）', '很小聲，弓要輕、靠近指板。'],
  p: ['p', '弱（piano）', '小聲。弓速慢一點、壓力輕一點。'],
  mp: ['mp', '中弱（mezzo piano）', '有點小聲，比 p 大一點。'],
  mf: ['mf', '中強（mezzo forte）', '有點大聲，是最常見的音量。'],
  f: ['f', '強（forte）', '大聲。弓速快一點、壓力多一點，但不要壓出雜音。'],
  ff: ['ff', '很強（fortissimo）', '很大聲，要用整條手臂的重量，聲音仍要乾淨。'],
  fff: ['fff', '極強', '非常非常大聲。'],
  fp: ['fp', '強後突弱', '一開始大聲，馬上變小聲。'],
  sf: ['sf', '突強（sforzando）', '這一個音突然加重。'],
  sfz: ['sfz', '突強（sforzando）', '這一個音突然加重。']
};
X.ART = {
  st: ['斷奏（staccato）', '音符上或下的小圓點。音要短、分開，音和音之間有空隙。小提琴常用短弓或在弦上「停一下」。小幫手會檢查你有沒有拉得夠短。'],
  ten: ['保持音（tenuto）', '音符上的一條短橫線。這個音要拉滿、拉飽，稍微強調。'],
  acc: ['重音（accent）', '像「>」的符號。這個音開頭要用力一點，再放鬆。'],
  marc: ['強重音（marcato）', '像「^」的符號。比一般重音更強、更有力。'],
  fer: ['延長記號（fermata）', '像一隻眼睛的符號。這個音可以停久一點，大約多一半的時間，再接下去。小幫手的節拍器會自動等你。'],
  tr: ['顫音（trill）', '寫著「tr」。這個音和上面一個音快速交替。小幫手只檢查主音有沒有拉到。']
};
X.TEMPO = [
  [/grave/i, 'Grave：極慢、莊嚴'], [/largo/i, 'Largo：最慢板，寬廣'], [/lento/i, 'Lento：慢板'], [/adagio/i, 'Adagio：慢板，從容'],
  [/andantino/i, 'Andantino：小行板，比 Andante 稍快'], [/andante/i, 'Andante：行板，像走路的速度'], [/moderato/i, 'Moderato：中板'],
  [/allegretto/i, 'Allegretto：小快板'], [/allegro/i, 'Allegro：快板，活潑'], [/vivace/i, 'Vivace：活潑的快板'], [/presto/i, 'Presto：急板，非常快'],
  [/cantabile/i, 'cantabile：如歌地'], [/dolce/i, 'dolce：甜美地、柔和地'], [/espressivo|espr/i, 'espressivo：有表情地'], [/maestoso/i, 'maestoso：莊嚴地'], [/grazioso/i, 'grazioso：優雅地'], [/legato/i, 'legato：圓滑、連貫地']
];
X.tempoMeaning = t => { const f = X.TEMPO.filter(([re]) => re.test(t)).map(x => x[1]); return f.length ? f.join('；') : ''; };

X.clef = c => ({
  treble: ['高音譜號（G 譜號）', '捲捲的那個符號。它的中心圈住第二線，表示第二線是 G（Sol）。小提琴、直笛、女聲都用高音譜號。'],
  alto: ['中音譜號（C 譜號）', '像兩個 C 背靠背。它的中心對準第三線，表示第三線是中央 C（Do）。中提琴用這個譜號。'],
  tenor: ['次中音譜號（C 譜號）', '中心對準第四線，第四線是中央 C。大提琴、低音管拉高音時會用。'],
  bass: ['低音譜號（F 譜號）', '像一個反過來的 C 加兩個點。兩個點夾住第四線，表示第四線是 F（Fa）。大提琴、男低音、鋼琴左手用這個譜號。']
}[c] || ['譜號', '告訴你五線譜上每一條線、每一個間是什麼音。']);
X.key = (fifths, minor, keyLabel, violin) => {
  const SH = ['F', 'C', 'G', 'D', 'A', 'E', 'B'], FL = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
  let notes = '';
  if (fifths > 0) notes = `要升的音：${SH.slice(0, fifths).map(n => n + '（' + SOLF[n] + '）').join('、')}。整首曲子遇到這些音都要升高半音，除非有還原記號。`;
  else if (fifths < 0) notes = `要降的音：${FL.slice(0, -fifths).map(n => n + '（' + SOLF[n] + '）').join('、')}。整首曲子遇到這些音都要降低半音，除非有還原記號。`;
  else notes = '沒有升降記號，全部都是白鍵的音。';
  return ['調號', `${keyLabel}。${notes}${violin && fifths > 0 && fifths <= 3 ? '小提琴上，升 F 要用「高 2 指」（在 D 弦、E 弦上）。' : ''}`];
};
X.time = (n, d) => {
  const unit = { 2: '二分音符', 4: '四分音符', 8: '八分音符', 16: '十六分音符' }[d] || '音符';
  let tip = '';
  if (n === 6 && d === 8) tip = '6/8 拍通常感覺成「兩大拍」，每一大拍是三個八分音符（1-2-3、4-5-6）。';
  else if (n === 3) tip = '三拍子像跳華爾滋：強、弱、弱。';
  else if (n === 4) tip = '四拍子：強、弱、次強、弱。';
  else if (n === 2) tip = '二拍子像走路：強、弱。';
  return ['拍號', `上面的 ${n} 表示「每小節有 ${n} 拍」；下面的 ${d} 表示「以${unit}當一拍」。${tip}`];
};

/* 音符：名稱、時值、唱名、指法、記號 */
X.note = function (n, ctx) {
  const parts = [];
  if (n.rest) return { title: '休止符', body: REST[n.type] + (n.dots ? ' 有附點，再多休息一半。' : ''), dur: true };
  const d = DUR[n.type] || ['音符', '', ''];
  let beats = d[1];
  if (n.dots) beats += n.dots === 1 ? '再加一半（附點）' : '再加四分之三（複附點）';
  if (n.triplet) beats = '三連音：三個音平分原本兩個音的時間';
  const pitchName = `${n.step}${n.alter > 0 ? '♯' : n.alter < 0 ? '♭' : ''}${n.octave}`;
  parts.push(`<b>${pitchName}</b>　唱名 ${SOLF[n.step]}${ctx.movable ? `（首調唱名 ${ctx.movable}）` : ''}`);
  parts.push(`<b>${d[0]}</b>：${beats}。${d[2]}`);
  if (n.dots) parts.push('<b>附點</b>：音符右邊的小點，讓這個音變長一半。例如附點四分音符＝1 拍半。');
  if (n.tieStart) parts.push('<b>連結線</b>：連到下一個<u>同樣高度</u>的音，兩個音接起來拉成一個長音，第二個音不要重新出弓。');
  if (n.slur === 'start') parts.push('<b>圓滑線</b>（從這裡開始）：連起不同高度的音，要在<u>同一弓</u>裡拉完，聲音連貫不斷。');
  if (n.slur === 'stop') parts.push('<b>圓滑線</b>到這裡結束，下一個音換弓。');
  if (ctx.accShown != null) parts.push(`<b>臨時記號</b>：${ACC_NAME[ctx.accShown]}。只在這一小節有效，到下一小節就回到調號的音。`);
  (n.art || []).forEach(a => { const A = X.ART[a]; if (A) parts.push(`<b>${A[0]}</b>：${A[1]}`); });
  if (n.dyn) { const D = X.DYN[n.dyn]; if (D) parts.push(`<b>${D[0]}　${D[1]}</b>：${D[2]}`); }
  if (n.wedge === 'cresc') parts.push('<b>漸強（＜ 或 cresc.）</b>：從這裡開始慢慢變大聲。');
  if (n.wedge === 'dim') parts.push('<b>漸弱（＞ 或 dim.）</b>：從這裡開始慢慢變小聲。');
  if (n.bow === 'down') parts.push('<b>下弓（⊓）</b>：從弓根往弓尖拉，手往外推。');
  if (n.bow === 'up') parts.push('<b>上弓（V）</b>：從弓尖往弓根拉，手往內收。');
  if (n.fing != null) parts.push(`<b>指法 ${n.fing}</b>：${n.fing === '0' ? '空弦（不按手指）' : '用第 ' + n.fing + ' 指按（食指是 1、中指 2、無名指 3、小指 4）'}。`);
  if (n.pos) parts.push(`<b>第 ${n.pos} 把位</b>：左手要移到第 ${n.pos} 把位的位置。`);
  if (n.breath) parts.push('<b>換氣記號（,）</b>：唱歌、吹直笛在這裡換氣；拉琴時在這裡稍微分開，像說話的逗點。');
  if (n.chord) parts.push('<b>雙音</b>：兩個音一起拉，弓要同時壓在兩條弦上，兩個音要一樣大聲。');
  if (n.lyric) parts.push(`<b>歌詞</b>：唱「${n.lyric}」。`);
  if (ctx.finger) parts.push(`<b>參考指法</b>：${ctx.finger}`);
  if (ctx.annot) parts.push(`<b>老師的提醒</b>：${ctx.annot}`);
  return { title: `${pitchName}　${d[0]}`, body: parts.join('<br>'), play: true };
};

X.measure = function (attr) {
  const out = [];
  if (!attr) return out;
  if (attr.repStart) out.push(['反覆記號（開始）', '粗線＋細線＋兩個點，點在右邊。反覆的段落從這裡開始。']);
  if (attr.repEnd) out.push(['反覆記號（結束）', `兩個點在粗線左邊。拉到這裡要回到「開始的反覆記號」（沒有的話回到曲子開頭）再拉${attr.repEnd > 2 ? '，總共拉 ' + attr.repEnd + ' 次' : '一次'}。`]);
  if (attr.ending) out.push([`第 ${attr.ending.join('、')} 房（反覆跳房）`, `上面有括號和數字的小節。第 ${attr.ending.join('、')} 次拉到這裡時才拉這一房，其他次跳過。`]);
  if (attr.tempo || attr.tempoText) out.push(['速度記號', `${attr.tempoText ? attr.tempoText + '　' : ''}${attr.tempo ? '♩ = ' + attr.tempo + '，每分鐘 ' + attr.tempo + ' 拍。' : ''}${attr.tempoText ? X.tempoMeaning(attr.tempoText) : ''}`]);
  if (attr.rit) out.push(['rit.（漸慢）', 'ritardando／rallentando：從這裡開始慢慢變慢。小幫手的節拍器會跟著慢下來。']);
  if (attr.accel) out.push(['accel.（漸快）', 'accelerando：從這裡開始慢慢變快。']);
  if (attr.atempo) out.push(['a tempo（回原速）', '回到原本的速度。']);
  if (attr.jump === 'dc') out.push(['D.C.（從頭反覆）', `Da Capo：回到曲子最開頭再拉一次${attr.al === 'fine' ? '，拉到 Fine 結束' : attr.al === 'coda' ? '，拉到 To Coda 時跳到 Coda' : ''}。第二次通常不再重複反覆記號。`]);
  if (attr.jump === 'ds') out.push(['D.S.（從記號反覆）', `Dal Segno：回到 𝄋 記號的地方再拉${attr.al === 'fine' ? '，拉到 Fine 結束' : attr.al === 'coda' ? '，拉到 To Coda 時跳到 Coda' : ''}。`]);
  if (attr.fine) out.push(['Fine（結束）', '從頭反覆（D.C.）或從記號反覆（D.S.）回來時，拉到這裡就結束。第一次經過時不用停。']);
  if (attr.segno) out.push(['𝄋 記號（Segno）', 'D.S. 要回來的地方。']);
  if (attr.toCoda) out.push(['To Coda（跳到尾奏）', '反覆回來第二次經過這裡時，跳到 𝄌 Coda 尾奏。']);
  if (attr.coda) out.push(['𝄌 Coda（尾奏）', '曲子最後的結尾段落。']);
  if (attr.time) out.push(X.time(attr.time[0], attr.time[1]));
  if (attr.text) out.push(['文字記號', attr.text + (X.tempoMeaning(attr.text) ? '：' + X.tempoMeaning(attr.text) : '')]);
  return out;
};

X.lamp = ['燈號', '綠燈：這一小節音準和節奏都在標準內。黃燈：稍微不準。紅燈：需要重拉。灰色：還沒練。'];
window.EXPLAIN = X;
})();
