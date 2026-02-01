import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { MoleculesService } from './molecules.service';
import { MoleculesRepository } from './molecules.repository';
import { Molecule, LensType } from './molecule.entity';
import { MoleculeAtom } from './molecule-atom.entity';
import { Atom } from '../atoms/atom.entity';
import { Validator } from '../validators/validator.entity';

describe('MoleculesService', () => {
  let service: MoleculesService;
  let moleculesRepository: jest.Mocked<MoleculesRepository>;
  let atomRepository: jest.Mocked<Repository<Atom>>;
  let validatorRepository: jest.Mocked<Repository<Validator>>;

  const mockMolecule: Partial<Molecule> = {
    id: 'molecule-uuid-1',
    moleculeId: 'M-001',
    name: 'User Authentication Flow',
    description: 'Covers the complete authentication flow',
    lensType: 'user_story' as LensType,
    lensLabel: null,
    parentMoleculeId: null,
    ownerId: 'user-123',
    tags: ['authentication', 'security'],
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAtom = {
    id: 'atom-uuid-1',
    atomId: 'IA-001',
    description: 'User can log in with valid credentials',
    category: 'functional',
    status: 'committed',
    qualityScore: 85,
    createdAt: new Date(),
    tags: [],
    metadata: {},
  } as unknown as Atom;

  const mockMoleculeAtom: Partial<MoleculeAtom> = {
    moleculeId: 'molecule-uuid-1',
    atomId: 'atom-uuid-1',
    order: 0,
    note: null,
    addedAt: new Date(),
    addedBy: 'user-123',
    removedAt: null,
    removedBy: null,
  };

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
      generateMoleculeId: jest.fn().mockResolvedValue('M-001'),
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

  describe('create', () => {
    it('should create a molecule with valid data', async () => {
      const dto = {
        name: 'User Authentication Flow',
        lensType: 'user_story' as LensType,
        description: 'Covers authentication',
        tags: ['auth'],
      };

      mockBaseRepository.create.mockReturnValue(mockMolecule);
      mockBaseRepository.save.mockResolvedValue(mockMolecule);

      const result = await service.create(dto, 'user-123');

      expect(moleculesRepository.generateMoleculeId).toHaveBeenCalled();
      expect(mockBaseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          moleculeId: 'M-001',
          name: dto.name,
          lensType: dto.lensType,
          ownerId: 'user-123',
        }),
      );
      expect(result).toEqual(mockMolecule);
    });

    it('should require lensLabel when lensType is custom', async () => {
      const dto = {
        name: 'Custom Group',
        lensType: 'custom' as LensType,
      };

      await expect(service.create(dto, 'user-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if parent molecule not found', async () => {
      const dto = {
        name: 'Child Molecule',
        lensType: 'feature' as LensType,
        parentMoleculeId: 'non-existent-id',
      };

      mockBaseRepository.findOne.mockResolvedValue(null);

      await expect(service.create(dto, 'user-123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if hierarchy depth would exceed 10 levels', async () => {
      const dto = {
        name: 'Deep Molecule',
        lensType: 'feature' as LensType,
        parentMoleculeId: 'parent-id',
      };

      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);
      moleculesRepository.getAncestorChain = jest.fn().mockResolvedValue(
        Array(10).fill(mockMolecule),
      );

      await expect(service.create(dto, 'user-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findOne', () => {
    it('should return a molecule when found', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);

      const result = await service.findOne('molecule-uuid-1');

      expect(result).toEqual(mockMolecule);
      expect(mockBaseRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'molecule-uuid-1' },
        relations: ['parentMolecule', 'childMolecules', 'moleculeAtoms'],
      });
    });

    it('should throw NotFoundException when molecule not found', async () => {
      mockBaseRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a molecule', async () => {
      const updateDto = { name: 'Updated Name' };
      const updatedMolecule = { ...mockMolecule, name: 'Updated Name' };

      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);
      mockBaseRepository.save.mockResolvedValue(updatedMolecule);

      const result = await service.update('molecule-uuid-1', updateDto);

      expect(result.name).toBe('Updated Name');
    });

    it('should throw when setting self as parent', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);

      await expect(
        service.update('molecule-uuid-1', { parentMoleculeId: 'molecule-uuid-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when creating cycle', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);
      moleculesRepository.getDescendantIds = jest.fn().mockResolvedValue(['child-id']);

      await expect(
        service.update('molecule-uuid-1', { parentMoleculeId: 'child-id' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should delete a molecule and update children', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);
      mockBaseRepository.update.mockResolvedValue({ affected: 1 });
      mockBaseRepository.remove.mockResolvedValue(mockMolecule);

      await service.remove('molecule-uuid-1');

      expect(mockBaseRepository.update).toHaveBeenCalledWith(
        { parentMoleculeId: 'molecule-uuid-1' },
        { parentMoleculeId: null },
      );
      expect(mockBaseRepository.remove).toHaveBeenCalled();
    });
  });

  describe('addAtom', () => {
    it('should add an atom to a molecule', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);
      atomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomJunctionRepository.findOne.mockResolvedValue(null);
      mockAtomJunctionRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxOrder: null }),
      });
      mockAtomJunctionRepository.create.mockReturnValue(mockMoleculeAtom);
      mockAtomJunctionRepository.save.mockResolvedValue(mockMoleculeAtom);

      const result = await service.addAtom(
        'molecule-uuid-1',
        { atomId: 'atom-uuid-1' },
        'user-123',
      );

      expect(result).toEqual(mockMoleculeAtom);
    });

    it('should throw if atom already in molecule', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);
      atomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomJunctionRepository.findOne.mockResolvedValue({
        ...mockMoleculeAtom,
        removedAt: null,
      });

      await expect(
        service.addAtom('molecule-uuid-1', { atomId: 'atom-uuid-1' }, 'user-123'),
      ).rejects.toThrow(ConflictException);
    });

    it('should reactivate a previously removed atom', async () => {
      const removedJunction = {
        ...mockMoleculeAtom,
        removedAt: new Date(),
        removedBy: 'user-123',
      };

      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);
      atomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomJunctionRepository.findOne.mockResolvedValue(removedJunction);
      mockAtomJunctionRepository.save.mockResolvedValue({
        ...removedJunction,
        removedAt: null,
        removedBy: null,
      });

      const result = await service.addAtom(
        'molecule-uuid-1',
        { atomId: 'atom-uuid-1' },
        'user-123',
      );

      expect(result.removedAt).toBeNull();
    });
  });

  describe('removeAtom', () => {
    it('should soft-delete the junction record', async () => {
      mockAtomJunctionRepository.findOne.mockResolvedValue(mockMoleculeAtom);
      mockAtomJunctionRepository.save.mockResolvedValue({
        ...mockMoleculeAtom,
        removedAt: expect.any(Date),
        removedBy: 'user-123',
      });

      await service.removeAtom('molecule-uuid-1', 'atom-uuid-1', 'user-123');

      expect(mockAtomJunctionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          removedAt: expect.any(Date),
          removedBy: 'user-123',
        }),
      );
    });

    it('should throw if atom not in molecule', async () => {
      mockAtomJunctionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.removeAtom('molecule-uuid-1', 'atom-uuid-1', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMetrics', () => {
    it('should compute metrics for a molecule with atoms', async () => {
      const atoms = [
        { ...mockAtom, id: 'atom-1', status: 'committed', qualityScore: 80 },
        { ...mockAtom, id: 'atom-2', status: 'draft', qualityScore: 70 },
      ];

      const validators = [{ id: 'val-1', atomId: 'atom-1', isActive: true }];

      // Mock getAtoms
      jest.spyOn(service, 'getAtoms').mockResolvedValue(atoms as Atom[]);
      mockBaseRepository.count.mockResolvedValue(0); // No children
      validatorRepository.find.mockResolvedValue(validators as Validator[]);

      const metrics = await service.getMetrics('molecule-uuid-1');

      expect(metrics.atomCount).toBe(2);
      expect(metrics.realizationStatus.committed).toBe(1);
      expect(metrics.realizationStatus.draft).toBe(1);
      expect(metrics.realizationStatus.overall).toBe('partial');
      expect(metrics.validatorCoverage).toBe(50); // 1 of 2 atoms has validators
      expect(metrics.aggregateQuality.average).toBe(75);
    });

    it('should return zero metrics for empty molecule', async () => {
      jest.spyOn(service, 'getAtoms').mockResolvedValue([]);
      mockBaseRepository.count.mockResolvedValue(0);

      const metrics = await service.getMetrics('molecule-uuid-1');

      expect(metrics.atomCount).toBe(0);
      expect(metrics.validatorCoverage).toBe(0);
      expect(metrics.realizationStatus.overall).toBe('unrealized');
    });
  });

  describe('getLensTypes', () => {
    it('should return all lens types with metadata', () => {
      const lensTypes = service.getLensTypes();

      expect(lensTypes).toHaveLength(7);
      expect(lensTypes.map((lt) => lt.type)).toEqual([
        'user_story',
        'feature',
        'journey',
        'epic',
        'release',
        'capability',
        'custom',
      ]);
      expect(lensTypes[0].label).toBe('User Story');
    });
  });

  describe('getOrphanAtoms', () => {
    it('should return atoms not in any molecule', async () => {
      const orphanAtom = { ...mockAtom, id: 'orphan-1' };
      moleculesRepository.getOrphanAtomIds = jest.fn().mockResolvedValue(['orphan-1']);
      atomRepository.find.mockResolvedValue([orphanAtom] as Atom[]);

      const result = await service.getOrphanAtoms();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('orphan-1');
    });

    it('should return empty array when no orphan atoms', async () => {
      moleculesRepository.getOrphanAtomIds = jest.fn().mockResolvedValue([]);

      const result = await service.getOrphanAtoms();

      expect(result).toHaveLength(0);
    });
  });

  describe('findAll', () => {
    it('should return paginated molecules', async () => {
      const paginatedResult = {
        items: [mockMolecule],
        total: 1,
        limit: 10,
        offset: 0,
      };
      moleculesRepository.search = jest.fn().mockResolvedValue(paginatedResult);

      const result = await service.findAll({ limit: 10, offset: 0 });

      expect(result).toEqual(paginatedResult);
      expect(moleculesRepository.search).toHaveBeenCalledWith({ limit: 10, offset: 0 });
    });
  });

  describe('findByMoleculeId', () => {
    it('should return molecule by moleculeId', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);

      const result = await service.findByMoleculeId('M-001');

      expect(result).toEqual(mockMolecule);
      expect(mockBaseRepository.findOne).toHaveBeenCalledWith({
        where: { moleculeId: 'M-001' },
        relations: ['parentMolecule', 'childMolecules'],
      });
    });

    it('should throw NotFoundException when molecule not found', async () => {
      mockBaseRepository.findOne.mockResolvedValue(null);

      await expect(service.findByMoleculeId('M-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update - additional cases', () => {
    it('should throw when parent molecule not found', async () => {
      mockBaseRepository.findOne
        .mockResolvedValueOnce(mockMolecule) // findOne for current molecule
        .mockResolvedValueOnce(null); // findOne for parent - not found

      await expect(
        service.update('molecule-uuid-1', { parentMoleculeId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when hierarchy depth would exceed 10 levels', async () => {
      mockBaseRepository.findOne
        .mockResolvedValueOnce(mockMolecule)
        .mockResolvedValueOnce({ id: 'parent-id' }); // parent exists
      moleculesRepository.getDescendantIds = jest.fn().mockResolvedValue([]);
      moleculesRepository.getAncestorChain = jest.fn().mockResolvedValue(
        Array(10).fill(mockMolecule),
      );

      await expect(
        service.update('molecule-uuid-1', { parentMoleculeId: 'parent-id' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when custom lens type missing label', async () => {
      const moleculeWithNoLabel = { ...mockMolecule, lensType: 'feature', lensLabel: null };
      mockBaseRepository.findOne.mockResolvedValue(moleculeWithNoLabel);

      await expect(
        service.update('molecule-uuid-1', { lensType: 'custom' as LensType }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('addAtom - additional cases', () => {
    it('should throw when atom not found', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);
      atomRepository.findOne.mockResolvedValue(null);

      await expect(
        service.addAtom('molecule-uuid-1', { atomId: 'non-existent' }, 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should use provided order when specified', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);
      atomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomJunctionRepository.findOne.mockResolvedValue(null);
      mockAtomJunctionRepository.create.mockReturnValue({ ...mockMoleculeAtom, order: 5 });
      mockAtomJunctionRepository.save.mockResolvedValue({ ...mockMoleculeAtom, order: 5 });

      const result = await service.addAtom(
        'molecule-uuid-1',
        { atomId: 'atom-uuid-1', order: 5 },
        'user-123',
      );

      expect(mockAtomJunctionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ order: 5 }),
      );
    });
  });

  describe('removeAtom - additional cases', () => {
    it('should throw when atom already removed', async () => {
      mockAtomJunctionRepository.findOne.mockResolvedValue({
        ...mockMoleculeAtom,
        removedAt: new Date(),
      });

      await expect(
        service.removeAtom('molecule-uuid-1', 'atom-uuid-1', 'user-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('batchAddAtoms', () => {
    it('should add multiple atoms to a molecule', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);
      atomRepository.find.mockResolvedValue([
        { id: 'atom-1' },
        { id: 'atom-2' },
      ] as Atom[]);
      mockAtomJunctionRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxOrder: 0 }),
      });

      // Mock addAtom behavior
      jest.spyOn(service, 'addAtom')
        .mockResolvedValueOnce({ ...mockMoleculeAtom, atomId: 'atom-1' } as MoleculeAtom)
        .mockResolvedValueOnce({ ...mockMoleculeAtom, atomId: 'atom-2' } as MoleculeAtom);

      const result = await service.batchAddAtoms(
        'molecule-uuid-1',
        { atoms: [{ atomId: 'atom-1' }, { atomId: 'atom-2' }] },
        'user-123',
      );

      expect(result).toHaveLength(2);
    });

    it('should throw when atoms not found', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);
      atomRepository.find.mockResolvedValue([{ id: 'atom-1' }] as Atom[]); // Only one atom found

      await expect(
        service.batchAddAtoms(
          'molecule-uuid-1',
          { atoms: [{ atomId: 'atom-1' }, { atomId: 'missing-atom' }] },
          'user-123',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should skip conflicts when atom already in molecule', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);
      atomRepository.find.mockResolvedValue([
        { id: 'atom-1' },
        { id: 'atom-2' },
      ] as Atom[]);
      mockAtomJunctionRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxOrder: 0 }),
      });

      jest.spyOn(service, 'addAtom')
        .mockResolvedValueOnce({ ...mockMoleculeAtom, atomId: 'atom-1' } as MoleculeAtom)
        .mockRejectedValueOnce(new ConflictException('Already in molecule'));

      const result = await service.batchAddAtoms(
        'molecule-uuid-1',
        { atoms: [{ atomId: 'atom-1' }, { atomId: 'atom-2' }] },
        'user-123',
      );

      expect(result).toHaveLength(1);
    });
  });

  describe('reorderAtoms', () => {
    it('should update order for each atom', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);
      mockAtomJunctionRepository.update.mockResolvedValue({ affected: 1 });

      await service.reorderAtoms('molecule-uuid-1', {
        atomOrders: [
          { atomId: 'atom-1', order: 0 },
          { atomId: 'atom-2', order: 1 },
        ],
      });

      expect(mockAtomJunctionRepository.update).toHaveBeenCalledTimes(2);
      expect(mockAtomJunctionRepository.update).toHaveBeenCalledWith(
        { moleculeId: 'molecule-uuid-1', atomId: 'atom-1' },
        { order: 0 },
      );
    });
  });

  describe('batchUpdateAtoms', () => {
    it('should update multiple atom properties', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);
      mockAtomJunctionRepository.update.mockResolvedValue({ affected: 1 });

      await service.batchUpdateAtoms('molecule-uuid-1', {
        atoms: [
          { atomId: 'atom-1', order: 5, note: 'Updated note' },
          { atomId: 'atom-2', order: 10 },
        ],
      });

      expect(mockAtomJunctionRepository.update).toHaveBeenCalledTimes(2);
      expect(mockAtomJunctionRepository.update).toHaveBeenCalledWith(
        { moleculeId: 'molecule-uuid-1', atomId: 'atom-1' },
        { order: 5, note: 'Updated note' },
      );
    });

    it('should skip atoms with no updates', async () => {
      mockBaseRepository.findOne.mockResolvedValue(mockMolecule);

      await service.batchUpdateAtoms('molecule-uuid-1', {
        atoms: [{ atomId: 'atom-1' }], // No order or note
      });

      expect(mockAtomJunctionRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('getAtoms', () => {
    it('should get atoms with transitive closure', async () => {
      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockAtom]),
      };
      atomRepository.createQueryBuilder = jest.fn().mockReturnValue(mockQb);
      moleculesRepository.getDescendantIds = jest.fn().mockResolvedValue(['child-1', 'child-2']);

      const result = await service.getAtoms('molecule-uuid-1', {
        includeChildMolecules: true,
        recursive: true,
      });

      expect(moleculesRepository.getDescendantIds).toHaveBeenCalledWith('molecule-uuid-1');
      expect(result).toEqual([mockAtom]);
    });

    it('should get atoms with direct children only', async () => {
      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockAtom]),
      };
      atomRepository.createQueryBuilder = jest.fn().mockReturnValue(mockQb);
      mockBaseRepository.find.mockResolvedValue([{ id: 'child-1' }]);

      const result = await service.getAtoms('molecule-uuid-1', {
        includeChildMolecules: true,
        recursive: false,
      });

      expect(mockBaseRepository.find).toHaveBeenCalledWith({
        where: { parentMoleculeId: 'molecule-uuid-1' },
        select: ['id'],
      });
      expect(result).toEqual([mockAtom]);
    });

    it('should include removed atoms when activeOnly is false', async () => {
      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockAtom]),
      };
      atomRepository.createQueryBuilder = jest.fn().mockReturnValue(mockQb);

      const result = await service.getAtoms('molecule-uuid-1', { activeOnly: false });

      // Should not call andWhere for removedAt filter
      expect(mockQb.andWhere).not.toHaveBeenCalled();
      expect(result).toEqual([mockAtom]);
    });
  });

  describe('getChildren', () => {
    it('should return child molecules', async () => {
      const children = [{ ...mockMolecule, id: 'child-1' }];
      mockBaseRepository.find.mockResolvedValue(children);

      const result = await service.getChildren('molecule-uuid-1');

      expect(result).toEqual(children);
      expect(mockBaseRepository.find).toHaveBeenCalledWith({
        where: { parentMoleculeId: 'molecule-uuid-1' },
        order: { name: 'ASC' },
      });
    });
  });

  describe('getAncestors', () => {
    it('should return ancestor chain', async () => {
      const ancestors = [mockMolecule];
      moleculesRepository.getAncestorChain = jest.fn().mockResolvedValue(ancestors);

      const result = await service.getAncestors('molecule-uuid-1');

      expect(result).toEqual(ancestors);
      expect(moleculesRepository.getAncestorChain).toHaveBeenCalledWith('molecule-uuid-1');
    });
  });

  describe('getMetrics - additional cases', () => {
    it('should compute realized status when all atoms committed', async () => {
      const atoms = [
        { ...mockAtom, id: 'atom-1', status: 'committed', qualityScore: 90 },
        { ...mockAtom, id: 'atom-2', status: 'committed', qualityScore: 85 },
      ];

      jest.spyOn(service, 'getAtoms').mockResolvedValue(atoms as Atom[]);
      mockBaseRepository.count.mockResolvedValue(2);
      validatorRepository.find.mockResolvedValue([
        { id: 'val-1', atomId: 'atom-1', isActive: true },
        { id: 'val-2', atomId: 'atom-2', isActive: true },
      ] as Validator[]);

      const metrics = await service.getMetrics('molecule-uuid-1');

      expect(metrics.realizationStatus.overall).toBe('realized');
      expect(metrics.validatorCoverage).toBe(100);
      expect(metrics.verificationHealth).toBe(100);
      expect(metrics.aggregateQuality.min).toBe(85);
      expect(metrics.aggregateQuality.max).toBe(90);
    });

    it('should handle atoms with superseded status', async () => {
      const atoms = [
        { ...mockAtom, id: 'atom-1', status: 'superseded', qualityScore: 90 },
      ];

      jest.spyOn(service, 'getAtoms').mockResolvedValue(atoms as Atom[]);
      mockBaseRepository.count.mockResolvedValue(0);
      validatorRepository.find.mockResolvedValue([]);

      const metrics = await service.getMetrics('molecule-uuid-1');

      expect(metrics.realizationStatus.superseded).toBe(1);
      expect(metrics.realizationStatus.overall).toBe('unrealized');
    });
  });

  describe('getStatistics', () => {
    it('should return molecule statistics', async () => {
      const stats = {
        totalMolecules: 10,
        byLensType: { user_story: 5, feature: 3, epic: 2 },
        averageAtomsPerMolecule: 3.5,
        rootMoleculeCount: 4,
      };
      moleculesRepository.getStatistics = jest.fn().mockResolvedValue(stats);
      moleculesRepository.getOrphanAtomIds = jest.fn().mockResolvedValue(['orphan-1', 'orphan-2']);

      const result = await service.getStatistics();

      expect(result).toEqual({
        totalMolecules: 10,
        byLensType: { user_story: 5, feature: 3, epic: 2 },
        averageAtomsPerMolecule: 3.5,
        rootMoleculeCount: 4,
        orphanAtomCount: 2,
      });
    });
  });

  describe('getMoleculesForAtom', () => {
    it('should return molecules containing the atom', async () => {
      const molecules = [mockMolecule];
      moleculesRepository.findMoleculesContainingAtom = jest.fn().mockResolvedValue(molecules);

      const result = await service.getMoleculesForAtom('atom-uuid-1');

      expect(result).toEqual(molecules);
      expect(moleculesRepository.findMoleculesContainingAtom).toHaveBeenCalledWith('atom-uuid-1');
    });
  });
});
