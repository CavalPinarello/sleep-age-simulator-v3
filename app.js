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
    console.log('DOM Loaded');
    const generator = new HypnogramGenerator();

    // Canvas References
    const canvasA = document.getElementById('hypnogram');
    const canvasB = document.getElementById('hypnogram-b');
    const pieCanvasA = document.getElementById('pie-chart');
    const pieCanvasB = document.getElementById('pie-chart-b');

    // Default State Template
    const defaultState = {
        gender: 'male',
        age: 25,
        jetLag: 'none',
        socialJetLag: false,
        sdbSeverity: 0,
        isMenopausal: false,
        chronotype: 'normal',
        alcohol: 0,
        caffeine: 0,
        caffeineTime: 0, // Hours before bed
        caffeineMetabolism: 'normal', // fast, normal, slow
        nocturia: 0,
        blueLight: false,
        showProcessS: false,
        showProcessC: false,
        showGH: false,
        showCortisol: false
    };

    // Global State
    const states = {
        A: JSON.parse(JSON.stringify(defaultState)),
        B: JSON.parse(JSON.stringify(defaultState))
    };

    let activeProfile = 'A';
    let compareMode = false;
    let cachedSimulations = { A: null, B: null };

    // --- State Management ---

    function switchProfile(profileId) {
        activeProfile = profileId;

        // Update Tabs UI
        document.querySelectorAll('.profile-tabs .tab').forEach(t => {
            t.classList.toggle('active', t.dataset.profile === profileId);
        });

        // Update Sidebar styling
        const mask = document.getElementById('controls-mask');
        if (mask) {
            mask.className = '';
            mask.classList.add(`profile-${profileId.toLowerCase()}-active`);
        }

        // Update Inputs to match State
        updateInputsFromState(states[activeProfile]);
    }

    function updateInputsFromState(s) {
        // Values
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };
        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        const setChk = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.checked = val;
        };

        setVal('age-slider', s.age);
        setTxt('age-value', s.age);

        // Gender Radios
        document.querySelectorAll('input[name="gender"]').forEach(r => {
            r.checked = (r.value === s.gender);
        });

        setVal('chronotype-select', s.chronotype);
        setVal('jetlag-select', s.jetLag);
        setChk('social-jetlag-toggle', s.socialJetLag);

        setTxt('alcohol-display', s.alcohol);
        setVal('alcohol-input', s.alcohol); // Hidden input for counter logic

        setTxt('caffeine-display', s.caffeine);
        setVal('caffeine-input', s.caffeine);

        setVal('caffeine-time-slider', s.caffeineTime);
        setTxt('caffeine-time-val', s.caffeineTime);

        document.querySelectorAll('input[name="metabolism"]').forEach(r => {
            r.checked = (r.value === s.caffeineMetabolism);
        });

        setTxt('nocturia-display', s.nocturia);
        setVal('nocturia-input', s.nocturia);

        setChk('blue-light-toggle', s.blueLight);
        setVal('sdb-slider', s.sdbSeverity);
        setChk('menopause-toggle', s.isMenopausal);

        // Menopause Visibility
        const menGrp = document.getElementById('menopause-group');
        if (s.age >= 40 && s.age <= 60 && s.gender === 'female') menGrp.style.display = 'block';
        else menGrp.style.display = 'none';

        // Overlays
        setChk('process-s-toggle', s.showProcessS);
        setChk('process-c-toggle', s.showProcessC);
        setChk('gh-toggle', s.showGH);
        setChk('cortisol-toggle', s.showCortisol);
    }

    // --- Interaction ---

    // Toggle Compare Mode
    const compareToggle = document.getElementById('compare-mode-toggle');
    if (compareToggle) {
        compareToggle.addEventListener('change', (e) => {
            compareMode = e.target.checked;
            document.body.classList.toggle('compare-active', compareMode);

            const tabs = document.getElementById('profile-tabs');
            const vizB = document.getElementById('viz-b');

            if (compareMode) {
                tabs.style.display = 'flex';
                vizB.style.display = 'flex';
                // Trigger resize after layout reflow
                setTimeout(() => {
                    resizeAll();
                    runSimulation('B');
                }, 50);
            } else {
                tabs.style.display = 'none';
                vizB.style.display = 'none';
                switchProfile('A'); // Force back to A
                // Trigger resize after layout reflow
                setTimeout(() => {
                    resizeAll();
                }, 50);
            }

            // Toggle Label A Visibility
            const labelA = document.querySelector('#viz-a .viz-label');
            if (labelA) labelA.style.display = compareMode ? 'block' : 'none';
        });
    }

    // Profile Tabs
    document.querySelectorAll('.profile-tabs .tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchProfile(tab.dataset.profile);
        });
    });

    // Update Counter (Global Helper Override)
    window.updateCounter = (key, change) => {
        const s = states[activeProfile];
        s[key] = Math.max(0, Math.min(10, s[key] + change));

        // Update UI
        document.getElementById(`${key}-display`).textContent = s[key];
        document.getElementById(`${key}-input`).value = s[key];

        runSimulation(activeProfile);
    };

    // Bind Controls
    const bind = (id, key, type = 'value') => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener(type === 'checkbox' ? 'change' : 'input', (e) => {
            const val = type === 'checkbox' ? e.target.checked : (type === 'value' ? e.target.value : parseInt(e.target.value));
            states[activeProfile][key] = val;

            // Specific UI logic
            if (key === 'caffeineTime') {
                document.getElementById('caffeine-time-val').textContent = val;
            }
            if (key === 'age' || key === 'gender') { // Gender handled separately but age needs check
                const s = states[activeProfile];
                document.getElementById('age-value').textContent = s.age;
                const menGrp = document.getElementById('menopause-group');
                if (s.age >= 40 && s.age <= 60 && s.gender === 'female') menGrp.style.display = 'block';
                else { menGrp.style.display = 'none'; s.isMenopausal = false; }
            }

            // Visual-only check
            const isVisual = ['showProcessS', 'showProcessC', 'showGH', 'showCortisol'].includes(key);
            if (isVisual) {
                drawVisuals(activeProfile);
            } else {
                runSimulation(activeProfile);
            }
        });
    };

    // Bind Gender/Metabolism (Radios)
    const bindRadios = (name, key) => {
        document.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
            radio.addEventListener('change', (e) => {
                states[activeProfile][key] = e.target.value;
                if (key === 'gender') {
                    const s = states[activeProfile];
                    const menGrp = document.getElementById('menopause-group');
                    if (s.age >= 40 && s.age <= 60 && s.gender === 'female') menGrp.style.display = 'block';
                    else { menGrp.style.display = 'none'; s.isMenopausal = false; }
                }
                runSimulation(activeProfile);
            });
        });
    };

    bind('age-slider', 'age', 'int');
    bind('jetlag-select', 'jetLag');
    bind('social-jetlag-toggle', 'socialJetLag', 'checkbox');
    bind('sdb-slider', 'sdbSeverity', 'int');
    bind('menopause-toggle', 'isMenopausal', 'checkbox');
    bind('chronotype-select', 'chronotype');
    bind('nocturia-slider', 'nocturia', 'int'); // Wait, ID was nocturia-slider? 
    // Checking index.html... no, nocturia is counter buttons. BUT I saw bind('nocturia-slider'...) in old code.
    // Index.html has buttons. bind() here is for range/select/check. 
    // Counters uses updateCounter.

    bind('process-s-toggle', 'showProcessS', 'checkbox');
    bind('process-c-toggle', 'showProcessC', 'checkbox');
    bind('gh-toggle', 'showGH', 'checkbox');
    bind('cortisol-toggle', 'showCortisol', 'checkbox');
    bind('caffeine-time-slider', 'caffeineTime', 'int');
    bind('blue-light-toggle', 'blueLight', 'checkbox');

    bindRadios('gender', 'gender');
    bindRadios('metabolism', 'caffeineMetabolism');


    // --- Graphics ---

    function resizeAll() {
        resizeCanvas('A');
        resizeCanvas('B');
    }

    function resizeCanvas(profileId) {
        const c = profileId === 'A' ? canvasA : canvasB;
        if (!c || c.style.display === 'none') return;

        // We need to fit container
        const container = c.parentElement;
        c.width = container.clientWidth;
        c.height = container.clientHeight;

        drawVisuals(profileId);
    }

    window.addEventListener('resize', resizeAll);

    // Re-implemented drawing functions to use passed CTX
    function drawBackground(ctx, params, timeToX, padding, height, viewStart, viewEnd) {
        let start, end;
        if (params.chronotype === 'lark') { start = 120; end = 600; }
        else if (params.chronotype === 'owl') { start = 420; end = 900; }
        else { start = 240; end = 720; }

        const x1 = Math.max(padding.left, timeToX(start));
        const x2 = Math.min(ctx.canvas.width - padding.right, timeToX(end));

        if (x2 > x1) {
            ctx.fillStyle = 'rgba(74, 222, 128, 0.05)';
            ctx.fillRect(x1, padding.top, x2 - x1, height);

            // Only draw label if visible
            if (x1 < ctx.canvas.width - padding.right && x2 > padding.left) {
                ctx.fillStyle = 'rgba(74, 222, 128, 0.5)';
                ctx.font = '10px Inter';
                ctx.textAlign = 'center';
                const labelX = (x1 + x2) / 2;
                if (labelX > padding.left && labelX < ctx.canvas.width - padding.right) {
                    ctx.fillText("Ideal Sleep Window", labelX, padding.top - 10);
                }
            }

            ctx.strokeStyle = 'rgba(74, 222, 128, 0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x1, padding.top);
            ctx.lineTo(x2, padding.top);
            ctx.stroke();
        }
    }

    function drawCurves(ctx, params, state_local, timeToX, padding, height, width, viewStart, viewEnd) {
        // TIB Marker
        const sleepStart = 240 + params.startTimeOffset;
        const sleepEnd = sleepStart + params.tib;

        if (sleepEnd >= viewStart && sleepEnd <= viewEnd) {
            const xEnd = timeToX(sleepEnd);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(xEnd, padding.top);
            ctx.lineTo(xEnd, height + padding.top);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px Inter';
            ctx.textAlign = 'center';
            // Clamp text to canvas logic? Nah, usually TIB is end of graph now.
            ctx.fillText("End of Sleep", xEnd, padding.top - 20);
            ctx.font = '10px Inter';
            ctx.fillText(`(${(params.tib / 60).toFixed(1)}h)`, xEnd, padding.top - 8);
        }

        // Models
        const models = TwoProcessModel.getCurves(params.tib, params.chronotype, state_local.caffeine, state_local.caffeineTime, state_local.caffeineMetabolism, state_local.blueLight);

        // Process S
        if (state_local.showProcessS) {
            const hoursAwakeBeforeStart = 11;
            const S_start = 1 - Math.exp(-(hoursAwakeBeforeStart * 60) / models.tau_r);

            ctx.beginPath();
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 4;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 4;

            let first = true;
            for (let t = Math.floor(viewStart); t <= Math.ceil(viewEnd); t += 5) {
                const x = timeToX(t);
                let S = 0;
                if (t < sleepStart) S = 1 - (1 - S_start) * Math.exp(-t / models.tau_r);
                else if (t < sleepEnd) {
                    const S_onset = 1 - (1 - S_start) * Math.exp(-sleepStart / models.tau_r);
                    S = S_onset * Math.exp(-(t - sleepStart) / models.tau_d);
                } else {
                    const S_end = (1 - (1 - S_start) * Math.exp(-sleepStart / models.tau_r)) * Math.exp(-(sleepEnd - sleepStart) / models.tau_d);
                    S = 1 - (1 - S_end) * Math.exp(-(t - sleepEnd) / models.tau_r);
                }

                // Caffeine Block
                const intakeTime = sleepStart - (models.caffeineTime * 60);
                let caffeineBlock = 0;
                if (models.caffeine > 0 && t >= intakeTime) {
                    const timeSinceIntake = (t - intakeTime) / 60;
                    caffeineBlock = (models.caffeine * 0.1) * Math.pow(0.5, timeSinceIntake / models.halfLife);
                }

                let effectiveS = Math.max(0, S - caffeineBlock);
                const y = (height + padding.top) - (effectiveS * height * 0.9);
                if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#facc15';
            ctx.fillText("Sleep Drive (S)", width - 50, padding.top + 20);
        }

        // Process C
        if (state_local.showProcessC) {
            ctx.beginPath();
            ctx.strokeStyle = '#a78bfa';
            ctx.lineWidth = 4;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 4;

            let first = true;
            for (let t = Math.floor(viewStart); t <= Math.ceil(viewEnd); t += 5) {
                const x = timeToX(t);
                const period = 24 * 60;
                const phase = (t - models.peakTime) / period * 2 * Math.PI;
                const C = 0.5 + 0.4 * Math.cos(phase);
                const y = (height + padding.top) - (C * height * 0.9);
                if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    function drawHormones(ctx, params, state_local, timeToX, padding, height, width, viewStart, viewEnd) {
        const sleepStart = 240 + params.startTimeOffset;
        const sleepEnd = sleepStart + params.tib;

        if (state_local.showGH) {
            ctx.beginPath();
            ctx.strokeStyle = '#2dd4bf';
            ctx.lineWidth = 3;
            ctx.shadowColor = 'rgba(45, 212, 191, 0.5)';
            ctx.shadowBlur = 8;
            let first = true;
            for (let t = Math.floor(viewStart); t <= Math.ceil(viewEnd); t += 5) {
                const x = timeToX(t);
                let gh = 0.1;
                if (t >= sleepStart && t <= sleepEnd) {
                    const timeAsleep = t - sleepStart;
                    const peak = 70; const sigma = 25;
                    const pulse = Math.exp(-Math.pow(timeAsleep - peak, 2) / (2 * Math.pow(sigma, 2)));
                    gh += pulse * 0.8;
                }
                const y = (height + padding.top) - (gh * height * 0.9);
                if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        if (state_local.showCortisol) {
            ctx.beginPath();
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 3;
            ctx.shadowColor = 'rgba(249, 115, 22, 0.5)';
            ctx.shadowBlur = 8;

            const wakeTime = sleepEnd;
            let first = true;
            for (let t = Math.floor(viewStart); t <= Math.ceil(viewEnd); t += 5) {
                const x = timeToX(t);
                let cort = 0.2;
                if (t < wakeTime - 180) { cort = 0.2; }
                else if (t <= wakeTime + 30) {
                    const progress = (t - (wakeTime - 180)) / 210;
                    cort = 0.2 + (0.7 * Math.pow(progress, 2));
                } else {
                    const timeSincePeak = t - (wakeTime + 30);
                    cort = 0.9 * Math.exp(-timeSincePeak / 180);
                }
                const y = (height + padding.top) - (cort * height * 0.9);
                if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    function drawHypnogram(ctx, canvas, simResult, state_local) {
        const { blocks, wakeEvents, params, stats } = simResult;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const padding = { top: 50, right: 30, bottom: 40, left: 60 };
        const width = canvas.width - padding.left - padding.right;
        const height = canvas.height - padding.top - padding.bottom;

        // Dynamic Viewport Calculation
        // Center on Sleep Period
        const sleepStart = 240 + params.startTimeOffset;
        const sleepEnd = sleepStart + params.tib;

        let viewStart = sleepStart - 60; // 1h buffer before
        let viewEnd = sleepEnd + 60;     // 1h buffer after

        // Ensure minimum duration (e.g. 10 hours) to prevent excessive zoom
        const minDuration = 600;
        const currentDuration = viewEnd - viewStart;
        if (currentDuration < minDuration) {
            const extra = minDuration - currentDuration;
            viewStart -= extra / 2;
            viewEnd += extra / 2;
        }

        const totalViewMins = viewEnd - viewStart;
        const timeToX = (t) => padding.left + ((t - viewStart) / totalViewMins) * width;

        const stageY = {
            [0]: padding.top,
            [1]: padding.top + height * 0.20,
            [2]: padding.top + height * 0.40,
            [3]: padding.top + height * 0.60,
            [4]: padding.top + height * 0.80
        };
        const stageColors = {
            [0]: '#ef4444',
            [1]: '#f59e0b',
            [2]: '#38bdf8',
            [3]: '#3b82f6',
            [4]: '#1d4ed8'
        };

        drawBackground(ctx, params, timeToX, padding, height, viewStart, viewEnd);

        // Grid
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '11px Inter';
        ctx.textAlign = 'center';

        // Determine grid step based on zoom? 
        // 60 mins is usually fine for 10-12h view.

        // Align to nearest hour
        const startHourMins = Math.floor(viewStart / 60) * 60;

        for (let m = startHourMins; m <= viewEnd; m += 60) {
            if (m < viewStart) continue; // Skip if before start

            const x = timeToX(m);
            // Label logic: 0 = 18:00
            const hourAbsolute = (18 + Math.floor(m / 60)) % 24;
            const label = `${hourAbsolute}:00`;

            ctx.fillText(label, x, canvas.height - 20);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.beginPath(); ctx.moveTo(x, padding.top); ctx.lineTo(x, canvas.height - padding.bottom); ctx.stroke();
        }

        // Labels (Y-Axis)
        ctx.textAlign = 'right';
        Object.keys(stageY).forEach(stage => {
            const y = stageY[stage];
            ctx.fillStyle = stageColors[stage];
            ctx.font = 'bold 11px Inter';
            ctx.fillText(["Wake", "REM", "N1", "N2", "N3"][stage], padding.left - 10, y + 4);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(canvas.width - padding.right, y); ctx.stroke();
        });

        // Blocks
        blocks.forEach(block => {
            // Clip? Or just let canvas handle it (since timeToX can go out of bounds)
            // Canvas handles out of bounds drawing fine usually, but gradients might be weird.
            // Let's check overlaps.
            const bStart = block.start;
            const bEnd = block.start + block.duration;

            if (bEnd < viewStart || bStart > viewEnd) return; // Out of view

            const x = timeToX(Math.max(viewStart, bStart));
            const xEndBox = timeToX(Math.min(viewEnd, bEnd));
            const w = xEndBox - x;

            if (w < 0.5) return;

            const y = stageY[block.stage];
            const h = (canvas.height - padding.bottom) - y;

            const grad = ctx.createLinearGradient(x, y, x, canvas.height - padding.bottom);
            grad.addColorStop(0, stageColors[block.stage]);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.globalAlpha = 0.6;
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = stageColors[block.stage];
            ctx.fillRect(x, y - 1, w, 4);
        });

        // Wake Events
        ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
        wakeEvents.forEach(wake => {
            if (wake.time < viewStart || wake.time > viewEnd) return;
            const x = timeToX(wake.time);
            ctx.beginPath(); ctx.moveTo(x, padding.top); ctx.lineTo(x, height + padding.top);
            ctx.strokeStyle = '#ef4444'; ctx.stroke();
        });
        ctx.globalAlpha = 1.0;

        drawCurves(ctx, params, state_local, timeToX, padding, height, width, viewStart, viewEnd);
        drawHormones(ctx, params, state_local, timeToX, padding, height, width, viewStart, viewEnd);
    }

    function drawPieChart(profileId, stats) {
        const c = profileId === 'A' ? pieCanvasA : pieCanvasB;
        if (!c) return;
        const ctx = c.getContext('2d');
        const width = c.width; const height = c.height;

        const radius = Math.min(width, height) / 2;
        const centerX = width / 2; const centerY = height / 2;

        ctx.clearRect(0, 0, width, height);
        const data = [
            { label: 'N3', value: stats.n3P, color: '#1d4ed8' },
            { label: 'REM', value: stats.remP, color: '#f59e0b' },
            { label: 'N2', value: stats.n2P, color: '#3b82f6' },
            { label: 'N1', value: stats.n1P, color: '#38bdf8' },
            { label: 'Wake', value: stats.wasoMins / stats.tst, color: '#ef4444' }
        ];

        const total = data.reduce((sum, item) => sum + item.value, 0);
        let startAngle = -Math.PI / 2;
        data.forEach(slice => {
            const sliceAngle = (slice.value / total) * 2 * Math.PI;
            ctx.beginPath(); ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            ctx.fillStyle = slice.color; ctx.fill();
            startAngle += sliceAngle;
        });

        // HTML Metrics
        const suffix = profileId === 'A' ? '' : '-b';
        const legendEl = document.getElementById('pie-legend' + suffix);
        if (legendEl) {
            legendEl.innerHTML = data.map(d => `
                <div class="legend-item">
                    <div class="legend-color" style="background: ${d.color}"></div>
                    <span>${d.label}: ${Math.round((d.value / total) * 100)}%</span>
                </div>
            `).join('');
        }
        const metricsEl = document.getElementById('metrics-display' + suffix);
        if (metricsEl) {
            const se = stats.sleepEfficiency;
            const seColor = se < 75 ? '#ef4444' : (se < 85 ? '#facc15' : '#4ade80');
            metricsEl.innerHTML = `
                <div class="metric-card"><div class="metric-value">${(stats.tib / 60).toFixed(1)}h</div><div class="metric-label">Time in Bed</div></div>
                <div class="metric-card"><div class="metric-value">${(stats.tst / 60).toFixed(1)}h</div><div class="metric-label">Total Sleep</div></div>
                <div class="metric-card"><div class="metric-value" style="color: ${seColor}">${Math.round(se)}%</div><div class="metric-label">Efficiency</div></div>
                <div class="metric-card"><div class="metric-value">${Math.round(stats.latency)}m</div><div class="metric-label">Latency</div></div>
                <div class="metric-card"><div class="metric-value">${Math.round(stats.wasoMins)}m</div><div class="metric-label">WASO</div></div>
            `;
        }
    }

    function runSimulation(profileId) {
        if (!states[profileId]) return;
        try {
            cachedSimulations[profileId] = generator.generate(states[profileId]);
            drawVisuals(profileId);
        } catch (e) {
            console.error('Sim Error', e);
        }
    }

    function drawVisuals(profileId) {
        const result = cachedSimulations[profileId];
        if (!result) { runSimulation(profileId); return; }

        const c = profileId === 'A' ? canvasA : canvasB;
        if (!c) return;
        drawHypnogram(c.getContext('2d'), c, result, states[profileId]);
        drawPieChart(profileId, result.stats);
    }

    resizeAll();
    runSimulation('A');
});
