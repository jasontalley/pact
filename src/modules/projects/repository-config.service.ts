import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execSync } from 'child_process';
import { ProjectsService } from './projects.service';
import type { GitHubConfig } from './project.entity';

export interface GitHubTestResult {
  success: boolean;
  repoName?: string;
  defaultBranch?: string;
  error?: string;
  latencyMs?: number;
}

/**
 * Service for resolving the configured repository path.
 * Injected by agent services (reconciliation, brownfield) to determine
 * the default rootDirectory when not provided in API requests.
 */
@Injectable()
export class RepositoryConfigService {
  private readonly logger = new Logger(RepositoryConfigService.name);

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get the configured repository path.
   * Falls back to process.cwd() when no path is configured.
   */
  async getRepositoryPath(): Promise<string> {
    try {
      const project = await this.projectsService.getOrCreateDefault();
      const configured = project.settings?.repositoryPath;
      if (configured) {
        return configured;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to load repository path from settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
    return process.cwd();
  }

  /**
   * Get the GitHub configuration.
   * DB-stored config takes priority; env var GITHUB_PAT is fallback.
   */
  async getGitHubConfig(): Promise<GitHubConfig> {
    const project = await this.projectsService.getOrCreateDefault();
    const config = { ...(project.settings?.github ?? {}) };

    // Env var fallback for PAT (DB takes priority)
    if (!config.pat) {
      const envPat = this.configService.get<string>('GITHUB_PAT');
      if (envPat) {
        config.pat = envPat;
        config.patSet = true;
      }
    }

    // Default branch falls back to integrationTarget
    if (!config.defaultBranch) {
      config.defaultBranch = project.settings?.integrationTarget ?? 'main';
    }

    return config;
  }

  /**
   * Update GitHub configuration in project settings.
   * Never returns the raw PAT — only patSet boolean.
   */
  async updateGitHubConfig(dto: {
    owner?: string;
    repo?: string;
    pat?: string;
    defaultBranch?: string;
    enabled?: boolean;
  }): Promise<GitHubConfig> {
    const project = await this.projectsService.getOrCreateDefault();
    const existing = project.settings?.github ?? {};

    const updated: GitHubConfig = {
      ...existing,
      ...(dto.owner !== undefined ? { owner: dto.owner } : {}),
      ...(dto.repo !== undefined ? { repo: dto.repo } : {}),
      ...(dto.defaultBranch !== undefined ? { defaultBranch: dto.defaultBranch } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
    };

    // Handle PAT separately — set patSet flag
    if (dto.pat !== undefined) {
      if (dto.pat) {
        updated.pat = dto.pat;
        updated.patSet = true;
      } else {
        // Empty string clears the PAT
        updated.pat = undefined;
        updated.patSet = false;
      }
    }

    await this.projectsService.update(project.id, {
      settings: { github: updated },
    });

    this.logger.log(
      `GitHub config updated: owner=${updated.owner}, repo=${updated.repo}, patSet=${updated.patSet}`,
    );

    // Return safe version (no PAT)
    return {
      owner: updated.owner,
      repo: updated.repo,
      patSet: updated.patSet,
      defaultBranch: updated.defaultBranch,
      enabled: updated.enabled,
      lastTestedAt: updated.lastTestedAt,
    };
  }

  /**
   * Test GitHub connectivity using git ls-remote.
   */
  async testGitHubConnection(): Promise<GitHubTestResult> {
    const config = await this.getGitHubConfig();

    if (!config.pat) {
      return { success: false, error: 'No GitHub PAT configured' };
    }
    if (!config.owner || !config.repo) {
      return { success: false, error: 'GitHub owner and repo must be configured' };
    }

    const url = `https://x-access-token:${config.pat}@github.com/${config.owner}/${config.repo}.git`;
    const start = Date.now();

    try {
      const output = execSync(`git ls-remote --heads "${url}"`, {
        encoding: 'utf-8',
        timeout: 15000,
      });

      const latencyMs = Date.now() - start;

      // Parse default branch from ls-remote output
      const lines = output.trim().split('\n');
      const branches = lines
        .map((line) => line.split('\t')[1]?.replace('refs/heads/', ''))
        .filter(Boolean);

      const defaultBranch = config.defaultBranch && branches.includes(config.defaultBranch)
        ? config.defaultBranch
        : branches[0];

      // Update lastTestedAt
      const project = await this.projectsService.getOrCreateDefault();
      const github = { ...(project.settings?.github ?? {}), lastTestedAt: new Date().toISOString() };
      await this.projectsService.update(project.id, { settings: { github } });

      return {
        success: true,
        repoName: `${config.owner}/${config.repo}`,
        defaultBranch,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const rawMessage = error instanceof Error ? error.message : 'Unknown error';
      // Sanitize: strip PAT from error messages before logging or returning
      const message = rawMessage.replace(/x-access-token:[^@]+@/g, 'x-access-token:***@');
      this.logger.warn(`GitHub connectivity test failed: ${message}`);
      return {
        success: false,
        error: message.includes('Authentication failed')
          ? 'Authentication failed — check your PAT'
          : message.includes('not found')
            ? 'Repository not found — check owner/repo'
            : message.includes('git: not found') || message.includes('git:')
              ? 'git is not installed in the container — rebuild the Docker image'
              : `Connection failed (${latencyMs}ms)`,
        latencyMs,
      };
    }
  }
}
