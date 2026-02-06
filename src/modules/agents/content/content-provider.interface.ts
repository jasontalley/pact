/**
 * ContentProvider Interface
 *
 * Abstracts filesystem access to enable:
 * - Co-located mode (FilesystemContentProvider)
 * - Remote mode (PreReadContentProvider with pre-read content from API)
 * - Hybrid mode (combination of both)
 *
 * All methods are async to support both sync fs and async network-backed providers.
 */

/**
 * Represents a file or directory entry
 */
export interface FileEntry {
  /** Relative or absolute path */
  path: string;
  /** Whether this entry is a directory */
  isDirectory: boolean;
  /** File size in bytes (optional, may not be available for pre-read) */
  size?: number;
  /** Last modified timestamp (optional) */
  modifiedAt?: Date;
}

/**
 * Options for listing files in a directory
 */
export interface ListOptions {
  /** Include file type information (default: false) */
  withFileTypes?: boolean;
  /** Recursively list subdirectories (default: false) */
  recursive?: boolean;
  /** Maximum depth for recursive listing */
  maxDepth?: number;
}

/**
 * Options for walking a directory tree
 */
export interface WalkOptions {
  /** Glob patterns to exclude (e.g., ['node_modules/**', '*.lock']) */
  excludePatterns?: string[];
  /** Maximum number of files to return */
  maxFiles?: number;
  /** File extensions to include (e.g., ['.ts', '.js']) */
  includeExtensions?: string[];
  /** Whether to include directories in results */
  includeDirectories?: boolean;
}

/**
 * Result of reading content for reconciliation
 */
export interface ReadContentResult {
  /** Map of file path to content */
  contents: Map<string, string>;
  /** List of all files (including those not read) */
  manifest: FileEntry[];
  /** Total size of all read content in bytes */
  totalSize: number;
  /** Git commit hash if available */
  commitHash?: string;
}

/**
 * ContentProvider interface - abstracts all filesystem read operations
 */
export interface ContentProvider {
  /**
   * Provider type identifier
   */
  readonly providerType: 'filesystem' | 'pre-read' | 'hybrid';

  /**
   * List files in a directory
   * @param dir - Directory path to list
   * @param options - Listing options
   * @returns Array of file entries
   */
  listFiles(dir: string, options?: ListOptions): Promise<FileEntry[]>;

  /**
   * Walk a directory tree, returning all matching file paths
   * @param rootDir - Root directory to start walking from
   * @param options - Walk options (excludes, max files, etc.)
   * @returns Array of file paths
   */
  walkDirectory(rootDir: string, options?: WalkOptions): Promise<string[]>;

  /**
   * Read a file's contents
   * @param filePath - Path to the file
   * @returns File contents as string
   * @throws Error if file does not exist
   */
  readFile(filePath: string): Promise<string>;

  /**
   * Check if a file or directory exists
   * @param filePath - Path to check
   * @returns True if exists, false otherwise
   */
  exists(filePath: string): Promise<boolean>;

  /**
   * Read a file's contents, returning null if it doesn't exist
   * @param filePath - Path to the file
   * @returns File contents as string, or null if not found
   */
  readFileOrNull(filePath: string): Promise<string | null>;

  /**
   * Get the current git commit hash (optional)
   * @returns Commit hash string or null if not in a git repo
   */
  getCommitHash?(): Promise<string | null>;

  /**
   * Read multiple files at once (for efficiency)
   * @param filePaths - Array of file paths to read
   * @returns Map of path to content (missing files are omitted)
   */
  readFiles?(filePaths: string[]): Promise<Map<string, string>>;

  /**
   * Get file stats (size, modified time, etc.)
   * @param filePath - Path to the file
   * @returns FileEntry with stats, or null if not found
   */
  getFileStats?(filePath: string): Promise<FileEntry | null>;
}

/**
 * Type guard to check if a provider supports batch file reading
 */
export function supportsBatchRead(
  provider: ContentProvider,
): provider is ContentProvider & { readFiles: NonNullable<ContentProvider['readFiles']> } {
  return typeof provider.readFiles === 'function';
}

/**
 * Type guard to check if a provider supports commit hash retrieval
 */
export function supportsCommitHash(
  provider: ContentProvider,
): provider is ContentProvider & { getCommitHash: NonNullable<ContentProvider['getCommitHash']> } {
  return typeof provider.getCommitHash === 'function';
}
