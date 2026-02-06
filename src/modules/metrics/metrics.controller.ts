import { Controller, Get, Post, HttpCode, HttpStatus, Query, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { CouplingMetricsService } from './coupling-metrics.service';
import { EpistemicMetricsService } from './epistemic-metrics.service';
import { MetricsHistoryService, MetricsTrend } from './metrics-history.service';
import { CouplingMetrics } from './dto/coupling-metrics.dto';
import { EpistemicMetrics } from './dto/epistemic-metrics.dto';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly couplingMetricsService: CouplingMetricsService,
    private readonly epistemicMetricsService: EpistemicMetricsService,
    @Optional() private readonly metricsHistoryService?: MetricsHistoryService,
  ) {}

  @Get('epistemic')
  @ApiOperation({ summary: 'Get epistemic stack metrics (PROVEN/COMMITTED/INFERRED/UNKNOWN)' })
  @ApiResponse({ status: 200, description: 'Epistemic metrics' })
  getEpistemicMetrics(): Promise<EpistemicMetrics> {
    return this.epistemicMetricsService.getEpistemicMetrics();
  }

  @Get('coupling')
  @ApiOperation({ summary: 'Get full coupling metrics (atom-test-code)' })
  @ApiResponse({ status: 200, description: 'Coupling metrics' })
  getCouplingMetrics(): Promise<CouplingMetrics> {
    return this.couplingMetricsService.getAll();
  }

  @Get('coupling/atom-test')
  @ApiOperation({ summary: 'Get atom-test coupling rate only' })
  @ApiResponse({ status: 200, description: 'Atom-test coupling metrics' })
  getAtomTestCoupling() {
    return this.couplingMetricsService.getAtomTestCoupling();
  }

  @Get('coupling/orphans')
  @ApiOperation({ summary: 'Get combined orphan lists' })
  @ApiResponse({ status: 200, description: 'Orphan atoms and tests' })
  async getOrphans() {
    const [atomTest, testAtom] = await Promise.all([
      this.couplingMetricsService.getAtomTestCoupling(),
      this.couplingMetricsService.getTestAtomCoupling(),
    ]);

    return {
      orphanAtoms: atomTest.orphanAtoms,
      orphanTests: testAtom.orphanTests,
    };
  }

  // ===========================================================================
  // Trend Endpoints (Phase 12.5)
  // ===========================================================================

  @Get('trends')
  @ApiOperation({
    summary: 'Get metrics trends over time',
    description: 'Get daily metrics snapshots for the specified period.',
  })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'quarter'] })
  @ApiResponse({ status: 200, description: 'Metrics trend data' })
  async getTrends(@Query('period') period?: 'week' | 'month' | 'quarter'): Promise<MetricsTrend[]> {
    if (!this.metricsHistoryService) {
      return [];
    }
    return this.metricsHistoryService.getTrends(period || 'month');
  }

  @Post('snapshot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record a metrics snapshot',
    description: 'Manually trigger a metrics snapshot for the current day.',
  })
  @ApiResponse({ status: 200, description: 'Snapshot recorded' })
  async recordSnapshot() {
    if (!this.metricsHistoryService) {
      throw new Error('Metrics history service not available');
    }
    return this.metricsHistoryService.recordSnapshot();
  }
}
