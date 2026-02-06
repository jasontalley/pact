import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { ContentProvider, FileEntry, ListOptions, WalkOptions } from './content-provider.interface';

/**
 * Default exclude patterns for directory walking
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '__pycache__',
  '.pytest_cache',
  'vendor',
  '.idea',
  '.vscode',
];

/**
 * FilesystemContentProvider - reads content directly from the local filesystem
 *
 * This is the default provider for co-located mode where Pact runs on the same
 * machine as the project being analyzed.
 */
export class FilesystemContentProvider implements ContentProvider {
  readonly providerType = 'filesystem' as const;

  constructor(private readonly basePath?: string) {}

  /**
   * Resolve a path relative to the base path (if set)
   */
  private resolvePath(filePath: string): string {
    if (this.basePath && !path.isAbsolute(filePath)) {
      return path.join(this.basePath, filePath);
    }
    return filePath;
  }

  /**
   * List files in a directory
   */
  async listFiles(dir: string, options?: ListOptions): Promise<FileEntry[]> {
    const resolvedDir = this.resolvePath(dir);
    const entries: FileEntry[] = [];

    try {
      const items = fs.readdirSync(resolvedDir, { withFileTypes: true });

      for (const item of items) {
        const itemPath = path.join(dir, item.name);
        const entry: FileEntry = {
          path: itemPath,
          isDirectory: item.isDirectory(),
        };

        if (!item.isDirectory()) {
          try {
            const stats = fs.statSync(this.resolvePath(itemPath));
            entry.size = stats.size;
            entry.modifiedAt = stats.mtime;
          } catch {
            // Stats not available, continue without them
          }
        }

        entries.push(entry);

        // Recursive listing
        if (options?.recursive && item.isDirectory()) {
          const maxDepth = options.maxDepth ?? 10;
          const currentDepth = itemPath.split(path.sep).length - dir.split(path.sep).length;
          if (currentDepth < maxDepth) {
            const subEntries = await this.listFiles(itemPath, {
              ...options,
              maxDepth: maxDepth - 1,
            });
            entries.push(...subEntries);
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    return entries;
  }

  /**
   * Walk a directory tree, returning all matching file paths
   * Extracted and generalized from structure.node.ts walkDirectory logic
   */
  async walkDirectory(rootDir: string, options?: WalkOptions): Promise<string[]> {
    const resolvedRoot = this.resolvePath(rootDir);
    const excludePatterns = options?.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS;
    const maxFiles = options?.maxFiles ?? 10000;
    const includeExtensions = options?.includeExtensions;
    const includeDirectories = options?.includeDirectories ?? false;

    const files: string[] = [];

    const shouldExclude = (name: string, fullPath: string): boolean => {
      for (const pattern of excludePatterns) {
        // Simple glob matching
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          if (regex.test(name) || regex.test(fullPath)) {
            return true;
          }
        } else if (
          name === pattern ||
          fullPath.includes(`/${pattern}/`) ||
          fullPath.includes(`\\${pattern}\\`)
        ) {
          return true;
        }
      }
      return false;
    };

    const walk = (dir: string): void => {
      if (files.length >= maxFiles) return;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return; // Skip unreadable directories
      }

      for (const entry of entries) {
        if (files.length >= maxFiles) break;

        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(resolvedRoot, fullPath);

        if (shouldExclude(entry.name, relativePath)) {
          continue;
        }

        if (entry.isDirectory()) {
          if (includeDirectories) {
            files.push(relativePath);
          }
          walk(fullPath);
        } else if (entry.isFile()) {
          // Filter by extension if specified
          if (includeExtensions) {
            const ext = path.extname(entry.name).toLowerCase();
            if (!includeExtensions.includes(ext)) {
              continue;
            }
          }
          files.push(relativePath);
        }
      }
    };

    walk(resolvedRoot);
    return files;
  }

  /**
   * Read a file's contents
   */
  async readFile(filePath: string): Promise<string> {
    const resolvedPath = this.resolvePath(filePath);
    return fs.readFileSync(resolvedPath, 'utf-8');
  }

  /**
   * Check if a file or directory exists
   */
  async exists(filePath: string): Promise<boolean> {
    const resolvedPath = this.resolvePath(filePath);
    return fs.existsSync(resolvedPath);
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
   * Get the current git commit hash
   */
  async getCommitHash(): Promise<string | null> {
    try {
      const cwd = this.basePath || process.cwd();
      const hash = execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8' }).trim();
      return hash || null;
    } catch {
      return null;
    }
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
    try {
      const resolvedPath = this.resolvePath(filePath);
      const stats = fs.statSync(resolvedPath);
      return {
        path: filePath,
        isDirectory: stats.isDirectory(),
        size: stats.size,
        modifiedAt: stats.mtime,
      };
    } catch {
      return null;
    }
  }
}
