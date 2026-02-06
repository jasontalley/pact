/**
 * Ground Truth Scorer
 *
 * Mechanical precision/recall scoring of extracted atoms against
 * ground truth facts. Uses keyword overlap and category matching
 * for deterministic, LLM-free evaluation.
 */

import { AtomCandidate } from '../graphs/types/interview-state';
import { GroundTruthFact } from '../../../../test/fixtures/agents/intent-interview/stochastic-schema';

// ============================================================================
// Types
// ============================================================================

export interface GroundTruthMatch {
  factId: string;
  factDescription: string;
  atomDescription: string;
  matchScore: number;
}

export interface GroundTruthScore {
  /** Matched atoms / total atoms (how many extracted atoms are real) */
  precision: number;
  /** Matched facts / total decided facts (how many ground truths were found) */
  recall: number;
  /** Harmonic mean of precision and recall */
  f1: number;
  /** Successful matches between facts and atoms */
  matches: GroundTruthMatch[];
  /** Ground truth facts not found in any extracted atom */
  unmatchedFacts: string[];
  /** Extracted atoms not matching any ground truth fact */
  orphanAtoms: string[];
}

// ============================================================================
// Scoring
// ============================================================================

/** Minimum match score to count as a valid match */
const MATCH_THRESHOLD = 0.4;

/** Weight for keyword overlap (vs category match) */
const KEYWORD_WEIGHT = 0.7;

/** Weight for category match (vs keyword overlap) */
const CATEGORY_WEIGHT = 0.3;

/**
 * Score extracted atoms against ground truth facts.
 *
 * Algorithm:
 * 1. Filter to decided facts only (undecided are expected to NOT appear)
 * 2. Compute pairwise match scores (keyword overlap + category)
 * 3. Greedy best-match assignment (each fact/atom matched at most once)
 * 4. Precision = matched atoms / total atoms
 * 5. Recall = matched facts / total decided facts
 */
export function scoreAgainstGroundTruth(
  atomCandidates: AtomCandidate[],
  groundTruth: GroundTruthFact[],
): GroundTruthScore {
  const decidedFacts = groundTruth.filter((f) => f.isDecided);

  if (decidedFacts.length === 0 && atomCandidates.length === 0) {
    return { precision: 1, recall: 1, f1: 1, matches: [], unmatchedFacts: [], orphanAtoms: [] };
  }
  if (atomCandidates.length === 0) {
    return {
      precision: 0,
      recall: 0,
      f1: 0,
      matches: [],
      unmatchedFacts: decidedFacts.map((f) => f.id),
      orphanAtoms: [],
    };
  }
  if (decidedFacts.length === 0) {
    return {
      precision: 0,
      recall: 0,
      f1: 0,
      matches: [],
      unmatchedFacts: [],
      orphanAtoms: atomCandidates.map((a) => a.description),
    };
  }

  // Build pairwise score matrix
  const scoreMatrix: Array<{
    factIdx: number;
    atomIdx: number;
    score: number;
  }> = [];

  for (let fi = 0; fi < decidedFacts.length; fi++) {
    for (let ai = 0; ai < atomCandidates.length; ai++) {
      const score = computeMatchScore(decidedFacts[fi], atomCandidates[ai]);
      if (score >= MATCH_THRESHOLD) {
        scoreMatrix.push({ factIdx: fi, atomIdx: ai, score });
      }
    }
  }

  // Greedy best-match assignment
  scoreMatrix.sort((a, b) => b.score - a.score);

  const matchedFactIndices = new Set<number>();
  const matchedAtomIndices = new Set<number>();
  const matches: GroundTruthMatch[] = [];

  for (const entry of scoreMatrix) {
    if (matchedFactIndices.has(entry.factIdx) || matchedAtomIndices.has(entry.atomIdx)) {
      continue;
    }
    matchedFactIndices.add(entry.factIdx);
    matchedAtomIndices.add(entry.atomIdx);
    matches.push({
      factId: decidedFacts[entry.factIdx].id,
      factDescription: decidedFacts[entry.factIdx].fact,
      atomDescription: atomCandidates[entry.atomIdx].description,
      matchScore: entry.score,
    });
  }

  const unmatchedFacts = decidedFacts
    .filter((_, i) => !matchedFactIndices.has(i))
    .map((f) => f.id);

  const orphanAtoms = atomCandidates
    .filter((_, i) => !matchedAtomIndices.has(i))
    .map((a) => a.description);

  // Precision denominator: cap at 2x decided facts to avoid penalizing
  // the agent for extracting legitimate atoms beyond the ground truth.
  // An agent that finds 5 facts + 5 bonus atoms shouldn't score 0.50 precision.
  const precisionDenom = Math.min(atomCandidates.length, decidedFacts.length * 2);
  const precision = precisionDenom > 0 ? matches.length / precisionDenom : 0;
  const recall = matches.length / decidedFacts.length;
  const f1 = precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0;

  return { precision, recall, f1, matches, unmatchedFacts, orphanAtoms };
}

/**
 * Compute a match score between a ground truth fact and an extracted atom.
 *
 * Score = KEYWORD_WEIGHT * keywordOverlap + CATEGORY_WEIGHT * categoryMatch
 */
function computeMatchScore(fact: GroundTruthFact, atom: AtomCandidate): number {
  const keywordScore = computeKeywordOverlap(fact.keywords, atom.description);
  const categoryScore = fact.category === atom.category ? 1.0 : 0.0;
  return KEYWORD_WEIGHT * keywordScore + CATEGORY_WEIGHT * categoryScore;
}

/**
 * Compute keyword overlap between fact keywords and atom description.
 *
 * Uses threshold-based scoring: 2+ keyword hits = strong match (1.0),
 * 1 keyword hit = weak match (0.5), 0 = no match (0.0).
 *
 * This avoids penalizing facts with many keywords — a fact with 7 keywords
 * shouldn't require more matches than one with 3 keywords.
 */
function computeKeywordOverlap(keywords: string[], description: string): number {
  if (keywords.length === 0) return 0;

  const descLower = description.toLowerCase();
  let matched = 0;

  for (const keyword of keywords) {
    if (descLower.includes(keyword.toLowerCase())) {
      matched++;
    }
  }

  if (matched >= 2) return 1;
  if (matched >= 1) return 0.5;
  return 0;
}
