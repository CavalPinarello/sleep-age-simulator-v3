/**
 * Sleep Age Simulator v3
 *
 * The model section (everything above the APP LOGIC marker) has no DOM access.
 * tests/scenarios.mjs loads exactly that slice and checks it against the
 * Stage 1 acceptance ranges (docs/stage1-review.md, sections F and F9).
 *
 * Time axis: minutes after 18:00 on the evening the night starts.
 */

// --- MODELS ---

const STAGES = { WAKE: 0, REM: 1, N1: 2, N2: 3, N3: 4 };

// Seeded PRNG so the same settings always draw the same night.
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
    // Linear interpolation between [age, value] keyframes, clamped at both ends.
    static interp(val, kf) {
        if (val <= kf[0][0]) return kf[0][1];
        if (val >= kf[kf.length - 1][0]) return kf[kf.length - 1][1];
        for (let i = 0; i < kf.length - 1; i++) {
            const [a1, v1] = kf[i];
            const [a2, v2] = kf[i + 1];
            if (val >= a1 && val <= a2) return v1 + ((val - a1) / (a2 - a1)) * (v2 - v1);
        }
        return kf[kf.length - 1][1];
    }

    // Age profile (F2). Percentages are percent of TST; N2 is whatever is left.
    static getAgeProfile(age, gender = 'male') {
        const K = ScientificConstants.KEYFRAMES;
        const p = {};
        for (const key of Object.keys(K)) p[key] = ScientificConstants.interp(age, K[key]);
        // Sex: women keep more slow-wave sleep with age (Redline 2004, MrOS vs SOF).
        const k = clamp((age - 30) / 40, 0, 1);
        if (gender === 'male') { p.n3 *= 1 - 0.30 * k; p.n1 += 1.0 * k; }
        else { p.n3 *= 1 + 0.15 * k; p.n1 -= 0.5 * k; }
        return p;
    }

    // Chronotype offset in minutes, faded in between ages 2 and 10 (F3).
    static chronoOffset(age, chronotype) {
        const off = { lark: -75, owl: 90 }[chronotype] || 0;
        return off * clamp((age - 2) / 8, 0, 1);
    }

    // Bedtime for the age and chronotype, before any lifestyle shift.
    static habitualBedtime(age, chronotype) {
        return ScientificConstants.interp(age, ScientificConstants.KEYFRAMES.bedtime) +
            ScientificConstants.chronoOffset(age, chronotype);
    }

    // Middle of the NSF 2015 recommended range, in minutes. null for newborns.
    static recommendedWindow(age) {
        if (age < 1) return null;
        if (age < 3) return 11 * 60;
        if (age < 6) return 11.5 * 60;
        if (age < 14) return 10 * 60;
        if (age < 18) return 9 * 60;
        if (age < 65) return 8 * 60;
        return 7.5 * 60;
    }
}

ScientificConstants.KEYFRAMES = {
    // Night sleep, min. NSF 2015 for children, Boulos 2019 between first and later nights, MrOS/SOF at 82.
    tst: [[0, 510], [1, 630], [3, 630], [5, 620], [8, 585], [10, 570], [12, 550], [14, 510], [16, 480], [18, 455], [25, 440], [40, 420], [60, 395], [70, 380], [80, 360], [90, 345], [100, 335]],
    // Daytime sleep, min (NSF 24 h totals).
    nap: [[0, 390], [1, 150], [2, 105], [3, 60], [4, 30], [5, 0], [100, 0]],
    // Sleep onset latency, min (Boulos Table 3, paediatric meta-analysis).
    sol: [[0, 8], [3, 15], [10, 17], [18, 15], [35, 14], [50, 15.5], [65, 18], [80, 21], [100, 24]],
    // Wake after sleep onset, min (Boulos Table 2, +9.7 min per decade).
    waso: [[0, 60], [1, 25], [5, 20], [16, 20], [25, 25], [42, 40], [57, 55], [72, 70], [80, 85], [90, 100], [100, 110]],
    n1: [[0, 0], [1, 5], [10, 5], [18, 5.5], [25, 6], [42, 8], [57, 9], [72, 10], [80, 11], [100, 13]],
    n3: [[0, 0], [1, 28], [5, 30], [10, 27], [16, 22], [25, 21], [40, 19], [60, 16], [80, 13], [100, 11]],
    rem: [[0, 45], [1, 30], [3, 25], [5, 22], [10, 21], [18, 20], [40, 19.5], [60, 18.5], [80, 17.5], [100, 16.5]],
    // Minutes after 18:00 (Carskadon, Roenneberg 2004, older-adult advance of about 1 h).
    bedtime: [[0, 120], [3, 105], [6, 120], [8, 150], [10, 180], [12, 210], [14, 255], [16, 315], [19, 375], [22, 345], [25, 315], [30, 300], [60, 285], [70, 265], [80, 240], [100, 225]],
    cycleLen: [[0, 55], [2, 70], [6, 85], [12, 90], [18, 95], [100, 95]],
    firstCycleLen: [[0, 55], [1, 70], [3, 100], [6, 125], [10, 130], [16, 105], [18, 95], [100, 95]],
};

ScientificConstants.DEFAULT_SEED = 20261124;
ScientificConstants.CAFFEINE_HALF_LIFE = { fast: 3.5, normal: 5, slow: 8 };

class HypnogramGenerator {
    generate(config) {
        // ---- F1.3 inputs, clamped
        const age = clamp(+config.age || 0, 0, 100);
        const gender = config.gender === 'female' ? 'female' : 'male';
        const alcohol = clamp(+config.alcohol || 0, 0, 6);
        const caffeine = clamp(+config.caffeine || 0, 0, 6);
        const caffeineTime = clamp(+config.caffeineTime || 0, 0, 12);
        const nocturia = clamp(Math.round(+config.nocturia || 0), 0, 5);
        const sdb = clamp(+config.sdbSeverity || 0, 0, 10) / 10;
        const chronotype = config.chronotype || 'normal';
        const jetLag = config.jetLag || 'none';
        const meno = !!config.isMenopausal && gender === 'female' && age >= 40 && age <= 60;
        const infant = age < 1;
        const rng = mulberry32(config.seed === undefined ? ScientificConstants.DEFAULT_SEED : config.seed);

        // ---- F4 modifiers
        const p = ScientificConstants.getAgeProfile(age, gender);
        let { tst, sol, n1, n3, rem } = p;
        const groups = [{ min: p.waso, zone: 'any', per: 9 }];
        let truncate = 0, remCut = 0, firstCycleAdd = 0;
        let r3 = age < 12 ? 0.7 : 0.55;
        let q0 = 1, q1 = 1, bedShift = 0, clockShift = 0;

        // Caffeine: load still in the body at bedtime, saturating effect (Gardiner 2023, Drake 2013).
        const halfLife = ScientificConstants.CAFFEINE_HALF_LIFE[config.caffeineMetabolism] || 5;
        const load = caffeine * Math.pow(0.5, caffeineTime / halfLife);
        const f = 1 - Math.exp(-Math.max(0, load - 0.3) / 1.2);
        if (f > 0) {
            tst -= 70 * f; sol += 20 * f; n3 -= 3 * f; n1 += 3 * f;
            groups.push({ min: 25 * f, zone: 'any', per: 8 });
        }
        // Alcohol: REM taken from the first cycles, N3 shifted earlier, wake in the second half (Gardiner 2025, Ebrahim 2013).
        if (alcohol > 0) {
            sol -= 1.0 * alcohol; tst -= 3 * alcohol;
            groups.push({ min: Math.min(40, 5 * alcohol), zone: 'late', per: 7 });
            remCut = 6.5 * alcohol;
            firstCycleAdd = 4.8 * alcohol;
            r3 = Math.max(0.35, r3 - 0.04 * alcohol);
            q0 = Math.max(0.2, 1 - 0.2 * alcohol);
            q1 = Math.max(0.5, 1 - 0.1 * alcohol);
        }
        // Bright screen in the last hour: small latency and timing effect only (Chang 2015, Cajochen 2022).
        if (config.blueLight) { sol += 8; tst -= 5; clockShift += 20; }
        // Work night after a late weekend: later to bed, alarm cuts the tail.
        if (config.socialJetLag) { bedShift += 60; sol += 15; truncate += 75; clockShift += 120; }
        // Jet lag, first night after landing. Illustrative sizes (Sack 2007 for direction).
        const JL = {
            east_mild: { sol: 15, truncate: 30, wake: 5, zone: 'any', shift: 180 },
            east_severe: { sol: 45, truncate: 90, wake: 20, zone: 'any', shift: 480 },
            west_mild: { sol: -3, truncate: 30, wake: 10, zone: 'last3', shift: -180 },
            west_severe: { sol: -6, truncate: 75, wake: 30, zone: 'last3', shift: -480 },
        }[jetLag];
        if (JL) {
            sol += JL.sol; truncate += JL.truncate; clockShift += JL.shift;
            groups.push({ min: JL.wake, zone: JL.zone, per: 8 });
        }
        // Perimenopause with night sweats: short hot-flash awakenings (de Zambotti 2014, SWAN).
        if (meno) { sol += 5; n1 += 1.5; groups.push({ min: 20, zone: 'any', per: 5 }); }
        // Sleep apnea: mostly more N1 and short arousals.
        if (sdb > 0) {
            n1 += 16 * sdb; n3 *= 1 - 0.5 * sdb; rem *= 1 - 0.2 * sdb;
            tst -= 15 * sdb; sol -= 3 * sdb;
            groups.push({ min: 35 * sdb, zone: 'any', per: 5 });
        }

        // Wake-up time is mostly fixed (alarm, habit), so wake caused by apnea, toilet
        // trips and night sweats is taken mostly out of sleep rather than added to the
        // time in bed. 70% comes out of TST; the other 30% is a slightly later rise.
        // Caffeine and alcohol are excluded: their TST cost is already a measured value.
        if (!infant) tst -= 0.7 * ((meno ? 20 : 0) + 35 * sdb + 10 * nocturia);

        sol = Math.max(infant ? 3 : 5, sol);
        n1 = Math.max(0, n1);
        n3 = Math.max(infant ? 0 : 1, n3);
        const finalT = Math.max(150, tst - truncate);
        const fullT = finalT + truncate;

        // ---- F5.1 stage minutes for the untruncated night
        const N3m = (n3 / 100) * fullT;
        const REMm = Math.max(0.5 * (rem / 100) * fullT, (rem / 100) * fullT - remCut);
        const N1m = (n1 / 100) * fullT;

        // ---- F5.2 cycle lengths
        const Lc = p.cycleLen;
        const L = [];
        const L0 = Math.min(fullT, p.firstCycleLen + firstCycleAdd);
        const remaining = fullT - L0;
        const nFull = Math.floor(remaining / Lc);
        const nRound = Math.round(remaining / Lc);
        let partial = false;
        if (remaining < 0.35 * Lc) {
            L.push(fullT);
        } else {
            L.push(L0);
            if (nRound >= 1 && Math.abs(remaining / nRound - Lc) <= 0.12 * Lc) {
                for (let i = 0; i < nRound; i++) L.push(remaining / nRound);
            } else {
                for (let i = 0; i < nFull; i++) L.push(Lc);
                L.push(remaining - nFull * Lc);
                partial = true;
            }
        }
        const nC = L.length;

        // Share a total over cycles by weight, with per-cycle caps; excess goes to cycles still under cap.
        const distribute = (total, weights, caps) => {
            const out = new Array(nC).fill(0);
            let left = total;
            for (let pass = 0; pass < 4 && left > 1e-6; pass++) {
                const open = weights.map((w, i) => (out[i] < caps[i] - 1e-9 ? w : 0));
                const sw = open.reduce((a, b) => a + b, 0);
                if (sw <= 0) break;
                let used = 0;
                for (let i = 0; i < nC; i++) {
                    const add = Math.min(caps[i] - out[i], (left * open[i]) / sw);
                    out[i] += add; used += add;
                }
                left -= used;
            }
            return out;
        };

        // ---- F5.3 and F5.4 N3 and REM per cycle
        let n3c, remc;
        if (infant) {
            n3c = new Array(nC).fill(0);
            remc = L.map((l) => l * (REMm / fullT));
        } else {
            const isPartialLast = (i) => partial && i === nC - 1;
            const w3 = L.map((_, i) => (isPartialLast(i) ? 0 : Math.pow(r3, i)));
            n3c = distribute(N3m, w3, L.map((l) => 0.55 * l));
            const wr = L.map((l, i) => (1 + 0.6 * Math.min(i, 4)) * (l / Lc) * (i === 0 ? q0 : i === 1 ? q1 : 1));
            remc = distribute(REMm, wr, L.map((l, i) => (isPartialLast(i) ? 0.6 : 0.45) * l));
        }

        // ---- F5.5 N1: onset, post-REM and intrusions; 2 min per wake bout is reserved for re-entry
        const boutCount = (g) => clamp(Math.round(g.min / g.per), 1, 10);
        const nBoutsEst = groups.reduce((s, g) => s + (g.min >= 3 ? boutCount(g) : 0), 0) + nocturia;
        const onsetN1 = infant ? 0 : clamp(0.25 * N1m, Math.min(2, N1m), 8);
        const n1Pool = Math.max(0, N1m - onsetN1 - 2 * nBoutsEst);

        // ---- F5.6 sleep-only segment list
        const seg = [];
        const push = (stage, d) => { if (d > 0.01) seg.push({ stage, d }); };
        const n2WithIntrusions = (n2, intr) => {
            const k = intr > 0.2 ? Math.max(1, Math.ceil(intr / 4)) : 0;
            if (k === 0 || n2 < 2 * (k + 1)) { push(STAGES.N2, n2); push(STAGES.N1, intr); return; }
            for (let j = 0; j <= k; j++) {
                push(STAGES.N2, n2 / (k + 1));
                if (j < k) push(STAGES.N1, intr / k);
            }
        };
        for (let i = 0; i < nC; i++) {
            if (infant) { push(STAGES.REM, remc[i]); push(STAGES.N2, L[i] - remc[i]); continue; }
            const n1i = n1Pool * (L[i] / fullT);
            const post = Math.min(3, n1i);
            const intr = n1i - post;
            const on = i === 0 ? onsetN1 : 0;
            let n2 = L[i] - n3c[i] - remc[i] - n1i - on;
            if (n2 < 6) {
                const need = 6 - n2, tot = n3c[i] + remc[i];
                if (tot > need) {
                    n3c[i] -= (need * n3c[i]) / tot;
                    remc[i] -= (need * remc[i]) / tot;
                    n2 = 6;
                } else n2 = Math.max(0, n2);
            }
            push(STAGES.N1, on);
            if (n3c[i] > 1) {
                push(STAGES.N2, n2 * 0.35);
                push(STAGES.N3, n3c[i]);
                n2WithIntrusions(n2 * 0.65, intr);
            } else {
                n2WithIntrusions(n2 + n3c[i], intr);
            }
            push(STAGES.REM, remc[i]);
            push(STAGES.N1, post);
        }

        // ---- F5.7 truncate the tail (alarm or early final awakening)
        let acc = 0;
        const cutSeg = [];
        for (const s of seg) {
            if (acc >= finalT - 1e-9) break;
            const d = Math.min(s.d, finalT - acc);
            cutSeg.push({ stage: s.stage, d });
            acc += d;
        }
        const T = acc;

        // ---- F5.8 wake bouts on the sleep-time axis 0..T
        let bouts = [];
        for (const g of groups) {
            if (g.min < 3) continue;
            const B = boutCount(g);
            const w = Array.from({ length: B }, () => 0.5 + rng());
            const sw = w.reduce((a, b) => a + b, 0);
            for (let j = 0; j < B; j++) {
                const u = rng();
                const pos = g.zone === 'late' ? T * (0.5 + 0.5 * u)
                    : g.zone === 'last3' ? T * (0.67 + 0.33 * u)
                        : T * Math.pow(u, 0.75);
                bouts.push({ pos, d: (g.min * w[j]) / sw });
            }
        }
        for (let k = 0; k < nocturia; k++) {
            bouts.push({ pos: 90 + Math.max(60, T - 120) * (k + 0.5 + 0.4 * (rng() - 0.5)) / nocturia, d: 10 });
        }
        if (infant) {
            // F5.10 three feeds at one, two and three quarters of the night
            bouts = [0, 1, 2].map((k) => ({ pos: (T * (k + 1)) / 4 + (rng() - 0.5) * 20, d: p.waso / 3 }));
        }
        bouts.forEach((b) => { b.pos = clamp(b.pos, 15, T - 10); });
        bouts.sort((a, b) => a.pos - b.pos);
        // No awakening straight out of N3: move it to the end of that N3 block.
        const bounds = [];
        { let t = 0; for (const s of cutSeg) { bounds.push([t, t + s.d, s.stage]); t += s.d; } }
        for (const b of bouts) {
            const hit = bounds.find((x) => b.pos >= x[0] && b.pos < x[1]);
            if (hit && hit[2] === STAGES.N3) b.pos = Math.min(T - 10, hit[1] + 0.001);
        }
        bouts.sort((a, b) => a.pos - b.pos);
        for (let i = 1; i < bouts.length; i++) {
            if (bouts[i].pos - bouts[i - 1].pos < 8) bouts[i].pos = bouts[i - 1].pos + 8;
        }
        bouts = bouts.filter((b) => b.pos <= T - 5);

        // ---- F3 bedtime and F5.9 assembly
        const habitualBedtime = ScientificConstants.habitualBedtime(age, chronotype);
        const bedtime = habitualBedtime + bedShift;
        const blocks = [];
        let t = bedtime;
        const add = (stage, d) => {
            if (d <= 0) return;
            const last = blocks[blocks.length - 1];
            if (last && (last.stage === stage || d <= 0.01)) last.duration += d; // merge, and absorb slivers
            else blocks.push({ stage, start: t, duration: d });
            t += d;
        };
        add(STAGES.WAKE, sol);
        let sleepT = 0, bi = 0, reentry = 0, bridge = 0;
        for (const s of cutSeg) {
            let left = s.d;
            while (left > 1e-9) {
                if (reentry > 0) { // back to sleep through N1
                    const r = Math.min(reentry, left);
                    add(STAGES.N1, r); left -= r; sleepT += r; reentry -= r;
                    if (s.stage === STAGES.N3) bridge = 3;
                    continue;
                }
                if (bridge > 0 && s.stage === STAGES.N3) { // and through N2 before N3
                    const r = Math.min(bridge, left);
                    add(STAGES.N2, r); left -= r; sleepT += r; bridge -= r;
                    continue;
                }
                const nextB = bi < bouts.length ? bouts[bi].pos : Infinity;
                const run = Math.min(left, Math.max(0, nextB - sleepT));
                add(s.stage, run); left -= run; sleepT += run;
                if (bi < bouts.length && sleepT >= bouts[bi].pos - 1e-9) {
                    add(STAGES.WAKE, bouts[bi].d);
                    bi++;
                    reentry = infant ? 0 : 2;
                }
            }
        }

        // ---- F1.4 stats measured from the finished blocks
        const stats = HypnogramGenerator.measure(blocks);
        stats.napMins = p.nap;
        stats.sleepPer24h = stats.tst + p.nap;

        // ---- F5.11 arousal ticks (no duration, never counted)
        const nTicks = Math.round((stats.tst / 60) * (1 + age / 40)) + Math.round(60 * sdb);
        const sleepBlocks = blocks.filter((b) => b.stage !== STAGES.WAKE && b.duration > 2);
        const wakeEvents = [];
        for (let i = 0; i < nTicks && sleepBlocks.length; i++) {
            const b = sleepBlocks[Math.floor(rng() * sleepBlocks.length)];
            wakeEvents.push({ time: b.start + rng() * b.duration, duration: 0 });
        }

        const last = blocks[blocks.length - 1];
        return {
            blocks,
            wakeEvents,
            params: {
                age, chronotype, infant, bedtime, habitualBedtime, clockShift,
                startTimeOffset: bedtime - 240,
                sleepOnset: bedtime + stats.latency,
                sleepEnd: last.start + last.duration,
                windowLength: ScientificConstants.recommendedWindow(age),
                tst: stats.tst, tib: stats.tib,
            },
            stats,
        };
    }

    // Everything the UI prints comes from here (F1.4).
    static measure(blocks) {
        const W = STAGES.WAKE;
        const m = [0, 0, 0, 0, 0];
        if (!blocks.length) {
            return { tst: 0, tib: 0, latency: 0, wasoMins: 0, sleepEfficiency: 0, n1P: 0, n2P: 0, n3P: 0, remP: 0, remLatency: null };
        }
        const t0 = blocks[0].start;
        const last = blocks[blocks.length - 1];
        const tib = last.start + last.duration - t0;
        blocks.forEach((b) => { m[b.stage] += b.duration; });
        const tst = tib - m[W];
        const first = blocks.find((b) => b.stage !== W);
        const latency = first ? first.start - t0 : tib;
        const firstRem = blocks.find((b) => b.stage === STAGES.REM);
        const pct = (x) => (tst > 0 ? x / tst : 0);
        return {
            tst, tib, latency,
            wasoMins: m[W] - latency,
            sleepEfficiency: tib > 0 ? (tst / tib) * 100 : 0,
            n1P: pct(m[STAGES.N1]), n2P: pct(m[STAGES.N2]), n3P: pct(m[STAGES.N3]), remP: pct(m[STAGES.REM]),
            remLatency: firstRem && first ? firstRem.start - first.start : null,
        };
    }
}

// Two-process model curves (Borbély 1982; Daan, Beersma and Borbély 1984) plus hormone shapes.
// Pure maths; the drawing code samples these.
class TwoProcessModel {
    static getCurves(caffeine, caffeineTime, caffeineMetabolism) {
        return {
            tau_r: 18.2 * 60, // rise time constant while awake, min
            tau_d: 4.2 * 60,  // decay time constant while asleep, min
            caffeine, caffeineTime,
            halfLife: ScientificConstants.CAFFEINE_HALF_LIFE[caffeineMetabolism] || 5,
        };
    }

    // Process S. Awake since yesterday's wake-up (sleepEnd - 24 h), asleep from sleepStart to sleepEnd.
    // The level at yesterday's wake-up is the steady state of the same day repeated.
    static sleepPressure(t, sleepStart, sleepEnd, m) {
        const prevWake = sleepEnd - 1440;
        const a = Math.exp(-(sleepStart - prevWake) / m.tau_r);
        const d = Math.exp(-(sleepEnd - sleepStart) / m.tau_d);
        const S0 = (d * (1 - a)) / (1 - d * a);
        const sOnset = 1 - (1 - S0) * a;
        const sEnd = sOnset * d;
        let S;
        if (t < sleepStart) S = 1 - (1 - S0) * Math.exp(-(t - prevWake) / m.tau_r);
        else if (t < sleepEnd) S = sOnset * Math.exp(-(t - sleepStart) / m.tau_d);
        else S = 1 - (1 - sEnd) * Math.exp(-(t - sleepEnd) / m.tau_r);
        // Caffeine masks part of the felt pressure while it is in the body.
        const intake = sleepStart - m.caffeineTime * 60;
        if (m.caffeine > 0 && t >= intake) S -= m.caffeine * 0.1 * Math.pow(0.5, (t - intake) / 60 / m.halfLife);
        return Math.max(0, S);
    }

    // Melatonin, 0..1: rises 2 h before habitual bedtime, falls 30 min after the habitual window ends.
    static melatonin(t, on, off) {
        const sig = (x) => 1 / (1 + Math.exp(-x));
        return sig((t - on) / 25) * sig((off - t) / 40);
    }
}

// --- APP LOGIC ---

document.addEventListener('DOMContentLoaded', () => {
    const generator = new HypnogramGenerator();
    const $ = (id) => document.getElementById(id);

    const canvases = { A: $('hypnogram'), B: $('hypnogram-b') };
    const pies = { A: $('pie-chart'), B: $('pie-chart-b') };
    const suffix = { A: '', B: '-b' };

    // Model inputs only. View options (overlays) are global, see `view`.
    const defaultState = {
        gender: 'male', age: 25, jetLag: 'none', socialJetLag: false, sdbSeverity: 0,
        isMenopausal: false, chronotype: 'normal', alcohol: 0, caffeine: 0, caffeineTime: 0,
        caffeineMetabolism: 'normal', nocturia: 0, blueLight: false,
    };
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const states = { A: clone(defaultState), B: null };
    const view = { showProcessS: false, showProcessC: false, showGH: false, showCortisol: false };
    const sims = { A: null, B: null };
    let activeProfile = 'A';
    let compareMode = false;

    const COUNTER_MAX = { alcohol: 6, caffeine: 6, nocturia: 5 };
    const STAGE_COLORS = {
        [STAGES.WAKE]: '#ef4444', [STAGES.REM]: '#f59e0b', [STAGES.N1]: '#38bdf8',
        [STAGES.N2]: '#3b82f6', [STAGES.N3]: '#1d4ed8',
    };
    const OVERLAYS = [
        { key: 'showProcessS', name: 'Sleep pressure', color: '#facc15' },
        { key: 'showProcessC', name: 'Melatonin', color: '#a78bfa' },
        { key: 'showGH', name: 'Growth hormone', color: '#2dd4bf' },
        { key: 'showCortisol', name: 'Cortisol', color: '#f97316' },
    ];
    const FONT = 'Inter, system-ui, sans-serif';

    // ---------------------------------------------------------------- helpers
    const menoVisible = (s) => s.gender === 'female' && s.age >= 40 && s.age <= 60;

    const fmtDur = (mins) => {
        const r = Math.max(0, Math.round(mins));
        const h = Math.floor(r / 60), m = r % 60;
        if (h === 0) return `${m} m`;
        return m === 0 ? `${h} h` : `${h} h ${m} m`;
    };

    const fmtClock = (t) => { // minutes after 18:00
        const total = ((Math.round(18 * 60 + t) % 1440) + 1440) % 1440;
        return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    };

    function describe(s) {
        const adult = s.age >= 18;
        const who = s.age < 1 ? 'baby' : s.gender === 'female' ? (adult ? 'woman' : 'girl') : (adult ? 'man' : 'boy');
        const extras = [];
        if (s.alcohol) extras.push(`${s.alcohol} drink${s.alcohol > 1 ? 's' : ''}`);
        if (s.caffeine) extras.push(`${s.caffeine} coffee${s.caffeine > 1 ? 's' : ''}`);
        if (s.blueLight) extras.push('screen');
        if (s.chronotype !== 'normal') extras.push(s.chronotype);
        if (s.socialJetLag) extras.push('late weekend');
        if (s.jetLag !== 'none') extras.push('jet lag');
        if (s.sdbSeverity) extras.push({ 3: 'mild apnea', 6: 'moderate apnea', 10: 'severe apnea' }[s.sdbSeverity] || 'apnea');
        if (s.nocturia) extras.push(`${s.nocturia} toilet trip${s.nocturia > 1 ? 's' : ''}`);
        if (s.isMenopausal && menoVisible(s)) extras.push('night sweats');
        return { base: s.age < 1 ? 'baby' : `${who}, ${s.age}`, extras };
    }

    // One rule for the perimenopause row (F7.8): hidden means unticked.
    function syncMenopause(s, isActive) {
        const visible = menoVisible(s);
        if (!visible) s.isMenopausal = false;
        if (isActive) {
            $('menopause-group').hidden = !visible;
            $('menopause-toggle').checked = s.isMenopausal;
        }
    }

    // ---------------------------------------------------------------- inputs <-> state
    function updateInputsFromState(s) {
        $('age-slider').value = s.age;
        $('age-value').textContent = s.age;
        document.querySelectorAll('input[name="gender"]').forEach((r) => { r.checked = r.value === s.gender; });
        $('chronotype-select').value = s.chronotype;
        $('jetlag-select').value = s.jetLag;
        $('social-jetlag-toggle').checked = s.socialJetLag;
        $('alcohol-display').textContent = s.alcohol;
        $('caffeine-display').textContent = s.caffeine;
        $('nocturia-display').textContent = s.nocturia;
        $('caffeine-time-slider').value = s.caffeineTime;
        $('caffeine-time-val').textContent = s.caffeineTime;
        document.querySelectorAll('input[name="metabolism"]').forEach((r) => { r.checked = r.value === s.caffeineMetabolism; });
        document.querySelectorAll('input[name="sdb"]').forEach((r) => { r.checked = +r.value === s.sdbSeverity; });
        $('blue-light-toggle').checked = s.blueLight;
        syncMenopause(s, true);
    }

    function updateChrome() {
        const s = states[activeProfile];
        $('caffeine-details').hidden = !(s.caffeine > 0);
        document.querySelectorAll('.counter-input').forEach((c) => {
            const key = c.dataset.key;
            c.querySelector('[data-step="-1"]').disabled = s[key] <= 0;
            c.querySelector('[data-step="1"]').disabled = s[key] >= COUNTER_MAX[key];
        });
        const count = (n) => (n ? `(${n})` : '');
        $('count-clock').textContent = count((s.chronotype !== 'normal') + s.socialJetLag + (s.jetLag !== 'none'));
        $('count-health').textContent = count((s.sdbSeverity > 0) + (s.nocturia > 0) + (s.isMenopausal && menoVisible(s)));
        $('count-overlays').textContent = count(OVERLAYS.filter((o) => view[o.key]).length);

        for (const id of ['A', 'B']) {
            const st = states[id];
            if (!st) continue;
            const d = describe(st);
            const short = d.extras.length ? `${d.base}, ${d.extras[0]}${d.extras.length > 1 ? ` +${d.extras.length - 1}` : ''}` : d.base;
            $(`tab-${id.toLowerCase()}`).textContent = `${id}: ${short}`;
            $(`viz-label-${id.toLowerCase()}`).textContent = `${id}: ${[d.base, ...d.extras].join(', ')}`;
            $(`infant-caption-${id.toLowerCase()}`).hidden = st.age >= 1;
        }
    }

    function simulate(id) {
        if (!states[id]) return;
        try {
            sims[id] = generator.generate(states[id]);
        } catch (e) {
            console.error('Simulation error', e);
        }
    }

    function onStateChange() {
        simulate(activeProfile);
        updateChrome();
        redraw();
    }

    function switchProfile(id) {
        activeProfile = id;
        document.querySelectorAll('.profile-tabs .tab').forEach((t) => {
            const on = t.dataset.profile === id;
            t.classList.toggle('active', on);
            t.setAttribute('aria-pressed', on);
        });
        $('controls-mask').className = `profile-${id.toLowerCase()}-active`;
        updateInputsFromState(states[id]);
        updateChrome();
    }

    // ---------------------------------------------------------------- bindings
    const bindValue = (id, key, parse = (v) => v, type = 'input') => {
        $(id).addEventListener(type, (e) => {
            states[activeProfile][key] = parse(e.target.value);
            onStateChange();
        });
    };
    const bindCheck = (id, key) => {
        $(id).addEventListener('change', (e) => {
            states[activeProfile][key] = e.target.checked;
            onStateChange();
        });
    };
    const bindRadios = (name, key, parse = (v) => v) => {
        document.querySelectorAll(`input[name="${name}"]`).forEach((r) => {
            r.addEventListener('change', (e) => {
                const s = states[activeProfile];
                s[key] = parse(e.target.value);
                if (key === 'gender') syncMenopause(s, true);
                onStateChange();
            });
        });
    };

    $('age-slider').addEventListener('input', (e) => {
        const s = states[activeProfile];
        s.age = parseInt(e.target.value, 10);
        $('age-value').textContent = s.age;
        syncMenopause(s, true);
        onStateChange();
    });
    bindRadios('gender', 'gender');
    bindRadios('metabolism', 'caffeineMetabolism');
    bindRadios('sdb', 'sdbSeverity', (v) => parseInt(v, 10));
    bindValue('chronotype-select', 'chronotype', undefined, 'change');
    bindValue('jetlag-select', 'jetLag', undefined, 'change');
    bindValue('caffeine-time-slider', 'caffeineTime', (v) => parseInt(v, 10));
    $('caffeine-time-slider').addEventListener('input', (e) => { $('caffeine-time-val').textContent = e.target.value; });
    bindCheck('social-jetlag-toggle', 'socialJetLag');
    bindCheck('blue-light-toggle', 'blueLight');
    bindCheck('menopause-toggle', 'isMenopausal');

    document.querySelectorAll('.counter-input').forEach((c) => {
        const key = c.dataset.key;
        c.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => {
                const s = states[activeProfile];
                s[key] = Math.max(0, Math.min(COUNTER_MAX[key], s[key] + parseInt(btn.dataset.step, 10)));
                $(`${key}-display`).textContent = s[key];
                onStateChange();
            });
        });
    });

    [['process-s-toggle', 'showProcessS'], ['process-c-toggle', 'showProcessC'], ['gh-toggle', 'showGH'], ['cortisol-toggle', 'showCortisol']]
        .forEach(([id, key]) => {
            $(id).addEventListener('change', (e) => {
                view[key] = e.target.checked;
                updateChrome();
                redraw();
            });
        });

    $('compare-mode-toggle').addEventListener('change', (e) => {
        compareMode = e.target.checked;
        document.body.classList.toggle('compare-active', compareMode);
        if (compareMode && !states.B) { // first time: B starts as a copy of A
            states.B = clone(states.A);
            simulate('B');
        }
        $('profile-tabs').hidden = !compareMode;
        $('viz-b').hidden = !compareMode;
        if (!compareMode) switchProfile('A');
        updateChrome();
        requestAnimationFrame(redraw);
    });

    document.querySelectorAll('.profile-tabs .tab').forEach((tab) => {
        tab.addEventListener('click', () => switchProfile(tab.dataset.profile));
    });

    // ---------------------------------------------------------------- drawing
    function setupCanvas(canvas, w, h) {
        const dpr = window.devicePixelRatio || 1;
        const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
        if (canvas.width !== pw) canvas.width = pw;
        if (canvas.height !== ph) canvas.height = ph;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    }

    // Shared clock window for every visible panel (F6.9).
    function computeView() {
        const ids = compareMode ? ['A', 'B'] : ['A'];
        let start = Infinity, end = -Infinity;
        for (const id of ids) {
            const r = sims[id];
            if (!r) continue;
            const p = r.params;
            start = Math.min(start, r.blocks[0].start, p.windowLength ? p.habitualBedtime : Infinity);
            end = Math.max(end, p.sleepEnd, p.windowLength ? p.habitualBedtime + p.windowLength : -Infinity);
        }
        let viewStart = start - 60, viewEnd = end + 60;
        const minDuration = 600;
        if (viewEnd - viewStart < minDuration) {
            const extra = minDuration - (viewEnd - viewStart);
            viewStart -= extra / 2;
            viewEnd += extra / 2;
        }
        // Same left margin in both panels, so the clock axes line up even if only one is a newborn.
        const anyInfant = ids.some((id) => sims[id] && sims[id].params.infant);
        return { viewStart, viewEnd, labels: anyInfant ? ['Active (REM)', 'Quiet (NREM)'] : ['Wake'] };
    }

    function redraw() {
        const v = computeView();
        drawPanel('A', v);
        if (compareMode) drawPanel('B', v);
    }

    function drawPanel(id, v) {
        const r = sims[id];
        if (!r) return;
        drawHypnogram(canvases[id], r, v, states[id]);
        drawPie(id, r);
    }

    function drawHypnogram(canvas, sim, { viewStart, viewEnd, labels }, state) {
        const box = canvas.parentElement;
        const cssW = box.clientWidth, cssH = box.clientHeight;
        if (!cssW || !cssH) return;
        const ctx = setupCanvas(canvas, cssW, cssH);
        ctx.clearRect(0, 0, cssW, cssH);
        const { blocks, wakeEvents, params } = sim;

        const rows = params.infant
            ? [[STAGES.WAKE, 'Wake'], [STAGES.REM, 'Active (REM)'], [STAGES.N2, 'Quiet (NREM)']]
            : [[STAGES.WAKE, 'Wake'], [STAGES.REM, 'REM'], [STAGES.N1, 'N1'], [STAGES.N2, 'N2'], [STAGES.N3, 'N3']];
        ctx.font = `600 12px ${FONT}`;
        const labelW = Math.max(...rows.map(([, name]) => ctx.measureText(name).width), ...labels.map((n) => ctx.measureText(n).width));

        // Narrow plots put the overlay legend in a strip under the hour labels so it hides nothing.
        const activeOverlays = OVERLAYS.filter((o) => view[o.key] && !(params.infant && (o.key === 'showProcessC' || o.key === 'showCortisol')));
        const legendBelow = cssW - labelW - 34 < 480 && activeOverlays.length > 0;
        const legendRows = legendBelow ? Math.ceil(activeOverlays.length / 2) : 0;
        const pad = { top: 52, right: 16, bottom: 34 + legendRows * 18, left: Math.ceil(labelW) + 18 };
        const width = cssW - pad.left - pad.right;
        const height = cssH - pad.top - pad.bottom;
        const bottom = pad.top + height;
        const right = pad.left + width;
        if (width <= 20 || height <= 20) return;
        Object.assign(canvas.dataset, { viewStart, viewEnd, padLeft: pad.left, plotWidth: width });
        const span = viewEnd - viewStart;
        const timeToX = (t) => pad.left + ((t - viewStart) / span) * width;
        const valueToY = (val) => bottom - val * height * 0.9;
        const stageY = {};
        rows.forEach(([stage], i) => { stageY[stage] = pad.top + (height * i) / rows.length; });

        // Recommended sleep window (F6.5)
        let windowLabelBox = null;
        if (params.windowLength) {
            const x1 = Math.max(pad.left, timeToX(params.habitualBedtime));
            const x2 = Math.min(right, timeToX(params.habitualBedtime + params.windowLength));
            if (x2 > x1) {
                ctx.fillStyle = 'rgba(74, 222, 128, 0.06)';
                ctx.fillRect(x1, pad.top, x2 - x1, height);
                ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(x1, pad.top); ctx.lineTo(x2, pad.top); ctx.stroke();
                ctx.font = `400 12px ${FONT}`;
                const text = 'Recommended sleep window';
                const tw = ctx.measureText(text).width;
                ctx.fillStyle = 'rgba(134, 239, 172, 0.9)';
                ctx.textAlign = 'left';
                const lx = Math.min(x1 + 2, cssW - tw - 4);
                ctx.fillText(text, lx, pad.top - 9);
                windowLabelBox = [lx, lx + tw];
            }
        }

        // Hour grid; label step widens on narrow screens so labels never collide.
        const pxPerHour = (width / span) * 60;
        const step = pxPerHour >= 48 ? 1 : pxPerHour >= 26 ? 2 : 3;
        ctx.font = `400 12px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 1;
        for (let m = Math.ceil(viewStart / 60) * 60; m <= viewEnd; m += 60) {
            const x = timeToX(m);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, bottom); ctx.stroke();
            const hour = (((18 + m / 60) % 24) + 24) % 24;
            if (hour % step === 0) {
                ctx.fillStyle = 'rgba(226, 232, 240, 0.7)';
                ctx.fillText(fmtClock(m), x, bottom + 20);
            }
        }

        // Stage rows
        ctx.textAlign = 'right';
        rows.forEach(([stage, name]) => {
            const y = stageY[stage];
            ctx.fillStyle = STAGE_COLORS[stage];
            ctx.font = `600 12px ${FONT}`;
            ctx.fillText(name, pad.left - 10, y + 4);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(right, y); ctx.stroke();
        });

        // Blocks
        ctx.save();
        ctx.beginPath(); ctx.rect(pad.left, pad.top - 2, width, height + 2); ctx.clip();
        blocks.forEach((b) => {
            const bEnd = b.start + b.duration;
            if (bEnd < viewStart || b.start > viewEnd) return;
            const x = timeToX(b.start);
            const w = timeToX(bEnd) - x;
            if (w <= 0) return;
            const y = stageY[b.stage];
            const grad = ctx.createLinearGradient(0, y, 0, bottom);
            grad.addColorStop(0, STAGE_COLORS[b.stage]);
            grad.addColorStop(1, 'rgba(30, 41, 59, 0)');
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = grad;
            ctx.fillRect(x, y, w, bottom - y);
            ctx.globalAlpha = 1;
            ctx.fillStyle = STAGE_COLORS[b.stage];
            ctx.fillRect(x, y - 1, Math.max(w, 0.75), 4);
        });

        // Arousal ticks (F6.7): short ticks from the top line, never full height.
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        wakeEvents.forEach((ev) => {
            if (ev.time < viewStart || ev.time > viewEnd) return;
            const x = Math.round(timeToX(ev.time)) + 0.5;
            ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + 6);
        });
        ctx.stroke();
        ctx.globalAlpha = 1;

        drawOverlays(ctx, sim, state, { viewStart, viewEnd, timeToX, valueToY });
        ctx.restore();

        // Wake-up marker (F6.4) at the end of the last sleep block.
        const xEnd = timeToX(params.sleepEnd);
        if (xEnd >= pad.left && xEnd <= right) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.moveTo(xEnd, pad.top); ctx.lineTo(xEnd, bottom); ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = `600 12px ${FONT}`;
            const text = `Wake-up ${fmtClock(params.sleepEnd)}`;
            const tw = ctx.measureText(text).width;
            const lx = clamp(xEnd - tw / 2, 4, cssW - tw - 4);
            const collides = windowLabelBox && lx < windowLabelBox[1] + 8 && lx + tw > windowLabelBox[0] - 8;
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'left';
            ctx.fillText(text, lx, collides ? pad.top - 27 : pad.top - 9);
        }

        if (legendBelow) drawOverlayStrip(ctx, activeOverlays, pad.left, bottom + 38, width);
        else drawOverlayLegend(ctx, right, pad.top, params);
    }

    function drawOverlayStrip(ctx, on, left, top, width) {
        ctx.font = `400 12px ${FONT}`;
        ctx.textAlign = 'left';
        const colW = width / 2;
        on.forEach((o, i) => {
            const x = left + (i % 2) * colW;
            const cy = top + Math.floor(i / 2) * 18;
            ctx.strokeStyle = o.color;
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + 16, cy); ctx.stroke();
            ctx.fillStyle = '#e2e8f0';
            ctx.fillText(o.name, x + 22, cy + 4);
        });
    }

    function curve(ctx, color, { viewStart, viewEnd, timeToX, valueToY }, fn) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        for (let t = viewStart, first = true; t <= viewEnd + 1e-9; t += 2, first = false) {
            const x = timeToX(t), y = valueToY(fn(t));
            if (first) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    function drawOverlays(ctx, sim, state, v) {
        const { params, blocks } = sim;
        const sleepStart = params.bedtime;
        const sleepEnd = params.sleepEnd;

        if (view.showProcessS) {
            const m = TwoProcessModel.getCurves(state.caffeine, state.caffeineTime, state.caffeineMetabolism);
            curve(ctx, '#facc15', v, (t) => TwoProcessModel.sleepPressure(t, sleepStart, sleepEnd, m));
        }
        // Newborns have no melatonin or cortisol day-night rhythm until about 2 to 3 months,
        // so those two curves are not drawn at age 0.
        if (view.showProcessC && !params.infant) {
            const len = params.windowLength || 11 * 60;
            const on = params.habitualBedtime - 120 + params.clockShift;
            const off = params.habitualBedtime + len + 30 + params.clockShift;
            curve(ctx, '#a78bfa', v, (t) => 0.1 + 0.8 * TwoProcessModel.melatonin(t, on, off));
        }
        if (view.showGH) {
            const firstN3 = blocks.find((b) => b.stage === STAGES.N3);
            let amp = 0, centre = 0;
            if (firstN3) {
                const w0 = params.sleepOnset, w1 = params.sleepOnset + 180;
                const early = blocks.reduce((s, b) => (b.stage === STAGES.N3
                    ? s + Math.max(0, Math.min(b.start + b.duration, w1) - Math.max(b.start, w0)) : s), 0);
                amp = 0.8 * Math.min(1, early / 60);
                centre = firstN3.start + firstN3.duration / 2;
            }
            curve(ctx, '#2dd4bf', v, (t) => 0.1 + (amp ? amp * Math.exp(-((t - centre) ** 2) / (2 * 25 * 25)) : 0));
        }
        if (view.showCortisol && !params.infant) {
            const wake = sleepEnd;
            curve(ctx, '#f97316', v, (t) => {
                if (t < wake - 180) return 0.2;
                if (t <= wake + 30) return 0.2 + 0.7 * Math.pow((t - (wake - 180)) / 210, 2);
                return 0.9 * Math.exp(-(t - (wake + 30)) / 180);
            });
        }
    }

    function drawOverlayLegend(ctx, right, top, params) {
        const on = OVERLAYS.filter((o) => view[o.key] && !(params.infant && (o.key === 'showProcessC' || o.key === 'showCortisol')));
        if (!on.length) return;
        ctx.font = `400 12px ${FONT}`;
        const textW = Math.max(...on.map((o) => ctx.measureText(o.name).width));
        const rowH = 18, sample = 16, padX = 8, padY = 6;
        const w = padX * 2 + sample + 6 + textW;
        const h = padY * 2 + rowH * on.length - 4;
        const x = right - w - 6, y = top + 8;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, 6); else ctx.rect(x, y, w, h);
        ctx.fill(); ctx.stroke();
        ctx.textAlign = 'left';
        on.forEach((o, i) => {
            const cy = y + padY + i * rowH + 7;
            ctx.strokeStyle = o.color;
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(x + padX, cy); ctx.lineTo(x + padX + sample, cy); ctx.stroke();
            ctx.fillStyle = '#e2e8f0';
            ctx.fillText(o.name, x + padX + sample + 6, cy + 4);
        });
    }

    function drawPie(id, sim) {
        const { stats, params } = sim;
        const c = pies[id];
        const size = c.clientWidth || 140;
        const ctx = setupCanvas(c, size, size);
        ctx.clearRect(0, 0, size, size);
        const infant = params.infant;
        const data = [
            { label: 'N3', value: stats.n3P, color: STAGE_COLORS[STAGES.N3] },
            { label: infant ? 'Quiet (NREM)' : 'N2', value: stats.n2P, color: STAGE_COLORS[STAGES.N2] },
            { label: 'N1', value: stats.n1P, color: STAGE_COLORS[STAGES.N1] },
            { label: infant ? 'Active (REM)' : 'REM', value: stats.remP, color: STAGE_COLORS[STAGES.REM] },
        ].filter((d) => !infant || d.value > 0);

        const r = size / 2, cx = size / 2, cy = size / 2;
        let a = -Math.PI / 2;
        data.forEach((d) => {
            const sweep = d.value * 2 * Math.PI;
            ctx.beginPath(); ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, a, a + sweep);
            ctx.closePath();
            ctx.fillStyle = d.color; ctx.fill();
            a += sweep;
        });

        $(`pie-legend${suffix[id]}`).innerHTML = data.map((d) => `
            <div class="legend-item">
                <div class="legend-color" style="background: ${d.color}"></div>
                <span>${d.label} ${Math.round(d.value * 100)}% - ${fmtDur(d.value * stats.tst)}</span>
            </div>`).join('');

        const se = stats.sleepEfficiency;
        const seColor = se < 75 ? '#ef4444' : se < 85 ? '#facc15' : '#4ade80';
        const cards = [
            [fmtDur(stats.tib), 'Time in bed'],
            [fmtDur(stats.tst), 'Total sleep'],
            [`${Math.round(se)}%`, 'Efficiency', seColor],
            [fmtDur(stats.latency), 'Time to fall asleep'],
            [fmtDur(stats.wasoMins), 'Awake in the night'],
        ];
        if (params.age < 5) cards.push([fmtDur(stats.sleepPer24h), 'Sleep per 24 h']);
        $(`metrics-display${suffix[id]}`).innerHTML = cards.map(([value, label, color]) => `
            <div class="metric-card"><div class="metric-value"${color ? ` style="color: ${color}"` : ''}>${value}</div><div class="metric-label">${label}</div></div>`).join('');
    }

    // ---------------------------------------------------------------- start
    let pending = false;
    const scheduleRedraw = () => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; redraw(); });
    };
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(scheduleRedraw);
        document.querySelectorAll('.canvas-container').forEach((el) => ro.observe(el));
    }
    window.addEventListener('resize', scheduleRedraw);

    switchProfile('A');
    simulate('A');
    redraw();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
});
