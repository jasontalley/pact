/**
 * File Reader Module
 *
 * Handles local file reading for the Pact client SDK.
 * Uses only Node.js built-ins (fs, path) - no external dependencies.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { FileManifest, ReadContent, ReconciliationOptions } from './types';
import { GitClient } from './git-client';

export interface FileReaderOptions {
  /** Project root directory */
  projectRoot: string;
  /** Patterns to exclude from file scanning */
  excludePatterns?: string[];
  /** Maximum files to read */
  maxFiles?: number;
  /** Maximum total size in bytes */
  maxTotalSize?: number;
}

/**
 * Default exclude patterns for file scanning.
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.nyc_output',
  '.next',
  '.nuxt',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
  'vendor',
  '.idea',
  '.vscode',
  '*.log',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

/**
 * Test file patterns (glob-style, simplified).
 */
const TEST_FILE_PATTERNS = [
  /\.spec\.ts$/,
  /\.spec\.tsx$/,
  /\.test\.ts$/,
  /\.test\.tsx$/,
  /\.spec\.js$/,
  /\.spec\.jsx$/,
  /\.test\.js$/,
  /\.test\.jsx$/,
  /\.e2e-spec\.ts$/,
  /__tests__\/.*\.(ts|tsx|js|jsx)$/,
];

/**
 * Source file patterns.
 */
const SOURCE_FILE_PATTERNS = [/\.(ts|tsx|js|jsx)$/, /\.(py|rb|go|rs|java|kt|scala)$/];

/**
 * Documentation file patterns.
 */
const DOC_FILE_PATTERNS = [/\.md$/, /\.mdx$/, /\.rst$/, /\.txt$/];

/**
 * FileReader for local project file operations.
 * Zero dependencies on external packages.
 */
export class FileReader {
  private readonly projectRoot: string;
  private readonly excludePatterns: string[];
  private readonly maxFiles: number;
  private readonly maxTotalSize: number;

  constructor(options: FileReaderOptions) {
    this.projectRoot = options.projectRoot;
    this.excludePatterns = options.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS;
    this.maxFiles = options.maxFiles ?? 10000;
    this.maxTotalSize = options.maxTotalSize ?? 50 * 1024 * 1024; // 50MB default
  }

  /**
   * Read all files needed for reconciliation.
   *
   * @param options - Reconciliation options
   * @returns ReadContent with manifest and file contents
   */
  async readForReconciliation(options?: ReconciliationOptions): Promise<ReadContent> {
    const manifest = await this.buildManifest();
    const contents = new Map<string, string>();
    let totalSize = 0;

    // Determine which files to read based on options
    let filesToRead: string[] = [...manifest.testFiles];

    if (options?.includeSourceFiles !== false) {
      filesToRead.push(...manifest.sourceFiles);
    }

    if (options?.includeDocs !== false) {
      filesToRead.push(...manifest.docFiles);
    }

    // Apply max files limit
    const maxFiles = options?.maxFiles ?? this.maxFiles;
    if (filesToRead.length > maxFiles) {
      filesToRead = filesToRead.slice(0, maxFiles);
    }

    // Read file contents
    for (const filePath of filesToRead) {
      if (totalSize >= this.maxTotalSize) {
        break;
      }

      const content = await this.readFile(filePath);
      if (content !== null) {
        contents.set(filePath, content);
        totalSize += Buffer.byteLength(content, 'utf-8');
      }
    }

    // Get git commit hash if available
    let commitHash: string | undefined;
    try {
      const gitClient = new GitClient({ projectRoot: this.projectRoot });
      if (gitClient.isGitRepository()) {
        commitHash = gitClient.getCurrentCommitHash();
      }
    } catch {
      // Git not available or not a git repo
    }

    return {
      manifest,
      contents,
      totalSize,
      commitHash,
    };
  }

  /**
   * Read specific files by path.
   *
   * @param paths - File paths to read (relative to project root)
   * @returns Map of path to content (missing files omitted)
   */
  async readFiles(paths: string[]): Promise<Map<string, string>> {
    const contents = new Map<string, string>();

    for (const filePath of paths) {
      const content = await this.readFile(filePath);
      if (content !== null) {
        contents.set(filePath, content);
      }
    }

    return contents;
  }

  /**
   * Read a single file.
   *
   * @param filePath - File path (relative to project root)
   * @returns File content or null if not found
   */
  async readFile(filePath: string): Promise<string | null> {
    try {
      const fullPath = path.join(this.projectRoot, filePath);
      const content = await fs.promises.readFile(fullPath, 'utf-8');
      return content;
    } catch {
      return null;
    }
  }

  /**
   * Check if a file exists.
   *
   * @param filePath - File path (relative to project root)
   * @returns True if file exists
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.projectRoot, filePath);
      await fs.promises.access(fullPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build a file manifest by walking the project directory.
   *
   * @returns FileManifest categorizing all project files
   */
  async buildManifest(): Promise<FileManifest> {
    const allFiles: string[] = [];
    const testFiles: string[] = [];
    const sourceFiles: string[] = [];
    const docFiles: string[] = [];

    await this.walkDirectory(this.projectRoot, '', allFiles);

    for (const filePath of allFiles) {
      if (this.isTestFile(filePath)) {
        testFiles.push(filePath);
      } else if (this.isSourceFile(filePath)) {
        sourceFiles.push(filePath);
      } else if (this.isDocFile(filePath)) {
        docFiles.push(filePath);
      }
    }

    return {
      files: allFiles,
      testFiles,
      sourceFiles,
      docFiles,
      totalCount: allFiles.length,
      generatedAt: new Date(),
    };
  }

  /**
   * Walk directory recursively, collecting file paths.
   */
  private async walkDirectory(
    rootDir: string,
    relativePath: string,
    files: string[],
  ): Promise<void> {
    if (files.length >= this.maxFiles) {
      return;
    }

    const currentDir = path.join(rootDir, relativePath);

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= this.maxFiles) {
        break;
      }

      const entryRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;

      // Check exclusions
      if (this.shouldExclude(entryRelativePath, entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        await this.walkDirectory(rootDir, entryRelativePath, files);
      } else if (entry.isFile()) {
        files.push(entryRelativePath);
      }
    }
  }

  /**
   * Check if a path should be excluded.
   */
  private shouldExclude(relativePath: string, name: string): boolean {
    for (const pattern of this.excludePatterns) {
      // Simple pattern matching - supports exact match and wildcards
      if (pattern.includes('*')) {
        // Convert glob-like pattern to regex
        const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
        if (new RegExp(regexPattern).test(name) || new RegExp(regexPattern).test(relativePath)) {
          return true;
        }
      } else {
        // Exact match on name or path segment
        if (name === pattern || relativePath.includes(`/${pattern}/`) || relativePath.startsWith(`${pattern}/`)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if a file is a test file.
   */
  private isTestFile(filePath: string): boolean {
    return TEST_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
  }

  /**
   * Check if a file is a source file (non-test code).
   */
  private isSourceFile(filePath: string): boolean {
    if (this.isTestFile(filePath)) {
      return false;
    }
    return SOURCE_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
  }

  /**
   * Check if a file is a documentation file.
   */
  private isDocFile(filePath: string): boolean {
    return DOC_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
  }
}
