import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DriftDebtRepository } from './repositories/drift-debt.repository';
import { DriftDetectionService } from './drift-detection.service';
import { DriftPolicyService } from './drift-policy.service';
import { DriftMetricsService } from './drift-metrics.service';
import {
  ListDriftDto,
  AcknowledgeDriftDto,
  WaiveDriftDto,
  DriftSummaryResponse,
  DriftAgingResponse,
  ConvergenceReportResponse,
  DriftItemResponse,
  DriftListResponse,
  DriftDetectionResponse,
  DriftTrendResponse,
} from './dto/drift.dto';
import { DriftDebt } from './entities/drift-debt.entity';

/**
 * Controller for drift debt management
 */
@Controller('drift')
export class DriftController {
  constructor(
    private readonly driftDebtRepository: DriftDebtRepository,
    private readonly driftDetectionService: DriftDetectionService,
    private readonly driftPolicyService: DriftPolicyService,
    private readonly driftMetricsService: DriftMetricsService,
  ) {}

  /**
   * List open drift items (paginated, filterable)
   */
  @Get()
  async listDrift(@Query() query: ListDriftDto): Promise<DriftListResponse> {
    const { items, total } = await this.driftDebtRepository.listOpenDrift({
      projectId: query.projectId,
      driftType: query.driftType,
      status: query.status,
      severity: query.severity,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      items: items.map((d) => this.mapToResponse(d)),
      total,
      limit: query.limit || 50,
      offset: query.offset || 0,
    };
  }

  /**
   * Get drift summary (aggregated counts)
   */
  @Get('summary')
  async getSummary(@Query('projectId') projectId?: string): Promise<DriftSummaryResponse> {
    return this.driftMetricsService.getDriftDebtSummary(projectId);
  }

  /**
   * Get overdue drift items
   */
  @Get('overdue')
  async getOverdue(@Query('projectId') projectId?: string): Promise<DriftListResponse> {
    const items = await this.driftDebtRepository.getOverdueDrift(projectId);

    return {
      items: items.map((d) => this.mapToResponse(d)),
      total: items.length,
      limit: items.length,
      offset: 0,
    };
  }

  /**
   * Get aging distribution
   */
  @Get('aging')
  async getAging(@Query('projectId') projectId?: string): Promise<DriftAgingResponse> {
    return this.driftDebtRepository.getAgingSummary(projectId);
  }

  /**
   * Get convergence report
   */
  @Get('convergence')
  async getConvergence(@Query('projectId') projectId?: string): Promise<ConvergenceReportResponse> {
    return this.driftPolicyService.evaluateConvergence(projectId);
  }

  /**
   * Get drift trend over time
   */
  @Get('trend')
  async getTrend(
    @Query('period') period?: 'week' | 'month' | 'quarter',
    @Query('projectId') projectId?: string,
  ): Promise<DriftTrendResponse> {
    return this.driftMetricsService.getDriftTrend(period || 'month', projectId);
  }

  /**
   * Manually trigger drift detection for a reconciliation run
   */
  @Post('detect/:runId')
  async triggerDetection(
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<DriftDetectionResponse> {
    return this.driftDetectionService.triggerDetection(runId);
  }

  /**
   * Get single drift item details
   * NOTE: This route must come AFTER all specific /drift/* routes
   * because :id is a wildcard that would match "trend", "aging", etc.
   */
  @Get(':id')
  async getDriftItem(@Param('id', ParseUUIDPipe) id: string): Promise<DriftItemResponse> {
    const drift = await this.driftDebtRepository.findById(id);

    if (!drift) {
      throw new NotFoundException(`Drift item ${id} not found`);
    }

    return this.mapToResponse(drift);
  }

  /**
   * Acknowledge a drift item
   */
  @Patch(':id/acknowledge')
  async acknowledgeDrift(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcknowledgeDriftDto,
  ): Promise<DriftItemResponse> {
    const drift = await this.driftDebtRepository.findById(id);

    if (!drift) {
      throw new NotFoundException(`Drift item ${id} not found`);
    }

    await this.driftDebtRepository.acknowledgeDrift(id, dto.comment);

    const updated = await this.driftDebtRepository.findById(id);
    return this.mapToResponse(updated!);
  }

  /**
   * Waive a drift item (with required justification)
   */
  @Patch(':id/waive')
  async waiveDrift(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WaiveDriftDto,
  ): Promise<DriftItemResponse> {
    if (!dto.justification || dto.justification.trim().length === 0) {
      throw new BadRequestException('Justification is required to waive drift');
    }

    const drift = await this.driftDebtRepository.findById(id);

    if (!drift) {
      throw new NotFoundException(`Drift item ${id} not found`);
    }

    await this.driftDebtRepository.waiveDrift(id, dto.justification);

    const updated = await this.driftDebtRepository.findById(id);
    return this.mapToResponse(updated!);
  }

  /**
   * Manually resolve a drift item
   */
  @Patch(':id/resolve')
  async resolveDrift(@Param('id', ParseUUIDPipe) id: string): Promise<DriftItemResponse> {
    const drift = await this.driftDebtRepository.findById(id);

    if (!drift) {
      throw new NotFoundException(`Drift item ${id} not found`);
    }

    await this.driftDebtRepository.resolveDrift(id, drift.lastConfirmedByRunId);

    const updated = await this.driftDebtRepository.findById(id);
    return this.mapToResponse(updated!);
  }

  /**
   * Map DriftDebt entity to response DTO
   */
  private mapToResponse(drift: DriftDebt): DriftItemResponse {
    return {
      id: drift.id,
      driftType: drift.driftType,
      description: drift.description,
      status: drift.status,
      severity: drift.severity,
      filePath: drift.filePath,
      testName: drift.testName,
      atomId: drift.atomId,
      atomDisplayId: drift.atomDisplayId,
      detectedByRunId: drift.detectedByRunId,
      lastConfirmedByRunId: drift.lastConfirmedByRunId,
      resolvedByRunId: drift.resolvedByRunId,
      projectId: drift.projectId,
      detectedAt: drift.detectedAt.toISOString(),
      lastConfirmedAt: drift.lastConfirmedAt.toISOString(),
      resolvedAt: drift.resolvedAt?.toISOString() || null,
      dueAt: drift.dueAt?.toISOString() || null,
      exceptionLane: drift.exceptionLane,
      exceptionJustification: drift.exceptionJustification,
      ageDays: drift.ageDays,
      confirmationCount: drift.confirmationCount,
      metadata: drift.metadata,
    };
  }
}
