/**
 * Pull Command
 *
 * Fetches the latest Main state from the remote Pact server
 * and caches it locally in .pact/main-cache.json.
 *
 * This is the `pact pull` developer command.
 */

import { PactApiClient } from '../api-client';
import { MainCacheStore } from '../main-cache-store';
import { PullResult, MainStateCache } from '../types';

export interface PullCommandOptions {
  /** Remote Pact server URL */
  serverUrl: string;
  /** Project root directory */
  projectRoot: string;
  /** Project ID (for multi-tenant deployments) */
  projectId?: string;
  /** Authentication token */
  authToken?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Only pull if cache is older than this (milliseconds) */
  maxCacheAge?: number;
  /** Force pull even if cache is fresh */
  force?: boolean;
}

export interface PullCommandResult extends PullResult {
  /** Whether a pull was actually performed (false if cache was fresh) */
  wasPerformed: boolean;
  /** Cache file path */
  cachePath: string;
}

/**
 * Execute the pull command.
 *
 * Fetches the latest Main state from the server and replaces the local cache.
 * This is a simple replace operation - no merge logic needed.
 *
 * @param options - Pull command options
 * @returns Pull result
 */
export async function pull(options: PullCommandOptions): Promise<PullCommandResult> {
  const cacheStore = new MainCacheStore({
    projectRoot: options.projectRoot,
  });

  // Check if we need to pull
  if (!options.force) {
    const maxAge = options.maxCacheAge ?? 24 * 60 * 60 * 1000; // 24 hours default
    const isStale = await cacheStore.isStale(maxAge);

    if (!isStale) {
      const cache = await cacheStore.load();
      const summary = cache.getSummary();

      return {
        wasPerformed: false,
        atomCount: summary.atomCount,
        moleculeCount: summary.moleculeCount,
        linkCount: summary.linkCount,
        snapshotVersion: summary.snapshotVersion,
        pulledAt: summary.pulledAt ?? new Date(),
        cachePath: cacheStore.getCachePath(),
      };
    }
  }

  // Create API client
  const apiClient = new PactApiClient({
    serverUrl: options.serverUrl,
    projectId: options.projectId,
    authToken: options.authToken,
    timeout: options.timeout,
  });

  // Pull main state from server
  const mainState = await apiClient.pullMainState();

  // Ensure the cache has required fields
  const cacheData: MainStateCache = {
    atoms: mainState.atoms,
    molecules: mainState.molecules,
    atomTestLinks: mainState.atomTestLinks,
    snapshotVersion: mainState.snapshotVersion,
    pulledAt: new Date(),
    serverUrl: options.serverUrl,
    projectId: options.projectId,
  };

  // Save to cache (replaces existing cache entirely)
  await cacheStore.saveRaw(cacheData);

  return {
    wasPerformed: true,
    atomCount: mainState.atoms.length,
    moleculeCount: mainState.molecules.length,
    linkCount: mainState.atomTestLinks.length,
    snapshotVersion: mainState.snapshotVersion,
    pulledAt: new Date(),
    cachePath: cacheStore.getCachePath(),
  };
}

/**
 * Create a pull command with pre-configured options.
 * Useful for CLI tools.
 */
export function createPullCommand(
  defaultOptions: Partial<PullCommandOptions>,
): (options?: Partial<PullCommandOptions>) => Promise<PullCommandResult> {
  return (options?: Partial<PullCommandOptions>) => {
    const mergedOptions = {
      ...defaultOptions,
      ...options,
    } as PullCommandOptions;

    if (!mergedOptions.serverUrl) {
      throw new Error('serverUrl is required');
    }
    if (!mergedOptions.projectRoot) {
      throw new Error('projectRoot is required');
    }

    return pull(mergedOptions);
  };
}
