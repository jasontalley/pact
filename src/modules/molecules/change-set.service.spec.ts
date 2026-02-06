import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { MoleculesService } from './molecules.service';
import { MoleculesRepository } from './molecules.repository';
import { Molecule, LensType } from './molecule.entity';
import { MoleculeAtom } from './molecule-atom.entity';
import { Atom } from '../atoms/atom.entity';
import { Validator } from '../validators/validator.entity';
import { ChangeSetMetadata, ChangeSetStatus } from './change-set.types';

describe('MoleculesService - Change Set Operations', () => {
  let service: MoleculesService;
  let moleculesRepository: jest.Mocked<MoleculesRepository>;
  let atomRepository: jest.Mocked<Repository<Atom>>;
  let validatorRepository: jest.Mocked<Repository<Validator>>;

  const mockChangeSetMetadata: ChangeSetMetadata = {
    status: 'draft',
    createdBy: 'user-123',
    summary: 'Test change set summary',
    sourceRef: 'conv-abc',
    approvals: [],
    requiredApprovals: 1,
  };

  const mockChangeSetMolecule: Partial<Molecule> = {
    id: 'cs-uuid-1',
    moleculeId: 'M-100',
    name: 'Test Change Set',
    description: 'A test change set',
    lensType: 'change_set' as LensType,
    lensLabel: null,
    parentMoleculeId: null,
    ownerId: 'user-123',
    tags: [],
    metadata: {},
    changeSetMetadata: mockChangeSetMetadata,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockNonChangeSetMolecule: Partial<Molecule> = {
    id: 'mol-uuid-1',
    moleculeId: 'M-001',
    name: 'Regular Molecule',
    description: 'Not a change set',
    lensType: 'feature' as LensType,
    lensLabel: null,
    parentMoleculeId: null,
    ownerId: 'user-123',
    tags: [],
    metadata: {},
    changeSetMetadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAtom = {
    id: 'atom-uuid-1',
    atomId: 'IA-001',
    description: 'User can log in with valid credentials',
    category: 'functional',
    status: 'draft',
    qualityScore: 85,
    createdAt: new Date(),
    committedAt: null,
    tags: [],
    metadata: {},
  } as unknown as Atom;

  const mockBaseRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockAtomJunctionRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const mockMoleculesRepository = {
      baseRepository: mockBaseRepository,
      atomJunctionRepository: mockAtomJunctionRepository,
      generateMoleculeId: jest.fn().mockResolvedValue('M-100'),
      search: jest.fn(),
      getAncestorChain: jest.fn().mockResolvedValue([]),
      getDescendantIds: jest.fn().mockResolvedValue([]),
      findMoleculesContainingAtom: jest.fn(),
      getOrphanAtomIds: jest.fn().mockResolvedValue([]),
      getStatistics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoleculesService,
        {
          provide: MoleculesRepository,
          useValue: mockMoleculesRepository,
        },
        {
          provide: getRepositoryToken(Atom),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Validator),
          useValue: {
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MoleculesService>(MoleculesService);
    moleculesRepository = module.get(MoleculesRepository);
    atomRepository = module.get(getRepositoryToken(Atom));
    validatorRepository = module.get(getRepositoryToken(Validator));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createChangeSet', () => {
    it('should create a change set molecule with correct metadata', async () => {
      const dto = {
        name: 'My Change Set',
        description: 'Proposed atoms from reconciliation',
        summary: 'Adding auth atoms',
        sourceRef: 'recon-run-001',
        tags: ['auth'],
      };

      mockBaseRepository.create.mockReturnValue({
        ...mockChangeSetMolecule,
        name: dto.name,
        description: dto.description,
        tags: dto.tags,
      });
      mockBaseRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      const result = await service.createChangeSet(dto, 'user-123');

      expect(moleculesRepository.generateMoleculeId).toHaveBeenCalled();
      expect(mockBaseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          moleculeId: 'M-100',
          name: dto.name,
          description: dto.description,
          lensType: 'change_set',
          ownerId: 'user-123',
          tags: dto.tags,
          changeSetMetadata: expect.objectContaining({
            status: 'draft',
            createdBy: 'user-123',
            summary: dto.summary,
            sourceRef: dto.sourceRef,
            approvals: [],
            requiredApprovals: 1,
          }),
        }),
      );
      expect(mockBaseRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create a change set with minimal data', async () => {
      const dto = { name: 'Minimal Change Set' };

      mockBaseRepository.create.mockReturnValue({
        ...mockChangeSetMolecule,
        name: dto.name,
        description: null,
      });
      mockBaseRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      const result = await service.createChangeSet(dto, 'user-456');

      expect(mockBaseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: dto.name,
          description: null,
          lensType: 'change_set',
          ownerId: 'user-456',
          tags: [],
          changeSetMetadata: expect.objectContaining({
            status: 'draft',
            createdBy: 'user-456',
            approvals: [],
          }),
        }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('addAtomToChangeSet', () => {
    it('should add an atom to a draft change set', async () => {
      const draftChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: { ...mockChangeSetMetadata, status: 'draft' as ChangeSetStatus },
      };
      mockBaseRepository.findOne.mockResolvedValue(draftChangeSet);
      atomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomJunctionRepository.findOne.mockResolvedValue(null);
      mockAtomJunctionRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxOrder: null }),
      });
      mockAtomJunctionRepository.create.mockReturnValue({
        moleculeId: 'cs-uuid-1',
        atomId: 'atom-uuid-1',
        order: 0,
      });
      mockAtomJunctionRepository.save.mockResolvedValue({
        moleculeId: 'cs-uuid-1',
        atomId: 'atom-uuid-1',
        order: 0,
      });

      await expect(
        service.addAtomToChangeSet('cs-uuid-1', 'atom-uuid-1', 'user-123'),
      ).resolves.not.toThrow();
    });

    it('should reject adding atom to a non-draft change set', async () => {
      const reviewChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: { ...mockChangeSetMetadata, status: 'review' as ChangeSetStatus },
      };
      mockBaseRepository.findOne.mockResolvedValue(reviewChangeSet);

      await expect(
        service.addAtomToChangeSet('cs-uuid-1', 'atom-uuid-1', 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject adding atom to an approved change set', async () => {
      const approvedChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: { ...mockChangeSetMetadata, status: 'approved' as ChangeSetStatus },
      };
      mockBaseRepository.findOne.mockResolvedValue(approvedChangeSet);

      await expect(
        service.addAtomToChangeSet('cs-uuid-1', 'atom-uuid-1', 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitChangeSetForReview', () => {
    it('should transition from draft to review when atoms are present', async () => {
      const draftChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: { ...mockChangeSetMetadata, status: 'draft' as ChangeSetStatus },
      };
      mockBaseRepository.findOne.mockResolvedValue(draftChangeSet);
      mockBaseRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      // Mock getAtoms to return at least one atom
      jest.spyOn(service, 'getAtoms').mockResolvedValue([mockAtom]);

      const result = await service.submitChangeSetForReview('cs-uuid-1', 'user-123');

      expect(result.changeSetMetadata!.status).toBe('review');
      expect(result.changeSetMetadata!.submittedAt).toBeDefined();
      expect(mockBaseRepository.save).toHaveBeenCalled();
    });

    it('should reject submitting an empty change set', async () => {
      const draftChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: { ...mockChangeSetMetadata, status: 'draft' as ChangeSetStatus },
      };
      mockBaseRepository.findOne.mockResolvedValue(draftChangeSet);

      // Mock getAtoms to return empty array
      jest.spyOn(service, 'getAtoms').mockResolvedValue([]);

      await expect(service.submitChangeSetForReview('cs-uuid-1', 'user-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject submitting a non-draft change set', async () => {
      const reviewChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: { ...mockChangeSetMetadata, status: 'review' as ChangeSetStatus },
      };
      mockBaseRepository.findOne.mockResolvedValue(reviewChangeSet);

      await expect(service.submitChangeSetForReview('cs-uuid-1', 'user-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('approveChangeSet', () => {
    it('should record an approval on a review-status change set', async () => {
      const reviewChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: {
          ...mockChangeSetMetadata,
          status: 'review' as ChangeSetStatus,
          approvals: [],
          requiredApprovals: 1,
        },
      };
      mockBaseRepository.findOne.mockResolvedValue(reviewChangeSet);
      mockBaseRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      const result = await service.approveChangeSet(
        'cs-uuid-1',
        'user-456',
        'approved',
        'Looks good',
      );

      expect(result.changeSetMetadata!.approvals).toHaveLength(1);
      expect(result.changeSetMetadata!.approvals[0].userId).toBe('user-456');
      expect(result.changeSetMetadata!.approvals[0].decision).toBe('approved');
      expect(result.changeSetMetadata!.approvals[0].comment).toBe('Looks good');
      expect(result.changeSetMetadata!.approvals[0].timestamp).toBeDefined();
    });

    it('should auto-transition to approved when sufficient approvals received', async () => {
      const reviewChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: {
          ...mockChangeSetMetadata,
          status: 'review' as ChangeSetStatus,
          approvals: [],
          requiredApprovals: 1,
        },
      };
      mockBaseRepository.findOne.mockResolvedValue(reviewChangeSet);
      mockBaseRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      const result = await service.approveChangeSet('cs-uuid-1', 'user-456', 'approved');

      expect(result.changeSetMetadata!.status).toBe('approved');
    });

    it('should auto-transition to rejected on rejection', async () => {
      const reviewChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: {
          ...mockChangeSetMetadata,
          status: 'review' as ChangeSetStatus,
          approvals: [],
          requiredApprovals: 1,
        },
      };
      mockBaseRepository.findOne.mockResolvedValue(reviewChangeSet);
      mockBaseRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      const result = await service.approveChangeSet(
        'cs-uuid-1',
        'user-456',
        'rejected',
        'Needs more work',
      );

      expect(result.changeSetMetadata!.status).toBe('rejected');
      expect(result.changeSetMetadata!.approvals[0].decision).toBe('rejected');
    });

    it('should reject if change set is not in review status', async () => {
      const draftChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: { ...mockChangeSetMetadata, status: 'draft' as ChangeSetStatus },
      };
      mockBaseRepository.findOne.mockResolvedValue(draftChangeSet);

      await expect(service.approveChangeSet('cs-uuid-1', 'user-456', 'approved')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should prevent duplicate approvals from the same user', async () => {
      const reviewChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: {
          ...mockChangeSetMetadata,
          status: 'review' as ChangeSetStatus,
          approvals: [
            {
              userId: 'user-456',
              decision: 'approved' as const,
              timestamp: new Date().toISOString(),
            },
          ],
          requiredApprovals: 2,
        },
      };
      mockBaseRepository.findOne.mockResolvedValue(reviewChangeSet);

      await expect(service.approveChangeSet('cs-uuid-1', 'user-456', 'approved')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should not transition to approved when approvals are below required', async () => {
      const reviewChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: {
          ...mockChangeSetMetadata,
          status: 'review' as ChangeSetStatus,
          approvals: [],
          requiredApprovals: 3,
        },
      };
      mockBaseRepository.findOne.mockResolvedValue(reviewChangeSet);
      mockBaseRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      const result = await service.approveChangeSet('cs-uuid-1', 'user-456', 'approved');

      // Still in review because only 1 of 3 required approvals
      expect(result.changeSetMetadata!.status).toBe('review');
      expect(result.changeSetMetadata!.approvals).toHaveLength(1);
    });
  });

  describe('commitChangeSet', () => {
    it('should batch commit all draft atoms when approved', async () => {
      const approvedChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: {
          ...mockChangeSetMetadata,
          status: 'approved' as ChangeSetStatus,
        },
      };
      mockBaseRepository.findOne.mockResolvedValue(approvedChangeSet);
      mockBaseRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      const draftAtom1 = {
        ...mockAtom,
        id: 'atom-1',
        atomId: 'IA-001',
        status: 'draft',
        qualityScore: 90,
      } as Atom;
      const draftAtom2 = {
        ...mockAtom,
        id: 'atom-2',
        atomId: 'IA-002',
        status: 'draft',
        qualityScore: 85,
      } as Atom;

      jest.spyOn(service, 'getAtoms').mockResolvedValue([draftAtom1, draftAtom2]);
      atomRepository.save.mockImplementation((entity) => Promise.resolve(entity as Atom));

      const result = await service.commitChangeSet('cs-uuid-1', 'user-123');

      expect(result.changeSetMetadata!.status).toBe('committed');
      expect(result.changeSetMetadata!.committedAt).toBeDefined();
      expect(result.changeSetMetadata!.committedAtomIds).toEqual(['atom-1', 'atom-2']);
      expect(atomRepository.save).toHaveBeenCalledTimes(2);
    });

    it('should reject committing a non-approved change set', async () => {
      const reviewChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: {
          ...mockChangeSetMetadata,
          status: 'review' as ChangeSetStatus,
        },
      };
      mockBaseRepository.findOne.mockResolvedValue(reviewChangeSet);

      await expect(service.commitChangeSet('cs-uuid-1', 'user-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject committing a draft change set', async () => {
      const draftChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: {
          ...mockChangeSetMetadata,
          status: 'draft' as ChangeSetStatus,
        },
      };
      mockBaseRepository.findOne.mockResolvedValue(draftChangeSet);

      await expect(service.commitChangeSet('cs-uuid-1', 'user-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should enforce quality gate (score >= 80)', async () => {
      const approvedChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: {
          ...mockChangeSetMetadata,
          status: 'approved' as ChangeSetStatus,
        },
      };
      mockBaseRepository.findOne.mockResolvedValue(approvedChangeSet);

      const lowQualityAtom = {
        ...mockAtom,
        id: 'atom-low',
        atomId: 'IA-099',
        status: 'draft',
        qualityScore: 50,
      } as Atom;

      jest.spyOn(service, 'getAtoms').mockResolvedValue([lowQualityAtom]);

      await expect(service.commitChangeSet('cs-uuid-1', 'user-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject when no draft atoms exist in the change set', async () => {
      const approvedChangeSet = {
        ...mockChangeSetMolecule,
        changeSetMetadata: {
          ...mockChangeSetMetadata,
          status: 'approved' as ChangeSetStatus,
        },
      };
      mockBaseRepository.findOne.mockResolvedValue(approvedChangeSet);

      const committedAtom = {
        ...mockAtom,
        id: 'atom-1',
        status: 'committed',
        qualityScore: 90,
      } as Atom;

      jest.spyOn(service, 'getAtoms').mockResolvedValue([committedAtom]);

      await expect(service.commitChangeSet('cs-uuid-1', 'user-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getChangeSet', () => {
    it('should return change set with its atoms', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockChangeSetMolecule);
      jest.spyOn(service, 'getAtoms').mockResolvedValue([mockAtom]);

      const result = await service.getChangeSet('cs-uuid-1');

      expect(result.molecule).toEqual(mockChangeSetMolecule);
      expect(result.atoms).toEqual([mockAtom]);
      expect(result.atoms).toHaveLength(1);
    });

    it('should throw if molecule is not a change set', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockNonChangeSetMolecule);

      await expect(service.getChangeSet('mol-uuid-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when change set does not exist', async () => {
      mockBaseRepository.findOne.mockResolvedValue(null);

      await expect(service.getChangeSet('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listChangeSets', () => {
    it('should list all change sets when no status filter provided', async () => {
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockChangeSetMolecule]),
      };
      mockBaseRepository.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.listChangeSets();

      expect(result).toHaveLength(1);
      expect(mockQb.where).toHaveBeenCalledWith('molecule.lensType = :lensType', {
        lensType: 'change_set',
      });
      expect(mockQb.andWhere).not.toHaveBeenCalled();
    });

    it('should filter change sets by status', async () => {
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockChangeSetMolecule]),
      };
      mockBaseRepository.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.listChangeSets('draft');

      expect(result).toHaveLength(1);
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        "molecule.changeSetMetadata->>'status' = :status",
        { status: 'draft' },
      );
    });
  });

  describe('assertChangeSet', () => {
    it('should throw BadRequestException when molecule is not a change_set type', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockNonChangeSetMolecule);

      await expect(service.getChangeSet('mol-uuid-1')).rejects.toThrow(BadRequestException);
    });

    it('should not throw when molecule is a change_set type', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockChangeSetMolecule);
      jest.spyOn(service, 'getAtoms').mockResolvedValue([]);

      const result = await service.getChangeSet('cs-uuid-1');

      expect(result.molecule).toEqual(mockChangeSetMolecule);
    });
  });
});
