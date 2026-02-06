/**
 * Main Cache Store Module
 *
 * Persists the Main state cache to the local filesystem.
 * Stores in .pact/main-cache.json in the project root.
 *
 * The .pact/ directory should be gitignored.
 */
import { MainStateCache } from './types';
import { MainCache } from './main-cache';
export interface MainCacheStoreOptions {
    /** Project root directory */
    projectRoot: string;
    /** Cache file name (default: 'main-cache.json') */
    cacheFileName?: string;
    /** Pact directory name (default: '.pact') */
    pactDirName?: string;
}
/**
 * Persistent storage for the Main state cache.
 */
export declare class MainCacheStore {
    private readonly projectRoot;
    private readonly cacheFileName;
    private readonly pactDirName;
    private readonly cachePath;
    private readonly pactDir;
    constructor(options: MainCacheStoreOptions);
    /**
     * Load the cache from disk.
     *
     * @returns MainCache instance, or new empty cache if not found
     */
    load(): Promise<MainCache>;
    /**
     * Save the cache to disk.
     *
     * @param cache - MainCache instance to save
     */
    save(cache: MainCache): Promise<void>;
    /**
     * Save raw cache data to disk.
     *
     * @param data - MainStateCache data to save
     */
    saveRaw(data: MainStateCache): Promise<void>;
    /**
     * Check if a cache file exists.
     */
    exists(): boolean;
    /**
     * Check if the cache is stale.
     *
     * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
     */
    isStale(maxAgeMs?: number): Promise<boolean>;
    /**
     * Delete the cache file.
     */
    delete(): Promise<void>;
    /**
     * Get the cache file path.
     */
    getCachePath(): string;
    /**
     * Get the .pact directory path.
     */
    getPactDir(): string;
    /**
     * Ensure the .pact directory exists and has a .gitignore.
     */
    ensurePactDir(): Promise<void>;
    /**
     * Get cache metadata without loading full cache.
     */
    getMetadata(): Promise<{
        exists: boolean;
        snapshotVersion?: number;
        pulledAt?: Date;
        serverUrl?: string;
        projectId?: string;
        sizeBytes?: number;
    }>;
}
