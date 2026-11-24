/**
 * Sleep Age Simulator v3, brain window: pure maths.
 *
 * Region fields on the fsaverage5 template cortex, age curves, and the
 * per-frame intensity of each EEG signature (docs/stage2-brain-brief.md,
 * sections D4 and D5). No DOM, no three.js, no randomness: every "random"
 * choice comes from a deterministic hash of the slot number, so the same
 * inputs always give the same picture.
 *
 * Every brightness here is a drawing choice and ordinal only: brighter
 * means more, and that is all it means.
 */

// Same values as STAGES in app.js. -1 means out of bed.
export const STAGE = { OUT: -1, WAKE: 0, REM: 1, N1: 2, N2: 3, N3: 4 };

// ---------------------------------------------------------------- helpers
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const g = (d, s) => Math.exp(-0.5 * d * d / (s * s));
export const hash = (k, salt) => { const x = Math.sin(k * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); };

// Linear, clamped at both ends (same as ScientificConstants.interp).
export function interp(v, kf) {
    if (v <= kf[0][0]) return kf[0][1];
    if (v >= kf[kf.length - 1][0]) return kf[kf.length - 1][1];
    for (let i = 0; i < kf.length - 1; i++) {
        const [a1, v1] = kf[i], [a2, v2] = kf[i + 1];
        if (v >= a1 && v <= a2) return v1 + ((v - a1) / (a2 - a1)) * (v2 - v1);
    }
    return kf[kf.length - 1][1];
}

// ---------------------------------------------------------------- age curves (D4)
export const KF = {
    swAmp: [[1, 0.85], [3, 0.95], [6, 1.0], [10, 1.0], [13, 0.92], [17, 0.80], [25, 0.75], [40, 0.65], [60, 0.52], [75, 0.42], [90, 0.36]],
    swFocus: [[2, 0.20], [5, 0.30], [8, 0.45], [11, 0.55], [14, 0.68], [17, 0.78], [20, 0.80]],
    spDensity: [[1, 0.50], [4, 0.60], [9, 0.85], [14, 1.0], [20, 0.95], [40, 0.80], [60, 0.62], [80, 0.45], [100, 0.40]],
    spAmp: [[1, 1.0], [18, 1.0], [40, 0.85], [60, 0.70], [80, 0.55]],
    spFastShare: [[2, 0.20], [10, 0.45], [18, 0.60]],
};
export const swAmp = (age) => interp(age, KF.swAmp);
export const swFocus = (age) => interp(age, KF.swFocus);
export const swFrontLoss = (age) => 0.35 * clamp((age - 30) / 45, 0, 1);
export const spDensity = (age) => interp(age, KF.spDensity);
export const spAmp = (age) => interp(age, KF.spAmp);
export const spFastShare = (age) => interp(age, KF.spFastShare);

// Slow-wave origins in mm (X left to right, Y anterior, Z up) and their weights.
export const ORIGINS = [
    { name: 'left frontal', c: [-25, 50, 25], w: 0.30, frontal: true },
    { name: 'right frontal', c: [25, 50, 25], w: 0.30, frontal: true },
    { name: 'frontal midline', c: [0, 60, 10], w: 0.15, frontal: true },
    { name: 'centro-parietal midline', c: [0, -30, 70], w: 0.15, frontal: false },
    { name: 'posterior midline', c: [0, -80, 30], w: 0.10, frontal: false },
];
const CUM = ORIGINS.reduce((a, o) => { a.push((a.length ? a[a.length - 1] : 0) + o.w); return a; }, []);

// ---------------------------------------------------------------- mesh
// Header: uint32 LE length n, n bytes of JSON {left:{nv,nf,v,f,s}, right:{...}},
// then the data block; offsets are relative to 4 + n. Copies, so alignment never matters.
export function decodeMesh(buf) {
    const n = new DataView(buf).getUint32(0, true);
    const H = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
    const o = 4 + n;
    const out = {};
    for (const h of ['left', 'right']) {
        const d = H[h];
        out[h] = {
            nv: d.nv, nf: d.nf,
            pos: new Float32Array(buf.slice(o + d.v, o + d.v + d.nv * 12)),
            faces: new Uint16Array(buf.slice(o + d.f, o + d.f + d.nf * 6)),
            sulc: new Int8Array(buf.slice(o + d.s, o + d.s + d.nv)),
        };
    }
    return out;
}

// Static fields for one hemisphere, computed once (D4).
export function buildFields(hemi) {
    const N = hemi.nv, P = hemi.pos;
    const f = () => new Float32Array(N);
    const F = {
        n: N, X: f(), Y: f(), Z: f(), ap: f(), dors: f(), med: f(), shade: f(), alpha: f(),
        spSlow: f(), spFast: f(), vtx: f(), remUp: f(), remDown: f(), dist: ORIGINS.map(f),
    };
    for (let i = 0; i < N; i++) {
        const X = 75 * P[3 * i], Y = 75 * P[3 * i + 2], Z = 75 * P[3 * i + 1];
        const aX = Math.abs(X);
        const blob = (c, s) => g(Math.hypot(aX - c[0], Y - c[1], Z - c[2]), s);
        const ap = clamp((Y + 105) / 175, 0, 1);
        const med = 1 - ss(6, 16, aX);
        F.X[i] = X; F.Y[i] = Y; F.Z[i] = Z;
        F.ap[i] = ap;
        F.dors[i] = ss(-25, 25, Z);
        F.med[i] = med;
        F.shade[i] = (hemi.sulc[i] + 128) / 255;
        F.alpha[i] = (1 - ss(0.12, 0.40, ap)) * (0.55 + 0.45 * ss(-30, 10, Z));
        F.spSlow[i] = g(ap - 0.80, 0.12) * ss(0, 35, Z);
        F.spFast[i] = g(ap - 0.40, 0.11) * ss(15, 50, Z);
        F.vtx[i] = g(Math.hypot(X, Y + 15, Z - 75), 16);
        F.remUp[i] = Math.min(1, blob([6, 36, 12], 16) * med + blob([24, -22, -22], 14) + blob([40, -68, -10], 18));
        F.remDown[i] = Math.min(1, blob([42, 30, 30], 20) + blob([52, -45, 40], 18) + blob([6, -55, 35], 18) * med);
        ORIGINS.forEach((o, k) => { F.dist[k][i] = Math.hypot(X - o.c[0], Y - o.c[1], Z - o.c[2]) / 175; });
    }
    return F;
}

// Per-age slow-wave field, recomputed only when the age changes.
export function swTopo(F, age, out = new Float32Array(F.n)) {
    const focus = swFocus(age), loss = swFrontLoss(age);
    for (let i = 0; i < F.n; i++) {
        out[i] = (0.30 + 0.70 * g(F.ap[i] - focus, 0.28)) * (0.45 + 0.55 * F.dors[i]) * (1 - loss * ss(0.50, 0.85, F.ap[i]));
    }
    return out;
}

// ---------------------------------------------------------------- gains (D5)
const ZERO = { alpha: 0, vtx: 0, sp: 0, sw: 0, rem: 0 };
export const TARGETS = {
    [STAGE.WAKE]: { alpha: 1, vtx: 0, sp: 0, sw: 0, rem: 0 },
    [STAGE.N1]: { alpha: 0.2, vtx: 1, sp: 0, sw: 0, rem: 0 },
    [STAGE.N2]: { alpha: 0, vtx: 0, sp: 1, sw: 1, rem: 0 },
    [STAGE.N3]: { alpha: 0, vtx: 0, sp: 0.77, sw: 1, rem: 0 },
    [STAGE.REM]: { alpha: 0, vtx: 0, sp: 0, sw: 0, rem: 1 },
};
export const targetGains = (stage, infant) => (infant || !(stage in TARGETS) ? ZERO : TARGETS[stage]);
export const newGains = (stage, infant) => ({ ...targetGains(stage, infant) });

// Each gain eases toward its target with a 0.25 s time constant; snaps when within 0.001.
export function easeGains(gn, target, dt) {
    const k = 1 - Math.exp(-Math.max(0, dt) / 0.25);
    for (const key in ZERO) {
        gn[key] += (target[key] - gn[key]) * k;
        if (Math.abs(target[key] - gn[key]) < 1e-3) gn[key] = target[key];
    }
    return gn;
}

// Night pressure, with the model's own tau_d of 252 minutes.
export const pressure = (t, sleepOnset) => Math.exp(-Math.max(0, t - sleepOnset) / 252);

// Arousal flush, s = seconds since it started: linear rise in 0.12 s, then a 0.4 s decay.
export function flushAt(s) {
    if (s < 0) return 0;
    if (s < 0.12) return s / 0.12;
    return Math.exp(-(s - 0.12) / 0.4);
}

// ---------------------------------------------------------------- event slots (D5)
export const SW_SLOT = 1.25, SP_SLOT = 2.5, VX_SLOT = 3;

export function slowSlot(k, stage, age, pres) {
    const amp = swAmp(age) * (0.45 + 0.55 * pres);
    const prob = stage === STAGE.N3 ? 0.45 + 0.55 * amp : 0.10; // N2: an occasional K-complex
    const fires = hash(k, 1) < prob;
    const h = hash(k, 2);
    let origin = CUM.findIndex((c) => h < c);
    if (origin < 0) origin = ORIGINS.length - 1;
    return { k, fires, origin, onset: SW_SLOT * k + 0.10 + 0.25 * hash(k, 3), size: amp * (0.80 + 0.20 * hash(k, 4)) };
}

export function spindleSlot(j, gSp, age) {
    return {
        j, fires: hash(j, 5) < 0.42 * gSp * spDensity(age), fast: hash(j, 6) < spFastShare(age),
        onset: SP_SLOT * j + 0.20 + 0.60 * hash(j, 7),
    };
}

export function vertexSlot(m) {
    return { m, fires: hash(m, 8) < 0.4, onset: VX_SLOT * m + 0.5 + 1.5 * hash(m, 9) };
}

/**
 * Everything that is the same for every vertex in one frame of one panel.
 * inp = { stage, age, infant, t, sleepOnset, rt, flush, gains }
 */
export function frameScalars(inp) {
    const { stage, age, infant, t, sleepOnset, rt } = inp;
    const G = inp.gains || targetGains(stage, infant);
    const off = infant || stage === STAGE.OUT;
    const flush = off ? 0 : clamp(inp.flush || 0, 0, 1);
    const pres = pressure(t, sleepOnset);

    // Slow waves: the current slot, plus the tail of the previous one so a wave
    // that is still fading at a slot boundary does not vanish in one frame.
    const waves = [];
    if (!off && G.sw > 0) {
        const k = Math.floor(rt / SW_SLOT);
        for (const kk of [k - 1, k]) {
            const s = slowSlot(kk, stage, age, pres);
            if (s.fires && rt >= s.onset) waves.push(s);
        }
    }

    let spEnv = 0, spFast = false;
    if (!off && G.sp > 0) {
        const s = spindleSlot(Math.floor(rt / SP_SLOT), G.sp, age);
        const u = (rt - s.onset) / 1.0;
        if (s.fires && u > 0 && u < 1) { spEnv = Math.sin(Math.PI * u) ** 2; spFast = s.fast; }
    }

    let vxAmp = 0;
    if (!off && G.vtx > 0) {
        const s = vertexSlot(Math.floor(rt / VX_SLOT));
        if (s.fires) vxAmp = G.vtx * g(rt - s.onset, 0.12) * 0.8;
    }

    return {
        rt, gains: G, flush, pres, waves, spEnv, spFast, spAmp: spAmp(age), vxAmp,
        alMod: 0.55 + 0.15 * Math.sin(2 * Math.PI * rt / 3.1) + 0.10 * Math.sin(2 * Math.PI * rt / 1.3),
        upMod: 0.75 + 0.10 * Math.sin(2 * Math.PI * rt / 5),
    };
}

// Layer intensities at vertex i, written into o = { sw, sp, al, vx, up, dn, fl }.
export function layerAt(F, topo, S, i, o) {
    const G = S.gains, nf = 1 - S.flush;
    let sw = 0;
    for (let w = 0; w < S.waves.length; w++) {
        const W = S.waves[w];
        const p = (S.rt - W.onset) - 0.60 * F.dist[W.origin][i];
        if (p < -0.6) continue;
        const crest = Math.min(1, g(p, 0.11) + (p > 0 ? 0.20 * Math.exp(-p / 0.5) : 0));
        const v = G.sw * nf * crest * topo[i] * W.size;
        if (v > sw) sw = v;
    }
    o.sw = sw;
    o.sp = S.spEnv > 0 ? nf * S.spEnv * (S.spFast ? F.spFast[i] : F.spSlow[i]) * S.spAmp * 0.9 : 0;
    o.al = G.alpha * F.alpha[i] * S.alMod;
    o.vx = S.vxAmp * F.vtx[i];
    o.up = G.rem * F.remUp[i] * S.upMod;
    o.dn = G.rem * F.remDown[i] * 0.6;
    o.fl = 0.35 * S.flush * (0.4 + 0.6 * F.dors[i]);
    return o;
}

// All layers for one hemisphere as arrays (used by the tests).
export function layers(F, topo, S) {
    const L = { sw: new Float32Array(F.n), sp: new Float32Array(F.n), al: new Float32Array(F.n), vx: new Float32Array(F.n), up: new Float32Array(F.n), dn: new Float32Array(F.n), fl: new Float32Array(F.n) };
    const o = {};
    for (let i = 0; i < F.n; i++) {
        layerAt(F, topo, S, i, o);
        for (const k in L) L[k][i] = o[k];
    }
    return L;
}

// ---------------------------------------------------------------- colour (C7, D5)
// sRGB hex to linear RGB, as THREE.Color.setHex does with colour management on.
const toLin = (c) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
export function hexToLinear(hex) {
    const v = parseInt(hex.replace('#', ''), 16);
    return [toLin(((v >> 16) & 255) / 255), toLin(((v >> 8) & 255) / 255), toLin((v & 255) / 255)];
}
export const HEX = {
    GYRUS: '#454c63', SULCUS: '#1b2132', SLOW: '#8B7CFF', SLOW_CREST: '#EDE9FF', SPINDLE: '#3DF0C2',
    ALPHA: '#f87171', VERTEX: '#38bdf8', REM_UP: '#f59e0b', REM_DOWN: '#5b8def',
};
export const PALETTE = Object.fromEntries(Object.entries(HEX).map(([k, h]) => [k, hexToLinear(h)]));

// Writes linear RGB per vertex into out (length 3n). Order as in D5.
export function paintHemi(F, topo, S, out, P = PALETTE) {
    const o = {};
    const [sr, sg, sb] = P.SULCUS, [gr, gg, gb] = P.GYRUS;
    let r, gC, b;
    const mix = (c, a) => {
        if (a <= 0) return;
        if (a > 1) a = 1;
        r += (c[0] - r) * a; gC += (c[1] - gC) * a; b += (c[2] - b) * a;
    };
    for (let i = 0; i < F.n; i++) {
        layerAt(F, topo, S, i, o);
        const sh = F.shade[i];
        r = sr + (gr - sr) * sh; gC = sg + (gg - sg) * sh; b = sb + (gb - sb) * sh;
        mix(P.REM_DOWN, o.dn);
        mix(P.ALPHA, o.al);
        mix(P.VERTEX, o.vx);
        mix(P.SLOW, 1.05 * o.sw);
        if (o.sw > 0.8) mix(P.SLOW_CREST, (o.sw - 0.8) * 2.5);
        mix(P.SPINDLE, o.sp);
        mix(P.REM_UP, 0.85 * o.up);
        mix(P.ALPHA, o.fl);
        out[3 * i] = r; out[3 * i + 1] = gC; out[3 * i + 2] = b;
    }
    return out;
}
