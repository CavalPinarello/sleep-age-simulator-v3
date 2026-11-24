# Sleep Age Simulator v3 - Stage 1 review and implementation brief

Reviewed on 24 November 2026 against commit f7daa33 (the v2.1 copy). Files read in full: `app.js` (1080 lines), `index.html`, `style.css`, `models.js`. Nothing in those files was edited. The only new files are this document and `tests/scenarios.mjs`.

Run the harness with `node tests/scenarios.mjs` (add `--check` for the acceptance tests in section F9).

## A. Verdict

The age trend is roughly right and the picture is attractive, but the model does not hold up as "scientifically accurate". The hypnogram and the numbers printed under it come from two different calculations, so the page contradicts itself on almost every setting. Several lifestyle effects are three to five times larger than the literature supports. The current code fails 152 of the 256 acceptance checks I propose below.

The five problems that matter most:

1. **The numbers under the chart are not the numbers in the chart.** The pie and the WASO card print the target values. The drawn blocks follow different per-cycle formulas. A healthy 25-year-old is drawn with 28% N3 and the pie says 20%. A newborn is drawn with 69% REM and the pie says 50%. With severe apnea the pie says 20% N1 and the chart contains 3%.
2. **N1 is never drawn from its parameter.** Age, caffeine, screens, perimenopause and apnea all raise `n1P`, and none of that reaches the hypnogram. Apnea's main real effect on architecture (a lot more N1) is invisible.
3. **Wake is placed badly and at random.** Wake blocks are only ever added after REM at the end of a cycle, several are glued into one long block, some are silently dropped, and the ones that land on the last cycle become a block of wake after the final sleep. An 80-year-old gets 38 minutes of "wake after sleep" at the end on average, counted in WASO and in time in bed. The picture changes on every render because of `Math.random`.
4. **Effects are overstated.** Screens add 45 minutes of latency (best evidence: about 10, and only after four hours of bright reading). Three drinks add 75 minutes of WASO and nearly abolish early REM (meta-analysis: WASO change not significant, REM down about 20 minutes). Perimenopause adds 45 minutes of WASO plus an N3 cut (SWAN found no PSG difference by menopausal status, hot flashes account for about 17 minutes). Older adults are too short and too broken: 80-year-old man at 5.2 h and 66% efficiency against about 6 h and 77%.
5. **Dead and misleading controls.** The Jet Lag dropdown does nothing. Sex changes nothing before 30 and only a 10% WASO factor after. Caffeine metabolism does nothing at 0 h. The overlay heading credits the two-process model to Matthew Walker (it is Borbély 1982, and growth hormone and cortisol are not part of it). The apnea slider has no readout. The page is unusable on a phone.

What is fine and should stay: the stage order on the y-axis (Wake, REM, N1, N2, N3), the N2 bridge between N3 and REM, REM latency near 85 minutes, the first REM period being short, the two-process time constants (18.2 h rise, 4.2 h decay, Daan 1984), the clock axis arithmetic, the dark look, and compare mode as a concept.

## B. Bug list

Line numbers are `app.js` unless another file is named.

### B1. Model

| # | Where | Bug | Effect |
|---|---|---|---|
| M1 | 448, 520, 657, never read in 119-125 | `jetLag` state is collected and never used by `generate`. | Dropdown is dead. Harness confirms identical output. |
| M2 | 100, 140, 151, 185, 213 vs 250, 342 | `n1P` is modified by five modifiers and never used to build blocks. Drawn N1 is only the 5 to 10 min onset block plus 2 to 4 min per cycle. | N1 drawn 3% where the pie says 5 to 20%. |
| M3 | 279, 282 vs 1015-1019 | Per-cycle weights do not average to 1. Over five cycles N3 is multiplied by 1.4 and REM by 1.1. Pie uses the unweighted targets. | Pie and chart disagree for every age. |
| M4 | 279 | `1 - cycleIndex * 0.15` goes negative from cycle 7. The N3 block is skipped but the negative value still inflates N2. | Children and newborns (7+ cycles). |
| M5 | 282, 298-303 | REM weight grows without limit, then the normaliser clamps the cycle to 90% REM. | Newborn's last REM block is 355 minutes long. |
| M6 | 255-263, 351-355 | Wake chunks get a random cycle index in `[0, ceil(tst/90))`. Real cycles are 92 to 94 min plus the onset N1, so the last index often does not exist and the chunk is dropped. | 25-year-old: about 1 render in 6 has zero WASO while the card says 18 m. |
| M7 | 351-355 | Chunks are appended only at the end of a cycle and concatenate. Chunks on the last cycle sit after the last sleep block. | Long solid wake blocks, wake after "end of sleep", TIB inflated. |
| M8 | 261, 368 | `Math.random` in the generator. | Picture jumps on every slider move and differs between profile A and B for the same settings. |
| M9 | 1019, 1022, 1040 | Pie "Wake" is `wasoMins / tst`, then all five slices are renormalised. Stage percentages are therefore percent of (TST + WASO), not percent of TST, and latency is left out. | Mixed denominators. N3 20.7% prints as 20%. |
| M10 | 1053 | WASO card prints the target, not the drawn wake. | See M6, M7. Extreme case prints 760 m of WASO for a night with none drawn. |
| M11 | 307-338 | A short last cycle is a scaled-down copy of a whole cycle (3 min N2, 3 min N3, 5 min N2, 9 min REM). | Unreal mini-cycle with N3 at the end of the night. |
| M12 | 279 | N3 appears in every cycle including the last one before waking. | 71% of N3 in the first half. Real adults: 80% or more. |
| M13 | 316, after 352 | After a wake block the next cycle starts in N2. | Wake goes straight to N2. Should pass through N1. |
| M14 | 175-178 | Sex only scales WASO by 1.1 for men over 30. | 25 M and 25 F are identical. The best documented sex difference (N3) is missing. |
| M15 | 147 | Caffeine is evaluated once, at bedtime. At 0 h the half-life has no effect. | Slow, normal and fast are identical at 0 h. |
| M16 | 153, 168, 216 | TST modifiers can drive the target to zero or below. The loop then never runs. | Max stacking gives 60 min of sleep, all N1, no REM, no error. No NaN and no infinite loop were found. |
| M17 | 189-194, 381-392, 702-704, 418-420 | Elderly phase advance and teen delay move the hypnogram but the "ideal window" and the circadian curve only know about chronotype. | Window and curve disagree with the night shown. |
| M18 | 363-370 | "Micro-arousals" are drawn as full-height red lines up to Wake, at random times, including on top of wake blocks. 155 lines at apnea 10. | Reads as 155 awakenings. Not counted anywhere. |
| M19 | 275 | `cycleProgress` computed and never used. | Dead code. |
| M20 | 124, 181, 244 | `isMenopausal` destructured, then `config.isMenopausal` used. | Cosmetic. |
| M21 | 405-407, 418, 735, 826, 890 | The 22:00 bedtime is the literal `240` in six places. | Hard to change safely. |
| M22 | 414, 759 | `TwoProcessModel.getCurves` takes `tst`, is passed `tib`, and uses neither. | Dead parameter. |
| M23 | `models.js` | Old engine, not loaded by `index.html`. | Delete. |

### B2. State and compare mode

| # | Where | Bug |
|---|---|---|
| S1 | 626-627, 648-649 | When the perimenopause row is hidden the state is reset to false but the checkbox stays checked. Pick female 50, tick it, switch to male, switch back: box is ticked, model says no. |
| S2 | 662 | `bind('nocturia-slider', ...)` targets an element that does not exist. |
| S3 | 622 | The `key === 'gender'` branch in `bind` can never run (gender is bound through `bindRadios`). |
| S4 | 459-462, 549-552 | Overlay toggles are stored per profile. In compare mode, ticking "Sleep Drive" shows it on A only. |
| S5 | 466-469 | Profile B starts as the default 25-year-old man, not as a copy of A, so the first comparison is never "same person, one change". |
| S6 | 888-906 | Each panel auto-zooms to its own night. In compare mode the two clock axes differ, so blocks cannot be compared by eye. |
| S7 | 680-695, 1078-1079 | On load `resizeAll` simulates A and the hidden B, then A is simulated again. Harmless once the generator is deterministic. |
| S8 | 573 | Toggling compare mode re-simulates B (new random night) but not A. |
| S9 | 599-608 | Counters allow 10 drinks, 10 coffees, 10 toilet trips. |
| S10 | `index.html` 31-170 | `<div id="controls-mask">` is never closed. |
| S11 | `index.html` 21 | Says "v2.1 (Live)" in the v3 copy. |
| S12 | 435 | Leftover `console.log('DOM Loaded')`. |

### B3. Rendering and labels

| # | Where | Bug |
|---|---|---|
| R1 | 691-692 | Canvas is sized in CSS pixels with no `devicePixelRatio` scaling. Text and lines are blurry on every Retina Mac and every phone. |
| R2 | `style.css` 197-204, 171 | Metric labels have `white-space: nowrap` with ellipsis in a 70 px column. "Time in Bed" shows as "Time in ...". In compare mode "Total Sleep" is cut as well. |
| R3 | `style.css` whole file | No media query. Sidebar is a fixed 320 px and `body` is `overflow: hidden`, so at 390 px the chart gets 70 px and cannot be scrolled to. Confirmed with a headless screenshot. |
| R4 | `style.css` 48 | Header rules were replaced by the comment `/* ... headers ... */`. Title and compare toggle sit flush against the left edge with browser default margins. |
| R5 | `style.css` 97 | Only `canvas#hypnogram` is styled. `#hypnogram-b` is an inline element with a baseline gap. |
| R6 | 753-755 | Marker says "End of Sleep (8.2h)". The number is time in bed, and the marker sits after any trailing wake. |
| R7 | 700-731 | "Ideal Sleep Window" is a fixed 8 hours for every age, including a newborn and an 8-year-old who needs 9 to 11. |
| R8 | 800 | "Sleep Drive (S)" is the only overlay label. It inherits whatever font and alignment the previous call left, and its x position ignores the left padding. The other three curves have no label or legend. |
| R9 | `index.html` 151 | "Overlays (Matthew Walker Model)". The two-process model is Borbély (1982) and Daan, Beersma and Borbély (1984). Walker popularised it in a trade book. GH and cortisol are not part of it. |
| R10 | `index.html` 154, 158, 814-816 | "Sleep Drive (Adenosine)" and "Circadian (Melatonin)". Process S is defined by slow-wave activity. Adenosine is one proposed substrate. The circadian curve is a cosine that peaks at 01:00 and stays above half height for 12 hours, which is neither Borbély's Process C (an alerting signal that peaks in the evening) nor a melatonin profile (near zero by day). |
| R11 | 838-844 | The growth hormone pulse is fixed at 70 minutes after bedtime, not after sleep onset and not tied to N3. Same height for a child and a 90-year-old. With screens on (45 min latency) it peaks before deep sleep starts. |
| R12 | 942 | Hours print as `0:00`, `1:00`. Should be `00:00`. |
| R13 | 716, 927 | Canvas text uses `Inter` before the web font has loaded, so the first paint uses the fallback font. |
| R14 | `index.html` 140-141 | Apnea slider has no value, no scale and no `for` on its label. Nobody can tell what 7 means. |
| R15 | `README.md` | Claims "scientifically accurate" and cites Feinberg 1974, which the code does not use. |

## C. Science check

Normative anchors used below. Boulos 2019 (Lancet Respir Med, 169 studies, 5273 healthy adults) pooled means, read from the paper's Tables 2 and 3:

| Mean age | TST min | SE % | WASO min | SOL min | REM latency | N1 % | N2 % | N3 % | REM % |
|---|---|---|---|---|---|---|---|---|---|
| 18 to 34 | 410.6 | 89.0 | 32.1 | 14.3 | 96.4 | 6.0 | 51.3 | 21.4 | 19.8 |
| 35 to 49 | 386.6 | 85.4 | 51.1 | 14.4 | 93.4 | 8.0 | 52.2 | 20.4 | 19.3 |
| 50 to 64 | 372.0 | 83.2 | 64.0 | 15.7 | 101.3 | 8.7 | 52.8 | 18.1 | 18.7 |
| 65 to 79 | 346.0 | 77.5 | 77.1 | 19.5 | 99.7 | 9.3 | 53.3 | 19.9 | 17.7 |
| First night | 371.6 | 84.2 | 52.7 | 14.7 | 99.5 | 7.0 | 52.1 | 20.7 | 18.3 |
| Second night or later | 419.7 | 89.3 | 37.9 | 14.4 | 87.3 | 6.9 | 48.2 | 22.3 | 21.4 |

Per decade of age: TST down 10.1 min, SE down 2.1 points, WASO up 9.7 min, SOL up 1.1 min, N1 up 0.5 points. The 80-plus row in the paper is a single study (TST 199 min) and should not be used. Lab first nights understate habitual sleep by about 48 minutes, which is why the proposed keyframes sit between the first-night and later-night values.

Children, from the 2025 European Respiratory Review meta-analysis of healthy children (66 studies, 2947 children, AASM scoring): ages 1 to 18 pooled TST 466 min in the lab, SOL 22.8, REM latency 128, SE 88.6%, N1 5.3%, N2 46.0%, N3 27.4%, REM 20.7%. Per year of age N3 falls 0.72 points, REM falls 0.36, N2 rises 1.12. Infants 2 to 12 months: night TST 437 min, SE 84.6%, REM 37%.

### C1. Age keyframes

| Parameter | Current | Literature | Verdict | Confidence |
|---|---|---|---|---|
| TST, age 0 | 960 min drawn as one night block | NSF: 14 to 17 h per 24 h for newborns, spread over many bouts. Night portion about 8 to 9 h with feeds. | Wrong concept. Draw the night only (510 min), report "sleep per 24 h" separately. | High |
| TST, age 5 | 690 | NSF 10 to 13 h per 24 h at 3 to 5. Naps mostly gone by 5. Lab PSG far lower. | 620 night, no nap from age 5. | Medium |
| TST, age 12 | 570 | NSF 9 to 11 h at 6 to 13. | 550. | Medium |
| TST, age 18 | 480 | NSF 7 to 9 h. Boulos 18 to 34: 411 lab, about 420 on later nights. | 455. | Medium |
| TST, age 40 | 432 | Boulos 35 to 49: 387 lab. | 420. | Medium |
| TST, age 60 | 360 | Boulos 50 to 64: 372 lab, 65 to 79: 346 lab. | 395. Current is too low once the lab effect is allowed for. | Medium |
| TST, age 80 | 312 ("aggressive drop") | Minus 10 min per decade. MrOS men and SOF women, median age 82, home PSG: 369 and 356 min. | 360. Current is about 50 min too low. | High |
| TST, age 90 | 300 | Ohayon: after 60 only efficiency keeps falling. | 345. | Medium |
| N3 %, 0 to 10 | 25 flat | Children 27.4% pooled, falling 0.72 points per year (about 30% at 5, 27% at 10, 22% at 16). | 28, 30, 27, 22 at ages 1, 5, 10, 16. | High |
| N3 %, 18 / 40 / 60 / 80 | 22 / 18 / 15 / 12 | Boulos 21.4 / 20.4 / 18.1 / 19.9 in screened adults. Mitterling: median 20.7% under 30, 14.9% over 60. Ohayon: SWS falls with age to 60. | 21 / 19 / 16 / 13, then a sex factor (C3). Targets are fine. The bug is that 28% is drawn. | Medium |
| REM %, age 0 | 50 | Roffwarg 1966: about half of newborn sleep is active sleep. Infants 2 to 12 months: 37%. | 45 for the slider's "0", drawn as active sleep at sleep onset. | Medium |
| REM %, 5 to 60 | 25 to 23 | Children 20.7%, adults 19.8 to 18.7%. | 22 at 5, 21 at 10, 20 at 18, 19.5 at 40, 18.5 at 60. Current is 4 to 5 points high. | High |
| REM %, 80 | 20 | Boulos 65 to 79: 17.7%. | 17.5. | High |
| WASO, 30 / 50 / 70 / 80 / 90 | 20 / 45 / 80 / 120 / 150 | Boulos 32 / 51 / 64 / 77 lab, about 38 on later nights overall. Plus 9.7 min per decade. | 25 at 25, 40 at 42, 55 at 57, 70 at 72, 85 at 80, 100 at 90. Current overshoots after 70. | High to 79, Medium after |
| WASO, children | 5 to 10 | 5.65% of sleep period, about 29 min in the lab. | 20 from 5 to 16. Current is too clean. | Medium |
| N1 % | 5 to age 50, 10 at 80 | Boulos 6.0 / 8.0 / 8.7 / 9.3. Children 5.3. | 5 in childhood, 6 at 25, 8 at 42, 9 at 57, 10 at 72, 11 at 80. And it must actually be drawn. | High |
| Sleep latency | 10 + 0.25 per year over 20 (11 at 25, 25 at 80) | Boulos 14.3 / 14.4 / 15.7 / 19.5. Children 22.8 in the lab. | 15 at 18, 14 at 35, 15.5 at 50, 18 at 65, 21 at 80. Children 15 to 17. | High |
| REM latency | 84 emergent | Boulos 96 (87 on later nights). Children 128. | Adults 85 to 95. Children 5 to 12 about 115 to 125. | High adults, Medium children |
| Cycle length | 90 fixed | 90 to 110 in adults, 50 to 60 in infants. | 95 for adults, 55 at age 0, rising through childhood. | Medium |
| Sleep efficiency (emergent) | 95% at 25, 66% at 80 M | 89% and 77.5%. | Falls out of the values above: 92% and 77%. | High |

### C2. Timing

| Parameter | Current | Literature | Verdict | Confidence |
|---|---|---|---|---|
| Default bedtime | 22:00 at every age, newborn and 8-year-old included | Children go to bed far earlier, adults on average later. | Age keyframes for bedtime (F3). | Medium |
| Teen delay | Plus 0 to 90 min, peak at 17, gone by 21 | Carskadon: pubertal delay of 1 to 2 h. Roenneberg 2004: lateness peaks near 20 (women about 19.5, men about 21), then advances. | Peak at 19 to 20, fold into the bedtime keyframes. | Medium |
| Older phase advance | 0 at 65 to minus 120 at 85 | About 1 h earlier sleep and wake in older adults (Duffy, Roenneberg). | Minus 60 to 75 by 80, starting gradually from 30. Current is too large and too abrupt. | Medium |
| Lark / owl | Minus 120 / plus 180 | Morning and evening types differ by about 2 to 3 h in sleep timing and melatonin onset. | Minus 75 / plus 90. Current 5 h spread is extreme. | Medium |
| "Ideal sleep window" | Fixed 8 h | NSF: 7 to 9 h adults, 7 to 8 h at 65+, 8 to 10 teens, 9 to 11 school age. | Rename "Recommended sleep window" and size it by age (F6). | High |
| Social jet lag | Bedtime +180, TST -60, N3 x0.85, REM x0.8, WASO +30 | Roenneberg, Wittmann: mean about 1 h, a third of people 2 h or more. It is a timing mismatch. No evidence for an N3 cut or 30 min WASO. | Redefine as a work night after a late weekend: bed 60 min later, latency +15, alarm cuts 75 min off the end. REM loss then follows from the truncation. | Medium on direction, Low on size |
| Jet lag | No effect | Sack 2007 (AASM): eastward travel gives long latency, westward gives early waking. | Wire in (F4). Illustrative sizes. | Low on size |

### C3. Sex and menopause

| Parameter | Current | Literature | Verdict | Confidence |
|---|---|---|---|---|
| Male WASO x1.1 after 30 | Yes | Boulos single-sex studies: WASO 51.8 men, 55.0 women. SE 84.3 and 84.1. | Remove. | High |
| N3 by sex | None | Redline 2004 (SHHS, 2685 people aged 37 to 92): women had on average 106% more slow-wave sleep, and it fell with age in men only. SHHS normals: minus 1.9 points per decade in men. SOF women 20.8% against MrOS men 13.9% at 82. | From 30, men lose up to 30% of N3 by 70, women gain up to 15%. | High on direction, Medium on size |
| N1 by sex | None | Redline: lighter sleep in men. | Men +1 point by 70, women -0.5. | Medium |
| Perimenopause WASO +45 | Yes | SWAN: no PSG differences by menopausal status. De Zambotti 2014: 3.5 hot flashes a night, 16.6 min of hot-flash wake, 27% of WASO. | +20 min in short bouts. Rename "Perimenopause with night sweats". | High |
| Perimenopause N3 x0.80, REM x0.9 | Yes | No support. Some cohorts find more SWS after menopause. | Remove both. | High |
| Perimenopause N1 +5 points, latency +15 | Yes | Awakenings imply some extra N1. Latency complaints are mostly subjective. | N1 +1.5 points, latency +5. | Medium |
| Visibility 40 to 60, female | Yes | Median transition starts about 47, menopause about 51. | Keep 40 to 60. Fix the checkbox bug (S1). | High |

### C4. Substances and screens

One "drink" is 10 g of alcohol, which is 0.16 g/kg for the 62 kg reference adult in Gardiner 2025. One "cup" is about 100 mg of caffeine.

| Parameter | Current | Literature | Verdict | Confidence |
|---|---|---|---|---|
| Caffeine half-life | 4 / 6 / 8 h | Mean about 5 h, range 2 to 10. | 3.5 / 5 / 8. | Medium |
| Caffeine latency | +20 min per cup-equivalent at bedtime | Gardiner 2023 (24 studies): +9 min pooled. Drake 2013, 400 mg: +17 to +24 objective. | Saturating, max +20 (F4). Current gives +40 for two cups. | High |
| Caffeine TST | -15 per cup, and bed time is extended to make up the latency | Gardiner: -45 min pooled, SE -7 points. Drake: -66 to -72 min at 0, 3 and 6 h for 400 mg. A 107 mg coffee stops mattering 8.8 h before bed, 217 mg at 13.2 h. | Saturating, max -70, zero below about 30 mg still in the body. Current understates TST loss and overstates latency. | High |
| Caffeine WASO | +15 per cup | +12 pooled. Drake +8 to +28. | Saturating, max +25. | High |
| Caffeine N3 | x(1 - 0.15 per cup), floor 0.5 | -1.4 points, -11.4 min pooled. | -3 points at saturation. Current cuts N3 by 30% for two cups. | High |
| Caffeine N1 | +3 points per cup (never drawn) | +1.7 points, +6.1 min pooled. | +3 points at saturation. | High |
| Alcohol latency | -5 min per drink, floor 5 | -6.4 min per g/kg, so about -1 min per drink. Significant only from about 5 drinks. | -1 per drink. | High |
| Alcohol WASO | +25 min per drink | +4.0 min overall, not significant, no dose effect. Ebrahim 2013 and Roehrs and Roth 2001: disruption sits in the second half. | +5 per drink, capped at 40, second half only. Current is five times too high. | High |
| Alcohol REM | x(1 - 0.15 per drink), plus x(1 - 0.3 per drink) in cycles 1 and 2 | -40.4 min per g/kg (about -6.5 min per drink). REM share -2.8 points overall. REM latency +30.1 min per g/kg (about +5 min per drink), detectable from 2 drinks. | -6.5 min per drink, taken mostly from the first two cycles, first cycle +4.8 min per drink. Current removes 45% of REM at 3 drinks. | High |
| Alcohol N3 | x(1 - 0.1 per drink) overall, +10% per drink early, halved late | Whole-night N3 unchanged (+0.4 points, n.s.). More SWS in the first half (Ebrahim 2013). | Total unchanged, shift it earlier. | High |
| Alcohol TST | none | -10 min, not significant. | -3 per drink. | Medium |
| Screens: latency | +45 min for "1 h before bed" | Chang 2015: about +10 min after 4 h of e-reader at full brightness on 5 evenings. Cajochen 2022 meta-analysis of PSG studies: no clear effect of a single evening, dose-dependent above about 100 melanopic lux. Schöllhorn 2023: dose-dependent, small. | +8 min. Current is 4 to 5 times too high. | High |
| Screens: TST -30, N3 x0.85, REM x0.9, N1 +3 points | Yes | Chang: REM down about 12 min, no SWS change reported. Chinoy 2018: people choose a bedtime about 30 min later with a tablet. | TST -5, no stage changes. The honest message is "later bedtime", not "ruined architecture". | Medium |
| Screens: circadian curve +60 min | Yes | Chang: delay of melatonin onset after five evenings of 4 h (I recall 1.5 h, not re-checked). Chinoy: 48 min. One hour of use on one evening is far less. | +20 min. | Low |

### C5. Clinical

| Parameter | Current | Literature | Verdict | Confidence |
|---|---|---|---|---|
| Apnea design goal | "SDB 10 at 35 = healthy 80-year-old" | Not a published equivalence. | Drop the premise. | High |
| Apnea N1 | +15 points (never drawn) | The most consistent finding. Severe against mild/moderate: 46.7% against 21.3% in one cohort, 23% against 14% in another. | +16 points at severe, and draw it. | High on direction, Medium on size |
| Apnea N3 | x0.25 at severe | Mixed. Often not significant in clinic series, modest in SHHS. | x0.5 at severe. | Medium |
| Apnea REM | x0.7 at severe | 15.4% against 17.7% in one series. Small in SHHS. | x0.8 at severe. | Medium |
| Apnea WASO, TST | +80 min, -60 min | Efficiency 83.0% severe against 86.1% mild/moderate, not significant. Redline: apnea effects smaller than those of sex and age. | +35 min, -15 min. Latency -3 (sleepy patients fall asleep fast). | Medium |
| Apnea scale | Slider 0 to 10 without units | Clinical grading uses AHI: 5 to 15 mild, 15 to 30 moderate, over 30 severe. | Four buttons. | High |
| Nocturia | +10 min WASO per trip, up to 10 trips | No pooled PSG estimate found. 5 to 15 min awake per void is the usual clinical picture. | Keep 10 min, cap at 5 trips, draw each trip as its own wake bout spread across the night. | Medium |
| Growth hormone | Fixed pulse 70 min after bedtime | Largest GH pulse comes with the first slow-wave episode. GH and SWS decline together from young adulthood (Van Cauter 2000). | Centre on the first N3 block, scale with N3 minutes. | High |
| Cortisol | Rises from 3 h before wake, peaks 30 min after | Matches the usual profile (nadir near midnight, awakening response 30 to 45 min after waking). | Keep. | High |

## D. Scenario results against norms

Twenty seeds each, all metrics computed from the returned blocks. Full harness output is in the appendix. "Norm" is the Boulos age band or the paediatric meta-analysis, allowing for the lab effect.

| Scenario | TST | SE % | SOL | WASO | N1 / N2 / N3 / REM % | REM lat | Bed to wake | Against norm |
|---|---|---|---|---|---|---|---|---|
| Newborn 0 | 963 | 98.5 | 10 | 5 | 3 / 11 / 17 / 69 | 73 | 22:00 to 14:18 | Wrong in kind. One 16 h block, almost no waking, last REM block 355 min, adult stages. |
| Child 8 | 641 | 97.3 | 10 | 8 | 3 / 37 / 27 / 34 | 84 | 22:00 to 08:58 | TST above the NSF range (9 to 11 h), REM 13 points high, bedtime 22:00, REM latency 40 min short. |
| Teen 16 owl | 510 | 95.7 | 10 | 13 | 3 / 40 / 29 / 28 | 84 | 02:08 to 11:01 | N3 and REM both about 8 points high. Timing extreme but possible on free days. |
| 25 M | 465 | 95.0 | 11 | 13 | 3 / 43 / 28 / 26 | 84 | 22:00 to 06:09 | SE 6 points high, WASO half the norm, N1 half, N3 +7, REM +6, N2 8 low. |
| 25 F | identical to 25 M | | | | | | | No sex effect at all. |
| 35 M | 443 | 91.2 | 14 | 29 | 3 / 46 / 26 / 25 | 84 | 22:00 to 06:06 | N3 +6, REM +5, N1 5 low. |
| 35 M, apnea 10 | 383 | 75.7 | 14 | 109 | 3 / 74 / 7 / 16 | 87 | 22:00 to 06:26 | N1 should be 20% or more and is 3%. WASO and SE loss too large. |
| 52 F | 389 | 85.4 | 18 | 49 | 7 / 49 / 23 / 21 | 90 | 22:00 to 05:35 | Close on TST, SE and WASO. N3 5 high. |
| 52 F perimenopause | 389 | 75.5 | 33 | 94 | 7 / 56 / 19 / 19 | 91 | 22:00 to 06:35 | WASO +45 and SE -10 points against a literature effect of about +17 min. |
| 65 F | 348 | 79.0 | 21 | 71 | 6 / 54 / 21 / 19 | 90 | 22:00 to 05:21 | Near Boulos 65 to 79 lab values. Low for home sleep. 22 min of wake after the last sleep. |
| 80 M | 312 | 66.5 | 25 | 132 | 7 / 59 / 19 / 16 | 91 | 20:30 to 04:19 | TST about 50 min low, SE 11 points low, WASO 50 min high, N3 double what men of 80 have, bedtime too early. |
| 80 M, nocturia 3 | 312 | 62.5 | 25 | 162 | same | 91 | 20:30 to 04:49 | Adds exactly 30 min, all at cycle ends, 45 min of it after the last sleep. |
| 25 M, 3 drinks | 465 | 85.9 | 5 | 72 | 3 / 61 / 18 / 18 | 94 | 22:00 to 07:02 | WASO +59 (literature +4, n.s.). First REM is 1 minute long. N3 drawn 10 points lower than sober, literature says no change. |
| 25 M, 2 coffees at 0 h | 435 | 81.5 | 51 | 48 | 5 / 51 / 20 / 24 | 94 | 22:00 to 06:53 | Latency +40 (literature +9 to +24). TST only -30 (literature -45 to -70). Slow, normal and fast identical. |
| 2 coffees at 6 h (slow / normal / fast) | 447 / 450 / 454 | 86 / 88 / 91 | 35 / 31 / 25 | 35 / 33 / 21 | | | | Right ordering. Latency effect too big, TST effect too small (Drake: more than 1 h lost at 6 h with 400 mg). |
| 2 coffees at 10 h (slow / normal / fast) | 452 / 455 / 461 | 90 / 91 / 93 | 28 / 24 / 18 | | | | | Still +13 min latency at 10 h for a normal metaboliser. Gardiner puts the cutoff for one coffee near 9 h. |
| 25 M, screens | 435 | 85.5 | 56 | 18 | 3 / 50 / 25 / 23 | 85 | 22:00 to 06:28 | Latency +45. Evidence supports about +10 at most. |
| 25 M, social jet lag | 405 | 87.3 | 11 | 48 | 3 / 52 / 25 / 19 | 86 | 01:00 to 08:43 | Shows a 3 h late night with normal latency. Unclear which night this is meant to be. |
| 25 M, jet lag east or west severe | identical to baseline | | | | | | | Dead control. |
| Extreme stack 80 M | 102 | 21.9 | 130 | 240 | 29 / 69 / 1 / 0 | none | 23:30 to 07:22 | No crash, no NaN. All 240 min of wake sit after the last sleep block. Card says 461 m WASO. |
| Everything at max, 100 F | 60 | 21.1 | 225 | 0 | 100 / 0 / 0 / 0 | none | 02:00 to 06:45 | Loop never runs. Card says 760 m WASO with none drawn. |

Sanity checks across all 28 scenarios: no negative durations, no NaN, no gaps between blocks, stage percentages from blocks always sum to 100, no infinite loop (5 s timeout never hit).

## E. Hypnogram accuracy

Right today: sleep begins with N1, then N2, then N3. N3 returns to N2 before REM in every cycle. REM is followed by a brief N1. REM latency is 84 to 94 minutes. The first REM period is short (about 11 min) and later ones are longer. There are no direct Wake to N3 or N3 to REM jumps.

Wrong today:

1. Every cycle is the same template at the same 90 minutes, so the night looks like a stamped pattern. Real cycles run 70 to 120 minutes and the last one is usually cut short by waking.
2. N3 shows up in all five cycles, including a 15 minute block around 05:00. In a healthy young adult N3 is nearly all in cycles 1 and 2, with a little in cycle 3. In an 80-year-old man it is one short block or none.
3. REM grows linearly and without limit. Beyond five cycles it takes over the whole cycle.
4. N1 only appears as a 2 minute step after REM. Real records show N1 at sleep onset, after every awakening, and scattered through N2 in older and apneic sleepers.
5. Awakenings only happen after REM, in 15 minute slabs. Real WASO is many short awakenings and a few longer ones, more of them late in the night, and each one returns to sleep through N1.
6. Wake after the final awakening is drawn and counted. It should not exist in this picture. The night should end at the last sleep block.
7. Children get the adult template. A school-age child has a long first cycle (REM latency about two hours), a lot of N3 in the first third, and very little wake.
8. A newborn gets the adult template stretched to 16 hours. Newborn sleep comes in 50 to 60 minute cycles that start with active (REM) sleep, is scored as active and quiet sleep with no N1, N2 or N3, and is broken by feeds every 2 to 4 hours.
9. Partial last cycles are shrunken copies of a full cycle. A late partial cycle should be N2 followed by REM.
10. Arousal lines reach the Wake row and so look like 5 to 155 awakenings. They should be small ticks.

Compared with a real adult PSG the drawing is also too clean in N2 (no stage shifts at all, where a healthy adult has several per hour). The brief adds N1 intrusions and short awakenings, which is enough for teaching. Scoring 30-second epochs is not needed.

## F. Implementation brief for Opus

Scope: rewrite the model section of `app.js` (everything above `// --- APP LOGIC ---`), make targeted changes to the drawing code, `index.html` and `style.css`. Keep it a static site with no build step and no dependencies. Keep the marker comment `// --- APP LOGIC ---` exactly, and keep the class names `STAGES`, `ScientificConstants`, `HypnogramGenerator`, `TwoProcessModel` above it with no DOM access, because `tests/scenarios.mjs` loads that slice. Do not touch the v2.1 repository. Work on a branch and do not push until Martin has seen it.

I checked that the numbers below can meet the acceptance tests by building a throwaway prototype of sections F2 to F5. It passes all 256 checks with 20 and with 200 seeds. The prototype is not in the repository.

### F1. Structure and determinism

1. Delete `models.js`. Remove `console.log('DOM Loaded')`, `cycleProgress`, the dead `bind('nocturia-slider')` line and its comments, the hidden counter inputs, and the unused `tst` parameter of `getCurves`.
2. Add a seeded generator (mulberry32) inside the model section. `generate(config)` creates its own `rng` from `config.seed`, defaulting to the constant `20261124`. No call to `Math.random` may remain in the model section. The same config must always return the same blocks.
3. Clamp inputs at the top of `generate`: age 0 to 100, alcohol 0 to 6, caffeine 0 to 6, caffeineTime 0 to 12, nocturia 0 to 5 (integer), sdbSeverity 0 to 10. Ignore `isMenopausal` unless gender is female and age is 40 to 60.
4. One function measures everything from the finished block list: `HypnogramGenerator.measure(blocks)` returns `tst`, `tib`, `latency` (wake before the first sleep block), `wasoMins` (all wake after sleep onset), `sleepEfficiency` (tst / tib x 100), `n1P`, `n2P`, `n3P`, `remP` (fractions of TST) and `remLatency` (sleep onset to first REM). `generate` returns these as `stats`. The pie, the legend and the cards read only from `stats`. Targets never reach the UI.
5. Return shape stays `{ blocks, wakeEvents, params, stats }`. Each block is `{ stage, start, duration }` with `start` in minutes after 18:00, as now. Blocks must be contiguous, adjacent blocks of the same stage merged, no block shorter than 0.01 min. Add to `stats`: `napMins` and `sleepPer24h = tst + napMins`. Add to `params`: `bedtime` (minutes after 18:00), `clockShift` (minutes, see F4) and `infant` (boolean). Keep `params.startTimeOffset = bedtime - 240` so the existing drawing code keeps working while you migrate it, then replace every literal `240` with `params.bedtime`.

### F2. Age profile

`ScientificConstants.getAgeProfile(age, gender)` interpolates linearly between these keyframes (age in years, value), clamped at both ends. Percentages are percent of TST.

| Key | Keyframes | Source |
|---|---|---|
| `tst` (night sleep, min) | 0: 510, 1: 630, 3: 630, 5: 620, 8: 585, 10: 570, 12: 550, 14: 510, 16: 480, 18: 455, 25: 440, 40: 420, 60: 395, 70: 380, 80: 360, 90: 345, 100: 335 | NSF 2015 ranges for children, Boulos 2019 adjusted between first and later nights, MrOS and SOF at 82 |
| `nap` (daytime sleep, min) | 0: 390, 1: 150, 2: 105, 3: 60, 4: 30, 5: 0, 100: 0 | NSF 24 h totals: 15 h at 0, 13 h at 1 |
| `sol` (min) | 0: 8, 3: 15, 10: 17, 18: 15, 35: 14, 50: 15.5, 65: 18, 80: 21, 100: 24 | Boulos Table 3, paediatric meta-analysis adjusted for the lab |
| `waso` (min) | 0: 60, 1: 25, 5: 20, 16: 20, 25: 25, 42: 40, 57: 55, 72: 70, 80: 85, 90: 100, 100: 110 | Boulos Table 2 and plus 9.7 min per decade |
| `n1` (%) | 0: 0, 1: 5, 10: 5, 18: 5.5, 25: 6, 42: 8, 57: 9, 72: 10, 80: 11, 100: 13 | Boulos, paediatric meta-analysis |
| `n3` (%) | 0: 0, 1: 28, 5: 30, 10: 27, 16: 22, 25: 21, 40: 19, 60: 16, 80: 13, 100: 11 | Paediatric meta-analysis slope, Boulos, Mitterling, Ohayon |
| `rem` (%) | 0: 45, 1: 30, 3: 25, 5: 22, 10: 21, 18: 20, 40: 19.5, 60: 18.5, 80: 17.5, 100: 16.5 | Same |
| `bedtime` (min after 18:00) | 0: 120, 3: 105, 6: 120, 8: 150, 10: 180, 12: 210, 14: 255, 16: 315, 19: 375, 22: 345, 25: 315, 30: 300, 60: 285, 70: 265, 80: 240, 100: 225 | Carskadon, Roenneberg 2004, older-adult advance of about 1 h |
| `cycleLen` (min) | 0: 55, 2: 70, 6: 85, 12: 90, 18: 95, 100: 95 | Standard texts |
| `firstCycleLen` (min) | 0: 55, 1: 70, 3: 100, 6: 125, 10: 130, 16: 105, 18: 95, 100: 95 | REM latency 128 min in children, 87 to 96 in adults |

Sex adjustment after interpolation, with `k = clamp((age - 30) / 40, 0, 1)`: male `n3 *= 1 - 0.30 * k` and `n1 += 1.0 * k`. Female `n3 *= 1 + 0.15 * k` and `n1 -= 0.5 * k`. N2 is always what is left. Delete the male WASO factor.

These bedtime keyframes replace `teenShift` and `agePhaseShift`. Delete both.

### F3. Bedtime

`bedtime = profile.bedtime + chronoOffset * clamp((age - 2) / 8, 0, 1) + bedShift`, where `chronoOffset` is -75 for lark, 0 for normal, +90 for owl, and `bedShift` comes from F4. The age factor stops a toddler being an "owl".

### F4. Modifiers

Start from `tst`, `sol`, `n1`, `n3`, `rem` of the profile. Keep a list of wake groups, each `{ min, zone, per }`, where `zone` is `any`, `late` (second half) or `last3` (last third) and `per` is the typical bout length in minutes. The first group is always `{ min: profile.waso, zone: 'any', per: 9 }`. Also track `truncate` (minutes cut off the end of the night), `remCut` (minutes of REM removed), `firstCycleAdd` (minutes), `r3` (N3 decay ratio per cycle: 0.7 under age 12, otherwise 0.55), `q0` and `q1` (REM weight factors for cycles 1 and 2, default 1), `bedShift` and `clockShift` (both 0).

| Modifier | Changes |
|---|---|
| Caffeine | `halfLife` = 3.5 (fast), 5 (normal), 8 (slow). `load = cups * 0.5 ^ (hoursBeforeBed / halfLife)`. `f = 1 - exp(-max(0, load - 0.3) / 1.2)`. Then `tst -= 70 f`, `sol += 20 f`, wake group `{ 25 f, any, 8 }`, `n3 -= 3 f`, `n1 += 3 f`. |
| Alcohol, `d` drinks | `sol -= 1.0 d`, `tst -= 3 d`, wake group `{ min(40, 5 d), late, 7 }`, `remCut = 6.5 d`, `firstCycleAdd = 4.8 d`, `r3 = max(0.35, r3 - 0.04 d)`, `q0 = max(0.2, 1 - 0.2 d)`, `q1 = max(0.5, 1 - 0.1 d)`. N3 total is not changed. |
| Bright screen | `sol += 8`, `tst -= 5`, `clockShift += 20`. Nothing else. |
| Social jet lag | `bedShift += 60`, `sol += 15`, `truncate += 75`, `clockShift += 120`. |
| Jet lag `east_mild` (3 zones) | `sol += 15`, `truncate += 30`, wake group `{ 5, any, 8 }`, `clockShift += 180`. |
| Jet lag `east_severe` (8 zones) | `sol += 45`, `truncate += 90`, wake group `{ 20, any, 8 }`, `clockShift += 480`. |
| Jet lag `west_mild` | `sol -= 3`, `truncate += 30`, wake group `{ 10, last3, 8 }`, `clockShift -= 180`. |
| Jet lag `west_severe` | `sol -= 6`, `truncate += 75`, wake group `{ 30, last3, 8 }`, `clockShift -= 480`. |
| Perimenopause | `sol += 5`, `n1 += 1.5`, wake group `{ 20, any, 5 }`. Nothing else. |
| Apnea, `s = sdbSeverity / 10` | `n1 += 16 s`, `n3 *= 1 - 0.5 s`, `rem *= 1 - 0.2 s`, `tst -= 15 s`, `sol -= 3 s`, wake group `{ 35 s, any, 5 }`. |
| Nocturia, `n` trips | `n` separate wake bouts of 10 min each (F5 step 8). |

After all modifiers: `sol = max(5, sol)` (3 for age 0), `n1 = max(0, n1)`, `n3 = max(1, n3)` (0 for age 0). `finalT = max(150, tst - truncate)` and `fullT = finalT + truncate`.

The idea behind `truncate`: build the night the body would have had (`fullT`), then cut the tail off where the alarm or the misaligned clock ends it. The lost sleep is then mostly REM, which is what happens.

### F5. Building the night

Work in "sleep time" first (no wake), then insert wake.

1. Stage minutes for the full night: `N3m = n3 / 100 * fullT`. `REMm = max(0.5 * rem / 100 * fullT, rem / 100 * fullT - remCut)`. `N1m = n1 / 100 * fullT`.
2. Cycle lengths. `L0 = min(fullT, firstCycleLen + firstCycleAdd)`. `remaining = fullT - L0`. If `remaining < 0.35 * cycleLen`, there is one cycle of length `fullT`. Otherwise let `nRound = round(remaining / cycleLen)`. If `nRound >= 1` and `remaining / nRound` is within 12% of `cycleLen`, use `nRound` further cycles of length `remaining / nRound`. If not, use `floor(remaining / cycleLen)` full cycles and one partial last cycle with the leftover.
3. N3 per cycle. Weight of cycle `i` is `r3 ^ i`, and 0 for a partial last cycle. Share `N3m` out by weight with a cap of 55% of each cycle's length. Give any excess to the cycles still below their cap, by weight (up to four passes).
4. REM per cycle. Weight is `(1 + 0.6 * min(i, 4)) * (L[i] / cycleLen)`, times `q0` for cycle 0 and `q1` for cycle 1. Cap at 45% of the cycle length, 60% for a partial last cycle. Same redistribution.
5. N1. Estimate the number of wake bouts `B` (step 8). Onset N1 is `clamp(0.25 * N1m, min(2, N1m), 8)`. The pool for the cycles is `max(0, N1m - onset - 2 * B)`, shared by cycle length. In each cycle up to 3 min follows REM and the rest is "intrusions" in pieces of at most 4 min.
6. Lay out each cycle in this order: onset N1 (cycle 0 only), 35% of the cycle's N2, N3, the other 65% of N2 with the N1 intrusions spaced evenly through it, REM, post-REM N1. If the cycle has under 1 min of N3, use one N2 run with intrusions. N2 is the cycle length minus everything else. If that leaves under 6 min of N2, shrink that cycle's N3 and REM in proportion until N2 is 6.
7. Truncate. Walk the list and stop when `finalT` minutes of sleep have been laid out. Drop the rest.
8. Wake bouts, positioned on the sleep-time axis `0..T` where `T = finalT`. For each wake group with at least 3 min: number of bouts `clamp(round(min / per), 1, 10)`. Durations are the group's minutes split by random weights `0.5 + rng()`. Positions are `T * u ^ 0.75` for `any` (a mild lean towards the morning), `T * (0.5 + 0.5 u)` for `late`, `T * (0.67 + 0.33 u)` for `last3`, with `u = rng()`. Nocturia trip `k` of `n` goes at `90 + max(60, T - 120) * (k + 0.5 + 0.4 * (rng() - 0.5)) / n`, for 10 min. Clamp every position to `[15, T - 10]`, sort, move any bout that falls inside an N3 block to the end of that block, sort again, push bouts that are under 8 min of sleep apart, and drop any that end up after `T - 5`.
9. Assemble. Start at `bedtime` with a wake block of `sol`. Emit the sleep list, and at each bout position emit the wake block. After every wake bout the next 2 min of sleep are relabelled N1 whatever the stage. If the stage being resumed is N3, the 3 min after that are relabelled N2. The night ends with the last sleep block. Never emit wake after it.
10. Age 0 (`infant`). No N1 and no N3. Each 55 min cycle is REM first (`REMm / fullT` of the cycle), then the rest on the N2 row, which the chart labels "Quiet (NREM)". Wake is three feed bouts of `profile.waso / 3` min at one, two and three quarters of the night, each jittered by up to 10 min. No N1 re-entry.
11. Arousal ticks (still returned as `wakeEvents`). Count is `round(tst / 60 * (1 + age / 40)) + round(60 * s)`. Each is placed with `rng` inside a sleep block longer than 2 min. They carry no duration and are never counted.

### F6. Drawing changes

1. Scale both canvases for `devicePixelRatio`: set `canvas.width = cssWidth * dpr`, `canvas.style.width = cssWidth + 'px'`, the same for height, and `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`. Do all layout maths in CSS pixels. Redraw once after `document.fonts.ready`.
2. Pie: four slices only (N3, N2, N1, REM) from `stats`, as percent of TST. Legend shows percent and minutes, for example "N3 21% - 1 h 32 m". Wake is reported by the cards.
3. Cards read from `stats`: Time in bed, Total sleep, Efficiency, Time to fall asleep, Awake in the night. Format durations as "7 h 20 m" and "24 m". For ages under 5 add a sixth card "Sleep per 24 h" from `stats.sleepPer24h`. Keep the efficiency colour thresholds (85 and 75).
4. End marker: a dashed line at the end of the last sleep block, labelled "Wake-up 07:14" with the clock time. No hours figure.
5. Replace "Ideal Sleep Window" with "Recommended sleep window". It starts at the bedtime for that age and chronotype without `bedShift`, and its length is the middle of the NSF range: 11 h for ages 1 to 2, 11.5 h for 3 to 5, 10 h for 6 to 13, 9 h for 14 to 17, 8 h for 18 to 64, 7.5 h from 65. Do not draw it for age 0.
6. Hour labels zero-padded ("00:00"). Canvas text at least 12 px.
7. Arousal ticks: 6 px red ticks hanging from the top grid line, 60% opacity. Not full-height lines.
8. Age 0: y-axis shows "Wake", "Active (REM)" and "Quiet (NREM)" only, and a one-line caption under the chart: "Newborns sleep 14 to 17 hours a day in bouts of 2 to 4 hours. This is the night part."
9. In compare mode both panels use the same `viewStart` and `viewEnd` (earliest start minus 60 and latest end plus 60 across A and B). Redraw both panels whenever either simulation changes.
10. Overlays become global view options (not per profile) and each curve gets an entry in a small legend drawn in the top-right corner of the plot: coloured line sample plus name. Delete the stray "Sleep Drive (S)" text.
11. Sleep pressure curve: keep the maths. Use `params.bedtime` for sleep start and the end of the last sleep block for sleep end. Set the hours awake before the plotted window from yesterday's wake time (today's wake-up minus 24 h).
12. Replace the cosine with a melatonin curve, since that is what the label promises: `M(t) = sig((t - on) / 25) * sig((off - t) / 40)`, with `sig(x) = 1 / (1 + exp(-x))`, `on = habitualBedtime - 120 + clockShift`, `off = habitualBedtime + windowLength + 30 + clockShift`, where `habitualBedtime` and `windowLength` are those of item 5. Plot `0.1 + 0.8 * M` on the existing scale. Delete `peakTime` from `TwoProcessModel`.
13. Growth hormone: one pulse centred on the middle of the first N3 block, sigma 25 min, height `0.8 * min(1, minutes of N3 in the first 3 h of sleep / 60)`. If there is no N3, draw the baseline only.
14. Cortisol: unchanged, anchored to the end of the last sleep block.

### F7. Controls and copy

"Simplify a little" means the same controls in fewer visible groups, with honest labels. No redesign.

1. Header: title "Sleep Age Simulator", one subtitle line "How a night of sleep changes with age", no version tag. Add `padding: 1.25rem 1.5rem 0.5rem` to the sidebar header and set the `h1` to 1.35rem, weight 600, margin 0.
2. Groups, top to bottom. "Person" (age slider, then sex) and "Evening" (alcohol, caffeine, bright screen) are always open. "Body clock" (chronotype, social jet lag, jet lag), "Health" (sleep apnea, night-time toilet trips, perimenopause) and "Overlays" are native `<details>` elements, closed by default, with a count of active settings in the summary, for example "Health (2)".
3. Caffeine timing and metabolism appear only while cups is above 0. Label the slider "Last cup: 6 h before bed".
4. Sleep apnea becomes four segmented buttons: None, Mild (AHI 5 to 15), Moderate (15 to 30), Severe (over 30), stored as `sdbSeverity` 0, 3, 6, 10.
5. Jet lag options: None, 3 time zones west, 3 time zones east, 8 time zones west, 8 time zones east, with the hint "first night after landing". Keep the option values `west_mild`, `east_mild`, `west_severe`, `east_severe`.
6. Relabel: "Gender" to "Sex". "Social Jet Lag" to "Work night after a late weekend". "Blue Light (Screens 1h before bed)" to "Bright screen in the last hour". "Nocturia (Trips)" to "Toilet trips at night". "Peri-menopause" to "Perimenopause with night sweats". "Overlays (Matthew Walker Model)" to "Overlays", with the first two items under a small caption "Two-process model (Borbély 1982)". Overlay items: "Sleep pressure (Process S)", "Melatonin (body-clock night)", "Growth hormone", "Cortisol".
7. Counter caps: alcohol 6, caffeine 6, toilet trips 5. Replace the inline `onclick` attributes with listeners.
8. Perimenopause row: when it is hidden, also untick the checkbox. Use one helper for the visibility rule instead of the three copies.
9. Compare mode: the first time it is switched on, copy profile A into B. Label the tabs "A" and "B" with a one-line summary each, for example "A: man, 25". Do not re-simulate B on every toggle.
10. Close the unclosed `#controls-mask` div. Give every select and slider a `for`/`id` pair.
11. Under the chart, one small line: "Typical values for healthy sleepers. Lifestyle effects are averages from sleep-lab studies and vary a lot between people." Add a "Sources" link to a short list in the README.
12. Update the README: remove "scientifically accurate" and Feinberg 1974, list the sources in section H.

### F8. CSS and phone layout

1. Typography: keep Inter as the only family, weights 400 and 600, and drop 300, 500 and 700 from the font request. Group headings become sentence case, 0.85rem, weight 600, colour `#cbd5e1`, with no uppercase and no letter-spacing. The same for the dashboard heading. Minimum text size 12 px anywhere. Add `font-variant-numeric: tabular-nums` to metric values.
2. Metric cards: `grid-template-columns: repeat(auto-fit, minmax(104px, 1fr))`, labels 0.75rem, `white-space: normal`, no ellipsis.
3. Touch targets: counter buttons 36 px, 44 px on phones. Checkboxes 18 px.
4. Style both canvases with one class (`display: block; width: 100%; height: 100%`). Remove the duplicate `.visualization-area` block, the unused `.controls` block and the "override" comments.
5. At `max-width: 820px`: `body` scrolls (`height: auto; overflow: auto`), `.app-container` becomes a column, the chart comes first with a fixed height of 320 px, then the dashboard, then the controls at full width. In compare mode the two panels stack. Nothing may scroll sideways at 390 px.
6. Keep the dark palette and the stage colours.

### F9. Acceptance tests

Run `node tests/scenarios.mjs --check`. It must exit 0 with "0 failures". It checks, for 20 seeds per scenario:

1. Sanity on every scenario: no negative or non-finite durations, contiguous blocks, stage percentages sum to 100, `SOL + TST + WASO = TIB`, same seed gives identical blocks.
2. What the UI prints equals what is drawn: `stats.n1P`, `n2P`, `n3P`, `remP` within 1 point of the block values, `stats.wasoMins` within 2 min.
3. Ranges for the mean over seeds (minutes or percent of TST):

| Scenario | Must fall in |
|---|---|
| newborn 0 | TST 480 to 600, REM 40 to 55, N1 0, SE 75 to 92, wake bouts 2 to 6, cycle 45 to 65, REM latency 0 to 20 |
| child 8 | TST 560 to 630, N3 22 to 30, REM 18 to 24, N1 3 to 8, SE 90 to 97, SOL 10 to 25, WASO 5 to 30, REM latency 100 to 140 |
| teen 16 owl | TST 450 to 520, N3 17 to 24, REM 19 to 24, SE 88 to 96 |
| 25 M healthy | TST 420 to 465, TIB 455 to 500, SE 88 to 95, SOL 8 to 20, WASO 15 to 35, N1 4 to 9, N2 45 to 56, N3 16 to 23, REM 19 to 24, 4 to 5 cycles, plus "adult shape" |
| 25 F healthy | TST 420 to 470, SE 88 to 95, N3 17 to 25, REM 19 to 24, plus "adult shape" |
| 35 M | TST 405 to 450, SE 86 to 94, WASO 20 to 45, N3 13 to 20, REM 19 to 23, plus "adult shape" |
| 35 M SDB 10 | TST 360 to 420, SE 72 to 86, WASO 50 to 100, N1 15 to 30, N3 4 to 12, REM 12 to 19, wake bouts 6 to 16 |
| 52 F | TST 385 to 430, SE 82 to 91, WASO 35 to 65, N3 14 to 21, REM 18 to 23 |
| 52 F perimenopause | TST 370 to 420, SE 78 to 89, WASO 45 to 85, N3 13 to 21, REM 17 to 23, SOL 12 to 30 |
| 65 F | TST 365 to 410, SE 78 to 88, WASO 50 to 85, N3 12 to 20, REM 17 to 22, N1 6 to 12 |
| 80 M | TST 330 to 385, SE 70 to 82, WASO 75 to 120, N1 9 to 16, N3 4 to 11, REM 15 to 21, SOL 15 to 30, wake bouts 5 to 12 |
| 80 M nocturia 3 | TST 310 to 375, SE 65 to 80, WASO 95 to 150, wake bouts 6 to 16 |
| 25 M 3 drinks | TST 400 to 465, SOL 8 to 14, WASO 25 to 60, REM 13 to 18, REM latency 95 to 140, N3 16 to 25, at least 75% of N3 in the first half, first REM period 1 to 7 min |
| 25 M 2 coffees 0 h normal | TST 375 to 430, SOL 15 to 35, N3 12 to 20, SE 80 to 91 |
| 25 M 2 coffees 6 h normal | TST 395 to 450, SOL 10 to 25, SE 84 to 93 |
| 25 M 2 coffees 10 h normal | TST 410 to 465, SOL 8 to 22, SE 86 to 95 |
| 25 M blue light | TST 410 to 465, SOL 12 to 30, N3 15 to 23, REM 18 to 24, SE 86 to 94 |
| 25 M social jet lag | TST 340 to 400, SE 82 to 92, SOL 20 to 40, REM 12 to 19 |
| both extreme stacks | TST 150 to 330, SE 30 to 75, no Wake to N3 jump, no trailing wake |

"Adult shape" means: REM latency 60 to 120 min, mean cycle (REM end to REM end) 80 to 115 min, at least 65% of N3 in the first half of the sleep period, 15 to 45% of REM in the first half, no Wake to N3 and no N3 to REM transitions, no wake after the last sleep block.

4. Relations: caffeine at 0 h costs more TST than at 6 h, which costs at least as much as at 10 h. A slow metaboliser loses more than a fast one at 6 h. At 10 h a slow metaboliser loses 5 to 30 min and a fast one under 5. 25 F has at least as much N3 as 25 M. Screens cost under 20 min of TST and under 15 min of latency. Perimenopause adds 10 to 30 min of WASO. Three toilet trips add 20 to 45 min at 80. Apnea 10 at 35 gives less N3 and more N1 than 35 M. TST falls in the order 8, 16, 25, 35, 65, 80. Both severe jet lag settings differ from baseline. The 16-year-old owl goes to bed after 23:30. The 80-year-old goes to bed 45 to 90 min before the 25-year-old.

Manual checks, since the harness has no DOM:

5. Moving the age slider from 20 to 30 and back gives the same picture at 20 both times.
6. For five settings of your choice, the legend percentages match `node tests/scenarios.mjs --only "<name>"` within 1 point.
7. Female 50 with perimenopause ticked, switch to male and back: the box is unticked.
8. Screenshots with headless Chrome at 1440 x 900, 1280 x 720 and 390 x 844, single and compare mode: no truncated label, no horizontal scroll, chart text sharp at device scale factor 2.
9. In compare mode, 22:00 is at the same x position in both panels.
10. Every overlay that is switched on has a legend entry. The growth hormone pulse sits on the first N3 block for ages 8, 25 and 80.

### F10. Decisions I made that Martin may want to overrule

1. Default adult bedtime moves from 22:00 to about 23:15 at 25 and 22:00 at 80. If he prefers the 22:00 to 06:00 picture for lectures, subtract 60 from every bedtime keyframe from age 14 up.
2. Age 0 shows the night part of a newborn's day in a two-state active/quiet view. The cheaper alternative is to start the slider at 1.
3. Sleep durations follow habitual home sleep, which is above lab PSG values by 20 to 40 minutes. If he wants the tool to match what he reads in the lab, lower the adult `tst` keyframes by 25.
4. Social jet lag now shows the work night after a late weekend. The other reading (the late weekend night itself) would be bed +120 min and no truncation.
5. Jet lag sizes are illustrative. There is no pooled PSG estimate behind them.

## G. What I could not verify

1. Redline 2004 per-age-band stage percentages. I confirmed the abstract (women 106% more slow-wave sleep, age effect in men only) and the SHHS-normals slope (minus 1.9 points per decade in men). The sex factor in F2 is sized from those and from the MrOS and SOF comparison, not from the full table.
2. Ohayon 2004 per-decade magnitudes. Abstract only. Direction of every trend is confirmed.
3. MrOS WASO, efficiency, N1 and REM means. Only scored sleep time (369 min), stage 2 (58.4%) and stage 3/4 (13.9%) at median age 82 were retrieved, with SOF at 356 min, 52.5% and 20.8%.
4. Mitterling 2015 full table. Medians under 30 and over 60 come from a search summary of the paper: efficiency 87.0 and 79.7%, N3 20.7 and 14.9%, WASO 6.0 and 15.2% of the night. Its REM medians (15.5 and 10.3%) are far below Boulos and I did not use them.
5. Chang 2015 phase delay size, Duffy's older-adult phase data, Carskadon's delay figures, Iglowstein 2003 percentiles, Roffwarg 1966 and Van Cauter 2000 are cited from memory.
6. Drake 2013 per-condition tables. The differences from placebo come from the article text. The monitor was a single-channel headband, not PSG.
7. No pooled estimate exists, as far as I found, for the PSG effect of nocturia, social jet lag or jet lag. Those sizes are judgement.
8. The apnea stage values come from clinic series surfaced by search (N1 46.7 against 21.3%, N3 2.5 against 3.8%, REM 15.4 against 17.7%, efficiency 83.0 against 86.1%), not from a meta-analysis.
9. Compare mode and the overlays were reviewed from code only. The screenshots I took were of the default view at 1440, 1280, 1024 and 390 px.

## H. Sources

- Boulos MI et al. Normal polysomnography parameters in healthy adults: a systematic review and meta-analysis. Lancet Respir Med 2019;7:533-543. doi:10.1016/S2213-2600(19)30057-8. Calculator: https://omc.ohri.ca/psgnorms
- Normal polysomnography parameters in healthy children: a systematic review and meta-analysis. Eur Respir Rev 2025;35(180):250224. https://pmc.ncbi.nlm.nih.gov/articles/PMC13169063/
- Ohayon MM, Carskadon MA, Guilleminault C, Vitiello MV. Meta-analysis of quantitative sleep parameters from childhood to old age in healthy individuals. Sleep 2004;27:1255-1273. https://pubmed.ncbi.nlm.nih.gov/15586779/
- Mitterling T et al. Sleep and respiration in 100 healthy Caucasian sleepers. Sleep 2015;38:867-875. https://pmc.ncbi.nlm.nih.gov/articles/PMC4434553
- Redline S et al. The effects of age, sex, ethnicity, and sleep-disordered breathing on sleep architecture. Arch Intern Med 2004;164:406-418. https://pubmed.ncbi.nlm.nih.gov/14980992
- MrOS and SOF comparison at matched age. Sleep 2020. https://pmc.ncbi.nlm.nih.gov/articles/PMC7355398/
- Hirshkowitz M et al. National Sleep Foundation's sleep time duration recommendations. Sleep Health 2015;1:40-43.
- Gardiner C et al. The effect of caffeine on subsequent sleep: a systematic review and meta-analysis. Sleep Med Rev 2023;69:101764. https://pubmed.ncbi.nlm.nih.gov/36870101/
- Drake C, Roehrs T, Shambroom J, Roth T. Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed. J Clin Sleep Med 2013;9:1195-1200. https://pmc.ncbi.nlm.nih.gov/articles/PMC3805807
- Gardiner C et al. The effect of alcohol on subsequent sleep in healthy adults: a systematic review and meta-analysis. Sleep Med Rev 2025;80:102030. https://research.monash.edu/en/publications/the-effect-of-alcohol-on-subsequent-sleep-in-healthy-adults-a-sys/
- Ebrahim IO et al. Alcohol and sleep I: effects on normal sleep. Alcohol Clin Exp Res 2013;37:539-549.
- Roehrs T, Roth T. Sleep, sleepiness, and alcohol use. Alcohol Res Health 2001;25:101-109.
- Chang AM, Aeschbach D, Duffy JF, Czeisler CA. Evening use of light-emitting eReaders negatively affects sleep, circadian timing, and next-morning alertness. PNAS 2015;112:1232-1237. https://pubmed.ncbi.nlm.nih.gov/25535358/
- Cajochen C et al. Influence of evening light exposure on polysomnographically assessed night-time sleep: a systematic review with meta-analysis. Light Res Technol 2022. https://journals.sagepub.com/doi/10.1177/14771535221078765
- Schöllhorn I et al. Melanopic irradiance defines the impact of evening display light on sleep latency, melatonin and alertness. Commun Biol 2023. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9974389/
- Chinoy ED, Duffy JF, Czeisler CA. Unrestricted evening use of light-emitting tablet computers delays self-selected bedtime and disrupts circadian timing and alertness. Physiol Rep 2018. https://pmc.ncbi.nlm.nih.gov/articles/PMC5974725
- De Zambotti M et al. Magnitude of the impact of hot flashes on sleep in perimenopausal women. Fertil Steril 2014;102:1708-1715. https://pubmed.ncbi.nlm.nih.gov/25256933/
- SWAN Sleep Study, PSG by menopausal status. https://pmc.ncbi.nlm.nih.gov/articles/PMC2572739 and https://pmc.ncbi.nlm.nih.gov/articles/PMC8598193
- Roenneberg T et al. A marker for the end of adolescence. Curr Biol 2004;14:R1038-R1039.
- Sack RL et al. Circadian rhythm sleep disorders: part I, basic principles, shift work and jet lag disorders. Sleep 2007;30:1460-1483.
- Borbély AA. A two process model of sleep regulation. Hum Neurobiol 1982;1:195-204. Daan S, Beersma DG, Borbély AA. Timing of human sleep: recovery process gated by a circadian pacemaker. Am J Physiol 1984;246:R161-R183.
- Van Cauter E, Leproult R, Plat L. Age-related changes in slow wave sleep and REM sleep and relationship with growth hormone and cortisol levels in healthy men. JAMA 2000;284:861-868.

## Appendix. Harness output on the current code

`node tests/scenarios.mjs`, 20 seeds per scenario, commit f7daa33.

```
Sleep Age Simulator scenario harness - 20 seeds per scenario, means (sd) from the generated blocks

TABLE 1. Core metrics from blocks (min unless noted)
scenario                          TIB    TST    SE%    SOL   WASO    N1%    N2%    N3%   REM%    bed     up
newborn 0                         978    963   98.5     10      5    2.6   10.9   17.4   69.1  22:00  14:18
child 8                           658    641   97.3     10      8    3.0   36.5   27.0   33.5  22:00  08:58
teen 16 owl                       533    510   95.7     10     13    2.9   39.7   29.1   28.2  02:08  11:01
25 M healthy                      489    465   95.0     11     13    3.2   42.9   28.1   25.8  22:00  06:09
25 F healthy                      489    465   95.0     11     13    3.2   42.9   28.1   25.8  22:00  06:09
35 M                              486    443   91.2     14     29    2.9   46.0   26.2   24.9  22:00  06:06
35 M SDB 10                       506    383   75.7     14    109    3.4   73.9    7.0   15.7  22:00  06:26
52 F                              455    389   85.4     18     49    6.7   49.2   23.3   20.8  22:00  05:35
52 F perimenopause                515    389   75.5     33     94    6.7   55.9   18.7   18.7  22:00  06:35
65 F                              441    348   79.0     21     71    6.3   53.5   21.3   18.8  22:00  05:21
80 M                              469    312   66.5     25    132    7.1   58.8   18.5   15.6  20:30  04:19
80 M nocturia 3                   499    312   62.5     25    162    7.1   58.8   18.5   15.6  20:30  04:49
25 M 3 drinks                     542    465   85.9      5     72    3.2   60.9   18.1   17.7  22:00  07:02
25 M 2 coffees 0h slow            533    435   81.5     51     48    5.3   50.7   20.0   24.0  22:00  06:53
25 M 2 coffees 0h normal          533    435   81.5     51     48    5.3   50.7   20.0   24.0  22:00  06:53
25 M 2 coffees 0h fast            533    435   81.5     51     48    5.3   50.7   20.0   24.0  22:00  06:53
25 M 2 coffees 6h slow            517    447   86.4     35     35    4.2   47.6   23.3   24.8  22:00  06:37
25 M 2 coffees 6h normal          513    450   87.6     31     33    4.0   46.9   24.1   25.0  22:00  06:33
25 M 2 coffees 6h fast            501    454   90.8     25     21    3.6   45.7   25.3   25.3  22:00  06:21
25 M 2 coffees 10h slow           502    452   90.1     28     22    3.8   46.2   24.8   25.2  22:00  06:22
25 M 2 coffees 10h normal         499    455   91.2     24     20    3.5   45.4   25.6   25.4  22:00  06:19
25 M 2 coffees 10h fast           497    461   92.9     18     17    3.6   44.2   26.6   25.6  22:00  06:17
25 M blue light                   508    435   85.5     56     18    3.0   49.9   24.6   22.5  22:00  06:28
25 M social jet lag               463    405   87.3     11     48    3.2   52.4   25.4   19.0  01:00  08:43
25 M jet lag east severe          489    465   95.0     11     13    3.2   42.9   28.1   25.8  22:00  06:09
25 M jet lag west severe          489    465   95.0     11     13    3.2   42.9   28.1   25.8  22:00  06:09
EXTREME stack 80 M                472    102   21.9    130    240   29.4   69.2    1.3    0.1  23:30  07:22
EXTREME max everything 100 F      285     60   21.1    225      0  100.0    0.0    0.0    0.0  02:00  06:45

TABLE 2. Hypnogram shape
scenario                        REMlat  cycles  cycLen    REM1 REMlast   N3h1%  REMh1%   wakeN   endWk    W>N3    N3>R     1st
newborn 0                           73     6.3     164      23     355      98      36     1.0       1     0.0     0.0      N1
child 8                             84     7.0      92      11      47      80      25     0.8       1     0.0     0.0      N1
teen 16 owl                         84     6.0      85      11      22      70      22     1.0       3     0.0     0.0      N1
25 M healthy                        84     5.0      94      11      37      71      24     0.8       4     0.0     0.0      N1
25 F healthy                        84     5.0      94      11      37      71      24     0.8       4     0.0     0.0      N1
35 M                                84     5.0      92      11      28      65      25     1.0       7     0.0     0.0      N1
35 M SDB 10                         87     4.8     100       8       8      60      32     4.0      27     0.0     0.0      N1
52 F                                90     4.5      95      10      17      60      33     2.4      15     0.0     0.0      N1
52 F perimenopause                  91     4.8      97       9       8      60      34     3.8      24     0.0     0.0      N1
65 F                                90     4.0      99      10      17      64      26     2.6      22     0.0     0.0      N1
80 M                                91     4.0     102       9       6      69      21     3.5      38     0.0     0.0      N1
80 M nocturia 3                     91     4.0     110       9       6      69      26     3.9      45     0.0     0.0      N1
25 M 3 drinks                       94     5.0     105       1      33      84       2     3.4      18     0.0     0.0      N1
25 M 2 coffees 0h slow              94     5.0      91      11      21      59      27     2.4      14     0.0     0.0      N1
25 M 2 coffees 0h normal            94     5.0      91      11      21      59      27     2.4      14     0.0     0.0      N1
25 M 2 coffees 0h fast              94     5.0      91      11      21      59      27     2.4      14     0.0     0.0      N1
25 M 2 coffees 6h slow              90     5.0      93      11      28      64      26     1.7      10     0.0     0.0      N1
25 M 2 coffees 6h normal            89     5.0      93      11      30      65      25     1.7       9     0.0     0.0      N1
25 M 2 coffees 6h fast              88     5.0      93      11      32      66      25     0.8       6     0.0     0.0      N1
25 M 2 coffees 10h slow             88     5.0      93      11      31      66      25     1.4       5     0.0     0.0      N1
25 M 2 coffees 10h normal           87     5.0      93      11      33      66      25     0.8       5     0.0     0.0      N1
25 M 2 coffees 10h fast             86     5.0      94      11      35      69      24     0.8       5     0.0     0.0      N1
25 M blue light                     85     5.0      88      10      23      64      26     1.0       4     0.0     0.0      N1
25 M social jet lag                 86     5.0      86       9      10      59      30     2.4      14     0.0     0.0      N1
25 M jet lag east severe            84     5.0      94      11      37      71      24     0.8       4     0.0     0.0      N1
25 M jet lag west severe            84     5.0      94      11      37      71      24     0.8       4     0.0     0.0      N1
EXTREME stack 80 M                 n/a     0.0     n/a     n/a     n/a       0       0     1.0     240     0.0     0.0      N1
EXTREME max everything 100 F       n/a     0.0     n/a     n/a     n/a     n/a     n/a     0.0       0     0.0     0.0      N1
  REMlat = sleep onset to first REM; cycLen = mean REM-end to REM-end; N3h1%/REMh1% = share of that stage in the first half of the sleep period;
  wakeN = wake bouts after onset; endWk = wake minutes after the last sleep block; W>N3, N3>R = direct Wake->N3 and N3->REM transitions per night.

TABLE 3. What the UI prints (stats) versus what is drawn (blocks)
scenario                          N3 ui   N3 blk   REM ui  REM blk    N1 ui   N1 blk    N2 ui   N2 blk   WASOui  WASOblk SD seeds
newborn 0                          25.0     17.4     50.0     69.1      5.0      2.6     20.0     10.9        5        5      0.0
child 8                            25.0     27.0     24.9     33.5      5.0      3.0     45.1     36.5        9        8      3.3
teen 16 owl                        22.8     29.1     24.6     28.2      5.0      2.9     47.6     39.7       13       13      0.0
25 M healthy                       20.7     28.1     24.3     25.8      5.0      3.2     50.0     42.9       18       13      7.8
25 F healthy                       20.7     28.1     24.3     25.8      5.0      3.2     50.0     42.9       18       13      7.8
35 M                               18.9     26.2     23.9     24.9      5.0      2.9     52.2     46.0       29       29      0.0
35 M SDB 10                         4.7      7.0     16.7     15.7     20.0      3.4     58.5     73.9      109      109      0.0
52 F                               16.2     23.3     23.3     20.8      5.3      6.7     55.2     49.2       49       49      0.0
52 F perimenopause                 13.0     18.7     21.0     18.7     10.3      6.7     55.7     55.9       94       94      0.0
65 F                               14.2     21.3     22.3     18.8      7.5      6.3     56.0     53.5       71       71      0.0
80 M                               12.0     18.5     20.0     15.6     10.0      7.1     58.0     58.8      132      132      0.0
80 M nocturia 3                    12.0     18.5     20.0     15.6     10.0      7.1     58.0     58.8      162      162      0.0
25 M 3 drinks                      14.5     18.1     13.3     17.7      5.0      3.2     67.1     60.9       93       72     15.2
25 M 2 coffees 0h slow             14.5     20.0     24.3     24.0     11.0      5.3     50.2     50.7       48       48      0.0
25 M 2 coffees 0h normal           14.5     20.0     24.3     24.0     11.0      5.3     50.2     50.7       48       48      0.0
25 M 2 coffees 0h fast             14.5     20.0     24.3     24.0     11.0      5.3     50.2     50.7       48       48      0.0
25 M 2 coffees 6h slow             17.0     23.3     24.3     24.8      8.6      4.2     50.1     47.6       35       35      0.0
25 M 2 coffees 6h normal           17.6     24.1     24.3     25.0      8.0      4.0     50.1     46.9       33       33      0.0
25 M 2 coffees 6h fast             18.5     25.3     24.3     25.3      7.1      3.6     50.1     45.7       28       21     12.5
25 M 2 coffees 10h slow            18.1     24.8     24.3     25.2      7.5      3.8     50.1     46.2       30       22     10.3
25 M 2 coffees 10h normal          18.8     25.6     24.3     25.4      6.9      3.5     50.1     45.4       27       20     12.0
25 M 2 coffees 10h fast            19.6     26.6     24.3     25.6      6.1      3.6     50.0     44.2       23       17     10.1
25 M blue light                    17.6     24.6     21.8     22.5      8.0      3.0     52.5     49.9       18       18      0.0
25 M social jet lag                17.6     25.4     19.4     19.0      5.0      3.2     58.0     52.4       48       48      0.0
25 M jet lag east severe           20.7     28.1     24.3     25.8      5.0      3.2     50.0     42.9       18       13      7.8
25 M jet lag west severe           20.7     28.1     24.3     25.8      5.0      3.2     50.0     42.9       18       13      7.8
EXTREME stack 80 M                  0.7      1.3      4.0      0.1     40.0     29.4     55.3     69.2      461      240     57.1
EXTREME max everything 100 F        0.5      0.0      3.6      0.0     60.0    100.0     35.8      0.0      760        0      0.0
  SD seeds = between-seed SD of block WASO (0 means every seed gives the same night).

TABLE 4. Sanity
newborn 0                     ok
child 8                       ok
teen 16 owl                   ok
25 M healthy                  ok
25 F healthy                  ok
35 M                          ok
35 M SDB 10                   ok
52 F                          ok
52 F perimenopause            ok
65 F                          ok
80 M                          ok
80 M nocturia 3               ok
25 M 3 drinks                 ok
25 M 2 coffees 0h slow        ok
25 M 2 coffees 0h normal      ok
25 M 2 coffees 0h fast        ok
25 M 2 coffees 6h slow        ok
25 M 2 coffees 6h normal      ok
25 M 2 coffees 6h fast        ok
25 M 2 coffees 10h slow       ok
25 M 2 coffees 10h normal     ok
25 M 2 coffees 10h fast       ok
25 M blue light               ok
25 M social jet lag           ok
25 M jet lag east severe      ok
25 M jet lag west severe      ok
EXTREME stack 80 M            ok
EXTREME max everything 100 F  all seeds identical

Jet lag dropdown: east severe IDENTICAL to baseline (control is dead); west severe IDENTICAL to baseline (control is dead)
```

With `--check` the current code gives 256 checks and 152 failures.
