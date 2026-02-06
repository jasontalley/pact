/**
 * Git Client Module
 *
 * Provides git operations for the Pact client SDK.
 * Uses only Node.js built-ins (child_process) - no external dependencies.
 */
export interface GitChangedFile {
    /** File path relative to repo root */
    path: string;
    /** Change status: A (added), M (modified), D (deleted), R (renamed) */
    status: 'A' | 'M' | 'D' | 'R' | 'C' | 'U';
}
export interface GitDiff {
    /** Base commit/ref */
    base: string;
    /** Head commit/ref */
    head: string;
    /** Changed files */
    files: GitChangedFile[];
    /** Raw diff output */
    rawDiff?: string;
}
export interface GitClientOptions {
    /** Project root directory */
    projectRoot: string;
    /** Timeout for git commands in milliseconds (default: 30000) */
    timeout?: number;
}
/**
 * Git client for repository operations.
 * Zero dependencies on external packages - uses child_process directly.
 */
export declare class GitClient {
    private readonly projectRoot;
    private readonly timeout;
    constructor(options: GitClientOptions);
    /**
     * Check if the project root is a git repository.
     */
    isGitRepository(): boolean;
    /**
     * Get the current commit hash.
     *
     * @returns The current commit hash (full 40-character SHA)
     * @throws Error if not a git repository or git command fails
     */
    getCurrentCommitHash(): string;
    /**
     * Get the current branch name.
     *
     * @returns The current branch name or 'HEAD' if detached
     */
    getCurrentBranch(): string;
    /**
     * Get list of changed files since a given ref.
     *
     * @param since - Git ref to compare against (e.g., 'main', 'HEAD~1', commit hash)
     * @returns Array of changed files with their status
     */
    getChangedFiles(since: string): GitChangedFile[];
    /**
     * Get list of files changed between two refs.
     *
     * @param base - Base ref
     * @param head - Head ref (defaults to HEAD)
     * @returns Array of changed files with their status
     */
    getChangedFilesBetween(base: string, head?: string): GitChangedFile[];
    /**
     * Get the full diff between two refs.
     *
     * @param base - Base ref
     * @param head - Head ref (defaults to HEAD)
     * @param includeRawDiff - Whether to include the raw diff output
     * @returns Diff information
     */
    getDiff(base: string, head?: string, includeRawDiff?: boolean): GitDiff;
    /**
     * Get list of untracked files.
     *
     * @returns Array of untracked file paths
     */
    getUntrackedFiles(): string[];
    /**
     * Get list of staged files.
     *
     * @returns Array of staged file paths with status
     */
    getStagedFiles(): GitChangedFile[];
    /**
     * Check if there are uncommitted changes.
     *
     * @returns True if there are uncommitted changes
     */
    hasUncommittedChanges(): boolean;
    /**
     * Get the root directory of the git repository.
     *
     * @returns Absolute path to repository root
     */
    getRepositoryRoot(): string;
    /**
     * Get the remote URL for a given remote name.
     *
     * @param remoteName - Remote name (default: 'origin')
     * @returns Remote URL or null if not found
     */
    getRemoteUrl(remoteName?: string): string | null;
    /**
     * Get list of all branches.
     *
     * @param remote - Include remote branches
     * @returns Array of branch names
     */
    getBranches(remote?: boolean): string[];
    /**
     * Get the merge base between two refs.
     *
     * @param ref1 - First ref
     * @param ref2 - Second ref
     * @returns Merge base commit hash
     */
    getMergeBase(ref1: string, ref2: string): string;
    /**
     * Parse git name-status output into structured format.
     */
    private parseNameStatus;
    /**
     * Execute a git command and return stdout.
     */
    private execGit;
}
