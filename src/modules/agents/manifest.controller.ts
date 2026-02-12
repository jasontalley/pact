/**
 * Manifest Controller
 *
 * REST API endpoints for generating and retrieving RepoManifests.
 * Manifests are deterministic repository analysis snapshots (no LLM calls).
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { ManifestService } from './manifest.service';
import { ProjectsService } from '../projects/projects.service';
import { RepoManifest, ManifestContentSource } from './entities/repo-manifest.entity';

// =============================================================================
// DTOs
// =============================================================================

class GenerateManifestDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  rootDirectory?: string;

  @IsOptional()
  @IsIn(['filesystem', 'github'])
  contentSource?: ManifestContentSource;
}

// =============================================================================
// Controller
// =============================================================================

@ApiTags('manifest')
@Controller('agents/manifest')
export class ManifestController {
  private readonly logger = new Logger(ManifestController.name);

  constructor(
    private readonly manifestService: ManifestService,
    private readonly projectsService: ProjectsService,
  ) {}

  /**
   * Generate a manifest for a project.
   * Returns an existing manifest if same project + commit already exists.
   */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate a repository manifest',
    description:
      'Generate a deterministic manifest for a repository. ' +
      'Reuses existing manifests if the same project + commit already has one.',
  })
  @ApiBody({ type: GenerateManifestDto })
  @ApiResponse({ status: 200, description: 'Manifest generated or reused' })
  @ApiResponse({ status: 500, description: 'Generation failed' })
  async generate(@Body() dto: GenerateManifestDto): Promise<RepoManifest> {
    this.logger.log(
      `POST /agents/manifest/generate — project=${dto.projectId}, source=${dto.contentSource || 'filesystem'}`,
    );
    return this.manifestService.generate({
      projectId: dto.projectId,
      rootDirectory: dto.rootDirectory,
      contentSource: dto.contentSource,
    });
  }

  /**
   * Get the latest manifest for the default project.
   * No projectId required — auto-resolves via getOrCreateDefault().
   */
  @Get('latest')
  @ApiOperation({ summary: 'Get latest manifest for the default project' })
  @ApiResponse({ status: 200, description: 'Latest manifest or null' })
  async getLatestForDefault(): Promise<RepoManifest | null> {
    this.logger.log('GET /agents/manifest/latest');
    const project = await this.projectsService.getOrCreateDefault();
    return this.manifestService.getLatestForProject(project.id);
  }

  /**
   * Get a manifest by ID.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get manifest by ID' })
  @ApiParam({ name: 'id', description: 'Manifest UUID' })
  @ApiResponse({ status: 200, description: 'Manifest found' })
  @ApiResponse({ status: 404, description: 'Manifest not found' })
  async getById(@Param('id') id: string): Promise<RepoManifest> {
    this.logger.log(`GET /agents/manifest/${id}`);
    const manifest = await this.manifestService.getManifest(id);
    if (!manifest) {
      throw new NotFoundException(`Manifest ${id} not found`);
    }
    return manifest;
  }

  /**
   * List manifests for a project.
   */
  @Get('project/:projectId')
  @ApiOperation({ summary: 'List manifests for a project' })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @ApiResponse({ status: 200, description: 'Manifest list' })
  async listForProject(@Param('projectId') projectId: string): Promise<RepoManifest[]> {
    this.logger.log(`GET /agents/manifest/project/${projectId}`);
    return this.manifestService.listForProject(projectId);
  }

  /**
   * Get the latest manifest for a project.
   */
  @Get('project/:projectId/latest')
  @ApiOperation({ summary: 'Get latest manifest for a project' })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @ApiResponse({ status: 200, description: 'Latest manifest' })
  @ApiResponse({ status: 404, description: 'No manifest found' })
  async getLatest(@Param('projectId') projectId: string): Promise<RepoManifest> {
    this.logger.log(`GET /agents/manifest/project/${projectId}/latest`);
    const manifest = await this.manifestService.getLatestForProject(projectId);
    if (!manifest) {
      throw new NotFoundException(`No manifest found for project ${projectId}`);
    }
    return manifest;
  }
}
