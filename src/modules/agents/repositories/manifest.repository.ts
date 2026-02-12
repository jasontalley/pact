import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RepoManifest, ManifestStatus } from '../entities/repo-manifest.entity';

/**
 * Repository for RepoManifest persistence operations.
 *
 * Handles CRUD for manifest rows including dedup lookup
 * by projectId + commitHash.
 */
@Injectable()
export class ManifestRepository {
  constructor(
    @InjectRepository(RepoManifest)
    private readonly repo: Repository<RepoManifest>,
  ) {}

  /**
   * Create a new manifest row (typically in 'generating' status).
   */
  async create(data: Partial<RepoManifest>): Promise<RepoManifest> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  /**
   * Find manifest by UUID.
   */
  async findById(id: string): Promise<RepoManifest | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Find manifest by projectId + commitHash (dedup lookup).
   * Returns the most recent match with status='complete'.
   */
  async findByProjectAndCommit(
    projectId: string,
    commitHash: string,
  ): Promise<RepoManifest | null> {
    return this.repo.findOne({
      where: { projectId, commitHash, status: 'complete' as ManifestStatus },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find the latest completed manifest for a project.
   */
  async findLatestForProject(projectId: string): Promise<RepoManifest | null> {
    return this.repo.findOne({
      where: { projectId, status: 'complete' as ManifestStatus },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * List all manifests for a project, most recent first.
   */
  async listForProject(projectId: string, limit = 20): Promise<RepoManifest[]> {
    return this.repo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Update manifest status and optionally merge additional fields.
   */
  async updateStatus(
    id: string,
    status: ManifestStatus,
    updates?: Partial<RepoManifest>,
  ): Promise<void> {
    const payload: Record<string, unknown> = { status, ...updates };
    await this.repo.update(id, payload);
  }

  /**
   * Save a full manifest entity (for batch-updating all JSONB columns).
   */
  async save(manifest: RepoManifest): Promise<RepoManifest> {
    return this.repo.save(manifest);
  }
}
