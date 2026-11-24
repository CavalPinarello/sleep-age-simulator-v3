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

## Usage

Open `index.html` in a modern browser, or serve the folder with any static server (`python3 -m http.server`). No build step and no dependencies.

## Tests

`node tests/scenarios.mjs --check` runs the model against the acceptance ranges in `docs/stage1-review.md` (section F9) and exits non-zero on any failure.

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

## License

MIT License
