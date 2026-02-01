/**
 * Git Utilities
 *
 * Provides git-based operations for delta detection and change tracking.
 * Used by the reconciliation agent for delta mode.
 *
 * @see docs/implementation-checklist-phase5.md Section 3.1
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * Result of getting changed files between commits
 */
export interface GitDiffResult {
  /** List of changed file paths (relative to repo root) */
  changedFiles: string[];
  /** Base commit hash used for comparison */
  baseCommit: string;
  /** Head commit hash used for comparison */
  headCommit: string;
  /** Whether the diff was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Git repository information
 */
export interface GitRepoInfo {
  /** Whether the directory is a git repository */
  isGitRepo: boolean;
  /** The current HEAD commit hash */
  headCommit?: string;
  /** The current branch name */
  currentBranch?: string;
  /** Root directory of the git repo */
  repoRoot?: string;
}

/**
 * Check if a directory is a git repository
 */
export async function isGitRepository(directory: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --is-inside-work-tree', { cwd: directory });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get git repository information
 */
export async function getGitRepoInfo(directory: string): Promise<GitRepoInfo> {
  try {
    const isRepo = await isGitRepository(directory);
    if (!isRepo) {
      return { isGitRepo: false };
    }

    // Get HEAD commit
    const { stdout: headCommit } = await execAsync('git rev-parse HEAD', { cwd: directory });

    // Get current branch
    const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: directory });

    // Get repo root
    const { stdout: repoRoot } = await execAsync('git rev-parse --show-toplevel', { cwd: directory });

    return {
      isGitRepo: true,
      headCommit: headCommit.trim(),
      currentBranch: branch.trim(),
      repoRoot: repoRoot.trim(),
    };
  } catch (error) {
    return { isGitRepo: false };
  }
}

/**
 * Get the current HEAD commit hash
 */
export async function getCurrentCommitHash(directory: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse HEAD', { cwd: directory });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Validate a commit hash exists in the repository
 */
export async function isValidCommit(directory: string, commitHash: string): Promise<boolean> {
  try {
    await execAsync(`git cat-file -t ${commitHash}`, { cwd: directory });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get changed files between two commits
 *
 * @param directory - The git repository directory
 * @param baseCommit - The base commit hash to compare from
 * @param headCommit - The head commit hash to compare to (defaults to HEAD)
 * @returns List of changed file paths
 */
export async function getChangedFiles(
  directory: string,
  baseCommit: string,
  headCommit: string = 'HEAD',
): Promise<GitDiffResult> {
  try {
    // Validate commits exist
    const baseValid = await isValidCommit(directory, baseCommit);
    if (!baseValid) {
      return {
        changedFiles: [],
        baseCommit,
        headCommit,
        success: false,
        error: `Invalid base commit: ${baseCommit}`,
      };
    }

    // Get the actual HEAD commit hash if "HEAD" was passed
    let resolvedHead = headCommit;
    if (headCommit === 'HEAD') {
      const hash = await getCurrentCommitHash(directory);
      if (hash) {
        resolvedHead = hash;
      }
    }

    // Get changed files using git diff
    const { stdout } = await execAsync(
      `git diff --name-only ${baseCommit}..${resolvedHead}`,
      { cwd: directory },
    );

    const changedFiles = stdout
      .trim()
      .split('\n')
      .filter((f) => f.length > 0);

    return {
      changedFiles,
      baseCommit,
      headCommit: resolvedHead,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      changedFiles: [],
      baseCommit,
      headCommit,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Filter files by patterns (glob-like matching)
 *
 * @param files - List of file paths
 * @param patterns - Glob patterns to match (e.g., "**\/*.spec.ts")
 * @returns Filtered list of files matching any pattern
 */
export function filterFilesByPatterns(files: string[], patterns: string[]): string[] {
  return files.filter((file) => {
    for (const pattern of patterns) {
      if (matchesPattern(file, pattern)) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Simple pattern matching for file paths
 * Supports:
 * - ** for any directory depth
 * - * for any characters in a segment
 * - Exact extension matching (*.ts, *.spec.ts)
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  // Handle **/*.ext patterns
  if (pattern.startsWith('**/')) {
    const suffix = pattern.slice(3); // Remove **/
    if (suffix.startsWith('*.')) {
      const ext = suffix.slice(1); // Remove *
      return filePath.endsWith(ext);
    }
    return filePath.endsWith(suffix) || filePath.includes('/' + suffix);
  }

  // Handle *.ext patterns
  if (pattern.startsWith('*.')) {
    const ext = pattern.slice(1); // Remove *
    return filePath.endsWith(ext);
  }

  // Exact match
  return filePath === pattern || filePath.endsWith('/' + pattern);
}

/**
 * Get changed test files between commits
 *
 * @param directory - The git repository directory
 * @param baseCommit - The base commit hash
 * @param testPatterns - Patterns for test files (default: ['**\/*.spec.ts', '**\/*.test.ts'])
 * @returns List of changed test file paths
 */
export async function getChangedTestFiles(
  directory: string,
  baseCommit: string,
  testPatterns: string[] = ['**/*.spec.ts', '**/*.test.ts', '**/*.e2e-spec.ts'],
): Promise<GitDiffResult & { testFiles: string[] }> {
  const diffResult = await getChangedFiles(directory, baseCommit);

  const testFiles = filterFilesByPatterns(diffResult.changedFiles, testPatterns);

  return {
    ...diffResult,
    testFiles,
  };
}

/**
 * Get file content at a specific commit
 *
 * @param directory - The git repository directory
 * @param filePath - Path to the file (relative to repo root)
 * @param commitHash - The commit to get the file from
 * @returns File content or null if not found
 */
export async function getFileAtCommit(
  directory: string,
  filePath: string,
  commitHash: string,
): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `git show ${commitHash}:${filePath}`,
      { cwd: directory },
    );
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Get the diff for a specific file between commits
 *
 * @param directory - The git repository directory
 * @param filePath - Path to the file
 * @param baseCommit - The base commit hash
 * @param headCommit - The head commit hash (defaults to HEAD)
 * @returns Diff output or null if file unchanged
 */
export async function getFileDiff(
  directory: string,
  filePath: string,
  baseCommit: string,
  headCommit: string = 'HEAD',
): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `git diff ${baseCommit}..${headCommit} -- ${filePath}`,
      { cwd: directory },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Get the list of lines that were added or modified in a file
 *
 * @param directory - The git repository directory
 * @param filePath - Path to the file
 * @param baseCommit - The base commit hash
 * @returns Array of line numbers that were added or modified
 */
export async function getChangedLineNumbers(
  directory: string,
  filePath: string,
  baseCommit: string,
): Promise<number[]> {
  try {
    const { stdout } = await execAsync(
      `git diff --unified=0 ${baseCommit}..HEAD -- ${filePath} | grep -E "^@@" | sed 's/.*+\\([0-9]*\\).*/\\1/'`,
      { cwd: directory },
    );

    const lineNumbers: number[] = [];
    const lines = stdout.trim().split('\n').filter((l) => l.length > 0);

    for (const line of lines) {
      const match = line.match(/\+(\d+)/);
      if (match) {
        lineNumbers.push(parseInt(match[1], 10));
      }
    }

    return lineNumbers;
  } catch {
    return [];
  }
}
