import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Body,
  Param,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { TestQualityService, QualityAnalysisResult } from './test-quality.service';
import {
  AnalyzeTestDto,
  AnalyzeTestBatchDto,
  TestQualityResultDto,
  TestQualityBatchResultDto,
} from './dto/analyze-test.dto';
import {
  CreateQualityProfileDto,
  UpdateQualityProfileDto,
  QualityProfileResponseDto,
} from './dto/quality-profile.dto';

@ApiTags('quality')
@Controller('quality')
export class QualityController {
  constructor(private readonly testQualityService: TestQualityService) {}

  @Get('analyze')
  @ApiOperation({ summary: 'Analyze test quality across the codebase' })
  @ApiQuery({
    name: 'directory',
    required: false,
    description: 'Directory to analyze (default: src)',
  })
  @ApiQuery({
    name: 'saveSnapshot',
    required: false,
    type: Boolean,
    description: 'Save results to database',
  })
  @ApiResponse({ status: 200, description: 'Quality analysis results' })
  async analyzeQuality(
    @Query('directory') directory?: string,
    @Query('saveSnapshot') saveSnapshot?: string,
  ): Promise<QualityAnalysisResult> {
    return this.testQualityService.analyzeQuality({
      testDirectory: directory,
      saveSnapshot: saveSnapshot === 'true',
    });
  }

  @Get('report')
  @ApiOperation({ summary: 'Generate HTML quality report' })
  @ApiQuery({ name: 'directory', required: false, description: 'Directory to analyze' })
  @ApiResponse({ status: 200, description: 'HTML report' })
  async getHtmlReport(@Query('directory') directory: string, @Res() res: Response): Promise<void> {
    const result = await this.testQualityService.analyzeQuality({
      testDirectory: directory,
    });
    const html = this.testQualityService.generateHtmlReport(result);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Get quality trends over time' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to look back',
  })
  @ApiResponse({ status: 200, description: 'Quality trend data' })
  async getTrends(@Query('days') days?: string) {
    const numDays = days ? Number.parseInt(days, 10) : 7;
    return this.testQualityService.getRecentTrends(numDays);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get quality dashboard data' })
  @ApiResponse({ status: 200, description: 'Dashboard data with summary and trends' })
  async getDashboard(): Promise<{
    current: QualityAnalysisResult;
    trends: Array<{ date: Date; overallScore: number; passedFiles: number; totalFiles: number }>;
  }> {
    const current = await this.testQualityService.analyzeQuality();
    const trends = await this.testQualityService.getRecentTrends(7);

    return { current, trends };
  }

  @Post('snapshot')
  @ApiOperation({ summary: 'Save a quality snapshot to database' })
  @ApiQuery({ name: 'directory', required: false, description: 'Directory to analyze' })
  @ApiResponse({ status: 201, description: 'Snapshot saved successfully' })
  async saveSnapshot(@Query('directory') directory?: string) {
    const result = await this.testQualityService.analyzeQuality({
      testDirectory: directory,
      saveSnapshot: true,
    });

    return {
      message: 'Snapshot saved successfully',
      summary: result.summary,
      commitHash: result.commitHash,
    };
  }

  @Get('check')
  @ApiOperation({ summary: 'Check quality gate (returns 500 if failed)' })
  @ApiQuery({ name: 'directory', required: false, description: 'Directory to analyze' })
  @ApiResponse({ status: 200, description: 'Quality gate passed' })
  @ApiResponse({ status: 500, description: 'Quality gate failed' })
  async checkGate(@Query('directory') directory?: string) {
    await this.testQualityService.checkQualityGate({
      testDirectory: directory,
    });

    return { status: 'passed', message: 'All quality checks passed' };
  }

  // ==========================================================================
  // Phase 14B: Text-Based Analysis (Ingestion Boundary Pattern)
  // ==========================================================================

  @Post('analyze-test')
  @ApiOperation({ summary: 'Analyze test source code (text input, no filesystem access)' })
  @ApiResponse({ status: 200, description: 'Per-test quality analysis' })
  async analyzeTestSource(@Body() dto: AnalyzeTestDto): Promise<TestQualityResultDto> {
    return this.testQualityService.analyzeTestSource(dto.sourceCode, {
      filePath: dto.filePath,
      profileId: dto.profileId,
    });
  }

  @Post('analyze-batch')
  @ApiOperation({ summary: 'Batch analyze multiple test sources' })
  @ApiResponse({ status: 200, description: 'Batch quality analysis results' })
  async analyzeTestBatch(@Body() dto: AnalyzeTestBatchDto): Promise<TestQualityBatchResultDto> {
    return this.testQualityService.analyzeTestSourceBatch(dto.tests, {
      profileId: dto.profileId,
    });
  }

  // ==========================================================================
  // Phase 14B: Quality Profile CRUD
  // ==========================================================================

  @Get('profiles')
  @ApiOperation({ summary: 'List quality profiles' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Filter by project' })
  @ApiResponse({ status: 200, description: 'List of quality profiles' })
  async listProfiles(@Query('projectId') projectId?: string): Promise<QualityProfileResponseDto[]> {
    return this.testQualityService.listProfiles(projectId);
  }

  @Post('profiles')
  @ApiOperation({ summary: 'Create a quality profile' })
  @ApiResponse({ status: 201, description: 'Profile created' })
  async createProfile(@Body() dto: CreateQualityProfileDto): Promise<QualityProfileResponseDto> {
    const profile = await this.testQualityService.createProfile(dto);
    return this.testQualityService.toProfileResponse(profile);
  }

  @Get('profiles/:id')
  @ApiOperation({ summary: 'Get a quality profile by ID' })
  @ApiResponse({ status: 200, description: 'Quality profile' })
  async getProfile(@Param('id') id: string): Promise<QualityProfileResponseDto> {
    const profile = await this.testQualityService.getProfile(id);
    if (!profile) {
      throw new NotFoundException(`Quality profile ${id} not found`);
    }
    return this.testQualityService.toProfileResponse(profile);
  }

  @Patch('profiles/:id')
  @ApiOperation({ summary: 'Update a quality profile' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateQualityProfileDto,
  ): Promise<QualityProfileResponseDto> {
    const profile = await this.testQualityService.updateProfile(id, dto);
    if (!profile) {
      throw new NotFoundException(`Quality profile ${id} not found`);
    }
    return this.testQualityService.toProfileResponse(profile);
  }

  @Delete('profiles/:id')
  @ApiOperation({ summary: 'Delete a quality profile' })
  @ApiResponse({ status: 200, description: 'Profile deleted' })
  async deleteProfile(@Param('id') id: string) {
    const deleted = await this.testQualityService.deleteProfile(id);
    if (!deleted) {
      throw new NotFoundException(`Quality profile ${id} not found`);
    }
    return { message: 'Profile deleted' };
  }
}
