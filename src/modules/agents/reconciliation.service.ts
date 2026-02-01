/**
 * Reconciliation Service
 *
 * Main entry point for invoking the Reconciliation Agent.
 * Provides a clean API for reconciling repo state with Pact system.
 *
 * **Phase 4 Updates**:
 * - Supports human-in-the-loop review via interrupt/resume flow
 * - Tracks active runs with thread IDs for checkpointing
 * - Provides methods for getting pending recommendations and submitting reviews
 *
 * @see docs/implementation-checklist-phase5.md Section 1.13
 * @see docs/implementation-checklist-phase5.md Section 4.2 (resume support)
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { ReconciliationGateway } from '../../gateways/reconciliation.gateway';
import { v4 as uuidv4 } from 'uuid';
import { isGraphInterrupt } from '@langchain/langgraph';
import { GraphRegistryService } from './graphs/graph-registry.service';
import { ReconciliationRepository } from './repositories/reconciliation.repository';
import {
  ReconciliationInput,
  ReconciliationMode,
  ReconciliationOptions,
  ReconciliationGraphStateType,
  HumanReviewInput,
  ReviewDecision,
} from './graphs/types/reconciliation-state';
import { ReconciliationResult } from './graphs/types/reconciliation-result';
import { RECONCILIATION_GRAPH_NAME } from './graphs/graphs/reconciliation.graph';
import { InterruptPayload } from './graphs/nodes/reconciliation/verify.node';

/**
 * DTO for starting a reconciliation analysis
 */
export interface ReconciliationDto {
  /** Root directory of the repository to analyze */
  rootDirectory?: string;
  /** Reconciliation mode (default: full-scan) */
  mode?: ReconciliationMode;
  /** Baseline for delta mode */
  deltaBaseline?: {
    runId?: string;
    commitHash?: string;
  };
  /** Analysis options */
  options?: ReconciliationOptions;
}

/**
 * DTO for submitting human review decisions
 */
export interface SubmitReviewDto {
  /** Decisions for atom recommendations */
  atomDecisions: ReviewDecision[];
  /** Decisions for molecule recommendations */
  moleculeDecisions?: ReviewDecision[];
  /** Optional comment */
  comment?: string;
}

/**
 * Result of starting an analysis that may be interrupted
 */
export interface AnalysisStartResult {
  /** Whether the analysis completed (vs interrupted for review) */
  completed: boolean;
  /** Run ID for tracking */
  runId: string;
  /** Thread ID for resume (only if interrupted) */
  threadId?: string;
  /** Result if completed */
  result?: ReconciliationResult;
  /** Interrupt payload if waiting for review */
  pendingReview?: InterruptPayload;
}

/**
 * Tracked run information for resume capability
 */
interface TrackedRun {
  runId: string;
  threadId: string;
  rootDirectory: string;
  input: ReconciliationInput;
  startTime: Date;
  interruptPayload?: InterruptPayload;
  status: 'running' | 'interrupted' | 'completed' | 'failed';
}

/**
 * Quality metrics for a reconciliation run
 */
export interface ReconciliationMetrics {
  /** Run ID */
  runId: string;
  /** Average atom confidence score (0-100) */
  averageAtomConfidence: number;
  /** Average atom quality score (0-100) */
  averageAtomQualityScore: number;
  /** Average molecule confidence score (0-100) */
  averageMoleculeConfidence: number;
  /** Number of atoms passing quality threshold */
  atomsPassingThreshold: number;
  /** Number of atoms failing quality threshold */
  atomsFailingThreshold: number;
  /** Quality threshold used */
  qualityThreshold: number;
  /** Distribution of atom categories */
  categoryDistribution: Record<string, number>;
  /** Distribution of atom recommendation statuses */
  atomStatusDistribution: Record<string, number>;
  /** Distribution of molecule recommendation statuses */
  moleculeStatusDistribution: Record<string, number>;
  /** Total atoms */
  totalAtoms: number;
  /** Total molecules */
  totalMolecules: number;
}

/**
 * Service for invoking the Reconciliation Agent.
 *
 * Provides methods to:
 * - Analyze a repository and generate atom recommendations
 * - Handle human-in-the-loop review via interrupt/resume
 * - List previous reconciliation runs
 * - Get details of a specific run
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  /** In-memory tracking of active runs (for resume capability) */
  private readonly activeRuns = new Map<string, TrackedRun>();

  constructor(
    private readonly graphRegistry: GraphRegistryService,
    @Optional() private readonly repository?: ReconciliationRepository,
    @Optional() private readonly gateway?: ReconciliationGateway,
  ) {}

  /**
   * Analyze a repository and generate atom recommendations.
   *
   * @param dto - Analysis configuration
   * @returns Reconciliation result with patch and recommendations
   */
  async analyze(dto: ReconciliationDto = {}): Promise<ReconciliationResult> {
    const rootDirectory = dto.rootDirectory || process.cwd();
    const mode = dto.mode || 'full-scan';

    this.logger.log(`Starting reconciliation analysis: mode=${mode}, root=${rootDirectory}`);

    // Build input for graph
    const input: ReconciliationInput = {
      rootDirectory,
      reconciliationMode: mode,
      deltaBaseline: dto.deltaBaseline,
      options: {
        analyzeDocs: dto.options?.analyzeDocs ?? true,
        maxTests: dto.options?.maxTests,
        autoCreateAtoms: dto.options?.autoCreateAtoms ?? false,
        qualityThreshold: dto.options?.qualityThreshold ?? 80,
        requireReview: dto.options?.requireReview ?? false,
      },
    };

    // Invoke graph
    try {
      const result = await this.graphRegistry.invoke<
        Partial<ReconciliationGraphStateType>,
        ReconciliationGraphStateType
      >(RECONCILIATION_GRAPH_NAME, {
        input,
        rootDirectory,
        startTime: new Date(),
      });

      // Extract result from output
      const reconciliationResult = result.output as ReconciliationResult;

      if (!reconciliationResult) {
        throw new Error('Reconciliation graph did not produce a result');
      }

      this.logger.log(
        `Reconciliation complete: ${reconciliationResult.runId}, ` +
          `${reconciliationResult.summary.inferredAtomsCount} atoms inferred`,
      );

      return reconciliationResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Reconciliation failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Analyze using full-scan mode (convenience method).
   *
   * @param rootDirectory - Root directory to analyze (default: cwd)
   * @param options - Analysis options
   * @returns Reconciliation result
   */
  async analyzeFullScan(
    rootDirectory?: string,
    options?: ReconciliationOptions,
  ): Promise<ReconciliationResult> {
    return this.analyze({
      rootDirectory,
      mode: 'full-scan',
      options,
    });
  }

  /**
   * Analyze using delta mode (convenience method).
   *
   * @param baseline - Baseline for comparison
   * @param rootDirectory - Root directory to analyze (default: cwd)
   * @param options - Analysis options
   * @returns Reconciliation result
   */
  async analyzeDelta(
    baseline: { runId?: string; commitHash?: string },
    rootDirectory?: string,
    options?: ReconciliationOptions,
  ): Promise<ReconciliationResult> {
    return this.analyze({
      rootDirectory,
      mode: 'delta',
      deltaBaseline: baseline,
      options,
    });
  }

  /**
   * Check if the reconciliation graph is registered.
   *
   * @returns True if the graph is available
   */
  isAvailable(): boolean {
    return this.graphRegistry.hasGraph(RECONCILIATION_GRAPH_NAME);
  }

  // ==========================================================================
  // Human-in-the-Loop Review Methods (Phase 4)
  // ==========================================================================

  /**
   * Analyze a repository with interrupt support for human review.
   *
   * Unlike `analyze()`, this method handles interrupts gracefully and returns
   * information needed to resume after human review.
   *
   * @param dto - Analysis configuration
   * @returns Analysis start result (may be interrupted or completed)
   */
  async analyzeWithInterrupt(dto: ReconciliationDto = {}): Promise<AnalysisStartResult> {
    const rootDirectory = dto.rootDirectory || process.cwd();
    const mode = dto.mode || 'full-scan';
    const threadId = uuidv4();
    const runId = `REC-${threadId.substring(0, 8)}`;

    this.logger.log(
      `Starting reconciliation with interrupt support: mode=${mode}, threadId=${threadId}`,
    );

    // Emit WebSocket event: starting
    this.gateway?.emitStarted(runId, rootDirectory, mode);
    this.gateway?.emitProgress(runId, 'starting', 0, 'Initializing reconciliation...');

    // Build input for graph
    const input: ReconciliationInput = {
      rootDirectory,
      reconciliationMode: mode,
      deltaBaseline: dto.deltaBaseline,
      options: {
        analyzeDocs: dto.options?.analyzeDocs ?? true,
        maxTests: dto.options?.maxTests,
        autoCreateAtoms: dto.options?.autoCreateAtoms ?? false,
        qualityThreshold: dto.options?.qualityThreshold ?? 80,
        requireReview: dto.options?.requireReview ?? false,
        // Pass through path filters
        includePaths: dto.options?.includePaths,
        excludePaths: dto.options?.excludePaths,
        includeFilePatterns: dto.options?.includeFilePatterns,
        excludeFilePatterns: dto.options?.excludeFilePatterns,
        forceInterruptOnQualityFail: dto.options?.forceInterruptOnQualityFail,
      },
    };

    // Track this run
    const trackedRun: TrackedRun = {
      runId,
      threadId,
      rootDirectory,
      input,
      startTime: new Date(),
      status: 'running',
    };
    this.activeRuns.set(runId, trackedRun);

    try {
      // Emit progress: graph starting
      this.gateway?.emitProgress(runId, 'structure', 5, 'Scanning repository structure...');

      // Invoke graph with thread ID for checkpointing
      const result = await this.graphRegistry.invoke<
        Partial<ReconciliationGraphStateType>,
        ReconciliationGraphStateType
      >(
        RECONCILIATION_GRAPH_NAME,
        {
          input,
          rootDirectory,
          startTime: new Date(),
        },
        { configurable: { thread_id: threadId } },
      );

      // Extract result from output
      const reconciliationResult = result.output as ReconciliationResult;

      if (!reconciliationResult) {
        throw new Error('Reconciliation graph did not produce a result');
      }

      // Update tracked run
      trackedRun.status = 'completed';

      this.logger.log(
        `Reconciliation complete: ${reconciliationResult.runId}, ` +
          `${reconciliationResult.summary.inferredAtomsCount} atoms inferred`,
      );

      // Emit WebSocket event: completed
      this.gateway?.emitCompleted(runId, reconciliationResult.status, {
        totalOrphanTests: reconciliationResult.summary.totalOrphanTests,
        inferredAtomsCount: reconciliationResult.summary.inferredAtomsCount,
        inferredMoleculesCount: reconciliationResult.summary.inferredMoleculesCount,
        qualityPassCount: reconciliationResult.summary.qualityPassCount,
        qualityFailCount: reconciliationResult.summary.qualityFailCount,
        duration: reconciliationResult.metadata.duration,
      });

      return {
        completed: true,
        runId: reconciliationResult.runId,
        result: reconciliationResult,
      };
    } catch (error) {
      // Check if this is a graph interrupt (human review needed)
      if (isGraphInterrupt(error)) {
        this.logger.log(`Reconciliation interrupted for human review: ${runId}`);

        // Extract interrupt payload from the error
        const interruptData = (error as { value?: unknown[] }).value?.[0] as
          | { value?: string }
          | undefined;
        let interruptPayload: InterruptPayload | undefined;

        if (interruptData?.value) {
          try {
            interruptPayload = JSON.parse(interruptData.value) as InterruptPayload;
          } catch {
            this.logger.warn('Failed to parse interrupt payload');
          }
        }

        // Update tracked run
        trackedRun.status = 'interrupted';
        trackedRun.interruptPayload = interruptPayload;

        // Emit WebSocket event: interrupted
        this.gateway?.emitInterrupted(
          runId,
          interruptPayload?.reason || 'Human review required',
          interruptPayload?.pendingAtoms?.length || 0,
          interruptPayload?.pendingMolecules?.length || 0,
        );

        return {
          completed: false,
          runId,
          threadId,
          pendingReview: interruptPayload,
        };
      }

      // Regular error
      trackedRun.status = 'failed';
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Reconciliation failed: ${errorMessage}`);

      // Emit WebSocket event: failed
      this.gateway?.emitFailed(runId, errorMessage, 'failed');

      throw error;
    }
  }

  /**
   * Get pending review data for an interrupted run.
   *
   * @param runId - The run ID from analyzeWithInterrupt
   * @returns The interrupt payload with pending recommendations
   * @throws NotFoundException if run not found or not interrupted
   */
  getPendingReview(runId: string): InterruptPayload {
    const trackedRun = this.activeRuns.get(runId);

    if (!trackedRun) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    if (trackedRun.status !== 'interrupted') {
      throw new NotFoundException(
        `Run ${runId} is not waiting for review (status: ${trackedRun.status})`,
      );
    }

    if (!trackedRun.interruptPayload) {
      throw new NotFoundException(`Run ${runId} has no pending review data`);
    }

    return trackedRun.interruptPayload;
  }

  /**
   * Submit human review decisions and resume the reconciliation.
   *
   * @param runId - The run ID from analyzeWithInterrupt
   * @param review - Human review decisions
   * @returns Final reconciliation result
   * @throws NotFoundException if run not found or not interrupted
   */
  async submitReviewAndResume(
    runId: string,
    review: SubmitReviewDto,
  ): Promise<ReconciliationResult> {
    const trackedRun = this.activeRuns.get(runId);

    if (!trackedRun) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    if (trackedRun.status !== 'interrupted') {
      throw new NotFoundException(
        `Run ${runId} is not waiting for review (status: ${trackedRun.status})`,
      );
    }

    this.logger.log(`Resuming run ${runId} with ${review.atomDecisions.length} atom decisions`);

    // Build human review input
    const humanReviewInput: HumanReviewInput = {
      atomDecisions: review.atomDecisions,
      moleculeDecisions: review.moleculeDecisions || [],
      comment: review.comment,
    };

    // Resume the graph with human input
    try {
      trackedRun.status = 'running';

      const result = await this.graphRegistry.invoke<
        Partial<ReconciliationGraphStateType>,
        ReconciliationGraphStateType
      >(
        RECONCILIATION_GRAPH_NAME,
        {
          humanReviewInput,
          wasResumed: true,
        },
        { configurable: { thread_id: trackedRun.threadId } },
      );

      // Extract result from output
      const reconciliationResult = result.output as ReconciliationResult;

      if (!reconciliationResult) {
        throw new Error('Reconciliation graph did not produce a result after resume');
      }

      // Update tracked run
      trackedRun.status = 'completed';

      this.logger.log(`Reconciliation resumed and completed: ${reconciliationResult.runId}`);

      return reconciliationResult;
    } catch (error) {
      trackedRun.status = 'failed';
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Reconciliation resume failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get the status of an active run.
   *
   * @param runId - The run ID
   * @returns Run status or null if not found
   */
  getRunStatus(runId: string): TrackedRun['status'] | null {
    const trackedRun = this.activeRuns.get(runId);
    return trackedRun?.status ?? null;
  }

  /**
   * List all active runs.
   *
   * @returns Array of active run information
   */
  listActiveRuns(): Array<{
    runId: string;
    threadId: string;
    status: TrackedRun['status'];
    startTime: Date;
  }> {
    return Array.from(this.activeRuns.values()).map((run) => ({
      runId: run.runId,
      threadId: run.threadId,
      status: run.status,
      startTime: run.startTime,
    }));
  }

  /**
   * Clean up completed or failed runs from memory.
   *
   * @param olderThanMs - Only clean runs older than this (default: 1 hour)
   * @returns Number of runs cleaned up
   */
  cleanupRuns(olderThanMs: number = 60 * 60 * 1000): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [runId, run] of this.activeRuns.entries()) {
      const age = now - run.startTime.getTime();
      const isTerminal = run.status === 'completed' || run.status === 'failed';

      if (isTerminal && age > olderThanMs) {
        this.activeRuns.delete(runId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} old runs`);
    }

    return cleanedCount;
  }

  // ==========================================================================
  // Quality Metrics Methods (Phase 5.4)
  // ==========================================================================

  /**
   * Get quality metrics for a reconciliation run.
   *
   * @param runId - The run ID
   * @param qualityThreshold - Optional quality threshold override (default: 80)
   * @returns Quality metrics for the run
   * @throws NotFoundException if repository not available or run not found
   */
  async getMetrics(runId: string, qualityThreshold: number = 80): Promise<ReconciliationMetrics> {
    if (!this.repository) {
      throw new NotFoundException(
        'Repository not available - metrics require database persistence',
      );
    }

    // Find the run
    const run = await this.repository.findRunByRunId(runId);
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    // Get atom recommendations
    const atomRecs = await this.repository.findAtomRecommendationsByRun(run.id);

    // Get molecule recommendations
    const moleculeRecs = await this.repository.findMoleculeRecommendationsByRun(run.id);

    // Calculate atom metrics
    const atomConfidences = atomRecs.map((a) => a.confidence);
    const atomQualityScores = atomRecs.map((a) => a.qualityScore || a.confidence);
    const averageAtomConfidence =
      atomConfidences.length > 0
        ? Math.round(atomConfidences.reduce((sum, c) => sum + c, 0) / atomConfidences.length)
        : 0;
    const averageAtomQualityScore =
      atomQualityScores.length > 0
        ? Math.round(atomQualityScores.reduce((sum, s) => sum + s, 0) / atomQualityScores.length)
        : 0;

    // Calculate molecule metrics
    const moleculeConfidences = moleculeRecs.map((m) => m.confidence);
    const averageMoleculeConfidence =
      moleculeConfidences.length > 0
        ? Math.round(
            moleculeConfidences.reduce((sum, c) => sum + c, 0) / moleculeConfidences.length,
          )
        : 0;

    // Calculate atoms passing/failing threshold
    const atomsPassingThreshold = atomRecs.filter(
      (a) => (a.qualityScore || a.confidence) >= qualityThreshold,
    ).length;
    const atomsFailingThreshold = atomRecs.length - atomsPassingThreshold;

    // Calculate category distribution
    const categoryDistribution: Record<string, number> = {};
    for (const atom of atomRecs) {
      const category = atom.category || 'uncategorized';
      categoryDistribution[category] = (categoryDistribution[category] || 0) + 1;
    }

    // Calculate status distributions
    const atomStatusDistribution: Record<string, number> = {};
    for (const atom of atomRecs) {
      atomStatusDistribution[atom.status] = (atomStatusDistribution[atom.status] || 0) + 1;
    }

    const moleculeStatusDistribution: Record<string, number> = {};
    for (const molecule of moleculeRecs) {
      moleculeStatusDistribution[molecule.status] =
        (moleculeStatusDistribution[molecule.status] || 0) + 1;
    }

    this.logger.log(
      `Calculated metrics for run ${runId}: ${atomRecs.length} atoms, ${moleculeRecs.length} molecules`,
    );

    return {
      runId,
      averageAtomConfidence,
      averageAtomQualityScore,
      averageMoleculeConfidence,
      atomsPassingThreshold,
      atomsFailingThreshold,
      qualityThreshold,
      categoryDistribution,
      atomStatusDistribution,
      moleculeStatusDistribution,
      totalAtoms: atomRecs.length,
      totalMolecules: moleculeRecs.length,
    };
  }

  // ==========================================================================
  // Run Details Methods (Phase 6.3)
  // ==========================================================================

  /**
   * Get full details of a reconciliation run.
   *
   * @param runId - The run ID
   * @returns Run details including summary and metadata
   * @throws NotFoundException if repository not available or run not found
   */
  async getRunDetails(runId: string): Promise<RunDetails> {
    if (!this.repository) {
      throw new NotFoundException('Repository not available');
    }

    const run = await this.repository.findRunByRunId(runId);
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    return {
      id: run.id,
      runId: run.runId,
      rootDirectory: run.rootDirectory,
      reconciliationMode: run.reconciliationMode,
      status: run.status,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
      summary: run.summary as Record<string, unknown> | null,
      options: run.options as Record<string, unknown>,
      currentCommitHash: run.currentCommitHash,
      deltaBaselineCommitHash: run.deltaBaselineCommitHash,
      errorMessage: run.errorMessage,
    };
  }

  /**
   * Get atom and molecule recommendations for a run.
   *
   * @param runId - The run ID
   * @returns Recommendations with atom and molecule details
   * @throws NotFoundException if repository not available or run not found
   */
  async getRecommendations(runId: string): Promise<RecommendationsResult> {
    if (!this.repository) {
      throw new NotFoundException('Repository not available');
    }

    const run = await this.repository.findRunByRunId(runId);
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    const atomRecs = await this.repository.findAtomRecommendationsByRun(run.id);
    const moleculeRecs = await this.repository.findMoleculeRecommendationsByRun(run.id);

    return {
      runId,
      atoms: atomRecs.map((a) => ({
        id: a.id,
        tempId: a.tempId,
        description: a.description,
        category: a.category,
        confidence: a.confidence,
        qualityScore: a.qualityScore,
        status: a.status,
        atomId: a.atomId,
        sourceTestFilePath: a.sourceTestFilePath,
        sourceTestName: a.sourceTestName,
      })),
      molecules: moleculeRecs.map((m) => ({
        id: m.id,
        tempId: m.tempId,
        name: m.name,
        description: m.description || '',
        confidence: m.confidence,
        status: m.status,
        moleculeId: m.moleculeId,
        atomRecommendationIds: m.atomRecommendationIds,
      })),
    };
  }

  /**
   * Get the patch for a run.
   *
   * @param runId - The run ID
   * @returns Patch operations for the run
   * @throws NotFoundException if repository not available or run not found
   */
  async getPatch(runId: string): Promise<PatchResult> {
    if (!this.repository) {
      throw new NotFoundException('Repository not available');
    }

    const run = await this.repository.findRunByRunId(runId);
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    const patchOps = await this.repository.getPatchOps(runId);

    return {
      runId,
      patchOps: patchOps || [],
      metadata: {
        createdAt: run.createdAt,
        mode: run.reconciliationMode,
        commitHash: run.currentCommitHash,
        baselineCommitHash: run.deltaBaselineCommitHash,
      },
    };
  }

  // ===========================================================================
  // Recovery Methods (Phase 6)
  // ===========================================================================

  /**
   * List recoverable runs (failed or stale 'running' status with partial results)
   */
  async listRecoverableRuns(): Promise<RecoverableRunInfo[]> {
    if (!this.repository) {
      return [];
    }

    // Get all runs with 'running' status (potentially crashed/stale)
    const runningRuns = await this.repository.listRuns({ status: 'running', limit: 50 });

    // Get all runs with 'failed' status
    const failedRuns = await this.repository.listRuns({ status: 'failed', limit: 50 });

    const recoverableRuns: RecoverableRunInfo[] = [];

    for (const run of [...runningRuns, ...failedRuns]) {
      // Check if run has partial results
      const atoms = await this.repository.findAtomRecommendationsByRun(run.id);
      const molecules = await this.repository.findMoleculeRecommendationsByRun(run.id);

      // Only include runs with at least some results
      if (atoms.length > 0 || molecules.length > 0) {
        recoverableRuns.push({
          runId: run.runId,
          runUuid: run.id,
          status: run.status,
          createdAt: run.createdAt,
          rootDirectory: run.rootDirectory,
          mode: run.reconciliationMode,
          atomCount: atoms.length,
          moleculeCount: molecules.length,
          testCount: 0, // Could query test records if needed
          lastError: run.errorMessage || undefined,
        });
      }
    }

    // Sort by most recent first
    recoverableRuns.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return recoverableRuns;
  }

  /**
   * Recover a failed/stale run by marking it as 'pending_review'
   * This makes its partial results available for review and application
   */
  async recoverRun(runId: string): Promise<RecoveryResult> {
    if (!this.repository) {
      throw new NotFoundException('Repository not available');
    }

    const run = await this.repository.findRunByRunId(runId);
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    // Only allow recovery for 'running' (stale) or 'failed' runs
    if (run.status !== 'running' && run.status !== 'failed') {
      throw new BadRequestException(
        `Run ${runId} has status '${run.status}' and cannot be recovered. ` +
          `Only 'running' (stale) or 'failed' runs can be recovered.`,
      );
    }

    // Check if run has partial results
    const atoms = await this.repository.findAtomRecommendationsByRun(run.id);
    const molecules = await this.repository.findMoleculeRecommendationsByRun(run.id);

    if (atoms.length === 0 && molecules.length === 0) {
      throw new BadRequestException(`Run ${runId} has no partial results to recover.`);
    }

    // Update run status to 'pending_review' so results can be reviewed
    await this.repository.updateRunStatus(runId, 'pending_review', run.summary || undefined);

    this.logger.log(
      `[ReconciliationService] Recovered run ${runId}: ${atoms.length} atoms, ${molecules.length} molecules`,
    );

    return {
      runId,
      runUuid: run.id,
      recovered: true,
      atomCount: atoms.length,
      moleculeCount: molecules.length,
      testCount: 0,
      message: `Run recovered successfully. ${atoms.length} atoms and ${molecules.length} molecules are now available for review.`,
    };
  }
}

/**
 * Run details response
 */
export interface RunDetails {
  id: string;
  runId: string;
  rootDirectory: string;
  reconciliationMode: 'full-scan' | 'delta';
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  summary: Record<string, unknown> | null;
  options: Record<string, unknown>;
  currentCommitHash: string | null;
  deltaBaselineCommitHash: string | null;
  errorMessage: string | null;
}

/**
 * Recommendations response
 */
export interface RecommendationsResult {
  runId: string;
  atoms: Array<{
    id: string;
    tempId: string;
    description: string;
    category: string;
    confidence: number;
    qualityScore: number | null;
    status: string;
    atomId: string | null;
    sourceTestFilePath: string;
    sourceTestName: string;
  }>;
  molecules: Array<{
    id: string;
    tempId: string;
    name: string;
    description: string;
    confidence: number;
    status: string;
    moleculeId: string | null;
    atomRecommendationIds: string[];
  }>;
}

/**
 * Patch result response
 */
export interface PatchResult {
  runId: string;
  patchOps: Record<string, unknown>[];
  metadata: {
    createdAt: Date;
    mode: string;
    commitHash: string | null;
    baselineCommitHash: string | null;
  };
}

/**
 * Information about a recoverable run (Phase 6)
 */
export interface RecoverableRunInfo {
  runId: string;
  runUuid: string;
  status: string;
  createdAt: Date;
  rootDirectory: string;
  mode: string;
  atomCount: number;
  moleculeCount: number;
  testCount: number;
  lastError?: string;
}

/**
 * Result of recovering a run (Phase 6)
 */
export interface RecoveryResult {
  runId: string;
  runUuid: string;
  recovered: boolean;
  atomCount: number;
  moleculeCount: number;
  testCount: number;
  message: string;
}
