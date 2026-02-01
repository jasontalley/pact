/**
 * Verify Node Tests
 *
 * Tests for the verify node interrupt logic and quality scoring.
 *
 * @see docs/implementation-checklist-phase6.md Section 1.1
 */

import { NodeInterrupt } from '@langchain/langgraph';
import { createVerifyNode, VerifyNodeOptions, InterruptPayload } from './verify.node';
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
function createMockState(overrides: Partial<ReconciliationGraphStateType> = {}): ReconciliationGraphStateType {
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

    it('should throw NodeInterrupt when requireReview: true', async () => {
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

      // Should throw NodeInterrupt
      await expect(node(state)).rejects.toThrow(NodeInterrupt);
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

    it('should throw NodeInterrupt when forceInterruptOnQualityFail: true and failCount > passCount', async () => {
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

      // Should throw because failCount (2) > passCount (1)
      await expect(node(state)).rejects.toThrow(NodeInterrupt);
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

    it('should include correct interrupt payload when interrupting', async () => {
      const atoms = [
        createMockAtom({ tempId: 'atom-1' }),
        createMockAtom({ tempId: 'atom-2' }),
      ];

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

      try {
        await node(state);
        fail('Expected NodeInterrupt to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NodeInterrupt);

        // NodeInterrupt stores interrupts in an array format
        // The message is JSON array: [{ value: "...", when: "during" }]
        const interruptError = error as NodeInterrupt;
        const interrupts = JSON.parse(interruptError.message) as Array<{ value: string; when: string }>;
        expect(interrupts).toHaveLength(1);

        const payload: InterruptPayload = JSON.parse(interrupts[0].value);
        expect(payload.summary.totalAtoms).toBe(2);
        expect(payload.pendingAtoms).toHaveLength(2);
        expect(payload.pendingMolecules).toHaveLength(1);
        expect(payload.reason).toBe('Review required by configuration');
      }
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
      expect(atomWithGoodConfidence.qualityScore).toBeGreaterThan(atomWithBadConfidence.qualityScore!);
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
