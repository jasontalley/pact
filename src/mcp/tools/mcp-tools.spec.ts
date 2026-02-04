/**
 * Unit tests for MCP tools.
 *
 * These tests mock the pact-api-client module to test tool logic in isolation.
 */
import { readAtomTool } from './read-atom.tool';
import { listAtomsTool } from './list-atoms.tool';
import { searchAtomsTool } from './search-atoms.tool';
import { getAtomForTestTool } from './get-atom-for-test.tool';
import { getCouplingStatusTool } from './get-coupling-status.tool';
import { getEpistemicStatusTool } from './get-epistemic-status.tool';
import { getIntentHistoryTool } from './get-intent-history.tool';
import { getConflictsTool } from './get-conflicts.tool';
import { allTools, toolHandlers, toolDefinitions } from './index';

// Mock the pact-api-client
jest.mock('../pact-api-client', () => ({
  getAtom: jest.fn(),
  listAtoms: jest.fn(),
  searchAtoms: jest.fn(),
  getTestRecordsForFile: jest.fn(),
  getCouplingMetrics: jest.fn(),
  getEpistemicMetrics: jest.fn(),
  getIntentHistory: jest.fn(),
  getAtomVersionHistory: jest.fn(),
  getConflicts: jest.fn(),
}));

const mockApi = jest.requireMock('../pact-api-client');

const sampleAtom = {
  id: 'uuid-1',
  atomId: 'IA-001',
  description: 'User can log in',
  category: 'functional',
  qualityScore: 85,
  status: 'committed',
  supersededBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  committedAt: '2026-01-02T00:00:00Z',
  observableOutcomes: ['Login succeeds'],
  falsifiabilityCriteria: ['Wrong password fails'],
  tags: ['auth'],
  intentIdentity: 'intent-uuid-1',
  intentVersion: 1,
};

describe('MCP Tool Registry', () => {
  it('should have 8 tools registered', () => {
    expect(allTools).toHaveLength(8);
  });

  it('should have all tool handlers in the map', () => {
    expect(toolHandlers.size).toBe(8);
    for (const tool of allTools) {
      expect(toolHandlers.has(tool.name)).toBe(true);
    }
  });

  it('should have all tool definitions', () => {
    expect(toolDefinitions).toHaveLength(8);
    for (const def of toolDefinitions) {
      expect(def.name).toBeDefined();
      expect(def.description).toBeDefined();
      expect(def.inputSchema).toBeDefined();
    }
  });

  it('should have unique tool names', () => {
    const names = allTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('read_atom', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return atom data for UUID lookup', async () => {
    mockApi.getAtom.mockResolvedValue(sampleAtom);

    const result = await readAtomTool.handler({ atomId: 'uuid-1-with-dashes-like-this-uuid' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.atomId).toBe('IA-001');
  });

  it('should find atom by human-readable ID', async () => {
    mockApi.listAtoms.mockResolvedValue({ items: [sampleAtom], total: 1 });
    mockApi.getAtom.mockResolvedValue(sampleAtom);

    const result = await readAtomTool.handler({ atomId: 'IA-001' });

    expect(result.isError).toBeUndefined();
    expect(mockApi.listAtoms).toHaveBeenCalledWith({ limit: 100 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.atomId).toBe('IA-001');
  });

  it('should return error when atomId is missing', async () => {
    const result = await readAtomTool.handler({});
    expect(result.isError).toBe(true);
  });

  it('should return not-found error for nonexistent human-readable ID', async () => {
    mockApi.listAtoms.mockResolvedValue({ items: [], total: 0 });

    const result = await readAtomTool.handler({ atomId: 'IA-999' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No atom found');
  });

  it('should return error on API failure for UUID lookup', async () => {
    mockApi.getAtom.mockRejectedValue(new Error('Not found'));

    const result = await readAtomTool.handler({ atomId: 'uuid-1-with-dashes-like-this-uuid' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Not found');
  });
});

describe('list_atoms', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return atom list', async () => {
    mockApi.listAtoms.mockResolvedValue({
      items: [sampleAtom],
      total: 1,
    });

    const result = await listAtomsTool.handler({ status: 'committed' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.atoms).toHaveLength(1);
    expect(parsed.total).toBe(1);
  });

  it('should pass filters to API', async () => {
    mockApi.listAtoms.mockResolvedValue({ items: [], total: 0 });

    await listAtomsTool.handler({ status: 'draft', category: 'security', limit: 5 });

    expect(mockApi.listAtoms).toHaveBeenCalledWith({
      status: 'draft',
      category: 'security',
      search: undefined,
      limit: 5,
    });
  });
});

describe('search_atoms', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should search atoms by query', async () => {
    mockApi.searchAtoms.mockResolvedValue({
      items: [sampleAtom],
      total: 1,
    });

    const result = await searchAtomsTool.handler({ query: 'login' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.results).toHaveLength(1);
  });

  it('should return error when query is missing', async () => {
    const result = await searchAtomsTool.handler({});
    expect(result.isError).toBe(true);
  });
});

describe('get_atom_for_test', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should identify orphan test file', async () => {
    mockApi.getTestRecordsForFile.mockResolvedValue([]);

    const result = await getAtomForTestTool.handler({ testFilePath: 'src/test.spec.ts' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.isOrphan).toBe(true);
    expect(parsed.linkedAtoms).toHaveLength(0);
  });

  it('should return linked atoms', async () => {
    mockApi.getTestRecordsForFile.mockResolvedValue([
      {
        id: 't1',
        testName: 'test 1',
        linkedAtomId: 'uuid-1',
        hadAtomAnnotation: true,
        atomRecommendationId: null,
      },
    ]);
    mockApi.getAtom.mockResolvedValue(sampleAtom);

    const result = await getAtomForTestTool.handler({ testFilePath: 'src/auth.spec.ts' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.isOrphan).toBe(false);
    expect(parsed.linkedAtoms).toHaveLength(1);
    expect(parsed.linkedAtoms[0].atomId).toBe('IA-001');
  });

  it('should return error when testFilePath is missing', async () => {
    const result = await getAtomForTestTool.handler({});
    expect(result.isError).toBe(true);
  });
});

describe('get_coupling_status', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return formatted coupling metrics', async () => {
    mockApi.getCouplingMetrics.mockResolvedValue({
      atomTestCoupling: {
        rate: 0.75,
        atomsWithTests: 3,
        totalAtoms: 4,
        orphanAtoms: [{ id: '1' }],
      },
      testAtomCoupling: {
        rate: 0.9,
        testsWithAtoms: 9,
        totalTests: 10,
        orphanTests: [{ id: '1' }],
      },
      codeAtomCoverage: {
        rate: 0.5,
        filesWithAtoms: 5,
        totalSourceFiles: 10,
        uncoveredFiles: ['a.ts'],
      },
      timestamp: '2026-01-01T00:00:00Z',
    });

    const result = await getCouplingStatusTool.handler({});

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.atomTestCoupling.rate).toBe('75%');
    expect(parsed.testAtomCoupling.rate).toBe('90%');
    expect(parsed.codeAtomCoverage.rate).toBe('50%');
    expect(parsed.codeAtomCoverage.uncoveredFileCount).toBe(1);
  });
});

describe('get_epistemic_status', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return formatted epistemic metrics', async () => {
    mockApi.getEpistemicMetrics.mockResolvedValue({
      proven: { count: 5, percentage: 0.5 },
      committed: { count: 3, percentage: 0.3 },
      inferred: { count: 2, percentage: 0.2 },
      unknown: { orphanTestsCount: 10, uncoveredCodeFilesCount: 5 },
      totalCertainty: 0.8,
      timestamp: '2026-01-01T00:00:00Z',
    });

    const result = await getEpistemicStatusTool.handler({});

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.totalCertainty).toBe('80%');
    expect(parsed.proven.count).toBe(5);
    expect(parsed.proven.percentage).toBe('50%');
    expect(parsed.unknown.orphanTestsCount).toBe(10);
  });
});

describe('get_intent_history', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return version history by intent identity', async () => {
    mockApi.getIntentHistory.mockResolvedValue([
      { ...sampleAtom, intentVersion: 1 },
      { ...sampleAtom, intentVersion: 2, id: 'uuid-2' },
    ]);

    const result = await getIntentHistoryTool.handler({ intentIdentity: 'intent-uuid-1' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.totalVersions).toBe(2);
    expect(parsed.versions).toHaveLength(2);
  });

  it('should return version history by atom ID', async () => {
    mockApi.getAtomVersionHistory.mockResolvedValue({
      intentIdentity: 'intent-uuid-1',
      versions: [sampleAtom],
      currentVersion: sampleAtom,
    });

    const result = await getIntentHistoryTool.handler({ atomId: 'uuid-1' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.intentIdentity).toBe('intent-uuid-1');
  });

  it('should return error when neither param provided', async () => {
    const result = await getIntentHistoryTool.handler({});
    expect(result.isError).toBe(true);
  });
});

describe('get_conflicts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return conflicts list', async () => {
    mockApi.getConflicts.mockResolvedValue([
      {
        id: 'conflict-1',
        conflictType: 'semantic_overlap',
        atomIdA: 'atom-a',
        atomIdB: 'atom-b',
        description: 'Overlap detected',
        similarityScore: 85,
        status: 'open',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    const result = await getConflictsTool.handler({ status: 'open' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.conflicts).toHaveLength(1);
    expect(parsed.total).toBe(1);
    expect(parsed.conflicts[0].type).toBe('semantic_overlap');
  });

  it('should return empty list when no conflicts', async () => {
    mockApi.getConflicts.mockResolvedValue([]);

    const result = await getConflictsTool.handler({});

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.conflicts).toHaveLength(0);
    expect(parsed.total).toBe(0);
  });
});
