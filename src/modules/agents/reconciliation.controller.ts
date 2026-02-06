/**
 * Reconciliation Controller
 *
 * REST API endpoints for the Reconciliation Agent.
 * Supports human-in-the-loop review via interrupt/resume flow.
 *
 * @see docs/implementation-checklist-phase5.md Section 4.4
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsIn,
  IsBoolean,
  IsNumber,
  ValidateNested,
  Min,
  Max,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ReconciliationService,
  ReconciliationDto,
  SubmitReviewDto,
  AnalysisStartResult,
  ReconciliationMetrics,
  RunDetails,
  RecommendationsResult,
  PatchResult,
  RecoverableRunInfo,
  RecoveryResult,
} from './reconciliation.service';
import { ApplyService, ApplyRequest, ApplyResult } from './apply.service';
import { CIPolicyService, CIPolicyCheckResult } from './ci-policy.service';
import { PreReadContentDto, PreReadAnalysisStartResult } from './dto/pre-read-reconciliation.dto';
import {
  ReconciliationSchedulerService,
  ScheduleInfo,
  ScheduleHistoryEntry,
} from './reconciliation-scheduler.service';
import { ReconciliationResult } from './graphs/types/reconciliation-result';
import { InterruptPayload } from './graphs/nodes/reconciliation/verify.node';

// =============================================================================
// DTOs for API
// =============================================================================

/**
 * Delta baseline configuration
 */
class DeltaBaselineDto {
  @IsOptional()
  @IsString()
  runId?: string;

  @IsOptional()
  @IsString()
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
class ReconciliationOptionsDto {
  @IsOptional()
  @IsBoolean()
  analyzeDocs?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10000)
  maxTests?: number;

  @IsOptional()
  @IsBoolean()
  autoCreateAtoms?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  qualityThreshold?: number;

  @IsOptional()
  @IsBoolean()
  requireReview?: boolean;

  @IsOptional()
  @IsBoolean()
  forceInterruptOnQualityFail?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includePaths?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludePaths?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includeFilePatterns?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeFilePatterns?: string[];
}

/**
 * Request body for starting reconciliation analysis
 */
class StartAnalysisDto implements ReconciliationDto {
  @IsOptional()
  @IsString()
  rootDirectory?: string;

  @IsOptional()
  @IsIn(['full-scan', 'delta'])
  mode?: 'full-scan' | 'delta';

  @IsOptional()
  @ValidateNested()
  @Type(() => DeltaBaselineDto)
  deltaBaseline?: DeltaBaselineDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReconciliationOptionsDto)
  options?: ReconciliationOptionsDto;
}

/**
 * Single review decision for an atom or molecule
 */
class ReviewDecisionItemDto {
  @IsString()
  recommendationId: string;

  @IsIn(['approve', 'reject'])
  decision: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * Request body for submitting review decisions
 */
class ReviewDecisionsDto implements SubmitReviewDto {
  @ValidateNested({ each: true })
  @Type(() => ReviewDecisionItemDto)
  atomDecisions: ReviewDecisionItemDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ReviewDecisionItemDto)
  moleculeDecisions?: ReviewDecisionItemDto[];

  @IsOptional()
  @IsString()
  comment?: string;
}

/**
 * Request body for setting a reconciliation schedule
 */
class SetScheduleDto {
  @IsOptional()
  @IsString()
  cron?: string;

  @IsOptional()
  @IsString()
  rootDirectory?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  qualityThreshold?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludePaths?: string[];
}

// =============================================================================
// Controller
// =============================================================================

@ApiTags('reconciliation')
@Controller('agents/reconciliation')
export class ReconciliationController {
  private readonly logger = new Logger(ReconciliationController.name);

  constructor(
    private readonly reconciliationService: ReconciliationService,
    private readonly applyService: ApplyService,
    private readonly ciPolicyService: CIPolicyService,
    @Optional() private readonly schedulerService?: ReconciliationSchedulerService,
  ) {}

  // ===========================================================================
  // Analysis Endpoints
  // ===========================================================================

  /**
   * Start a reconciliation analysis (blocking, no interrupt support)
   */
  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run reconciliation analysis',
    description: 'Analyze a repository and generate atom recommendations. Blocks until complete.',
  })
  @ApiBody({ type: StartAnalysisDto })
  @ApiResponse({
    status: 200,
    description: 'Reconciliation completed successfully',
  })
  @ApiResponse({
    status: 500,
    description: 'Reconciliation failed',
  })
  async analyze(@Body() dto: StartAnalysisDto): Promise<ReconciliationResult> {
    this.logger.log(`POST /agents/reconciliation/analyze`);
    return this.reconciliationService.analyze(dto);
  }

  /**
   * Start a reconciliation analysis with interrupt support
   */
  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start reconciliation with review support',
    description:
      'Start analysis that may pause for human review. Returns immediately if interrupted.',
  })
  @ApiBody({ type: StartAnalysisDto })
  @ApiResponse({
    status: 200,
    description: 'Analysis started (may be completed or waiting for review)',
  })
  async startAnalysis(@Body() dto: StartAnalysisDto): Promise<AnalysisStartResult> {
    this.logger.log(`POST /agents/reconciliation/start`);
    return this.reconciliationService.analyzeWithInterrupt(dto);
  }

  /**
   * Start a reconciliation analysis using pre-read content (remote mode)
   *
   * This endpoint enables clients to submit file contents via API,
   * allowing reconciliation without server filesystem access.
   * Used by: VSCode extensions, CLI tools, CI/CD pipelines.
   */
  @Post('analyze/pre-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run reconciliation with pre-read content',
    description:
      'Analyze a repository using pre-read file content submitted by the client. ' +
      'Enables remote reconciliation without server filesystem access.',
  })
  @ApiBody({ type: PreReadContentDto })
  @ApiResponse({
    status: 200,
    description: 'Reconciliation started with pre-read content',
    type: PreReadAnalysisStartResult,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid content or missing required files',
  })
  @ApiResponse({
    status: 413,
    description: 'Content size exceeds limit',
  })
  async analyzeWithPreReadContent(
    @Body() dto: PreReadContentDto,
  ): Promise<PreReadAnalysisStartResult> {
    this.logger.log(`POST /agents/reconciliation/analyze/pre-read`);
    return this.reconciliationService.analyzeWithPreReadContent(dto);
  }

  // ===========================================================================
  // Review Endpoints
  // ===========================================================================

  /**
   * Get pending review data for an interrupted run
   */
  @Get('runs/:runId/pending')
  @ApiOperation({
    summary: 'Get pending recommendations',
    description: 'Get atoms and molecules pending human review for an interrupted run.',
  })
  @ApiParam({ name: 'runId', description: 'The run ID from start response' })
  @ApiResponse({
    status: 200,
    description: 'Pending review data',
  })
  @ApiResponse({
    status: 404,
    description: 'Run not found or not waiting for review',
  })
  getPendingReview(@Param('runId') runId: string): InterruptPayload {
    this.logger.log(`GET /agents/reconciliation/runs/${runId}/pending`);
    return this.reconciliationService.getPendingReview(runId);
  }

  /**
   * Submit review decisions for an interrupted run
   */
  @Post('runs/:runId/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit review decisions',
    description: 'Submit human review decisions for pending recommendations.',
  })
  @ApiParam({ name: 'runId', description: 'The run ID from start response' })
  @ApiBody({ type: ReviewDecisionsDto })
  @ApiResponse({
    status: 200,
    description: 'Review submitted, reconciliation resumed and completed',
  })
  @ApiResponse({
    status: 404,
    description: 'Run not found or not waiting for review',
  })
  async submitReview(
    @Param('runId') runId: string,
    @Body() dto: ReviewDecisionsDto,
  ): Promise<ReconciliationResult> {
    this.logger.log(`POST /agents/reconciliation/runs/${runId}/review`);
    return this.reconciliationService.submitReviewAndResume(runId, dto);
  }

  // ===========================================================================
  // Status Endpoints
  // ===========================================================================

  /**
   * Get the status of a run
   */
  @Get('runs/:runId/status')
  @ApiOperation({
    summary: 'Get run status',
    description: 'Get the current status of a reconciliation run.',
  })
  @ApiParam({ name: 'runId', description: 'The run ID' })
  @ApiResponse({
    status: 200,
    description: 'Run status',
  })
  getRunStatus(@Param('runId') runId: string): { runId: string; status: string | null } {
    this.logger.log(`GET /agents/reconciliation/runs/${runId}/status`);
    const status = this.reconciliationService.getRunStatus(runId);
    return { runId, status };
  }

  /**
   * Get quality metrics for a run
   */
  @Get('runs/:runId/metrics')
  @ApiOperation({
    summary: 'Get quality metrics',
    description:
      'Get quality metrics for a reconciliation run including atom confidence, category distribution, and pass/fail counts.',
  })
  @ApiParam({ name: 'runId', description: 'The run ID' })
  @ApiResponse({
    status: 200,
    description: 'Quality metrics for the run',
  })
  @ApiResponse({
    status: 404,
    description: 'Run not found or metrics not available',
  })
  async getMetrics(@Param('runId') runId: string): Promise<ReconciliationMetrics> {
    this.logger.log(`GET /agents/reconciliation/runs/${runId}/metrics`);
    return this.reconciliationService.getMetrics(runId);
  }

  /**
   * List all active runs
   */
  @Get('runs')
  @ApiOperation({
    summary: 'List active runs',
    description: 'List all active reconciliation runs.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of active runs',
  })
  listRuns(): Array<{
    runId: string;
    threadId: string;
    status: string;
    startTime: Date;
  }> {
    this.logger.log(`GET /agents/reconciliation/runs`);
    return this.reconciliationService.listActiveRuns();
  }

  /**
   * Get run details
   */
  @Get('runs/:runId')
  @ApiOperation({
    summary: 'Get run details',
    description: 'Get full details of a reconciliation run.',
  })
  @ApiParam({ name: 'runId', description: 'The run ID' })
  @ApiResponse({
    status: 200,
    description: 'Run details',
  })
  @ApiResponse({
    status: 404,
    description: 'Run not found',
  })
  async getRunDetails(@Param('runId') runId: string): Promise<RunDetails> {
    this.logger.log(`GET /agents/reconciliation/runs/${runId}`);
    return this.reconciliationService.getRunDetails(runId);
  }

  /**
   * Get recommendations for a run
   */
  @Get('runs/:runId/recommendations')
  @ApiOperation({
    summary: 'Get recommendations',
    description: 'Get atom and molecule recommendations for a reconciliation run.',
  })
  @ApiParam({ name: 'runId', description: 'The run ID' })
  @ApiResponse({
    status: 200,
    description: 'Recommendations',
  })
  @ApiResponse({
    status: 404,
    description: 'Run not found',
  })
  async getRecommendations(@Param('runId') runId: string): Promise<RecommendationsResult> {
    this.logger.log(`GET /agents/reconciliation/runs/${runId}/recommendations`);
    return this.reconciliationService.getRecommendations(runId);
  }

  /**
   * Get patch for a run
   */
  @Get('runs/:runId/patch')
  @ApiOperation({
    summary: 'Get patch',
    description: 'Get the patch operations for a reconciliation run.',
  })
  @ApiParam({ name: 'runId', description: 'The run ID' })
  @ApiResponse({
    status: 200,
    description: 'Patch operations',
  })
  @ApiResponse({
    status: 404,
    description: 'Run not found',
  })
  async getPatch(@Param('runId') runId: string): Promise<PatchResult> {
    this.logger.log(`GET /agents/reconciliation/runs/${runId}/patch`);
    return this.reconciliationService.getPatch(runId);
  }

  /**
   * Apply recommendations from a run (create atoms and molecules)
   */
  @Post('runs/:runId/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Apply recommendations',
    description:
      'Apply approved recommendations from a reconciliation run. Creates atoms and molecules in the database. ' +
      'Implements INV-R003 (Patch Atomicity) - all DB operations are transactional.',
  })
  @ApiParam({ name: 'runId', description: 'The run ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        selections: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific recommendation IDs to apply (empty = all approved)',
        },
        injectAnnotations: {
          type: 'boolean',
          description: 'Whether to inject @atom annotations into test files',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Recommendations applied successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'No recommendations to apply',
  })
  @ApiResponse({
    status: 404,
    description: 'Run not found',
  })
  async applyRecommendations(
    @Param('runId') runId: string,
    @Body() body: { selections?: string[]; injectAnnotations?: boolean },
  ): Promise<ApplyResult> {
    this.logger.log(`POST /agents/reconciliation/runs/${runId}/apply`);
    const request: ApplyRequest = {
      runId,
      selections: body.selections,
      injectAnnotations: body.injectAnnotations,
    };
    return this.applyService.applyPatch(request);
  }

  /**
   * Create a governed change set from a reconciliation run (Phase 15).
   * Instead of applying directly, this creates proposed atoms within
   * a change set that must go through approval before being committed to Main.
   */
  @Post('runs/:runId/create-change-set')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create governed change set from run',
    description:
      'Creates a change set with proposed atoms from reconciliation recommendations. ' +
      'Proposed atoms must be approved and committed through the change set workflow before appearing on Main.',
  })
  @ApiParam({ name: 'runId', description: 'The run ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        selections: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific recommendation IDs to include (empty = all pending)',
        },
        name: { type: 'string', description: 'Optional name for the change set' },
        description: { type: 'string', description: 'Optional description' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Change set created with proposed atoms',
  })
  @ApiResponse({ status: 400, description: 'No recommendations or creation failed' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  async createChangeSet(
    @Param('runId') runId: string,
    @Body() body: { selections?: string[]; name?: string; description?: string },
  ): Promise<{ changeSetId: string; atomCount: number; moleculeId: string }> {
    this.logger.log(`POST /agents/reconciliation/runs/${runId}/create-change-set`);
    return this.applyService.createChangeSetFromRun({
      runId,
      selections: body.selections,
      name: body.name,
      description: body.description,
    });
  }

  /**
   * Check if reconciliation is available
   */
  @Get('status')
  @ApiOperation({
    summary: 'Check service status',
    description: 'Check if the reconciliation service is available.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service status',
  })
  getStatus(): { available: boolean } {
    return { available: this.reconciliationService.isAvailable() };
  }

  // ===========================================================================
  // Recovery Endpoints (Phase 6)
  // ===========================================================================

  /**
   * List recoverable runs (failed or interrupted with partial results)
   */
  @Get('recoverable')
  @ApiOperation({
    summary: 'List recoverable runs',
    description:
      'List runs that were interrupted or failed but have partial results that can be recovered.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of recoverable runs',
  })
  async listRecoverableRuns(): Promise<RecoverableRunInfo[]> {
    this.logger.log(`GET /agents/reconciliation/recoverable`);
    return this.reconciliationService.listRecoverableRuns();
  }

  /**
   * Recover partial results from an interrupted/failed run
   */
  @Post('runs/:runId/recover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recover partial results',
    description:
      'Mark a failed/interrupted run as recovered and make its partial results available for review.',
  })
  @ApiParam({ name: 'runId', description: 'The run ID to recover' })
  @ApiResponse({
    status: 200,
    description: 'Run recovered successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Run not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Run cannot be recovered (no partial results)',
  })
  async recoverRun(@Param('runId') runId: string): Promise<RecoveryResult> {
    this.logger.log(`POST /agents/reconciliation/runs/${runId}/recover`);
    return this.reconciliationService.recoverRun(runId);
  }

  // ===========================================================================
  // Schedule Endpoints (Phase 12.3)
  // ===========================================================================

  @Get('schedule')
  @ApiOperation({
    summary: 'Get reconciliation schedule',
    description: 'Get the current reconciliation schedule configuration and status.',
  })
  @ApiResponse({ status: 200, description: 'Schedule info' })
  getSchedule(): ScheduleInfo {
    this.logger.log('GET /agents/reconciliation/schedule');
    if (!this.schedulerService) {
      return {
        enabled: false,
        cron: '',
        mode: 'delta',
        rootDirectory: '.',
        qualityThreshold: 80,
        excludePaths: [],
        lastRunAt: null,
        lastRunStatus: null,
        nextRunAt: null,
        runCount: 0,
      };
    }
    return this.schedulerService.getSchedule();
  }

  @Post('schedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set reconciliation schedule',
    description: 'Create or update the reconciliation schedule.',
  })
  @ApiBody({ type: SetScheduleDto })
  @ApiResponse({ status: 200, description: 'Schedule updated' })
  setSchedule(@Body() dto: SetScheduleDto): ScheduleInfo {
    this.logger.log('POST /agents/reconciliation/schedule');
    if (!this.schedulerService) {
      throw new Error('Scheduler service is not available');
    }
    return this.schedulerService.setSchedule(dto);
  }

  @Delete('schedule')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Disable reconciliation schedule',
    description: 'Disable the current reconciliation schedule.',
  })
  @ApiResponse({ status: 204, description: 'Schedule disabled' })
  deleteSchedule(): void {
    this.logger.log('DELETE /agents/reconciliation/schedule');
    if (!this.schedulerService) {
      return;
    }
    this.schedulerService.clearSchedule();
  }

  @Get('schedule/history')
  @ApiOperation({
    summary: 'Get schedule execution history',
    description: 'Get the history of scheduled reconciliation runs.',
  })
  @ApiResponse({ status: 200, description: 'Schedule history' })
  getScheduleHistory(): ScheduleHistoryEntry[] {
    this.logger.log('GET /agents/reconciliation/schedule/history');
    if (!this.schedulerService) {
      return [];
    }
    return this.schedulerService.getHistory();
  }

  // ===========================================================================
  // CI Policy Endpoints (Phase 18)
  // ===========================================================================

  /**
   * Check CI policy for a project
   */
  @Get('ci-policy/check')
  @ApiOperation({
    summary: 'Check CI policy (Phase 18)',
    description: 'Check if CI should be blocked due to pending proposed atoms requiring approval.',
  })
  @ApiQuery({ name: 'projectId', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'CI policy check result',
    schema: {
      type: 'object',
      properties: {
        passed: { type: 'boolean' },
        blocked: { type: 'boolean' },
        reason: { type: 'string' },
        proposedAtomsCount: { type: 'number' },
        reviewUrl: { type: 'string' },
      },
    },
  })
  async checkCIPolicy(@Query('projectId') projectId: string): Promise<CIPolicyCheckResult> {
    this.logger.log(`GET /agents/reconciliation/ci-policy/check?projectId=${projectId}`);
    return this.ciPolicyService.checkCIPolicy(projectId);
  }

  /**
   * Get policy status for a project
   */
  @Get('ci-policy/status')
  @ApiOperation({
    summary: 'Get CI policy status (Phase 18)',
    description: 'Get the current policy settings and proposed atoms count for a project.',
  })
  @ApiQuery({ name: 'projectId', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Policy status',
    schema: {
      type: 'object',
      properties: {
        ciBlockOnProposedAtoms: { type: 'boolean' },
        currentProposedCount: { type: 'number' },
        wouldBlock: { type: 'boolean' },
      },
    },
  })
  async getPolicyStatus(@Query('projectId') projectId: string): Promise<{
    ciBlockOnProposedAtoms: boolean;
    currentProposedCount: number;
    wouldBlock: boolean;
  }> {
    this.logger.log(`GET /agents/reconciliation/ci-policy/status?projectId=${projectId}`);
    return this.ciPolicyService.getPolicyStatus(projectId);
  }
}
