# Sleep Age Simulator v3, Stage 2: the brain window

Design and implementation brief. Written 2026-11-24 for Martin to approve and for Opus to build.

Martin's request: "borrow some of the work from Lantern and try to show the changes in the brain sleep architecture with a 3D brain, small visualization window within that age simulator."

The short version of the design: a small 3D cortex sits in a strip under the hypnogram. A playhead on the hypnogram picks a moment of the night. The cortex shows the EEG signature of the stage at that moment (slow waves, spindles, alpha, the REM pattern), and age changes the size, the number and the location of those signatures. Everything on the brain is a drawing rule driven by the simulated night. Nothing is measured, and the window says so.

I built a throwaway prototype of the mesh loader, the region fields and the colour mapping to check that the coordinates below land where they should and that the look holds up at small size. It rendered correctly in headless Chrome with software WebGL. The prototype is not in the repository. The numbers in section D are the ones it used, except where marked "untested".

---

## A. What the brain shows, and the evidence

Confidence means confidence that the mapping is true of a typical person, not confidence in the exact number. Every number that sets a brightness or a rate is a drawing choice and is ordinal only: brighter means more, and that is all it means.

### A1. By stage

| Stage at the playhead | What is drawn | Evidence | Confidence |
|---|---|---|---|
| N3 | Violet waves about once a second. Each one starts at a point and sweeps across the cortex. About three in four start at the front and travel back. | Massimini 2004: each slow oscillation is a travelling wave, origins cluster in anterior regions, propagation is mostly front to back at 1.2 to 7 m/s. Murphy 2009 source modelling agrees. | High for direction and rate. The share of frontal origins is a drawing choice. |
| N3 | Waves are largest over the front of the head in adults. | Frontal predominance of slow-wave activity: Werth 1997, Massimini 2004, Mander 2013 ("SWA was dominant over prefrontal EEG derivations, in both the young and older adult groups"). | High |
| N3 and N2 | Waves get smaller and sparser as the night goes on. | Slow-wave activity falls across successive NREM episodes (Borbély 1982, Achermann and Borbély). Riedner 2007: early-night waves are larger, steeper and travel further. Uses the same 4.2 h decay constant as the simulator's Process S overlay. | High |
| N2 | Mint bursts of about one second: spindles. Some over the front (slow spindles, about 11 to 13 Hz), some over the centre and back of the top (fast spindles, about 13 to 15 Hz). | Two spindle types with different topography: Anderer 2001, De Gennaro and Ferrara 2003. Purcell 2017 confirms slower spindles are enriched at F3 and F4 and faster ones centrally. | High |
| N2 | An occasional single violet wave: a K-complex. | AASM scoring manual: K-complexes define N2 together with spindles. They behave like isolated slow waves. | High that they occur. Rate is a drawing choice. |
| N3 | Spindles continue at about three quarters of the N2 rate. | Purcell 2017, verified in the full text: 1.45 per minute in N3 against 1.88 in N2. | High |
| Wake in bed | A soft red glow over the back of the head that waxes and wanes: alpha rhythm, eyes closed. | Posterior dominant rhythm, 8 to 12 Hz, occipital maximum. Textbook and AASM. | High |
| N1 | Alpha fades to a trace. Brief pulses at the top of the head: vertex sharp waves. Otherwise a quiet cortex. | AASM: N1 is alpha attenuation, low-amplitude mixed-frequency activity and vertex sharp waves maximal over the central region. | High |
| REM | Amber on the anterior cingulate and medial prefrontal surface, the medial temporal surface, and the temporo-occipital visual association cortex. Steel blue on the dorsolateral prefrontal cortex, the inferior parietal lobule and the precuneus. No travelling waves, no spindles. | PET blood-flow studies. Maquet 1996: amygdala, anterior cingulate, pontine tegmentum and thalamus up; dorsolateral prefrontal, parietal and posterior cingulate/precuneus down. Braun 1997 and 1998: limbic, paralimbic and extrastriate visual cortex up; lateral prefrontal and primary visual cortex down. | Medium to high for the pattern. It is a different kind of evidence (blood flow against waking, group averages) and the caption says so. |
| Arousal tick from the model | A brief soft red flush over the top of the cortex, and the slow waves and spindles stop for a moment. | AASM arousal: an abrupt shift of EEG frequency to alpha, theta or faster for at least 3 s. | High that it is diffuse and abrupt. No regional claim is made. |
| Out of bed (before bedtime, after wake-up) | Plain cortex and the words "Awake and out of bed". | The simulation covers time in bed only. | Not applicable |

### A2. By age

| Age effect | What is drawn | Evidence | Confidence |
|---|---|---|---|
| Children: where the biggest slow waves sit | The brightest part of the slow-wave field moves from the back of the head at age 2 to 5, through the centre at about 8 to 11, to the front by 17 to 20. | Kurth 2010, 128-channel sleep EEG in 55 children aged 2.4 to 19.4: "from early childhood to late adolescence, the location on the scalp showing maximal SWA underwent a shift from posterior to anterior regions", specific to the slow-wave band and stable across the night. | High for the direction. The ages of the in-between positions are my reading; I could only open the abstract, so Opus or Martin should check the keyframes in D4 against Figure 2 of the paper. |
| Children to adults: size of slow waves | Largest in childhood, falling through the teens. | Campbell and Feinberg 2009: delta power falls steeply between about 11 and 16.5 years. | High for the direction |
| Adults: size and number of slow waves | Smaller and fewer with each decade. | Carrier 2011 (density and amplitude lower in middle age), Mander 2013 (72 against 20 years, "marked and significant reductions in SWA"), Dubé 2015. | High for the direction. Mander's text gives no percentage, so none is implied. |
| Older adults: the front loses most | The frontal bulge of the slow-wave field flattens with age. | Landolt and Borbély 2001 (reduced frontal predominance), Carrier 2011 (age effect strongest at prefrontal and frontal sites), Mander 2013 (the loss is mediated by medial prefrontal grey-matter atrophy). | Medium to high |
| Spindles across life | Number rises through childhood, peaks around adolescence, falls through adulthood. Size is steady in childhood and falls in adulthood. | Purcell 2017, verified in the full text: "Spindle density increased with age during childhood, peaked around adolescence and then declined across adulthood", "Spindle amplitude was broadly stable across childhood and adolescence, but declined in adulthood". Martin 2013 for older adults. | High for the direction |
| Spindles in children: slow before fast | Young children get mostly frontal (slow) spindles. The centro-parietal (fast) share grows to the adult mix by 18. | Purcell 2017: "Slower spindles ... peak earlier in development than faster spindles". | Medium. The mix by age is a drawing choice. |
| Newborn (age 0) | Nothing is animated. The window says why. | Newborn sleep EEG is not a small version of the adult pattern: no spindles until about two months, quiet sleep is tracé alternant, and the template is an adult cortex. | Deliberately not drawn |

### A3. Modifiers

The modifiers already reshape the hypnogram, and the brain follows the hypnogram. That is the honest route for most of them, because their best-supported effects are on how much of each stage there is and when.

| Modifier | What the viewer sees on the brain | Extra brain-only rule |
|---|---|---|
| Alcohol | More slow-wave time early, little REM pattern in the first half, more wake glow late. All of it comes from the Stage 1 model. | None |
| Apnea | Many more arousal flushes, less slow-wave time, more N1. | None beyond the model's arousal ticks |
| Caffeine, screen, jet lag, social jet lag, chronotype | The stage sequence shifts or shortens. | None |
| Toilet trips, perimenopause | Wake bouts show the wake pattern. | None |
| Sex | Only through the amount of N3 the model gives. | None |

### A4. Sources

Verified while writing this brief (text opened): Kurth 2010 (abstract only), Mander 2013, Purcell 2017, FreeSurfer licence. The rest are cited from memory. Check volume and page numbers before they go into the README.

* Massimini M, Huber R, Ferrarelli F, Hill S, Tononi G. The sleep slow oscillation as a traveling wave. J Neurosci 2004;24:6862-6870.
* Murphy M, Riedner BA, Huber R, Massimini M, Ferrarelli F, Tononi G. Source modeling sleep slow waves. PNAS 2009;106:1608-1613.
* Riedner BA et al. Sleep homeostasis and cortical synchronization: III. A high-density EEG study of sleep slow waves in humans. Sleep 2007;30:1643-1657.
* Werth E, Achermann P, Borbély AA. Fronto-occipital EEG power gradients in human sleep. J Sleep Res 1997;6:102-112.
* Kurth S et al. Mapping of cortical activity in the first two decades of life: a high-density sleep electroencephalogram study. J Neurosci 2010;30:13211-13219.
* Campbell IG, Feinberg I. Longitudinal trajectories of non-rapid eye movement delta and theta EEG as indicators of adolescent brain maturation. PNAS 2009;106:5177-5180.
* Carrier J et al. Sleep slow wave changes during the middle years of life. Eur J Neurosci 2011;33:758-766.
* Mander BA et al. Prefrontal atrophy, disrupted NREM slow waves and impaired hippocampal-dependent memory in aging. Nat Neurosci 2013;16:357-364.
* Landolt HP, Borbély AA. Age-dependent changes in sleep EEG topography. Clin Neurophysiol 2001;112:369-377.
* Dubé J et al. Cortical thinning explains changes in sleep slow waves during adulthood. J Neurosci 2015;35:7795-7807.
* Purcell SM et al. Characterizing sleep spindles in 11,630 individuals from the National Sleep Research Resource. Nat Commun 2017;8:15930.
* Martin N et al. Topography of age-related changes in sleep spindles. Neurobiol Aging 2013;34:468-476.
* Anderer P et al. Low-resolution brain electromagnetic tomography revealed simultaneously active frontal and parietal sleep spindle sources in the human cortex. Neuroscience 2001;103:581-592.
* De Gennaro L, Ferrara M. Sleep spindles: an overview. Sleep Med Rev 2003;7:423-440.
* Maquet P et al. Functional neuroanatomy of human rapid-eye-movement sleep and dreaming. Nature 1996;383:163-166.
* Braun AR et al. Regional cerebral blood flow throughout the sleep-wake cycle. Brain 1997;120:1173-1197.
* Braun AR et al. Dissociated pattern of activity in visual cortices and their projections during human rapid eye movement sleep. Science 1998;279:91-95.
* Berry RB et al. The AASM Manual for the Scoring of Sleep and Associated Events (alpha, vertex sharp waves, K-complexes, spindles, arousal rule).
* Fischl B, Sereno MI, Tootell RBH, Dale AM. High-resolution intersubject averaging and a coordinate system for the cortical surface. Hum Brain Mapp 1999;8:272-284.

---

## B. What is deliberately not shown

1. **Real oscillation frequencies.** Alpha at 10 Hz and spindles at 13 Hz would be a flicker on a 60 Hz screen and would break the three-flashes-per-second safety limit. Both are drawn as a slow swell of brightness. Only the slow waves are drawn as individual waves, at their real rate of a little under one per second.
2. **Real sweep speed.** A slow wave crosses the cortex in roughly a tenth of a second. Here it takes 0.6 s so the eye can follow it. The window states "slow motion".
3. **Real event counts.** Spindles come about every six seconds on screen against two or three a minute in a recording. A paused moment would otherwise look empty most of the time.
4. **Subcortical structures.** The mesh is cortex only. The thalamus (spindle generator), the pons and the amygdala (REM) are named in the caption where they matter and are not drawn.
5. **Brain shrinkage or wider sulci with age.** The same adult template is used for every age. Morphing it would be invented anatomy.
6. **A child's brain.** Ages 1 to 17 use the adult template. The footnote says "adult template brain".
7. **Newborn EEG.** See A2.
8. **Sawtooth waves, rapid eye movements, phasic against tonic REM.** Real, but too fine for this window and there are no eyes on a cortex.
9. **Alpha slowing with age, and the slower posterior rhythm of small children.** A frequency change cannot be seen in a glow.
10. **Slow-wave and spindle coupling, and its loss with age** (Helfrich 2018). Too subtle to read here.
11. **Extra alcohol effects on the EEG** (more delta and frontal alpha early in the night). The hypnogram already carries the alcohol story; a second, weaker cue on the brain would look like precision we do not have.
12. **Left against right differences.** Both hemispheres get the same fields.
13. **Any numeric scale on the brain.** No colour bar with units, no microvolts, no percentages.
14. **Any Lantern patient data.** Only three.js and the template mesh are copied. No `nightraw`, `bands.json`, `kc.json`, `currents.json`, `snippets.json`, `ladder.json`, `relief.json`, `night.json` or anything derived from them.

---

## C. UX and layout

### C1. The moment and the playhead

* One global "moment": a clock time in minutes after 18:00, shared by every visible panel. The hypnograms already share a clock axis in compare mode, so one moment serves both.
* A thin vertical playhead line with a small round handle is laid over each hypnogram at the moment.
* Mouse: moving the pointer over the hypnogram plot moves the moment while the night is not playing. A click or a drag sets the moment and pauses playback. When the pointer leaves, the moment stays where it was.
* Touch: a horizontal drag on the hypnogram scrubs. Vertical drags still scroll the page (`touch-action: pan-y`).
* Keyboard: the ribbon in the brain strip is a native range input. Arrow keys move one minute, Page Up and Page Down move 30.
* Play: one button, "Play the night". It runs the moment forward at 8 night-minutes per second, so an 8 hour night takes a minute. It stops at wake-up. Pressing it at the end restarts from five minutes before bedtime.
* First load: paused at the middle of the first N3 block, so the first thing Martin sees is the travelling slow wave. If there is no N3 (newborn), 20 minutes after sleep onset.
* When a control changes the night, the moment keeps its clock time and is clamped into the visible window.

### C2. The brain strip

A strip between the hypnogram and the dashboard in each panel. Left: the 3D window. Right: what it means.

* Stage chip (stage colour dot, stage name, clock time), one caption of at most two lines, a contextual legend with only the colours in play at this moment, the ribbon (the night as a 14 px band of stage colours with the playhead on it), a footnote.
* Buttons: Play or Pause, three view buttons (Top, Side, Inside), Hide.
* Drag on the brain rotates it. Double click resets. On touch screens a horizontal drag turns it and vertical drags scroll the page.
* "front" and "back" labels follow the brain as it turns.
* Hide collapses the strip to a 40 px bar with a "Show brain" button and gives the height back to the hypnogram. The choice is remembered in `localStorage`. While hidden, nothing is rendered, and if it was hidden at load, three.js and the mesh are never downloaded.
* No WebGL, a lost context, or a page opened from `file://`: the 3D window is replaced by one sentence. The chip, caption, ribbon and playhead keep working.

### C3. Compare mode: one brain per panel

Each panel gets its own brain, driven by its own night, at the same clock time, with the same rotation. That is the comparison Martin wants to show: at 01:30 the 25-year-old's cortex is rolling large frontal waves while the 75-year-old's shows small sparse ones or is awake. A single shared brain could not show that. Rotating one brain rotates the other. Play and the view buttons act on both.

### C4. Desktop, single mode

```
+-----------+--------------------------------------------------------------+
| Sidebar   |  HYPNOGRAM (full width, takes all spare height, min 250 px)   |
| 320 px    |                    |  <- playhead                            |
|           |  Wake  ____        |                                         |
| Person    |  REM       __      o      ____                               |
| Evening   |  N1   _      _     |   __     _                              |
| Body clock|  N2    ___    ___  |  _        ___                           |
| Health    |  N3       ____   __|__                                       |
| Overlays  |        22:00   00:00   02:00   04:00   06:00                 |
|           +--------------------+-----------------------------------------+
|           | +----------------+ | (N3) Deep sleep  01:32   [Play] [Top|Side|Inside] [Hide] |
|           | |     front      | | Large slow waves about once a second,   |
|           | |    3D cortex   | | most starting at the front and sweeping |
|           | |   260 x 204    | | back.                                   |
|           | |     back       | | (violet) Slow waves  (mint) Spindles    |
|           | +----------------+ | [=====ribbon of the night==|=========]  |
|           |                    | Schematic on an adult template brain. Slow motion. Not a recording. |
|           +--------------------------------------------------------------+
|           |  Sleep architecture:  (pie) legend    [cards] [cards] [cards]|
|           +--------------------------------------------------------------+
|           |  Typical values for healthy sleepers ...            Sources  |
+-----------+--------------------------------------------------------------+
```

* Strip height 204 px. Brain window 260 px wide, the text column takes the rest.
* Height budget at 1440 x 900 (about 790 px of page): note 30, dashboard about 185, strip 204, hypnogram about 370. Fine.
* Short windows (`max-height: 760px` and the main area at least 1100 px wide): the strip and the dashboard sit side by side in one row ("lower deck", strip column 440 px with a 200 px brain window), so the hypnogram never drops under 250 px.

### C5. Phone and narrow windows (820 px and under)

```
+------------------------------+
| Sleep Age Simulator          |
| [ ] Compare two nights       |
+------------------------------+
| HYPNOGRAM, 320 px tall       |
|        |  <- drag to scrub   |
+------------------------------+
| +--------------------------+ |
| |          front           | |
| |        3D cortex         | |
| |     full width x 240     | |
| |          back            | |
| +--------------------------+ |
| (N3) Deep sleep        01:32 |
| Large slow waves about once  |
| a second, most starting at   |
| the front and sweeping back. |
| (violet) Slow waves          |
| [====ribbon, 44 px hit===|=] |
| [Play] [Top|Side|Inside] [Hide] |
| Schematic ... Not a recording|
+------------------------------+
| Sleep architecture (pie)     |
| [cards]                      |
+------------------------------+
| Controls ...                 |
+------------------------------+
```

* The hypnogram keeps its 320 px. The strip adds about 430 px below it. All buttons are 44 px tall.
* The brain renders only while it is on screen.

### C6. Compare mode

Desktop: each panel is hypnogram, strip, dashboard, top to bottom, and scrolls on its own as it does now. The brain window is 200 x 190 and the caption is clamped to three lines.

```
+-----------+-------------------------------+-------------------------------+
| Sidebar   | A: man, 25                    | B: man, 75                    |
|           | HYPNOGRAM A        |          | HYPNOGRAM B        |          |
|           +-------------------------------+-------------------------------+
|           | +---------+ (N3) Deep  01:32  | +---------+ (Wake) Awake 01:32|
|           | | cortex  | Large slow waves  | | cortex  | Eyes closed. Alpha|
|           | | 200x190 | ...               | | 200x190 | at the back ...   |
|           | +---------+ [==ribbon=|====]  | +---------+ [==ribbon=|====]  |
|           |   [Play] [Top|Side|Inside]    |   [Play] [Top|Side|Inside]    |
|           +-------------------------------+-------------------------------+
|           | dashboard A                   | dashboard B                   |
+-----------+-------------------------------+-------------------------------+
```

Phone: A's hypnogram, strip and dashboard, then B's, stacked. Only the brain on screen renders.

### C7. Look

* Keep the dark slate palette and the Inter font. Stage chips use the existing stage colours.
* The cortex is a matte blue-grey solid with sulcal shading and soft studio light: gyri `#454c63`, sulci `#1b2132`, on a radial gradient from `#1e293b` to `#0b1222`. No outlines, no glow sprites, no bloom, no cartoon shading, no face or head shape.
* Signature colours. Wake and REM reuse the stage colours so the brain and the hypnogram agree. NREM needs two colours that can appear together, so it borrows Lantern's pair.

| Signature | Colour | Why |
|---|---|---|
| Slow waves, K-complexes | `#8B7CFF`, crest `#EDE9FF` | Lantern's slow-wave violet |
| Spindles | `#3DF0C2` | Lantern's spindle mint |
| Alpha (wake), arousal flush | `#f87171` | Wake red, one step lighter |
| Vertex waves (N1) | `#38bdf8` | The N1 stage colour |
| REM: more active than awake | `#f59e0b` | The REM stage colour |
| REM: less active than awake | `#5b8def` | Cool against warm, the PET convention |

* All text in the strip is 12 px or larger. Captions 13 px. No italic serif, no tracked uppercase eyebrow labels, no gold.
* Captions (Martin may edit these freely):

| State | Caption |
|---|---|
| Out of bed | Awake and out of bed. The simulation covers time in bed. |
| Wake | Awake with eyes closed. Alpha rhythm, 8 to 12 Hz, over the back of the head. |
| N1 | Drowsy. Alpha fades and the EEG flattens. Brief vertex waves at the top of the head. |
| N2 | Light sleep. Spindles come in bursts from the thalamus, slower at the front and faster over the centre. Now and then a single K-complex sweeps across. |
| N3 | Deep sleep. Large slow waves about once a second, most starting at the front and sweeping back. |
| N3, age under 14, added | In children the largest waves sit further back. |
| N3, age 60 and over, added | With age the waves get smaller and fewer, most of all at the front. |
| REM | REM sleep. The EEG looks close to waking. Colours show blood flow in PET studies: limbic and visual association areas up, lateral prefrontal and parietal areas down. Turn to Inside for the limbic areas. |
| Age 0 | Newborn sleep is not drawn. Spindles have not appeared yet, slow waves are not yet organised front to back, and this is an adult template brain. |
| Footnote, always | Schematic on an adult template brain. Slow motion. Not a recording. |

---

## D. Implementation brief for Opus

Scope: add the brain strip, the playhead and a small public API. Do not change anything above the `// --- APP LOGIC ---` marker in `app.js`. `node tests/scenarios.mjs --check` must pass unchanged. Stay a static site with no build step. Work on a branch and do not push to `main` (it deploys to the public page) until Martin has seen screenshots.

### D1. Files

| File | Action |
|---|---|
| `vendor/three.module.min.js` | Copy from `~/psg-data/lantern-tide-mockup/vendor/`. three.js r160, 671 KB, 167 KB gzipped. |
| `vendor/fsaverage5.bin` | Copy from the same folder. 512 KB. |
| `vendor/THREE-LICENSE.txt` | The MIT licence text of three.js. |
| `vendor/FREESURFER-LICENSE.txt` | The full FreeSurfer Software License Agreement from `https://github.com/freesurfer/freesurfer/blob/dev/LICENSE.txt`, unchanged, with the three-line note from D11 added above it. |
| `brain-map.js` | New ES module. Pure maths, no DOM, no three.js. Region fields, age curves, per-frame intensity. Testable in Node. |
| `brain.js` | New ES module. Strip UI, three.js scene, render loop, rotation, fallback. Imports `brain-map.js` statically and three.js dynamically. |
| `tests/brain-map.mjs` | New Node test of `brain-map.js` (D10). |
| `app.js` | APP LOGIC section only: moment state, playhead, `window.SleepSim`, URL test hooks. |
| `index.html` | Strip markup in both panels, playhead elements, `<script type="module" src="brain.js?v=1">` after `app.js`. Bump `app.js?v=4`. |
| `style.css` | Strip, playhead, lower deck, phone rules. |
| `README.md` | Brain section, third-party notices, new sources, a line that the brain needs the page served over http. |

Copy nothing else from Lantern. No JSON, no `.bin` other than the mesh.

### D2. Loading order and the API

`app.js` stays a classic script. Module scripts run before `DOMContentLoaded`, and `app.js` builds everything inside its `DOMContentLoaded` handler, so `brain.js` must wait for a signal.

At the end of the `DOMContentLoaded` handler in `app.js`:

```js
window.SleepSim = {
  STAGES, STAGE_COLORS, fmtClock,
  panels: () => (compareMode ? ['A', 'B'] : ['A']),
  get: (id) => sims[id] ? { sim: sims[id], state: clone(states[id]) } : null,
  view: () => lastView,                 // { viewStart, viewEnd } from the last computeView()
  stageAt: (id, t) => ...,              // STAGES value, or -1 when t is before blocks[0].start or at/after params.sleepEnd
  moment: () => moment,                 // minutes after 18:00
  setMoment: (t, source) => ...,        // clamps to the view, moves playheads, fires sleepsim:moment
  play: () => ..., pause: () => ..., playing: () => playing,
};
document.dispatchEvent(new CustomEvent('sleepsim:ready'));
```

Events on `document`:

* `sleepsim:ready` once.
* `sleepsim:change` with `detail.reason` of `state`, `compare` or `resize`, fired after every `redraw()`.
* `sleepsim:moment` with `detail = { t, source }`, `source` one of `hover`, `drag`, `play`, `ribbon`, `init`, `state`.
* `sleepsim:play` with `detail.playing`.

`brain.js` starts with `if (window.SleepSim) start(); else document.addEventListener('sleepsim:ready', start, { once: true });`.

`stageAt` is a binary search over `sim.blocks`. Put it in the APP LOGIC section.

### D3. Changes inside `app.js` (APP LOGIC section only)

1. State: `let moment = null, playing = false, lastView = null;`.
2. `redraw()` stores `lastView = v`, repositions the playheads, and fires `sleepsim:change`.
3. `drawHypnogram` already writes `viewStart`, `viewEnd`, `padLeft`, `plotWidth` to `canvas.dataset`. Add `padTop` and `plotHeight`.
4. Playhead: one `<div class="playhead">` inside each `.canvas-container`, absolutely positioned, 1 px wide, colour `#e2e8f0` at 70% opacity, with a 9 px round handle at the top. Position with `transform: translateX()` from the dataset values. Do not redraw the canvas to move it. Hide it when the moment is outside the plot.
5. Pointer handling on each hypnogram canvas with Pointer Events. Convert x to time with the dataset values. `pointermove` with a mouse and no button sets the moment with source `hover` only when not playing. `pointerdown` pauses, captures the pointer and sets the moment with source `drag`; `pointermove` while captured continues. Add `touch-action: pan-y` to `.hypno-canvas`.
6. Play clock: a `requestAnimationFrame` ticker that advances the moment by `8 * dt` minutes (dt in seconds, capped at 0.1). Start: if the moment is outside `[bedtime - 5, sleepEnd]` of panel A, jump to `bedtime - 5`. Stop at the latest `sleepEnd` among visible panels. Pause when `document.hidden`.
7. Initial moment after the first simulation: the midpoint of the first N3 block of A, else `params.sleepOnset + 20`.
8. After `onStateChange` and the compare toggle: `setMoment(clamp(moment, viewStart, viewEnd), 'state')`.
9. URL test hooks, read once before the first simulation. They exist so headless screenshots can reach any state, and they double as shareable links:
   * `state=<URL-encoded JSON>`: merged into `states.A` (whitelist the keys of `defaultState`).
   * `stateB=<URL-encoded JSON>`: turns compare on and merges into `states.B`.
   * `t=<minutes after 18:00>`: the initial moment.
   * `brain.js` reads `rt=<seconds>` (freezes the rhythm clock at that value), `view=top|side|inside`, `brain=0|1` (overrides the remembered hide state) and `stats=1` (shows paint time in the corner).

### D4. `brain-map.js`: mesh, coordinates and fields

**File format** (as in Lantern's `brainInit`, `app.js` near line 663): `uint32` little-endian header length `n`, then `n` bytes of JSON `{left:{nv,nf,v,f,s}, right:{...}}`, then the data block. Offsets `v`, `f`, `s` are relative to `4 + n`. Per hemisphere: `nv` = 10242 vertices as `float32 x 3`, `nf` = 20480 faces as `uint16 x 3`, `nv` sulcal depths as `int8`.

**Stored axes** (I measured the ranges): `x` is left to right, `y` is up, `z` is anterior. Units are millimetres divided by 75. So for each vertex, MNI-like millimetres are:

```
X = 75 * stored.x      (left negative, range about -69 to +70)
Y = 75 * stored.z      (anterior positive, range about -105 to +69)
Z = 75 * stored.y      (up positive, range about -48 to +79)
```

All fields below use `X, Y, Z` in millimetres. Both hemispheres use the same formulas; where a centre is given as `(|X|, Y, Z)` use the absolute value of the vertex's X.

**Scene position** (exactly as Lantern): `CEN = [0, 0.2, 0.24]`; `px = stored.x - CEN[0]`, `py = stored.y - CEN[1]`, `pz = -stored.z - CEN[2]`. Because z is flipped, swap the second and third index of every face, then `computeVertexNormals()`. With this, the front of the brain points away from the default camera.

**Helpers**

```
clamp(x,a,b)
ss(a,b,x) = smoothstep: t = clamp((x-a)/(b-a),0,1); t*t*(3-2t)
g(d,s)    = exp(-0.5*d*d/(s*s))
blob(c,s) = g( hypot(|X|-c[0], Y-c[1], Z-c[2]), s )        // c in mm, s in mm
interp(age, keyframes)  // linear, clamped, same as ScientificConstants.interp
hash(k,salt) = fract( sin(k*127.1 + salt*311.7) * 43758.5453 )   // deterministic 0..1
```

**Static fields, one Float32Array per hemisphere, computed once**

| Field | Formula | Meaning |
|---|---|---|
| `ap` | `clamp((Y + 105) / 175, 0, 1)` | 0 at the occipital pole, 1 at the frontal pole |
| `dors` | `ss(-25, 25, Z)` | 0 on the underside, 1 on the upper surface |
| `med` | `1 - ss(6, 16, abs(X))` | 1 on the medial wall |
| `shade` | `(sulc + 128) / 255` | sulcal shading, 0 deep, 1 crown |
| `alpha` | `(1 - ss(0.12, 0.40, ap)) * (0.55 + 0.45 * ss(-30, 10, Z))` | occipital and posterior parietal |
| `spSlow` | `g(ap - 0.80, 0.12) * ss(0, 35, Z)` | superior frontal |
| `spFast` | `g(ap - 0.40, 0.11) * ss(15, 50, Z)` | centro-parietal, upper surface |
| `vtx` | `g(hypot(X, Y + 15, Z - 75), 16)` | vertex, around Cz. I tested 24 mm and it was too wide; 16 is untested. |
| `remUp` | `min(1, blob([6,36,12],16)*med + blob([24,-22,-22],14) + blob([40,-68,-10],18))` | anterior cingulate and medial prefrontal; medial temporal; temporo-occipital visual association |
| `remDown` | `min(1, blob([42,30,30],20) + blob([52,-45,40],18) + blob([6,-55,35],18)*med)` | dorsolateral prefrontal; inferior parietal; precuneus and posterior cingulate |
| `dist[o]` | `hypot(X-ox, Y-oy, Z-oz) / 175` for each origin `o` | travel distance, 0 to about 1 |

Slow-wave origins `(X, Y, Z)` and their weights: left frontal `(-25, 50, 25)` 0.30, right frontal `(25, 50, 25)` 0.30, frontal midline `(0, 60, 10)` 0.15, centro-parietal midline `(0, -30, 70)` 0.15, posterior midline `(0, -80, 30)` 0.10. Distances are straight lines through the head, which lets a wave cross to the other hemisphere.

**Age curves** (keyframes `[age, value]`, linear, clamped). All are display strengths between 0 and 1, compressed so that old-age waves stay visible. They are ordinal.

| Curve | Keyframes |
|---|---|
| `swAmp` slow-wave size | 1: 0.85, 3: 0.95, 6: 1.0, 10: 1.0, 13: 0.92, 17: 0.80, 25: 0.75, 40: 0.65, 60: 0.52, 75: 0.42, 90: 0.36 |
| `swFocus` where along `ap` the waves are largest | 2: 0.20, 5: 0.30, 8: 0.45, 11: 0.55, 14: 0.68, 17: 0.78, 20: 0.80 |
| `swFrontLoss` | `0.35 * clamp((age - 30) / 45, 0, 1)` |
| `spDensity` spindle number | 1: 0.50, 4: 0.60, 9: 0.85, 14: 1.0, 20: 0.95, 40: 0.80, 60: 0.62, 80: 0.45, 100: 0.40 |
| `spAmp` spindle size | 1: 1.0, 18: 1.0, 40: 0.85, 60: 0.70, 80: 0.55 |
| `spFastShare` | 2: 0.20, 10: 0.45, 18: 0.60 |

**Per-age slow-wave field**, recomputed only when the age of that panel changes:

```
swTopo[i] = (0.30 + 0.70 * g(ap[i] - swFocus(age), 0.28))
          * (0.45 + 0.55 * dors[i])
          * (1 - swFrontLoss(age) * ss(0.50, 0.85, ap[i]))
```

### D5. `brain-map.js`: intensity per frame

Two clocks. `t` is the moment in night minutes. `rt` is the rhythm clock in real seconds; it runs whenever the brain is rendering, including while the night is paused, and it is shared by both panels.

Inputs per panel: `stage` from `SleepSim.stageAt` (-1 is out of bed), `age`, `infant`, `t`, `sleepOnset = sim.params.sleepOnset`, `rt`, and `flush` (D6).

**Night pressure**: `pres = exp(-max(0, t - sleepOnset) / 252)`. The 252 minutes is the model's own `tau_d`.

**Layer targets by stage.** Each gain eases toward its target with a 0.25 s time constant so stage changes cross-fade.

| Stage | `gAlpha` | `gVtx` | `gSp` | `gSw` | `gRem` |
|---|---|---|---|---|---|
| Out of bed, or infant | 0 | 0 | 0 | 0 | 0 |
| Wake | 1 | 0 | 0 | 0 | 0 |
| N1 | 0.2 | 1 | 0 | 0 | 0 |
| N2 | 0 | 0 | 1 | 1 | 0 |
| N3 | 0 | 0 | 0.77 | 1 | 0 |
| REM | 0 | 0 | 0 | 0 | 1 |

**Slow waves.** Time is cut into slots of 1.25 s. For slot `k = floor(rt / 1.25)`:

```
prob   = stage is N3 ? 0.45 + 0.55 * swAmp(age) * (0.45 + 0.55 * pres) : 0.10      // N2: occasional K-complex
fires  = hash(k,1) < prob
origin = pick by hash(k,2) against the cumulative weights
onset  = 1.25*k + 0.10 + 0.25*hash(k,3)
size   = swAmp(age) * (0.45 + 0.55 * pres) * (0.80 + 0.20 * hash(k,4))
p      = (rt - onset) - 0.60 * dist[origin][i]                 // seconds since the crest reached vertex i
crest  = min(1, g(p, 0.11) + (p > 0 ? 0.20 * exp(-p / 0.5) : 0))
Isw[i] = fires ? gSw * (1 - flush) * crest * swTopo[i] * size : 0
```

A wave is over before the next slot starts, so only slot `k` needs evaluating.

**Spindles.** Slots of 2.5 s. For slot `j = floor(rt / 2.5)`:

```
fires = hash(j,5) < 0.42 * gSp * spDensity(age)
fast  = hash(j,6) < spFastShare(age)
onset = 2.5*j + 0.20 + 0.60*hash(j,7)
u     = (rt - onset) / 1.0
env   = (u > 0 && u < 1) ? sin(PI*u)^2 : 0
Isp[i] = fires ? (1 - flush) * env * (fast ? spFast[i] : spSlow[i]) * spAmp(age) * 0.9 : 0
```

**Alpha**: `Ial[i] = gAlpha * alpha[i] * (0.55 + 0.15*sin(2*PI*rt/3.1) + 0.10*sin(2*PI*rt/1.3))`.

**Vertex waves.** Slots of 3 s, fire when `hash(m,8) < 0.4`, onset `3*m + 0.5 + 1.5*hash(m,9)`: `Ivx[i] = gVtx * g(rt - onset, 0.12) * vtx[i] * 0.8`.

**REM**: `Iup[i] = gRem * remUp[i] * (0.75 + 0.10*sin(2*PI*rt/5)) `, `Idn[i] = gRem * remDown[i] * 0.6`.

**Arousal flush**: `Ifl[i] = 0.35 * flush * (0.4 + 0.6 * dors[i])`.

**Colour per vertex**, in this order, where `mix(c, target, a)` moves `c` toward `target` by `a`:

```
c = mix(SULCUS, GYRUS, shade[i])
c = mix(c, REM_DOWN, Idn)
c = mix(c, ALPHA,    Ial)
c = mix(c, VERTEX,   Ivx)
c = mix(c, SLOW,     min(1, 1.05*Isw));  if (Isw > 0.8) c = mix(c, SLOW_CREST, (Isw - 0.8) * 2.5)
c = mix(c, SPINDLE,  Isp)
c = mix(c, REM_UP,   0.85*Iup)
c = mix(c, ALPHA,    Ifl)
```

Colours are in C7. Convert hex to linear RGB the way `THREE.Color` does, or do the mixing with `THREE.Color` objects in `brain.js` and keep only the intensities in `brain-map.js`. Either is fine as long as `brain-map.js` stays free of three.js.

**Flash safety.** No layer may change the brightness of more than a quarter of the visible cortex more than three times a second. The rules above satisfy this: slow waves at most 0.8 per second, everything else slower. Keep it true if any rate is tuned.

### D6. Arousals

`sim.wakeEvents` is a list of `{ time }`. When the moment moves forward from `t0` to `t1` (any source) and a `wakeEvents[n].time` lies in `(t0, t1]`, start a flush for that panel: `flush` rises linearly to 1 in 0.12 s and decays exponentially with a 0.4 s time constant. A new flush cannot start within 0.35 s of the last one. Large jumps (more than 20 night-minutes in one step) do not trigger. Nothing triggers while the moment is still.

### D7. `brain.js`: scene and render loop

1. Build one controller per visible panel. Create B's lazily on the first compare. Dispose B's renderer when compare is turned off.
2. `const THREE = await import('./vendor/three.module.min.js')` and the mesh fetch happen once, on the first time any strip is visible and not hidden. Share the decoded typed arrays and the static fields between panels. Each panel has its own renderer, geometry, colour buffer and `swTopo`.
3. Renderer: `new THREE.WebGLRenderer({ antialias: true, alpha: true })`, `setPixelRatio(Math.min(devicePixelRatio, 2))`. Material: `MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide })`. Lights: `HemisphereLight('#f4f1ec', '#1d2433', 1.25)` and `DirectionalLight('#ffffff', 1.2)` at `(1.5, 4, 2)`. These are Lantern's values and they gave the right matte look in the prototype.
4. Camera as Lantern: `PerspectiveCamera(30, aspect, 0.1, 50)`, tilt 35 degrees, `dist = 5.5 * max(1, 0.95 / aspect)`, position `(0, dist*cos(tilt), dist*sin(tilt))`, `lookAt(0, -0.05, 0.1)`. Rotate the root group, not the camera.
5. Views as root rotation `(pitch, yaw)` in radians, all tested in the prototype. Top, which is also the default: `(0.72, -0.38)`, seen from above and slightly behind with the front at the top of the window. Side: `(-0.35, -PI/2)`. Inside: `(-0.35, +PI/2)` with the left hemisphere mesh hidden, which shows the medial surface of the right hemisphere. View changes tween over 300 ms. Leaving Inside shows the left hemisphere again.
6. Rotation by pointer drag: yaw free, pitch clamped to `[-0.9, 1.1]`, 0.008 rad per px. Double click returns to the default view. `touch-action: pan-y` on the canvas; with touch input only yaw changes. Rotation and view are shared between A and B.
7. "front" and "back" labels: two absolutely positioned 12 px spans, placed each frame by projecting the points `(0, 0.3, -1.6)` and `(0, -0.2, 1.9)` in root space, as Lantern's `placeWellLabels` does. Hide a label when its point is behind the brain centre in view space.
8. One `requestAnimationFrame` loop for all panels. A panel paints and renders only if all of these hold: the strip is not hidden, an `IntersectionObserver` says its canvas is on screen, `document.hidden` is false, and the WebGL context is alive. If no panel qualifies, stop the loop and restart it from the observers. `rt` advances by real time only while the loop runs.
9. With `prefers-reduced-motion: reduce`, freeze `rt` at 0.42 and render only when the moment, the view or the state changes. Play still works when pressed.
10. Per frame per panel: update gains, compute intensities with `brain-map.js`, write the colour attribute, set `needsUpdate`, render. The prototype's paint of both hemispheres took well under 1 ms on this Mac.
11. Resize with a `ResizeObserver` on the brain box.
12. Strip text: update the chip, clock, caption and legend only when the stage, the age band or the minute changes, never per frame. The caption container is `aria-live="polite"` while paused and `aria-live="off"` while playing. The canvas is `aria-hidden="true"`.
13. Ribbon: a 2D canvas 14 px tall drawing `sim.blocks` in `STAGE_COLORS` across the current view, with a transparent `<input type="range" min=viewStart max=viewEnd step=1>` laid over it (44 px hit height on phones). Input events call `SleepSim.setMoment(value, 'ribbon')` and pause playback.
14. Hide and show: toggle a `brain-hidden` class on `body`, store `sas.brain` = `0` or `1` in `localStorage` inside try/catch, fire a resize so the hypnogram redraws at its new height.

### D8. Fallback

Wrap the import, the fetch and the renderer creation in one try/catch, and listen for `webglcontextlost`. On any failure replace the 3D window with a 13 px message on the same gradient and leave the rest of the strip working:

* No WebGL or context lost: "The 3D brain needs WebGL, which is not available in this browser."
* Fetch or import failed and `location.protocol === 'file:'`: "The 3D brain needs the page to be opened from a web server, for example python3 -m http.server."
* Other load failure: "The 3D brain could not be loaded."

`app.js` must never depend on `brain.js`. If the module fails to load at all, the simulator works exactly as in Stage 1 plus the playhead, and the strip markup stays hidden (it starts with the `hidden` attribute and `brain.js` removes it).

### D9. Markup and CSS

Per panel, between the infant caption and `.dashboard`, wrapped with the dashboard in a new `<div class="lower-deck">`:

```html
<section class="brain-strip" id="brain-a" aria-label="Brain view" hidden>
  <div class="brain-box"><!-- renderer canvas, front/back labels, fallback message --></div>
  <div class="brain-info">
    <div class="brain-head">
      <span class="stage-chip"><i></i><span class="stage-name"></span><span class="stage-clock"></span></span>
      <button type="button" class="brain-play">Play the night</button>
      <div class="brain-views" role="group" aria-label="View">
        <button type="button" data-view="top" aria-pressed="true">Top</button>
        <button type="button" data-view="side">Side</button>
        <button type="button" data-view="inside">Inside</button>
      </div>
      <button type="button" class="brain-hide">Hide</button>
    </div>
    <p class="brain-caption" aria-live="polite"></p>
    <div class="brain-legend"></div>
    <div class="brain-ribbon"><canvas></canvas><input type="range" aria-label="Time of night"></div>
    <p class="brain-foot">Schematic on an adult template brain. Slow motion. Not a recording.</p>
  </div>
  <button type="button" class="brain-show">Show brain</button>
</section>
```

CSS rules to write:

* `.lower-deck { flex: 0 0 auto; display: flex; flex-direction: column; }`.
* `.brain-strip`: `display: grid; grid-template-columns: 260px 1fr; height: 204px;` background `var(--bg-primary)`, top border `var(--line)`.
* `.brain-box`: `position: relative;` the radial gradient from C7.
* Buttons follow the existing `.profile-tabs .tab` look. Minimum height 32 px on desktop, 44 px at 820 px and under.
* `body.brain-hidden .brain-strip`: one 40 px row showing only `.brain-show`.
* `body.compare-active .brain-strip`: `grid-template-columns: 200px 1fr; height: 190px;` caption clamped to three lines.
* `@media (max-height: 760px) and (min-width: 1420px)` and not compare: `.lower-deck { flex-direction: row; }`, strip `flex: 0 0 440px` with `grid-template-columns: 200px 1fr`, dashboard `flex: 1`. (1420 px of window is 1100 px of main area beside the 320 px sidebar.)
* `@media (max-width: 820px)`: strip `display: block; height: auto;` brain box `height: 240px;` info padding `0.75rem 1rem`.
* `.playhead` as in D3.4. `.hypno-canvas { touch-action: pan-y; }`.
* Every text size in the strip is at least 12 px.

### D10. Tests

`tests/brain-map.mjs`, run with `node tests/brain-map.mjs`, exits non-zero on failure. It loads `vendor/fsaverage5.bin` with `fs`, builds the fields, and checks:

1. 10242 vertices and 20480 faces per hemisphere; every face index is below 10242.
2. Field sanity: the mean of `ap` over vertices with `Y > 40` is above 0.8; `alpha` is above 0.5 at the vertex nearest `(±20, -95, 5)` and below 0.05 at the one nearest `(±30, 40, 30)`; `spSlow` peaks in front of `spFast` (weighted mean Y differs by at least 40 mm); `remUp` and `remDown` overlap (both above 0.3) on fewer than 2% of vertices.
3. N3, age 25, `pres` 1, averaged over 200 fired slots: mean peak slow-wave intensity over frontal vertices (`ap > 0.7`, `Z > 20`) exceeds the occipital mean (`ap < 0.2`) by at least 30%.
4. The same at age 4: the occipital and parietal mean (`ap < 0.35`) exceeds the frontal mean.
5. Mean slow-wave intensity at age 75 is below age 25, which is below age 8. The share of slots that fire follows the same order.
6. `pres` 0.2 gives lower intensity and fewer fired slots than `pres` 1 at the same age.
7. Among fired N3 slots, 70% to 80% use one of the three frontal origins.
8. Stage gating: with stage REM, Wake, N1 or out of bed, `Isw` and `Isp` are zero everywhere after the gains settle. With N3 or N2, `Ial`, `Iup` and `Idn` are zero.
9. Spindle count over 600 s of `rt`: age 14 above age 40 above age 80; N3 about 0.77 of N2 within 15%.
10. Infant: every intensity is zero.
11. Determinism: the same inputs give identical output arrays.
12. Flash safety: over 60 s at 60 frames per second for each stage, count upward crossings of the mean cortex intensity through its own mean plus 20% of its range. Never more than three in any one-second window.

I have not run these thresholds. If one fails by a small margin with the formulas in D4 and D5 implemented as written, report the measured value and adjust the threshold, not the formula.

Also add to the README test section: `node tests/scenarios.mjs --check && node tests/brain-map.mjs`.

### D11. Licence and attribution

What I found. The FreeSurfer Software License Agreement (Part B) grants "a royalty-free, non-exclusive license to use, reproduce, make derivative works of, display and distribute the Software". The conditions: the licence terms travel with every copy, with the notice that the files "have been obtained under license from The General Hospital Corporation"; attributions and copyright notices are preserved; modified versions are clearly marked as modified; MGH's names are not used to endorse or promote. There is no non-commercial restriction. The licence says the software "has been designed for research purposes only" and that clinical applications are neither recommended nor advised. MNE-Python and nilearn both hand out fsaverage on these terms. I am not a lawyer; this is my reading of the licence text.

What to add.

`vendor/FREESURFER-LICENSE.txt`, top of file, then the unchanged licence text:

```
fsaverage5.bin in this folder contains the FreeSurfer "fsaverage5" template cortical surface
and sulcal depth map. These files have been obtained under license from The General Hospital
Corporation and are covered by the FreeSurfer Software License Agreement below, not by the
MIT license of this repository.
Modified from the original: both hemispheres were repacked into one binary file, vertex
coordinates were divided by 75, and sulcal depth was stored as 8-bit integers.
```

README, new section "Third-party material":

```
The 3D brain uses the FreeSurfer fsaverage5 template surface (Fischl B, Sereno MI, Tootell RBH,
Dale AM. High-resolution intersubject averaging and a coordinate system for the cortical surface.
Hum Brain Mapp 1999;8:272-284). vendor/fsaverage5.bin was obtained under license from The General
Hospital Corporation and is covered by the FreeSurfer Software License Agreement
(vendor/FREESURFER-LICENSE.txt), not by the MIT license of this repository. It is a repacked,
rescaled copy of the original files. FreeSurfer is designed for research purposes; this page is
a teaching schematic and not a clinical tool.

3D rendering by three.js r160, MIT license, copyright three.js authors (vendor/THREE-LICENSE.txt).
```

README licence line: change "MIT License" to "MIT License for the code in this repository. See Third-party material for the brain mesh."

On the page, in the existing `.chart-note` line, before "Sources": "Brain surface: FreeSurfer fsaverage."

Add the A4 sources that the brain uses to the README source list.

### D12. Performance budget

* Paint plus render per panel under 4 ms on a MacBook, 60 frames per second with two panels in compare mode.
* iPhone: one panel on screen at a time in practice. Pixel ratio capped at 2. If the measured frame time stays above 20 ms for two seconds, drop that panel to every second frame.
* Nothing renders when the strip is hidden, off screen, or the tab is in the background.
* First load with the strip shown adds about 0.7 MB of transfer (three.js gzipped plus the mesh, which GitHub Pages may serve uncompressed). The hypnogram must be drawn and interactive before either arrives.

### D13. Order of work

1. Vendor files and licences.
2. `brain-map.js` and `tests/brain-map.mjs`, green.
3. `app.js` moment, playhead, API and URL hooks, with the strip still hidden. Check the playhead in headless screenshots.
4. `brain.js` and the strip, single mode desktop.
5. Compare, phone, lower deck, hide, fallback, reduced motion.
6. README.
7. Headless screenshots of every case in section E, look at each one, fix, then show Martin.

---

## E. Acceptance checks

Serve the folder (`python3 -m http.server 8000`) and screenshot with headless Chrome using software WebGL. This command rendered the prototype correctly on this Mac:

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars \
  --window-size=1440,900 --virtual-time-budget=6000 --screenshot=out.png "URL"
```

Chrome's command line will not go narrower than about 500 px, so the 390 px phone shots need a driver with device emulation (for example `npx playwright` with the same two swiftshader flags). All URLs below add `rt=` to freeze the rhythm clock so shots are repeatable.

### E1. Model untouched

1. `node tests/scenarios.mjs --check` passes.
2. The text of `app.js` above `// --- APP LOGIC ---` is byte-identical to `main` (compare the two slices).
3. `node tests/brain-map.mjs` passes.
4. `grep` finds no `Math.random` in `brain-map.js`, and the repository contains no file from Lantern other than the two vendor files.

### E2. Visual, desktop 1440 x 900 unless stated

State JSON below is shown unencoded for reading.

| # | URL parameters | What must be visible |
|---|---|---|
| V1 | none | Hypnogram at full width and at least 340 px tall. Strip under it with the cortex, the chip "N3", a caption, a ribbon. Playhead inside the first N3 block. No overlap, no clipped text. |
| V2 | `rt=0.25`, `rt=0.45`, `rt=0.65` (default state, pick a slot that fires and note its `rt` values in the PR) | Three frames of one violet wave: at the front, mid-cortex, at the back. The crest is near white, the cortex relief still reads through the colour. |
| V3 | `state={"age":4}` at an N3 moment | The slow-wave field is brightest over the back half of the cortex. |
| V4 | `state={"age":75}` at an N3 moment, same `rt` as V2 | The wave is visibly dimmer than V2 and the frontal part is no brighter than the centre. |
| V5 | an N2 moment with `rt` inside a slow and then a fast spindle | Mint over the superior frontal cortex in one shot, over the centro-parietal cortex in the other. |
| V6 | a Wake moment during sleep latency | Red glow over the occipital and posterior parietal cortex only. Chip "Wake". |
| V7 | a REM moment, `view=top` | Steel blue on the dorsolateral prefrontal and inferior parietal cortex. Chip "REM" in the REM colour. Caption mentions PET. |
| V8 | the same moment, `view=inside` | Medial surface of one hemisphere. Amber on the anterior cingulate and medial prefrontal area and along the medial temporal edge. Blue on the precuneus. "front" label on the correct side. |
| V9 | `t` before bedtime | Plain cortex. Chip "Awake and out of bed". Playhead left of the first block. |
| V10 | `state={"age":0}` | Plain cortex and the newborn caption. No colour layers. |
| V11 | `stateB={"age":75}` (compare), 1440 x 900 and 1280 x 720 | Two strips, two brains, same clock time in both chips, different stages or wave strength. Both playheads at the same x position relative to the shared axis. No horizontal scroll. |
| V12 | 1280 x 720, single | Lower deck is side by side. Hypnogram at least 250 px tall. Nothing clipped. |
| V13 | `brain=0` | Strip collapsed to a 40 px bar. Hypnogram taller than in V1 by about 160 px. |
| V14 | 390 x 844, single and compare, scrolled to the strip | Brain full width and 240 px tall, buttons 44 px, caption fully visible, no horizontal scroll. |
| V15 | WebGL disabled (`--disable-gpu --disable-software-rasterizer`, or stub `getContext` to return null) | The fallback sentence in the brain box. Chip, caption, ribbon and playhead still present. No console error other than the one logged on purpose. |
| V16 | every shot above | No text under 12 px in the strip. No cartoon look: no outlines, no flat fills, no glow halos. Stage colours match the hypnogram. |

### E3. Functional (drive with a headless driver, or by hand)

1. Moving the mouse across the hypnogram moves the playhead, the ribbon thumb, the chip clock and the stage name together. Leaving the canvas leaves them in place.
2. Dragging the ribbon moves the hypnogram playhead. Arrow keys on the ribbon move one minute.
3. Play runs from the moment to wake-up in about one second per 8 night-minutes and stops there. Play again restarts from just before bedtime. Clicking the hypnogram while playing pauses.
4. Changing the age slider while paused keeps the clock time, updates the stage chip if the stage at that time changed, and changes the wave strength within one frame.
5. In compare mode, dragging one brain turns both. The view buttons change both. Turning compare off disposes B's WebGL context (check `renderer.info` or the context count).
6. Severe apnea, played: red flushes appear many times more often than with no apnea, and never faster than three a second.
7. With the strip hidden at load, the network log shows no request for `three.module.min.js` or `fsaverage5.bin`. Pressing "Show brain" fetches both once.
8. With the strip scrolled off screen or the tab hidden, the render loop is stopped (frame counter in `stats=1` does not advance).
9. `stats=1` on a MacBook: paint plus render under 4 ms per panel in compare mode.
10. On an iPhone: rotation is smooth, the page still scrolls vertically when the finger starts on the brain or on the hypnogram, and a horizontal drag on the hypnogram scrubs.
11. Opening `index.html` from `file://`: the simulator works, the strip shows the web-server sentence.
12. `prefers-reduced-motion`: the cortex is still until the moment changes.

---

## F. Open points for Martin

1. **Kurth keyframes.** The posterior-to-anterior shift is solid. The ages I gave the in-between positions come from the abstract and from memory of the figure. Worth one look at Figure 2 of the paper.
2. **Mixing EEG and PET on one brain.** NREM and wake show EEG rhythms; REM shows blood flow. The caption says so. If that feels like two pictures pretending to be one, the alternative is a plain cortex in REM with the caption only, which is honest but dull.
3. **Colours.** Violet and mint come from Lantern, wake and REM from the stage colours. The mint is close to the growth-hormone overlay teal. They never share a canvas, so I left it.
4. **Mesh provenance.** I could not find the script that built `fsaverage5.bin`. The modification note in D11 assumes it is the pial surface plus the sulcal depth map, rescaled by 1/75. Confirm before the licence file is committed.
5. **Share links.** The URL hooks in D3.9 are there for testing, and they also make any state linkable. Say if you would prefer them undocumented.
