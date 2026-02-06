import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriftDebt } from './entities/drift-debt.entity';
import { DriftDebtRepository } from './repositories/drift-debt.repository';
import { DriftDetectionService } from './drift-detection.service';
import { DriftPolicyService } from './drift-policy.service';
import { DriftMetricsService } from './drift-metrics.service';
import { DriftController } from './drift.controller';
import { ReconciliationRun } from '../agents/entities/reconciliation-run.entity';
import { TestRecord } from '../agents/entities/test-record.entity';
import { Atom } from '../atoms/atom.entity';
import { AtomRecommendation } from '../agents/entities/atom-recommendation.entity';
import { Project } from '../projects/project.entity';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DriftDebt,
      ReconciliationRun,
      TestRecord,
      Atom,
      AtomRecommendation,
      Project,
    ]),
    forwardRef(() => AgentsModule),
  ],
  controllers: [DriftController],
  providers: [
    DriftDebtRepository,
    DriftDetectionService,
    DriftPolicyService,
    DriftMetricsService,
  ],
  exports: [DriftDetectionService, DriftDebtRepository, DriftMetricsService, DriftPolicyService],
})
export class DriftModule {}
