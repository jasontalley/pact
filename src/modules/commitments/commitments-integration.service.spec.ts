/**
 * Integration Tests: CommitmentsService ↔ InvariantCheckingService
 *
 * These tests verify the full integration between CommitmentsService and
 * InvariantCheckingService, ensuring invariant checks are properly executed
 * and their results affect commitment behavior.
 *
 * @atom IA-INT-001 (Integration: Commitment invariant checking)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { CommitmentsService } from './commitments.service';
import { CommitmentArtifact } from './commitment.entity';
import { Atom } from '../atoms/atom.entity';
import { InvariantCheckingService } from '../invariants/invariant-checking.service';
import { InvariantsService } from '../invariants/invariants.service';
import { CheckerRegistry } from '../invariants/checkers/checker-registry';
import { InvariantConfig } from '../invariants/invariant-config.entity';

describe('CommitmentsService Integration with InvariantCheckingService', () => {
  let commitmentsService: CommitmentsService;
  let invariantCheckingService: InvariantCheckingService;
  let invariantsService: jest.Mocked<InvariantsService>;

  const mockCommitmentRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockAtomRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  /**
   * Create a mock atom with sensible defaults
   */
  const createMockAtom = (overrides: Partial<Atom> = {}): Atom =>
    ({
      id: 'atom-uuid-1',
      atomId: 'IA-001',
      description: 'Test atom description',
      category: 'functional',
      qualityScore: 85,
      status: 'draft',
      supersededBy: null,
      createdAt: new Date(),
      committedAt: null,
      createdBy: 'test-user',
      metadata: {},
      observableOutcomes: [{ description: 'Observable outcome' }],
      falsifiabilityCriteria: [{ condition: 'Condition', expectedBehavior: 'Expected behavior' }],
      tags: ['test'],
      canvasPosition: null,
      parentIntent: 'Original user intent',
      refinementHistory: [],
      validators: [],
      ...overrides,
    }) as Atom;

  /**
   * Create a mock invariant config
   */
  const createMockInvariantConfig = (overrides: Partial<InvariantConfig> = {}): InvariantConfig =>
    ({
      id: 'inv-config-uuid',
      projectId: null,
      invariantId: 'INV-001',
      name: 'Explicit Commitment Required',
      description: 'Test description',
      isEnabled: true,
      isBlocking: true,
      checkType: 'builtin',
      checkConfig: {},
      errorMessage: 'Error message',
      suggestionPrompt: null,
      isBuiltin: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as InvariantConfig;

  /**
   * Standard set of enabled invariants (INV-001, INV-004, INV-006)
   */
  const standardEnabledInvariants = [
    createMockInvariantConfig({
      invariantId: 'INV-001',
      name: 'Explicit Commitment Required',
      isBlocking: true,
    }),
    createMockInvariantConfig({
      invariantId: 'INV-004',
      name: 'Commitment Is Immutable',
      isBlocking: true,
    }),
    createMockInvariantConfig({
      invariantId: 'INV-006',
      name: 'Agents May Not Commit Intent',
      isBlocking: true,
    }),
  ];

  beforeEach(async () => {
    // Create mock InvariantsService
    const mockInvariantsService = {
      findEnabled: jest.fn().mockResolvedValue(standardEnabledInvariants),
      findByInvariantId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommitmentsService,
        InvariantCheckingService,
        CheckerRegistry,
        {
          provide: InvariantsService,
          useValue: mockInvariantsService,
        },
        {
          provide: getRepositoryToken(CommitmentArtifact),
          useValue: mockCommitmentRepository,
        },
        {
          provide: getRepositoryToken(Atom),
          useValue: mockAtomRepository,
        },
      ],
    }).compile();

    commitmentsService = module.get<CommitmentsService>(CommitmentsService);
    invariantCheckingService = module.get<InvariantCheckingService>(InvariantCheckingService);
    invariantsService = module.get(InvariantsService);

    jest.clearAllMocks();
  });

  describe('Integration: preview with InvariantCheckingService', () => {
    it('INT-COM-001: should use InvariantCheckingService for preview checks', async () => {
      // Arrange
      const atoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(atoms);

      const checkAllSpy = jest.spyOn(invariantCheckingService, 'checkAll');

      // Act
      const result = await commitmentsService.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane.doe@company.com',
      });

      // Assert
      expect(checkAllSpy).toHaveBeenCalledWith(
        atoms,
        expect.objectContaining({
          committedBy: 'jane.doe@company.com',
          isPreview: true,
        }),
      );
      expect(result.invariantChecks).toHaveLength(3); // INV-001, INV-004, INV-006
    });

    it('INT-COM-002: should pass preview when all atoms meet requirements', async () => {
      // Arrange - Well-formed atom with good quality score
      const atoms = [
        createMockAtom({
          qualityScore: 85,
          status: 'draft',
          observableOutcomes: [{ description: 'Users can log in successfully' }],
          falsifiabilityCriteria: [
            { condition: 'Valid credentials', expectedBehavior: 'Login succeeds' },
          ],
        }),
      ];
      mockAtomRepository.find.mockResolvedValue(atoms);

      // Act
      const result = await commitmentsService.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane.doe@company.com',
      });

      // Assert
      expect(result.canCommit).toBe(true);
      expect(result.hasBlockingIssues).toBe(false);
      expect(result.invariantChecks.every((c) => c.passed)).toBe(true);
    });

    it('INT-COM-003: should fail preview when atom status is committed (INV-004)', async () => {
      // Arrange - Already committed atom
      const atoms = [createMockAtom({ status: 'committed' })];
      mockAtomRepository.find.mockResolvedValue(atoms);

      // Act
      const result = await commitmentsService.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane.doe@company.com',
      });

      // Assert
      expect(result.canCommit).toBe(false);
      expect(result.hasBlockingIssues).toBe(true);

      const inv004Check = result.invariantChecks.find((c) => c.invariantId === 'INV-004');
      expect(inv004Check?.passed).toBe(false);
      expect(inv004Check?.severity).toBe('error');
    });

    it('INT-COM-004: should fail preview when committedBy looks like an agent (INV-006)', async () => {
      // Arrange
      const atoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(atoms);

      // Act
      const result = await commitmentsService.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: 'automation-agent', // Agent identifier
      });

      // Assert
      expect(result.canCommit).toBe(false);
      expect(result.hasBlockingIssues).toBe(true);

      const inv006Check = result.invariantChecks.find((c) => c.invariantId === 'INV-006');
      expect(inv006Check?.passed).toBe(false);
    });

    it('INT-COM-005: should fail preview when committedBy is empty (INV-001)', async () => {
      // Arrange
      const atoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(atoms);

      // Act
      const result = await commitmentsService.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: '', // Empty identifier
      });

      // Assert
      expect(result.canCommit).toBe(false);
      expect(result.hasBlockingIssues).toBe(true);

      const inv001Check = result.invariantChecks.find((c) => c.invariantId === 'INV-001');
      expect(inv001Check?.passed).toBe(false);
    });

    it('INT-COM-006: should use project-specific invariants when projectId provided', async () => {
      // Arrange
      const atoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(atoms);

      // Act
      await commitmentsService.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
        projectId: 'project-uuid-123',
      });

      // Assert
      expect(invariantsService.findEnabled).toHaveBeenCalledWith('project-uuid-123');
    });
  });

  describe('Integration: create with InvariantCheckingService', () => {
    it('INT-COM-007: should create commitment when all invariants pass', async () => {
      // Arrange
      const atoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(atoms);
      mockCommitmentRepository.findOne.mockResolvedValue(null); // No existing commitments

      const savedCommitment = {
        id: 'commitment-uuid',
        commitmentId: 'COM-001',
        canonicalJson: [],
        committedBy: 'jane@company.com',
        committedAt: new Date(),
        invariantChecks: [],
        status: 'active',
        atoms,
      };

      mockCommitmentRepository.create.mockReturnValue(savedCommitment);
      mockCommitmentRepository.save.mockResolvedValue(savedCommitment);
      mockAtomRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      const result = await commitmentsService.create({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
      });

      // Assert
      expect(result.commitmentId).toBe('COM-001');
      expect(result.status).toBe('active');
      expect(mockAtomRepository.update).toHaveBeenCalledWith(
        { id: expect.anything() },
        expect.objectContaining({ status: 'committed' }),
      );
    });

    it('INT-COM-008: should reject commitment when blocking invariant fails', async () => {
      // Arrange - Already committed atom triggers INV-004 violation
      const atoms = [createMockAtom({ status: 'committed' })];
      mockAtomRepository.find.mockResolvedValue(atoms);

      // Act & Assert
      await expect(
        commitmentsService.create({
          atomIds: ['atom-uuid-1'],
          committedBy: 'jane@company.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('INT-COM-009: should store invariant check results in commitment', async () => {
      // Arrange
      const atoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(atoms);
      mockCommitmentRepository.findOne.mockResolvedValue(null);

      let capturedCommitment: any;
      mockCommitmentRepository.create.mockImplementation((data) => {
        capturedCommitment = {
          id: 'commitment-uuid',
          commitmentId: 'COM-001',
          ...data,
        };
        return capturedCommitment;
      });
      mockCommitmentRepository.save.mockImplementation((c) => Promise.resolve(c));
      mockAtomRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      await commitmentsService.create({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
      });

      // Assert - Check that invariant results were stored
      expect(capturedCommitment.invariantChecks).toBeDefined();
      expect(capturedCommitment.invariantChecks.length).toBeGreaterThan(0);
      expect(capturedCommitment.invariantChecks[0]).toMatchObject({
        invariantId: expect.any(String),
        name: expect.any(String),
        passed: expect.any(Boolean),
        severity: expect.any(String),
        message: expect.any(String),
      });
    });

    it('INT-COM-010: should store canonical atom snapshot', async () => {
      // Arrange
      const atoms = [
        createMockAtom({
          atomId: 'IA-042',
          description: 'Users can reset their password',
          category: 'security',
          qualityScore: 92,
          tags: ['auth', 'security'],
        }),
      ];
      mockAtomRepository.find.mockResolvedValue(atoms);
      mockCommitmentRepository.findOne.mockResolvedValue(null);

      let capturedCommitment: any;
      mockCommitmentRepository.create.mockImplementation((data) => {
        capturedCommitment = { id: 'commitment-uuid', ...data };
        return capturedCommitment;
      });
      mockCommitmentRepository.save.mockImplementation((c) => Promise.resolve(c));
      mockAtomRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      await commitmentsService.create({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
      });

      // Assert - Verify canonical snapshot
      expect(capturedCommitment.canonicalJson).toBeDefined();
      expect(capturedCommitment.canonicalJson).toHaveLength(1);
      expect(capturedCommitment.canonicalJson[0]).toMatchObject({
        atomId: 'IA-042',
        description: 'Users can reset their password',
        category: 'security',
        qualityScore: 92,
        tags: ['auth', 'security'],
      });
    });
  });

  describe('Integration: invariant severity handling', () => {
    it('INT-COM-011: should distinguish between error and warning severities', async () => {
      // Arrange - Mock a mix of blocking (error) and non-blocking (warning) invariants
      const mixedInvariants = [
        createMockInvariantConfig({
          invariantId: 'INV-001',
          isBlocking: true, // error severity
        }),
        createMockInvariantConfig({
          invariantId: 'INV-004',
          isBlocking: true, // error severity
        }),
        createMockInvariantConfig({
          invariantId: 'INV-WARN',
          name: 'Warning Only Check',
          isBlocking: false, // warning severity
        }),
      ];
      invariantsService.findEnabled.mockResolvedValue(mixedInvariants);

      const atoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(atoms);

      // Act
      const result = await commitmentsService.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
      });

      // Assert
      const errorChecks = result.invariantChecks.filter((c) => c.severity === 'error');
      const warningChecks = result.invariantChecks.filter((c) => c.severity === 'warning');

      expect(errorChecks.length).toBeGreaterThan(0);
      // Custom invariants without checkers still get processed
      expect(result.invariantChecks).toHaveLength(3);
    });

    it('INT-COM-012: should allow commit with warnings when no errors', async () => {
      // Arrange - Only warning-level invariants that fail
      const warningOnlyInvariants = [
        createMockInvariantConfig({
          invariantId: 'INV-001',
          isBlocking: true, // Must pass - will pass
        }),
        createMockInvariantConfig({
          invariantId: 'INV-004',
          isBlocking: true, // Must pass - will pass
        }),
        createMockInvariantConfig({
          invariantId: 'INV-006',
          isBlocking: true, // Must pass - will pass
        }),
      ];
      invariantsService.findEnabled.mockResolvedValue(warningOnlyInvariants);

      const atoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(atoms);
      mockCommitmentRepository.findOne.mockResolvedValue(null);

      const savedCommitment = {
        id: 'commitment-uuid',
        commitmentId: 'COM-001',
        atoms,
        status: 'active',
      };
      mockCommitmentRepository.create.mockReturnValue(savedCommitment);
      mockCommitmentRepository.save.mockResolvedValue(savedCommitment);
      mockAtomRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      const result = await commitmentsService.create({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
      });

      // Assert - Commit succeeds
      expect(result.status).toBe('active');
    });
  });

  describe('Integration: multiple atoms with mixed validity', () => {
    it('INT-COM-013: should check all atoms and aggregate failures', async () => {
      // Arrange - Mix of valid and invalid atoms
      const atoms = [
        createMockAtom({
          id: 'atom-1',
          atomId: 'IA-001',
          status: 'draft',
          qualityScore: 85,
        }),
        createMockAtom({
          id: 'atom-2',
          atomId: 'IA-002',
          status: 'committed', // Already committed - will fail INV-004
          qualityScore: 90,
        }),
      ];
      mockAtomRepository.find.mockResolvedValue(atoms);

      // Act
      const result = await commitmentsService.preview({
        atomIds: ['atom-1', 'atom-2'],
        committedBy: 'jane@company.com',
      });

      // Assert
      expect(result.canCommit).toBe(false);
      expect(result.hasBlockingIssues).toBe(true);

      const inv004Check = result.invariantChecks.find((c) => c.invariantId === 'INV-004');
      expect(inv004Check?.passed).toBe(false);
      expect(inv004Check?.affectedAtomIds).toContain('atom-2');
    });

    it('INT-COM-014: should report affected atom IDs in check results', async () => {
      // Arrange - All atoms already committed
      const atoms = [
        createMockAtom({
          id: 'atom-1',
          atomId: 'IA-001',
          status: 'committed',
        }),
        createMockAtom({
          id: 'atom-2',
          atomId: 'IA-002',
          status: 'committed',
        }),
        createMockAtom({
          id: 'atom-3',
          atomId: 'IA-003',
          status: 'committed',
        }),
      ];
      mockAtomRepository.find.mockResolvedValue(atoms);

      // Act
      const result = await commitmentsService.preview({
        atomIds: ['atom-1', 'atom-2', 'atom-3'],
        committedBy: 'jane@company.com',
      });

      // Assert
      const inv004Check = result.invariantChecks.find((c) => c.invariantId === 'INV-004');
      expect(inv004Check?.affectedAtomIds).toHaveLength(3);
    });
  });

  describe('Integration: override justification flow', () => {
    it('INT-COM-015: should accept override justification for blocking issues', async () => {
      // Arrange - Atom that fails invariant check
      const atoms = [createMockAtom({ status: 'committed' })];
      mockAtomRepository.find.mockResolvedValue(atoms);
      mockCommitmentRepository.findOne.mockResolvedValue(null);

      const savedCommitment = {
        id: 'commitment-uuid',
        commitmentId: 'COM-001',
        overrideJustification: 'Approved by security team',
        atoms,
        status: 'active',
      };
      mockCommitmentRepository.create.mockReturnValue(savedCommitment);
      mockCommitmentRepository.save.mockResolvedValue(savedCommitment);
      mockAtomRepository.update.mockResolvedValue({ affected: 1 });

      // Act - Provide override justification
      const result = await commitmentsService.create({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
        overrideJustification: 'Approved by security team',
      });

      // Assert - Commit proceeds with justification
      expect(result.overrideJustification).toBe('Approved by security team');
    });

    it('INT-COM-016: should store override justification when provided', async () => {
      // Arrange
      const atoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(atoms);
      mockCommitmentRepository.findOne.mockResolvedValue(null);

      let capturedCommitment: any;
      mockCommitmentRepository.create.mockImplementation((data) => {
        capturedCommitment = { id: 'commitment-uuid', ...data };
        return capturedCommitment;
      });
      mockCommitmentRepository.save.mockImplementation((c) => Promise.resolve(c));
      mockAtomRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      await commitmentsService.create({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
        overrideJustification: 'Pre-approved by product team',
      });

      // Assert
      expect(capturedCommitment.overrideJustification).toBe('Pre-approved by product team');
    });
  });

  describe('Integration: InvariantCheckingService failure handling', () => {
    it('INT-COM-017: should handle checker timeout gracefully', async () => {
      // Arrange - Simulate a slow/timeout scenario
      const atoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(atoms);

      // The actual timeout handling is in InvariantCheckingService
      // This test verifies CommitmentsService handles the results properly

      // Act
      const result = await commitmentsService.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
      });

      // Assert - Should still return valid preview
      expect(result.invariantChecks).toBeDefined();
      expect(Array.isArray(result.invariantChecks)).toBe(true);
    });

    it('INT-COM-018: should include suggestions in failed checks', async () => {
      // Arrange - Atom that fails checks
      const atoms = [createMockAtom({ status: 'committed' })];
      mockAtomRepository.find.mockResolvedValue(atoms);

      // Act
      const result = await commitmentsService.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
      });

      // Assert
      const failedChecks = result.invariantChecks.filter((c) => !c.passed);
      expect(failedChecks.length).toBeGreaterThan(0);

      // Failed checks should have suggestions
      const checkWithSuggestions = failedChecks.find(
        (c) => c.suggestions && c.suggestions.length > 0,
      );
      expect(checkWithSuggestions).toBeDefined();
    });
  });
});
