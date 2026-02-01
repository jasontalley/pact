/**
 * Reconciliation Types
 *
 * Type definitions for the Reconciliation Agent frontend.
 */

/**
 * Reconciliation mode
 */
export type ReconciliationMode = 'full-scan' | 'delta';

/**
 * Run status
 */
export type RunStatus =
  | 'pending'
  | 'running'
  | 'waiting_for_review'
  | 'completed'
  | 'failed';

/**
 * Decision status for recommendations
 */
export type RecommendationStatus = 'pending' | 'approved' | 'rejected';

/**
 * Review decision
 */
export type ReviewDecision = 'approve' | 'reject';

/**
 * Delta baseline for incremental reconciliation
 */
export interface DeltaBaseline {
  runId?: string;
  commitHash?: string;
}

/**
 * Reconciliation options
 *
 * Phase 6 additions:
 * - forceInterruptOnQualityFail: Control interrupt behavior
 * - includePaths/excludePaths: Filter tests by folder patterns
 * - includeFilePatterns/excludeFilePatterns: Filter tests by file patterns
 */
export interface ReconciliationOptions {
  /** Whether to analyze documentation for context enrichment */
  analyzeDocs?: boolean;
  /** Maximum number of tests to process */
  maxTests?: number;
  /** Whether to auto-create atoms (vs storing as recommendations) */
  autoCreateAtoms?: boolean;
  /** Minimum quality threshold for atom approval (0-100, default: 80) */
  qualityThreshold?: number;
  /** Whether to require human review before persisting */
  requireReview?: boolean;
  /**
   * Force interrupt when quality failures exceed passes (default: false).
   * When false, only interrupts if requireReview is explicitly true.
   * When true, interrupts if failCount > passCount (legacy behavior).
   */
  forceInterruptOnQualityFail?: boolean;
  /**
   * Folder paths to include (e.g., ["src/modules/atoms"]).
   * Only tests under these paths will be analyzed.
   */
  includePaths?: string[];
  /**
   * Folder paths to exclude (e.g., ["test/e2e"]).
   * Tests under these paths will be skipped.
   */
  excludePaths?: string[];
  /**
   * File name patterns to include (e.g., ["*.service.spec.ts"]).
   * Uses minimatch glob patterns.
   */
  includeFilePatterns?: string[];
  /**
   * File name patterns to exclude (e.g., ["*.e2e-spec.ts"]).
   * Uses minimatch glob patterns.
   */
  excludeFilePatterns?: string[];
}

/**
 * Request to start reconciliation
 */
export interface StartReconciliationDto {
  rootDirectory?: string;
  mode?: ReconciliationMode;
  deltaBaseline?: DeltaBaseline;
  options?: ReconciliationOptions;
}

/**
 * Pending atom for review
 */
export interface PendingAtom {
  tempId: string;
  description: string;
  category: string;
  qualityScore: number;
  passes: boolean;
  issues: string[];
}

/**
 * Pending molecule for review
 */
export interface PendingMolecule {
  tempId: string;
  name: string;
  description: string;
  atomCount: number;
  confidence: number;
}

/**
 * Summary of pending review
 */
export interface ReviewSummary {
  totalAtoms: number;
  passCount: number;
  failCount: number;
  qualityThreshold: number;
}

/**
 * Pending review data returned when run is interrupted
 */
export interface PendingReview {
  summary: ReviewSummary;
  pendingAtoms: PendingAtom[];
  pendingMolecules: PendingMolecule[];
  reason: string;
}

/**
 * Result of starting reconciliation with interrupt support
 */
export interface AnalysisStartResult {
  /** Whether the analysis completed without interruption */
  completed: boolean;
  /** The run ID for tracking */
  runId: string;
  /** Thread ID for resume (when interrupted) */
  threadId?: string;
  /** Result if completed */
  result?: ReconciliationResult;
  /** Pending review data if interrupted */
  pendingReview?: PendingReview;
}

/**
 * Individual review decision
 */
export interface AtomDecision {
  recommendationId: string;
  decision: ReviewDecision;
  reason?: string;
}

/**
 * Individual molecule decision
 */
export interface MoleculeDecision {
  recommendationId: string;
  decision: ReviewDecision;
  reason?: string;
}

/**
 * Request to submit review decisions
 */
export interface SubmitReviewDto {
  atomDecisions: AtomDecision[];
  moleculeDecisions?: MoleculeDecision[];
  comment?: string;
}

/**
 * Source test reference
 */
export interface SourceTestReference {
  filePath: string;
  testName: string;
  lineNumber: number;
}

/**
 * Inferred atom from reconciliation
 */
export interface InferredAtom {
  tempId: string;
  description: string;
  category: string;
  sourceTest: SourceTestReference;
  observableOutcomes: string[];
  confidence: number;
  ambiguityReasons?: string[];
  reasoning: string;
  relatedDocs?: string[];
  qualityScore?: number;
}

/**
 * Inferred molecule from reconciliation
 */
export interface InferredMolecule {
  tempId: string;
  name: string;
  description: string;
  atomTempIds: string[];
  confidence: number;
  reasoning: string;
}

/**
 * Reconciliation summary
 */
export interface ReconciliationSummary {
  totalOrphanTests: number;
  inferredAtomsCount: number;
  inferredMoleculesCount: number;
  qualityPassCount: number;
  qualityFailCount: number;
}

/**
 * Reconciliation metrics
 */
export interface ReconciliationMetrics {
  totalOrphanTests: number;
  inferredAtoms: number;
  qualityPassCount: number;
  qualityFailCount: number;
  averageConfidence: number;
  categoryDistribution: Record<string, number>;
  qualityDistribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  llmCallCount: number;
  durationMs: number;
}

/**
 * Full reconciliation result
 */
export interface ReconciliationResult {
  runId: string;
  status: 'completed' | 'failed' | 'interrupted';
  summary: ReconciliationSummary;
  inferredAtoms: InferredAtom[];
  inferredMolecules: InferredMolecule[];
  errors: string[];
  metrics?: ReconciliationMetrics;
}

/**
 * Active run info
 */
export interface ActiveRun {
  runId: string;
  threadId: string;
  status: string;
  /** Start time (ISO string from backend Date) */
  startTime: string;
}

/**
 * Run details
 */
export interface RunDetails {
  runId: string;
  threadId: string;
  status: string;
  startTime: string;
  rootDirectory: string;
  mode: ReconciliationMode;
  options: ReconciliationOptions;
  summary?: ReconciliationSummary;
  metrics?: ReconciliationMetrics;
}

/**
 * Atom recommendation from database
 */
export interface AtomRecommendation {
  id: string;
  tempId: string;
  description: string;
  category: string;
  confidence: number;
  qualityScore?: number;
  reasoning: string;
  status: RecommendationStatus;
  sourceTestFilePath: string;
  sourceTestName: string;
  sourceTestLineNumber: number;
  observableOutcomes: Array<{ description: string; measurementCriteria?: string }>;
}

/**
 * Molecule recommendation from database
 */
export interface MoleculeRecommendation {
  id: string;
  tempId: string;
  name: string;
  description: string;
  confidence: number;
  reasoning: string;
  status: RecommendationStatus;
  atomRecommendationTempIds: string[];
}

/**
 * Recommendations result
 */
export interface RecommendationsResult {
  atoms: AtomRecommendation[];
  molecules: MoleculeRecommendation[];
}

/**
 * Apply operation result
 */
export interface ApplyOpResult {
  type: 'createAtom' | 'createMolecule' | 'attachTestToAtom';
  recommendationId: string;
  success: boolean;
  entityId?: string;
  error?: string;
}

/**
 * Apply result
 */
export interface ApplyResult {
  runId: string;
  status: 'success' | 'partial' | 'failed' | 'rolled_back';
  atomsCreated: number;
  moleculesCreated: number;
  annotationsInjected: number;
  operations: ApplyOpResult[];
  error?: string;
}

/**
 * Apply request
 */
export interface ApplyRequest {
  selections?: string[];
  injectAnnotations?: boolean;
}
