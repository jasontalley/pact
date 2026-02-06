/**
 * @pact/client-sdk
 *
 * Client SDK for Pact - handles file reading, git operations,
 * coverage collection, and API communication.
 *
 * Zero dependency on NestJS - uses only Node.js built-ins and fetch.
 */

// Main client
export { PactClient, createPactClient } from './client';

// API client
export { PactApiClient, ApiClientOptions, RequestOptions } from './api-client';

// File operations
export { FileReader, FileReaderOptions } from './file-reader';
export { GitClient, GitClientOptions, GitChangedFile, GitDiff } from './git-client';

// Coverage
export { CoverageCollector, CoverageCollectorOptions } from './coverage-collector';

// Patch application
export { PatchApplicator, PatchApplicatorOptions } from './patch-applicator';

// Main cache
export { MainCache, CacheQueryOptions } from './main-cache';
export { MainCacheStore, MainCacheStoreOptions } from './main-cache-store';

// Commands
export {
  pull,
  createPullCommand,
  PullCommandOptions,
  PullCommandResult,
} from './commands/pull';
export {
  check,
  createCheckCommand,
  formatCheckResult,
  CheckCommandOptions,
  CheckCommandResult,
} from './commands/check';

// Types
export * from './types';
