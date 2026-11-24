#!/usr/bin/env node
/**
 * Sleep Age Simulator - scenario harness.
 *
 * Loads the model section of app.js (everything above the "// --- APP LOGIC ---"
 * marker) into a vm sandbox with no DOM, runs a fixed list of scenarios with
 * N seeds each, and reports metrics computed FROM THE BLOCKS the generator
 * returns (never from the target stats the UI prints).
 *
 * Usage:
 *   node tests/scenarios.mjs              table of all scenarios
 *   node tests/scenarios.mjs --json       machine readable
 *   node tests/scenarios.mjs --check      also run the Stage 1 acceptance ranges, exit 1 on failure
 *   node tests/scenarios.mjs --seeds 50   change the number of seeds (default 20)
 *   node tests/scenarios.mjs --only "35 M"  substring filter on the scenario name
 *   node tests/scenarios.mjs --app path/to/other.js   test another file that has the same marker
 *
 * Randomness: Math.random inside the sandbox is replaced by a seeded mulberry32,
 * and the seed is also passed as config.seed so a generator with its own seeded
 * RNG gets the same seed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const MARKER = '// --- APP LOGIC ---';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const APP = opt('--app', null) || join(here, '..', 'app.js');
const SEEDS = parseInt(opt('--seeds', '20'), 10);
const ONLY = opt('--only', null);

// ---------------------------------------------------------------- load model
const src = readFileSync(APP, 'utf8');
const cut = src.indexOf(MARKER);
if (cut < 0) { console.error(`Marker "${MARKER}" not found in app.js`); process.exit(2); }
const modelSrc = src.slice(0, cut) +
  '\n;globalThis.__model = { STAGES, ScientificConstants, HypnogramGenerator,' +
  ' TwoProcessModel: (typeof TwoProcessModel !== "undefined" ? TwoProcessModel : null) };';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sandboxMath = Object.create(Math);
let rng = mulberry32(1);
sandboxMath.random = () => rng();
const ctx = vm.createContext({ Math: sandboxMath, console });
vm.runInContext(modelSrc, ctx, { filename: 'app.js(model)' });
const { STAGES, HypnogramGenerator } = ctx.__model;
const W = STAGES.WAKE, REM = STAGES.REM, N1 = STAGES.N1, N2 = STAGES.N2, N3 = STAGES.N3;

// ---------------------------------------------------------------- scenarios
const base = {
  gender: 'male', age: 25, jetLag: 'none', socialJetLag: false, sdbSeverity: 0,
  isMenopausal: false, chronotype: 'normal', alcohol: 0, caffeine: 0, caffeineTime: 0,
  caffeineMetabolism: 'normal', nocturia: 0, blueLight: false,
};
const S = (name, over) => ({ name, config: { ...base, ...over } });

const scenarios = [
  S('newborn 0', { age: 0 }),
  S('child 8', { age: 8 }),
  S('teen 16 owl', { age: 16, chronotype: 'owl' }),
  S('25 M healthy', { age: 25 }),
  S('25 F healthy', { age: 25, gender: 'female' }),
  S('35 M', { age: 35 }),
  S('35 M SDB 10', { age: 35, sdbSeverity: 10 }),
  S('52 F', { age: 52, gender: 'female' }),
  S('52 F perimenopause', { age: 52, gender: 'female', isMenopausal: true }),
  S('65 F', { age: 65, gender: 'female' }),
  S('80 M', { age: 80 }),
  S('80 M nocturia 3', { age: 80, nocturia: 3 }),
  S('25 M 3 drinks', { age: 25, alcohol: 3 }),
];
for (const t of [0, 6, 10]) for (const m of ['slow', 'normal', 'fast'])
  scenarios.push(S(`25 M 2 coffees ${t}h ${m}`, { caffeine: 2, caffeineTime: t, caffeineMetabolism: m }));
scenarios.push(
  S('25 M blue light', { blueLight: true }),
  S('25 M social jet lag', { socialJetLag: true }),
  S('25 M jet lag east severe', { jetLag: 'east_severe' }),
  S('25 M jet lag west severe', { jetLag: 'west_severe' }),
  S('EXTREME stack 80 M', {
    age: 80, sdbSeverity: 10, alcohol: 4, caffeine: 4, caffeineTime: 0, nocturia: 4,
    blueLight: true, socialJetLag: true,
  }),
  S('EXTREME max everything 100 F', {
    age: 100, gender: 'female', sdbSeverity: 10, alcohol: 10, caffeine: 10, caffeineTime: 0,
    caffeineMetabolism: 'slow', nocturia: 10, blueLight: true, socialJetLag: true, chronotype: 'owl',
  }),
);

// ---------------------------------------------------------------- metrics
const EPS = 1e-6;
const clock = (m) => { // model minute 0 = 18:00
  let t = ((18 * 60 + m) % 1440 + 1440) % 1440;
  const h = Math.floor(t / 60), mm = Math.round(t % 60);
  return `${String(mm === 60 ? (h + 1) % 24 : h).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`;
};

function measure(result) {
  const issues = [];
  const blocks = result.blocks;
  if (!Array.isArray(blocks) || blocks.length === 0) return { issues: ['no blocks'] };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!Number.isFinite(b.start) || !Number.isFinite(b.duration)) issues.push(`NaN/inf in block ${i}`);
    if (b.duration < -EPS) issues.push(`negative duration block ${i} (${b.duration.toFixed(2)})`);
    if (i > 0) {
      const gap = b.start - (blocks[i - 1].start + blocks[i - 1].duration);
      if (Math.abs(gap) > 0.01) issues.push(`gap/overlap ${gap.toFixed(2)} min before block ${i}`);
    }
  }
  const real = blocks.filter((b) => b.duration > EPS);
  const t0 = blocks[0].start;
  const tEnd = blocks[blocks.length - 1].start + blocks[blocks.length - 1].duration;
  const tib = tEnd - t0;

  const firstSleepIdx = real.findIndex((b) => b.stage !== W);
  if (firstSleepIdx < 0) return { issues: [...issues, 'no sleep at all'], tib };
  const onset = real[firstSleepIdx].start;
  let lastSleepIdx = real.length - 1;
  while (real[lastSleepIdx].stage === W) lastSleepIdx--;
  const finalWake = real[lastSleepIdx].start + real[lastSleepIdx].duration;

  const mins = { [W]: 0, [REM]: 0, [N1]: 0, [N2]: 0, [N3]: 0 };
  for (const b of real) mins[b.stage] += b.duration;
  const tst = mins[REM] + mins[N1] + mins[N2] + mins[N3];
  const sol = onset - t0;
  const waso = real.slice(firstSleepIdx).filter((b) => b.stage === W).reduce((s, b) => s + b.duration, 0);
  const trailingWake = tEnd - finalWake;
  const spt = finalWake - onset; // sleep period time

  // REM episodes: REM blocks, merging pieces separated by under 15 min of non-REM
  const remBlocks = real.filter((b) => b.stage === REM && b.duration >= 0.5);
  const episodes = [];
  for (const b of remBlocks) {
    const last = episodes[episodes.length - 1];
    if (last && b.start - last.end < 15) { last.end = b.start + b.duration; last.dur += b.duration; }
    else episodes.push({ start: b.start, end: b.start + b.duration, dur: b.duration });
  }
  const remLat = episodes.length ? episodes[0].start - onset : NaN;
  const firstRem = episodes.length ? episodes[0].dur : NaN;
  const lastRem = episodes.length ? episodes[episodes.length - 1].dur : NaN;
  const cycleLens = [];
  for (let i = 1; i < episodes.length; i++) cycleLens.push(episodes[i].end - episodes[i - 1].end);
  const meanCycle = cycleLens.length ? cycleLens.reduce((a, b) => a + b, 0) / cycleLens.length : NaN;

  // share of a stage that falls in the first half of the sleep period
  const mid = onset + spt / 2;
  const firstHalfShare = (stage) => {
    let a = 0, tot = 0;
    for (const b of real) {
      if (b.stage !== stage) continue;
      tot += b.duration;
      const e = b.start + b.duration;
      a += Math.max(0, Math.min(e, mid) - b.start);
    }
    return tot > 0 ? (a / tot) * 100 : NaN;
  };

  // wake bouts after sleep onset, and how many illegal direct transitions exist
  let wakeBouts = 0;
  for (let i = firstSleepIdx + 1; i < real.length; i++) if (real[i].stage === W && real[i - 1].stage !== W) wakeBouts++;
  let wakeToDeep = 0, n3ToRem = 0;
  for (let i = 1; i < real.length; i++) {
    if (real[i - 1].stage === W && (real[i].stage === N3)) wakeToDeep++;
    if (real[i - 1].stage === N3 && real[i].stage === REM) n3ToRem++;
  }
  const firstSleepStage = real[firstSleepIdx].stage;

  const pct = (x) => (tst > 0 ? (x / tst) * 100 : NaN);
  const sum = pct(mins[N1]) + pct(mins[N2]) + pct(mins[N3]) + pct(mins[REM]);
  if (Math.abs(sum - 100) > 0.01) issues.push(`stage % sum ${sum.toFixed(2)}`);
  if (tst > tib + EPS) issues.push('TST > TIB');
  if (Math.abs(sol + tst + waso - tib) > 0.01) issues.push('SOL+TST+WASO != TIB');
  if (tst <= 0) issues.push('TST <= 0');

  // what the UI would print (target stats) versus what was drawn
  const st = result.stats || {};
  const shown = {
    n3: st.n3P * 100, rem: st.remP * 100, n1: st.n1P * 100, n2: st.n2P * 100,
    waso: st.wasoMins, tst: st.tst, tib: st.tib, se: st.sleepEfficiency, sol: st.latency,
  };
  for (const [k, v] of Object.entries(shown)) if (v !== undefined && !Number.isFinite(v)) issues.push(`stats.${k} not finite`);

  return {
    issues, tib, tst, sol, waso, se: (tst / tib) * 100, spt,
    n1: pct(mins[N1]), n2: pct(mins[N2]), n3: pct(mins[N3]), rem: pct(mins[REM]),
    n3min: mins[N3], remmin: mins[REM],
    remLat, cycles: episodes.length, meanCycle, firstRem, lastRem,
    n3FirstHalf: firstHalfShare(N3), remFirstHalf: firstHalfShare(REM),
    wakeBouts, trailingWake, wakeToDeep, n3ToRem, firstSleepStage,
    bed: t0, up: tEnd, shown,
  };
}

// ---------------------------------------------------------------- run
const mean = (a) => { const f = a.filter(Number.isFinite); return f.length ? f.reduce((x, y) => x + y, 0) / f.length : NaN; };
const sd = (a) => { const f = a.filter(Number.isFinite); if (f.length < 2) return 0; const m = mean(f); return Math.sqrt(f.reduce((s, x) => s + (x - m) ** 2, 0) / (f.length - 1)); };

const KEYS = ['tib', 'tst', 'se', 'sol', 'waso', 'n1', 'n2', 'n3', 'rem', 'n3min', 'remmin', 'remLat', 'cycles',
  'meanCycle', 'firstRem', 'lastRem', 'n3FirstHalf', 'remFirstHalf', 'wakeBouts', 'trailingWake',
  'wakeToDeep', 'n3ToRem', 'bed', 'up'];

const out = [];
for (const sc of scenarios) {
  if (ONLY && !sc.name.includes(ONLY)) continue;
  const runs = [];
  const issues = new Set();
  let identical = true, firstSig = null;
  for (let seed = 1; seed <= SEEDS; seed++) {
    rng = mulberry32(seed * 7919);
    let res;
    try {
      const gen = new HypnogramGenerator();
      res = vm.runInContext('(g, c) => g.generate(c)', ctx, { timeout: 5000 })(gen, { ...sc.config, seed });
    } catch (e) {
      issues.add(`THROW/TIMEOUT: ${e.message}`);
      continue;
    }
    const m = measure(res);
    m.issues.forEach((i) => issues.add(i));
    if (m.tst !== undefined) runs.push(m);
    const sig = JSON.stringify(res.blocks.map((b) => [b.stage, +b.start.toFixed(3), +b.duration.toFixed(3)]));
    if (firstSig === null) firstSig = sig; else if (sig !== firstSig) identical = false;
  }
  // determinism for one seed: same seed twice must give the same blocks
  let deterministic = true;
  try {
    const sigs = [0, 1].map(() => {
      rng = mulberry32(12345);
      const r = new HypnogramGenerator().generate({ ...sc.config, seed: 12345 });
      return JSON.stringify(r.blocks.map((b) => [b.stage, b.start, b.duration]));
    });
    deterministic = sigs[0] === sigs[1];
  } catch { deterministic = false; }

  const row = { name: sc.name, config: sc.config, n: runs.length, issues: [...issues], seedsIdentical: identical, deterministic };
  for (const k of KEYS) { row[k] = mean(runs.map((r) => r[k])); row[k + '_sd'] = sd(runs.map((r) => r[k])); }
  row.shown = {};
  if (runs.length) for (const k of Object.keys(runs[0].shown)) row.shown[k] = mean(runs.map((r) => r.shown[k]));
  row.firstSleepStage = runs.length ? runs[0].firstSleepStage : null;
  out.push(row);
}

// ---------------------------------------------------------------- acceptance ranges (post Stage 1 targets)
// [metric, min, max]. Means over the seeds must fall inside. See docs/stage1-review.md section F.
const ADULT_SHAPE = [['remLat', 60, 120], ['meanCycle', 80, 115], ['n3FirstHalf', 65, 100], ['remFirstHalf', 15, 45], ['wakeToDeep', 0, 0], ['n3ToRem', 0, 0], ['trailingWake', 0, 0]];
const ACCEPT = {
  'newborn 0': [['tst', 480, 600], ['rem', 40, 55], ['n1', 0, 0], ['se', 75, 92], ['wakeBouts', 2, 6], ['meanCycle', 45, 65], ['remLat', 0, 20]],
  'child 8': [['tst', 560, 630], ['n3', 22, 30], ['rem', 18, 24], ['n1', 3, 8], ['se', 90, 97], ['sol', 10, 25], ['waso', 5, 30], ['remLat', 100, 140], ['wakeToDeep', 0, 0], ['trailingWake', 0, 0]],
  'teen 16 owl': [['tst', 450, 520], ['n3', 17, 24], ['rem', 19, 24], ['se', 88, 96]],
  '25 M healthy': [['tst', 420, 465], ['tib', 455, 500], ['se', 88, 95], ['sol', 8, 20], ['waso', 15, 35], ['n1', 4, 9], ['n2', 45, 56], ['n3', 16, 23], ['rem', 19, 24], ['cycles', 4, 5.5], ...ADULT_SHAPE],
  '25 F healthy': [['tst', 420, 470], ['se', 88, 95], ['n3', 17, 25], ['rem', 19, 24], ...ADULT_SHAPE],
  '35 M': [['tst', 405, 450], ['se', 86, 94], ['waso', 20, 45], ['n3', 13, 20], ['rem', 19, 23], ...ADULT_SHAPE],
  '35 M SDB 10': [['tst', 360, 420], ['se', 72, 86], ['waso', 50, 100], ['n1', 15, 30], ['n3', 4, 12], ['rem', 12, 19], ['wakeBouts', 6, 16], ['wakeToDeep', 0, 0], ['trailingWake', 0, 0]],
  '52 F': [['tst', 385, 430], ['se', 82, 91], ['waso', 35, 65], ['n3', 14, 21], ['rem', 18, 23]],
  '52 F perimenopause': [['tst', 370, 420], ['se', 78, 89], ['waso', 45, 85], ['n3', 13, 21], ['rem', 17, 23], ['sol', 12, 30]],
  '65 F': [['tst', 365, 410], ['se', 78, 88], ['waso', 50, 85], ['n3', 12, 20], ['rem', 17, 22], ['n1', 6, 12]],
  '80 M': [['tst', 330, 385], ['se', 70, 82], ['waso', 75, 120], ['n1', 9, 16], ['n3', 4, 11], ['rem', 15, 21], ['sol', 15, 30], ['wakeBouts', 5, 12], ['wakeToDeep', 0, 0], ['trailingWake', 0, 0]],
  '80 M nocturia 3': [['tst', 310, 375], ['se', 65, 80], ['waso', 95, 150], ['wakeBouts', 6, 16], ['wakeToDeep', 0, 0], ['trailingWake', 0, 0]],
  '25 M 3 drinks': [['tst', 400, 465], ['sol', 8, 14], ['waso', 25, 60], ['rem', 13, 18], ['remLat', 95, 140], ['n3', 16, 25], ['n3FirstHalf', 75, 100], ['firstRem', 1, 7]],
  '25 M 2 coffees 0h normal': [['tst', 375, 430], ['sol', 15, 35], ['n3', 12, 20], ['se', 80, 91]],
  '25 M 2 coffees 6h normal': [['tst', 395, 450], ['sol', 10, 25], ['se', 84, 93]],
  '25 M 2 coffees 10h normal': [['tst', 410, 465], ['sol', 8, 22], ['se', 86, 95]],
  '25 M blue light': [['tst', 410, 465], ['sol', 12, 30], ['n3', 15, 23], ['rem', 18, 24], ['se', 86, 94]],
  '25 M social jet lag': [['tst', 340, 400], ['se', 82, 92], ['sol', 20, 40], ['rem', 12, 19]],
  'EXTREME stack 80 M': [['tst', 150, 330], ['se', 35, 75], ['n1', 10, 40], ['rem', 0.5, 20], ['sol', 10, 90], ['wakeToDeep', 0, 0], ['trailingWake', 0, 0]],
  'EXTREME max everything 100 F': [['tst', 150, 330], ['se', 30, 75], ['sol', 10, 120], ['wakeToDeep', 0, 0], ['trailingWake', 0, 0]],
};

// ---------------------------------------------------------------- output
if (flag('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const f = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
  const pad = (s, n) => String(s).padEnd(n);
  const padl = (s, n) => String(s).padStart(n);
  console.log(`Sleep Age Simulator scenario harness - ${SEEDS} seeds per scenario, means (sd) from the generated blocks\n`);
  console.log('TABLE 1. Core metrics from blocks (min unless noted)');
  console.log(pad('scenario', 30) + ['TIB', 'TST', 'SE%', 'SOL', 'WASO', 'N1%', 'N2%', 'N3%', 'REM%', 'bed', 'up'].map((h) => padl(h, 7)).join(''));
  for (const r of out) {
    console.log(pad(r.name, 30) + [f(r.tib), f(r.tst), f(r.se, 1), f(r.sol), f(r.waso), f(r.n1, 1), f(r.n2, 1), f(r.n3, 1), f(r.rem, 1), clock(r.bed), clock(r.up)].map((v) => padl(v, 7)).join(''));
  }
  console.log('\nTABLE 2. Hypnogram shape');
  console.log(pad('scenario', 30) + ['REMlat', 'cycles', 'cycLen', 'REM1', 'REMlast', 'N3h1%', 'REMh1%', 'wakeN', 'endWk', 'W>N3', 'N3>R', '1st'].map((h) => padl(h, 8)).join(''));
  const stageName = { [W]: 'W', [REM]: 'REM', [N1]: 'N1', [N2]: 'N2', [N3]: 'N3' };
  for (const r of out) {
    console.log(pad(r.name, 30) + [f(r.remLat), f(r.cycles, 1), f(r.meanCycle), f(r.firstRem), f(r.lastRem), f(r.n3FirstHalf), f(r.remFirstHalf), f(r.wakeBouts, 1), f(r.trailingWake), f(r.wakeToDeep, 1), f(r.n3ToRem, 1), stageName[r.firstSleepStage] ?? '?'].map((v) => padl(v, 8)).join(''));
  }
  console.log('  REMlat = sleep onset to first REM; cycLen = mean REM-end to REM-end; N3h1%/REMh1% = share of that stage in the first half of the sleep period;');
  console.log('  wakeN = wake bouts after onset; endWk = wake minutes after the last sleep block; W>N3, N3>R = direct Wake->N3 and N3->REM transitions per night.');

  console.log('\nTABLE 3. What the UI prints (stats) versus what is drawn (blocks)');
  console.log(pad('scenario', 30) + ['N3 ui', 'N3 blk', 'REM ui', 'REM blk', 'N1 ui', 'N1 blk', 'N2 ui', 'N2 blk', 'WASOui', 'WASOblk', 'SD seeds'].map((h) => padl(h, 9)).join(''));
  for (const r of out) {
    console.log(pad(r.name, 30) + [f(r.shown.n3, 1), f(r.n3, 1), f(r.shown.rem, 1), f(r.rem, 1), f(r.shown.n1, 1), f(r.n1, 1), f(r.shown.n2, 1), f(r.n2, 1), f(r.shown.waso), f(r.waso), f(r.waso_sd, 1)].map((v) => padl(v, 9)).join(''));
  }
  console.log('  SD seeds = between-seed SD of block WASO (0 means every seed gives the same night).');

  console.log('\nTABLE 4. Sanity');
  for (const r of out) {
    const notes = [];
    if (!r.deterministic) notes.push('NOT deterministic for a fixed seed');
    if (r.seedsIdentical) notes.push('all seeds identical');
    notes.push(...r.issues);
    console.log(pad(r.name, 30) + (notes.length ? notes.join('; ') : 'ok'));
  }
  const a = out.find((r) => r.name === '25 M healthy'), e = out.find((r) => r.name === '25 M jet lag east severe'), w = out.find((r) => r.name === '25 M jet lag west severe');
  if (a && e && w) {
    const same = (x) => ['tib', 'tst', 'sol', 'bed', 'n3', 'rem'].every((k) => Math.abs(a[k] - x[k]) < 1e-9);
    console.log(`\nJet lag dropdown: east severe ${same(e) ? 'IDENTICAL to baseline (control is dead)' : 'differs from baseline'}; west severe ${same(w) ? 'IDENTICAL to baseline (control is dead)' : 'differs from baseline'}`);
  }
}

if (flag('--check')) {
  let fails = 0, checks = 0;
  console.log('\nACCEPTANCE CHECK (Stage 1 targets)');
  for (const r of out) {
    const rules = ACCEPT[r.name];
    if (r.issues.length) { fails++; console.log(`FAIL ${r.name}: sanity: ${r.issues.join('; ')}`); }
    if (!r.deterministic) { fails++; console.log(`FAIL ${r.name}: not deterministic for a fixed seed`); }
    if (!rules) continue;
    for (const [k, lo, hi] of rules) {
      checks++;
      const v = r[k];
      if (!(v >= lo - 1e-9 && v <= hi + 1e-9)) { fails++; console.log(`FAIL ${r.name}: ${k} = ${Number.isFinite(v) ? v.toFixed(1) : v} not in [${lo}, ${hi}]`); }
    }
    // UI must print what is drawn
    for (const [k, tol] of [['n3', 1], ['rem', 1], ['n1', 1], ['n2', 1]]) {
      checks++;
      if (!(Math.abs(r.shown[k] - r[k]) <= tol)) { fails++; console.log(`FAIL ${r.name}: UI ${k}% ${r.shown[k]?.toFixed?.(1)} vs drawn ${r[k].toFixed(1)}`); }
    }
    checks++;
    if (!(Math.abs(r.shown.waso - r.waso) <= 2)) { fails++; console.log(`FAIL ${r.name}: UI WASO ${r.shown.waso?.toFixed?.(0)} vs drawn ${r.waso.toFixed(0)}`); }
  }
  // cross-scenario monotonic checks
  const g = (n) => out.find((r) => r.name === n);
  const rel = (desc, ok) => { checks++; if (!ok) { fails++; console.log(`FAIL relation: ${desc}`); } };
  if (!ONLY) {
    const c = (t, m) => g(`25 M 2 coffees ${t}h ${m}`);
    rel('caffeine at 0h costs more TST than at 6h than at 10h (normal)', c(0, 'normal').tst < c(6, 'normal').tst && c(6, 'normal').tst <= c(10, 'normal').tst);
    rel('slow metaboliser loses more TST than fast at 6h', c(6, 'slow').tst < c(6, 'fast').tst);
    rel('caffeine at 10h costs a slow metaboliser between 5 and 30 min, and a fast metaboliser under 5', (() => { const s = g('25 M healthy').tst - c(10, 'slow').tst, f = g('25 M healthy').tst - c(10, 'fast').tst; return s >= 5 && s < 30 && f >= 0 && f < 5; })());
    rel('25 F has at least as much N3% as 25 M', g('25 F healthy').n3 >= g('25 M healthy').n3);
    rel('blue light costs under 20 min of TST', g('25 M healthy').tst - g('25 M blue light').tst < 20);
    rel('blue light adds under 15 min of latency', g('25 M blue light').sol - g('25 M healthy').sol < 15);
    rel('perimenopause adds 10 to 30 min WASO', (() => { const d = g('52 F perimenopause').waso - g('52 F').waso; return d >= 10 && d <= 30; })());
    rel('nocturia 3 adds 20 to 45 min WASO at 80', (() => { const d = g('80 M nocturia 3').waso - g('80 M').waso; return d >= 20 && d <= 45; })());
    rel('SDB 10 at 35 has less N3% and more N1% than 35 M', g('35 M SDB 10').n3 < g('35 M').n3 && g('35 M SDB 10').n1 > g('35 M').n1);
    rel('TST falls with age: 8 > 16 > 25 > 35 > 65 > 80', g('child 8').tst > g('teen 16 owl').tst && g('teen 16 owl').tst > g('25 M healthy').tst && g('25 M healthy').tst > g('35 M').tst && g('35 M').tst > g('65 F').tst && g('65 F').tst > g('80 M').tst);
    rel('jet lag east severe differs from baseline', Math.abs(g('25 M jet lag east severe').sol - g('25 M healthy').sol) > 5 || Math.abs(g('25 M jet lag east severe').tst - g('25 M healthy').tst) > 10);
    rel('jet lag west severe differs from baseline', Math.abs(g('25 M jet lag west severe').tst - g('25 M healthy').tst) > 10 || Math.abs(g('25 M jet lag west severe').waso - g('25 M healthy').waso) > 10);
    rel('teen 16 owl goes to bed after 23:30 (clock)', (() => { const b = g('teen 16 owl').bed; return b >= 330; })());
    rel('80 M goes to bed 45 to 90 min before 25 M', (() => { const d = g('25 M healthy').bed - g('80 M').bed; return d >= 45 && d <= 90; })());
  }
  console.log(`\n${checks} checks, ${fails} failures`);
  process.exit(fails ? 1 : 0);
}
