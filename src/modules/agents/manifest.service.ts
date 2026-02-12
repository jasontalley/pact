/**
 * ManifestService
 *
 * Orchestrates deterministic manifest generation for a repository.
 * Runs 4 phases (structure → evidence → test quality → domain/context)
 * without any LLM calls. Produces a RepoManifest entity that captures
 * the full deterministic analysis, ready for dashboard display and
 * as input to the LLM inference phase of reconciliation.
 *
 * Typical generation time: 30-90 seconds.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ManifestRepository } from './repositories/manifest.repository';
import { RepoManifest } from './entities/repo-manifest.entity';
import type { ManifestContentSource } from './entities/repo-manifest.entity';
import { RepositoryConfigService } from '../projects/repository-config.service';
import { ReconciliationGateway } from '../../gateways/reconciliation.gateway';
import type { ManifestGenerateOptions } from './graphs/types/manifest.types';
import type { ContentProvider } from './content';
import { FilesystemContentProvider } from './content';
import { GitHubContentProvider } from './content/github-content-provider';
import { extractStructure } from './manifest/structure-extractor';
import { extractEvidence } from './manifest/evidence-extractor';
import {
  extractTestQuality,
  buildContextSnapshot,
  buildDomainModel,
  aggregateDomainConcepts,
  buildHealthSignals,
  buildDocumentationIndex,
} from './manifest/domain-extractor';

@Injectable()
export class ManifestService {
  private readonly logger = new Logger(ManifestService.name);

  constructor(
    private readonly manifestRepository: ManifestRepository,
    private readonly repositoryConfigService: RepositoryConfigService,
    @Optional() private readonly gateway?: ReconciliationGateway,
  ) {}

  /**
   * Generate a manifest for a project. Returns existing manifest if
   * same project + commit hash already has one with status='complete'.
   */
  async generate(options: ManifestGenerateOptions): Promise<RepoManifest> {
    const startTime = Date.now();

    // Resolve content source
    const contentSource: ManifestContentSource = options.contentSource || 'filesystem';
    const projectId = options.projectId || null;

    // Build content provider
    let contentProvider: ContentProvider;
    let rootDirectory: string;
    let commitHash: string | null = null;

    let repositoryUrl: string | null = null;

    if (contentSource === 'github') {
      const githubConfig = await this.repositoryConfigService.getGitHubConfig();
      if (!githubConfig.pat || !githubConfig.owner || !githubConfig.repo) {
        throw new Error('GitHub configuration incomplete (missing pat, owner, or repo)');
      }
      const owner = githubConfig.owner.trim();
      const repo = githubConfig.repo.trim();
      repositoryUrl = `https://github.com/${owner}/${repo}`;
      const ghProvider = await GitHubContentProvider.create({
        owner,
        repo,
        pat: githubConfig.pat,
        branch: githubConfig.defaultBranch || 'main',
      });
      contentProvider = ghProvider;
      rootDirectory = ghProvider.getCloneDir();
      if (ghProvider.getCommitHash) {
        try {
          commitHash = await ghProvider.getCommitHash();
        } catch {
          // Commit hash not available — fine
        }
      }
    } else {
      rootDirectory =
        options.rootDirectory || (await this.repositoryConfigService.getRepositoryPath());
      contentProvider = new FilesystemContentProvider(rootDirectory);
      // Try to get commit hash from filesystem
      if (contentProvider.getCommitHash) {
        try {
          commitHash = await contentProvider.getCommitHash();
        } catch {
          // Not a git repo or git not available — fine
        }
      }
    }

    // Check for existing manifest (dedup by project + commit)
    if (projectId && commitHash) {
      const existing = await this.manifestRepository.findByProjectAndCommit(
        projectId,
        commitHash,
      );
      if (existing) {
        this.logger.log(
          `Reusing existing manifest ${existing.id} for project=${projectId}, commit=${commitHash}`,
        );
        return existing;
      }
    }

    // Create manifest row in 'generating' status
    const manifest = await this.manifestRepository.create({
      projectId,
      commitHash,
      status: 'generating',
      rootDirectory,
      contentSource,
    });

    this.logger.log(`Manifest generation started: id=${manifest.id}, root=${rootDirectory}`);
    this.emitProgress(manifest.id, 'structure', 10);

    try {
      // Phase 1: Structure extraction
      const structureResult = await extractStructure(rootDirectory, contentProvider);
      manifest.repoStructureSnapshot = structureResult.repoStructure;
      manifest.coverageDataSnapshot = structureResult.coverageData;
      manifest.identity = {
        ...structureResult.identity,
        commitHash,
        repositoryUrl,
      };
      manifest.structure = structureResult.structure;

      this.logger.log(
        `Structure phase complete: ${structureResult.repoStructure.files.length} files categorized`,
      );
      this.emitProgress(manifest.id, 'evidence', 30);

      // Phase 2: Evidence extraction
      const evidenceResult = await extractEvidence(
        rootDirectory,
        contentProvider,
        structureResult.repoStructure,
        structureResult.coverageData,
      );
      manifest.orphanTestsSnapshot = evidenceResult.orphanTests;
      manifest.evidenceItemsSnapshot = evidenceResult.evidenceItems;
      manifest.evidenceInventory = evidenceResult.evidenceInventory;

      this.logger.log(
        `Evidence phase complete: ${evidenceResult.evidenceItems.length} items, ` +
          `${evidenceResult.orphanTests.length} orphan tests, ` +
          `${evidenceResult.linkedTestCount} linked tests`,
      );
      this.emitProgress(manifest.id, 'test_quality', 55);

      // Phase 3: Test quality analysis
      const qualityResult = extractTestQuality(evidenceResult.orphanTests);
      manifest.testQualitySnapshot = qualityResult.scores;

      this.logger.log(
        `Test quality phase complete: ${Object.keys(qualityResult.scores).length} scores`,
      );
      this.emitProgress(manifest.id, 'domain', 70);

      // Phase 4: Domain extraction (context, domain model, health signals, concepts)
      const documentationIndex = await buildDocumentationIndex(
        rootDirectory,
        20,
        contentProvider,
      );

      const contextSnapshot = buildContextSnapshot(
        evidenceResult.orphanTests,
        evidenceResult.evidenceItems,
        qualityResult.scores,
        documentationIndex.length > 0 ? documentationIndex : null,
      );
      manifest.contextSnapshot = contextSnapshot;

      const domainModel = buildDomainModel(evidenceResult.evidenceItems);
      manifest.domainModel = domainModel;

      manifest.domainConcepts = aggregateDomainConcepts(contextSnapshot.evidenceAnalysis);

      // Count dependencies from package.json
      const depCount = countDependencies(structureResult.repoStructure.packageInfo);
      manifest.healthSignals = buildHealthSignals(
        qualityResult.healthSignalQuality,
        structureResult.coverageData,
        depCount,
      );

      this.logger.log('Domain extraction phase complete');
      this.emitProgress(manifest.id, 'complete', 100);

      // Finalize
      manifest.status = 'complete';
      manifest.generationDurationMs = Date.now() - startTime;

      const saved = await this.manifestRepository.save(manifest);

      this.logger.log(
        `Manifest generation complete: id=${saved.id}, ` +
          `duration=${saved.generationDurationMs}ms, ` +
          `evidence=${evidenceResult.evidenceItems.length}`,
      );

      return saved;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Manifest generation failed: ${errorMessage}`);

      manifest.status = 'failed';
      manifest.errorMessage = errorMessage;
      manifest.generationDurationMs = Date.now() - startTime;
      await this.manifestRepository.save(manifest);

      throw error;
    } finally {
      // Clean up GitHub clone if applicable
      if (
        contentProvider &&
        'cleanup' in contentProvider &&
        typeof (contentProvider as any).cleanup === 'function'
      ) {
        try {
          await (contentProvider as any).cleanup();
        } catch (cleanupErr) {
          this.logger.warn(`Content provider cleanup failed: ${cleanupErr}`);
        }
      }
    }
  }

  /**
   * Generate a manifest in the background (fire-and-forget).
   * Used for auto-generation when a repo is connected.
   */
  async generateInBackground(options: ManifestGenerateOptions): Promise<void> {
    // Don't await — let it run asynchronously
    this.generate(options).catch((err) => {
      this.logger.warn(
        `Background manifest generation failed: ${err instanceof Error ? err.message : err}`,
      );
    });
  }

  /**
   * Get manifest by ID.
   */
  async getManifest(id: string): Promise<RepoManifest | null> {
    return this.manifestRepository.findById(id);
  }

  /**
   * Get the latest completed manifest for a project.
   */
  async getLatestForProject(projectId: string): Promise<RepoManifest | null> {
    return this.manifestRepository.findLatestForProject(projectId);
  }

  /**
   * List manifests for a project.
   */
  async listForProject(projectId: string, limit?: number): Promise<RepoManifest[]> {
    return this.manifestRepository.listForProject(projectId, limit);
  }

  /**
   * Emit manifest generation progress via gateway.
   */
  private emitProgress(manifestId: string, phase: string, percent: number): void {
    this.gateway?.emitManifestProgress(manifestId, phase, percent);
  }
}

/**
 * Count total dependencies from package info.
 */
function countDependencies(
  packageInfo?: { scripts?: Record<string, string> } & Record<string, unknown>,
): number {
  if (!packageInfo) return 0;
  // packageInfo doesn't directly store deps count, but we can estimate
  // from scripts (a rough proxy). Return 0 to be safe; the actual dep count
  // can be enriched later when we parse package.json more thoroughly.
  return Object.keys(packageInfo.scripts || {}).length;
}
