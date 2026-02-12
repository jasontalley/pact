/**
 * Run Artifact Types
 *
 * Structured output for every agent evaluation run. Captures inputs,
 * outputs, intermediate state, evidence, metrics, and optional failure
 * tags for regression detection and quality tracking.
 *
 * @see docs/architecture/agent-contracts.md
 * @see docs/implementation-checklist-phase13.md (13.2.1, 13.7, 13.9.1)
 */

// ============================================================================
// Failure Taxonomy
// ============================================================================

/**
 * Failure tag categories for classifying evaluation failures.
 * Directs remediation to the right component.
 */
export type FailureTag = 'prompt' | 'tooling' | 'routing' | 'schema' | 'model';

/**
 * A tagged failure with reason and optional details.
 */
export interface TaggedFailure {
  /** Failure category */
  tag: FailureTag;
  /** Human-readable description of the failure */
  reason: string;
  /** Contract bullet violated (e.g., 'C-REC-02') */
  contractViolation?: string;
  /** Whether this is a critical failure (auto-fail regardless of score) */
  isCritical: boolean;
}

// ============================================================================
// Metrics
// ============================================================================

/**
 * Per-node metrics captured during a run.
 */
export interface NodeMetrics {
  /** Node name (e.g., 'structure', 'discover', 'infer_atoms') */
  nodeName: string;
  /** Wall-clock duration in milliseconds */
  durationMs: number;
  /** Input tokens consumed (if LLM was called) */
  inputTokens?: number;
  /** Output tokens generated (if LLM was called) */
  outputTokens?: number;
  /** Total tokens (input + output) */
  totalTokens?: number;
  /** Number of LLM calls made in this node */
  llmCallCount: number;
  /** Number of tool calls made in this node */
  toolCallCount: number;
  /** Model used for LLM calls (if any) */
  modelUsed?: string;
}

/**
 * Aggregate metrics for a full run.
 */
export interface RunMetrics {
  /** Total wall-clock duration in milliseconds */
  totalDurationMs: number;
  /** Total input tokens across all nodes */
  totalInputTokens: number;
  /** Total output tokens across all nodes */
  totalOutputTokens: number;
  /** Total tokens (input + output) across all nodes */
  totalTokens: number;
  /** Total LLM calls across all nodes */
  totalLlmCalls: number;
  /** Total tool calls across all nodes */
  totalToolCalls: number;
  /** Per-node breakdown */
  perNode: NodeMetrics[];
  /** Estimated cost in USD (based on token counts and model pricing) */
  estimatedCostUsd?: number;
}

// ============================================================================
// Node Transition Tracking
// ============================================================================

/**
 * A single node transition during graph execution.
 */
export interface NodeTransition {
  /** Node name */
  node: string;
  /** Timestamp when the node started */
  startedAt: string;
  /** Timestamp when the node completed */
  completedAt: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether the node completed successfully */
  success: boolean;
  /** Error message if the node failed */
  error?: string;
  /** Whether a NodeInterrupt occurred */
  interrupted?: boolean;
}

// ============================================================================
// Evidence References
// ============================================================================

/**
 * An evidence reference from a reconciliation run.
 */
export interface EvidenceReference {
  /** Type of evidence */
  type: 'test_file' | 'source_file' | 'coverage' | 'documentation' | 'annotation';
  /** File path */
  filePath: string;
  /** Optional line number or range */
  lineNumber?: number;
  /** Optional symbol name (test name, function name) */
  symbolName?: string;
  /** Optional snippet of content */
  snippet?: string;
}

// ============================================================================
// Agent-Specific Output Types
// ============================================================================

/**
 * Output specific to the Reconciliation agent.
 */
export interface ReconciliationRunOutput {
  /** Atoms inferred from orphan tests */
  inferredAtoms: Array<{
    tempId: string;
    description: string;
    category: string;
    confidence: number;
    qualityScore?: number;
    sourceTest: {
      filePath: string;
      testName: string;
      lineNumber: number;
    };
    observableOutcomes: string[];
  }>;
  /** Molecules synthesized from inferred atoms */
  inferredMolecules: Array<{
    tempId: string;
    name: string;
    description: string;
    atomTempIds: string[];
    confidence: number;
  }>;
  /** Orphan tests discovered */
  orphanTestCount: number;
  /** Tests with existing @atom annotations that changed (delta mode) */
  changedLinkedTestCount: number;
  /** Errors accumulated during the run */
  errors: string[];
  /** Decisions made during verification */
  decisions: string[];
}

/**
 * Output specific to the Intent Interview agent.
 */
export interface InterviewRunOutput {
  /** Atom candidates extracted from the conversation */
  atomCandidates: Array<{
    description: string;
    category: string;
    observableOutcomes: string[];
    confidence: number;
    sourceEvidence: string[];
  }>;
  /** Molecule candidates composed from atoms */
  moleculeCandidates: Array<{
    name: string;
    description: string;
    lensType: string;
    atomIndices: number[];
  }>;
  /** Questions asked during the interview */
  questionsAsked: number;
  /** All questions generated during the interview (for rubric scoring) */
  allQuestions?: Array<{
    question: string;
    category: string;
    answered: boolean;
    answerStatus?: string;
    responseScope?: string;
  }>;
  /** Question rounds completed */
  roundsCompleted: number;
  /** Whether the user signaled done before max rounds */
  userSignaledDone: boolean;
  /** Why the interview completed */
  completionReason?: string;
  /** Errors accumulated during the run */
  errors: string[];
}

// ============================================================================
// Run Artifact (Main Type)
// ============================================================================

/**
 * Discriminated union for agent type.
 */
export type AgentType = 'reconciliation' | 'interview' | 'chat-exploration';

/**
 * Run Artifact — the structured output of every agent evaluation run.
 *
 * Captures everything needed for regression detection, rubric scoring,
 * failure tagging, and cost/latency analysis.
 */
export interface RunArtifact<T extends AgentType = AgentType> {
  /** Unique run ID */
  runId: string;
  /** Agent that produced this artifact */
  agent: T;
  /** ISO timestamp when the run started */
  startedAt: string;
  /** ISO timestamp when the run completed */
  completedAt: string;
  /** Run configuration */
  config: {
    /** Model used for LLM calls */
    model?: string;
    /** Temperature setting */
    temperature?: number;
    /** Additional configuration key-value pairs */
    [key: string]: unknown;
  };

  // ---- Inputs ----

  /** Input description (sanitized — no secrets or PII) */
  input: T extends 'reconciliation'
    ? {
        rootDirectory: string;
        mode: 'full-scan' | 'delta';
        options: Record<string, unknown>;
        fileCount?: number;
        testFileCount?: number;
      }
    : T extends 'interview'
      ? {
          rawIntent: string;
          maxRounds: number;
          conversationTurns?: number;
        }
      : Record<string, unknown>;

  /** SHA-256 hash of the input for deduplication and snapshot matching */
  inputHash: string;

  // ---- Outputs ----

  /** Agent-specific output */
  output: T extends 'reconciliation'
    ? ReconciliationRunOutput
    : T extends 'interview'
      ? InterviewRunOutput
      : Record<string, unknown>;

  // ---- Intermediate State ----

  /** Node transitions during execution (ordered) */
  nodeTransitions: NodeTransition[];

  // ---- Evidence ----

  /** Evidence references extracted from the run */
  evidenceReferences: EvidenceReference[];

  // ---- Metrics ----

  /** Run metrics (tokens, timing, costs) */
  metrics: RunMetrics;

  // ---- Evaluation ----

  /** Overall pass/fail for contract validation */
  contractResult?: 'pass' | 'fail';
  /** Specific contract violations found */
  contractViolations?: string[];
  /** Tagged failures for root cause analysis */
  failures?: TaggedFailure[];
  /** Rubric scores (dimension -> score 0-2) */
  rubricScores?: Record<string, number>;
  /** Total rubric score (out of max) */
  rubricTotal?: number;
}

// ============================================================================
// Evaluation Report
// ============================================================================

/**
 * Summary of an evaluation suite run.
 */
export interface EvaluationReport {
  /** Suite that was run */
  suite: 'golden' | 'property' | 'adversarial' | 'cost' | 'micro-inference' | 'quality-scoring';
  /** Agent evaluated */
  agent: AgentType;
  /** ISO timestamp */
  timestamp: string;
  /** Total scenarios/cases run */
  totalCases: number;
  /** Passed cases */
  passedCases: number;
  /** Failed cases */
  failedCases: number;
  /** Skipped cases */
  skippedCases: number;
  /** Individual case results */
  cases: EvaluationCaseResult[];
  /** Aggregate metrics */
  aggregateMetrics?: {
    avgDurationMs: number;
    avgTokens: number;
    avgCostUsd?: number;
    p95DurationMs?: number;
    p95Tokens?: number;
  };
}

/**
 * Result of a single evaluation case.
 */
export interface EvaluationCaseResult {
  /** Case/scenario ID */
  caseId: string;
  /** Case name */
  name: string;
  /** Pass/fail result */
  result: 'pass' | 'fail' | 'skip';
  /** Failure reason (if failed) */
  reason?: string;
  /** Tagged failures */
  failures?: TaggedFailure[];
  /** Diff from expected output (for golden tests) */
  diff?: string;
  /** The run artifact for this case */
  artifact?: RunArtifact;
}
