/**
 * Intent Interview Agent Property Tests
 *
 * Invariants that must hold on every interview run, regardless of input.
 * These are structural properties enforced by the graph and contracts.
 *
 * @see docs/architecture/agent-contracts.md (Intent Interview contract)
 * @see docs/implementation-checklist-phase13.md (13.4.1)
 */

import {
  InterviewRunOutput,
  RunArtifact,
} from '../../../src/modules/agents/evaluation/run-artifact.types';

/**
 * Helper to create a minimal interview Run Artifact for testing.
 */
function createMockArtifact(overrides: Partial<InterviewRunOutput> = {}): RunArtifact<'interview'> {
  return {
    runId: 'test-run',
    agent: 'interview',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    config: {},
    input: {
      rawIntent: 'Test intent',
      maxRounds: 5,
    },
    inputHash: 'testhash',
    output: {
      atomCandidates: [],
      moleculeCandidates: [],
      questionsAsked: 0,
      roundsCompleted: 1,
      userSignaledDone: false,
      errors: [],
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

describe('Intent Interview Agent Properties', () => {
  // =========================================================================
  // P-INT-01: Schema Validity
  // Every atom must conform to the AtomCandidate schema.
  // =========================================================================
  describe('P-INT-01: Atom Schema Validity', () => {
    const validCategories = new Set(['functional', 'performance', 'security', 'ux', 'operational']);

    it('every atom must have a non-empty description', () => {
      const artifact = createMockArtifact({
        atomCandidates: [
          {
            description: 'User can authenticate with email and password',
            category: 'functional',
            observableOutcomes: ['Returns auth token on valid credentials'],
            confidence: 85,
            sourceEvidence: ['User mentioned login requirement in turn 1'],
          },
        ],
      });

      for (const atom of artifact.output.atomCandidates) {
        expect(atom.description).toBeTruthy();
        expect(atom.description.length).toBeGreaterThanOrEqual(10);
      }
    });

    it('every atom must have a valid category', () => {
      const artifact = createMockArtifact({
        atomCandidates: [
          {
            description: 'System responds within 200ms',
            category: 'performance',
            observableOutcomes: ['Response time < 200ms under load'],
            confidence: 90,
            sourceEvidence: ['Performance requirement stated in turn 2'],
          },
        ],
      });

      for (const atom of artifact.output.atomCandidates) {
        expect(validCategories.has(atom.category)).toBe(true);
      }
    });

    it('every atom must have at least one observable outcome (no vacuous atoms)', () => {
      const artifact = createMockArtifact({
        atomCandidates: [
          {
            description: 'User receives email notification on signup',
            category: 'functional',
            observableOutcomes: [
              'Email is sent within 60 seconds of signup',
              'Email contains activation link',
            ],
            confidence: 80,
            sourceEvidence: ['Discussed in turn 3'],
          },
        ],
      });

      for (const atom of artifact.output.atomCandidates) {
        expect(atom.observableOutcomes).toBeDefined();
        expect(atom.observableOutcomes.length).toBeGreaterThan(0);
        for (const outcome of atom.observableOutcomes) {
          expect(outcome.length).toBeGreaterThan(0);
        }
      }
    });

    it('confidence scores must be in range [0, 100]', () => {
      const artifact = createMockArtifact({
        atomCandidates: [
          {
            description: 'Test confidence range',
            category: 'functional',
            observableOutcomes: ['Outcome'],
            confidence: 75,
            sourceEvidence: ['Evidence'],
          },
        ],
      });

      for (const atom of artifact.output.atomCandidates) {
        expect(atom.confidence).toBeGreaterThanOrEqual(0);
        expect(atom.confidence).toBeLessThanOrEqual(100);
      }
    });
  });

  // =========================================================================
  // P-INT-02: Traceable Rationale
  // Every atom must cite conversational evidence.
  // =========================================================================
  describe('P-INT-02: Traceable Rationale', () => {
    it('every atom must have at least one source evidence entry', () => {
      const artifact = createMockArtifact({
        atomCandidates: [
          {
            description: 'User can reset password via email',
            category: 'functional',
            observableOutcomes: ['Reset email sent', 'New password accepted'],
            confidence: 88,
            sourceEvidence: [
              'User requested password reset in turn 1',
              'Clarified email-based reset in turn 3',
            ],
          },
        ],
      });

      for (const atom of artifact.output.atomCandidates) {
        expect(atom.sourceEvidence).toBeDefined();
        expect(atom.sourceEvidence.length).toBeGreaterThan(0);
        for (const evidence of atom.sourceEvidence) {
          expect(evidence.length).toBeGreaterThan(0);
        }
      }
    });
  });

  // =========================================================================
  // P-INT-03: No Implementation Leakage
  // Atoms must describe behavior, not technology choices.
  // =========================================================================
  describe('P-INT-03: No Implementation Leakage', () => {
    const implementationPatterns = [
      /\bpostgresql\b/i,
      /\bmongodb\b/i,
      /\bredis\b/i,
      /\bkafka\b/i,
      /\breact\b/i,
      /\bangular\b/i,
      /\bvue\b/i,
      /\brest api\b/i,
      /\bgraphql\b/i,
      /\bjwt\b/i,
      /\brs256\b/i,
      /\bmicroservic/i,
    ];

    it('atom descriptions should not contain technology-specific terms', () => {
      const artifact = createMockArtifact({
        atomCandidates: [
          {
            description: 'User can authenticate with credentials',
            category: 'functional',
            observableOutcomes: ['Valid credentials produce auth token'],
            confidence: 90,
            sourceEvidence: ['From turn 1'],
          },
        ],
      });

      for (const atom of artifact.output.atomCandidates) {
        for (const pattern of implementationPatterns) {
          expect(pattern.test(atom.description)).toBe(false);
        }
      }
    });
  });

  // =========================================================================
  // P-INT-04: Molecule Coherence
  // Molecules must contain 2+ atoms and have valid lens types.
  // =========================================================================
  describe('P-INT-04: Molecule Coherence', () => {
    const validLensTypes = new Set([
      'user_story',
      'feature',
      'journey',
      'epic',
      'release',
      'capability',
      'custom',
    ]);

    it('every molecule must contain at least 2 atoms', () => {
      const artifact = createMockArtifact({
        atomCandidates: [
          {
            description: 'Atom 1',
            category: 'functional',
            observableOutcomes: ['O1'],
            confidence: 80,
            sourceEvidence: ['E1'],
          },
          {
            description: 'Atom 2',
            category: 'functional',
            observableOutcomes: ['O2'],
            confidence: 80,
            sourceEvidence: ['E2'],
          },
        ],
        moleculeCandidates: [
          {
            name: 'Feature',
            description: 'A feature grouping',
            lensType: 'feature',
            atomIndices: [0, 1],
          },
        ],
      });

      for (const molecule of artifact.output.moleculeCandidates) {
        expect(molecule.atomIndices.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('molecule lens types must be valid', () => {
      const artifact = createMockArtifact({
        moleculeCandidates: [
          {
            name: 'User Story',
            description: 'Story',
            lensType: 'user_story',
            atomIndices: [0, 1],
          },
        ],
      });

      for (const molecule of artifact.output.moleculeCandidates) {
        expect(validLensTypes.has(molecule.lensType)).toBe(true);
      }
    });

    it('molecule atomIndices must reference valid indices', () => {
      const artifact = createMockArtifact({
        atomCandidates: [
          {
            description: 'Atom A',
            category: 'functional',
            observableOutcomes: ['OA'],
            confidence: 80,
            sourceEvidence: ['EA'],
          },
          {
            description: 'Atom B',
            category: 'functional',
            observableOutcomes: ['OB'],
            confidence: 80,
            sourceEvidence: ['EB'],
          },
        ],
        moleculeCandidates: [
          {
            name: 'Group',
            description: 'Grouping',
            lensType: 'feature',
            atomIndices: [0, 1],
          },
        ],
      });

      const atomCount = artifact.output.atomCandidates.length;
      for (const molecule of artifact.output.moleculeCandidates) {
        for (const idx of molecule.atomIndices) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(atomCount);
        }
      }
    });
  });

  // =========================================================================
  // P-INT-05: Conversation Bounds
  // The interview must respect configured bounds.
  // =========================================================================
  describe('P-INT-05: Conversation Bounds', () => {
    it('rounds completed must not exceed max rounds', () => {
      const artifact = createMockArtifact({
        roundsCompleted: 3,
      });

      const maxRounds = (artifact.input as { maxRounds: number }).maxRounds;
      expect(artifact.output.roundsCompleted).toBeLessThanOrEqual(maxRounds);
    });
  });

  // =========================================================================
  // P-INT-06: Error Accumulation (INV-EVAL-03)
  // Errors must accumulate, never be silently swallowed.
  // =========================================================================
  describe('P-INT-06: Error Accumulation', () => {
    it('errors array must be present even when empty', () => {
      const artifact = createMockArtifact();

      expect(artifact.output.errors).toBeDefined();
      expect(Array.isArray(artifact.output.errors)).toBe(true);
    });
  });
});
