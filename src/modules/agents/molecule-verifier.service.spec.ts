/**
 * Molecule Verifier Service Tests
 *
 * Tests for molecule quality verification with INV-R004 guardrails.
 *
 * **INV-R004 Critical Tests**:
 * - Molecule failures MUST degrade to unnamed cluster, NOT rejection
 * - Output count MUST equal input count (no molecules lost)
 * - Atom confidence MUST NOT be affected by molecule verification
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  MoleculeVerifierService,
  MoleculeVerificationResult,
  BatchVerificationResult,
} from './molecule-verifier.service';
import { InferredAtom, InferredMolecule } from './graphs/types/reconciliation-state';

describe('MoleculeVerifierService', () => {
  let service: MoleculeVerifierService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MoleculeVerifierService],
    }).compile();

    service = module.get<MoleculeVerifierService>(MoleculeVerifierService);
  });

  // Helper to create test atoms
  function createTestAtom(overrides: Partial<InferredAtom> = {}): InferredAtom {
    return {
      tempId: `temp-atom-${Math.random().toString(36).substring(7)}`,
      description: 'User can authenticate with valid credentials',
      category: 'functional',
      sourceTest: {
        filePath: 'src/auth/auth.service.spec.ts',
        testName: 'should authenticate user',
        lineNumber: 42,
      },
      observableOutcomes: ['User receives access token', 'Session is created'],
      confidence: 85,
      reasoning: 'Clear authentication behavior',
      ...overrides,
    };
  }

  // Helper to create test molecules
  function createTestMolecule(
    atomTempIds: string[],
    overrides: Partial<InferredMolecule> = {},
  ): InferredMolecule {
    return {
      tempId: `temp-mol-${Math.random().toString(36).substring(7)}`,
      name: 'Authentication Functionality',
      description: 'Behaviors related to user authentication including login and session management',
      atomTempIds,
      confidence: 80,
      reasoning: 'Grouped by module: auth',
      ...overrides,
    };
  }

  describe('verifyMolecule', () => {
    it('should pass verification for a well-formed molecule', () => {
      const atoms = [
        createTestAtom({ tempId: 'atom-1' }),
        createTestAtom({ tempId: 'atom-2', description: 'User session expires after timeout' }),
      ];
      const molecule = createTestMolecule(['atom-1', 'atom-2']);

      const result = service.verifyMolecule(molecule, atoms);

      expect(result.passes).toBe(true);
      expect(result.completenessScore).toBeGreaterThanOrEqual(60);
      expect(result.fitScore).toBeGreaterThanOrEqual(60);
      expect(result.degradedMolecule).toBeUndefined();
    });

    it('should provide feedback for molecules with issues', () => {
      const atoms = [createTestAtom({ tempId: 'atom-1' })];
      const molecule = createTestMolecule(['atom-1'], {
        name: 'Misc',
        description: 'stuff',
      });

      const result = service.verifyMolecule(molecule, atoms);

      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    it('should recommend rename for generic names with good fit', () => {
      const atoms = [
        createTestAtom({ tempId: 'atom-1' }),
        createTestAtom({ tempId: 'atom-2' }),
      ];
      const molecule = createTestMolecule(['atom-1', 'atom-2'], {
        name: 'Unnamed Group',
      });

      const result = service.verifyMolecule(molecule, atoms);

      expect(result.recommendedAction).toBe('rename');
    });
  });

  describe('INV-R004: Molecule Lens Axiom', () => {
    /**
     * CRITICAL: Molecule failures MUST degrade to "unnamed cluster", NOT rejection
     */
    it('should degrade failed molecules to unnamed cluster, not reject them', () => {
      const atoms = [createTestAtom({ tempId: 'atom-1', confidence: 30 })];
      const molecule = createTestMolecule(['atom-1'], {
        name: 'x',
        description: 'x',
        confidence: 10,
      });

      const result = service.verifyMolecule(molecule, atoms, {
        minCompletenessScore: 80,
        minFitScore: 80,
      });

      // Should NOT pass verification
      expect(result.passes).toBe(false);

      // But MUST have degraded molecule, not rejection
      expect(result.degradedMolecule).toBeDefined();
      expect(result.degradedMolecule!.name).toBe('Unnamed Cluster');
      expect(result.degradedMolecule!.confidence).toBe(0);

      // Original molecule should still be preserved
      expect(result.molecule).toBe(molecule);
      expect(result.molecule.name).toBe('x');
    });

    /**
     * CRITICAL: Output count MUST equal input count
     */
    it('should never lose molecules - output count must equal input count', () => {
      const atoms = [
        createTestAtom({ tempId: 'atom-1' }),
        createTestAtom({ tempId: 'atom-2' }),
        createTestAtom({ tempId: 'atom-3' }),
      ];

      // Create some good and some bad molecules
      const molecules = [
        createTestMolecule(['atom-1']), // Good
        createTestMolecule(['atom-2'], { name: 'x', description: 'x' }), // Bad
        createTestMolecule(['atom-3'], { name: 'Misc', description: 'things' }), // Bad
      ];

      const result = service.verifyMolecules(molecules, atoms);

      // Output count MUST equal input count
      expect(result.outputMolecules.length).toBe(molecules.length);
      expect(result.totalMolecules).toBe(molecules.length);

      // Some may be degraded but none are lost
      expect(result.passedCount + result.degradedCount).toBe(molecules.length);
    });

    /**
     * CRITICAL: Atom confidence MUST NOT be affected by molecule verification
     */
    it('should not modify atom confidence during verification', () => {
      const originalConfidence = 85;
      const atoms = [
        createTestAtom({ tempId: 'atom-1', confidence: originalConfidence }),
      ];
      const molecule = createTestMolecule(['atom-1'], {
        name: 'x',
        description: 'x',
        confidence: 10,
      });

      // Verify with strict thresholds to force failure
      service.verifyMolecule(molecule, atoms, {
        minCompletenessScore: 95,
        minFitScore: 95,
      });

      // Atom confidence must be unchanged
      expect(atoms[0].confidence).toBe(originalConfidence);
    });

    /**
     * Explicit test: molecule failure does not prevent atom creation
     * (This is a design constraint - atoms exist independent of molecules)
     */
    it('should preserve all atom temp IDs in degraded molecules', () => {
      const atoms = [
        createTestAtom({ tempId: 'atom-1' }),
        createTestAtom({ tempId: 'atom-2' }),
      ];
      const molecule = createTestMolecule(['atom-1', 'atom-2'], {
        name: 'Bad',
        description: 'x',
      });

      const result = service.verifyMolecule(molecule, atoms, {
        minCompletenessScore: 95,
      });

      // Even degraded, all atom references must be preserved
      if (result.degradedMolecule) {
        expect(result.degradedMolecule.atomTempIds).toEqual(['atom-1', 'atom-2']);
      }
    });
  });

  describe('verifyMolecules (batch)', () => {
    it('should verify multiple molecules and return correct counts', () => {
      const atoms = [
        createTestAtom({ tempId: 'atom-1' }),
        createTestAtom({ tempId: 'atom-2' }),
        createTestAtom({ tempId: 'atom-3' }),
        createTestAtom({ tempId: 'atom-4' }),
      ];

      const molecules = [
        createTestMolecule(['atom-1', 'atom-2'], {
          name: 'Good Module',
          description: 'Well-formed molecule with clear purpose',
        }),
        createTestMolecule(['atom-3', 'atom-4'], {
          name: 'x',
          description: 'x',
        }),
      ];

      const result = service.verifyMolecules(molecules, atoms);

      expect(result.totalMolecules).toBe(2);
      expect(result.results.length).toBe(2);
      expect(result.outputMolecules.length).toBe(2);
    });

    it('should use degraded molecules in output when verification fails', () => {
      const atoms = [createTestAtom({ tempId: 'atom-1' })];
      const molecules = [
        createTestMolecule(['atom-1'], {
          name: 'Bad',
          description: 'x',
        }),
      ];

      const result = service.verifyMolecules(molecules, atoms, {
        minCompletenessScore: 95,
        minFitScore: 95,
      });

      expect(result.degradedCount).toBe(1);
      expect(result.outputMolecules[0].name).toBe('Unnamed Cluster');
    });
  });

  describe('recommended actions', () => {
    it('should recommend accept for high-quality molecules', () => {
      const atoms = [
        createTestAtom({ tempId: 'atom-1' }),
        createTestAtom({ tempId: 'atom-2' }),
        createTestAtom({ tempId: 'atom-3' }),
      ];
      const molecule = createTestMolecule(['atom-1', 'atom-2', 'atom-3'], {
        name: 'User Authentication',
        description: 'Comprehensive authentication behaviors including login, session, and token management',
      });

      const result = service.verifyMolecule(molecule, atoms);

      expect(result.recommendedAction).toBe('accept');
    });

    it('should recommend merge for molecules with too few atoms', () => {
      const atoms = [createTestAtom({ tempId: 'atom-1' })];
      const molecule = createTestMolecule(['atom-1'], {
        name: 'Single Atom Module',
        description: 'Just one thing',
      });

      const result = service.verifyMolecule(molecule, atoms, {
        minAtomsForCoherence: 2,
      });

      expect(result.recommendedAction).toBe('merge');
    });

    it('should recommend split for molecules with too many categories', () => {
      const atoms = [
        createTestAtom({ tempId: 'atom-1', category: 'functional' }),
        createTestAtom({ tempId: 'atom-2', category: 'security' }),
        createTestAtom({ tempId: 'atom-3', category: 'performance' }),
        createTestAtom({ tempId: 'atom-4', category: 'ux' }),
      ];
      const molecule = createTestMolecule(['atom-1', 'atom-2', 'atom-3', 'atom-4'], {
        name: 'Mixed Bag',
        description: 'Various unrelated behaviors grouped together',
      });

      const result = service.verifyMolecule(molecule, atoms);

      expect(result.recommendedAction).toBe('split');
    });
  });
});
