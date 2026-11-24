#!/usr/bin/env node
/**
 * Tests for brain-map.js (docs/stage2-brain-brief.md, section D10).
 * Usage: node tests/brain-map.mjs    exits 1 on any failure.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as B from '../brain-map.js';

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, '..', 'vendor', 'fsaverage5.bin'));
const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length);
const { STAGE } = B;

let checks = 0, failures = 0;
function check(name, ok, detail = '') {
    checks++;
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
}
const fmt = (x, d = 3) => Number(x).toFixed(d);

// ---------------------------------------------------------------- 1. mesh
const mesh = B.decodeMesh(buf);
for (const h of ['left', 'right']) {
    const m = mesh[h];
    let maxIdx = 0;
    for (let i = 0; i < m.faces.length; i++) if (m.faces[i] > maxIdx) maxIdx = m.faces[i];
    check(`1 ${h}: 10242 vertices, 20480 faces, indices < 10242`,
        m.nv === 10242 && m.pos.length === 10242 * 3 && m.nf === 20480 && m.faces.length === 20480 * 3 && maxIdx < 10242,
        `nv ${m.nv}, nf ${m.nf}, max index ${maxIdx}`);
}

const F = { left: B.buildFields(mesh.left), right: B.buildFields(mesh.right) };
const HEMIS = ['left', 'right'];

// Concatenate a per-vertex quantity over both hemispheres.
const both = (fn) => HEMIS.flatMap((h) => Array.from({ length: F[h].n }, (_, i) => fn(F[h], i, h)));
const nearest = (F, x, y, z) => {
    let best = -1, bd = Infinity;
    for (let i = 0; i < F.n; i++) {
        const d = Math.hypot(F.X[i] - x, F.Y[i] - y, F.Z[i] - z);
        if (d < bd) { bd = d; best = i; }
    }
    return best;
};
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);

// ---------------------------------------------------------------- 2. field sanity
{
    const apFront = both((f, i) => (f.Y[i] > 40 ? f.ap[i] : null)).filter((v) => v !== null);
    check('2a mean ap over Y > 40 is above 0.8', mean(apFront) > 0.8, fmt(mean(apFront)));

    const aOcc = [], aFr = [];
    for (const h of HEMIS) {
        const s = h === 'left' ? -1 : 1;
        aOcc.push(F[h].alpha[nearest(F[h], s * 20, -95, 5)]);
        aFr.push(F[h].alpha[nearest(F[h], s * 30, 40, 30)]);
    }
    check('2b alpha > 0.5 near (+-20, -95, 5)', aOcc.every((v) => v > 0.5), aOcc.map((v) => fmt(v)).join(', '));
    check('2c alpha < 0.05 near (+-30, 40, 30)', aFr.every((v) => v < 0.05), aFr.map((v) => fmt(v)).join(', '));

    const wY = (key) => {
        let s = 0, w = 0;
        for (const h of HEMIS) for (let i = 0; i < F[h].n; i++) { s += F[h][key][i] * F[h].Y[i]; w += F[h][key][i]; }
        return s / w;
    };
    const ySlow = wY('spSlow'), yFast = wY('spFast');
    check('2d spSlow weighted mean Y at least 40 mm in front of spFast', ySlow - yFast >= 40, `${fmt(ySlow, 1)} vs ${fmt(yFast, 1)} mm`);

    const overlap = both((f, i) => (f.remUp[i] > 0.3 && f.remDown[i] > 0.3 ? 1 : 0));
    check('2e remUp and remDown both above 0.3 on under 2% of vertices', mean(overlap) < 0.02, `${fmt(100 * mean(overlap), 2)}%`);
}

// ---------------------------------------------------------------- slow-wave helpers
const settled = (stage, infant = false) => B.newGains(stage, infant);

// Fired N3 slots for an age and pressure, first `count` of them from k = 0.
function firedSlots(stage, age, pres, count, maxK = 100000) {
    const out = [];
    let tried = 0;
    for (let k = 0; out.length < count && k < maxK; k++) {
        tried++;
        const s = B.slowSlot(k, stage, age, pres);
        if (s.fires) out.push(s);
    }
    return { slots: out, share: out.length / tried };
}

// Peak Isw per vertex during one slot, sampled every 20 ms; every 3rd vertex.
const STRIDE = 3;
function peakField(age, slot, pres) {
    const res = {};
    for (const h of HEMIS) {
        const f = F[h], topo = B.swTopo(f, age);
        const peak = new Float32Array(f.n);
        const S0 = { rt: 0, gains: settled(STAGE.N3), flush: 0, waves: [slot] };
        for (let rt = slot.onset; rt < slot.onset + 1.0; rt += 0.02) {
            S0.rt = rt;
            for (let i = 0; i < f.n; i += STRIDE) {
                const p = (rt - slot.onset) - 0.6 * f.dist[slot.origin][i];
                const crest = Math.min(1, B.g(p, 0.11) + (p > 0 ? 0.2 * Math.exp(-p / 0.5) : 0));
                const v = crest * topo[i] * slot.size;
                if (v > peak[i]) peak[i] = v;
            }
        }
        res[h] = peak;
    }
    return res;
}

function regionMeans(age, pres, nSlots, regions) {
    const { slots } = firedSlots(STAGE.N3, age, pres, nSlots);
    const sums = regions.map(() => 0), counts = regions.map(() => 0);
    for (const s of slots) {
        const pk = peakField(age, s, pres);
        for (const h of HEMIS) {
            const f = F[h];
            for (let i = 0; i < f.n; i += STRIDE) {
                regions.forEach((r, ri) => { if (r(f, i)) { sums[ri] += pk[h][i]; counts[ri]++; } });
            }
        }
    }
    return sums.map((s, i) => s / counts[i]);
}

// Make sure layerAt agrees with the sampled formula used above (same crest maths).
{
    const { slots } = firedSlots(STAGE.N3, 25, 1, 1);
    const s = slots[0];
    const f = F.left, topo = B.swTopo(f, 25);
    const i = nearest(f, -25, 50, 25);
    const S = { rt: s.onset + 0.6 * f.dist[s.origin][i], gains: settled(STAGE.N3), flush: 0, waves: [s], spEnv: 0, spAmp: 1, vxAmp: 0, alMod: 0, upMod: 0 };
    const o = B.layerAt(f, topo, S, i, {});
    check('3pre layerAt crest peak equals topo * size at p = 0', Math.abs(o.sw - topo[i] * s.size) < 1e-6, `${fmt(o.sw)} vs ${fmt(topo[i] * s.size)}`);
}

// ---------------------------------------------------------------- 3 and 4. topography by age
{
    const frontal = (f, i) => f.ap[i] > 0.7 && f.Z[i] > 20;
    const occipital = (f, i) => f.ap[i] < 0.2;
    const [fr, oc] = regionMeans(25, 1, 200, [frontal, occipital]);
    check('3 age 25: frontal peak slow-wave mean at least 30% above occipital', fr >= 1.3 * oc, `frontal ${fmt(fr)}, occipital ${fmt(oc)}, ratio ${fmt(fr / oc, 2)}`);

    const post = (f, i) => f.ap[i] < 0.35;
    const [fr4, po4] = regionMeans(4, 1, 200, [frontal, post]);
    check('4 age 4: occipital and parietal mean above frontal', po4 > fr4, `posterior ${fmt(po4)}, frontal ${fmt(fr4)}`);
}

// ---------------------------------------------------------------- 5 and 6. size and number by age and pressure
function meanIsw(age, pres, seconds = 60, step = 1 / 30) {
    // Mean over time and over (every 3rd) vertex of Isw, N3, settled gains.
    const f = F.right, topo = B.swTopo(f, age);
    const o = {};
    let s = 0, n = 0;
    const t = -252 * Math.log(pres); // the moment that gives this night pressure
    for (let rt = 0; rt < seconds; rt += step) {
        const S2 = B.frameScalars({ stage: STAGE.N3, age, infant: false, t, sleepOnset: 0, rt, flush: 0, gains: settled(STAGE.N3) });
        for (let i = 0; i < f.n; i += STRIDE) { B.layerAt(f, topo, S2, i, o); s += o.sw; n++; }
    }
    return s / n;
}
{
    const m75 = meanIsw(75, 1), m25 = meanIsw(25, 1), m8 = meanIsw(8, 1);
    check('5a mean slow-wave intensity: age 75 < 25 < 8', m75 < m25 && m25 < m8, `${fmt(m75, 4)} < ${fmt(m25, 4)} < ${fmt(m8, 4)}`);
    const sh = (age) => firedSlots(STAGE.N3, age, 1, 1e9, 2000).share;
    const s75 = sh(75), s25 = sh(25), s8 = sh(8);
    check('5b share of fired slots: age 75 < 25 < 8', s75 < s25 && s25 < s8, `${fmt(s75)} < ${fmt(s25)} < ${fmt(s8)}`);

    const lo = meanIsw(25, 0.2), hi = meanIsw(25, 1);
    const shLo = firedSlots(STAGE.N3, 25, 0.2, 1e9, 2000).share, shHi = firedSlots(STAGE.N3, 25, 1, 1e9, 2000).share;
    check('6 pres 0.2 gives lower intensity and fewer fired slots than pres 1', lo < hi && shLo < shHi, `intensity ${fmt(lo, 4)} < ${fmt(hi, 4)}, share ${fmt(shLo)} < ${fmt(shHi)}`);
}

// ---------------------------------------------------------------- 7. origins
{
    const { slots } = firedSlots(STAGE.N3, 25, 1, 2000);
    const share = slots.filter((s) => B.ORIGINS[s.origin].frontal).length / slots.length;
    check('7 fired N3 slots: 70% to 80% from a frontal origin', share >= 0.70 && share <= 0.80, `${fmt(100 * share, 1)}% of ${slots.length}`);
}

// ---------------------------------------------------------------- 8. stage gating
{
    const f = F.left, topo = B.swTopo(f, 30);
    const maxOver = (stage, keys) => {
        // Start from the N3 gains and let them settle toward the stage's targets.
        const gains = settled(STAGE.N3);
        for (let s = 0; s < 120; s++) B.easeGains(gains, B.targetGains(stage, false), 1 / 30);
        let m = 0;
        for (let rt = 0; rt < 30; rt += 1 / 20) {
            const S = B.frameScalars({ stage, age: 30, infant: false, t: 60, sleepOnset: 0, rt, flush: 0, gains });
            const L = B.layers(f, topo, S);
            for (const k of keys) for (let i = 0; i < f.n; i++) if (L[k][i] > m) m = L[k][i];
        }
        return m;
    };
    for (const [name, st] of [['REM', STAGE.REM], ['Wake', STAGE.WAKE], ['N1', STAGE.N1], ['out of bed', STAGE.OUT]]) {
        const m = maxOver(st, ['sw', 'sp']);
        check(`8 ${name}: Isw and Isp are zero after the gains settle`, m === 0, `max ${m}`);
    }
    for (const [name, st] of [['N3', STAGE.N3], ['N2', STAGE.N2]]) {
        const m = maxOver(st, ['al', 'up', 'dn']);
        check(`8 ${name}: Ial, Iup and Idn are zero`, m === 0, `max ${m}`);
    }
}

// ---------------------------------------------------------------- 9. spindle counts
{
    const count = (age, gSp) => {
        let n = 0;
        for (let j = 0; j < 600 / B.SP_SLOT; j++) if (B.spindleSlot(j, gSp, age).fires) n++;
        return n;
    };
    const c14 = count(14, 1), c40 = count(40, 1), c80 = count(80, 1);
    check('9a spindles in 600 s: age 14 > 40 > 80', c14 > c40 && c40 > c80, `${c14} > ${c40} > ${c80}`);
    const n2 = count(30, 1), n3 = count(30, 0.77);
    const ratio = n3 / n2;
    check('9b N3 spindle count about 0.77 of N2, within 15%', Math.abs(ratio / 0.77 - 1) <= 0.15, `${n3} / ${n2} = ${fmt(ratio)}`);
}

// ---------------------------------------------------------------- 10. infant
{
    let m = 0;
    for (const st of [STAGE.WAKE, STAGE.REM, STAGE.N1, STAGE.N2, STAGE.N3]) {
        const gains = B.newGains(st, true);
        for (const h of HEMIS) {
            const topo = B.swTopo(F[h], 0);
            for (let rt = 0; rt < 10; rt += 0.1) {
                const S = B.frameScalars({ stage: st, age: 0, infant: true, t: 30, sleepOnset: 0, rt, flush: 1, gains });
                const L = B.layers(F[h], topo, S);
                for (const k in L) for (let i = 0; i < F[h].n; i++) if (L[k][i] > m) m = L[k][i];
            }
        }
    }
    check('10 infant: every intensity is zero, flush included', m === 0, `max ${m}`);
}

// ---------------------------------------------------------------- 11. determinism
{
    const run = () => {
        const f = F.right, topo = B.swTopo(f, 42);
        const out = new Float32Array(f.n * 3);
        const S = B.frameScalars({ stage: STAGE.N3, age: 42, infant: false, t: 90, sleepOnset: 10, rt: 17.37, flush: 0.3, gains: settled(STAGE.N3) });
        return B.paintHemi(f, topo, S, out);
    };
    const a = run(), b = run();
    let same = a.length === b.length;
    for (let i = 0; same && i < a.length; i++) if (a[i] !== b[i]) same = false;
    check('11 same inputs give identical colour arrays', same);
}

// ---------------------------------------------------------------- 12. flash safety
{
    const f = F.right;
    const lum = (out) => {
        let s = 0;
        for (let i = 0; i < f.n; i++) s += 0.2126 * out[3 * i] + 0.7152 * out[3 * i + 1] + 0.0722 * out[3 * i + 2];
        return s / f.n;
    };
    const ages = [4, 25, 80];
    let worst = 0, worstName = '';
    for (const [name, st] of [['Wake', STAGE.WAKE], ['N1', STAGE.N1], ['N2', STAGE.N2], ['N3', STAGE.N3], ['REM', STAGE.REM]]) {
        for (const age of ages) {
            const topo = B.swTopo(f, age);
            const out = new Float32Array(f.n * 3);
            const series = [];
            const gains = settled(st);
            for (let fr = 0; fr < 60 * 60; fr++) {
                const rt = fr / 60;
                const S = B.frameScalars({ stage: st, age, infant: false, t: 30, sleepOnset: 0, rt, flush: 0, gains });
                series.push(lum(B.paintHemi(f, topo, S, out)));
            }
            const mu = mean(series), lo = Math.min(...series), hi = Math.max(...series);
            const thr = mu + 0.2 * (hi - lo);
            const ups = [];
            for (let i = 1; i < series.length; i++) if (series[i - 1] < thr && series[i] >= thr) ups.push(i / 60);
            let maxInWindow = 0;
            for (let a = 0, b = 0; b < ups.length; b++) {
                while (ups[b] - ups[a] >= 1) a++;
                maxInWindow = Math.max(maxInWindow, b - a + 1);
            }
            if (maxInWindow > worst) { worst = maxInWindow; worstName = `${name}, age ${age}`; }
        }
    }
    check('12 flash safety: never more than 3 brightness rises in any 1 s window', worst <= 3, `worst ${worst} (${worstName})`);
}

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
