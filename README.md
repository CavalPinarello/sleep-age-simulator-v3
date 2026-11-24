# Sleep Age Simulator

An interactive teaching model of how a night of sleep changes with age, sex, timing, evening habits and a few common health conditions.

## Overview

The simulator draws a hypnogram (Wake, REM, N1, N2, N3) for one night and reports time in bed, total sleep, sleep efficiency, time to fall asleep, time awake in the night and the share of each stage. Every number under the chart is measured from the drawn night, so the chart and the numbers always agree. The same settings always give the same night.

Values are typical for healthy sleepers. Lifestyle effects are averages from sleep-lab studies and vary a lot between people. The tool is for teaching and is not a diagnostic instrument.

## Controls

* **Person**: age 0 to 100 and sex. Age 0 shows the night part of a newborn's day as active (REM) and quiet (NREM) sleep.
* **Evening**: alcohol, coffee (with the time of the last cup and caffeine metabolism) and a bright screen in the last hour.
* **Body clock**: chronotype, a work night after a late weekend, and jet lag on the first night after landing.
* **Health**: sleep apnea (none, mild, moderate, severe by AHI), toilet trips at night, perimenopause with night sweats.
* **Overlays**: sleep pressure (Process S) and melatonin from the two-process model, growth hormone and cortisol.
* **Compare**: two nights side by side on the same clock axis. B starts as a copy of A.

## The brain window

Under the hypnogram a small 3D cortex shows the EEG signature of the stage at one moment of the night: travelling slow waves in N3 (and the odd K-complex in N2), spindles in N2 and N3, the alpha rhythm over the back of the head while awake with eyes closed, vertex waves in N1, and in REM the regional blood-flow pattern from PET studies. Age changes the size, number and position of the slow waves and spindles. Arousal ticks from the model show as a brief red flush while the night plays.

Move the pointer over the hypnogram (or drag a finger sideways on a phone) to pick the moment, or press "Play the night". The ribbon under the caption is a keyboard slider: arrow keys move one minute, Page Up and Page Down move 30. Drag the brain to turn it; Top, Side and Inside are preset views, and Inside shows the medial surface of the right hemisphere. In compare mode each night gets its own brain at the same clock time, and turning one turns both. "Hide" collapses the window and is remembered.

Everything on the brain is a drawing rule driven by the simulated night. It is a schematic on an adult template brain, shown in slow motion, and not a recording. The design, the evidence for each rule and what is deliberately left out are in `docs/stage2-brain-brief.md`.

The brain needs the page to be served over http (for example `python3 -m http.server`) and a browser with WebGL. Opened from `file://` or without WebGL, the simulator works as before and the window says why the brain is missing.

Links can set the starting state, which also helps for screenshots: `state=` and `stateB=` take URL-encoded JSON with the same keys as the controls (for example `?state={"age":75}`, and `stateB` turns compare on), `t=` sets the moment in minutes after 18:00, `rt=` freezes the rhythm clock in seconds, `view=top|side|inside` picks the view, `brain=0|1` hides or shows the window, and `stats=1` prints paint and render time in the corner of the brain.

## Usage

Serve the folder with any static server (`python3 -m http.server`) and open it in a modern browser. Opening `index.html` directly works for everything except the 3D brain. There is no build step; three.js and the brain mesh are in `vendor/`.

## Tests

`node tests/scenarios.mjs --check && node tests/brain-map.mjs`

The first runs the model against the acceptance ranges in `docs/stage1-review.md` (section F9). The second checks the brain mesh, the region fields and the drawing rules of the brain window against the tests in `docs/stage2-brain-brief.md` (section D10). Both exit non-zero on any failure.

## Sources

* Boulos MI et al. Normal polysomnography parameters in healthy adults: a systematic review and meta-analysis. Lancet Respir Med 2019;7:533-543. doi:10.1016/S2213-2600(19)30057-8
* Normal polysomnography parameters in healthy children: a systematic review and meta-analysis. Eur Respir Rev 2025;35(180):250224. https://pmc.ncbi.nlm.nih.gov/articles/PMC13169063/
* Ohayon MM, Carskadon MA, Guilleminault C, Vitiello MV. Meta-analysis of quantitative sleep parameters from childhood to old age in healthy individuals. Sleep 2004;27:1255-1273.
* Mitterling T et al. Sleep and respiration in 100 healthy Caucasian sleepers. Sleep 2015;38:867-875.
* Redline S et al. The effects of age, sex, ethnicity, and sleep-disordered breathing on sleep architecture. Arch Intern Med 2004;164:406-418.
* MrOS and SOF comparison of sleep at matched age. Sleep 2020. https://pmc.ncbi.nlm.nih.gov/articles/PMC7355398/
* Hirshkowitz M et al. National Sleep Foundation's sleep time duration recommendations. Sleep Health 2015;1:40-43.
* Gardiner C et al. The effect of caffeine on subsequent sleep: a systematic review and meta-analysis. Sleep Med Rev 2023;69:101764.
* Drake C, Roehrs T, Shambroom J, Roth T. Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed. J Clin Sleep Med 2013;9:1195-1200.
* Gardiner C et al. The effect of alcohol on subsequent sleep in healthy adults: a systematic review and meta-analysis. Sleep Med Rev 2025;80:102030.
* Ebrahim IO et al. Alcohol and sleep I: effects on normal sleep. Alcohol Clin Exp Res 2013;37:539-549.
* Roehrs T, Roth T. Sleep, sleepiness, and alcohol use. Alcohol Res Health 2001;25:101-109.
* Chang AM, Aeschbach D, Duffy JF, Czeisler CA. Evening use of light-emitting eReaders negatively affects sleep, circadian timing, and next-morning alertness. PNAS 2015;112:1232-1237.
* Cajochen C et al. Influence of evening light exposure on polysomnographically assessed night-time sleep: a systematic review with meta-analysis. Light Res Technol 2022.
* Schöllhorn I et al. Melanopic irradiance defines the impact of evening display light on sleep latency, melatonin and alertness. Commun Biol 2023.
* Chinoy ED, Duffy JF, Czeisler CA. Unrestricted evening use of light-emitting tablet computers delays self-selected bedtime and disrupts circadian timing and alertness. Physiol Rep 2018.
* De Zambotti M et al. Magnitude of the impact of hot flashes on sleep in perimenopausal women. Fertil Steril 2014;102:1708-1715.
* SWAN Sleep Study, polysomnography by menopausal status. https://pmc.ncbi.nlm.nih.gov/articles/PMC2572739 and https://pmc.ncbi.nlm.nih.gov/articles/PMC8598193
* Roenneberg T et al. A marker for the end of adolescence. Curr Biol 2004;14:R1038-R1039.
* Sack RL et al. Circadian rhythm sleep disorders: part I, basic principles, shift work and jet lag disorders. Sleep 2007;30:1460-1483.
* Borbély AA. A two process model of sleep regulation. Hum Neurobiol 1982;1:195-204.
* Daan S, Beersma DG, Borbély AA. Timing of human sleep: recovery process gated by a circadian pacemaker. Am J Physiol 1984;246:R161-R183.
* Van Cauter E, Leproult R, Plat L. Age-related changes in slow wave sleep and REM sleep and relationship with growth hormone and cortisol levels in healthy men. JAMA 2000;284:861-868.

Jet lag, social jet lag and nocturia effect sizes are illustrative; no pooled polysomnography estimate was found for them.

### Brain window

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
* Berry RB et al. The AASM Manual for the Scoring of Sleep and Associated Events (alpha rhythm, vertex sharp waves, K-complexes, spindles, arousal rule).
* Fischl B, Sereno MI, Tootell RBH, Dale AM. High-resolution intersubject averaging and a coordinate system for the cortical surface. Hum Brain Mapp 1999;8:272-284.

## Third-party material

The 3D brain uses the FreeSurfer fsaverage5 template surface (Fischl B, Sereno MI, Tootell RBH,
Dale AM. High-resolution intersubject averaging and a coordinate system for the cortical surface.
Hum Brain Mapp 1999;8:272-284). vendor/fsaverage5.bin was obtained under license from The General
Hospital Corporation and is covered by the FreeSurfer Software License Agreement
(vendor/FREESURFER-LICENSE.txt), not by the MIT license of this repository. It is a repacked,
rescaled copy of the original files. FreeSurfer is designed for research purposes; this page is
a teaching schematic and not a clinical tool.

3D rendering by three.js r160, MIT license, copyright three.js authors (vendor/THREE-LICENSE.txt).

## License

MIT License for the code in this repository. See Third-party material for the brain mesh.
