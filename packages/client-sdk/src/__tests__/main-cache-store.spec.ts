/**
 * MainCacheStore Unit Tests
 */

import { MainCacheStore } from '../main-cache-store';
import { MainCache } from '../main-cache';
import { MainStateCache } from '../types';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('MainCacheStore', () => {
  let testDir: string;
  let cacheStore: MainCacheStore;

  const createTestCacheData = (): MainStateCache => ({
    atoms: [
      {
        id: 'atom-1',
        description: 'Test atom',
        category: 'functional',
        status: 'committed',
        qualityScore: 80,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ],
    molecules: [
      {
        id: 'mol-1',
        name: 'Test molecule',
        description: 'Description',
        lensType: 'feature',
        atomIds: ['atom-1'],
        tags: [],
        createdAt: new Date('2024-01-01'),
      },
    ],
    atomTestLinks: [
      {
        id: 'link-1',
        atomId: 'atom-1',
        testFilePath: 'test.spec.ts',
        confidence: 0.9,
        isAttested: true,
      },
    ],
    snapshotVersion: 5,
    pulledAt: new Date('2024-01-01'),
    serverUrl: 'https://pact.example.com',
    projectId: 'project-1',
  });

  beforeEach(() => {
    // Create a temporary directory for testing
    testDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cache-store-test-'));
    cacheStore = new MainCacheStore({ projectRoot: testDir });
  });

  afterEach(() => {
    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('exists', () => {
    it('should return false when cache does not exist', () => {
      expect(cacheStore.exists()).toBe(false);
    });

    it('should return true when cache exists', async () => {
      await cacheStore.saveRaw(createTestCacheData());
      expect(cacheStore.exists()).toBe(true);
    });
  });

  describe('save and load', () => {
    it('should save and load cache data', async () => {
      const cache = new MainCache();
      cache.load(createTestCacheData());

      await cacheStore.save(cache);
      const loaded = await cacheStore.load();

      expect(loaded.getAtomCount()).toBe(1);
      expect(loaded.getMoleculeCount()).toBe(1);
      expect(loaded.getLinkCount()).toBe(1);
      expect(loaded.getSnapshotVersion()).toBe(5);
    });

    it('should create .pact directory if not exists', async () => {
      const pactDir = path.join(testDir, '.pact');
      expect(fs.existsSync(pactDir)).toBe(false);

      await cacheStore.saveRaw(createTestCacheData());

      expect(fs.existsSync(pactDir)).toBe(true);
    });

    it('should create .gitignore in .pact directory', async () => {
      await cacheStore.saveRaw(createTestCacheData());

      const gitignorePath = path.join(testDir, '.pact', '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);

      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toBe('*\n');
    });
  });

  describe('saveRaw', () => {
    it('should save raw data directly', async () => {
      const data = createTestCacheData();
      await cacheStore.saveRaw(data);

      const content = fs.readFileSync(cacheStore.getCachePath(), 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.atoms).toHaveLength(1);
      expect(parsed.snapshotVersion).toBe(5);
    });
  });

  describe('load', () => {
    it('should return empty cache when file does not exist', async () => {
      const cache = await cacheStore.load();
      expect(cache.isEmpty()).toBe(true);
    });

    it('should return empty cache when file is invalid JSON', async () => {
      await cacheStore.ensurePactDir();
      fs.writeFileSync(cacheStore.getCachePath(), 'invalid json');

      const cache = await cacheStore.load();
      expect(cache.isEmpty()).toBe(true);
    });
  });

  describe('isStale', () => {
    it('should return true when cache does not exist', async () => {
      const isStale = await cacheStore.isStale();
      expect(isStale).toBe(true);
    });

    it('should return false for fresh cache', async () => {
      const data = createTestCacheData();
      data.pulledAt = new Date(); // Now
      await cacheStore.saveRaw(data);

      const isStale = await cacheStore.isStale(24 * 60 * 60 * 1000); // 24 hours
      expect(isStale).toBe(false);
    });

    it('should return true for old cache', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 2); // 2 days ago

      const data = createTestCacheData();
      data.pulledAt = oldDate;
      await cacheStore.saveRaw(data);

      const isStale = await cacheStore.isStale(24 * 60 * 60 * 1000); // 24 hours
      expect(isStale).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete cache file', async () => {
      await cacheStore.saveRaw(createTestCacheData());
      expect(cacheStore.exists()).toBe(true);

      await cacheStore.delete();
      expect(cacheStore.exists()).toBe(false);
    });

    it('should not throw when file does not exist', async () => {
      await expect(cacheStore.delete()).resolves.not.toThrow();
    });
  });

  describe('getCachePath', () => {
    it('should return correct path', () => {
      const expectedPath = path.join(testDir, '.pact', 'main-cache.json');
      expect(cacheStore.getCachePath()).toBe(expectedPath);
    });
  });

  describe('getPactDir', () => {
    it('should return correct path', () => {
      const expectedPath = path.join(testDir, '.pact');
      expect(cacheStore.getPactDir()).toBe(expectedPath);
    });
  });

  describe('getMetadata', () => {
    it('should return exists: false when cache does not exist', async () => {
      const metadata = await cacheStore.getMetadata();
      expect(metadata.exists).toBe(false);
    });

    it('should return metadata when cache exists', async () => {
      await cacheStore.saveRaw(createTestCacheData());

      const metadata = await cacheStore.getMetadata();

      expect(metadata.exists).toBe(true);
      expect(metadata.snapshotVersion).toBe(5);
      expect(metadata.serverUrl).toBe('https://pact.example.com');
      expect(metadata.projectId).toBe('project-1');
      expect(metadata.sizeBytes).toBeGreaterThan(0);
    });
  });

  describe('ensurePactDir', () => {
    it('should create .pact directory', async () => {
      const pactDir = path.join(testDir, '.pact');
      expect(fs.existsSync(pactDir)).toBe(false);

      await cacheStore.ensurePactDir();

      expect(fs.existsSync(pactDir)).toBe(true);
    });

    it('should create .gitignore', async () => {
      await cacheStore.ensurePactDir();

      const gitignorePath = path.join(testDir, '.pact', '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);
    });

    it('should be idempotent', async () => {
      await cacheStore.ensurePactDir();
      await cacheStore.ensurePactDir(); // Should not throw

      const pactDir = path.join(testDir, '.pact');
      expect(fs.existsSync(pactDir)).toBe(true);
    });
  });

  describe('custom configuration', () => {
    it('should support custom cache file name', async () => {
      const customStore = new MainCacheStore({
        projectRoot: testDir,
        cacheFileName: 'custom-cache.json',
      });

      await customStore.saveRaw(createTestCacheData());

      const expectedPath = path.join(testDir, '.pact', 'custom-cache.json');
      expect(customStore.getCachePath()).toBe(expectedPath);
      expect(fs.existsSync(expectedPath)).toBe(true);
    });

    it('should support custom pact directory name', async () => {
      const customStore = new MainCacheStore({
        projectRoot: testDir,
        pactDirName: '.custom-pact',
      });

      await customStore.saveRaw(createTestCacheData());

      const expectedDir = path.join(testDir, '.custom-pact');
      expect(customStore.getPactDir()).toBe(expectedDir);
      expect(fs.existsSync(expectedDir)).toBe(true);
    });
  });
});
