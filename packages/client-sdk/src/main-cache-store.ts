/**
 * Main Cache Store Module
 *
 * Persists the Main state cache to the local filesystem.
 * Stores in .pact/main-cache.json in the project root.
 *
 * The .pact/ directory should be gitignored.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
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
export class MainCacheStore {
  private readonly projectRoot: string;
  private readonly cacheFileName: string;
  private readonly pactDirName: string;
  private readonly cachePath: string;
  private readonly pactDir: string;

  constructor(options: MainCacheStoreOptions) {
    this.projectRoot = options.projectRoot;
    this.cacheFileName = options.cacheFileName ?? 'main-cache.json';
    this.pactDirName = options.pactDirName ?? '.pact';
    this.pactDir = path.join(this.projectRoot, this.pactDirName);
    this.cachePath = path.join(this.pactDir, this.cacheFileName);
  }

  /**
   * Load the cache from disk.
   *
   * @returns MainCache instance, or new empty cache if not found
   */
  async load(): Promise<MainCache> {
    const cache = new MainCache();

    if (!fs.existsSync(this.cachePath)) {
      return cache;
    }

    try {
      const content = await fs.promises.readFile(this.cachePath, 'utf-8');
      const data = JSON.parse(content) as MainStateCache;
      cache.load(data);
    } catch (error) {
      // If there's an error reading/parsing, return empty cache
      console.warn(`Warning: Could not load cache from ${this.cachePath}: ${error}`);
    }

    return cache;
  }

  /**
   * Save the cache to disk.
   *
   * @param cache - MainCache instance to save
   */
  async save(cache: MainCache): Promise<void> {
    // Ensure .pact directory exists
    await this.ensurePactDir();

    const data = cache.export();
    const content = JSON.stringify(data, null, 2);

    await fs.promises.writeFile(this.cachePath, content, 'utf-8');
  }

  /**
   * Save raw cache data to disk.
   *
   * @param data - MainStateCache data to save
   */
  async saveRaw(data: MainStateCache): Promise<void> {
    // Ensure .pact directory exists
    await this.ensurePactDir();

    const content = JSON.stringify(data, null, 2);
    await fs.promises.writeFile(this.cachePath, content, 'utf-8');
  }

  /**
   * Check if a cache file exists.
   */
  exists(): boolean {
    return fs.existsSync(this.cachePath);
  }

  /**
   * Check if the cache is stale.
   *
   * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
   */
  async isStale(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<boolean> {
    if (!this.exists()) {
      return true;
    }

    const cache = await this.load();
    return cache.isStale(maxAgeMs);
  }

  /**
   * Delete the cache file.
   */
  async delete(): Promise<void> {
    if (fs.existsSync(this.cachePath)) {
      await fs.promises.unlink(this.cachePath);
    }
  }

  /**
   * Get the cache file path.
   */
  getCachePath(): string {
    return this.cachePath;
  }

  /**
   * Get the .pact directory path.
   */
  getPactDir(): string {
    return this.pactDir;
  }

  /**
   * Ensure the .pact directory exists and has a .gitignore.
   */
  async ensurePactDir(): Promise<void> {
    if (!fs.existsSync(this.pactDir)) {
      await fs.promises.mkdir(this.pactDir, { recursive: true });
    }

    // Create .gitignore in .pact directory if it doesn't exist
    const gitignorePath = path.join(this.pactDir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      await fs.promises.writeFile(gitignorePath, '*\n', 'utf-8');
    }
  }

  /**
   * Get cache metadata without loading full cache.
   */
  async getMetadata(): Promise<{
    exists: boolean;
    snapshotVersion?: number;
    pulledAt?: Date;
    serverUrl?: string;
    projectId?: string;
    sizeBytes?: number;
  }> {
    if (!this.exists()) {
      return { exists: false };
    }

    try {
      const stats = await fs.promises.stat(this.cachePath);
      const content = await fs.promises.readFile(this.cachePath, 'utf-8');
      const data = JSON.parse(content) as MainStateCache;

      return {
        exists: true,
        snapshotVersion: data.snapshotVersion,
        pulledAt: new Date(data.pulledAt),
        serverUrl: data.serverUrl,
        projectId: data.projectId,
        sizeBytes: stats.size,
      };
    } catch {
      return { exists: true }; // File exists but couldn't be parsed
    }
  }
}
