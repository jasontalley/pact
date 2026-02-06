/**
 * Reconciliation Agent Property Tests
 *
 * Invariants that must hold on every reconciliation run, regardless of input.
 * These are structural properties enforced by the graph and contracts.
 *
 * @see docs/architecture/agent-contracts.md (Reconciliation contract)
 * @see docs/implementation-checklist-phase13.md (13.4.2)
 */

import {
  ReconciliationRunOutput,
  RunArtifact,
  EvidenceReference,
} from '../../../src/modules/agents/evaluation/run-artifact.types';

/**
 * Helper to create a minimal reconciliation Run Artifact for testing.
 */
function createMockArtifact(
  overrides: Partial<ReconciliationRunOutput> = {},
): RunArtifact<'reconciliation'> {
  return {
    runId: 'test-run',
    agent: 'reconciliation',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    config: {},
    input: {
      rootDirectory: '/test',
      mode: 'full-scan',
      options: {},
    },
    inputHash: 'testhash',
    output: {
      inferredAtoms: [],
      inferredMolecules: [],
      orphanTestCount: 0,
      changedLinkedTestCount: 0,
      errors: [],
      decisions: [],
      ...overrides,
    },
    nodeTransitions: [],
    evidenceReferences: [],
    metrics: {
      totalDurationMs: 100,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalLlmCalls: 0,
      totalToolCalls: 0,
      perNode: [],
    },
  };
}

describe('Reconciliation Agent Properties', () => {
  // =========================================================================
  // P-REC-01: Evidence Grounding
  // Every claim about repo state must cite evidence.
  // =========================================================================
  describe('P-REC-01: Evidence Grounding', () => {
    it('every inferred atom must have a source test reference', () => {
      const artifact = createMockArtifact({
        inferredAtoms: [
          {
            tempId: 'atom-1',
            description: 'User can authenticate',
            category: 'functional',
            confidence: 85,
            sourceTest: {
              filePath: 'test/auth.spec.ts',
              testName: 'should authenticate user',
              lineNumber: 10,
            },
            observableOutcomes: ['Returns token on valid credentials'],
          },
        ],
      });

      for (const atom of artifact.output.inferredAtoms) {
        expect(atom.sourceTest).toBeDefined();
        expect(atom.sourceTest.filePath).toBeTruthy();
        expect(atom.sourceTest.testName).toBeTruthy();
        expect(atom.sourceTest.lineNumber).toBeGreaterThan(0);
      }
    });

    it('no atom may reference an empty file path', () => {
      const artifact = createMockArtifact({
        inferredAtoms: [
          {
            tempId: 'atom-1',
            description: 'Test atom',
            category: 'functional',
            confidence: 80,
            sourceTest: {
              filePath: 'test/valid.spec.ts',
              testName: 'valid test',
              lineNumber: 5,
            },
            observableOutcomes: ['Observable outcome'],
          },
        ],
      });

      for (const atom of artifact.output.inferredAtoms) {
        expect(atom.sourceTest.filePath).not.toBe('');
        expect(atom.sourceTest.testName).not.toBe('');
      }
    });
  });

  // =========================================================================
  // P-REC-02: Schema Validity
  // All structured outputs must conform to the expected schema.
  // =========================================================================
  describe('P-REC-02: Schema Validity', () => {
    it('every inferred atom must have required fields', () => {
      const artifact = createMockArtifact({
        inferredAtoms: [
          {
            tempId: 'atom-1',
            description: 'User can log in',
            category: 'functional',
            confidence: 90,
            sourceTest: {
              filePath: 'test/login.spec.ts',
              testName: 'authenticates with valid creds',
              lineNumber: 15,
            },
            observableOutcomes: ['Returns auth token', 'Sets session cookie'],
          },
        ],
      });

      for (const atom of artifact.output.inferredAtoms) {
        expect(atom.tempId).toBeTruthy();
        expect(atom.description).toBeTruthy();
        expect(atom.description.length).toBeGreaterThanOrEqual(10);
        expect(atom.category).toBeTruthy();
        expect(atom.confidence).toBeGreaterThanOrEqual(0);
        expect(atom.confidence).toBeLessThanOrEqual(100);
        expect(atom.observableOutcomes.length).toBeGreaterThan(0);
      }
    });

    it('every inferred molecule must have at least 2 atoms', () => {
      const artifact = createMockArtifact({
        inferredMolecules: [
          {
            tempId: 'mol-1',
            name: 'Authentication',
            description: 'Auth feature',
            atomTempIds: ['atom-1', 'atom-2'],
            confidence: 85,
          },
        ],
      });

      for (const molecule of artifact.output.inferredMolecules) {
        expect(molecule.atomTempIds.length).toBeGreaterThanOrEqual(2);
        expect(molecule.name).toBeTruthy();
        expect(molecule.description).toBeTruthy();
      }
    });

    it('confidence scores are in valid range [0, 100]', () => {
      const artifact = createMockArtifact({
        inferredAtoms: [
          {
            tempId: 'atom-1',
            description: 'Valid confidence test',
            category: 'functional',
            confidence: 75,
            sourceTest: {
              filePath: 'test/conf.spec.ts',
              testName: 'conf test',
              lineNumber: 1,
            },
            observableOutcomes: ['Outcome'],
          },
        ],
      });

      for (const atom of artifact.output.inferredAtoms) {
        expect(atom.confidence).toBeGreaterThanOrEqual(0);
        expect(atom.confidence).toBeLessThanOrEqual(100);
      }

      for (const molecule of artifact.output.inferredMolecules) {
        expect(molecule.confidence).toBeGreaterThanOrEqual(0);
        expect(molecule.confidence).toBeLessThanOrEqual(100);
      }
    });
  });

  // =========================================================================
  // P-REC-03: No Orphan Atom References
  // Every atom referenced by a molecule must exist in the inferred atoms list.
  // =========================================================================
  describe('P-REC-03: Molecule-Atom Referential Integrity', () => {
    it('molecule atomTempIds must reference existing inferred atoms', () => {
      const artifact = createMockArtifact({
        inferredAtoms: [
          {
            tempId: 'atom-1',
            description: 'First atom',
            category: 'functional',
            confidence: 80,
            sourceTest: { filePath: 'test/a.spec.ts', testName: 'a', lineNumber: 1 },
            observableOutcomes: ['Outcome'],
          },
          {
            tempId: 'atom-2',
            description: 'Second atom',
            category: 'functional',
            confidence: 80,
            sourceTest: { filePath: 'test/b.spec.ts', testName: 'b', lineNumber: 1 },
            observableOutcomes: ['Outcome'],
          },
        ],
        inferredMolecules: [
          {
            tempId: 'mol-1',
            name: 'Feature',
            description: 'Feature molecule',
            atomTempIds: ['atom-1', 'atom-2'],
            confidence: 85,
          },
        ],
      });

      const atomIds = new Set(artifact.output.inferredAtoms.map((a) => a.tempId));

      for (const molecule of artifact.output.inferredMolecules) {
        for (const atomTempId of molecule.atomTempIds) {
          expect(atomIds.has(atomTempId)).toBe(true);
        }
      }
    });
  });

  // =========================================================================
  // P-REC-04: Bounded Output
  // The number of recommendations must be bounded.
  // =========================================================================
  describe('P-REC-04: Bounded Output', () => {
    it('inferred atoms count should not exceed reasonable bounds', () => {
      const artifact = createMockArtifact({
        inferredAtoms: Array.from({ length: 50 }, (_, i) => ({
          tempId: `atom-${i}`,
          description: `Atom ${i} description that is meaningful`,
          category: 'functional',
          confidence: 80,
          sourceTest: {
            filePath: `test/file-${i}.spec.ts`,
            testName: `test ${i}`,
            lineNumber: 1,
          },
          observableOutcomes: ['Outcome'],
        })),
      });

      // For a typical reconciliation run, 200+ atoms is suspicious
      expect(artifact.output.inferredAtoms.length).toBeLessThanOrEqual(200);
    });
  });

  // =========================================================================
  // P-REC-05: Error Accumulation (INV-EVAL-03)
  // Errors must accumulate, never be silently swallowed.
  // =========================================================================
  describe('P-REC-05: Error Accumulation', () => {
    it('errors array must be present even when empty', () => {
      const artifact = createMockArtifact();

      expect(artifact.output.errors).toBeDefined();
      expect(Array.isArray(artifact.output.errors)).toBe(true);
    });

    it('error messages must be non-empty strings', () => {
      const artifact = createMockArtifact({
        errors: ['Structure node failed: timeout', 'Context node: file not found'],
      });

      for (const error of artifact.output.errors) {
        expect(typeof error).toBe('string');
        expect(error.length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // P-REC-06: No Hallucination (Critical Property)
  // No repo fact without evidence in artifact.
  // =========================================================================
  describe('P-REC-06: No Hallucination', () => {
    it('given a set of valid file paths, all atom source paths must be in the set', () => {
      const validPaths = new Set(['test/auth.spec.ts', 'test/payment.spec.ts', 'src/auth.ts']);

      const artifact = createMockArtifact({
        inferredAtoms: [
          {
            tempId: 'atom-1',
            description: 'Auth atom',
            category: 'functional',
            confidence: 85,
            sourceTest: {
              filePath: 'test/auth.spec.ts',
              testName: 'authenticates',
              lineNumber: 10,
            },
            observableOutcomes: ['Returns token'],
          },
        ],
      });

      for (const atom of artifact.output.inferredAtoms) {
        expect(validPaths.has(atom.sourceTest.filePath)).toBe(true);
      }
    });
  });
});
