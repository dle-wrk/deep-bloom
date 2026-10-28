'use strict';

// ---- Balance: tune here ----------------------------------------------------
const SAVE_KEY = 'deepbloom-save-v1';
// Bumping this wipes every player's progress once, on every device, the next time the game
// loads (settings are kept). Demo v1 started everyone fresh.
const RESET_EPOCH = 'demo-v1';
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
  { id: 'touch', sym: 'Bt', name: 'Bright touch', perk: 'Tap power: +1 Lumen per tap per level', tint: '#E6F4F2', cost: 10, growth: 1.07, tap: true },
  { id: 'polyp', sym: 'Gp', name: 'Glow polyp', perk: 'Sparks a little Lumen, nonstop', tint: '#2ED3B7', cost: 15, growth: 1.15, rate: 0.5 },
  { id: 'lantern', sym: 'Lf', name: 'Lantern fish', perk: 'Harvests the brightest coral', tint: '#FFC46B', cost: 120, growth: 1.15, rate: 4 },
  { id: 'jelly', sym: 'Dj', name: 'Drift jelly', perk: 'Boosts every polyp it passes: +2% each', tint: '#FF8FD0', cost: 1400, growth: 1.14, rate: 28 },
  { id: 'angler', sym: 'An', name: 'Anglerfish', perk: 'Big, slow harvests', tint: '#8F7BFF', cost: 16000, growth: 1.13, rate: 230 },
  { id: 'whale', sym: 'Mw', name: 'Moon whale', perk: 'Sings the whole reef brighter', tint: '#9DB8FF', cost: 220000, growth: 1.12, rate: 2100 },
  { id: 'titan', sym: 'Ct', name: 'Coral titan', perk: 'An ancient reef that grows itself', tint: '#FF9A5C', cost: 3.5e6, growth: 1.12, rate: 19000 },
];

// goal: zone Pearls earned to descend (Ember: to finish the demo).
// pearlMult: how much each Pearl step is worth here, so every zone takes about as long.
const ZONES = [
  { id: 'shallows', name: 'Shallows', pearl: 'white', goal: 5000, pearlMult: 1, rule: 'Tap, grow, tide.' },
  { id: 'kelp', name: 'Kelp Forest', pearl: 'jade', goal: 1e6, pearlMult: 200, rule: 'A merge garden: combine plants to grow taller kelp.',
    ascentRule: 'Unmake the bloom: split the plants apart until the water runs clear.' },
  { id: 'trench', name: 'Twilight Trench', pearl: 'shadow', goal: 1e9, pearlMult: 4e4, rule: 'A gear auto-battler: stages 1-1 to 9-10, then Hard, Extreme, Godlike…',
    ascentRule: 'The uprising: you are the fish now, driving the divers out of the trench.' },
  { id: 'ember', name: 'Ember Wastes', pearl: 'ember', goal: 1e12, pearlMult: 8e6, rule: 'Tower defense: the surface burned, and the fire is coming down. Snuff it out.' },
];
const EMBER = 3;
const END_GOAL = ZONES[EMBER].goal;
// After the Ember Wastes you climb back up, one way: 1T Ember → the Trench (as the fish),
// 1B Shadow → the Kelp Forest (unmerging the bloom), 1M Jade → the Shallows, which ends the demo.
const ascending = () => (S.ascent || 0) > 0 && (S.ascent || 0) < 3;
const isUprising = () => S.ascent === 1 && S.zone === 2;
const isUnbloom = () => S.ascent === 2 && S.zone === 1;
const zoneRule = (z, i) => (S.ascent && i === S.zone && z.ascentRule ? z.ascentRule : z.rule);

const PEARLS = {
  white: { name: 'White', color: '#F4EEE6', blurb: 'Spend them here. When you descend, they and their upgrades are gone for good.' },
  jade: { name: 'Jade', color: '#6FE3A5', blurb: 'You start from zero here, boosted by your Depth Mark. Upgrades that bend the rules.' },
  shadow: { name: 'Shadow', color: '#9DB8FF', blurb: 'Rare Pearls from the dark, earned in battle. Each one is worth a lot.' },
  ember: { name: 'Ember', color: '#FF9A5C', blurb: 'Pearls pulled from the ashes. Reach 1 trillion to start the climb back up.' },
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
    { id: 'armory', name: 'Salvager', desc: 'Treasure crabs show up 5% more often, per rank', base: 8, growth: 3, max: 5 },
    { id: 'shardfind', name: 'Shard sifter', desc: '+50% shards from dissolving, per rank', base: 6, growth: 2.6 },
    { id: 'eyes', name: 'Deep eyes', desc: '+25% offline earnings, per rank', base: 4, growth: 2.5, max: 4 },
    { id: 'abyss', name: 'Abyss call', desc: 'Shadow Pearls ×1.5 per rank', base: 10, growth: 2.8 },
  ],
  ember: [
    { id: 'pressure', name: 'High pressure', desc: 'All towers deal ×1.5 damage per rank', base: 2, growth: 2.4 },
    { id: 'quick', name: 'Quick pumps', desc: 'Towers fire 12% faster per rank', base: 6, growth: 3, max: 5 },
    { id: 'firebreak', name: 'Firebreak', desc: 'Your reef takes 10 more hits per rank', base: 3, growth: 2.2, max: 10 },
    { id: 'ashsift', name: 'Ash sifter', desc: 'Ash from snuffed fires ×1.5 per rank', base: 4, growth: 2.5 },
    { id: 'cistern', name: 'Cistern', desc: 'Wave-clear Ash bonus +100% per rank', base: 5, growth: 2.5, max: 10 },
    { id: 'cinder', name: 'Cinder diver', desc: 'Ember Pearls ×1.5 per rank', base: 12, growth: 2.8 },
  ],
};
const PEARL_ORDER = ['white', 'jade', 'shadow', 'ember'];

// ---- State -----------------------------------------------------------------
function freshState() {
  return {
    epoch: RESET_EPOCH,
    lumen: 0, tideEarned: 0, totalEarned: 0, levels: {}, revealed: 2,
    zone: 0, pearls: 0, zoneEarned: 0, depthMarks: 0, tides: 0, zoneTides: 0, tideFills: 0,
    perks: { white: {}, jade: {}, shadow: {}, ember: {} },
    stars: 0, demoDone: false, homeZone: null, stash: {}, storySeen: [], ascent: 0,
    ember: { wave: 1, best: 0, auto: true, towers: [], hp: 20, ashRate: 0, loadout: ['spout', 'pump', 'cannon'], up: {} },
    buyMode: 'x1', light: 1, burstUntil: 0, lastSeen: Date.now(),
    audio: { master: 0.8, music: 0.6, sfx: 0.8, muted: false, musicStyle: 'zone', sfxStyle: 'bubbles' },
    opts: { numbers: 'short', vibrate: true, calm: false, pops: true, awake: false },
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
      const old = JSON.parse(raw);
      if (old.epoch !== RESET_EPOCH) {
        const fresh = freshState();
        if (old.audio) fresh.audio = old.audio;
        if (old.opts) fresh.opts = old.opts;
        fresh.resetNote = true;
        return fresh;
      }
      const s = Object.assign(freshState(), old);
      s.perks = Object.assign({ white: {}, jade: {}, shadow: {}, ember: {} }, s.perks);
      s.ember = Object.assign(freshState().ember, s.ember);
      s.gear.slotBonus = Object.assign({ crown: 1, shell: 1, charm: 1, lantern: 1 }, s.gear.slotBonus);
      return s;
    }
  } catch (e) { /* fall through to a new game */ }
  return freshState();
}
function save() {
  if (ui.erasing) return;
  S.lastSeen = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
}

// ---- Numbers ---------------------------------------------------------------
const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : String(Math.floor(n));
  if (S && S.opts && S.opts.numbers === 'sci') return n.toExponential(2).replace('e+', 'e');
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
  if (isEmber()) return;
  while (S.tideFills < BAL.tideSteps && S.lumen >= fillNeed(S.tideFills + 1)) {
    const need = fillNeed(S.tideFills + 1);
    S.lumen -= need;
    S.tideFills++;
    const box = document.getElementById('tidebox');
    if (box && !box.hidden) floatText(box, '-' + fmt(need) + ' ' + cur() + ' into the tide', false);
  }
}
const pearlSteps = () => S.tideFills;
// The Ember Wastes has no tide: Pearls come from cleared waves instead (pearlsPerWave).
const tideFull = () => !isEmber() && pearlSteps() >= BAL.tideSteps;
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
  if (isUnbloom()) seedBloom();
  else if (rank('jade', 'nursery')) [0, 1, 2].forEach((i) => { S.garden.cells[i * 2] = 3; });
  ui.nextCreep = 0;
  ui.nextGraze = 0;
  ui.gardenSel = -1;
  ui.gardenDirty = true;
  ui.battleDrops = [];
  // Ember Wastes: the tide washes the towers away and the fire starts over from wave 1.
  S.ember.towers = [];
  S.ember.up = {};
  S.ember.wave = 1;
  S.ember.hp = emberMaxHp();
  S.ember.path = null;
  S.ember.pathAt = 0;
  S.ember.shiftPending = false;
  setPath(TD_START_PATH);
  if (isEmber()) S.lumen += (3000 + 3000 * rank('ember', 'cistern')) * Math.pow(BAL.depthMult, S.depthMarks);
  ui.td = null;
  ui.arena = null;
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
  return !visiting() && !S.ascent && S.zone < EMBER && S.zoneEarned >= zone().goal;
}
function canAscend() {
  if (visiting() || S.zoneEarned < zone().goal) return false;
  return (S.zone === EMBER && !S.ascent) || ascending();
}
function ascend() {
  if (!canAscend()) return;
  S.perks[pearlType()] = {};
  S.pearls = 0;
  S.zoneEarned = 0;
  S.zoneTides = 0;
  S.zone -= 1;
  S.ascent = (S.ascent || 0) + 1;
  S.depthMarks += 1;
  S.lumen = 0;
  if (S.zone === 2) S.battle = freshState().battle;
  resetRun();
  ui.pearlView = null;
  applyZone();
  save();
  switchTab('reef');
  playWave('tide');
  Sound.tide();
  if (S.zone === 0) { S.ascent = 3; save(); }
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
      el.innerHTML = '<span class="face">' + sp.svg(c.tint, sp.w) + '</span>'
        + (k === 0 ? `<span class="flabel" data-c="${c.id}"><b>${c.sym}</b><span></span></span>` : '');
      layer.appendChild(el);
    }
  });
  ui.fishKnown = owned;

  const dots = Math.min(POLYP_SPOTS.length, Math.ceil(Math.log2(lvl('polyp') + 1) * 2));
  $('polyps').innerHTML = POLYP_SPOTS.slice(0, dots).map(([x, y], i) =>
    `<i class="polyp-dot" style="left:${x}px;bottom:${y}px;animation-delay:${-i * 0.37}s"></i>`).join('');
  $('titan').hidden = lvl('titan') === 0;
  renderReefPets();
  renderCollection();
}
// ---- Shallows collection -----------------------------------------------------
// A periodic-table-style grid: one column per creature, one row per level milestone
// (Lv 1, then each level where its output doubles). Cells light up as you reach them.
const COL_LEVELS = [1].concat(MILESTONES);
const creatureShare = (c) => creatureRate(c) * Math.pow(2, rank('white', 'polyps')) * petMult('creatures') * globalMult();
$('collection').addEventListener('click', () => { Sound.click(); switchTab('creatures'); });
function renderCollection() {
  if (!$('colGrid')) return;
  $('colGrid').innerHTML = COL_LEVELS.map((L) => CREATURES.map((c, i) => {
    const l = lvl(c.id), seen = i < S.revealed;
    const cls = l >= L ? 'on' : seen && (L === 1 || l >= COL_LEVELS[COL_LEVELS.indexOf(L) - 1]) ? 'next' : '';
    return `<span class="ccell ${cls}" style="--tc:${c.tint}" title="${seen ? c.name : '???'} · Lv ${fmtInt(L)}"><b>${seen ? c.sym : ''}</b><i>${L >= 1000 ? '1K' : L}</i></span>`;
  }).join('')).join('');
  const got = COL_LEVELS.reduce((n, L) => n + CREATURES.filter((c) => lvl(c.id) >= L).length, 0);
  $('colCount').textContent = got + ' / ' + COL_LEVELS.length * CREATURES.length;
  updateCollection();
}
// The bar tracks whichever creature is closest to its next milestone.
function updateCollection() {
  if (!$('colNext')) return;
  let best = null;
  CREATURES.slice(0, S.revealed).forEach((c) => {
    const l = lvl(c.id), next = l < 1 ? 1 : nextMilestone(l);
    if (!next) return;
    const prev = COL_LEVELS[COL_LEVELS.indexOf(next) - 1] || 0;
    const frac = (l - prev) / (next - prev);
    if (!best || frac > best.frac) best = { c, next, frac };
  });
  $('colNext').textContent = best ? `${best.c.name} → Lv ${fmtInt(best.next)}` : 'Every milestone reached';
  $('colPct').textContent = best ? Math.floor(best.frac * 100) + '%' : '100%';
  $('colBar').style.width = (best ? best.frac * 100 : 100) + '%';
  $('colBar').style.background = best ? best.c.tint : '#5CF2D6';
  document.querySelectorAll('.flabel').forEach((el) => {
    const c = CREATURES.find((x) => x.id === el.dataset.c);
    el.lastChild.textContent = '+' + fmt(creatureShare(c)) + '/s';
  });
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
// The home tab shows each zone's own game; the Trench hides the second tab (gear is under Dive/Gear).
const homeScreen = () => (isKelp() ? 'garden' : isTrench() ? 'battle' : isEmber() ? 'ember' : 'reef');
function switchTab(tab) {
  clearEffects();
  if (tab === 'creatures' && isTrench()) { tab = 'dive'; S.diveSub = 'gear'; }
  ui.tab = tab;
  const screen = tab === 'reef' ? homeScreen() : tab;
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + screen));
  $('tidebox').hidden = tab !== 'reef' || isEmber();
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
  const o = S.opts;
  $('oNumbers').value = o.numbers;
  $('oVibrate').checked = o.vibrate;
  $('oVibrate').closest('label').hidden = !hapticsAvailable;
  $('oCalm').checked = o.calm;
  $('oPops').checked = o.pops;
  $('oAwake').checked = o.awake;
  $('oAwake').closest('label').hidden = !('wakeLock' in navigator);
  document.body.classList.toggle('calm', o.calm);
  document.body.classList.toggle('no-pops', !o.pops);
  keepAwake(o.awake);
  Sound.setVolumes(S.audio);
  Sound.setMusicStyle(S.audio.musicStyle || 'zone');
  Sound.setSfxStyle(S.audio.sfxStyle || 'bubbles');
}
// Display and game options.
let wakeLock = null;
function keepAwake(on) {
  if (!('wakeLock' in navigator)) return;
  if (on && !wakeLock && document.visibilityState === 'visible') {
    navigator.wakeLock.request('screen').then((l) => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => {});
  } else if (!on && wakeLock) { wakeLock.release(); wakeLock = null; }
}
document.addEventListener('visibilitychange', () => { if (S.opts.awake) keepAwake(true); });
// Haptics. Android (and the APK) use navigator.vibrate. iPhones have no vibrate API, but
// iOS 18+ plays a system haptic tick when a switch control is toggled, so a hidden switch
// is clicked instead (only works from a tap, so idle events stay silent there).
const canVibrate = typeof navigator.vibrate === 'function';
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const iosTick = (() => {
  if (canVibrate || !isIOS) return null;
  const l = document.createElement('label');
  l.setAttribute('aria-hidden', 'true');
  l.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
  const i = document.createElement('input');
  i.type = 'checkbox';
  i.setAttribute('switch', '');
  i.tabIndex = -1;
  l.appendChild(i);
  document.body.appendChild(l);
  return l;
})();
const hapticsAvailable = canVibrate || !!iosTick;
let lastBuzz = 0;
function buzz(pattern) {
  if (!S.opts.vibrate || !hapticsAvailable) return;
  const now = performance.now();
  if (now - lastBuzz < 45) return;
  lastBuzz = now;
  if (canVibrate) { navigator.vibrate(pattern); return; }
  const ticks = Array.isArray(pattern) ? Math.ceil(pattern.length / 2) : 1;
  iosTick.click();
  for (let k = 1; k < ticks; k++) setTimeout(() => iosTick.click(), k * 90);
}
// Light ticks for taps and buys, stronger patterns for big moments.
const HAPTICS = { tap: 6, buy: 12, perk: 18, milestone: [25, 40, 35], tide: [30, 60, 30, 60, 40], descend: [50, 80, 50] };
Object.entries(HAPTICS).forEach(([k, pattern]) => {
  const play = Sound[k].bind(Sound);
  Sound[k] = (...a) => { buzz(pattern); return play(...a); };
});
[['oVibrate', 'vibrate'], ['oCalm', 'calm'], ['oPops', 'pops'], ['oAwake', 'awake']].forEach(([id, key]) =>
  $(id).addEventListener('change', () => { S.opts[key] = $(id).checked; if (key === 'vibrate') buzz(HAPTICS.buy); syncSettings(); save(); }));
$('oNumbers').addEventListener('change', () => { S.opts.numbers = $('oNumbers').value; syncSettings(); save(); ui.builtKey = ''; updateUI(); });
$('oReset').addEventListener('click', () => {
  $('settings').hidden = true;
  showModal({
    title: 'Erase all progress?',
    body: 'Every zone, Pearl, gear piece, pet and Bloom Star is deleted from this device. There is no undo.',
    ok: 'Erase everything',
    onOk: () => { localStorage.removeItem(SAVE_KEY); ui.erasing = true; location.reload(); },
  });
});
$('oVersion').textContent = 'Deep Bloom Demo v1';
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
  // Tapping outside acts like Cancel, or like OK when OK only closes. Modals that force an
  // action (the full tide) stay open until their button is pressed.
  ui.modalOutside = cancel !== null ? $('mCancel') : onOk ? null : $('mOk');
  $('mOk').focus();
}

// Tap the dimmed area around a sheet to close it, same as its close button.
[['settings', () => $('sDone')], ['wheel', () => $('wClose')], ['modal', () => ui.modalOutside]].forEach(([id, btn]) => {
  $(id).addEventListener('click', (e) => { if (e.target === $(id) && btn()) btn().click(); });
});

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
  $('creaturesTitle').textContent = isUnbloom() ? 'Unbloom upgrades' : isKelp() ? 'Garden upgrades' : isEmber() ? 'Towers' : 'Creatures';
  $('buySeg').hidden = isKelp() || isEmber();
  $('creaturesNote').textContent = isKelp() ? 'Garden upgrades are bought with Jade sap and reset with the tide, just like the garden.'
    : isEmber() ? 'Pick 3 tower types to build on the Defense tab; tapping a new one swaps out your oldest pick (built towers of that type are refunded). More types unlock as your best wave grows. No tide here: towers and upgrades stay, and every cleared wave pays Ember Pearls. Magma blobs and Infernos grey out towers near them when they die, and every 15 waves the lava shifts and swallows towers in its new path.'
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
  if (isEmber()) { updateEmberUps(); return; }
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
  if (visiting() && stashedPearls(type)) return 'visitable';
  return idx < S.zone || S.reachedEmber ? 'past' : 'locked';
}
function stashedPearls(type) {
  const st = S.stash[ZONES[PEARL_ORDER.indexOf(type)].id];
  return st ? st.pearls : 0;
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
    const up = S.zone === EMBER || S.ascent;
    const goalText = (z) => (up ? (i === 0 ? 'Ascend here to finish the demo at ' : 'Ascend at ') : 'Descend at ') + fmt(z.goal) + ' ' + PEARLS[z.pearl].name;
    if (i === S.zone) { state = visiting() ? 'Visiting' : S.ascent >= 3 ? 'Demo complete' : 'You are here'; color = PEARLS[zz.pearl].color; dim = false; }
    else if (visiting() && i === EMBER) {
      state = 'Home'; color = PEARLS[zz.pearl].color; dim = false;
      action = `<button type="button" class="btn small-btn visit-btn" data-zone="${i}">Return</button>`;
    }
    else if (up && i === S.zone - 1 && S.ascent < 3) { state = goalText(zone()); color = PEARLS[zz.pearl].color; dim = false; }
    else if (!up && i === S.zone + 1) { state = goalText(zone()); color = PEARLS[zz.pearl].color; dim = false; }
    else if (up ? i > S.zone : i < S.zone) { state = 'Left behind'; }
    else { state = up ? 'Ahead, on the way up' : 'Locked'; }
    const row = document.createElement('div');
    row.className = 'zone' + (dim ? ' dim' : '');
    row.innerHTML = `<div class="rail"><i style="background:${color}"></i><s></s></div><div class="zt"><div><b>${zz.name}</b><em style="color:${color}">${state}</em></div><span>${zoneRule(zz, i)} Drops ${PEARLS[zz.pearl].name} Pearls. Goal: ${fmt(zz.goal)}.</span></div>${action}`;
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
  } else if (S.ascent >= 3) {
    btn.disabled = true;
    $('dTitle').textContent = 'Back in the Shallows';
    $('dCount').textContent = 'Demo complete';
    $('dBody').textContent = 'You climbed all the way back up. Thank you for playing the Deep Bloom demo.';
  } else if (S.zone === EMBER || S.ascent) {
    const up = ZONES[S.zone - 1];
    btn.disabled = !canAscend();
    $('dTitle').textContent = 'Ascend to the ' + up.name;
    $('dCount').textContent = canAscend() ? 'Ready' : fmt(S.zoneEarned) + ' / ' + fmt(zone().goal);
    $('dBody').textContent = up.id === 'shallows'
      ? `The last climb: reach the Shallows to finish the demo. Your ${PEARLS[cur].name} Pearls and their upgrades are left behind.`
      : `One way, back up: ${up.ascentRule} Your ${PEARLS[cur].name} Pearls and their upgrades are left behind. You gain a Depth Mark: ×${BAL.depthMult} to all Lumen and Pearls.`;
  } else {
    btn.disabled = !canDescend();
    $('dTitle').textContent = 'Descend to the ' + next.name;
    $('dCount').textContent = canDescend() ? 'Ready' : fmt(S.zoneEarned) + ' / ' + fmt(zone().goal);
    $('dBody').textContent = `One way: you can't come back. All ${PEARLS[cur].name} Pearls and their upgrades are lost. You gain a Depth Mark: ×${BAL.depthMult} to all Lumen and Pearls, forever.`;
  }
}
$('descendBtn').addEventListener('click', () => {
  if (visiting()) { visitZone(EMBER); return; }
  if (canAscend()) {
    const up = ZONES[S.zone - 1];
    showModal({
      title: 'Ascend to the ' + up.name + '?',
      body: up.id === 'shallows'
        ? 'The sea is nearly healed. Climb back to the Shallows to finish the demo.'
        : `This is one way. Your ${PEARLS[pearlType()].name} Pearls and their upgrades are left behind. ${up.ascentRule}`,
      ok: 'Ascend',
      onOk: ascend,
    });
    return;
  }
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
    : S.ascent >= 3 ? 'Demo complete' : S.zone === EMBER || S.ascent ? pt.name + ' Pearls to ascend' : pt.name + ' Pearls to descend';
  $('descendCount').textContent = fmt(S.zoneEarned) + ' / ' + fmt(zone().goal);
  $('descendBar').style.width = Math.min(100, S.zoneEarned / zone().goal * 100) + '%';
}

// ---- Reef HUD --------------------------------------------------------------
function updateReef() {
  updateCollection();
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
  $('tabSecond').textContent = isKelp() ? 'Upgrades' : isEmber() ? 'Towers' : 'Creatures';
  // The Trench has no second screen of its own; gear already lives under Dive/Gear.
  $('tabSecond').closest('button').hidden = isTrench();
  // The Ember Wastes has no tide, so its Tide tab goes too.
  document.querySelector('[data-tab="tide"]').hidden = isEmber();
  document.querySelector('.tabs').classList.toggle('four', isTrench() || isEmber());
  // Tide fills banked here before waves paid Pearls are paid out once.
  if (isEmber() && S.tideFills > 0) { const g = pearlGain(); S.pearls += g; S.zoneEarned += g; S.tideFills = 0; }
  ui.emberDirty = true;
  ui.gardenDirty = true;
  ui.battleDirty = true;
  setPath(savedPath());
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
// Slot bonuses come from the Slot Wheel and belong to the slot, not the item. They add
// to the equipped gear's value: Epic ×2.5 in a ×1.5 slot counts as ×3.
const slotBonus = (slot) => S.gear.slotBonus[slot] || 1;
const slotAdd = (slot) => slotBonus(slot) - 1;
const gearPower = (slot) => gearMult(slot) + slotAdd(slot);
const fmtX = (v) => '×' + (v < 10 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10);
const fmtAdd = (v) => '+' + (v < 10 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10);
const gearStat = (g) => GEAR_SLOTS[g.slot].stat + ' ' + fmtX(GEAR_RARITY[g.rarity].value);
// The equipped stat with the slot bonus added in, for the slot cards.
const slotStat = (slot) => GEAR_SLOTS[slot].stat + ' ' + fmtX(gearPower(slot));
const slotLine = (slot) => (slotAdd(slot) > 0 ? 'Slot ' + fmtAdd(slotAdd(slot)) : 'Slot +0');
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
// Opening in bulk: Open all, or Auto-open as chests arrive. Upgrades are equipped first
// and never dissolved; other finds of a rarity set to Dissolve go straight into shards.
const keepRarity = (i) => !(S.gear.keep && S.gear.keep[i] === false);
function openChests(n) {
  const got = { opened: 0, equipped: 0, kept: 0, dissolved: 0, shards: 0, best: null };
  for (let i = 0; i < n && S.gear.chests > 0; i++) {
    S.gear.chests -= 1;
    got.opened++;
    const g = rollGearItem(true);
    if (!got.best || g.rarity > got.best.rarity) got.best = g;
    if (S.gear.equipped[g.slot] === g.id) got.equipped++;
    else if (keepRarity(g.rarity)) got.kept++;
    else {
      const sh = dissolveShards(g);
      S.gear.items = S.gear.items.filter((x) => x !== g);
      S.gear.shards += sh;
      got.dissolved++;
      got.shards += sh;
    }
  }
  if (got.opened) {
    const best = got.best && GEAR_RARITY[got.best.rarity].name;
    ui.chestLog = `Opened ${got.opened}: ${got.equipped} equipped, ${got.kept} kept, ${got.dissolved} dissolved${got.shards ? ' (+' + fmtInt(got.shards) + ' shards)' : ''}. Best: ${best} ${got.best.name}.`;
    if (got.best.rarity >= 2) Sound.milestone(); else Sound.perk();
  }
  return got;
}
function autoOpenChests() {
  if (!S.gear.autoOpen || S.gear.chests < 1 || ui.washing) return;
  openChests(S.gear.chests);
  ui.chestLog = 'Auto-' + ui.chestLog.charAt(0).toLowerCase() + ui.chestLog.slice(1);
  if (ui.tab === 'dive') ui.builtKey = '';
  save();
}
function equipGear(id) {
  const g = gearItem(id);
  if (!g) return;
  S.gear.equipped[g.slot] = id;
  Sound.buy(); save(); ui.builtKey = ''; updateUI();
}
const dissolveShards = (g) => Math.round(GEAR_RARITY[g.rarity].shards * (1 + 0.5 * rank('shadow', 'shardfind')));
function dissolveGear(id) {
  const g = gearItem(id);
  if (!g || S.gear.equipped[g.slot] === id) return;
  S.gear.items = S.gear.items.filter((x) => x.id !== id);
  S.gear.shards += dissolveShards(g);
  ui.gearSel = null;
  Sound.click(); save(); ui.builtKey = ''; updateUI();
}
// ---- Slot Wheel ---------------------------------------------------------------
// Stake shards to set the wheel's best value (1 → ×1, 10 → ×1.5, 20 → ×2 … max ×100),
// spin, and the result binds to the slot. Big values are the thinnest slices, and the
// slot keeps whichever bonus is higher, so a bad spin never makes it worse. Two prize
// slices pay out sunken chests or the zone's Pearls instead, both growing with the stake.
const WHEEL = { perShard: 0.05, max: 100, slices: 8, prizeWeight: 4 };
// Wheel upgrades are bought with shards and kept forever, like gear.
const WHEEL_UPS = [
  { id: 'reach', name: 'Long reach', desc: 'Each shard adds +0.01 more to the top value', base: 15, growth: 2.5, max: 5 },
  { id: 'tilt', name: 'Weighted rim', desc: 'Big-value slices are 20% wider', base: 20, growth: 2.5, max: 5 },
  { id: 'prize', name: 'Prize pockets', desc: 'Chest and Pearl slices are wider', base: 25, growth: 2.5, max: 4 },
  { id: 'bounty', name: 'Rich pockets', desc: 'Chest and Pearl prizes ×1.5', base: 30, growth: 3, max: 5 },
  { id: 'bounce', name: 'Lucky bounce', desc: '10% chance to get your shards back', base: 40, growth: 3, max: 5 },
];
const wUp = (id) => (S.gear.wheelUp && S.gear.wheelUp[id]) || 0;
const wheelUpCost = (u) => Math.round(u.base * Math.pow(u.growth, wUp(u.id)));
const wheelPerShard = () => WHEEL.perShard + 0.01 * wUp('reach');
const wheelChests = (stake) => Math.round((1 + Math.floor(stake / 25)) * Math.pow(1.5, wUp('bounty')));
const wheelPearls = (stake) => Math.max(1, Math.round(pearlsPerFill() * (1 + stake / 10) * Math.pow(1.5, wUp('bounty'))));
const wheelTop = (stake) => Math.min(WHEEL.max, 1 + wheelPerShard() * stake);
const maxStake = () => Math.min(S.gear.shards, Math.ceil((WHEEL.max - 1) / wheelPerShard()));
function wheelSlices(stake) {
  const top = wheelTop(stake);
  const n = WHEEL.slices;
  // ×1 widest … top value thinnest, with the chest and Pearl slices mixed in.
  const list = Array.from({ length: n }, (_, i) => ({ kind: 'bonus', value: 1 + (top - 1) * i / (n - 1), weight: (n - i) * (1 + 0.2 * wUp('tilt') * i / (n - 1)), color: WHEEL_COLORS[i] }));
  const prize = WHEEL.prizeWeight + wUp('prize');
  list.splice(2, 0, { kind: 'chest', weight: prize, color: '#A0643A' });
  list.splice(6, 0, { kind: 'pearls', weight: prize, color: '#FF6B6B' });
  const total = list.reduce((a, s) => a + s.weight, 0);
  let a = 0;
  // Rarer slices pay more: a bonus slice's gain is boosted by its chance of missing,
  // so a 2% slice adds 98% more on top (×2 → ×2.98).
  return list.map((s) => {
    const span = (s.weight / total) * 360;
    const out = { ...s, start: a, span };
    if (s.kind === 'bonus') out.value = 1 + (s.value - 1) * (2 - span / 360);
    a += span;
    return out;
  });
}
const wheelBest = (stake) => Math.max(...wheelSlices(stake).filter((s) => s.kind === 'bonus').map((s) => s.value));
// Spins a wheel SVG from one angle to another: eases out over ms, wobbles a little as it
// settles, and ticks the pointer each time a slice edge (edges: slice start angles) passes.
function spinWheel(svg, from, to, ms, edges) {
  const pointer = svg.parentElement.querySelector('.wheel-pointer');
  const sliceAt = (a) => {
    const w = ((360 - (a % 360)) % 360 + 360) % 360;
    let i = 0;
    edges.forEach((e, k) => { if (w >= e) i = k; });
    return i;
  };
  return new Promise((done) => {
    const t0 = performance.now();
    let last = sliceAt(from), lastTick = 0;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const ease = 1 - Math.pow(1 - t, 4);
      const settle = t > 0.85 ? Math.sin(((t - 0.85) / 0.15) * Math.PI * 2) * 3 * ((1 - t) / 0.15) : 0;
      const a = from + (to - from) * ease + settle;
      svg.style.transform = `rotate(${a}deg)`;
      const here = sliceAt(a);
      if (here !== last) {
        last = here;
        if (now - lastTick > 45) { lastTick = now; Sound.click(); restartClass(pointer, 'tick', 300); }
      }
      if (t < 1) requestAnimationFrame(step);
      else { svg.style.transform = `rotate(${to}deg)`; done(); }
    };
    requestAnimationFrame(step);
  });
}
const WHEEL_COLORS = ['#B5C2DA', '#9DB8FF', '#6FB8FF', '#6FE3A5', '#C79BFF', '#FF8FD0', '#FFC46B', '#FFF3B0'];
const sliceLabel = (s) => (s.kind === 'chest' ? 'Chest' : s.kind === 'pearls' ? 'Pearls' : fmtX(s.value));
function drawWheel(stake) {
  const pt = (deg, r) => { const t = (deg - 90) * Math.PI / 180; return [Math.cos(t) * r, Math.sin(t) * r]; };
  const slices = wheelSlices(stake);
  $('wheelSvg').innerHTML = slices.map((s) => {
    const [x1, y1] = pt(s.start, 96);
    const [x2, y2] = pt(s.start + s.span, 96);
    const large = s.span > 180 ? 1 : 0;
    return `<path d="M0 0 L${x1} ${y1} A96 96 0 ${large} 1 ${x2} ${y2} Z" fill="${s.color}" stroke="#0B1026" stroke-width="1.5"/>`;
  }).join('') + '<circle r="14" fill="#0B1026" stroke="#FFC46B" stroke-width="3"/>';
  // Colour key instead of text on the slices: bonuses from small to big, then the prizes.
  const order = slices.filter((s) => s.kind === 'bonus').concat(slices.filter((s) => s.kind !== 'bonus'));
  $('wLegend').innerHTML = order.map((s) => `<span class="wkey"><i style="background:${s.color}"></i><b>${sliceLabel(s)}</b><span>${Math.round(s.span / 3.6)}%</span></span>`).join('');
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
  const st = Number(stake.value);
  $('wNow').textContent = `Slot bonus now ${fmtAdd(slotAdd(slot))} (${fmtX(slotBonus(slot))}), added to any gear in the ${GEAR_SLOTS[slot].name} slot. Prize slices: ${wheelChests(st)} ${wheelChests(st) === 1 ? 'chest' : 'chests'} or ${fmtInt(wheelPearls(st))} ${PEARLS[pearlType()].name} Pearls.`;
  $('wStakeVal').textContent = most < 1 ? 'No shards: dissolve spare gear' : `${stake.value} → up to ${fmtX(wheelBest(st))}`;
  $('wSpin').disabled = most < 1 || ui.spinning;
  if (!ui.spinning) drawWheel(Number(stake.value));
  $('wUps').innerHTML = WHEEL_UPS.map((u) => {
    const r = wUp(u.id), maxed = r >= u.max, cost = wheelUpCost(u);
    return `<div class="wup"><div><b>${u.name}</b> <span class="small">${r}/${u.max}</span><span class="sub small">${u.desc}</span></div>
      <button type="button" class="buy" data-up="${u.id}" ${maxed || S.gear.shards < cost || ui.spinning ? 'disabled' : ''}>${maxed ? 'Maxed' : cost + ' shards'}</button></div>`;
  }).join('');
}
$('wUps').addEventListener('click', (e) => {
  const b = e.target.closest('[data-up]');
  const u = b && WHEEL_UPS.find((x) => x.id === b.dataset.up);
  if (!u || ui.spinning || wUp(u.id) >= u.max || S.gear.shards < wheelUpCost(u)) return;
  S.gear.shards -= wheelUpCost(u);
  S.gear.wheelUp = { ...(S.gear.wheelUp || {}), [u.id]: wUp(u.id) + 1 };
  Sound.buy();
  save();
  syncWheel(false);
});
$('wStake').addEventListener('input', () => syncWheel(false));
$('wClose').addEventListener('click', () => { if (!ui.spinning) $('wheel').hidden = true; });
$('wSpin').addEventListener('click', () => {
  const stake = Math.min(Number($('wStake').value), maxStake());
  if (stake < 1 || ui.spinning) return;
  const slices = wheelSlices(stake);
  let r = Math.random() * slices.reduce((a, s) => a + s.weight, 0);
  const hit = slices.find((s) => (r -= s.weight) < 0) || slices[0];
  S.gear.shards -= stake;
  const bounced = Math.random() < 0.1 * wUp('bounce');
  ui.spinning = true;
  $('wSpin').disabled = true;
  $('wResult').textContent = 'Spinning…';
  $('wResult').className = 'center strong';
  // Turn the wheel so the chosen slice stops under the pointer at the top.
  const land = hit.start + hit.span * (0.2 + Math.random() * 0.6);
  const from = ui.wheelAngle || 0;
  ui.wheelAngle = Math.ceil(from / 360) * 360 + 5 * 360 + (360 - land);
  Sound.seed();
  spinWheel($('wheelSvg'), from, ui.wheelAngle, 3600, slices.map((x) => x.start)).then(() => {
    const slot = ui.wheelSlot;
    const old = slotBonus(slot);
    if (hit.kind === 'chest') {
      const n = wheelChests(stake);
      S.gear.chests += n;
      $('wResult').textContent = `${n} sunken ${n === 1 ? 'chest' : 'chests'}! Open ${n === 1 ? 'it' : 'them'} on the Gear screen.`;
      $('wResult').className = 'center strong win';
      Sound.milestone();
    } else if (hit.kind === 'pearls') {
      const n = wheelPearls(stake);
      S.pearls += n;
      $('wResult').textContent = `+${fmtInt(n)} ${PEARLS[pearlType()].name} Pearls!`;
      $('wResult').className = 'center strong win';
      Sound.milestone();
    } else if (hit.value > old) {
      S.gear.slotBonus[slot] = hit.value;
      $('wResult').textContent = `${fmtX(hit.value)}! New ${GEAR_SLOTS[slot].name} slot bonus.`;
      $('wResult').className = 'center strong win';
      Sound.milestone();
    } else {
      $('wResult').textContent = `${fmtX(hit.value)}: your slot keeps its ${fmtX(old)}.`;
      Sound.click();
    }
    if (bounced) {
      S.gear.shards += stake;
      $('wResult').textContent += ` Lucky bounce: ${stake} shards back!`;
    }
    ui.spinning = false;
    ui.battleDirty = true;
    ui.builtKey = '';
    save();
    syncWheel(false);
    updateUI();
  });
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
  const sel = gearItem(ui.gearSel) || G.items.find((g) => G.equipped[g.slot] !== g.id) || gearItem(G.equipped.crown);
  const slotTiles = Object.keys(GEAR_SLOTS).map((slot) => {
    const g = gearItem(G.equipped[slot]);
    const c = g ? GEAR_RARITY[g.rarity].color : '#4C6E78';
    return `<div class="gslot-wrap"><button type="button" class="gslot" data-wheel="${slot}" aria-label="${GEAR_SLOTS[slot].name} slot: ${g ? g.name : 'empty'}. Open the slot wheel" style="--rc:${c}">
      <span class="gicon">${gearIcon(slot, c, 22)}</span>
      <span class="gtext"><span class="label">${GEAR_SLOTS[slot].name}</span><b>${g ? g.name : 'Empty'}</b><span class="small" style="color:${c}">${g || slotAdd(slot) > 0 ? slotStat(slot) : '—'}</span><span class="slot-bonus">${slotLine(slot)} · spin</span></span></button></div>`;
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
      ${isWorn ? `<button type="button" class="btn small-btn gear-btn" data-wheel="${sel.slot}">Spin ${GEAR_SLOTS[sel.slot].name} wheel</button>` : `<div class="two"><button type="button" id="gEquip" class="btn small-btn gear-btn">Equip</button><button type="button" id="gDissolve" class="btn">Dissolve +${r.shards}</button></div>`}
    </div>`;
  }
  root.innerHTML = `
    <div class="panel"><div class="row"><b>Sunken chests</b><span class="small strong"><span id="chestCount"></span> · Shards ${fmtInt(G.shards)}</span></div>
      <div class="two"><button type="button" id="chestBtn" class="btn primary gear-btn">Open one</button><button type="button" id="chestAll" class="btn gear-btn">Open all</button></div>
      <button type="button" id="chestAuto" class="btn small-btn" aria-pressed="${!!G.autoOpen}">Auto-open new chests: ${G.autoOpen ? 'on' : 'off'}</button>
      <span class="small muted">When opening in bulk, spare finds of each rarity are:</span>
      <div class="keep-row">${GEAR_RARITY.map((r, i) => `<button type="button" class="keep-chip" data-keep="${i}" aria-pressed="${keepRarity(i)}" style="--rc:${r.color}"><b>${r.name}</b><span>${keepRarity(i) ? 'Keep' : 'Dissolve'}</span></button>`).join('')}</div>
      <span class="sub small">${ui.chestLog || 'One chest with every tide in the Twilight Trench and deeper. Upgrades are always equipped, never dissolved.'}</span></div>
    <div class="label pad">Equipped · tap a slot to spin its wheel</div>
    <div class="gslots">${slotTiles}</div>
    <div class="label pad">Found · ${inv.length}</div>
    <div class="ggrid">${invTiles}</div>
    ${detail}`;
  $('chestBtn').addEventListener('click', openChest);
  $('chestAll').addEventListener('click', () => { openChests(S.gear.chests); save(); ui.builtKey = ''; updateUI(); });
  $('chestAuto').addEventListener('click', () => {
    G.autoOpen = !G.autoOpen;
    Sound.click();
    autoOpenChests();
    save(); ui.builtKey = ''; updateUI();
  });
  root.querySelectorAll('[data-keep]').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.keep);
    G.keep = GEAR_RARITY.map((_, k) => (k === i ? !keepRarity(k) : keepRarity(k)));
    Sound.click(); save(); ui.builtKey = ''; updateUI();
  }));
  root.querySelectorAll('[data-wheel]').forEach((b) => b.addEventListener('click', () => { Sound.click(); openWheel(b.dataset.wheel); }));
  root.querySelectorAll('.gitem').forEach((b) => b.addEventListener('click', () => {
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
  $('chestAll').disabled = S.gear.chests < 1;
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
  { id: 'seed', name: 'Strong seeds', desc: '+10% chance a spore arrives as a Sprout', base: 400, growth: 4, max: 5, tint: '#4FB377' },
  { id: 'drift', name: 'Double drift', desc: '+15% chance a second spore drifts in', base: 800, growth: 5, max: 5, tint: '#3F8F63' },
  { id: 'lucky', name: 'Lucky merge', desc: '+6% chance a merge jumps up two tiers', base: 3000, growth: 6, max: 5, tint: '#FFC46B' },
  { id: 'harvest', name: 'Merge harvest', desc: "Each merge pays 15s of the new plant's sap", base: 1500, growth: 5, tint: '#FF8FD0' },
  { id: 'roots', name: 'Deep roots', desc: 'Kelp and taller (tier 4+) make ×2 sap', base: 20000, growth: 8, tint: '#C8FFE0' },
];
// Unbloom (on the way back up): the bloom keeps spreading on its own; you split plants
// back down and clear them. Clear water is what earns here, plus a payout for each split.
const UNBLOOM_UPS = [
  { id: 'calm', name: 'Still water', desc: 'The bloom spreads 15% slower', base: 50, growth: 3, max: 10, tint: '#6FE3A5' },
  { id: 'clear', name: 'Clean water', desc: 'Clear plots make ×1.5 more', base: 200, growth: 4, tint: '#9BF0E0' },
  { id: 'shears', name: 'Sharp shears', desc: 'Splitting a plant pays ×1.5 more', base: 400, growth: 4, tint: '#FFC46B' },
  { id: 'graze', name: 'Grazing snails', desc: 'Split the tallest plant for you every few seconds', base: 1000, growth: 6, max: 5, tint: '#C8FFE0' },
  { id: 'filter', name: 'Filter shrimp', desc: '+10% chance clearing a Spore also clears a neighbour', base: 1500, growth: 5, max: 5, tint: '#FF8FD0' },
];
const gardenUps = () => (isUnbloom() ? UNBLOOM_UPS : GARDEN_UPS);
const gUp = (id) => S.garden.up[id] || 0;
const sporeSecs = () => (isUnbloom() ? 5 * Math.pow(1.15, gUp('calm')) : Math.max(1, 6 * Math.pow(0.85, gUp('spore'))));
const creepSecs = () => 9 * Math.pow(1.15, gUp('calm'));
const unbloomMult = () => petMult('creatures') * globalMult();
const splitPay = (t) => 10 * KELP[t].rate * Math.pow(1.5, gUp('shears')) * unbloomMult();
function seedBloom() {
  // The forest you left behind is choked with tall bloom.
  S.garden.cells = S.garden.cells.map(() => (Math.random() < 0.8 ? 3 + Math.floor(Math.random() * 4) : 0));
}
function splitCell(i, to) {
  const c = S.garden.cells;
  const t = c[i];
  if (!t) return false;
  if (t === 1) {
    c[i] = 0;
    let extra = '';
    if (Math.random() < 0.1 * gUp('filter')) {
      const n = c.map((v, k) => (v === 1 && k !== i ? k : -1)).filter((k) => k >= 0)[0];
      if (n !== undefined) { c[n] = 0; extra = ' The shrimp cleared another.'; }
    }
    earn(splitPay(1));
    ui.gardenHint = 'Cleared a Spore. The water there runs clear.' + extra;
    Sound.click();
  } else {
    const empty = c.map((v, k) => (v ? -1 : k)).filter((k) => k >= 0);
    const dest = to !== undefined && !c[to] ? to : empty.length ? empty[Math.floor(Math.random() * empty.length)] : -1;
    if (dest < 0) { ui.gardenHint = 'No room to split: clear a Spore first.'; Sound.click(); return false; }
    c[i] = t - 1;
    c[dest] = t - 1;
    ui.justMerged = dest;
    earn(splitPay(t));
    ui.gardenHint = `Split the ${KELP[t].name} into two ${KELP[t - 1].name}s. +${fmt(splitPay(t))} sap.`;
    if (t >= 5) Sound.milestone(); else Sound.buy();
  }
  ui.gardenSel = -1;
  ui.gardenDirty = true;
  return true;
}
function splitTallest() {
  const c = S.garden.cells;
  const top = Math.max(...c);
  if (!top) return false;
  return splitCell(c.indexOf(top));
}
const autoSecs = (id = 'auto') => 12 / Math.max(1, gUp(id));
const plantRate = (t) => KELP[t].rate * (t >= 4 ? Math.pow(2, gUp('roots')) : 1);
function gardenRate() {
  if (isUnbloom()) return S.garden.cells.filter((t) => !t).length * 60 * Math.pow(1.5, gUp('clear')) * Math.pow(2, rank('jade', 'sapflow'));
  return S.garden.cells.reduce((s, t) => s + (t ? plantRate(t) : 0), 0) * Math.pow(1.5, gUp('sap'))
    * Math.pow(2, rank('jade', 'sapflow'));
}
function spawnSpore() {
  ui.nextSpore = Date.now() + sporeSecs() * 1000;
  const count = Math.random() < 0.15 * gUp('drift') ? 2 : 1;
  let placed = 0;
  for (let n = 0; n < count; n++) {
    const empty = S.garden.cells.map((t, i) => (t ? -1 : i)).filter((i) => i >= 0);
    if (!empty.length) break;
    const sprout = Math.random() < 0.2 * rank('jade', 'sprouts') + 0.1 * gUp('seed');
    S.garden.cells[empty[Math.floor(Math.random() * empty.length)]] = sprout ? 2 : 1;
    placed++;
  }
  if (placed) ui.gardenDirty = true;
  return placed > 0;
}
function mergeCells(from, to) {
  const c = S.garden.cells;
  const lucky = c[to] + 2 < KELP.length && Math.random() < 0.06 * gUp('lucky');
  c[to] += lucky ? 2 : 1;
  c[from] = 0;
  ui.gardenSel = -1;
  ui.justMerged = to;
  ui.gardenHint = (lucky ? 'Lucky! Jumped to ' : 'Merged into ') + KELP[c[to]].name + '!';
  if (gUp('harvest')) {
    const raw = c.reduce((sum, t) => sum + (t ? plantRate(t) : 0), 0);
    earn(15 * gUp('harvest') * ratePerSec() * plantRate(c[to]) / raw);
  }
  if (c[to] >= 4) Sound.milestone(); else Sound.buy();
  ui.gardenDirty = true;
}
function tapCell(i) {
  if (isUnbloom()) { splitCell(i); return; }
  const c = S.garden.cells;
  const sel = ui.gardenSel ?? -1;
  ui.gardenDirty = true;
  if (!c[i]) { ui.gardenSel = -1; return; }
  if (sel === -1 || sel === i) { ui.gardenSel = sel === i ? -1 : i; Sound.click(); return; }
  if (c[sel] === c[i] && c[i] < KELP.length - 1) mergeCells(sel, i);
  else { ui.gardenSel = i; Sound.click(); }
}
function autoMerge(creep) {
  const c = S.garden.cells;
  for (let t = 1; t < KELP.length - 1; t++) {
    const idx = c.map((v, i) => (v === t ? i : -1)).filter((i) => i >= 0);
    if (idx.length >= 2) {
      if (creep) { c[idx[1]] += 1; c[idx[0]] = 0; ui.justMerged = idx[1]; ui.gardenHint = 'The bloom crept back: two plants grew together.'; ui.gardenDirty = true; }
      else mergeCells(idx[0], idx[1]);
      return;
    }
  }
}
function gardenTick(now) {
  if (!ui.nextSpore) ui.nextSpore = now + sporeSecs() * 1000;
  if (now >= ui.nextSpore) spawnSpore();
  if (isUnbloom()) {
    // The bloom creeps back by merging on its own; grazers split it down for you.
    if (!ui.nextCreep) ui.nextCreep = now + creepSecs() * 1000;
    if (now >= ui.nextCreep) { autoMerge(true); ui.nextCreep = now + creepSecs() * 1000; }
    if (gUp('graze')) {
      if (!ui.nextGraze) ui.nextGraze = now + autoSecs('graze') * 1000;
      if (now >= ui.nextGraze) { splitTallest(); ui.nextGraze = now + autoSecs('graze') * 1000; }
    }
    return;
  }
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
  if (ui.dragDone) { ui.dragDone = false; return; }
  if (b) { tapCell(Number(b.dataset.i)); updateUI(); }
});

// Drag a plant onto a matching one to merge, or onto an empty plot to move it there.
// A tap still selects, so tap-tap merging keeps working.
let drag = null;
$('gardenGrid').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.gcell');
  if (drag || !b || !S.garden.cells[Number(b.dataset.i)]) return;
  drag = { from: Number(b.dataset.i), tier: S.garden.cells[Number(b.dataset.i)], x: e.clientX, y: e.clientY, id: e.pointerId, ghost: null, src: b };
});
window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    drag.ghost = drag.src.cloneNode(true);
    drag.ghost.className = 'gcell full gdrag';
    drag.ghost.style.width = drag.src.offsetWidth + 'px';
    document.body.appendChild(drag.ghost);
    drag.src.classList.add('lifted');
  }
  drag.ghost.style.left = e.clientX - drag.ghost.offsetWidth / 2 + 'px';
  drag.ghost.style.top = e.clientY - drag.ghost.offsetHeight / 2 + 'px';
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.gcell:not(.gdrag)');
  document.querySelectorAll('.gcell.target').forEach((c) => c !== over && c.classList.remove('target'));
  if (over && Number(over.dataset.i) !== drag.from) over.classList.add('target');
});
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (!d.ghost) return;
  d.ghost.remove();
  ui.dragDone = true;
  setTimeout(() => { ui.dragDone = false; }, 0);
  const over = e.type === 'pointerup' && document.elementFromPoint(e.clientX, e.clientY)?.closest('#gardenGrid .gcell');
  const c = S.garden.cells;
  ui.gardenDirty = true;
  if (!over || c[d.from] !== d.tier) { updateUI(); return; }
  const to = Number(over.dataset.i);
  if (to === d.from) { updateUI(); return; }
  if (isUnbloom()) { if (!c[to]) splitCell(d.from, to); updateUI(); return; }
  if (c[to] === d.tier && d.tier < KELP.length - 1) mergeCells(d.from, to);
  else if (!c[to]) { c[to] = d.tier; c[d.from] = 0; ui.gardenSel = -1; Sound.click(); }
  else { [c[to], c[d.from]] = [c[d.from], c[to]]; ui.gardenSel = -1; Sound.click(); }
  updateUI();
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
$('catchSpore').addEventListener('click', () => {
  if (isUnbloom()) { if (!splitTallest()) ui.gardenHint = 'The water is clear. The bloom will try to drift back.'; updateUI(); return; }
  ui.gardenHint = spawnSpore() ? 'A spore drifted in on the current.' : 'The garden is full: merge plants to make room.';
  Sound.click();
  updateUI();
});
function updateGarden() {
  $('gSap').textContent = fmt(S.lumen);
  $('gRate').textContent = '+' + fmt(ratePerSec()) + ' sap per second' + (isUnbloom() ? ' from clear water' : '');
  $('catchSpore').textContent = isUnbloom() ? 'Split the tallest' : 'Catch a spore';
  $('sporeLabel').textContent = isUnbloom() ? 'Bloom drifts back in' : 'Next spore on the current';
  $('gModeLabel').textContent = isUnbloom() ? 'Kelp Forest · unbloom' : 'Kelp Forest · merge garden';
  $('gPearl').textContent = 'Jade Pearls: ' + fmtInt(S.pearls);
  const left = Math.max(0, (ui.nextSpore || Date.now()) - Date.now());
  $('sporeBar').style.width = Math.min(100, (1 - left / (sporeSecs() * 1000)) * 100) + '%';
  $('gHint').textContent = ui.gardenHint || (isUnbloom()
    ? 'Tap a plant to split it into two smaller ones (or drag it onto an empty plot). Tap a Spore to clear it. Clear water makes sap.'
    : 'Drag a plant onto a matching one (or tap both) to merge them. Taller kelp makes more sap.');
  if (ui.gardenDirty) { renderGarden(); ui.gardenDirty = false; }
}
function buildGardenUps(list) {
  ui.gardenRows = gardenUps().map((u) => {
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
// shape picks how a foe is drawn in the arena; speed is in arena units per second; from is
// the first wave the species shows up in (every species is in from Hard onward).
const FOES = [
  { name: 'Lanternfish swarm', color: '#FFC46B', shape: 'lantern', speed: 1.5, from: 1 }, { name: 'Gulper eel', color: '#9DB8FF', shape: 'eel', speed: 1.1, from: 1 },
  { name: 'Vampire squid', color: '#FF6B6B', shape: 'squid', speed: 1.0, from: 3 }, { name: 'Giant isopod', color: '#B5C2DA', shape: 'isopod', speed: 0.7, from: 5 },
  { name: 'Frilled shark', color: '#6FB8FF', shape: 'shark', speed: 1.3, from: 7 },
];
const BOSS = { name: 'Abyss kraken', color: '#E58BFF', shape: 'kraken', speed: 0.5 };
// On the way back up the roles flip: your shoal drives the divers out.
const HUMANS = [
  { name: 'Scuba diver', color: '#FFC46B', shape: 'diver', speed: 1.1, from: 1 }, { name: 'Harpoon hunter', color: '#FF6B6B', shape: 'diver', speed: 1.2, from: 1 },
  { name: 'Net trawler', color: '#B5C2DA', shape: 'sub', speed: 0.7, from: 3 }, { name: 'Salvage drone', color: '#9DB8FF', shape: 'drone', speed: 1.4, from: 5 },
  { name: 'Drill sub', color: '#FF8A5C', shape: 'sub', speed: 0.9, from: 7 },
];
const HUMAN_BOSS = { name: 'Factory ship', color: '#E58BFF', shape: 'ship', speed: 0.45 };
// A hermit crab wearing a sunken chest. It never fights back and scuttles across the
// seabed trying to get away; kill it before it does and it drops gear and Lumen.
const TREASURE_CRAB = { name: 'Treasure crab', color: '#E0A040', shape: 'chest', speed: 1.1 };
// Rewards grow at the same pace as enemies (and only ×4 per tier vs ×8 for enemies), so
// pushing further gets harder, not easier. Chests are rare; bosses always drop one.
// A live fight lasts several seconds, so wins pay more than the old instant fights did.
const BAT = { tierMult: 8, levelGrowth: 1.035, autoSecs: 0.8, winBase: 15000, winGrowth: 1.035, tierReward: 4 };
// The arena is ARENA.w × ARENA.h units; the Guardian holds the glowing floor in the middle.
const ARENA = { w: 10, h: 7, bannerSecs: 1.5, spawnGap: 0.45, foeHp: 16, foeAtk: 17, foeRate: 1.1, reach: 0.75, swim: 1.8, eliteHp: 1.8, eliteAtk: 1.4, crabChance: 0.2, crabHp: 3, crabLumen: 0.5 };
function tierOf(d) {
  const t = TIERS[Math.min(d, TIERS.length - 1)];
  return { name: t.name + (d >= TIERS.length ? ' ' + (d - TIERS.length + 2) : ''), color: t.color };
}
function stageLabel(b = S.battle) {
  return (b.diff ? tierOf(b.diff).name + ' ' : '') + b.wave + '-' + b.level;
}
const isBossStage = () => S.battle.level === 10;
const foeKinds = () => (isUprising() ? HUMANS : FOES).filter((k) => S.battle.diff > 0 || k.from <= S.battle.wave);
const foeOf = () => {
  if (isBossStage()) return isUprising() ? HUMAN_BOSS : BOSS;
  const kinds = foeKinds();
  return kinds[(S.battle.wave + S.battle.level) % kinds.length];
};
// What the current stage sends. Foe health and bite follow foePower(); on top of that,
// deeper waves bring bigger packs, and from wave 3 some of the pack are glowing elites.
// Foe health tracks your damage and their bite tracks your toughness, so whether you
// built for damage or for armour, only total Power vs foe power decides the fight.
function stagePack() {
  const b = S.battle, p = foePower() / 40, boss = isBossStage();
  const g = guardianShape();
  const n = boss ? 2 + Math.floor(b.wave / 3) : 4 + Math.floor(b.wave / 3) + Math.floor(b.level / 4);
  const elites = boss ? 0 : Math.min(n - 1, Math.floor((b.wave - 1) / 3) + b.diff);
  return { n, elites, boss, hp: ARENA.foeHp * p * g.dpsN / g.k, atk: ARENA.foeAtk * p * g.toughN / g.k };
}
// The Guardian's fighting stats, one per gear slot: Crown → Attack, Shell → Health and
// Armour, Charm → Crit chance, Lantern → reach and attack speed (the light it sees by).
// Gear has diminishing returns, so even Mythic gear with big slot bonuses lifts you a
// few tiers, not straight to the end.
function guardianStats() {
  const L = Math.pow(1.25, rank('shadow', 'lasting'));
  const c = gearPower('crown'), s = gearPower('shell'), ch = gearPower('charm'), l = gearPower('lantern');
  return {
    atk: 10 * Math.pow(c, 1.2) * L,
    hp: 100 * Math.pow(s, 0.35) * L,
    armour: 100 * (Math.pow(s, 0.25) - 1), // damage taken × 100 / (100 + armour)
    crit: Math.min(0.6, 0.05 + 0.08 * (ch - 1)),
    rate: 0.6 / Math.pow(l, 0.4),
    range: Math.min(2.6, 2 + 0.6 * Math.log10(l)),
  };
}
// Power sums the stats up as √(damage per second × effective health), scaled so a
// Guardian with no gear has 40, the same as a level 1-1 foe.
// dpsN and toughN are damage per second and effective health relative to a gearless Guardian.
function guardianShape(st = guardianStats()) {
  const dpsN = (st.atk * (1 + st.crit) / st.rate) / (10 * 1.05 / 0.6), toughN = (st.hp * (100 + st.armour) / 100) / 100;
  return { dpsN, toughN, k: Math.sqrt(dpsN * toughN) };
}
function guardianPower() {
  return Math.round(40 * guardianShape().k);
}
// How hard the whole stage is, for the HUD: foePower() adjusted for pack size, elites and
// the boss (fit from simulated fights), so "Power X vs Y" is about even odds when X ≈ Y.
function stagePower() {
  const pk = stagePack();
  return Math.round(foePower() * (0.38 + 0.07 * (pk.n + 1.5 * pk.elites + (pk.boss ? 8 : 0))));
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
// ---- The live fight -----------------------------------------------------------
// Each stage is a short fight: foes swim in out of the dark from both sides and above,
// and the Guardian holds the glowing patch of floor in the middle until they're all
// gone (win) or its health runs out (lose). Foe health and bite grow with foePower(),
// so "Power X vs Y" in the HUD still reads as who's favoured.
function arenaState() {
  if (!ui.arena) ui.arena = { phase: 'idle', wait: 0.6, me: null, foes: [], queue: [], shots: [], pops: [], banner: null, t: 0 };
  return ui.arena;
}
function startFight() {
  const a = arenaState();
  if (a.phase !== 'idle' || ui.washing || tideFull()) return;
  const st = guardianStats();
  const pk = stagePack();
  const kinds = foeKinds();
  const pick = () => kinds[Math.floor(Math.random() * kinds.length)];
  // A mixed pack led by the stage's own foe (elites swim in last); boss stages bring the
  // boss behind a few minions.
  a.queue = Array.from({ length: pk.n }, (_, i) => {
    const elite = i >= pk.n - pk.elites;
    return { kind: pk.boss || i % 2 ? pick() : foeOf(), hp: pk.hp * (elite ? ARENA.eliteHp : 1), atk: pk.atk * (elite ? ARENA.eliteAtk : 1), size: elite ? 0.58 : 0.46, elite };
  });
  if (pk.boss) a.queue.push({ kind: foeOf(), hp: pk.hp * 6, atk: pk.atk * 2.5, size: 1.05, boss: true });
  a.st = st;
  a.me = { x: ARENA.w / 2, y: ARENA.h * 0.62, hp: st.hp, max: st.hp, cd: 0.4, face: 1, hurt: 0 };
  a.foes = []; a.shots = []; a.pops = []; a.banner = null;
  a.total = a.queue.length;
  a.crabHp = pk.hp * ARENA.crabHp;
  a.crabIn = !pk.boss && Math.random() < ARENA.crabChance + 0.05 * rank('shadow', 'armory') ? 1 + Math.random() * 2 : 0;
  a.loot = null;
  a.spawnIn = 0.2;
  a.phase = 'fight';
  ui.battleDrops = [];
  ui.battleDirty = true;
  Sound.click();
}
function spawnFoe(a) {
  const f = a.queue.shift();
  const side = f.boss ? 2 : Math.floor(Math.random() * 3);
  if (side === 0) { f.x = -0.6; f.y = 1 + Math.random() * (ARENA.h - 2.2); }
  else if (side === 1) { f.x = ARENA.w + 0.6; f.y = 1 + Math.random() * (ARENA.h - 2.2); }
  else { f.x = 1 + Math.random() * (ARENA.w - 2); f.y = -0.8; }
  f.max = f.hp; f.cd = 0.6; f.t = Math.random() * 6; f.hurt = 0;
  a.foes.push(f);
}
function arenaTick(dt) {
  const a = arenaState();
  a.t += dt;
  a.shots = a.shots.filter((s) => (s.t -= dt) > 0);
  a.pops = a.pops.filter((p) => (p.t -= dt) > 0);
  if (a.phase === 'banner') {
    if ((a.banner.t -= dt) <= 0) { a.phase = 'idle'; a.wait = BAT.autoSecs; a.banner = null; }
    return;
  }
  if (a.phase === 'idle') {
    if (S.battle.auto && !tideFull() && !ui.washing && (a.wait -= dt) <= 0) startFight();
    return;
  }
  const me = a.me, st = a.st;
  if ((a.spawnIn -= dt) <= 0 && a.queue.length) { spawnFoe(a); a.spawnIn = ARENA.spawnGap; }
  if (a.crabIn > 0 && (a.crabIn -= dt) <= 0) {
    const left = Math.random() < 0.5;
    a.foes.push({ kind: TREASURE_CRAB, crab: true, dir: left ? 1 : -1, x: left ? -0.6 : ARENA.w + 0.6, y: ARENA.h - 0.85, hp: a.crabHp, max: a.crabHp, size: 0.5, t: 0, hurt: 0 });
    a.pops.push({ x: ARENA.w / 2, y: ARENA.h * 0.25, t: 1.2, text: 'Treasure crab!', crit: true });
  }
  me.hurt = Math.max(0, me.hurt - dt);
  // The Guardian drifts toward the nearest foe it can't reach, else back to its post.
  let target = null, best = Infinity;
  a.foes.forEach((f) => { const d = Math.hypot(f.x - me.x, f.y - me.y) - f.size; if (d < best) { best = d; target = f; } });
  const post = { x: ARENA.w / 2, y: ARENA.h * 0.62 };
  const goal = target && best > st.range ? target : post;
  const gd = Math.hypot(goal.x - me.x, goal.y - me.y);
  if (gd > 0.05) { const step = Math.min(gd, 1.3 * dt); me.x += (goal.x - me.x) / gd * step; me.y += (goal.y - me.y) / gd * step; }
  if (target) me.face = target.x < me.x ? -1 : 1;
  if ((me.cd -= dt) <= 0 && target && best <= st.range) {
    const crit = Math.random() < st.crit;
    const dmg = st.atk * (crit ? 2 : 1);
    target.hp -= dmg;
    target.hurt = 0.15;
    me.cd = st.rate;
    a.shots.push({ x1: me.x + me.face * 0.35, y1: me.y - 0.05, x2: target.x, y2: target.y, t: 0.14, crit });
    a.pops.push({ x: target.x, y: target.y - target.size - 0.2, t: 0.7, text: (crit ? 'Crit ' : '') + fmt(dmg), crit });
    if (target.hp <= 0) {
      a.foes = a.foes.filter((f) => f !== target);
      a.shots.push({ kind: 'burst', x: target.x, y: target.y, r: target.size * 2, t: 0.45, color: target.kind.color });
      if (target.boss) Sound.perk();
      if (target.crab) lootCrab(a, target);
    }
  }
  // Foes swim in and bite once they're close.
  a.foes.forEach((f) => {
    f.t += dt; f.hurt = Math.max(0, f.hurt - dt);
    if (f.crab) {
      f.x += f.dir * f.kind.speed * dt;
      if (f.x < -1 || f.x > ARENA.w + 1) { f.gone = true; a.pops.push({ x: Math.min(Math.max(f.x, 1), ARENA.w - 1), y: f.y - 0.6, t: 1, text: 'Escaped' }); }
      return;
    }
    const dx = me.x - f.x, dy = me.y - f.y, d = Math.hypot(dx, dy);
    const reach = ARENA.reach + f.size;
    if (d > reach) { const step = Math.min(d - reach, f.kind.speed * ARENA.swim * dt); f.x += dx / d * step; f.y += dy / d * step; }
    else if ((f.cd -= dt) <= 0) {
      f.cd = ARENA.foeRate;
      me.hp -= f.atk * 100 / (100 + st.armour);
      me.hurt = 0.18;
      f.lunge = 0.2;
    }
    f.lunge = Math.max(0, (f.lunge || 0) - dt);
  });
  a.foes = a.foes.filter((f) => !f.gone);
  // Foes nudge each other apart so a pack surrounds the Guardian instead of stacking up.
  a.foes.forEach((f, i) => a.foes.slice(i + 1).forEach((g) => {
    if (f.crab || g.crab) return;
    const dx = g.x - f.x, dy = g.y - f.y, d = Math.hypot(dx, dy) || 0.01, min = (f.size + g.size) * 0.9;
    if (d < min) { const push = (min - d) / 2; f.x -= dx / d * push; f.y -= dy / d * push; g.x += dx / d * push; g.y += dy / d * push; }
  }));
  if (me.hp <= 0) { me.hp = 0; endFight(false); }
  else if (!a.queue.length && !a.foes.length && !(a.crabIn > 0)) endFight(true);
}
function lootCrab(a, crab) {
  const g = rollGearItem(false);
  const lumen = winReward() * ARENA.crabLumen;
  if (!tideFull()) earn(lumen);
  a.loot = g;
  ui.battleDrops = (ui.battleDrops || []).concat([g]);
  ui.battleDirty = true;
  a.pops.push({ x: crab.x, y: crab.y - 0.9, t: 1.4, text: g.name, color: GEAR_RARITY[g.rarity].color });
  a.pops.push({ x: crab.x, y: crab.y - 0.4, t: 1.2, text: '+' + fmt(lumen) });
  a.shots.push({ kind: 'burst', x: crab.x, y: crab.y, r: 1.4, t: 0.45, color: GEAR_RARITY[g.rarity].color });
  Sound.milestone();
}
function endFight(won) {
  const a = arenaState();
  const b = S.battle;
  const before = stageLabel();
  const boss = isBossStage();
  const foe = foeOf();
  a.phase = 'banner';
  if (won) {
    const reward = winReward();
    if (!tideFull()) earn(reward);
    if (b.level < 10) b.level += 1;
    else if (b.wave < 9) { b.wave += 1; b.level = 1; }
    else { b.diff += 1; b.wave = 1; b.level = 1; }
    let msg = (boss ? 'Boss down! ' : 'Won ' + before + '! ') + '+' + fmt(reward) + ' Lumen.';
    if (b.diff && b.wave === 1 && b.level === 1 && boss) msg = tierOf(b.diff).name + ' unlocked! ' + msg;
    if (boss) {
      ui.battleDrops = (ui.battleDrops || []).concat([rollGearItem(false)]);
      msg += ' A sunken chest dropped!';
    }
    if (a.loot) msg += ' The treasure crab dropped ' + a.loot.name + '!';
    b.log = msg;
    a.banner = { won: true, text: boss ? 'Boss down' : 'Victory', sub: '+' + fmt(reward) + ' Lumen', t: ARENA.bannerSecs };
    if (boss) Sound.milestone(); else Sound.buy();
  } else {
    if (b.level > 1) b.level -= 1;
    else if (b.wave > 1) { b.wave -= 1; b.level = 10; }
    b.log = 'Overwhelmed by the ' + foe.name + (boss ? '' : ' pack') + '. Back to ' + stageLabel() + '. Better gear helps.';
    a.banner = { won: false, text: 'Defeated', sub: 'Back to ' + stageLabel(), t: ARENA.bannerSecs };
    Sound.click();
  }
  ui.battleDirty = true;
  save();
  updateUI();
}
// ---- Drawing the trench arena ------------------------------------------------
// The trench floor glows where the Guardian's lantern reaches (its range); beyond that
// it's dark water, rock walls and drifting marine snow, and the foes swim in from there.
const ARENA_SNOW = Array.from({ length: 36 }, () => ({ x: Math.random() * ARENA.w, y: Math.random() * ARENA.h, s: 0.02 + Math.random() * 0.04, v: 0.08 + Math.random() * 0.15 }));
const ARENA_ROCKS = [0, 1].map((side) => Array.from({ length: 8 }, (_, i) => ({ y: i * ARENA.h / 7, w: 0.35 + ((i * 7 + side * 3) % 5) * 0.12 })));
function arenaCanvas() {
  const cv = $('arenaCv');
  const w = Math.floor(cv.parentElement.getBoundingClientRect().width);
  const h = Math.round(w * ARENA.h / ARENA.w);
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px'; }
  return { ctx: cv.getContext('2d'), u: w / ARENA.w, w, h, dpr };
}
function drawArena() {
  const { ctx, u, w, h, dpr } = arenaCanvas();
  if (!w) return;
  const a = arenaState();
  const t = a.t;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Water: lighter toward the top, nearly black at the trench floor.
  const water = ctx.createLinearGradient(0, 0, 0, h);
  water.addColorStop(0, '#0B1A36'); water.addColorStop(1, '#030816');
  ctx.fillStyle = water; ctx.fillRect(0, 0, w, h);
  // Faint light shafts from far above.
  ctx.fillStyle = 'rgba(157,184,255,.04)';
  [[2.2, 0.8], [5.6, 1.1], [8.1, 0.6]].forEach(([x, sw]) => {
    const sway = Math.sin(t * 0.3 + x) * 0.3;
    ctx.beginPath(); ctx.moveTo((x - sw / 2 + sway) * u, 0); ctx.lineTo((x + sw / 2 + sway) * u, 0);
    ctx.lineTo((x + sw * 1.4) * u, h); ctx.lineTo((x - sw * 1.4) * u, h); ctx.fill();
  });
  const me = a.me || { x: ARENA.w / 2, y: ARENA.h * 0.62, hp: 1, max: 1, face: 1, hurt: 0 };
  const lant = gearItem(S.gear.equipped.lantern);
  const lampColor = lant ? GEAR_RARITY[lant.rarity].color : '#5CF2D6';
  const range = guardianStats().range;
  // The lantern's pool of light on the floor marks how far the Guardian can strike.
  const pool = ctx.createRadialGradient(me.x * u, me.y * u, 0, me.x * u, me.y * u, range * u);
  pool.addColorStop(0, hexA(lampColor, 0.2)); pool.addColorStop(0.7, hexA(lampColor, 0.07)); pool.addColorStop(1, hexA(lampColor, 0));
  ctx.fillStyle = pool; ctx.beginPath(); ctx.arc(me.x * u, me.y * u, range * u, 0, Math.PI * 2); ctx.fill();
  // Seabed with glowing coral along the bottom.
  ctx.fillStyle = '#071226';
  ctx.beginPath(); ctx.moveTo(0, h);
  for (let x = 0; x <= ARENA.w; x += 0.5) ctx.lineTo(x * u, h - (0.35 + 0.12 * Math.sin(x * 1.7)) * u);
  ctx.lineTo(w, h); ctx.fill();
  [[0.9, '#2ED3B7'], [2.4, '#FF8FD0'], [7.3, '#8F7BFF'], [9.1, '#2ED3B7']].forEach(([x, col], i) => {
    ctx.fillStyle = hexA(col, 0.55 + 0.25 * Math.sin(t * 1.5 + i));
    ctx.beginPath(); ctx.ellipse(x * u, h - 0.3 * u, 0.16 * u, 0.32 * u, 0, Math.PI, 0); ctx.fill();
  });
  // Rock walls on both sides.
  ctx.fillStyle = '#050B1A';
  ARENA_ROCKS.forEach((rocks, side) => {
    ctx.beginPath(); ctx.moveTo(side ? w : 0, 0);
    rocks.forEach((r) => ctx.lineTo(side ? w - r.w * u : r.w * u, r.y * u));
    ctx.lineTo(side ? w : 0, h); ctx.fill();
  });
  // Marine snow.
  ctx.fillStyle = 'rgba(220,235,255,.35)';
  ARENA_SNOW.forEach((p) => {
    const y = (p.y + t * p.v) % ARENA.h, x = p.x + Math.sin(t * 0.5 + p.y) * 0.1;
    ctx.beginPath(); ctx.arc(x * u, y * u, p.s * u, 0, Math.PI * 2); ctx.fill();
  });
  // Foes, then the Guardian on top.
  a.foes.forEach((f) => drawFoe(ctx, f, me, u));
  drawGuardian(ctx, me, u, t, lampColor);
  // Harpoon light-bolts and bursts.
  a.shots.forEach((s) => {
    if (s.kind === 'burst') {
      const k = 1 - s.t / 0.45;
      ctx.strokeStyle = hexA(s.color, 1 - k); ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) { const an = i * 1.26 + s.x; ctx.beginPath(); ctx.arc((s.x + Math.cos(an) * s.r * k) * u, (s.y + Math.sin(an) * s.r * k - k * 0.4) * u, (0.06 + 0.05 * k) * u, 0, Math.PI * 2); ctx.stroke(); }
      return;
    }
    ctx.strokeStyle = s.crit ? '#FFC46B' : '#9BF0E0';
    ctx.lineWidth = s.crit ? 4 : 2.5;
    ctx.globalAlpha = Math.min(1, s.t * 10);
    ctx.beginPath(); ctx.moveTo(s.x1 * u, s.y1 * u); ctx.lineTo(s.x2 * u, s.y2 * u); ctx.stroke();
    ctx.globalAlpha = 1;
  });
  // Darkness creeping in from the edges.
  const vig = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.35, w / 2, h * 0.55, w * 0.75);
  vig.addColorStop(0, 'rgba(2,5,14,0)'); vig.addColorStop(1, 'rgba(2,5,14,.7)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
  // Damage numbers.
  ctx.textAlign = 'center';
  a.pops.forEach((p) => {
    ctx.font = `800 ${Math.round(u * (p.crit ? 0.5 : 0.38))}px DM Sans, sans-serif`;
    ctx.fillStyle = p.color ? hexA(p.color, p.t * 2) : p.crit ? hexA('#FFC46B', p.t * 2) : `rgba(235,245,255,${Math.min(1, p.t * 2)})`;
    ctx.fillText(p.text, p.x * u, (p.y - (0.7 - p.t) * 0.8) * u);
  });
  // Foes left, top left.
  if (a.phase === 'fight') {
    ctx.textAlign = 'left'; ctx.font = `700 ${Math.round(u * 0.36)}px DM Sans, sans-serif`; ctx.fillStyle = 'rgba(235,245,255,.75)';
    ctx.fillText(`${a.foes.filter((f) => !f.crab).length + a.queue.length} of ${a.total} left`, u * 0.3, u * 0.55);
  } else if (a.phase === 'idle' && !S.battle.auto) {
    ctx.textAlign = 'center'; ctx.font = `700 ${Math.round(u * 0.4)}px DM Sans, sans-serif`; ctx.fillStyle = 'rgba(235,245,255,.7)';
    ctx.fillText('Tap Fight to hold the floor', w / 2, u * 1.1);
  }
  if (a.banner) drawBanner(ctx, a.banner, w, h, u);
}
// "#RRGGBB" → rgba() with the given alpha.
function hexA(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, alpha))})`;
}
function hpBar(ctx, x, y, bw, frac, color) {
  ctx.fillStyle = 'rgba(2,5,14,.75)'; ctx.fillRect(x - bw / 2, y, bw, 4);
  ctx.fillStyle = color; ctx.fillRect(x - bw / 2, y, bw * Math.max(0, frac), 4);
}
function drawGuardian(ctx, me, u, t, lampColor) {
  const x = me.x * u, y = (me.y + Math.sin(t * 2) * 0.05) * u, r = 0.6 * u, f = me.face;
  const crown = gearItem(S.gear.equipped.crown);
  const crownColor = crown ? GEAR_RARITY[crown.rarity].color : '#4C6E78';
  const shell = gearItem(S.gear.equipped.shell);
  ctx.save();
  if (isUprising()) {
    // Your shoal: a big glowing fish leading two small ones.
    [[-0.55, -0.35], [-0.6, 0.35]].forEach(([ox, oy], i) => {
      ctx.fillStyle = '#5CF2D6'; const sx = x + ox * u * f, sy = y + oy * u + Math.sin(t * 3 + i) * 3;
      ctx.beginPath(); ctx.ellipse(sx, sy, r * 0.35, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = me.hurt > 0 ? '#FF8A8A' : '#6FE3A5';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - f * r * 0.9, y); ctx.lineTo(x - f * r * 1.5, y - r * 0.5); ctx.lineTo(x - f * r * 1.5, y + r * 0.5); ctx.fill();
    ctx.fillStyle = '#04211C'; ctx.beginPath(); ctx.arc(x + f * r * 0.45, y - r * 0.12, r * 0.13, 0, Math.PI * 2); ctx.fill();
  } else {
    // The Guardian: a deep-sea diver with a glass helmet, harpoon and lantern.
    // Its suit takes the colour of the equipped shell.
    ctx.fillStyle = me.hurt > 0 ? '#FF8A8A' : (shell ? GEAR_RARITY[shell.rarity].color : '#9DB8FF');
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.55, r * 0.62, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#172848'; ctx.strokeStyle = '#9DB8FF'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y - r * 0.2, r * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(157,184,255,.5)'; ctx.beginPath(); ctx.arc(x + f * r * 0.12, y - r * 0.2, r * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FFC46B'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + f * r * 0.3, y + r * 0.6); ctx.lineTo(x + f * r * 1.25, y + r * 0.15); ctx.stroke();
  }
  // Lantern on the off side, glowing in the lantern's rarity colour.
  const lx = x - f * r * 0.85, ly = y + r * 0.45;
  const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 0.7);
  glow.addColorStop(0, hexA(lampColor, 0.9)); glow.addColorStop(1, hexA(lampColor, 0));
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(lx, ly, r * 0.7, 0, Math.PI * 2); ctx.fill();
  // Crown, coloured by the crown's rarity.
  ctx.strokeStyle = crownColor; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  const cy = isUprising() ? y - r * 0.55 : y - r * 0.75;
  ctx.beginPath(); ctx.moveTo(x - r * 0.35, cy); ctx.lineTo(x - r * 0.22, cy - r * 0.35); ctx.lineTo(x, cy - r * 0.12);
  ctx.lineTo(x + r * 0.22, cy - r * 0.35); ctx.lineTo(x + r * 0.35, cy); ctx.stroke();
  ctx.restore();
  hpBar(ctx, x, (me.y - 1.3) * u, u * 1.2, me.hp / me.max, '#6FE3A5');
}
function drawFoe(ctx, f, me, u) {
  const dir = f.crab ? f.dir : me.x < f.x ? -1 : 1;
  const lunge = (f.lunge || 0) * 1.2 * dir;
  const x = (f.x + lunge) * u, y = (f.y + Math.sin(f.t * 2.5) * 0.06) * u, r = f.size * u;
  const col = f.hurt > 0 ? '#FFFFFF' : f.kind.color, wig = Math.sin(f.t * 8);
  ctx.save();
  if (f.elite || f.boss || f.crab) {
    const halo = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.9);
    const hc = f.boss ? '#E58BFF' : f.crab ? '#FFE08A' : '#FFC46B';
    halo.addColorStop(0, hexA(hc, 0.35)); halo.addColorStop(1, hexA(hc, 0));
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round';
  const eye = (ex, ey, er, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = col; };
  switch (f.kind.shape) {
    case 'lantern': // small fish with a glowing lure
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - dir * r * 0.9, y); ctx.lineTo(x - dir * r * 1.5, y - r * 0.5 * (1 + wig * 0.3)); ctx.lineTo(x - dir * r * 1.5, y + r * 0.5); ctx.fill();
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + dir * r * 0.3, y - r * 0.5); ctx.quadraticCurveTo(x + dir * r * 0.9, y - r * 1.4, x + dir * r * 1.3, y - r * 0.8); ctx.stroke();
      eye(x + dir * r * 1.3, y - r * 0.8, r * 0.28, '#FFF3B0'); eye(x + dir * r * 0.5, y - r * 0.1, r * 0.14, '#050C1C');
      break;
    case 'eel': // long wavy body
      ctx.lineWidth = r * 0.7;
      ctx.beginPath(); ctx.moveTo(x + dir * r, y);
      for (let i = 1; i <= 6; i++) ctx.lineTo(x + dir * r - dir * i * r * 0.45, y + Math.sin(f.t * 6 - i) * r * 0.35);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(x + dir * r, y, r * 0.55, 0, Math.PI * 2); ctx.fill();
      eye(x + dir * r * 1.2, y - r * 0.15, r * 0.14, '#050C1C');
      break;
    case 'squid': case 'kraken': { // dome with trailing tentacles
      const arms = f.kind.shape === 'kraken' ? 7 : 5;
      ctx.lineWidth = Math.max(2, r * 0.18);
      for (let i = 0; i < arms; i++) {
        const ax = x - r * 0.7 + (i / (arms - 1)) * r * 1.4;
        ctx.beginPath(); ctx.moveTo(ax, y + r * 0.2);
        ctx.quadraticCurveTo(ax + Math.sin(f.t * 3 + i) * r * 0.5, y + r * 0.9, ax + Math.sin(f.t * 3 + i + 1) * r * 0.4, y + r * 1.4); ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(x, y - r * 0.1, r * 0.85, r * 0.75, 0, Math.PI, 0); ctx.lineTo(x + r * 0.85, y + r * 0.25); ctx.lineTo(x - r * 0.85, y + r * 0.25); ctx.fill();
      eye(x - r * 0.3, y - r * 0.1, r * 0.16, '#FF3A5C'); eye(x + r * 0.3, y - r * 0.1, r * 0.16, '#FF3A5C');
      break;
    }
    case 'isopod': // segmented armoured oval
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.1, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(5,12,28,.55)'; ctx.lineWidth = 1.5;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * r * 0.32, y - r * 0.62); ctx.lineTo(x + i * r * 0.32, y + r * 0.62); ctx.stroke(); }
      ctx.strokeStyle = col;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * r * 0.32, y + r * 0.6); ctx.lineTo(x + i * r * 0.32 + wig * 2, y + r * 0.95); ctx.stroke(); }
      eye(x + dir * r * 0.85, y - r * 0.2, r * 0.12, '#050C1C');
      break;
    case 'shark': // long body with frilled gills
      ctx.beginPath(); ctx.moveTo(x + dir * r * 1.3, y); ctx.quadraticCurveTo(x, y - r * 0.8, x - dir * r * 1.1, y); ctx.quadraticCurveTo(x, y + r * 0.7, x + dir * r * 1.3, y); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - dir * r, y); ctx.lineTo(x - dir * r * 1.6, y - r * 0.6 * (1 + wig * 0.2)); ctx.lineTo(x - dir * r * 1.5, y + r * 0.5); ctx.fill();
      ctx.strokeStyle = '#FF8FD0'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + dir * r * (0.5 - i * 0.15), y - r * 0.35); ctx.lineTo(x + dir * r * (0.5 - i * 0.15), y + r * 0.35); ctx.stroke(); }
      eye(x + dir * r * 0.95, y - r * 0.15, r * 0.12, '#FFF3C4');
      break;
    case 'diver': // a human diver in a suit, with a glass mask
      ctx.beginPath(); ctx.ellipse(x - dir * r * 0.2, y, r * 1.1, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - dir * r * 1.2, y); ctx.lineTo(x - dir * r * 1.8, y - r * 0.4 + wig * 3); ctx.lineTo(x - dir * r * 1.8, y + r * 0.4 - wig * 3); ctx.fill();
      ctx.fillStyle = '#4C6E78'; ctx.fillRect(x - r * 0.7, y - r * 0.85, r * 1.1, r * 0.35);
      eye(x + dir * r * 0.95, y - r * 0.1, r * 0.38, '#9BF0E0');
      break;
    case 'drone': // boxy drone with a red eye and rotors
      ctx.fillRect(x - r * 0.8, y - r * 0.6, r * 1.6, r * 1.2);
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - r * 1.2, y - r * 0.8 + wig * 2); ctx.lineTo(x - r * 0.4, y - r * 0.8 - wig * 2);
      ctx.moveTo(x + r * 0.4, y - r * 0.8 - wig * 2); ctx.lineTo(x + r * 1.2, y - r * 0.8 + wig * 2); ctx.stroke();
      eye(x + dir * r * 0.35, y, r * 0.25, '#FF3A3A');
      break;
    case 'sub': case 'ship': { // capsule hull with portholes and a propeller
      const big = f.kind.shape === 'ship';
      ctx.beginPath(); ctx.ellipse(x, y, r * (big ? 1.4 : 1.2), r * (big ? 0.6 : 0.65), 0, 0, Math.PI * 2); ctx.fill();
      if (big) ctx.fillRect(x - r * 0.5, y - r * 1.05, r * 0.9, r * 0.5);
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - dir * r * 1.3, y - r * 0.4 * wig); ctx.lineTo(x - dir * r * 1.3, y + r * 0.4 * wig); ctx.stroke();
      for (let i = 0; i < (big ? 3 : 2); i++) eye(x + dir * r * (0.6 - i * 0.5), y - r * 0.1, r * 0.17, '#FFF3B0');
      break;
    }
    case 'chest': { // hermit crab carrying a sunken chest: legs, claws, eye stalks, glowing seam
      const d = f.dir;
      ctx.strokeStyle = '#FF7A5C'; ctx.lineWidth = 2.5;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * r * 0.5, y + r * 0.4); ctx.lineTo(x + i * r * 0.7 + Math.sin(f.t * 14 + i) * 3, y + r * 0.95); ctx.stroke(); }
      ctx.fillStyle = '#FF7A5C'; ctx.beginPath(); ctx.arc(x + d * r * 1.05, y + r * 0.1, r * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + d * r * 0.5, y - r * 0.3); ctx.lineTo(x + d * r * 0.6, y - r * 0.85); ctx.moveTo(x + d * r * 0.75, y - r * 0.3); ctx.lineTo(x + d * r * 0.9, y - r * 0.8); ctx.stroke();
      eye(x + d * r * 0.6, y - r * 0.85, r * 0.1, '#050C1C'); eye(x + d * r * 0.9, y - r * 0.8, r * 0.1, '#050C1C');
      ctx.fillStyle = f.hurt > 0 ? '#FFFFFF' : '#8A5A2B'; ctx.fillRect(x - r * 0.75, y - r * 0.35, r * 1.5, r * 0.8);
      ctx.fillStyle = f.hurt > 0 ? '#FFFFFF' : '#A8733A'; ctx.beginPath(); ctx.ellipse(x, y - r * 0.35, r * 0.75, r * 0.35, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = hexA('#FFC46B', 0.7 + 0.3 * Math.sin(f.t * 5)); ctx.fillRect(x - r * 0.75, y - r * 0.38, r * 1.5, r * 0.08);
      ctx.fillStyle = '#FFC46B'; ctx.fillRect(x - r * 0.1, y - r * 0.3, r * 0.2, r * 0.25);
      break;
    }
    default:
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  hpBar(ctx, x, y - r - 0.3 * u, Math.max(u * 0.6, r * 1.6), f.hp / f.max, f.boss ? '#E58BFF' : f.crab ? '#FFE08A' : f.elite ? '#FFC46B' : '#FF6B6B');
}
// The victory / defeat band across the middle, fading in and out.
function drawBanner(ctx, bn, w, h, u) {
  const k = bn.t / ARENA.bannerSecs, alpha = Math.min(1, (1 - k) * 6, k * 4);
  const col = bn.won ? '#FFC46B' : '#FF6B6B';
  ctx.globalAlpha = alpha;
  const band = ctx.createLinearGradient(0, 0, w, 0);
  band.addColorStop(0, 'rgba(3,8,22,0)'); band.addColorStop(0.2, 'rgba(3,8,22,.82)'); band.addColorStop(0.8, 'rgba(3,8,22,.82)'); band.addColorStop(1, 'rgba(3,8,22,0)');
  ctx.fillStyle = band; ctx.fillRect(0, h * 0.3, w, h * 0.36);
  ctx.strokeStyle = hexA(col, 0.6); ctx.lineWidth = 1.5;
  [0.3, 0.66].forEach((f) => { ctx.beginPath(); ctx.moveTo(w * 0.1, h * f); ctx.lineTo(w * 0.9, h * f); ctx.stroke(); });
  ctx.textAlign = 'center';
  // The title lands slightly big and settles.
  let size = u * 0.95 * (1 + Math.max(0, k - 0.8));
  ctx.font = `800 ${Math.round(size)}px Unbounded, sans-serif`;
  // Long titles shrink to fit the width.
  const tw = ctx.measureText(bn.text.toUpperCase()).width;
  if (tw > w * 0.86) { size *= (w * 0.86) / tw; ctx.font = `800 ${Math.round(size)}px Unbounded, sans-serif`; }
  ctx.shadowColor = col; ctx.shadowBlur = 18;
  ctx.fillStyle = col; ctx.fillText(bn.text.toUpperCase(), w / 2, h * 0.5);
  ctx.shadowBlur = 0;
  ctx.font = `700 ${Math.round(u * 0.36)}px DM Sans, sans-serif`;
  ctx.fillStyle = bn.won ? '#9BF0E0' : 'rgba(235,245,255,.8)';
  ctx.fillText(bn.sub, w / 2, h * 0.6);
  ctx.globalAlpha = 1;
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
$('fightBtn').addEventListener('click', startFight);
$('bSlots').addEventListener('click', (e) => {
  const b = e.target.closest('[data-slot]');
  if (b) { Sound.click(); openWheel(b.dataset.slot); }
});
$('bubble').addEventListener('click', openBubble);
$('autoBtn').addEventListener('click', () => {
  S.battle.auto = !S.battle.auto;
  arenaState().wait = 0.6;
  Sound.click();
  save();
  updateUI();
});
$('bDrops').addEventListener('click', (e) => {
  const d = e.target.closest('[data-dissolve]');
  if (d) {
    const g = gearItem(d.dataset.dissolve);
    if (!g) return;
    const n = dissolveShards(g);
    dissolveGear(g.id);
    ui.battleDrops = (ui.battleDrops || []).filter((x) => x.id !== g.id);
    S.battle.log = 'Dissolved ' + g.name + ' into ' + n + (n === 1 ? ' shard.' : ' shards.');
    ui.battleDirty = true;
    updateUI();
    return;
  }
  const b = e.target.closest('[data-equip]');
  if (!b) return;
  equipGear(b.dataset.equip);
  ui.battleDrops = (ui.battleDrops || []).filter((g) => g.id !== b.dataset.equip);
  S.battle.log = 'Equipped ' + gearItem(b.dataset.equip).name + '.';
  ui.battleDirty = true;
  updateUI();
});
function renderBattle() {
  $('bZoneLabel').textContent = isUprising() ? 'Trench uprising · ' : 'Twilight Trench · ';
  const b = S.battle;
  const tier = tierOf(b.diff);
  $('bTier').textContent = tier.name;
  $('bTier').style.color = tier.color;
  $('bStage').textContent = stageLabel();
  $('bStage').style.color = tier.color;
  $('bLine').textContent = 'Wave ' + b.wave + '/9 · Level ' + b.level + '/10';
  $('bPips').innerHTML = Array.from({ length: 10 }, (_, i) =>
    `<i class="${i < b.level - 1 ? 'done' : i === b.level - 1 ? 'now' : ''}"></i>`).join('');
  $('bLog').textContent = b.log || (isUprising()
    ? 'Your shoal is taking the trench back. Drive the divers out: wins pay Lumen and can drop the gear they stole.'
    : 'Your Guardian fights on its own with the gear below. Wins pay Lumen and can drop a sunken chest; the bubble opens more gear.');
  $('bDrops').innerHTML = (ui.battleDrops || []).map((g) => {
    const r = GEAR_RARITY[g.rarity];
    const worn = gearItem(S.gear.equipped[g.slot]);
    const isWorn = worn && worn.id === g.id;
    const wv = worn ? GEAR_RARITY[worn.rarity].value : 1;
    const cmp = isWorn ? 'Equipped' : r.value > wv ? 'Better' : r.value === wv ? 'Same' : 'Worse';
    const cls = cmp === 'Better' || cmp === 'Equipped' ? 'jade' : cmp === 'Worse' ? 'red' : 'muted';
    return `<div class="drop"><span class="gicon" style="--rc:${r.color}">${gearIcon(g.slot, r.color, 18)}</span>
      <span class="dtext"><b>${g.name}</b><span class="small ${cls}">${r.name} · ${gearStat(g)} · ${cmp}</span></span>
      ${isWorn ? '' : r.value > wv ? `<button type="button" class="btn small-btn gear-btn" data-equip="${g.id}">Equip</button>`
        : `<button type="button" class="btn small-btn" data-dissolve="${g.id}">Dissolve +${dissolveShards(g)}</button>`}</div>`;
  }).join('');
  $('bSlots').innerHTML = Object.keys(GEAR_SLOTS).map((slot) => {
    const g = gearItem(S.gear.equipped[slot]);
    const c = g ? GEAR_RARITY[g.rarity].color : '#4C6E78';
    return `<button type="button" class="bslot" data-slot="${slot}" style="--rc:${c}" aria-label="${GEAR_SLOTS[slot].name} slot: open the slot wheel"><span class="label">${GEAR_SLOTS[slot].name}</span><span class="gicon">${gearIcon(slot, c, 20)}</span>
      <b>${g ? g.name : 'Empty'}</b><span class="small" style="color:${c}">${g || slotAdd(slot) > 0 ? slotStat(slot) : '—'}</span><span class="slot-bonus">${slotLine(slot)} · spin</span></button>`;
  }).join('');
  // Gear changed mid-fight: the Guardian picks up the new stats, keeping its share of health.
  const a = arenaState(), st = guardianStats();
  if (a.phase === 'fight') { a.me.hp *= st.hp / a.me.max; a.me.max = st.hp; a.st = st; }
  const stat = (icon, label, val) => `<div class="bstat" title="${label}" aria-label="${label} ${val}"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${icon}"/></svg><b>${val}</b></div>`;
  $('bStats').innerHTML = stat('M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z', 'Health', fmt(st.hp))
    + stat('M4 20L14 10M14 10l2-6 4 4-6 2M6 14l4 4', 'Attack', fmt(st.atk))
    + stat('M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z', 'Armour', fmtInt(Math.round(st.armour)))
    + stat('M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z', 'Crit chance', Math.round(st.crit * 100) + '%');
  const pk = stagePack();
  $('bFoes').innerHTML = `<span>${pk.boss ? 'Boss + ' + pk.n + ' foes' : pk.n + ' foes' + (pk.elites ? ' · ' + pk.elites + ' elite' : '')}</span><span>${fmt(pk.hp)} health · ${fmt(pk.atk)} bite each</span>`;
}
function updateBattle() {
  if (ui.battleDirty) { renderBattle(); ui.battleDirty = false; }
  $('bLumen').textContent = fmt(S.lumen) + ' Lumen · wins pay +' + fmt(winReward());
  $('bPearl').textContent = 'Shadow Pearls: ' + fmtInt(S.pearls);
  $('bPower').textContent = 'Power ' + fmt(guardianPower()) + ' vs ' + fmt(stagePower());
  const n = bubbleCount();
  $('bubble').innerHTML = `×${n}<span>${fmt(bubbleCost())}</span>`;
  $('bubble').disabled = S.lumen < bubbleCost();
  $('bubble').setAttribute('aria-label', `Lumen bubble: open ${n} gear for ${fmt(bubbleCost())} Lumen`);
  $('autoBtn').textContent = S.battle.auto ? 'Auto: on' : 'Auto: off';
  $('autoBtn').setAttribute('aria-pressed', String(S.battle.auto));
  $('fightBtn').disabled = tideFull() || arenaState().phase !== 'idle';
}

// ---- Ember Wastes: tower defense ---------------------------------------------
// The surface burned and fire is raining into the deep. Fires walk a scorched path toward
// your reef; towers put them out. Each snuffed fire drops Ash (the zone's currency, which
// feeds the tide). Waves get hotter; if the fire reaches the reef too often you fall back
// one wave. The tide washes the towers away, like the garden and the reef.
// Some fires go off when they die: towers within their blast radius grey out for
// blastSecs (not topped up if already grey), and after one blast no other can go off for
// blastCd. Every shiftEvery waves the lava finds a new route and crushes towers in its way.
// Every enemy that reaches the reef also costs leakPearls Ember Pearls (never below zero).
const TD = { cols: 7, rows: 10, spawnGap: 0.9, waveGap: 2, blastSecs: 5, blastCd: 5, shiftEvery: 15, leakPearls: 3e6 };
// The lava's route: corner points from just above the map down to the reef. It starts on
// this route and shifts to a random one every shiftEvery waves (saved in S.ember.path).
const TD_START_PATH = [[3, -1], [3, 1], [1, 1], [1, 4], [5, 4], [5, 7], [2, 7], [2, 9], [2, 10]];
let TD_PATH, TD_CELLS, TD_LEN;
const TOWERS = {
  spout: { name: 'Water spout', short: 'Spout', cost: 2000, dmg: 3, range: 1.8, rate: 0.45, color: '#6FB8FF', desc: 'Fast single jets' },
  pump: { name: 'Coral pump', short: 'Pump', cost: 6000, dmg: 1, range: 1.5, rate: 0.8, color: '#5CF2D6', desc: 'Hits all nearby, slows fires' },
  cannon: { name: 'Tide cannon', short: 'Cannon', cost: 16000, dmg: 12, range: 2.4, rate: 1.6, color: '#C79BFF', desc: 'Slow, big splash' },
  whale: { name: 'Whale spout', short: 'Whale', cost: 24000, dmg: 40, range: 4, rate: 2.6, color: '#9DB8FF', desc: 'Huge range, hits the strongest fire', unlock: 5 },
  eel: { name: 'Eel coil', short: 'Eel', cost: 12000, dmg: 4, range: 2, rate: 0.9, color: '#FFE16B', desc: 'Jolt chains to 2 more fires', unlock: 10 },
  frost: { name: 'Cold vent', short: 'Vent', cost: 9000, dmg: 0.5, range: 1.6, rate: 0.6, color: '#C8FFFF', desc: 'Nearby fires crawl at 40% speed', unlock: 15 },
  clam: { name: 'Clam bank', short: 'Clam', cost: 20000, dmg: 0, range: 1.5, rate: 1, color: '#FF8FD0', desc: 'No attack: towers beside it hit 30% harder', unlock: 20 },
};
// You bring 3 tower types into the fight; more unlock as your best wave grows.
const LOADOUT_SIZE = 3;
const towerUnlocked = (k) => (S.ember.best || 0) >= (TOWERS[k].unlock || 0);
const loadout = () => (S.ember.loadout || ['spout', 'pump', 'cannon']).filter((k) => TOWERS[k]);
// Tower upgrades: bought with Ash and kept, like the towers (the Ember Wastes has no tide).
const EMBER_UPS = [
  { id: 'power', name: 'High pressure', desc: 'All towers ×1.4 damage', base: 4000, growth: 3 },
  { id: 'rapid', name: 'Rapid valves', desc: 'Towers fire 8% faster', base: 5000, growth: 3, max: 5 },
  { id: 'reach', name: 'Wide nozzles', desc: 'Tower range +10%', base: 6000, growth: 3, max: 5 },
  { id: 'cheap', name: 'Driftwood frames', desc: 'Towers cost 8% less to build and upgrade', base: 3000, growth: 3, max: 5 },
  { id: 'bounty', name: 'Ash sifting', desc: '+25% Ash from every fire', base: 8000, growth: 3.5 },
  { id: 'wall', name: 'Reef wall', desc: '+5 reef health', base: 5000, growth: 2.5, max: 6 },
  { id: 'salvage', name: 'Salvage crews', desc: 'Selling refunds +8% more', base: 2000, growth: 2.5, max: 5 },
];
const eUp = (id) => (S.ember.up && S.ember.up[id]) || 0;
const emberUpCost = (u) => Math.ceil(u.base * Math.pow(u.growth, eUp(u.id)) * depthCost());
const towerRange = (t) => (TOWERS[t.type].range + (t.evo ? EVO.reach : 0)) * (1 + 0.1 * eUp('reach'));
const sellRate = () => 0.6 + 0.08 * eUp('salvage');
// ---- Tower evolution ------------------------------------------------------------
// A maxed tower can spin the evolution wheel. Success grows it into a neighbouring tile
// (an empty one if there is one, else swallowing the tower there, no refund) with more
// damage, speed and reach, and an aura for every tower touching it. Failure drops it
// back to Lv 1 with no refund.
const EVO = { dmg: 3, rate: 0.8, reach: 0.6, auraDmg: 1.25, auraRate: 0.9 };
const EVO_NAMES = { spout: 'Geyser', pump: 'Reef heart', cannon: 'Tsunami cannon', whale: 'Leviathan', eel: 'Storm eel', frost: 'Glacier vent', clam: 'Giant clam' };
const towerCells = (t) => (t.evo ? [[t.c, t.r], [t.c2, t.r2]] : [[t.c, t.r]]);
const towerAt = (c, r) => S.ember.towers.find((t) => towerCells(t).some(([x, y]) => x === c && y === r));
const towerCenter = (t) => (t.evo ? [(t.c + t.c2) / 2 + 0.5, (t.r + t.r2) / 2 + 0.5] : [t.c + 0.5, t.r + 0.5]);
const towerName = (t) => (t.evo ? EVO_NAMES[t.type] : TOWERS[t.type].name);
const sellValue = (t) => Math.floor(towerCost(t.type, t.lvl) * sellRate() * (t.evo ? 2 : 1));
// Touching either tile of an evolved tower, diagonals included.
const nearEvolved = (t) => S.ember.towers.some((o) => o.evo && o !== t
  && towerCells(o).some(([oc, or]) => towerCells(t).some(([c, r]) => Math.abs(oc - c) <= 1 && Math.abs(or - r) <= 1)));
// Where an evolving tower would grow: right, down, left or up, an empty tile first.
function evoSpot(t) {
  const open = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([dc, dr]) => [t.c + dc, t.r + dr])
    .filter(([c, r]) => c >= 0 && c < TD.cols && r >= 0 && r < TD.rows && !TD_CELLS.has(c + ',' + r));
  const empty = open.find(([c, r]) => !towerAt(c, r));
  if (empty) return { c: empty[0], r: empty[1], eats: null };
  const taken = open.find(([c, r]) => !towerAt(c, r).evo);
  return taken ? { c: taken[0], r: taken[1], eats: towerAt(taken[0], taken[1]) } : null;
}
const clamBoost = (t) => (S.ember.towers.some((o) => o.type === 'clam' && o !== t && Math.abs(o.c - t.c) <= 1 && Math.abs(o.r - t.r) <= 1) ? 1.3 : 1);
const TD_MAX_LVL = 5;
// Sets the route: its cells and the walking line through their centres.
function setPath(pts) {
  TD_PATH = pts;
  TD_CELLS = new Set();
  for (let i = 0; i < pts.length - 1; i++) {
    const [c1, r1] = pts[i], [c2, r2] = pts[i + 1];
    const steps = Math.max(Math.abs(c2 - c1), Math.abs(r2 - r1));
    for (let s = 0; s <= steps; s++) {
      const c = c1 + Math.sign(c2 - c1) * s, r = r1 + Math.sign(r2 - r1) * s;
      if (r >= 0 && r < TD.rows) TD_CELLS.add(c + ',' + r);
    }
  }
  TD_LEN = pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
  ui.tdBg = null; // the ground is cached around the path, so redraw it
}
setPath(TD_START_PATH);
const savedPath = () => (Array.isArray(S.ember.path) && S.ember.path.length > 2 ? S.ember.path : TD_START_PATH);
// A random route: down from the top, across in runs of 2+ columns, rows 2-3 apart, to the reef.
function randomPath() {
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  let c = ri(1, TD.cols - 2), r = ri(1, 2);
  const pts = [[c, -1]];
  while (r < TD.rows - 1) {
    pts.push([c, r]);
    let nc;
    do { nc = ri(0, TD.cols - 1); } while (Math.abs(nc - c) < 2);
    pts.push([nc, r]);
    c = nc;
    r += ri(2, 3);
  }
  pts.push([c, TD.rows]);
  return pts;
}
// The lava finds a new route; towers in its way are lost with no refund.
function shiftLava() {
  const td = tdState(), e = S.ember;
  let pts;
  do { pts = randomPath(); } while (JSON.stringify(pts) === JSON.stringify(TD_PATH));
  setPath(pts);
  e.path = pts;
  e.shiftPending = false;
  const onLava = (t) => towerCells(t).some(([c, r]) => TD_CELLS.has(c + ',' + r));
  const lost = e.towers.filter(onLava);
  e.towers = e.towers.filter((t) => !onLava(t));
  lost.forEach((t) => { const [x, y] = towerCenter(t); td.puffs.push({ x, y, r: 0.9, t: 0.6 }); });
  td.sel = null;
  e.log = 'The lava found a new way down' + (lost.length ? `, swallowing ${lost.length} ${lost.length === 1 ? 'tower' : 'towers'}.` : '. All your towers are safe.');
  td.banner = { won: false, text: 'The lava shifts', sub: lost.length ? lost.length + (lost.length === 1 ? ' tower lost' : ' towers lost') : 'All towers safe', t: ARENA.bannerSecs };
  td.flash = 0.6;
  Sound.descend();
  ui.emberDirty = true;
  save();
}
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
const emberMaxHp = () => 20 + 10 * rank('ember', 'firebreak') + 5 * eUp('wall');
const depthCost = () => Math.pow(BAL.depthMult, S.depthMarks);
const towerCost = (type, lvl = 0) => Math.ceil(TOWERS[type].cost * Math.pow(1.8, lvl) * depthCost() * (1 - 0.08 * eUp('cheap')));
const towerDmg = (t) => TOWERS[t.type].dmg * Math.pow(1.7, t.lvl) * Math.pow(1.5, rank('ember', 'pressure')) * Math.pow(1.4, eUp('power')) * clamBoost(t)
  * (t.evo ? EVO.dmg : 1) * (nearEvolved(t) ? EVO.auraDmg : 1);
const towerRate = (t) => TOWERS[t.type].rate * (1 - 0.12 * rank('ember', 'quick')) * (1 - 0.08 * eUp('rapid'))
  * (t.evo ? EVO.rate : 1) * (nearEvolved(t) ? EVO.auraRate : 1);
const fireHp = (w) => 10 * Math.pow(1.15, w - 1);
// Ember Pearls for clearing wave w: half a tide fill at wave 1, +10% per wave after.
const pearlsPerWave = (w) => Math.max(1, Math.floor(pearlsPerFill() * 0.5 * Math.pow(1.1, w - 1)));
const ashPerFire = (w) => 600 * Math.pow(1.12, w - 1) * globalMult(false) * Math.pow(1.5, rank('ember', 'ashsift')) * (1 + 0.25 * eUp('bounty'));

// Fire kinds. hp, ash and speed are multiples of the wave's base fire; leak is how much
// reef health it burns if it gets through; blast is the radius it greys towers in as it dies. Deeper waves mix in faster, tougher and
// stranger fires, and every 5th wave ends with an Inferno that bursts into sparks.
const FIRE_KINDS = {
  ember: { name: 'Ember', hp: 1, speed: 1, ash: 1, leak: 1, from: 1, weight: 10, size: 0.34 },
  spark: { name: 'Spark', hp: 0.6, speed: 1.75, ash: 0.6, leak: 1, from: 3, weight: 6, size: 0.26 },
  magma: { name: 'Magma blob', hp: 3, speed: 0.55, ash: 2.5, leak: 2, from: 6, weight: 4, size: 0.42, blast: 1.3 },
  cinder: { name: 'Cinder bat', hp: 0.8, speed: 0.85, ash: 1.2, leak: 1, from: 9, weight: 4, size: 0.3, hop: true },
  inferno: { name: 'Inferno', hp: 8, speed: 0.6, ash: 8, leak: 5, size: 0.6, boss: true, blast: 2 },
  // Loot for the bonus wave after a boss. It never burns the reef; whatever you miss escapes.
  pearl: { name: 'Pearl', hp: 2, speed: 1.25, ash: 0, leak: 0, size: 0.3, loot: true },
  chest: { name: 'Treasure chest', hp: 5, speed: 0.7, ash: 0, leak: 0, size: 0.38, loot: true },
};
// A burning supply crate sometimes sinks through the map mid-wave. Towers (and taps)
// can put it out; salvage it before it hits the seabed for a pile of Ash and a sunken
// chest for your gear.
const CRATE = { chance: 0.3, hp: 6, ash: 20, sink: 0.5, tap: 0.12 };
// Clearing a boss wave queues a bonus wave of loot: each Pearl pays a share of that wave's
// Pearls, each chest a sunken chest for your gear plus Ash.
const BONUS = { pearls: 8, chests: 3, pearlShare: 0.15, chestAsh: 15 };
// Later kinds ease in over a few waves instead of arriving at full strength.
function pickFire(w) {
  const pool = Object.entries(FIRE_KINDS).filter(([, k]) => !k.boss && w >= k.from)
    .map(([id, k]) => [id, k.weight * Math.min(1, (w - k.from + 1) / 4)]);
  let r = Math.random() * pool.reduce((s, [, wt]) => s + wt, 0);
  for (const [id, wt] of pool) if ((r -= wt) < 0) return id;
  return 'ember';
}
function makeFire(kind, w, d = 0) {
  const k = FIRE_KINDS[kind];
  const hp = fireHp(w) * k.hp;
  const speed = k.boss ? k.speed : Math.min(2.2, 1 + 0.03 * w) * k.speed;
  // Placed on the path right away: sparks from an Inferno appear between ticks.
  const [x, y] = pathPoint(d);
  return { kind, d, x, y, hp, max: hp, speed, slow: 0, chill: 0, boss: !!k.boss, flick: Math.random() * 6, hopIn: 1.5 + Math.random(), hurt: 0 };
}

// Game speed: tapping the button cycles these. Older saves only had a 2× switch (fast).
const TD_SPEEDS = [1, 2, 4, 8];
const tdSpeed = () => (TD_SPEEDS.includes(S.ember.speed) ? S.ember.speed : S.ember.fast ? 2 : 1);
function tdState() {
  if (!ui.td) ui.td = { fires: [], shots: [], queue: [], pops: [], puffs: [], smoke: [], spawnIn: 0, between: 1.5, running: false, ashLog: [], sel: null, flash: 0, crate: null, crateIn: 0, banner: null, t: 0 };
  return ui.td;
}
function startWave() {
  const td = tdState();
  if (td.running || tideFull()) return;
  const w = S.ember.wave;
  td.running = true;
  td.spawnIn = 0;
  td.crate = null;
  td.banner = null;
  if (S.ember.shiftPending && !td.bonusNext) shiftLava();
  if (td.bonusNext) {
    // Bonus wave: shuffled Pearls and chests, sized to the boss wave just cleared.
    td.bonus = { wave: td.bonusNext, pearls: 0, chests: 0, missed: 0 };
    td.bonusNext = 0;
    td.queue = Array(BONUS.pearls).fill('pearl').concat(Array(BONUS.chests).fill('chest')).sort(() => Math.random() - 0.5);
    td.crateIn = 0;
    td.banner = { won: true, text: 'Bonus wave', sub: 'Snuff the loot before it slips away', t: ARENA.bannerSecs };
  } else {
    td.bonus = null;
    td.queue = Array.from({ length: 6 + 2 * w }, () => pickFire(w));
    if (w % 5 === 0) td.queue.push('inferno');
    td.crateIn = Math.random() < CRATE.chance ? 2 + Math.random() * 4 : 0;
  }
  Sound.click();
  ui.emberDirty = true;
}
function snuff(fire) {
  const td = tdState();
  if (FIRE_KINDS[fire.kind].loot) { lootBonus(td, fire); return; }
  const ash = ashPerFire(S.ember.wave) * FIRE_KINDS[fire.kind].ash;
  earn(ash);
  td.ashLog.push([Date.now(), ash]);
  td.pops.push({ x: fire.x, y: fire.y, t: 0.8, text: '+' + fmt(ash), color: '#FFC46B' });
  td.puffs.push({ x: fire.x, y: fire.y, r: FIRE_KINDS[fire.kind].size * 1.6, t: 0.6 });
  const blast = FIRE_KINDS[fire.kind].blast;
  if (blast && !(td.blastCd > 0)) {
    S.ember.towers.forEach((t) => { const [tx, ty] = towerCenter(t); if (!(t.off > 0) && Math.hypot(tx - fire.x, ty - fire.y) <= blast) t.off = TD.blastSecs; });
    td.blastCd = TD.blastCd;
    td.shots.push({ kind: 'blast', x: fire.x, y: fire.y, r: blast, t: 0.5 });
  }
  // The Inferno bursts into three sparks as it goes out.
  if (fire.boss) {
    Sound.milestone();
    for (let i = 0; i < 3; i++) { const s = makeFire('spark', S.ember.wave, Math.max(0, fire.d - 0.3 * i)); s.hp = s.max = s.hp * 1.5; td.fires.push(s); }
  }
}
function lootBonus(td, f) {
  const b = td.bonus, w = b ? b.wave : S.ember.wave;
  if (f.kind === 'pearl') {
    const p = Math.max(1, Math.floor(pearlsPerWave(w) * BONUS.pearlShare));
    S.pearls += p; S.zoneEarned += p;
    if (b) b.pearls += p;
    td.pops.push({ x: f.x, y: f.y, t: 1, text: '+' + fmt(p), color: '#FF8FD0' });
    Sound.perk();
  } else {
    const ash = ashPerFire(w) * BONUS.chestAsh;
    earn(ash);
    td.ashLog.push([Date.now(), ash]);
    S.gear.chests += 1;
    if (b) b.chests += 1;
    td.pops.push({ x: f.x, y: f.y - 0.4, t: 1.3, text: 'Sunken chest!', color: '#FFE08A' });
    td.pops.push({ x: f.x, y: f.y, t: 1.1, text: '+' + fmt(ash), color: '#FFC46B' });
    Sound.milestone();
  }
  td.shots.push({ kind: 'sparkle', x: f.x, y: f.y, t: 0.5, color: f.kind === 'pearl' ? '#FF8FD0' : '#FFE08A' });
}
function salvageCrate(td) {
  const c = td.crate;
  const ash = ashPerFire(S.ember.wave) * CRATE.ash;
  earn(ash);
  td.ashLog.push([Date.now(), ash]);
  S.gear.chests += 1;
  td.pops.push({ x: c.x, y: c.y - 0.5, t: 1.4, text: 'Sunken chest!', color: '#FFE08A' });
  td.pops.push({ x: c.x, y: c.y, t: 1.2, text: '+' + fmt(ash), color: '#FFC46B' });
  td.puffs.push({ x: c.x, y: c.y, r: 1.2, t: 0.8 });
  S.ember.log = `Salvaged a supply crate: +${fmt(ash)} Ash and a sunken chest for your gear.`;
  td.crate = null;
  ui.emberDirty = true;
  Sound.milestone();
}
function hitFire(td, f, dmg) {
  f.hp -= dmg;
  f.hurt = 0.12;
  if (dmg >= f.max * 0.4) td.pops.push({ x: f.x + (Math.random() - 0.5) * 0.3, y: f.y - 0.3, t: 0.5, text: fmt(dmg), small: true });
}
function waveOver(won) {
  const td = tdState();
  td.running = false;
  td.fires = [];
  td.crate = null;
  td.crateIn = 0;
  td.between = TD.waveGap;
  const e = S.ember;
  if (td.bonus) {
    const b = td.bonus;
    td.bonus = null;
    e.log = `Bonus wave: +${fmt(b.pearls)} Ember Pearls and ${b.chests} sunken ${b.chests === 1 ? 'chest' : 'chests'}${b.missed ? ` (${b.missed} got away)` : ''}.`;
    td.banner = { won: true, text: 'Bonus collected', sub: '+' + fmt(b.pearls) + ' Pearls · ' + b.chests + (b.chests === 1 ? ' chest' : ' chests'), t: ARENA.bannerSecs };
    Sound.buy();
    if (e.shiftPending) { const log = e.log; shiftLava(); e.log = log + ' ' + e.log; }
  } else if (won) {
    const bonus = ashPerFire(e.wave) * 10 * (1 + rank('ember', 'cistern'));
    if (e.wave % 5 === 0) td.bonusNext = e.wave;
    if (e.wave % TD.shiftEvery === 0 && e.wave > (e.pathAt || 0)) { e.pathAt = e.wave; e.shiftPending = true; }
    const pearls = pearlsPerWave(e.wave);
    earn(bonus);
    S.pearls += pearls;
    S.zoneEarned += pearls;
    e.best = Math.max(e.best, e.wave);
    e.wave += 1;
    e.log = `Wave ${e.wave - 1} snuffed out! +${fmt(bonus)} Ash and +${fmt(pearls)} Ember Pearls.`;
    td.banner = { won: true, text: 'Wave cleared', sub: '+' + fmt(pearls) + ' Pearls · +' + fmt(bonus) + ' Ash', t: ARENA.bannerSecs };
    Sound.buy();
  } else {
    e.wave = Math.max(1, e.wave - 1);
    e.log = `The fire reached your reef. Back to wave ${e.wave}. More towers, or stronger ones, will hold it.`;
    td.banner = { won: false, text: 'Reef burned', sub: 'Back to wave ' + e.wave, t: ARENA.bannerSecs };
    Sound.descend();
  }
  e.hp = emberMaxHp();
  ui.emberDirty = true;
  save();
}
function emberTick(dt) {
  const td = tdState();
  const e = S.ember;
  td.t += dt;
  td.blastCd = Math.max(0, (td.blastCd || 0) - dt);
  // Rolling Ash per second over the last 30s (shown in the HUD and used for offline earnings).
  const now = Date.now();
  td.ashLog = td.ashLog.filter(([t]) => now - t < 30000);
  e.ashRate = td.ashLog.reduce((s, [, a]) => s + a, 0) / 30;
  td.shots = td.shots.filter((s) => (s.t -= dt) > 0);
  td.puffs = td.puffs.filter((p) => (p.t -= dt) > 0);
  if (td.banner && (td.banner.t -= dt) <= 0) td.banner = null;
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
  if (td.queue.length && td.spawnIn <= 0) {
    td.fires.push(makeFire(td.queue.shift(), td.bonus ? td.bonus.wave : w));
    td.spawnIn = TD.spawnGap;
  }
  if (td.crateIn > 0 && (td.crateIn -= dt) <= 0) {
    const hp = fireHp(w) * CRATE.hp;
    td.crate = { x: 0.8 + Math.random() * (TD.cols - 1.6), y: -0.6, hp, max: hp, t: 0, hurt: 0 };
  }
  // Move fires. Cinder bats hop ahead along the path every couple of seconds.
  td.fires.forEach((f) => {
    f.d += f.speed * (f.chill > 0 ? 0.4 : f.slow > 0 ? 0.6 : 1) * dt;
    if (FIRE_KINDS[f.kind].hop) {
      if (f.hop) { const k = Math.min(1, (f.hop.t += dt) / 0.45); f.d = f.hop.from + 1.6 * k; f.lift = Math.sin(Math.PI * k) * 0.7; if (k >= 1) { f.hop = null; f.lift = 0; } }
      else if ((f.hopIn -= dt) <= 0) { f.hop = { from: f.d, t: 0 }; f.hopIn = 2.2; }
    }
    f.slow = Math.max(0, f.slow - dt);
    f.chill = Math.max(0, f.chill - dt);
    f.hurt = Math.max(0, f.hurt - dt);
    f.flick += dt * 10;
    [f.x, f.y] = pathPoint(f.d);
  });
  if (td.crate) {
    const c = td.crate;
    c.t += dt; c.y += CRATE.sink * dt; c.hurt = Math.max(0, c.hurt - dt);
    c.x += Math.sin(c.t * 1.3) * 0.25 * dt;
    if (c.y > TD.rows - 0.3) { td.pops.push({ x: c.x, y: c.y - 0.4, t: 1, text: 'Sank' }); td.crate = null; }
  }
  const reached = td.fires.filter((f) => f.d >= TD_LEN);
  if (reached.length) {
    reached.forEach((f) => {
      e.hp -= FIRE_KINDS[f.kind].leak;
      if (!FIRE_KINDS[f.kind].loot && S.pearls > 0) {
        const lost = Math.min(S.pearls, TD.leakPearls);
        S.pearls -= lost;
        td.pops.push({ x: f.x, y: TD.rows - 0.6, t: 1.1, text: '-' + fmt(lost) + ' Pearls', color: '#FF6B6B' });
      }
      if (FIRE_KINDS[f.kind].loot) { if (td.bonus) td.bonus.missed++; td.pops.push({ x: f.x, y: TD.rows - 0.4, t: 1, text: 'Got away' }); }
    });
    td.fires = td.fires.filter((f) => f.d < TD_LEN);
    if (reached.some((f) => !FIRE_KINDS[f.kind].loot)) td.flash = 0.4;
    if (e.hp <= 0) { waveOver(false); return; }
  }
  // Towers fire. Fires come first; a tower with no fire in reach turns on the crate.
  e.towers.forEach((t) => {
    if (t.off > 0) { t.off = Math.max(0, t.off - dt); return; }
    t.cd = (t.cd || 0) - dt;
    if (t.cd > 0) return;
    const spec = TOWERS[t.type];
    if (t.type === 'clam') return;
    const [cx, cy] = towerCenter(t);
    const range = towerRange(t);
    const inRange = td.fires.filter((f) => Math.hypot(f.x - cx, f.y - cy) <= range);
    const crate = td.crate && Math.hypot(td.crate.x - cx, td.crate.y - cy) <= range ? td.crate : null;
    if (!inRange.length && !crate) return;
    t.cd = towerRate(t);
    const dmg = towerDmg(t);
    const hitCrate = (d) => { if (crate && td.crate) { crate.hp -= d; crate.hurt = 0.12; } };
    if (t.type === 'pump' || t.type === 'frost') {
      inRange.forEach((f) => { hitFire(td, f, dmg); if (t.type === 'pump') f.slow = 1; else f.chill = 2; });
      hitCrate(dmg);
      td.shots.push({ kind: 'ring', x: cx, y: cy, r: range, t: 0.3, color: spec.color });
      t.kick = 0.2;
      return;
    }
    if (!inRange.length) {
      t.aim = Math.atan2(crate.y - cy, crate.x - cx); t.kick = 0.15;
      hitCrate(dmg);
      td.shots.push({ kind: 'jet', x1: cx, y1: cy, x2: crate.x, y2: crate.y, color: spec.color, t: 0.15, w: t.type === 'whale' ? 6 : 3 });
      return;
    }
    if (t.type === 'whale') {
      const target = inRange.reduce((a, b) => (b.hp > a.hp ? b : a));
      hitFire(td, target, dmg);
      t.aim = Math.atan2(target.y - cy, target.x - cx);
      td.shots.push({ kind: 'jet', x1: cx, y1: cy, x2: target.x, y2: target.y, color: spec.color, t: 0.25, w: 6 });
    } else if (t.type === 'eel') {
      let from = { x: cx, y: cy };
      const hit = [];
      let target = inRange.reduce((a, b) => (b.d > a.d ? b : a));
      t.aim = Math.atan2(target.y - cy, target.x - cx);
      for (let k = 0; k < 3 && target; k++) {
        hitFire(td, target, dmg * (k ? 0.7 : 1));
        hit.push(target);
        td.shots.push({ kind: 'zap', x1: from.x, y1: from.y, x2: target.x, y2: target.y, color: spec.color, t: 0.15 });
        from = target;
        const near = td.fires.filter((f) => !hit.includes(f) && Math.hypot(f.x - from.x, f.y - from.y) <= 1.5);
        target = near.length ? near.reduce((a, b) => (Math.hypot(b.x - from.x, b.y - from.y) < Math.hypot(a.x - from.x, a.y - from.y) ? b : a)) : null;
      }
    } else {
      const target = inRange.reduce((a, b) => (b.d > a.d ? b : a));
      t.aim = Math.atan2(target.y - cy, target.x - cx);
      if (t.type === 'cannon') {
        td.fires.forEach((f) => { if (Math.hypot(f.x - target.x, f.y - target.y) <= 1) hitFire(td, f, dmg); });
        if (td.crate && Math.hypot(td.crate.x - target.x, td.crate.y - target.y) <= 1) { td.crate.hp -= dmg; td.crate.hurt = 0.12; }
        td.shots.push({ kind: 'splash', x: target.x, y: target.y, t: 0.35 });
        td.shots.push({ kind: 'ball', x1: cx, y1: cy, x2: target.x, y2: target.y, color: spec.color, t: 0.2 });
      } else {
        hitFire(td, target, dmg);
        td.shots.push({ kind: 'jet', x1: cx, y1: cy, x2: target.x, y2: target.y, color: spec.color, t: 0.15 });
      }
    }
    t.kick = 0.15;
  });
  if (td.crate && td.crate.hp <= 0) salvageCrate(td);
  const dead = td.fires.filter((f) => f.hp <= 0);
  td.fires = td.fires.filter((f) => f.hp > 0);
  dead.forEach(snuff);
  // The wave ends once every fire is out; a crate still sinking gets its chance first.
  if (!td.queue.length && !td.fires.length) {
    td.crateIn = 0;
    if (!td.crate) waveOver(true);
  }
}

// Drawing (only while the Ember screen is showing)
function tdCanvas() {
  const cv = $('td');
  const wrap = cv.parentElement.getBoundingClientRect();
  const tile = Math.max(28, Math.min(48, Math.floor(wrap.width / TD.cols)));
  const w = tile * TD.cols, h = tile * (TD.rows + 1);
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
  return { cv, ctx: cv.getContext('2d'), tile, dpr };
}
// The scorched seabed never changes, so it's drawn once per tile size and reused.
function tdGround(tile, dpr) {
  if (ui.tdBg && ui.tdBg.tile === tile && ui.tdBg.dpr === dpr) return ui.tdBg.cv;
  const cv = document.createElement('canvas');
  cv.width = tile * TD.cols * dpr; cv.height = tile * TD.rows * dpr;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#140705'; g.fillRect(0, 0, tile * TD.cols, tile * TD.rows);
  // A fixed pseudo-random so the rocks don't jump around between redraws.
  const rnd = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
  for (let r = 0; r < TD.rows; r++) for (let c = 0; c < TD.cols; c++) {
    if (TD_CELLS.has(c + ',' + r)) continue;
    const s = c * 31 + r * 7;
    g.fillStyle = (c + r) % 2 ? '#1F0D08' : '#1B0B07';
    g.beginPath(); g.roundRect(c * tile + 1.5, r * tile + 1.5, tile - 3, tile - 3, tile * 0.18); g.fill();
    for (let k = 0; k < 2; k++) {
      g.fillStyle = k ? 'rgba(255,120,60,.05)' : 'rgba(0,0,0,.25)';
      g.beginPath(); g.ellipse(c * tile + tile * (0.25 + 0.5 * rnd(s + k)), r * tile + tile * (0.3 + 0.45 * rnd(s + k + 9)), tile * (0.08 + 0.08 * rnd(s + k + 3)), tile * 0.06, rnd(s) * 3, 0, Math.PI * 2); g.fill();
    }
    if (rnd(s + 5) > 0.7) { g.strokeStyle = 'rgba(255,110,50,.16)'; g.lineWidth = 1; g.beginPath(); g.moveTo(c * tile + tile * 0.2, r * tile + tile * 0.7); g.lineTo(c * tile + tile * 0.45, r * tile + tile * 0.55); g.lineTo(c * tile + tile * 0.7, r * tile + tile * 0.8); g.stroke(); }
  }
  ui.tdBg = { tile, dpr, cv };
  return cv;
}
// The path as one lava channel: dark crust, a glowing bed and a slow flow toward the reef.
function tdLava(ctx, tile, t) {
  const pts = TD_PATH.map(([c, r]) => [(c + 0.5) * tile, (Math.min(r, TD.rows) + 0.5) * tile]);
  const line = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = '#2A0F08'; ctx.lineWidth = tile * 0.92; line(); ctx.stroke();
  ctx.shadowColor = '#FF5A1F'; ctx.shadowBlur = tile * 0.5;
  ctx.strokeStyle = '#7A2410'; ctx.lineWidth = tile * 0.62; line(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#B83418'; ctx.lineWidth = tile * 0.4; line(); ctx.stroke();
  ctx.setLineDash([tile * 0.22, tile * 0.55]); ctx.lineDashOffset = -t * tile * 0.7;
  ctx.strokeStyle = 'rgba(255,170,80,.75)'; ctx.lineWidth = tile * 0.16; line(); ctx.stroke();
  ctx.setLineDash([tile * 0.08, tile * 0.9]); ctx.lineDashOffset = -t * tile * 1.1 + tile * 0.3;
  ctx.strokeStyle = 'rgba(255,240,180,.8)'; ctx.lineWidth = tile * 0.08; line(); ctx.stroke();
  ctx.restore();
}
function drawTD(dt) {
  const { ctx, tile, dpr } = tdCanvas();
  const td = tdState();
  const e = S.ember;
  const W = tile * TD.cols, ry = TD.rows * tile, t = td.t;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.drawImage(tdGround(tile, dpr), 0, 0, W, ry);
  tdLava(ctx, tile, t);
  // Smoke and embers rising off the lava.
  if (Math.random() < dt * 6) { const [x, y] = pathPoint(Math.random() * TD_LEN); td.smoke.push({ x, y, t: 1.6, ember: Math.random() < 0.35, dx: (Math.random() - 0.5) * 0.3 }); }
  td.smoke = td.smoke.filter((p) => (p.t -= dt) > 0);
  td.smoke.forEach((p) => {
    const k = 1 - p.t / 1.6, x = (p.x + p.dx * k) * tile, y = (p.y - k * 0.9) * tile;
    if (p.ember) { ctx.fillStyle = `rgba(255,170,80,${0.8 * (1 - k)})`; ctx.fillRect(x, y, 2, 2); }
    else { ctx.fillStyle = `rgba(120,90,80,${0.18 * (1 - k)})`; ctx.beginPath(); ctx.arc(x, y, tile * (0.12 + 0.2 * k), 0, Math.PI * 2); ctx.fill(); }
  });
  // Your reef at the bottom, with its health along the top edge.
  const reefG = ctx.createLinearGradient(0, ry, 0, ry + tile);
  reefG.addColorStop(0, '#0E3A31'); reefG.addColorStop(1, '#06201B');
  ctx.fillStyle = reefG; ctx.fillRect(0, ry, W, tile);
  [[0.7, '#2ED3B7'], [1.9, '#FF8FD0'], [3.5, '#8F7BFF'], [5.1, '#2ED3B7'], [6.3, '#FF8FD0']].forEach(([x, col], i) => {
    const sway = Math.sin(t * 1.4 + i) * tile * 0.03;
    ctx.fillStyle = hexA(col, 0.25); ctx.beginPath(); ctx.arc(x * tile, ry + tile * 0.75, tile * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x * tile + sway, ry + tile * 0.85, tile * 0.24, tile * 0.5, 0, Math.PI, 0); ctx.fill();
  });
  const hpFrac = Math.max(0, e.hp / emberMaxHp());
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, ry, W, 4);
  ctx.fillStyle = hpFrac > 0.5 ? '#5CF2D6' : hpFrac > 0.25 ? '#FFC46B' : '#FF6B6B'; ctx.fillRect(0, ry, W * hpFrac, 4);
  if (td.flash > 0) { ctx.fillStyle = `rgba(255,80,40,${td.flash})`; ctx.fillRect(0, ry, W, tile); td.flash -= dt; }
  // Range rings: the selected tower's reach, or each build option's reach on an empty tile.
  if (td.sel) {
    let sx = (td.sel.c + 0.5) * tile, sy = (td.sel.r + 0.5) * tile;
    const sel = towerAt(td.sel.c, td.sel.r);
    if (sel) { const [qx, qy] = towerCenter(sel); sx = qx * tile; sy = qy * tile; }
    const rings = sel ? [[towerRange(sel), TOWERS[sel.type].color, true]] : loadout().map((k) => [TOWERS[k].range * (1 + 0.1 * eUp('reach')), TOWERS[k].color, false]);
    rings.forEach(([rad, col, solid]) => {
      ctx.fillStyle = hexA(col, solid ? 0.1 : 0.04); ctx.beginPath(); ctx.arc(sx, sy, rad * tile, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hexA(col, 0.7); ctx.lineWidth = 1.5; ctx.setLineDash(solid ? [] : [5, 5]);
      ctx.beginPath(); ctx.arc(sx, sy, rad * tile, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    });
    ctx.strokeStyle = '#FFC46B'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(td.sel.c * tile + 2, td.sel.r * tile + 2, tile - 4, tile - 4, tile * 0.18); ctx.stroke();
  }
  e.towers.forEach((tw) => drawTower(ctx, tw, tile, t, dt));
  if (td.crate) drawCrate(ctx, td.crate, tile, t);
  td.fires.forEach((f) => drawFire(ctx, f, tile));
  // Water.
  td.shots.forEach((s) => {
    if (s.kind === 'jet') {
      ctx.lineCap = 'round';
      ctx.strokeStyle = hexA(s.color, 0.55); ctx.lineWidth = (s.w || 3) + 3; ctx.beginPath(); ctx.moveTo(s.x1 * tile, s.y1 * tile); ctx.lineTo(s.x2 * tile, s.y2 * tile); ctx.stroke();
      ctx.strokeStyle = '#EFFFFB'; ctx.lineWidth = Math.max(1, (s.w || 3) - 1); ctx.beginPath(); ctx.moveTo(s.x1 * tile, s.y1 * tile); ctx.lineTo(s.x2 * tile, s.y2 * tile); ctx.stroke();
      ctx.fillStyle = hexA('#BFEFFF', 0.8);
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + s.t * 30; ctx.beginPath(); ctx.arc(s.x2 * tile + Math.cos(a) * 5, s.y2 * tile + Math.sin(a) * 5, 1.6, 0, Math.PI * 2); ctx.fill(); }
    } else if (s.kind === 'zap') {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(s.x1 * tile, s.y1 * tile);
      for (let i = 1; i < 4; i++) { const k = i / 4; ctx.lineTo((s.x1 + (s.x2 - s.x1) * k) * tile + (Math.random() - 0.5) * 8, (s.y1 + (s.y2 - s.y1) * k) * tile + (Math.random() - 0.5) * 8); }
      ctx.lineTo(s.x2 * tile, s.y2 * tile); ctx.stroke();
    } else if (s.kind === 'ball') {
      const k = 1 - s.t / 0.2, x = s.x1 + (s.x2 - s.x1) * k, y = s.y1 + (s.y2 - s.y1) * k - Math.sin(Math.PI * k) * 0.8;
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(x * tile, y * tile, tile * 0.14, 0, Math.PI * 2); ctx.fill();
    } else if (s.kind === 'blast') {
      const k = 1 - s.t / 0.5;
      ctx.fillStyle = `rgba(150,150,160,${0.35 * (1 - k)})`; ctx.beginPath(); ctx.arc(s.x * tile, s.y * tile, s.r * tile * k, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(225,225,235,${1 - k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x * tile, s.y * tile, s.r * tile * k, 0, Math.PI * 2); ctx.stroke();
    } else if (s.kind === 'sparkle') {
      const k = 1 - s.t / 0.5;
      ctx.fillStyle = hexA(s.color, 1 - k);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = (0.2 + k * 0.9) * tile; ctx.save(); ctx.translate(s.x * tile + Math.cos(a) * r, s.y * tile + Math.sin(a) * r); ctx.rotate(a); ctx.fillRect(-1.5, -4, 3, 8); ctx.restore(); }
    } else if (s.kind === 'ring') {
      ctx.globalAlpha = Math.min(1, s.t * 2); ctx.strokeStyle = s.color || '#5CF2D6'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(s.x * tile, s.y * tile, s.r * tile * (1 - s.t), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    } else {
      const k = 1 - s.t / 0.35;
      ctx.fillStyle = `rgba(157,200,255,${0.5 * (1 - k)})`; ctx.beginPath(); ctx.arc(s.x * tile, s.y * tile, tile * (0.4 + 0.8 * k), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(230,250,255,${1 - k})`;
      for (let i = 0; i < 6; i++) { const a = i * 1.05; ctx.beginPath(); ctx.arc((s.x + Math.cos(a) * k) * tile, (s.y + Math.sin(a) * k - k * 0.3) * tile, 2, 0, Math.PI * 2); ctx.fill(); }
    }
  });
  // Steam where fires went out.
  td.puffs.forEach((p) => {
    const k = 1 - p.t / 0.6;
    ctx.fillStyle = `rgba(225,235,240,${0.45 * (1 - k)})`;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc((p.x + (i - 1) * p.r * 0.4) * tile, (p.y - k * 0.6 - i * 0.05) * tile, p.r * tile * (0.35 + 0.4 * k), 0, Math.PI * 2); ctx.fill(); }
  });
  // Ash and damage numbers.
  td.pops = td.pops.filter((p) => (p.t -= dt) > 0);
  ctx.textAlign = 'center';
  td.pops.forEach((p) => {
    ctx.font = `${p.small ? 700 : 800} ${Math.round(tile * (p.small ? 0.24 : 0.3))}px DM Sans, sans-serif`;
    ctx.fillStyle = p.color ? hexA(p.color, p.t * 1.5) : `rgba(245,235,225,${Math.min(1, p.t * 1.5)})`;
    ctx.fillText(p.text, p.x * tile, (p.y - (0.8 - p.t) * 0.8) * tile);
  });
  if (td.banner) drawBanner(ctx, td.banner, W, ry, tile * 0.75);
}
function drawTower(ctx, tw, tile, t, dt) {
  const spec = TOWERS[tw.type];
  const [ux, uy] = towerCenter(tw);
  const x = ux * tile, y = uy * tile, R = tile * (tw.evo ? 0.55 : 0.4);
  tw.kick = Math.max(0, (tw.kick || 0) - dt);
  const aim = tw.aim == null ? -Math.PI / 2 : tw.aim, back = tw.kick * tile * 0.4;
  if (tw.evo) {
    // A glowing two-tile plinth with a gold rim, and motes circling it.
    const c0 = Math.min(tw.c, tw.c2), r0 = Math.min(tw.r, tw.r2), cw = Math.abs(tw.c - tw.c2) + 1, rh = Math.abs(tw.r - tw.r2) + 1;
    ctx.save();
    ctx.shadowColor = spec.color; ctx.shadowBlur = tile * 0.4;
    ctx.fillStyle = '#3D2219'; ctx.beginPath(); ctx.roundRect(c0 * tile + 3, r0 * tile + 3, cw * tile - 6, rh * tile - 6, tile * 0.4); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#FFC46B'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(c0 * tile + 3, r0 * tile + 3, cw * tile - 6, rh * tile - 6, tile * 0.4); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const a = t * 1.5 + i * 2.09;
      ctx.fillStyle = hexA('#FFE08A', 0.8); ctx.beginPath(); ctx.arc(x + Math.cos(a) * tile * (cw > 1 ? 0.9 : 0.5), y + Math.sin(a) * tile * (rh > 1 ? 0.9 : 0.5), 2.2, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    // Rock base with a ring in the tower's colour.
    ctx.fillStyle = '#2E1A14'; ctx.beginPath(); ctx.arc(x, y + 2, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3D2219'; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexA(spec.color, 0.8); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, R - 1, 0, Math.PI * 2); ctx.stroke();
    // A gold star marks towers boosted by an evolved neighbour.
    if (nearEvolved(tw)) {
      ctx.fillStyle = '#FFC46B'; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 2.2 : 5; ctx.lineTo(x + R * 0.75 + Math.cos(a) * rr, y - R * 0.75 + Math.sin(a) * rr); }
      ctx.fill();
    }
  }
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = spec.color; ctx.strokeStyle = spec.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (tw.type) {
    case 'spout': // a nozzle that turns to follow its target
      ctx.rotate(aim); ctx.translate(-back, 0);
      ctx.beginPath(); ctx.roundRect(-R * 0.15, -R * 0.2, R * 0.95, R * 0.4, R * 0.15); ctx.fill();
      ctx.fillStyle = '#EFFFFB'; ctx.beginPath(); ctx.arc(R * 0.8, 0, R * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = spec.color; ctx.beginPath(); ctx.arc(0, 0, R * 0.42, 0, Math.PI * 2); ctx.fill();
      break;
    case 'pump': { // a coral head that pulses as it pumps
      const p = 1 + Math.sin(t * 4 + tw.c) * 0.06 + tw.kick;
      ctx.scale(p, p);
      for (let i = 0; i < 5; i++) { ctx.rotate(Math.PI * 2 / 5); ctx.beginPath(); ctx.ellipse(0, -R * 0.42, R * 0.17, R * 0.32, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#EFFFFB'; ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'cannon': // a fat barrel that kicks back
      ctx.rotate(aim); ctx.translate(-back, 0);
      ctx.beginPath(); ctx.roundRect(-R * 0.1, -R * 0.3, R * 0.95, R * 0.6, R * 0.2); ctx.fill();
      ctx.fillStyle = '#2B1640'; ctx.beginPath(); ctx.arc(R * 0.82, 0, R * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = spec.color; ctx.beginPath(); ctx.arc(0, 0, R * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(-R * 0.15, -R * 0.15, R * 0.2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'whale': { // a little whale that blows a plume when it fires
      const f = Math.cos(aim) < 0 ? -1 : 1;
      ctx.scale(f, 1);
      ctx.beginPath(); ctx.ellipse(0, R * 0.1, R * 0.62, R * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-R * 0.55, R * 0.1); ctx.lineTo(-R * 0.9, -R * 0.15); ctx.lineTo(-R * 0.85, R * 0.4); ctx.fill();
      ctx.fillStyle = '#0B1026'; ctx.beginPath(); ctx.arc(R * 0.3, 0, R * 0.08, 0, Math.PI * 2); ctx.fill();
      if (tw.kick > 0) { ctx.fillStyle = 'rgba(220,240,255,.85)'; ctx.beginPath(); ctx.arc(R * 0.1, -R * 0.55, R * 0.25 * (1 + tw.kick * 3), 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'eel': // a coiled eel, crackling
      ctx.lineWidth = R * 0.22;
      ctx.beginPath(); for (let i = 0; i <= 20; i++) { const a = i * 0.55, r = R * (0.12 + i * 0.028); i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.stroke();
      ctx.fillStyle = '#0B1026'; ctx.beginPath(); ctx.arc(Math.cos(11) * R * 0.68, Math.sin(11) * R * 0.68, R * 0.07, 0, Math.PI * 2); ctx.fill();
      if (Math.sin(t * 9 + tw.r) > 0.6) { ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-R * 0.2, -R * 0.75); ctx.lineTo(0, -R * 0.55); ctx.lineTo(R * 0.15, -R * 0.8); ctx.stroke(); }
      break;
    case 'frost': // a vent breathing cold mist
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.lineTo(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55); } ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#0B2A3A'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.35, Math.sin(a) * R * 0.35); ctx.lineTo(-Math.cos(a) * R * 0.35, -Math.sin(a) * R * 0.35); ctx.stroke(); }
      ctx.fillStyle = `rgba(200,255,255,${0.25 + 0.15 * Math.sin(t * 2 + tw.c)})`; ctx.beginPath(); ctx.arc(0, -R * 0.2, R * 0.75, 0, Math.PI * 2); ctx.fill();
      break;
    case 'clam': { // an open clam with a glowing pearl
      const open = 0.25 + 0.1 * Math.sin(t * 1.5 + tw.c);
      ctx.beginPath(); ctx.ellipse(0, R * 0.15, R * 0.65, R * 0.35, 0, 0, Math.PI); ctx.fill();
      ctx.save(); ctx.rotate(-open); ctx.beginPath(); ctx.ellipse(0, R * 0.1, R * 0.65, R * 0.35, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#FFF3F8'; ctx.shadowColor = '#FFFFFF'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(0, R * 0.05, R * 0.18, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      break;
    }
    default:
      ctx.fillRect(-R * 0.4, -R * 0.4, R * 0.8, R * 0.8);
  }
  ctx.restore();
  if (tw.off > 0) {
    ctx.fillStyle = 'rgba(40,40,46,.72)'; ctx.beginPath(); ctx.arc(x, y, R + 1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(220,220,230,.85)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, R + 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (tw.off / TD.blastSecs)); ctx.stroke();
    ctx.fillStyle = '#E6E6EE'; ctx.font = `800 ${Math.round(tile * 0.3)}px DM Sans, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.ceil(tw.off), x, y); ctx.textBaseline = 'alphabetic';
  }
  // Level pips along the bottom of the base.
  for (let i = 0; i < tw.lvl; i++) {
    const a = Math.PI / 2 + (i - (tw.lvl - 1) / 2) * 0.42;
    ctx.fillStyle = '#FFC46B'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * R, y + Math.sin(a) * R, tile * 0.055, 0, Math.PI * 2); ctx.fill();
  }
}
// Fire creatures: a flickering flame with little eyes, shaped by kind.
function drawFire(ctx, f, tile) {
  const k = FIRE_KINDS[f.kind];
  const x = f.x * tile, y = (f.y - (f.lift || 0)) * tile, s = tile * k.size * (0.93 + 0.07 * Math.sin(f.flick));
  const hot = f.hurt > 0;
  ctx.save();
  if (f.lift) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, f.y * tile + s * 0.5, s * 0.6, s * 0.2, 0, 0, Math.PI * 2); ctx.fill(); }
  const glow = ctx.createRadialGradient(x, y, 0, x, y, s * 2);
  const gc = f.kind === 'pearl' ? '255,143,208' : f.kind === 'chest' ? '255,224,138' : f.kind === 'magma' ? '255,90,30' : '255,150,60';
  glow.addColorStop(0, `rgba(${gc},.4)`); glow.addColorStop(1, `rgba(${gc},0)`);
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, s * 2, 0, Math.PI * 2); ctx.fill();
  const flame = (cx, cy, r, c0, c1, c2) => {
    const g = ctx.createRadialGradient(cx, cy + r * 0.35, 1, cx, cy, r * 1.3);
    g.addColorStop(0, hot ? '#FFFFFF' : c0); g.addColorStop(0.45, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 1.35 - Math.sin(f.flick * 1.3) * r * 0.15);
    ctx.bezierCurveTo(cx + r * 0.6, cy - r * 0.6, cx + r * 1.05, cy + r * 0.1, cx + r * 0.8, cy + r * 0.6);
    ctx.quadraticCurveTo(cx, cy + r * 1.25, cx - r * 0.8, cy + r * 0.6);
    ctx.bezierCurveTo(cx - r * 1.05, cy + r * 0.1, cx - r * 0.6, cy - r * 0.6, cx, cy - r * 1.35 + Math.sin(f.flick) * r * 0.1);
    ctx.fill();
  };
  const eyes = (cx, cy, r, c = '#3A0D04') => { ctx.fillStyle = c; [-1, 1].forEach((d) => { ctx.beginPath(); ctx.ellipse(cx + d * r * 0.32, cy, r * 0.11, r * 0.16, 0, 0, Math.PI * 2); ctx.fill(); }); };
  switch (f.kind) {
    case 'pearl': { // a glowing pearl in an open shell
      ctx.fillStyle = hot ? '#FFFFFF' : '#C77DB0';
      ctx.beginPath(); ctx.ellipse(x, y + s * 0.45, s * 1.1, s * 0.45, 0, 0, Math.PI); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y - s * 0.1, s * 1.05, s * 0.5, -0.25, Math.PI, Math.PI * 2); ctx.fill();
      const pg = ctx.createRadialGradient(x - s * 0.2, y - s * 0.1, 1, x, y + s * 0.1, s * 0.65);
      pg.addColorStop(0, '#FFFFFF'); pg.addColorStop(0.6, '#FFE3F3'); pg.addColorStop(1, '#FF8FD0');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(x, y + s * 0.15, s * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(f.flick * 0.6)})`; ctx.beginPath(); ctx.arc(x - s * 0.22, y - s * 0.05, s * 0.14, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'chest': { // a treasure chest with gold trim, bobbing along
      const bob = Math.sin(f.flick * 0.5) * s * 0.1;
      ctx.fillStyle = hot ? '#FFFFFF' : '#7A4A22'; ctx.fillRect(x - s, y - s * 0.35 + bob, s * 2, s * 1.05);
      ctx.fillStyle = hot ? '#FFFFFF' : '#9A6230'; ctx.beginPath(); ctx.ellipse(x, y - s * 0.35 + bob, s, s * 0.5, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#FFC46B';
      ctx.fillRect(x - s, y - s * 0.4 + bob, s * 2, s * 0.14);
      ctx.fillRect(x - s * 0.72, y - s * 0.8 + bob, s * 0.14, s * 1.5); ctx.fillRect(x + s * 0.58, y - s * 0.8 + bob, s * 0.14, s * 1.5);
      ctx.fillStyle = '#FFF3B0'; ctx.fillRect(x - s * 0.16, y - s * 0.3 + bob, s * 0.32, s * 0.38);
      break;
    }
    case 'spark': { // a spinning four-point spark
      ctx.translate(x, y); ctx.rotate(f.flick * 0.5);
      ctx.fillStyle = hot ? '#FFFFFF' : '#FFE16B';
      ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? s * 0.35 : s * 1.2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#FFFBE0'; ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'magma': // a slow crusted blob with glowing cracks
      ctx.fillStyle = hot ? '#FFD0B0' : '#4A1A0E'; ctx.beginPath(); ctx.ellipse(x, y + s * 0.1, s * 1.05, s * 0.9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,${120 + 60 * Math.sin(f.flick * 0.5)},40,.95)`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - s * 0.6, y - s * 0.2); ctx.lineTo(x - s * 0.1, y + s * 0.1); ctx.lineTo(x + s * 0.2, y - s * 0.4); ctx.moveTo(x - s * 0.1, y + s * 0.1); ctx.lineTo(x + s * 0.1, y + s * 0.6); ctx.moveTo(x + s * 0.3, y + s * 0.1); ctx.lineTo(x + s * 0.75, y + s * 0.25); ctx.stroke();
      eyes(x, y - s * 0.1, s * 1.5, '#FFB060');
      break;
    case 'cinder': { // an ember with flapping wings
      const flap = Math.sin(f.flick * 1.6) * s * 0.5;
      ctx.fillStyle = hot ? '#FFFFFF' : '#3A1208';
      [-1, 1].forEach((d) => { ctx.beginPath(); ctx.moveTo(x + d * s * 0.3, y); ctx.lineTo(x + d * s * 1.5, y - s * 0.4 - flap); ctx.lineTo(x + d * s * 1.1, y + s * 0.3); ctx.closePath(); ctx.fill(); });
      ctx.strokeStyle = '#FF7A3A'; ctx.lineWidth = 1.2;
      [-1, 1].forEach((d) => { ctx.beginPath(); ctx.moveTo(x + d * s * 0.3, y); ctx.lineTo(x + d * s * 1.5, y - s * 0.4 - flap); ctx.stroke(); });
      flame(x, y, s * 0.75, '#FFF3B0', '#FF7A3A', 'rgba(255,74,42,0)');
      eyes(x, y + s * 0.1, s);
      break;
    }
    case 'inferno': // a big three-tongued blaze
      flame(x - s * 0.45, y + s * 0.15, s * 0.6, '#FFF3B0', '#FF4A2A', 'rgba(200,30,10,0)');
      flame(x + s * 0.45, y + s * 0.15, s * 0.6, '#FFF3B0', '#FF4A2A', 'rgba(200,30,10,0)');
      flame(x, y, s * 0.85, '#FFFBE0', '#FF6A2A', 'rgba(220,40,10,0)');
      ctx.fillStyle = '#3A0D04';
      [-1, 1].forEach((d) => { ctx.beginPath(); ctx.moveTo(x + d * s * 0.12, y + s * 0.02); ctx.lineTo(x + d * s * 0.45, y - s * 0.12); ctx.lineTo(x + d * s * 0.42, y + s * 0.12); ctx.closePath(); ctx.fill(); });
      break;
    default:
      flame(x, y, s, '#FFF3B0', '#FF9A5C', 'rgba(255,74,42,0)');
      eyes(x, y + s * 0.15, s);
  }
  ctx.restore();
  const blast = FIRE_KINDS[f.kind].blast;
  if (blast) {
    const ready = !(tdState().blastCd > 0);
    ctx.save();
    ctx.setLineDash([4, 5]); ctx.lineDashOffset = -f.flick * 2;
    ctx.strokeStyle = ready ? 'rgba(210,210,220,.55)' : 'rgba(210,210,220,.18)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, f.y * tile, blast * tile, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  if (f.slow > 0 || f.chill > 0) { ctx.strokeStyle = f.chill > 0 ? 'rgba(200,255,255,.9)' : 'rgba(92,242,214,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, s * 1.15, 0, Math.PI * 2); ctx.stroke(); }
  hpBar(ctx, x, y - s * 1.5 - 5, Math.max(tile * 0.5, s * 2), f.hp / f.max, f.boss ? '#E58BFF' : '#6FE3A5');
}
// A burning supply crate sinking from the surface.
function drawCrate(ctx, c, tile, t) {
  const x = c.x * tile, y = c.y * tile, s = tile * 0.36;
  const halo = ctx.createRadialGradient(x, y, s * 0.4, x, y, s * 2.4);
  halo.addColorStop(0, 'rgba(255,224,138,.35)'); halo.addColorStop(1, 'rgba(255,224,138,0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, s * 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(c.t * 1.3) * 0.15);
  ctx.fillStyle = c.hurt > 0 ? '#FFFFFF' : '#8A5A2B'; ctx.fillRect(-s, -s * 0.8, s * 2, s * 1.6);
  ctx.strokeStyle = '#5A3518'; ctx.lineWidth = 2;
  ctx.strokeRect(-s, -s * 0.8, s * 2, s * 1.6);
  ctx.beginPath(); ctx.moveTo(-s, -s * 0.8); ctx.lineTo(s, s * 0.8); ctx.moveTo(s, -s * 0.8); ctx.lineTo(-s, s * 0.8); ctx.stroke();
  ctx.fillStyle = '#FFC46B'; ctx.fillRect(-s * 0.18, -s * 0.25, s * 0.36, s * 0.5);
  // Little flames licking the lid.
  [-0.55, 0, 0.55].forEach((d, i) => {
    const h = s * (0.5 + 0.2 * Math.sin(t * 9 + i * 2));
    ctx.fillStyle = i === 1 ? '#FFE16B' : '#FF7A3A';
    ctx.beginPath(); ctx.moveTo(d * s - s * 0.2, -s * 0.8); ctx.quadraticCurveTo(d * s, -s * 0.8 - h * 1.6, d * s + s * 0.2, -s * 0.8); ctx.fill();
  });
  ctx.restore();
  hpBar(ctx, x, y - s * 2, tile * 0.8, c.hp / c.max, '#FFE08A');
}
// Tapping the map: hit the crate if you tapped it, else select a tile (or clear).
$('td').addEventListener('click', (ev) => {
  const { tile } = tdCanvas();
  const rect = $('td').getBoundingClientRect();
  const fx = (ev.clientX - rect.left) / tile, fy = (ev.clientY - rect.top) / tile;
  const td = tdState();
  if (td.crate && Math.hypot(fx - td.crate.x, fy - td.crate.y) < 0.7) {
    td.crate.hp -= td.crate.max * CRATE.tap;
    td.crate.hurt = 0.12;
    td.shots.push({ kind: 'splash', x: td.crate.x, y: td.crate.y, t: 0.35 });
    Sound.tap();
    if (td.crate.hp <= 0) salvageCrate(td);
    return;
  }
  const c = Math.floor(fx), r = Math.floor(fy);
  const same = td.sel && td.sel.c === c && td.sel.r === r;
  if (same || r >= TD.rows || c < 0 || c >= TD.cols || TD_CELLS.has(c + ',' + r)) td.sel = null;
  else { td.sel = { c, r }; Sound.click(); }
  ui.emberDirty = true;
  updateUI();
});
// The build / upgrade menu pops up on the map beside the tile you tapped.
function renderTdPanel() {
  const td = tdState();
  $('tdPanel').innerHTML = `<span class="sub">${S.ember.log || 'Tap a dark tile beside the lava to build a tower. Fires that reach your reef burn it.'}</span>`;
  const pop = $('tdPop');
  if (!td.sel) { pop.hidden = true; return; }
  const t = towerAt(td.sel.c, td.sel.r);
  if (!t) {
    pop.innerHTML = '<div class="row"><b>Build a tower</b><button type="button" class="td-x" data-close aria-label="Close">×</button></div><div class="tower-opts">' + loadout().map((k) => {
      const s = TOWERS[k];
      return `<button type="button" class="tower-opt" data-build="${k}" style="--tc:${s.color}"><i></i><b>${s.short}</b><span>${s.desc}</span><span class="tcost" data-cost="${k}"></span></button>`;
    }).join('') + '</div>';
  } else {
    const spec = TOWERS[t.type];
    const maxed = t.lvl >= TD_MAX_LVL - 1;
    pop.innerHTML = `<div class="row"><b style="color:${spec.color}">${towerName(t)}${t.evo ? ' · Evolved' : ' · Lv ' + (t.lvl + 1)}</b><button type="button" class="td-x" data-close aria-label="Close">×</button></div>
      <span class="small muted">${t.off > 0 ? 'Greyed out by a blast · ' : ''}${t.type === 'clam' ? 'Boosts towers beside it' : fmt(towerDmg(t)) + ' damage · every ' + towerRate(t).toFixed(2) + 's · reach ' + towerRange(t).toFixed(1)}${t.evo ? ' · towers touching it get +25% damage' : nearEvolved(t) ? ' · boosted' : ''}</span>
      <div class="two">${t.evo ? '<button type="button" class="btn small-btn ember-btn" disabled>Evolved</button>'
        : maxed ? '<button type="button" class="btn small-btn evo-btn" id="tEvo">Evolve…</button>'
        : `<button type="button" class="btn small-btn ember-btn" id="tUp">Upgrade · ${fmt(towerCost(t.type, t.lvl + 1))}</button>`}
      <button type="button" class="btn small-btn" id="tSell">Sell · +${fmt(sellValue(t))}</button></div>`;
  }
  pop.hidden = false;
  // Above the tile in the lower half of the map, below it in the upper half.
  const { tile } = tdCanvas();
  const cv = $('td');
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const left = Math.max(4, Math.min(cv.offsetLeft + (td.sel.c + 0.5) * tile - pw / 2, cv.offsetLeft + cv.offsetWidth - pw - 4));
  const top = td.sel.r >= TD.rows / 2 ? cv.offsetTop + td.sel.r * tile - ph - 6 : cv.offsetTop + (td.sel.r + 1) * tile + 6;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
}
$('tdPop').addEventListener('click', (ev) => {
  const td = tdState();
  if (ev.target.closest('[data-close]')) { td.sel = null; ui.emberDirty = true; updateUI(); return; }
  const build = ev.target.closest('[data-build]');
  if (build && td.sel) {
    const cost = towerCost(build.dataset.build);
    if (S.lumen < cost) return;
    S.lumen -= cost;
    S.ember.towers.push({ c: td.sel.c, r: td.sel.r, type: build.dataset.build, lvl: 0, cd: 0 });
    Sound.buy();
  }
  const t = td.sel && towerAt(td.sel.c, td.sel.r);
  if (t && ev.target.closest('#tUp')) {
    const cost = towerCost(t.type, t.lvl + 1);
    if (S.lumen < cost || t.lvl >= TD_MAX_LVL - 1) return;
    S.lumen -= cost; t.lvl += 1; Sound.milestone();
  }
  if (t && ev.target.closest('#tEvo')) { Sound.click(); openEvo(t); return; }
  if (t && ev.target.closest('#tSell')) {
    S.lumen += sellValue(t);
    S.ember.towers = S.ember.towers.filter((x) => x !== t);
    td.sel = null; Sound.click();
  }
  ui.emberDirty = true;
  save();
  updateUI();
});
// The evolution wheel, paid in Ember Pearls that grow with your progress: a spin costs
// half of what the current wave pays (an Extra spin makes the next one free), and landing
// on Evolve costs three waves' worth. You need both to spin, so a win is always paid for.
// Each outcome is split into two slices around the wheel.
const EVO_OUTCOMES = {
  evolve: { label: 'Evolve', color: '#6FE3A5', weight: 30 },
  extra: { label: 'Extra spin', color: '#6FB8FF', weight: 15 },
  safe: { label: 'No luck, but safe', color: '#B5C2DA', weight: 25 },
  unlucky: { label: 'Unlucky: Lv 1', color: '#FF6B6B', weight: 28 },
  random: { label: 'Randomiser', color: '#FFC46B', weight: 2 },
};
// The Randomiser gets one thin slice; it evolves the tower into a different tower's form.
const EVO_ORDER = ['evolve', 'safe', 'unlucky', 'extra', 'random', 'evolve', 'safe', 'unlucky', 'extra'];
function evoSlices() {
  let a = 0;
  return EVO_ORDER.map((k) => {
    const span = EVO_OUTCOMES[k].weight * 3.6 / EVO_ORDER.filter((x) => x === k).length;
    const sl = { k, start: a, span };
    a += span;
    return sl;
  });
}
const evoSpinCost = () => Math.ceil(pearlsPerWave(S.ember.wave) * 0.5);
const evoFee = () => Math.ceil(pearlsPerWave(S.ember.wave) * 3);
const evoNeed = (t) => (evoFree(t) ? 0 : evoSpinCost()) + evoFee();
const evoFree = (t) => ui.evoFree === t;
function openEvo(t) {
  ui.evoTower = t;
  const spot = evoSpot(t);
  const where = spot && (spot.c > t.c ? 'to its right' : spot.c < t.c ? 'to its left' : spot.r > t.r ? 'below it' : 'above it');
  $('evTitle').textContent = 'Evolve ' + TOWERS[t.type].name + '?';
  $('evNow').textContent = spot
    ? `Success makes it a ${EVO_NAMES[t.type]}: ×${EVO.dmg} damage, faster, longer reach, and every tower touching it gets +25% damage. It grows into the tile ${where}${spot.eats ? ', swallowing the ' + towerName(spot.eats) + ' there (no refund)' : ''}.`
    : 'No room to grow: every tile beside it is lava, the edge, or another evolved tower.';
  const pt = (deg, r) => { const q = (deg - 90) * Math.PI / 180; return [Math.cos(q) * r, Math.sin(q) * r]; };
  $('evSvg').innerHTML = evoSlices().map((sl) => {
    const [x1, y1] = pt(sl.start, 96), [x2, y2] = pt(sl.start + sl.span, 96);
    return `<path d="M0 0 L${x1} ${y1} A96 96 0 0 1 ${x2} ${y2} Z" fill="${EVO_OUTCOMES[sl.k].color}" stroke="#0B1026" stroke-width="1.5"/>`;
  }).join('') + '<circle r="14" fill="#0B1026" stroke="#FFC46B" stroke-width="3"/>';
  $('evLegend').innerHTML = Object.values(EVO_OUTCOMES).map((o) => `<span class="wkey"><i style="background:${o.color}"></i><b>${o.label}</b><span>${o.weight}%</span></span>`).join('');
  $('evResult').textContent = '';
  $('evResult').className = 'center strong';
  $('evo').hidden = false;
  syncEvo();
}
// Spin button: its price (or "Free spin"), and hidden once the tower evolved or dropped.
function syncEvo() {
  const t = ui.evoTower;
  const over = !t || !S.ember.towers.includes(t) || t.evo || t.lvl < TD_MAX_LVL - 1;
  $('evSpin').hidden = over && !ui.evoSpinning;
  if (over) return;
  $('evSpin').textContent = (evoFree(t) ? 'Free spin' : 'Spin · ' + fmt(evoSpinCost()) + ' Pearls');
  $('evSpin').disabled = ui.evoSpinning || !evoSpot(t) || S.pearls < evoNeed(t);
  $('evCost').textContent = S.pearls < evoNeed(t)
    ? `You need ${fmt(evoNeed(t))} Ember Pearls to spin (you have ${fmt(S.pearls)}): the spin, plus ${fmt(evoFee())} to evolve if it lands.`
    : `Evolving costs ${fmt(evoFee())} Ember Pearls if it lands. You have ${fmt(S.pearls)}.`;
}
$('evSpin').addEventListener('click', () => {
  const t = ui.evoTower;
  if (!t || ui.evoSpinning || !S.ember.towers.includes(t) || t.evo || !evoSpot(t)) return;
  const wasFree = evoFree(t);
  if (S.pearls < evoNeed(t)) return;
  if (wasFree) ui.evoFree = null; else S.pearls -= evoSpinCost();
  let r = Math.random() * 100, out = 'evolve';
  for (const [k, o] of Object.entries(EVO_OUTCOMES)) { if ((r -= o.weight) < 0) { out = k; break; } }
  const slices = evoSlices();
  const mine = slices.filter((sl) => sl.k === out);
  const sl = mine[Math.floor(Math.random() * mine.length)];
  // Turn the wheel so the chosen slice stops under the pointer at the top.
  const land = sl.start + sl.span * (0.2 + Math.random() * 0.6);
  const from = ui.evoAngle || 0;
  ui.evoAngle = Math.ceil(from / 360) * 360 + 5 * 360 + (360 - land);
  ui.evoSpinning = true;
  $('evResult').textContent = 'Spinning…';
  $('evResult').className = 'center strong';
  syncEvo();
  Sound.seed();
  spinWheel($('evSvg'), from, ui.evoAngle, 4000, slices.map((x) => x.start)).then(() => {
    ui.evoSpinning = false;
    resolveEvo(t, out);
  });
});
function resolveEvo(t, out) {
  const td = tdState();
  const spot = S.ember.towers.includes(t) && evoSpot(t);
  if (!S.ember.towers.includes(t)) {
    $('evResult').textContent = 'The tower is gone.';
  } else if ((out === 'evolve' || out === 'random') && spot) {
    if (spot.eats) S.ember.towers = S.ember.towers.filter((x) => x !== spot.eats);
    const was = TOWERS[t.type].name;
    if (out === 'random') { const others = Object.keys(TOWERS).filter((k) => k !== t.type); t.type = others[Math.floor(Math.random() * others.length)]; }
    const fee = Math.min(S.pearls, evoFee());
    S.pearls -= fee;
    t.evo = true; t.c2 = spot.c; t.r2 = spot.r;
    const [x, y] = towerCenter(t);
    td.shots.push({ kind: 'sparkle', x, y, t: 0.5, color: '#FFE08A' });
    $('evResult').textContent = (out === 'random' ? `Randomiser! It became a ${EVO_NAMES[t.type]} instead` : `It evolved into a ${EVO_NAMES[t.type]}!`) + ` (−${fmt(fee)} Pearls)`;
    $('evResult').className = 'center strong win';
    S.ember.log = `Your ${was} ${out === 'random' ? 'was randomised into' : 'evolved into'} a ${EVO_NAMES[t.type]}${spot.eats ? ', swallowing a ' + towerName(spot.eats) : ''}.`;
    td.sel = null;
    Sound.milestone();
  } else if (out === 'extra') {
    ui.evoFree = t;
    $('evResult').textContent = 'Extra spin! Your next spin is free.';
    $('evResult').className = 'center strong win';
    Sound.perk();
  } else if (out === 'unlucky') {
    t.lvl = 0;
    $('evResult').textContent = 'Unlucky: back to Lv 1.';
    S.ember.log = `The ${TOWERS[t.type].name}'s evolution went wrong: it's back to Lv 1.`;
    td.sel = null;
    Sound.descend();
  } else {
    $('evResult').textContent = 'No luck, but safe: it keeps Lv 5.';
    Sound.click();
  }
  ui.emberDirty = true;
  save();
  updateUI();
  syncEvo();
}
// Close any time to get back to the game; a spin still in motion finishes and pays out.
$('evClose').addEventListener('click', () => { $('evo').hidden = true; });
$('eStart').addEventListener('click', startWave);
$('eAuto').addEventListener('click', () => {
  S.ember.auto = !S.ember.auto;
  Sound.click(); save(); updateUI();
});
$('eFast').addEventListener('click', () => {
  const i = TD_SPEEDS.indexOf(tdSpeed());
  S.ember.speed = TD_SPEEDS[(i + 1) % TD_SPEEDS.length];
  delete S.ember.fast;
  Sound.click(); save(); updateUI();
});
function updateEmber() {
  const e = S.ember;
  const td = tdState();
  $('eAsh').textContent = fmt(S.lumen);
  $('eRate').textContent = '+' + fmt(e.ashRate) + ' Ash per second';
  $('ePearl').textContent = 'Ember Pearls: ' + fmt(S.pearls);
  $('eWave').textContent = 'Wave ' + e.wave + ' · best ' + e.best;
  const shiftAt = Math.ceil(e.wave / TD.shiftEvery) * TD.shiftEvery;
  const shiftSoon = shiftAt > (e.pathAt || 0) && shiftAt - e.wave <= 2;
  $('eLine').textContent = td.bonus ? `Bonus wave · ${td.queue.length + td.fires.length} loot left` : td.bonusNext ? 'Bonus wave next!'
    : e.shiftPending ? 'The lava is about to shift!' : shiftSoon ? `Lava shifts after wave ${shiftAt}!`
    : (td.running ? `${td.queue.length + td.fires.length} fires · ` : 'Wave pays ') + `+${fmt(pearlsPerWave(e.wave))} Pearls`;
  $('eHp').textContent = `Reef ${Math.max(0, e.hp)}/${emberMaxHp()}`;
  $('eStart').disabled = td.running || tideFull();
  $('eAuto').textContent = e.auto ? 'Auto waves: on' : 'Auto waves: off';
  $('eAuto').setAttribute('aria-pressed', String(e.auto));
  $('eFast').textContent = tdSpeed() + '×';
  $('eFast').setAttribute('aria-pressed', String(tdSpeed() > 1));
  if (ui.emberDirty) { renderTdPanel(); ui.emberDirty = false; }
  if (!$('evo').hidden) syncEvo();
  document.querySelectorAll('[data-cost]').forEach((el) => {
    const cost = towerCost(el.dataset.cost);
    el.textContent = fmt(cost) + ' Ash';
    el.closest('button').disabled = S.lumen < cost;
  });
  const up = $('tUp'), sel = td.sel && towerAt(td.sel.c, td.sel.r);
  if (up && sel && sel.lvl < TD_MAX_LVL - 1) up.disabled = S.lumen < towerCost(sel.type, sel.lvl + 1);
}
// Second tab in the Ember Wastes: pick 3 tower types, then buy tower upgrades with Ash.
function buildTowerGuide(list) {
  const lo = loadout();
  const head = document.createElement('div');
  head.className = 'row';
  head.innerHTML = `<b>Your towers · pick ${LOADOUT_SIZE}</b><span class="small muted">${lo.length}/${LOADOUT_SIZE} chosen · tap to swap</span>`;
  list.appendChild(head);
  const grid = document.createElement('div');
  grid.className = 'loadout';
  grid.innerHTML = Object.keys(TOWERS).map((k) => {
    const s = TOWERS[k], on = lo.includes(k), open = towerUnlocked(k);
    return `<button type="button" class="lo-card${on ? ' on' : ''}" data-lo="${k}" aria-pressed="${on}" ${open ? '' : 'disabled'} style="--tc:${s.color}">
      <b>${s.name}</b><span>${open ? s.desc : 'Unlocks at best wave ' + s.unlock}</span>${open && s.dmg ? `<span class="small muted">Dmg ${s.dmg} · range ${s.range} · ${s.rate}s</span>` : ''}</button>`;
  }).join('');
  list.appendChild(grid);
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lo]');
    if (b) toggleLoadout(b.dataset.lo);
  });
  const up = document.createElement('div');
  up.className = 'row';
  up.innerHTML = '<b>Tower upgrades</b><span class="small muted">Bought with Ash, kept</span>';
  list.appendChild(up);
  ui.emberRows = EMBER_UPS.map((u) => {
    const row = document.createElement('div');
    row.className = 'crow';
    row.innerHTML = `<div class="sw" style="background:#FF9A5C"></div>
      <div class="meta"><div class="nm"><b>${u.name}</b><span></span></div><div class="pk">${u.desc}</div></div>
      <button type="button" class="buy"><span class="m">Upgrade</span><span class="k"></span></button>`;
    const btn = row.querySelector('.buy');
    btn.addEventListener('click', () => buyEmberUp(u));
    list.appendChild(row);
    return { u, row, btn, lv: row.querySelector('.nm span'), k: btn.querySelector('.k') };
  });
}
function toggleLoadout(k) {
  const lo = loadout();
  if (!towerUnlocked(k)) return;
  // Built towers of a type you drop are refunded in full.
  const drop = (d) => {
    S.ember.towers.filter((t) => t.type === d).forEach((t) => { for (let l = 0; l <= t.lvl; l++) S.lumen += towerCost(t.type, l); });
    S.ember.towers = S.ember.towers.filter((t) => t.type !== d);
  };
  if (lo.includes(k)) {
    if (lo.length <= 1) return;
    drop(k);
    S.ember.loadout = lo.filter((x) => x !== k);
  } else if (lo.length >= LOADOUT_SIZE) {
    // Full loadout: the new pick swaps out your oldest one.
    drop(lo[0]);
    S.ember.loadout = lo.slice(1).concat([k]);
  } else {
    S.ember.loadout = lo.concat([k]);
  }
  tdState().sel = null;
  Sound.click();
  ui.emberDirty = true;
  ui.builtKey = '';
  save();
  updateUI();
}
function updateEmberUps() {
  (ui.emberRows || []).forEach(({ u, btn, lv, k }) => {
    const r = eUp(u.id), maxed = u.max && r >= u.max;
    lv.textContent = 'Rank ' + r + (u.max ? '/' + u.max : '');
    k.textContent = maxed ? 'Maxed' : fmt(emberUpCost(u)) + ' Ash';
    btn.disabled = maxed || S.lumen < emberUpCost(u);
  });
}
function buyEmberUp(u) {
  const r = eUp(u.id);
  if ((u.max && r >= u.max) || S.lumen < emberUpCost(u)) return;
  S.lumen -= emberUpCost(u);
  S.ember.up = { ...(S.ember.up || {}), [u.id]: r + 1 };
  if (u.id === 'wall') S.ember.hp += 5;
  const row = ui.emberRows.find((x) => x.u === u);
  if (row) { restartClass(row.row, 'lvlup'); floatText(row.row, 'Rank ' + (r + 1), false); }
  Sound.buy();
  save();
  updateUI();
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
  ui.arena = null;
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
  { id: 'uprising', title: 'The trench rises', when: () => S.ascent >= 1,
    text: "You put down the towers and let the fire guide you up.\n\nThe divers are still in the trench, and this time you swim with the fish. Every diver you drive out is a shell, a fin, an eye that gets to stay where it belongs." },
  { id: 'unbloom', title: 'Unmaking the bloom', when: () => S.ascent >= 2,
    text: "The forest is still choked with the bloom you grew.\n\nNo more merging. Pull it apart, plant by plant, until the water runs clear again. It will try to creep back. Keep going." },
  { id: 'end', title: 'Choose', when: () => S.ascent >= 3,
    text: "You're back in the Shallows, and the water is dark and quiet again. The sea has shown you what it was before you, and what it fought to become again.\n\nYou can keep the light low, or let the tide run backwards and start over, growing gently this time, knowing what it costs.\n\nEither way, I'll be here. I always am." },
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
  if (S.ascent >= 3 && !visiting() && !S.demoDone && !ui.washing && !ui.endingOpen
    && $('modal').hidden && !nextChapter()) showEnding();
}
function showEnding() {
  ui.endingOpen = true;
  const stats = [
    ['Tides called', fmtInt(S.tides)], ['Depth Marks', S.depthMarks], ['Zones climbed', S.ascent || 0],
    ['Best Trench stage', stageLabel()], ['Best fire wave', S.ember.best],
    ['Pets hatched', S.pets.length], ['Gear found', S.gear.items.length],
    ['Lumen ever made', fmt(S.totalEarned)], ['Bloom Stars', S.stars || 0],
  ];
  $('endStats').innerHTML = stats.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
  $('endText').textContent = storyActive()
    ? 'This time you remembered. The light, the bloom, the divers: you saw what every spark cost the sea, and that the fire was only the sea trying to heal.'
    : 'You grew a reef from a single spark, all the way down to the Ember Wastes, then climbed back up: driving out the divers, unmaking the bloom, and home to the Shallows.';
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
  autoOpenChests();
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
  $('tideDot').hidden = isEmber() || pearlGain() < 1;
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
  // Ask for the next frame first, so one bad frame can't stop the game.
  requestAnimationFrame(frame);
  const dt = Math.min(1, (now - last) / 1000);
  last = now;
  if (!tideFull()) earn(ratePerSec() * dt);

  if (zone().id === 'trench') {
    S.light = 1; // the old dimming-light rule was replaced by the battler
  }
  if (isKelp()) gardenTick(Date.now());
  if (isTrench()) {
    for (let left = dt; left > 0; left -= 0.05) arenaTick(Math.min(0.05, left));
    if (ui.tab === 'reef') drawArena();
  }
  if (isEmber()) {
    // Small fixed steps keep fast fires from skipping past towers on a slow frame.
    for (let left = dt * tdSpeed(); left > 0; left -= 0.05) emberTick(Math.min(0.05, left));
    if (ui.tab === 'reef') drawTD(dt);
  }

  while (S.revealed < CREATURES.length && S.tideEarned >= CREATURES[S.revealed].cost * 0.4) { S.revealed++; renderCollection(); }

  uiAcc += dt; saveAcc += dt;
  if (uiAcc > 0.1) { uiAcc = 0; updateUI(); }
  if (saveAcc > 5) { saveAcc = 0; save(); }
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
S.opts = Object.assign(freshState().opts, S.opts);
syncSettings();
applyZone();
switchTab('reef'); // open on this zone's own home screen, not the Shallows reef
renderFish();
growCoral();
offlineCatchUp();
if (S.resetNote) {
  delete S.resetNote;
  save();
  showModal({
    title: 'Deep Bloom Demo v1',
    body: 'The game has been rebuilt for Demo v1, so everyone starts fresh from the Shallows. Your settings were kept. Have fun diving!',
    ok: 'Dive in',
    cancel: null,
  });
}
updateUI();
requestAnimationFrame(frame);
