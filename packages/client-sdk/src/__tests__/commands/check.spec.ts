/**
 * Check Command Unit Tests
 */

import { check, formatCheckResult } from '../../commands/check';
import { MainCacheStore } from '../../main-cache-store';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('check command', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    testDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'check-command-test-'));
  });

  afterEach(() => {
    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const createTestFile = (relativePath: string, content: string): void => {
    const fullPath = path.join(testDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  };

  describe('check', () => {
    it('should generate report with no cache', async () => {
      createTestFile('src/app.spec.ts', `// @atom IA-001\nit('test', () => {});`);

      const result = await check({ projectRoot: testDir });

      expect(result.report).toBeDefined();
      expect(result.report.isAdvisory).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('No Main state cache');
    });

    it('should detect @atom annotations', async () => {
      createTestFile('src/test.spec.ts', `// @atom IA-001\nit('test 1', () => {});\n// @atom IA-002\nit('test 2', () => {});`);

      const result = await check({ projectRoot: testDir });

      expect(result.report.plausibleLinks).toHaveLength(2);
      expect(result.report.plausibleLinks[0].atomId).toBe('IA-001');
      expect(result.report.plausibleLinks[1].atomId).toBe('IA-002');
    });

    it('should identify orphan tests', async () => {
      createTestFile('src/linked.spec.ts', `// @atom IA-001\nit('linked', () => {});`);
      createTestFile('src/orphan.spec.ts', `it('orphan', () => {});`);

      const result = await check({ projectRoot: testDir });

      expect(result.report.orphanTests).toContain('src/orphan.spec.ts');
      expect(result.report.orphanTests).not.toContain('src/linked.spec.ts');
    });

    it('should save report to .pact directory', async () => {
      createTestFile('src/test.spec.ts', `it('test', () => {});`);

      const result = await check({ projectRoot: testDir });

      expect(fs.existsSync(result.reportPath)).toBe(true);
      expect(result.reportPath).toContain('.pact');
    });

    it('should use custom output path', async () => {
      createTestFile('src/test.spec.ts', `it('test', () => {});`);
      const customPath = path.join(testDir, 'custom-report.json');

      const result = await check({
        projectRoot: testDir,
        outputPath: customPath,
      });

      expect(result.reportPath).toBe(customPath);
      expect(fs.existsSync(customPath)).toBe(true);
    });

    it('should include quality summary when links exist', async () => {
      createTestFile('src/test.spec.ts', `// @atom IA-001\nit('test', () => {});`);

      const result = await check({ projectRoot: testDir });

      expect(result.report.qualitySummary).toBeDefined();
      expect(result.report.qualitySummary?.averageScore).toBeGreaterThanOrEqual(0);
    });

    it('should support different annotation formats', async () => {
      createTestFile(
        'src/test.spec.ts',
        `// @atom IA-001\n/* @atom IA-002 */\n// @atom custom-id-123\nit('test', () => {});`,
      );

      const result = await check({ projectRoot: testDir });

      expect(result.report.plausibleLinks).toHaveLength(3);
      expect(result.report.plausibleLinks.map((l) => l.atomId)).toContain('IA-001');
      expect(result.report.plausibleLinks.map((l) => l.atomId)).toContain('IA-002');
      expect(result.report.plausibleLinks.map((l) => l.atomId)).toContain('custom-id-123');
    });
  });

  describe('with cache', () => {
    beforeEach(async () => {
      // Create a cache with known atoms
      const cacheStore = new MainCacheStore({ projectRoot: testDir });
      await cacheStore.saveRaw({
        atoms: [
          {
            id: 'IA-001',
            description: 'Test atom 1',
            category: 'functional',
            status: 'committed',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'IA-002',
            description: 'Test atom 2',
            category: 'security',
            status: 'committed',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        molecules: [],
        atomTestLinks: [],
        snapshotVersion: 1,
        pulledAt: new Date(),
        serverUrl: 'https://pact.example.com',
      });
    });

    it('should identify uncovered atoms', async () => {
      createTestFile('src/test.spec.ts', `// @atom IA-001\nit('test', () => {});`);

      const result = await check({ projectRoot: testDir });

      // IA-002 should be uncovered (no test links in cache)
      expect(result.report.uncoveredAtoms).toContain('IA-002');
    });

    it('should have higher confidence for cached atoms', async () => {
      createTestFile('src/test.spec.ts', `// @atom IA-001\n// @atom unknown-atom\nit('test', () => {});`);

      const result = await check({ projectRoot: testDir });

      const cachedLink = result.report.plausibleLinks.find((l) => l.atomId === 'IA-001');
      const uncachedLink = result.report.plausibleLinks.find((l) => l.atomId === 'unknown-atom');

      expect(cachedLink?.confidence).toBe(1.0);
      expect(uncachedLink?.confidence).toBe(0.5);
    });
  });

  describe('formatCheckResult', () => {
    it('should format result for CLI output', async () => {
      createTestFile('src/test.spec.ts', `// @atom IA-001\nit('test', () => {});`);
      createTestFile('src/orphan.spec.ts', `it('orphan', () => {});`);

      const result = await check({ projectRoot: testDir });
      const formatted = formatCheckResult(result);

      expect(formatted).toContain('Pact Local Check Report');
      expect(formatted).toContain('Plausible links: 1');
      expect(formatted).toContain('Orphan tests: 1');
      expect(formatted).toContain('advisory only');
    });

    it('should include warnings in output', async () => {
      createTestFile('src/test.spec.ts', `it('test', () => {});`);

      const result = await check({ projectRoot: testDir });
      const formatted = formatCheckResult(result);

      expect(formatted).toContain('Warning');
      expect(formatted).toContain('No Main state cache');
    });
  });
});
