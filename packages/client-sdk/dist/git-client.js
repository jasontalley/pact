"use strict";
/**
 * Git Client Module
 *
 * Provides git operations for the Pact client SDK.
 * Uses only Node.js built-ins (child_process) - no external dependencies.
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
exports.GitClient = void 0;
const node_child_process_1 = require("node:child_process");
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
/**
 * Git client for repository operations.
 * Zero dependencies on external packages - uses child_process directly.
 */
class GitClient {
    projectRoot;
    timeout;
    constructor(options) {
        this.projectRoot = options.projectRoot;
        this.timeout = options.timeout ?? 30000;
    }
    /**
     * Check if the project root is a git repository.
     */
    isGitRepository() {
        try {
            const gitDir = path.join(this.projectRoot, '.git');
            return fs.existsSync(gitDir);
        }
        catch {
            return false;
        }
    }
    /**
     * Get the current commit hash.
     *
     * @returns The current commit hash (full 40-character SHA)
     * @throws Error if not a git repository or git command fails
     */
    getCurrentCommitHash() {
        return this.execGit(['rev-parse', 'HEAD']).trim();
    }
    /**
     * Get the current branch name.
     *
     * @returns The current branch name or 'HEAD' if detached
     */
    getCurrentBranch() {
        try {
            return this.execGit(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
        }
        catch {
            return 'HEAD';
        }
    }
    /**
     * Get list of changed files since a given ref.
     *
     * @param since - Git ref to compare against (e.g., 'main', 'HEAD~1', commit hash)
     * @returns Array of changed files with their status
     */
    getChangedFiles(since) {
        const output = this.execGit(['diff', '--name-status', since, 'HEAD']);
        return this.parseNameStatus(output);
    }
    /**
     * Get list of files changed between two refs.
     *
     * @param base - Base ref
     * @param head - Head ref (defaults to HEAD)
     * @returns Array of changed files with their status
     */
    getChangedFilesBetween(base, head = 'HEAD') {
        const output = this.execGit(['diff', '--name-status', base, head]);
        return this.parseNameStatus(output);
    }
    /**
     * Get the full diff between two refs.
     *
     * @param base - Base ref
     * @param head - Head ref (defaults to HEAD)
     * @param includeRawDiff - Whether to include the raw diff output
     * @returns Diff information
     */
    getDiff(base, head = 'HEAD', includeRawDiff = false) {
        const files = this.getChangedFilesBetween(base, head);
        let rawDiff;
        if (includeRawDiff) {
            rawDiff = this.execGit(['diff', base, head]);
        }
        return {
            base,
            head,
            files,
            rawDiff,
        };
    }
    /**
     * Get list of untracked files.
     *
     * @returns Array of untracked file paths
     */
    getUntrackedFiles() {
        const output = this.execGit(['ls-files', '--others', '--exclude-standard']);
        return output
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    }
    /**
     * Get list of staged files.
     *
     * @returns Array of staged file paths with status
     */
    getStagedFiles() {
        const output = this.execGit(['diff', '--name-status', '--staged']);
        return this.parseNameStatus(output);
    }
    /**
     * Check if there are uncommitted changes.
     *
     * @returns True if there are uncommitted changes
     */
    hasUncommittedChanges() {
        const status = this.execGit(['status', '--porcelain']);
        return status.trim().length > 0;
    }
    /**
     * Get the root directory of the git repository.
     *
     * @returns Absolute path to repository root
     */
    getRepositoryRoot() {
        return this.execGit(['rev-parse', '--show-toplevel']).trim();
    }
    /**
     * Get the remote URL for a given remote name.
     *
     * @param remoteName - Remote name (default: 'origin')
     * @returns Remote URL or null if not found
     */
    getRemoteUrl(remoteName = 'origin') {
        try {
            return this.execGit(['remote', 'get-url', remoteName]).trim();
        }
        catch {
            return null;
        }
    }
    /**
     * Get list of all branches.
     *
     * @param remote - Include remote branches
     * @returns Array of branch names
     */
    getBranches(remote = false) {
        const args = remote ? ['branch', '-a'] : ['branch'];
        const output = this.execGit(args);
        return output
            .split('\n')
            .map((line) => line.replace(/^\*?\s+/, '').trim())
            .filter((line) => line.length > 0);
    }
    /**
     * Get the merge base between two refs.
     *
     * @param ref1 - First ref
     * @param ref2 - Second ref
     * @returns Merge base commit hash
     */
    getMergeBase(ref1, ref2) {
        return this.execGit(['merge-base', ref1, ref2]).trim();
    }
    /**
     * Parse git name-status output into structured format.
     */
    parseNameStatus(output) {
        return output
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => {
            const parts = line.split(/\s+/);
            const status = parts[0];
            // For renames (R100), the format is: R100 old_path new_path
            const filePath = status.startsWith('R') ? parts[2] : parts[1];
            return {
                status: status.charAt(0),
                path: filePath,
            };
        });
    }
    /**
     * Execute a git command and return stdout.
     */
    execGit(args) {
        const options = {
            cwd: this.projectRoot,
            encoding: 'utf-8',
            timeout: this.timeout,
            maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large diffs
        };
        try {
            return (0, node_child_process_1.execSync)(`git ${args.join(' ')}`, options);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Git command failed: git ${args.join(' ')}\n${message}`);
        }
    }
}
exports.GitClient = GitClient;
