import { Injectable, Logger } from '@nestjs/common';
import { ProjectsService } from './projects.service';

/**
 * Service for resolving the configured repository path.
 * Injected by agent services (reconciliation, brownfield) to determine
 * the default rootDirectory when not provided in API requests.
 */
@Injectable()
export class RepositoryConfigService {
  private readonly logger = new Logger(RepositoryConfigService.name);

  constructor(private readonly projectsService: ProjectsService) {}

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
}
