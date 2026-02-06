import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AtomsRepository } from './atoms.repository';
import { Atom } from './atom.entity';

describe('AtomsRepository', () => {
  let repository: AtomsRepository;
  let mockTypeOrmRepository: jest.Mocked<Repository<Atom>>;
  let mockQueryBuilder: jest.Mocked<SelectQueryBuilder<Atom>>;

  beforeEach(async () => {
    // Create mock query builder
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
      getCount: jest.fn(),
      getRawMany: jest.fn(),
      getRawOne: jest.fn(),
    } as unknown as jest.Mocked<SelectQueryBuilder<Atom>>;

    // Create mock TypeORM repository
    mockTypeOrmRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      query: jest.fn(),
      count: jest.fn(),
    } as unknown as jest.Mocked<Repository<Atom>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtomsRepository,
        {
          provide: getRepositoryToken(Atom),
          useValue: mockTypeOrmRepository,
        },
      ],
    }).compile();

    repository = module.get<AtomsRepository>(AtomsRepository);
    jest.clearAllMocks();
  });

  // @atom IA-029
  describe('findByStatus', () => {
    // @atom IA-029
    it('should return atoms filtered by status', async () => {
      const mockAtoms = [
        { id: '1', atomId: 'IA-001', status: 'draft' },
        { id: '2', atomId: 'IA-002', status: 'draft' },
      ];
      mockTypeOrmRepository.find.mockResolvedValue(mockAtoms as Atom[]);

      const result = await repository.findByStatus('draft');

      // IA-029: findByStatus must return only atoms matching the requested status
      expect(result).toHaveLength(2);
      expect(result.every((atom) => atom.status === 'draft')).toBe(true);
      // IA-029: Repository must query with correct status filter and DESC order
      expect(mockTypeOrmRepository.find).toHaveBeenCalledWith({
        where: { status: 'draft' },
        order: { createdAt: 'DESC' },
      });
    });

    // @atom IA-029
    it('should return empty array when no atoms match status (boundary: zero results)', async () => {
      mockTypeOrmRepository.find.mockResolvedValue([]);

      const result = await repository.findByStatus('superseded');

      // IA-029: Empty result must be an empty array, not null or undefined
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    // @atom IA-029
    it('should query each valid status type correctly', async () => {
      mockTypeOrmRepository.find.mockResolvedValue([]);

      // IA-029: All three status types must be queryable
      await repository.findByStatus('draft');
      expect(mockTypeOrmRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'draft' } }),
      );

      await repository.findByStatus('committed');
      expect(mockTypeOrmRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'committed' } }),
      );

      await repository.findByStatus('superseded');
      expect(mockTypeOrmRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'superseded' } }),
      );
    });
  });

  // @atom IA-030
  describe('findByTags', () => {
    // @atom IA-030
    it('should return atoms matching any of the provided tags', async () => {
      const mockAtoms = [
        { id: '1', atomId: 'IA-001', tags: ['security', 'auth'] },
        { id: '2', atomId: 'IA-002', tags: ['security'] },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(mockAtoms as Atom[]);

      const result = await repository.findByTags(['security']);

      // IA-030: findByTags must return atoms that have ANY of the provided tags
      expect(result).toHaveLength(2);
      expect(result.every((atom) => atom.tags.includes('security'))).toBe(true);
      // IA-030: Must use PostgreSQL JSONB ?| operator for ANY tag matching
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('atom.tags ?| :tags', {
        tags: ['security'],
      });
    });

    // @atom IA-030 - Boundary: empty input
    it('should return empty array when tags array is empty (boundary: no tags provided)', async () => {
      const result = await repository.findByTags([]);

      // IA-030: Empty tags input must return empty array immediately without database query
      expect(result).toEqual([]);
      expect(mockTypeOrmRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    // @atom IA-030 - Boundary: single tag
    it('should handle single tag search correctly (boundary: minimum tags)', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.findByTags(['single-tag']);

      // IA-030: Single tag must be wrapped in array for JSONB operator
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('atom.tags ?| :tags', {
        tags: ['single-tag'],
      });
    });

    // @atom IA-030 - Boundary: multiple tags
    it('should handle multiple tags search correctly', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.findByTags(['tag1', 'tag2', 'tag3']);

      // IA-030: Multiple tags must all be passed to JSONB operator
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('atom.tags ?| :tags', {
        tags: ['tag1', 'tag2', 'tag3'],
      });
    });
  });

  // @atom IA-031
  describe('findByCategory', () => {
    // @atom IA-031
    it('should return atoms filtered by category', async () => {
      const mockAtoms = [{ id: '1', atomId: 'IA-001', category: 'security' }];
      mockTypeOrmRepository.find.mockResolvedValue(mockAtoms as Atom[]);

      const result = await repository.findByCategory('security');

      // IA-031: findByCategory must return only atoms with matching category
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('security');
      // IA-031: Must query with category filter and DESC order by createdAt
      expect(mockTypeOrmRepository.find).toHaveBeenCalledWith({
        where: { category: 'security' },
        order: { createdAt: 'DESC' },
      });
    });

    // @atom IA-031 - Boundary: all valid categories
    it('should accept all valid category types', async () => {
      mockTypeOrmRepository.find.mockResolvedValue([]);

      const validCategories = [
        'functional',
        'performance',
        'security',
        'reliability',
        'usability',
        'maintainability',
      ] as const;

      for (const category of validCategories) {
        await repository.findByCategory(category);
        // IA-031: Each valid category must be queryable
        expect(mockTypeOrmRepository.find).toHaveBeenCalledWith(
          expect.objectContaining({ where: { category } }),
        );
      }
    });

    // @atom IA-031 - Boundary: zero results
    it('should return empty array when no atoms match category', async () => {
      mockTypeOrmRepository.find.mockResolvedValue([]);

      const result = await repository.findByCategory('maintainability');

      // IA-031: Empty result must be array, not null
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // @atom IA-032
  describe('findSupersessionChain', () => {
    // @atom IA-032
    it('should return the supersession chain for an atom', async () => {
      const atom1 = { id: '1', atomId: 'IA-001', supersededBy: '2' };
      const atom2 = { id: '2', atomId: 'IA-002', supersededBy: '3' };
      const atom3 = { id: '3', atomId: 'IA-003', supersededBy: null };

      mockTypeOrmRepository.findOne
        .mockResolvedValueOnce(atom1 as Atom)
        .mockResolvedValueOnce(atom2 as Atom)
        .mockResolvedValueOnce(atom3 as Atom);

      const result = await repository.findSupersessionChain('1');

      // IA-032: Chain must contain all atoms from start to end in chronological order
      expect(result).toHaveLength(3);
      expect(result[0].atomId).toBe('IA-001');
      expect(result[1].atomId).toBe('IA-002');
      expect(result[2].atomId).toBe('IA-003');
      // IA-032: Last atom in chain must have no supersededBy reference
      expect(result[result.length - 1].supersededBy).toBeNull();
    });

    // @atom IA-032 - Negative: non-existent atom
    it('should return empty array when atom not found (negative: invalid ID)', async () => {
      mockTypeOrmRepository.findOne.mockResolvedValue(null);

      const result = await repository.findSupersessionChain('non-existent');

      // IA-032: Non-existent atom must return empty array, not throw error
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    // @atom IA-032 - Boundary: single atom (no supersession)
    it('should return single atom when not superseded (boundary: chain length 1)', async () => {
      const atom = { id: '1', atomId: 'IA-001', supersededBy: null };
      mockTypeOrmRepository.findOne.mockResolvedValue(atom as Atom);

      const result = await repository.findSupersessionChain('1');

      // IA-032: Non-superseded atom must return chain of length 1
      expect(result).toHaveLength(1);
      expect(result[0].atomId).toBe('IA-001');
      expect(result[0].supersededBy).toBeNull();
    });

    // @atom IA-032 - Boundary: search by atomId format
    it('should find atom by atomId format (IA-XXX)', async () => {
      const atom = { id: '1', atomId: 'IA-001', supersededBy: null };
      mockTypeOrmRepository.findOne.mockResolvedValue(atom as Atom);

      await repository.findSupersessionChain('IA-001');

      // IA-032: Must search by both UUID and atomId format
      expect(mockTypeOrmRepository.findOne).toHaveBeenCalledWith({
        where: [{ id: 'IA-001' }, { atomId: 'IA-001' }],
      });
    });
  });

  // @atom IA-033
  describe('search', () => {
    // @atom IA-033
    it('should apply text search filter with case-insensitive matching', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(1);
      mockQueryBuilder.getMany.mockResolvedValue([
        { id: '1', atomId: 'IA-001', description: 'login authentication' },
      ] as Atom[]);

      const result = await repository.search({ search: 'login' });

      // IA-033: Text search must use ILIKE for case-insensitive partial matching
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('atom.description ILIKE :search', {
        search: '%login%',
      });
      // IA-033: Search must return matching items
      expect(result.items).toHaveLength(1);
      expect(result.items[0].description).toContain('login');
    });

    // @atom IA-033
    it('should apply status filter with exact match', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.search({ status: 'committed' });

      // IA-033: Status filter must use exact equality, not partial match
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('atom.status = :status', {
        status: 'committed',
      });
    });

    // @atom IA-033 - Boundary: quality score range
    it('should apply quality score range filters (boundary: min and max)', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.search({ qualityScoreMin: 70, qualityScoreMax: 90 });

      // IA-033: Quality score range must filter atoms between min and max inclusive
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'atom.qualityScore >= :qualityScoreMin',
        { qualityScoreMin: 70 },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'atom.qualityScore <= :qualityScoreMax',
        { qualityScoreMax: 90 },
      );
    });

    // @atom IA-033 - Boundary: edge quality scores
    it('should accept boundary quality scores (0 and 100)', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.search({ qualityScoreMin: 0, qualityScoreMax: 100 });

      // IA-033: Boundary values 0 and 100 must be valid filter values
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'atom.qualityScore >= :qualityScoreMin',
        { qualityScoreMin: 0 },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'atom.qualityScore <= :qualityScoreMax',
        { qualityScoreMax: 100 },
      );
    });

    // @atom IA-033 - Pagination calculation
    it('should return correct pagination metadata', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(25);
      const mockItems = new Array<Atom>(10).fill({ id: '1' } as Atom);
      mockQueryBuilder.getMany.mockResolvedValue(mockItems);

      const result = await repository.search({ page: 2, limit: 10 });

      // IA-033: Pagination metadata must be calculated correctly
      expect(result.total).toBe(25);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      // IA-033: Total pages = ceil(25/10) = 3
      expect(result.totalPages).toBe(3);
      // IA-033: Page 2 of 3 has next page
      expect(result.hasNextPage).toBe(true);
      // IA-033: Page 2 has previous page (page 1)
      expect(result.hasPreviousPage).toBe(true);
      // IA-033: Skip calculation for page 2: (2-1) * 10 = 10
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    // @atom IA-033 - Boundary: first page
    it('should correctly identify first page (boundary: no previous page)', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(25);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await repository.search({ page: 1, limit: 10 });

      // IA-033: First page must not have previous page
      expect(result.page).toBe(1);
      expect(result.hasPreviousPage).toBe(false);
      expect(result.hasNextPage).toBe(true);
    });

    // @atom IA-033 - Boundary: last page
    it('should correctly identify last page (boundary: no next page)', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(25);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await repository.search({ page: 3, limit: 10 });

      // IA-033: Last page must not have next page
      expect(result.page).toBe(3);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(true);
    });

    // @atom IA-033 - Boundary: empty results
    it('should handle empty results correctly (boundary: zero items)', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await repository.search({ search: 'nonexistent' });

      // IA-033: Empty results must have correct metadata
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(false);
    });

    // @atom IA-033 - Default values
    it('should use default pagination when not specified', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await repository.search({});

      // IA-033: Defaults must be page=1, limit=20
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
    });
  });

  // @atom IA-034
  describe('getPopularTags', () => {
    // @atom IA-034
    it('should return tags with counts ordered by popularity', async () => {
      mockTypeOrmRepository.query.mockResolvedValue([
        { tag: 'security', count: '10' },
        { tag: 'auth', count: '5' },
      ]);

      const result = await repository.getPopularTags(10);

      // IA-034: Result must contain all returned tags
      expect(result).toHaveLength(2);
      // IA-034: First tag must be most popular with correct count
      expect(result[0]).toEqual({ tag: 'security', count: 10 });
      // IA-034: Second tag must have correct count
      expect(result[1]).toEqual({ tag: 'auth', count: 5 });
    });
  });

  // @atom IA-035
  describe('getStatistics', () => {
    // @atom IA-035
    it('should return comprehensive statistics', async () => {
      mockTypeOrmRepository.count.mockResolvedValue(100);
      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          { status: 'draft', count: '50' },
          { status: 'committed', count: '45' },
          { status: 'superseded', count: '5' },
        ])
        .mockResolvedValueOnce([
          { category: 'functional', count: '60' },
          { category: 'security', count: '30' },
          { category: 'performance', count: '10' },
        ]);
      mockQueryBuilder.getRawOne.mockResolvedValue({ avg: '82.5' });

      const result = await repository.getStatistics();

      // IA-035: Total count must be correct
      expect(result.total).toBe(100);
      // IA-035: Draft status count must be correct
      expect(result.byStatus.draft).toBe(50);
      // IA-035: Committed status count must be correct
      expect(result.byStatus.committed).toBe(45);
      // IA-035: Average quality score must be calculated correctly
      expect(result.averageQualityScore).toBe(82.5);
    });

    // @atom IA-035
    it('should return null averageQualityScore when no scores exist', async () => {
      mockTypeOrmRepository.count.mockResolvedValue(0);
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockQueryBuilder.getRawOne.mockResolvedValue({ avg: null });

      const result = await repository.getStatistics();

      // IA-035: Null average must be returned when no quality scores exist
      expect(result.averageQualityScore).toBeNull();
    });
  });

  // @atom IA-036
  describe('baseRepository', () => {
    // @atom IA-036
    it('should return the underlying TypeORM repository', () => {
      const baseRepo = repository.baseRepository;

      // IA-036: baseRepository getter must return exact TypeORM repository instance
      expect(baseRepo).toBe(mockTypeOrmRepository);
      // IA-036: Repository must not be null
      expect(baseRepo).not.toBe(null);
    });
  });

  // @atom IA-041 - Additional boundary tests
  describe('boundary and negative coverage', () => {
    // @atom IA-041
    it('should return zero total pages when no items exist', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await repository.search({});

      // Boundary: zero items must result in zero total pages
      expect(result.totalPages).toBe(0);
      // Boundary: total count must be zero
      expect(result.total).toBe(0);
    });

    // @atom IA-041
    it('should return null for averageQualityScore when no scores', async () => {
      mockTypeOrmRepository.count.mockResolvedValue(0);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockQueryBuilder.getRawOne.mockResolvedValue({ avg: null });

      const result = await repository.getStatistics();

      // Boundary: null average when no quality scores exist
      expect(result.averageQualityScore).toBe(null);
    });

    // @atom IA-041
    it('should handle atom not found in supersession chain', async () => {
      mockTypeOrmRepository.findOne.mockResolvedValue(null);

      const result = await repository.findSupersessionChain('invalid-id');

      // Negative: non-existent atom returns empty array
      expect(result.length).toBe(0);
    });

    // @atom IA-041
    it('should handle empty tags array input', async () => {
      const result = await repository.findByTags([]);

      // Boundary: empty tags input returns empty result
      expect(result.length).toBe(0);
    });

    // @atom IA-041
    it('should return null when finding superseding atom that does not exist', async () => {
      mockTypeOrmRepository.findOne.mockResolvedValue(null);

      const result = await repository.findSupersedingAtom('non-existent');

      // Negative: non-existent atom returns null
      expect(result).toBe(null);
    });

    // @atom IA-041
    it('should return null superseding atom when not superseded', async () => {
      const atom = { id: '1', supersededBy: null };
      mockTypeOrmRepository.findOne.mockResolvedValue(atom as Atom);

      const result = await repository.findSupersedingAtom('1');

      // Boundary: atom without supersededBy returns null
      expect(result).toBe(null);
    });

    // @atom IA-041
    it('should handle quality score min of zero', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.search({ qualityScoreMin: 0 });

      // Boundary: zero is valid minimum score
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'atom.qualityScore >= :qualityScoreMin',
        { qualityScoreMin: 0 },
      );
    });

    // @atom IA-041
    it('should handle undefined nextCursor when empty results', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await repository.search({});

      // Boundary: empty results have undefined cursor
      expect(result.nextCursor).toBe(undefined);
    });
  });

  // @atom IA-037
  describe('findByTagsAll', () => {
    // @atom IA-037
    it('should return atoms matching ALL of the provided tags', async () => {
      const mockAtoms = [{ id: '1', atomId: 'IA-001', tags: ['security', 'auth', 'login'] }];
      mockQueryBuilder.getMany.mockResolvedValue(mockAtoms as Atom[]);

      const result = await repository.findByTagsAll(['security', 'auth']);

      // IA-037: Result must contain atoms matching ALL tags
      expect(result).toHaveLength(1);
      // IA-037: Must use PostgreSQL ?& operator for ALL tag matching
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('atom.tags ?& :tags', {
        tags: ['security', 'auth'],
      });
    });

    // @atom IA-037
    it('should return empty array when tags array is empty', async () => {
      const result = await repository.findByTagsAll([]);

      // IA-037: Empty tags input must return empty array
      expect(result).toHaveLength(0);
      // IA-037: Query builder must not be called for empty input
      expect(mockTypeOrmRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // @atom IA-038
  describe('findSupersessionChain - edge cases', () => {
    // @atom IA-038
    it('should break chain when next atom not found', async () => {
      const atom1 = { id: '1', atomId: 'IA-001', supersededBy: '2' };
      // Next atom doesn't exist
      mockTypeOrmRepository.findOne
        .mockResolvedValueOnce(atom1 as Atom)
        .mockResolvedValueOnce(null);

      const result = await repository.findSupersessionChain('1');

      // IA-038: Chain must contain only found atoms
      expect(result).toHaveLength(1);
      // IA-038: First atom must be returned even if chain is broken
      expect(result[0].atomId).toBe('IA-001');
    });
  });

  // @atom IA-039
  describe('findSupersedingAtom', () => {
    // @atom IA-039
    it('should return the atom that supersedes a given atom', async () => {
      const originalAtom = { id: '1', atomId: 'IA-001', supersededBy: '2' };
      const supersedingAtom = { id: '2', atomId: 'IA-002' };

      mockTypeOrmRepository.findOne
        .mockResolvedValueOnce(originalAtom as Atom)
        .mockResolvedValueOnce(supersedingAtom as Atom);

      const result = await repository.findSupersedingAtom('1');

      // IA-039: Superseding atom must be returned
      expect(result?.id).toBe('2');
    });

    // @atom IA-039
    it('should return null when atom is not superseded', async () => {
      const atom = { id: '1', atomId: 'IA-001', supersededBy: null };
      mockTypeOrmRepository.findOne.mockResolvedValue(atom as Atom);

      const result = await repository.findSupersedingAtom('1');

      // IA-039: Non-superseded atom must return null
      expect(result).toBeNull();
    });

    // @atom IA-039
    it('should return null when atom not found', async () => {
      mockTypeOrmRepository.findOne.mockResolvedValue(null);

      const result = await repository.findSupersedingAtom('non-existent');

      // IA-039: Non-existent atom must return null
      expect(result).toBeNull();
    });
  });

  // @atom IA-040
  describe('search - comprehensive filters', () => {
    // @atom IA-040
    it('should apply category filter', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.search({ category: 'security' });

      // IA-040: Category filter must use exact equality
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('atom.category = :category', {
        category: 'security',
      });
    });

    // @atom IA-040
    it('should apply tags filter (any match)', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.search({ tags: ['security', 'auth'] });

      // IA-040: Tags filter must use ?| operator for ANY match
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('atom.tags ?| :tags', {
        tags: ['security', 'auth'],
      });
    });

    // @atom IA-040
    it('should apply tagsAll filter (all match)', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.search({ tagsAll: ['security', 'auth'] });

      // IA-040: TagsAll filter must use ?& operator for ALL match
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('atom.tags ?& :tagsAll', {
        tagsAll: ['security', 'auth'],
      });
    });

    // @atom IA-040
    it('should apply createdAfter date filter', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.search({ createdAfter: '2024-01-01' });

      // IA-040: CreatedAfter filter must use >= comparison
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('atom.createdAt >= :createdAfter', {
        createdAfter: new Date('2024-01-01'),
      });
    });

    // @atom IA-040
    it('should apply createdBefore date filter', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.search({ createdBefore: '2024-12-31' });

      // IA-040: CreatedBefore filter must use <= comparison
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('atom.createdAt <= :createdBefore', {
        createdBefore: new Date('2024-12-31'),
      });
    });

    // @atom IA-040
    it('should apply committedAfter date filter', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.search({ committedAfter: '2024-06-01' });

      // IA-040: CommittedAfter filter must use >= comparison
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'atom.committedAt >= :committedAfter',
        { committedAfter: new Date('2024-06-01') },
      );
    });

    // @atom IA-040
    it('should apply committedBefore date filter', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.search({ committedBefore: '2024-06-30' });

      // IA-040: CommittedBefore filter must use <= comparison
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'atom.committedAt <= :committedBefore',
        { committedBefore: new Date('2024-06-30') },
      );
    });

    // @atom IA-040
    it('should apply createdBy filter', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.search({ createdBy: 'user-123' });

      // IA-040: CreatedBy filter must use exact equality
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('atom.createdBy = :createdBy', {
        createdBy: 'user-123',
      });
    });

    // @atom IA-040
    it('should apply cursor filter for cursor-based pagination', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.search({ cursor: 'last-id' });

      // IA-040: Cursor filter must use > comparison for pagination
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('atom.id > :cursor', {
        cursor: 'last-id',
      });
    });

    // @atom IA-040
    it('should sort by qualityScore with COALESCE for null handling', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.search({ sortBy: 'qualityScore', sortOrder: 'DESC' });

      // IA-040: DESC sort must use COALESCE with -1 to put nulls last
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'COALESCE(atom.qualityScore, -1)',
        'DESC',
      );
    });

    // @atom IA-040
    it('should sort by qualityScore ASC with COALESCE', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await repository.search({ sortBy: 'qualityScore', sortOrder: 'ASC' });

      // IA-040: ASC sort must use COALESCE with 101 to put nulls last
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'COALESCE(atom.qualityScore, 101)',
        'ASC',
      );
    });

    // @atom IA-040
    it('should return nextCursor when items exist', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(5);
      mockQueryBuilder.getMany.mockResolvedValue([
        { id: 'item-1' },
        { id: 'item-2' },
        { id: 'item-3' },
      ] as Atom[]);

      const result = await repository.search({ page: 1, limit: 3 });

      // IA-040: Next cursor must be last item's ID
      expect(result.nextCursor).toBe('item-3');
    });

    // @atom IA-040
    it('should return undefined nextCursor when no items', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await repository.search({ page: 1, limit: 20 });

      // IA-040: Empty results must have undefined cursor
      expect(result.nextCursor).toBeUndefined();
    });
  });
});
