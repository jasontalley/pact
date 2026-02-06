import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CoverageReport,
  CoverageFormat,
  CoverageSummary,
  CoverageFileDetail,
} from './coverage-report.entity';
import { autoDetectAndParse } from './parsers';
import {
  UploadCoverageDto,
  SubmitCoverageJsonDto,
  CoverageReportResponse,
} from './dto/coverage.dto';

/**
 * Service for ingesting, storing, and retrieving coverage data.
 *
 * This service implements the Ingestion Boundary pattern: coverage data
 * enters Pact through explicit API calls (not filesystem reads), is parsed
 * and stored in the database, and all subsequent analysis works from the
 * stored data.
 */
@Injectable()
export class CoverageIngestionService {
  private readonly logger = new Logger(CoverageIngestionService.name);

  constructor(
    @InjectRepository(CoverageReport)
    private readonly coverageRepository: Repository<CoverageReport>,
  ) {}

  /**
   * Upload and parse a raw coverage report.
   * Auto-detects format (lcov, istanbul JSON, cobertura XML).
   */
  async uploadCoverage(dto: UploadCoverageDto): Promise<CoverageReport> {
    this.logger.log('Processing coverage upload');

    let summary: CoverageSummary;
    let fileDetails: CoverageFileDetail[];
    let format: CoverageFormat;

    if (dto.format) {
      // Use specified format
      format = dto.format;
      const parsed = autoDetectAndParse(dto.content);
      summary = parsed.summary;
      fileDetails = parsed.files;
    } else {
      // Auto-detect format
      const parsed = autoDetectAndParse(dto.content);
      format = parsed.format as CoverageFormat;
      summary = parsed.summary;
      fileDetails = parsed.files;
    }

    this.logger.log(
      `Parsed ${format} coverage: ${summary.lines.pct}% lines, ` +
        `${summary.branches.pct}% branches, ${fileDetails.length} files`,
    );

    const report = this.coverageRepository.create({
      format,
      projectId: dto.projectId || null,
      reconciliationRunId: dto.reconciliationRunId || null,
      commitHash: dto.commitHash || null,
      branchName: dto.branchName || null,
      summary,
      fileDetails,
      metadata: dto.metadata || null,
    });

    return this.coverageRepository.save(report);
  }

  /**
   * Submit pre-parsed coverage data (e.g., from istanbul JSON API).
   */
  async submitCoverageJson(dto: SubmitCoverageJsonDto): Promise<CoverageReport> {
    this.logger.log('Processing pre-parsed coverage submission');

    const report = this.coverageRepository.create({
      format: 'istanbul' as CoverageFormat,
      projectId: dto.projectId || null,
      reconciliationRunId: dto.reconciliationRunId || null,
      commitHash: dto.commitHash || null,
      branchName: dto.branchName || null,
      summary: dto.summary,
      fileDetails: dto.fileDetails || [],
      metadata: dto.metadata || null,
    });

    return this.coverageRepository.save(report);
  }

  /**
   * Get the latest coverage report, optionally filtered by project.
   */
  async getLatest(projectId?: string): Promise<CoverageReport | null> {
    const where: Record<string, unknown> = {};
    if (projectId) {
      where.projectId = projectId;
    }

    return this.coverageRepository.findOne({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get a specific coverage report by ID.
   */
  async getById(id: string): Promise<CoverageReport | null> {
    return this.coverageRepository.findOne({ where: { id } });
  }

  /**
   * Get coverage report history with pagination.
   */
  async getHistory(options: {
    projectId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ reports: CoverageReport[]; total: number }> {
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    const qb = this.coverageRepository.createQueryBuilder('cr');

    if (options.projectId) {
      qb.andWhere('cr.projectId = :projectId', { projectId: options.projectId });
    }

    qb.orderBy('cr.createdAt', 'DESC');
    qb.take(limit);
    qb.skip(offset);

    const [reports, total] = await qb.getManyAndCount();

    return { reports, total };
  }

  /**
   * Get coverage for a specific file from the latest report.
   */
  async getFileCoverage(filePath: string, projectId?: string): Promise<CoverageFileDetail | null> {
    const latest = await this.getLatest(projectId);
    if (!latest) return null;

    return latest.fileDetails.find((f) => f.filePath === filePath) || null;
  }

  /**
   * Convert entity to response DTO
   */
  toResponse(report: CoverageReport): CoverageReportResponse {
    return {
      id: report.id,
      projectId: report.projectId,
      reconciliationRunId: report.reconciliationRunId,
      format: report.format,
      commitHash: report.commitHash,
      branchName: report.branchName,
      summary: report.summary,
      fileDetails: report.fileDetails,
      metadata: report.metadata,
      createdAt: report.createdAt.toISOString(),
    };
  }
}
