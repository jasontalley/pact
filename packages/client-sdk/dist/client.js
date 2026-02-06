"use strict";
/**
 * PactClient - Main entry point for the @pact/client-sdk
 *
 * Provides a unified interface for interacting with Pact servers
 * from client environments (VSCode extensions, CLI tools, CI/CD pipelines).
 *
 * Zero dependency on NestJS - uses only Node.js built-ins and fetch.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PactClient = void 0;
exports.createPactClient = createPactClient;
const api_client_1 = require("./api-client");
const file_reader_1 = require("./file-reader");
const git_client_1 = require("./git-client");
const coverage_collector_1 = require("./coverage-collector");
const patch_applicator_1 = require("./patch-applicator");
const main_cache_store_1 = require("./main-cache-store");
const pull_1 = require("./commands/pull");
const check_1 = require("./commands/check");
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
class PactClient {
    config;
    _api;
    _fileReader;
    _gitClient;
    _coverageCollector;
    _patchApplicator;
    _cacheStore;
    _cache = null;
    constructor(config) {
        this.config = config;
        // Initialize components
        this._api = new api_client_1.PactApiClient({
            serverUrl: config.serverUrl,
            projectId: config.projectId,
            authToken: config.authToken,
            timeout: config.timeout,
        });
        this._fileReader = new file_reader_1.FileReader({
            projectRoot: config.projectRoot,
        });
        this._gitClient = new git_client_1.GitClient({
            projectRoot: config.projectRoot,
        });
        this._coverageCollector = new coverage_collector_1.CoverageCollector({
            projectRoot: config.projectRoot,
        });
        this._patchApplicator = new patch_applicator_1.PatchApplicator({
            projectRoot: config.projectRoot,
        });
        this._cacheStore = new main_cache_store_1.MainCacheStore({
            projectRoot: config.projectRoot,
        });
    }
    // ===========================================================================
    // Component Accessors
    // ===========================================================================
    /**
     * Get the API client for direct server communication.
     */
    get api() {
        return this._api;
    }
    /**
     * Get the file reader for local file operations.
     */
    get files() {
        return this._fileReader;
    }
    /**
     * Get the git client for repository operations.
     */
    get git() {
        return this._gitClient;
    }
    /**
     * Get the coverage collector.
     */
    get coverage() {
        return this._coverageCollector;
    }
    /**
     * Get the patch applicator for @atom annotations.
     */
    get patches() {
        return this._patchApplicator;
    }
    /**
     * Get the cache store for Main state persistence.
     */
    get cacheStore() {
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
    async pull(options) {
        return (0, pull_1.pull)({
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
    async check(options) {
        return (0, check_1.check)({
            projectRoot: this.config.projectRoot,
            ...options,
        });
    }
    /**
     * Get the cached Main state.
     * Loads from disk if not already loaded.
     */
    async getCache() {
        if (!this._cache) {
            this._cache = await this._cacheStore.load();
        }
        return this._cache;
    }
    /**
     * Refresh the cache from disk.
     */
    async refreshCache() {
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
    async readForReconciliation(options) {
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
    async reconcile(options) {
        // Read local files
        const content = await this.readForReconciliation({
            includeSourceFiles: options?.includeSourceFiles,
            includeDocs: options?.includeDocs,
            maxFiles: options?.maxFiles,
        });
        // Submit to server
        const runStart = await this._api.submitPreReadContent(content);
        // Wait for completion
        const result = await this._api.waitForCompletion(runStart.runId, options?.pollInterval, options?.maxWait);
        return result;
    }
    /**
     * Collect and upload coverage data.
     *
     * @param coveragePath - Path to coverage file (or uses default locations)
     */
    async uploadCoverage(coveragePath) {
        let coverageData;
        if (coveragePath) {
            coverageData = await this._coverageCollector.collectFromFile(coveragePath);
        }
        else {
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
    isGitRepository() {
        return this._gitClient.isGitRepository();
    }
    /**
     * Get the current git commit hash.
     */
    getCommitHash() {
        try {
            if (this._gitClient.isGitRepository()) {
                return this._gitClient.getCurrentCommitHash();
            }
        }
        catch {
            // Git not available
        }
        return undefined;
    }
    /**
     * Get the current git branch.
     */
    getBranch() {
        try {
            if (this._gitClient.isGitRepository()) {
                return this._gitClient.getCurrentBranch();
            }
        }
        catch {
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
    getConfig() {
        return { ...this.config };
    }
    /**
     * Get the server URL.
     */
    getServerUrl() {
        return this.config.serverUrl;
    }
    /**
     * Get the project root.
     */
    getProjectRoot() {
        return this.config.projectRoot;
    }
    /**
     * Get the project ID (if set).
     */
    getProjectId() {
        return this.config.projectId;
    }
}
exports.PactClient = PactClient;
/**
 * Create a PactClient instance.
 * Convenience function for creating clients.
 */
function createPactClient(config) {
    return new PactClient(config);
}
