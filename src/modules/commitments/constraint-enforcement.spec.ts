/**
 * Constraint Enforcement Tests for Commitments Module
 *
 * This file tests constraint enforcement at multiple levels:
 * 1. Service-level validation (tested here)
 * 2. Database-level triggers (tested in E2E tests with PostgreSQL)
 *
 * The database triggers (INV-004) are defined in:
 * - src/migrations/1737590400000-AddImmutabilityConstraints.ts
 *
 * Database-level constraints that require E2E tests:
 * - atom_immutability_trigger: Prevents updates to committed atoms
 * - atom_committed_at_trigger: Prevents changes to committedAt timestamp
 * - atom_status_regression_trigger: Prevents status regression (committed→draft)
 * - atom_deletion_trigger: Prevents deletion of committed/superseded atoms
 * - commitment_immutability_trigger: Prevents changes to canonicalJson
 * - commitment_metadata_trigger: Prevents changes to committedBy, committedAt, commitmentId
 * - commitment_deletion_trigger: Prevents deletion of commitments
 *
 * @atom IA-PHASE3-CONSTRAINT Commitment boundary constraint enforcement
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CommitmentsService } from './commitments.service';
import { CommitmentArtifact } from './commitment.entity';
import { Atom } from '../atoms/atom.entity';

describe('Commitment Constraint Enforcement', () => {
  let service: CommitmentsService;

  const mockCommitmentRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockAtomRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    save: jest.fn(),
  };

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
      observableOutcomes: [{ description: 'Observable' }],
      falsifiabilityCriteria: [{ condition: 'Cond', expectedBehavior: 'Exp' }],
      tags: ['test'],
      canvasPosition: null,
      parentIntent: 'User intent',
      refinementHistory: [],
      validators: [],
      ...overrides,
    }) as Atom;

  const createMockCommitment = (overrides: Partial<CommitmentArtifact> = {}): CommitmentArtifact =>
    ({
      id: 'commitment-uuid-1',
      commitmentId: 'COM-001',
      projectId: null,
      moleculeId: null,
      canonicalJson: [
        {
          atomId: 'IA-001',
          description: 'Test atom',
          category: 'functional',
          qualityScore: 85,
          observableOutcomes: [],
          falsifiabilityCriteria: [],
          tags: [],
        },
      ],
      committedBy: 'jane@company.com',
      committedAt: new Date(),
      invariantChecks: [],
      overrideJustification: null,
      supersedes: null,
      supersededBy: null,
      status: 'active',
      metadata: {},
      project: null,
      molecule: null,
      atoms: [],
      ...overrides,
    }) as CommitmentArtifact;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommitmentsService,
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

    service = module.get<CommitmentsService>(CommitmentsService);
    jest.clearAllMocks();
  });

  describe('INV-001: Explicit Commitment Required', () => {
    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Commitments must have an explicit human identifier (committedBy)
     */
    it('CON-001: should reject commitment without committedBy identifier', async () => {
      const atoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(atoms);

      const result = await service.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: '', // Empty identifier
      });

      expect(result.canCommit).toBe(false);
      expect(result.hasBlockingIssues).toBe(true);

      const inv001Check = result.invariantChecks.find((c) => c.invariantId === 'INV-001');
      expect(inv001Check?.passed).toBe(false);
    });

    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Commitments must have an explicit human identifier
     */
    it('CON-002: should reject commitment with whitespace-only committedBy', async () => {
      const atoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(atoms);

      const result = await service.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: '   ', // Whitespace only
      });

      expect(result.canCommit).toBe(false);
      expect(result.hasBlockingIssues).toBe(true);
    });
  });

  describe('INV-004: Commitment Is Immutable', () => {
    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Service-level check: Cannot include already committed atoms
     */
    it('CON-003: should reject commitment containing already committed atoms', async () => {
      const atoms = [createMockAtom({ status: 'committed' })];
      mockAtomRepository.find.mockResolvedValue(atoms);

      const result = await service.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
      });

      expect(result.canCommit).toBe(false);
      expect(result.hasBlockingIssues).toBe(true);

      const inv004Check = result.invariantChecks.find((c) => c.invariantId === 'INV-004');
      expect(inv004Check?.passed).toBe(false);
      expect(inv004Check?.message).toContain('already committed');
    });

    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Service-level check: Cannot include superseded atoms
     */
    it('CON-004: should reject commitment containing superseded atoms', async () => {
      const atoms = [createMockAtom({ status: 'superseded' })];
      mockAtomRepository.find.mockResolvedValue(atoms);

      const result = await service.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
      });

      expect(result.canCommit).toBe(false);
      expect(result.hasBlockingIssues).toBe(true);
    });

    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Service-level check: Only draft atoms can be committed
     */
    it('CON-005: should accept commitment with draft atoms only', async () => {
      const atoms = [createMockAtom({ status: 'draft' })];
      mockAtomRepository.find.mockResolvedValue(atoms);

      const result = await service.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
      });

      expect(result.canCommit).toBe(true);
      expect(result.hasBlockingIssues).toBe(false);

      const inv004Check = result.invariantChecks.find((c) => c.invariantId === 'INV-004');
      expect(inv004Check?.passed).toBe(true);
    });

    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Service-level check: Mixed draft and committed atoms should fail
     */
    it('CON-006: should reject commitment with mixed draft/committed atoms', async () => {
      const atoms = [
        createMockAtom({ id: 'atom-1', status: 'draft' }),
        createMockAtom({ id: 'atom-2', status: 'committed' }),
      ];
      mockAtomRepository.find.mockResolvedValue(atoms);

      const result = await service.preview({
        atomIds: ['atom-1', 'atom-2'],
        committedBy: 'jane@company.com',
      });

      expect(result.canCommit).toBe(false);

      const inv004Check = result.invariantChecks.find((c) => c.invariantId === 'INV-004');
      expect(inv004Check?.affectedAtomIds).toContain('atom-2');
      expect(inv004Check?.affectedAtomIds).not.toContain('atom-1');
    });
  });

  describe('INV-006: Agents May Not Commit Intent', () => {
    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Commitments must be from humans, not agents
     */
    it('CON-007: should reject commitment from agent identifier', async () => {
      const atoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(atoms);

      const result = await service.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: 'automation-agent',
      });

      expect(result.canCommit).toBe(false);
      expect(result.hasBlockingIssues).toBe(true);

      const inv006Check = result.invariantChecks.find((c) => c.invariantId === 'INV-006');
      expect(inv006Check?.passed).toBe(false);
    });

    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Various agent-like identifiers should be rejected
     */
    it.each([
      ['automation-agent', 'agent identifier'],
      ['ci-bot', 'bot identifier'],
      ['system-user', 'system identifier'],
      ['deploy-agent', 'agent identifier'],
      ['github-bot', 'bot identifier'],
    ])('CON-008: should reject "%s" (%s)', async (committedBy) => {
      const atoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(atoms);

      const result = await service.preview({
        atomIds: ['atom-uuid-1'],
        committedBy,
      });

      const inv006Check = result.invariantChecks.find((c) => c.invariantId === 'INV-006');
      expect(inv006Check?.passed).toBe(false);
    });

    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Human-like identifiers should be accepted
     */
    it.each([
      ['jane.doe@company.com', 'email address'],
      ['John Smith', 'full name'],
      ['jsmith', 'username'],
      ['Jane_Doe_123', 'underscore username'],
    ])('CON-009: should accept "%s" (%s)', async (committedBy) => {
      const atoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(atoms);

      const result = await service.preview({
        atomIds: ['atom-uuid-1'],
        committedBy,
      });

      const inv006Check = result.invariantChecks.find((c) => c.invariantId === 'INV-006');
      expect(inv006Check?.passed).toBe(true);
    });
  });

  describe('Supersession Constraints', () => {
    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Cannot supersede an already superseded commitment
     */
    it('CON-010: should reject supersession of already superseded commitment', async () => {
      const supersededCommitment = createMockCommitment({
        status: 'superseded',
        supersededBy: 'another-uuid',
      });

      mockCommitmentRepository.findOne.mockResolvedValue(supersededCommitment);

      await expect(
        service.supersede('commitment-uuid-1', {
          atomIds: ['atom-uuid-1'],
          committedBy: 'jane@company.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Active commitments can be superseded
     */
    it('CON-011: should allow supersession of active commitment', async () => {
      const activeCommitment = createMockCommitment({
        status: 'active',
        supersededBy: null,
      });
      const newAtoms = [createMockAtom({ id: 'new-atom', atomId: 'IA-002' })];

      mockCommitmentRepository.findOne
        .mockResolvedValueOnce(activeCommitment) // findOne for supersede
        .mockResolvedValueOnce(null); // generateCommitmentId

      mockAtomRepository.find.mockResolvedValue(newAtoms);

      const newCommitment = createMockCommitment({
        id: 'new-commitment-uuid',
        commitmentId: 'COM-002',
        supersedes: 'commitment-uuid-1',
      });

      mockCommitmentRepository.create.mockReturnValue(newCommitment);
      mockCommitmentRepository.save.mockResolvedValue(newCommitment);
      mockAtomRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.supersede('commitment-uuid-1', {
        atomIds: ['new-atom'],
        committedBy: 'jane@company.com',
      });

      expect(result.supersedes).toBe('commitment-uuid-1');
    });

    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Supersession must record the reason if provided
     */
    it('CON-012: should store supersession reason in metadata', async () => {
      const activeCommitment = createMockCommitment({
        status: 'active',
      });
      const newAtoms = [createMockAtom()];

      mockCommitmentRepository.findOne
        .mockResolvedValueOnce(activeCommitment)
        .mockResolvedValueOnce(null);

      mockAtomRepository.find.mockResolvedValue(newAtoms);

      // Track all save calls to find the one with supersessionReason
      const savedCommitments: any[] = [];
      mockCommitmentRepository.create.mockImplementation((data) => {
        return { id: 'new-uuid', commitmentId: 'COM-002', metadata: {}, ...data };
      });
      mockCommitmentRepository.save.mockImplementation((c) => {
        savedCommitments.push({ ...c });
        return Promise.resolve({ ...c });
      });
      mockAtomRepository.update.mockResolvedValue({ affected: 1 });

      await service.supersede('commitment-uuid-1', {
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
        reason: 'Updated security requirements',
      });

      // The supersede method saves 3 times:
      // 1. create() saves the new commitment
      // 2. supersede() saves again with supersession metadata
      // 3. supersede() saves the original with supersededBy
      // Find the save that contains supersessionReason
      const commitmentWithReason = savedCommitments.find((c) => c.metadata?.supersessionReason);
      expect(commitmentWithReason).toBeDefined();
      expect(commitmentWithReason.metadata.supersessionReason).toBe(
        'Updated security requirements',
      );
    });
  });

  describe('Atom Existence Constraints', () => {
    /**
     * @atom IA-PHASE3-CONSTRAINT
     * All referenced atoms must exist
     */
    it('CON-013: should reject commitment with non-existent atom IDs', async () => {
      mockAtomRepository.find.mockResolvedValue([]); // No atoms found

      await expect(
        service.preview({
          atomIds: ['non-existent-uuid'],
          committedBy: 'jane@company.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Should report which specific atoms were not found
     */
    it('CON-014: should report missing atom IDs in error message', async () => {
      const existingAtom = createMockAtom({ id: 'existing-uuid' });
      mockAtomRepository.find.mockResolvedValue([existingAtom]);

      try {
        await service.preview({
          atomIds: ['existing-uuid', 'missing-uuid-1', 'missing-uuid-2'],
          committedBy: 'jane@company.com',
        });
        fail('Should have thrown BadRequestException');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).toContain('missing-uuid-1');
        expect(error.message).toContain('missing-uuid-2');
      }
    });
  });

  describe('Quality Score Constraints (INV-002)', () => {
    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Atoms with low quality scores should fail INV-002
     */
    it('CON-015: should flag atoms with quality score below 60', async () => {
      const atoms = [createMockAtom({ qualityScore: 50 })];
      mockAtomRepository.find.mockResolvedValue(atoms);

      const result = await service.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
      });

      expect(result.canCommit).toBe(false);

      const inv002Check = result.invariantChecks.find((c) => c.invariantId === 'INV-002');
      expect(inv002Check?.passed).toBe(false);
    });

    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Atoms with quality score >= 60 should pass INV-002
     */
    it('CON-016: should accept atoms with quality score >= 60', async () => {
      const atoms = [createMockAtom({ qualityScore: 60 })];
      mockAtomRepository.find.mockResolvedValue(atoms);

      const result = await service.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
      });

      const inv002Check = result.invariantChecks.find((c) => c.invariantId === 'INV-002');
      expect(inv002Check?.passed).toBe(true);
    });

    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Atoms with null quality score should pass INV-002 (not yet evaluated)
     */
    it('CON-017: should accept atoms with null quality score', async () => {
      const atoms = [createMockAtom({ qualityScore: null })];
      mockAtomRepository.find.mockResolvedValue(atoms);

      const result = await service.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
      });

      const inv002Check = result.invariantChecks.find((c) => c.invariantId === 'INV-002');
      expect(inv002Check?.passed).toBe(true);
    });
  });

  describe('Override Justification Constraints', () => {
    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Blocking issues without override should prevent commitment
     */
    it('CON-018: should reject create when blocking issues exist without override', async () => {
      const atoms = [createMockAtom({ status: 'committed' })]; // Will fail INV-004
      mockAtomRepository.find.mockResolvedValue(atoms);

      await expect(
        service.create({
          atomIds: ['atom-uuid-1'],
          committedBy: 'jane@company.com',
          // No overrideJustification
        }),
      ).rejects.toThrow(BadRequestException);
    });

    /**
     * @atom IA-PHASE3-CONSTRAINT
     * Override justification allows commitment despite blocking issues
     */
    it('CON-019: should allow create with override justification', async () => {
      const atoms = [createMockAtom({ status: 'committed' })]; // Will fail INV-004
      mockAtomRepository.find.mockResolvedValue(atoms);
      mockCommitmentRepository.findOne.mockResolvedValue(null);

      const savedCommitment = createMockCommitment({
        overrideJustification: 'Approved by security team',
      });
      mockCommitmentRepository.create.mockReturnValue(savedCommitment);
      mockCommitmentRepository.save.mockResolvedValue(savedCommitment);
      mockAtomRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.create({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
        overrideJustification: 'Approved by security team',
      });

      expect(result.overrideJustification).toBe('Approved by security team');
    });
  });
});

/**
 * Database-Level Constraint Tests
 *
 * The following constraints are enforced at the database level via triggers
 * and can only be tested in E2E tests with a PostgreSQL database:
 *
 * 1. atom_immutability_trigger
 *    - Prevents updates to committed atoms (except status → superseded)
 *    - Tests in: test/atoms-crud.e2e-spec.ts
 *
 * 2. atom_committed_at_trigger
 *    - Prevents changes to committedAt timestamp once set
 *    - Tests in: test/atoms-crud.e2e-spec.ts
 *
 * 3. atom_status_regression_trigger
 *    - Prevents status changes: committed→draft, superseded→draft, superseded→committed
 *    - Tests in: test/atoms-crud.e2e-spec.ts
 *
 * 4. atom_deletion_trigger
 *    - Prevents deletion of committed and superseded atoms
 *    - Tests in: test/atoms-crud.e2e-spec.ts
 *
 * 5. commitment_immutability_trigger
 *    - Prevents changes to canonicalJson after creation
 *    - Tests in: test/commitments.e2e-spec.ts
 *
 * 6. commitment_metadata_trigger
 *    - Prevents changes to committedBy, committedAt, commitmentId
 *    - Tests in: test/commitments.e2e-spec.ts
 *
 * 7. commitment_deletion_trigger
 *    - Prevents deletion of commitment records
 *    - Tests in: test/commitments.e2e-spec.ts
 */
