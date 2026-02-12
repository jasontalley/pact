/**
 * Micro-Inference Test Fixture Schema
 *
 * Defines the shape of individual LLM inference test fixtures.
 * Each fixture provides a single evidence item and expected atom properties.
 * Used by the micro-inference runner to validate inference quality
 * at ~$0.005 per fixture.
 */

export interface MicroInferenceFixture {
  /** Unique fixture ID, e.g. "mi-001" */
  id: string;
  /** Human-readable name */
  name: string;
  /** Evidence type being tested */
  evidenceType:
    | 'test'
    | 'source_export'
    | 'ui_component'
    | 'api_endpoint'
    | 'documentation'
    | 'code_comment'
    | 'coverage_gap';
  /** The evidence to present to the LLM */
  evidence: {
    filePath: string;
    testName?: string;
    sourceCode: string;
    lineNumber?: number;
  };
  /** Expected properties of the inferred atom */
  expectedAtom: {
    /** Description must contain at least one of these (case-insensitive) */
    descriptionContainsAny: string[];
    /** Category must be one of these */
    categoryOneOf: string[];
    /** Confidence must be >= this value (0-100) */
    minConfidence: number;
    /** Must have at least one observable outcome */
    hasObservableOutcomes: boolean;
    /** If true, description must not contain class/method names */
    implementationAgnostic?: boolean;
    /** Description must NOT contain any of these (e.g. class names) */
    notContainsAny?: string[];
  };
}

/**
 * Result of scoring a single micro-inference fixture
 */
export interface MicroInferenceResult {
  fixtureId: string;
  fixtureName: string;
  /** Whether description matched any expected term */
  descriptionMatch: boolean;
  /** Whether category was in expected list */
  categoryMatch: boolean;
  /** Whether confidence met minimum */
  confidenceOk: boolean;
  /** Whether observable outcomes were present */
  hasOutcomes: boolean;
  /** Whether description avoided implementation terms */
  noImplLeakage: boolean;
  /** Whether description avoided forbidden terms */
  noForbiddenTerms: boolean;
  /** Total checks passed (out of max 6) */
  checksPassedCount: number;
  /** Total checks applicable */
  totalChecks: number;
  /** Overall pass (>=4 checks passed) */
  passed: boolean;
  /** Raw LLM response (for debugging) */
  rawResponse: Record<string, unknown> | null;
  /** Duration in ms */
  durationMs: number;
  /** Failure reasons */
  failureReasons: string[];
}
