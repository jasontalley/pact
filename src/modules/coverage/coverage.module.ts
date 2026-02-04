import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoverageReport } from './coverage-report.entity';
import { CoverageIngestionService } from './coverage-ingestion.service';
import { CoverageController } from './coverage.controller';

/**
 * CoverageModule: Phase 14A - Coverage Ingestion & Storage
 *
 * Implements the Ingestion Boundary pattern for coverage data.
 * Coverage reports are uploaded via API (not read from filesystem),
 * parsed into structured data, and stored for epistemic analysis.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CoverageReport])],
  controllers: [CoverageController],
  providers: [CoverageIngestionService],
  exports: [CoverageIngestionService],
})
export class CoverageModule {}
