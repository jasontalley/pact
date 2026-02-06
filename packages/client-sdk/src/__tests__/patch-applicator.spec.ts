/**
 * PatchApplicator Unit Tests
 */

import { PatchApplicator } from '../patch-applicator';
import { AnnotationPatch } from '../types';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('PatchApplicator', () => {
  let testDir: string;
  let patchApplicator: PatchApplicator;

  beforeEach(() => {
    // Create a temporary directory for testing
    testDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'patch-applicator-test-'));
    patchApplicator = new PatchApplicator({ projectRoot: testDir, createBackups: true });
  });

  afterEach(() => {
    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const createTestFile = (name: string, content: string): string => {
    const filePath = path.join(testDir, name);
    fs.writeFileSync(filePath, content);
    return name;
  };

  describe('applyPatch', () => {
    it('should insert annotation at specified line', async () => {
      const fileName = createTestFile(
        'test.spec.ts',
        `describe('test', () => {\n  it('should work', () => {\n    expect(true).toBe(true);\n  });\n});`,
      );

      const patch: AnnotationPatch = {
        filePath: fileName,
        lineNumber: 2, // Before "it('should work'...)"
        annotation: '// @atom IA-001',
        atomId: 'IA-001',
      };

      const result = await patchApplicator.applyPatch(patch);

      expect(result.success).toBe(true);

      const content = fs.readFileSync(path.join(testDir, fileName), 'utf-8');
      const lines = content.split('\n');

      expect(lines[1]).toContain('// @atom IA-001');
    });

    it('should preserve indentation', async () => {
      const fileName = createTestFile(
        'test.spec.ts',
        `describe('test', () => {\n  it('should work', () => {\n    expect(true).toBe(true);\n  });\n});`,
      );

      const patch: AnnotationPatch = {
        filePath: fileName,
        lineNumber: 2,
        annotation: '// @atom IA-001',
        atomId: 'IA-001',
      };

      await patchApplicator.applyPatch(patch);

      const content = fs.readFileSync(path.join(testDir, fileName), 'utf-8');
      const lines = content.split('\n');

      // Should have same indentation as the target line
      expect(lines[1]).toBe('  // @atom IA-001');
    });

    it('should create backup when enabled', async () => {
      const fileName = createTestFile('test.spec.ts', 'original content');

      const patch: AnnotationPatch = {
        filePath: fileName,
        lineNumber: 1,
        annotation: '// @atom IA-001',
        atomId: 'IA-001',
      };

      await patchApplicator.applyPatch(patch);

      const backupPath = path.join(testDir, fileName + '.bak');
      expect(fs.existsSync(backupPath)).toBe(true);
      expect(fs.readFileSync(backupPath, 'utf-8')).toBe('original content');
    });
  });

  describe('applyPatches', () => {
    it('should apply multiple patches to same file in correct order', async () => {
      const fileName = createTestFile(
        'test.spec.ts',
        `describe('suite', () => {\n  it('test 1', () => {});\n  it('test 2', () => {});\n});`,
      );

      const patches: AnnotationPatch[] = [
        { filePath: fileName, lineNumber: 2, annotation: '// @atom IA-001', atomId: 'IA-001' },
        { filePath: fileName, lineNumber: 3, annotation: '// @atom IA-002', atomId: 'IA-002' },
      ];

      const results = await patchApplicator.applyPatches(patches);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);

      const content = fs.readFileSync(path.join(testDir, fileName), 'utf-8');
      const lines = content.split('\n');

      // Patches applied in descending order, so line numbers stay correct
      expect(lines[1]).toContain('// @atom IA-001');
      expect(lines[3]).toContain('// @atom IA-002');
    });

    it('should apply patches to multiple files', async () => {
      const file1 = createTestFile('test1.spec.ts', `it('test 1', () => {});`);
      const file2 = createTestFile('test2.spec.ts', `it('test 2', () => {});`);

      const patches: AnnotationPatch[] = [
        { filePath: file1, lineNumber: 1, annotation: '// @atom IA-001', atomId: 'IA-001' },
        { filePath: file2, lineNumber: 1, annotation: '// @atom IA-002', atomId: 'IA-002' },
      ];

      const results = await patchApplicator.applyPatches(patches);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe('previewPatches', () => {
    it('should return preview without modifying file', async () => {
      const originalContent = `describe('test', () => {\n  it('should work', () => {});\n});`;
      const fileName = createTestFile('test.spec.ts', originalContent);

      const patch: AnnotationPatch = {
        filePath: fileName,
        lineNumber: 2,
        annotation: '// @atom IA-001',
        atomId: 'IA-001',
      };

      const results = await patchApplicator.previewPatches([patch]);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].preview).toContain('// @atom IA-001');

      // Original file should be unchanged
      const actualContent = fs.readFileSync(path.join(testDir, fileName), 'utf-8');
      expect(actualContent).toBe(originalContent);
    });
  });

  describe('validatePatches', () => {
    it('should return empty array for valid patches', async () => {
      const fileName = createTestFile('test.spec.ts', 'line 1\nline 2\nline 3');

      const patches: AnnotationPatch[] = [
        { filePath: fileName, lineNumber: 2, annotation: '// @atom IA-001', atomId: 'IA-001' },
      ];

      const errors = await patchApplicator.validatePatches(patches);

      expect(errors).toHaveLength(0);
    });

    it('should detect non-existent file', async () => {
      const patches: AnnotationPatch[] = [
        {
          filePath: 'non-existent.ts',
          lineNumber: 1,
          annotation: '// @atom IA-001',
          atomId: 'IA-001',
        },
      ];

      const errors = await patchApplicator.validatePatches(patches);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('File not found');
    });

    it('should detect invalid line number', async () => {
      const fileName = createTestFile('test.spec.ts', 'line 1\nline 2');

      const patches: AnnotationPatch[] = [
        { filePath: fileName, lineNumber: 100, annotation: '// @atom IA-001', atomId: 'IA-001' },
      ];

      const errors = await patchApplicator.validatePatches(patches);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Invalid line number');
    });

    it('should detect invalid annotation format', async () => {
      const fileName = createTestFile('test.spec.ts', 'content');

      const patches: AnnotationPatch[] = [
        {
          filePath: fileName,
          lineNumber: 1,
          annotation: '// invalid annotation',
          atomId: 'IA-001',
        },
      ];

      const errors = await patchApplicator.validatePatches(patches);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Invalid annotation format');
    });
  });

  describe('restoreFromBackups', () => {
    it('should restore file from backup', async () => {
      const fileName = createTestFile('test.spec.ts', 'original content');

      // Apply patch (creates backup)
      await patchApplicator.applyPatch({
        filePath: fileName,
        lineNumber: 1,
        annotation: '// @atom IA-001',
        atomId: 'IA-001',
      });

      // Restore from backup
      const results = await patchApplicator.restoreFromBackups([fileName]);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);

      const content = fs.readFileSync(path.join(testDir, fileName), 'utf-8');
      expect(content).toBe('original content');
    });

    it('should report error for missing backup', async () => {
      const fileName = createTestFile('test.spec.ts', 'content');

      const results = await patchApplicator.restoreFromBackups([fileName]);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('Backup file not found');
    });
  });

  describe('cleanupBackups', () => {
    it('should remove backup files', async () => {
      const fileName = createTestFile('test.spec.ts', 'content');

      // Apply patch (creates backup)
      await patchApplicator.applyPatch({
        filePath: fileName,
        lineNumber: 1,
        annotation: '// @atom IA-001',
        atomId: 'IA-001',
      });

      const backupPath = path.join(testDir, fileName + '.bak');
      expect(fs.existsSync(backupPath)).toBe(true);

      await patchApplicator.cleanupBackups([fileName]);

      expect(fs.existsSync(backupPath)).toBe(false);
    });
  });
});
