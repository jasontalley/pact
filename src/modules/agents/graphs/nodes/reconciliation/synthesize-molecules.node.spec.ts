/**
 * Synthesize Molecules Node Tests
 *
 * Tests for the molecule synthesis node that clusters atoms into molecules.
 * Covers various clustering methods, tool integration, and error handling.
 *
 * @see docs/implementation-checklist-phase6.md Section 2.1
 */

import {
  createSynthesizeMoleculesNode,
  SynthesizeMoleculesNodeOptions,
} from './synthesize-molecules.node';
import { ReconciliationGraphStateType, InferredAtom } from '../../types/reconciliation-state';
import { NodeConfig } from '../types';

/**
 * Create mock logger
 */
const createMockLogger = () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  fatal: jest.fn(),
  localInstance: undefined,
  options: {},
  registerLocalInstanceRef: jest.fn(),
});

/**
 * Create mock NodeConfig
 */
function createMockNodeConfig(): NodeConfig {
  return {
    llmService: {
      invoke: jest.fn(),
      invokeWithTools: jest.fn(),
    } as any,
    toolRegistry: {
      hasTool: jest.fn().mockReturnValue(false),
      executeTool: jest.fn(),
      getTools: jest.fn().mockReturnValue([]),
    } as any,
    logger: createMockLogger() as any,
  };
}

/**
 * Create mock state
 */
function createMockState(
  overrides: Partial<ReconciliationGraphStateType> = {},
): ReconciliationGraphStateType {
  return {
    rootDirectory: '/test/project',
    input: {
      rootDirectory: '/test/project',
      reconciliationMode: 'full-scan',
      options: {},
    },
    repoStructure: { files: [], testFiles: [] },
    orphanTests: [],
    changedAtomLinkedTests: [],
    deltaSummary: null,
    documentationIndex: null,
    contextPerTest: new Map(),
    inferredAtoms: [],
    inferredMolecules: [],
    currentPhase: 'synthesize',
    iteration: 0,
    maxIterations: 10,
    errors: [],
    decisions: [],
    pendingHumanReview: false,
    humanReviewInput: null,
    wasResumed: false,
    output: null,
    interimRunId: null,
    interimRunUuid: null,
    startTime: new Date(),
    llmCallCount: 0,
    ...overrides,
  };
}

/**
 * Create mock atoms for testing
 */
function createMockAtoms(
  specs: Array<{
    module?: string;
    category?: string;
    description?: string;
  }>,
): InferredAtom[] {
  return specs.map((spec, i) => ({
    tempId: `temp-${i}`,
    description: spec.description || `Test atom ${i}`,
    category: spec.category || 'functional',
    confidence: 80,
    qualityScore: 75,
    observableOutcomes: ['Outcome 1'],
    reasoning: 'Inferred from test',
    sourceTest: {
      filePath: spec.module
        ? `src/modules/${spec.module}/${spec.module}.service.spec.ts`
        : `src/modules/test/file${i}.spec.ts`,
      testName: `should do something ${i}`,
      lineNumber: 10 + i,
    },
  }));
}

describe('SynthesizeMoleculesNode', () => {
  let mockConfig: NodeConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = createMockNodeConfig();
  });

  describe('basic molecule synthesis', () => {
    it('should synthesize molecules from atoms', async () => {
      const atoms = createMockAtoms([{ module: 'users' }, { module: 'users' }, { module: 'auth' }]);

      const state = createMockState({ inferredAtoms: atoms });
      const node = createSynthesizeMoleculesNode()(mockConfig);
      const result = await node(state);

      expect(result.inferredMolecules).toBeDefined();
      expect(result.inferredMolecules!.length).toBeGreaterThan(0);
      expect(result.currentPhase).toBe('verify');
    });

    it('should return empty molecules for empty atoms', async () => {
      const state = createMockState({ inferredAtoms: [] });
      const node = createSynthesizeMoleculesNode()(mockConfig);
      const result = await node(state);

      expect(result.inferredMolecules).toEqual([]);
      expect(result.currentPhase).toBe('verify');
    });

    it('should assign tempId to each molecule', async () => {
      const atoms = createMockAtoms([{ module: 'users' }, { module: 'users' }]);
      const state = createMockState({ inferredAtoms: atoms });
      const node = createSynthesizeMoleculesNode()(mockConfig);
      const result = await node(state);

      for (const molecule of result.inferredMolecules!) {
        expect(molecule.tempId).toMatch(/^temp-mol-/);
      }
    });
  });

  describe('clustering methods', () => {
    describe('module clustering', () => {
      it('should cluster atoms by module name', async () => {
        const atoms = createMockAtoms([
          { module: 'users' },
          { module: 'users' },
          { module: 'auth' },
          { module: 'auth' },
        ]);

        const state = createMockState({ inferredAtoms: atoms });
        const node = createSynthesizeMoleculesNode({ clusteringMethod: 'module' })(mockConfig);
        const result = await node(state);

        // Should have 2 clusters: users and auth
        expect(result.inferredMolecules!.length).toBe(2);

        const usersCluster = result.inferredMolecules!.find((m) =>
          m.name.toLowerCase().includes('users'),
        );
        expect(usersCluster?.atomTempIds).toHaveLength(2);
      });

      it('should extract module from common directory structures', async () => {
        const atoms: InferredAtom[] = [
          {
            tempId: 'temp-1',
            description: 'Test 1',
            category: 'functional',
            confidence: 80,
            observableOutcomes: [],
            reasoning: '',
            sourceTest: {
              filePath: 'frontend/components/Button/Button.spec.tsx',
              testName: 'test 1',
              lineNumber: 10,
            },
          },
          {
            tempId: 'temp-2',
            description: 'Test 2',
            category: 'functional',
            confidence: 80,
            observableOutcomes: [],
            reasoning: '',
            sourceTest: {
              filePath: 'frontend/components/Button/Button.test.tsx',
              testName: 'test 2',
              lineNumber: 20,
            },
          },
        ];

        const state = createMockState({ inferredAtoms: atoms });
        const node = createSynthesizeMoleculesNode({ clusteringMethod: 'module' })(mockConfig);
        const result = await node(state);

        // Should extract "Button" as module from components/Button path
        expect(result.inferredMolecules!.length).toBe(1);
        expect(result.inferredMolecules![0].name).toContain('Button');
      });
    });

    describe('category clustering', () => {
      it('should cluster atoms by category', async () => {
        const atoms = createMockAtoms([
          { category: 'security' },
          { category: 'security' },
          { category: 'performance' },
          { category: 'functional' },
        ]);

        const state = createMockState({ inferredAtoms: atoms });
        const node = createSynthesizeMoleculesNode({ clusteringMethod: 'category' })(mockConfig);
        const result = await node(state);

        // Should have 3 clusters
        expect(result.inferredMolecules!.length).toBe(3);

        const securityCluster = result.inferredMolecules!.find((m) =>
          m.reasoning.includes('security'),
        );
        expect(securityCluster?.atomTempIds).toHaveLength(2);
      });
    });

    describe('namespace clustering', () => {
      it('should cluster atoms by file directory', async () => {
        const atoms: InferredAtom[] = [
          {
            tempId: 'temp-1',
            description: 'Test 1',
            category: 'functional',
            confidence: 80,
            observableOutcomes: [],
            reasoning: '',
            sourceTest: {
              filePath: 'src/modules/users/services/users.spec.ts',
              testName: 'test 1',
              lineNumber: 10,
            },
          },
          {
            tempId: 'temp-2',
            description: 'Test 2',
            category: 'functional',
            confidence: 80,
            observableOutcomes: [],
            reasoning: '',
            sourceTest: {
              filePath: 'src/modules/users/services/admin.spec.ts',
              testName: 'test 2',
              lineNumber: 20,
            },
          },
          {
            tempId: 'temp-3',
            description: 'Test 3',
            category: 'functional',
            confidence: 80,
            observableOutcomes: [],
            reasoning: '',
            sourceTest: {
              filePath: 'src/modules/auth/auth.spec.ts',
              testName: 'test 3',
              lineNumber: 30,
            },
          },
        ];

        const state = createMockState({ inferredAtoms: atoms });
        const node = createSynthesizeMoleculesNode({ clusteringMethod: 'namespace' })(mockConfig);
        const result = await node(state);

        // Should have 2 clusters: one for users/services, one for auth
        expect(result.inferredMolecules!.length).toBe(2);
      });
    });

    describe('domain_concept clustering', () => {
      it('should cluster atoms by domain concepts in description', async () => {
        const atoms = createMockAtoms([
          { description: 'User can login with valid credentials' },
          { description: 'User session is created after authentication' },
          { description: 'Payment is processed securely' },
          { description: 'Order checkout validates payment' },
        ]);

        const state = createMockState({ inferredAtoms: atoms });
        const node = createSynthesizeMoleculesNode({ clusteringMethod: 'domain_concept' })(
          mockConfig,
        );
        const result = await node(state);

        // Should cluster by domain concepts (user/session vs payment/checkout)
        expect(result.inferredMolecules!.length).toBeGreaterThan(0);
      });

      it('should handle atoms with no domain concepts', async () => {
        const atoms = createMockAtoms([
          { description: 'xyz does abc' },
          { description: 'foo does bar' },
        ]);

        const state = createMockState({ inferredAtoms: atoms });
        const node = createSynthesizeMoleculesNode({ clusteringMethod: 'domain_concept' })(
          mockConfig,
        );
        const result = await node(state);

        // Should put in misc cluster
        expect(result.inferredMolecules!.some((m) => m.reasoning.includes('misc'))).toBe(true);
      });
    });

    describe('semantic clustering', () => {
      it('should cluster atoms by text similarity', async () => {
        const atoms = createMockAtoms([
          { description: 'User can create a new account' },
          { description: 'User can create a new profile' },
          { description: 'Payment processes credit card transactions' },
        ]);

        const state = createMockState({ inferredAtoms: atoms });
        const node = createSynthesizeMoleculesNode({
          clusteringMethod: 'semantic',
          semanticSimilarityThreshold: 0.3,
        })(mockConfig);
        const result = await node(state);

        // Similar descriptions should be clustered together
        expect(result.inferredMolecules!.length).toBeGreaterThan(0);
      });

      it('should respect similarity threshold', async () => {
        const atoms = createMockAtoms([
          { description: 'Very unique description one' },
          { description: 'Completely different text two' },
          { description: 'Another unrelated phrase three' },
        ]);

        const state = createMockState({ inferredAtoms: atoms });

        // With high threshold, each should be its own cluster
        const node = createSynthesizeMoleculesNode({
          clusteringMethod: 'semantic',
          semanticSimilarityThreshold: 0.9,
        })(mockConfig);
        const result = await node(state);

        // Each atom should be in its own cluster due to high threshold
        expect(result.inferredMolecules!.length).toBe(3);
      });
    });
  });

  describe('minimum atoms per molecule', () => {
    it('should skip clusters below minimum size', async () => {
      const atoms = createMockAtoms([
        { module: 'users' },
        { module: 'users' },
        { module: 'users' },
        { module: 'auth' }, // Only 1 atom
      ]);

      const state = createMockState({ inferredAtoms: atoms });
      const node = createSynthesizeMoleculesNode({
        clusteringMethod: 'module',
        minAtomsPerMolecule: 2,
      })(mockConfig);
      const result = await node(state);

      // Should only have users cluster (auth has < 2 atoms)
      expect(result.inferredMolecules!.length).toBe(1);
      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Skipping cluster'),
      );
    });

    it('should include all clusters when minimum is 1', async () => {
      const atoms = createMockAtoms([
        { module: 'users' },
        { module: 'auth' },
        { module: 'payment' },
      ]);

      const state = createMockState({ inferredAtoms: atoms });
      const node = createSynthesizeMoleculesNode({
        clusteringMethod: 'module',
        minAtomsPerMolecule: 1,
      })(mockConfig);
      const result = await node(state);

      expect(result.inferredMolecules!.length).toBe(3);
    });
  });

  describe('molecule naming and description', () => {
    it('should generate appropriate name based on category', async () => {
      const atoms = createMockAtoms([
        { module: 'users', category: 'security' },
        { module: 'users', category: 'security' },
      ]);

      const state = createMockState({ inferredAtoms: atoms });
      const node = createSynthesizeMoleculesNode({ clusteringMethod: 'module' })(mockConfig);
      const result = await node(state);

      // Security-only cluster should get "Security" suffix
      expect(result.inferredMolecules![0].name).toContain('Security');
    });

    it('should generate "Functionality" name for mixed categories', async () => {
      const atoms = createMockAtoms([
        { module: 'users', category: 'security' },
        { module: 'users', category: 'functional' },
      ]);

      const state = createMockState({ inferredAtoms: atoms });
      const node = createSynthesizeMoleculesNode({ clusteringMethod: 'module' })(mockConfig);
      const result = await node(state);

      expect(result.inferredMolecules![0].name).toContain('Functionality');
    });

    it('should generate description that includes atom descriptions', async () => {
      const atoms = createMockAtoms([
        { module: 'users', description: 'User can login' },
        { module: 'users', description: 'User can logout' },
      ]);

      const state = createMockState({ inferredAtoms: atoms });
      const node = createSynthesizeMoleculesNode({ clusteringMethod: 'module' })(mockConfig);
      const result = await node(state);

      const description = result.inferredMolecules![0].description;
      expect(description).toContain('User can login');
      expect(description).toContain('User can logout');
    });

    it('should truncate description for many atoms', async () => {
      const atoms = createMockAtoms([
        { module: 'users', description: 'Desc 1' },
        { module: 'users', description: 'Desc 2' },
        { module: 'users', description: 'Desc 3' },
        { module: 'users', description: 'Desc 4' },
        { module: 'users', description: 'Desc 5' },
      ]);

      const state = createMockState({ inferredAtoms: atoms });
      const node = createSynthesizeMoleculesNode({ clusteringMethod: 'module' })(mockConfig);
      const result = await node(state);

      expect(result.inferredMolecules![0].description).toContain('and more');
    });
  });

  describe('confidence calculation', () => {
    it('should calculate average confidence of atoms', async () => {
      const atoms: InferredAtom[] = [
        {
          tempId: 'temp-1',
          description: 'Test 1',
          category: 'functional',
          confidence: 80,
          observableOutcomes: [],
          reasoning: '',
          sourceTest: { filePath: 'src/modules/users/a.spec.ts', testName: 'test', lineNumber: 10 },
        },
        {
          tempId: 'temp-2',
          description: 'Test 2',
          category: 'functional',
          confidence: 60,
          observableOutcomes: [],
          reasoning: '',
          sourceTest: { filePath: 'src/modules/users/b.spec.ts', testName: 'test', lineNumber: 10 },
        },
      ];

      const state = createMockState({ inferredAtoms: atoms });
      const node = createSynthesizeMoleculesNode({ clusteringMethod: 'module' })(mockConfig);
      const result = await node(state);

      // Average of 80 and 60 = 70
      expect(result.inferredMolecules![0].confidence).toBe(70);
    });
  });

  describe('tool-based clustering', () => {
    it('should use tool when available', async () => {
      const mockToolResult = [
        {
          temp_id: 'tool-mol-1',
          name: 'Tool Generated Molecule',
          description: 'Description from tool',
          atom_temp_ids: ['temp-0', 'temp-1'],
          confidence: 85,
          clustering_reason: 'Tool clustering reason',
        },
      ];

      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockResolvedValue(mockToolResult);

      const atoms = createMockAtoms([{ module: 'users' }, { module: 'users' }]);
      const state = createMockState({ inferredAtoms: atoms });
      const node = createSynthesizeMoleculesNode({ useTool: true })(mockConfig);
      const result = await node(state);

      expect(mockConfig.toolRegistry.executeTool).toHaveBeenCalledWith(
        'cluster_atoms_for_molecules',
        expect.any(Object),
      );
      expect(result.inferredMolecules![0].tempId).toBe('tool-mol-1');
      expect(result.inferredMolecules![0].name).toBe('Tool Generated Molecule');
    });

    it('should fall back to direct implementation on tool error', async () => {
      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (mockConfig.toolRegistry.executeTool as jest.Mock).mockRejectedValue(
        new Error('Tool failed'),
      );

      const atoms = createMockAtoms([{ module: 'users' }, { module: 'users' }]);
      const state = createMockState({ inferredAtoms: atoms });
      const node = createSynthesizeMoleculesNode({ useTool: true })(mockConfig);
      const result = await node(state);

      expect(mockConfig.logger?.warn).toHaveBeenCalledWith(
        expect.stringContaining('Tool execution failed'),
      );
      // Should still produce molecules via fallback
      expect(result.inferredMolecules!.length).toBeGreaterThan(0);
    });

    it('should skip tool when useTool is false', async () => {
      (mockConfig.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);

      const atoms = createMockAtoms([{ module: 'users' }, { module: 'users' }]);
      const state = createMockState({ inferredAtoms: atoms });
      const node = createSynthesizeMoleculesNode({ useTool: false })(mockConfig);
      await node(state);

      expect(mockConfig.toolRegistry.executeTool).not.toHaveBeenCalled();
    });
  });

  describe('logging', () => {
    it('should log clustering method and atom count', async () => {
      const atoms = createMockAtoms([{ module: 'users' }]);
      const state = createMockState({ inferredAtoms: atoms });
      const node = createSynthesizeMoleculesNode({ clusteringMethod: 'category' })(mockConfig);
      await node(state);

      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Clustering 1 atoms using method: category'),
      );
    });

    it('should log number of molecules synthesized', async () => {
      const atoms = createMockAtoms([{ module: 'users' }, { module: 'auth' }]);
      const state = createMockState({ inferredAtoms: atoms });
      const node = createSynthesizeMoleculesNode({ clusteringMethod: 'module' })(mockConfig);
      await node(state);

      expect(mockConfig.logger?.log).toHaveBeenCalledWith(
        expect.stringContaining('Synthesized 2 molecules'),
      );
    });
  });
});
