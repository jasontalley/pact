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
import { CancellationRegistry, CancellationError } from '../../common/cancellation.registry';
import { GraphRegistryService } from './graphs/graph-registry.service';
import { ReconciliationRepository } from './repositories/reconciliation.repository';
import { RepositoryConfigService } from '../projects/repository-config.service';
import { PreReadContentProvider } from './content/pre-read-content-provider';
import { GitHubContentProvider } from './content/github-content-provider';
import { PreReadContentDto } from './dto/pre-read-reconciliation.dto';
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
  status: 'running' | 'interrupted' | 'completed' | 'failed' | 'cancelling' | 'cancelled';
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
    private readonly repositoryConfigService: RepositoryConfigService,
    private readonly cancellationRegistry: CancellationRegistry,
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
    const rootDirectory =
      dto.rootDirectory || (await this.repositoryConfigService.getRepositoryPath());
    const mode = dto.mode || 'full-scan';
    const runId = `REC-${uuidv4().substring(0, 8)}`;

    this.logger.log(
      `Starting reconciliation analysis: mode=${mode}, root=${rootDirectory}, runId=${runId}`,
    );

    // Build input for graph
    const input: ReconciliationInput = {
      rootDirectory,
      reconciliationMode: mode,
      deltaBaseline: dto.deltaBaseline,
      runId, // Pass service-generated runId to ensure consistency across all nodes
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
      const result = await this.graphRegistry.invoke<ReconciliationGraphStateType>(
        RECONCILIATION_GRAPH_NAME,
        {
          input,
          rootDirectory,
          startTime: new Date(),
        },
      );

      // In LangGraph 1.x, NodeInterrupt causes invoke() to return the state
      // at the interrupt point rather than throwing. Detect this case.
      if (result.pendingHumanReview && !result.output) {
        this.logger.log(`Reconciliation interrupted for human review (analyze mode): ${runId}`);
        // Return a partial result indicating review is needed
        throw new Error(
          'Reconciliation paused for human review. Use analyzeWithInterrupt() to handle review flow.',
        );
      }

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
  // Pre-Read Content Analysis (Phase 17C)
  // ==========================================================================

  /**
   * Analyze a repository using pre-read content submitted by the client.
   *
   * This enables remote reconciliation without server filesystem access.
   * The client reads files locally and submits them via API.
   *
   * @param dto - Pre-read content with file manifest and contents
   * @returns Analysis start result
   */
  async analyzeWithPreReadContent(dto: PreReadContentDto): Promise<AnalysisStartResult> {
    const threadId = uuidv4();
    const runId = `REC-${threadId.substring(0, 8)}`;
    const startedAt = new Date();

    const fileCount = Object.keys(dto.fileContents).length;
    this.logger.log(`Starting pre-read reconciliation: runId=${runId}, files=${fileCount}`);

    // Create PreReadContentProvider from the submitted content
    const contentProvider = PreReadContentProvider.fromPayload({
      fileContents: dto.fileContents,
      manifest: {
        files: dto.manifest.files,
        testFiles: dto.manifest.testFiles,
        sourceFiles: dto.manifest.sourceFiles,
      },
      commitHash: dto.commitHash,
      rootDirectory: dto.rootDirectory,
    });

    this.logger.debug(
      `Pre-read content provider created with ${contentProvider.getAvailablePaths().length} files`,
    );

    // Build input for graph — options pass through directly from frontend
    const input: ReconciliationInput = {
      rootDirectory: dto.rootDirectory,
      reconciliationMode: 'full-scan',
      runId,
      options: {
        analyzeDocs: dto.options?.analyzeDocs ?? true,
        maxTests: dto.options?.maxTests,
        autoCreateAtoms: dto.options?.autoCreateAtoms ?? false,
        qualityThreshold: dto.options?.qualityThreshold ?? 80,
        requireReview: dto.options?.requireReview ?? true,
        forceInterruptOnQualityFail: dto.options?.forceInterruptOnQualityFail,
        includePaths: dto.options?.includePaths,
        excludePaths: dto.options?.excludePaths,
        includeFilePatterns: dto.options?.includeFilePatterns,
        excludeFilePatterns: dto.options?.excludeFilePatterns,
      },
    };

    // Track this run
    const trackedRun: TrackedRun = {
      runId,
      threadId,
      rootDirectory: dto.rootDirectory,
      input,
      startTime: startedAt,
      status: 'running',
    };
    this.activeRuns.set(runId, trackedRun);

    // Fire and forget — progress via WebSocket (same pattern as analyzeWithInterrupt)
    this.executeGraphInBackground(
      runId,
      threadId,
      input,
      dto.rootDirectory,
      trackedRun,
      contentProvider,
    );

    return {
      completed: false,
      runId,
      threadId,
    };
  }

  /**
   * Analyze a repository by cloning from GitHub.
   *
   * Creates a GitHubContentProvider that shallow-clones the repo to a temp
   * directory, then runs reconciliation against it. The temp directory is
   * cleaned up automatically when the run finishes.
   *
   * @param dto - GitHub push/trigger data (commitSha, branch, optional repo override)
   * @returns Analysis start result with runId for tracking
   */
  async analyzeFromGitHub(dto: {
    commitSha?: string;
    branch: string;
    repo?: string;
  }): Promise<AnalysisStartResult> {
    // Load GitHub config from project settings
    const githubConfig = await this.repositoryConfigService.getGitHubConfig();

    if (!githubConfig.pat) {
      throw new BadRequestException(
        'GitHub PAT not configured. Set it in Settings → Repository → GitHub.',
      );
    }

    const owner = githubConfig.owner;
    const repo = dto.repo ?? githubConfig.repo;

    if (!owner || !repo) {
      throw new BadRequestException(
        'GitHub owner and repo must be configured in Settings → Repository.',
      );
    }

    const threadId = uuidv4();
    const runId = `REC-${threadId.substring(0, 8)}`;

    this.logger.log(
      `Starting GitHub reconciliation: runId=${runId}, repo=${owner}/${repo}, branch=${dto.branch}, commit=${dto.commitSha}`,
    );

    // Emit WebSocket event: starting
    this.gateway?.emitStarted(runId, `github:${owner}/${repo}`, 'full-scan');
    this.gateway?.emitProgress(runId, 'structure', 2, `Cloning ${owner}/${repo}...`);

    // Clone the repository
    let contentProvider: GitHubContentProvider;
    try {
      contentProvider = await GitHubContentProvider.create({
        owner,
        repo,
        pat: githubConfig.pat,
        commitSha: dto.commitSha,
        branch: dto.branch,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Clone failed';
      this.logger.error(`GitHub clone failed: ${message}`);
      this.gateway?.emitFailed(runId, message, 'structure');
      throw new BadRequestException(message);
    }

    const rootDirectory = contentProvider.getCloneDir();

    this.logger.log(`GitHub repo cloned to ${rootDirectory}`);

    // Build input for graph
    const input: ReconciliationInput = {
      rootDirectory,
      reconciliationMode: 'full-scan',
      runId,
      options: {
        analyzeDocs: true,
        qualityThreshold: 80,
        requireReview: true,
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

    // Fire and forget — progress via WebSocket
    this.executeGraphInBackground(
      runId,
      threadId,
      input,
      rootDirectory,
      trackedRun,
      contentProvider,
    );

    return {
      completed: false,
      runId,
      threadId,
    };
  }

  // ==========================================================================
  // Human-in-the-Loop Review Methods (Phase 4)
  // ==========================================================================

  /**
   * Analyze a repository with interrupt support for human review.
   *
   * Returns immediately with the run ID. The graph executes in the background
   * and communicates results via WebSocket events:
   * - `reconciliation:progress` — phase updates during execution
   * - `reconciliation:interrupted` — paused for human review
   * - `reconciliation:completed` — analysis finished successfully
   * - `reconciliation:failed` — analysis encountered an error
   *
   * @param dto - Analysis configuration
   * @returns Run ID and thread ID for tracking (always completed: false)
   */
  async analyzeWithInterrupt(dto: ReconciliationDto = {}): Promise<AnalysisStartResult> {
    const rootDirectory =
      dto.rootDirectory || (await this.repositoryConfigService.getRepositoryPath());
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
      runId, // Pass service-generated runId to ensure consistency across all nodes
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

    // Fire-and-forget: execute graph in background, communicate via WebSocket
    this.executeGraphInBackground(runId, threadId, input, rootDirectory, trackedRun);

    // Return immediately — frontend tracks progress via WebSocket
    return {
      completed: false,
      runId,
      threadId,
    };
  }

  /**
   * Cancel an active reconciliation run.
   *
   * Sets the run to 'cancelling' status and registers it in the cancellation
   * registry. Long-running nodes (infer_atoms, verify) check the registry
   * between iterations and throw CancellationError when detected.
   *
   * @param runId - The run ID to cancel
   * @returns Confirmation object
   * @throws NotFoundException if run not found
   * @throws BadRequestException if run is not in a cancellable state
   */
  cancelRun(runId: string): { runId: string; status: string; message: string } {
    const trackedRun = this.activeRuns.get(runId);

    if (!trackedRun) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    if (trackedRun.status !== 'running') {
      throw new BadRequestException(
        `Run ${runId} cannot be cancelled (status: ${trackedRun.status}). Only running runs can be cancelled.`,
      );
    }

    this.logger.log(`Cancellation requested for run ${runId}`);
    trackedRun.status = 'cancelling';
    this.cancellationRegistry.cancel(runId);

    return {
      runId,
      status: 'cancelling',
      message: 'Cancellation requested. The run will stop at the next safe checkpoint.',
    };
  }

  /**
   * Execute the reconciliation graph in the background.
   *
   * Handles completion, interruption, and errors via WebSocket events
   * and in-memory run tracking. This method never throws — all errors
   * are caught and emitted as WebSocket events.
   */
  private async executeGraphInBackground(
    runId: string,
    threadId: string,
    input: ReconciliationInput,
    rootDirectory: string,
    trackedRun: TrackedRun,
    contentProvider?: import('./content').ContentProvider,
  ): Promise<void> {
    try {
      // Register per-run content provider override (for pre-read mode)
      if (contentProvider) {
        const nodeConfig = this.graphRegistry.getNodeConfig();
        nodeConfig.contentProviderOverrides?.set(runId, contentProvider);
      }

      // Emit progress: graph starting
      this.gateway?.emitProgress(runId, 'structure', 5, 'Scanning repository structure...');

      // Invoke graph with thread ID for checkpointing
      const result = await this.graphRegistry.invoke<ReconciliationGraphStateType>(
        RECONCILIATION_GRAPH_NAME,
        {
          input,
          rootDirectory,
          startTime: new Date(),
          runId,
        },
        { configurable: { thread_id: threadId } },
      );

      // In LangGraph 1.x, NodeInterrupt causes invoke() to return the state
      // at the interrupt point rather than throwing an exception.
      // Detect interrupt by checking for pendingHumanReview without output.
      if (result.pendingHumanReview && !result.output) {
        this.logger.log(`Reconciliation interrupted for human review: ${runId}`);

        // Build interrupt payload from the state
        let interruptPayload: InterruptPayload | undefined;
        try {
          const qualityThreshold = result.input?.options?.qualityThreshold ?? 80;
          const atoms = result.inferredAtoms || [];
          const molecules = result.inferredMolecules || [];
          const decisions = result.decisions || [];
          const passCount = decisions.filter((d) => d === 'approved').length;
          const failCount = decisions.filter((d) => d === 'quality_fail').length;

          interruptPayload = {
            summary: {
              totalAtoms: atoms.length,
              passCount,
              failCount,
              qualityThreshold,
            },
            reason: 'Quality verification requires human review',
            pendingAtoms: atoms.map((atom) => ({
              tempId: atom.tempId,
              description: atom.description,
              category: atom.category,
              qualityScore: atom.qualityScore || 0,
              passes: (atom.qualityScore || 0) >= qualityThreshold,
              issues: [],
            })),
            pendingMolecules: molecules.map((mol) => ({
              tempId: mol.tempId,
              name: mol.name,
              description: mol.description,
              atomCount: mol.atomTempIds.length,
              confidence: mol.confidence,
            })),
          };
        } catch {
          this.logger.warn('Failed to build interrupt payload from state');
        }

        // Persist quality scores to DB (interim-persist saved atoms before verify ran)
        if (this.repository && result.interimRunUuid && interruptPayload?.pendingAtoms) {
          try {
            const scores = interruptPayload.pendingAtoms
              .filter((a) => typeof a.qualityScore === 'number')
              .map((a) => ({ tempId: a.tempId, qualityScore: a.qualityScore }));
            if (scores.length > 0) {
              await this.repository.updateAtomQualityScores(result.interimRunUuid, scores);
              this.logger.log(`Persisted quality scores for ${scores.length} atoms to DB`);
            }
          } catch (e) {
            this.logger.warn(
              `Failed to persist quality scores: ${e instanceof Error ? e.message : e}`,
            );
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
        return;
      }

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
    } catch (error) {
      // Legacy catch for isGraphInterrupt (LangGraph 0.x compat)
      if (isGraphInterrupt(error)) {
        this.logger.log(`Reconciliation interrupted (legacy path) for human review: ${runId}`);
        trackedRun.status = 'interrupted';

        // Emit WebSocket event: interrupted
        this.gateway?.emitInterrupted(runId, 'Human review required', 0, 0);
        return;
      }

      // User-initiated cancellation
      if (error instanceof CancellationError) {
        this.logger.log(`Reconciliation cancelled by user: ${runId}`);
        trackedRun.status = 'cancelled';
        this.cancellationRegistry.clear(runId);

        // Emit WebSocket event: cancelled
        this.gateway?.emitCancelled(runId, 'Cancelled by user');
        return;
      }

      // Regular error
      trackedRun.status = 'failed';
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Reconciliation failed: ${errorMessage}`);

      // Emit WebSocket event: failed
      this.gateway?.emitFailed(runId, errorMessage, 'failed');
    } finally {
      // Always clean up cancellation registry
      this.cancellationRegistry.clear(runId);
      // Clean up per-run content provider override
      if (contentProvider) {
        this.graphRegistry.getNodeConfig().contentProviderOverrides?.delete(runId);
        // Clean up temp clone directories (GitHubContentProvider)
        if (
          'cleanup' in contentProvider &&
          typeof (contentProvider as any).cleanup === 'function'
        ) {
          try {
            await (contentProvider as any).cleanup();
            this.logger.debug(`Cleaned up content provider resources for run ${runId}`);
          } catch (cleanupErr) {
            this.logger.warn(`Content provider cleanup failed for run ${runId}: ${cleanupErr}`);
          }
        }
      }
    }
  }

  /**
   * Get pending review data for an interrupted or recovered run.
   *
   * First checks in-memory tracked runs (live interrupt data).
   * Falls back to DB for recovered runs or after server restart.
   *
   * @param runId - The run ID
   * @returns The interrupt payload with pending recommendations
   * @throws NotFoundException if run not found or has no review data
   */
  async getPendingReview(runId: string): Promise<InterruptPayload> {
    // 1. Check in-memory tracked runs (live interrupt data)
    const trackedRun = this.activeRuns.get(runId);
    if (trackedRun?.status === 'interrupted' && trackedRun.interruptPayload) {
      return trackedRun.interruptPayload;
    }

    // 2. Fall back to DB for recovered runs or after server restart
    if (!this.repository) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    const run = await this.repository.findRunByRunId(runId);
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    // Allow pending_review (recovered) or running/failed (recoverable) runs
    if (run.status !== 'pending_review' && run.status !== 'running' && run.status !== 'failed') {
      throw new NotFoundException(`Run ${runId} is not waiting for review (status: ${run.status})`);
    }

    const atoms = await this.repository.findAtomRecommendationsByRun(run.id);
    const molecules = await this.repository.findMoleculeRecommendationsByRun(run.id);

    if (atoms.length === 0 && molecules.length === 0) {
      throw new NotFoundException(`Run ${runId} has no pending review data`);
    }

    // Build InterruptPayload from DB data
    const qualityThreshold =
      ((run.options as Record<string, unknown>)?.qualityThreshold as number) ?? 80;
    const passCount = atoms.filter((a) => (a.qualityScore ?? 0) >= qualityThreshold).length;
    const failCount = atoms.length - passCount;

    return {
      summary: {
        totalAtoms: atoms.length,
        passCount,
        failCount,
        qualityThreshold,
      },
      pendingAtoms: atoms.map((a) => ({
        tempId: a.tempId,
        description: a.description,
        category: a.category,
        qualityScore: a.qualityScore ?? 0,
        passes: (a.qualityScore ?? 0) >= qualityThreshold,
        issues: a.ambiguityReasons ?? [],
      })),
      pendingMolecules: molecules.map((m) => ({
        tempId: m.tempId,
        name: m.name,
        description: m.description || '',
        atomCount: m.atomRecommendationTempIds?.length ?? 0,
        confidence: m.confidence,
      })),
      reason:
        run.status === 'pending_review' ? 'Run recovered for review' : 'Human review required',
    };
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

    // If the run is in-memory and interrupted, resume the graph
    if (trackedRun && trackedRun.status === 'interrupted') {
      return this.resumeGraphWithReview(runId, trackedRun, review);
    }

    // Fall back to DB-only review for recovered/restarted runs
    return this.applyReviewDecisionsToDB(runId, review);
  }

  /**
   * Resume a live interrupted graph with review decisions.
   */
  private async resumeGraphWithReview(
    runId: string,
    trackedRun: TrackedRun,
    review: SubmitReviewDto,
  ): Promise<ReconciliationResult> {
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

      const result = await this.graphRegistry.invoke<ReconciliationGraphStateType>(
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
   * Apply review decisions directly to DB for recovered/restarted runs
   * where the graph cannot be resumed.
   */
  private async applyReviewDecisionsToDB(
    runId: string,
    review: SubmitReviewDto,
  ): Promise<ReconciliationResult> {
    if (!this.repository) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    const run = await this.repository.findRunByRunId(runId);
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    if (run.status !== 'pending_review' && run.status !== 'running' && run.status !== 'failed') {
      throw new NotFoundException(`Run ${runId} is not waiting for review (status: ${run.status})`);
    }

    this.logger.log(
      `Applying review decisions to DB for run ${runId}: ${review.atomDecisions.length} atom decisions`,
    );

    // Load all recommendations for lookup
    const atoms = await this.repository.findAtomRecommendationsByRun(run.id);
    const molecules = await this.repository.findMoleculeRecommendationsByRun(run.id);
    const atomByTempId = new Map(atoms.map((a) => [a.tempId, a]));
    const molByTempId = new Map(molecules.map((m) => [m.tempId, m]));

    // Apply atom decisions
    for (const decision of review.atomDecisions) {
      const atom = atomByTempId.get(decision.recommendationId);
      if (atom) {
        const status = decision.decision === 'approve' ? 'accepted' : 'rejected';
        await this.repository.updateAtomRecommendationStatus(
          atom.id,
          status,
          undefined,
          decision.decision === 'reject' ? decision.reason : undefined,
        );
      }
    }

    // Apply molecule decisions
    for (const decision of review.moleculeDecisions || []) {
      const mol = molByTempId.get(decision.recommendationId);
      if (mol) {
        const status = decision.decision === 'approve' ? 'accepted' : 'rejected';
        await this.repository.updateMoleculeRecommendationStatus(
          mol.id,
          status,
          undefined,
          undefined,
          decision.decision === 'reject' ? decision.reason : undefined,
        );
      }
    }

    const acceptedCount = review.atomDecisions.filter((d) => d.decision === 'approve').length;

    // Update run status to completed with summary
    const summary = {
      totalOrphanTests: atoms.length,
      inferredAtomsCount: atoms.length,
      inferredMoleculesCount: molecules.length,
      qualityPassCount: acceptedCount,
      qualityFailCount: atoms.length - acceptedCount,
    };
    await this.repository.updateRunStatus(runId, 'completed', summary);

    return {
      runId,
      status: 'completed',
      summary,
      inferredAtoms: atoms.map((a) => ({
        tempId: a.tempId,
        description: a.description,
        category: a.category,
        confidence: a.confidence,
        qualityScore: a.qualityScore ?? 0,
        observableOutcomes: (a.observableOutcomes || []).map((o) => o.description),
        reasoning: a.reasoning,
        sourceTest: {
          filePath: a.sourceTestFilePath,
          testName: a.sourceTestName,
          lineNumber: a.sourceTestLineNumber,
        },
      })),
      inferredMolecules: molecules.map((m) => ({
        tempId: m.tempId,
        name: m.name,
        description: m.description || '',
        confidence: m.confidence,
        reasoning: m.reasoning,
        atomTempIds: m.atomRecommendationTempIds ?? [],
      })),
      errors: [],
    } as unknown as ReconciliationResult;
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
  async listActiveRuns(): Promise<
    Array<{
      runId: string;
      threadId: string;
      status: string;
      startTime: Date;
    }>
  > {
    // Build map from in-memory tracked runs
    const runMap = new Map<
      string,
      {
        runId: string;
        threadId: string;
        status: string;
        startTime: Date;
      }
    >();

    for (const run of this.activeRuns.values()) {
      runMap.set(run.runId, {
        runId: run.runId,
        threadId: run.threadId,
        status: run.status as string,
        startTime: run.startTime,
      });
    }

    // Merge with DB runs — DB status is authoritative over in-memory
    if (this.repository) {
      try {
        const dbRuns = await this.repository.listRuns({ limit: 50 });
        for (const run of dbRuns) {
          const existing = runMap.get(run.runId);
          if (existing) {
            // DB status takes priority (may have been updated by review/recovery)
            existing.status = run.status;
          } else {
            runMap.set(run.runId, {
              runId: run.runId,
              threadId: '',
              status: run.status,
              startTime: run.createdAt,
            });
          }
        }
      } catch {
        // DB not available — return memory-only runs
      }
    }

    return Array.from(runMap.values());
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
      const isTerminal =
        run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';

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

    // Also check in-memory for threadId (not stored in DB)
    const trackedRun = this.activeRuns.get(runId);

    return {
      id: run.id,
      runId: run.runId,
      rootDirectory: run.rootDirectory,
      reconciliationMode: run.reconciliationMode,
      // Frontend-compatible aliases
      mode: run.reconciliationMode as 'full-scan' | 'delta',
      status: run.status,
      createdAt: run.createdAt,
      startTime: run.createdAt,
      completedAt: run.completedAt,
      summary: run.summary as Record<string, unknown> | null,
      options: run.options as Record<string, unknown>,
      currentCommitHash: run.currentCommitHash,
      deltaBaselineCommitHash: run.deltaBaselineCommitHash,
      errorMessage: run.errorMessage,
      threadId: trackedRun?.threadId || null,
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
        atomRecommendationIds: m.atomRecommendationIds ?? [],
        atomRecommendationTempIds: m.atomRecommendationTempIds ?? [],
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
  /** Frontend-compatible alias for reconciliationMode */
  mode: 'full-scan' | 'delta';
  status: string;
  createdAt: Date;
  /** Frontend-compatible alias for createdAt */
  startTime: Date;
  completedAt: Date | null;
  summary: Record<string, unknown> | null;
  options: Record<string, unknown>;
  currentCommitHash: string | null;
  deltaBaselineCommitHash: string | null;
  errorMessage: string | null;
  /** Thread ID from in-memory tracking (null if run is no longer tracked) */
  threadId: string | null;
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
    atomRecommendationTempIds: string[];
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
