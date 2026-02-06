/**
 * WriteProvider Interface
 *
 * Abstracts file write operations, primarily for @atom annotation injection.
 * This is the only write operation Pact performs on project files.
 *
 * Two implementations:
 * - FilesystemWriteProvider: Writes directly to disk (co-located mode)
 * - PatchInstructionProvider: Returns patch instructions for client to apply (remote mode)
 */

/**
 * Represents a patch to be applied to a file
 */
export interface FilePatch {
  /** Path to the file to patch */
  filePath: string;
  /** Line number to insert at (1-indexed) */
  lineNumber: number;
  /** Content to insert */
  content: string;
  /** Type of patch operation */
  operation: 'insert' | 'replace' | 'delete';
  /** Original line content (for verification) */
  originalLine?: string;
  /** Number of lines affected (for replace/delete) */
  lineCount?: number;
}

/**
 * Result of applying patches
 */
export interface PatchResult {
  /** Whether the patch was applied successfully */
  success: boolean;
  /** Path to the file that was patched */
  filePath: string;
  /** Error message if failed */
  error?: string;
  /** Number of lines modified */
  linesModified?: number;
}

/**
 * Batch patch result
 */
export interface BatchPatchResult {
  /** Total number of patches attempted */
  total: number;
  /** Number of successful patches */
  successful: number;
  /** Number of failed patches */
  failed: number;
  /** Individual results */
  results: PatchResult[];
}

/**
 * WriteProvider interface - abstracts file write operations
 */
export interface WriteProvider {
  /**
   * Provider type identifier
   */
  readonly providerType: 'filesystem' | 'instruction';

  /**
   * Write content to a file (overwrite)
   * @param filePath - Path to the file
   * @param content - Content to write
   */
  writeFile(filePath: string, content: string): Promise<void>;

  /**
   * Insert a line at a specific position
   * @param filePath - Path to the file
   * @param lineNumber - Line number to insert at (1-indexed)
   * @param content - Content to insert
   */
  insertLine(filePath: string, lineNumber: number, content: string): Promise<void>;

  /**
   * Apply a patch to a file
   * @param patch - The patch to apply
   * @returns Result of the patch operation
   */
  applyPatch(patch: FilePatch): Promise<PatchResult>;

  /**
   * Apply multiple patches (atomic if possible)
   * @param patches - Array of patches to apply
   * @returns Batch result
   */
  applyPatches(patches: FilePatch[]): Promise<BatchPatchResult>;

  /**
   * Check if a file is writable
   * @param filePath - Path to the file
   * @returns True if writable
   */
  isWritable(filePath: string): Promise<boolean>;
}

/**
 * For remote mode: collect patch instructions instead of writing
 */
export interface PatchInstructionCollector extends WriteProvider {
  /**
   * Get all collected patch instructions
   */
  getPatches(): FilePatch[];

  /**
   * Clear collected patches
   */
  clearPatches(): void;

  /**
   * Get patches as a serializable object
   */
  toJSON(): { patches: FilePatch[] };
}
