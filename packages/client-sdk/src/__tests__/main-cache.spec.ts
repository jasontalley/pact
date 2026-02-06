/**
 * MainCache Unit Tests
 */

import { MainCache } from '../main-cache';
import { MainStateCache, AtomSummary, MoleculeSummary, AtomTestLinkSummary } from '../types';

describe('MainCache', () => {
  let cache: MainCache;

  const createTestAtom = (id: string, overrides?: Partial<AtomSummary>): AtomSummary => ({
    id,
    description: `Test atom ${id}`,
    category: 'functional',
    status: 'committed',
    qualityScore: 80,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  });

  const createTestMolecule = (id: string, overrides?: Partial<MoleculeSummary>): MoleculeSummary => ({
    id,
    name: `Test molecule ${id}`,
    description: `Description for ${id}`,
    lensType: 'feature',
    atomIds: [],
    tags: [],
    createdAt: new Date('2024-01-01'),
    ...overrides,
  });

  const createTestLink = (atomId: string, testFile: string): AtomTestLinkSummary => ({
    id: `link-${atomId}-${testFile}`,
    atomId,
    testFilePath: testFile,
    confidence: 0.9,
    isAttested: true,
  });

  beforeEach(() => {
    cache = new MainCache();
  });

  describe('load and export', () => {
    it('should load cache data', () => {
      const data: MainStateCache = {
        atoms: [createTestAtom('atom-1'), createTestAtom('atom-2')],
        molecules: [createTestMolecule('mol-1')],
        atomTestLinks: [createTestLink('atom-1', 'test.spec.ts')],
        snapshotVersion: 1,
        pulledAt: new Date('2024-01-01'),
        serverUrl: 'https://pact.example.com',
        projectId: 'project-1',
      };

      cache.load(data);

      expect(cache.getAtomCount()).toBe(2);
      expect(cache.getMoleculeCount()).toBe(1);
      expect(cache.getLinkCount()).toBe(1);
      expect(cache.getSnapshotVersion()).toBe(1);
    });

    it('should export cache data', () => {
      const data: MainStateCache = {
        atoms: [createTestAtom('atom-1')],
        molecules: [createTestMolecule('mol-1')],
        atomTestLinks: [createTestLink('atom-1', 'test.spec.ts')],
        snapshotVersion: 5,
        pulledAt: new Date('2024-01-01'),
        serverUrl: 'https://pact.example.com',
      };

      cache.load(data);
      const exported = cache.export();

      expect(exported.atoms).toHaveLength(1);
      expect(exported.molecules).toHaveLength(1);
      expect(exported.atomTestLinks).toHaveLength(1);
      expect(exported.snapshotVersion).toBe(5);
      expect(exported.serverUrl).toBe('https://pact.example.com');
    });
  });

  describe('isEmpty', () => {
    it('should return true for empty cache', () => {
      expect(cache.isEmpty()).toBe(true);
    });

    it('should return false when atoms exist', () => {
      cache.load({
        atoms: [createTestAtom('atom-1')],
        molecules: [],
        atomTestLinks: [],
        snapshotVersion: 1,
        pulledAt: new Date(),
        serverUrl: 'https://pact.example.com',
      });

      expect(cache.isEmpty()).toBe(false);
    });
  });

  describe('isStale', () => {
    it('should return true when never loaded', () => {
      expect(cache.isStale()).toBe(true);
    });

    it('should return false for fresh cache', () => {
      cache.load({
        atoms: [],
        molecules: [],
        atomTestLinks: [],
        snapshotVersion: 1,
        pulledAt: new Date(), // Just now
        serverUrl: 'https://pact.example.com',
      });

      expect(cache.isStale()).toBe(false);
    });

    it('should return true for old cache', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 2); // 2 days ago

      cache.load({
        atoms: [],
        molecules: [],
        atomTestLinks: [],
        snapshotVersion: 1,
        pulledAt: oldDate,
        serverUrl: 'https://pact.example.com',
      });

      expect(cache.isStale(24 * 60 * 60 * 1000)).toBe(true); // 24 hours
    });
  });

  describe('atom queries', () => {
    beforeEach(() => {
      cache.load({
        atoms: [
          createTestAtom('atom-1', { category: 'functional', status: 'committed' }),
          createTestAtom('atom-2', { category: 'security', status: 'committed' }),
          createTestAtom('atom-3', { category: 'functional', status: 'draft' }),
        ],
        molecules: [],
        atomTestLinks: [],
        snapshotVersion: 1,
        pulledAt: new Date(),
        serverUrl: 'https://pact.example.com',
      });
    });

    it('should get atom by ID', () => {
      const atom = cache.getAtom('atom-1');
      expect(atom).toBeDefined();
      expect(atom?.id).toBe('atom-1');
    });

    it('should return undefined for non-existent atom', () => {
      const atom = cache.getAtom('non-existent');
      expect(atom).toBeUndefined();
    });

    it('should get all atoms', () => {
      const atoms = cache.getAllAtoms();
      expect(atoms).toHaveLength(3);
    });

    it('should query atoms by status', () => {
      const committed = cache.queryAtoms({ status: 'committed' });
      expect(committed).toHaveLength(2);
    });

    it('should query atoms by category', () => {
      const functional = cache.queryAtoms({ category: 'functional' });
      expect(functional).toHaveLength(2);
    });

    it('should get committed atoms', () => {
      const committed = cache.getCommittedAtoms();
      expect(committed).toHaveLength(2);
    });

    it('should get atoms by category', () => {
      const security = cache.getAtomsByCategory('security');
      expect(security).toHaveLength(1);
      expect(security[0].id).toBe('atom-2');
    });
  });

  describe('molecule queries', () => {
    beforeEach(() => {
      cache.load({
        atoms: [],
        molecules: [
          createTestMolecule('mol-1', { lensType: 'feature' }),
          createTestMolecule('mol-2', { lensType: 'epic', parentMoleculeId: 'mol-parent' }),
          createTestMolecule('mol-3', { lensType: 'feature' }),
          createTestMolecule('mol-parent', { lensType: 'epic' }),
        ],
        atomTestLinks: [],
        snapshotVersion: 1,
        pulledAt: new Date(),
        serverUrl: 'https://pact.example.com',
      });
    });

    it('should get molecule by ID', () => {
      const mol = cache.getMolecule('mol-1');
      expect(mol).toBeDefined();
      expect(mol?.id).toBe('mol-1');
    });

    it('should get all molecules', () => {
      const molecules = cache.getAllMolecules();
      expect(molecules).toHaveLength(4);
    });

    it('should get molecules by lens type', () => {
      const features = cache.getMoleculesByLensType('feature');
      expect(features).toHaveLength(2);
    });

    it('should get child molecules', () => {
      const children = cache.getChildMolecules('mol-parent');
      expect(children).toHaveLength(1);
      expect(children[0].id).toBe('mol-2');
    });
  });

  describe('link queries', () => {
    beforeEach(() => {
      cache.load({
        atoms: [
          createTestAtom('atom-1', { status: 'committed' }),
          createTestAtom('atom-2', { status: 'committed' }),
          createTestAtom('atom-3', { status: 'committed' }), // No links
        ],
        molecules: [],
        atomTestLinks: [
          createTestLink('atom-1', 'test1.spec.ts'),
          createTestLink('atom-1', 'test2.spec.ts'),
          createTestLink('atom-2', 'test1.spec.ts'),
        ],
        snapshotVersion: 1,
        pulledAt: new Date(),
        serverUrl: 'https://pact.example.com',
      });
    });

    it('should get all links', () => {
      const links = cache.getAllLinks();
      expect(links).toHaveLength(3);
    });

    it('should get links for atom', () => {
      const links = cache.getLinksForAtom('atom-1');
      expect(links).toHaveLength(2);
    });

    it('should get links for test file', () => {
      const links = cache.getLinksForTestFile('test1.spec.ts');
      expect(links).toHaveLength(2);
    });

    it('should get uncovered atoms', () => {
      const uncovered = cache.getUncoveredAtoms();
      expect(uncovered).toHaveLength(1);
      expect(uncovered[0].id).toBe('atom-3');
    });
  });

  describe('getSummary', () => {
    it('should return comprehensive summary', () => {
      cache.load({
        atoms: [
          createTestAtom('atom-1', { status: 'committed' }),
          createTestAtom('atom-2', { status: 'committed' }),
        ],
        molecules: [createTestMolecule('mol-1')],
        atomTestLinks: [createTestLink('atom-1', 'test.spec.ts')],
        snapshotVersion: 5,
        pulledAt: new Date('2024-01-01'),
        serverUrl: 'https://pact.example.com',
      });

      const summary = cache.getSummary();

      expect(summary.atomCount).toBe(2);
      expect(summary.moleculeCount).toBe(1);
      expect(summary.linkCount).toBe(1);
      expect(summary.committedAtoms).toBe(2);
      expect(summary.uncoveredAtoms).toBe(1); // atom-2 has no link
      expect(summary.snapshotVersion).toBe(5);
    });
  });
});
