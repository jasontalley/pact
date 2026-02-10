import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { ContentProvider, FileEntry, ListOptions, WalkOptions } from './content-provider.interface';
import { FilesystemContentProvider } from './filesystem-content-provider';

export interface GitHubCloneConfig {
  /** GitHub organization or user */
  owner: string;
  /** Repository name */
  repo: string;
  /** Personal Access Token */
  pat: string;
  /** Specific commit SHA to checkout (optional) */
  commitSha?: string;
  /** Branch to clone (defaults to 'main') */
  branch?: string;
}

/**
 * GitHubContentProvider - reads repository content by cloning from GitHub.
 *
 * Strategy: shallow `git clone --depth 1` to a temp directory, then delegate
 * all ContentProvider methods to a FilesystemContentProvider pointed at the clone.
 *
 * Cleanup: call `cleanup()` after the reconciliation run completes to remove
 * the temp directory. This is handled automatically in
 * `ReconciliationService.executeGraphInBackground()`.
 */
export class GitHubContentProvider implements ContentProvider {
  readonly providerType = 'github' as const;
  private readonly delegate: FilesystemContentProvider;
  private readonly cloneDir: string;

  private constructor(cloneDir: string) {
    this.cloneDir = cloneDir;
    this.delegate = new FilesystemContentProvider(cloneDir);
  }

  /**
   * Create a GitHubContentProvider by cloning a repository.
   *
   * @param config - GitHub repository configuration
   * @returns Initialized provider with cloned content
   * @throws Error if clone fails (auth, network, repo not found)
   */
  static async create(config: GitHubCloneConfig): Promise<GitHubContentProvider> {
    const cloneDir = path.join(os.tmpdir(), `pact-github-${uuidv4()}`);
    const branch = config.branch ?? 'main';
    const url = `https://x-access-token:${config.pat}@github.com/${config.owner}/${config.repo}.git`;

    try {
      // Shallow clone at specified branch
      execSync(`git clone --depth 1 --branch "${branch}" -- "${url}" "${cloneDir}"`, {
        encoding: 'utf-8',
        timeout: 120000,
        stdio: 'pipe',
      });

      // If a specific commit SHA is requested and it differs from branch HEAD
      if (config.commitSha) {
        const headSha = execSync('git rev-parse HEAD', {
          cwd: cloneDir,
          encoding: 'utf-8',
          stdio: 'pipe',
        }).trim();

        if (!headSha.startsWith(config.commitSha) && !config.commitSha.startsWith(headSha)) {
          // Need to fetch the specific commit — requires unshallowing
          execSync(`git fetch --depth 1 origin ${config.commitSha}`, {
            cwd: cloneDir,
            encoding: 'utf-8',
            timeout: 60000,
            stdio: 'pipe',
          });
          execSync(`git checkout ${config.commitSha}`, {
            cwd: cloneDir,
            encoding: 'utf-8',
            stdio: 'pipe',
          });
        }
      }

      // Remove the remote to prevent PAT leakage in logs or error messages
      execSync('git remote remove origin', {
        cwd: cloneDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      return new GitHubContentProvider(cloneDir);
    } catch (error) {
      // Clean up on failure
      try {
        await fs.rm(cloneDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }

      const rawMessage = error instanceof Error ? error.message : 'Unknown error';
      // Sanitize: never let the PAT appear in error messages or logs
      const message = rawMessage.replaceAll(/x-access-token:[^@]+@/g, 'x-access-token:***@');
      if (
        message.includes('Authentication failed') ||
        message.includes('could not read Username')
      ) {
        throw new Error(
          `GitHub authentication failed for ${config.owner}/${config.repo}. Check your PAT.`,
        );
      }
      if (message.includes('not found') || message.includes('does not exist')) {
        throw new Error(`Repository ${config.owner}/${config.repo} not found or not accessible.`);
      }
      if (message.includes('Remote branch') && message.includes('not found')) {
        throw new Error(`Branch "${branch}" not found in ${config.owner}/${config.repo}.`);
      }
      if (message.includes('git: not found') || message.includes('git:')) {
        throw new Error(`git is not installed in the container — rebuild the Docker image.`);
      }
      throw new Error(`Failed to clone ${config.owner}/${config.repo}: ${message}`);
    }
  }

  // =========================================================================
  // ContentProvider interface — delegate to FilesystemContentProvider
  // =========================================================================

  async listFiles(dir: string, options?: ListOptions): Promise<FileEntry[]> {
    return this.delegate.listFiles(dir, options);
  }

  async walkDirectory(rootDir: string, options?: WalkOptions): Promise<string[]> {
    return this.delegate.walkDirectory(rootDir, options);
  }

  async readFile(filePath: string): Promise<string> {
    return this.delegate.readFile(filePath);
  }

  async exists(filePath: string): Promise<boolean> {
    return this.delegate.exists(filePath);
  }

  async readFileOrNull(filePath: string): Promise<string | null> {
    return this.delegate.readFileOrNull(filePath);
  }

  async getCommitHash(): Promise<string | null> {
    return this.delegate.getCommitHash?.() ?? null;
  }

  async readFiles(filePaths: string[]): Promise<Map<string, string>> {
    if (this.delegate.readFiles) {
      return this.delegate.readFiles(filePaths);
    }
    const result = new Map<string, string>();
    for (const fp of filePaths) {
      const content = await this.delegate.readFileOrNull(fp);
      if (content !== null) {
        result.set(fp, content);
      }
    }
    return result;
  }

  async getFileStats(filePath: string): Promise<FileEntry | null> {
    return this.delegate.getFileStats?.(filePath) ?? null;
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  /** Remove the temporary clone directory */
  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.cloneDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup — OS temp dir will be cleaned eventually
    }
  }

  /** Get the clone directory path (for use as rootDirectory in graph state) */
  getCloneDir(): string {
    return this.cloneDir;
  }
}
