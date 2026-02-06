/**
 * @pact/client-sdk
 *
 * Client SDK for Pact - handles file reading, git operations,
 * coverage collection, and API communication.
 *
 * Zero dependency on NestJS - uses only Node.js built-ins and fetch.
 */
export { PactClient, createPactClient } from './client';
export { PactApiClient, ApiClientOptions, RequestOptions } from './api-client';
export { FileReader, FileReaderOptions } from './file-reader';
export { GitClient, GitClientOptions, GitChangedFile, GitDiff } from './git-client';
export { CoverageCollector, CoverageCollectorOptions } from './coverage-collector';
export { PatchApplicator, PatchApplicatorOptions } from './patch-applicator';
export { MainCache, CacheQueryOptions } from './main-cache';
export { MainCacheStore, MainCacheStoreOptions } from './main-cache-store';
export { pull, createPullCommand, PullCommandOptions, PullCommandResult, } from './commands/pull';
export { check, createCheckCommand, formatCheckResult, CheckCommandOptions, CheckCommandResult, } from './commands/check';
export * from './types';
