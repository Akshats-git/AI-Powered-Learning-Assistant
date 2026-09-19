#!/usr/bin/env node
// The roadmap's scheduler-comparison experiment: "replay review logs against
// both schedulers and publish the comparison table." This app has no real
// review history yet (a fresh project, not a production system with 12k
// logs), so this runs a disclosed synthetic-learner simulation instead —
// see utils/reviewSimulation.js's header for exactly what that does and
// doesn't prove. Run with: node scripts/compareSchedulers.js
//
// Methodology: simulate the same NUM_CARDS synthetic learners (same true
// forgetting curve, same seeded randomness) under SM-2 and under FSRS at
// several request-retention targets, then interpolate the review count FSRS
// would need to match SM-2's *actual achieved* retention exactly — an
// iso-retention comparison, so "fewer reviews" isn't just an artifact of
// FSRS being tuned for lower retention than SM-2 happened to land on.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { simulateCard, mean, mulberry32 } from "../utils/reviewSimulation.js";
import { scheduleSm2, createInitialSm2State } from "../utils/sm2.js";
import { scheduleFsrs, createInitialFsrsState } from "../utils/fsrs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NUM_CARDS = 500;
const HORIZON_DAYS = 365;
const MAX_REVIEWS = 200;
const BASE_SEED = 20260909; // fixed for reproducibility — same experiment, same numbers, every run
const FSRS_RETENTION_TARGETS = [0.8, 0.85, 0.9, 0.95];

const buildSyntheticCards = () => {
  const rng = mulberry32(BASE_SEED);
  return Array.from({ length: NUM_CARDS }, () => ({
    seed: Math.floor(rng() * 1e9),
    initialTrueStability: 1 + rng() * 9, // a spread from "hard" (1 day) to "easy" (10 days) cards
  }));
};

const runScheduler = (cards, scheduleFn, makeInitialState) =>
  cards.map((card) =>
    simulateCard({
      scheduleFn,
      initialState: makeInitialState(),
      horizonDays: HORIZON_DAYS,
      maxReviews: MAX_REVIEWS,
      initialTrueStability: card.initialTrueStability,
      seed: card.seed,
    })
  );

const summarize = (results) => ({
  totalReviews: results.reduce((sum, r) => sum + r.reviews, 0),
  avgReviewsPerCard: mean(results.map((r) => r.reviews)),
  avgRetention: mean(results.map((r) => r.averageRetention)),
});

// Linear interpolation between the two FSRS runs whose achieved retention
// bracket `targetRetention`, estimating the review count FSRS would need at
// that exact retention level. Returns null if the target falls outside the
// range this script actually measured.
const interpolateReviewsAtRetention = (fsrsRuns, targetRetention) => {
  const sorted = [...fsrsRuns].sort((a, b) => a.avgRetention - b.avgRetention);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const [lo, hi] = [sorted[i], sorted[i + 1]];
    if (targetRetention >= lo.avgRetention && targetRetention <= hi.avgRetention) {
      const span = hi.avgRetention - lo.avgRetention;
      const t = span === 0 ? 0 : (targetRetention - lo.avgRetention) / span;
      return lo.avgReviewsPerCard + t * (hi.avgReviewsPerCard - lo.avgReviewsPerCard);
    }
  }
  return null;
};

const run = () => {
  const cards = buildSyntheticCards();

  const sm2 = summarize(runScheduler(cards, scheduleSm2, createInitialSm2State));
  const fsrsRuns = FSRS_RETENTION_TARGETS.map((requestRetention) => ({
    requestRetention,
    ...summarize(runScheduler(cards, (state, grade, at) => scheduleFsrs(state, grade, at, { requestRetention }), createInitialFsrsState)),
  }));

  const matchedFsrsReviews = interpolateReviewsAtRetention(fsrsRuns, sm2.avgRetention);
  const percentFewerReviews =
    matchedFsrsReviews !== null ? ((sm2.avgReviewsPerCard - matchedFsrsReviews) / sm2.avgReviewsPerCard) * 100 : null;

  const lines = [];
  const log = (line) => {
    lines.push(line);
    console.log(line);
  };

  log(`# Scheduler comparison: SM-2 vs. FSRS\n`);
  log(`**⚠ Synthetic simulation, not real usage data.** This app has no production`);
  log(`review history yet. Methodology and its limitations are in`);
  log(`\`utils/reviewSimulation.js\`. Regenerate with \`node scripts/compareSchedulers.js\`.\n`);
  log(`${NUM_CARDS} synthetic cards, ${HORIZON_DAYS}-day horizon, seed ${BASE_SEED}.\n`);
  log(`| Scheduler | Avg. reviews/card | Total reviews | Avg. achieved retention |`);
  log(`|---|---|---|---|`);
  log(`| SM-2 (baseline) | ${sm2.avgReviewsPerCard.toFixed(2)} | ${sm2.totalReviews} | ${(sm2.avgRetention * 100).toFixed(1)}% |`);
  for (const f of fsrsRuns) {
    log(
      `| FSRS (target ${(f.requestRetention * 100).toFixed(0)}%) | ${f.avgReviewsPerCard.toFixed(2)} | ${f.totalReviews} | ${(f.avgRetention * 100).toFixed(1)}% |`
    );
  }
  log("");
  if (percentFewerReviews !== null) {
    const direction = percentFewerReviews >= 0 ? "fewer" : "more";
    log(
      `**At SM-2's own achieved retention (${(sm2.avgRetention * 100).toFixed(1)}%), FSRS needed an estimated ${Math.abs(
        percentFewerReviews
      ).toFixed(1)}% ${direction} reviews per card** (${matchedFsrsReviews.toFixed(2)} vs. ${sm2.avgReviewsPerCard.toFixed(2)}, interpolated between the closest two measured FSRS retention targets).`
    );
  } else {
    log(
      `SM-2's achieved retention (${(sm2.avgRetention * 100).toFixed(1)}%) fell outside the range of FSRS retention targets measured (${(FSRS_RETENTION_TARGETS[0] * 100).toFixed(0)}%–${(FSRS_RETENTION_TARGETS.at(-1) * 100).toFixed(0)}%) — widen FSRS_RETENTION_TARGETS to get an iso-retention comparison.`
    );
  }

  log("");
  log(`## How to read this\n`);
  log(`**This is not evidence that FSRS is better *or* worse than SM-2 — it shows the two algorithms run and that the comparison is reproducible.** Three reasons it can't be read as a benchmark:\n`);
  log(`1. **The learner is invented.** In \`utils/reviewSimulation.js\` a card's true stability grows by at most ~1.85x per successful review and a lapse cuts it to 30–45%. FSRS's update equations assume a memory model that grows faster (its defaults were fit to large real review datasets), so here it schedules intervals that are too long and lands below its own retention target at every setting (see the 80% row). The iso-retention figure corrects for the retention gap, not for the mismatch in dynamics.`);
  log(`2. **The FSRS weights are unverified.** The 17 defaults in \`utils/fsrs.js\` were reconstructed from documentation, with no reference implementation to check them against, and may mix weights from one FSRS version with the forgetting curve of another. They should be checked against the canonical implementation, or refit on real data, before anything is concluded from them.`);
  log(`3. **The ground-truth forgetting curve is FSRS's own power law** (disclosed in \`utils/reviewSimulation.js\`), which favours FSRS in a way real users would not.\n`);
  log(`Net: no "FSRS needs N% fewer reviews" claim (or its opposite) is supported by this file. Settling it needs real \`ReviewLog\` history replayed through both schedulers, with FSRS's parameters refit on that data.`);

  const outPath = path.join(__dirname, "../../docs/scheduler-comparison.md");
  fs.writeFileSync(outPath, lines.join("\n") + "\n");
  console.log(`\nWritten to ${path.relative(process.cwd(), outPath)}`);
};

run();
