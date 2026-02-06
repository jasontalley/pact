/**
 * Molecules Repository Tests
 *
 * Tests for the specialized query methods in the molecules repository.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MoleculesRepository } from './molecules.repository';
import { Molecule, LensType } from './molecule.entity';
import { MoleculeAtom } from './molecule-atom.entity';

describe('MoleculesRepository', () => {
  let repository: MoleculesRepository;
  let mockMoleculeRepository: any;
  let mockMoleculeAtomRepository: any;

  const mockMolecule: Partial<Molecule> = {
    id: 'molecule-uuid-1',
    moleculeId: 'M-001',
    name: 'User Authentication Flow',
    description: 'Covers the complete authentication flow',
    lensType: 'user_story' as LensType,
    parentMoleculeId: null,
    ownerId: 'user-123',
    tags: ['authentication', 'security'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([mockMolecule]),
    getOne: jest.fn().mockResolvedValue(null),
    getCount: jest.fn().mockResolvedValue(1),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(null),
    subQuery: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getQuery: jest.fn().mockReturnValue('EXISTS (subquery)'),
    }),
  };

  beforeEach(async () => {
    mockMoleculeRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn((data) => ({ ...data })),
      createQueryBuilder: jest.fn(() => ({ ...mockQueryBuilder })),
      manager: {
        query: jest.fn(),
      },
    };

    mockMoleculeAtomRepository = {
      createQueryBuilder: jest.fn(() => ({ ...mockQueryBuilder })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoleculesRepository,
        {
          provide: getRepositoryToken(Molecule),
          useValue: mockMoleculeRepository,
        },
        {
          provide: getRepositoryToken(MoleculeAtom),
          useValue: mockMoleculeAtomRepository,
        },
      ],
    }).compile();

    repository = module.get<MoleculesRepository>(MoleculesRepository);
  });

  describe('baseRepository', () => {
    it('should return the molecule repository', () => {
      expect(repository.baseRepository).toBe(mockMoleculeRepository);
    });
  });

  describe('atomJunctionRepository', () => {
    it('should return the molecule atom repository', () => {
      expect(repository.atomJunctionRepository).toBe(mockMoleculeAtomRepository);
    });
  });

  describe('findByLensType', () => {
    it('should find molecules by lens type', async () => {
      mockMoleculeRepository.find.mockResolvedValue([mockMolecule]);

      const result = await repository.findByLensType('user_story' as LensType);

      expect(result).toEqual([mockMolecule]);
      expect(mockMoleculeRepository.find).toHaveBeenCalledWith({
        where: { lensType: 'user_story' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findByOwner', () => {
    it('should find molecules by owner', async () => {
      mockMoleculeRepository.find.mockResolvedValue([mockMolecule]);

      const result = await repository.findByOwner('user-123');

      expect(result).toEqual([mockMolecule]);
      expect(mockMoleculeRepository.find).toHaveBeenCalledWith({
        where: { ownerId: 'user-123' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findRootMolecules', () => {
    it('should find molecules without parent', async () => {
      mockMoleculeRepository.find.mockResolvedValue([mockMolecule]);

      const result = await repository.findRootMolecules();

      expect(result).toEqual([mockMolecule]);
      expect(mockMoleculeRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });

  describe('findByTags', () => {
    it('should find molecules by tags', async () => {
      const qb = {
        ...mockQueryBuilder,
        getMany: jest.fn().mockResolvedValue([mockMolecule]),
      };
      mockMoleculeRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findByTags(['authentication']);

      expect(result).toEqual([mockMolecule]);
      expect(qb.andWhere).toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith('molecule.createdAt', 'DESC');
    });

    it('should handle multiple tags', async () => {
      const qbAndWhere = jest.fn().mockReturnThis();
      const qb = {
        ...mockQueryBuilder,
        andWhere: qbAndWhere,
        getMany: jest.fn().mockResolvedValue([mockMolecule]),
      };
      mockMoleculeRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.findByTags(['authentication', 'security']);

      expect(qbAndWhere).toHaveBeenCalledTimes(2);
    });
  });

  describe('search', () => {
    it('should return paginated results', async () => {
      const qb = {
        ...mockQueryBuilder,
        getMany: jest.fn().mockResolvedValue([mockMolecule]),
        getCount: jest.fn().mockResolvedValue(1),
      };
      mockMoleculeRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.search({});

      expect(result.items).toEqual([mockMolecule]);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should apply lens type filter', async () => {
      const qb = {
        ...mockQueryBuilder,
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      };
      mockMoleculeRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.search({ lensType: ['feature'] as LensType[] });

      expect(qb.andWhere).toHaveBeenCalledWith('molecule.lensType IN (:...lensTypes)', {
        lensTypes: ['feature'],
      });
    });

    it('should apply owner filter', async () => {
      const qb = {
        ...mockQueryBuilder,
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      };
      mockMoleculeRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.search({ ownerId: 'user-123' });

      expect(qb.andWhere).toHaveBeenCalledWith('molecule.ownerId = :ownerId', {
        ownerId: 'user-123',
      });
    });

    it('should apply search filter', async () => {
      const qb = {
        ...mockQueryBuilder,
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      };
      mockMoleculeRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.search({ search: 'auth' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        '(molecule.name ILIKE :search OR molecule.description ILIKE :search)',
        { search: '%auth%' },
      );
    });

    it('should handle cursor-based pagination', async () => {
      const cursorMolecule = { ...mockMolecule, createdAt: new Date('2026-01-01') };
      mockMoleculeRepository.findOne.mockResolvedValue(cursorMolecule);
      const qb = {
        ...mockQueryBuilder,
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      };
      mockMoleculeRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.search({ cursor: 'molecule-uuid-1' });

      expect(mockMoleculeRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'molecule-uuid-1' },
      });
    });

    it('should detect next page and set nextCursor', async () => {
      const items = [
        { ...mockMolecule, id: '1' },
        { ...mockMolecule, id: '2' },
        // This would be item 21 when limit is 20, indicating more pages
      ];
      const qb = {
        ...mockQueryBuilder,
        getMany: jest.fn().mockResolvedValue([...items, { ...mockMolecule, id: '3' }]),
        getCount: jest.fn().mockResolvedValue(25),
      };
      mockMoleculeRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.search({ limit: 2 });

      expect(result.nextCursor).toBe('3');
      expect(result.items).toHaveLength(2);
    });
  });

  describe('getAtomCounts', () => {
    it('should return empty map for empty input', async () => {
      const result = await repository.getAtomCounts([]);
      expect(result.size).toBe(0);
    });

    it('should return atom counts for molecules', async () => {
      const qb = {
        ...mockQueryBuilder,
        getRawMany: jest.fn().mockResolvedValue([
          { moleculeId: 'mol-1', count: '5' },
          { moleculeId: 'mol-2', count: '3' },
        ]),
      };
      mockMoleculeAtomRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.getAtomCounts(['mol-1', 'mol-2', 'mol-3']);

      expect(result.get('mol-1')).toBe(5);
      expect(result.get('mol-2')).toBe(3);
      expect(result.get('mol-3')).toBe(0); // No atoms
    });
  });

  describe('findMoleculesContainingAtom', () => {
    it('should find molecules containing the atom', async () => {
      const qb = {
        ...mockQueryBuilder,
        getMany: jest.fn().mockResolvedValue([mockMolecule]),
      };
      mockMoleculeRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findMoleculesContainingAtom('atom-uuid-1');

      expect(result).toEqual([mockMolecule]);
      expect(qb.where).toHaveBeenCalledWith('ma.atomId = :atomId', { atomId: 'atom-uuid-1' });
    });
  });

  describe('getOrphanAtomIds', () => {
    it('should return orphan atom IDs', async () => {
      mockMoleculeRepository.manager.query.mockResolvedValue([{ id: 'atom-1' }, { id: 'atom-2' }]);

      const result = await repository.getOrphanAtomIds();

      expect(result).toEqual(['atom-1', 'atom-2']);
    });
  });

  describe('getAncestorChain', () => {
    it('should return ancestor molecules', async () => {
      mockMoleculeRepository.manager.query.mockResolvedValue([
        { id: 'parent-1', name: 'Parent 1' },
        { id: 'grandparent-1', name: 'Grandparent 1' },
      ]);
      mockMoleculeRepository.create.mockImplementation((data: Partial<Molecule>) => data);

      const result = await repository.getAncestorChain('molecule-uuid-1');

      expect(result).toHaveLength(2);
      expect(mockMoleculeRepository.manager.query).toHaveBeenCalled();
    });
  });

  describe('getDescendantIds', () => {
    it('should return descendant molecule IDs', async () => {
      mockMoleculeRepository.manager.query.mockResolvedValue([
        { id: 'child-1' },
        { id: 'grandchild-1' },
      ]);

      const result = await repository.getDescendantIds('molecule-uuid-1');

      expect(result).toEqual(['child-1', 'grandchild-1']);
    });
  });

  describe('getCountByLensType', () => {
    it('should return counts by lens type', async () => {
      const qb = {
        ...mockQueryBuilder,
        getRawMany: jest.fn().mockResolvedValue([
          { lensType: 'user_story', count: '10' },
          { lensType: 'feature', count: '5' },
        ]),
      };
      mockMoleculeRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.getCountByLensType();

      expect(result.user_story).toBe(10);
      expect(result.feature).toBe(5);
      expect(result.journey).toBe(0); // Not in results
    });
  });

  describe('getStatistics', () => {
    it('should return molecule statistics', async () => {
      mockMoleculeRepository.count.mockResolvedValue(50);
      const qb = {
        ...mockQueryBuilder,
        getRawMany: jest.fn().mockResolvedValue([
          { lensType: 'user_story', count: '30' },
          { lensType: 'feature', count: '20' },
        ]),
      };
      mockMoleculeRepository.createQueryBuilder.mockReturnValue(qb);
      mockMoleculeRepository.manager.query.mockResolvedValue([{ average: 3.5 }]);

      const result = await repository.getStatistics();

      expect(result.totalMolecules).toBe(50);
      expect(result.byLensType.user_story).toBe(30);
      expect(result.byLensType.feature).toBe(20);
      expect(result.averageAtomsPerMolecule).toBe(3.5);
    });

    it('should handle null average', async () => {
      mockMoleculeRepository.count.mockResolvedValue(0);
      const qb = {
        ...mockQueryBuilder,
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      mockMoleculeRepository.createQueryBuilder.mockReturnValue(qb);
      mockMoleculeRepository.manager.query.mockResolvedValue([{ average: null }]);

      const result = await repository.getStatistics();

      expect(result.averageAtomsPerMolecule).toBe(0);
    });
  });

  describe('generateMoleculeId', () => {
    it('should generate M-001 when no molecules exist', async () => {
      const qb = {
        ...mockQueryBuilder,
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockMoleculeRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.generateMoleculeId();

      expect(result).toBe('M-001');
    });

    it('should increment from highest existing ID', async () => {
      const qb = {
        ...mockQueryBuilder,
        getOne: jest.fn().mockResolvedValue({ moleculeId: 'M-042' }),
      };
      mockMoleculeRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.generateMoleculeId();

      expect(result).toBe('M-043');
    });

    it('should pad with zeros', async () => {
      const qb = {
        ...mockQueryBuilder,
        getOne: jest.fn().mockResolvedValue({ moleculeId: 'M-009' }),
      };
      mockMoleculeRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.generateMoleculeId();

      expect(result).toBe('M-010');
    });
  });
});
