const WORDS = [
  'apple','arrow','atlas','barn','beach','berry','blade','bloom','blue','bolt',
  'bone','book','boot','brave','brook','brown','brush','bull','calm','cave',
  'cedar','chain','chalk','cheap','cheer','chest','chip','circle','clay','clean',
  'clear','cliff','cloud','coal','cobra','cold','coral','corn','cow','crane',
  'creek','crisp','crop','crow','crown','cube','curl','curve','dark','dawn',
  'deep','deer','dense','dew','dirt','dock','dome','door','dove','draft',
  'drake','draw','drift','drum','dune','dust','eagle','east','edge','fern',
  'field','finch','fire','fish','fist','flag','flame','flat','fleet','flint',
  'float','flood','floor','flow','foam','fold','ford','forge','fork','fox',
  'free','fresh','frost','gate','glade','glow','gold','grape','grass','grave',
  'green','grey','grid','grove','gulf','hare','haze','hill','hive','hold',
  'hook','horn','horse','hound','hull','iron','jade','kelp','lake','lamp',
  'land','lark','lava','lead','leaf','lean','light','lime','linen','lion',
  'log','lone','long','loom','loop','loud','low','lunar','lynx','maple',
  'marsh','mast','mesa','mild','mill','mist','moon','moor','moss','moth',
  'mount','mud','nest','night','north','oak','opal','otter','owl','palm',
  'peak','pine','pink','plain','plum','pond','pool','port','pure','quartz',
  'quiet','rain','rapid','raven','red','reed','reef','ridge','rift','ring',
  'river','road','roan','rock','root','rose','rough','round','rush','rust',
  'sage','salt','sand','scale','seal','sharp','shell','shore','silver','slate',
  'slope','slow','smoke','snow','soft','soil','solar','south','spark','spine',
  'splay','split','spool','spring','spruce','steep','stem','stone','storm','stream',
  'swift','thorn','tide','timber','track','trail','tree','trout','tusk','vale',
  'vault','vine','violet','void','wake','warm','wave','west','wheat','white',
  'wild','wind','wolf','wood','wool','wren','yellow','zinc',
];

export function randomCode(): string {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${pick()}-${pick()}-${pick()}`;
}
