/**
 * File Reader Module
 *
 * Handles local file reading for the Pact client SDK.
 * Uses only Node.js built-ins (fs, path) - no external dependencies.
 */
import { FileManifest, ReadContent, ReconciliationOptions } from './types';
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
 * FileReader for local project file operations.
 * Zero dependencies on external packages.
 */
export declare class FileReader {
    private readonly projectRoot;
    private readonly excludePatterns;
    private readonly maxFiles;
    private readonly maxTotalSize;
    constructor(options: FileReaderOptions);
    /**
     * Read all files needed for reconciliation.
     *
     * @param options - Reconciliation options
     * @returns ReadContent with manifest and file contents
     */
    readForReconciliation(options?: ReconciliationOptions): Promise<ReadContent>;
    /**
     * Read specific files by path.
     *
     * @param paths - File paths to read (relative to project root)
     * @returns Map of path to content (missing files omitted)
     */
    readFiles(paths: string[]): Promise<Map<string, string>>;
    /**
     * Read a single file.
     *
     * @param filePath - File path (relative to project root)
     * @returns File content or null if not found
     */
    readFile(filePath: string): Promise<string | null>;
    /**
     * Check if a file exists.
     *
     * @param filePath - File path (relative to project root)
     * @returns True if file exists
     */
    exists(filePath: string): Promise<boolean>;
    /**
     * Build a file manifest by walking the project directory.
     *
     * @returns FileManifest categorizing all project files
     */
    buildManifest(): Promise<FileManifest>;
    /**
     * Walk directory recursively, collecting file paths.
     */
    private walkDirectory;
    /**
     * Check if a path should be excluded.
     */
    private shouldExclude;
    /**
     * Check if a file is a test file.
     */
    private isTestFile;
    /**
     * Check if a file is a source file (non-test code).
     */
    private isSourceFile;
    /**
     * Check if a file is a documentation file.
     */
    private isDocFile;
}
