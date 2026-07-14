import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// SOKKER TRAINING PLANNER v21 — STAGE A: replay-based balance (desktop parity)
//
// v21 (Jul 2026): first stage of the desktop-parity port (plan: A events,
// B fixed points, C weighting, D magnitude root; sokker_12 is the meter).
//
//  Balance events become tracker-replay TIMING RESIDUALS (_mkReplayNetFn):
//  a teacher-forced XP-space walk at each probe talent — actual pops the
//  carry couldn't reach are 'under' events (deficit XP), threshold clamps
//  with no pop are 'over' STREAK EPISODES (one event per episode,
//  subskill.py v7 merge semantics; surplus XP; emitted at episode close).
//  Magnitudes are weeks-equivalents.  Anchor: Mikoos uniform subskill from
//  the first report's value band, 0.5 fallback.  estimateBalance is
//  refactored to _estimateBalanceCore(fn, …) — the signal is a FUNCTION;
//  the static-event path wraps it unchanged.  Fallback chain: replay →
//  (insufficient) static v17 balance → (insufficient) gap verdict; the
//  static-only Kundrík nTwoSided guard stays on the static path (replay
//  residuals are two-sided by construction).  balance.source tags which
//  path produced the verdict ("replay"|"static").
//
//  CORPUS A/B (corpus 5, half-split): MAE 1.60 → 1.45 (desktop: 1.44) —
//  Stage A alone closes the estimator gap; ±1w 62.4 → 67.1%, ±2w 80.0 →
//  82.6%, bias +0.28 → +0.03 (all better than desktop's 64.3/81.4/+0.27).
//  KNOWN OPEN ITEM (D10): ratio geo-mean 0.991 → 0.962 vs desktop 0.988 —
//  the replay path lands ~3% higher talents.  Two hypotheses TESTED AND
//  FALSIFIED in-session: (a) probe-dependent anchor XP — wrong reading,
//  fraction seeding is probe-invariant in both implementations; (b)
//  uniform-vs-pop-derived anchor — pop-derived replay seeding
//  (_popDerivedAnchorFractions, faithfully ported, KEPT for Stage B)
//  measurably REGRESSED every aggregate (0.952/1.49/−1.47) and is
//  disabled (_REPLAY_POP_SEEDS=false).  Next diagnostic: per-player
//  desktop↔replay talent diff, then a single-player event-log diff at
//  matched probes (candidate divergences: over-episode emission on
//  GT-clamped near-cap skills — the desktop v8 'accepted'/GT-clamp
//  handling my simplified walk lacks — and trailing-over at history end).
//
// ═══════════════════════════════════════════════════════════════════════════
// SOKKER TRAINING PLANNER v20 — external talent prior + next-pop forecast
//
// v20 (Jul 2026): roadmap items #2 and #4 (sokker_03 v50).
//
//  F1 — EXTERNAL TALENT PRIOR.  One input next to the estimate chip:
//  paste a talent from Mikoos / SkTables / another tool (scale selector:
//  senior 3–7.5 — what those tools report — / YS 3–30 / DB), converted
//  endpoint-wise (±half a display step; the scales are convex) into a DB
//  band and applied via _applyPriorToEstimate — the desktop
//  _apply_external_prior v1 semantics verbatim: hard-intersect the data
//  band (→ confidence reliable_via_prior), PRIOR WINS on disjoint ranges
//  (flagged "⚠ conflict" in the UI).  The prior never fabricates an
//  estimate where the history gives none.  estimateTalentCombined is now
//  a thin wrapper over _estimateCombinedCore + the prior step; bundles
//  carry user_snapshot.external_prior = [loDb, hiDb] | null.
//
//  F2 — NEXT-POP FORECAST (⏱ card under the estimate).  The half-split-
//  validated accuracy (median pop-timing error 0 w, 80% within ±2 w,
//  n=767) as a per-skill forward forecast: "if the current training
//  continues", when does each skill pop next.  Carry at 'now' from the
//  observed history via the canonical _weekXpContribution path — an
//  EXACT carry for skills that popped in the window (XP since the pop),
//  a LOWER-BOUNDED carry for skills that didn't (rendered "≤ N w").
//  Season-aware week walk (thresholds re-aged each week, drop-age halts),
//  range spans the talent band, coach-parametrized standard week.
//  RENDER SEMANTICS (fixed after corpus validation of the card itself):
//  only the ASSUMED skill gets a two-sided range — 93.5% within ±2 w on
//  half-split forecasts where the assumption held (n=31); every other
//  skill is a GT-ALONE projection, the slowest possible path, rendered
//  as an upper bound "by ≤ N w · sooner if trained" — 92.7% satisfied
//  (n=123).  A naive two-sided render of GT rows scored only 56%,
//  because real managers rotate training — an assumption violation the
//  bound semantics absorb by construction.
//
// v19 (Jul 2026): the two highest-precision-per-effort upgrades from the
// post-half-split roadmap (sokker_03 v50).
//
//  F1 — FUSION ESTIMATOR (talent_combine v2 port; desktop reliability
//  harness cut MAE 8.56 → 5.99 DB with this machinery).  The v14–v18
//  composition was winner-take-all: the balance verdict REPLACED the gap
//  verdict, including floor/ceiling-PINNED balances whose point is a
//  one-sided constraint, not a measurement (the desktop Żołądek/
//  Ozieriański amplification path).  v19 composes by inverse-variance
//  fusion (_signalFromGap / _signalFromBalance / _fuseSignals): both
//  verdicts become σ-weighted two-sided signals; a PINNED balance becomes
//  a constraint that TRUNCATES the mean and never enters it; Birge χ²
//  inflation widens σ_f when the signals disagree beyond their bands (μ
//  untouched); equal-σ input reproduces the plain midpoint exactly.  σ
//  derivation mirrors desktop: gap σ = half band × confidence multiplier
//  {reliable 1.0, indicative 1.5, weak 2.5}, balance σ = uncapped half
//  band; SIGMA_FLOOR 1.5 / SIGMA_CAP 40.  The v17 guards are UNTOUCHED:
//  nTwoSided===0 and insufficient_signal still pass the gap verdict
//  through (method "gap").  New method tag "fusion"; chip exposes
//  fusion:{sigma, virtual, flags, gapSigma, balSigma}; adopted td capped
//  at 100 with the virtual point preserved.  Deliberately NOT ported: the
//  desktop fixed-point loops (they exist for carry-in↔talent feedback;
//  online gaps are static bounds) and the balance-v3 magnitude root
//  (follow-up — needs the event-XP fields wired as weeks-equivalents).
//  BAND SEMANTICS: the chip band is μ ± σ_f expanded to cover any signal
//  disagreement (the raw fus.lo/hi point-spread renders zero-width when
//  the signals agree — caught in the v18↔v19 corpus A/B and fixed).
//  Provenance: talent_estimator "fusion-v2".  Corpus A/B (92 half-split
//  players): points near-neutral (|Δtd| mean 0.08 DB), bands 6.2 → 5.5
//  DB honest σ-based; zero pinned cases in the filtered population, so
//  the truncation path is unit-test-validated (its target is exactly the
//  thin/pinned histories the corpus length filter excludes).  Half-split
//  metrics unchanged (bias +0.28 / median 0 / MAE 1.61 / ratio 0.992).
//
//  F2 — HEAD-COACH INPUT (Advanced panel, default 93 = the historical
//  unearthly assumption).  The estimator path is exact per record
//  (options.coachDb → _weekXpContribution); the simulator's standard-week
//  constants _XD/_XG are now recomputed by _setCoach(c) — called by every
//  top-level sim entry (runPlan / runPlanFromSchedule / runSaleOpt /
//  optimizeBlockOrder), so a coach can never leak between runs — and the
//  Stage-1 subskill sims receive coachEff = coachDb/93.  At coach 93
//  everything is bit-identical to v18 (89/13).  Bundle provenance:
//  engine "coupled-K16-coach{C}" + user_snapshot.coach_db, so the corpus
//  records which coach each submission assumed — removes the
//  systematic XP bias for non-unearthly teams AND makes future half-split
//  runs coach-aware.
//
// v18 (Jul 2026): port of desktop planner v6 optimize_block_order,
// plus two field-report fixes (D@ni email 2026-07-06 + wonsky90 forum
// topic 3690134) folded in before commit:
//
//  F1 — MAX-LEVEL CEILING CLAMP (engine).  _applyXp discards the residual
//  when a pop reaches level 18 and _sub returns 0 at _MX.  Pre-fix the
//  leftover carry rendered as phantom subskill above the cap (17.99 →
//  "18.40" in one pop week; frozen 18.02–18.07 rows drifting with age as
//  the nonexistent level-18 threshold moved under the carry ratio).
//  Display-only artifact — no XP beyond the cap was ever simulated — but
//  it directly fed the wonsky90 confusion about when skills "really"
//  reach 18.
//
//  F2 — SUBSKILL SLIDER CONTRAST (D@ni).  The percent numeral used a
//  value>60 → background-colored-text heuristic, but the numeral sits at
//  the right edge while the fill grows from the left: for values ~60–95
//  the dark text sat on the dark unfilled background and vanished.  Now
//  bright text with a dark halo, readable over both.
//
//  ENGINE — optimizeBlockOrder(skills, td, age, ssw, targets, subs):
//  exhaustively simulates every permutation of the target skills as
//  sequential training blocks (train skill #1 to its target level, then
//  #2, …) and ranks the orders by weeks-to-complete.  Exact within the
//  model (≤6 targets → ≤720 cheap sims).  Uses a DEDICATED literal
//  simulator (_simOrderToTargets) rather than runPlan: runPlan's _gwm
//  fallback silently swaps a pick predicted to max within the horizon —
//  correct for open-ended strategies, corrupting for a fixed block order
//  (the same class of silent swap the v14 manual-schedule fix removed).
//  Horizon cap: end of age 27 (mirrors the desktop default); orders that
//  miss a target by then rank last with weeks=null.
//
//  WHY ORDER MATTERS — the age factor is a common exponent, so the
//  ABSOLUTE cost of delaying a unit scales with base × level: pace
//  (B=99) loses the most XP per delayed year at equal level ("pace
//  first, striker next, tech last"), while a skill sitting several
//  levels higher overtakes pace despite a lower base.  Desktop reference
//  (age 19, td 85, pace 14 / striker 14 / tech 13): pace-early 62 weeks,
//  pace-last 64–65.  A greedy cost-of-delay PRESET was prototyped on
//  desktop and rejected — without targets it degenerates into
//  most-expensive-first and loses on open-ended development, where
//  cheapest-first is genuinely correct; order only matters when a target
//  set must be bought regardless.  Hence an optimizer, not a preset.
//
//  UI — "🎯 Target build order" card at the bottom of the Plan stage:
//  per-skill target inputs (left at current level = excluded), Rank
//  button, ranked table, fastest order highlighted.  STRATS unchanged.
//
// ═══════════════════════════════════════════════════════════════════════════
// SOKKER TRAINING PLANNER v17 — estimator soundness + interval-first talent
//
// v17 (Jul 2026): estimator fixes driven by field reports (forum pg 9–10,
// dzidzia's three juniors, 2026-07-02), reproduced from corpus submissions
// 629/630/631 and validated against them + a 143-player corpus sweep.
// Bundle format, corpus schema, planner engine: unchanged.
//
//  1. F3 — SOUND NO-POP UPPER BOUND. _noPopUpperBound denominator is
//     xpTotal ONLY (known start or not). The previous known-start denom
//     (xpTotal+xpFirst) assumed MAXIMAL carry-in — the closed-gap lower-
//     bound logic applied where it flips from conservative to aggressive —
//     and manufactured hard caps from soft no-pop evidence (Højland
//     40124291: pace L10 "<71" vs real ~93). Desktop talent.py shares the
//     defect (its docstring proof only covers the xpTotal case); the
//     desktop fix ships as a separate talent.py version. Side effect:
//     some previously contradiction-suppressed caps now bite — those are
//     the SOUND bounds and legitimately tighten a few estimates.
//
//  2. F1 — ONE-SIDED EVENT GUARD. Balance requires the event set to be
//     able to say "over". On short junior gaps every event's hi saturates
//     at 100 ⇒ C(td) can never go negative ⇒ the root-find converges to
//     the LOWER ENVELOPE, not a talent point (Kundrík 40171831: 57.9
//     [reliable] vs real ~89, with every gap individually consistent
//     with 89). Zero two-sided events ⇒ balance skipped, gap verdict
//     passes through. Desktop is immune (tracker-replay events are
//     inherently two-sided); this closes the static-gap-event port's
//     degenerate case documented as a v14 deviation.
//
//  3. F1b — ZERO-PLATEAU BANDS. C(td) is a monotone non-increasing step
//     function, so {C=0} is a single interval [z0,z1] (two bisections).
//     A plateau wider than _BAL_WIDE_BAND is reported AS the band
//     (center point), instead of the ε-band at whichever edge bisection
//     happened to hit (Højland: plateau [68,91] → was 71.7±3.6, now
//     79.7 band 68–91; real 93 at the striker-L3 hard edge).
//
//  4. F2 — EARNED CONFIDENCE. The Case-4 weak→reliable_via_gap upgrade
//     requires ≥1 two-sided event, substantive narrowing (<80% of the
//     flat width), and non-degenerate result width (≥2·TOL). Trivial
//     shaves and band-touching intersections stay "weak".
//
//  5. F5 — NT-TRAINING WARNING. National minutes anywhere in the loaded
//     history raise a chip warning: NT coaching adds unmodeled XP, so
//     the estimate reads better (lower YS) than real (Bledy case).
//
//  6. INTERVAL-FIRST TALENT DISPLAY (user decision). Both the Stage-1
//     badge and the Stage-2 chip lead with the YS interval (td_hi→ys_lo,
//     td_lo→ys_hi); the point estimate is no longer displayed. Apply
//     writes the band-midpoint point estimate into the talent input
//     unchanged. One-sided/degenerate results keep the ≤/≥ point form.
//
//  Validation: Kundrík 57.9→76.4 [52.7,100] indicative (real 89.3 in
//  band); Højland 69.4→79.7 [68.1,91.3] weak (real 93.1 at edge);
//  Brzęczyszczykiewicz unchanged 100 ceiling (7 DB real error, junior-K
//  question, by design). Corpus sweep n=143: 62 changed, mean +4.3 DB,
//  junior-concentrated, demo player byte-identical, jsdom suite green.
//  NOTE: reference player Rysio 40058307 moved 84.8→91.2 — recheck
//  against desktop once desktop F3 lands.
//
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// SOKKER TRAINING PLANNER v16 — user-friendliness release
//
// v16 (Jul 2026): UX-only. No engine, estimator, bundle-format, or corpus-
// schema changes. Six changes from the simplification review:
//
//  1. DEMO PLAYER. "Try a demo player" buttons on Stage 0 and Stage 1 load
//     DEMO_HISTORY_JSON — a fully SYNTHETIC 45-week history generated
//     offline with the estimator-side forward model (eff(td)·XP vs
//     _canonThr, XD=93/XG=14, coach 93) so the in-app estimate is self-
//     consistent by construction: true YS 3.80, in-app estimate YS 3.82,
//     band 73–79 DB, reliable_via_gap. Age 20→23 across three season
//     boundaries (exercises _deriveStart). Demo loads route through the
//     normal history path (applyHistoryText) with opts.demo, which
//     SUPPRESSES the corpus submission — synthetic data never reaches
//     Supabase — and raises a persistent demo banner.
//
//  2. HYBRID AUTO-RUN. The sim runs automatically once when a player
//     first loads (no more empty results panel). After that, parameter
//     edits only mark results STALE — dimmed, with a "parameters changed"
//     ribbon and a rerun button; nothing recomputes behind the user's
//     back, and the export/corpus snapshot keeps an explicit settled
//     moment. Staleness = fingerprint mismatch (paramKey vs lastRunKey)
//     over skills/subs/age/ssw/pos/weeks/talent/strategy set.
//
//  3. SIMPLE/ADVANCED SPLIT (Plan tab). Simple mode: talent (input +
//     presets + estimate chip), position, and the v15 age/week horizon
//     picker with the end-of-27 chip. Everything else — season week, raw
//     weeks input, season presets, strategy multi-select, manual schedule
//     — folds into an Advanced expander. Nothing removed, only deferred;
//     a one-line summary under Run shows the active strategy set while
//     Advanced is closed.
//
//  4. EXPORT MERGED INTO PLAN. Stage 3 is removed; the tab strip is
//     How/Player/Plan. The full former export content (bundle explainer,
//     plan picker, preview, download) lives unchanged in a collapsible
//     "Save / export calibration bundle" card at the bottom of the Plan
//     stage. The corpus-sharing toggle stays on the load flow.
//
//  5. JARGON PASS. "YS Talent" → "Talent (YS scale — 3.00 = best)";
//     Start Season Week lives under Advanced with the auto-derived note
//     surfaced next to the horizon picker; estimate-confidence badges get
//     plain-language hover explanations (CONF_EXPLAIN).
//
//  6. VISUAL PASS. Cards drop their borders (background contrast instead),
//     section labels recede, the Best banner carries the weighted score
//     large, and below 720px the tab strip docks to the bottom of the
//     viewport (thumb-reachable) with safe-area padding.
//
// ═══════════════════════════════════════════════════════════════════════════
// SOKKER TRAINING PLANNER v15 — game-look player cards + age-based horizon
//
// v15 (Jul 2026): UX-only release. No engine, estimator, or export changes.
//
//  1. GAME-LOOK PLAYER CARDS (SokkerCard). The Stage 2 results header's
//     plain skill strip is replaced by two cards side by side — "Now" and
//     "Projected" — laid out exactly like the in-game player card: header
//     row (name, age), value row, form row, then the 4×2 skill grid in
//     game order (stamina|keeper, pace|defender, technique|playmaker,
//     passing|striker), each cell "levelname [N] skill". English level
//     names (sokker_01 v23 canonical table, tragic[0]…superdivine[18]).
//     Projected card reuses the game's green-pop convention: a skill that
//     improved over the horizon renders green with a +N chip — the card
//     reads like a training report from the future. Colors stay in the
//     app theme (the game LAYOUT is what carries over, not the navy).
//     Stamina/keeper are not simulated: shown from the paste card or the
//     last history report when known ("?" otherwise) and carried
//     unchanged onto the projected card. Value rows: current shows the
//     actual card value when the paste path supplied one, otherwise the
//     model estimate (Mikoos port); projected is always the model
//     estimate, with a footnote stating the unchanged form/stamina/keeper
//     assumption. Cards stack below ~680px (auto-fit grid).
//
//  2. PROJECTION STRATEGY IS USER-SELECTED. Strategy column headers in
//     the comparison table are clickable; the selected column drives the
//     Projected card (highlighted header + underline). Initial selection
//     after each run = best weighted score, purely as a starting state.
//     Falls back safely when the selected key disappears (rerun with
//     fewer strategies, manual toggle off).
//
//  3. AGE-BASED HORIZON PICKER, DEFAULT "END OF 27". The horizon block
//     gains an "until age XX, week YY" picker (age input + week 1–13
//     select) that is a two-way view of the same `weeks` state: editing
//     the picker recomputes weeks via _weeksUntil; editing weeks (or any
//     preset) live-updates the picker via _horizonEnd. Sim semantics
//     pinned against runPlan: week ssw is trained first, age increments
//     after week 13 — so weeks = (14−ssw)+13·(XX−age−1)+YY for XX>age,
//     YY−ssw+1 for XX==age. A "27yo" preset chip sits first in the preset
//     row. DEFAULT ON PLAYER LOAD: history and paste loads set the
//     horizon to end-of-27 (age≤27; falls back to the previous 52-week
//     default for older players). Bundle loads keep their saved horizon
//     unchanged (restoring a plan stays faithful). Age/ssw edits after
//     load do NOT silently move the horizon — the picker just re-renders
//     the equivalent endpoint.
//
// ═══════════════════════════════════════════════════════════════════════════
// SOKKER TRAINING PLANNER v14 — coupled engine + balance talent + 2 bug fixes
//
// v14 (Jul 2026): Engine sync with desktop production + two field-reported
// bug fixes.
//
//  1. THRESHOLD ENGINE → COUPLED (constants.py v8+, sokker_03 v49).
//     The v25 product-slope model is REMOVED (no legacy selector — coupled
//     only). Per-DB cost: K·(B/75)·(1 + d/50)^(1 + 0.10·max(0, age−16)),
//     K = 16.0 (senior-Mikoos-anchored post value-fix). Per-level threshold
//     = Σ per-DB cost over the level's true DB span (LEVEL_WIDTHS 5/6 by
//     parity), replacing the old (level+0.5)·(100/18) midpoint form. Both
//     the planner engine (_dt) and the tracker/estimator (_canonThr) route
//     through the same per-DB sum. Intra-level accumulation keeps the
//     uniform 18-du subdivision (planner) / fractional-buffer (tracker)
//     structure — pop TIMING is exact (level totals match desktop);
//     within-level carry display is a uniform approximation, as before.
//
//  2. COACH_DB 91 → 93. Desktop reverted to flat 93 in the v37 commit
//     (320-pop backtest, MAE 3.5); online follows. _XD = 89, _XG = 13.
//     The v10 structural fix (_dbGainPerWeek × coach/100) is retained.
//
//  3. VALUE FORMULA — Mikoos-faithful port replacing the exponential
//     approximation. Corrected cumulative skill_table (the desktop
//     constants.py v9 off-by-one fix: base_values[i], not [i+1] — the old
//     form ran ~8% hot at mid/high levels), VALUE_LEVEL_MULT^(L+f)
//     interpolation, stamina lb·216.4·1.511^lb, form penalty 1/40 → 1/39.
//     Affects _computeValue and the Mikoos subskill back-out.
//
//  4. TALENT ESTIMATOR → BALANCE-v1 (talent_balance.py port, sokker_11).
//     The v12 flat-intersection estimate is retained as the event producer
//     and fallback. Known-start closed gaps become over/under events: at
//     candidate td, td < gap.td_lo ⇒ under, td > gap.td_hi ⇒ over. The
//     count signal C(td) = n_under − n_over drives a monotone bisection
//     (direction by COUNT, never by weight); the confidence band is the
//     reliability-weighted noise floor ε_w/|slope| with the coupled
//     _BAND_RMSE table (talent_weighting v4) keyed on gap level. Degenerate
//     cases ported verbatim: ceiling/floor-pinned (virtual point past the
//     cap, late clamp), flat-band narrowing via the v12 gap band,
//     insufficient-signal → keep the v12 gap estimate.
//     v1 deviations from desktop (documented): events come from known-start
//     gaps only (no anchor-solved first pops — anchor_refiner v14 is not
//     yet reference-validated and is deliberately NOT ported); range-
//     excluded gaps stay excluded (v12 contamination semantics); partial
//     gaps contribute to the gap band only, never to direction.
//
//  5. BUG FIX — manual schedule pace substitution (report: Lipa91,
//     2026-06-22). runPlanFromSchedule silently swapped a maxed (or
//     _gwm-predicted-to-max) assigned skill for the highest weight×threshold
//     alternative — which pace (B=99) almost always won. The fallback is
//     REMOVED for manual schedules: the assignment is honored literally
//     (direct XP burns against the ceiling, GT still flows to the others,
//     matching game reality). Wasted weeks are flagged (log[i].wasted) and
//     rendered RED in the schedule chips and the week-by-week log. Auto
//     strategies keep their fallback — it is correct there.
//
//  6. BUG FIX — season-rollover aging (report: Lipa91, 2026-06-22).
//     Training reports are Thursday snapshots; the season boundary (and
//     the global +1 aging) lands Friday. Loading a player in that window
//     simulated the whole horizon one year young. On history/bundle load
//     the boundary phase is now derived from age increments inside the
//     report stream; sim start = last.week + 1, and if that step crosses
//     the boundary the starting age is bumped +1 and ssw set to 1 (else
//     ssw is set to the derived season week). Auto-derivation only —
//     age and ssw inputs stay editable as overrides; a visible note
//     explains any adjustment. Histories spanning no boundary fall back
//     to previous behavior (phase unknowable).
//
//  Corpus/bundle: source string stays pinned at v8.4.6 (RLS gate); engine
//  and estimator metadata ride inside user_snapshot (engine:
//  "coupled-K16-coach93", talent_estimator: "balance-v1").
//  coach_value_assumed follows the live constant → 93.
//
// ═══════════════════════════════════════════════════════════════════════════
// SOKKER TRAINING PLANNER v13 — onboarding + load-flow rework
//
// v13 (May 2026): Three layout/UX changes that address first-time-user
// friction observed once v12's talent estimator went live.
//   1. New Stage 0 ("How it works") — a self-contained intro card that the
//      app boots into. Explains the goals (decision support + corpus
//      contribution), the two loading paths, the three planning stages,
//      and how to read the v12 talent-estimate chip. Single Get-Started
//      button advances to Stage 1.
//   2. Stage 1 default load tile flipped: "Known history" (training-
//      history JSON/XML) is now ON by default instead of "Paste card".
//      Reflects the recommendation in the new intro and matches the
//      direction of the upcoming XML-default work.
//   3. Stage 1 tile labels reframed around what the user has rather than
//      what they type: "Training history" → "Known history" and "Paste
//      card" → "No known history". Manual-entry tile retained as power-
//      user override. Tile order reshuffled so Known history sits first.
//   4. Talent-estimate badge surfaced on Stage 1 too, inline with the
//      player's age in the SkillEditor header. Display-only — the Apply
//      button stays on Stage 2 next to the YS Talent input. Lets users
//      sanity-check the estimate while reviewing skills, without having
//      to navigate to the planner first.
// No engine math changes; no estimator changes. This is a UX-only release.
//
// v12 (May 2026): Adds a JS port of talent.py v25's gap-based estimator,
// surfacing a "talent estimate" chip under the YS Talent input on Stage 2
// whenever a training history is loaded. The chip shows a point estimate
// on the YS-standard scale (the harsher one — `300 / (10 + 0.9 × DB)`,
// matching the existing _fromYS scale used by the input itself) plus a
// confidence label (reliable / indicative / unreliable) and an Apply
// button that fills the YS Talent input.
//
// Estimator scope (v1):
//   - Full gap extraction: closed mixed gaps + open in-progress gap
//   - Per-gap bound inversion via canonical_threshold
//   - Aggregate flat intersection + per-skill consensus + outlier rejection
//   - Auto-detect is_gk via keeper > max(outfield) heuristic
//   - Drop-eligibility exclusion (pace>=28, others>=30)
//
// Deferred from v1 (kept simple intentionally):
//   - Subskill carry-in soft-anchoring of partial gaps (use_subskill=False)
//   - Prior-club training injection
//   - Per-gap evidence table UI (estimator returns it; not displayed yet)
//
// The math (xp_per_week, xp_gt_per_week, threshold inversion, consensus
// pruning, no-pop bounds) matches talent.py v25 byte-for-byte modulo the
// omissions above. Estimator unit:
//   - DB-native integers everywhere (no display-level rounding inside)
//   - Output rounded to 1 decimal place (talent_db) before scale conversion
//   - YS-scale display rounded to 2 decimals to match the input field
//
// v11 (May 2026): single-source-of-truth tidy-up. The engine has run at
// _COACH_DB = 91 since v10, but the corpus bundle export was still
// labelling submissions with `coach_value_assumed: 93` — a leftover from
// before the v10 recalibration. v11 changes that label to 91 so the
// corpus metadata matches the simulation that produced talent_db_estimate.
// No engine math changes. Existing bundles in the corpus are unaffected.
//
// Mirror change on desktop: constants.py v11 lowers COACH_DB_UNEARTHLY
// 93 → 91, and subskill.py v13 adds the missing coach_db/100 factor in
// db_gain_per_week (the same structural fix v10 applied here). After
// these three commits, desktop and online both run at coach_db = 91 with
// the canonical gain formula end-to-end.
//
// v10 — coach_db structural fix + recalibration. Two paired changes:
//
//  1. _dbGainPerWeek now multiplies by coach_db/100, matching the
//     XP path used elsewhere in the planner (_XD = round(96·_K1/100)).
//     Previously the simulator computed gain as
//       _DB_PER_LV × intensity × coachEff × (eff/100) / thr
//     with no coach_db factor — effectively running the simulator at
//     coach=100 while every other path used coach=93. The mismatch
//     accumulated db_accum ~7-8% faster than the rest of the engine
//     assumed, producing pop predictions ~2-3 weeks early and
//     occasionally pushing carry-in subskill above 0.99 (which the
//     desktop tab_planner widget choked on with StreamlitValueAboveMax).
//
//  2. Coach value lowered 93 → 91. Desktop calibration on a 28-player,
//     497-pop validation panel (train=first 26 weeks, test=remainder)
//     showed minimum aggregate count error at ~91 once the structural
//     bug was fixed. _K1 and _COACH_DB unified at 91.
//
// User-facing impact (v10): simulated pop times shift later by ~9% (no longer
// over-predicting). Subskill carry-in display reaches 0.99 maximum at
// the ceiling, and never above. Existing bundles continue to load.
//
// v9 — v25 senior-age threshold correction (k(age) = 0.50 + 0.04·max(0, age−23)).
//
// History prior to v9 — patches v8.4.x:
// v8.4.7: corpus 42501 fix (UPSERT regression). Drop "resolution=
//   merge-duplicates" Prefer header. Postgres was rejecting every
//   submission because the UPDATE branch lacked an RLS policy.
// v8.4.6: format_version / source pin (kept defensively in v8.4.7).
// v8.4.5: restoration of v8.4.1 feature set (manual planner, subskill
//   carry-in fix in _stateSubskill, extractPlan helper, v1.1 bundle
//   format with `plans`, plan-export picker). v8.4.2/3 was a regression
//   branch that lost ~25KB of code.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Engine (coupled threshold model, K=16 / coach_db=93 — v14, Jul 2026) ──
// _K1 (coach_db) = 93 since v14, matching desktop COACH_DB_UNEARTHLY (the v37
// commit reverted the online-only 91 recalibration; the v10 structural
// coach/100 fix in _dbGainPerWeek is retained). _XD = 89, _XG = 13.
const _K1=93,_K2=96,_SL=13,_R=100/18,_U=18,_MX=18;
// v14: the planner-local _B map is retired — all threshold paths key _B_INT.
const OS=["pace","technique","passing","defending","playmaking","striker"];
const SN={pace:"PAC",technique:"TEC",passing:"PAS",defending:"DEF",playmaking:"PLM",striker:"STR"};
// v19: simulator XP constants are COACH-PARAMETRIZED.  _XD/_XG keep their
// historical values at the default coach 93 (89 / 13; the baked-in I=96
// standard week is unchanged) and are recomputed by _setCoach(c), which
// every top-level sim entry point calls — the coach can no longer leak
// between runs.  The ESTIMATOR path is parametrized separately via
// options.coachDb → _weekXpContribution (per-record intensities, exact).
let _COACH_LIVE=_K1;
let _XD=Math.round(_K2*_K1/100);
let _XG=Math.round(_K2*_K1*15/10000);
function _setCoach(c){
  _COACH_LIVE=Math.max(30,Math.min(120,Math.round(c??_K1)));
  _XD=Math.round(_K2*_COACH_LIVE/100);
  _XG=Math.round(_K2*_COACH_LIVE*15/10000);
}

// Coupled threshold constants (constants.py v8+: COUPLED_K_DEFAULT=16.0,
// COUPLED_X=50, COUPLED_ALPHA=0.10, AGE_PIVOT=16) and the canonical level
// geometry (LEVEL_WIDTHS / LEVEL_DB_START — 5/6 DB per level by parity).
const _CK=16.0,_CX=50.0,_CA=0.10,_CAGE0=16;
const _LW=[6,5,6,5,6,5,6,5,6,6,5,6,5,6,5,6,5,6,1];
const _LDS=(()=>{const a=[0];for(let i=0;i<_LW.length-1;i++)a.push(a[a.length-1]+_LW[i]);return a;})();
// _LDS = [0,6,11,17,22,28,33,39,44,50,56,61,67,72,78,83,89,94,100]

function _fromYS(ys){const db=(300/ys-10)*100/90;return Math.max(0,Math.min(100,db));}
// v20: Senior community scale (3.00 best … 7.50 worst; what Mikoos /
// Sokker Assistente / SkTables report) → DB, via the Möbius relation to
// the YS scale (sokker_01 v23): ys = 6·cs/(9−cs), then the YS inverse.
function _dbFromSenior(cs){
  if(!isFinite(cs)||cs>=9)return NaN;
  return _fromYS(Math.max(3.0,Math.min(30.0,6*cs/(9-cs))));
}
function _te(td){return(40+60*td/100)/100;}
// Coupled per-DB cost: K·(B/75)·(1 + d/50)^(1 + 0.10·max(0, age−16)).
// Age enters the EXPONENT — the db-cost curve steepens with age.
function _pdc(sk,d,a){
  const b=_B_INT[sk];if(b==null)return Infinity;
  return _CK*(b/75)*Math.pow(1+d/_CX,1+_CA*Math.max(0,a-_CAGE0));
}
// Raw per-level threshold = Σ per-DB cost over the level's true DB span.
function _dtRaw(sk,lv,a){
  if(lv<0||lv>=_LDS.length)return Infinity;
  const s=_LDS[lv],w=_LW[lv];let t=0;
  for(let d=s;d<s+w;d++)t+=_pdc(sk,d,a);
  return t;
}
function _dt(sk,lv,a,te){return _dtRaw(sk,lv,a)/te;}
function _duc(sk,lv,a,te){return _dt(sk,lv,a,te)/_U;}
function _mk(lv,du=0,xp=0){return{lv,du,xp};}
function _mkSub(lv,sub,sk,a,te){
  const tot=sub*_dt(sk,lv,a,te),c=_duc(sk,lv,a,te);
  const d=Math.min(Math.floor(tot/c),_U-1);return _mk(lv,d,tot-d*c);
}
function _applyXp(s,xp,sk,a,te){
  s.xp+=xp;const p=[];
  while(s.lv<_MX){const c=_duc(sk,s.lv,a,te);if(s.xp<c)break;s.xp-=c;s.du++;
    if(s.du>=_U){s.du=0;s.lv++;p.push(s.lv);}}
  // v18: 18 is the game's hard ceiling — a pop into _MX discards the
  // residual.  Pre-fix, the leftover carry displayed as phantom subskill
  // ABOVE the cap (17.99 → "18.40" in one week; 18.02–18.07 rows that
  // drifted as the age-dependent level-18 threshold — a bracket that does
  // not exist — moved under the ratio).  Reported by D@ni + wonsky90.
  if(s.lv>=_MX){s.du=0;s.xp=0;}
  return p;
}
function _sub(s,sk,a,te){if(s.lv>=_MX)return 0;const f=_dt(sk,s.lv,a,te);if(f<=0)return 1;return(s.du*(f/_U)+s.xp)/f;}
function _tdb(s,sk,a,te){
  const i=s.lv*_R+s.du*(_R/_U);if(!sk)return i;
  const c=_duc(sk,s.lv,a,te);return c<=0?i:i+(s.xp/c)*(_R/_U);
}
function _xtm(s,sk,a,te){
  if(s.lv>=_MX)return 0;let n=_duc(sk,s.lv,a,te)-s.xp;
  for(let d=s.du+1;d<_U;d++)n+=_duc(sk,s.lv,a,te);
  for(let l=s.lv+1;l<_MX;l++)n+=_dt(sk,l,a,te);return n;
}
function _gwm(s,sk,a,te,w){return s.lv>=_MX?true:w<=0?false:w*_XG>=_xtm(s,sk,a,te);}
function _initSt(skills,a,te,subs){
  const st={};for(const sk of OS)st[sk]=_mkSub(skills[sk]||0,subs?.[sk]??0.25,sk,a,te);return st;
}
function _ageAfter(a,sw,wks){let s=sw,ag=a;for(let i=0;i<wks;i++){s++;if(s>_SL){s=1;ag++;}}return ag;}

// v15: horizon ⇄ (target age, season week) conversion. Semantics pinned
// against runPlan: the FIRST simulated week is trained at season week ssw,
// age increments after week 13 is trained (sw++ / rollover in the loop).
// _weeksUntil: number of training weeks so the LAST trained week is season
// week tWeek of the season in which the player is age tAge (inclusive).
// Returns null when the target lies in the past. End-of-27 default =
// _weeksUntil(age, ssw, 27, 13).
function _weeksUntil(age,ssw,tAge,tWeek){
  if(!isFinite(age)||!isFinite(ssw)||!isFinite(tAge)||!isFinite(tWeek))return null;
  if(tAge<age)return null;
  if(tAge===age)return tWeek>=ssw?tWeek-ssw+1:null;
  return (_SL-ssw+1)+_SL*(tAge-age-1)+tWeek;
}
// Inverse view: (age, season week) of the LAST trained week after `weeks`
// training weeks starting from (age, ssw). Closed-form, no walk needed.
function _horizonEnd(age,ssw,weeks){
  const t=ssw-1+Math.max(1,weeks|0)-1; // 0-based index of last trained week from season start
  return{age:age+Math.floor(t/_SL),week:(t%_SL)+1};
}

// v14: derive the sim starting (age, ssw) from a training history, handling
// the season rollover (Lipa91 report, 2026-06-22): reports are Thursday
// snapshots; the boundary + global aging land Friday. Any age increment
// INSIDE the report stream marks the boundary week exactly — a report week
// b whose age is +1 over the previous report is season-week 1. With the
// phase known, sim start = last.week + 1: if that step lands on a boundary
// week the starting age is last.age + 1 and ssw = 1; else ssw = offset + 1.
// Uses the LATEST observed boundary. Returns nulls when no boundary is
// observable (short history — phase unknowable, caller keeps defaults).
function _deriveStart(reports){
  if(!reports||!reports.length)return null;
  const last=reports[reports.length-1];
  const lastAge=parseInt(last.age,10);
  if(!isFinite(lastAge))return null;
  let b=null;
  for(let i=1;i<reports.length;i++){
    const a0=parseInt(reports[i-1].age,10),a1=parseInt(reports[i].age,10);
    if(isFinite(a0)&&isFinite(a1)&&a1===a0+1)b=reports[i].week||0;
  }
  if(b==null)return{age:lastAge,ssw:null,bumped:false};
  const nextWeek=(last.week||0)+1;
  const off=((nextWeek-b)%_SL+_SL)%_SL;
  return{
    age:off===0?lastAge+1:lastAge,
    ssw:off+1,           // off=0 ⇒ nextWeek IS a boundary week ⇒ ssw=1
    bumped:off===0,
  };
}

// ─── Positions ─────────────────────────────────────────────────────────────
const POS={
  DEF:{name:"DEF",w:{pace:1,technique:.5,passing:.5,defending:1,playmaking:.5,striker:0},d:"Defender"},
  MID:{name:"MID",w:{pace:1,technique:1,passing:1,defending:1,playmaking:1,striker:0},d:"Midfielder"},
  ATT:{name:"ATT",w:{pace:1,technique:1,passing:.5,defending:.5,playmaking:.5,striker:1},d:"Attacker"},
  WING:{name:"WING",w:{pace:1,technique:1,passing:1,defending:.5,playmaking:1,striker:0},d:"Winger"},
};
function _crit(p){return OS.filter(s=>p.w[s]===1);}
function _anyRem(st,p,a,te){
  let b=null,bs=-1;for(const sk of OS){const w=p.w[sk]||0;
    if(w>0&&st[sk].lv<_MX){const c=_dt(sk,st[sk].lv,a,te);
      const s=c>0?w*(_XD-_XG)/c:0;if(s>bs){bs=s;b=sk;}}}return b;
}

// ─── Strategy pickers ──────────────────────────────────────────────────────
function _rr(st,a,p,ctx,te){
  const cr=_crit(p);if(!cr.length)return _anyRem(st,p,a,te);
  if(ctx.i==null)ctx.i=0;for(let x=0;x<cr.length;x++){
    const sk=cr[ctx.i%cr.length];ctx.i++;if(st[sk].lv<_MX)return sk;}
  return _anyRem(st,p,a,te);
}
function _ch(st,a,p,ctx,te){
  let b=null,bc=1e9;for(const sk of _crit(p)){if(st[sk].lv>=_MX)continue;
    const c=_dt(sk,st[sk].lv,a,te);if(c<bc){bc=c;b=sk;}}return b||_anyRem(st,p,a,te);
}
function _ex(st,a,p,ctx,te){
  let b=null,bc=-1;for(const sk of _crit(p)){if(st[sk].lv>=_MX)continue;
    const c=_dt(sk,st[sk].lv,a,te);if(c>bc){bc=c;b=sk;}}return b||_anyRem(st,p,a,te);
}
function _ctp(st,a,p,ctx,te){
  let b=null,bf=-1;for(const sk of _crit(p)){if(st[sk].lv>=_MX)continue;
    const f=_sub(st[sk],sk,a,te);if(f>bf){bf=f;b=sk;}}return b||_anyRem(st,p,a,te);
}
function _pf(tgt){return(st,a,p,ctx,te)=>{
  if(st.pace.lv<tgt)return"pace";const cr=_crit(p).filter(s=>s!=="pace");
  if(ctx.p2==null)ctx.p2=0;for(let x=0;x<cr.length;x++){
    const sk=cr[ctx.p2%cr.length];ctx.p2++;if(st[sk].lv<_MX)return sk;}
  if(st.pace.lv<_MX)return"pace";return _anyRem(st,p,a,te);};}


function _ll(st,a,p,ctx,te){
  // pick_lowest: pure maximin across all weighted skills
  let b=null,bl=99;for(const sk of OS){const w=p.w[sk]||0;
    if(w>0&&st[sk].lv<_MX&&st[sk].lv<bl){bl=st[sk].lv;b=sk;}}return b;
}
function _bal(st,a,p,ctx,te){
  // balanced 2:1: primaries get 2x slots vs secondaries; maximin within tier
  const prim=_crit(p);const sec=OS.filter(s=>p.w[s]>0&&p.w[s]<1);
  const nPri=prim.length,nSec=sec.length;
  const cycLen=2*nPri+nSec;if(cycLen===0)return null;
  if(ctx.bs==null)ctx.bs=0;
  const slot=ctx.bs%cycLen;ctx.bs++;
  const priAct=prim.filter(s=>st[s].lv<_MX);
  const secAct=sec.filter(s=>st[s].lv<_MX);
  if(slot<2*nPri){
    if(priAct.length)return priAct.reduce((a,b)=>st[a].lv<=st[b].lv?a:b);
    if(secAct.length)return secAct.reduce((a,b)=>st[a].lv<=st[b].lv?a:b);
  }else{
    if(secAct.length)return secAct.reduce((a,b)=>st[a].lv<=st[b].lv?a:b);
    if(priAct.length)return priAct.reduce((a,b)=>st[a].lv<=st[b].lv?a:b);
  }
  return null;
}
function _pb(st,a,p,ctx,te,rem){
  // positional_balanced: primaries via gt-will-max, then secondaries self-level
  const prim=_crit(p);const sec=OS.filter(s=>p.w[s]>0&&p.w[s]<1);
  if(ctx.pbPhase==null)ctx.pbPhase=1;
  if(ctx.pbPhase===1){
    const needs=prim.filter(s=>st[s].lv<_MX&&!_gwm(st[s],s,a,te,rem||0));
    if(!needs.length){ctx.pbPhase=2;}
    else return needs.reduce((a,b)=>st[a].lv<=st[b].lv?a:b);
  }
  const secAct=sec.filter(s=>st[s].lv<_MX);
  if(secAct.length)return secAct.reduce((a,b)=>st[a].lv<=st[b].lv?a:b);
  const priAct=prim.filter(s=>st[s].lv<_MX);
  if(priAct.length)return priAct.reduce((a,b)=>st[a].lv<=st[b].lv?a:b);
  return null;
}

const STRATS={
  round_robin:{name:"Round-Robin",fn:_rr,desc:"Rotate critical skills evenly"},
  cheapest_first:{name:"Cheapest First",fn:_ch,desc:"Train easiest skill to pop next"},
  most_expensive:{name:"Most Expensive",fn:_ex,desc:"Front-load the hardest skill"},
  closest_to_pop:{name:"Closest to Pop",fn:_ctp,desc:"Train skill nearest to next level-up"},
  pace_16_rr:{name:"Pace→16 + RR",fn:_pf(16),desc:"Rush pace to 16, then round-robin"},
  pace_15_rr:{name:"Pace→15 + RR",fn:_pf(15),desc:"Rush pace to 15, then round-robin"},
  pick_lowest:{name:"Pick Lowest",fn:_ll,desc:"Always train lowest-level weighted skill (pure maximin)",validPos:null},
  balanced:{name:"Balanced (2:1)",fn:_bal,desc:"Primaries 2× slots vs secondaries; maximin within each tier",validPos:["DEF","ATT","WING"]},
  positional_balanced:{name:"Positional→Balanced",fn:_pb,desc:"Primaries via GT-will-max (lowest-first), then secondaries self-level",validPos:["DEF","ATT","WING"]},
};

// ─── Core Simulation ───────────────────────────────────────────────────────
function runPlan(skills,td,age,ssw,pos,strat,weeks,subs,coachDb){
  _setCoach(coachDb);
  const prof=POS[pos],fn=STRATS[strat].fn,te=_te(td);
  const st=_initSt(skills,age,te,subs);
  const startSk={};for(const sk of OS)startSk[sk]=st[sk].lv;
  let sw=ssw,ca=age,wk=0;const ctx={},log=[],mx={};
  while(wk<weeks){
    const rem=weeks-wk;let tr=fn(st,ca,prof,ctx,te,rem);if(!tr)break;
    if(tr&&_gwm(st[tr],tr,ca,te,rem)){let alt=null,ac=-1;
      for(const sk of OS){const w=prof.w[sk]||0;
        if(w>0&&st[sk].lv<_MX&&!_gwm(st[sk],sk,ca,te,rem)){
          const sc=w*_dt(sk,st[sk].lv,ca,te);if(sc>ac){ac=sc;alt=sk;}}}
      if(alt)tr=alt;}
    wk++;const g={},wp=[];
    for(const sk of OS){if(st[sk].lv>=_MX){g[sk]=0;continue;}
      const xp=sk===tr?_XD:_XG;g[sk]=xp;
      for(const l of _applyXp(st[sk],xp,sk,ca,te)){wp.push([sk,l]);
        if(l>=_MX&&!(sk in mx))mx[sk]=[wk,ca];}}
    log.push({week:wk,age:ca,sw,trained:tr,
      levels:Object.fromEntries(OS.map(sk=>[sk,st[sk].lv])),
      subs:Object.fromEntries(OS.map(sk=>[sk,_sub(st[sk],sk,ca,te)])),
      gains:g,pops:wp});
    sw++;if(sw>_SL){sw=1;ca++;}
  }
  const fsk={},fdb={};
  for(const sk of OS){fsk[sk]=st[sk].lv;fdb[sk]=_tdb(st[sk],sk,ca,te);}
  return{log,finalSkills:fsk,finalDb:fdb,totalWeeks:wk,maxedAt:mx,startSkills:startSk,startAge:age,isSale:false};
}

// v8.4: drive the same engine off an explicit schedule (Manual Schedule Builder)
function runPlanFromSchedule(skills,td,age,ssw,pos,schedule,subs,coachDb){
  _setCoach(coachDb);
  const prof=POS[pos],te=_te(td);
  const st=_initSt(skills,age,te,subs);
  const startSk={};for(const sk of OS)startSk[sk]=st[sk].lv;
  let sw=ssw,ca=age,wk=0;const log=[],mx={};
  const len=Array.isArray(schedule)?schedule.length:0;
  let wastedWeeks=0;
  while(wk<len){
    const tr=schedule[wk];
    // v14: the assignment is honored LITERALLY. The old "graceful fallback"
    // silently swapped a maxed (or _gwm-predicted-to-max) skill for the
    // highest weight×threshold alternative — pace (B=99) almost always won
    // (reported by Lipa91). A maxed assignment now burns its direct XP
    // against the ceiling while GT still flows to the others (game reality);
    // the week is flagged wasted and rendered red.
    if(!tr||!OS.includes(tr))break;
    const wasted=st[tr].lv>=_MX;
    if(wasted)wastedWeeks++;
    wk++;const g={},wp=[];
    for(const sk of OS){if(st[sk].lv>=_MX){g[sk]=0;continue;}
      const xp=sk===tr?_XD:_XG;g[sk]=xp;
      for(const l of _applyXp(st[sk],xp,sk,ca,te)){wp.push([sk,l]);
        if(l>=_MX&&!(sk in mx))mx[sk]=[wk,ca];}}
    log.push({week:wk,age:ca,sw,trained:tr,wasted,
      levels:Object.fromEntries(OS.map(sk=>[sk,st[sk].lv])),
      subs:Object.fromEntries(OS.map(sk=>[sk,_sub(st[sk],sk,ca,te)])),
      gains:g,pops:wp});
    sw++;if(sw>_SL){sw=1;ca++;}
  }
  const fsk={},fdb={};
  for(const sk of OS){fsk[sk]=st[sk].lv;fdb[sk]=_tdb(st[sk],sk,ca,te);}
  return{log,finalSkills:fsk,finalDb:fdb,totalWeeks:wk,maxedAt:mx,startSkills:startSk,startAge:age,isSale:false,isManual:true,schedule:[...schedule],wastedWeeks};
}

// ─── Sale Optimizer ────────────────────────────────────────────────────────
function _simSched(sched,skills,td,age,ssw,subs,prof){
  const te=_te(td);const st=_initSt(skills,age,te,subs);
  let sw=ssw,ca=age;const log=[];
  for(let i=0;i<sched.length;i++){
    const tr=sched[i],wk=i+1,g={},wp=[];
    for(const sk of OS){if(st[sk].lv>=_MX){g[sk]=0;continue;}
      const xp=sk===tr?_XD:_XG;g[sk]=xp;
      for(const l of _applyXp(st[sk],xp,sk,ca,te))wp.push([sk,l]);}
    log.push({week:wk,age:ca,sw,trained:tr,
      levels:Object.fromEntries(OS.map(sk=>[sk,st[sk].lv])),
      subs:Object.fromEntries(OS.map(sk=>[sk,_sub(st[sk],sk,ca,te)])),
      gains:g,pops:wp});
    sw++;if(sw>_SL){sw=1;ca++;}
  }
  return{states:st,log};
}
function _ci(s,sk,a,te){if(s.lv>=_MX)return 0;return s.du*_duc(sk,s.lv,a,te)+s.xp;}
function _tci(st,prof,a,te){let t=0;for(const sk of OS){const w=prof.w[sk]||0;if(w>0)t+=w*_ci(st[sk],sk,a,te);}return t;}
function _buildRR(n,prof){
  const cr=_crit(prof).length?_crit(prof):OS.filter(s=>(prof.w[s]||0)>0);
  if(!cr.length)return OS.slice(0,n);return Array.from({length:n},(_,i)=>cr[i%cr.length]);
}

function runSaleOpt(skills,td,age,deadWeeks,pos,subs,ssw,maxExt=3,coachDb){
  _setCoach(coachDb);
  const prof=POS[pos],te=_te(td);
  const wsk=OS.filter(sk=>(prof.w[sk]||0)>0);
  let best=_buildRR(deadWeeks,prof),extUsed=0,totSwaps=0;
  for(let er=0;er<=maxExt;er++){
    const curLen=deadWeeks+extUsed;let sched=[...best];const pre=[...sched];
    for(let it=0;it<curLen;it++){
      const{states}=_simSched(sched,skills,td,age,ssw,subs,prof);
      const fa=_ageAfter(age,ssw,curLen);
      const sc={};for(const sk of wsk)sc[sk]=states[sk].lv>=_MX?0:_sub(states[sk],sk,fa,te);
      let tgt=null,tf=-1;for(const sk of wsk){if(states[sk].lv<_MX&&sc[sk]>tf){tf=sc[sk];tgt=sk;}}
      if(!tgt)break;
      const srcs=wsk.filter(sk=>sk!==tgt&&sc[sk]>0.15).sort((a,b)=>sc[b]-sc[a]);
      let swapped=false;
      for(const src of srcs){let li=null;for(let w=sched.length-1;w>=0;w--)if(sched[w]===src){li=w;break;}
        if(li==null)continue;sched[li]=tgt;totSwaps++;swapped=true;break;}
      if(!swapped)break;
    }
    const{states:sn}=_simSched(sched,skills,td,age,ssw,subs,prof);
    const{states:so}=_simSched(pre,skills,td,age,ssw,subs,prof);
    const fa=_ageAfter(age,ssw,curLen);
    if(_tci(sn,prof,fa,te)>=_tci(so,prof,fa,te)-0.01){sched=[...pre];totSwaps=0;}
    best=sched;
    if(er>=maxExt)break;
    const{states:bs}=_simSched(best,skills,td,age,ssw,subs,prof);
    const fAge=_ageAfter(age,ssw,best.length);
    const carry={};for(const sk of wsk)carry[sk]=_ci(bs[sk],sk,fAge,te);
    const hsk=wsk.reduce((a,b)=>carry[a]>carry[b]?a:b);
    if(carry[hsk]<=0||bs[hsk].lv>=_MX)break;
    const thr=_dt(hsk,bs[hsk].lv,fAge,te);
    const done=bs[hsk].du*_duc(hsk,bs[hsk].lv,fAge,te)+bs[hsk].xp;
    if(thr-done<=_XD+_XG*(wsk.length-1)){
      const oldCI=_tci(bs,prof,fAge,te);
      const trial=[...best,hsk];
      const{states:ts}=_simSched(trial,skills,td,age,ssw,subs,prof);
      const na=_ageAfter(age,ssw,trial.length);
      if(_tci(ts,prof,na,te)<oldCI-0.01){best=trial;extUsed++;}else break;
    }else break;
  }
  const{states:fs,log}=_simSched(best,skills,td,age,ssw,subs,prof);
  const fAge=_ageAfter(age,ssw,best.length);
  const fsk={},fdb={};
  for(const sk of OS){fsk[sk]=fs[sk].lv;fdb[sk]=_tdb(fs[sk],sk,fAge,te);}
  const carryPct={};for(const sk of wsk){
    if(fs[sk].lv>=_MX){carryPct[sk]=0;continue;}
    const thr=_dt(sk,fs[sk].lv,fAge,te);carryPct[sk]=thr>0?_ci(fs[sk],sk,fAge,te)/thr:0;
  }
  return{log,finalSkills:fsk,finalDb:fdb,totalWeeks:best.length,maxedAt:{},
    startSkills:Object.fromEntries(OS.map(sk=>[sk,skills[sk]||0])),startAge:age,
    isSale:true,schedule:best,carryPct,extensions:extUsed,swaps:totSwaps};
}

// ─── Target-build block-order optimizer (v18; desktop planner v6 port) ────
function _permutations(arr){
  if(arr.length<=1)return[arr.slice()];
  const out=[];
  for(let i=0;i<arr.length;i++){
    const rest=arr.slice(0,i).concat(arr.slice(i+1));
    for(const p of _permutations(rest))out.push([arr[i],...p]);
  }
  return out;
}

// Literal fixed-order simulator: trains order[k] until its target level,
// then advances; stops when every target is met or the cap is reached.
// No _gwm swap by design — the order is honored literally (v14 manual-
// schedule semantics).  Returns {weeks, finalDb, finalSkills, endAge};
// weeks=null when the cap ran out before all targets were met.
function _simOrderToTargets(order,targets,skills,td,age,ssw,subs,capWeeks){
  const te=_te(td);
  const st=_initSt(skills,age,te,subs);
  let sw=ssw,ca=age,wk=0;
  const done=()=>order.every(sk=>st[sk].lv>=targets[sk]);
  while(wk<capWeeks&&!done()){
    let tr=null;
    for(const sk of order){if(st[sk].lv<targets[sk]){tr=sk;break;}}
    if(!tr)break;
    wk++;
    for(const sk of OS){
      if(st[sk].lv>=_MX)continue;
      _applyXp(st[sk],sk===tr?_XD:_XG,sk,ca,te);
    }
    sw++;if(sw>_SL){sw=1;ca++;}
  }
  const finalDb={},finalSkills={};
  for(const sk of OS){finalSkills[sk]=st[sk].lv;finalDb[sk]=_tdb(st[sk],sk,ca,te);}
  return{weeks:done()?wk:null,finalDb,finalSkills,endAge:ca};
}

// Exhaustive ranking of every block order.  targets: {skill: displayLevel};
// entries at/below the current level (or >18) are dropped.  Returns
// {targets, orders:[{order,weeks,finalDb,finalSkills,endAge}…] fastest
// first (infeasible last), best: fastest feasible entry or null}.
function optimizeBlockOrder(skills,td,age,ssw,targets,subs,coachDb){
  _setCoach(coachDb);
  const eff={};
  for(const sk of OS){
    const t=Math.round(targets?.[sk]??0);
    if(t>(skills[sk]||0)&&t<=_MX)eff[sk]=t;
  }
  const keys=Object.keys(eff).sort();
  const out={targets:eff,orders:[],best:null};
  if(!keys.length)return out;
  const capWeeks=Math.max(_SL,(28-age)*_SL);   // mirror desktop age-27 horizon
  for(const perm of _permutations(keys)){
    const r=_simOrderToTargets(perm,eff,skills,td,age,ssw,subs,capWeeks);
    out.orders.push({order:perm,...r});
  }
  out.orders.sort((a,b)=>{
    if(a.weeks==null&&b.weeks==null)return 0;
    if(a.weeks==null)return 1;
    if(b.weeks==null)return -1;
    return a.weeks-b.weeks;
  });
  if(out.orders.length&&out.orders[0].weeks!=null)out.best=out.orders[0];
  return out;
}

// ─── XML History Parser (port of xml_history_parser.py, DOMParser-based) ──
const _SKTAG={
  stamina:"stamina",pace:"pace",technique:"technique",passing:"passing",
  keeper:"keeper",keeping:"keeper",
  defending:"defending",defence:"defending",defense:"defending",
  playmaking:"playmaking",striker:"striker",striking:"striker",
  form:"form",experience:"experience",teamwork:"teamwork",
  tactdisc:"tacticalDiscipline",tacticaldiscipline:"tacticalDiscipline",
  tactical_discipline:"tacticalDiscipline",
};
const _TRTAG={
  pace:"pace",technique:"technique",passing:"passing",
  keeper:"keeper",keeping:"keeper",
  defending:"defending",defence:"defending",defense:"defending",
  playmaking:"playmaking",striker:"striker",striking:"striker",
  stamina:"stamina",
};
const _WKTAG=new Set(["week","training","record","entry","row"]);

function _fc(elem,...tags){
  const s=new Set(tags.map(t=>t.toLowerCase()));
  for(const c of elem.children)if(s.has(c.tagName.toLowerCase()))return c;
  return null;
}
function _is(v,d=0){const n=parseInt(v,10);return isNaN(n)?d:n;}
function _tx(e){return e?(e.textContent||"").trim():"";}
function _parseSkBlock(c){
  const o={};for(const ch of c.children){const k=_SKTAG[ch.tagName.toLowerCase()];
    if(k)o[k]=_is(ch.textContent);}return o;
}
function _collectWeeks(root){
  let o=Array.from(root.children).filter(c=>_WKTAG.has(c.tagName.toLowerCase()));
  if(o.length)return o;
  if(_WKTAG.has(root.tagName.toLowerCase()))return[root];
  for(const ch of root.children){
    const gc=Array.from(ch.children).filter(c=>_WKTAG.has(c.tagName.toLowerCase()));
    if(gc.length)return gc;
  }
  return Array.from(root.children).filter(c=>_fc(c,"SKILL","SKILLS"));
}
function _parseWeekElem(e){
  const week=_is(e.getAttribute("id")||e.getAttribute("week"))
    ||_is(_tx(_fc(e,"WEEKID","WEEKNO","WEEKNUMBER","WEEK")))||0;
  const sc=_fc(e,"SKILL","SKILLS");
  const skills=_parseSkBlock(sc||e);
  if(!Object.keys(skills).length)return null;
  const scCont=_fc(e,"SKILLUP","SKILLSCHANGE","SKILLCHANGE","CHANGE","CHANGES","DELTA");
  const skillsChange={};
  if(scCont)for(const ch of scCont.children){
    const k=_SKTAG[ch.tagName.toLowerCase()];
    if(k){const v=_is(ch.textContent);if(v!==0)skillsChange[k]=v;}
  }
  const age=_is(_tx(_fc(e,"AGE","ALTER","EDAD")),21);
  const vE=_fc(e,"VALUE","PLAYERVALUE","PLAYVALUE","WERT","VALEUR","WARTOSC");
  let vR=vE?_is(_tx(vE)):0;
  if(!vR)vR=_is(e.getAttribute("value"),0);
  let trained=null,kind="individual",intensity=100;
  const tr=_fc(e,"TRAINING","TRAININGTYPE");
  if(tr){
    const rt=(tr.getAttribute("type")||"").toLowerCase().trim();
    const rk=(tr.getAttribute("kind")||"individual").toLowerCase();
    intensity=_is(tr.getAttribute("intensity"),100);
    trained=_TRTAG[rt]||null;
    kind=rk.includes("indiv")?"individual":"general";
    if(!trained){const nE=_fc(tr,"NAME");if(nE)trained=_TRTAG[_tx(nE).toLowerCase()]||null;}
    if(!trained&&tr.textContent)trained=_TRTAG[tr.textContent.toLowerCase().trim()]||null;
  }
  const tE=_fc(e,"TYPETRAINING","TRAINTYPE","TYPE");
  if(tE&&!trained){const nE=_fc(tE,"NAME");trained=_TRTAG[_tx(nE||tE).toLowerCase()]||null;}
  const kE=_fc(e,"KINDTRAINING","KIND","TRAINMODE","TRAININGKIND");
  if(kE){const nE=_fc(kE,"NAME");kind=_tx(nE||kE).toLowerCase().includes("indiv")?"individual":"general";}
  const iE=_fc(e,"INTENSITY","INTENSITAET");
  if(iE&&intensity===100)intensity=_is(_tx(iE),100);
  const jE=_fc(e,"INJURY","VERLETZUNG","BLESSURE");
  let severe=false;
  if(jE){const sr=(jE.getAttribute("severe")||jE.getAttribute("schwer")||"0").toLowerCase().trim();
    severe=["1","true","yes","ja"].includes(sr);}
  return{
    week,skills,skillsChange,age,
    playerValue:vR?{value:vR}:{},
    type:trained?{name:trained}:{},
    kind:{name:kind},
    intensity,
    injury:{severe},
  };
}
function parseTrainingXml(xmlText){
  const doc=new DOMParser().parseFromString(xmlText.trim(),"text/xml");
  const perr=doc.querySelector("parsererror");
  if(perr)throw new Error("XML parse error: "+perr.textContent.slice(0,180));
  const root=doc.documentElement;
  const we=_collectWeeks(root);
  if(!we.length)throw new Error("No recognisable week/training records. Expected <WEEK>, <TRAINING>, or similar.");
  const recs=[];
  for(const el of we){const r=_parseWeekElem(el);if(r)recs.push(r);}
  if(!recs.length)throw new Error("XML parsed but no usable records (missing skill data?).");
  recs.sort((a,b)=>(a.week||0)-(b.week||0));
  return recs;
}
function detectPlayerMeta(xmlText){
  const meta={};
  try{
    const doc=new DOMParser().parseFromString(xmlText.trim(),"text/xml");
    if(doc.querySelector("parsererror"))return meta;
    const root=doc.documentElement;
    for(const a of["playerid","playerID","player_id","id"]){
      const v=root.getAttribute(a);if(v){meta.player_id=_is(v);break;}
    }
    const pE=_fc(root,"PLAYERID","PLAYER_ID");
    if(pE&&!meta.player_id)meta.player_id=_is(_tx(pE));
    const nE=_fc(root,"PLAYERNAME","NAME","SURNAME","LASTNAME")||_fc(root,"PLAYER");
    if(nE){const sE=_fc(nE,"SURNAME","LAST","LASTNAME");meta.name=_tx(sE||nE);}
  }catch{}
  return meta;
}
function parseTrainingData(text){
  text=(text||"").trim();
  if(!text)throw new Error("Input is empty.");
  if(text.startsWith("{")||text.startsWith("[")){
    let data;try{data=JSON.parse(text);}catch(ex){throw new Error("JSON parse error: "+ex.message);}
    if(typeof data==="object"&&!Array.isArray(data)){
      const keys=["reports","training","history","weeks","list","items","data","trainings","records"];
      let found=false;
      for(const k of keys)if(Array.isArray(data[k])){data=data[k];found=true;break;}
      if(!found){
        if("skills" in data)data=[data];
        else throw new Error('JSON object has no recognisable list key (expected "reports", "training", "history", ...).');
      }
    }
    if(!Array.isArray(data))throw new Error("Expected a JSON array of training records.");
    if(!data.length)throw new Error("JSON array is empty.");
    data.sort((a,b)=>(a.week||0)-(b.week||0));
    return data;
  }
  return parseTrainingXml(text);
}

// ─── Mikoos Subskill Estimator ─────────────────────────────────────────────
// Exact JS port of mikooss_estimate_subskill from subskill.py (lines 155–322).
// Backs out a uniform subskill estimate from player value via binary search
// over the value formula. v7-only: no per-skill forward simulation (the
// desktop calibration tool does that). This anchors the bundle and makes
// the planner immediately useful instead of defaulting subs to 25%.
const _MK_TM=1.088,_MK_EM=1.252,_MK_BV=1588.0,_MK_FM=1/40,_MK_SB=216.4,_MK_SE=1.511;
const _MK_TBL=(()=>{
  const bv=[0.0,_MK_BV];for(let i=0;i<18;i++)bv.push(bv[bv.length-1]*_MK_TM);
  const st=[0.0,_MK_BV];for(let i=0;i<18;i++)st.push(st[st.length-1]+bv[i+2]);return st;
})();
function _mkSk(lf,isKp){
  lf=Math.min(lf,18.0);const fl=Math.floor(lf),off=lf-fl,fl1=Math.min(fl+1,18);
  const v=(_MK_TBL[fl]+(_MK_TBL[fl1]-_MK_TBL[fl])*off)*Math.pow(_MK_EM,lf);
  return isKp?v*4.0:v;
}
function _mkSt(lf){return lf*_MK_SB*Math.pow(_MK_SE,lf);}
const _MK_ORDER=["keeper","pace","defending","technique","playmaking","passing","striker"];
function _mkTotal(skills,bonus,formType){
  const form=skills.form??14,stam=skills.stamina??0;
  let v=_mkSt(stam+bonus);
  for(let i=0;i<_MK_ORDER.length;i++){
    const sk=_MK_ORDER[i];const lv=Math.min((skills[sk]??0)+bonus,18.0);
    v+=_mkSk(lv,i===0);
  }
  let nf;
  if(formType==="min")nf=form;
  else if(formType==="max")nf=form+1;
  else nf=form+bonus;
  if(nf<18.0)v*=1.0-(18.0-nf)*_MK_FM;
  return v;
}
function _mkBS(skills,realVal,formType){
  let lo=0,hi=1000;
  while(lo<=hi){
    const mid=(lo+hi)>>1;const v=_mkTotal(skills,mid/1000.0,formType);
    if(v<=realVal)lo=mid+1;else hi=mid-1;
  }
  return Math.min(lo,1000);
}
// Returns {expected, lo, hi, valueMin, valueMax, inRange}
// Subskill values are 0–1 (display-level fraction). Multiply by 100 for editor %.
function mikoosEstimateSubskill(skills,form,realValue){
  if(!realValue||realValue<=0)return null;
  const skf={...skills,form:form??14};
  const vMin=Math.round(_mkTotal(skf,0.0,"dynamic"));
  const vMax=Math.round(_mkTotal(skf,1.0,"dynamic"));
  const inRange=realValue>=vMin&&realValue<=vMax;
  const avgN=_mkBS(skf,realValue,"dynamic");
  const avgL=_mkBS(skf,realValue,"max");  // lo bound (more form penalty)
  const avgH=_mkBS(skf,realValue,"min");  // hi bound (less form penalty)
  return{
    expected:avgN/1000.0,
    lo:avgL/1000.0,
    hi:avgH/1000.0,
    valueMin:vMin,valueMax:vMax,inRange,
  };
}

// ─── Per-Skill Forward Simulator ──────────────────────────────────────────
// Faithful JS port of subskill.py PlayerTracker (April 2026 model, v13).
// Walks the training history forward from the first record, accumulating
// integer DB per skill, handling pops, formation training, fractional XP
// buffering, and stamina's fixed-rate exception. Returns per-skill subskills
// at the LATEST report — far better than uniform Mikoos when history is
// available.
//
// Sources: constants.py v11, training_week.py v2, subskill.py v13, talent.py v24.
// ──────────────────────────────────────────────────────────────────────────

// Constants (constants.py)
const _LEVELS_STD=18,_LEVELS_STAM=11;
const _DB_PER_LV=100/18,_DB_PER_STAM=100/11;
const _GT_RATE=15,_COACH_DB=93;
const _B_INT={pace:99,striker:90,technique:82,defending:82,playmaking:75,passing:75,keeper:75,stamina:null};
const _STAM_THR=80; // _B_NORM retired in v14 (normaliser folded into _pdc)
// v14: the v25 product-slope constants (_THR_BASE, _PROD_SLOPE*, _AGE_OFF,
// _AGE_PIVOT) are removed — the coupled model above is the only engine.
const _FORM_CODE_TO_SK={0:"keeper",1:"defending",2:"playmaking",3:"striker"};
const _GT_THR=93,_W_CL_OFF=93,_W_CL_FRI=70,_W_NT_OFF=70;
// Value formula — Mikoos-faithful port (constants.py v9: corrected
// cumulative table + VALUE_FORM_PENALTY 1/40 → 1/39). Replaces the old
// exponential approximation (11000·CM^L), which was calibrated against the
// pre-fix desktop table and ran ~8% hot at mid/high levels.
const _VAL_BASE=1588.0,_VAL_TM=1.088,_VAL_LM=1.252;
const _VAL_KP_W=4.0,_VAL_FORM_PEN=1/39;
const _VAL_STAM_BASE=216.4,_VAL_STAM_MULT=1.511;
// Cumulative skill-cost table (build_skill_value_table, n_levels=21):
//   base_values[0]=0, [1]=BASE, [i]=[i−1]·TM;  skill_table[i]=[i−1]+base_values[i]
const _VAL_TBL=(()=>{
  const n=21;
  const bv=[0.0,_VAL_BASE];
  for(let i=2;i<=n;i++)bv.push(bv[i-1]*_VAL_TM);
  const st=[0.0,_VAL_BASE];
  for(let i=2;i<n;i++)st.push(st[i-1]+bv[i]);
  return st;
})();

// DB geometry (subskill.py)
function _dbFloor(lv,isStam){const d=isStam?11:18;return Math.ceil(lv*100/d);}
function _dbThresh(lv,isStam){return _dbFloor(lv+1,isStam)-_dbFloor(lv,isStam);}

// Talent eff (constants.py)
function _talEffSenior(td){return 40.0+60.0*(td/100.0);}

// Canonical pop threshold — RAW (talent-free), coupled model. Delegates to
// the shared per-DB sum so planner and tracker/estimator are one engine.
function _canonThr(skill,level,age){
  if(skill==="stamina")return _STAM_THR;
  return _dtRaw(skill,level,age);
}

// DB gain per week for one skill
// v10: multiplied by _COACH_DB/100 to match the planner's XP path
// (_XD = round(_K2*_K1/100)). Previously omitted the coach_db factor,
// effectively running the simulator at coach=100 while the rest of
// the engine ran at coach=_K1. Mirrors desktop subskill v13 fix.
function _dbGainPerWeek(td,skill,level,age,intensity,coachEff){
  if(skill==="stamina")return 0.0;
  if(level>=_LEVELS_STD)return 0.0;
  const thr=_canonThr(skill,level,age);
  if(thr<=0||thr===Infinity)return 0.0;
  const eff=_talEffSenior(td);
  return _DB_PER_LV*intensity*coachEff*(_COACH_DB/100.0)*(eff/100.0)/thr;
}

// Geston intensity estimators
function _gWeightedMin(co,cf,no){
  return co*_W_CL_OFF/_GT_THR+cf*_W_CL_FRI/_GT_THR+no*_W_NT_OFF/_GT_THR;
}
function _advIntensity(co,cf,no){
  const ws=_gWeightedMin(co,cf,no);
  const m1=Math.min(ws,90),m2=Math.max(0.0,Math.min(ws-90,90));
  const t1=(m1*_GT_THR/100)/90,t2=(m2*(100-_GT_THR)/100)/90;
  return Math.round(10000*((t1+t2)/2+0.5))/100;
}
function _formIntensity(co,cf,no){
  const ws=_gWeightedMin(co,cf,no);
  const m1=Math.min(ws,90),m2=Math.max(0.0,Math.min(ws-90,90));
  const t1=(m1*_GT_THR/100)/90,t2=(m2*(100-_GT_THR)/100)/90;
  return Math.round(10000*(t1+t2))/100;
}

// Decode one API record into a TrainingWeek-equivalent object
function _parseRecord(rec){
  const kindName=(rec.kind||{}).name||"";
  const trainedSkill=kindName==="individual"?((rec.type||{}).name||null):null;
  const isFormation=kindName==="formation";
  let formationSkill=null,advInt=0.0,fInt=0.0;
  if(isFormation){
    const code=(rec.formation||{}).code;
    if(code!=null)formationSkill=_FORM_CODE_TO_SK[code]||null;
    const g=rec.games||{};
    const co=g.minutesOfficial||0,cf=g.minutesFriendly||0,no=g.minutesNtOfficial||g.minutesNational||0;
    advInt=_advIntensity(co,cf,no);
    fInt=_formIntensity(co,cf,no);
  }
  const skills=rec.skills||{};
  return{
    week:rec.week||0,
    age:parseInt(rec.age??21,10),
    intensity:rec.intensity||0,
    trainedSkill,isFormation,formationSkill,
    advancedIntensity:advInt,
    formationIntensity:fInt,
    severeInjury:(rec.injury||{}).severe===true,
    skills:{...skills},
    skillsChange:{...(rec.skillsChange||{})},
    form:skills.form??14,
    value:(rec.playerValue||{}).value??null,
  };
}

// Infer formation fallback from a history (most-common formation.code)
function _inferFormationSkill(history){
  const cnt={};
  for(const r of history){
    const c=(r.formation||{}).code;
    if(c!=null)cnt[c]=(cnt[c]||0)+1;
  }
  let best=null,bestN=0;
  for(const k in cnt)if(cnt[k]>bestN){best=k;bestN=cnt[k];}
  return best!=null?_FORM_CODE_TO_SK[best]||null:null;
}

// In-game value formula — desktop skill_value_at / stamina_value_at port.
//   outfield/keeper: interp(skill_table[L], skill_table[L+1], f) · LM^(L+f)
//                    keeper × 4 for all players
//   stamina:         lb · 216.4 · 1.511^lb   (lb = level + sub, uncapped)
function _skillValue(skill,level,sub){
  if(sub==null)sub=0;
  if(skill==="stamina"){
    const lb=level+sub;
    return lb*_VAL_STAM_BASE*Math.pow(_VAL_STAM_MULT,lb);
  }
  const L=Math.max(0,Math.min(level,_LEVELS_STD));
  const f=Math.max(0.0,Math.min(1.0,sub));
  let interp;
  if(L+1>=_VAL_TBL.length)interp=_VAL_TBL[_VAL_TBL.length-1];
  else interp=_VAL_TBL[L]+(_VAL_TBL[L+1]-_VAL_TBL[L])*f;
  let v=interp*Math.pow(_VAL_LM,L+f);
  if(skill==="keeper")v*=_VAL_KP_W;
  return v;
}
function _computeValue(skills,form,subs){
  if(!subs)subs={};
  const allSk=["pace","technique","passing","defending","playmaking","striker","keeper","stamina"];
  let tot=0;
  for(const sk of allSk)tot+=_skillValue(sk,skills[sk]??0,subs[sk]??0.0);
  return tot*(1.0-(18-form)*_VAL_FORM_PEN);
}

// Per-skill state with fractional XP buffer
function _makeState(skill,level,dbAccum){
  return{skill,level,dbAccum:dbAccum|0,gainBuf:0.0,popsSeen:0,weeksAtLv:0};
}
function _stateThreshold(s){return _dbThresh(s.level,s.skill==="stamina");}
function _stateSubskill(s){
  const max=s.skill==="stamina"?_LEVELS_STAM:_LEVELS_STD;
  if(s.level>=max)return 0.0;
  const t=_stateThreshold(s);
  if(t<=0)return 0.0;
  // v8.4.1: include fractional gain buffer so accumulated GT is visible
  // before it crosses an integer DB boundary. Matches user mental model:
  // "he got 3 GT after the pop" should show as ~3*0.15/threshold, not 0.
  return Math.min(1.0,(s.dbAccum+(s.gainBuf||0))/t);
}
function _stateAddGain(s,gain){
  s.gainBuf+=gain;const earned=Math.floor(s.gainBuf);s.gainBuf-=earned;return earned;
}

// Compute DB gain for one skill in one week, given context
function _weekGain(state,tw,td,coachEff,formSk){
  const sk=state.skill,level=state.level,age=tw.age;
  const max=sk==="stamina"?_LEVELS_STAM:_LEVELS_STD;
  if(level>=max)return 0.0;
  if(sk==="stamina")return _DB_PER_STAM/52.0; // fixed: ~1 level/season
  const gtFactor=_GT_RATE/100.0; // 0.15
  let effInt;
  if(sk===tw.trainedSkill){
    effInt=tw.intensity;
  }else if(formSk!=null){
    if(tw.formationIntensity===0)return 0.0; // formation + no game → 0 XP
    const gtInt=tw.advancedIntensity>0?tw.advancedIntensity:96.0;
    const fInt=tw.formationIntensity;
    if(sk===formSk)effInt=(gtInt+fInt)*gtFactor;
    else effInt=gtInt*gtFactor;
  }else{
    effInt=tw.intensity*gtFactor;
  }
  return _dbGainPerWeek(td,sk,level,age,effInt,coachEff);
}

// Initialise per-skill states from a Mikoos uniform anchor
function _initStates(skills,form,realValue){
  // Uniform subskill from Mikoos (or 0.5 fallback if out of range)
  let s=0.5;
  if(realValue&&realValue>0){
    const est=mikoosEstimateSubskill(skills,form,realValue);
    if(est&&est.inRange)s=est.expected;
  }
  const states={};
  const allSk=["pace","technique","passing","defending","playmaking","striker","keeper","stamina"];
  for(const sk of allSk){
    const isStam=sk==="stamina";
    const lv=skills[sk]??0;
    const max=isStam?_LEVELS_STAM:_LEVELS_STD;
    let dbInt=0;
    if(lv<max){
      const thr=_dbThresh(lv,isStam);
      dbInt=Math.max(0,Math.min(thr-1,Math.round(s*thr)));
    }
    states[sk]=_makeState(sk,lv,dbInt);
  }
  return{states,uniformAnchor:s};
}

// Process one week's update on the states
function _updateStates(states,tw,td,coachEff,formationFallback){
  if(tw.severeInjury)return; // no XP this week
  const formSk=tw.isFormation?(tw.formationSkill||formationFallback):null;
  for(const sk in states){
    const state=states[sk];
    const newLevel=tw.skills[sk]??state.level;
    const popped=(tw.skillsChange[sk]||0)>0||newLevel>state.level;
    const gain=_weekGain(state,tw,td,coachEff,formSk);
    if(popped){
      const earned=_stateAddGain(state,gain);
      const totalAccum=state.dbAccum+earned;
      const thresh=_stateThreshold(state);
      const carry=Math.max(0,totalAccum-thresh);
      state.level=newLevel;
      const max=sk==="stamina"?_LEVELS_STAM:_LEVELS_STD;
      state.dbAccum=newLevel>=max?0:carry;
      state.gainBuf=0.0; // fractional XP doesn't carry across levels
      state.popsSeen+=1;
      state.weeksAtLv=0;
    }else{
      const earned=_stateAddGain(state,gain);
      state.dbAccum=Math.min(state.dbAccum+earned,_stateThreshold(state)-1);
      state.weeksAtLv+=1;
    }
  }
}

// Top-level driver: full forward simulation over a sorted history
// Returns per-skill subskills (0–1 fractions) at the latest report.
// `td` is talent_db (0–100, NOT YS talent). Pass NaN to use td=70 default.
function simulateSubskills(reports,td,coachEff){
  if(!reports||reports.length===0)return null;
  if(coachEff==null)coachEff=1.0;
  if(!isFinite(td))td=70.0;
  // Sort ascending just to be safe
  const hist=[...reports].sort((a,b)=>(a.week||0)-(b.week||0));
  // First report = anchor
  const first=hist[0];
  const anchorSkills=first.skills||{};
  const anchorForm=anchorSkills.form??14;
  const anchorValue=(first.playerValue||{}).value;
  const{states,uniformAnchor}=_initStates(anchorSkills,anchorForm,anchorValue);
  // Formation fallback from history
  const formationFallback=_inferFormationSkill(hist);
  // Walk forward from the SECOND report (first is anchor, no update)
  for(let i=1;i<hist.length;i++){
    const tw=_parseRecord(hist[i]);
    _updateStates(states,tw,td,coachEff,formationFallback);
  }
  // Extract subskills (0–1 fractions)
  const subs={};
  for(const sk in states)subs[sk]=_stateSubskill(states[sk]);
  // Last report's value-formula residual (sanity, optional consumer)
  const last=hist[hist.length-1];
  const lastSkills=last.skills||{};
  const lastForm=lastSkills.form??14;
  const lastValue=(last.playerValue||{}).value;
  let valueResidualPct=null;
  if(lastValue&&lastValue>0){
    const pred=_computeValue(lastSkills,lastForm,subs);
    valueResidualPct=(pred-lastValue)/lastValue*100;
  }
  return{
    subskills:subs,
    uniformAnchor,
    valueResidualPct,
    weeksProcessed:hist.length,
    formationFallback,
    talentUsed:td,
  };
}

// ─── Calibration Bundle Builder ───────────────────────────────────────────
function buildBundle(ctx){
  const{reports,rawText,playerMeta,skills,subs,age,ysTalent,td,pos,weeks,ssw,playerName,plans,prior}=ctx;
  const subsEst={};for(const sk of OS)subsEst[sk]=(subs[sk]??25)/100;
  const lastReport=reports&&reports.length?reports[reports.length-1]:null;
  return{
    format_version:"1.1",
    // Defensively pinned at v8.4.6 — the backend RLS policy on the
    // calibration corpus may still gate on this exact string. v9 ships
    // the v25 threshold formula change but does not retouch this pin
    // (per the v8.4.7 release note). Move forward when the corpus is
    // confirmed healthy on a free-form source string.
    source:"sokker-training-planner-online-v8.4.6",
    exported_at:new Date().toISOString(),
    player:{
      player_id:playerMeta?.player_id??null,
      name:playerMeta?.name||playerName||null,
    },
    user_snapshot:{
      current_skills:{...skills},
      subskills_estimate:subsEst,
      age_current:age,
      ys_talent_user:parseFloat(ysTalent)||null,
      talent_db_estimate:td,
      position_assumed:pos,
      horizon_weeks:weeks,
      start_season_week:ssw,
      coach_value_assumed:_COACH_DB,  // live engine constant (93 since v14, was 91 in v10–v13)
      // v14: engine/estimator provenance — rides inside user_snapshot so the
      // pinned source string (RLS gate) stays untouched. The desktop side
      // reads these to know which producer generated talent_db_estimate.
      engine:`coupled-K16-coach${_COACH_LIVE}`,   // v19: coach-parametrized
      talent_estimator:"fusion-v2",                 // v19: IVW fusion port
      coach_db:_COACH_LIVE,
      external_prior:prior||null,               // v20: [loDb,hiDb] | null
      latest_report_week:lastReport?.week??null,
    },
    reports:reports||[],
    plans:plans||{},
    raw_history:rawText||null,
  };
}
function downloadBundle(bundle,filename){
  const blob=new Blob([JSON.stringify(bundle,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},100);
}

// v8.3: Extract a portable plan from a sim result.
// Schedule is a flat array of skill names per week — same shape regardless
// of whether the sim was a regular strategy or the sale optimizer.
function extractPlan(result,strategyKey,opts){
  if(!result||!result.log)return null;
  const schedule=result.log.map(w=>w.trained);
  return{
    strategy:strategyKey,
    schedule,
    horizon_weeks:opts?.weeks??schedule.length,
    position:opts?.pos??null,
    start_season_week:opts?.ssw??null,
    is_sale_optimizer:!!result.isSale,
  };
}

// ─── Corpus Submission (Supabase) ──────────────────────────────────────────
// Fire-and-forget POSTs to a Supabase project with row-level security set
// to allow anonymous inserts only. Failures are logged to console and never
// surfaced to the user — the corpus is best-effort, not a critical path.
const _SB_URL="https://ahyxijjqzxnypbmavgrr.supabase.co";
const _SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoeXhpampxenhueXBibWF2Z3JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNDMzMDUsImV4cCI6MjA5MjcxOTMwNX0.00oIF5S5u8LkP_NMOvBpbX_iNHJQeGbPFRl2ltc58YI";
const _SB_OPT_OUT_KEY="sokker_corpus_opt_out_v1"; // localStorage key

// SHA-256 of a stable identity string → hex digest. Used to dedupe so the
// same player loaded twice in the same state doesn't fill the corpus.
async function _sha256Hex(str){
  const buf=new TextEncoder().encode(str);
  const hash=await crypto.subtle.digest("SHA-256",buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function submitBundleToCorpus(bundle){
  try{
    const reportsLen=Array.isArray(bundle.reports)?bundle.reports.length:0;
    const lastWeek=reportsLen>0?bundle.reports[reportsLen-1].week:null;
    const lastSkills=reportsLen>0?bundle.reports[reportsLen-1].skills||{}:{};
    // Identity key: PID first (definitive), else last week + skill snapshot
    // (very unlikely to collide across different players).
    const skillSig=["pace","technique","passing","defending","playmaking","striker","keeper","stamina"]
      .map(k=>lastSkills[k]??0).join(",");
    const idStr=`${bundle.player?.player_id||"anon"}|${lastWeek||"none"}|${reportsLen}|${skillSig}`;
    const payloadHash=await _sha256Hex(idStr);
    const row={
      player_id:bundle.player?.player_id||null,
      player_name:bundle.player?.name||null,
      // v8.4.6: wire format pinned to legacy values that the Supabase RLS
      // policy accepts. The local bundle download keeps the live values
      // (format_version 1.1 with `plans`, source string with current app
      // version) for desktop calibration tooling — see buildBundle. The
      // two formats are intentionally decoupled so future app version
      // bumps don't break the corpus contract. If the RLS policy is later
      // relaxed (see v8.4.6 release notes), these can be dropped and the
      // bundle's own values used directly.
      format_version:"1.0",
      source:"sokker-training-planner-online-v8",
      user_snapshot:bundle.user_snapshot||{},
      reports:bundle.reports||[],
      raw_history:bundle.raw_history||null,
      payload_hash:payloadHash,
      user_agent:typeof navigator!=="undefined"?navigator.userAgent:null,
    };
    const res=await fetch(`${_SB_URL}/rest/v1/submissions`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "apikey":_SB_KEY,
        "Authorization":`Bearer ${_SB_KEY}`,
        "Prefer":"return=minimal",
      },
      body:JSON.stringify(row),
    });
    if(res.ok)return{ok:true};
    if(res.status===409)return{ok:true,duplicate:true}; // unique-hash collision = already shared
    const txt=await res.text().catch(()=>"");
    console.warn("[corpus] submission failed:",res.status,txt.slice(0,200));
    return{ok:false,status:res.status};
  }catch(ex){
    console.warn("[corpus] submission error:",ex?.message||ex);
    return{ok:false,error:ex?.message||"unknown"};
  }
}

async function recordOptOut(){
  try{
    await fetch(`${_SB_URL}/rest/v1/opt_outs`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "apikey":_SB_KEY,
        "Authorization":`Bearer ${_SB_KEY}`,
        "Prefer":"return=minimal",
      },
      body:JSON.stringify({}),
    });
  }catch{} // truly fire-and-forget; opt-out tracking failure is harmless
}

// ─── Paste Parser ──────────────────────────────────────────────────────────
const PL={forma:"form",formę:"form",formy:"form",kondycja:"stamina",kondycję:"stamina",
  kondycji:"stamina",szybkość:"pace",szybkości:"pace",technika:"technique",technikę:"technique",
  techniki:"technique",podania:"passing",podanie:"passing",podań:"passing",bramkarz:"keeper",
  bramkarza:"keeper",bramkarski:"keeper",obrońca:"defending",obrońcy:"defending",obrońcę:"defending",
  rozgrywający:"playmaking",rozgrywającego:"playmaking",strzelec:"striker",strzelca:"striker",
  dyscyplina:"tactdisc"};
function parsePaste(text){
  const r={name:"",age:null,value:null,form:null,skills:{},warnings:[]};
  const nm=text.match(/^(.+?),\s*wiek:\s*(\d+)/m);
  if(nm){r.name=nm[1].trim();r.age=parseInt(nm[2]);}
  else{const n2=text.trim().match(/^([A-ZŁŚŹŻĆĄĘÓŃ][^\n,]+)/);if(n2)r.name=n2[1].trim();r.warnings.push("Could not parse name/age");}
  const vm=text.match(/wartość\s*:?\s*([\d\s\u00a0]+)\s*zł/i);
  if(vm)r.value=parseInt(vm[1].replace(/[\s\u00a0]/g,""));
  const sr=/\[(\d+)\]\s+(\S+)/g;let m;
  while((m=sr.exec(text))!==null){const lv=parseInt(m[1]),w=m[2].toLowerCase().replace(/[.,;]/g,"");
    const sk=PL[w];if(sk==="form")r.form=lv;else if(sk==="tactdisc"){}
    else if(sk)r.skills[sk]=lv;else r.warnings.push(`Unknown: "${w}" [${lv}]`);}
  return r;
}

// ═══════════════════════════════════════════════════════════════════════════
// TALENT ESTIMATOR — JS port of talent.py v25 (May 2026, App v12)
//
// Walks training history per outfield skill, extracts gaps (closed pop-to-pop
// spans and the open in-progress span), inverts canonical_threshold to bound
// talent_db per gap, then intersects across skills with consensus filtering
// for outlier rejection.
//
// Symbols match talent.py v25 byte-for-byte for the math; v1 omits the
// soft-anchor partial-gap path (use_subskill=False) and prior-club training
// injection. Outputs rounded to 0.1 DB before scale conversion.
// ═══════════════════════════════════════════════════════════════════════════

// XP/week from intensity (constants.py xp_per_week, xp_gt_per_week)
function _xpPerWeek(intensity,coachDb){return Math.round(intensity*coachDb/100);}
function _xpGtPerWeek(intensity,coachDb){return Math.round(intensity*coachDb*15/10000);}

// Drop-eligibility (constants.py is_drop_eligible).
// pace drops from age 28; other outfield skills drop from age 30.
const _DROP_AGE_PACE=28,_DROP_AGE_OTHER=30;
function _dropEligible(skill,age){
  if(skill==="stamina")return false;
  const t=skill==="pace"?_DROP_AGE_PACE:_DROP_AGE_OTHER;
  return age>=t;
}

// Per-skill GT XP for one week (training_week.py TrainingWeek.gt_xp).
// Outfield players never receive keeper XP, even from GT — guard with isGk.
function _gtXp(tw,skill,coachDb,isGk){
  if(skill==="keeper"&&!isGk)return 0;
  if(tw.isFormation){
    if(tw.formationIntensity===0)return 0;
    const gt=_xpGtPerWeek(tw.advancedIntensity,coachDb);
    if(tw.formationSkill===skill){
      const ft=_xpGtPerWeek(tw.formationIntensity,coachDb);
      return gt+ft;
    }
    return gt;
  }
  return _xpGtPerWeek(tw.intensity,coachDb);
}

// (xp, kind) for one week's contribution to one skill.
// kind ∈ {'direct','formation','gt','zero'}. Matches talent.py
// _week_xp_contribution; the v23 fix means non-target skills on a formation
// week get 'gt', not 'formation' — so the [0D+...] pure-GT classifier works.
function _weekXpContribution(tw,skill,coachDb,isGk){
  if(tw.severeInjury)return[0,"zero"];
  if(!tw.isFormation&&tw.intensity===0)return[0,"zero"];
  if(tw.trainedSkill===skill){
    if(skill==="keeper"&&!isGk)return[0,"zero"];
    return[_xpPerWeek(tw.intensity,coachDb),"direct"];
  }
  if(tw.isFormation){
    if(tw.formationSkill===skill)return[_gtXp(tw,skill,coachDb,isGk),"formation"];
    return[_gtXp(tw,skill,coachDb,isGk),"gt"];
  }
  return[_gtXp(tw,skill,coachDb,isGk),"gt"];
}

// Build a closed gap from accumulated week records.
// Returns [gap, dropBad]. dropBad=true means any week was drop-eligible
// for this skill — caller must discard the gap and increment nDrop.
function _finaliseMixedGap(skill,levelBefore,weekStart,weekEnd,weekRecords,hasKnownStart){
  if(!weekRecords.length)return[null,true];
  const xps=weekRecords.map(w=>w.xp);
  const xpTotal=xps.reduce((a,b)=>a+b,0);
  const xpFirst=xps[0],xpLast=xps[xps.length-1];
  const agePop=weekRecords[weekRecords.length-1].age;
  const thr=_canonThr(skill,levelBefore,agePop);
  let dropBad=false;
  for(const w of weekRecords)if(_dropEligible(skill,w.age)){dropBad=true;break;}
  const directWeeks=weekRecords.filter(w=>w.kind==="direct").length;
  const formationWeeks=weekRecords.filter(w=>w.kind==="formation").length;
  const gtWeeks=weekRecords.filter(w=>w.kind==="gt").length;
  const gap={skill,levelBefore,weekStart,weekEnd,
    weeksElapsed:weekRecords.length,
    xpTotal,xpFirst,xpLast,thresholdRaw:thr,hasKnownStart,
    ageMid:agePop,directWeeks,formationWeeks,gtWeeks};
  return[gap,dropBad];
}

// Extract closed gaps for one skill (talent.py extract_mixed_gaps).
// A gap runs from (start-of-history | previous pop) → next pop. Zero-XP
// weeks are appended once a gap is open (they don't change xp_total but
// they DO change weeks_elapsed and feed drop-eligibility checks).
function _extractMixedGaps(history,skill,coachDb,isGk){
  const gaps=[];
  let nDrop=0,isFirst=true;
  let gapStartWeek=null,gapLevel=null,weekRecords=[];
  for(const rec of history){
    const tw=_parseRecord(rec);
    const currLv=tw.skills[skill]??0;
    const popped=(tw.skillsChange[skill]||0)>0;
    const[xp,kind]=_weekXpContribution(tw,skill,coachDb,isGk);
    if(gapStartWeek===null){
      if(xp===0&&!popped)continue;
      gapStartWeek=tw.week;
      gapLevel=currLv-(popped?1:0);
      weekRecords=[];
    }
    weekRecords.push({age:tw.age,xp,kind});
    if(popped){
      const hasKnownStart=!isFirst;
      const[gap,dropBad]=_finaliseMixedGap(skill,gapLevel,gapStartWeek,tw.week,weekRecords,hasKnownStart);
      if(dropBad)nDrop+=1;
      else if(gap)gaps.push(gap);
      gapStartWeek=tw.week;
      gapLevel=currLv;
      weekRecords=[];
      isFirst=false;
    }
  }
  return[gaps,nDrop];
}

// Extract the in-progress gap at end of history (talent.py extract_open_mixed_gap).
// hasHadPop=true (i.e. has_known_start) iff we observed any pop during scan.
// Zero-XP weeks are skipped entirely here — open-gap math doesn't need them.
function _extractOpenMixedGap(history,skill,coachDb,isGk){
  let hasHadPop=false,gapLevel=null,weekRecords=[];
  for(const rec of history){
    const tw=_parseRecord(rec);
    const currLv=tw.skills[skill]??0;
    const popped=(tw.skillsChange[skill]||0)>0;
    if(popped){hasHadPop=true;gapLevel=currLv;weekRecords=[];continue;}
    const[xp,kind]=_weekXpContribution(tw,skill,coachDb,isGk);
    if(xp===0)continue;
    if(gapLevel===null)gapLevel=currLv;
    weekRecords.push({age:tw.age,xp,kind});
  }
  if(!weekRecords.length||gapLevel===null)return null;
  const xps=weekRecords.map(w=>w.xp);
  const xpTotal=xps.reduce((a,b)=>a+b,0);
  const xpFirst=xps[0];
  const ageEnd=weekRecords[weekRecords.length-1].age;
  const thr=_canonThr(skill,gapLevel,ageEnd);
  const directWeeks=weekRecords.filter(w=>w.kind==="direct").length;
  const formationWeeks=weekRecords.filter(w=>w.kind==="formation").length;
  const gtWeeks=weekRecords.filter(w=>w.kind==="gt").length;
  return{skill,level:gapLevel,xpTotal,xpFirst,thresholdRaw:thr,
    hasKnownStart:hasHadPop,nWeeks:weekRecords.length,ageMid:ageEnd,
    directWeeks,formationWeeks,gtWeeks};
}

// eff → talent_db, bounds-aware (talent.py _eff_to_td).
// eff > 1.0 means "no constraint": hi-bound returns 100, lo-bound returns 1.
function _effToTd(eff,bound){
  if(eff<=1.0)return(eff-0.40)/0.60*100.0;
  return bound==="hi"?100.0:1.0;
}

// Closed-gap [td_lo, td_hi] (talent.py estimate_gap_bounds, use_subskill=False).
// Returns [null, null] for impossible/contaminated gaps (XP exceeds even
// minimum-talent threshold). Partial gaps (no known start) get td_lo=1.0.
function _estimateGapBounds(gap){
  if(gap.xpTotal<=0||!isFinite(gap.thresholdRaw))return[null,null];
  const thr=gap.thresholdRaw;
  // Upper bound — denom = total - last (carry-out bounded by xp_last)
  const denomHi=gap.xpTotal-gap.xpLast;
  let tdHi;
  if(denomHi<=0)tdHi=100.0;
  else{
    const effHi=thr/denomHi;
    if(effHi<0.40)return[null,null];
    tdHi=_effToTd(effHi,"hi");
  }
  // Lower bound — known-start: denom = total + first (carry-in bounded
  // by xp_first); partial: no informative lower bound.
  let tdLo;
  if(gap.hasKnownStart){
    const denomLo=gap.xpTotal+gap.xpFirst;
    const effLo=thr/denomLo;
    if(effLo<0.40)return[null,null];
    tdLo=_effToTd(effLo,"lo");
  }else tdLo=1.0;
  return[tdLo,tdHi];
}

// Open-gap upper bound (talent.py no_pop_upper_bound, use_subskill=False).
// Returns null if contradictory (player should have popped even at min talent).
function _noPopUpperBound(og){
  if(og.xpTotal<=0)return 100.0;
  const thr=og.thresholdRaw;
  // v17 (F3): denom = xpTotal ONLY, known start or not. Soundness: no pop
  // ⇒ carry + eff·xpTotal < thr for the TRUE carry ∈ [0, eff·xpFirst];
  // only carry=0 gives a bound valid in all worlds: eff < thr/xpTotal.
  // The previous known-start denom (xpTotal+xpFirst) assumed MAXIMAL
  // carry-in — the closed-gap lower-bound logic applied where it flips
  // from conservative to aggressive. It manufactured hard caps from soft
  // no-pop evidence (Højland 40124291: pace L10 "<71" vs real ~93).
  // Desktop talent.py has the same defect (docstring proof only covers
  // the xpTotal case); desktop fix ships separately.
  const denom=og.xpTotal;
  if(thr<=0)return 100.0;
  const eff=thr/denom;
  if(eff>1.0)return 100.0;
  if(eff<0.40)return null;
  return _effToTd(eff,"hi");
}

// Composition tag [xD+yG+zF] — used to identify pure-GT gaps in confidence.
function _compositionTag(g){return`[${g.directWeeks}D+${g.gtWeeks}G+${g.formationWeeks}F]`;}

// YS-standard scale conversion (talent.py cs_ys_from_td).
// eff_ys = 10 + 90·(td/100); CS_ys = 300 / eff_ys.
// DB100 → 3.00, DB50 → 5.45, DB0 → 30. This is the harsher YS scale (the
// inverse of _fromYS already used by the input), NOT the kinder Mikoos
// senior-eff-anchored scale. Per design: show users the worse-looking number.
function _csYsFromTd(td){
  if(!isFinite(td))return NaN;
  const eff=10.0+90.0*td/100.0;
  if(eff<=0)return NaN;
  return 300.0/eff;
}

// is_gk auto-detect (subskill.py / tab_player heuristic):
// keeper > max(outfield_skills). Conservative — outfield with anomalously
// high keeper rating still detects as GK, which is the safe direction
// (would only matter if the player had real keeper XP to invert).
function _detectIsGk(latestSkills){
  if(!latestSkills)return false;
  const kp=latestSkills.keeper??0;
  let maxOf=0;
  for(const sk of OS){const v=latestSkills[sk]??0;if(v>maxOf)maxOf=v;}
  return kp>maxOf;
}

// ─── Main estimator ──────────────────────────────────────────────────────
// Returns:
//   {td, tdLo, tdHi, confidence, nGaps, nGtGaps, nDirectGaps, nNoPopBounds,
//    nNoPopSkills, nExclDrop, nExclRange, excludedSkills, perGap, notes,
//    isGk, contradictory}
// confidence ∈ {'reliable','indicative','unreliable','no_data'}.
// td is point estimate (midpoint of consensus intersection); tdLo/tdHi
// are the intersection bounds. NaN throughout means no data / no estimate.
function estimateTalent(history,options){
  options=options||{};
  const coachDb=options.coachDb??_COACH_DB;
  const empty={td:NaN,tdLo:NaN,tdHi:NaN,confidence:"no_data",
    nGaps:0,nGtGaps:0,nDirectGaps:0,nNoPopBounds:0,nNoPopSkills:0,
    nExclDrop:0,nExclRange:0,excludedSkills:[],perGap:[],notes:["no history"],
    isGk:false,contradictory:false,balanceEvents:[]};
  if(!history||!history.length)return empty;
  // Sort ascending defensively (parser already does this, but cheap to repeat)
  const hist=[...history].sort((a,b)=>(a.week||0)-(b.week||0));
  const latest=hist[hist.length-1]||{};
  const latestSkills=latest.skills||{};
  const latestAge=parseInt(latest.age||21,10);
  const isGk=options.isGk!=null?options.isGk:_detectIsGk(latestSkills);
  // Skip max-level skills — no further pops are possible
  const skillsToProcess=OS.filter(s=>(latestSkills[s]??0)<_LEVELS_STD).sort();

  const allLo=[],allHi=[],allPgIdx=[];
  const perGapLog=[];
  const balanceEvents=[]; // v14: feed for the balance-v1 estimator
  let gtGapCount=0,directGapCount=0;
  let nExclDrop=0,nExclRange=0,nNoPopSkills=0;
  // Per-skill known-start ranges (for consensus intersection).
  // Only known-start gaps with informative lo>1 contribute to consensus —
  // partial gaps' lo=1 would dominate the max() and break the algorithm.
  const skillKsRanges={};

  function processGaps(gaps,skill){
    for(const g of gaps){
      const isPureGt=(g.directWeeks===0);
      const[lo,hi]=_estimateGapBounds(g);
      if(lo===null){nExclRange+=1;continue;}
      const pgIdx=perGapLog.length;
      allLo.push(lo);allHi.push(hi);allPgIdx.push(pgIdx);
      // v14: known-start gaps double as balance events — [lo,hi] is the
      // td-consistent interval, so at candidate td: td<lo ⇒ under (model
      // late — raise talent), td>hi ⇒ over. Level keys the band weight.
      if(g.hasKnownStart)balanceEvents.push({lo,hi,level:g.levelBefore,skill:g.skill});
      if(g.hasKnownStart){
        if(!(skill in skillKsRanges))skillKsRanges[skill]={los:[],his:[]};
        if(lo>1.0)skillKsRanges[skill].los.push(lo);
        if(hi<100.0)skillKsRanges[skill].his.push(hi);
      }
      const loStr=lo>1?`${Math.round(lo)}`:"?";
      const hiStr=hi<100?`${Math.round(hi)}`:"100";
      perGapLog.push(["Gap",g.skill,g.levelBefore,`${_compositionTag(g)} ${loStr}-${hiStr}`]);
      if(isPureGt)gtGapCount+=1;else directGapCount+=1;
    }
  }

  // Closed gaps per skill
  for(const skill of skillsToProcess){
    const[gaps,nd]=_extractMixedGaps(hist,skill,coachDb,isGk);
    nExclDrop+=nd;
    if(!gaps.length){nNoPopSkills+=1;continue;}
    processGaps(gaps,skill);
  }

  // Open-gap no-pop upper bounds
  const nopopHiCaps=[];
  let nNoPopBounds=0;
  for(const skill of skillsToProcess){
    const og=_extractOpenMixedGap(hist,skill,coachDb,isGk);
    if(og===null)continue;
    if(og.level>=_LEVELS_STD)continue;
    if(_dropEligible(skill,latestAge))continue;
    const ub=_noPopUpperBound(og);
    if(ub===null)continue;
    if(ub>=100)continue;
    const pgIdx=perGapLog.length;
    nopopHiCaps.push({ub,skill:og.skill,level:og.level,nWeeks:og.nWeeks,pgIdx});
    nNoPopBounds+=1;
    perGapLog.push(["OpenGap",og.skill,og.level,
      `${_compositionTag(og)} <${Math.round(ub)} (${og.nWeeks}w no pop)`]);
  }

  // Flat intersection (use_subskill=False → all bounds are hard)
  let loFinal=allLo.length?Math.max(...allLo):1.0;
  let hiFinal=allHi.length?Math.min(...allHi):100.0;
  for(const e of nopopHiCaps)hiFinal=Math.min(hiFinal,e.ub);
  hiFinal=Math.min(100.0,hiFinal);

  if(loFinal===1.0&&hiFinal===100.0){
    return{...empty,perGap:perGapLog,nNoPopSkills,nExclDrop,nExclRange,
      balanceEvents,
      isGk,notes:["Insufficient training history — more data needed"]};
  }

  const loFlat=loFinal,hiFlat=hiFinal;

  // Consensus intersection — per-skill outlier rejection.
  // Iteratively kick out the single skill whose removal opens the largest
  // gap toward overlap, until the remaining skills' KS ranges overlap.
  const consensusSkills={};
  for(const sk in skillKsRanges){
    const rng=skillKsRanges[sk];
    if(rng.los.length){
      consensusSkills[sk]=[Math.max(...rng.los),
        rng.his.length?Math.min(...rng.his):100.0];
    }
  }
  const excludedSkills=[];
  if(Object.keys(consensusSkills).length>=2){
    const active={...consensusSkills};
    while(Object.keys(active).length>1){
      const cLo=Math.max(...Object.values(active).map(r=>r[0]));
      const cHi=Math.min(...Object.values(active).map(r=>r[1]));
      if(cLo<=cHi)break;
      let bestSk=null,bestGap=Infinity;
      for(const sk in active){
        const remKeys=Object.keys(active).filter(k=>k!==sk);
        const rLo=Math.max(...remKeys.map(k=>active[k][0]));
        const rHi=Math.min(...remKeys.map(k=>active[k][1]));
        const g=rLo-rHi;
        if(g<bestGap){bestGap=g;bestSk=sk;}
      }
      excludedSkills.push(bestSk);
      delete active[bestSk];
    }
    if(Object.keys(active).length){
      loFinal=Math.max(...Object.values(active).map(r=>r[0]));
      hiFinal=Math.min(...Object.values(active).map(r=>r[1]));
      // Re-incorporate no-pop caps from non-excluded skills only
      const exclSet=new Set(excludedSkills);
      nNoPopBounds=0;
      for(const e of nopopHiCaps){
        if(exclSet.has(e.skill))continue;
        if(e.ub>=loFinal){
          hiFinal=Math.min(hiFinal,e.ub);
          nNoPopBounds+=1;
        }
      }
      hiFinal=Math.min(100.0,hiFinal);
    }
  }else if(Object.keys(consensusSkills).length===1){
    const sk=Object.keys(consensusSkills)[0];
    const[clo,chi]=consensusSkills[sk];
    loFinal=clo;hiFinal=chi;
    for(const e of nopopHiCaps){
      if(e.ub>=loFinal)hiFinal=Math.min(hiFinal,e.ub);
    }
    hiFinal=Math.min(100.0,hiFinal);
  }

  // Tag excluded skills' gaps in the log
  if(excludedSkills.length){
    const exclSet=new Set(excludedSkills);
    for(let i=0;i<perGapLog.length;i++){
      const[gtype,gskill,glv,gstr]=perGapLog[i];
      if(exclSet.has(gskill)&&!gstr.startsWith("REJECTED:")&&!gstr.startsWith("OUTLIER:")){
        perGapLog[i]=[gtype,gskill,glv,`OUTLIER:${gstr}`];
      }
    }
  }

  const contradictory=loFinal>hiFinal;
  let point;
  if(contradictory){
    // Fall back to mean of midpoints of bounded (non-? lo) gaps
    const mids=[];
    for(let i=0;i<allLo.length;i++){
      if(allLo[i]>1)mids.push((allLo[i]+allHi[i])/2);
    }
    point=mids.length?(mids.reduce((a,b)=>a+b,0)/mids.length):((loFinal+hiFinal)/2);
  }else point=(loFinal+hiFinal)/2;

  // Confidence — count informative gaps in the consensus set.
  // Pure-GT gap = composition starts with "[0D+" (no direct weeks).
  const exclSet2=new Set(excludedSkills);
  function isInformative(g){
    const[gtype,gskill,glv,gstr]=g;
    if(gtype!=="Gap")return false;
    if(exclSet2.has(gskill))return false;
    if(gstr.startsWith("REJECTED:")||gstr.startsWith("OUTLIER:"))return false;
    // Drop "?-N" lower-bound-only entries (partial gaps that survived bound
    // estimation but contribute no informative lower bound)
    const after=gstr.split(" ").slice(1).join(" ");
    if(!after)return false;
    return !after.split("-")[0].includes("?");
  }
  const consInfGt=perGapLog.filter(g=>isInformative(g)&&String(g[3]).indexOf("[0D+")!==-1).length;
  const consInfDir=perGapLog.filter(g=>isInformative(g)&&String(g[3]).indexOf("[0D+")===-1).length;
  let confidence;
  if(consInfGt>=2)confidence="reliable";
  else if(consInfGt>=1||consInfDir>=2)confidence="indicative";
  else if(consInfDir===1||nNoPopBounds>=1)confidence="unreliable";
  else confidence="no_data";

  const notes=[];
  if(contradictory)notes.push(`contradictory bounds (lo=${loFinal.toFixed(0)} > hi=${hiFinal.toFixed(0)}) — model/carry-in approximation error`);
  if(excludedSkills.length)notes.push(`consensus excluded: ${excludedSkills.join(", ")}`);
  if(loFlat!==loFinal||hiFlat!==hiFinal)notes.push(`flat intersection [${loFlat.toFixed(0)}-${hiFlat.toFixed(0)}]`+(loFlat>hiFlat?" ⚠":""));
  if(gtGapCount)notes.push(`${gtGapCount} pure-GT gap(s)`);
  if(directGapCount)notes.push(`${directGapCount} direct-containing gap(s)`);
  if(nNoPopBounds)notes.push(`${nNoPopBounds} no-pop bound(s)`);
  if(nExclDrop)notes.push(`${nExclDrop} drop-excluded gap(s) (pace>=28 / others>=30)`);

  const td=isFinite(point)?Math.round(point*10)/10:NaN;
  return{
    td,tdLo:Math.round(loFinal*10)/10,tdHi:Math.round(hiFinal*10)/10,
    confidence,nGaps:gtGapCount+directGapCount,
    nGtGaps:gtGapCount,nDirectGaps:directGapCount,
    nNoPopBounds,nNoPopSkills,nExclDrop,nExclRange,
    excludedSkills,perGap:perGapLog,notes,isGk,contradictory,
    balanceEvents,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TALENT BALANCE v1 — JS port of talent_balance.py (App v14, Jul 2026)
//
// Talent is the value where the over/under residual BALANCES — a regression,
// not a solver. Hybrid weighting: DIRECTION by pure event COUNT
// C(td) = n_under − n_over (monotone decreasing; counts can never invert);
// the confidence BAND is reliability-weighted (sign-symmetric, level-keyed
// _BAND_RMSE from talent_weighting v4).
//
// v1 event source (documented deviation from desktop): known-start closed
// gaps only. Each gap's td-consistent interval [lo,hi] from the v12 bound
// inversion classifies statically — td < lo ⇒ under, td > hi ⇒ over, inside
// ⇒ no event. No anchor-solved first pops (anchor_refiner v14 is not yet
// reference-validated and is deliberately not ported); range-excluded gaps
// stay excluded; partial gaps feed the gap band only, never direction.
// ═══════════════════════════════════════════════════════════════════════════
const _BAL_RMSE={pooled:0.232,"L0-5":0.313,"L6-8":0.255,"L9-11":0.173,"L12-14":0.153,"L15-17":0.143}; // coupled table
const _BAL_ACC_EXP=1.5;
const _BAL_MIN_SIGNAL=3;     // min classified events to attempt a balance
const _BAL_WIDE_BAND=8.0;    // band wider than this (DB) ⇒ flat
const _BAL_TOL=0.25,_BAL_MAX_IT=60;
const _BAL_SEARCH_MAX=130.0; // search past the cap → ceiling keeps a virtual point
const _BAL_CAP=100.0,_BAL_FLOOR=1.0;

function _balLvlBand(l){
  return l<=5?"L0-5":l<=8?"L6-8":l<=11?"L9-11":l<=14?"L12-14":"L15-17";
}
function _balBandWeight(level){
  const r=_BAL_RMSE[_balLvlBand(level)]||_BAL_RMSE.pooled;
  if(r<=0)return 1.0;
  return Math.pow(_BAL_RMSE.pooled/r,_BAL_ACC_EXP);
}

// One evaluation of the residual signal at candidate td (NetSample).
// sumWSq runs over the WHOLE event population (constant across td) so the
// noise floor matches the Python semantics, where every pop is classified.
// ─── v21 STAGE A: replay-based balance events (desktop parity port) ──────
// Desktop balance events are tracker-replay TIMING RESIDUALS, not static
// gap intervals: a teacher-forced walk carries each skill's XP position
// through the true schedule at a probe talent; every actual pop that the
// carry could NOT have reached is an 'under' (deficit XP, talent too low
// at the probe), every threshold clamp with no actual pop is an 'over'
// STREAK (surplus XP accumulating, ONE event per episode — subskill.py v7
// streak-merge semantics), emitted when the episode closes (pop arrives or
// history ends).  Magnitudes are weeks-equivalents (XP / mean weekly XP),
// matching talent_combine's per_event convention.  Anchor: Mikoos uniform
// subskill from the first report's value band (the same anchor the
// display tracker uses), 0.5 fallback.  Two-sidedness is structural — the
// static-gap Kundrík guard (nTwoSided) does not apply to this path.
// v21.1: pop-derived anchor fractions (subskill.py v5.10/5.17 port).
// For each outfield skill, back-solve the WEEK-1 carry fraction from its
// FIRST observed pop at a FIXED reference talent (POP_SEED_REF_TD = 82):
// hold the skill at its anchor level, sum the modelled DB gain to the pop
// (inclusive), req = width − gain; pin fraction req/width only when
// req > 0 (the omit-gate: a slow pop is ambiguous — low carry + high
// talent OR high carry + low talent — so it rides the uniform anchor).
// Contaminated spans (level drop below anchor, drop-eligible age) omit.
// Fractions are computed ONCE and are probe-invariant, matching desktop's
// seed_ref_talent=INNER_SEED_REF_TD replay semantics.
// ⚠ v21.1 MEASURED RESULT — HYPOTHESIS FALSIFIED: seeding the REPLAY with
// these fractions made every aggregate WORSE on corpus 5 (ratio 0.962 →
// 0.952, MAE 1.45 → 1.49, 15+w bias −1.12 → −1.47), so replay seeding is
// DISABLED (_REPLAY_POP_SEEDS=false) and the replay runs on the uniform
// value-band anchor (v21.0 behaviour, measured 1.45/0.962).  The uniform
// anchor is NOT the source of the ~3% ratio shift vs desktop 0.988 —
// that residual stays open (sokker_12 D10; next diagnostic: per-player
// desktop↔replay talent diff + single-player event-log diff at matched
// probes).  The function itself is KEPT: Stage B (fixed points) needs it
// for the GAP-estimator carries, which is where desktop actually
// consumes it.
const _POP_SEED_REF_TD=82.0;
const _REPLAY_POP_SEEDS=false;   // v21.1: measured regression — off
function _popDerivedAnchorFractions(hist,tws,coachDb,isGk){
  const out={};
  const fsk=hist[0].skills||{};
  const coachEff=coachDb/93.0;
  const formFallback=_inferFormationSkill(hist);
  for(const sk of OS){
    const aLv=fsk[sk];
    if(aLv==null||aLv>=_MX-1)continue;
    const width=_dbThresh(aLv,false);
    if(width<=0)continue;
    let gain=0,popped=false,contaminated=false,prevLv=aLv;
    for(let i=1;i<hist.length;i++){
      const tw=tws[i];
      const lvNow=(hist[i].skills||{})[sk]??prevLv;
      if(lvNow<aLv||_dropEligible(sk,tw.age)){contaminated=true;break;}
      if(!tw.severeInjury){
        const formSk=tw.isFormation?(tw.formationSkill||formFallback):null;
        gain+=_weekGain({skill:sk,level:aLv},tw,_POP_SEED_REF_TD,coachEff,formSk);
      }
      if(((tw.skillsChange||{})[sk]||0)>0||lvNow>prevLv){popped=true;break;}
      prevLv=lvNow;
    }
    if(popped&&!contaminated){
      const req=width-gain;
      if(req>0)out[sk]=Math.min(0.99,req/width);   // omit-gate (v5.10)
    }
  }
  return out;
}

function _mkReplayNetFn(reports,coachDb,isGk){
  const hist=[...reports].sort((a,b)=>(a.week||0)-(b.week||0));
  const tws=hist.map(_parseRecord);
  const f0=hist[0],fsk=f0.skills||{};
  let anchor=0.5;
  const av=(f0.playerValue||{}).value;
  if(av&&av>0){
    try{
      const est=mikoosEstimateSubskill(fsk,fsk.form??14,av);
      if(est&&est.inRange)anchor=est.expected;
    }catch(e){}
  }
  const seedFracs=_REPLAY_POP_SEEDS
    ?_popDerivedAnchorFractions(hist,tws,coachDb,isGk):{};  // v21.1: off
  const SKS=(isGk?[...OS,"keeper"]:OS);   // stamina/form talent-free; keeper GK-only
  return function netFn(td){
    const eff=(40+60*td/100)/100;
    let nu=0,no=0,wu=0,wo=0,sw2=0;const pe=[];
    const emitOver=(sk,lv,ep)=>{
      const w=_balBandWeight(lv);sw2+=w*w;no++;wo+=w;
      const meanEarned=ep.weeks>0?ep.earnedSum/ep.weeks:1;
      pe.push([sk,-(ep.surplus/Math.max(meanEarned,1))]);
    };
    for(const sk of SKS){
      let lv=fsk[sk];
      if(lv==null||lv>=_MX)continue;
      let thr=_dtRaw(sk,lv,tws[0].age)/eff;
      let carry=(seedFracs[sk]??anchor)*thr;   // v21.1: pop-derived seed wins
      let ep=null;                        // active over-episode
      for(let i=1;i<hist.length;i++){
        const tw=tws[i];
        const actual=(hist[i].skills||{})[sk];
        if(actual==null)continue;
        if(lv>=_MX){lv=actual;continue;}
        thr=_dtRaw(sk,lv,tw.age)/eff;
        const earned=_weekXpContribution(tw,sk,coachDb,isGk)[0];
        if(actual<lv){                     // anomaly drop → re-anchor, no event
          lv=actual;thr=_dtRaw(sk,lv,tw.age)/eff;carry=0.5*thr;ep=null;continue;
        }
        if(actual>lv){                     // ACTUAL POP (teacher-forced)
          if(ep){emitOver(sk,lv,ep);carry=thr;ep=null;}
          const requiredMin=thr-earned;
          if(carry<requiredMin&&thr>0){
            const deficit=requiredMin-carry;
            const w=_balBandWeight(lv);sw2+=w*w;nu++;wu+=w;
            pe.push([sk,+(deficit/Math.max(earned,1))]);
            carry=0;                       // pop-exact: forced, empty bracket
          }else{
            carry=Math.max(0,carry+earned-thr);
          }
          lv=actual;                       // multi-level pops: leftover only
          thr=_dtRaw(sk,lv,tw.age)/eff;
          if(carry>=thr)carry=thr*0.999;   // guard leftover ≥ new threshold
          continue;
        }
        // no pop this week
        carry+=earned;
        if(carry>=thr&&thr>0){
          if(!ep)ep={surplus:0,earnedSum:0,weeks:0};
          ep.surplus+=carry-thr;
          ep.earnedSum+=earned;ep.weeks++;
          carry=thr;                       // clamp (desktop closed_ceiling)
        }else if(ep){                      // aged threshold rose above carry —
          ep.earnedSum+=earned;ep.weeks++; // episode continues accounting
        }
      }
      if(ep)emitOver(sk,lv,ep);            // unresolved stall at history end
    }
    return{td,countNet:nu-no,nUnder:nu,nOver:no,wUnder:wu,wOver:wo,
      sumWSq:sw2,nEvents:nu+no,perEvent:pe};
  };
}

function _balNetSample(events,td){
  let nu=0,no=0,wu=0,wo=0,sw2=0;
  for(const e of events){
    const w=_balBandWeight(e.level);
    sw2+=w*w;
    if(td<e.lo){nu++;wu+=w;}
    else if(td>e.hi){no++;wo+=w;}
  }
  return{td,countNet:nu-no,nUnder:nu,nOver:no,wUnder:wu,wOver:wo,
    sumWSq:sw2,nEvents:nu+no};
}

function _balEpsW(s){return Math.sqrt(Math.max(s.sumWSq,0.0));}
function _balWeightedNet(s){return s.wUnder-s.wOver;}

// Root of the monotone-decreasing COUNT signal on [lo,hi].
// v17 (F1b): edges of the C=0 plateau. z0 = infimum of {C<=0},
// z1 = supremum of {C>=0}; both found by bisection on the monotone step.
function _balZeroPlateau(fn,lo,hi){
  let a=lo,b=hi; // z0: first td where C<=0
  if(fn(lo).countNet<=0)a=b=lo;
  else{for(let i=0;i<_BAL_MAX_IT&&(b-a)>_BAL_TOL;i++){
    const m=0.5*(a+b);if(fn(m).countNet>0)a=m;else b=m;}}
  const z0=0.5*(a+b);
  a=lo;b=hi; // z1: last td where C>=0
  if(fn(hi).countNet>=0)a=b=hi;
  else{for(let i=0;i<_BAL_MAX_IT&&(b-a)>_BAL_TOL;i++){
    const m=0.5*(a+b);if(fn(m).countNet>=0)a=m;else b=m;}}
  const z1=0.5*(a+b);
  return[Math.min(z0,z1),Math.max(z0,z1)];
}

function _balCountRoot(fn,lo,hi){
  const cLo=fn(lo).countNet,cHi=fn(hi).countNet;
  if(cLo<=0)return lo;
  if(cHi>=0)return hi;
  let a=lo,b=hi;
  for(let i=0;i<_BAL_MAX_IT;i++){
    if((b-a)<=_BAL_TOL)break;
    const m=0.5*(a+b);
    if(fn(m).countNet>0)a=m;else b=m;
  }
  return 0.5*(a+b);
}

// d(weighted net)/dtd near td (central diff, h=3), clamped from 0.
function _balLocalSlope(fn,td,h){
  h=h||3.0;
  const lo=_balWeightedNet(fn(td-h)),hi=_balWeightedNet(fn(td+h));
  let slope=(hi-lo)/(2.0*h);
  if(Math.abs(slope)<1e-6)slope=-1e-6;
  return slope;
}
function _balSymBand(fn,vTd,epsW){
  return epsW/Math.abs(_balLocalSlope(fn,vTd));
}

// LATE clamp: band symmetric around the UNCAPPED virtual point; only the
// operative talent_db is clamped.
function _balFinalize(vTd,half,epsW,confidence,oneSided,countNet,nEvents,tdFloor){
  const lo=Math.max(vTd-half,tdFloor);
  const hi=vTd+half; // left uncapped on purpose
  const operative=Math.min(Math.max(vTd,tdFloor),_BAL_CAP);
  return{talentDb:operative,talentDbLo:lo,talentDbHi:hi,
    confidence,oneSided,epsilon:epsW,countNetAtPoint:countNet,
    nEvents,virtualTalentDb:vTd,capped:vTd>_BAL_CAP};
}

// estimate_balance port. gapBand ([lo,hi] from the v12 flat intersection)
// is consulted ONLY to narrow a flat region (case 4).
function estimateBalance(events,tdFloor,tdCeil,gapBand,nTwoSided){
  // v17 (F2): nTwoSided — informative-upper-bound events in the set.
  // The Case-4 confidence upgrade (weak → reliable_via_gap) is earned by
  // evidence, not by the narrowing arithmetic; a band that is narrow only
  // because a one-sided envelope met the gap band stays "weak".
  // v21: body extracted to _estimateBalanceCore, which takes the signal
  // as a FUNCTION — the replay path (Stage A) probes a tracker replay per
  // td instead of a static event list.
  if(nTwoSided==null)nTwoSided=events.filter(e=>isFinite(e.hi)&&e.hi<100).length;
  return _estimateBalanceCore(td=>_balNetSample(events,td),
    tdFloor,tdCeil,gapBand,nTwoSided);
}

function _estimateBalanceCore(fn,tdFloor,tdCeil,gapBand,nTwoSided){
  if(tdCeil<=tdFloor)tdCeil=tdFloor+1e-6;
  const searchHi=Math.max(tdCeil,_BAL_SEARCH_MAX);
  const sFloor=fn(tdFloor),sTop=fn(searchHi);
  const epsW=Math.max(_balEpsW(sFloor),_balEpsW(sTop));

  // Case 5: insufficient signal → caller keeps the gap estimate.
  if(Math.max(sFloor.nEvents,sTop.nEvents)<_BAL_MIN_SIGNAL){
    const mid=0.5*(tdFloor+tdCeil);
    return{talentDb:mid,talentDbLo:tdFloor,talentDbHi:tdCeil,
      confidence:"insufficient_signal",oneSided:null,epsilon:epsW,
      countNetAtPoint:sFloor.countNet,nEvents:sFloor.nEvents,
      virtualTalentDb:mid,capped:false};
  }
  // Case 2: ceiling-pinned — under-dominated by COUNT past the cap.
  if(sTop.countNet>0){
    const half=_balSymBand(fn,searchHi,epsW);
    return _balFinalize(searchHi,half,epsW,"ceiling_pinned","ge",
      sTop.countNet,sTop.nEvents,tdFloor);
  }
  // Case 3: floor-pinned — over-dominated at the floor.
  if(sFloor.countNet<0){
    const half=_balSymBand(fn,tdFloor,epsW);
    return _balFinalize(tdFloor,half,epsW,"floor_pinned","le",
      sFloor.countNet,sFloor.nEvents,tdFloor);
  }
  // Cases 1 & 4: count root exists in [floor, searchHi].
  // v17 (F1b): if the zero set is a wide plateau, the plateau IS the
  // band — the ε-band at a bisection edge is an artifact. The plateau
  // center is the point; Case-4 flat handling (gap-band narrowing, F2
  // confidence rules) applies downstream unchanged.
  const[z0,z1]=_balZeroPlateau(fn,tdFloor,searchHi);
  const plateauW=z1-z0;
  const root=plateauW>_BAL_WIDE_BAND?0.5*(z0+z1):_balCountRoot(fn,tdFloor,searchHi);
  let half=plateauW>_BAL_WIDE_BAND?0.5*plateauW:_balSymBand(fn,root,epsW);
  const sRoot=fn(root);
  const bandW=2.0*half;
  if(bandW>_BAL_WIDE_BAND){
    // Case 4: flat / identifiability-limited — gap band may NARROW only.
    let vPt=root,conf="weak";
    const loEdge=root-half,hiEdge=root+half;
    if(gapBand&&isFinite(gapBand[0])&&isFinite(gapBand[1])){
      const nLo=Math.max(loEdge,gapBand[0]),nHi=Math.min(hiEdge,gapBand[1]);
      if(nHi>nLo&&(nHi-nLo)<bandW){
        vPt=0.5*(nLo+nHi);half=0.5*(nHi-nLo);
        // v17 (F2): the upgrade is earned by evidence — at least one
        // two-sided event AND a substantive narrowing (>20% of the flat
        // width). A trivial shave of a wide plateau stays "weak".
        // A near-zero-width intersection means the plateau and the gap
        // band barely touch — a tension signal, not precision. Stay weak.
        conf=(nTwoSided>=1&&(nHi-nLo)<0.8*bandW&&(nHi-nLo)>=2*_BAL_TOL)?"reliable_via_gap":"weak";
      }
    }
    return _balFinalize(vPt,half,epsW,conf,null,
      sRoot.countNet,sRoot.nEvents,tdFloor);
  }
  // Case 1: clean crossing — residual accepted as noise.
  return _balFinalize(root,half,epsW,"reliable",null,
    sRoot.countNet,sRoot.nEvents,tdFloor);
}

// Combined estimator the UI consumes: run the v12 gap estimator (event
// producer + fallback + gap band), then the balance on its known-start
// events. On insufficient_signal the v12 verdict passes through unchanged
// (method "gap"); otherwise the balance verdict overrides td/tdLo/tdHi/
// confidence (method "balance").
function estimateTalentCombined(history,options){
  // v20: thin wrapper — core estimate, then the optional EXTERNAL PRIOR
  // (desktop _apply_external_prior v1 semantics verbatim: hard-intersect
  // the data band; on disjoint ranges the PRIOR WINS).  The prior never
  // fabricates an estimate where the history gives none.
  options=options||{};
  const res=_estimateCombinedCore(history,options);
  return _applyPriorToEstimate(res,options.prior);
}

function _applyPriorToEstimate(res,prior){
  if(!res||!prior||prior.length!==2)return res;
  const[p0,p1]=prior;
  if(!isFinite(p0)||!isFinite(p1))return res;
  if(res.confidence==="no_data"||!isFinite(res.td))return res;
  const plo=Math.min(p0,p1),phi=Math.max(p0,p1);
  const dlo=isFinite(res.tdLo)?res.tdLo:res.td;
  const dhi=isFinite(res.tdHi)?res.tdHi:res.td;
  const ilo=Math.max(dlo,plo),ihi=Math.min(dhi,phi);
  const r1=x=>Math.round(x*10)/10;
  if(ilo<=ihi){                    // overlap → narrow to the intersection
    return{...res,td:r1(Math.min(100,0.5*(ilo+ihi))),tdLo:r1(ilo),tdHi:r1(ihi),
      confidence:"reliable_via_prior",prior:{lo:r1(plo),hi:r1(phi),mode:"intersect"}};
  }
  return{...res,td:r1(Math.min(100,0.5*(plo+phi))),tdLo:r1(plo),tdHi:r1(phi),
    confidence:"reliable_via_prior",prior:{lo:r1(plo),hi:r1(phi),mode:"conflict"}};
}

function _estimateCombinedCore(history,options){
  const base=estimateTalent(history,options);
  const events=base.balanceEvents||[];
  if(!events.length)return{...base,method:"gap"};
  // v17 (F1): balance requires the event set to be able to say "over".
  // On short junior gaps every event's hi saturates at 100 (carry slack
  // swallows the upper bound) ⇒ C(td)=n_under−n_over can never go
  // negative ⇒ the root-find converges to the LOWER ENVELOPE (max lo),
  // not a talent point (Kundrík 40171831: 57.9 vs real ~89, with every
  // gap individually consistent with 89). Desktop is immune — its events
  // are tracker-replay timing residuals, inherently two-sided; this
  // guard closes the static-gap-event port's degenerate case.
  const gapBand=(isFinite(base.tdLo)&&isFinite(base.tdHi)&&!base.contradictory)
    ?[base.tdLo,base.tdHi]:null;
  // ── v21 STAGE A: REPLAY balance (desktop parity) with static fallback ──
  // Replay residuals are two-sided by construction, so the Kundrík
  // nTwoSided guard applies only to the static path.  If the replay
  // yields insufficient events, fall through to the v17 static-gap
  // balance, then to the plain gap verdict — never worse than v20.
  let bal=null,balSrc=null;
  if(options.replayBalance!==false){
    try{
      const netFn=_mkReplayNetFn(history,options.coachDb??_COACH_DB,base.isGk);
      const rb=_estimateBalanceCore(netFn,_BAL_FLOOR,_BAL_CAP,gapBand,1);
      if(rb.confidence!=="insufficient_signal"){bal=rb;balSrc="replay";}
    }catch(e){}
  }
  if(!bal){
    const nTwoSided=events.filter(e=>isFinite(e.hi)&&e.hi<100).length;
    if(nTwoSided===0)return{...base,method:"gap"};
    const sb=estimateBalance(events,_BAL_FLOOR,_BAL_CAP,gapBand,nTwoSided);
    if(sb.confidence==="insufficient_signal")return{...base,method:"gap"};
    bal=sb;balSrc="static";
  }
  // ── v19: PRECISION-WEIGHTED FUSION (talent_combine v2 port) ──────────
  // The v14–v18 composition was winner-take-all: the balance verdict
  // REPLACED the gap verdict, including the floor/ceiling-PINNED cases,
  // where the pinned point is a one-sided constraint, not a measurement —
  // the desktop Żołądek/Ozieriański amplification path.  v19 fuses:
  //   • gap + balance become σ-weighted two-sided signals (IVW mean);
  //   • a pinned balance becomes a CONSTRAINT that truncates the mean and
  //     never enters it;
  //   • Birge χ² inflation widens σ_f when the signals disagree beyond
  //     their stated bands (μ untouched — IVW is scale-invariant);
  //   • equal-σ two-signal input reproduces the plain midpoint exactly.
  // Fixed-point machinery deliberately NOT ported: desktop's loops exist
  // for its carry-in↔talent feedback; the online gaps are static bounds.
  const sigGap=_signalFromGap(base);
  const sigBal=_signalFromBalance(bal);
  const fus=_fuseSignals([sigGap,sigBal]);
  if(!isFinite(fus.point)){
    return{...base,method:"gap"};          // no usable signal — v17 semantics
  }
  const virt=fus.point;
  const tdAdopt=Math.min(100,virt);
  // v19 band semantics: fus.lo/hi is the SIGNAL-POINT SPREAD (desktop
  // CombineResult convention, where σ rides separately).  For the chip the
  // displayed band is μ ± σ_f EXPANDED to cover any disagreement — two
  // agreeing signals must never render a zero-width band while σ_f is
  // ±3–4 DB (caught in the v18↔v19 A/B: 20 players showed band 0–2).
  const bandLo=Math.min(fus.lo,virt-fus.sigma);
  const bandHi=Math.max(fus.hi,virt+fus.sigma);
  const width=bandHi-bandLo;
  const lowConf=width>25||fus.flags.includes("single_signal")
    ||fus.flags.includes("constraints_only")
    ||fus.flags.some(f=>f.startsWith("truncated_by_"));
  return{
    ...base,
    method:"fusion",
    td:Math.round(tdAdopt*10)/10,
    tdLo:Math.round(Math.max(_BAL_FLOOR,bandLo)*10)/10,
    tdHi:Math.round(bandHi*10)/10,          // may exceed 100 (virtual band)
    confidence:lowConf?"low_confidence":"reliable",
    oneSided:bal.oneSided,
    balance:{epsilon:bal.epsilon,nEvents:bal.nEvents,
      countNet:bal.countNetAtPoint,virtual:bal.virtualTalentDb,
      capped:bal.capped,source:balSrc},               // v21: replay|static
    fusion:{sigma:Math.round(fus.sigma*100)/100,virtual:Math.round(virt*10)/10,
      flags:fus.flags,
      gapSigma:sigGap.valid?Math.round(sigGap.sigma*100)/100:null,
      balSigma:sigBal.valid?Math.round(sigBal.sigma*100)/100:null},
  };
}

// ── v19 fusion helpers (talent_combine v2 port; pure, headless-testable) ──
const _SIGMA_FLOOR=1.5,_SIGMA_CAP=40.0;
const _CONF_SIGMA_MULT={reliable:1.0,reliable_via_gap:1.0,indicative:1.5,
  weak:2.5,unreliable:2.5};
function _clampSigma(s){return!isFinite(s)?_SIGMA_CAP:
  Math.min(Math.max(s,_SIGMA_FLOOR),_SIGMA_CAP);}

function _signalFromGap(base){
  // Gap verdict → two-sided signal.  σ = half band × confidence mult.
  if(!isFinite(base.td)||base.contradictory||base.confidence==="no_data")
    return{name:"gap",point:NaN,sigma:_SIGMA_CAP,valid:false,oneSided:null};
  const half=(isFinite(base.tdLo)&&isFinite(base.tdHi)&&base.tdHi>=base.tdLo)
    ?0.5*(base.tdHi-base.tdLo):_SIGMA_CAP;
  const sigma=_clampSigma(half*(_CONF_SIGMA_MULT[base.confidence]??2.5));
  return{name:"gap",point:base.td,sigma,valid:true,oneSided:null};
}

function _signalFromBalance(bal){
  // Balance verdict → two-sided signal, one-sided constraint, or invalid.
  // ceiling_pinned → 'ge' at (virtual − half); floor_pinned → 'le' at
  // (virtual + half) — the clamped point NEVER enters the mean.
  if(!bal||bal.confidence==="insufficient_signal")
    return{name:"balance",point:NaN,sigma:_SIGMA_CAP,valid:false,oneSided:null};
  const virtual=bal.virtualTalentDb;
  let half=bal.talentDbHi-virtual;           // hi is uncapped by design
  if(!isFinite(half)||half<=0)half=0.5*(bal.talentDbHi-bal.talentDbLo);
  const sigma=_clampSigma(half);
  if(bal.confidence==="ceiling_pinned")
    return{name:"balance",point:virtual-half,sigma,valid:true,oneSided:"ge"};
  if(bal.confidence==="floor_pinned")
    return{name:"balance",point:virtual+half,sigma,valid:true,oneSided:"le"};
  return{name:"balance",point:virtual,sigma,valid:true,oneSided:null};
}

function _fuseSignals(signals){
  // IVW mean of two-sided signals + one-sided truncation + Birge inflation.
  const two=signals.filter(s=>s.valid&&s.oneSided==null
    &&isFinite(s.point)&&isFinite(s.sigma)&&s.sigma>0);
  const cons=signals.filter(s=>s.valid&&(s.oneSided==="ge"||s.oneSided==="le")
    &&isFinite(s.point));
  const flags=[];
  let mu,sigmaF,lo,hi;
  if(two.length){
    const wsum=two.reduce((a,s)=>a+1/(s.sigma*s.sigma),0);
    mu=two.reduce((a,s)=>a+s.point/(s.sigma*s.sigma),0)/wsum;
    sigmaF=Math.sqrt(1/wsum);
    lo=Math.min(...two.map(s=>s.point));
    hi=Math.max(...two.map(s=>s.point));
    if(two.length===1)flags.push("single_signal");
    else{
      const chi2=two.reduce((a,s)=>a+((s.point-mu)/s.sigma)**2,0)/(two.length-1);
      if(chi2>1)sigmaF*=Math.sqrt(chi2);   // μ invariant; σ_f to disagreement scale
    }
  }else if(cons.length){
    const ge=Math.max(...cons.filter(s=>s.oneSided==="ge").map(s=>s.point),-Infinity);
    const le=Math.min(...cons.filter(s=>s.oneSided==="le").map(s=>s.point),Infinity);
    mu=ge>-Infinity?ge:le;
    if(ge>-Infinity&&le<Infinity)mu=0.5*(ge+le);
    sigmaF=_SIGMA_CAP;lo=hi=mu;
    flags.push("constraints_only");
    return{point:mu,sigma:sigmaF,lo,hi,flags};
  }else{
    return{point:NaN,sigma:NaN,lo:NaN,hi:NaN,flags:["no_valid_signal"]};
  }
  for(const s of cons){
    if(s.oneSided==="ge"&&mu<s.point){
      const moved=s.point-mu;mu=s.point;
      sigmaF=Math.max(sigmaF,moved);hi=Math.max(hi,mu);
      flags.push(`truncated_by_${s.name}_ge`);
    }else if(s.oneSided==="le"&&mu>s.point){
      const moved=mu-s.point;mu=s.point;
      sigmaF=Math.max(sigmaF,moved);lo=Math.min(lo,mu);
      flags.push(`truncated_by_${s.name}_le`);
    }
  }
  return{point:mu,sigma:sigmaF,lo,hi,flags};
}

// ═══════════════════════════════════════════════════════════════════════════
// REACT UI
// ═══════════════════════════════════════════════════════════════════════════
const C={bg:"#0c0e14",card:"#14171f",hi:"#1a1e29",bdr:"#252a38",
  acc:"#4a90d9",pop:"#48c774",warn:"#f5a623",tx:"#dfe3ed",txD:"#8a96a8",txM:"#4e5a6e",red:"#ef4444"};
// v8.4: Canonical per-skill chip colors for Manual Schedule
const SK_COLORS={pace:"#4a90d9",technique:"#48c774",passing:"#a78bfa",defending:"#f5a623",playmaking:"#ec4899",striker:"#ef4444"};
// v15: canonical English level names (sokker_01 v23 table, display 0–18).
// Lowercase for in-card sentence fidelity ("solid [8] keeper").
const LEVEL_NAMES=["tragic","hopeless","unsatisfactory","poor","weak","average",
  "adequate","good","solid","very good","excellent","formidable","outstanding",
  "incredible","brilliant","magical","unearthly","divine","superdivine"];
// v15: game-card skill grid — 4 rows × 2 columns, exact in-game order and
// the in-game English skill nouns (kondycja→stamina, bramkarz→keeper,
// obrońca→defender, rozgrywający→playmaker, strzelec→striker).
const CARD_GRID=[
  [["stamina","stamina"],["keeper","keeper"]],
  [["pace","pace"],["defending","defender"]],
  [["technique","technique"],["playmaking","playmaker"]],
  [["passing","passing"],["striker","striker"]],
];
// v16: synthetic demo player. Generated OFFLINE with the estimator-side
// forward model (eff(td)·XP vs _canonThr, XD=93/XG=14 at intensity 100,
// coach 93) so the in-app talent estimate is self-consistent by
// construction: true YS 3.80 (td 76.6); estimateTalentCombined on this
// history returns YS 3.82, band 73–79 DB, reliable_via_gap. 45 weekly
// individual-training reports (defending-heavy DEF plan), age 20→23,
// spans three season boundaries so _deriveStart resolves ssw. NOT a real
// Sokker player — demo loads NEVER submit to the corpus (opts.demo).
const DEMO_PLAYER_NAME="Demo Defender";
// v16: plain-language explanations for the estimate confidence labels
const CONF_EXPLAIN={
  reliable:"History is long and informative enough to trust this estimate.",
  reliable_via_gap:"History is long and informative enough to trust this estimate.",
  indicative:"A useful hint, but the history can't fully pin the talent down.",
  ceiling_pinned:"Evidence points at (or past) the top of the scale.",
  floor_pinned:"Evidence points at (or past) the bottom of the scale.",
  weak:"Only weak evidence — treat as a rough hint.",
  unreliable:"The history contradicts itself somewhat — treat with caution.",
  no_data:"The history is too short to infer anything.",
  low_confidence:"Fused estimate with a wide or conflicted band — usable, but verify against an external source.",
  reliable_via_prior:"Anchored by the external talent you supplied, intersected with the history evidence.",
};
const DEMO_HISTORY_JSON=JSON.stringify({"reports":[{"week":901,"age":20,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":8,"technique":7,"passing":6,"defending":9,"playmaking":7,"striker":4,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":430207}},{"week":902,"age":20,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":8,"technique":7,"passing":6,"defending":9,"playmaking":7,"striker":4,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":451911}},{"week":903,"age":20,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":8,"technique":7,"passing":6,"defending":10,"playmaking":7,"striker":4,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":1,"playmaking":0,"striker":0},"playerValue":{"value":476506}},{"week":904,"age":20,"kind":{"name":"individual"},"type":{"name":"pace"},"intensity":100,"skills":{"pace":8,"technique":7,"passing":6,"defending":10,"playmaking":7,"striker":4,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":493900}},{"week":905,"age":20,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":8,"technique":7,"passing":6,"defending":10,"playmaking":7,"striker":4,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":522471}},{"week":906,"age":20,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":8,"technique":7,"passing":6,"defending":10,"playmaking":7,"striker":4,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":553421}},{"week":907,"age":20,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":8,"technique":7,"passing":6,"defending":11,"playmaking":7,"striker":4,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":1,"playmaking":0,"striker":0},"playerValue":{"value":584610}},{"week":908,"age":20,"kind":{"name":"individual"},"type":{"name":"pace"},"intensity":100,"skills":{"pace":9,"technique":7,"passing":6,"defending":11,"playmaking":7,"striker":4,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":1,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":603748}},{"week":909,"age":21,"kind":{"name":"individual"},"type":{"name":"technique"},"intensity":100,"skills":{"pace":9,"technique":8,"passing":6,"defending":11,"playmaking":7,"striker":4,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":1,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":617303}},{"week":910,"age":21,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":9,"technique":8,"passing":6,"defending":11,"playmaking":7,"striker":4,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":645454}},{"week":911,"age":21,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":9,"technique":8,"passing":6,"defending":11,"playmaking":7,"striker":4,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":675268}},{"week":912,"age":21,"kind":{"name":"individual"},"type":{"name":"pace"},"intensity":100,"skills":{"pace":9,"technique":8,"passing":6,"defending":11,"playmaking":8,"striker":4,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":1,"striker":0},"playerValue":{"value":694227}},{"week":913,"age":21,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":9,"technique":8,"passing":7,"defending":11,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":1,"defending":0,"playmaking":0,"striker":1},"playerValue":{"value":725947}},{"week":914,"age":21,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":9,"technique":8,"passing":7,"defending":12,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":1,"playmaking":0,"striker":0},"playerValue":{"value":761363}},{"week":915,"age":21,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":9,"technique":8,"passing":7,"defending":12,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":801853}},{"week":916,"age":21,"kind":{"name":"individual"},"type":{"name":"pace"},"intensity":100,"skills":{"pace":9,"technique":8,"passing":7,"defending":12,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":823826}},{"week":917,"age":21,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":9,"technique":8,"passing":7,"defending":12,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":867734}},{"week":918,"age":21,"kind":{"name":"individual"},"type":{"name":"technique"},"intensity":100,"skills":{"pace":9,"technique":8,"passing":7,"defending":12,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":889891}},{"week":919,"age":21,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":9,"technique":8,"passing":7,"defending":12,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":937514}},{"week":920,"age":21,"kind":{"name":"individual"},"type":{"name":"pace"},"intensity":100,"skills":{"pace":9,"technique":8,"passing":7,"defending":12,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":962174}},{"week":921,"age":21,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":9,"technique":8,"passing":7,"defending":13,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":1,"playmaking":0,"striker":0},"playerValue":{"value":1006246}},{"week":922,"age":22,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":9,"technique":8,"passing":7,"defending":13,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":1036453}},{"week":923,"age":22,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":9,"technique":8,"passing":7,"defending":13,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":1079410}},{"week":924,"age":22,"kind":{"name":"individual"},"type":{"name":"pace"},"intensity":100,"skills":{"pace":10,"technique":8,"passing":7,"defending":13,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":1,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":1104933}},{"week":925,"age":22,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":10,"technique":8,"passing":7,"defending":13,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":1150775}},{"week":926,"age":22,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":10,"technique":8,"passing":7,"defending":13,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":1198819}},{"week":927,"age":22,"kind":{"name":"individual"},"type":{"name":"technique"},"intensity":100,"skills":{"pace":10,"technique":9,"passing":7,"defending":13,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":1,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":1222773}},{"week":928,"age":22,"kind":{"name":"individual"},"type":{"name":"pace"},"intensity":100,"skills":{"pace":10,"technique":9,"passing":7,"defending":13,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":1251058}},{"week":929,"age":22,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":10,"technique":9,"passing":7,"defending":14,"playmaking":8,"striker":5,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":1,"playmaking":0,"striker":0},"playerValue":{"value":1306659}},{"week":930,"age":22,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":10,"technique":9,"passing":7,"defending":14,"playmaking":8,"striker":6,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":1},"playerValue":{"value":1367634}},{"week":931,"age":22,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":10,"technique":9,"passing":8,"defending":14,"playmaking":8,"striker":6,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":1,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":1431845}},{"week":932,"age":22,"kind":{"name":"individual"},"type":{"name":"pace"},"intensity":100,"skills":{"pace":10,"technique":9,"passing":8,"defending":14,"playmaking":8,"striker":6,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":1464036}},{"week":933,"age":22,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":10,"technique":9,"passing":8,"defending":14,"playmaking":8,"striker":6,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":1532425}},{"week":934,"age":22,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":10,"technique":9,"passing":8,"defending":14,"playmaking":8,"striker":6,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":1604596}},{"week":935,"age":23,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":10,"technique":9,"passing":8,"defending":15,"playmaking":8,"striker":6,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":1,"playmaking":0,"striker":0},"playerValue":{"value":1630906}},{"week":936,"age":23,"kind":{"name":"individual"},"type":{"name":"pace"},"intensity":100,"skills":{"pace":11,"technique":9,"passing":8,"defending":15,"playmaking":8,"striker":6,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":1,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":1659868}},{"week":937,"age":23,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":11,"technique":9,"passing":8,"defending":15,"playmaking":9,"striker":6,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":1,"striker":0},"playerValue":{"value":1717957}},{"week":938,"age":23,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":11,"technique":9,"passing":8,"defending":15,"playmaking":9,"striker":6,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":1778043}},{"week":939,"age":23,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":11,"technique":9,"passing":8,"defending":15,"playmaking":9,"striker":6,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":1840468}},{"week":940,"age":23,"kind":{"name":"individual"},"type":{"name":"pace"},"intensity":100,"skills":{"pace":11,"technique":9,"passing":8,"defending":15,"playmaking":9,"striker":6,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":1869707}},{"week":941,"age":23,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":11,"technique":9,"passing":8,"defending":15,"playmaking":9,"striker":6,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":1935105}},{"week":942,"age":23,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":11,"technique":9,"passing":8,"defending":15,"playmaking":9,"striker":6,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":2003045}},{"week":943,"age":23,"kind":{"name":"individual"},"type":{"name":"defending"},"intensity":100,"skills":{"pace":11,"technique":9,"passing":8,"defending":15,"playmaking":9,"striker":6,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":2073625}},{"week":944,"age":23,"kind":{"name":"individual"},"type":{"name":"pace"},"intensity":100,"skills":{"pace":11,"technique":9,"passing":8,"defending":15,"playmaking":9,"striker":6,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":0,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":2105438}},{"week":945,"age":23,"kind":{"name":"individual"},"type":{"name":"technique"},"intensity":100,"skills":{"pace":11,"technique":10,"passing":8,"defending":15,"playmaking":9,"striker":6,"stamina":7,"keeper":0,"form":8},"skillsChange":{"pace":0,"technique":1,"passing":0,"defending":0,"playmaking":0,"striker":0},"playerValue":{"value":2135263}}]});
const _ft="'JetBrains Mono','Fira Code',monospace";
const _fs="'DM Sans','Segoe UI',system-ui,sans-serif";

const YS_PRESETS=[
  {ys:3.00,l:"3.00 (max)"},{ys:3.11,l:"3.11"},{ys:3.30,l:"3.30"},
  {ys:3.50,l:"3.50"},{ys:3.80,l:"3.80"},{ys:4.00,l:"4.00"},
  {ys:4.50,l:"4.50"},{ys:5.00,l:"5.00"},{ys:6.00,l:"6.00"},
];

const DEF_SUBS=Object.fromEntries(OS.map(sk=>[sk,25]));

// ─── SubBar: draggable sub-level bar ───────────────────────────────────────
function SubBar({value,onChange,color}){
  const ref=useRef(null);
  const dragging=useRef(false);
  const update=useCallback((e)=>{
    const rect=ref.current.getBoundingClientRect();
    const x=Math.max(0,Math.min(e.clientX-rect.left,rect.width));
    onChange(Math.round(x/rect.width*99));
  },[onChange]);
  const onDown=useCallback((e)=>{
    dragging.current=true;update(e);
    const onMove=(ev)=>{if(dragging.current)update(ev);};
    const onUp=()=>{dragging.current=false;window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  },[update]);
  // Touch support
  const onTouch=useCallback((e)=>{
    const t=e.touches[0];if(!t||!ref.current)return;
    const rect=ref.current.getBoundingClientRect();
    const x=Math.max(0,Math.min(t.clientX-rect.left,rect.width));
    onChange(Math.round(x/rect.width*99));
  },[onChange]);

  return(
    <div ref={ref} onMouseDown={onDown} onTouchStart={onTouch} onTouchMove={onTouch}
      style={{position:"relative",height:20,background:C.bg,borderRadius:4,cursor:"pointer",overflow:"hidden",userSelect:"none",touchAction:"none"}}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${value/99*100}%`,background:color,borderRadius:4,transition:dragging.current?"none":"width 0.1s"}}/>
      {/* v18 (D@ni report): the numeral sits at the RIGHT edge but the fill
          grows from the LEFT — the old value>60→dark-text heuristic painted
          it background-black over the still-unfilled right side for every
          value in ~60–95 ("czarna czcionka gubi się na czarnym tle").
          Bright text + dark halo is readable over both fill and bg. */}
      <div style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:10,fontFamily:_ft,fontWeight:600,
        color:C.tx,textShadow:"0 0 3px rgba(0,0,0,0.9),0 0 2px rgba(0,0,0,0.9)",zIndex:1}}>.{value.toString().padStart(2,"0")}</div>
    </div>
  );
}

// ─── SkillEditor: unified skill + subskill input ──────────────────────────
// ─── v15: Game-look player card ─────────────────────────────────────────────
// Renders a player the way the in-game card does: header (name, age), value,
// form, then the 4×2 skill grid (CARD_GRID order) as "levelname [N] skill".
// deltas: {sk: levelsGained} — a gained skill renders green with a +N chip,
// mirroring the game's green-pop convention (green = went up since last
// report; here: since "Now"). skills may miss stamina/keeper (not simulated)
// → "?". value/form rows render only when a value/form is supplied.
function SokkerCard({title,name,age,skills,form,value,valueLabel,deltas,footnote}){
  const cell=(sk,label)=>{
    const lv=skills?.[sk];
    const gained=deltas?.[sk]||0;
    const known=Number.isFinite(lv);
    return(
      <div key={sk} style={{padding:"7px 12px",borderBottom:`1px solid ${C.bdr}55`,fontSize:13,
        display:"flex",alignItems:"baseline",gap:5,minWidth:0}}>
        {known?(
          <>
            <span style={{fontWeight:700,color:gained>0?C.pop:C.tx,whiteSpace:"nowrap"}}>
              {LEVEL_NAMES[Math.max(0,Math.min(18,lv))]} [{lv}]
            </span>
            <span style={{color:C.txD,whiteSpace:"nowrap"}}>{label}</span>
            {gained>0&&(
              <span style={{fontSize:10,fontWeight:700,color:C.pop,background:C.pop+"1c",
                borderRadius:3,padding:"0 4px",fontFamily:_ft}}>+{gained}</span>
            )}
          </>
        ):(
          <>
            <span style={{fontWeight:700,color:C.txM}}>?</span>
            <span style={{color:C.txM}}>{label}</span>
          </>
        )}
      </div>
    );
  };
  return(
    <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:8,overflow:"hidden",flex:1,minWidth:280}}>
      <div style={{background:C.hi,padding:"9px 12px",display:"flex",alignItems:"baseline",gap:8,
        borderBottom:`1px solid ${C.bdr}`}}>
        <span style={{fontWeight:700,fontSize:14,color:C.tx}}>{name||"Player"}</span>
        {Number.isFinite(age)&&<span style={{fontSize:13,color:C.txD}}>age: <b style={{color:C.tx}}>{age}</b></span>}
        {title&&<span style={{marginLeft:"auto",fontSize:10,fontWeight:700,letterSpacing:0.6,
          color:C.txD,textTransform:"uppercase"}}>{title}</span>}
      </div>
      {Number.isFinite(value)&&(
        <div style={{padding:"7px 12px",borderBottom:`1px solid ${C.bdr}55`,fontSize:13}}>
          <span style={{color:C.txD}}>value{valueLabel?` (${valueLabel})`:""}: </span>
          <b style={{color:C.red}}>{Math.round(value).toLocaleString("pl-PL").replace(/,/g," ")} zł</b>
        </div>
      )}
      {Number.isFinite(form)&&(
        <div style={{padding:"7px 12px",borderBottom:`1px solid ${C.bdr}55`,fontSize:13}}>
          <span style={{fontWeight:700,color:form<=5?C.red:form>=11?C.pop:C.tx}}>
            {LEVEL_NAMES[Math.max(0,Math.min(18,form))]} [{form}]</span>
          <span style={{color:C.txD}}> form</span>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
        {CARD_GRID.map(row=>row.map(([sk,label])=>cell(sk,label)))}
      </div>
      {footnote&&(
        <div style={{padding:"6px 12px",fontSize:10,color:C.txM,lineHeight:1.35}}>{footnote}</div>
      )}
    </div>
  );
}

function SkillEditor({skills,setSkills,subs,setSubs,age,setAge,pos,name,warnings,editable=true,talentEstimate}){
  const prof=POS[pos];
  // v13: small badge showing the gap-based talent estimate next to the age,
  // visible whenever a training history has been loaded. Display-only here —
  // the Apply button stays on Stage 2 where the YS Talent input lives. Same
  // confidence colour palette as the Stage 2 chip for visual consistency.
  const teBadge=(()=>{
    if(!talentEstimate)return null;
    const e=talentEstimate;
    if(e.confidence==="no_data"||!isFinite(e.td))return null;
    const cMap={reliable:C.pop,reliable_via_gap:C.pop,reliable_via_prior:C.pop,
      low_confidence:C.warn,indicative:C.acc,
      ceiling_pinned:C.acc,floor_pinned:C.warn,weak:C.warn,
      unreliable:C.warn,no_data:C.txM};
    const cBd=cMap[e.confidence]||C.txM;
    const ys=_csYsFromTd(e.td);
    const src=e.method==="fusion"?"fusion":e.method==="balance"?"balance":"gaps";
    const pre=e.oneSided==="ge"?"≤":e.oneSided==="le"?"≥":""; // td≥cap ⇒ YS≤
    // v17: interval-first display (band in YS: td_hi→ys_lo, td_lo→ys_hi)
    const bLo=isFinite(e.tdLo)?Math.max(1,Math.min(100,e.tdLo)):null;
    const bHi=isFinite(e.tdHi)?Math.max(1,Math.min(100,e.tdHi)):null;
    const ivl=(bLo!=null&&bHi!=null&&bLo!==bHi)
      ?`${_csYsFromTd(bHi).toFixed(2)}–${_csYsFromTd(bLo).toFixed(2)}`
      :`${pre}${ys.toFixed(2)}`;
    return(
      <span style={{
        display:"inline-flex",alignItems:"center",gap:6,
        padding:"2px 8px",borderRadius:4,
        background:C.card,border:`1px solid ${cBd}`,
        fontSize:11,fontFamily:_ft,
      }} title={`Talent estimate from training history (${src}): YS ${ivl} (${e.confidence}). Apply on Stage 2.`}>
        <span style={{color:C.txM,letterSpacing:0.3,fontFamily:_fs,fontSize:10,fontWeight:600}}>EST.</span>
        <span style={{color:C.tx,fontWeight:700}}>{ivl}</span>
        <span style={{
          padding:"0 5px",borderRadius:2,fontSize:9,fontWeight:600,
          background:cBd,color:"#fff",letterSpacing:0.3,fontFamily:_fs,
        }}>{e.confidence}</span>
      </span>
    );
  })();
  return(
    <div style={{background:C.bg,borderRadius:6,border:`1px solid ${C.bdr}`,padding:12}}>
      {name&&(
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}>
          <div style={{fontWeight:600,color:warnings?.length?C.warn:C.pop,fontSize:14}}>
            {name} {age?`· age ${age}`:""}
          </div>
          {teBadge}
        </div>
      )}
      {warnings?.length>0&&<div style={{fontSize:11,color:C.warn,marginBottom:8}}>⚠ {warnings.join("; ")}</div>}

      {/* Age row (manual mode) — v13: talent badge shown alongside if estimate available */}
      {editable&&!name&&(
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:C.txD,fontFamily:_fs,textTransform:"uppercase",letterSpacing:"0.06em"}}>Age</span>
          <input type="number" min={16} max={40} value={age}
            onChange={e=>setAge(Math.max(16,Math.min(40,parseInt(e.target.value)||16)))}
            style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:4,color:C.tx,fontFamily:_ft,fontSize:14,fontWeight:600,
              padding:"4px 8px",width:52,textAlign:"center",outline:"none"}}/>
          {teBadge}
        </div>
      )}

      <div style={{display:"flex",gap:6,marginBottom:6,fontSize:10,color:C.txM,fontFamily:_ft}}>
        <span style={{width:42}}>Skill</span>
        <span style={{width:40,textAlign:"center"}}>Level</span>
        <span style={{flex:1}}>Sub-level (drag or type — % toward next pop)</span>
        <span style={{width:36,textAlign:"right"}}>%</span>
      </div>

      {OS.map(sk=>{
        const w=prof.w[sk]||0;
        const isCrit=w===1;
        const isHelp=w>0&&w<1;
        const color=w===0?C.txM:isCrit?C.acc:C.txD;
        const barColor=isCrit?"#4a90d9":isHelp?"#6b7a8d":"#3a3f4a";
        return(
          <div key={sk} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
            {/* Skill label */}
            <div style={{width:42,fontFamily:_ft,fontSize:12,fontWeight:600,color,display:"flex",alignItems:"center",gap:2}}>
              {SN[sk]}
              {isCrit&&<span style={{fontSize:8,color:C.acc}}>★</span>}
              {isHelp&&<span style={{fontSize:8,color:C.txM}}>{w}</span>}
            </div>
            {/* Level input */}
            <input type="number" min={0} max={18} value={skills[sk]??0}
              onChange={e=>setSkills(p=>({...p,[sk]:Math.max(0,Math.min(18,parseInt(e.target.value)||0))}))}
              style={{width:40,background:C.card,border:`1px solid ${C.bdr}`,borderRadius:4,color:C.tx,fontFamily:_ft,
                fontSize:14,fontWeight:700,padding:"3px 4px",textAlign:"center",outline:"none"}}/>
            {/* Sub bar */}
            <div style={{flex:1}}>
              <SubBar value={subs[sk]??25} onChange={v=>setSubs(p=>({...p,[sk]:v}))} color={barColor}/>
            </div>
            {/* Pct input */}
            <input type="number" min={0} max={99} value={subs[sk]??25}
              onChange={e=>setSubs(p=>({...p,[sk]:Math.max(0,Math.min(99,parseInt(e.target.value)||0))}))}
              style={{width:36,background:C.card,border:`1px solid ${C.bdr}`,borderRadius:4,color:C.txD,fontFamily:_ft,
                fontSize:11,padding:"3px 4px",textAlign:"right",outline:"none"}}/>
          </div>
        );
      })}
      <div style={{fontSize:10,color:C.txM,marginTop:6,lineHeight:1.4}}>
        Sub-level = progress within current level toward next pop. 0% = just popped, 99% = about to pop. Default 25% if unknown.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Next-pop forecast card (v20) ───────────────────────────────────────────
// Turns the half-split-validated pop-timing accuracy (median error 0 w, 80%
// within ±2 w, n=767 — sokker_03 v50) into a per-skill forward forecast:
// "if the current training continues", when does each skill pop next?
// Carry at 'now' comes from the observed history via the canonical
// _weekXpContribution path: skills that popped in the window have an EXACT
// carry (XP since the pop); skills that didn't have carry ≥ observed XP
// (they didn't pop, so the entry carry was below the residual) → rendered
// as an upper bound "≤ N w".  The week walk is season-aware (thresholds
// re-evaluated at the aged value each week).  Band from the talent band.
function _forecastNextPops(reports,tdLo,tdHi,coachDb){
  if(!reports||reports.length<2)return null;
  const hist=[...reports].sort((a,b)=>(a.week||0)-(b.week||0));
  const last=hist[hist.length-1];
  const lastSk=last.skills||{};
  const outfMax=Math.max(...OS.map(s=>lastSk[s]||0));
  const isGk=(lastSk.keeper||0)>outfMax;
  const ds=_deriveStart(hist);
  const age0=ds?ds.age:(parseInt(last.age,10)||21);
  const ssw0=ds?ds.ssw:1;
  const twLast=_parseRecord(last);
  const assumed=twLast.trainedSkill||twLast.formationSkill
    ||_inferFormationSkill(hist)||"pace";
  const xd=Math.round(96*coachDb/100),xg=Math.round(96*coachDb*15/10000);
  const tws=hist.map(_parseRecord);
  const rows=[];
  const skillsList=isGk?[...OS,"keeper"]:OS;
  for(const sk of skillsList){
    const lv=lastSk[sk];
    if(lv==null||lv>=_MX)continue;
    if(_dropEligible(sk,age0))continue;
    // carry from the observed window
    let popIdx=null;
    for(let i=1;i<hist.length;i++){
      const a=(hist[i-1].skills||{})[sk],b=(hist[i].skills||{})[sk];
      if(a!=null&&b!=null&&b>a)popIdx=i;
    }
    let carryLo=0,carryExact=null;
    if(popIdx!=null&&(hist[popIdx].skills||{})[sk]===lv){
      let c=0;for(let j=popIdx+1;j<hist.length;j++)c+=_weekXpContribution(tws[j],sk,coachDb,isGk)[0];
      carryExact=c;
    }else{
      let c=0;for(let j=1;j<hist.length;j++){
        const a=(hist[j-1].skills||{})[sk];
        if(a===lv)c+=_weekXpContribution(tws[j],sk,coachDb,isGk)[0];
      }
      carryLo=c;                     // entry carry unknown; ≥ observed XP
    }
    const weekly=sk===assumed?xd:xg;
    if(weekly<=0){rows.push({sk,lv,mode:"none",assumed:sk===assumed});continue;}
    const walk=(td,carry)=>{        // weeks until cum ≥ need(age at week)
      const eff=(40+60*td/100)/100;
      let cum=carry,sw=ssw0,a=age0;
      for(let w=1;w<=156;w++){
        cum+=weekly;sw++;if(sw>_SL){sw=1;a++;}
        if(_dropEligible(sk,a))return null;
        if(cum>=_dtRaw(sk,lv,a)/eff)return w;
      }
      return null;
    };
    if(carryExact!=null){
      const fast=walk(tdHi,carryExact),slow=walk(tdLo,carryExact);
      rows.push({sk,lv,mode:"range",fast,slow,assumed:sk===assumed});
    }else{
      // unknown entry carry: earliest = could pop next week; latest =
      // entry carry exactly the observed XP, slow talent bound.
      const slow=walk(tdLo,carryLo);
      rows.push({sk,lv,mode:"upper",slow,assumed:sk===assumed});
    }
  }
  return{rows,assumed,age0,isGk};
}

function NextPopForecast({reports,tdLo,tdHi,coachDb}){
  const fc=useMemo(()=>{
    if(!isFinite(tdLo)||!isFinite(tdHi))return null;
    return _forecastNextPops(reports,Math.max(1,tdLo),Math.min(100,Math.max(tdLo,tdHi)),coachDb);
  },[reports,tdLo,tdHi,coachDb]);
  if(!fc||!fc.rows.length)return null;
  const cell={padding:"3px 8px",fontFamily:_ft,fontSize:11};
  // v20 semantics (validated on the half-split corpus): the ASSUMED skill
  // gets a two-sided range (93.5% within ±2 w where the assumption held);
  // every OTHER skill is projected on GT ALONE, which is the SLOWEST
  // path — any direct week accelerates it — so it renders as an upper
  // bound ("no later than"; 92.7% satisfied out-of-sample).
  const fmt=r=>{
    if(r.mode==="none")return"—";
    if(!r.assumed){
      const bound=r.slow;
      return bound==null?">3 seasons / drop-age"
        :`by ≤ ${bound} w · GT alone (sooner if trained)`;
    }
    if(r.mode==="upper")return r.slow==null?">3 seasons / drop-age":`≤ ${r.slow} w`;
    if(r.fast==null&&r.slow==null)return">3 seasons / drop-age";
    if(r.fast!=null&&r.slow!=null)
      return r.fast===r.slow?`in ${r.fast} w`:`in ${r.fast}–${r.slow} w`;
    return r.fast!=null?`≥ ${r.fast} w`:`≤ ${r.slow} w`;
  };
  return(
    <div style={{marginTop:12,background:C.card,borderRadius:8,padding:"10px 14px",
      borderLeft:`3px solid ${C.pop}`}}>
      <div style={{fontSize:10,fontFamily:_fs,color:C.pop,textTransform:"uppercase",
        letterSpacing:"0.1em",marginBottom:6}}>⏱ Next pops — if current training continues</div>
      <table style={{borderCollapse:"collapse"}}>
        <tbody>
          {fc.rows.map(r=>(
            <tr key={r.sk}>
              <td style={{...cell,color:SK_COLORS[r.sk]||C.txD,fontWeight:600}}>
                {SN[r.sk]||r.sk.toUpperCase()} {r.lv}{r.assumed?" ◂ trained":""}</td>
              <td style={{...cell,color:C.tx}}>{fmt(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{fontSize:9,color:C.txM,marginTop:6,lineHeight:1.4}}>
        assuming "{SN[fc.assumed]||fc.assumed}" stays the trained skill (standard week, coach {coachDb});
        the trained-skill range spans the talent band, other skills are GT-alone upper bounds.
        Out-of-sample: model pops 80% within ±2 w (n=767); this card's ranges 94%, bounds 93% satisfied.
      </div>
    </div>
  );
}

// ─── Target Build Order card (v18) ─────────────────────────────────────────
function TargetBuildOrder({skills,td,age,ssw,subsFloat,coachDb}){
  const[tg,setTg]=useState({});
  const[res,setRes]=useState(null);
  const cardS={background:C.card,borderRadius:10,padding:"16px 20px",marginTop:12,
    borderLeft:`3px solid ${C.acc}`};
  const labS={fontSize:10,fontFamily:_fs,color:C.txM,textTransform:"uppercase",
    letterSpacing:"0.1em",marginBottom:4};
  const inpS={background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.tx,
    fontFamily:_ft,fontSize:13,padding:"6px 8px",width:"100%",outline:"none",
    boxSizing:"border-box",textAlign:"center"};
  const eff={};
  for(const sk of OS){
    const cur=skills[sk]||0;
    const t=Math.round(tg[sk]??cur);
    if(t>cur&&t<=_MX)eff[sk]=t;
  }
  const n=Object.keys(eff).length;
  const run=()=>setRes(optimizeBlockOrder(skills,td,age,ssw,eff,subsFloat,coachDb));
  return(
    <div style={cardS}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
        <div style={{...labS,color:C.acc,marginBottom:0}}>🎯 Target build order — which skill first?</div>
      </div>
      <div style={{fontSize:11,color:C.txM,lineHeight:1.5,marginBottom:12}}>
        Pick target levels (a skill left at its current level is excluded). Every
        block order is simulated exactly — the age factor makes expensive skills
        (pace) cheaper to buy early, so the ranking replaces the rule of thumb.
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginBottom:12}}>
        {OS.map(sk=>{
          const cur=skills[sk]||0;
          return(
            <div key={sk}>
              <div style={{...labS,color:SK_COLORS[sk]}}>{SN[sk]} <span style={{color:C.txM}}>(now {cur})</span></div>
              <input type="number" min={cur} max={_MX} step={1}
                value={tg[sk]??cur}
                onChange={e=>{const v=parseInt(e.target.value,10);
                  setTg(o=>({...o,[sk]:isNaN(v)?cur:Math.min(_MX,Math.max(cur,v))}));setRes(null);}}
                style={inpS}/>
            </div>
          );
        })}
      </div>
      <button onClick={run} disabled={n===0} style={{
        padding:"8px 18px",fontSize:12,fontFamily:_ft,fontWeight:700,borderRadius:6,
        cursor:n===0?"not-allowed":"pointer",
        background:n===0?C.hi:C.acc+"22",color:n===0?C.txM:C.acc,
        border:`1px solid ${n===0?C.bdr:C.acc}`,
      }}>Rank block orders{n>0?` (${Array.from({length:n},(_,i)=>i+1).reduce((a,b)=>a*b,1)} sims)`:""}</button>
      {res&&res.orders.length>0&&(
        <div style={{marginTop:14}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:_ft}}>
            <thead>
              <tr style={{color:C.txM,textAlign:"left"}}>
                <th style={{padding:"4px 8px"}}>Order</th>
                <th style={{padding:"4px 8px"}}>Weeks</th>
                <th style={{padding:"4px 8px"}}>Done</th>
              </tr>
            </thead>
            <tbody>
              {res.orders.map((o,i)=>{
                const isBest=res.best&&o===res.best;
                return(
                  <tr key={i} style={{borderTop:`1px solid ${C.bdr}55`,
                    color:o.weeks==null?C.txM:isBest?C.pop:C.tx,
                    fontWeight:isBest?700:400}}>
                    <td style={{padding:"5px 8px"}}>{o.order.map(sk=>SN[sk]).join(" → ")}</td>
                    <td style={{padding:"5px 8px"}}>{o.weeks==null?"—":o.weeks}</td>
                    <td style={{padding:"5px 8px"}}>{o.weeks==null
                      ?"✗ not before age 28"
                      :`age ${o.endAge}${isBest?"  ← fastest":""}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!res.best&&(
            <div style={{marginTop:8,fontSize:11,color:C.warn}}>
              No order reaches every target before age 28 — lower a target.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
export default function App(){
  // ─── Stage navigation ──────────────────────────────────────────────────
  // v13: app boots on the new Stage 0 ("How it works") intro card.
  // Users navigate to Stage 1 via the explicit Get Started button or the
  // tab strip. Repeat users can click straight to Player; no persistence
  // of "I've seen the intro" yet — that's a v14 candidate if friction shows.
  const[stage,setStage]=useState("intro"); // "intro" | "player" | "plan" | "export"

  // ─── Player ID (drives all fetch/handoff actions) ──────────────────────
  const[pid,setPid]=useState("");

  // ─── Stage 1: input tile activation (multi-select) ─────────────────────
  // v13: default load path is "Known history" (was "Paste card" in v11–v12).
  // Tile keys retained ("history", "card", "manual") so all existing
  // handlers work unchanged; only labels and order in the picker change.
  const[tilesOn,setTilesOn]=useState({card:false,history:true,manual:false});
  const toggleTile=(k)=>setTilesOn(t=>({...t,[k]:!t[k]}));

  // ─── Card paste state ──────────────────────────────────────────────────
  const[paste,setPaste]=useState("");
  const[parsed,setParsed]=useState(null);
  const[playerName,setPlayerName]=useState("");
  const[playerWarnings,setPlayerWarnings]=useState([]);

  // ─── Training history state ────────────────────────────────────────────
  const[historyText,setHistoryText]=useState("");
  const[historyReports,setHistoryReports]=useState(null);
  const[historyMeta,setHistoryMeta]=useState({});
  const[historyError,setHistoryError]=useState("");

  // v8: corpus share state — default ON, persisted in localStorage as opt-out
  const[shareEnabled,setShareEnabled]=useState(()=>{
    try{return localStorage.getItem(_SB_OPT_OUT_KEY)!=="1";}catch{return true;}
  });
  const[shareStatus,setShareStatus]=useState(""); // "" | "sent" | "duplicate" | "failed"
  const[showShareInfo,setShowShareInfo]=useState(false);
  const updateShare=useCallback((on)=>{
    setShareEnabled(on);
    try{
      if(on)localStorage.removeItem(_SB_OPT_OUT_KEY);
      else localStorage.setItem(_SB_OPT_OUT_KEY,"1");
    }catch{}
    if(!on)recordOptOut(); // record the opt-out moment
  },[]);

  // ─── Skill editor state ────────────────────────────────────────────────
  const[skills,setSkills]=useState({pace:10,technique:8,passing:6,defending:7,playmaking:9,striker:10});
  const[subs,setSubs]=useState({...DEF_SUBS});
  const[age,setAge]=useState(20);
  const[coachDb,setCoachDb]=useState(93);   // v19: head-coach DB (93 = unearthly assumption)
  // v20: external talent prior (Mikoos / SkTables / other tool)
  const[priorRaw,setPriorRaw]=useState("");
  const[priorScale,setPriorScale]=useState("senior");
  const[hasPlayerData,setHasPlayerData]=useState(false);

  // ─── Stage 2: simulation params + results ──────────────────────────────
  const[ysTalent,setYsTalent]=useState("3.50");
  const[pos,setPos]=useState("ATT");
  const[weeks,setWeeks]=useState(52);
  const[ssw,setSsw]=useState(1);
  // v14: visible note when the season-rollover derivation adjusts age/ssw
  const[seasonNote,setSeasonNote]=useState("");
  const[selStrats,setSelStrats]=useState(["round_robin","closest_to_pop","sale_optimizer"]);
  const[results,setResults]=useState(null);
  const[showLog,setShowLog]=useState(null);
  // v15: which strategy drives the Projected card. Set to best weighted
  // score on each run (initial state only — user overrides by clicking a
  // strategy column header in the comparison table).
  const[projStrat,setProjStrat]=useState(null);
  // v16: demo-player session flag (suppresses corpus, shows the banner)
  const[demoMode,setDemoMode]=useState(false);
  // v16: hybrid auto-run — key of the params the current results were
  // computed from; mismatch with the live params marks results stale.
  const[lastRunKey,setLastRunKey]=useState(null);
  // v16: simple/advanced split + export panel collapse
  const[advOpen,setAdvOpen]=useState(false);
  const[exportOpen,setExportOpen]=useState(false);
  // v16: viewport width — below 720px the tab strip docks to the bottom
  // (thumb-reachable) and the page gains bottom padding to clear it.
  const[winW,setWinW]=useState(typeof window!=="undefined"?window.innerWidth:1280);
  useEffect(()=>{
    const f=()=>setWinW(window.innerWidth);
    window.addEventListener("resize",f);
    return()=>window.removeEventListener("resize",f);
  },[]);
  const isMobile=winW<720;
  // v8.3: which plans the user has selected to include in the export bundle
  // (independent of the share-to-corpus flow, which always includes everything)
  const[planExportSel,setPlanExportSel]=useState({});
  // v8.4: Manual Schedule Builder
  const[manualEnabled,setManualEnabled]=useState(false);
  const[manualSchedule,setManualSchedule]=useState([]); // array of skill names
  const[manualHistory,setManualHistory]=useState([]); // for undo (snapshots before each mutation)
  const[manualSeedFrom,setManualSeedFrom]=useState("round_robin");

  // ─── Derived values (declared before callbacks for TDZ safety) ─────────
  const ysNum=parseFloat(ysTalent)||3.5;
  const td=_fromYS(Math.max(3.0,ysNum));
  const subsFloat=useMemo(()=>{
    const o={};for(const sk of OS)o[sk]=(subs[sk]??25)/100;return o;
  },[subs]);

  // v12: gap-based talent estimate from training history. Memoised on
  // historyReports — recomputed whenever the user (re)loads history.
  // v14: routed through estimateTalentCombined — balance-v1 verdict when
  // enough known-start events exist, v12 gap estimate otherwise (.method
  // tells the chip which estimator produced the number).
  // v20: prior band in DB — the entered point ± half a display step in its
  // own scale, converted endpoint-wise (the scales are convex, so the DB
  // width varies along the curve).
  const priorBand=useMemo(()=>{
    const v=parseFloat(priorRaw);
    if(!isFinite(v))return null;
    let a,b;
    if(priorScale==="db"){a=v-1;b=v+1;}
    else if(priorScale==="ys"){a=_fromYS(Math.max(3,v+0.05));b=_fromYS(Math.max(3,v-0.05));}
    else{a=_dbFromSenior(v+0.05);b=_dbFromSenior(v-0.05);}
    if(!isFinite(a)||!isFinite(b))return null;
    return[Math.max(0,Math.min(a,b)),Math.min(100,Math.max(a,b))];
  },[priorRaw,priorScale]);
  const talentEstimate=useMemo(()=>{
    if(!historyReports||!historyReports.length)return null;
    return estimateTalentCombined(historyReports,{coachDb,prior:priorBand}); // v19/v20
  },[historyReports,coachDb,priorBand]);
  // YS-standard scale value the Apply button writes to the input.
  // _csYsFromTd matches the inverse of _fromYS — round-trips cleanly.
  const estYs=talentEstimate&&isFinite(talentEstimate.td)
    ?_csYsFromTd(talentEstimate.td):null;

  // v8.4: Manual Schedule auto-resimulates whenever the schedule or player state changes.
  // Declared before any callback that references it (TDZ safety).
  const manualResult=useMemo(()=>{
    if(!manualEnabled||manualSchedule.length===0)return null;
    return runPlanFromSchedule(skills,td,age,ssw,pos,manualSchedule,subsFloat,coachDb);
  },[manualEnabled,manualSchedule,skills,td,age,ssw,pos,subsFloat]);

  // Merged view that the comparison table iterates over: stored results + manual.
  const displayResults=useMemo(()=>{
    const m={};
    if(results)for(const k of Object.keys(results))m[k]=results[k];
    if(manualResult)m.manual=manualResult;
    return Object.keys(m).length?m:null;
  },[results,manualResult]);

  // v15: non-simulated card fields (stamina, keeper, form, actual value)
  // pulled from whichever load path supplied them — paste card first, then
  // the last training report. All optional; SokkerCard renders "?" / omits
  // rows when absent.
  // v17 (F5): NT-training weeks in the loaded history. National-team
  // coaching delivers extra XP the model doesn't see, accelerating pops —
  // the estimate reads better (lower YS) than real (Bledy case, forum
  // 2026-07-02). Detection: any national minutes in the report stream.
  const ntWeeks=useMemo(()=>{
    if(!historyReports)return 0;
    return historyReports.filter(r=>{
      const g=r.games||{};
      return (g.minutesNational||0)>0||(g.minutesNtOfficial||0)>0;
    }).length;
  },[historyReports]);

  const cardMeta=useMemo(()=>{
    const lastRep=historyReports?.length?historyReports[historyReports.length-1]:null;
    const num=v=>{const n=parseInt(v,10);return isFinite(n)?n:null;};
    return{
      stamina:num(parsed?.skills?.stamina)??num(lastRep?.skills?.stamina),
      keeper:num(parsed?.skills?.keeper)??num(lastRep?.skills?.keeper),
      form:num(parsed?.form)??num(lastRep?.skills?.form),
      actualValue:(parsed?.value&&parsed.value>0)?parsed.value
        :(lastRep?.playerValue?.value&&lastRep.playerValue.value>0)?lastRep.playerValue.value:null,
    };
  },[parsed,historyReports]);

  // Keep planExportSel.manual in sync with manual existence
  useEffect(()=>{
    if(manualResult&&!(("manual" in planExportSel))){
      setPlanExportSel(s=>({...s,manual:true}));
    }
  },[manualResult,planExportSel]);

  // ─── Callbacks ─────────────────────────────────────────────────────────
  const handleParse=useCallback(()=>{
    if(!paste.trim())return;
    const p=parsePaste(paste);setParsed(p);
    setDemoMode(false); // v16: pasting a real card leaves demo mode
    if(p.age)setAge(p.age);
    // v15: default horizon = end of age 27 (paste path uses the current
    // ssw — unknown from a card paste). Older players keep the 52 default.
    if(p.age&&p.age<=27){const w=_weeksUntil(p.age,ssw,27,_SL);if(w)setWeeks(w);}
    const sk={};for(const s of OS)sk[s]=p.skills[s]??0;
    setSkills(sk);
    // v7.1: estimate subskills from card value (Mikoos uniform anchor)
    if(p.value&&p.value>0){
      const allSk={...p.skills};
      const est=mikoosEstimateSubskill(allSk,p.form,p.value);
      if(est){
        const pct=Math.round(est.expected*100);
        const newSubs={};for(const s of OS)newSubs[s]=pct;
        setSubs(newSubs);
      }else{
        setSubs({...DEF_SUBS});
      }
    }else{
      setSubs({...DEF_SUBS});
    }
    setPlayerName(p.name||"");setPlayerWarnings(p.warnings||[]);
    setHasPlayerData(true);
  },[paste,ssw]); // v15: ssw feeds the end-of-27 default horizon

  // v16: shared load core. handleLoadHistory feeds it the textarea; the
  // demo-player button feeds it the embedded synthetic history. opts.demo
  // suppresses the corpus submission (synthetic data must NEVER reach
  // Supabase) and labels the session as a demo.
  const applyHistoryText=useCallback((text,opts={})=>{
    setHistoryError("");
    if(!text.trim()){setHistoryError("Paste training history first.");return;}
    let reports;
    try{reports=parseTrainingData(text);}
    catch(ex){setHistoryError(ex.message||"Parse failed.");return;}
    const meta=text.trim().startsWith("<")?detectPlayerMeta(text):{};
    setDemoMode(!!opts.demo);
    setHistoryReports(reports);setHistoryMeta(meta);
    const last=reports[reports.length-1];
    if(last){
      // v14: season-rollover-aware start derivation (see _deriveStart).
      const d=_deriveStart(reports);
      if(d){
        setAge(d.age);
        if(d.ssw!=null)setSsw(d.ssw);
        if(d.bumped)setSeasonNote(`Season rolled over since the last report — starting age adjusted to ${d.age} (was ${d.age-1}), season week set to 1.`);
        else if(d.ssw!=null)setSeasonNote(`Season week auto-set to ${d.ssw} from the report stream.`);
        else setSeasonNote("");
      }else if(last.age)setAge(last.age);
      // v15: default horizon = end of age 27, from the derived (age, ssw)
      // when the rollover derivation resolved them, else last-report age +
      // current ssw. Older players keep the existing horizon.
      {
        const hA=d?.age??(last.age?parseInt(last.age,10):null);
        const hS=d?.ssw??ssw;
        if(hA&&hA<=27){const w=_weeksUntil(hA,hS,27,_SL);if(w)setWeeks(w);}
      }
      const sk={};for(const s of OS)sk[s]=last.skills?.[s]??0;
      setSkills(sk);
      // v7.2: full forward simulation per skill (replaces uniform Mikoos)
      // Falls back to uniform Mikoos if sim returns null (no value, no anchor).
      const tdNow=_fromYS(Math.max(3.0,parseFloat(ysTalent)||3.5));
      const sim=simulateSubskills(reports,tdNow,coachDb/93 /*v19*/);
      if(sim&&sim.subskills){
        const newSubs={};
        for(const s of OS){
          const f=sim.subskills[s];
          newSubs[s]=Math.max(0,Math.min(99,Math.round((f??0.25)*100)));
        }
        setSubs(newSubs);
      }else{
        // Fallback: uniform Mikoos from latest snapshot
        const lastVal=last.playerValue?.value;const lastForm=last.skills?.form;
        if(lastVal&&lastVal>0){
          const est=mikoosEstimateSubskill({...last.skills},lastForm,lastVal);
          if(est){
            const pct=Math.round(est.expected*100);
            const newSubs={};for(const s of OS)newSubs[s]=pct;
            setSubs(newSubs);
          }else setSubs({...DEF_SUBS});
        }else setSubs({...DEF_SUBS});
      }
      if(meta.name&&!playerName)setPlayerName(meta.name);
      setHasPlayerData(true);
      // v8.1: fire-and-forget corpus submission (unless opted out)
      // CRITICAL: fold in PID from the form field — Sokker's JSON endpoint
      // doesn't carry the PID inside the response, only in the URL the user
      // requested. Without this, every JSON-loaded bundle is anonymous.
      if(shareEnabled&&!opts.demo){
        setShareStatus(""); // clear any previous status
        const pidNum=pid&&/^\d+$/.test(pid)?parseInt(pid,10):null;
        const subsForBundle={};
        for(const s of OS){
          const f=sim&&sim.subskills?sim.subskills[s]:null;
          subsForBundle[s]=f!=null?Math.max(0,Math.min(99,Math.round(f*100))):25;
        }
        // v8.3: include any plans the user has run in this session
        const corpusPlans={};
        if(results){
          for(const k of Object.keys(results)){
            const p=extractPlan(results[k],k,{weeks,pos,ssw});
            if(p)corpusPlans[k]=p;
          }
        }
        const bundle=buildBundle({prior:priorBand,
          reports,
          rawText:text,
          playerMeta:{...meta,player_id:meta?.player_id||pidNum},
          skills:sk,
          subs:subsForBundle,
          age:last.age||21,
          ysTalent,td:tdNow,pos,weeks,ssw,
          playerName:meta?.name||playerName,
          plans:corpusPlans,
        });
        submitBundleToCorpus(bundle).then(r=>{
          if(r.ok)setShareStatus(r.duplicate?"duplicate":"sent");
          else setShareStatus("failed");
          setTimeout(()=>setShareStatus(""),4000);
        });
      }
    }
  },[playerName,ysTalent,shareEnabled,pos,weeks,ssw,pid,results]);
  const handleLoadHistory=useCallback(()=>applyHistoryText(historyText),[applyHistoryText,historyText]);

  // v16: demo player — one-click first experience. Loads the embedded
  // synthetic history through the exact same path as a real paste.
  const loadDemo=useCallback(()=>{
    setPid("");setPlayerName(DEMO_PLAYER_NAME);
    setTilesOn({card:false,history:true,manual:false});
    setHistoryText(DEMO_HISTORY_JSON);
    applyHistoryText(DEMO_HISTORY_JSON,{demo:true});
    setStage("player");
  },[applyHistoryText]);

  // v16: hybrid auto-run. The sim-parameter fingerprint the results were
  // computed against; any live mismatch renders the stale ribbon.
  const paramKey=useMemo(()=>JSON.stringify([skills,subs,age,ssw,pos,weeks,ysTalent,[...selStrats].sort()]),
    [skills,subs,age,ssw,pos,weeks,ysTalent,selStrats]);
  const resultsStale=!!results&&lastRunKey!==null&&paramKey!==lastRunKey;

  // v8.1: load a previously-exported calibration bundle from disk.
  // Restores the same state Load History would produce, but skips corpus
  // submission (data is already in the corpus from the original export).
  const handleLoadBundle=useCallback((file)=>{
    if(!file)return;
    setHistoryError("");
    setDemoMode(false); // v16: loading a real bundle leaves demo mode
    const reader=new FileReader();
    reader.onerror=()=>setHistoryError("Could not read file.");
    reader.onload=()=>{
      let bundle;
      try{bundle=JSON.parse(reader.result);}
      catch(ex){setHistoryError("Not a valid JSON file: "+ex.message);return;}
      // Accept both the v6+ envelope and a bare reports array
      let reports;
      if(Array.isArray(bundle)){
        reports=bundle;bundle={reports};
      }else if(Array.isArray(bundle?.reports)){
        reports=bundle.reports;
      }else{
        setHistoryError("File does not contain a 'reports' array.");return;
      }
      if(reports.length===0){
        setHistoryError("Bundle has no training records.");return;
      }
      reports.sort((a,b)=>(a.week||0)-(b.week||0));
      setHistoryText(JSON.stringify({reports},null,2));
      setHistoryReports(reports);
      const meta={
        player_id:bundle.player?.player_id||null,
        name:bundle.player?.name||null,
      };
      setHistoryMeta(meta);
      // Restore PID field if present in bundle
      if(meta.player_id&&!pid)setPid(String(meta.player_id));
      // Restore name
      if(meta.name)setPlayerName(meta.name);
      // Restore stage 1 inputs from user_snapshot if present
      const snap=bundle.user_snapshot||{};
      if(snap.age_current)setAge(snap.age_current);
      if(snap.position_assumed)setPos(snap.position_assumed);
      if(snap.horizon_weeks)setWeeks(snap.horizon_weeks);
      if(snap.start_season_week)setSsw(snap.start_season_week);
      if(snap.ys_talent_user)setYsTalent(String(snap.ys_talent_user));
      // v14: the snapshot's age/ssw were correct at EXPORT time but go stale
      // across a season boundary the same way a raw history does. When the
      // report stream yields a boundary phase, the derivation overrides them.
      {
        const d=_deriveStart(reports);
        if(d&&d.ssw!=null){
          setAge(d.age);setSsw(d.ssw);
          setSeasonNote(d.bumped
            ?`Season rolled over since the last report — starting age adjusted to ${d.age}, season week set to 1.`
            :`Season week auto-set to ${d.ssw} from the report stream.`);
        }else setSeasonNote("");
      }
      // Apply skills from latest report (matches Load History behavior)
      const last=reports[reports.length-1];
      const sk={};for(const s of OS)sk[s]=last.skills?.[s]??0;
      setSkills(sk);
      // Apply subskills: prefer the bundle's stored estimates; else re-run the simulator
      if(snap.subskills_estimate){
        const newSubs={};
        for(const s of OS){
          const f=snap.subskills_estimate[s];
          newSubs[s]=f!=null?Math.max(0,Math.min(99,Math.round(f*100))):25;
        }
        setSubs(newSubs);
      }else{
        const tdNow=_fromYS(Math.max(3.0,parseFloat(snap.ys_talent_user||ysTalent)||3.5));
        const sim=simulateSubskills(reports,tdNow,coachDb/93 /*v19*/);
        if(sim&&sim.subskills){
          const newSubs={};
          for(const s of OS){
            const f=sim.subskills[s];
            newSubs[s]=Math.max(0,Math.min(99,Math.round((f??0.25)*100)));
          }
          setSubs(newSubs);
        }else setSubs({...DEF_SUBS});
      }
      setHasPlayerData(true);
      // v8.3: restore plans by re-running the strategies the bundle recorded.
      // We re-simulate (rather than wrapping the saved schedule directly)
      // because the sim produces the full result shape Stage 2 expects.
      // The saved schedule will match the re-sim as long as nothing about
      // the player state has changed since export.
      if(bundle.plans&&Object.keys(bundle.plans).length>0){
        const planKeys=Object.keys(bundle.plans);
        // Apply the saved horizon/position/ssw if they were stored, else keep current
        const savedHorizon=bundle.plans[planKeys[0]]?.horizon_weeks||snap.horizon_weeks||52;
        const savedPos=bundle.plans[planKeys[0]]?.position||snap.position_assumed||"ATT";
        const savedSsw=bundle.plans[planKeys[0]]?.start_season_week||snap.start_season_week||1;
        // Compute talent_db from YS talent (snap or current state)
        const ysForTd=parseFloat(snap.ys_talent_user||ysTalent)||3.5;
        const tdForSim=_fromYS(Math.max(3.0,ysForTd));
        // Compute subskill floats from the snapshot or fall back to defaults
        const subFloats={};
        for(const s of OS){
          const f=snap.subskills_estimate?.[s];
          subFloats[s]=f!=null?f:0.25;
        }
        const ageForSim=snap.age_current||last.age||21;
        const restored={};
        for(const k of planKeys){
          if(k==="sale_optimizer"){
            restored[k]=runSaleOpt(sk,tdForSim,ageForSim,savedHorizon,savedPos,subFloats,savedSsw,3,coachDb);
          }else if(STRATS[k]){
            restored[k]=runPlan(sk,tdForSim,ageForSim,savedSsw,savedPos,k,savedHorizon,subFloats);
          }
        }
        if(Object.keys(restored).length>0){
          setResults(restored);
          // Default-select all restored plans for re-export
          const sel={};for(const k of Object.keys(restored))sel[k]=true;
          setPlanExportSel(sel);
          setSelStrats(planKeys.filter(k=>STRATS[k]||k==="sale_optimizer"));
        }
      }
      // No corpus submission — this data already exists in the corpus.
    };
    reader.readAsText(file);
  },[pid,ysTalent]);

  const handleManualActivate=useCallback(()=>{
    // Activating manual entry alone marks data as "ready" so the user can proceed
    setHasPlayerData(true);
  },[]);

  const handleOpenTrainingReport=useCallback(()=>{
    if(!pid||!/^\d+$/.test(pid.trim()))return;
    window.open(`https://sokker.org/api/training/${pid.trim()}/report`,"_blank","noopener,noreferrer");
  },[pid]);

  const handleExportBundle=useCallback(()=>{
    // v8.3: include only plans the user ticked in the picker.
    const plans={};
    if(displayResults){
      for(const k of Object.keys(displayResults)){
        if(planExportSel[k]){
          const p=extractPlan(displayResults[k],k,{weeks,pos,ssw});
          if(p)plans[k]=p;
        }
      }
    }
    const bundle=buildBundle({prior:priorBand,
      reports:historyReports,
      rawText:historyText||null,
      playerMeta:{...historyMeta,player_id:historyMeta?.player_id||(pid&&/^\d+$/.test(pid)?parseInt(pid,10):null)},
      skills,subs,age,
      ysTalent,td,pos,weeks,ssw,playerName,
      plans,
    });
    const idPart=pid&&/^\d+$/.test(pid)?pid:(historyMeta?.player_id?`${historyMeta.player_id}`:(playerName||"player").replace(/[^a-zA-Z0-9]+/g,"_").slice(0,40)||"player");
    const ts=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
    downloadBundle(bundle,`sokker_bundle_${idPart}_${ts}.json`);
  },[historyReports,historyText,historyMeta,pid,skills,subs,age,ysTalent,td,pos,weeks,ssw,playerName,displayResults,planExportSel]);

  const runSim=useCallback(()=>{
    const res={};
    for(const k of selStrats){
      if(k==="sale_optimizer") res[k]=runSaleOpt(skills,td,age,weeks,pos,subsFloat,ssw,3,coachDb);
      else res[k]=runPlan(skills,td,age,ssw,pos,k,weeks,subsFloat,coachDb);
    }
    setResults(res);setShowLog(null);
    // v8.3: default-select all newly-computed plans for export
    const sel={};for(const k of Object.keys(res))sel[k]=true;
    setPlanExportSel(sel);
    // v15: initial projection = best weighted score of this run
    const rk=Object.keys(res);
    if(rk.length)setProjStrat(rk.reduce((a,b)=>wScore(res[a])>=wScore(res[b])?a:b));
    // v16: fingerprint the params these results answer (staleness ribbon)
    setLastRunKey(paramKey);
  },[skills,td,age,ssw,pos,weeks,selStrats,subsFloat,paramKey]);

  // v16: hybrid auto-run — run once when a player first loads (kills the
  // empty results panel). Parameter edits afterwards only mark results
  // stale; the user reruns explicitly.
  useEffect(()=>{
    if(hasPlayerData&&!results&&selStrats.length)runSim();
  },[hasPlayerData,results,selStrats,runSim]);

  // v8.4: Manual Schedule mutation handlers — each snapshots before mutating
  // so Undo can step back through any number of changes.
  const _snapshotManual=useCallback(()=>{
    setManualHistory(h=>[...h.slice(-49),manualSchedule]); // cap at 50 snapshots
  },[manualSchedule]);

  const manualAppend=useCallback((skill,count=1)=>{
    _snapshotManual();
    setManualSchedule(s=>{
      const n=Math.max(1,Math.min(parseInt(count,10)||1,52));
      const out=[...s];
      for(let i=0;i<n;i++)out.push(skill);
      return out;
    });
  },[_snapshotManual]);

  const manualDeleteAt=useCallback((idx)=>{
    _snapshotManual();
    setManualSchedule(s=>s.filter((_,i)=>i!==idx));
  },[_snapshotManual]);

  const manualUndo=useCallback(()=>{
    setManualHistory(h=>{
      if(h.length===0)return h;
      const prev=h[h.length-1];
      setManualSchedule(prev);
      return h.slice(0,-1);
    });
  },[]);

  const manualClear=useCallback(()=>{
    if(manualSchedule.length===0)return;
    if(!window.confirm(`Clear all ${manualSchedule.length} weeks?`))return;
    _snapshotManual();
    setManualSchedule([]);
  },[manualSchedule.length,_snapshotManual]);

  const manualSeed=useCallback(()=>{
    // Seed by running the chosen strategy and lifting its schedule
    let seedSched;
    if(manualSeedFrom==="sale_optimizer"){
      const r=runSaleOpt(skills,td,age,weeks,pos,subsFloat,ssw,3,coachDb);
      seedSched=r.log.map(w=>w.trained);
    }else if(STRATS[manualSeedFrom]){
      const r=runPlan(skills,td,age,ssw,pos,manualSeedFrom,weeks,subsFloat,coachDb);
      seedSched=r.log.map(w=>w.trained);
    }else return;
    if(manualSchedule.length>0){
      if(!window.confirm(`Replace current schedule (${manualSchedule.length} weeks) with ${manualSeedFrom} (${seedSched.length} weeks)?`))return;
    }
    _snapshotManual();
    setManualSchedule(seedSched);
  },[manualSeedFrom,skills,td,age,ssw,pos,weeks,subsFloat,manualSchedule.length,_snapshotManual]);

  const manualToggle=useCallback(()=>{
    setManualEnabled(e=>{
      const next=!e;
      // First-time enable: seed empty so user gets a clean slate
      if(next&&manualSchedule.length===0)setManualSchedule([]);
      return next;
    });
  },[manualSchedule.length]);

  const prof=POS[pos];
  function wScore(r){
    return OS.reduce((s,sk)=>{
      const w=prof.w[sk]||0;
      const sub=r.log.length?r.log[r.log.length-1].subs[sk]:0;
      return s+w*(r.finalSkills[sk]+sub);
    },0);
  }

  // ─── Shared styles ─────────────────────────────────────────────────────
  // v16: visual pass — cards distinguish by background contrast instead
  // of borders; labels recede; one accent color for actions.
  const sC={background:C.card,borderRadius:10,padding:"16px 20px",marginBottom:12};
  const sL={fontSize:10,fontFamily:_fs,color:C.txM,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4};
  const sI={background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:6,color:C.tx,fontFamily:_ft,fontSize:13,padding:"8px 10px",width:"100%",outline:"none",boxSizing:"border-box"};
  const sSel={...sI,cursor:"pointer",appearance:"none",paddingRight:28,backgroundImage:`url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%238a96a8' stroke-width='1.5'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center"};
  const sB={background:C.acc,color:"#fff",border:"none",borderRadius:6,padding:"10px 20px",fontFamily:_fs,fontWeight:600,fontSize:14,cursor:"pointer"};
  const sBs={...sB,padding:"6px 14px",fontSize:12,background:C.hi,color:C.txD,border:`1px solid ${C.bdr}`};
  const allStrats={
    ...STRATS,
    sale_optimizer:{name:"Sale Optimizer",desc:"Minimize carry-in — best for selling"},
    manual:{name:"Manual Schedule",desc:"Hand-built week-by-week"},
  };
  const validStrats=Object.fromEntries(Object.entries(allStrats).filter(([k,v])=>!v.validPos||v.validPos.includes(pos)));

  // ─── Stage tab styling ─────────────────────────────────────────────────
  const stageTab=(k,label,num,enabled=true)=>{
    const active=stage===k;
    return(
      <button key={k} disabled={!enabled} onClick={()=>setStage(k)} style={{
        flex:1,padding:"14px 10px",background:active?C.acc:"transparent",
        color:active?"#fff":enabled?C.tx:C.txM,
        border:`1px solid ${active?C.acc:C.bdr}`,
        borderRadius:8,fontFamily:_fs,fontWeight:active?600:500,fontSize:14,
        cursor:enabled?"pointer":"not-allowed",opacity:enabled?1:0.5,
        transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center",gap:10,
      }}>
        <span style={{
          display:"inline-flex",alignItems:"center",justifyContent:"center",
          width:24,height:24,borderRadius:"50%",
          background:active?"rgba(255,255,255,0.18)":C.hi,
          color:active?"#fff":C.txD,fontSize:12,fontWeight:700,fontFamily:_ft,
        }}>{num}</span>
        {label}
      </button>
    );
  };

  // ─── Tile styling ──────────────────────────────────────────────────────
  const inputTile=(k,icon,title,desc)=>{
    const on=tilesOn[k];
    return(
      <button key={k} onClick={()=>toggleTile(k)} style={{
        flex:1,minWidth:140,padding:"14px 14px",
        background:on?C.acc+"18":C.card,
        border:`1px solid ${on?C.acc:C.bdr}`,
        borderLeft:on?`3px solid ${C.acc}`:`1px solid ${C.bdr}`,
        borderRadius:8,cursor:"pointer",textAlign:"left",
        display:"flex",flexDirection:"column",gap:4,
        transition:"all .15s",fontFamily:_fs,
      }}>
        <div style={{fontSize:13,fontWeight:600,color:on?C.acc:C.tx}}>
          {on?"✓ ":""}{icon} {title}
        </div>
        <div style={{fontSize:11,color:C.txM,lineHeight:1.4}}>{desc}</div>
      </button>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return(
    <div style={{background:C.bg,minHeight:"100vh",color:C.tx,fontFamily:_fs,
      padding:isMobile?"16px 14px 84px":"20px 24px"}}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:4}}>
        <span style={{fontSize:22,fontWeight:700,color:C.acc,fontFamily:_ft}}>⚽ Sokker Training Planner</span>
        <span style={{fontSize:12,color:C.txM}}>v13 · v25 threshold · coach 91 · staged interface</span>
      </div>
      <div style={{fontSize:12,color:C.txM,marginBottom:20}}>
        Load a player, plan their training, export a calibration bundle.
      </div>

      {/* v16: demo-mode banner — visible on every stage while active */}
      {demoMode&&(
        <div style={{background:C.warn+"18",border:`1px solid ${C.warn}66`,borderRadius:8,
          padding:"8px 14px",marginBottom:12,fontSize:12,color:C.warn,display:"flex",alignItems:"center",gap:10}}>
          <span>🧪 <b>Demo player</b> — a synthetic history generated by the engine (not a real Sokker player). Nothing is submitted to the corpus. Load your own player on the Player tab any time.</span>
        </div>
      )}

      {/* ── Stage tabs (freely navigable) ────────────────────────────── */}
      {/* v13: added "How" tab (Stage 0). Numbered 0 to keep Player/Plan/
          Export at their familiar positions. */}
      <div style={isMobile?{
        position:"fixed",bottom:0,left:0,right:0,zIndex:50,display:"flex",gap:0,
        background:C.card,borderTop:`1px solid ${C.bdr}`,padding:"6px 8px",
        paddingBottom:"calc(6px + env(safe-area-inset-bottom))"}
        :{display:"flex",gap:8,maxWidth:1300,marginBottom:20}}>
        {stageTab("intro","How",0)}
        {stageTab("player","Player",1)}
        {stageTab("plan","Plan",2)}
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* STAGE 0 — HOW IT WORKS (intro card, v13)                          */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* Self-contained onboarding view. The app boots into this stage so
          first-time visitors get the goals + the two loading paths +
          how to read the talent estimate before they hit the Player tab.
          Repeat users can click "1 · Player" in the tab strip to skip. */}
      {stage==="intro"&&(
        <div style={{maxWidth:900}}>
          <div style={sC}>
            <div style={{fontSize:18,fontWeight:600,color:C.tx,marginBottom:8,fontFamily:_fs}}>
              How it works
            </div>
            <div style={{fontSize:13,color:C.txD,lineHeight:1.6}}>
              A decision-support tool for Sokker. You give it a player's current state and a
              planning horizon; it returns a side-by-side comparison of training strategies and
              the predicted skill trajectory under each one. Two goals: (1) make the trade-offs
              between strategies explicit so you can pick a plan you trust, (2) build a public
              calibration corpus that sharpens the underlying model with every new history loaded.
            </div>
          </div>

          <div style={sC}>
            <div style={sL}>What it does</div>
            <div style={{fontSize:12,color:C.txD,lineHeight:1.6}}>
              For each candidate strategy, the planner forward-simulates every week of training
              and reports the predicted level of every skill at the horizon, the timing of each
              level-up, and the subskill — the partial fill between level-ups — carried into the
              next one. You compare strategies side by side and pick the one that fits your goals.
            </div>
          </div>

          <div style={sC}>
            <div style={sL}>Two ways to start</div>
            <div style={{fontSize:12,color:C.txD,lineHeight:1.6,marginBottom:12}}>
              Stage 1 offers two entry points.
            </div>
            <div style={{paddingLeft:12,borderLeft:`3px solid ${C.acc}`,marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:600,color:C.tx,marginBottom:4}}>
                Known history <span style={{fontWeight:400,color:C.txM,fontSize:11}}>(recommended)</span>
              </div>
              <div style={{fontSize:12,color:C.txD,lineHeight:1.6}}>
                Load the player's training history from Sokker. The planner reconstructs every
                week, fits a talent estimate from the level-up record (point + confidence band),
                and seeds the subskills via per-skill forward simulation. This is the highest-
                fidelity path, and the only one where the talent number is inferred from data
                rather than guessed. If you have never fetched a training history before, the
                planner walks you through it — no technical knowledge required.
              </div>
            </div>
            <div style={{paddingLeft:12,borderLeft:`3px solid ${C.txM}`}}>
              <div style={{fontSize:13,fontWeight:600,color:C.tx,marginBottom:4}}>No known history</div>
              <div style={{fontSize:12,color:C.txD,lineHeight:1.6}}>
                Paste the player's in-game card — name, age, levels of each skill, value. You
                enter talent yourself (Mikoos, SkTables, or a guess). Subskills default to a
                uniform Mikoos estimate back-solved from the player's value. Use this for
                opponent scouting or for any player whose history you cannot access.
              </div>
            </div>
          </div>

          <div style={sC}>
            <div style={sL}>The three stages</div>
            <ol style={{margin:"6px 0 0 0",paddingLeft:22,fontSize:12,color:C.txD,lineHeight:1.8}}>
              <li><b style={{color:C.tx}}>Player</b> — load the player; confirm skills, age, position, talent.</li>
              <li><b style={{color:C.tx}}>Plan</b> — pick the horizon, pick the strategies to compare, run.</li>
              <li><b style={{color:C.tx}}>Compare</b> — side-by-side deltas, total levels gained, level-up timing. Manual schedules can be built here and simulated alongside the algorithmic strategies.</li>
            </ol>
          </div>

          <div style={sC}>
            <div style={sL}>Reading the talent estimate</div>
            <div style={{fontSize:12,color:C.txD,lineHeight:1.6,marginBottom:8}}>
              When a training history is loaded, a chip under the YS Talent input shows:
            </div>
            <ul style={{margin:"0 0 10px 0",paddingLeft:22,fontSize:12,color:C.txD,lineHeight:1.7}}>
              <li>a point estimate on the YS-standard scale (lower is better; 3.00 is the cap) and the [low, high] band,</li>
              <li>a confidence label, from <code style={{color:C.pop,fontSize:11,fontFamily:_ft,background:"transparent"}}>reliable</code> (history is rich enough to anchor the estimate) down to <code style={{color:C.txM,fontSize:11,fontFamily:_ft,background:"transparent"}}>no_data</code> (too short to infer anything),</li>
              <li>the count of level-ups used and any skills excluded as outliers.</li>
            </ul>
            <div style={{fontSize:12,color:C.txD,lineHeight:1.6}}>
              Click <b style={{color:C.tx}}>Apply</b> to write the estimate into the input. If the
              estimate is flagged contradictory, the model residual exceeds the data — treat the
              number as indicative and check against an external source.
            </div>
          </div>

          <div style={{...sC,borderLeft:`3px solid ${C.warn}`}}>
            <div style={sL}>Caveats</div>
            <ul style={{margin:"0",paddingLeft:22,fontSize:12,color:C.txD,lineHeight:1.7}}>
              <li>The coach value is currently fixed at the corpus-calibrated default. If your coach is lower, the planner will overestimate training gains.</li>
              <li>Drop-eligible ages are excluded from talent estimation: pace from 28, other outfield skills from 30.</li>
              <li>This is a planning tool, not a market valuation tool — the value formula here anchors the simulator, not the transfer market.</li>
            </ul>
          </div>

          <div style={{display:"flex",justifyContent:"flex-end",marginTop:12}}>
            <button onClick={()=>setStage("player")}
              style={{...sB,fontSize:14,padding:"12px 28px"}}>
              Get started — load a player →
            </button>
            <button onClick={loadDemo}
              style={{...sBs,marginLeft:10,padding:"12px 22px",fontSize:14,borderColor:C.pop+"88",color:C.pop}}
              title="Loads a synthetic engine-generated player — see the whole tool working in one click">
              🧪 Try a demo player
            </button>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* STAGE 1 — PLAYER                                                  */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {stage==="player"&&(
        <div style={{maxWidth:1300}}>
          {/* PID input — top of stage */}
          <div style={sC}>
            <div style={sL}>Player ID</div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <input type="text" value={pid} placeholder="e.g. 39028856"
                onChange={e=>{const v=e.target.value;if(/^\d*$/.test(v))setPid(v);}}
                style={{...sI,maxWidth:220,fontSize:15,fontFamily:_ft,letterSpacing:"0.05em"}}/>
              <span style={{fontSize:11,color:C.txM,lineHeight:1.4}}>
                Find it in the URL of any Sokker player page. Optional — but unlocks the one-click training-report fetch below.
              </span>
            </div>
          </div>

          {/* v8.2: Load saved bundle — visible at top of stage, no clicks required */}
          <div style={{...sC,borderLeft:`3px solid ${C.acc}`}}>
            <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
              <div style={{flex:"1 1 280px"}}>
                <div style={sL}>Returning? Load a saved bundle</div>
                <div style={{fontSize:11,color:C.txM,lineHeight:1.5}}>
                  Pick any <code style={{color:C.tx,fontSize:10,fontFamily:_ft}}>sokker_bundle_*.json</code> file
                  exported earlier — yours, or one shared with you. The player, training history, skills, and subskill estimates restore exactly. No need to re-paste anything.
                </div>
              </div>
              <label style={{
                ...sB,padding:"10px 18px",fontSize:13,cursor:"pointer",
                display:"inline-flex",alignItems:"center",gap:8,
              }}>
                📂 Load bundle (.json)
                <input type="file" accept=".json,application/json"
                  style={{display:"none"}}
                  onChange={e=>{
                    const f=e.target.files?.[0];
                    if(f)handleLoadBundle(f);
                    e.target.value="";
                  }}/>
              </label>
            </div>
            {historyError&&<div style={{fontSize:11,color:C.red,marginTop:8}}>⚠ {historyError}</div>}
          </div>

          {/* Tile picker + skill editor — two columns on desktop */}
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:16}}
            className="player-stage-grid">
            {/* LEFT: input tiles + their active blocks */}
            {/* v16: one-click demo entry point */}
            {!hasPlayerData&&(
              <div style={{gridColumn:"1 / -1",display:"flex",alignItems:"center",gap:10,
                background:C.card,borderRadius:8,padding:"10px 14px",marginBottom:4}}>
                <span style={{fontSize:12,color:C.txD}}>No player at hand?</span>
                <button onClick={loadDemo} style={{...sBs,padding:"6px 14px",fontSize:12,borderColor:C.pop+"88",color:C.pop}}>
                  🧪 Try a demo player
                </button>
              </div>
            )}
            <div>
              <div style={sC}>
                <div style={sL}>How are you loading this player?</div>
                <div style={{fontSize:11,color:C.txM,marginBottom:10,lineHeight:1.4}}>
                  Pick one or more — they can stack. Manual entry on top of a parsed card lets you fix anything the parser got wrong.
                </div>
                {/* v13: tile order is now [history, card, manual]. "Known
                    history" (was "Training history") is the recommended
                    path and sits first; "No known history" (was "Paste
                    card") covers the snapshot/scouting case. */}
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {inputTile("history","📄","Known history","Best accuracy. Load the player's training history from Sokker — we'll walk you through it.")}
                  {inputTile("card","📋","No known history","Paste the player's in-game card. You enter talent yourself.")}
                  {inputTile("manual","✏️","Manual entry","Type skills directly. Useful for hypothetical players.")}
                </div>
              </div>

              {/* v13: Training history block now renders FIRST (the
                  recommended path). Card block follows for users without
                  history access. Manual entry stays last as a power-user
                  override. */}
              {tilesOn.history&&(
                <div style={sC}>
                  <div style={sL}>📄 Known history — fetch from Sokker</div>
                  <div style={{fontSize:11,color:C.txM,marginBottom:8,lineHeight:1.4}}>
                    Two steps. <b style={{color:C.tx}}>1.</b> Click the button below — it opens your training report in a new tab.
                    <b style={{color:C.tx}}> 2.</b> Select all the JSON, copy it, come back, paste it in the box.
                    Your Sokker login is required (works only for players on your active roster).
                  </div>
                  <button onClick={handleOpenTrainingReport}
                    disabled={!pid||!/^\d+$/.test(pid.trim())}
                    style={{...sB,width:"100%",marginBottom:10,
                      background:(!pid||!/^\d+$/.test(pid.trim()))?C.hi:C.acc,
                      color:(!pid||!/^\d+$/.test(pid.trim()))?C.txM:"#fff",
                      border:(!pid||!/^\d+$/.test(pid.trim()))?`1px solid ${C.bdr}`:"none",
                      cursor:(!pid||!/^\d+$/.test(pid.trim()))?"not-allowed":"pointer"}}>
                    {pid&&/^\d+$/.test(pid.trim())
                      ?`↗ Open training report for player ${pid}`
                      :"↗ Enter player ID above first"}
                  </button>
                  {/* v8: share toggle */}
                  <div style={{
                    background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:6,
                    padding:"8px 10px",marginBottom:8,fontSize:11,lineHeight:1.5,
                  }}>
                    <label style={{display:"flex",alignItems:"flex-start",gap:8,cursor:"pointer",userSelect:"none"}}>
                      <input type="checkbox" checked={shareEnabled}
                        onChange={e=>updateShare(e.target.checked)}
                        style={{marginTop:2,cursor:"pointer",accentColor:C.acc}}/>
                      <span style={{color:shareEnabled?C.tx:C.txM}}>
                        Share this with the maintainer to improve the model
                        <button type="button"
                          onClick={()=>setShowShareInfo(v=>!v)}
                          style={{background:"none",border:"none",color:C.acc,
                            cursor:"pointer",padding:0,marginLeft:6,fontSize:11,
                            textDecoration:"underline"}}>
                          {showShareInfo?"hide details":"what's shared?"}
                        </button>
                      </span>
                    </label>
                    {showShareInfo&&(
                      <div style={{marginTop:6,paddingLeft:24,color:C.txM,fontSize:10,lineHeight:1.5}}>
                        Sent: player ID and name (if present in your paste), the training-history records you pasted, and the snapshot of estimates this app derived from them (current skills, talent, position).
                        Not sent: your sokker.org credentials, your IP address (we don't log it), your email, anything from other browser tabs.
                        Used for: backtesting the training model against real pop outcomes — the more bundles, the more accurate the planner gets for everyone.
                      </div>
                    )}
                  </div>
                  <textarea value={historyText} onChange={e=>setHistoryText(e.target.value)}
                    placeholder={'Paste here ↓\n\n{\n  "reports": [\n    { "week": 1184, "skills": {...}, ... },\n    ...\n  ]\n}'}
                    style={{...sI,height:120,resize:"vertical",fontFamily:_ft,fontSize:10,lineHeight:1.4}}/>
                  <button onClick={handleLoadHistory} style={{...sB,marginTop:8,width:"100%"}}>Load History</button>
                  {historyError&&<div style={{fontSize:11,color:C.red,marginTop:6}}>⚠ {historyError}</div>}
                  {historyReports&&(()=>{
                    const last=historyReports[historyReports.length-1];
                    const first=historyReports[0];
                    return(
                      <div style={{fontSize:11,color:C.txD,marginTop:8,lineHeight:1.5,fontFamily:_ft}}>
                        <div>✓ Weeks {first.week} → {last.week} ({historyReports.length} records loaded)</div>
                        {historyMeta?.player_id&&<div>Player ID: {historyMeta.player_id}</div>}
                        {historyMeta?.name&&<div>Name: {historyMeta.name}</div>}
                        <div style={{color:C.pop,marginTop:4}}>Current skills/age auto-filled from week {last.week}.</div>
                        {shareStatus==="sent"&&<div style={{color:C.pop}}>✓ Shared with maintainer.</div>}
                        {shareStatus==="duplicate"&&<div style={{color:C.txM}}>· Already shared previously.</div>}
                        {shareStatus==="failed"&&<div style={{color:C.warn}}>· Share failed (your data is fine — just didn't reach the corpus).</div>}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Card paste block (v13: was first, now second) */}
              {tilesOn.card&&(
                <div style={sC}>
                  <div style={sL}>📋 No known history — paste the player's card</div>
                  <textarea value={paste} onChange={e=>setPaste(e.target.value)}
                    placeholder={"Roman Rysio, wiek: 20\nklub: Zabójcze Strzały, kraj: Polska\nwartość : 788 000 zł\nwynagrodzenie: 13 800 zł\ntragiczna [0] forma\nbardzo dobra [9] dyscyplina taktyczna\ndobra [7] kondycja        słaby [4] bramkarz\nświetna [11] szybkość     bardzo dobry [9] obrońca\ndobra [7] technika        celujący [10] rozgrywający\nprzeciętne [5] podania    świetny [11] strzelec"}
                    style={{...sI,height:130,resize:"vertical",fontFamily:_ft,fontSize:11,lineHeight:1.5}}/>
                  <button onClick={handleParse} style={{...sB,marginTop:8,width:"100%"}}>Parse Player Card</button>
                </div>
              )}

              {/* Manual entry block */}
              {tilesOn.manual&&(
                <div style={sC}>
                  <div style={sL}>✏️ Manual entry</div>
                  <div style={{fontSize:11,color:C.txM,marginBottom:8,lineHeight:1.4}}>
                    Edit the skill levels and sub-levels directly in the panel on the right. Useful for hypothetical players or to fix anything the card parser misread.
                  </div>
                  <button onClick={handleManualActivate} style={{...sB,width:"100%"}}>I'll edit on the right →</button>
                </div>
              )}
            </div>

            {/* RIGHT: live skill editor */}
            <div>
              <div style={{...sC,minHeight:300}}>
                {hasPlayerData?(
                  <>
                    <div style={sL}>Player skills & sub-levels</div>
                    {seasonNote&&(
                      <div style={{fontSize:11,color:C.warn,background:C.hi,
                        borderLeft:`3px solid ${C.warn}`,padding:"6px 10px",
                        marginBottom:8,borderRadius:4}}>
                        🗓 {seasonNote}
                      </div>
                    )}
                    <SkillEditor
                      skills={skills} setSkills={setSkills}
                      subs={subs} setSubs={setSubs}
                      age={age} setAge={setAge}
                      pos={pos}
                      name={playerName||null}
                      warnings={playerWarnings}
                      editable={true}
                      talentEstimate={talentEstimate}
                    />
                  </>
                ):(
                  <div style={{textAlign:"center",padding:"60px 20px",color:C.txM}}>
                    <div style={{fontSize:48,marginBottom:12,opacity:0.4}}>👤</div>
                    <div style={{fontSize:13,marginBottom:6,color:C.txD}}>No player loaded yet</div>
                    <div style={{fontSize:12,lineHeight:1.5,maxWidth:280,margin:"0 auto"}}>
                      Pick an input method on the left — paste a card, fetch training history, or enter skills by hand. The editor will populate here.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Continue button */}
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
            <button onClick={()=>setStage("plan")} disabled={!hasPlayerData}
              style={{...sB,fontSize:14,padding:"12px 28px",
                opacity:hasPlayerData?1:0.4,cursor:hasPlayerData?"pointer":"not-allowed"}}>
              Continue to planner →
            </button>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* STAGE 2 — PLAN                                                    */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {stage==="plan"&&(
        <div style={{maxWidth:1300}}>
          {!hasPlayerData&&(
            <div style={{...sC,borderLeft:`3px solid ${C.warn}`}}>
              <div style={{color:C.warn,fontWeight:600,marginBottom:4}}>No player loaded</div>
              <div style={{fontSize:12,color:C.txD}}>
                Go back to <button onClick={()=>setStage("player")} style={{...sBs,padding:"2px 10px",fontSize:11,marginLeft:4,marginRight:4}}>1 · Player</button>
                to load skills before planning.
              </div>
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"minmax(0,360px) minmax(0,1fr)",gap:16}}>
            {/* LEFT: parameters + strategies + run */}
            <div>
              <div style={sC}>
                <div style={sL}>Talent</div>
                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
                  <input type="text" value={ysTalent}
                    onChange={e=>{const v=e.target.value;if(/^\d*\.?\d*$/.test(v))setYsTalent(v);}}
                    style={{...sI,width:80,textAlign:"center",fontSize:16,fontWeight:700}}/>
                  <span style={{fontSize:12,color:C.txM}}>YS scale — 3.00 = best, lower is better</span>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:12}}>
                  {YS_PRESETS.map(p=>(
                    <button key={p.ys} onClick={()=>setYsTalent(p.ys.toFixed(2))} style={{
                      ...sBs,padding:"3px 10px",fontSize:11,
                      ...(Math.abs(ysNum-p.ys)<0.005?{background:C.acc,color:"#fff",borderColor:C.acc}:{}),
                    }}>{p.l}</button>
                  ))}
                </div>
                {/* v12: gap-based talent estimate chip — appears only when
                    a training history is loaded. Confidence colour-codes
                    border (green=reliable, blue=indicative, amber=unreliable,
                    grey=no_data). Apply button writes the YS-standard
                    estimate into the input. */}
                {historyReports&&talentEstimate&&(()=>{
                  const e=talentEstimate;
                  const noData=e.confidence==="no_data"||!isFinite(e.td);
                  const cMap={reliable:C.pop,reliable_via_gap:C.pop,reliable_via_prior:C.pop,
                    low_confidence:C.warn,indicative:C.acc,
                    ceiling_pinned:C.acc,floor_pinned:C.warn,weak:C.warn,
                    unreliable:C.warn,no_data:C.txM};
                  const cBd=cMap[e.confidence]||C.txM;
                  const ysVal=estYs;
                  // Band → YS: clamp td band to [1,100] for display (the
                  // balance band's hi may run virtual past the cap).
                  const bLo=isFinite(e.tdLo)?Math.max(1,Math.min(100,e.tdLo)):null;
                  const bHi=isFinite(e.tdHi)?Math.max(1,Math.min(100,e.tdHi)):null;
                  const ysLo=bHi!=null?_csYsFromTd(bHi):null; // td_hi → ys_lo (tighter ys)
                  const ysHi=bLo!=null?_csYsFromTd(bLo):null; // td_lo → ys_hi
                  const isBal=e.method==="balance"||e.method==="fusion";
                  const pre=e.oneSided==="ge"?"≤":e.oneSided==="le"?"≥":"";
                  return(
                    <div style={{
                      borderLeft:`3px solid ${cBd}`,
                      background:C.hi,
                      padding:"8px 10px",
                      marginBottom:12,
                      fontSize:11,
                    }}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{color:C.txD,fontWeight:600,letterSpacing:0.3}}>EST. FROM HISTORY</span>
                        {noData?(
                          <span style={{color:C.txM,fontStyle:"italic"}}>
                            no estimate — {e.nNoPopSkills>=5?"no pops in history":"not enough informative gaps"}
                          </span>
                        ):(
                          <>
                            {/* v17: the INTERVAL is the estimate. A point
                                would fake precision the data doesn't have
                                (user decision); Apply writes the band
                                midpoint without displaying it. */}
                            <span style={{
                              fontFamily:_ft,fontSize:14,fontWeight:700,color:C.tx,
                            }}>{ysLo!=null&&ysHi!=null&&ysLo!==ysHi
                              ?`${ysLo.toFixed(2)}–${ysHi.toFixed(2)}`
                              :`${pre}${ysVal.toFixed(2)}`}</span>
                            <span title={CONF_EXPLAIN[e.confidence]||""} style={{
                              padding:"1px 6px",borderRadius:3,fontSize:10,fontWeight:600,
                              background:cBd,color:"#fff",letterSpacing:0.3,cursor:"help",
                            }}>{e.confidence}</span>
                            <span style={{color:C.txM}}>
                              · {isBal?`balance · ${e.balance.nEvents} event${e.balance.nEvents===1?"":"s"}`:`gaps · ${e.nGaps}`}
                              {!isBal&&e.nNoPopBounds?` · ${e.nNoPopBounds} no-pop`:""}
                              {e.isGk?" · GK":""}
                            </span>
                            <button onClick={()=>setYsTalent(ysVal.toFixed(2))}
                              disabled={Math.abs(ysNum-ysVal)<0.005}
                              style={{
                                ...sBs,padding:"2px 10px",fontSize:11,marginLeft:"auto",
                                ...(Math.abs(ysNum-ysVal)<0.005
                                  ?{opacity:0.5,cursor:"default"}
                                  :{background:cBd,color:"#fff",borderColor:cBd}),
                              }}>
                              {Math.abs(ysNum-ysVal)<0.005?"applied":"Apply"}
                            </button>
                          </>
                        )}
                      </div>
                      {ntWeeks>0&&(
                        <div style={{color:C.warn,fontSize:10,marginTop:4}}>
                          ⚠ {ntWeeks} national-team week{ntWeeks===1?"":"s"} in this history — NT coaching adds unmodeled XP, so the true talent is likely worse (higher YS) than estimated
                        </div>
                      )}
                      {!noData&&isBal&&e.balance.capped&&(
                        <div style={{color:C.txM,fontSize:10,marginTop:4}}>
                          ceiling-pinned: virtual balance point {e.balance.virtual.toFixed(0)} DB past the cap — genuine top talent OR high-level K under-thresholding
                        </div>
                      )}
                      {!noData&&!isBal&&e.contradictory&&(
                        <div style={{color:C.warn,fontSize:10,marginTop:4}}>
                          ⚠ contradictory bounds — model residual; treat as indicative
                        </div>
                      )}
                      {!noData&&e.excludedSkills.length>0&&!isBal&&(
                        <div style={{color:C.txM,fontSize:10,marginTop:4}}>
                          consensus excluded: {e.excludedSkills.join(", ")}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* v20: external talent prior + next-pop forecast */}
                {historyReports&&talentEstimate&&isFinite(talentEstimate.td)&&(
                  <div style={{marginTop:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:10,fontFamily:_fs,color:C.txM,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                        External talent</span>
                      <input value={priorRaw} onChange={e=>setPriorRaw(e.target.value)}
                        placeholder={priorScale==="db"?"e.g. 87":priorScale==="ys"?"e.g. 3.60":"e.g. 3.35"}
                        style={{...sI,width:76}}/>
                      <select value={priorScale} onChange={e=>setPriorScale(e.target.value)} style={{...sI,width:110}}>
                        <option value="senior">senior 3–7.5</option>
                        <option value="ys">YS 3–30</option>
                        <option value="db">DB 0–100</option>
                      </select>
                      {talentEstimate.prior&&(
                        <span style={{fontSize:10,color:talentEstimate.prior.mode==="conflict"?C.warn:C.pop}}>
                          {talentEstimate.prior.mode==="conflict"
                            ?`⚠ prior [${talentEstimate.prior.lo}–${talentEstimate.prior.hi} DB] disjoint from the history band — prior wins`
                            :`✓ intersected → [${talentEstimate.prior.lo}–${talentEstimate.prior.hi} DB]`}
                        </span>
                      )}
                    </div>
                    <div style={{fontSize:9,color:C.txM,marginTop:3}}>
                      from Mikoos / SkTables / another tool — hard-intersected with the history evidence (senior scale is what those tools report)
                    </div>
                    <NextPopForecast reports={historyReports}
                      tdLo={talentEstimate.tdLo} tdHi={Math.min(100,talentEstimate.tdHi)}
                      coachDb={coachDb}/>
                  </div>
                )}
                <div>
                  <div style={sL}>Position</div>
                  <select value={pos} onChange={e=>setPos(e.target.value)} style={sSel}>
                    {Object.entries(POS).map(([k,v])=><option key={k} value={k}>{v.name} — {v.d}</option>)}
                  </select>
                </div>
                <div style={{...sL,marginTop:10}}>Training horizon</div>
                {/* v16: simple mode shows only the age/week picker (v15's
                    two-way view of `weeks`) and the 27yo default chip; the
                    raw weeks input and season chips live under Advanced. */}
                {(()=>{
                  const end=_horizonEnd(age,ssw,weeks);
                  const w27=_weeksUntil(age,ssw,27,_SL);
                  const setTarget=(tA,tW)=>{
                    const w=_weeksUntil(age,ssw,tA,tW);
                    if(w)setWeeks(w);
                  };
                  return(
                    <>
                      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{fontSize:11,color:C.txD}}>until age</span>
                        <input type="number" min={age} max={40} value={end.age}
                          onChange={e=>{const v=parseInt(e.target.value,10);
                            if(isFinite(v))setTarget(Math.max(age,Math.min(40,v)),end.week);}}
                          style={{...sI,width:52,textAlign:"center"}}/>
                        <span style={{fontSize:11,color:C.txD}}>week</span>
                        <select value={end.week}
                          onChange={e=>setTarget(end.age,parseInt(e.target.value,10))}
                          style={{...sSel,width:60}}>
                          {Array.from({length:_SL},(_,i)=>i+1).map(w=>(
                            <option key={w} value={w} disabled={end.age===age&&w<ssw}>{w}</option>
                          ))}
                        </select>
                        <span style={{fontSize:11,color:C.txM}}>
                          = {weeks} wk ({(weeks/13).toFixed(1)}s)
                        </span>
                        {w27&&(
                          <button onClick={()=>setWeeks(w27)} title="Train until the last week before he turns 28 — the default" style={{
                            ...sBs,padding:"2px 8px",fontSize:10,fontWeight:700,
                            ...(weeks===w27?{background:C.pop,color:"#fff",borderColor:C.pop}:{borderColor:C.pop+"88",color:C.pop}),
                          }}>end of 27</button>
                        )}
                      </div>
                      {seasonNote&&(
                        <div style={{fontSize:10,color:C.warn,marginTop:5,lineHeight:1.35}}>🗓 {seasonNote}</div>
                      )}
                    </>
                  );
                })()}
              </div>

              <button onClick={runSim} disabled={selStrats.length===0||!hasPlayerData}
                style={{...sB,width:"100%",fontSize:16,padding:"14px 20px",
                  background:resultsStale?C.warn:C.acc,
                  opacity:(selStrats.length===0||!hasPlayerData)?0.4:1,
                  cursor:(selStrats.length===0||!hasPlayerData)?"not-allowed":"pointer"}}>
                {resultsStale?"↻ Rerun — parameters changed":results?"↻ Rerun Simulation":"▶ Run Simulation"}
              </button>
              {!advOpen&&(
                <div style={{fontSize:10,color:C.txM,marginTop:6,lineHeight:1.4}}>
                  Comparing: {selStrats.map(k=>allStrats[k]?.name||k).join(", ")||"—"}
                  {manualEnabled?" · manual schedule active":""} — change under Advanced.
                </div>
              )}

              {/* v16: Advanced expander — season week, raw horizon input,
                  strategy set, manual schedule. Nothing removed from v15,
                  only deferred. */}
              <div style={{...sC,marginTop:12,padding:advOpen?"14px 20px":"0"}}>
                <button onClick={()=>setAdvOpen(o=>!o)} style={{
                  background:"transparent",border:"none",color:C.txD,fontFamily:_fs,
                  fontWeight:600,fontSize:12,cursor:"pointer",width:"100%",textAlign:"left",
                  padding:advOpen?"0 0 10px":"12px 20px",letterSpacing:0.3}}>
                  {advOpen?"▾":"▸"} Advanced
                </button>
                {advOpen&&(
                  <>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                      <div>
                        <div style={sL}>Start season week</div>
                        <input type="number" min={1} max={13} value={ssw}
                          onChange={e=>setSsw(Math.max(1,Math.min(13,parseInt(e.target.value)||1)))}
                          style={{...sI,width:60}}/>
                        {seasonNote&&(
                          <div style={{fontSize:9,color:C.warn,marginTop:3,lineHeight:1.3}}>
                            🗓 auto-derived from history
                          </div>
                        )}
                      </div>
                      <div>
                        <div style={sL}>Horizon (weeks)</div>
                        <input type="number" min={1} max={500} value={weeks}
                          onChange={e=>setWeeks(Math.max(1,parseInt(e.target.value)||1))}
                          style={{...sI,width:80}}/>
                      </div>
                      {/* v19: head coach — parametrizes BOTH the simulator's
                          standard-week XP (89/13 at 93) and the talent
                          estimator's per-record XP path. */}
                      <div>
                        <div style={sL}>Head coach (DB)</div>
                        <input type="number" min={30} max={120} value={coachDb}
                          onChange={e=>setCoachDb(Math.max(30,Math.min(120,parseInt(e.target.value)||93)))}
                          style={{...sI,width:70}}/>
                        <div style={{fontSize:9,color:C.txM,marginTop:3,lineHeight:1.3}}>
                          93 = unearthly (the historical assumption); affects XP everywhere
                        </div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:14}}>
                      {[13,26,39,52,78,104].map(w=>(
                        <button key={w} onClick={()=>setWeeks(w)} style={{
                          ...sBs,padding:"2px 8px",fontSize:10,...(weeks===w?{background:C.acc,color:"#fff",borderColor:C.acc}:{}),
                        }}>{w/13}s</button>
                      ))}
                    </div>
                    <div style={sL}>Compare strategies</div>
                    <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:4,marginBottom:12}}>
                      {Object.entries(validStrats).map(([k,v])=>{
                        const sel=selStrats.includes(k);const isSale=k==="sale_optimizer";
                        return(
                          <button key={k} onClick={()=>setSelStrats(p=>sel?p.filter(x=>x!==k):[...p,k])} style={{
                            ...sBs,textAlign:"left",fontSize:12,display:"flex",justifyContent:"space-between",alignItems:"center",
                            ...(sel?{background:(isSale?C.warn:C.acc)+"22",borderColor:isSale?C.warn:C.acc,color:isSale?C.warn:C.acc}:{}),
                          }}>
                            <span>{sel?"✓ ":"  "}{v.name} {isSale&&"💰"}</span>
                            <span style={{fontSize:10,color:C.txM,fontWeight:400}}>{v.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                    {/* v8.4: Manual Schedule toggle */}
                    <button onClick={manualToggle} disabled={!hasPlayerData}
                      style={{...sB,width:"100%",fontSize:13,padding:"10px 16px",
                        background:manualEnabled?C.warn:C.hi,
                        color:manualEnabled?"#fff":C.txD,
                        border:manualEnabled?"none":`1px solid ${C.bdr}`,
                        opacity:hasPlayerData?1:0.4,cursor:hasPlayerData?"pointer":"not-allowed"}}>
                      {manualEnabled?"✓ Manual Schedule active — editor below":"✏️ Build Manual Schedule"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* RIGHT: results */}
            <div>
              {/* v16: hybrid staleness — parameter edits after a run dim
                  the results and surface a rerun ribbon; nothing recomputes
                  behind the user's back. */}
              {resultsStale&&(
                <div style={{...sC,borderLeft:`3px solid ${C.warn}`,display:"flex",alignItems:"center",gap:12,padding:"10px 16px"}}>
                  <span style={{color:C.warn,fontSize:12,fontWeight:600}}>Parameters changed — results below show the previous run.</span>
                  <button onClick={runSim} style={{...sB,marginLeft:"auto",padding:"6px 16px",fontSize:12,background:C.warn}}>↻ Rerun</button>
                </div>
              )}
              {!displayResults&&(
                <div style={{...sC,textAlign:"center",padding:60,color:C.txM}}>
                  <div style={{fontSize:40,marginBottom:8,opacity:0.4}}>📊</div>
                  <div>Configure parameters and run the simulation.</div>
                </div>
              )}

              {displayResults&&(()=>{
                const keys=Object.keys(displayResults);const first=displayResults[keys[0]];
                // v15: Projected card follows the user-selected strategy
                // (clickable column headers); safe fallback to the first key.
                const projKey=displayResults[projStrat]?projStrat:keys[0];
                const proj=displayResults[projKey];
                const projLast=proj.log.length?proj.log[proj.log.length-1]:null;
                const deltas={};for(const sk of OS)deltas[sk]=proj.finalSkills[sk]-proj.startSkills[sk];
                const nowSk={...first.startSkills};
                const projSk={...proj.finalSkills};
                if(cardMeta.stamina!=null){nowSk.stamina=cardMeta.stamina;projSk.stamina=cardMeta.stamina;}
                if(cardMeta.keeper!=null){nowSk.keeper=cardMeta.keeper;projSk.keeper=cardMeta.keeper;}
                // Value rows: model estimate needs a form level. Current card
                // prefers the actual card value when the paste supplied one.
                let nowVal=null,nowValLabel=null,projVal=null;
                if(cardMeta.form!=null){
                  nowVal=_computeValue(nowSk,cardMeta.form,subsFloat);nowValLabel="est.";
                  projVal=_computeValue(projSk,cardMeta.form,projLast?projLast.subs:subsFloat);
                }
                if(cardMeta.actualValue!=null){nowVal=cardMeta.actualValue;nowValLabel="card";}
                return(<div style={resultsStale?{opacity:0.55}:undefined}>
                  <div style={{fontSize:12,color:C.txD,marginBottom:8}}>
                    {prof.d} · YS {ysNum.toFixed(2)} · {weeks} weeks ({(weeks/13).toFixed(1)}s)
                    <span style={{color:C.txM}}> · projected: </span>
                    <b style={{color:proj.isSale?C.warn:C.acc}}>{allStrats[projKey]?.name||projKey}</b>
                    {keys.length>1&&<span style={{color:C.txM,fontSize:11}}> (click a column header below to switch)</span>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:12,marginBottom:12}}>
                    <SokkerCard title="Now" name={playerName} age={first.startAge}
                      skills={nowSk} form={cardMeta.form} value={nowVal} valueLabel={nowValLabel}/>
                    <SokkerCard title={`Projected · ${allStrats[projKey]?.name||projKey}`}
                      name={playerName} age={projLast?projLast.age:first.startAge}
                      skills={projSk} value={projVal} valueLabel={projVal!=null?"est.":null} deltas={deltas}
                      footnote={projVal!=null?"value: model estimate — assumes form, stamina and keeper unchanged":
                        "stamina/keeper are not simulated — shown unchanged"}/>
                  </div>

                  <div style={{...sC,overflow:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontFamily:_ft,fontSize:12}}>
                      <thead>
                        <tr style={{borderBottom:`2px solid ${C.bdr}`}}>
                          <th style={{textAlign:"left",padding:"6px 8px",color:C.txD}}>Skill</th>
                          <th style={{textAlign:"center",padding:"6px 4px",color:C.txD,width:50}}>Start</th>
                          {keys.map(k=>{
                            const selP=k===projKey;const cl=displayResults[k].isSale?C.warn:C.acc;
                            return(
                              <th key={k} onClick={()=>setProjStrat(k)}
                                title="Click to show this strategy on the Projected card"
                                style={{textAlign:"center",padding:"6px 8px",fontWeight:600,cursor:"pointer",
                                  borderLeft:`1px solid ${C.bdr}`,color:cl,userSelect:"none",
                                  background:selP?cl+"1a":"transparent",
                                  borderBottom:selP?`2px solid ${cl}`:"2px solid transparent"}}>
                                {selP?"▸ ":""}{allStrats[k]?.name||k}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {OS.filter(sk=>prof.w[sk]>0).map(sk=>{
                          const w=prof.w[sk];
                          return(
                            <tr key={sk} style={{borderBottom:`1px solid ${C.bdr}22`}}>
                              <td style={{padding:"5px 8px",color:w===1?C.tx:C.txD}}>
                                {sk} {w===1?<span style={{fontSize:9,color:C.acc}}>★</span>:<span style={{fontSize:9,color:C.txM}}>({w})</span>}
                              </td>
                              <td style={{textAlign:"center",padding:"5px 4px",fontWeight:600}}>
                                {first.startSkills[sk]}<span style={{fontSize:9,color:C.txM}}>.{(subs[sk]??25).toString().padStart(2,"0")}</span>
                              </td>
                              {keys.map(kk=>{
                                const r=displayResults[kk];const lv=r.finalSkills[sk];const gained=lv-first.startSkills[sk];
                                const lastSub=r.log.length?r.log[r.log.length-1].subs[sk]:0;
                                return(
                                  <td key={kk} style={{textAlign:"center",padding:"5px 8px",borderLeft:`1px solid ${C.bdr}`,fontWeight:600}}>
                                    <span style={{color:gained>0?C.pop:C.tx}}>{lv}</span>
                                    <span style={{fontSize:9,color:C.txM,marginLeft:1}}>({Math.floor(lastSub*100)}%)</span>
                                    {gained>0&&<span style={{fontSize:10,color:C.pop,marginLeft:3}}>+{gained}</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                        <tr style={{borderTop:`2px solid ${C.bdr}`}}>
                          <td colSpan={2} style={{padding:"6px 8px",fontWeight:700,color:C.acc}}>Weighted Score</td>
                          {keys.map(k=>{
                            const sc=wScore(displayResults[k]);const best=Math.max(...keys.map(kk=>wScore(displayResults[kk])));
                            return(<td key={k} style={{textAlign:"center",padding:"6px 8px",fontWeight:700,
                              borderLeft:`1px solid ${C.bdr}`,color:Math.abs(sc-best)<0.05?C.pop:C.tx}}>{sc.toFixed(1)}</td>);
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {(()=>{
                    const best=keys.reduce((a,b)=>wScore(displayResults[a])>wScore(displayResults[b])?a:b);
                    return(
                      <div style={{...sC,background:C.pop+"11",borderLeft:`3px solid ${C.pop}`,
                        display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap"}}>
                        <span style={{fontWeight:700,color:C.pop,fontSize:17}}>★ Best: {allStrats[best]?.name||best}</span>
                        <span style={{color:C.tx,fontSize:15,fontWeight:700,fontFamily:_ft}}>{wScore(displayResults[best]).toFixed(1)}</span>
                        <span style={{color:C.txM,fontSize:11}}>weighted score</span>
                      </div>
                    );
                  })()}

                  {(()=>{
                    const logKey=showLog||keys[0];
                    const logData=displayResults[logKey]?.log||[];
                    const relCols=OS.filter(sk=>prof.w[sk]>0);
                    const header=["Wk","Age","SW","Trains","Pops",...relCols.map(sk=>SN[sk]),...relCols.map(sk=>SN[sk]+"_sub")].join(",");
                    const rows=logData.map(w=>{
                      const pops=w.pops.map(p=>`${SN[p[0]]}→${p[1]}`).join(" ");
                      const lvls=relCols.map(sk=>w.levels[sk]);
                      const sbs=relCols.map(sk=>Math.floor(w.subs[sk]*100));
                      return[w.week,w.age,w.sw,SN[w.trained],pops,...lvls,...sbs].join(",");
                    });
                    const csv=[header,...rows].join("\n");
                    const blob=new Blob([csv],{type:"text/csv"});
                    const url=URL.createObjectURL(blob);
                    return(
                      <a href={url} download={`schedule_${pos}_${logKey}.csv`}
                        style={{display:"block",background:C.acc,color:"#fff",border:"none",borderRadius:6,
                          padding:"12px 20px",fontFamily:_fs,fontWeight:600,fontSize:15,cursor:"pointer",
                          textAlign:"center",marginBottom:12,textDecoration:"none",width:"100%",boxSizing:"border-box"}}>
                        ⬇️ Download Schedule CSV
                      </a>
                    );
                  })()}

                  {keys.filter(k=>displayResults[k].isSale).map(k=>{
                    const r=displayResults[k];
                    return(
                      <div key={k} style={{...sC,borderLeft:`3px solid ${C.warn}`}}>
                        <div style={{...sL,color:C.warn}}>💰 Sale Optimizer Details</div>
                        <div style={{fontSize:12,color:C.txD,marginBottom:8}}>
                          {r.totalWeeks} weeks{r.extensions>0&&<span style={{color:C.pop}}> (+{r.extensions} extended)</span>}
                          {r.swaps>0&&<span> · {r.swaps} swaps</span>}
                        </div>
                        <div style={{...sL,marginTop:4}}>Schedule</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:2,marginBottom:12}}>
                          {r.schedule.map((sk,i)=>(
                            <div key={i} style={{padding:"3px 6px",borderRadius:3,fontSize:10,fontFamily:_ft,fontWeight:600,
                              background:C.hi,border:`1px solid ${C.bdr}`,color:C.acc,textAlign:"center",minWidth:32}}>
                              <div style={{fontSize:7,color:C.txM}}>{i+1}</div>{SN[sk]}
                            </div>
                          ))}
                        </div>
                        <div style={sL}>Carry-in at sale (lower = better)</div>
                        {OS.filter(sk=>prof.w[sk]>0).map(sk=>{
                          const ci=(r.carryPct?.[sk]||0)*100;
                          return(
                            <div key={sk} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,fontSize:12,fontFamily:_ft}}>
                              <span style={{width:40,color:C.txD}}>{SN[sk]}</span>
                              <div style={{flex:1,height:10,background:C.bg,borderRadius:5,overflow:"hidden"}}>
                                <div style={{width:`${Math.min(ci,100)}%`,height:"100%",borderRadius:5,
                                  background:ci>70?C.red:ci>40?C.warn:C.pop}}/>
                              </div>
                              <span style={{width:40,textAlign:"right",color:ci>70?C.red:ci>40?C.warn:C.pop,fontWeight:600}}>
                                {ci.toFixed(0)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  <div style={sC}>
                    <div style={sL}>Week-by-Week Log</div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                      {keys.map(k=>(
                        <button key={k} onClick={()=>setShowLog(showLog===k?null:k)} style={{
                          ...sBs,...(showLog===k?{background:displayResults[k].isSale?C.warn:C.acc,color:"#fff",
                            borderColor:displayResults[k].isSale?C.warn:C.acc}:{}),
                        }}>{allStrats[k]?.name||k}</button>
                      ))}
                    </div>
                    {showLog&&displayResults[showLog]&&(
                      <div style={{maxHeight:420,overflow:"auto",borderRadius:6}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontFamily:_ft,fontSize:11}}>
                          <thead style={{position:"sticky",top:0,background:C.hi}}>
                            <tr>
                              <th style={{padding:"4px 6px",textAlign:"center",color:C.txD}}>Wk</th>
                              <th style={{padding:"4px 6px",textAlign:"center",color:C.txD}}>Age</th>
                              <th style={{padding:"4px 6px",textAlign:"center",color:C.txD}}>SW</th>
                              <th style={{padding:"4px 6px",textAlign:"left",color:C.txD}}>Train</th>
                              {OS.filter(sk=>prof.w[sk]>0).map(sk=>(
                                <th key={sk} style={{padding:"4px 6px",textAlign:"center",color:C.txD}}>{SN[sk]}</th>
                              ))}
                              <th style={{padding:"4px 6px",textAlign:"left",color:C.txD}}>Pops</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayResults[showLog].log.map((w,i)=>(
                              <tr key={i} style={{borderBottom:`1px solid ${C.bdr}22`,
                                background:w.wasted?C.red+"14":w.pops.length?C.pop+"0d":"transparent"}}>
                                <td style={{padding:"3px 6px",textAlign:"center"}}>{w.week}</td>
                                <td style={{padding:"3px 6px",textAlign:"center",color:C.txD}}>{w.age}</td>
                                <td style={{padding:"3px 6px",textAlign:"center",color:C.txM}}>{w.sw}</td>
                                <td style={{padding:"3px 6px",color:w.wasted?C.red:C.acc,fontWeight:600,
                                  textDecoration:w.wasted?"line-through":"none"}}
                                  title={w.wasted?"Wasted — assigned skill already maxed":undefined}>
                                  {SN[w.trained]}{w.wasted?" ✗":""}
                                </td>
                                {OS.filter(sk=>prof.w[sk]>0).map(sk=>{
                                  const hasPop=w.pops.some(p=>p[0]===sk);
                                  return(
                                    <td key={sk} style={{padding:"3px 6px",textAlign:"center",
                                      color:hasPop?C.pop:C.tx,fontWeight:hasPop?700:400}}>
                                      {w.levels[sk]}<span style={{color:C.txM,fontSize:9}}>.{Math.floor(w.subs[sk]*100).toString().padStart(2,"0")}</span>
                                    </td>
                                  );
                                })}
                                <td style={{padding:"3px 6px",color:C.pop,fontSize:10}}>
                                  {w.pops.map(p=>`${SN[p[0]]}→${p[1]}`).join(" ")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
                    
                  </div>
                </div>);
              })()}
              {/* v18: target-build block-order optimizer */}
              <TargetBuildOrder skills={skills} td={td} age={age} ssw={ssw} subsFloat={subsFloat} coachDb={coachDb}/>

            </div>
          </div>

          {/* v8.4: Full-width Manual Schedule Builder */}
          {manualEnabled&&hasPlayerData&&(
            <div style={{...sC,borderLeft:`3px solid ${C.warn}`,marginTop:8}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:10}}>
                <div>
                  <div style={{...sL,color:C.warn,marginBottom:2}}>✏️ Manual Schedule Builder</div>
                  <div style={{fontSize:11,color:C.txM,lineHeight:1.4}}>
                    Hand-pick training week by week. Updates the Manual column in the comparison table above on every edit. Click a chip to delete that week.
                  </div>
                </div>
                <div style={{fontSize:12,fontFamily:_ft,color:C.txD}}>
                  <span style={{color:C.warn,fontWeight:700}}>{manualSchedule.length}</span> weeks
                  {manualSchedule.length>0&&<span style={{color:C.txM}}> · {(manualSchedule.length/13).toFixed(1)} seasons</span>}
                </div>
              </div>

              {/* Quick-add row */}
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                <span style={{fontSize:11,color:C.txM,fontFamily:_fs,letterSpacing:"0.04em",textTransform:"uppercase"}}>Add</span>
                <input type="number" id="manualBulk" min={1} max={52} defaultValue={1}
                  style={{...sI,width:60,padding:"6px 8px",textAlign:"center",fontSize:13}}/>
                <span style={{fontSize:11,color:C.txM}}>×</span>
                {OS.map(sk=>{
                  const w=prof.w[sk]||0;
                  const dim=w===0;
                  return(
                    <button key={sk} onClick={()=>{
                      const n=parseInt(document.getElementById("manualBulk").value,10)||1;
                      manualAppend(sk,n);
                    }} disabled={dim} style={{
                      padding:"6px 12px",fontSize:12,fontFamily:_ft,fontWeight:700,
                      borderRadius:5,cursor:dim?"not-allowed":"pointer",
                      background:dim?C.hi:SK_COLORS[sk]+"33",
                      color:dim?C.txM:SK_COLORS[sk],
                      border:`1px solid ${dim?C.bdr:SK_COLORS[sk]}`,
                      opacity:dim?0.4:1,
                    }}>{SN[sk]}</button>
                  );
                })}
                <span style={{flex:1}}/>
                <button onClick={manualUndo} disabled={manualHistory.length===0}
                  style={{...sBs,opacity:manualHistory.length===0?0.4:1,cursor:manualHistory.length===0?"not-allowed":"pointer"}}>
                  ↶ Undo
                </button>
                <button onClick={manualClear} disabled={manualSchedule.length===0}
                  style={{...sBs,opacity:manualSchedule.length===0?0.4:1,cursor:manualSchedule.length===0?"not-allowed":"pointer",
                    color:manualSchedule.length>0?C.red:C.txM,borderColor:manualSchedule.length>0?C.red:C.bdr}}>
                  🗑 Clear
                </button>
              </div>

              {/* Seed-from-strategy row */}
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap",
                padding:"8px 10px",background:C.bg,borderRadius:6,border:`1px dashed ${C.bdr}`}}>
                <span style={{fontSize:11,color:C.txM}}>Or seed from strategy:</span>
                <select value={manualSeedFrom} onChange={e=>setManualSeedFrom(e.target.value)}
                  style={{...sSel,width:200,padding:"5px 28px 5px 8px",fontSize:12}}>
                  {Object.entries(validStrats).filter(([k])=>k!=="manual").map(([k,v])=>(
                    <option key={k} value={k}>{v.name}</option>
                  ))}
                </select>
                <button onClick={manualSeed} style={{...sBs,background:C.warn+"22",borderColor:C.warn,color:C.warn}}>
                  🌱 Seed ({weeks} weeks)
                </button>
                <span style={{fontSize:10,color:C.txM,fontFamily:_ft}}>(replaces current schedule)</span>
              </div>

              {/* Chip strip — grouped by season */}
              {manualSchedule.length===0?(
                <div style={{padding:"24px 12px",textAlign:"center",color:C.txM,fontSize:12,
                  background:C.bg,borderRadius:6,border:`1px dashed ${C.bdr}`}}>
                  No weeks yet. Pick a skill above to start, or seed from a strategy.
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {(()=>{
                    // v14: weeks the sim flags as wasted (assigned skill maxed)
                    // render RED — the assignment is honored, not substituted.
                    const wastedIdx=new Set();
                    if(manualResult&&manualResult.log){
                      for(const w of manualResult.log)if(w.wasted)wastedIdx.add(w.week-1);
                    }
                    // Group chips into rows of 13 (one season each)
                    const rows=[];
                    for(let i=0;i<manualSchedule.length;i+=13){
                      rows.push(manualSchedule.slice(i,i+13).map((sk,j)=>({sk,idx:i+j})));
                    }
                    return rows.map((row,si)=>(
                      <div key={si} style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:9,color:C.txM,fontFamily:_ft,minWidth:54,letterSpacing:"0.04em"}}>
                          SEASON {si+1}
                        </span>
                        <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                          {row.map(({sk,idx})=>{
                            const isWasted=wastedIdx.has(idx);
                            return(
                            <button key={idx} onClick={()=>manualDeleteAt(idx)}
                              title={isWasted
                                ?`Week ${idx+1}: ${sk} — WASTED (skill already maxed; direct XP burns against the ceiling, GT still flows). Click to delete.`
                                :`Week ${idx+1}: ${sk} (click to delete)`}
                              style={{
                                padding:"4px 8px",borderRadius:4,fontSize:10,fontFamily:_ft,fontWeight:700,
                                background:isWasted?C.red+"33":SK_COLORS[sk]+"33",
                                color:isWasted?C.red:SK_COLORS[sk],
                                border:`1px solid ${isWasted?C.red:SK_COLORS[sk]}`,
                                textDecoration:isWasted?"line-through":"none",
                                cursor:"pointer",
                                minWidth:38,textAlign:"center",
                                transition:"transform .1s,box-shadow .1s",
                              }}
                              onMouseEnter={e=>{e.target.style.transform="scale(1.08)";e.target.style.boxShadow=`0 0 0 2px ${C.red}66`;}}
                              onMouseLeave={e=>{e.target.style.transform="scale(1)";e.target.style.boxShadow="none";}}>
                              <div style={{fontSize:7,color:isWasted?C.red:C.txM,marginBottom:1}}>{isWasted?"✗":idx+1}</div>
                              {SN[sk]}
                            </button>
                          );})}
                          {/* Pad row to 13 chips so seasons line up visually */}
                          {row.length<13&&Array.from({length:13-row.length}).map((_,k)=>(
                            <div key={"pad"+k} style={{minWidth:38,padding:"4px 8px",fontSize:10}}/>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                  {manualResult&&manualResult.wastedWeeks>0&&(
                    <div style={{fontSize:11,color:C.red,marginTop:2}}>
                      ✗ {manualResult.wastedWeeks} wasted week{manualResult.wastedWeeks===1?"":"s"} — assigned skill already maxed (direct XP lost; GT to other skills still delivered)
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* v16: Export merged into Plan (Stage 3 removed) — collapsible
              bundle card at the bottom of the results flow. Content is the
              former export stage verbatim. */}
          {hasPlayerData&&(
            <div style={{...sC,marginTop:4,padding:exportOpen?"16px 20px":"0"}}>
              <button onClick={()=>setExportOpen(o=>!o)} style={{
                background:"transparent",border:"none",color:C.txD,fontFamily:_fs,
                fontWeight:600,fontSize:12,cursor:"pointer",width:"100%",textAlign:"left",
                padding:exportOpen?"0 0 10px":"12px 20px",letterSpacing:0.3}}>
                {exportOpen?"▾":"▸"} 💾 Save / export calibration bundle
              </button>
              {exportOpen&&(
                <>

              <div style={sC}>
                <div style={sL}>What's in the bundle</div>
                <div style={{fontSize:13,color:C.tx,lineHeight:1.6,marginTop:8}}>
                  A self-contained JSON file describing this player's current state plus, if you loaded training history, the full weekly record. The desktop calibration tool consumes it directly.
                </div>
                <ul style={{fontSize:12,color:C.txD,lineHeight:1.7,marginTop:8,paddingLeft:20}}>
                  <li><b style={{color:C.tx}}>Snapshot</b> — current skills and your sub-level estimates, age, YS talent, position, horizon you planned for.</li>
                  <li><b style={{color:C.tx}}>Reports</b> — {historyReports?`${historyReports.length} weekly training records (week ${historyReports[0].week} → ${historyReports[historyReports.length-1].week})`:"empty (no training history loaded — load it on Stage 1 for richer calibration)"}.</li>
                  <li><b style={{color:C.tx}}>Plans</b> — {displayResults?`${Object.keys(displayResults).length} simulated strategy${Object.keys(displayResults).length>1?"ies":""} available, pick which to include below`:"none (run simulations on the Plan stage first)"}.</li>
                  <li><b style={{color:C.tx}}>Player ID</b> — {pid&&/^\d+$/.test(pid)?pid:historyMeta?.player_id?historyMeta.player_id:"not set (the file will use the player name instead)"}.</li>
                </ul>
              </div>

              {/* v8.3: Plan-export picker */}
              {displayResults&&Object.keys(displayResults).length>0&&(
                <div style={sC}>
                  <div style={sL}>Plans to include</div>
                  <div style={{fontSize:11,color:C.txM,marginBottom:8,lineHeight:1.5}}>
                    Re-loading the bundle will restore exactly these plans, ready to compare against future training. Untick any you don't want carried forward.
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {Object.keys(displayResults).map(k=>{
                      const r=displayResults[k];
                      const sel=!!planExportSel[k];
                      const name=allStrats[k]?.name||k;
                      const len=r.log?r.log.length:0;
                      return(
                        <label key={k} style={{
                          display:"flex",alignItems:"center",gap:10,cursor:"pointer",
                          padding:"8px 10px",borderRadius:6,
                          background:sel?(r.isSale?C.warn+"15":C.acc+"15"):C.bg,
                          border:`1px solid ${sel?(r.isSale?C.warn:C.acc):C.bdr}`,
                        }}>
                          <input type="checkbox" checked={sel}
                            onChange={()=>setPlanExportSel(s=>({...s,[k]:!s[k]}))}
                            style={{cursor:"pointer",accentColor:r.isSale?C.warn:C.acc}}/>
                          <span style={{flex:1,fontSize:12,fontWeight:600,color:r.isSale?C.warn:C.acc}}>
                            {name} {r.isSale&&"💰"}
                          </span>
                          <span style={{fontSize:10,fontFamily:_ft,color:C.txM}}>
                            {len} weeks
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={sC}>
                <div style={sL}>Bundle preview</div>
                <pre style={{
                  background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:6,
                  padding:12,fontSize:11,fontFamily:_ft,color:C.txD,
                  maxHeight:200,overflow:"auto",margin:"8px 0 0",lineHeight:1.5,
                }}>
{JSON.stringify({
  format_version:"1.1",
  source:"sokker-training-planner-online-v8.4.6",
  player:{player_id:pid&&/^\d+$/.test(pid)?parseInt(pid,10):historyMeta?.player_id||null,name:playerName||historyMeta?.name||null},
  user_snapshot:{
    current_skills:skills,
    subskills_estimate:Object.fromEntries(OS.map(sk=>[sk,(subs[sk]??25)/100])),
    age_current:age,
    engine:"coupled-K16-coach93",
    talent_estimator:"balance-v1",
    talent_db_estimate:Number(td.toFixed(2)),
    position_assumed:pos,
    horizon_weeks:weeks,
  },
  reports:historyReports?`[ ${historyReports.length} reports ]`:[],
  plans:displayResults?Object.fromEntries(Object.keys(displayResults).filter(k=>planExportSel[k]).map(k=>[k,`{ schedule: [${displayResults[k].log?.length||0} weeks] }`])):{},
},null,2)}
                </pre>
              </div>

              <div style={sC}>
                <button onClick={handleExportBundle} style={{...sB,width:"100%",fontSize:15,padding:"14px 20px",
                  background:historyReports?C.pop:C.acc}}>
                  ⬇ Download Calibration Bundle (.json)
                </button>
                <div style={{fontSize:11,color:C.txM,marginTop:10,lineHeight:1.5}}>
                  {(()=>{
                    const planCount=displayResults?Object.keys(displayResults).filter(k=>planExportSel[k]).length:0;
                    const reportCount=historyReports?historyReports.length:0;
                    if(reportCount>0&&planCount>0)return `Bundle includes ${reportCount} training weeks and ${planCount} planned strategy${planCount>1?"ies":""}. Re-load it later to compare predictions against new training data.`;
                    if(reportCount>0)return `Bundle includes ${reportCount} training weeks. Run simulations on the Plan stage to also save your strategies.`;
                    if(planCount>0)return `Bundle includes ${planCount} planned strategy${planCount>1?"ies":""}, but no training history. Add training history on Stage 1 to make calibration possible.`;
                    return "Bundle includes the current snapshot only. Loading training history on Stage 1 and running simulations on Stage 2 makes the bundle dramatically more useful.";
                  })()}
                </div>
              </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{marginTop:24,textAlign:"center",fontSize:11,color:C.txM}}>
        Sokker Training Planner v17 · coupled engine K16 · coach 93 · balance-v1.1 talent · Calibration corpus enabled
      </div>

      {/* Mobile responsiveness — collapse 2-col grids below 720px */}
      <style>{`
        @media (max-width: 720px) {
          .player-stage-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
