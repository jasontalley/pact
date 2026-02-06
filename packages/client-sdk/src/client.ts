/**
 * PactClient - Main entry point for the @pact/client-sdk
 *
 * Provides a unified interface for interacting with Pact servers
 * from client environments (VSCode extensions, CLI tools, CI/CD pipelines).
 *
 * Zero dependency on NestJS - uses only Node.js built-ins and fetch.
 */

import { PactClientConfig } from './types';
import { PactApiClient } from './api-client';
import { FileReader } from './file-reader';
import { GitClient } from './git-client';
import { CoverageCollector } from './coverage-collector';
import { PatchApplicator } from './patch-applicator';
import { MainCacheStore } from './main-cache-store';
import { MainCache } from './main-cache';
import { pull, PullCommandOptions, PullCommandResult } from './commands/pull';
import { check, CheckCommandOptions, CheckCommandResult } from './commands/check';

/**
 * Main client for interacting with Pact servers.
 *
 * Usage:
 * ```typescript
 * const client = new PactClient({
 *   serverUrl: 'https://pact.example.com',
 *   projectRoot: '/path/to/project',
 * });
 *
 * // Pull Main state
 * const pullResult = await client.pull();
 *
 * // Run local check
 * const checkResult = await client.check();
 *
 * // Submit pre-read content for reconciliation
 * const content = await client.readForReconciliation();
 * const result = await client.api.submitPreReadContent(content);
 * ```
 */
export class PactClient {
  private readonly config: PactClientConfig;
  private readonly _api: PactApiClient;
  private readonly _fileReader: FileReader;
  private readonly _gitClient: GitClient;
  private readonly _coverageCollector: CoverageCollector;
  private readonly _patchApplicator: PatchApplicator;
  private readonly _cacheStore: MainCacheStore;
  private _cache: MainCache | null = null;

  constructor(config: PactClientConfig) {
    this.config = config;

    // Initialize components
    this._api = new PactApiClient({
      serverUrl: config.serverUrl,
      projectId: config.projectId,
      authToken: config.authToken,
      timeout: config.timeout,
    });

    this._fileReader = new FileReader({
      projectRoot: config.projectRoot,
    });

    this._gitClient = new GitClient({
      projectRoot: config.projectRoot,
    });

    this._coverageCollector = new CoverageCollector({
      projectRoot: config.projectRoot,
    });

    this._patchApplicator = new PatchApplicator({
      projectRoot: config.projectRoot,
    });

    this._cacheStore = new MainCacheStore({
      projectRoot: config.projectRoot,
    });
  }

  // ===========================================================================
  // Component Accessors
  // ===========================================================================

  /**
   * Get the API client for direct server communication.
   */
  get api(): PactApiClient {
    return this._api;
  }

  /**
   * Get the file reader for local file operations.
   */
  get files(): FileReader {
    return this._fileReader;
  }

  /**
   * Get the git client for repository operations.
   */
  get git(): GitClient {
    return this._gitClient;
  }

  /**
   * Get the coverage collector.
   */
  get coverage(): CoverageCollector {
    return this._coverageCollector;
  }

  /**
   * Get the patch applicator for @atom annotations.
   */
  get patches(): PatchApplicator {
    return this._patchApplicator;
  }

  /**
   * Get the cache store for Main state persistence.
   */
  get cacheStore(): MainCacheStore {
    return this._cacheStore;
  }

  // ===========================================================================
  // High-Level Commands
  // ===========================================================================

  /**
   * Pull the latest Main state from the server.
   * Equivalent to `pact pull` CLI command.
   *
   * @param options - Optional override options
   */
  async pull(options?: Partial<PullCommandOptions>): Promise<PullCommandResult> {
    return pull({
      serverUrl: this.config.serverUrl,
      projectRoot: this.config.projectRoot,
      projectId: this.config.projectId,
      authToken: this.config.authToken,
      timeout: this.config.timeout,
      ...options,
    });
  }

  /**
   * Run a local reconciliation check.
   * Equivalent to `pact check` CLI command.
   *
   * @param options - Optional override options
   */
  async check(options?: Partial<CheckCommandOptions>): Promise<CheckCommandResult> {
    return check({
      projectRoot: this.config.projectRoot,
      ...options,
    });
  }

  /**
   * Get the cached Main state.
   * Loads from disk if not already loaded.
   */
  async getCache(): Promise<MainCache> {
    if (!this._cache) {
      this._cache = await this._cacheStore.load();
    }
    return this._cache;
  }

  /**
   * Refresh the cache from disk.
   */
  async refreshCache(): Promise<MainCache> {
    this._cache = await this._cacheStore.load();
    return this._cache;
  }

  // ===========================================================================
  // Convenience Methods
  // ===========================================================================

  /**
   * Read local files for reconciliation.
   * Returns content ready to submit via API.
   */
  async readForReconciliation(options?: {
    includeSourceFiles?: boolean;
    includeDocs?: boolean;
    maxFiles?: number;
  }) {
    const readContent = await this._fileReader.readForReconciliation(options);

    return {
      rootDirectory: this.config.projectRoot,
      manifest: {
        files: readContent.manifest.files,
        testFiles: readContent.manifest.testFiles,
        sourceFiles: readContent.manifest.sourceFiles,
      },
      fileContents: Object.fromEntries(readContent.contents),
      commitHash: readContent.commitHash,
      options,
    };
  }

  /**
   * Run a full reconciliation workflow:
   * 1. Read local files
   * 2. Submit to server
   * 3. Wait for completion
   * 4. Return results
   */
  async reconcile(options?: {
    includeSourceFiles?: boolean;
    includeDocs?: boolean;
    maxFiles?: number;
    pollInterval?: number;
    maxWait?: number;
  }) {
    // Read local files
    const content = await this.readForReconciliation({
      includeSourceFiles: options?.includeSourceFiles,
      includeDocs: options?.includeDocs,
      maxFiles: options?.maxFiles,
    });

    // Submit to server
    const runStart = await this._api.submitPreReadContent(content);

    // Wait for completion
    const result = await this._api.waitForCompletion(
      runStart.runId,
      options?.pollInterval,
      options?.maxWait,
    );

    return result;
  }

  /**
   * Collect and upload coverage data.
   *
   * @param coveragePath - Path to coverage file (or uses default locations)
   */
  async uploadCoverage(coveragePath?: string) {
    let coverageData;

    if (coveragePath) {
      coverageData = await this._coverageCollector.collectFromFile(coveragePath);
    } else {
      coverageData = await this._coverageCollector.collectFromDefaults();
      if (!coverageData) {
        throw new Error('No coverage data found in default locations');
      }
    }

    return this._api.uploadCoverage(coverageData);
  }

  /**
   * Check if this is a git repository.
   */
  isGitRepository(): boolean {
    return this._gitClient.isGitRepository();
  }

  /**
   * Get the current git commit hash.
   */
  getCommitHash(): string | undefined {
    try {
      if (this._gitClient.isGitRepository()) {
        return this._gitClient.getCurrentCommitHash();
      }
    } catch {
      // Git not available
    }
    return undefined;
  }

  /**
   * Get the current git branch.
   */
  getBranch(): string | undefined {
    try {
      if (this._gitClient.isGitRepository()) {
        return this._gitClient.getCurrentBranch();
      }
    } catch {
      // Git not available
    }
    return undefined;
  }

  /**
   * Check server health.
   */
  async checkHealth() {
    return this._api.health();
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Get the client configuration.
   */
  getConfig(): Readonly<PactClientConfig> {
    return { ...this.config };
  }

  /**
   * Get the server URL.
   */
  getServerUrl(): string {
    return this.config.serverUrl;
  }

  /**
   * Get the project root.
   */
  getProjectRoot(): string {
    return this.config.projectRoot;
  }

  /**
   * Get the project ID (if set).
   */
  getProjectId(): string | undefined {
    return this.config.projectId;
  }
}

/**
 * Create a PactClient instance.
 * Convenience function for creating clients.
 */
export function createPactClient(config: PactClientConfig): PactClient {
  return new PactClient(config);
}
