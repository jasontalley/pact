import { Controller, Get, Put, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectsService } from './projects.service';
import {
  RepositoryConfigDto,
  UpdateRepositoryConfigDto,
  ValidatePathDto,
  ValidatePathResultDto,
} from './dto/repository-config.dto';

@ApiTags('admin/repository')
@Controller('admin/repository')
export class RepositoryAdminController {
  private readonly logger = new Logger(RepositoryAdminController.name);

  constructor(private readonly projectsService: ProjectsService) {}

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
  @ApiOperation({ summary: 'Update repository configuration' })
  @ApiResponse({ status: 200, type: RepositoryConfigDto })
  async updateConfig(@Body() dto: UpdateRepositoryConfigDto): Promise<RepositoryConfigDto> {
    const project = await this.projectsService.getOrCreateDefault();

    await this.projectsService.update(project.id, {
      settings: { repositoryPath: dto.repositoryPath },
    });

    this.logger.log(`Repository path updated to: ${dto.repositoryPath}`);
    return this.getConfig();
  }

  @Post('validate-path')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a filesystem path' })
  @ApiResponse({ status: 200, type: ValidatePathResultDto })
  async validatePath(@Body() dto: ValidatePathDto): Promise<ValidatePathResultDto> {
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
}
