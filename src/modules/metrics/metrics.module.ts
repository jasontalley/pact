import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Atom } from '../atoms/atom.entity';
import { TestRecord } from '../agents/entities/test-record.entity';
import { AtomRecommendation } from '../agents/entities/atom-recommendation.entity';
import { MetricsSnapshot } from './metrics-snapshot.entity';
import { CoverageReport } from '../coverage/coverage-report.entity';
import { CouplingMetricsService } from './coupling-metrics.service';
import { EpistemicMetricsService } from './epistemic-metrics.service';
import { MetricsHistoryService } from './metrics-history.service';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Atom,
      TestRecord,
      AtomRecommendation,
      MetricsSnapshot,
      CoverageReport,
    ]),
  ],
  controllers: [MetricsController],
  providers: [CouplingMetricsService, EpistemicMetricsService, MetricsHistoryService],
  exports: [CouplingMetricsService, EpistemicMetricsService, MetricsHistoryService],
})
export class MetricsModule {}
