"use strict";
/**
 * Main Cache Store Module
 *
 * Persists the Main state cache to the local filesystem.
 * Stores in .pact/main-cache.json in the project root.
 *
 * The .pact/ directory should be gitignored.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainCacheStore = void 0;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const main_cache_1 = require("./main-cache");
/**
 * Persistent storage for the Main state cache.
 */
class MainCacheStore {
    projectRoot;
    cacheFileName;
    pactDirName;
    cachePath;
    pactDir;
    constructor(options) {
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
    async load() {
        const cache = new main_cache_1.MainCache();
        if (!fs.existsSync(this.cachePath)) {
            return cache;
        }
        try {
            const content = await fs.promises.readFile(this.cachePath, 'utf-8');
            const data = JSON.parse(content);
            cache.load(data);
        }
        catch (error) {
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
    async save(cache) {
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
    async saveRaw(data) {
        // Ensure .pact directory exists
        await this.ensurePactDir();
        const content = JSON.stringify(data, null, 2);
        await fs.promises.writeFile(this.cachePath, content, 'utf-8');
    }
    /**
     * Check if a cache file exists.
     */
    exists() {
        return fs.existsSync(this.cachePath);
    }
    /**
     * Check if the cache is stale.
     *
     * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
     */
    async isStale(maxAgeMs = 24 * 60 * 60 * 1000) {
        if (!this.exists()) {
            return true;
        }
        const cache = await this.load();
        return cache.isStale(maxAgeMs);
    }
    /**
     * Delete the cache file.
     */
    async delete() {
        if (fs.existsSync(this.cachePath)) {
            await fs.promises.unlink(this.cachePath);
        }
    }
    /**
     * Get the cache file path.
     */
    getCachePath() {
        return this.cachePath;
    }
    /**
     * Get the .pact directory path.
     */
    getPactDir() {
        return this.pactDir;
    }
    /**
     * Ensure the .pact directory exists and has a .gitignore.
     */
    async ensurePactDir() {
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
    async getMetadata() {
        if (!this.exists()) {
            return { exists: false };
        }
        try {
            const stats = await fs.promises.stat(this.cachePath);
            const content = await fs.promises.readFile(this.cachePath, 'utf-8');
            const data = JSON.parse(content);
            return {
                exists: true,
                snapshotVersion: data.snapshotVersion,
                pulledAt: new Date(data.pulledAt),
                serverUrl: data.serverUrl,
                projectId: data.projectId,
                sizeBytes: stats.size,
            };
        }
        catch {
            return { exists: true }; // File exists but couldn't be parsed
        }
    }
}
exports.MainCacheStore = MainCacheStore;
