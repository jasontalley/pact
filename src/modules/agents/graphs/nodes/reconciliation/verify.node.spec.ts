/**
 * Verify Node Tests
 *
 * Tests for the verify node interrupt logic, quality scoring,
 * and batch/concurrent validation modes.
 *
 * @see docs/implementation-checklist-phase6.md Section 1.1
 * @see docs/implementation-checklist-phase20.md Step E
 */

import { createVerifyNode, InterruptPayload } from './verify.node';
import { ReconciliationGraphStateType, InferredAtom } from '../../types/reconciliation-state';
import { NodeConfig } from '../types';

/**
 * Create a mock atom for testing
 */
function createMockAtom(overrides: Partial<InferredAtom> = {}): InferredAtom {
  return {
    tempId: `atom-${Math.random().toString(36).substring(7)}`,
    description: 'User can successfully log in with valid credentials',
    category: 'functional',
    sourceTest: {
      filePath: 'test/auth.spec.ts',
      testName: 'should allow login',
      lineNumber: 10,
    },
    observableOutcomes: ['User session is created', 'User is redirected to dashboard'],
    confidence: 0.8,
    reasoning: 'Inferred from authentication test that verifies login flow',
    ...overrides,
  };
}

/**
 * Create a minimal state for testing
 */
function createMockState(
  overrides: Partial<ReconciliationGraphStateType> = {},
): ReconciliationGraphStateType {
  return {
    rootDirectory: '/test',
    input: {
      rootDirectory: '/test',
      reconciliationMode: 'full-scan',
      options: {
        qualityThreshold: 80,
        requireReview: false,
      },
    },
    repoStructure: null,
    orphanTests: [],
    changedAtomLinkedTests: [],
    deltaSummary: null,
    documentationIndex: null,
    contextPerTest: new Map(),
    inferredAtoms: [],
    inferredMolecules: [],
    currentPhase: 'verify',
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
  } as ReconciliationGraphStateType;
}

/**
 * Create a mock config for testing
 */
function createMockConfig(): NodeConfig {
  return {
    logger: {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    toolRegistry: {
      hasTool: jest.fn().mockReturnValue(false),
      executeTool: jest.fn(),
    },
  } as unknown as NodeConfig;
}

describe('VerifyNode', () => {
  describe('Interrupt Logic (Phase 6 Fixes)', () => {
    it('should never throw NodeInterrupt when requireReview: false', async () => {
      // Create atoms that will all fail quality (low confidence, no outcomes)
      const atoms = [
        createMockAtom({
          tempId: 'atom-1',
          confidence: 0.1,
          observableOutcomes: [],
          reasoning: '',
        }),
        createMockAtom({
          tempId: 'atom-2',
          confidence: 0.2,
          observableOutcomes: [],
          reasoning: '',
        }),
      ];

      const state = createMockState({
        inferredAtoms: atoms,
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: {
            qualityThreshold: 80,
            requireReview: false,
          },
        },
      });

      const config = createMockConfig();
      const nodeFactory = createVerifyNode({ useTool: false, useInterrupt: true });
      const node = nodeFactory(config);

      // Should NOT throw NodeInterrupt
      const result = await node(state);

      expect(result.pendingHumanReview).toBe(false);
      expect(result.decisions).toBeDefined();
      expect(result.currentPhase).toBe('persist');
    });

    it('should return pendingHumanReview=true when requireReview: true', async () => {
      const atoms = [createMockAtom({ tempId: 'atom-1' })];

      const state = createMockState({
        inferredAtoms: atoms,
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: {
            qualityThreshold: 80,
            requireReview: true,
          },
        },
      });

      const config = createMockConfig();
      const nodeFactory = createVerifyNode({ useTool: false, useInterrupt: true });
      const node = nodeFactory(config);

      // LangGraph 1.x: Node returns state instead of throwing NodeInterrupt
      const result = await node(state);

      expect(result.pendingHumanReview).toBe(true);
      expect(result.currentPhase).toBe('verify');
      expect(result.decisions).toHaveLength(1);
    });

    it('should complete without interrupt at 100% fail rate when requireReview: false', async () => {
      // Create 10 atoms that ALL fail quality
      const atoms = Array.from({ length: 10 }, (_, i) =>
        createMockAtom({
          tempId: `atom-${i}`,
          confidence: 0.1, // Very low confidence
          observableOutcomes: [], // No outcomes
          reasoning: '', // No reasoning
          description: 'x', // Too short
        }),
      );

      const state = createMockState({
        inferredAtoms: atoms,
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: {
            qualityThreshold: 80,
            requireReview: false,
            forceInterruptOnQualityFail: false, // Explicitly false
          },
        },
      });

      const config = createMockConfig();
      const nodeFactory = createVerifyNode({ useTool: false, useInterrupt: true });
      const node = nodeFactory(config);

      // Should NOT throw - just complete with all quality_fail decisions
      const result = await node(state);

      expect(result.pendingHumanReview).toBe(false);
      expect(result.decisions).toHaveLength(10);
      expect(result.decisions?.every((d) => d === 'quality_fail')).toBe(true);
      expect(result.currentPhase).toBe('persist');
    });

    it('should return pendingHumanReview=true when forceInterruptOnQualityFail: true and failCount > passCount', async () => {
      // Create atoms where most fail
      const atoms = [
        createMockAtom({
          tempId: 'atom-1',
          confidence: 0.1, // Will fail
          observableOutcomes: [],
        }),
        createMockAtom({
          tempId: 'atom-2',
          confidence: 0.1, // Will fail
          observableOutcomes: [],
        }),
        createMockAtom({
          tempId: 'atom-3',
          confidence: 0.9, // Will pass
          observableOutcomes: ['Outcome'],
          reasoning: 'Valid reasoning here',
        }),
      ];

      const state = createMockState({
        inferredAtoms: atoms,
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: {
            qualityThreshold: 80,
            requireReview: false,
            forceInterruptOnQualityFail: true, // Enable legacy behavior
          },
        },
      });

      const config = createMockConfig();
      const nodeFactory = createVerifyNode({ useTool: false, useInterrupt: true });
      const node = nodeFactory(config);

      // LangGraph 1.x: Returns state with pendingHumanReview=true
      const result = await node(state);

      expect(result.pendingHumanReview).toBe(true);
      expect(result.currentPhase).toBe('verify');
    });

    it('should NOT throw when forceInterruptOnQualityFail: true but passCount >= failCount', async () => {
      // Create atoms where most pass
      const atoms = [
        createMockAtom({
          tempId: 'atom-1',
          confidence: 0.9,
          observableOutcomes: ['Outcome 1'],
          reasoning: 'Valid reasoning',
        }),
        createMockAtom({
          tempId: 'atom-2',
          confidence: 0.9,
          observableOutcomes: ['Outcome 2'],
          reasoning: 'Valid reasoning',
        }),
        createMockAtom({
          tempId: 'atom-3',
          confidence: 0.1, // Will fail
          observableOutcomes: [],
        }),
      ];

      const state = createMockState({
        inferredAtoms: atoms,
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: {
            qualityThreshold: 80,
            requireReview: false,
            forceInterruptOnQualityFail: true,
          },
        },
      });

      const config = createMockConfig();
      const nodeFactory = createVerifyNode({ useTool: false, useInterrupt: true });
      const node = nodeFactory(config);

      // Should NOT throw because passCount (2) >= failCount (1)
      const result = await node(state);

      expect(result.pendingHumanReview).toBe(false);
      expect(result.currentPhase).toBe('persist');
    });

    it('should return review state when requireReview: true', async () => {
      const atoms = [createMockAtom({ tempId: 'atom-1' }), createMockAtom({ tempId: 'atom-2' })];

      const state = createMockState({
        inferredAtoms: atoms,
        inferredMolecules: [
          {
            tempId: 'mol-1',
            name: 'Test Molecule',
            description: 'Test description',
            atomTempIds: ['atom-1', 'atom-2'],
            confidence: 0.9,
            reasoning: 'Grouped by test',
          },
        ],
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: {
            qualityThreshold: 80,
            requireReview: true,
          },
        },
      });

      const config = createMockConfig();
      const nodeFactory = createVerifyNode({ useTool: false, useInterrupt: true });
      const node = nodeFactory(config);

      // LangGraph 1.x: Node returns review state instead of throwing
      const result = await node(state);

      expect(result.pendingHumanReview).toBe(true);
      expect(result.currentPhase).toBe('verify');
      expect(result.decisions).toHaveLength(2);
    });
  });

  describe('Quality Scoring', () => {
    it('should calculate quality score based on atom properties', async () => {
      // Atom with all properties (should score high)
      const goodAtom = createMockAtom({
        tempId: 'good-atom',
        description: 'User can log in with valid credentials and receive a session token',
        category: 'functional',
        confidence: 0.9,
        observableOutcomes: ['Session token is returned', 'User is authenticated'],
        reasoning: 'Inferred from login test that verifies authentication flow',
        ambiguityReasons: [],
      });

      // Atom with missing properties (should score low)
      const badAtom = createMockAtom({
        tempId: 'bad-atom',
        description: 'works', // Too short
        category: '',
        confidence: 0.2,
        observableOutcomes: [],
        reasoning: '',
        ambiguityReasons: ['Unclear intent', 'Multiple interpretations'],
      });

      const state = createMockState({
        inferredAtoms: [goodAtom, badAtom],
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: {
            qualityThreshold: 50,
            requireReview: false,
          },
        },
      });

      const config = createMockConfig();
      const nodeFactory = createVerifyNode({ useTool: false, useInterrupt: true });
      const node = nodeFactory(config);

      const result = await node(state);

      // Good atom should pass, bad atom should fail
      expect(result.decisions?.[0]).toBe('approved');
      expect(result.decisions?.[1]).toBe('quality_fail');

      // Verify scores were set
      expect(goodAtom.qualityScore).toBeGreaterThan(50);
      expect(badAtom.qualityScore).toBeLessThan(50);
    });

    it('should use confidence on 0-1 scale correctly', async () => {
      // Atom with confidence 0.7 (70%) should pass the confidence check
      const atomWithGoodConfidence = createMockAtom({
        tempId: 'atom-1',
        confidence: 0.7, // 70% - above 50% threshold
      });

      // Atom with confidence 0.3 (30%) should fail the confidence check
      const atomWithBadConfidence = createMockAtom({
        tempId: 'atom-2',
        confidence: 0.3, // 30% - below 50% threshold
      });

      const state = createMockState({
        inferredAtoms: [atomWithGoodConfidence, atomWithBadConfidence],
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: {
            qualityThreshold: 60,
            requireReview: false,
          },
        },
      });

      const config = createMockConfig();
      const nodeFactory = createVerifyNode({ useTool: false, useInterrupt: true });
      const node = nodeFactory(config);

      await node(state);

      // Atom with 0.7 confidence should have higher score due to confidence check passing
      expect(atomWithGoodConfidence.qualityScore).toBeGreaterThan(
        atomWithBadConfidence.qualityScore!,
      );
    });
  });

  describe('Resume from Interrupt', () => {
    it('should process human review input on resume', async () => {
      const atoms = [
        createMockAtom({ tempId: 'atom-1' }),
        createMockAtom({ tempId: 'atom-2' }),
        createMockAtom({ tempId: 'atom-3' }),
      ];

      // Set quality scores as if they were validated in a previous run
      atoms[0].qualityScore = 90;
      atoms[1].qualityScore = 50;
      atoms[2].qualityScore = 30;

      const state = createMockState({
        inferredAtoms: atoms,
        wasResumed: true,
        humanReviewInput: {
          atomDecisions: [
            { recommendationId: 'atom-1', decision: 'approve' },
            { recommendationId: 'atom-2', decision: 'approve' }, // Override quality fail
            { recommendationId: 'atom-3', decision: 'reject' },
          ],
          moleculeDecisions: [],
        },
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: {
            qualityThreshold: 80,
            requireReview: true,
          },
        },
      });

      const config = createMockConfig();
      const nodeFactory = createVerifyNode({ useTool: false, useInterrupt: true });
      const node = nodeFactory(config);

      const result = await node(state);

      expect(result.decisions).toEqual(['approved', 'approved', 'rejected']);
      expect(result.pendingHumanReview).toBe(false);
      expect(result.currentPhase).toBe('persist');
    });
  });

  describe('Batch Mode (Phase 20)', () => {
    it('should use batch mode when atoms exceed threshold and batch service is available', async () => {
      const atoms = Array.from({ length: 25 }, (_, i) =>
        createMockAtom({
          tempId: `atom-${i}`,
          confidence: 0.8,
          observableOutcomes: ['Outcome'],
          reasoning: 'Valid reasoning here',
        }),
      );

      const state = createMockState({
        inferredAtoms: atoms,
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: {
            qualityThreshold: 80,
            requireReview: false,
          },
        },
      });

      const mockBatchService = {
        isAvailable: jest.fn().mockResolvedValue(true),
        submitAndWait: jest.fn().mockResolvedValue(
          atoms.map((a) => ({
            customId: a.tempId,
            success: true,
            content: JSON.stringify({
              totalScore: 85,
              decision: 'approve',
              feedback: 'Good quality atom',
            }),
          })),
        ),
      };

      const config = createMockConfig();
      const nodeFactory = createVerifyNode({
        useTool: false,
        useInterrupt: true,
        batchService: mockBatchService as any,
        batchThreshold: 20,
      });
      const node = nodeFactory(config);

      const result = await node(state);

      // Should have used batch service
      expect(mockBatchService.submitAndWait).toHaveBeenCalledTimes(1);
      const batchRequests = mockBatchService.submitAndWait.mock.calls[0][0];
      expect(batchRequests).toHaveLength(25);
      expect(batchRequests[0].customId).toBe('atom-0');

      // All atoms should have quality scores assigned from batch
      expect(result.decisions).toHaveLength(25);
      expect(atoms[0].qualityScore).toBe(85);
    });

    it('should fall back to direct validation when atoms below threshold', async () => {
      const atoms = Array.from({ length: 5 }, (_, i) =>
        createMockAtom({
          tempId: `atom-${i}`,
          confidence: 0.8,
          observableOutcomes: ['Outcome'],
          reasoning: 'Valid reasoning here',
        }),
      );

      const state = createMockState({
        inferredAtoms: atoms,
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: { qualityThreshold: 80, requireReview: false },
        },
      });

      const mockBatchService = {
        isAvailable: jest.fn().mockResolvedValue(true),
        submitAndWait: jest.fn(),
      };

      const config = createMockConfig();
      const nodeFactory = createVerifyNode({
        useTool: false,
        useInterrupt: true,
        batchService: mockBatchService as any,
        batchThreshold: 20,
      });
      const node = nodeFactory(config);

      const result = await node(state);

      // Should NOT have used batch service (below threshold)
      expect(mockBatchService.submitAndWait).not.toHaveBeenCalled();
      expect(result.decisions).toHaveLength(5);
    });

    it('should fall back to direct validation when batch service is unavailable', async () => {
      const atoms = Array.from({ length: 25 }, (_, i) =>
        createMockAtom({
          tempId: `atom-${i}`,
          confidence: 0.8,
          observableOutcomes: ['Outcome'],
          reasoning: 'Valid reasoning here',
        }),
      );

      const state = createMockState({
        inferredAtoms: atoms,
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: { qualityThreshold: 80, requireReview: false },
        },
      });

      const mockBatchService = {
        isAvailable: jest.fn().mockResolvedValue(false),
        submitAndWait: jest.fn(),
      };

      const config = createMockConfig();
      const nodeFactory = createVerifyNode({
        useTool: false,
        useInterrupt: true,
        batchService: mockBatchService as any,
        batchThreshold: 20,
      });
      const node = nodeFactory(config);

      const result = await node(state);

      // Should NOT have used batch service
      expect(mockBatchService.submitAndWait).not.toHaveBeenCalled();
      // Should still produce decisions via direct validation
      expect(result.decisions).toHaveLength(25);
    });

    it('should fall back to direct validation when batch service throws', async () => {
      const atoms = Array.from({ length: 25 }, (_, i) =>
        createMockAtom({
          tempId: `atom-${i}`,
          confidence: 0.8,
          observableOutcomes: ['Outcome'],
          reasoning: 'Valid reasoning here',
        }),
      );

      const state = createMockState({
        inferredAtoms: atoms,
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: { qualityThreshold: 80, requireReview: false },
        },
      });

      const mockBatchService = {
        isAvailable: jest.fn().mockResolvedValue(true),
        submitAndWait: jest.fn().mockRejectedValue(new Error('Batch API timeout')),
      };

      const config = createMockConfig();
      const nodeFactory = createVerifyNode({
        useTool: false,
        useInterrupt: true,
        batchService: mockBatchService as any,
        batchThreshold: 20,
      });
      const node = nodeFactory(config);

      const result = await node(state);

      // Should have tried batch, then fallen back
      expect(mockBatchService.submitAndWait).toHaveBeenCalledTimes(1);
      expect(config.logger?.warn).toHaveBeenCalledWith(
        expect.stringContaining('Batch mode failed'),
      );
      expect(result.decisions).toHaveLength(25);
    });

    it('should handle partial batch failures gracefully', async () => {
      const atoms = Array.from({ length: 25 }, (_, i) =>
        createMockAtom({
          tempId: `atom-${i}`,
          confidence: 0.8,
          observableOutcomes: ['Outcome'],
          reasoning: 'Valid reasoning here',
        }),
      );

      const state = createMockState({
        inferredAtoms: atoms,
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: { qualityThreshold: 80, requireReview: false },
        },
      });

      // Most succeed, some fail
      const batchResults = atoms.map((a, i) => {
        if (i < 22) {
          return {
            customId: a.tempId,
            success: true,
            content: JSON.stringify({
              totalScore: 85,
              decision: 'approve',
              feedback: 'Good quality atom',
            }),
          };
        }
        return { customId: a.tempId, success: false, error: 'Internal error' };
      });

      const mockBatchService = {
        isAvailable: jest.fn().mockResolvedValue(true),
        submitAndWait: jest.fn().mockResolvedValue(batchResults),
      };

      const config = createMockConfig();
      const nodeFactory = createVerifyNode({
        useTool: false,
        useInterrupt: true,
        batchService: mockBatchService as any,
        batchThreshold: 20,
      });
      const node = nodeFactory(config);

      const result = await node(state);

      // All atoms should have decisions
      expect(result.decisions).toHaveLength(25);
      // Batch results should assign score from parsed content
      expect(atoms[0].qualityScore).toBe(85);
      // Failed batch items should fall back to direct scoring
      expect(atoms[22].qualityScore).toBeDefined();
    });

    it('should call onBatchProgress during batch processing', async () => {
      const atoms = Array.from({ length: 25 }, (_, i) =>
        createMockAtom({
          tempId: `atom-${i}`,
          confidence: 0.8,
          observableOutcomes: ['Outcome'],
          reasoning: 'Valid reasoning here',
        }),
      );

      const state = createMockState({
        inferredAtoms: atoms,
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          runId: 'REC-test-123',
          options: { qualityThreshold: 80, requireReview: false },
        },
      });

      const mockBatchService = {
        isAvailable: jest.fn().mockResolvedValue(true),
        submitAndWait: jest.fn().mockResolvedValue(
          atoms.map((a) => ({
            customId: a.tempId,
            success: true,
            content: '{"totalScore": 80, "decision": "approve", "feedback": "OK"}',
          })),
        ),
      };

      const onBatchProgress = jest.fn();

      const config = createMockConfig();
      const nodeFactory = createVerifyNode({
        useTool: false,
        useInterrupt: true,
        batchService: mockBatchService as any,
        batchThreshold: 20,
        onBatchProgress,
      });
      const node = nodeFactory(config);

      await node(state);

      // submitAndWait should have been called with onProgress
      const waitOptions = mockBatchService.submitAndWait.mock.calls[0][1];
      expect(waitOptions.onProgress).toBeDefined();

      // Simulate calling onProgress to verify our callback is wired
      waitOptions.onProgress({
        completedRequests: 10,
        totalRequests: 25,
        failedRequests: 0,
      });
      expect(onBatchProgress).toHaveBeenCalledWith({
        runId: 'REC-test-123',
        completed: 10,
        total: 25,
        failed: 0,
      });
    });
  });

  describe('Concurrent Mode (Phase 20)', () => {
    it('should use concurrent mode when tool is available but no batch service and atoms exceed threshold', async () => {
      const atoms = Array.from({ length: 25 }, (_, i) =>
        createMockAtom({
          tempId: `atom-${i}`,
          confidence: 0.8,
          observableOutcomes: ['Outcome'],
          reasoning: 'Valid reasoning here',
        }),
      );

      const state = createMockState({
        inferredAtoms: atoms,
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: { qualityThreshold: 80, requireReview: false },
        },
      });

      const config = createMockConfig();
      // Tool is available
      (config.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      (config.toolRegistry.executeTool as jest.Mock).mockResolvedValue({
        totalScore: 90,
        decision: 'approve',
        actionableImprovements: [],
        overallFeedback: 'Great',
      });

      const nodeFactory = createVerifyNode({
        useTool: true,
        useInterrupt: true,
        // No batchService -> concurrent mode kicks in
        batchThreshold: 20,
        concurrencyLimit: 5,
      });
      const node = nodeFactory(config);

      const result = await node(state);

      // All atoms should be validated via tool (concurrently)
      expect(config.toolRegistry.executeTool).toHaveBeenCalledTimes(25);
      expect(result.decisions).toHaveLength(25);
      expect(atoms[0].qualityScore).toBe(90);
    });

    it('should fall back to direct validation when tool throws in concurrent mode', async () => {
      const atoms = Array.from({ length: 25 }, (_, i) =>
        createMockAtom({
          tempId: `atom-${i}`,
          confidence: 0.8,
          observableOutcomes: ['Outcome'],
          reasoning: 'Valid reasoning here',
        }),
      );

      const state = createMockState({
        inferredAtoms: atoms,
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: { qualityThreshold: 80, requireReview: false },
        },
      });

      const config = createMockConfig();
      (config.toolRegistry.hasTool as jest.Mock).mockReturnValue(true);
      // Alternate between success and failure
      (config.toolRegistry.executeTool as jest.Mock).mockImplementation(
        (_: string, params: Record<string, string>) => {
          const idx = parseInt(params.atom_id.replace('atom-', ''), 10);
          if (idx % 3 === 0) {
            return Promise.reject(new Error('Tool timeout'));
          }
          return Promise.resolve({
            totalScore: 85,
            decision: 'approve',
            actionableImprovements: [],
            overallFeedback: 'Good',
          });
        },
      );

      const nodeFactory = createVerifyNode({
        useTool: true,
        useInterrupt: true,
        batchThreshold: 20,
        concurrencyLimit: 5,
      });
      const node = nodeFactory(config);

      const result = await node(state);

      // All atoms should have a score (either from tool or direct fallback)
      expect(result.decisions).toHaveLength(25);
      for (const atom of atoms) {
        expect(atom.qualityScore).toBeDefined();
        expect(atom.qualityScore).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Logging', () => {
    it('should log warning when failure rate is high', async () => {
      // Create atoms where >50% fail
      const atoms = Array.from({ length: 10 }, (_, i) =>
        createMockAtom({
          tempId: `atom-${i}`,
          confidence: i < 7 ? 0.1 : 0.9, // 7 fail, 3 pass
          observableOutcomes: i < 7 ? [] : ['Outcome'],
          reasoning: i < 7 ? '' : 'Valid reasoning',
        }),
      );

      const state = createMockState({
        inferredAtoms: atoms,
        input: {
          rootDirectory: '/test',
          reconciliationMode: 'full-scan',
          options: {
            qualityThreshold: 80,
            requireReview: false,
          },
        },
      });

      const config = createMockConfig();
      const nodeFactory = createVerifyNode({ useTool: false, useInterrupt: true });
      const node = nodeFactory(config);

      await node(state);

      // Should have logged a warning about high failure rate
      expect(config.logger?.warn).toHaveBeenCalledWith(
        expect.stringContaining('High quality failure rate'),
      );
    });
  });
});
