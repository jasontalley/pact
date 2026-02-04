import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CommitmentsService } from './commitments.service';
import { CommitmentArtifact } from './commitment.entity';
import { Atom } from '../atoms/atom.entity';
import { InvariantCheckResultDto } from '../invariants/dto/invariant-check-result.dto';

describe('CommitmentsService', () => {
  let service: CommitmentsService;

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

  const createMockAtom = (overrides: Partial<Atom> = {}): Atom => ({
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
    observableOutcomes: [],
    falsifiabilityCriteria: [],
    tags: ['test'],
    canvasPosition: null,
    parentIntent: null,
    refinementHistory: [],
    intentIdentity: null,
    intentVersion: 1,
    validators: [],
    ...overrides,
  });

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

  describe('service instantiation', () => {
    it('should be instantiated by NestJS dependency injection', () => {
      expect(service).toBeDefined();
      expect(service).not.toBeNull();
      expect(service).toBeInstanceOf(CommitmentsService);
    });
  });

  describe('preview', () => {
    it('should return preview with all atoms passing checks', async () => {
      const mockAtoms = [
        createMockAtom({ id: 'uuid-1', atomId: 'IA-001', qualityScore: 85 }),
        createMockAtom({ id: 'uuid-2', atomId: 'IA-002', qualityScore: 90 }),
      ];

      mockAtomRepository.find.mockResolvedValue(mockAtoms);

      const result = await service.preview({
        atomIds: ['uuid-1', 'uuid-2'],
        committedBy: 'jane.doe@company.com',
      });

      expect(result.canCommit).toBe(true);
      expect(result.hasBlockingIssues).toBe(false);
      expect(result.atomCount).toBe(2);
      expect(result.atoms).toHaveLength(2);
      expect(result.invariantChecks).toBeDefined();
    });

    it('should flag atoms with low quality scores', async () => {
      const mockAtoms = [
        createMockAtom({ id: 'uuid-1', atomId: 'IA-001', qualityScore: 50 }), // Below 60
      ];

      mockAtomRepository.find.mockResolvedValue(mockAtoms);

      const result = await service.preview({
        atomIds: ['uuid-1'],
        committedBy: 'jane.doe@company.com',
      });

      expect(result.hasBlockingIssues).toBe(true);
      expect(result.canCommit).toBe(false);

      const qualityCheck = result.invariantChecks.find(
        (c: InvariantCheckResultDto) => c.invariantId === 'INV-002',
      );
      expect(qualityCheck?.passed).toBe(false);
    });

    it('should flag already committed atoms', async () => {
      const mockAtoms = [createMockAtom({ id: 'uuid-1', atomId: 'IA-001', status: 'committed' })];

      mockAtomRepository.find.mockResolvedValue(mockAtoms);

      const result = await service.preview({
        atomIds: ['uuid-1'],
        committedBy: 'jane.doe@company.com',
      });

      expect(result.hasBlockingIssues).toBe(true);

      const immutabilityCheck = result.invariantChecks.find(
        (c: InvariantCheckResultDto) => c.invariantId === 'INV-004',
      );
      expect(immutabilityCheck?.passed).toBe(false);
    });

    it('should flag agent-like committedBy identifiers', async () => {
      const mockAtoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(mockAtoms);

      const result = await service.preview({
        atomIds: ['atom-uuid-1'],
        committedBy: 'automation-agent',
      });

      const humanCheck = result.invariantChecks.find(
        (c: InvariantCheckResultDto) => c.invariantId === 'INV-006',
      );
      expect(humanCheck?.passed).toBe(false);
    });

    it('should throw if atoms not found', async () => {
      mockAtomRepository.find.mockResolvedValue([]);

      await expect(
        service.preview({
          atomIds: ['non-existent'],
          committedBy: 'jane@company.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('create', () => {
    it('should create a commitment with valid atoms', async () => {
      const mockAtoms = [createMockAtom({ id: 'uuid-1', atomId: 'IA-001', qualityScore: 85 })];

      mockAtomRepository.find.mockResolvedValue(mockAtoms);
      mockCommitmentRepository.findOne.mockResolvedValue(null); // No existing commitments

      const savedCommitment = {
        id: 'commitment-uuid',
        commitmentId: 'COM-001',
        projectId: null,
        moleculeId: null,
        canonicalJson: [
          {
            atomId: 'IA-001',
            description: 'Test atom description',
            category: 'functional',
            qualityScore: 85,
            observableOutcomes: [],
            falsifiabilityCriteria: [],
            tags: ['test'],
          },
        ],
        committedBy: 'jane@company.com',
        committedAt: new Date(),
        invariantChecks: [],
        status: 'active',
        atoms: mockAtoms,
      };

      mockCommitmentRepository.create.mockReturnValue(savedCommitment);
      mockCommitmentRepository.save.mockResolvedValue(savedCommitment);
      mockAtomRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.create({
        atomIds: ['uuid-1'],
        committedBy: 'jane@company.com',
      });

      expect(result.commitmentId).toBe('COM-001');
      expect(result.canonicalJson).toHaveLength(1);
      expect(mockAtomRepository.update).toHaveBeenCalledWith(
        { id: expect.anything() },
        expect.objectContaining({ status: 'committed' }),
      );
    });

    it('should reject commitment with blocking issues without override', async () => {
      const mockAtoms = [
        createMockAtom({ id: 'uuid-1', qualityScore: 50 }), // Below threshold
      ];

      mockAtomRepository.find.mockResolvedValue(mockAtoms);

      await expect(
        service.create({
          atomIds: ['uuid-1'],
          committedBy: 'jane@company.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should generate sequential commitment IDs', async () => {
      const mockAtoms = [createMockAtom()];
      mockAtomRepository.find.mockResolvedValue(mockAtoms);

      // Existing commitment with ID COM-042
      mockCommitmentRepository.findOne.mockResolvedValue({
        commitmentId: 'COM-042',
      });

      mockCommitmentRepository.create.mockImplementation((data) => ({
        id: 'new-uuid',
        ...data,
      }));
      mockCommitmentRepository.save.mockImplementation((data) => Promise.resolve(data));
      mockAtomRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.create({
        atomIds: ['atom-uuid-1'],
        committedBy: 'jane@company.com',
      });

      expect(result.commitmentId).toBe('COM-043');
    });
  });

  describe('findOne', () => {
    it('should return commitment by ID', async () => {
      const commitment = {
        id: 'test-uuid',
        commitmentId: 'COM-001',
        status: 'active',
        atoms: [],
      };

      mockCommitmentRepository.findOne.mockResolvedValue(commitment);

      const result = await service.findOne('test-uuid');

      expect(result.commitmentId).toBe('COM-001');
    });

    it('should throw NotFoundException when not found', async () => {
      mockCommitmentRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated commitments', async () => {
      const queryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([[{ id: 'uuid-1', commitmentId: 'COM-001' }], 1]),
      };

      mockCommitmentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('should filter by status', async () => {
      const queryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      mockCommitmentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      await service.findAll({ page: 1, limit: 20, status: 'active' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('commitment.status = :status', {
        status: 'active',
      });
    });
  });

  describe('supersede', () => {
    it('should create new commitment superseding original', async () => {
      const originalCommitment = {
        id: 'original-uuid',
        commitmentId: 'COM-001',
        projectId: 'project-uuid',
        moleculeId: null,
        status: 'active',
        atoms: [],
      };

      const newAtoms = [createMockAtom({ id: 'new-uuid', atomId: 'IA-002' })];

      // For findOne (original)
      mockCommitmentRepository.findOne
        .mockResolvedValueOnce(originalCommitment) // First findOne for original
        .mockResolvedValueOnce(null); // For generateCommitmentId

      mockAtomRepository.find.mockResolvedValue(newAtoms);

      const newCommitment = {
        id: 'new-commitment-uuid',
        commitmentId: 'COM-002',
        supersedes: 'original-uuid',
        status: 'active',
        atoms: newAtoms,
      };

      mockCommitmentRepository.create.mockReturnValue(newCommitment);
      mockCommitmentRepository.save.mockImplementation((c) => Promise.resolve(c));
      mockAtomRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.supersede('original-uuid', {
        atomIds: ['new-uuid'],
        committedBy: 'jane@company.com',
        reason: 'Updated requirements',
      });

      expect(result.supersedes).toBe('original-uuid');
    });

    it('should reject superseding already superseded commitment', async () => {
      const supersededCommitment = {
        id: 'original-uuid',
        commitmentId: 'COM-001',
        status: 'superseded',
        atoms: [],
      };

      mockCommitmentRepository.findOne.mockResolvedValue(supersededCommitment);

      await expect(
        service.supersede('original-uuid', {
          atomIds: ['uuid-1'],
          committedBy: 'jane@company.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getHistory', () => {
    it('should return supersession chain', async () => {
      const commitment1 = {
        id: 'uuid-1',
        commitmentId: 'COM-001',
        supersedes: null,
        supersededBy: 'uuid-2',
      };
      const commitment2 = {
        id: 'uuid-2',
        commitmentId: 'COM-002',
        supersedes: 'uuid-1',
        supersededBy: 'uuid-3',
      };
      const commitment3 = {
        id: 'uuid-3',
        commitmentId: 'COM-003',
        supersedes: 'uuid-2',
        supersededBy: null,
        atoms: [],
      };

      // findOne calls in sequence
      mockCommitmentRepository.findOne
        .mockResolvedValueOnce(commitment2) // Initial findOne
        .mockResolvedValueOnce(commitment1) // Walk backwards
        .mockResolvedValueOnce(commitment3); // Walk forwards

      const history = await service.getHistory('uuid-2');

      expect(history.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getAtoms', () => {
    it('should return atoms for a commitment', async () => {
      const atoms = [createMockAtom(), createMockAtom({ id: 'uuid-2' })];
      const commitment = {
        id: 'test-uuid',
        commitmentId: 'COM-001',
        atoms,
      };

      mockCommitmentRepository.findOne.mockResolvedValue(commitment);

      const result = await service.getAtoms('test-uuid');

      expect(result).toHaveLength(2);
    });
  });
});
