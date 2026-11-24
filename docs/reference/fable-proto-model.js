// THROWAWAY PROTOTYPE of the Stage 1 brief (model section only). Used to check that the
// acceptance ranges in tests/scenarios.mjs are reachable. Not the implementation.
const STAGES = { WAKE: 0, REM: 1, N1: 2, N2: 3, N3: 4 };

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

class ScientificConstants {
  static interp(val, kf) {
    if (val <= kf[0][0]) return kf[0][1];
    if (val >= kf[kf.length - 1][0]) return kf[kf.length - 1][1];
    for (let i = 0; i < kf.length - 1; i++) {
      const [a1, v1] = kf[i], [a2, v2] = kf[i + 1];
      if (val >= a1 && val <= a2) return v1 + ((val - a1) / (a2 - a1)) * (v2 - v1);
    }
  }
  static getAgeProfile(age, gender = 'male') {
    const I = ScientificConstants.interp;
    const K = ScientificConstants.KEYFRAMES;
    const p = {};
    for (const k of Object.keys(K)) p[k] = I(age, K[k]);
    const k = clamp((age - 30) / 40, 0, 1);
    if (gender === 'male') { p.n3 *= 1 - 0.30 * k; p.n1 += 1.0 * k; }
    else { p.n3 *= 1 + 0.15 * k; p.n1 -= 0.5 * k; }
    return p;
  }
}
ScientificConstants.KEYFRAMES = {
  tst: [[0, 510], [1, 630], [3, 630], [5, 620], [8, 585], [10, 570], [12, 550], [14, 510], [16, 480], [18, 455], [25, 440], [40, 420], [60, 395], [70, 380], [80, 360], [90, 345], [100, 335]],
  nap: [[0, 390], [1, 150], [2, 105], [3, 60], [4, 30], [5, 0], [100, 0]],
  sol: [[0, 8], [3, 15], [10, 17], [18, 15], [35, 14], [50, 15.5], [65, 18], [80, 21], [100, 24]],
  waso: [[0, 60], [1, 25], [5, 20], [16, 20], [25, 25], [42, 40], [57, 55], [72, 70], [80, 85], [90, 100], [100, 110]],
  n1: [[0, 0], [1, 5], [10, 5], [18, 5.5], [25, 6], [42, 8], [57, 9], [72, 10], [80, 11], [100, 13]],
  n3: [[0, 0], [1, 28], [5, 30], [10, 27], [16, 22], [25, 21], [40, 19], [60, 16], [80, 13], [100, 11]],
  rem: [[0, 45], [1, 30], [3, 25], [5, 22], [10, 21], [18, 20], [40, 19.5], [60, 18.5], [80, 17.5], [100, 16.5]],
  bedtime: [[0, 120], [3, 105], [6, 120], [8, 150], [10, 180], [12, 210], [14, 255], [16, 315], [19, 375], [22, 345], [25, 315], [30, 300], [60, 285], [70, 265], [80, 240], [100, 225]],
  cycleLen: [[0, 55], [2, 70], [6, 85], [12, 90], [18, 95], [100, 95]],
  firstCycleLen: [[0, 55], [1, 70], [3, 100], [6, 125], [10, 130], [16, 105], [18, 95], [100, 95]],
};

class HypnogramGenerator {
  generate(config) {
    const age = clamp(+config.age || 0, 0, 100);
    const gender = config.gender === 'female' ? 'female' : 'male';
    const alcohol = clamp(+config.alcohol || 0, 0, 6);
    const caffeine = clamp(+config.caffeine || 0, 0, 6);
    const caffeineTime = clamp(+config.caffeineTime || 0, 0, 12);
    const nocturia = clamp(Math.round(+config.nocturia || 0), 0, 5);
    const sdb = clamp((+config.sdbSeverity || 0) / 10, 0, 1);
    const chronotype = config.chronotype || 'normal';
    const jetLag = config.jetLag || 'none';
    const meno = !!config.isMenopausal && gender === 'female' && age >= 40 && age <= 60;
    const infant = age < 1;
    const rng = mulberry32(config.seed === undefined ? 20261124 : config.seed);

    const p = ScientificConstants.getAgeProfile(age, gender);
    let { tst, sol, n1, n3, rem } = p;
    const groups = [{ min: p.waso, zone: 'any', per: 9 }];
    let truncate = 0, remCut = 0, firstCycleAdd = 0, r3 = age < 12 ? 0.7 : 0.55, bedShift = 0, clockShift = 0;
    let q0 = 1, q1 = 1;

    // caffeine
    const halfLife = { fast: 3.5, normal: 5, slow: 8 }[config.caffeineMetabolism] || 5;
    const load = caffeine * Math.pow(0.5, caffeineTime / halfLife);
    const f = 1 - Math.exp(-Math.max(0, load - 0.3) / 1.2);
    if (f > 0) { tst -= 70 * f; sol += 20 * f; groups.push({ min: 25 * f, zone: 'any', per: 8 }); n3 -= 3 * f; n1 += 3 * f; }
    // alcohol
    if (alcohol > 0) {
      sol -= 1.0 * alcohol; tst -= 3 * alcohol; groups.push({ min: Math.min(40, 5 * alcohol), zone: 'late', per: 7 });
      remCut = 6.5 * alcohol; firstCycleAdd = 4.8 * alcohol; r3 = Math.max(0.35, r3 - 0.04 * alcohol);
      q0 = Math.max(0.2, 1 - 0.2 * alcohol); q1 = Math.max(0.5, 1 - 0.1 * alcohol);
    }
    if (config.blueLight) { sol += 8; tst -= 5; clockShift += 20; }
    if (config.socialJetLag) { bedShift += 60; sol += 15; truncate += 75; clockShift += 120; }
    const JL = { east_mild: [15, 30, 5, 'any', 180], east_severe: [45, 90, 20, 'any', 480], west_mild: [-3, 30, 10, 'last3', -180], west_severe: [-6, 75, 30, 'last3', -480] }[jetLag];
    if (JL) { sol += JL[0]; truncate += JL[1]; groups.push({ min: JL[2], zone: JL[3], per: 8 }); clockShift += JL[4]; }
    if (meno) { sol += 5; n1 += 1.5; groups.push({ min: 20, zone: 'any', per: 5 }); }
    if (sdb > 0) { n1 += 16 * sdb; n3 *= 1 - 0.5 * sdb; rem *= 1 - 0.2 * sdb; tst -= 15 * sdb; sol -= 3 * sdb; groups.push({ min: 35 * sdb, zone: 'any', per: 5 }); }

    sol = Math.max(infant ? 3 : 5, sol);
    n1 = Math.max(0, n1); n3 = Math.max(infant ? 0 : 1, n3);
    const finalT = Math.max(150, tst - truncate);
    const fullT = finalT + truncate;

    // ---- stage minutes for the untruncated night
    let N3m = (n3 / 100) * fullT;
    let REMm = Math.max(0.5 * (rem / 100) * fullT, (rem / 100) * fullT - remCut);
    let N1m = (n1 / 100) * fullT;

    // ---- cycle lengths
    const Lc = p.cycleLen;
    const L = [];
    let L0 = Math.min(fullT, p.firstCycleLen + firstCycleAdd);
    let remaining = fullT - L0;
    const nFull = Math.floor(remaining / Lc);
    const frac = remaining / Lc - nFull;
    const nRound = Math.round(remaining / Lc);
    let partial = false;
    if (remaining < 0.35 * Lc) { L.push(fullT); }
    else {
      L.push(L0);
      if (nRound >= 1 && Math.abs(remaining / nRound - Lc) <= 0.12 * Lc) { for (let i = 0; i < nRound; i++) L.push(remaining / nRound); }
      else { for (let i = 0; i < nFull; i++) L.push(Lc); L.push(frac * Lc); partial = true; }
    }
    const nC = L.length;

    // ---- distribute stages over cycles
    const dist = (total, weights, caps) => {
      const out = new Array(nC).fill(0);
      let left = total;
      for (let pass = 0; pass < 4 && left > 1e-6; pass++) {
        const open = weights.map((w, i) => (out[i] < caps[i] - 1e-9 ? w : 0));
        const sw = open.reduce((a, b) => a + b, 0);
        if (sw <= 0) break;
        let used = 0;
        for (let i = 0; i < nC; i++) { const add = Math.min(caps[i] - out[i], (left * open[i]) / sw); out[i] += add; used += add; }
        left -= used;
      }
      return out;
    };
    let n3c, remc;
    if (infant) {
      n3c = new Array(nC).fill(0);
      remc = L.map((l) => l * (REMm / fullT));
    } else {
      const w3 = L.map((_, i) => (partial && i === nC - 1 ? 0 : Math.pow(r3, i)));
      n3c = dist(N3m, w3, L.map((l) => 0.55 * l));
      const wr = L.map((l, i) => (1 + 0.6 * Math.min(i, 4)) * (l / Lc) * (i === 0 ? q0 : i === 1 ? q1 : 1));
      remc = dist(REMm, wr, L.map((l, i) => (partial && i === nC - 1 ? 0.6 : 0.45) * l));
    }
    const nBoutsEst = groups.reduce((s, g) => s + (g.min >= 3 ? clamp(Math.round(g.min / g.per), 1, 10) : 0), 0) + nocturia;
    const onsetN1 = infant ? 0 : clamp(0.25 * N1m, Math.min(2, N1m), 8);
    const n1Pool = Math.max(0, N1m - onsetN1 - 2 * nBoutsEst);

    // ---- sleep-only segment list
    const seg = [];
    const push = (stage, d) => { if (d > 0.01) seg.push({ stage, d }); };
    const n2WithIntrusions = (n2, intr) => {
      const k = intr > 0.2 ? Math.max(1, Math.ceil(intr / 4)) : 0;
      if (k === 0 || n2 < 2 * (k + 1)) { push(STAGES.N2, n2); push(STAGES.N1, intr); return; }
      for (let j = 0; j <= k; j++) { push(STAGES.N2, n2 / (k + 1)); if (j < k) push(STAGES.N1, intr / k); }
    };
    for (let i = 0; i < nC; i++) {
      if (infant) { push(STAGES.REM, remc[i]); push(STAGES.N2, L[i] - remc[i]); continue; }
      const n1i = n1Pool * (L[i] / fullT);
      const post = Math.min(3, n1i), intr = n1i - post;
      const on = i === 0 ? onsetN1 : 0;
      let n2 = L[i] - n3c[i] - remc[i] - n1i - on;
      if (n2 < 6) { const need = 6 - n2, tot = n3c[i] + remc[i]; if (tot > need) { n3c[i] -= need * n3c[i] / tot; remc[i] -= need * remc[i] / tot; n2 = 6; } else n2 = Math.max(0, n2); }
      push(STAGES.N1, on);
      if (n3c[i] > 1) { push(STAGES.N2, n2 * 0.35); push(STAGES.N3, n3c[i]); n2WithIntrusions(n2 * 0.65, intr); }
      else { n2WithIntrusions(n2 + n3c[i], intr); }
      push(STAGES.REM, remc[i]);
      push(STAGES.N1, post);
    }
    // ---- truncate the tail (alarm / early final awakening)
    let acc = 0; const cutSeg = [];
    for (const s of seg) { if (acc >= finalT - 1e-9) break; const d = Math.min(s.d, finalT - acc); cutSeg.push({ stage: s.stage, d }); acc += d; }
    const T = acc;

    // ---- wake bouts on the sleep-time axis
    let bouts = [];
    for (const g of groups) {
      if (g.min < 3) continue;
      const B = clamp(Math.round(g.min / g.per), 1, 10);
      const w = Array.from({ length: B }, () => 0.5 + rng());
      const sw = w.reduce((a, b) => a + b, 0);
      for (let j = 0; j < B; j++) {
        const u = rng();
        const pos = g.zone === 'late' ? T * (0.5 + 0.5 * u) : g.zone === 'last3' ? T * (0.67 + 0.33 * u) : T * Math.pow(u, 0.75);
        bouts.push({ pos, d: (g.min * w[j]) / sw });
      }
    }
    for (let k = 0; k < nocturia; k++) bouts.push({ pos: 90 + (Math.max(60, T - 120)) * (k + 0.5 + (rng() - 0.5) * 0.4) / nocturia, d: 10 });
    if (infant) { bouts = [0, 1, 2].map((k) => ({ pos: T * (k + 1) / 4 + (rng() - 0.5) * 20, d: p.waso / 3 })); }
    bouts.forEach((b) => { b.pos = clamp(b.pos, 15, T - 10); });
    bouts.sort((a, b) => a.pos - b.pos);
    // keep bouts out of N3: move to the end of that N3 segment
    const bounds = []; { let t = 0; for (const s of cutSeg) { bounds.push([t, t + s.d, s.stage]); t += s.d; } }
    for (const b of bouts) { const hit = bounds.find((x) => b.pos >= x[0] && b.pos < x[1]); if (hit && hit[2] === STAGES.N3) b.pos = Math.min(T - 10, hit[1] + 0.001); }
    bouts.sort((a, b) => a.pos - b.pos);
    for (let i = 1; i < bouts.length; i++) if (bouts[i].pos - bouts[i - 1].pos < 8) bouts[i].pos = bouts[i - 1].pos + 8;
    bouts = bouts.filter((b) => b.pos <= T - 5);

    // ---- assemble blocks
    const bedtime = p.bedtime + ({ lark: -75, owl: 90 }[chronotype] || 0) * clamp((age - 2) / 8, 0, 1) + bedShift;
    const blocks = [];
    let t = bedtime;
    const add = (stage, d) => {
      if (d <= 0.01) return;
      const last = blocks[blocks.length - 1];
      if (last && last.stage === stage) last.duration += d; else blocks.push({ stage, duration: d, start: t });
      t += d;
    };
    add(STAGES.WAKE, sol);
    let sleepT = 0, bi = 0, reentry = 0, bridge = 0;
    for (const s of cutSeg) {
      let left = s.d;
      while (left > 1e-9) {
        if (reentry > 0) { const r = Math.min(reentry, left); add(STAGES.N1, r); left -= r; sleepT += r; reentry -= r; if (s.stage === STAGES.N3) bridge = 3; continue; }
        if (bridge > 0 && s.stage === STAGES.N3) { const r = Math.min(bridge, left); add(STAGES.N2, r); left -= r; sleepT += r; bridge -= r; continue; }
        const nextB = bi < bouts.length ? bouts[bi].pos : Infinity;
        const run = Math.min(left, Math.max(0, nextB - sleepT));
        add(s.stage, run); left -= run; sleepT += run;
        if (bi < bouts.length && sleepT >= bouts[bi].pos - 1e-9) { add(STAGES.WAKE, bouts[bi].d); bi++; reentry = infant ? 0 : 2; }
      }
    }
    // ---- stats measured from blocks
    const stats = HypnogramGenerator.measure(blocks);
    stats.sleepPer24h = stats.tst + p.nap;
    stats.napMins = p.nap;
    // arousal ticks (never inside wake blocks)
    const nTicks = Math.round((stats.tst / 60) * (1 + age / 40)) + Math.round(60 * sdb);
    const sleepBlocks = blocks.filter((b) => b.stage !== STAGES.WAKE && b.duration > 2);
    const wakeEvents = [];
    for (let i = 0; i < nTicks && sleepBlocks.length; i++) { const b = sleepBlocks[Math.floor(rng() * sleepBlocks.length)]; wakeEvents.push({ time: b.start + rng() * b.duration, duration: 0.5 }); }
    return {
      blocks, wakeEvents,
      params: { chronotype, bedtime, startTimeOffset: bedtime - 240, tst: stats.tst, tib: stats.tib, clockShift, infant },
      stats,
    };
  }
  static measure(blocks) {
    const W = STAGES.WAKE;
    const t0 = blocks[0].start, last = blocks[blocks.length - 1];
    const tib = last.start + last.duration - t0;
    const m = [0, 0, 0, 0, 0];
    blocks.forEach((b) => { m[b.stage] += b.duration; });
    const tst = tib - m[W];
    const first = blocks.find((b) => b.stage !== W);
    const latency = first.start - t0;
    const firstRem = blocks.find((b) => b.stage === STAGES.REM);
    return {
      tst, tib, latency, wasoMins: m[W] - latency, sleepEfficiency: (tst / tib) * 100,
      n1P: m[STAGES.N1] / tst, n2P: m[STAGES.N2] / tst, n3P: m[STAGES.N3] / tst, remP: m[STAGES.REM] / tst,
      remLatency: firstRem ? firstRem.start - first.start : null,
    };
  }
}
class TwoProcessModel { }

// --- APP LOGIC ---
