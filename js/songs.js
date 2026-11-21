/* 內建範例樂曲（皆為公版旋律） */
window.BUILTIN_SONGS = [
  {
    id: 'demo-scale-d', title: 'D 大調音階', composer: '基本練習', instrument: 'violin',
    tempo: 72, time: '4/4', key: 'D',
    notes: '一個八度上行再下行。先用初學模式確認每個音的手指位置，再用進階模式跟節拍器。',
    measures: ['D4 E4 F#4 G4', 'A4 B4 C#5 D5', 'D5 C#5 B4 A4', 'G4 F#4 E4 D4',
      'D4:8 E4 F#4 G4 A4 B4 C#5 D5', 'D5:8 C#5 B4 A4 G4 F#4 E4 D4', 'D4:w']
  },
  {
    id: 'demo-twinkle', title: '小星星', composer: '法國民謠', instrument: 'violin',
    tempo: 84, time: '4/4', key: 'D',
    measures: ['D4 D4 A4 A4', 'B4 B4 A4:h', 'G4 G4 F#4 F#4', 'E4 E4 D4:h',
      'A4 A4 G4 G4', 'F#4 F#4 E4:h', 'A4 A4 G4 G4', 'F#4 F#4 E4:h',
      'D4 D4 A4 A4', 'B4 B4 A4:h', 'G4 G4 F#4 F#4', 'E4 E4 D4:h']
  },
  {
    id: 'demo-joy', title: '歡樂頌', composer: '貝多芬', instrument: 'violin',
    tempo: 96, time: '4/4', key: 'D',
    measures: ['F#4 F#4 G4 A4', 'A4 G4 F#4 E4', 'D4 D4 E4 F#4', 'F#4:q. E4:8 E4:h',
      'F#4 F#4 G4 A4', 'A4 G4 F#4 E4', 'D4 D4 E4 F#4', 'E4:q. D4:8 D4:h']
  },
  {
    id: 'demo-double', title: '雙音練習', composer: '基本練習', instrument: 'violin',
    tempo: 60, time: '4/4', key: 'D',
    notes: '先拉兩條空弦的五度，再加手指拉三度、六度。純律五度要聽不到「嗡嗡」的拍音。',
    measures: ['D4+A4:w', 'G3+D4:w', 'A4+E5:w', 'D4+F#4:h D4+A4:h', 'A4+C#5:h A4+E5:h', 'D4+B4:h D4+A4:h', 'G3+B3:h G3+D4:h', 'D4+A4:w']
  },
  {
    id: 'demo-joy-duet', title: '歡樂頌（二重奏）', composer: '貝多芬', tempo: 92, time: '4/4', key: 'D',
    notes: '兩個聲部：可以選第一部或第二部練習，另一部會當伴奏。',
    parts: [
      { name: '第一部', instrument: 'violin', measures: ['F#4 F#4 G4 A4', 'A4 G4 F#4 E4', 'D4 D4 E4 F#4', 'F#4:q. E4:8 E4:h', 'F#4 F#4 G4 A4', 'A4 G4 F#4 E4', 'D4 D4 E4 F#4', 'E4:q. D4:8 D4:h'] },
      { name: '第二部', instrument: 'violin', measures: ['D4 D4 E4 F#4', 'F#4 E4 D4 C#4', 'A3 A3 C#4 D4', 'D4:q. C#4:8 C#4:h', 'D4 D4 E4 F#4', 'F#4 E4 D4 C#4', 'A3 A3 C#4 D4', 'C#4:q. A3:8 A3:h'] }
    ]
  },
  {
    id: 'demo-warmup', title: '發聲練習', composer: '合唱暖身', instrument: 'voice',
    tempo: 80, time: '4/4', key: 'C',
    notes: '用「Ma、Me、Mi、Mo、Mu」唱五度上下行。唱得舒服後，用「移調」每次升高半音再唱一次。',
    measures: ['C4 D4 E4 F4', 'G4 F4 E4 D4', 'C4:w', 'C4:8 E4 G4 E4 C4:h', 'C4:w{fer}'],
    lyrics: ['Ma Ma Ma Ma', 'Ma Ma Ma Ma', 'Ma', 'Mi Mi Mi Mi Mi', 'Mu']
  },
  {
    id: 'demo-twinkle-choir', title: '小星星（二部合唱）', composer: '法國民謠', tempo: 84, time: '4/4', key: 'C',
    notes: '選「我的聲部」唱女高或女低，另一部會當伴奏。先單獨唱準，再開伴奏合唱。',
    parts: [
      { name: '女高音', instrument: 'soprano',
        measures: ['C4 C4 G4 G4', 'A4 A4 G4:h', 'F4 F4 E4 E4', 'D4 D4 C4:h', 'G4 G4 F4 F4', 'E4 E4 D4:h', 'G4 G4 F4 F4', 'E4 E4 D4:h', 'C4 C4 G4 G4', 'A4 A4 G4:h', 'F4 F4 E4 E4', 'D4 D4 C4:h{fer}'],
        lyrics: ['一 閃 一 閃', '亮 晶 晶', '滿 天 都 是', '小 星 星', '掛 在 天 上', '放 光 明', '好 像 許 多', '小 眼 睛', '一 閃 一 閃', '亮 晶 晶', '滿 天 都 是', '小 星 星'] },
      { name: '女低音', instrument: 'alto',
        measures: ['C4 C4 E4 E4', 'F4 F4 E4:h', 'D4 D4 C4 C4', 'B3 B3 C4:h', 'E4 E4 D4 D4', 'C4 C4 B3:h', 'E4 E4 D4 D4', 'C4 C4 B3:h', 'C4 C4 E4 E4', 'F4 F4 E4:h', 'D4 D4 C4 C4', 'B3 B3 C4:h{fer}'],
        lyrics: ['一 閃 一 閃', '亮 晶 晶', '滿 天 都 是', '小 星 星', '掛 在 天 上', '放 光 明', '好 像 許 多', '小 眼 睛', '一 閃 一 閃', '亮 晶 晶', '滿 天 都 是', '小 星 星'] }
    ]
  },
  {"title":"費華 60 首練習曲 第 7 首","composer":"F. 費華（打譜：Philipp Büttgenbach，CC BY-SA 4.0）","instrument":"violin","tempo":123,"time":"4/4","key":"Bb","notes":"中庸的快板。原速每分鐘 123 拍，可以先把速度調到 60–70% 練。樂譜來源：IMSLP #449577，Philipp Büttgenbach 打譜，創用 CC 姓名標示－相同方式分享 4.0。","measures":["Bb4:8{f} A4:8{f0} Bb4:8 C5:8 D5:8 C5:8 Bb4:8 A4:8{f0}","G4:8 F#4:8 G4:8 A4:8{f0} Bb4:8 A4:8{f0} G4:8 F4:8","Eb4:8 D4:8{f0} C4:8 Bb3:8 A3:8 C4:8 F4:8 Eb4:8","D4:8{f0} Eb4:8 F4:8 D4:8{f0} Bb3:8 D4:8{f0} F4:8 Bb4:8","D5:8 C#5:8 D5:8 Eb5:8{f4} D5:8 Bb4:8 G4:8 F4:8","E4:8 F4:8 G4:8 Bb4:8 E5:8{f0} F5:8 G5:8 Bb5:8","A5:8 G#5:8 A5:8 F5:8 G5:8 F#5:8 G5:8 E5:8{f0}","F5:8 E5:8{f0} F5:8 C5:8 A4:8 F4:8 G4:8 A4:8{f0}","Bb4:8 A4:8{f0} Bb4:8 C5:8 D5:8 C5:8 Bb4:8 A4:8{f0}","G4:8 F#4:8 G4:8 A4:8{f0} Bb4:8 A4:8 G4:8 F4:8","Eb4:8 D4:8{f0} C4:8 Bb3:8 A3:8 C4:8 F4:8 Eb4:8","D4:8{f0} Eb4:8 F4:8 D4:8{f0} Bb3:8 D4:8{f0} Eb4:8 F4:8","G4:8 F#4:8 G4:8 Bb4:8 Eb5:8{f4} G5:8 Bb5:8{f4} G5:8","F5:8 E5:8{f0} F5:8 D5:8 A4:8{f0} Bb4:8 C5:8 D5:8","Eb5:8{f4} D5:8 Eb5:8 C5:8 A4:8{f0} F4:8 Eb4:8 C4:8","A3:8 Bb3:8 D4:8{f0} F4:8 Bb4:8 D5:8 F5:8 Bb5:8","A5:8 G#5:8 A5:8 F5:8 E5:8{f0} C5:8 Bb4:8 G4:8","F4:8 E4:8 F4:8 A4:8{f4} C4:8 F4:8 A4:8{f0} C5:8","Bb4:8 A4:8{f0} Bb4:8 G5:8 F5:8 C5:8 A4:8{f0} F4:8","E4:8 F4:8 G4:8 A4:8{f0} Bb4:8 C5:8 D5:8 E5:8","F5:8 E5:8{f0} F5:8 G5:8 A5:8 F5:8 G5:8 A5:8","Bb5:8 A5:8 Bb5:8 F5:8 D5:8 Bb4:8 C5:8 D5:8","C5:8 B4:8 C5:8 F5:8 A5:8 C5:8 Bb4:8 G5:8","F5:8 E5:8{f0} F5:8 C5:8 A4:8{f0} F4:8 G4:8 A4:8{f0}","Bb4:8 A4:8{f0} Bb4:8 C5:8 D5:8 C5:8 Bb4:8 A4:8{f0}","G4:8 F#4:8 G4:8 A4:8{f0} Bb4:8 A4:8{f0} G4:8 F4:8","Eb4:8 D4:8{f0} C4:8 Bb3:8 A3:8 C4:8 F4:8 Eb4:8","D4:8{f0} Eb4:8 F4:8 D4:8{f0} Bb3:8 D4:8{f0} F4:8 Bb4:8","D5:8 C#5:8 D5:8 Eb5:8{f4} D5:8 Bb4:8 G4:8 F4:8","E4:8 F4:8 G4:8 Bb4:8{f1} E5:8{f0} F5:8 G5:8 Bb5:8","A5:8 G#5:8 A5:8 F5:8 G5:8 F#5:8 G5:8 E5:8{f0}","F5:8 E5:8{f0} F5:8 C5:8 A4:8{f0} F4:8 G4:8 A4:8{f0}","Bb4:8 A4:8{f0} Bb4:8 C5:8 D5:8 C5:8 Bb4:8 A4:8{f0}","G4:8 F#4:8 G4:8 A4:8{f0} Bb4:8 A4:8{f0} G4:8 F4:8","Eb4:8 D4:8{f0} C4:8 Bb3:8 A3:8 C4:8 F4:8 Eb4:8","D4:8{f0} Eb4:8 F4:8 D4:8{f0} Bb3:8 D4:8{f0} Eb4:8 F4:8","G4:8 F#4:8 G4:8 Bb4:8 Eb5:8{f4} G5:8 Bb5:8{f4} G5:8","F5:8 E5:8{f0} F5:8 D5:8 A4:8{f0} Bb4:8 C5:8 D5:8","Eb5:8 D5:8 Eb5:8 C5:8 A4:8{f0} F4:8 Eb4:8 C4:8","A3:8 Bb3:8 D4:8{f0} F4:8 Bb4:q R:q"],"id":"demo-wohlfahrt-7"},
  {
    id: 'demo-bee', title: '小蜜蜂', composer: '德國民謠', instrument: 'recorder-s',
    tempo: 100, time: '4/4', key: 'C',
    notes: '高音直笛：譜面寫 C4–G4，實際聲音高一個八度，系統會自動換算。',
    measures: ['G4 E4 E4:h', 'F4 D4 D4:h', 'C4 D4 E4 F4', 'G4 G4 G4:h',
      'G4 E4 E4:h', 'F4 D4 D4:h', 'C4 E4 G4 G4', 'E4:w',
      'D4 D4 D4 D4', 'D4 E4 F4:h', 'E4 E4 E4 E4', 'E4 F4 G4:h',
      'G4 E4 E4:h', 'F4 D4 D4:h', 'C4 E4 G4 G4', 'C4:w']
  }
];
