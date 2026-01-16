import { Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { TestQualityService, QualityAnalysisResult } from './test-quality.service';

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
    const numDays = days ? parseInt(days, 10) : 7;
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
}
