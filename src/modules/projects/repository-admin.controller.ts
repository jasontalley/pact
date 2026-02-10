import {
  Controller,
  Get,
  Put,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional } from 'class-validator';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectsService } from './projects.service';
import { RepositoryConfigService, GitHubTestResult } from './repository-config.service';
import {
  RepositoryConfigDto,
  UpdateRepositoryConfigDto,
  ValidatePathDto,
  ValidatePathResultDto,
} from './dto/repository-config.dto';

// =============================================================================
// GitHub DTOs
// =============================================================================

class UpdateGitHubConfigDto {
  @IsOptional() @IsString() owner?: string;
  @IsOptional() @IsString() repo?: string;
  @IsOptional() @IsString() pat?: string;
  @IsOptional() @IsString() defaultBranch?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

@ApiTags('admin/repository')
@Controller('admin/repository')
export class RepositoryAdminController {
  private readonly logger = new Logger(RepositoryAdminController.name);

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly repositoryConfigService: RepositoryConfigService,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Get repository configuration' })
  @ApiResponse({ status: 200, type: RepositoryConfigDto })
  async getConfig(): Promise<RepositoryConfigDto> {
    const project = await this.projectsService.getOrCreateDefault();
    const repoPath = project.settings?.repositoryPath || '';

    let isValid = false;
    let isGitRepo = false;

    if (repoPath) {
      try {
        const stat = fs.statSync(repoPath);
        isValid = stat.isDirectory();
        isGitRepo = fs.existsSync(path.join(repoPath, '.git'));
      } catch {
        isValid = false;
      }
    }

    return {
      repositoryPath: repoPath,
      isValid,
      isGitRepo,
      projectId: project.id,
      projectName: project.name,
    };
  }

  @Put('config')
  @ApiOperation({ summary: 'Update repository configuration', deprecated: true })
  @ApiResponse({ status: 200, type: RepositoryConfigDto })
  async updateConfig(@Body() dto: UpdateRepositoryConfigDto): Promise<RepositoryConfigDto> {
    this.logger.warn('PUT /admin/repository/config is deprecated — use GitHub integration instead');
    const project = await this.projectsService.getOrCreateDefault();

    await this.projectsService.update(project.id, {
      settings: { repositoryPath: dto.repositoryPath },
    });

    this.logger.log(`Repository path updated to: ${dto.repositoryPath}`);
    return this.getConfig();
  }

  @Post('validate-path')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a filesystem path', deprecated: true })
  @ApiResponse({ status: 200, type: ValidatePathResultDto })
  async validatePath(@Body() dto: ValidatePathDto): Promise<ValidatePathResultDto> {
    this.logger.warn('POST /admin/repository/validate-path is deprecated — use GitHub integration instead');
    const result: ValidatePathResultDto = {
      path: dto.path,
      exists: false,
      isDirectory: false,
      isReadable: false,
    };

    try {
      const stat = fs.statSync(dto.path);
      result.exists = true;
      result.isDirectory = stat.isDirectory();

      if (result.isDirectory) {
        fs.accessSync(dto.path, fs.constants.R_OK);
        result.isReadable = true;
        result.isGitRepo = fs.existsSync(path.join(dto.path, '.git'));

        const entries = fs.readdirSync(dto.path);
        result.fileCount = entries.length;
      }
    } catch (e) {
      result.error = e instanceof Error ? e.message : 'Unknown error';
    }

    return result;
  }

  // ===========================================================================
  // GitHub Integration
  // ===========================================================================

  @Get('github')
  @ApiOperation({ summary: 'Get GitHub integration configuration' })
  async getGitHubConfig(): Promise<{
    owner?: string;
    repo?: string;
    patSet: boolean;
    defaultBranch?: string;
    enabled?: boolean;
    lastTestedAt?: string;
  }> {
    const config = await this.repositoryConfigService.getGitHubConfig();
    return {
      owner: config.owner,
      repo: config.repo,
      patSet: !!config.patSet,
      defaultBranch: config.defaultBranch,
      enabled: config.enabled,
      lastTestedAt: config.lastTestedAt,
    };
  }

  @Patch('github')
  @ApiOperation({ summary: 'Update GitHub integration configuration' })
  async updateGitHubConfig(@Body() dto: UpdateGitHubConfigDto): Promise<{
    owner?: string;
    repo?: string;
    patSet: boolean;
    defaultBranch?: string;
    enabled?: boolean;
    lastTestedAt?: string;
  }> {
    const result = await this.repositoryConfigService.updateGitHubConfig(dto);
    this.logger.log(`GitHub config updated: owner=${result.owner}, repo=${result.repo}`);
    return {
      owner: result.owner,
      repo: result.repo,
      patSet: !!result.patSet,
      defaultBranch: result.defaultBranch,
      enabled: result.enabled,
      lastTestedAt: result.lastTestedAt,
    };
  }

  @Post('test-github')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test GitHub connectivity' })
  async testGitHub(): Promise<GitHubTestResult> {
    return this.repositoryConfigService.testGitHubConnection();
  }
}
