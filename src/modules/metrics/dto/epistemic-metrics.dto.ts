/**
 * Epistemic Metrics DTOs
 *
 * Represents the epistemic stack: PROVEN, COMMITTED, INFERRED, UNKNOWN.
 * Each level represents a different confidence in what the system knows.
 */

export interface EpistemicLevel {
  count: number;
  percentage: number;
}

export interface EpistemicUnknown {
  orphanTestsCount: number;
  uncoveredCodeFilesCount: number;
}

/**
 * Breakdown of proven atoms by test quality confidence
 */
export interface ProvenBreakdown {
  /** Tests with quality score >= 80 */
  highConfidence: EpistemicLevel;
  /** Tests with quality score 50-79 */
  mediumConfidence: EpistemicLevel;
  /** Tests with quality score < 50 */
  lowConfidence: EpistemicLevel;
}

/**
 * Coverage depth metrics for atoms
 */
export interface CoverageDepth {
  /** Atoms that have associated coverage data */
  atomsWithCoverage: number;
  /** Average coverage depth across atoms (0-100) */
  averageCoverageDepth: number;
  /** Atoms without coverage data */
  atomsWithoutCoverage: number;
}

export interface EpistemicMetrics {
  /** Atoms with linked tests that have been accepted (empirical evidence) */
  proven: EpistemicLevel;
  /** Committed atoms not yet linked to passing tests */
  committed: EpistemicLevel;
  /** Atom recommendations pending human review */
  inferred: EpistemicLevel;
  /** Orphan tests + uncovered code (gaps in knowledge) */
  unknown: EpistemicUnknown;
  /** (proven + committed) / total — overall certainty ratio */
  totalCertainty: number;

  // Phase 14C: Quality-weighted enhancements

  /**
   * Quality-weighted certainty: factors in test quality and coverage.
   * Degrades gracefully: without quality/coverage data, defaults to totalCertainty.
   */
  qualityWeightedCertainty: number;

  /**
   * Breakdown of proven atoms by test quality confidence level.
   */
  provenBreakdown: ProvenBreakdown;

  /**
   * Coverage depth metrics for atoms.
   */
  coverageDepth: CoverageDepth;

  timestamp: Date;
}
