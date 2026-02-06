/**
 * FileReader Unit Tests
 */

import { FileReader } from '../file-reader';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('FileReader', () => {
  let testDir: string;
  let fileReader: FileReader;

  beforeEach(() => {
    // Create a temporary directory for testing
    testDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'file-reader-test-'));
    fileReader = new FileReader({ projectRoot: testDir });
  });

  afterEach(() => {
    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('readFile', () => {
    it('should read file content', async () => {
      fs.writeFileSync(path.join(testDir, 'test.txt'), 'hello world');
      const content = await fileReader.readFile('test.txt');
      expect(content).toBe('hello world');
    });

    it('should return null for non-existent file', async () => {
      const content = await fileReader.readFile('non-existent.txt');
      expect(content).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      fs.writeFileSync(path.join(testDir, 'exists.txt'), 'content');
      const exists = await fileReader.exists('exists.txt');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const exists = await fileReader.exists('non-existent.txt');
      expect(exists).toBe(false);
    });
  });

  describe('readFiles', () => {
    it('should read multiple files', async () => {
      fs.writeFileSync(path.join(testDir, 'file1.txt'), 'content1');
      fs.writeFileSync(path.join(testDir, 'file2.txt'), 'content2');

      const contents = await fileReader.readFiles(['file1.txt', 'file2.txt']);
      expect(contents.get('file1.txt')).toBe('content1');
      expect(contents.get('file2.txt')).toBe('content2');
    });

    it('should skip non-existent files', async () => {
      fs.writeFileSync(path.join(testDir, 'exists.txt'), 'content');

      const contents = await fileReader.readFiles(['exists.txt', 'missing.txt']);
      expect(contents.size).toBe(1);
      expect(contents.get('exists.txt')).toBe('content');
    });
  });

  describe('buildManifest', () => {
    beforeEach(() => {
      // Create test structure
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(testDir, 'docs'), { recursive: true });

      // Source files
      fs.writeFileSync(path.join(testDir, 'src', 'app.ts'), 'export const app = {}');
      fs.writeFileSync(path.join(testDir, 'src', 'utils.js'), 'module.exports = {}');

      // Test files
      fs.writeFileSync(path.join(testDir, 'src', 'app.spec.ts'), 'describe("app", () => {})');
      fs.writeFileSync(path.join(testDir, 'src', 'utils.test.js'), 'test("utils", () => {})');

      // Doc files
      fs.writeFileSync(path.join(testDir, 'docs', 'README.md'), '# Docs');
      fs.writeFileSync(path.join(testDir, 'docs', 'guide.md'), '# Guide');
    });

    it('should categorize files correctly', async () => {
      const manifest = await fileReader.buildManifest();

      expect(manifest.testFiles).toContain('src/app.spec.ts');
      expect(manifest.testFiles).toContain('src/utils.test.js');
      expect(manifest.testFiles).toHaveLength(2);

      expect(manifest.sourceFiles).toContain('src/app.ts');
      expect(manifest.sourceFiles).toContain('src/utils.js');
      expect(manifest.sourceFiles).toHaveLength(2);

      expect(manifest.docFiles).toContain('docs/README.md');
      expect(manifest.docFiles).toContain('docs/guide.md');
      expect(manifest.docFiles).toHaveLength(2);
    });

    it('should count total files', async () => {
      const manifest = await fileReader.buildManifest();
      expect(manifest.totalCount).toBe(6);
    });

    it('should set generation timestamp', async () => {
      const before = new Date();
      const manifest = await fileReader.buildManifest();
      const after = new Date();

      expect(manifest.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(manifest.generatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('exclusion patterns', () => {
    it('should exclude node_modules', async () => {
      fs.mkdirSync(path.join(testDir, 'node_modules', 'package'), { recursive: true });
      fs.writeFileSync(path.join(testDir, 'node_modules', 'package', 'index.js'), '');
      fs.writeFileSync(path.join(testDir, 'app.ts'), '');

      const manifest = await fileReader.buildManifest();
      expect(manifest.files).not.toContain('node_modules/package/index.js');
      expect(manifest.files).toContain('app.ts');
    });

    it('should exclude .git directory', async () => {
      fs.mkdirSync(path.join(testDir, '.git', 'objects'), { recursive: true });
      fs.writeFileSync(path.join(testDir, '.git', 'config'), '');
      fs.writeFileSync(path.join(testDir, 'app.ts'), '');

      const manifest = await fileReader.buildManifest();
      expect(manifest.files).not.toContain('.git/config');
      expect(manifest.files).toContain('app.ts');
    });
  });

  describe('readForReconciliation', () => {
    beforeEach(() => {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(testDir, 'src', 'app.ts'), 'const app = 1');
      fs.writeFileSync(path.join(testDir, 'src', 'app.spec.ts'), 'test("app", () => {})');
      fs.writeFileSync(path.join(testDir, 'README.md'), '# Project');
    });

    it('should include all file types by default', async () => {
      const result = await fileReader.readForReconciliation();

      expect(result.manifest.testFiles).toHaveLength(1);
      expect(result.manifest.sourceFiles).toHaveLength(1);
      expect(result.manifest.docFiles).toHaveLength(1);
      expect(result.contents.size).toBe(3);
    });

    it('should exclude source files when specified', async () => {
      const result = await fileReader.readForReconciliation({ includeSourceFiles: false });

      expect(result.contents.has('src/app.spec.ts')).toBe(true);
      expect(result.contents.has('src/app.ts')).toBe(false);
    });

    it('should exclude docs when specified', async () => {
      const result = await fileReader.readForReconciliation({ includeDocs: false });

      expect(result.contents.has('src/app.spec.ts')).toBe(true);
      expect(result.contents.has('README.md')).toBe(false);
    });

    it('should calculate total size', async () => {
      const result = await fileReader.readForReconciliation();
      expect(result.totalSize).toBeGreaterThan(0);
    });
  });
});
