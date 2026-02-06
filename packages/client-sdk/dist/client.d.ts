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
import { PullCommandOptions, PullCommandResult } from './commands/pull';
import { CheckCommandOptions, CheckCommandResult } from './commands/check';
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
export declare class PactClient {
    private readonly config;
    private readonly _api;
    private readonly _fileReader;
    private readonly _gitClient;
    private readonly _coverageCollector;
    private readonly _patchApplicator;
    private readonly _cacheStore;
    private _cache;
    constructor(config: PactClientConfig);
    /**
     * Get the API client for direct server communication.
     */
    get api(): PactApiClient;
    /**
     * Get the file reader for local file operations.
     */
    get files(): FileReader;
    /**
     * Get the git client for repository operations.
     */
    get git(): GitClient;
    /**
     * Get the coverage collector.
     */
    get coverage(): CoverageCollector;
    /**
     * Get the patch applicator for @atom annotations.
     */
    get patches(): PatchApplicator;
    /**
     * Get the cache store for Main state persistence.
     */
    get cacheStore(): MainCacheStore;
    /**
     * Pull the latest Main state from the server.
     * Equivalent to `pact pull` CLI command.
     *
     * @param options - Optional override options
     */
    pull(options?: Partial<PullCommandOptions>): Promise<PullCommandResult>;
    /**
     * Run a local reconciliation check.
     * Equivalent to `pact check` CLI command.
     *
     * @param options - Optional override options
     */
    check(options?: Partial<CheckCommandOptions>): Promise<CheckCommandResult>;
    /**
     * Get the cached Main state.
     * Loads from disk if not already loaded.
     */
    getCache(): Promise<MainCache>;
    /**
     * Refresh the cache from disk.
     */
    refreshCache(): Promise<MainCache>;
    /**
     * Read local files for reconciliation.
     * Returns content ready to submit via API.
     */
    readForReconciliation(options?: {
        includeSourceFiles?: boolean;
        includeDocs?: boolean;
        maxFiles?: number;
    }): Promise<{
        rootDirectory: string;
        manifest: {
            files: string[];
            testFiles: string[];
            sourceFiles: string[];
        };
        fileContents: {
            [k: string]: string;
        };
        commitHash: string | undefined;
        options: {
            includeSourceFiles?: boolean;
            includeDocs?: boolean;
            maxFiles?: number;
        } | undefined;
    }>;
    /**
     * Run a full reconciliation workflow:
     * 1. Read local files
     * 2. Submit to server
     * 3. Wait for completion
     * 4. Return results
     */
    reconcile(options?: {
        includeSourceFiles?: boolean;
        includeDocs?: boolean;
        maxFiles?: number;
        pollInterval?: number;
        maxWait?: number;
    }): Promise<import("./types").ReconciliationResult>;
    /**
     * Collect and upload coverage data.
     *
     * @param coveragePath - Path to coverage file (or uses default locations)
     */
    uploadCoverage(coveragePath?: string): Promise<{
        accepted: boolean;
    }>;
    /**
     * Check if this is a git repository.
     */
    isGitRepository(): boolean;
    /**
     * Get the current git commit hash.
     */
    getCommitHash(): string | undefined;
    /**
     * Get the current git branch.
     */
    getBranch(): string | undefined;
    /**
     * Check server health.
     */
    checkHealth(): Promise<{
        status: "ok" | "degraded" | "down";
        version: string;
    }>;
    /**
     * Get the client configuration.
     */
    getConfig(): Readonly<PactClientConfig>;
    /**
     * Get the server URL.
     */
    getServerUrl(): string;
    /**
     * Get the project root.
     */
    getProjectRoot(): string;
    /**
     * Get the project ID (if set).
     */
    getProjectId(): string | undefined;
}
/**
 * Create a PactClient instance.
 * Convenience function for creating clients.
 */
export declare function createPactClient(config: PactClientConfig): PactClient;
