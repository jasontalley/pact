/**
 * Tests for ValidatorsRepository
 *
 * Custom repository for Validators with specialized query methods
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ValidatorsRepository } from './validators.repository';
import { Validator, ValidatorType, ValidatorFormat } from './validator.entity';

// Mock QueryBuilder type that includes both Select and Update query builder methods
type MockQueryBuilder = {
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock;
  getCount: jest.Mock;
  select: jest.Mock;
  addSelect: jest.Mock;
  groupBy: jest.Mock;
  getRawMany: jest.Mock;
  update: jest.Mock;
  set: jest.Mock;
  where: jest.Mock;
  execute: jest.Mock;
};

describe('ValidatorsRepository', () => {
  let repository: ValidatorsRepository;
  let mockTypeOrmRepo: jest.Mocked<Repository<Validator>>;
  let mockQueryBuilder: MockQueryBuilder;

  const createMockValidator = (overrides: Partial<Validator> = {}): Validator =>
    ({
      id: 'validator-uuid-1',
      atomId: 'atom-uuid-1',
      templateId: null,
      name: 'Test Validator',
      description: 'Test description',
      validatorType: 'gherkin' as ValidatorType,
      format: 'gherkin' as ValidatorFormat,
      content: 'Given a user exists\nWhen they login\nThen they see dashboard',
      isActive: true,
      executionCount: 0,
      lastExecutedAt: null,
      cachedTranslations: {},
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as Validator;

  beforeEach(async () => {
    mockQueryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getCount: jest.fn().mockResolvedValue(0),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    } as MockQueryBuilder;

    mockTypeOrmRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    } as unknown as jest.Mocked<Repository<Validator>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidatorsRepository,
        {
          provide: getRepositoryToken(Validator),
          useValue: mockTypeOrmRepo,
        },
      ],
    }).compile();

    repository = module.get<ValidatorsRepository>(ValidatorsRepository);
  });

  describe('repository instantiation', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });

    it('should expose base repository', () => {
      expect(repository.baseRepository).toBe(mockTypeOrmRepo);
    });
  });

  describe('findByAtom', () => {
    it('should find validators by atom ID', async () => {
      const validators = [createMockValidator()];
      mockTypeOrmRepo.find.mockResolvedValue(validators);

      const result = await repository.findByAtom('atom-uuid-1');

      expect(result).toEqual(validators);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { atomId: 'atom-uuid-1' },
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array when no validators found', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([]);

      const result = await repository.findByAtom('nonexistent-atom');

      expect(result).toEqual([]);
    });
  });

  describe('findActiveByAtom', () => {
    it('should find only active validators by atom ID', async () => {
      const activeValidator = createMockValidator({ isActive: true });
      mockTypeOrmRepo.find.mockResolvedValue([activeValidator]);

      const result = await repository.findActiveByAtom('atom-uuid-1');

      expect(result).toEqual([activeValidator]);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { atomId: 'atom-uuid-1', isActive: true },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findByTemplate', () => {
    it('should find validators by template ID', async () => {
      const validators = [createMockValidator({ templateId: 'template-uuid-1' })];
      mockTypeOrmRepo.find.mockResolvedValue(validators);

      const result = await repository.findByTemplate('template-uuid-1');

      expect(result).toEqual(validators);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { templateId: 'template-uuid-1' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findByType', () => {
    it('should find validators by type', async () => {
      const validators = [createMockValidator({ validatorType: 'executable' })];
      mockTypeOrmRepo.find.mockResolvedValue(validators);

      const result = await repository.findByType('executable');

      expect(result).toEqual(validators);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { validatorType: 'executable' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findByFormat', () => {
    it('should find validators by format', async () => {
      const validators = [createMockValidator({ format: 'typescript' })];
      mockTypeOrmRepo.find.mockResolvedValue(validators);

      const result = await repository.findByFormat('typescript');

      expect(result).toEqual(validators);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { format: 'typescript' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('search', () => {
    it('should search with default pagination', async () => {
      const validators = [createMockValidator()];
      mockQueryBuilder.getMany.mockResolvedValue(validators);
      mockQueryBuilder.getCount.mockResolvedValue(1);

      const result = await repository.search({});

      expect(result).toEqual({
        items: validators,
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it('should apply atomId filter', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await repository.search({ atomId: 'atom-123' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('validator.atomId = :atomId', {
        atomId: 'atom-123',
      });
    });

    it('should apply validatorType filter', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await repository.search({ validatorType: 'gherkin' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'validator.validatorType = :validatorType',
        { validatorType: 'gherkin' },
      );
    });

    it('should apply format filter', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await repository.search({ format: 'typescript' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('validator.format = :format', {
        format: 'typescript',
      });
    });

    it('should apply isActive filter', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await repository.search({ isActive: true });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('validator.isActive = :isActive', {
        isActive: true,
      });
    });

    it('should apply templateId filter', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await repository.search({ templateId: 'template-123' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('validator.templateId = :templateId', {
        templateId: 'template-123',
      });
    });

    it('should apply search filter on name, description, and content', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await repository.search({ search: 'login' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(validator.name ILIKE :search OR validator.description ILIKE :search OR validator.content ILIKE :search)',
        { search: '%login%' },
      );
    });

    it('should apply custom sorting', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await repository.search({ sortBy: 'name', sortOrder: 'asc' });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('validator.name', 'ASC');
    });

    it('should apply pagination correctly', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(50);

      const result = await repository.search({ page: 2, limit: 10 });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(true);
      expect(result.totalPages).toBe(5);
    });

    it('should calculate pagination metadata correctly', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(100);

      const result = await repository.search({ page: 5, limit: 20 });

      expect(result.totalPages).toBe(5);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(true);
    });
  });

  describe('getCountByAtom', () => {
    it('should return count of validators for an atom', async () => {
      mockTypeOrmRepo.count.mockResolvedValue(5);

      const result = await repository.getCountByAtom('atom-123');

      expect(result).toBe(5);
      expect(mockTypeOrmRepo.count).toHaveBeenCalledWith({
        where: { atomId: 'atom-123' },
      });
    });
  });

  describe('getActiveCountByAtom', () => {
    it('should return count of active validators for an atom', async () => {
      mockTypeOrmRepo.count.mockResolvedValue(3);

      const result = await repository.getActiveCountByAtom('atom-123');

      expect(result).toBe(3);
      expect(mockTypeOrmRepo.count).toHaveBeenCalledWith({
        where: { atomId: 'atom-123', isActive: true },
      });
    });
  });

  describe('getStatistics', () => {
    it('should return validator statistics', async () => {
      mockTypeOrmRepo.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(8); // active

      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([
          { type: 'gherkin', count: '5' },
          { type: 'executable', count: '3' },
          { type: 'declarative', count: '2' },
        ])
        .mockResolvedValueOnce([
          { format: 'gherkin', count: '5' },
          { format: 'typescript', count: '3' },
          { format: 'natural_language', count: '2' },
        ]);

      const result = await repository.getStatistics();

      expect(result).toEqual({
        total: 10,
        byType: {
          gherkin: 5,
          executable: 3,
          declarative: 2,
        },
        byFormat: {
          gherkin: 5,
          natural_language: 2,
          typescript: 3,
          json: 0,
        },
        activeCount: 8,
        inactiveCount: 2,
      });
    });

    it('should handle empty statistics', async () => {
      mockTypeOrmRepo.count.mockResolvedValue(0);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await repository.getStatistics();

      expect(result.total).toBe(0);
      expect(result.activeCount).toBe(0);
      expect(result.byType.gherkin).toBe(0);
    });
  });

  describe('incrementExecutionCount', () => {
    it('should increment execution count and update lastExecutedAt', async () => {
      await repository.incrementExecutionCount('validator-123');

      expect(mockTypeOrmRepo.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(mockQueryBuilder.set).toHaveBeenCalledWith({
        executionCount: expect.any(Function),
        lastExecutedAt: expect.any(Date),
      });
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('id = :id', { id: 'validator-123' });
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });
  });
});
