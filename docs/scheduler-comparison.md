# Scheduler comparison: SM-2 vs. FSRS

**⚠ Synthetic simulation, not real usage data.** This app has no production
review history yet. Methodology and its limitations are in
`utils/reviewSimulation.js`. Regenerate with `node scripts/compareSchedulers.js`.

500 synthetic cards, 365-day horizon, seed 20260909.

| Scheduler | Avg. reviews/card | Total reviews | Avg. achieved retention |
|---|---|---|---|
| SM-2 (baseline) | 17.67 | 8834 | 87.4% |
| FSRS (target 80%) | 11.32 | 5658 | 74.5% |
| FSRS (target 85%) | 11.89 | 5947 | 78.9% |
| FSRS (target 90%) | 14.54 | 7271 | 84.0% |
| FSRS (target 95%) | 22.12 | 11060 | 90.6% |

**At SM-2's own achieved retention (87.4%), FSRS needed an estimated 4.2% more reviews per card** (18.41 vs. 17.67, interpolated between the closest two measured FSRS retention targets).

## How to read this

**This is not evidence that FSRS is better *or* worse than SM-2 — it shows the two algorithms run and that the comparison is reproducible.** Three reasons it can't be read as a benchmark:

1. **The learner is invented.** In `utils/reviewSimulation.js` a card's true stability grows by at most ~1.85x per successful review and a lapse cuts it to 30–45%. FSRS's update equations assume a memory model that grows faster (its defaults were fit to large real review datasets), so here it schedules intervals that are too long and lands below its own retention target at every setting (see the 80% row). The iso-retention figure corrects for the retention gap, not for the mismatch in dynamics.
2. **The FSRS weights are unverified.** The 17 defaults in `utils/fsrs.js` were reconstructed from documentation, with no reference implementation to check them against, and may mix weights from one FSRS version with the forgetting curve of another. They should be checked against the canonical implementation, or refit on real data, before anything is concluded from them.
3. **The ground-truth forgetting curve is FSRS's own power law** (disclosed in `utils/reviewSimulation.js`), which favours FSRS in a way real users would not.

Net: no "FSRS needs N% fewer reviews" claim (or its opposite) is supported by this file. Settling it needs real `ReviewLog` history replayed through both schedulers, with FSRS's parameters refit on that data.
