'use strict';

// ---- Balance: tune here ----------------------------------------------------
const SAVE_KEY = 'deepbloom-save-v1';
const BAL = {
  pearlDiv: 4e4,          // bar fill n completes when holding pearlDiv × n² Lumen; Pearls = fills × bonuses
  tideSteps: 10,          // after this many bar fills the tide must be called
  fillGrowth: 0.2,        // each fill is worth +0.2 Pearls more per tide called in this zone (~60 tides to 5,000)
  descendAt: 5000,        // zone Pearls earned before you can descend
  depthMult: 3,           // each Depth Mark: ×3 Lumen and Pearls, stacking
  offlineCapHours: 8,
  seedEvery: [25, 40],    // Kelp Forest: seconds between glowing seeds
  seedBurst: 3,
  seedBurstSecs: 20,
  trenchFloor: 0.3,       // Twilight Trench: light never drops below this
  trenchDimSecs: 60,
  trenchTapRestore: 0.06,
};
const MILESTONES = [5, 15, 100, 500, 1000];
const MAX_POINTERS = 5;

const CREATURES = [
  { id: 'touch', name: 'Bright touch', perk: 'Tap power: +1 Lumen per tap per level', tint: '#E6F4F2', cost: 10, growth: 1.07, tap: true },
  { id: 'polyp', name: 'Glow polyp', perk: 'Sparks a little Lumen, nonstop', tint: '#2ED3B7', cost: 15, growth: 1.15, rate: 0.5 },
  { id: 'lantern', name: 'Lantern fish', perk: 'Harvests the brightest coral', tint: '#FFC46B', cost: 120, growth: 1.15, rate: 4 },
  { id: 'jelly', name: 'Drift jelly', perk: 'Boosts every polyp it passes: +2% each', tint: '#FF8FD0', cost: 1400, growth: 1.14, rate: 28 },
  { id: 'angler', name: 'Anglerfish', perk: 'Big, slow harvests', tint: '#8F7BFF', cost: 16000, growth: 1.13, rate: 230 },
  { id: 'whale', name: 'Moon whale', perk: 'Sings the whole reef brighter', tint: '#9DB8FF', cost: 220000, growth: 1.12, rate: 2100 },
  { id: 'titan', name: 'Coral titan', perk: 'An ancient reef that grows itself', tint: '#FF9A5C', cost: 3.5e6, growth: 1.12, rate: 19000 },
];

const ZONES = [
  { id: 'shallows', name: 'Shallows', pearl: 'white', rule: 'Tap, grow, tide.' },
  { id: 'kelp', name: 'Kelp Forest', pearl: 'jade', rule: 'A merge garden: combine plants to grow taller kelp.' },
  { id: 'trench', name: 'Twilight Trench', pearl: 'shadow', rule: 'A gear auto-battler: stages 1-1 to 9-10, then Hard, Extreme, Godlike…' },
  { id: 'vents', name: 'The Vents', pearl: 'ember', rule: 'Coming in an update.', soon: true },
];

const PEARLS = {
  white: { name: 'White', color: '#F4EEE6', blurb: 'Spend them here. When you descend, they and their upgrades are gone for good.' },
  jade: { name: 'Jade', color: '#6FE3A5', blurb: 'You start from zero here, boosted by your Depth Mark. Upgrades that bend the rules.' },
  shadow: { name: 'Shadow', color: '#9DB8FF', blurb: 'Rare Pearls from the dark. Each one is worth a lot.' },
  ember: { name: 'Ember', color: '#FF9A5C', blurb: 'Coming in an update after launch.' },
};

const PERKS = {
  white: [
    { id: 'brighter', name: 'Brighter tides', desc: 'All Lumen ×1.5 per rank', base: 2, growth: 2.2 },
    { id: 'headstart', name: 'Head start', desc: 'Start each tide with polyps and lantern fish at Lv 5 per rank', base: 5, growth: 3, max: 10 },
    { id: 'night', name: 'Night shift', desc: 'Earn 25% while offline, +15% per rank', base: 3, growth: 2.5, max: 5 },
    { id: 'diver', name: 'Pearl diver', desc: '+10% White Pearls per tide, per rank', base: 10, growth: 2.4 },
  ],
  jade: [
    { id: 'currents', name: 'Strong currents', desc: 'All creatures ×1.4 per rank', base: 2, growth: 2.2 },
    { id: 'nursery', name: 'Seed bank', desc: 'Start each tide with 3 Fronds in the garden', base: 25, growth: 1, max: 1 },
    { id: 'memory', name: 'Tide memory', desc: 'Keep 5% of Lumen through a tide, per rank', base: 8, growth: 2.6, max: 10 },
    { id: 'roots', name: 'Fast roots', desc: 'The tide gathers faster: Pearls ×1.25 per rank', base: 6, growth: 2.5 },
  ],
  shadow: [
    { id: 'lasting', name: 'Battle hardened', desc: 'Guardian power ×1.5 per rank', base: 3, growth: 2.4 },
    { id: 'echo', name: 'Double strike', desc: 'Battle wins give ×2 Lumen, per rank', base: 5, growth: 3 },
    { id: 'eyes', name: 'Deep eyes', desc: '+25% offline earnings, per rank', base: 4, growth: 2.5, max: 4 },
    { id: 'abyss', name: 'Abyss call', desc: 'Pearls ×1.5 per rank', base: 10, growth: 2.8 },
  ],
  ember: [],
};
const PEARL_ORDER = ['white', 'jade', 'shadow', 'ember'];

// ---- State -----------------------------------------------------------------
function freshState() {
  return {
    lumen: 0, tideEarned: 0, totalEarned: 0, levels: {}, revealed: 2,
    zone: 0, pearls: 0, zoneEarned: 0, depthMarks: 0, tides: 0, zoneTides: 0, tideFills: 0,
    perks: { white: {}, jade: {}, shadow: {} },
    buyMode: 'x1', light: 1, burstUntil: 0, lastSeen: Date.now(),
    audio: { master: 0.8, music: 0.6, sfx: 0.8, muted: false },
    tideUnlocked: false,
    keys: { date: '', lumen: 2, pearl: 2, egg: 2 },
    dungeons: { lumen: 1, pearl: 1, egg: 1 },
    dives: {},
    eggs: 0, eggsFound: 0, hatchLvl: 1, hatchUpgradeEnd: 0, pets: [], diveSub: 'dungeons', incubator: null,
    gear: { items: [], equipped: { crown: null, shell: null, charm: null, lantern: null }, chests: 0, shards: 0 },
    garden: { cells: Array(30).fill(0), up: { spore: 0, sap: 0, auto: 0 } },
    battle: { diff: 0, wave: 1, level: 1, auto: false, log: '' },
  };
}
let S = load();
const ui = { tab: 'reef', pearlView: null, nextSeedAt: 0, seedEl: null, builtKey: '' };

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = Object.assign(freshState(), JSON.parse(raw));
      s.perks = Object.assign({ white: {}, jade: {}, shadow: {} }, s.perks);
      return s;
    }
  } catch (e) { /* fall through to a new game */ }
  return freshState();
}
function save() {
  S.lastSeen = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
}

// ---- Numbers ---------------------------------------------------------------
const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : String(Math.floor(n));
  let i = 0;
  while (n >= 1000 && i < UNITS.length - 1) { n /= 1000; i++; }
  if (n >= 1000) return n.toExponential(2);
  return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n)) + UNITS[i];
}
const fmtInt = (n) => (n < 1e6 ? Math.floor(n).toLocaleString('en-US') : fmt(n));

// ---- Formulas --------------------------------------------------------------
const zone = () => ZONES[S.zone];
const pearlType = () => zone().pearl;
const lvl = (id) => S.levels[id] || 0;
const rank = (type, id) => (S.perks[type] && S.perks[type][id]) || 0;
const milestoneMult = (l) => Math.pow(2, MILESTONES.filter((m) => l >= m).length);
const nextMilestone = (l) => MILESTONES.find((m) => m > l);

function globalMult(withEffects = true) {
  let m = Math.pow(1.5, rank('white', 'brighter'))
    * Math.pow(1.4, rank('jade', 'currents'))
    * Math.pow(BAL.depthMult, S.depthMarks)
    * petMult('lumen');
  if (withEffects) {
    if (zone().id === 'trench') m *= S.light;
    if (Date.now() < S.burstUntil) m *= BAL.seedBurst;
  }
  return m;
}
function creatureRate(c) {
  if (c.tap) return 0;
  const l = lvl(c.id);
  let r = l * c.rate * milestoneMult(l);
  if (c.id === 'polyp') r *= 1 + 0.02 * lvl('jelly');
  return r;
}
// Each zone earns differently: creatures in the Shallows, the merge garden in the
// Kelp Forest, and battle wins (not a per-second rate) in the Twilight Trench.
function ratePerSec(withEffects = true) {
  if (isKelp()) return gardenRate() * petMult('creatures') * globalMult(withEffects);
  if (isTrench()) return 0;
  return CREATURES.reduce((sum, c) => sum + creatureRate(c), 0) * petMult('creatures') * gearMult('shell') * globalMult(withEffects);
}
const isKelp = () => zone().id === 'kelp';
const isTrench = () => zone().id === 'trench';
const cur = () => (isKelp() ? 'sap' : 'Lumen');
function tapValue() {
  const l = lvl('touch');
  return (1 + l) * milestoneMult(l) * Math.pow(2, rank('shadow', 'echo')) * petMult('taps') * gearMult('crown') * globalMult();
}
// The tide bar feeds on Lumen: fill k completes once the player holds pearlDiv × k²
// (40K, 160K, 360K … 1M at fill 5 … 4M at fill 10) and that amount is spent into the tide.
// At BAL.tideSteps the tide is full: earning stops until it is called.
const fillNeed = (k) => BAL.pearlDiv * k * k;
function checkFills() {
  while (S.tideFills < BAL.tideSteps && S.lumen >= fillNeed(S.tideFills + 1)) {
    const need = fillNeed(S.tideFills + 1);
    S.lumen -= need;
    S.tideFills++;
    const box = document.getElementById('tidebox');
    if (box && !box.hidden) floatText(box, '-' + fmt(need) + ' ' + cur() + ' into the tide', false);
  }
}
const pearlSteps = () => S.tideFills;
const tideFull = () => pearlSteps() >= BAL.tideSteps;
// Lumen held toward the current fill, and the Lumen that fill needs.
function stepProgress() {
  const s = pearlSteps();
  if (s >= BAL.tideSteps) return { have: fillNeed(s), need: fillNeed(s) };
  const need = fillNeed(s + 1);
  return { have: Math.min(S.lumen, need), need };
}
function stepFrac() {
  const p = stepProgress();
  return Math.min(1, p.have / p.need);
}
// Base Pearls per bar fill: grows with every tide called in the current zone.
const fillValue = () => 1 + BAL.fillGrowth * S.zoneTides;
function pearlGain() {
  const mult = fillValue()
    * (1 + 0.1 * rank('white', 'diver'))
    * Math.pow(1.25, rank('jade', 'roots'))
    * Math.pow(1.5, rank('shadow', 'abyss'))
    * Math.pow(BAL.depthMult, S.depthMarks)
    * petMult('pearls')
    * gearMult('charm');
  return Math.floor(pearlSteps() * mult);
}
function offlinePct() {
  return Math.min(1, 0.25 + 0.15 * rank('white', 'night')) + 0.25 * rank('shadow', 'eyes') + petOffline();
}

const costOf = (c, l) => c.cost * Math.pow(c.growth, l);
function costFor(c, n) {
  const g = c.growth;
  return costOf(c, lvl(c.id)) * (Math.pow(g, n) - 1) / (g - 1);
}
function maxAffordable(c) {
  const g = c.growth;
  const first = costOf(c, lvl(c.id));
  if (S.lumen < first) return 0;
  return Math.floor(Math.log(S.lumen * (g - 1) / first + 1) / Math.log(g));
}
function buyCount(c) {
  const l = lvl(c.id);
  switch (S.buyMode) {
    case 'x10': return 10;
    case 'next': { const m = nextMilestone(l); return m ? m - l : 1; }
    case 'max': return Math.max(1, maxAffordable(c));
    default: return 1;
  }
}
const perkCost = (p, r) => Math.ceil(p.base * Math.pow(p.growth, r));

// ---- Actions ---------------------------------------------------------------
function earn(n) { S.lumen += n; S.tideEarned += n; S.totalEarned += n; }

function buyCreature(c) {
  const n = buyCount(c);
  const cost = costFor(c, n);
  if (S.lumen < cost) return;
  S.lumen -= cost;
  const before = lvl(c.id);
  let after = before + n;
  if (before === 0 && !c.tap && rank('jade', 'nursery')) after = Math.max(after, 15);
  S.levels[c.id] = after;
  const milestone = milestoneMult(after) > milestoneMult(before);
  if (milestone) Sound.milestone(); else Sound.buy();
  animateLevelUp(c, after - before, milestone);
  if (milestone) ui.pendingRing = true;
  renderFish();
  growCoral();
  updateUI();
}

// ---- Upgrade animations ----------------------------------------------------
// One-shot effect classes are removed when their animation ends. Otherwise the browser
// replays the animation whenever a hidden tab is shown again (e.g. the tide wave).
function restartClass(el, cls, ms = 2000) {
  clearTimeout(el['_t_' + cls]);
  el.classList.remove(cls);
  void el.getBoundingClientRect(); // force a reflow so the animation restarts (works for SVG too)
  el.classList.add(cls);
  const done = (e) => {
    if (e.target !== el) return;
    el.classList.remove(cls);
    el.removeEventListener('animationend', done);
  };
  el.addEventListener('animationend', done);
  el['_t_' + cls] = setTimeout(() => el.classList.remove(cls), ms);
}
function clearEffects() {
  if (ui.washing) return;
  $('bigwave').classList.remove('go');
  $('wave').classList.remove('go');
  reef.querySelector('.coral').classList.remove('regrow');
}
function floatText(parent, text, gold) {
  const f = document.createElement('span');
  f.className = 'float' + (gold ? ' gold' : '');
  f.textContent = text;
  parent.appendChild(f);
  setTimeout(() => f.remove(), 950);
}
function animateLevelUp(c, gained, milestone) {
  const row = ui.rows && ui.rows.find((r) => r.c === c);
  if (!row) return;
  const el = row.btn.closest('.crow');
  restartClass(el, milestone ? 'ms' : 'lvlup');
  floatText(el, '+' + gained + ' Lv', false);
  if (milestone) setTimeout(() => floatText(el, '×2!', true), 250);
}
function growCoral() {
  const total = CREATURES.reduce((s, c) => s + lvl(c.id), 0);
  const grow = 0.85 + Math.min(0.3, Math.log10(1 + total) * 0.1);
  reef.querySelector('.coral').style.setProperty('--grow', grow.toFixed(3));
}
function ringBurst() {
  const ring = document.createElement('div');
  ring.className = 'ring';
  reef.appendChild(ring);
  setTimeout(() => ring.remove(), 1250);
}
function playWave(kind) {
  const w = $('wave');
  w.classList.toggle('sink', kind === 'sink');
  restartClass(w, 'go');
}

function resetRun() {
  const keep = S.lumen * Math.min(0.5, 0.05 * rank('jade', 'memory'));
  S.lumen = keep;
  S.tideEarned = 0;
  S.tideFills = 0;
  S.levels = {};
  const hs = rank('white', 'headstart') * 5;
  if (hs) { S.levels.polyp = hs; S.levels.lantern = hs; }
  S.revealed = 2;
  S.light = 1;
  S.burstUntil = 0;
  S.garden = freshState().garden;
  if (rank('jade', 'nursery')) [0, 1, 2].forEach((i) => { S.garden.cells[i * 2] = 3; });
  ui.gardenSel = -1;
  ui.gardenDirty = true;
  ui.battleDrops = [];
  ui.builtKey = '';
  renderFish();
  growCoral();
}

function callTide() {
  const gain = pearlGain();
  if (gain < 1 || ui.washing) return;
  ui.washing = true;
  S.pearls += gain;
  S.zoneEarned += gain;
  S.tides += 1;
  S.zoneTides += 1;
  if (S.zone >= 2) S.gear.chests += 1;
  switchTab('reef');
  Sound.tide();
  // The ocean wave clears the reef in the Shallows; other zones get a full-screen wave.
  const wash = zone().id === 'shallows' ? washReef : (fn) => { playWave('tide'); setTimeout(fn, 900); };
  wash(() => {
    resetRun();
    save();
    ui.washing = false;
    ui.forcedOpen = false;
    ui.lastGain = 0;
  });
}
function washReef(done) {
  restartClass($('bigwave'), 'go');
  setTimeout(() => reef.classList.add('swept'), 500);
  setTimeout(() => {
    done();
    reef.classList.remove('swept');
    restartClass(reef.querySelector('.coral'), 'regrow');
  }, 1350);
}
function confirmTide() {
  const gain = pearlGain();
  if (gain < 1) return;
  showModal({
    title: 'Call the tide?',
    body: `A wave clears your reef and you gain ${fmtInt(gain)} ${PEARLS[pearlType()].name} Pearls.`,
    ok: 'Call the tide',
    onOk: callTide,
  });
}

function canDescend() {
  const next = ZONES[S.zone + 1];
  return next && !next.soon && S.zoneEarned >= BAL.descendAt;
}
function descend() {
  if (!canDescend()) return;
  S.perks[pearlType()] = {};
  S.pearls = 0;
  S.zoneEarned = 0;
  S.zoneTides = 0;
  S.zone += 1;
  S.depthMarks += 1;
  S.lumen = 0;
  resetRun();
  S.lumen = 0;
  ui.pearlView = null;
  Sound.descend();
  applyZone();
  save();
  switchTab('reef');
  playWave('sink');
}

function buyPerk(type, p) {
  if (type !== pearlType()) return;
  const r = rank(type, p.id);
  if (p.max && r >= p.max) return;
  const cost = perkCost(p, r);
  if (S.pearls < cost) return;
  S.pearls -= cost;
  S.perks[type][p.id] = r + 1;
  Sound.perk();
  const btn = ui.perkBtns && ui.perkBtns.find((x) => x.p === p);
  if (btn) { restartClass(btn.b, 'bought'); floatText(btn.b, 'Rank ' + (r + 1), false); }
  save();
  updateUI();
}

// ---- Tapping ---------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const reef = $('reef');
const activePointers = new Set();

reef.addEventListener('pointerdown', (e) => {
  if (e.target === ui.seedEl) return;
  if (activePointers.size >= MAX_POINTERS) return;
  activePointers.add(e.pointerId);
  if (tideFull()) { activePointers.delete(e.pointerId); return; }
  const v = tapValue();
  earn(v);
  Sound.tap();
  if (zone().id === 'trench') S.light = Math.min(1, S.light + BAL.trenchTapRestore);
  const r = reef.getBoundingClientRect();
  spawnPop(e.clientX - r.left, e.clientY - r.top, '+' + fmt(v));
  const coral = reef.querySelector('.coral');
  coral.classList.add('bump');
  setTimeout(() => coral.classList.remove('bump'), 80);
  $('hint').style.opacity = '0';
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((t) =>
  reef.addEventListener(t, (e) => activePointers.delete(e.pointerId)));

function spawnPop(x, y, text) {
  const pops = $('pops');
  if (pops.childElementCount > 40) pops.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = 'pop';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  pops.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// Kelp Forest seeds
function scheduleSeed() {
  const [a, b] = BAL.seedEvery;
  ui.nextSeedAt = Date.now() + (a + Math.random() * (b - a)) * 1000;
}
function spawnSeed() {
  const el = $('seed');
  el.hidden = false;
  el.style.top = (25 + Math.random() * 40) + '%';
  el.style.setProperty('--x', (15 + Math.random() * 60) + '%');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  ui.seedEl = el;
  clearTimeout(ui.seedTimer);
  ui.seedTimer = setTimeout(() => { el.hidden = true; }, 9000);
}
$('seed').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  $('seed').hidden = true;
  S.burstUntil = Date.now() + BAL.seedBurstSecs * 1000;
  Sound.seed();
  const r = reef.getBoundingClientRect();
  spawnPop(e.clientX - r.left, e.clientY - r.top, 'Burst ×' + BAL.seedBurst);
});

// ---- Fish ------------------------------------------------------------------
// Swimmers' art faces left; jellies drift and bob instead.
const SPRITES = {
  lantern: { kind: 'swim', w: 40, speed: 12, top: [10, 55], max: 3, svg: (c, w) => `<svg width="${w}" height="${w * 0.55}" viewBox="0 0 44 24"><path d="M4 12 C 12 2, 28 2, 34 12 C 28 22, 12 22, 4 12 Z" fill="${c}"/><path d="M34 12 L 42 4 L 42 20 Z" fill="${c}"/><circle cx="12" cy="11" r="2" fill="#061A24"/><circle class="lure" cx="20" cy="9" r="2.5" fill="#FFF3C4"/></svg>` },
  jelly: { kind: 'drift', w: 32, speed: 18, top: [6, 40], max: 3, svg: (c, w) => `<svg width="${w}" height="${w * 1.375}" viewBox="0 0 32 44"><path d="M3 16 C 3 4, 29 4, 29 16 C 25 18, 7 18, 3 16 Z" fill="${c}"/><path d="M8 18 C 6 26, 10 30, 8 40 M14 18 C 13 28, 16 32, 14 42 M19 18 C 20 28, 17 32, 19 42 M24 18 C 26 26, 22 30, 24 40" stroke="${c}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/></svg>` },
  angler: { kind: 'swim', w: 54, speed: 20, top: [38, 60], max: 2, svg: (c, w) => `<svg width="${w}" height="${w * 0.7}" viewBox="0 0 52 36"><path d="M8 20 C 8 8, 34 6, 40 18 C 34 30, 10 32, 8 20 Z" fill="${c}"/><path d="M40 18 L 50 10 L 50 26 Z" fill="${c}"/><path d="M8 21 L 17 23" stroke="#061A24" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="15" r="2.5" fill="#061A24"/><path d="M18 9 C 14 0, 4 0, 3 6" stroke="${c}" stroke-width="2" fill="none"/><circle class="lure" cx="3" cy="8" r="3.5" fill="#FFF3C4"/></svg>` },
  whale: { kind: 'swim', w: 120, speed: 32, top: [4, 14], max: 1, svg: (c, w) => `<svg width="${w}" height="${w * 0.44}" viewBox="0 0 90 40"><path d="M4 22 C 6 8, 50 4, 72 18 C 60 32, 16 36, 4 22 Z" fill="${c}"/><path d="M70 18 C 78 14, 84 6, 88 4 C 86 12, 84 18, 80 20 C 84 22, 86 28, 88 34 C 82 32, 76 26, 70 22 Z" fill="${c}"/><circle cx="18" cy="18" r="2.2" fill="#061A24"/><path d="M14 26 C 26 30, 40 30, 54 26" stroke="rgba(255,255,255,.5)" stroke-width="1.5" fill="none"/></svg>` },
};
const POLYP_SPOTS = [[78, 190], [54, 175], [112, 195], [180, 130], [230, 120], [205, 100], [320, 240], [300, 190], [340, 265], [90, 120]];

function renderFish() {
  const layer = $('fish');
  const known = ui.fishKnown || new Set();
  const owned = new Set();
  layer.innerHTML = '';
  CREATURES.filter((c) => SPRITES[c.id] && lvl(c.id) > 0).forEach((c, i) => {
    owned.add(c.id);
    const sp = SPRITES[c.id];
    const isNew = ui.fishKnown && !known.has(c.id);
    const count = Math.min(sp.max, 1 + Math.floor(Math.log10(lvl(c.id))));
    for (let k = 0; k < count; k++) {
      const el = document.createElement('div');
      el.className = (sp.kind === 'drift' ? 'jelly' : 'fishy') + (isNew ? ' enter' : '');
      const dur = sp.speed + i + k * 2.5;
      el.style.top = (sp.top[0] + ((i * 17 + k * 23) % (sp.top[1] - sp.top[0]))) + '%';
      el.style.setProperty('--dur', dur + 's');
      el.style.setProperty('--delay', (-dur * (((i * 0.37) + (k * 0.5)) % 1)) + 's');
      el.style.setProperty('--w', sp.w + 'px');
      el.innerHTML = '<span class="face">' + sp.svg(c.tint, sp.w) + '</span>';
      layer.appendChild(el);
    }
  });
  ui.fishKnown = owned;

  const dots = Math.min(POLYP_SPOTS.length, Math.ceil(Math.log2(lvl('polyp') + 1) * 2));
  $('polyps').innerHTML = POLYP_SPOTS.slice(0, dots).map(([x, y], i) =>
    `<i class="polyp-dot" style="left:${x}px;bottom:${y}px;animation-delay:${-i * 0.37}s"></i>`).join('');
  $('titan').hidden = lvl('titan') === 0;
  renderReefPets();
}
// Active pets sit on the sea floor of the reef.
function renderReefPets() {
  const active = S.pets.filter((p) => p.active);
  const box = $('reefPets');
  box.hidden = active.length === 0;
  box.setAttribute('aria-label', 'Active pets: ' + active.map((p) => PET_KINDS[p.kind].name + ' (' + RARITIES[p.rarity].name + ')').join(', '));
  box.innerHTML = active.map((p) => `<span class="reef-pet" style="--rc:${RARITIES[p.rarity].color}"><span class="pet-art" style="background:${RARITIES[p.rarity].color}"><i></i><i></i></span><span>${RARITIES[p.rarity].name}</span></span>`).join('');
}

// ---- Tabs & modal ----------------------------------------------------------
// The home tab shows each zone's own game; in the Trench the second tab opens Gear.
const homeScreen = () => (isKelp() ? 'garden' : isTrench() ? 'battle' : 'reef');
function switchTab(tab) {
  clearEffects();
  if (tab === 'creatures' && isTrench()) { tab = 'dive'; S.diveSub = 'gear'; }
  ui.tab = tab;
  const screen = tab === 'reef' ? homeScreen() : tab;
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + screen));
  $('tidebox').hidden = tab !== 'reef';
  ui.gardenDirty = true;
  ui.battleDirty = true;
  document.querySelectorAll('.tabs button').forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  ui.builtKey = '';
  updateUI();
  if (tab === 'reef' && ui.pendingRing) { ui.pendingRing = false; ringBurst(); }
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { Sound.click(); switchTab(b.dataset.tab); }));

// ---- Audio + settings -------------------------------------------------------
// Browsers only allow sound after a user gesture, so start on the first touch.
document.addEventListener('pointerdown', () => Sound.init(), { capture: true });

const VOL_INPUTS = [['vMaster', 'master'], ['vMusic', 'music'], ['vSfx', 'sfx']];
function syncSettings() {
  VOL_INPUTS.forEach(([id, key]) => {
    $(id).value = Math.round(S.audio[key] * 100);
    $(id).disabled = S.audio.muted;
    $(id + 'Val').textContent = S.audio.muted ? 'Muted' : Math.round(S.audio[key] * 100) + '%';
  });
  $('vMute').checked = S.audio.muted;
  Sound.setVolumes(S.audio);
}
VOL_INPUTS.forEach(([id, key]) => $(id).addEventListener('input', () => {
  S.audio[key] = Number($(id).value) / 100;
  syncSettings();
}));
VOL_INPUTS.filter(([, key]) => key !== 'music').forEach(([id]) => $(id).addEventListener('change', () => Sound.buy()));
$('vMute').addEventListener('change', () => { S.audio.muted = $('vMute').checked; syncSettings(); });
document.querySelectorAll('.settings-open').forEach((b) => b.addEventListener('click', () => { Sound.click(); syncSettings(); $('settings').hidden = false; $('sDone').focus(); }));
$('sDone').addEventListener('click', () => { $('settings').hidden = true; save(); });

function showModal({ title, body, ok, cancel = 'Cancel', onOk }) {
  $('mTitle').textContent = title;
  $('mBody').textContent = body;
  $('mOk').textContent = ok;
  $('mCancel').textContent = cancel;
  $('mCancel').hidden = cancel === null;
  $('modal').hidden = false;
  $('mOk').onclick = () => { $('modal').hidden = true; if (onOk) onOk(); };
  $('mCancel').onclick = () => { $('modal').hidden = true; };
  $('mOk').focus();
}

// ---- Creatures screen ------------------------------------------------------
document.querySelectorAll('#buySeg button').forEach((b) => b.addEventListener('click', () => {
  S.buyMode = b.dataset.mode;
  updateUI();
}));
const modeLabel = { x1: 'Buy ×1', x10: 'Buy ×10', next: 'To next ×2', max: 'Buy max' };

function buildCreatures() {
  const list = $('creatureList');
  list.innerHTML = '';
  ui.rows = [];
  $('creaturesTitle').textContent = isKelp() ? 'Garden upgrades' : 'Creatures';
  $('buySeg').hidden = isKelp();
  $('creaturesNote').textContent = isKelp() ? 'Garden upgrades are bought with Jade sap and reset with the tide, just like the garden.'
    : 'A creature doubles its output at Lv 5, 15, 100, 500 and 1,000. Upgrades reset with the tide; Pearl bonuses don\'t.';
  if (isKelp()) { buildGardenUps(list); return; }
  CREATURES.slice(0, S.revealed).forEach((c) => {
    const row = document.createElement('div');
    row.className = 'crow';
    row.innerHTML = `<div class="sw" style="background:${c.tint}"></div>
      <div class="meta"><div class="nm"><b>${c.name}</b><span></span></div><div class="pk">${c.perk}</div><div class="out"></div></div>
      <button type="button" class="buy"><span class="m"></span><span class="k"></span></button>`;
    const btn = row.querySelector('.buy');
    btn.addEventListener('click', () => buyCreature(c));
    list.appendChild(row);
    ui.rows.push({ c, lv: row.querySelector('.nm span'), out: row.querySelector('.out'), btn, m: btn.querySelector('.m'), k: btn.querySelector('.k'), ms: row.querySelector('.sw') });
  });
  const next = CREATURES[S.revealed];
  if (next) {
    const row = document.createElement('div');
    row.className = 'crow hidden-c';
    row.innerHTML = `<div class="sw" style="background:var(--track)"></div><div class="meta"><div class="nm"><b>???</b></div><div class="pk">Earn ${fmt(next.cost * 0.4)} Lumen this tide to reveal</div></div>`;
    list.appendChild(row);
  }
}
function updateCreatures() {
  document.querySelectorAll('#buySeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.buyMode)));
  $('lumen2').textContent = fmt(S.lumen) + (isKelp() ? ' sap' : '');
  if (isKelp()) { updateGardenUps(); return; }
  const gm = globalMult();
  ui.rows.forEach((r) => {
    const l = lvl(r.c.id);
    const n = buyCount(r.c);
    const cost = costFor(r.c, n);
    r.lv.textContent = 'Lv ' + l + (milestoneMult(l) > 1 ? ' · ×' + milestoneMult(l) : '');
    r.out.textContent = r.c.tap ? '+' + fmt(tapValue()) + ' per tap' : (l ? '+' + fmt(creatureRate(r.c) * gm) + '/s' : '');
    r.m.textContent = S.buyMode === 'max' ? 'Buy ×' + n : S.buyMode === 'next' ? 'To Lv ' + (l + n) : modeLabel[S.buyMode];
    r.k.textContent = fmt(cost);
    r.btn.disabled = S.lumen < cost;
  });
}

// ---- Pearls screen ---------------------------------------------------------
function pearlStatus(type) {
  const idx = PEARL_ORDER.indexOf(type);
  if (idx < S.zone) return 'past';
  if (idx === S.zone) return 'current';
  return ZONES[idx].soon ? 'soon' : 'locked';
}
function buildPearls() {
  const view = ui.pearlView || pearlType();
  const chips = $('pearlChips');
  chips.innerHTML = '';
  PEARL_ORDER.forEach((t) => {
    const st = pearlStatus(t);
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(t === view));
    b.style.borderColor = t === view ? PEARLS[t].color : '';
    if (st !== 'current' && t !== view) b.classList.add('dim');
    const label = st === 'current' ? fmtInt(S.pearls) : st === 'past' ? 'Left behind' : st === 'soon' ? 'Soon' : 'Locked';
    b.innerHTML = `<i class="dotc" style="background:${PEARLS[t].color}"></i><b>${PEARLS[t].name}</b><span>${label}</span>`;
    b.addEventListener('click', () => { ui.pearlView = t; ui.builtKey = ''; updateUI(); });
    chips.appendChild(b);
  });

  const z = ZONES[PEARL_ORDER.indexOf(view)];
  $('ptName').textContent = PEARLS[view].name + ' Pearls';
  $('ptName').style.color = PEARLS[view].color;
  $('ptFrom').textContent = 'from ' + z.name + ' tides';
  $('ptBlurb').textContent = PEARLS[view].blurb;

  const grid = $('perkGrid');
  grid.innerHTML = '';
  ui.perkBtns = [];
  const perks = PERKS[view].length ? PERKS[view] : [1, 2, 3, 4].map(() => ({ id: '', name: '[PERK]', desc: 'Coming soon', base: 0 }));
  perks.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'perk';
    b.innerHTML = `<b>${p.name}</b><span class="d">${p.desc}</span><span class="c"></span>`;
    b.addEventListener('click', () => buyPerk(view, p));
    grid.appendChild(b);
    ui.perkBtns.push({ b, p, c: b.querySelector('.c'), view });
  });

  const zl = $('zoneList');
  zl.innerHTML = '';
  ZONES.forEach((zz, i) => {
    let state, color = '#4C6E78', dim = true;
    if (i < S.zone) { state = 'Left behind'; }
    else if (i === S.zone) { state = 'You are here'; color = PEARLS[zz.pearl].color; dim = false; }
    else if (zz.soon) { state = 'After launch'; }
    else if (i === S.zone + 1) { state = 'Descend at ' + fmtInt(BAL.descendAt) + ' ' + PEARLS[zone().pearl].name; color = PEARLS[zz.pearl].color; dim = false; }
    else { state = 'Locked'; }
    const row = document.createElement('div');
    row.className = 'zone' + (dim ? ' dim' : '');
    row.innerHTML = `<div class="rail"><i style="background:${color}"></i><s></s></div><div class="zt"><div><b>${zz.name}</b><em style="color:${color}">${state}</em></div><span>${zz.rule} Drops ${PEARLS[zz.pearl].name} Pearls.</span></div>`;
    zl.appendChild(row);
  });
}
function updatePearls() {
  $('depthMarks').textContent = 'Depth Marks: ' + S.depthMarks;
  const cur = pearlType();
  ui.perkBtns.forEach(({ b, p, c, view }) => {
    if (!p.id) { b.disabled = true; c.textContent = 'Soon'; return; }
    const r = rank(view, p.id);
    const st = pearlStatus(view);
    if (view !== cur) {
      b.disabled = true;
      c.textContent = st === 'past' ? 'Gone' : 'Locked';
      return;
    }
    if (p.max && r >= p.max) {
      b.disabled = true;
      c.textContent = 'Rank ' + r + ' · Maxed';
      return;
    }
    const cost = perkCost(p, r);
    const ok = S.pearls >= cost;
    b.disabled = !ok;
    b.style.borderColor = ok ? PEARLS[view].color : '';
    c.style.color = PEARLS[view].color;
    c.textContent = ok ? 'Rank ' + r + ' · ' + fmtInt(cost) : 'Rank ' + r + ' · Need ' + fmtInt(cost);
  });

  const next = ZONES[S.zone + 1];
  const btn = $('descendBtn');
  if (!next || next.soon) {
    btn.disabled = true;
    $('dTitle').textContent = 'The Vents';
    $('dCount').textContent = 'Coming soon';
    $('dBody').textContent = 'The next zone opens in a future update. Keep growing your Depth.';
  } else {
    btn.disabled = !canDescend();
    $('dTitle').textContent = 'Descend to the ' + next.name;
    $('dCount').textContent = canDescend() ? 'Ready' : fmtInt(S.zoneEarned) + ' / ' + fmtInt(BAL.descendAt);
    $('dBody').textContent = `One way: you can't come back. All ${PEARLS[cur].name} Pearls and their upgrades are lost. You gain a Depth Mark: ×${BAL.depthMult} to all Lumen and Pearls, forever.`;
  }
}
$('descendBtn').addEventListener('click', () => {
  if (!canDescend()) return;
  const next = ZONES[S.zone + 1];
  showModal({
    title: 'Descend to the ' + next.name + '?',
    body: `This is one way. Your ${PEARLS[pearlType()].name} Pearls, their upgrades and your reef are gone for good. You gain Depth Mark ${S.depthMarks + 1}: ×${BAL.depthMult} to all Lumen and Pearls.`,
    ok: 'Descend',
    onOk: descend,
  });
});
$('resetBtn').addEventListener('click', () => showModal({
  title: 'Reset all progress?',
  body: 'This deletes your save and starts Deep Bloom from the beginning.',
  ok: 'Reset',
  onOk: () => { S = freshState(); save(); ui.pearlView = null; applyZone(); renderFish(); switchTab('reef'); },
}));

// ---- Tide screen -----------------------------------------------------------
$('callTide').addEventListener('click', confirmTide);
$('reefCallTide').addEventListener('click', confirmTide);
$('notYet').addEventListener('click', () => switchTab('reef'));

function nextPearlAt() {
  // Lumen needed this tide to fill the bar for the next Pearl step.
  const s = pearlSteps();
  return BAL.pearlDiv * (s + 1) * (s + 1);
}
function updateTide() {
  const gain = pearlGain();
  const pt = PEARLS[pearlType()];
  $('tideGain').textContent = '+' + fmtInt(gain);
  $('tideGainLabel').textContent = pt.name + ' Pearls if you call the tide now';
  $('tideNeed').textContent = (gain < 1 ? 'Hold ' + fmt(nextPearlAt()) + ' ' + cur() + ' to fill the bar for your first Pearl. ' : '')
    + `Each bar fill is worth ${fillValue().toFixed(1)} Pearls this tide, ${(fillValue() + BAL.fillGrowth).toFixed(1)} next tide.`;
  $('callTide').disabled = gain < 1;
  const next = ZONES[S.zone + 1];
  if (next && !next.soon) {
    $('descendLabel').textContent = pt.name + ' Pearls to descend';
    $('descendCount').textContent = fmtInt(S.zoneEarned) + ' / ' + fmtInt(BAL.descendAt);
    $('descendBar').style.width = Math.min(100, S.zoneEarned / BAL.descendAt * 100) + '%';
  } else {
    $('descendLabel').textContent = 'The Vents open in an update';
    $('descendCount').textContent = '';
    $('descendBar').style.width = '0%';
  }
}

// ---- Reef HUD --------------------------------------------------------------
function updateReef() {
  $('lumen').textContent = fmt(S.lumen);
  $('rate').textContent = '+' + fmt(ratePerSec()) + ' per second';
  const pt = PEARLS[pearlType()];
  $('pearlChip').textContent = pt.name + ' Pearls: ' + fmtInt(S.pearls);
  $('zoneChip').textContent = zone().name + ' · Tide ' + (S.tides + 1);
  $('depthChip').hidden = S.depthMarks === 0;
  $('depthChip').textContent = 'Depth ×' + fmt(Math.pow(BAL.depthMult, S.depthMarks));
  const gain = ui.washing ? 0 : pearlGain();
  $('tideCount').textContent = '+' + fmtInt(gain) + ' ' + pt.name + ' Pearls';
  if (gain > (ui.lastGain || 0)) {
    restartClass($('tideCount'), 'bump');
    if (ui.lastGain) floatText($('tideCount').closest('.tidebox'), '+' + fmtInt(gain - ui.lastGain), false);
  }
  ui.lastGain = gain;
  const steps = pearlSteps();
  const prog = stepProgress();
  $('tidePreview').textContent = tideFull() ? `The tide is full (${steps}/${BAL.tideSteps}): call it to keep growing`
    : `Fill ${steps + 1}/${BAL.tideSteps}: ${fmt(prog.have)} / ${fmt(prog.need)} ${cur()} · +${fillValue().toFixed(1)} Pearls when full`;
  $('tideCount').title = 'Each bar fill: +' + fillValue().toFixed(1) + ' base Pearls';
  // The tide button stays hidden until the player fills the bar for the first time.
  if (gain >= 1 || S.tides > 0) S.tideUnlocked = true;
  $('reefCallTide').hidden = !S.tideUnlocked;
  $('reefCallTide').disabled = gain < 1 || !!ui.washing;
  if (!S.tideUnlocked) $('tidePreview').textContent = `Fill the bar to unlock the tide: ${fmt(prog.have)} / ${fmt(prog.need)} ${cur()}`;
  // Bar fills toward the next Pearl step, then resets for the one after.
  $('tideBar').style.width = (stepFrac() * 100) + '%';
  $('lightMeter').hidden = zone().id !== 'trench';
  $('lightBar').style.width = (S.light * 100) + '%';
  $('burstChip').hidden = Date.now() >= S.burstUntil;
  $('burstChip').textContent = 'Current burst ×' + BAL.seedBurst + ' · ' + Math.ceil((S.burstUntil - Date.now()) / 1000) + 's';
  reef.querySelector('.glow').style.opacity = zone().id === 'trench' ? String(0.3 + 0.7 * S.light) : '1';
}

function applyZone() {
  document.body.dataset.zone = zone().id;
  Sound.setZone(zone().id);
  $('seed').hidden = true;
  $('tabHome').textContent = isKelp() ? 'Garden' : isTrench() ? 'Battle' : 'Reef';
  $('tabSecond').textContent = isKelp() ? 'Upgrades' : isTrench() ? 'Gear' : 'Creatures';
  ui.gardenDirty = true;
  ui.battleDirty = true;
}

// ---- Dungeons, eggs & pets ---------------------------------------------------
const KEYS_PER_DAY = 2;            // per dungeon, refreshed at local midnight
// Dive time grows with the dungeon's level: 50s at Lv 1, then +43s per level.
const diveSecs = (L) => 50 + 43 * (L - 1);
const DUNGEONS = [
  { id: 'lumen', name: 'Glow Grotto', what: 'Lumen', color: '#5CF2D6' },
  { id: 'pearl', name: 'Pearl Vault', what: 'Pearls', color: '#FF8FD0' },
  { id: 'egg', name: 'Nesting Caves', what: 'Eggs', color: '#FFC46B' },
];
const RARITIES = [
  { name: 'Common', color: '#B5C2DA' }, { name: 'Uncommon', color: '#6FE3A5' },
  { name: 'Rare', color: '#6FB8FF' }, { name: 'Epic', color: '#C79BFF' },
  { name: 'Legendary', color: '#FFC46B' }, { name: 'Mythic', color: '#FF8FD0' },
  { name: 'God-like', color: '#FFF3B0' }, { name: 'Demonic', color: '#FF6B6B' },
  { name: 'Ultra', color: '#5CF2D6' }, { name: 'Ultra Rare', color: '#9DB8FF' },
  { name: 'Ultra Epic', color: '#E58BFF' }, { name: 'Ultra Ultra', color: '#FFFFFF' },
];
const PET_KINDS = {
  lumen: { name: 'Glow otter', desc: 'Lumen' },
  taps: { name: 'Snap shrimp', desc: 'taps' },
  creatures: { name: 'Reef turtle', desc: 'creatures' },
  pearls: { name: 'Pearl crab', desc: 'Pearls' },
  offline: { name: 'Dream seal', desc: 'offline' },
};
const PET_SLOTS = 3;
// Hatchery: unlocks after 10 eggs found. Upgrade n takes 59s + 655s × (n - 1).
const HATCH = { unlockEggs: 10, maxLevel: 60, firstSecs: 59, stepSecs: 655, baseCost: 2e5, costGrowth: 2.4 };

const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
function refreshKeys() {
  if (S.keys.date !== todayKey()) S.keys = { date: todayKey(), lumen: KEYS_PER_DAY, pearl: KEYS_PER_DAY, egg: KEYS_PER_DAY };
}
const dungeonsOpen = () => S.tides > 0 || S.zone > 0;
// Reward = dungeon level × base amount, so each clear raises the next reward by one base unit.
const lumenX = () => Math.max(1000, ratePerSec(false) * 300);
const pearlY = () => Math.ceil(2 * Math.pow(BAL.depthMult, S.depthMarks));
function dungeonReward(d) {
  const L = S.dungeons[d.id];
  if (d.id === 'lumen') return L * lumenX();
  if (d.id === 'pearl') return L * pearlY();
  return L;
}
// Dives are saved as timestamps, so they keep going while the app is closed.
// Each dungeon can have one dive running at a time.
function runDungeon(d) {
  refreshKeys();
  if (!dungeonsOpen() || S.keys[d.id] < 1 || S.dives[d.id]) return;
  S.keys[d.id] -= 1;
  const now = Date.now();
  S.dives[d.id] = { start: now, end: now + diveSecs(S.dungeons[d.id]) * 1000 };
  Sound.seed();
  save();
  ui.builtKey = '';
  updateUI();
}
function finishDungeon(d) {
  delete S.dives[d.id];
  const amt = dungeonReward(d);
  if (d.id === 'lumen') { S.lumen += amt; S.totalEarned += amt; }
  else if (d.id === 'pearl') S.pearls += amt;
  else { S.eggs += amt; S.eggsFound += amt; }
  S.dungeons[d.id] += 1;
  Sound.milestone();
  ui.lastLoot = { id: d.id, text: '+' + fmtInt(amt) + ' ' + d.what };
  save();
  ui.builtKey = '';
}
function checkDives() {
  const now = Date.now();
  DUNGEONS.forEach((d) => { if (S.dives[d.id] && now >= S.dives[d.id].end) finishDungeon(d); });
}

// Levels 1–5: Common only. Each later tier unlocks 5 levels after the one before
// and gains +1% chance per level from then on.
function hatchOdds(L) {
  const p = RARITIES.map((_, k) => (k === 0 ? 0 : Math.max(0, L - 5 * k)));
  const sum = p.reduce((a, b) => a + b, 0);
  const scale = sum > 95 ? 95 / sum : 1;
  const out = p.map((x) => x * scale);
  out[0] = 100 - out.reduce((a, b) => a + b, 0);
  return out;
}
function rollRarity(L = S.hatchLvl) {
  const odds = hatchOdds(L);
  let r = Math.random() * 100;
  for (let k = odds.length - 1; k > 0; k--) {
    if (r < odds[k]) return k;
    r -= odds[k];
  }
  return 0;
}
const petBonus = (p) => 1 + 0.1 * Math.pow(p.rarity + 1, 1.6);
function petMult(kind) {
  return S.pets.filter((p) => p.active && p.kind === kind).reduce((m, p) => m * petBonus(p), 1);
}
function petOffline() {
  return S.pets.filter((p) => p.active && p.kind === 'offline').reduce((s, p) => s + (petBonus(p) - 1) * 0.2, 0);
}
// Hatching takes time: 30s, +15s per hatchery level (better odds, longer wait).
// One egg incubates at a time; saved as a timestamp so it hatches while the app is closed.
const incubateSecs = (L) => 30 + 15 * (L - 1);
function hatchEgg() {
  if (S.eggs < 1 || S.incubator) return;
  S.eggs -= 1;
  const now = Date.now();
  S.incubator = { start: now, end: now + incubateSecs(S.hatchLvl) * 1000, level: S.hatchLvl };
  Sound.click();
  save();
  updateUI();
}
function checkIncubator() {
  if (S.incubator && Date.now() >= S.incubator.end) finishHatch();
}
function finishHatch() {
  const L = S.incubator.level;
  S.incubator = null;
  const kinds = Object.keys(PET_KINDS);
  const pet = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), rarity: rollRarity(L), kind: kinds[Math.floor(Math.random() * kinds.length)], active: false };
  if (S.pets.filter((p) => p.active).length < PET_SLOTS) pet.active = true;
  S.pets.push(pet);
  renderReefPets();
  ui.newPet = pet.id;
  if (pet.rarity >= 3) Sound.milestone(); else Sound.perk();
  save();
  ui.builtKey = '';
}
function togglePet(id) {
  const p = S.pets.find((x) => x.id === id);
  if (!p) return;
  if (!p.active && S.pets.filter((x) => x.active).length >= PET_SLOTS) return;
  p.active = !p.active;
  renderReefPets();
  Sound.click();
  save();
  ui.builtKey = '';
  updateUI();
}
const hatchUnlocked = () => S.eggsFound >= HATCH.unlockEggs;
const hatchSecs = (L) => HATCH.firstSecs + HATCH.stepSecs * (L - 1);
const hatchCost = (L) => HATCH.baseCost * Math.pow(HATCH.costGrowth, L - 1);
function startHatchUpgrade() {
  const L = S.hatchLvl;
  if (!hatchUnlocked() || S.hatchUpgradeEnd || L >= HATCH.maxLevel) return;
  const cost = hatchCost(L);
  if (S.lumen < cost) return;
  S.lumen -= cost;
  S.hatchUpgradeEnd = Date.now() + hatchSecs(L) * 1000;
  Sound.buy();
  save();
  updateUI();
}
function checkHatchTimer() {
  if (S.hatchUpgradeEnd && Date.now() >= S.hatchUpgradeEnd) {
    S.hatchUpgradeEnd = 0;
    S.hatchLvl += 1;
    Sound.milestone();
    save();
    ui.builtKey = '';
  }
}
function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${x}s` : `${x}s`;
}
const pctText = (p) => (p < 10 ? String(Math.round(p * 10) / 10) : String(Math.round(p))) + '%';

function buildDive() {
  document.querySelectorAll('#diveSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sub === S.diveSub)));
  const root = $('diveBody');
  if (S.diveSub === 'pets') { buildPets(root); return; }
  if (S.diveSub === 'gear') { buildGear(root); return; }
  refreshKeys();
  if (!dungeonsOpen()) {
    root.innerHTML = '<div class="panel"><b>The dungeons are sealed</b><span class="sub">Call your first tide to open them.</span></div>';
    return;
  }
  root.innerHTML = DUNGEONS.map((d) => `
    <div class="dcard" data-id="${d.id}" style="--dc:${d.color}">
      <div class="row"><b class="dname">${d.name}</b><span class="small strong">Lv ${S.dungeons[d.id]}</span></div>
      <span class="sub small">Reward <b class="rew"></b> · grows every level</span>
      <span class="sub small">Dive time <b class="dtime">${fmtTime(diveSecs(S.dungeons[d.id]))}</b> · +43s every level</span>
      <div class="drow">
        <span class="keys">${[0, 1].map((i) => `<i class="key${i < S.keys[d.id] ? ' on' : ''}"></i>`).join('')}<span class="small muted">${S.keys[d.id]}/${KEYS_PER_DAY} keys</span></span>
        <button type="button" class="btn small-btn dbtn"></button>
      </div>
      <div class="bar dbar" hidden><div class="fill"></div></div>
    </div>`).join('') + '<p class="note muted center">2 keys per dungeon each day. New keys in <span id="keyReset"></span>.</p>';
  root.querySelectorAll('.dcard').forEach((card) => {
    const d = DUNGEONS.find((x) => x.id === card.dataset.id);
    card.querySelector('.dbtn').addEventListener('click', () => runDungeon(d));
  });
  if (ui.lastLoot) {
    const c = root.querySelector(`[data-id="${ui.lastLoot.id}"]`);
    if (c) { restartClass(c, 'ms'); floatText(c, ui.lastLoot.text, true); }
    ui.lastLoot = null;
  }
}
function updateDive() {
  $('lumen3').textContent = fmt(S.lumen);
  if (S.diveSub === 'pets') { updatePets(); return; }
  if (S.diveSub === 'gear') { updateGear(); return; }
  if (!dungeonsOpen()) return;
  document.querySelectorAll('.dcard').forEach((card) => {
    const d = DUNGEONS.find((x) => x.id === card.dataset.id);
    const dive = S.dives[d.id];
    const now = Date.now();
    card.querySelector('.rew').textContent = '+' + fmtInt(dungeonReward(d)) + ' ' + d.what;
    const btn = card.querySelector('.dbtn');
    btn.disabled = S.keys[d.id] < 1 || !!dive;
    btn.textContent = dive ? fmtTime((dive.end - now) / 1000) + ' left' : S.keys[d.id] < 1 ? 'No keys' : 'Enter';
    const bar = card.querySelector('.dbar');
    bar.hidden = !dive;
    if (dive) bar.firstElementChild.style.width = Math.min(100, (now - dive.start) / (dive.end - dive.start) * 100) + '%';
  });
  const n = new Date();
  const midnight = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
  if ($('keyReset')) $('keyReset').textContent = fmtTime((midnight - n) / 1000);
}

function petTile(p) {
  const r = RARITIES[p.rarity];
  const k = PET_KINDS[p.kind];
  const bonus = p.kind === 'offline' ? '+' + Math.round((petBonus(p) - 1) * 20) + '% offline' : '×' + petBonus(p).toFixed(2) + ' ' + k.desc;
  return `<button type="button" class="pet" data-id="${p.id}" aria-pressed="${p.active}" style="--rc:${r.color}">
    <span class="pet-art" aria-hidden="true"><i></i><i></i></span><b>${k.name}</b><span class="r">${r.name}</span><span class="small">${bonus}</span></button>`;
}
function buildPets(root) {
  const odds = hatchOdds(S.hatchLvl).map((p, k) => ({ p, k })).filter((o) => o.p > 0).reverse().slice(0, 4);
  const active = S.pets.filter((p) => p.active).length;
  const pets = S.pets.slice().sort((a, b) => b.rarity - a.rarity);
  root.innerHTML = `
    <div class="panel">
      <div class="row"><b>Eggs</b><span id="eggCount" class="gold strong"></span></div>
      <button type="button" id="hatchBtn" class="btn primary gold-btn">Hatch an egg</button>
      <div id="incBar" class="bar" hidden><div class="fill gold-bg"></div></div>
      <span class="sub small">Win eggs in the Nesting Caves. Each pet boosts Lumen, taps, creatures, Pearls or offline earnings.</span>
    </div>
    <div class="panel">
      <div class="row"><b>Hatchery</b><span id="hLvl" class="small strong"></span></div>
      <div class="odds">${odds.map((o) => `<span style="color:${RARITIES[o.k].color}">${RARITIES[o.k].name} ${pctText(o.p)}</span>`).join('')}</div>
      <div id="hBody" class="stack"></div>
    </div>
    <div class="row pad"><span class="label">Pets · ${active}/${PET_SLOTS} active</span><span class="small muted">Tap to switch on or off</span></div>
    <div class="pet-grid">${pets.length ? pets.map(petTile).join('') : '<p class="sub">No pets yet. Hatch an egg!</p>'}</div>`;
  $('hatchBtn').addEventListener('click', hatchEgg);
  root.querySelectorAll('.pet').forEach((b) => b.addEventListener('click', () => togglePet(b.dataset.id)));
  ui.hatchState = null;
  if (ui.newPet) {
    const t = root.querySelector(`[data-id="${ui.newPet}"]`);
    if (t) restartClass(t, 'hatched');
    ui.newPet = null;
  }
}
function updatePets() {
  $('eggCount').textContent = fmtInt(S.eggs) + (S.eggs === 1 ? ' egg' : ' eggs');
  const inc = S.incubator;
  const now = Date.now();
  $('hatchBtn').disabled = S.eggs < 1 || !!inc;
  $('hatchBtn').textContent = inc ? `Hatching… ${fmtTime((inc.end - now) / 1000)}` : `Hatch an egg · ${fmtTime(incubateSecs(S.hatchLvl))}`;
  $('incBar').hidden = !inc;
  if (inc) $('incBar').firstElementChild.style.width = Math.min(100, (now - inc.start) / (inc.end - inc.start) * 100) + '%';
  const L = S.hatchLvl;
  $('hLvl').textContent = 'Lv ' + L;
  const state = !hatchUnlocked() ? 'locked' : S.hatchUpgradeEnd ? 'timer' : L >= HATCH.maxLevel ? 'max' : 'ready';
  const body = $('hBody');
  if (ui.hatchState !== state) {
    ui.hatchState = state;
    if (state === 'locked' || state === 'timer') body.innerHTML = '<span id="hText" class="sub small"></span><div class="bar"><div id="hBar" class="fill gold-bg"></div></div>';
    else if (state === 'max') body.innerHTML = '<span class="sub small">The hatchery is at max level.</span>';
    else { body.innerHTML = '<button type="button" id="hUp" class="btn"></button>'; $('hUp').addEventListener('click', startHatchUpgrade); }
  }
  if (state === 'locked') {
    $('hText').textContent = `Find ${HATCH.unlockEggs} eggs to unlock upgrades (${Math.min(S.eggsFound, HATCH.unlockEggs)}/${HATCH.unlockEggs})`;
    $('hBar').style.width = Math.min(100, S.eggsFound / HATCH.unlockEggs * 100) + '%';
  } else if (state === 'timer') {
    const total = hatchSecs(L) * 1000;
    const left = S.hatchUpgradeEnd - Date.now();
    $('hText').textContent = `Upgrading to Lv ${L + 1}: ${fmtTime(left / 1000)} left`;
    $('hBar').style.width = Math.min(100, (1 - left / total) * 100) + '%';
  } else if (state === 'ready') {
    $('hUp').textContent = `Upgrade to Lv ${L + 1} · ${fmt(hatchCost(L))} Lumen · ${fmtTime(hatchSecs(L))}`;
    $('hUp').disabled = S.lumen < hatchCost(L);
  }
}
// ---- Gear: chests from Twilight Trench tides onward; never lost ---------------
const GEAR_SLOTS = {
  crown: { name: 'Crown', stat: 'Attack', icon: 'M3 18h18M4 18l-1-10 5 4 4-7 4 7 5-4-1 10', names: ['Brine Crown', 'Shell Crown', 'Angler Lure', 'Abyss Crown'] },
  shell: { name: 'Shell', stat: 'Armour', icon: 'M12 3a9 9 0 1 0 9 9c0-3-2-5-5-5s-4 2-4 4 1 3 3 3', names: ['Kelp Wrap', 'Nautilus Plate', 'Whalebone Shell', 'Titan Carapace'] },
  charm: { name: 'Charm', stat: 'Crit', icon: 'M12 3v4M12 7a6 6 0 1 0 0 12a6 6 0 1 0 0-12', names: ['Coral Ring', 'Pearl Locket', 'Moon Charm', 'Tide Heart'] },
  lantern: { name: 'Lantern', stat: 'Sight', icon: 'M9 3h6M10 3v3M14 3v3M7 6h10v12H7zM12 10v4M9 21h6', names: ['Glass Lantern', 'Abyss Lamp', 'Trench Eye', 'Star Lantern'] },
};
const GEAR_RARITY = [
  { name: 'Common', color: '#B5C2DA', weight: 60, value: 1.3, shards: 1 },
  { name: 'Rare', color: '#6FB8FF', weight: 28, value: 1.8, shards: 4 },
  { name: 'Epic', color: '#C79BFF', weight: 10, value: 2.5, shards: 15 },
  { name: 'Mythic', color: '#FFC46B', weight: 2, value: 4, shards: 60 },
];
const gearOpen = () => S.zone >= 2 || S.gear.items.length > 0 || S.gear.chests > 0;
const gearItem = (id) => S.gear.items.find((g) => g.id === id);
function gearMult(slot) {
  const g = gearItem(S.gear.equipped[slot]);
  return g ? GEAR_RARITY[g.rarity].value : 1;
}
const gearStat = (g) => GEAR_SLOTS[g.slot].stat + ' ×' + GEAR_RARITY[g.rarity].value;
// A random piece of gear. Fills an empty slot automatically; with autoEquip it also
// replaces a weaker piece (chests do, battle drops let the player choose).
function rollGearItem(autoEquip) {
  let r = Math.random() * 100, rarity = 0;
  for (let k = GEAR_RARITY.length - 1; k > 0; k--) {
    if (r < GEAR_RARITY[k].weight) { rarity = k; break; }
    r -= GEAR_RARITY[k].weight;
  }
  const slots = Object.keys(GEAR_SLOTS);
  const slot = slots[Math.floor(Math.random() * slots.length)];
  const g = { id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), slot, rarity, name: GEAR_SLOTS[slot].names[rarity] };
  S.gear.items.push(g);
  if (!S.gear.equipped[slot] || (autoEquip && gearMult(slot) < GEAR_RARITY[rarity].value)) S.gear.equipped[slot] = g.id;
  return g;
}
function openChest() {
  if (S.gear.chests < 1) return;
  S.gear.chests -= 1;
  const g = rollGearItem(true);
  const rarity = g.rarity;
  ui.gearSel = g.id;
  if (rarity >= 2) Sound.milestone(); else Sound.perk();
  save(); ui.builtKey = ''; updateUI();
}
function equipGear(id) {
  const g = gearItem(id);
  if (!g) return;
  S.gear.equipped[g.slot] = id;
  Sound.buy(); save(); ui.builtKey = ''; updateUI();
}
function dissolveGear(id) {
  const g = gearItem(id);
  if (!g || S.gear.equipped[g.slot] === id) return;
  S.gear.items = S.gear.items.filter((x) => x.id !== id);
  S.gear.shards += GEAR_RARITY[g.rarity].shards;
  ui.gearSel = null;
  Sound.click(); save(); ui.builtKey = ''; updateUI();
}
function gearIcon(slot, color, size) {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${GEAR_SLOTS[slot].icon}"/></svg>`;
}
function buildGear(root) {
  if (!gearOpen()) {
    root.innerHTML = '<div class="panel"><b>Gear is waiting in the deep</b><span class="sub">Sunken chests wash up in the Twilight Trench and deeper: one with every tide. Gear is never lost, even when you descend.</span></div>';
    return;
  }
  const G = S.gear;
  const sel = gearItem(ui.gearSel) || gearItem(G.equipped.crown) || G.items[0];
  const slotTiles = Object.keys(GEAR_SLOTS).map((slot) => {
    const g = gearItem(G.equipped[slot]);
    const c = g ? GEAR_RARITY[g.rarity].color : '#4C6E78';
    return `<button type="button" class="gslot" data-id="${g ? g.id : ''}" aria-pressed="${!!(g && sel && g.id === sel.id)}" style="--rc:${c}">
      <span class="gicon">${gearIcon(slot, c, 22)}</span>
      <span class="gtext"><span class="label">${GEAR_SLOTS[slot].name}</span><b>${g ? g.name : 'Empty'}</b><span class="small" style="color:${c}">${g ? gearStat(g) : '—'}</span></span></button>`;
  }).join('');
  const inv = G.items.filter((g) => G.equipped[g.slot] !== g.id).sort((a, b) => b.rarity - a.rarity);
  const invTiles = inv.length ? inv.map((g) => {
    const r = GEAR_RARITY[g.rarity];
    return `<button type="button" class="gitem" data-id="${g.id}" aria-pressed="${!!(sel && g.id === sel.id)}" style="--rc:${r.color}">${gearIcon(g.slot, r.color, 24)}<b>${g.name}</b><span class="r">${r.name}</span></button>`;
  }).join('') : '<p class="sub">Nothing spare yet.</p>';
  let detail = '';
  if (sel) {
    const r = GEAR_RARITY[sel.rarity];
    const worn = gearItem(G.equipped[sel.slot]);
    const isWorn = worn && worn.id === sel.id;
    const cmp = isWorn ? 'Equipped' : worn ? (r.value > GEAR_RARITY[worn.rarity].value ? 'Better than ' : r.value < GEAR_RARITY[worn.rarity].value ? 'Weaker than ' : 'Same as ') + worn.name : 'Slot is empty';
    detail = `<div class="panel gdetail" style="--rc:${r.color}">
      <div class="row"><b>${sel.name}</b><span class="small strong" style="color:${r.color}">${r.name} ${GEAR_SLOTS[sel.slot].name}</span></div>
      <span class="sub">${gearStat(sel)} · ${cmp}</span>
      ${isWorn ? '' : `<div class="two"><button type="button" id="gEquip" class="btn small-btn gear-btn">Equip</button><button type="button" id="gDissolve" class="btn">Dissolve +${r.shards}</button></div>`}
    </div>`;
  }
  root.innerHTML = `
    <div class="panel"><div class="row"><b>Sunken chests</b><span class="small strong"><span id="chestCount"></span> · Shards ${fmtInt(G.shards)}</span></div>
      <button type="button" id="chestBtn" class="btn primary gear-btn">Open a chest</button>
      <span class="sub small">One chest with every tide in the Twilight Trench and deeper.</span></div>
    <div class="label pad">Equipped</div>
    <div class="gslots">${slotTiles}</div>
    <div class="label pad">Found · ${inv.length}</div>
    <div class="ggrid">${invTiles}</div>
    ${detail}`;
  $('chestBtn').addEventListener('click', openChest);
  root.querySelectorAll('.gslot, .gitem').forEach((b) => b.addEventListener('click', () => {
    if (!b.dataset.id) return;
    ui.gearSel = b.dataset.id; Sound.click(); ui.builtKey = ''; updateUI();
  }));
  if (sel && $('gEquip')) {
    $('gEquip').addEventListener('click', () => equipGear(sel.id));
    $('gDissolve').addEventListener('click', () => dissolveGear(sel.id));
  }
}
function updateGear() {
  if (!$('chestCount')) return;
  $('chestCount').textContent = S.gear.chests + (S.gear.chests === 1 ? ' chest' : ' chests');
  $('chestBtn').disabled = S.gear.chests < 1;
}

document.querySelectorAll('#diveSeg button').forEach((b) => b.addEventListener('click', () => {
  Sound.click();
  S.diveSub = b.dataset.sub;
  ui.builtKey = '';
  updateUI();
}));

// ---- Kelp Forest: merge garden ------------------------------------------------
// No tapping here: spores drift in on the current, two matching plants merge into the
// next tier, and every plant makes Jade sap (the zone's currency for the tide bar).
const KELP = [null,
  { name: 'Spore', color: '#2E6B4F', rate: 2 }, { name: 'Sprout', color: '#3F8F63', rate: 8 },
  { name: 'Frond', color: '#4FB377', rate: 30 }, { name: 'Kelp', color: '#6FE3A5', rate: 120 },
  { name: 'Glow kelp', color: '#9BF0C2', rate: 500 }, { name: 'Kelp tower', color: '#C8FFE0', rate: 2000 },
  { name: 'Jade crown', color: '#FFFFFF', rate: 8000 },
];
const GARDEN_UPS = [
  { id: 'spore', name: 'Swift current', desc: 'Spores arrive 15% faster', base: 50, growth: 3, max: 10, tint: '#6FE3A5' },
  { id: 'sap', name: 'Rich water', desc: 'All sap ×1.5', base: 200, growth: 4, tint: '#9BF0C2' },
  { id: 'auto', name: 'Tidy tide', desc: 'Merges a matching pair for you every few seconds', base: 1000, growth: 6, max: 5, tint: '#C8FFE0' },
];
const gUp = (id) => S.garden.up[id] || 0;
const sporeSecs = () => Math.max(1, 6 * Math.pow(0.85, gUp('spore')));
const autoSecs = () => 12 / Math.max(1, gUp('auto'));
function gardenRate() {
  return S.garden.cells.reduce((s, t) => s + (t ? KELP[t].rate : 0), 0) * Math.pow(1.5, gUp('sap'));
}
function spawnSpore() {
  const empty = S.garden.cells.map((t, i) => (t ? -1 : i)).filter((i) => i >= 0);
  ui.nextSpore = Date.now() + sporeSecs() * 1000;
  if (!empty.length) return false;
  S.garden.cells[empty[Math.floor(Math.random() * empty.length)]] = 1;
  ui.gardenDirty = true;
  return true;
}
function mergeCells(from, to) {
  const c = S.garden.cells;
  c[to] += 1;
  c[from] = 0;
  ui.gardenSel = -1;
  ui.justMerged = to;
  ui.gardenHint = 'Merged into ' + KELP[c[to]].name + '!';
  if (c[to] >= 4) Sound.milestone(); else Sound.buy();
  ui.gardenDirty = true;
}
function tapCell(i) {
  const c = S.garden.cells;
  const sel = ui.gardenSel ?? -1;
  ui.gardenDirty = true;
  if (!c[i]) { ui.gardenSel = -1; return; }
  if (sel === -1 || sel === i) { ui.gardenSel = sel === i ? -1 : i; Sound.click(); return; }
  if (c[sel] === c[i] && c[i] < KELP.length - 1) mergeCells(sel, i);
  else { ui.gardenSel = i; Sound.click(); }
}
function autoMerge() {
  const c = S.garden.cells;
  for (let t = 1; t < KELP.length - 1; t++) {
    const idx = c.map((v, i) => (v === t ? i : -1)).filter((i) => i >= 0);
    if (idx.length >= 2) { mergeCells(idx[0], idx[1]); return; }
  }
}
function gardenTick(now) {
  if (!ui.nextSpore) ui.nextSpore = now + sporeSecs() * 1000;
  if (now >= ui.nextSpore) spawnSpore();
  if (gUp('auto')) {
    if (!ui.nextAutoMerge) ui.nextAutoMerge = now + autoSecs() * 1000;
    if (now >= ui.nextAutoMerge) { autoMerge(); ui.nextAutoMerge = now + autoSecs() * 1000; }
  }
}
function renderGarden() {
  const sel = ui.gardenSel ?? -1;
  $('gardenGrid').innerHTML = S.garden.cells.map((t, i) => {
    const k = KELP[t];
    const art = t ? `<svg aria-hidden="true" width="${10 + t * 3}" height="${16 + t * 6}" viewBox="0 0 20 40" style="animation-delay:${-(i % 7) * 0.5}s"><path d="M10 40 C 4 30, 16 22, 9 12 C 6 7, 10 3, 10 0 C 14 6, 18 12, 13 20 C 9 27, 15 33, 10 40 Z" fill="${k.color}"/></svg><span>${t}</span>` : '';
    return `<button type="button" class="gcell${t ? ' full' : ''}${i === sel ? ' sel' : ''}${i === ui.justMerged ? ' merged' : ''}" data-i="${i}" aria-pressed="${i === sel}" aria-label="${t ? k.name + ', tier ' + t : 'Empty plot'}">${art}</button>`;
  }).join('');
  ui.justMerged = -1;
}
$('gardenGrid').addEventListener('click', (e) => {
  const b = e.target.closest('.gcell');
  if (b) { tapCell(Number(b.dataset.i)); updateUI(); }
});
$('catchSpore').addEventListener('click', () => {
  ui.gardenHint = spawnSpore() ? 'A spore drifted in on the current.' : 'The garden is full: merge plants to make room.';
  Sound.click();
  updateUI();
});
function updateGarden() {
  $('gSap').textContent = fmt(S.lumen);
  $('gRate').textContent = '+' + fmt(ratePerSec()) + ' sap per second';
  $('gPearl').textContent = 'Jade Pearls: ' + fmtInt(S.pearls);
  const left = Math.max(0, (ui.nextSpore || Date.now()) - Date.now());
  $('sporeBar').style.width = Math.min(100, (1 - left / (sporeSecs() * 1000)) * 100) + '%';
  $('gHint').textContent = ui.gardenHint || 'Tap two matching plants to merge them into a taller one. Taller kelp makes more sap.';
  if (ui.gardenDirty) { renderGarden(); ui.gardenDirty = false; }
}
function buildGardenUps(list) {
  ui.gardenRows = GARDEN_UPS.map((u) => {
    const row = document.createElement('div');
    row.className = 'crow';
    row.innerHTML = `<div class="sw" style="background:${u.tint}"></div>
      <div class="meta"><div class="nm"><b>${u.name}</b><span></span></div><div class="pk">${u.desc}</div></div>
      <button type="button" class="buy"><span class="m">Upgrade</span><span class="k"></span></button>`;
    const btn = row.querySelector('.buy');
    btn.addEventListener('click', () => buyGardenUp(u));
    list.appendChild(row);
    return { u, row, btn, lv: row.querySelector('.nm span'), k: btn.querySelector('.k') };
  });
}
const gardenUpCost = (u) => u.base * Math.pow(u.growth, gUp(u.id));
function updateGardenUps() {
  (ui.gardenRows || []).forEach(({ u, btn, lv, k }) => {
    const r = gUp(u.id);
    const maxed = u.max && r >= u.max;
    lv.textContent = 'Rank ' + r + (u.max ? '/' + u.max : '');
    k.textContent = maxed ? 'Maxed' : fmt(gardenUpCost(u)) + ' sap';
    btn.disabled = maxed || S.lumen < gardenUpCost(u);
  });
}
function buyGardenUp(u) {
  const r = gUp(u.id);
  if (u.max && r >= u.max) return;
  const cost = gardenUpCost(u);
  if (S.lumen < cost) return;
  S.lumen -= cost;
  S.garden.up[u.id] = r + 1;
  const row = ui.gardenRows.find((x) => x.u === u);
  if (row) { restartClass(row.row, 'lvlup'); floatText(row.row, 'Rank ' + (r + 1), false); }
  Sound.buy();
  save();
  updateUI();
}

// ---- Twilight Trench: gear auto-battler ---------------------------------------
// The Guardian fights sea creatures on its own; its power comes from equipped gear.
// Stages run 1-1 … 9-10 (x-10 is a boss), then Hard 1-1 … Hard 9-10, Extreme, Godlike
// and on. Losing drops back one level. Wins pay Lumen (for the tide bar) and can drop gear.
const TIERS = [
  { name: 'Normal', color: '#C79BFF' }, { name: 'Hard', color: '#FFC46B' }, { name: 'Extreme', color: '#FF8A5C' },
  { name: 'Godlike', color: '#FFF3B0' }, { name: 'Demonic', color: '#FF6B6B' }, { name: 'Abyssal', color: '#9DB8FF' },
  { name: 'Eternal', color: '#5CF2D6' }, { name: 'Ultra', color: '#FFFFFF' },
];
const FOES = [
  { name: 'Lanternfish swarm', color: '#FFC46B' }, { name: 'Gulper eel', color: '#9DB8FF' },
  { name: 'Vampire squid', color: '#FF6B6B' }, { name: 'Giant isopod', color: '#B5C2DA' },
  { name: 'Frilled shark', color: '#6FB8FF' },
];
const BOSS = { name: 'Abyss kraken', color: '#E58BFF' };
const BAT = { tierMult: 8, levelGrowth: 1.035, chestChance: 0.3, autoSecs: 2.5, winBase: 5000, winGrowth: 1.1 };
function tierOf(d) {
  const t = TIERS[Math.min(d, TIERS.length - 1)];
  return { name: t.name + (d >= TIERS.length ? ' ' + (d - TIERS.length + 2) : ''), color: t.color };
}
function stageLabel(b = S.battle) {
  return (b.diff ? tierOf(b.diff).name + ' ' : '') + b.wave + '-' + b.level;
}
const isBossStage = () => S.battle.level === 10;
const foeOf = () => (isBossStage() ? BOSS : FOES[(S.battle.wave + S.battle.level) % FOES.length]);
function guardianPower() {
  return Math.round(40 * gearMult('crown') * Math.sqrt(gearMult('shell')) * Math.sqrt(gearMult('charm'))
    * Math.cbrt(gearMult('lantern')) * Math.pow(1.5, rank('shadow', 'lasting')));
}
function foePower() {
  const b = S.battle;
  return Math.round(40 * Math.pow(BAT.tierMult, b.diff) * Math.pow(BAT.levelGrowth, (b.wave - 1) * 10 + b.level - 1) * (isBossStage() ? 1.5 : 1));
}
function winReward() {
  const b = S.battle;
  return BAT.winBase * Math.pow(BAT.winGrowth, (b.wave - 1) * 10 + b.level - 1 + b.diff * 20)
    * Math.pow(2, rank('shadow', 'echo')) * globalMult(false);
}
const bubbleCount = () => (S.battle.level >= 4 ? 2 : 1);
const bubbleCost = () => winReward() * 6;
function fight() {
  const now = Date.now();
  if (now < (ui.fightReadyAt || 0) || ui.washing) return;
  ui.fightReadyAt = now + 900;
  const b = S.battle;
  const foe = foeOf();
  const won = Math.random() < guardianPower() / (guardianPower() + foePower());
  const before = stageLabel();
  restartClass($('guardian'), 'lunge', 700);
  restartClass($('foe'), 'lunge-l', 700);
  ui.battleDrops = [];
  if (won) {
    const reward = winReward();
    if (!tideFull()) earn(reward);
    const boss = isBossStage();
    if (b.level < 10) b.level += 1;
    else if (b.wave < 9) { b.wave += 1; b.level = 1; }
    else { b.diff += 1; b.wave = 1; b.level = 1; }
    let msg = (boss ? 'Boss down! ' : 'Won ' + before + '! ') + '+' + fmt(reward) + ' Lumen.';
    if (b.diff && b.wave === 1 && b.level === 1 && boss) msg = tierOf(b.diff).name + ' unlocked! ' + msg;
    if (boss || Math.random() < BAT.chestChance) {
      ui.battleDrops = [rollGearItem(false)];
      msg += ' A sunken chest dropped!';
    }
    b.log = msg;
    ui.hpAnim = 'foe';
    floatTextAt($('arenaPops'), '+' + fmt(reward), 'right');
    if (boss) Sound.milestone(); else Sound.buy();
  } else {
    if (b.level > 1) b.level -= 1;
    else if (b.wave > 1) { b.wave -= 1; b.level = 10; }
    b.log = 'Defeated by the ' + foe.name + '. Back to ' + stageLabel() + '. Better gear helps.';
    ui.hpAnim = 'me';
    Sound.click();
  }
  ui.battleDirty = true;
  save();
  updateUI();
}
function floatTextAt(parent, text, side) {
  const f = document.createElement('span');
  f.className = 'float gold arena-float ' + side;
  f.textContent = text;
  parent.appendChild(f);
  setTimeout(() => f.remove(), 950);
}
function openBubble() {
  const cost = bubbleCost();
  if (S.lumen < cost) return;
  S.lumen -= cost;
  const n = bubbleCount();
  ui.battleDrops = Array.from({ length: n }, () => rollGearItem(false));
  S.battle.log = 'The Lumen bubble pops: ' + n + (n > 1 ? ' pieces' : ' piece') + ' of gear. Could be better, could be worse.';
  restartClass($('bubble'), 'pop-b', 600);
  Sound.perk();
  ui.battleDirty = true;
  save();
  updateUI();
}
function battleTick(now) {
  if (S.battle.auto && !tideFull() && $('modal').hidden && now >= (ui.nextAutoFight || 0)) {
    ui.nextAutoFight = now + BAT.autoSecs * 1000;
    fight();
  }
}
$('fightBtn').addEventListener('click', fight);
$('bubble').addEventListener('click', openBubble);
$('autoBtn').addEventListener('click', () => {
  S.battle.auto = !S.battle.auto;
  ui.nextAutoFight = Date.now() + 600;
  Sound.click();
  save();
  updateUI();
});
$('bDrops').addEventListener('click', (e) => {
  const b = e.target.closest('[data-equip]');
  if (!b) return;
  equipGear(b.dataset.equip);
  ui.battleDrops = (ui.battleDrops || []).filter((g) => g.id !== b.dataset.equip);
  S.battle.log = 'Equipped ' + gearItem(b.dataset.equip).name + '.';
  ui.battleDirty = true;
  updateUI();
});
function renderBattle() {
  const b = S.battle;
  const tier = tierOf(b.diff);
  const foe = foeOf();
  $('bTier').textContent = tier.name;
  $('bTier').style.color = tier.color;
  $('bStage').textContent = stageLabel();
  $('bStage').style.color = tier.color;
  $('bLine').textContent = 'Wave ' + b.wave + '/9 · Level ' + b.level + '/10';
  $('bPips').innerHTML = Array.from({ length: 10 }, (_, i) =>
    `<i class="${i < b.level - 1 ? 'done' : i === b.level - 1 ? 'now' : ''}"></i>`).join('');
  $('foeName').textContent = (isBossStage() ? 'Boss: ' : '') + foe.name;
  $('foeName').style.color = foe.color;
  $('foeBody').setAttribute('fill', foe.color);
  $('foeTail').setAttribute('fill', foe.color);
  const crown = gearItem(S.gear.equipped.crown);
  $('gCrown').setAttribute('stroke', crown ? GEAR_RARITY[crown.rarity].color : '#4C6E78');
  $('bLog').textContent = b.log || 'Your Guardian fights on its own with the gear below. Wins pay Lumen and can drop a sunken chest; the bubble opens more gear.';
  $('bDrops').innerHTML = (ui.battleDrops || []).map((g) => {
    const r = GEAR_RARITY[g.rarity];
    const worn = gearItem(S.gear.equipped[g.slot]);
    const isWorn = worn && worn.id === g.id;
    const wv = worn ? GEAR_RARITY[worn.rarity].value : 1;
    const cmp = isWorn ? 'Equipped' : r.value > wv ? 'Better' : r.value === wv ? 'Same' : 'Worse';
    const cls = cmp === 'Better' || cmp === 'Equipped' ? 'jade' : cmp === 'Worse' ? 'red' : 'muted';
    return `<div class="drop"><span class="gicon" style="--rc:${r.color}">${gearIcon(g.slot, r.color, 18)}</span>
      <span class="dtext"><b>${g.name}</b><span class="small ${cls}">${r.name} · ${gearStat(g)} · ${cmp}</span></span>
      ${!isWorn && r.value > wv ? `<button type="button" class="btn small-btn gear-btn" data-equip="${g.id}">Equip</button>` : ''}</div>`;
  }).join('');
  $('bSlots').innerHTML = Object.keys(GEAR_SLOTS).map((slot) => {
    const g = gearItem(S.gear.equipped[slot]);
    const c = g ? GEAR_RARITY[g.rarity].color : '#4C6E78';
    return `<div class="bslot" style="--rc:${c}"><span class="label">${GEAR_SLOTS[slot].name}</span><span class="gicon">${gearIcon(slot, c, 20)}</span>
      <b>${g ? g.name : 'Empty'}</b><span class="small" style="color:${c}">${g ? gearStat(g) : '—'}</span></div>`;
  }).join('');
  // Loser's health bar drains, then both refill for the next fight.
  $('myHp').style.width = ui.hpAnim === 'me' ? '0%' : '100%';
  $('foeHp').style.width = ui.hpAnim === 'foe' ? '0%' : '100%';
  if (ui.hpAnim) {
    ui.hpAnim = null;
    setTimeout(() => { $('myHp').style.width = '100%'; $('foeHp').style.width = '100%'; }, 650);
  }
}
function updateBattle() {
  if (ui.battleDirty) { renderBattle(); ui.battleDirty = false; }
  $('bLumen').textContent = fmt(S.lumen) + ' Lumen · wins pay +' + fmt(winReward());
  $('bPearl').textContent = 'Shadow Pearls: ' + fmtInt(S.pearls);
  $('bPower').textContent = 'Power ' + fmt(guardianPower()) + ' vs ' + fmt(foePower());
  const n = bubbleCount();
  $('bubble').innerHTML = `×${n}<span>${fmt(bubbleCost())}</span>`;
  $('bubble').disabled = S.lumen < bubbleCost();
  $('bubble').setAttribute('aria-label', `Lumen bubble: open ${n} gear for ${fmt(bubbleCost())} Lumen`);
  $('autoBtn').textContent = S.battle.auto ? 'Auto: on' : 'Auto: off';
  $('autoBtn').setAttribute('aria-pressed', String(S.battle.auto));
  $('fightBtn').disabled = tideFull();
}

// ---- Loop ------------------------------------------------------------------
function updateUI() {
  checkFills();
  checkHatchTimer();
  checkDives();
  checkIncubator();
  const key = [ui.tab, S.revealed, S.zone, ui.pearlView, S.diveSub, S.hatchLvl, S.pets.length, dungeonsOpen()].join('|');
  if (key !== ui.builtKey) {
    if (ui.tab === 'creatures') buildCreatures();
    if (ui.tab === 'pearls') buildPearls();
    if (ui.tab === 'dive') buildDive();
    ui.builtKey = key;
  }
  if (ui.tab === 'reef') {
    updateReef();
    if (isKelp()) updateGarden();
    if (isTrench()) updateBattle();
  }
  if (ui.tab === 'creatures') updateCreatures();
  if (ui.tab === 'tide') updateTide();
  if (ui.tab === 'pearls') updatePearls();
  if (ui.tab === 'dive') updateDive();
  $('tideDot').hidden = pearlGain() < 1;
  if (tideFull() && !ui.washing && !ui.forcedOpen && $('modal').hidden) {
    ui.forcedOpen = true;
    showModal({
      title: 'The tide is full',
      body: `Your reef filled the bar ${BAL.tideSteps} times and stopped growing. Call the tide to bank ${fmtInt(pearlGain())} ${PEARLS[pearlType()].name} Pearls and grow again.`,
      ok: 'Call the tide',
      cancel: null,
      onOk: callTide,
    });
  }
  refreshKeys();
  $('diveDot').hidden = !(dungeonsOpen() && DUNGEONS.some((d) => S.keys[d.id] > 0));
}

let last = performance.now();
let uiAcc = 0;
let saveAcc = 0;
function frame(now) {
  const dt = Math.min(1, (now - last) / 1000);
  last = now;
  if (!tideFull()) earn(ratePerSec() * dt);

  if (zone().id === 'trench') {
    const dim = (1 - BAL.trenchFloor) / (BAL.trenchDimSecs * (1 + 0.5 * rank('shadow', 'lasting')) * gearMult('lantern'));
    S.light = Math.max(BAL.trenchFloor, S.light - dim * dt);
  }
  if (isKelp()) gardenTick(Date.now());
  if (isTrench()) battleTick(Date.now());

  while (S.revealed < CREATURES.length && S.tideEarned >= CREATURES[S.revealed].cost * 0.4) S.revealed++;

  uiAcc += dt; saveAcc += dt;
  if (uiAcc > 0.1) { uiAcc = 0; updateUI(); }
  if (saveAcc > 5) { saveAcc = 0; save(); }
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { save(); Sound.suspend(); }
  else { Sound.resume(); offlineCatchUp(); last = performance.now(); }
});
window.addEventListener('pagehide', save);

function offlineCatchUp() {
  const secs = Math.min((Date.now() - S.lastSeen) / 1000, BAL.offlineCapHours * 3600);
  if (secs < 30) return;
  const gained = ratePerSec(false) * secs * offlinePct();
  S.lastSeen = Date.now();
  if (gained < 1) return;
  earn(gained);
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  showModal({
    title: 'Welcome back',
    body: `While you were away (${h ? h + 'h ' : ''}${m}m), your ${isKelp() ? 'garden' : 'reef'} made ${fmt(gained)} ${cur()}.`,
    ok: 'Collect',
    cancel: null,
  });
}

S.audio = Object.assign(freshState().audio, S.audio);
syncSettings();
applyZone();
renderFish();
growCoral();
offlineCatchUp();
updateUI();
requestAnimationFrame(frame);
