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
