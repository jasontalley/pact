import * as path from 'path';
import { ContentProvider, FileEntry, ListOptions, WalkOptions } from './content-provider.interface';

/**
 * Configuration for PreReadContentProvider
 */
export interface PreReadContentConfig {
  /** Map of file path to content */
  contents: Map<string, string>;
  /** File manifest (list of all files in the project) */
  manifest: FileEntry[];
  /** Git commit hash (optional) */
  commitHash?: string;
  /** Root directory path (for relative path resolution) */
  rootDirectory?: string;
}

/**
 * PreReadContentProvider - provides content from a pre-read in-memory map
 *
 * This provider is used in remote mode where a client SDK reads files locally
 * and sends them to the Pact server via API. The server creates a
 * PreReadContentProvider from the API payload.
 */
export class PreReadContentProvider implements ContentProvider {
  readonly providerType = 'pre-read' as const;

  private readonly contents: Map<string, string>;
  private readonly manifest: FileEntry[];
  private readonly commitHash?: string;
  private readonly rootDirectory: string;

  constructor(config: PreReadContentConfig) {
    this.contents = config.contents;
    this.manifest = config.manifest;
    this.commitHash = config.commitHash;
    this.rootDirectory = config.rootDirectory || '';
  }

  /**
   * Create a PreReadContentProvider from a JSON payload (e.g., from API)
   */
  static fromPayload(payload: {
    fileContents: Record<string, string>;
    manifest?: { files: string[]; testFiles?: string[]; sourceFiles?: string[] };
    commitHash?: string;
    rootDirectory?: string;
  }): PreReadContentProvider {
    const contents = new Map<string, string>(Object.entries(payload.fileContents));

    // Build manifest from explicit manifest or from contents keys
    let manifest: FileEntry[];
    if (payload.manifest?.files) {
      manifest = payload.manifest.files.map((filePath) => ({
        path: filePath,
        isDirectory: false,
        size: payload.fileContents[filePath]?.length,
      }));
    } else {
      manifest = Array.from(contents.keys()).map((filePath) => ({
        path: filePath,
        isDirectory: false,
        size: contents.get(filePath)?.length,
      }));
    }

    return new PreReadContentProvider({
      contents,
      manifest,
      commitHash: payload.commitHash,
      rootDirectory: payload.rootDirectory,
    });
  }

  /**
   * Normalize a file path for lookup
   */
  private normalizePath(filePath: string): string {
    // Remove root directory prefix if present
    let normalized = filePath;
    if (this.rootDirectory && normalized.startsWith(this.rootDirectory)) {
      normalized = normalized.slice(this.rootDirectory.length);
      if (normalized.startsWith('/') || normalized.startsWith('\\')) {
        normalized = normalized.slice(1);
      }
    }
    // Normalize separators
    return normalized.replace(/\\/g, '/');
  }

  /**
   * List files in a directory
   */
  async listFiles(dir: string, options?: ListOptions): Promise<FileEntry[]> {
    const normalizedDir = this.normalizePath(dir);
    const entries: FileEntry[] = [];
    const seenDirs = new Set<string>();

    for (const entry of this.manifest) {
      const normalizedPath = this.normalizePath(entry.path);

      // Check if this file is in the target directory
      if (normalizedDir === '' || normalizedPath.startsWith(normalizedDir + '/')) {
        const relativePath =
          normalizedDir === '' ? normalizedPath : normalizedPath.slice(normalizedDir.length + 1);

        const parts = relativePath.split('/');

        if (options?.recursive || parts.length === 1) {
          // Include the file directly
          entries.push(entry);
        } else if (parts.length > 1) {
          // This is in a subdirectory - add the directory entry
          const subDirName = parts[0];
          const subDirPath = normalizedDir ? `${normalizedDir}/${subDirName}` : subDirName;

          if (!seenDirs.has(subDirPath)) {
            seenDirs.add(subDirPath);
            entries.push({
              path: subDirPath,
              isDirectory: true,
            });
          }
        }
      }
    }

    return entries;
  }

  /**
   * Walk a directory tree, returning all matching file paths
   */
  async walkDirectory(rootDir: string, options?: WalkOptions): Promise<string[]> {
    const normalizedRoot = this.normalizePath(rootDir);
    const excludePatterns = options?.excludePatterns ?? [];
    const maxFiles = options?.maxFiles ?? 10000;
    const includeExtensions = options?.includeExtensions;
    const includeDirectories = options?.includeDirectories ?? false;

    const files: string[] = [];

    const shouldExclude = (filePath: string): boolean => {
      for (const pattern of excludePatterns) {
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          if (regex.test(filePath) || regex.test(path.basename(filePath))) {
            return true;
          }
        } else if (
          filePath.includes(`/${pattern}/`) ||
          filePath.includes(`/${pattern}`) ||
          filePath.startsWith(`${pattern}/`) ||
          path.basename(filePath) === pattern
        ) {
          return true;
        }
      }
      return false;
    };

    const seenDirs = new Set<string>();

    for (const entry of this.manifest) {
      if (files.length >= maxFiles) break;

      const normalizedPath = this.normalizePath(entry.path);

      // Check if this file is under the root directory
      if (
        normalizedRoot === '' ||
        normalizedPath.startsWith(normalizedRoot + '/') ||
        normalizedPath === normalizedRoot
      ) {
        const relativePath =
          normalizedRoot === '' ? normalizedPath : normalizedPath.slice(normalizedRoot.length + 1);

        if (!relativePath) continue;

        if (shouldExclude(relativePath)) continue;

        if (entry.isDirectory) {
          if (includeDirectories && !seenDirs.has(relativePath)) {
            seenDirs.add(relativePath);
            files.push(relativePath);
          }
        } else {
          // Filter by extension if specified
          if (includeExtensions) {
            const ext = path.extname(relativePath).toLowerCase();
            if (!includeExtensions.includes(ext)) {
              continue;
            }
          }
          files.push(relativePath);
        }
      }
    }

    return files;
  }

  /**
   * Read a file's contents
   */
  async readFile(filePath: string): Promise<string> {
    const normalizedPath = this.normalizePath(filePath);

    // Try exact match first
    if (this.contents.has(normalizedPath)) {
      return this.contents.get(normalizedPath)!;
    }

    // Try with original path
    if (this.contents.has(filePath)) {
      return this.contents.get(filePath)!;
    }

    // Try to find a matching key
    for (const [key, value] of this.contents) {
      if (this.normalizePath(key) === normalizedPath) {
        return value;
      }
    }

    throw new Error(`File not available in pre-read content: ${filePath}`);
  }

  /**
   * Check if a file or directory exists
   */
  async exists(filePath: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(filePath);

    // Check if it's in contents
    if (this.contents.has(normalizedPath) || this.contents.has(filePath)) {
      return true;
    }

    // Check manifest
    for (const entry of this.manifest) {
      const entryNormalized = this.normalizePath(entry.path);
      if (entryNormalized === normalizedPath || entry.path === filePath) {
        return true;
      }
      // Check if it's a directory (prefix match)
      if (entryNormalized.startsWith(normalizedPath + '/')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Read a file's contents, returning null if it doesn't exist
   */
  async readFileOrNull(filePath: string): Promise<string | null> {
    try {
      return await this.readFile(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Get the git commit hash
   */
  async getCommitHash(): Promise<string | null> {
    return this.commitHash ?? null;
  }

  /**
   * Read multiple files at once
   */
  async readFiles(filePaths: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    for (const filePath of filePaths) {
      const content = await this.readFileOrNull(filePath);
      if (content !== null) {
        results.set(filePath, content);
      }
    }

    return results;
  }

  /**
   * Get file stats
   */
  async getFileStats(filePath: string): Promise<FileEntry | null> {
    const normalizedPath = this.normalizePath(filePath);

    for (const entry of this.manifest) {
      if (this.normalizePath(entry.path) === normalizedPath) {
        return entry;
      }
    }

    // Check if it exists in contents but not manifest
    if (this.contents.has(normalizedPath) || this.contents.has(filePath)) {
      const content = this.contents.get(normalizedPath) || this.contents.get(filePath);
      return {
        path: filePath,
        isDirectory: false,
        size: content?.length,
      };
    }

    return null;
  }

  /**
   * Get all available file paths
   */
  getAvailablePaths(): string[] {
    return Array.from(this.contents.keys());
  }

  /**
   * Get the manifest
   */
  getManifest(): FileEntry[] {
    return [...this.manifest];
  }
}
