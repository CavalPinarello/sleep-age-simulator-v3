/**
 * Sleep Age Simulator v3, brain window (docs/stage2-brain-brief.md, D7 and D8).
 *
 * Strip UI, three.js scene, render loop, rotation and fallback. The maths is
 * in brain-map.js. app.js never depends on this file: if it fails to load,
 * the strips stay hidden and the simulator works as before.
 */
import * as M from './brain-map.js';

window.SleepSimBrain = { loaded: true, contexts: 0, frames: 0 };

const Q = new URLSearchParams(location.search);
const HOOK_RT = Q.has('rt') ? parseFloat(Q.get('rt')) : NaN;
const HOOK_VIEW = Q.get('view');
const HOOK_BRAIN = Q.get('brain');
const SHOW_STATS = Q.get('stats') === '1';

const VIEWS = { top: [0.72, -0.38], side: [-0.35, -Math.PI / 2], inside: [-0.35, Math.PI / 2] };
const CEN = [0, 0.2, 0.24];
const STORE_KEY = 'sas.brain';
const reducedMQ = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

const MSG = {
    webgl: 'The 3D brain needs WebGL, which is not available in this browser.',
    file: 'The 3D brain needs the page to be opened from a web server, for example python3 -m http.server.',
    load: 'The 3D brain could not be loaded.',
};

const CAPTION = {
    out: 'Awake and out of bed. The simulation covers time in bed.',
    0: 'Awake with eyes closed. Alpha rhythm, 8 to 12 Hz, over the back of the head.',
    2: 'Drowsy. Alpha fades and the EEG flattens. Brief vertex waves at the top of the head.',
    3: 'Light sleep. Spindles come in bursts from the thalamus, slower at the front and faster over the centre. Now and then a single K-complex sweeps across.',
    4: 'Deep sleep. Large slow waves about once a second, most starting at the front and sweeping back.',
    1: 'REM sleep. The EEG looks close to waking. Colours show blood flow in PET studies: limbic and visual association areas up, lateral prefrontal and parietal areas down. Turn to Inside for the limbic areas.',
    child: 'In children the largest waves sit further back.',
    older: 'With age the waves get smaller and fewer, most of all at the front.',
    newborn: 'Newborn sleep is not drawn. Spindles have not appeared yet, slow waves are not yet organised front to back, and this is an adult template brain.',
};

const NAMES = {
    0: ['Wake', 'awake in bed'], 1: ['REM', 'dreaming sleep'], 2: ['N1', 'drowsy'], 3: ['N2', 'light sleep'], 4: ['N3', 'deep sleep'],
};
const INFANT_NAMES = { 0: ['Wake', 'awake in bed'], 1: ['Active (REM)', ''], 3: ['Quiet (NREM)', ''] };

const LEGEND = {
    0: [['ALPHA', 'Alpha rhythm']],
    2: [['VERTEX', 'Vertex waves'], ['ALPHA', 'Fading alpha']],
    3: [['SPINDLE', 'Spindles'], ['SLOW', 'K-complexes']],
    4: [['SLOW', 'Slow waves'], ['SPINDLE', 'Spindles']],
    1: [['REM_UP', 'More active than awake'], ['REM_DOWN', 'Less active than awake']],
};

// ---------------------------------------------------------------- shared state
const shared = {
    THREE: null, mesh: null, fields: null, geo: null,
    loading: null, failure: null,
    rot: [...VIEWS.top], view: 'top', tween: null,
};
let hidden = false;
const panels = {};
let rt = Number.isFinite(HOOK_RT) ? HOOK_RT : 0;
const frozen = () => Number.isFinite(HOOK_RT) || reducedMQ.matches;
if (reducedMQ.matches && !Number.isFinite(HOOK_RT)) rt = 0.42;
let rafId = 0, lastNow = 0;
let slowSince = 0, halfRate = false, frameNo = 0;

if (window.SleepSim) start(); else document.addEventListener('sleepsim:ready', start, { once: true });

function readStored() {
    try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; }
}
function writeStored(v) {
    try { localStorage.setItem(STORE_KEY, v); } catch (e) { /* private mode */ }
}

function start() {
    const S = window.SleepSim;
    if (HOOK_VIEW && VIEWS[HOOK_VIEW]) { shared.view = HOOK_VIEW; shared.rot = [...VIEWS[HOOK_VIEW]]; }
    hidden = HOOK_BRAIN === '0' ? true : HOOK_BRAIN === '1' ? false : readStored() === '0';
    document.body.classList.toggle('brain-hidden', hidden);

    for (const id of ['A', 'B']) {
        const el = document.getElementById(`brain-${id.toLowerCase()}`);
        if (el) el.hidden = false;
    }
    syncPanels();

    document.addEventListener('sleepsim:change', (e) => {
        if (e.detail.reason === 'compare' || e.detail.reason === 'state') syncPanels();
        for (const p of activePanels()) { p.refresh(); p.updateText(true); p.drawRibbon(); }
        kick();
    });
    document.addEventListener('sleepsim:moment', (e) => {
        const { t, prev } = e.detail;
        for (const p of activePanels()) { p.onMoment(t, prev); p.updateText(); p.drawRibbon(); }
        kick();
    });
    document.addEventListener('sleepsim:play', (e) => {
        for (const p of Object.values(panels)) p.setPlaying(e.detail.playing);
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    if (reducedMQ.addEventListener) reducedMQ.addEventListener('change', kick);

    if (!hidden) ensureLoaded();
    void S;
}

const activePanels = () => window.SleepSim.panels().map((id) => panels[id]).filter(Boolean);

function syncPanels() {
    const want = window.SleepSim.panels();
    for (const id of want) {
        if (!panels[id]) panels[id] = new Panel(id);
        panels[id].refresh();
        if (shared.mesh && !hidden) panels[id].buildGL();
    }
    for (const id of Object.keys(panels)) {
        if (!want.includes(id)) panels[id].disposeGL();
    }
}

// ---------------------------------------------------------------- loading (D7.2, D8)
function ensureLoaded() {
    if (shared.loading) return shared.loading;
    shared.loading = (async () => {
        try {
            const [THREE, buf] = await Promise.all([
                import('./vendor/three.module.min.js'),
                fetch('vendor/fsaverage5.bin').then((r) => { if (!r.ok) throw new Error(`mesh ${r.status}`); return r.arrayBuffer(); }),
            ]);
            shared.THREE = THREE;
            const mesh = M.decodeMesh(buf);
            shared.fields = { left: M.buildFields(mesh.left), right: M.buildFields(mesh.right) };
            // Scene positions as in Lantern: centred, z flipped so the front points away from the camera.
            shared.geo = {};
            for (const h of ['left', 'right']) {
                const m = mesh[h], pos = new Float32Array(m.pos.length);
                for (let i = 0; i < m.nv; i++) {
                    pos[3 * i] = m.pos[3 * i] - CEN[0];
                    pos[3 * i + 1] = m.pos[3 * i + 1] - CEN[1];
                    pos[3 * i + 2] = -m.pos[3 * i + 2] - CEN[2];
                }
                const idx = m.faces.slice();
                for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
                shared.geo[h] = { pos, idx, nv: m.nv };
            }
            shared.mesh = mesh;
        } catch (err) {
            shared.failure = location.protocol === 'file:' ? 'file' : 'load';
            console.error('Brain view could not load', err);
        }
        for (const p of activePanels()) {
            if (shared.failure) p.showFallback(MSG[shared.failure]);
            else if (!hidden) p.buildGL();
        }
        kick();
    })();
    return shared.loading;
}

// ---------------------------------------------------------------- one panel
class Panel {
    constructor(id) {
        this.id = id;
        const root = document.getElementById(`brain-${id.toLowerCase()}`);
        this.root = root;
        this.box = root.querySelector('.brain-box');
        this.chip = root.querySelector('.stage-chip');
        this.dot = root.querySelector('.stage-chip i');
        this.name = root.querySelector('.stage-name');
        this.clock = root.querySelector('.stage-clock');
        this.caption = root.querySelector('.brain-caption');
        this.legend = root.querySelector('.brain-legend');
        this.ribbonCanvas = root.querySelector('.brain-ribbon canvas');
        this.range = root.querySelector('.brain-ribbon input');
        this.playBtn = root.querySelector('.brain-play');
        this.viewBtns = [...root.querySelectorAll('.brain-views button')];
        this.gl = null;
        this.onScreen = true;
        this.gains = null;
        this.topoAge = null;
        this.topo = null;
        this.flushStart = -Infinity;
        this.textKey = '';
        this.stats = { paint: 0, render: 0, n: 0 };
        this.fallback = null;
        this.wire();
        this.setPlaying(window.SleepSim.playing());
        this.setViewButtons();
    }

    wire() {
        this.playBtn.addEventListener('click', () => {
            const S = window.SleepSim;
            if (S.playing()) S.pause(); else S.play();
        });
        this.viewBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
        this.root.querySelector('.brain-hide').addEventListener('click', () => setHidden(true));
        this.root.querySelector('.brain-show').addEventListener('click', () => setHidden(false));

        this.range.addEventListener('input', () => {
            const S = window.SleepSim;
            S.pause();
            S.setMoment(+this.range.value, 'ribbon');
        });
        this.range.addEventListener('keydown', (e) => {
            if (e.key !== 'PageUp' && e.key !== 'PageDown') return;
            e.preventDefault();
            const S = window.SleepSim;
            S.pause();
            S.setMoment(S.moment() + (e.key === 'PageUp' ? 30 : -30), 'ribbon');
        });

        // Rotation: drag turns, double click resets. Touch turns yaw only; vertical drags scroll.
        let drag = null;
        this.box.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            drag = { id: e.pointerId, x: e.clientX, y: e.clientY, rot: [...shared.rot], touch: e.pointerType !== 'mouse', active: e.pointerType === 'mouse' };
            if (drag.active) { try { this.box.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } this.box.classList.add('dragging'); }
        });
        this.box.addEventListener('pointermove', (e) => {
            if (!drag || drag.id !== e.pointerId) return;
            const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
            if (!drag.active) {
                if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
                    drag.active = true;
                    try { this.box.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
                } else return;
            }
            shared.tween = null;
            const pitch = drag.touch ? drag.rot[0] : M.clamp(drag.rot[0] + dy * 0.008, -0.9, 1.1);
            shared.rot = [pitch, drag.rot[1] + dx * 0.008];
            kick();
        });
        const end = (e) => {
            if (!drag || drag.id !== e.pointerId) return;
            drag = null;
            this.box.classList.remove('dragging');
        };
        this.box.addEventListener('pointerup', end);
        this.box.addEventListener('pointercancel', end);
        this.box.addEventListener('dblclick', () => setView('top'));

        if (window.IntersectionObserver) {
            new IntersectionObserver((entries) => {
                for (const en of entries) this.onScreen = en.isIntersecting;
                kick();
            }).observe(this.box);
        }
        if (window.ResizeObserver) new ResizeObserver(() => { this.resize(); this.drawRibbon(); kick(); }).observe(this.box);
        new ResizeObserverSafe(this.ribbonCanvas.parentElement, () => this.drawRibbon());
    }

    refresh() {
        const g = window.SleepSim.get(this.id);
        if (!g) return;
        this.sim = g.sim;
        this.age = g.sim.params.age;
        this.infant = !!g.sim.params.infant;
        this.events = g.sim.wakeEvents.map((e) => e.time).sort((a, b) => a - b);
        if (shared.fields && this.topoAge !== this.age) {
            this.topo = { left: M.swTopo(shared.fields.left, this.age), right: M.swTopo(shared.fields.right, this.age) };
            this.topoAge = this.age;
        }
    }

    setPlaying(on) {
        this.playBtn.textContent = on ? 'Pause' : 'Play the night';
        this.playBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        this.caption.setAttribute('aria-live', on ? 'off' : 'polite');
        this.textKey = '';
        this.updateText();
    }

    setViewButtons() {
        this.viewBtns.forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === shared.view ? 'true' : 'false'));
    }

    // Arousal flush when the moment moves forward over an arousal tick (D6).
    onMoment(t, prev) {
        if (prev === null || prev === undefined || !(t > prev) || t - prev > 20 || !this.events) return;
        let lo = 0, hi = this.events.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (this.events[mid] <= prev) lo = mid + 1; else hi = mid; }
        if (lo < this.events.length && this.events[lo] <= t && rt - this.flushStart >= 0.35) {
            this.flushStart = rt;
            window.SleepSimBrain[`_flushStart${this.id}`] = rt; // for the headless checks
        }
    }

    stage() { return window.SleepSim.stageAt(this.id, window.SleepSim.moment()); }

    updateText(force = false) {
        const S = window.SleepSim;
        if (!this.sim) return;
        const t = S.moment();
        if (t === null) return;
        const stage = this.stage();
        const band = this.infant ? 'newborn' : this.age < 14 ? 'child' : this.age >= 60 ? 'older' : 'adult';
        const key = `${stage}|${band}|${Math.floor(t)}|${S.playing()}`;
        if (!force && key === this.textKey) return;
        this.textKey = key;

        this.clock.textContent = S.fmtClock(t);
        this.chip.style.setProperty('--stage', stage < 0 ? '#64748b' : S.STAGE_COLORS[stage]);
        if (stage < 0) {
            this.dot.style.background = '#64748b';
            this.name.innerHTML = '<b>Awake and out of bed</b>';
        } else {
            const [code, word] = (this.infant ? INFANT_NAMES[stage] : null) || NAMES[stage];
            this.dot.style.background = S.STAGE_COLORS[stage];
            this.name.innerHTML = `<b>${code}</b>${word ? ` <span>${word}</span>` : ''}`;
        }

        let cap;
        if (stage < 0) cap = CAPTION.out;
        else if (this.infant) cap = CAPTION.newborn;
        else {
            cap = CAPTION[stage];
            if (stage === M.STAGE.N3 && band === 'child') cap += ` ${CAPTION.child}`;
            if (stage === M.STAGE.N3 && band === 'older') cap += ` ${CAPTION.older}`;
        }
        if (this.caption.textContent !== cap) this.caption.textContent = cap;

        let items = stage < 0 || this.infant ? [] : [...LEGEND[stage]];
        if (items.length && stage !== M.STAGE.WAKE && S.playing() && this.events.length) items.push(['ALPHA', 'Arousal']);
        const html = items.map(([k, label]) => `<span><i style="background:${M.HEX[k]}"></i>${label}</span>`).join('');
        if (this.legend.innerHTML !== html) this.legend.innerHTML = html;
    }

    drawRibbon() {
        const S = window.SleepSim, v = S.view();
        if (!v || !this.sim) return;
        const c = this.ribbonCanvas, w = c.clientWidth, h = c.clientHeight;
        if (!w || !h) return;
        const dpr = window.devicePixelRatio || 1;
        const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
        if (c.width !== pw) c.width = pw;
        if (c.height !== ph) c.height = ph;
        const ctx = c.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const span = v.viewEnd - v.viewStart;
        const x = (t) => ((t - v.viewStart) / span) * w;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, w, h);
        for (const b of this.sim.blocks) {
            const x0 = x(b.start), x1 = x(b.start + b.duration);
            if (x1 < 0 || x0 > w) continue;
            ctx.fillStyle = S.STAGE_COLORS[b.stage];
            ctx.globalAlpha = b.stage === S.STAGES.N1 && b.duration < 3 ? 0.5 : 0.9;
            ctx.fillRect(x0, 0, Math.max(0.75, x1 - x0), h);
        }
        ctx.globalAlpha = 1;
        const t = S.moment();
        if (t !== null) {
            const px = Math.round(x(t));
            ctx.fillStyle = 'rgba(2, 6, 23, 0.9)';
            ctx.fillRect(px - 2, 0, 5, h);
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(px - 1, 0, 3, h);
        }
        const r = this.range;
        const lo = Math.floor(v.viewStart), hi = Math.ceil(v.viewEnd);
        if (+r.min !== lo) r.min = lo;
        if (+r.max !== hi) r.max = hi;
        if (t !== null && Math.round(+r.value) !== Math.round(t)) r.value = Math.round(t);
        r.setAttribute('aria-valuetext', t !== null ? S.fmtClock(t) : '');
    }

    showFallback(text) {
        this.disposeGL();
        if (!this.fallback) {
            this.fallback = document.createElement('p');
            this.fallback.className = 'brain-fallback';
            this.box.append(this.fallback);
        }
        this.fallback.textContent = text;
        this.updateText(true);
        this.drawRibbon();
    }

    buildGL() {
        if (this.gl || this.fallback || !shared.mesh) return;
        const THREE = shared.THREE;
        let renderer;
        try {
            // Probe first so three.js does not log its own error on top of ours.
            const probe = document.createElement('canvas');
            const pc = probe.getContext('webgl2') || probe.getContext('webgl');
            if (!pc) throw new Error('no WebGL context');
            const lose = pc.getExtension('WEBGL_lose_context');
            if (lose) lose.loseContext();
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        } catch (err) {
            console.error('Brain view: WebGL unavailable', err);
            this.showFallback(MSG.webgl);
            return;
        }
        window.SleepSimBrain.contexts++;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        const canvas = renderer.domElement;
        canvas.setAttribute('aria-hidden', 'true');
        canvas.addEventListener('webglcontextlost', (e) => {
            if (!this.gl || this.gl.renderer !== renderer) return; // our own dispose, not a failure
            e.preventDefault();
            console.error('Brain view: WebGL context lost');
            this.showFallback(MSG.webgl);
        });
        this.box.prepend(canvas);

        const scene = new THREE.Scene();
        const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
        scene.add(new THREE.HemisphereLight('#f4f1ec', '#1d2433', 1.25));
        const dl = new THREE.DirectionalLight('#ffffff', 1.2);
        dl.position.set(1.5, 4, 2);
        scene.add(dl);
        const root = new THREE.Group();
        scene.add(root);
        const meshes = {}, colors = {};
        for (const h of ['left', 'right']) {
            const G = shared.geo[h];
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(G.pos, 3));
            geo.setIndex(new THREE.BufferAttribute(G.idx, 1));
            geo.computeVertexNormals();
            const col = new THREE.BufferAttribute(new Float32Array(G.nv * 3), 3);
            col.setUsage(THREE.DynamicDrawUsage);
            geo.setAttribute('color', col);
            const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(geo, mat);
            root.add(mesh);
            meshes[h] = mesh; colors[h] = col;
        }
        const labels = ['front', 'back'].map((txt) => {
            const s = document.createElement('span');
            s.className = 'brain-label';
            s.textContent = txt;
            s.setAttribute('aria-hidden', 'true');
            this.box.append(s);
            return s;
        });
        let statsEl = null;
        if (SHOW_STATS) {
            statsEl = document.createElement('div');
            statsEl.className = 'brain-stats';
            this.box.append(statsEl);
        }
        this.gl = {
            renderer, scene, cam, root, meshes, colors, labels, statsEl, w: 0, h: 0, alive: true,
            pts: [new THREE.Vector3(0, 0.3, -1.6), new THREE.Vector3(0, -0.2, 1.9)], tmp: new THREE.Vector3(), centre: new THREE.Vector3(),
        };
        this.refresh();
        this.resize();
    }

    disposeGL() {
        const gl = this.gl;
        if (!gl) return;
        this.gl = null;
        for (const m of Object.values(gl.meshes)) { m.geometry.dispose(); m.material.dispose(); }
        gl.renderer.dispose();
        gl.renderer.forceContextLoss();
        gl.renderer.domElement.remove();
        gl.labels.forEach((l) => l.remove());
        if (gl.statsEl) gl.statsEl.remove();
        window.SleepSimBrain.contexts--;
    }

    resize() {
        const gl = this.gl;
        if (!gl) return;
        const w = this.box.clientWidth, h = this.box.clientHeight;
        if (!w || !h || (w === gl.w && h === gl.h)) return;
        gl.w = w; gl.h = h;
        gl.renderer.setSize(w, h);
        gl.cam.aspect = w / h;
        gl.cam.updateProjectionMatrix();
        const tilt = (35 * Math.PI) / 180, dist = 5.15 * Math.max(1, 0.95 / (w / h));
        gl.cam.position.set(0, dist * Math.cos(tilt), dist * Math.sin(tilt));
        gl.cam.lookAt(0, 0.08, 0.1); // Lantern has -0.05; 0.08 centres the top view in a short box
        gl.cam.updateMatrixWorld();
    }

    canRender() {
        return !!this.gl && this.gl.alive && !hidden && this.onScreen && !document.hidden && !!this.sim && this.gl.w > 0;
    }

    frame(dt) {
        const gl = this.gl, S = window.SleepSim, F = shared.fields;
        const t0 = performance.now();
        if (this.topoAge !== this.age) this.refresh();
        const t = S.moment();
        const stage = this.stage();
        const target = M.targetGains(stage, this.infant);
        if (!this.gains || reducedMQ.matches) this.gains = { ...target };
        else M.easeGains(this.gains, target, dt);
        const flush = Number.isFinite(this.flushStart) ? M.flushAt(rt - this.flushStart) : 0;
        const sc = M.frameScalars({ stage, age: this.age, infant: this.infant, t, sleepOnset: this.sim.params.sleepOnset, rt, flush, gains: this.gains });
        const inside = shared.view === 'inside';
        gl.meshes.left.visible = !inside;
        for (const h of ['left', 'right']) {
            if (h === 'left' && inside) continue;
            M.paintHemi(F[h], this.topo[h], sc, gl.colors[h].array);
            gl.colors[h].needsUpdate = true;
        }
        const t1 = performance.now();
        gl.root.rotation.set(shared.rot[0], shared.rot[1], 0);
        gl.root.updateMatrixWorld();
        gl.renderer.render(gl.scene, gl.cam);
        const t2 = performance.now();
        this.placeLabels();
        const st = this.stats;
        st.paint += t1 - t0; st.render += t2 - t1; st.n++;
        if (gl.statsEl && st.n >= 30) {
            gl.statsEl.textContent = `paint ${(st.paint / st.n).toFixed(2)} ms\nrender ${(st.render / st.n).toFixed(2)} ms\nframe ${frameNo}`;
            st.paint = st.render = st.n = 0;
        }
        window.SleepSimBrain[`last${this.id}`] = { paint: t1 - t0, render: t2 - t1 };
    }

    placeLabels() {
        const gl = this.gl, cam = gl.cam;
        gl.centre.set(0, 0, 0).applyMatrix4(cam.matrixWorldInverse);
        gl.pts.forEach((p, i) => {
            const el = gl.labels[i];
            const v = gl.tmp.copy(p).applyEuler(gl.root.rotation);
            const zView = v.clone().applyMatrix4(cam.matrixWorldInverse).z;
            v.project(cam);
            const behind = zView < gl.centre.z - 0.8; // well behind the centre, so hidden by the cortex
            el.style.visibility = behind ? 'hidden' : 'visible';
            const x = M.clamp(((v.x + 1) / 2) * gl.w, 22, gl.w - 22);
            const y = M.clamp(((1 - v.y) / 2) * gl.h, 10, gl.h - 10);
            el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
        });
    }
}

// ResizeObserver helper for the ribbon (no-op without ResizeObserver).
function ResizeObserverSafe(el, fn) {
    if (window.ResizeObserver) new ResizeObserver(fn).observe(el);
}

// ---------------------------------------------------------------- views, hide
function setView(name) {
    if (!VIEWS[name]) return;
    shared.view = name;
    const from = [...shared.rot], to = VIEWS[name];
    let dy = to[1] - from[1];
    dy = ((dy + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; // shortest way round
    const target = [to[0], from[1] + dy];
    if (reducedMQ.matches) { shared.rot = target; shared.tween = null; }
    else shared.tween = { from, to: target, t0: performance.now(), dur: 300 };
    for (const p of Object.values(panels)) p.setViewButtons();
    kick();
}

function setHidden(on) {
    hidden = on;
    document.body.classList.toggle('brain-hidden', on);
    writeStored(on ? '0' : '1');
    window.dispatchEvent(new Event('resize'));
    if (!on) {
        ensureLoaded().then(() => { for (const p of activePanels()) { p.buildGL(); p.resize(); p.drawRibbon(); } kick(); });
        for (const p of activePanels()) { p.updateText(true); }
        requestAnimationFrame(() => { for (const p of activePanels()) p.drawRibbon(); });
    }
    const focusSel = on ? '.brain-show' : '.brain-hide';
    const p = panels.A;
    if (p && document.activeElement && document.activeElement.closest('.brain-strip')) p.root.querySelector(focusSel).focus();
}

// ---------------------------------------------------------------- render loop (D7.8)
function kick() {
    if (rafId) return;
    lastNow = performance.now();
    rafId = requestAnimationFrame(loop);
}

function loop(now) {
    rafId = 0;
    const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    if (!frozen()) rt += dt;

    // View tween
    if (shared.tween) {
        const tw = shared.tween;
        const k = Math.min(1, (now - tw.t0) / tw.dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        shared.rot = [tw.from[0] + (tw.to[0] - tw.from[0]) * e, tw.from[1] + (tw.to[1] - tw.from[1]) * e];
        if (k >= 1) shared.tween = null;
    }

    // Slow device: above 20 ms per frame for 2 s, paint every second frame (D12).
    if (dt > 0.02) { if (!slowSince) slowSince = now; else if (now - slowSince > 2000) halfRate = true; } else slowSince = 0;
    frameNo++;
    window.SleepSimBrain.frames = frameNo;
    window.SleepSimBrain.rt = rt;

    let any = false;
    for (const p of activePanels()) {
        if (!p.canRender()) continue;
        any = true;
        if (halfRate && frameNo % 2 && !shared.tween) continue;
        p.frame(halfRate ? dt * 2 : dt);
    }
    // Keep running while something renders, except with reduced motion: then one frame per change.
    if (any && (!reducedMQ.matches || shared.tween)) rafId = requestAnimationFrame(loop);
}
