/**
 * GitClient Unit Tests
 */

import { GitClient, GitChangedFile } from '../git-client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

describe('GitClient', () => {
  let testDir: string;
  let gitClient: GitClient;

  beforeEach(() => {
    // Create a temporary directory for testing
    testDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'git-client-test-'));
    gitClient = new GitClient({ projectRoot: testDir });
  });

  afterEach(() => {
    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('isGitRepository', () => {
    it('should return false for non-git directory', () => {
      expect(gitClient.isGitRepository()).toBe(false);
    });

    it('should return true for git directory', () => {
      // Initialize git repo
      execSync('git init', { cwd: testDir });
      expect(gitClient.isGitRepository()).toBe(true);
    });
  });

  describe('with initialized git repo', () => {
    beforeEach(() => {
      // Initialize git repo with initial commit
      execSync('git init', { cwd: testDir });
      execSync('git config user.email "test@example.com"', { cwd: testDir });
      execSync('git config user.name "Test User"', { cwd: testDir });

      // Create initial file and commit
      fs.writeFileSync(path.join(testDir, 'README.md'), '# Test');
      execSync('git add README.md', { cwd: testDir });
      execSync('git commit -m "Initial commit"', { cwd: testDir });
    });

    describe('getCurrentCommitHash', () => {
      it('should return a 40-character commit hash', () => {
        const hash = gitClient.getCurrentCommitHash();
        expect(hash).toMatch(/^[a-f0-9]{40}$/);
      });
    });

    describe('getCurrentBranch', () => {
      it('should return the current branch name', () => {
        const branch = gitClient.getCurrentBranch();
        // Default branch could be 'main' or 'master' depending on git config
        expect(['main', 'master']).toContain(branch);
      });
    });

    describe('hasUncommittedChanges', () => {
      it('should return false when no changes', () => {
        expect(gitClient.hasUncommittedChanges()).toBe(false);
      });

      it('should return true when there are uncommitted changes', () => {
        fs.writeFileSync(path.join(testDir, 'new-file.txt'), 'content');
        expect(gitClient.hasUncommittedChanges()).toBe(true);
      });
    });

    describe('getChangedFiles', () => {
      it('should return empty array when no changes', () => {
        const changed = gitClient.getChangedFiles('HEAD');
        expect(changed).toEqual([]);
      });

      it('should detect added files', () => {
        // Create and commit a new file
        fs.writeFileSync(path.join(testDir, 'new-file.txt'), 'content');
        execSync('git add new-file.txt', { cwd: testDir });
        execSync('git commit -m "Add new file"', { cwd: testDir });

        const changed = gitClient.getChangedFiles('HEAD~1');
        expect(changed).toHaveLength(1);
        expect(changed[0].path).toBe('new-file.txt');
        expect(changed[0].status).toBe('A');
      });

      it('should detect modified files', () => {
        // Modify existing file
        fs.writeFileSync(path.join(testDir, 'README.md'), '# Updated');
        execSync('git add README.md', { cwd: testDir });
        execSync('git commit -m "Update README"', { cwd: testDir });

        const changed = gitClient.getChangedFiles('HEAD~1');
        expect(changed).toHaveLength(1);
        expect(changed[0].path).toBe('README.md');
        expect(changed[0].status).toBe('M');
      });
    });

    describe('getUntrackedFiles', () => {
      it('should return empty array when no untracked files', () => {
        const untracked = gitClient.getUntrackedFiles();
        expect(untracked).toEqual([]);
      });

      it('should return untracked files', () => {
        fs.writeFileSync(path.join(testDir, 'untracked.txt'), 'content');
        const untracked = gitClient.getUntrackedFiles();
        expect(untracked).toContain('untracked.txt');
      });
    });

    describe('getStagedFiles', () => {
      it('should return empty array when nothing staged', () => {
        const staged = gitClient.getStagedFiles();
        expect(staged).toEqual([]);
      });

      it('should return staged files', () => {
        fs.writeFileSync(path.join(testDir, 'staged.txt'), 'content');
        execSync('git add staged.txt', { cwd: testDir });

        const staged = gitClient.getStagedFiles();
        expect(staged).toHaveLength(1);
        expect(staged[0].path).toBe('staged.txt');
        expect(staged[0].status).toBe('A');
      });
    });

    describe('getRepositoryRoot', () => {
      it('should return the repository root', () => {
        const root = gitClient.getRepositoryRoot();
        // Handle macOS symlink: /var -> /private/var
        const normalizedRoot = root.replace('/private/var', '/var');
        const normalizedTestDir = testDir.replace('/private/var', '/var');
        expect(normalizedRoot).toBe(normalizedTestDir);
      });
    });

    describe('getBranches', () => {
      it('should return list of branches', () => {
        const branches = gitClient.getBranches();
        expect(branches.length).toBeGreaterThan(0);
        // Should contain main or master
        expect(branches.some((b) => b === 'main' || b === 'master')).toBe(true);
      });
    });
  });
});
