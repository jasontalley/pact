/**
 * Git Client Module
 *
 * Provides git operations for the Pact client SDK.
 * Uses only Node.js built-ins (child_process) - no external dependencies.
 */

import { execSync, ExecSyncOptions } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

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
export class GitClient {
  private readonly projectRoot: string;
  private readonly timeout: number;

  constructor(options: GitClientOptions) {
    this.projectRoot = options.projectRoot;
    this.timeout = options.timeout ?? 30000;
  }

  /**
   * Check if the project root is a git repository.
   */
  isGitRepository(): boolean {
    try {
      const gitDir = path.join(this.projectRoot, '.git');
      return fs.existsSync(gitDir);
    } catch {
      return false;
    }
  }

  /**
   * Get the current commit hash.
   *
   * @returns The current commit hash (full 40-character SHA)
   * @throws Error if not a git repository or git command fails
   */
  getCurrentCommitHash(): string {
    return this.execGit(['rev-parse', 'HEAD']).trim();
  }

  /**
   * Get the current branch name.
   *
   * @returns The current branch name or 'HEAD' if detached
   */
  getCurrentBranch(): string {
    try {
      return this.execGit(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    } catch {
      return 'HEAD';
    }
  }

  /**
   * Get list of changed files since a given ref.
   *
   * @param since - Git ref to compare against (e.g., 'main', 'HEAD~1', commit hash)
   * @returns Array of changed files with their status
   */
  getChangedFiles(since: string): GitChangedFile[] {
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
  getChangedFilesBetween(base: string, head: string = 'HEAD'): GitChangedFile[] {
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
  getDiff(base: string, head: string = 'HEAD', includeRawDiff: boolean = false): GitDiff {
    const files = this.getChangedFilesBetween(base, head);

    let rawDiff: string | undefined;
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
  getUntrackedFiles(): string[] {
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
  getStagedFiles(): GitChangedFile[] {
    const output = this.execGit(['diff', '--name-status', '--staged']);
    return this.parseNameStatus(output);
  }

  /**
   * Check if there are uncommitted changes.
   *
   * @returns True if there are uncommitted changes
   */
  hasUncommittedChanges(): boolean {
    const status = this.execGit(['status', '--porcelain']);
    return status.trim().length > 0;
  }

  /**
   * Get the root directory of the git repository.
   *
   * @returns Absolute path to repository root
   */
  getRepositoryRoot(): string {
    return this.execGit(['rev-parse', '--show-toplevel']).trim();
  }

  /**
   * Get the remote URL for a given remote name.
   *
   * @param remoteName - Remote name (default: 'origin')
   * @returns Remote URL or null if not found
   */
  getRemoteUrl(remoteName: string = 'origin'): string | null {
    try {
      return this.execGit(['remote', 'get-url', remoteName]).trim();
    } catch {
      return null;
    }
  }

  /**
   * Get list of all branches.
   *
   * @param remote - Include remote branches
   * @returns Array of branch names
   */
  getBranches(remote: boolean = false): string[] {
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
  getMergeBase(ref1: string, ref2: string): string {
    return this.execGit(['merge-base', ref1, ref2]).trim();
  }

  /**
   * Parse git name-status output into structured format.
   */
  private parseNameStatus(output: string): GitChangedFile[] {
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.split(/\s+/);
        const status = parts[0] as GitChangedFile['status'];
        // For renames (R100), the format is: R100 old_path new_path
        const filePath = status.startsWith('R') ? parts[2] : parts[1];
        return {
          status: status.charAt(0) as GitChangedFile['status'],
          path: filePath,
        };
      });
  }

  /**
   * Execute a git command and return stdout.
   */
  private execGit(args: string[]): string {
    const options: ExecSyncOptions = {
      cwd: this.projectRoot,
      encoding: 'utf-8',
      timeout: this.timeout,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large diffs
    };

    try {
      return execSync(`git ${args.join(' ')}`, options) as string;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Git command failed: git ${args.join(' ')}\n${message}`);
    }
  }
}
