import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { CoverageIngestionService } from './coverage-ingestion.service';
import {
  UploadCoverageDto,
  SubmitCoverageJsonDto,
  CoverageReportResponse,
  CoverageHistoryResponse,
} from './dto/coverage.dto';

/**
 * Coverage controller exposes the Ingestion Boundary for coverage data.
 *
 * All endpoints accept content (not file paths). A local Pact client reads
 * the coverage file from disk and uploads the content. A CI/CD pipeline
 * does the same. The server never touches the filesystem.
 */
@Controller('coverage')
export class CoverageController {
  private readonly logger = new Logger(CoverageController.name);

  constructor(private readonly coverageService: CoverageIngestionService) {}

  /**
   * Upload a raw coverage report (lcov, istanbul JSON, or cobertura XML).
   * Format is auto-detected from the content.
   */
  @Post('upload')
  async uploadCoverage(@Body() dto: UploadCoverageDto): Promise<CoverageReportResponse> {
    this.logger.log('POST /coverage/upload');
    const report = await this.coverageService.uploadCoverage(dto);
    return this.coverageService.toResponse(report);
  }

  /**
   * Submit pre-parsed coverage data as JSON.
   */
  @Post('json')
  async submitCoverageJson(@Body() dto: SubmitCoverageJsonDto): Promise<CoverageReportResponse> {
    this.logger.log('POST /coverage/json');
    const report = await this.coverageService.submitCoverageJson(dto);
    return this.coverageService.toResponse(report);
  }

  /**
   * Get the latest coverage report.
   */
  @Get('latest')
  async getLatest(@Query('projectId') projectId?: string): Promise<CoverageReportResponse> {
    const report = await this.coverageService.getLatest(projectId);
    if (!report) {
      throw new NotFoundException('No coverage reports found');
    }
    return this.coverageService.toResponse(report);
  }

  /**
   * Get a specific coverage report by ID.
   */
  @Get(':id')
  async getById(@Param('id') id: string): Promise<CoverageReportResponse> {
    const report = await this.coverageService.getById(id);
    if (!report) {
      throw new NotFoundException(`Coverage report ${id} not found`);
    }
    return this.coverageService.toResponse(report);
  }

  /**
   * Get coverage report history with pagination.
   */
  @Get('history')
  async getHistory(
    @Query('projectId') projectId?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ): Promise<CoverageHistoryResponse> {
    const limit = limitStr ? parseInt(limitStr, 10) : 20;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

    const { reports, total } = await this.coverageService.getHistory({
      projectId,
      limit,
      offset,
    });

    return {
      reports: reports.map((r) => this.coverageService.toResponse(r)),
      total,
      limit,
      offset,
    };
  }
}
