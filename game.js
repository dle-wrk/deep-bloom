'use strict';

// ---- Balance: tune here ----------------------------------------------------
const SAVE_KEY = 'deepbloom-save-v1';
const BAL = {
  pearlDiv: 4e4,          // bar fill n completes when holding pearlDiv × n² Lumen; Pearls = fills × bonuses
  tideSteps: 100,         // after this many bar fills the tide must be called
  fillGrowth: 0.2,        // each fill is worth +0.2 Pearls more per tide called in this zone (~60 tides to 5,000)
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

// goal: zone Pearls earned to descend (Ember: to finish the demo).
// pearlMult: how much each Pearl step is worth here, so every zone takes about as long.
const ZONES = [
  { id: 'shallows', name: 'Shallows', pearl: 'white', goal: 5000, pearlMult: 1, rule: 'Tap, grow, tide.' },
  { id: 'kelp', name: 'Kelp Forest', pearl: 'jade', goal: 1e6, pearlMult: 200, rule: 'A merge garden: combine plants to grow taller kelp.' },
  { id: 'trench', name: 'Twilight Trench', pearl: 'shadow', goal: 1e9, pearlMult: 4e4, rule: 'A gear auto-battler: stages 1-1 to 9-10, then Hard, Extreme, Godlike…' },
  { id: 'ember', name: 'Ember Wastes', pearl: 'ember', goal: 1e12, pearlMult: 8e6, rule: 'Tower defense: the surface burned, and the fire is coming down. Snuff it out.' },
];
const EMBER = 3;
const END_GOAL = ZONES[EMBER].goal;

const PEARLS = {
  white: { name: 'White', color: '#F4EEE6', blurb: 'Spend them here. When you descend, they and their upgrades are gone for good.' },
  jade: { name: 'Jade', color: '#6FE3A5', blurb: 'You start from zero here, boosted by your Depth Mark. Upgrades that bend the rules.' },
  shadow: { name: 'Shadow', color: '#9DB8FF', blurb: 'Rare Pearls from the dark, earned in battle. Each one is worth a lot.' },
  ember: { name: 'Ember', color: '#FF9A5C', blurb: 'Pearls pulled from the ashes. Reach 1 trillion to finish the demo.' },
};

// Costs are in "zone units": they're multiplied by the zone's pearlMult (see perkCost).
const PERKS = {
  white: [
    { id: 'brighter', name: 'Brighter tides', desc: 'All Lumen ×1.5 per rank', base: 2, growth: 2.2 },
    { id: 'tapper', name: 'Strong fingers', desc: 'Taps ×3 per rank', base: 4, growth: 2.4 },
    { id: 'headstart', name: 'Head start', desc: 'Start each tide with polyps and lantern fish at Lv 5 per rank', base: 5, growth: 3, max: 10 },
    { id: 'night', name: 'Night shift', desc: 'Earn 25% while offline, +15% per rank', base: 3, growth: 2.5, max: 5 },
    { id: 'polyps', name: 'Glowing polyps', desc: 'All creatures ×2 per rank', base: 12, growth: 3 },
    { id: 'diver', name: 'Pearl diver', desc: '+10% White Pearls per tide, per rank', base: 10, growth: 2.4 },
  ],
  jade: [
    { id: 'currents', name: 'Strong currents', desc: 'Garden sap ×1.4 per rank', base: 2, growth: 2.2 },
    { id: 'sapflow', name: 'Sap flow', desc: 'Garden sap ×2 per rank', base: 10, growth: 3 },
    { id: 'sprouts', name: 'Lucky spores', desc: '20% per rank that a spore arrives as a Sprout', base: 6, growth: 2.6, max: 4 },
    { id: 'nursery', name: 'Seed bank', desc: 'Start each tide with 3 Fronds in the garden', base: 25, growth: 1, max: 1 },
    { id: 'memory', name: 'Tide memory', desc: 'Keep 5% of sap through a tide, per rank', base: 8, growth: 2.6, max: 10 },
    { id: 'roots', name: 'Fast roots', desc: 'Jade Pearls ×1.25 per rank', base: 6, growth: 2.5 },
  ],
  shadow: [
    { id: 'lasting', name: 'Battle hardened', desc: 'Guardian power ×1.25 per rank', base: 3, growth: 2.6 },
    { id: 'echo', name: 'Double strike', desc: 'Battle wins give ×2 Lumen, per rank', base: 5, growth: 3 },
    { id: 'armory', name: 'Salvager', desc: '+4% chest chance per win, per rank', base: 8, growth: 3, max: 5 },
    { id: 'shardfind', name: 'Shard sifter', desc: '+50% shards from dissolving, per rank', base: 6, growth: 2.6 },
    { id: 'eyes', name: 'Deep eyes', desc: '+25% offline earnings, per rank', base: 4, growth: 2.5, max: 4 },
    { id: 'abyss', name: 'Abyss call', desc: 'Shadow Pearls ×1.5 per rank', base: 10, growth: 2.8 },
  ],
  ember: [
    { id: 'pressure', name: 'High pressure', desc: 'All towers deal ×1.5 damage per rank', base: 2, growth: 2.4 },
    { id: 'quick', name: 'Quick pumps', desc: 'Towers fire 12% faster per rank', base: 6, growth: 3, max: 5 },
    { id: 'firebreak', name: 'Firebreak', desc: 'Your reef takes 10 more hits per rank', base: 3, growth: 2.2, max: 10 },
    { id: 'ashsift', name: 'Ash sifter', desc: 'Ash from snuffed fires ×1.5 per rank', base: 4, growth: 2.5 },
    { id: 'cistern', name: 'Cistern', desc: 'Start each tide with double the starting Ash, +1× per rank', base: 5, growth: 2.5, max: 10 },
    { id: 'cinder', name: 'Cinder diver', desc: 'Ember Pearls ×1.5 per rank', base: 12, growth: 2.8 },
  ],
};
const PEARL_ORDER = ['white', 'jade', 'shadow', 'ember'];

// ---- State -----------------------------------------------------------------
function freshState() {
  return {
    lumen: 0, tideEarned: 0, totalEarned: 0, levels: {}, revealed: 2,
    zone: 0, pearls: 0, zoneEarned: 0, depthMarks: 0, tides: 0, zoneTides: 0, tideFills: 0,
    perks: { white: {}, jade: {}, shadow: {}, ember: {} },
    stars: 0, demoDone: false, homeZone: null, stash: {}, storySeen: [],
    ember: { wave: 1, best: 0, auto: true, towers: [], hp: 20, ashRate: 0 },
    buyMode: 'x1', light: 1, burstUntil: 0, lastSeen: Date.now(),
    audio: { master: 0.8, music: 0.6, sfx: 0.8, muted: false, musicStyle: 'zone', sfxStyle: 'bubbles' },
    tideUnlocked: false,
    keys: { date: '', lumen: 2, pearl: 2, egg: 2 },
    dungeons: { lumen: 1, pearl: 1, egg: 1 },
    dives: {},
    eggs: 0, eggsFound: 0, hatchLvl: 1, hatchUpgradeEnd: 0, pets: [], diveSub: 'dungeons', incubator: null,
    gear: { items: [], equipped: { crown: null, shell: null, charm: null, lantern: null }, chests: 0, shards: 0,
      slotBonus: { crown: 1, shell: 1, charm: 1, lantern: 1 } },
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
      s.perks = Object.assign({ white: {}, jade: {}, shadow: {}, ember: {} }, s.perks);
      s.gear.slotBonus = Object.assign({ crown: 1, shell: 1, charm: 1, lantern: 1 }, s.gear.slotBonus);
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
  // Zone perks only work in their own zone, so visiting the past can't break the present.
  const here = pearlType();
  let m = (here === 'white' ? Math.pow(1.5, rank('white', 'brighter')) : 1)
    * (here === 'jade' ? Math.pow(1.4, rank('jade', 'currents')) : 1)
    * Math.pow(BAL.depthMult, S.depthMarks)
    * Math.pow(2, S.stars || 0)
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
// Kelp Forest, battle wins in the Twilight Trench and snuffed fires in the Ember Wastes.
// Gear only matters in battle, so slot bonuses can't break the other zones.
function ratePerSec(withEffects = true) {
  if (isKelp()) return gardenRate() * petMult('creatures') * globalMult(withEffects);
  if (isTrench()) return 0;
  if (isEmber()) return (S.ember.ashRate || 0);
  return CREATURES.reduce((sum, c) => sum + creatureRate(c), 0) * Math.pow(2, rank('white', 'polyps'))
    * petMult('creatures') * globalMult(withEffects);
}
const isKelp = () => zone().id === 'kelp';
const isTrench = () => zone().id === 'trench';
const isEmber = () => zone().id === 'ember';
const cur = () => (isKelp() ? 'sap' : isEmber() ? 'Ash' : 'Lumen');
function tapValue() {
  const l = lvl('touch');
  return (1 + l) * milestoneMult(l) * Math.pow(3, rank('white', 'tapper')) * petMult('taps') * globalMult();
}
// The tide bar feeds on Lumen: fill k completes once the player holds pearlDiv × k²
// (40K, 160K, 360K … 1M at fill 5 … 4M at fill 10 … 400M at fill 100) and that amount is
// spent into the tide.
// At BAL.tideSteps the tide is full: earning stops until it is called.
// Fills cost more in deeper zones (×3 per Depth Mark), so the Depth Mark bonus to income
// speeds you up without making the tide trivial.
const fillNeed = (k) => BAL.pearlDiv * k * k * Math.pow(BAL.depthMult, S.depthMarks);
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
const pearlGain = () => Math.floor(pearlSteps() * pearlsPerFill());
// Pearls one full bar is worth right now, with every bonus applied.
function pearlsPerFill() {
  const here = pearlType();
  const zoneBonus = { white: 1 + 0.1 * rank('white', 'diver'), jade: Math.pow(1.25, rank('jade', 'roots')),
    shadow: Math.pow(1.5, rank('shadow', 'abyss')), ember: Math.pow(1.5, rank('ember', 'cinder')) }[here];
  return fillValue()
    * zone().pearlMult
    * zoneBonus
    * Math.pow(BAL.depthMult, S.depthMarks)
    * petMult('pearls');
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
const perkCost = (p, r, type) => Math.ceil(p.base * Math.pow(p.growth, r) * ZONES[PEARL_ORDER.indexOf(type)].pearlMult);

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
  const keep = isKelp() ? S.lumen * Math.min(0.5, 0.05 * rank('jade', 'memory')) : 0;
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
  // Ember Wastes: the tide washes the towers away and the fire starts over from wave 1.
  S.ember.towers = [];
  S.ember.wave = 1;
  S.ember.hp = emberMaxHp();
  if (isEmber()) S.lumen += (3000 + 3000 * rank('ember', 'cistern')) * Math.pow(BAL.depthMult, S.depthMarks);
  ui.td = null;
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

// Descending is one way, until the Ember Wastes: from there you can ascend to visit any
// earlier zone (its own Pearls and progress are kept separately) and come back.
const visiting = () => S.homeZone !== null && S.homeZone !== undefined;
function canDescend() {
  return !visiting() && S.zone < EMBER && S.zoneEarned >= zone().goal;
}
function descend() {
  if (!canDescend()) return;
  S.perks[pearlType()] = {};
  S.pearls = 0;
  S.zoneEarned = 0;
  S.zoneTides = 0;
  S.zone += 1;
  S.depthMarks += 1;
  if (S.zone === EMBER) S.reachedEmber = true;
  S.lumen = 0;
  resetRun();
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
  const cost = perkCost(p, r, type);
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
const homeScreen = () => (isKelp() ? 'garden' : isTrench() ? 'battle' : isEmber() ? 'ember' : 'reef');
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

// No right-click / long-press menus or drag-selecting anywhere in the game.
['contextmenu', 'selectstart', 'dragstart'].forEach((t) => document.addEventListener(t, (e) => {
  if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
}));

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
  $('musicStyle').value = S.audio.musicStyle || 'zone';
  $('sfxStyle').value = S.audio.sfxStyle || 'bubbles';
  $('storyBtn').hidden = !(S.stars > 0 && S.storySeen && S.storySeen.length);
  Sound.setVolumes(S.audio);
  Sound.setMusicStyle(S.audio.musicStyle || 'zone');
  Sound.setSfxStyle(S.audio.sfxStyle || 'bubbles');
}
$('musicStyle').addEventListener('change', () => { S.audio.musicStyle = $('musicStyle').value; syncSettings(); save(); });
$('sfxStyle').addEventListener('change', () => { S.audio.sfxStyle = $('sfxStyle').value; syncSettings(); Sound.milestone(); save(); });
VOL_INPUTS.forEach(([id, key]) => $(id).addEventListener('input', () => {
  S.audio[key] = Number($(id).value) / 100;
  syncSettings();
}));
VOL_INPUTS.filter(([, key]) => key !== 'music').forEach(([id]) => $(id).addEventListener('change', () => Sound.buy()));
$('vMute').addEventListener('change', () => { S.audio.muted = $('vMute').checked; syncSettings(); });
document.querySelectorAll('.settings-open').forEach((b) => b.addEventListener('click', () => { Sound.click(); syncSettings(); $('settings').hidden = false; $('sDone').focus(); }));
$('sDone').addEventListener('click', () => { $('settings').hidden = true; save(); });

function showModal({ title, body, ok, cancel = 'Cancel', onOk, eyebrow = '', story = false }) {
  $('mEyebrow').textContent = eyebrow;
  $('mEyebrow').hidden = !eyebrow;
  $('modal').classList.toggle('story', story);
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
  $('creaturesTitle').textContent = isKelp() ? 'Garden upgrades' : isEmber() ? 'Tower guide' : 'Creatures';
  $('buySeg').hidden = isKelp() || isEmber();
  $('creaturesNote').textContent = isKelp() ? 'Garden upgrades are bought with Jade sap and reset with the tide, just like the garden.'
    : isEmber() ? 'Build and upgrade towers on the Defense tab. The tide washes them away, so each tide is a fresh defense.'
      : 'A creature doubles its output at Lv 5, 15, 100, 500 and 1,000. Upgrades reset with the tide; Pearl bonuses don\'t.';
  if (isKelp()) { buildGardenUps(list); return; }
  if (isEmber()) { buildTowerGuide(list); return; }
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
  $('lumen2').textContent = fmt(S.lumen) + (isKelp() ? ' sap' : isEmber() ? ' Ash' : '');
  if (isKelp()) { updateGardenUps(); return; }
  if (isEmber()) return;
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
  if (idx === S.zone) return 'current';
  if (S.reachedEmber) return 'visitable';
  return idx < S.zone ? 'past' : 'locked';
}
const stashedPearls = (type) => {
  const st = S.stash[ZONES[PEARL_ORDER.indexOf(type)].id];
  return st ? st.pearls : 0;
};
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
    const label = st === 'current' ? fmtInt(S.pearls) : st === 'visitable' ? fmtInt(stashedPearls(t)) : st === 'past' ? 'Left behind' : 'Locked';
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
  PERKS[view].forEach((p) => {
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
    let state, color = '#4C6E78', dim = true, action = '';
    const goalText = (z) => (i === EMBER ? 'Finish the demo at ' : 'Descend at ') + fmt(z.goal) + ' ' + PEARLS[z.pearl].name;
    if (i === S.zone) { state = visiting() ? 'Visiting' : 'You are here'; color = PEARLS[zz.pearl].color; dim = false; }
    else if (S.reachedEmber) {
      // From the Ember Wastes every zone can be revisited.
      state = i === EMBER ? 'Home' : 'Ascend to visit';
      color = PEARLS[zz.pearl].color; dim = false;
      action = `<button type="button" class="btn small-btn visit-btn" data-zone="${i}">${i === EMBER ? 'Return' : 'Ascend'}</button>`;
    }
    else if (i < S.zone) { state = 'Left behind'; }
    else if (i === S.zone + 1) { state = goalText(zone()); color = PEARLS[zz.pearl].color; dim = false; }
    else { state = 'Locked'; }
    const row = document.createElement('div');
    row.className = 'zone' + (dim ? ' dim' : '');
    row.innerHTML = `<div class="rail"><i style="background:${color}"></i><s></s></div><div class="zt"><div><b>${zz.name}</b><em style="color:${color}">${state}</em></div><span>${zz.rule} Drops ${PEARLS[zz.pearl].name} Pearls. Goal: ${fmt(zz.goal)}.</span></div>${action}`;
    zl.appendChild(row);
  });
  zl.querySelectorAll('.visit-btn').forEach((b) => b.addEventListener('click', () => visitZone(Number(b.dataset.zone))));
}
function updatePearls() {
  $('depthMarks').textContent = 'Depth Marks: ' + S.depthMarks;
  const cur = pearlType();
  ui.perkBtns.forEach(({ b, p, c, view }) => {
    const r = rank(view, p.id);
    const st = pearlStatus(view);
    if (view !== cur) {
      b.disabled = true;
      c.textContent = st === 'visitable' ? 'Rank ' + r + ' · visit to buy' : st === 'past' ? 'Gone' : 'Locked';
      return;
    }
    if (p.max && r >= p.max) {
      b.disabled = true;
      c.textContent = 'Rank ' + r + ' · Maxed';
      return;
    }
    const cost = perkCost(p, r, view);
    const ok = S.pearls >= cost;
    b.disabled = !ok;
    b.style.borderColor = ok ? PEARLS[view].color : '';
    c.style.color = PEARLS[view].color;
    c.textContent = ok ? 'Rank ' + r + ' · ' + fmtInt(cost) : 'Rank ' + r + ' · Need ' + fmtInt(cost);
  });

  const next = ZONES[S.zone + 1];
  const btn = $('descendBtn');
  if (visiting()) {
    btn.disabled = false;
    $('dTitle').textContent = 'Return to the Ember Wastes';
    $('dCount').textContent = 'Visiting';
    $('dBody').textContent = `You're visiting the past. Everything you earn here is kept. Return whenever you like.`;
  } else if (S.zone === EMBER) {
    btn.disabled = true;
    $('dTitle').textContent = 'The end of the demo';
    $('dCount').textContent = fmt(S.zoneEarned) + ' / ' + fmt(END_GOAL);
    $('dBody').textContent = 'Earn 1 trillion Ember Pearls to finish the Deep Bloom demo. Ascend to any earlier zone from the list below.';
  } else {
    btn.disabled = !canDescend();
    $('dTitle').textContent = 'Descend to the ' + next.name;
    $('dCount').textContent = canDescend() ? 'Ready' : fmt(S.zoneEarned) + ' / ' + fmt(zone().goal);
    $('dBody').textContent = `One way: you can't come back. All ${PEARLS[cur].name} Pearls and their upgrades are lost. You gain a Depth Mark: ×${BAL.depthMult} to all Lumen and Pearls, forever.`;
  }
}
$('descendBtn').addEventListener('click', () => {
  if (visiting()) { visitZone(EMBER); return; }
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

// Lumen needed to fill the bar for the next Pearl step.
const nextPearlAt = () => fillNeed(pearlSteps() + 1);
function updateTide() {
  const gain = pearlGain();
  const pt = PEARLS[pearlType()];
  $('tideGain').textContent = '+' + fmtInt(gain);
  $('tideGainLabel').textContent = pt.name + ' Pearls if you call the tide now';
  $('tideNeed').textContent = (gain < 1 ? 'Hold ' + fmt(nextPearlAt()) + ' ' + cur() + ' to fill the bar for your first Pearl. ' : '')
    + `Each bar fill is worth ${fmt(pearlsPerFill())} Pearls this tide, and more every tide you call here.`;
  $('callTide').disabled = gain < 1;
  $('descendLabel').textContent = visiting() ? 'Visiting: ' + pt.name + ' Pearls earned'
    : S.zone === EMBER ? 'Ember Pearls to finish the demo' : pt.name + ' Pearls to descend';
  $('descendCount').textContent = fmt(S.zoneEarned) + ' / ' + fmt(zone().goal);
  $('descendBar').style.width = Math.min(100, S.zoneEarned / zone().goal * 100) + '%';
}

// ---- Reef HUD --------------------------------------------------------------
function updateReef() {
  $('lumen').textContent = fmt(S.lumen);
  $('rate').textContent = '+' + fmt(ratePerSec()) + ' per second';
  const pt = PEARLS[pearlType()];
  $('pearlChip').textContent = pt.name + ' Pearls: ' + fmtInt(S.pearls);
  $('zoneChip').textContent = zone().name + ' · Tide ' + (S.tides + 1);
  $('depthChip').hidden = S.depthMarks === 0 && !S.stars;
  $('depthChip').textContent = 'Depth ×' + fmt(Math.pow(BAL.depthMult, S.depthMarks)) + (S.stars ? ' · ★' + S.stars : '');
  const gain = ui.washing ? 0 : pearlGain();
  $('tideCount').textContent = '+' + fmt(gain) + ' ' + pt.name + ' Pearls';
  if (gain > (ui.lastGain || 0)) {
    restartClass($('tideCount'), 'bump');
    if (ui.lastGain) floatText($('tideCount').closest('.tidebox'), '+' + fmtInt(gain - ui.lastGain), false);
  }
  ui.lastGain = gain;
  const steps = pearlSteps();
  const prog = stepProgress();
  $('tidePreview').textContent = tideFull() ? `The tide is full (${steps}/${BAL.tideSteps}): call it to keep growing`
    : `Fill ${steps + 1}/${BAL.tideSteps}: ${fmt(prog.have)} / ${fmt(prog.need)} ${cur()} · +${fmt(pearlsPerFill())} Pearls when full`;
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
  $('tabHome').textContent = isKelp() ? 'Garden' : isTrench() ? 'Battle' : isEmber() ? 'Defense' : 'Reef';
  $('tabSecond').textContent = isKelp() ? 'Upgrades' : isTrench() ? 'Gear' : isEmber() ? 'Towers' : 'Creatures';
  ui.emberDirty = true;
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
const pearlY = () => Math.ceil(2 * zone().pearlMult * Math.pow(BAL.depthMult, S.depthMarks));
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
// Slot bonuses come from the Slot Wheel and belong to the slot, not the item.
const slotBonus = (slot) => S.gear.slotBonus[slot] || 1;
const gearPower = (slot) => gearMult(slot) * slotBonus(slot);
const fmtX = (v) => '×' + (v < 10 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10);
const gearStat = (g) => GEAR_SLOTS[g.slot].stat + ' ' + fmtX(GEAR_RARITY[g.rarity].value);
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
  S.gear.shards += Math.round(GEAR_RARITY[g.rarity].shards * (1 + 0.5 * rank('shadow', 'shardfind')));
  ui.gearSel = null;
  Sound.click(); save(); ui.builtKey = ''; updateUI();
}
// ---- Slot Wheel ---------------------------------------------------------------
// Stake shards to set the wheel's best value (1 → ×1, 10 → ×1.5, 20 → ×2 … max ×100),
// spin, and the result binds to the slot. Big values are the thinnest slices, and the
// slot keeps whichever bonus is higher, so a bad spin never makes it worse.
const WHEEL = { perShard: 0.05, max: 100, slices: 8 };
const wheelTop = (stake) => Math.min(WHEEL.max, 1 + WHEEL.perShard * stake);
const maxStake = () => Math.min(S.gear.shards, Math.ceil((WHEEL.max - 1) / WHEEL.perShard));
function wheelSlices(stake) {
  const top = wheelTop(stake);
  const n = WHEEL.slices;
  const weights = Array.from({ length: n }, (_, i) => n - i);   // ×1 widest … top value thinnest
  const total = weights.reduce((a, b) => a + b, 0);
  let a = 0;
  return weights.map((w, i) => {
    const span = (w / total) * 360;
    const s = { value: 1 + (top - 1) * i / (n - 1), start: a, span, weight: w };
    a += span;
    return s;
  });
}
const WHEEL_COLORS = ['#B5C2DA', '#9DB8FF', '#6FB8FF', '#6FE3A5', '#C79BFF', '#FF8FD0', '#FFC46B', '#FFF3B0'];
function drawWheel(stake) {
  const pt = (deg, r) => { const t = (deg - 90) * Math.PI / 180; return [Math.cos(t) * r, Math.sin(t) * r]; };
  $('wheelSvg').innerHTML = wheelSlices(stake).map((s, i) => {
    const [x1, y1] = pt(s.start, 96);
    const [x2, y2] = pt(s.start + s.span, 96);
    const large = s.span > 180 ? 1 : 0;
    const mid = s.start + s.span / 2;
    const [tx, ty] = pt(mid, 66);
    return `<path d="M0 0 L${x1} ${y1} A96 96 0 ${large} 1 ${x2} ${y2} Z" fill="${WHEEL_COLORS[i]}" stroke="#0B1026" stroke-width="1.5"/>
      <text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${mid} ${tx} ${ty})">${fmtX(s.value)}</text>`;
  }).join('') + '<circle r="14" fill="#0B1026" stroke="#FFC46B" stroke-width="3"/>';
}
function openWheel(slot) {
  ui.wheelSlot = slot;
  ui.wheelAngle = ui.wheelAngle || 0;
  $('wResult').textContent = '';
  $('wResult').className = 'center strong';
  $('wheel').hidden = false;
  syncWheel(true);
  $('wSpin').focus();
}
function syncWheel(resetStake) {
  const slot = ui.wheelSlot;
  const most = maxStake();
  const stake = $('wStake');
  stake.max = Math.max(1, most);
  if (resetStake) stake.value = Math.min(most, 20) || 1;
  stake.disabled = most < 1;
  $('wTitle').textContent = GEAR_SLOTS[slot].name + ' slot wheel';
  $('wShards').textContent = fmtInt(S.gear.shards) + ' shards';
  $('wNow').textContent = `Slot bonus now ${fmtX(slotBonus(slot))}. It boosts any gear you put in the ${GEAR_SLOTS[slot].name} slot.`;
  $('wStakeVal').textContent = most < 1 ? 'No shards: dissolve spare gear' : `${stake.value} → up to ${fmtX(wheelTop(Number(stake.value)))}`;
  $('wSpin').disabled = most < 1 || ui.spinning;
  if (!ui.spinning) drawWheel(Number(stake.value));
}
$('wStake').addEventListener('input', () => syncWheel(false));
$('wClose').addEventListener('click', () => { if (!ui.spinning) $('wheel').hidden = true; });
$('wSpin').addEventListener('click', () => {
  const stake = Math.min(Number($('wStake').value), maxStake());
  if (stake < 1 || ui.spinning) return;
  const slices = wheelSlices(stake);
  let r = Math.random() * slices.reduce((a, s) => a + s.weight, 0);
  const hit = slices.find((s) => (r -= s.weight) < 0) || slices[0];
  S.gear.shards -= stake;
  ui.spinning = true;
  $('wSpin').disabled = true;
  $('wResult').textContent = 'Spinning…';
  $('wResult').className = 'center strong';
  // Turn the wheel so the chosen slice stops under the pointer at the top.
  const land = hit.start + hit.span * (0.2 + Math.random() * 0.6);
  const base = Math.ceil((ui.wheelAngle || 0) / 360) * 360;
  ui.wheelAngle = base + 5 * 360 + (360 - land);
  $('wheelSvg').style.transform = `rotate(${ui.wheelAngle}deg)`;
  Sound.seed();
  setTimeout(() => {
    const slot = ui.wheelSlot;
    const old = slotBonus(slot);
    if (hit.value > old) {
      S.gear.slotBonus[slot] = hit.value;
      $('wResult').textContent = `${fmtX(hit.value)}! New ${GEAR_SLOTS[slot].name} slot bonus.`;
      $('wResult').className = 'center strong win';
      Sound.milestone();
    } else {
      $('wResult').textContent = `${fmtX(hit.value)}: your slot keeps its ${fmtX(old)}.`;
      Sound.click();
    }
    ui.spinning = false;
    ui.battleDirty = true;
    ui.builtKey = '';
    save();
    syncWheel(false);
    updateUI();
  }, 3700);
});

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
    return `<div class="gslot-wrap"><button type="button" class="gslot" data-id="${g ? g.id : ''}" aria-pressed="${!!(g && sel && g.id === sel.id)}" style="--rc:${c}">
      <span class="gicon">${gearIcon(slot, c, 22)}</span>
      <span class="gtext"><span class="label">${GEAR_SLOTS[slot].name}</span><b>${g ? g.name : 'Empty'}</b><span class="small" style="color:${c}">${g ? gearStat(g) : '—'}</span><span class="slot-bonus">Slot ${fmtX(slotBonus(slot))}</span></span></button>
      <button type="button" class="wheel-link" data-wheel="${slot}">Spin ${GEAR_SLOTS[slot].name} wheel</button></div>`;
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
  root.querySelectorAll('[data-wheel]').forEach((b) => b.addEventListener('click', () => openWheel(b.dataset.wheel)));
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
  return S.garden.cells.reduce((s, t) => s + (t ? KELP[t].rate : 0), 0) * Math.pow(1.5, gUp('sap'))
    * Math.pow(2, rank('jade', 'sapflow'));
}
function spawnSpore() {
  const empty = S.garden.cells.map((t, i) => (t ? -1 : i)).filter((i) => i >= 0);
  ui.nextSpore = Date.now() + sporeSecs() * 1000;
  if (!empty.length) return false;
  S.garden.cells[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.2 * rank('jade', 'sprouts') ? 2 : 1;
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
// Rewards grow at the same pace as enemies (and only ×4 per tier vs ×8 for enemies), so
// pushing further gets harder, not easier. Chests are rare; bosses always drop one.
const BAT = { tierMult: 8, levelGrowth: 1.035, chestChance: 0.08, autoSecs: 2.5, winBase: 5000, winGrowth: 1.035, tierReward: 4 };
function tierOf(d) {
  const t = TIERS[Math.min(d, TIERS.length - 1)];
  return { name: t.name + (d >= TIERS.length ? ' ' + (d - TIERS.length + 2) : ''), color: t.color };
}
function stageLabel(b = S.battle) {
  return (b.diff ? tierOf(b.diff).name + ' ' : '') + b.wave + '-' + b.level;
}
const isBossStage = () => S.battle.level === 10;
const foeOf = () => (isBossStage() ? BOSS : FOES[(S.battle.wave + S.battle.level) % FOES.length]);
// Gear has diminishing returns (powers below 1), so even Mythic gear with big slot
// bonuses lifts you a few tiers, not straight to the end.
function guardianPower() {
  return Math.round(40 * Math.pow(gearPower('crown'), 0.6) * Math.pow(gearPower('shell'), 0.3)
    * Math.pow(gearPower('charm'), 0.3) * Math.pow(gearPower('lantern'), 0.2) * Math.pow(1.25, rank('shadow', 'lasting')));
}
function foePower() {
  const b = S.battle;
  return Math.round(40 * Math.pow(BAT.tierMult, b.diff) * Math.pow(BAT.levelGrowth, (b.wave - 1) * 10 + b.level - 1) * (isBossStage() ? 1.5 : 1));
}
function winReward() {
  const b = S.battle;
  return BAT.winBase * Math.pow(BAT.winGrowth, (b.wave - 1) * 10 + b.level - 1) * Math.pow(BAT.tierReward, b.diff)
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
    if (boss || Math.random() < BAT.chestChance + 0.04 * rank('shadow', 'armory')) {
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
$('bSlots').addEventListener('click', (e) => {
  const b = e.target.closest('[data-slot]');
  if (b) { Sound.click(); openWheel(b.dataset.slot); }
});
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
    return `<button type="button" class="bslot" data-slot="${slot}" style="--rc:${c}" aria-label="${GEAR_SLOTS[slot].name} slot: open the slot wheel"><span class="label">${GEAR_SLOTS[slot].name}</span><span class="gicon">${gearIcon(slot, c, 20)}</span>
      <b>${g ? g.name : 'Empty'}</b><span class="small" style="color:${c}">${g ? gearStat(g) : '—'}</span><span class="slot-bonus">Slot ${fmtX(slotBonus(slot))} · spin</span></button>`;
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

// ---- Ember Wastes: tower defense ---------------------------------------------
// The surface burned and fire is raining into the deep. Fires walk a scorched path toward
// your reef; towers put them out. Each snuffed fire drops Ash (the zone's currency, which
// feeds the tide). Waves get hotter; if the fire reaches the reef too often you fall back
// one wave. The tide washes the towers away, like the garden and the reef.
const TD = { cols: 7, rows: 10, spawnGap: 0.9, waveGap: 2 };
const TD_PATH = [[3, -1], [3, 1], [1, 1], [1, 4], [5, 4], [5, 7], [2, 7], [2, 9], [2, 10]];
const TOWERS = {
  spout: { name: 'Water spout', short: 'Spout', cost: 2000, dmg: 3, range: 1.8, rate: 0.45, color: '#6FB8FF', desc: 'Fast single jets' },
  pump: { name: 'Coral pump', short: 'Pump', cost: 6000, dmg: 1, range: 1.5, rate: 0.8, color: '#5CF2D6', desc: 'Hits all nearby, slows fires' },
  cannon: { name: 'Tide cannon', short: 'Cannon', cost: 16000, dmg: 12, range: 2.4, rate: 1.6, color: '#C79BFF', desc: 'Slow, big splash' },
};
const TD_MAX_LVL = 5;
// Path cells and the walking line through their centres.
const TD_CELLS = (() => {
  const set = new Set();
  for (let i = 0; i < TD_PATH.length - 1; i++) {
    const [c1, r1] = TD_PATH[i], [c2, r2] = TD_PATH[i + 1];
    const steps = Math.max(Math.abs(c2 - c1), Math.abs(r2 - r1));
    for (let s = 0; s <= steps; s++) {
      const c = c1 + Math.sign(c2 - c1) * s, r = r1 + Math.sign(r2 - r1) * s;
      if (r >= 0 && r < TD.rows) set.add(c + ',' + r);
    }
  }
  return set;
})();
const TD_LEN = TD_PATH.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - TD_PATH[i][0], p[1] - TD_PATH[i][1]), 0);
function pathPoint(d) {
  for (let i = 0; i < TD_PATH.length - 1; i++) {
    const [c1, r1] = TD_PATH[i], [c2, r2] = TD_PATH[i + 1];
    const seg = Math.hypot(c2 - c1, r2 - r1);
    if (d <= seg) return [c1 + (c2 - c1) * d / seg + 0.5, r1 + (r2 - r1) * d / seg + 0.5];
    d -= seg;
  }
  const last = TD_PATH[TD_PATH.length - 1];
  return [last[0] + 0.5, last[1] + 0.5];
}
const emberMaxHp = () => 20 + 10 * rank('ember', 'firebreak');
const depthCost = () => Math.pow(BAL.depthMult, S.depthMarks);
const towerCost = (type, lvl = 0) => Math.ceil(TOWERS[type].cost * Math.pow(1.8, lvl) * depthCost());
const towerDmg = (t) => TOWERS[t.type].dmg * Math.pow(1.7, t.lvl) * Math.pow(1.5, rank('ember', 'pressure'));
const towerRate = (t) => TOWERS[t.type].rate * (1 - 0.12 * rank('ember', 'quick'));
const fireHp = (w) => 10 * Math.pow(1.15, w - 1);
const ashPerFire = (w) => 600 * Math.pow(1.12, w - 1) * globalMult(false) * Math.pow(1.5, rank('ember', 'ashsift'));

function tdState() {
  if (!ui.td) ui.td = { fires: [], shots: [], toSpawn: 0, spawnIn: 0, between: 1.5, running: false, ashLog: [], sel: null, flash: 0 };
  return ui.td;
}
function startWave() {
  const td = tdState();
  if (td.running || tideFull()) return;
  const w = S.ember.wave;
  td.running = true;
  td.toSpawn = 6 + 2 * w + (w % 5 === 0 ? 1 : 0);
  td.boss = w % 5 === 0;
  td.spawnIn = 0;
  Sound.click();
  ui.emberDirty = true;
}
function snuff(fire) {
  const td = tdState();
  const ash = ashPerFire(S.ember.wave) * (fire.boss ? 8 : 1);
  earn(ash);
  td.ashLog.push([Date.now(), ash]);
  td.pops = (td.pops || []).concat([{ x: fire.x, y: fire.y, t: 0.8, text: '+' + fmt(ash) }]);
  if (fire.boss) Sound.milestone();
}
function waveOver(won) {
  const td = tdState();
  td.running = false;
  td.fires = [];
  td.between = TD.waveGap;
  const e = S.ember;
  if (won) {
    earn(ashPerFire(e.wave) * 10);
    e.best = Math.max(e.best, e.wave);
    e.wave += 1;
    e.log = `Wave ${e.wave - 1} snuffed out! +${fmt(ashPerFire(e.wave - 1) * 10)} Ash bonus.`;
    Sound.buy();
  } else {
    e.wave = Math.max(1, e.wave - 1);
    e.log = `The fire reached your reef. Back to wave ${e.wave}. More towers, or stronger ones, will hold it.`;
    Sound.descend();
  }
  e.hp = emberMaxHp();
  ui.emberDirty = true;
  save();
}
function emberTick(dt) {
  const td = tdState();
  const e = S.ember;
  // Rolling Ash per second over the last 30s (shown in the HUD and used for offline earnings).
  const now = Date.now();
  td.ashLog = td.ashLog.filter(([t]) => now - t < 30000);
  e.ashRate = td.ashLog.reduce((s, [, a]) => s + a, 0) / 30;
  if (!td.running) {
    if (e.auto && !tideFull() && $('modal').hidden) {
      td.between -= dt;
      if (td.between <= 0) startWave();
    }
    return;
  }
  const w = e.wave;
  // Spawn
  td.spawnIn -= dt;
  if (td.toSpawn > 0 && td.spawnIn <= 0) {
    const boss = td.boss && td.toSpawn === 1;
    const hp = fireHp(w) * (boss ? 8 : 1);
    td.fires.push({ d: 0, hp, max: hp, speed: (boss ? 0.6 : Math.min(2.2, 1 + 0.03 * w)), slow: 0, boss, flick: Math.random() * 6 });
    td.toSpawn -= 1;
    td.spawnIn = TD.spawnGap;
  }
  // Move fires
  td.fires.forEach((f) => {
    f.d += f.speed * (f.slow > 0 ? 0.6 : 1) * dt;
    f.slow = Math.max(0, f.slow - dt);
    f.flick += dt * 10;
    [f.x, f.y] = pathPoint(f.d);
  });
  const reached = td.fires.filter((f) => f.d >= TD_LEN);
  if (reached.length) {
    reached.forEach((f) => { e.hp -= f.boss ? 5 : 1; });
    td.fires = td.fires.filter((f) => f.d < TD_LEN);
    td.flash = 0.4;
    if (e.hp <= 0) { waveOver(false); return; }
  }
  // Towers fire
  e.towers.forEach((t) => {
    t.cd = (t.cd || 0) - dt;
    if (t.cd > 0) return;
    const spec = TOWERS[t.type];
    const cx = t.c + 0.5, cy = t.r + 0.5;
    const inRange = td.fires.filter((f) => Math.hypot(f.x - cx, f.y - cy) <= spec.range);
    if (!inRange.length) return;
    t.cd = towerRate(t);
    const dmg = towerDmg(t);
    if (t.type === 'pump') {
      inRange.forEach((f) => { f.hp -= dmg; f.slow = 1; });
      td.shots.push({ kind: 'ring', x: cx, y: cy, r: spec.range, t: 0.3 });
    } else {
      const target = inRange.reduce((a, b) => (b.d > a.d ? b : a));
      if (t.type === 'cannon') {
        td.fires.forEach((f) => { if (Math.hypot(f.x - target.x, f.y - target.y) <= 1) f.hp -= dmg; });
        td.shots.push({ kind: 'splash', x: target.x, y: target.y, t: 0.35 });
      } else target.hp -= dmg;
      td.shots.push({ kind: 'jet', x1: cx, y1: cy, x2: target.x, y2: target.y, color: spec.color, t: 0.15 });
    }
  });
  const dead = td.fires.filter((f) => f.hp <= 0);
  dead.forEach(snuff);
  td.fires = td.fires.filter((f) => f.hp > 0);
  td.shots.forEach((s) => { s.t -= dt; });
  td.shots = td.shots.filter((s) => s.t > 0);
  if (td.toSpawn === 0 && td.fires.length === 0) waveOver(true);
}

// Drawing (only while the Ember screen is showing)
function tdCanvas() {
  const cv = $('td');
  const wrap = cv.parentElement.getBoundingClientRect();
  const tile = Math.max(28, Math.min(40, Math.floor(wrap.width / TD.cols)));
  const w = tile * TD.cols, h = tile * (TD.rows + 1);
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
  return { cv, ctx: cv.getContext('2d'), tile, dpr };
}
function drawTD(dt) {
  const { ctx, tile, dpr } = tdCanvas();
  const td = tdState();
  const e = S.ember;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1A0B07';
  ctx.fillRect(0, 0, tile * TD.cols, tile * (TD.rows + 1));
  for (let r = 0; r < TD.rows; r++) for (let c = 0; c < TD.cols; c++) {
    const onPath = TD_CELLS.has(c + ',' + r);
    ctx.fillStyle = onPath ? '#3A1A10' : ((c + r) % 2 ? '#22100A' : '#1E0E08');
    ctx.fillRect(c * tile + 1, r * tile + 1, tile - 2, tile - 2);
    if (onPath) { ctx.fillStyle = 'rgba(255,107,61,.12)'; ctx.fillRect(c * tile + tile * 0.3, r * tile + tile * 0.45, tile * 0.4, 2); }
  }
  // Your reef at the bottom
  const ry = TD.rows * tile;
  ctx.fillStyle = '#0C2E27';
  ctx.fillRect(0, ry, tile * TD.cols, tile);
  [[1.2, '#2ED3B7'], [2.5, '#FF8FD0'], [3.8, '#8F7BFF'], [5.2, '#2ED3B7']].forEach(([x, col]) => {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(x * tile, ry + tile * 0.8, tile * 0.32, tile * 0.55, 0, Math.PI, 0); ctx.fill();
  });
  if (td.flash > 0) { ctx.fillStyle = `rgba(255,80,40,${td.flash})`; ctx.fillRect(0, ry, tile * TD.cols, tile); td.flash -= dt; }
  // Selected tile
  if (td.sel) { ctx.strokeStyle = '#FFC46B'; ctx.lineWidth = 2; ctx.strokeRect(td.sel.c * tile + 2, td.sel.r * tile + 2, tile - 4, tile - 4); }
  // Towers
  e.towers.forEach((t) => {
    const spec = TOWERS[t.type];
    const x = (t.c + 0.5) * tile, y = (t.r + 0.5) * tile;
    ctx.fillStyle = '#0B1026';
    ctx.beginPath(); ctx.arc(x, y, tile * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = spec.color;
    if (t.type === 'spout') { ctx.beginPath(); ctx.moveTo(x, y - tile * 0.26); ctx.quadraticCurveTo(x + tile * 0.22, y + tile * 0.05, x, y + tile * 0.2); ctx.quadraticCurveTo(x - tile * 0.22, y + tile * 0.05, x, y - tile * 0.26); ctx.fill(); }
    else if (t.type === 'pump') { ctx.lineWidth = 4; ctx.strokeStyle = spec.color; ctx.beginPath(); ctx.arc(x, y, tile * 0.2, 0, Math.PI * 2); ctx.stroke(); }
    else ctx.fillRect(x - tile * 0.18, y - tile * 0.18, tile * 0.36, tile * 0.36);
    for (let i = 0; i < t.lvl; i++) { ctx.fillStyle = '#FFC46B'; ctx.fillRect(x - tile * 0.3 + i * tile * 0.13, y + tile * 0.3, tile * 0.09, tile * 0.06); }
  });
  // Fires
  td.fires.forEach((f) => {
    const x = f.x * tile, y = f.y * tile;
    const size = tile * (f.boss ? 0.5 : 0.3) * (0.9 + 0.1 * Math.sin(f.flick));
    const g = ctx.createRadialGradient(x, y + size * 0.2, 1, x, y, size);
    g.addColorStop(0, '#FFF3B0'); g.addColorStop(0.45, f.boss ? '#FF4A2A' : '#FF9A5C'); g.addColorStop(1, 'rgba(255,74,42,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    if (f.slow > 0) { ctx.strokeStyle = 'rgba(92,242,214,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, size * 0.8, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#3A1A10'; ctx.fillRect(x - tile * 0.25, y - size - 6, tile * 0.5, 3);
    ctx.fillStyle = '#6FE3A5'; ctx.fillRect(x - tile * 0.25, y - size - 6, tile * 0.5 * Math.max(0, f.hp / f.max), 3);
  });
  // Water
  td.shots.forEach((s) => {
    if (s.kind === 'jet') { ctx.strokeStyle = s.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s.x1 * tile, s.y1 * tile); ctx.lineTo(s.x2 * tile, s.y2 * tile); ctx.stroke(); }
    else if (s.kind === 'ring') { ctx.strokeStyle = `rgba(92,242,214,${s.t * 2})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x * tile, s.y * tile, s.r * tile * (1 - s.t), 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.fillStyle = `rgba(157,184,255,${s.t * 1.6})`; ctx.beginPath(); ctx.arc(s.x * tile, s.y * tile, tile * (1.2 - s.t * 2), 0, Math.PI * 2); ctx.fill(); }
  });
  // Ash pops
  td.pops = (td.pops || []).filter((p) => (p.t -= dt) > 0);
  ctx.font = `700 ${Math.round(tile * 0.28)}px DM Sans, sans-serif`;
  ctx.textAlign = 'center';
  td.pops.forEach((p) => { ctx.fillStyle = `rgba(255,196,107,${p.t})`; ctx.fillText(p.text, p.x * tile, (p.y - (0.8 - p.t)) * tile); });
}
$('td').addEventListener('click', (ev) => {
  const { tile } = tdCanvas();
  const rect = $('td').getBoundingClientRect();
  const c = Math.floor((ev.clientX - rect.left) / tile), r = Math.floor((ev.clientY - rect.top) / tile);
  const td = tdState();
  if (r >= TD.rows || c < 0 || c >= TD.cols || TD_CELLS.has(c + ',' + r)) { td.sel = null; ui.emberDirty = true; return; }
  td.sel = { c, r };
  Sound.click();
  ui.emberDirty = true;
  updateUI();
});
function renderTdPanel() {
  const td = tdState();
  const panel = $('tdPanel');
  if (!td.sel) {
    panel.innerHTML = `<span class="sub">${S.ember.log || 'Tap a dark tile beside the path to build a tower. Fires that reach your reef hurt it.'}</span>`;
    return;
  }
  const t = S.ember.towers.find((x) => x.c === td.sel.c && x.r === td.sel.r);
  if (!t) {
    panel.innerHTML = '<div class="tower-opts">' + Object.keys(TOWERS).map((k) => {
      const s = TOWERS[k];
      return `<button type="button" class="tower-opt" data-build="${k}" style="border-color:${s.color}"><b style="color:${s.color}">${s.name}</b><span>${s.desc}</span><span class="tcost" data-cost="${k}"></span></button>`;
    }).join('') + '</div>';
  } else {
    const spec = TOWERS[t.type];
    const maxed = t.lvl >= TD_MAX_LVL - 1;
    panel.innerHTML = `<div class="row"><b style="color:${spec.color}">${spec.name} · Lv ${t.lvl + 1}</b><span class="small muted">${fmt(towerDmg(t))} damage · every ${towerRate(t).toFixed(2)}s</span></div>
      <div class="two"><button type="button" class="btn small-btn ember-btn" id="tUp" ${maxed ? 'disabled' : ''}>${maxed ? 'Max level' : 'Upgrade · ' + fmt(towerCost(t.type, t.lvl + 1))}</button>
      <button type="button" class="btn" id="tSell">Sell · +${fmt(Math.floor(towerCost(t.type, t.lvl) * 0.6))}</button></div>`;
  }
}
$('tdPanel').addEventListener('click', (ev) => {
  const td = tdState();
  const build = ev.target.closest('[data-build]');
  if (build && td.sel) {
    const cost = towerCost(build.dataset.build);
    if (S.lumen < cost) return;
    S.lumen -= cost;
    S.ember.towers.push({ c: td.sel.c, r: td.sel.r, type: build.dataset.build, lvl: 0, cd: 0 });
    Sound.buy();
  }
  const t = td.sel && S.ember.towers.find((x) => x.c === td.sel.c && x.r === td.sel.r);
  if (t && ev.target.closest('#tUp')) {
    const cost = towerCost(t.type, t.lvl + 1);
    if (S.lumen < cost || t.lvl >= TD_MAX_LVL - 1) return;
    S.lumen -= cost; t.lvl += 1; Sound.milestone();
  }
  if (t && ev.target.closest('#tSell')) {
    S.lumen += Math.floor(towerCost(t.type, t.lvl) * 0.6);
    S.ember.towers = S.ember.towers.filter((x) => x !== t);
    td.sel = null; Sound.click();
  }
  ui.emberDirty = true;
  save();
  updateUI();
});
$('eStart').addEventListener('click', startWave);
$('eAuto').addEventListener('click', () => {
  S.ember.auto = !S.ember.auto;
  Sound.click(); save(); updateUI();
});
function updateEmber() {
  const e = S.ember;
  const td = tdState();
  $('eAsh').textContent = fmt(S.lumen);
  $('eRate').textContent = '+' + fmt(e.ashRate) + ' Ash per second';
  $('ePearl').textContent = 'Ember Pearls: ' + fmt(S.pearls);
  $('eWave').textContent = 'Wave ' + e.wave + ' · best ' + e.best;
  $('eLine').textContent = td.running ? `Fires left: ${td.toSpawn + td.fires.length}` : e.auto ? 'Next wave starting…' : 'Ready for the next wave';
  $('eHp').textContent = `Reef ${Math.max(0, e.hp)}/${emberMaxHp()}`;
  $('eStart').disabled = td.running || tideFull();
  $('eAuto').textContent = e.auto ? 'Auto waves: on' : 'Auto waves: off';
  $('eAuto').setAttribute('aria-pressed', String(e.auto));
  if (ui.emberDirty) { renderTdPanel(); ui.emberDirty = false; }
  document.querySelectorAll('[data-cost]').forEach((el) => {
    const cost = towerCost(el.dataset.cost);
    el.textContent = fmt(cost) + ' Ash';
    el.closest('button').disabled = S.lumen < cost;
  });
}
// Second tab in the Ember Wastes: the tower guide.
function buildTowerGuide(list) {
  Object.values(TOWERS).forEach((s) => {
    const row = document.createElement('div');
    row.className = 'crow';
    row.innerHTML = `<div class="sw" style="background:${s.color}"></div><div class="meta"><div class="nm"><b>${s.name}</b></div>
      <div class="pk">${s.desc}. Damage ${s.dmg}, range ${s.range} tiles, fires every ${s.rate}s. Upgrades to Lv ${TD_MAX_LVL} (×1.7 damage each).</div></div>`;
    list.appendChild(row);
  });
}

// ---- Visiting earlier zones (unlocked in the Ember Wastes) -------------------
const STASH_KEYS = ['pearls', 'zoneEarned', 'zoneTides', 'lumen', 'tideEarned', 'tideFills', 'levels', 'revealed', 'garden'];
function visitZone(i) {
  if (i === S.zone || !S.reachedEmber || ui.washing) return;
  S.stash[zone().id] = JSON.parse(JSON.stringify(Object.fromEntries(STASH_KEYS.map((k) => [k, S[k]]))));
  const saved = S.stash[ZONES[i].id];
  const fresh = freshState();
  STASH_KEYS.forEach((k) => { S[k] = saved ? saved[k] : fresh[k]; });
  S.zone = i;
  S.homeZone = i === EMBER ? null : EMBER;
  ui.td = null;
  ui.pearlView = null;
  ui.lastGain = 0;
  applyZone();
  renderFish();
  growCoral();
  save();
  switchTab('reef');
  if (i === EMBER) { playWave('sink'); Sound.descend(); } else { playWave('tide'); Sound.tide(); }
}

// ---- The storyline (only after the rewind) ----------------------------------------
// The first playthrough has no story. Once you finish the demo and let the tide run
// backwards, you "remember", and Echo, the oldest pearl, tells you what really happened,
// one chapter at a time as you reach each moment again.
// The arc: White, your Lumen floods the dark sea with light. Jade, that light feeds a
// bacterial bloom. Shadow, divers strip the creatures it drove deep, for gear. Ember, the
// sea fights back: not revenge, but trying to return to how it was before you.
const STORY = [
  { id: 'wake', title: 'You remember', when: () => true,
    text: "You remember the fire. Then the tide ran backwards and the sea forgot.\n\nBut you didn't.\n\nI'm Echo, the oldest pearl in the reef. Only those who remember can hear me. This time, watch what your light does." },
  { id: 'firstTide', title: 'Too much light', when: () => S.tides >= 1,
    text: "Every spark of Lumen lights the water a little more. This sea was dark for a reason.\n\nThe creatures here lived by moonlight. Now they can't find the night. The fish you thought were drawn to your reef were lost." },
  { id: 'deep', title: 'The light sinks', when: () => S.depthMarks >= 1 || S.zoneEarned >= ZONES[0].goal,
    text: "So much light, it can't stay in the Shallows. It's sinking, drifting down into the forest below, ahead of you.\n\nLast time you followed it without asking where it went." },
  { id: 'kelp', title: 'The bloom', when: () => S.depthMarks >= 1,
    text: "Look at the garden again. It isn't kelp.\n\nIt's a bloom: bacteria feeding on the light you poured down. Every merge, every taller plant, every drop of sap: it's spreading, and it's choking the water." },
  { id: 'crown', title: 'The Jade crown', when: () => S.garden.cells.includes(KELP.length - 1),
    text: "The Jade crown is the bloom at its peak. Bright, beautiful, and hungry.\n\nBeneath it, the water has no air left. Nothing else grows in the forest now. Everything that could swim has fled into the deep." },
  { id: 'trench', title: 'The divers', when: () => S.depthMarks >= 2,
    text: "The creatures fled down here, into the dark. And the divers followed them.\n\nThey came for shells to make armour, fins to make charms, eyes to make lanterns." },
  { id: 'kraken', title: 'What the gear is made of', when: () => S.depthMarks >= 2 && (S.battle.wave > 1 || S.battle.diff > 0),
    text: "Your Guardian is a diver too.\n\nThe Angler Lure was an anglerfish. The Nautilus Plate was a nautilus. The Whalebone Shell was a whale. Every chest you open was something that lived. Every win empties the trench a little more." },
  { id: 'ember', title: 'The sea fights back', when: () => !!S.reachedEmber,
    text: "The fire isn't falling from the surface. It's rising from the deep.\n\nThe sea is fighting back, but not out of anger. It's trying to remember how it was before you: dark water, cold vents, creatures living by moonlight. The fire is it burning away everything that doesn't belong." },
  { id: 'truth', title: 'One spark', when: () => !!S.reachedEmber && S.ember.best >= 10,
    text: "You built towers to hold the fire back and protect your reef.\n\nBut every fire you snuff out is the sea trying to heal. The light, the bloom, the divers: all of it from one spark you never stopped feeding. The sea only wants to go back to what it was." },
  { id: 'end', title: 'Choose', when: () => S.zone === EMBER && S.zoneEarned >= END_GOAL,
    text: "A trillion Pearls. The sea has shown you what it was before you, and what it's fighting to become again.\n\nYou can keep the light burning, or let the tide run backwards and let the sea have its dark again, growing gently this time, knowing what it costs.\n\nEither way, I'll be here. I always am." },
];
const storyActive = () => (S.stars || 0) > 0;
const nextChapter = () => (storyActive() ? STORY.find((c) => !S.storySeen.includes(c.id) && c.when()) : null);
function checkStory() {
  if (!storyActive() || ui.washing || ui.endingOpen || !$('modal').hidden || !$('settings').hidden || !$('wheel').hidden) return;
  const c = nextChapter();
  if (!c) return;
  S.storySeen.push(c.id);
  save();
  Sound.perk();
  showModal({ eyebrow: `Echo · Chapter ${STORY.indexOf(c) + 1} of ${STORY.length}`, title: c.title, body: c.text, ok: 'Continue', cancel: null, story: true });
}
$('storyBtn').addEventListener('click', () => {
  const seen = STORY.filter((c) => S.storySeen.includes(c.id));
  $('settings').hidden = true;
  showModal({
    eyebrow: `The story so far · ${seen.length} of ${STORY.length} chapters`,
    title: 'What Echo told you',
    body: seen.map((c) => `${STORY.indexOf(c) + 1}. ${c.title}\n${c.text}`).join('\n\n'),
    ok: 'Close', cancel: null, story: true,
  });
});

// ---- The end of the demo ---------------------------------------------------------
function checkEnding() {
  if (S.zone === EMBER && !visiting() && S.zoneEarned >= END_GOAL && !S.demoDone && !ui.washing && !ui.endingOpen
    && $('modal').hidden && !nextChapter()) showEnding();
}
function showEnding() {
  ui.endingOpen = true;
  const stats = [
    ['Tides called', fmtInt(S.tides)], ['Depth Marks', S.depthMarks],
    ['Best Trench stage', stageLabel()], ['Best fire wave', S.ember.best],
    ['Pets hatched', S.pets.length], ['Gear found', S.gear.items.length],
    ['Lumen ever made', fmt(S.totalEarned)], ['Bloom Stars', S.stars || 0],
  ];
  $('endStats').innerHTML = stats.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
  $('endText').textContent = storyActive()
    ? 'This time you remembered. The light, the bloom, the divers: you saw what every spark cost the sea, and that the fire was only the sea trying to heal.'
    : 'The fires are out. You grew a reef from a single spark, all the way down to the Ember Wastes and a trillion Ember Pearls.';
  $('ending').hidden = false;
  Sound.milestone();
  $('endKeep').focus();
}
$('endKeep').addEventListener('click', () => {
  S.demoDone = true;
  ui.endingOpen = false;
  $('ending').hidden = true;
  save();
});
$('endRewind').addEventListener('click', () => {
  // The tide runs backwards up through every zone, then the game starts fresh with a
  // Bloom Star: a permanent ×2 to everything you earn.
  const stars = (S.stars || 0) + 1;
  const audio = S.audio;
  $('ending').hidden = true;
  const rw = $('rewind');
  rw.hidden = false;
  const steps = [['Ember Wastes', '#140805'], ['Twilight Trench', '#050C1C'], ['Kelp Forest', '#05201A'], ['Shallows', '#061A24']];
  Sound.tide();
  steps.forEach(([name, bg], i) => setTimeout(() => {
    rw.style.background = bg;
    $('rwZone').textContent = name;
    restartClass($('rwZone'), 'rw-in', 900);
  }, i * 1000));
  setTimeout(() => {
    S = freshState();
    S.stars = stars;
    S.audio = audio;
    S.storySeen = []; // each new loop tells the story again, from the start
    save();
    ui.endingOpen = false;
    ui.pearlView = null;
    ui.td = null;
    applyZone();
    renderFish();
    growCoral();
    syncSettings();
    rw.hidden = true;
    switchTab('reef');
    showModal({
      title: 'A new bloom',
      body: `You're back in the Shallows with nothing but a spark, and Bloom Star ${stars}: everything you earn is ×${Math.pow(2, stars)}, forever.`,
      ok: 'Start again',
      cancel: null,
    });
  }, steps.length * 1000 + 400);
});

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
    if (isEmber()) updateEmber();
  }
  checkStory();
  checkEnding();
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
    S.light = 1; // the old dimming-light rule was replaced by the battler
  }
  if (isKelp()) gardenTick(Date.now());
  if (isTrench()) battleTick(Date.now());
  if (isEmber()) {
    // Small fixed steps keep fast fires from skipping past towers on a slow frame.
    for (let left = dt; left > 0; left -= 0.05) emberTick(Math.min(0.05, left));
    if (ui.tab === 'reef') drawTD(dt);
  }

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
