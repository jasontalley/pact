/**
 * Quality Scoring Test Fixture Schema
 *
 * Defines the shape of quality scoring test fixtures.
 * Each fixture provides a known atom and expected quality score range.
 * Used by the quality-scoring runner to validate the verify node's
 * quality evaluation prompt in isolation at ~$0.003 per fixture.
 */

export interface QualityScoringFixture {
  /** Unique fixture ID, e.g. "qs-001" */
  id: string;
  /** Human-readable name */
  name: string;
  /** The atom to evaluate */
  atom: {
    description: string;
    category: string;
    confidence: number;
    observableOutcomes: string[];
    reasoning: string;
    sourceTestFilePath?: string;
    sourceTestName?: string;
  };
  /** Expected score boundaries */
  expectedScore: {
    /** Score must be >= this */
    minScore: number;
    /** Score must be <= this (optional, for bad atoms) */
    maxScore?: number;
    /** Whether the atom should pass at threshold 80 */
    shouldPass: boolean;
  };
}

/**
 * Result of scoring a single quality-scoring fixture
 */
export interface QualityScoringResult {
  fixtureId: string;
  fixtureName: string;
  /** Actual score returned by LLM */
  actualScore: number | null;
  /** Whether score is within expected range */
  scoreInRange: boolean;
  /** Whether pass/fail matches expected */
  passFailMatches: boolean;
  /** Whether JSON parsing succeeded */
  jsonParseSuccess: boolean;
  /** Overall pass */
  passed: boolean;
  /** Raw LLM response */
  rawResponse: Record<string, unknown> | null;
  /** Duration in ms */
  durationMs: number;
  /** Failure reasons */
  failureReasons: string[];
}
