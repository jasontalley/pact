"use strict";
/**
 * File Reader Module
 *
 * Handles local file reading for the Pact client SDK.
 * Uses only Node.js built-ins (fs, path) - no external dependencies.
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
exports.FileReader = void 0;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const git_client_1 = require("./git-client");
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
class FileReader {
    projectRoot;
    excludePatterns;
    maxFiles;
    maxTotalSize;
    constructor(options) {
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
    async readForReconciliation(options) {
        const manifest = await this.buildManifest();
        const contents = new Map();
        let totalSize = 0;
        // Determine which files to read based on options
        let filesToRead = [...manifest.testFiles];
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
        let commitHash;
        try {
            const gitClient = new git_client_1.GitClient({ projectRoot: this.projectRoot });
            if (gitClient.isGitRepository()) {
                commitHash = gitClient.getCurrentCommitHash();
            }
        }
        catch {
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
    async readFiles(paths) {
        const contents = new Map();
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
    async readFile(filePath) {
        try {
            const fullPath = path.join(this.projectRoot, filePath);
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            return content;
        }
        catch {
            return null;
        }
    }
    /**
     * Check if a file exists.
     *
     * @param filePath - File path (relative to project root)
     * @returns True if file exists
     */
    async exists(filePath) {
        try {
            const fullPath = path.join(this.projectRoot, filePath);
            await fs.promises.access(fullPath, fs.constants.R_OK);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Build a file manifest by walking the project directory.
     *
     * @returns FileManifest categorizing all project files
     */
    async buildManifest() {
        const allFiles = [];
        const testFiles = [];
        const sourceFiles = [];
        const docFiles = [];
        await this.walkDirectory(this.projectRoot, '', allFiles);
        for (const filePath of allFiles) {
            if (this.isTestFile(filePath)) {
                testFiles.push(filePath);
            }
            else if (this.isSourceFile(filePath)) {
                sourceFiles.push(filePath);
            }
            else if (this.isDocFile(filePath)) {
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
    async walkDirectory(rootDir, relativePath, files) {
        if (files.length >= this.maxFiles) {
            return;
        }
        const currentDir = path.join(rootDir, relativePath);
        let entries;
        try {
            entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
        }
        catch {
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
            }
            else if (entry.isFile()) {
                files.push(entryRelativePath);
            }
        }
    }
    /**
     * Check if a path should be excluded.
     */
    shouldExclude(relativePath, name) {
        for (const pattern of this.excludePatterns) {
            // Simple pattern matching - supports exact match and wildcards
            if (pattern.includes('*')) {
                // Convert glob-like pattern to regex
                const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
                if (new RegExp(regexPattern).test(name) || new RegExp(regexPattern).test(relativePath)) {
                    return true;
                }
            }
            else {
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
    isTestFile(filePath) {
        return TEST_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
    }
    /**
     * Check if a file is a source file (non-test code).
     */
    isSourceFile(filePath) {
        if (this.isTestFile(filePath)) {
            return false;
        }
        return SOURCE_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
    }
    /**
     * Check if a file is a documentation file.
     */
    isDocFile(filePath) {
        return DOC_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
    }
}
exports.FileReader = FileReader;
