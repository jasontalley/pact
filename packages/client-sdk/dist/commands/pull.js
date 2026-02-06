"use strict";
/**
 * Pull Command
 *
 * Fetches the latest Main state from the remote Pact server
 * and caches it locally in .pact/main-cache.json.
 *
 * This is the `pact pull` developer command.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pull = pull;
exports.createPullCommand = createPullCommand;
const api_client_1 = require("../api-client");
const main_cache_store_1 = require("../main-cache-store");
/**
 * Execute the pull command.
 *
 * Fetches the latest Main state from the server and replaces the local cache.
 * This is a simple replace operation - no merge logic needed.
 *
 * @param options - Pull command options
 * @returns Pull result
 */
async function pull(options) {
    const cacheStore = new main_cache_store_1.MainCacheStore({
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
    const apiClient = new api_client_1.PactApiClient({
        serverUrl: options.serverUrl,
        projectId: options.projectId,
        authToken: options.authToken,
        timeout: options.timeout,
    });
    // Pull main state from server
    const mainState = await apiClient.pullMainState();
    // Ensure the cache has required fields
    const cacheData = {
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
function createPullCommand(defaultOptions) {
    return (options) => {
        const mergedOptions = {
            ...defaultOptions,
            ...options,
        };
        if (!mergedOptions.serverUrl) {
            throw new Error('serverUrl is required');
        }
        if (!mergedOptions.projectRoot) {
            throw new Error('projectRoot is required');
        }
        return pull(mergedOptions);
    };
}
