/**
 * Tests for TemplatesRepository
 *
 * Custom repository for ValidatorTemplates with specialized query methods
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TemplatesRepository } from './templates.repository';
import { ValidatorTemplate, TemplateCategory } from './validator-template.entity';
import { ValidatorFormat } from './validator.entity';

// Mock QueryBuilder type that includes both Select and Update query builder methods
type MockQueryBuilder = {
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock;
  getOne: jest.Mock;
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

describe('TemplatesRepository', () => {
  let repository: TemplatesRepository;
  let mockTypeOrmRepo: jest.Mocked<Repository<ValidatorTemplate>>;
  let mockQueryBuilder: MockQueryBuilder;

  const createMockTemplate = (overrides: Partial<ValidatorTemplate> = {}): ValidatorTemplate =>
    ({
      id: 'template-uuid-1',
      name: 'Authentication Template',
      description: 'Template for authentication validators',
      category: 'authentication' as TemplateCategory,
      format: 'gherkin' as ValidatorFormat,
      templateContent: 'Given a user exists\nWhen {action}\nThen {expected}',
      variables: ['action', 'expected'],
      exampleUsage: 'Example of how to use this template',
      tags: ['auth', 'security'],
      isBuiltin: true,
      usageCount: 10,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as ValidatorTemplate;

  beforeEach(async () => {
    mockQueryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
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
      query: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Repository<ValidatorTemplate>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesRepository,
        {
          provide: getRepositoryToken(ValidatorTemplate),
          useValue: mockTypeOrmRepo,
        },
      ],
    }).compile();

    repository = module.get<TemplatesRepository>(TemplatesRepository);
  });

  describe('repository instantiation', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });

    it('should expose base repository', () => {
      expect(repository.baseRepository).toBe(mockTypeOrmRepo);
    });
  });

  describe('findByCategory', () => {
    it('should find templates by category', async () => {
      const templates = [createMockTemplate()];
      mockTypeOrmRepo.find.mockResolvedValue(templates);

      const result = await repository.findByCategory('authentication');

      expect(result).toEqual(templates);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { category: 'authentication' },
        order: { usageCount: 'DESC', name: 'ASC' },
      });
    });

    it('should return empty array when no templates found', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([]);

      const result = await repository.findByCategory('custom');

      expect(result).toEqual([]);
    });
  });

  describe('findByFormat', () => {
    it('should find templates by format', async () => {
      const templates = [createMockTemplate({ format: 'typescript' })];
      mockTypeOrmRepo.find.mockResolvedValue(templates);

      const result = await repository.findByFormat('typescript');

      expect(result).toEqual(templates);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { format: 'typescript' },
        order: { usageCount: 'DESC', name: 'ASC' },
      });
    });
  });

  describe('findBuiltin', () => {
    it('should find only built-in templates', async () => {
      const builtinTemplates = [createMockTemplate({ isBuiltin: true })];
      mockTypeOrmRepo.find.mockResolvedValue(builtinTemplates);

      const result = await repository.findBuiltin();

      expect(result).toEqual(builtinTemplates);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { isBuiltin: true },
        order: { category: 'ASC', name: 'ASC' },
      });
    });
  });

  describe('findUserCreated', () => {
    it('should find only user-created templates', async () => {
      const userTemplates = [createMockTemplate({ isBuiltin: false })];
      mockTypeOrmRepo.find.mockResolvedValue(userTemplates);

      const result = await repository.findUserCreated();

      expect(result).toEqual(userTemplates);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { isBuiltin: false },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findByName', () => {
    it('should find template by name (case-insensitive)', async () => {
      const template = createMockTemplate({ name: 'Auth Template' });
      mockQueryBuilder.getOne.mockResolvedValue(template);

      const result = await repository.findByName('auth template');

      expect(result).toEqual(template);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('LOWER(template.name) = LOWER(:name)', {
        name: 'auth template',
      });
    });

    it('should return null when template not found', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      const result = await repository.findByName('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('search', () => {
    it('should search with default pagination', async () => {
      const templates = [createMockTemplate()];
      mockQueryBuilder.getMany.mockResolvedValue(templates);
      mockQueryBuilder.getCount.mockResolvedValue(1);

      const result = await repository.search({});

      expect(result).toEqual({
        items: templates,
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it('should apply category filter', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await repository.search({ category: 'authentication' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('template.category = :category', {
        category: 'authentication',
      });
    });

    it('should apply format filter', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await repository.search({ format: 'gherkin' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('template.format = :format', {
        format: 'gherkin',
      });
    });

    it('should apply isBuiltin filter', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await repository.search({ isBuiltin: true });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('template.isBuiltin = :isBuiltin', {
        isBuiltin: true,
      });
    });

    it('should apply tag filter', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await repository.search({ tag: 'security' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('template.tags @> :tag', {
        tag: JSON.stringify(['security']),
      });
    });

    it('should apply search filter on name, description, and tags', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await repository.search({ search: 'auth' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(template.name ILIKE :search OR template.description ILIKE :search OR template.tags::text ILIKE :search)',
        { search: '%auth%' },
      );
    });

    it('should apply custom sorting', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await repository.search({ sortBy: 'name', sortOrder: 'asc' });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('template.name', 'ASC');
    });

    it('should default to sorting by usageCount desc', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await repository.search({});

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('template.usageCount', 'DESC');
    });

    it('should apply pagination correctly', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(50);

      const result = await repository.search({ page: 3, limit: 10 });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(true);
      expect(result.totalPages).toBe(5);
    });
  });

  describe('getCategories', () => {
    it('should return categories with counts', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { category: 'authentication', count: '5' },
        { category: 'authorization', count: '3' },
      ]);

      const result = await repository.getCategories();

      expect(result).toEqual([
        { category: 'authentication', count: 5 },
        { category: 'authorization', count: 3 },
      ]);
      expect(mockQueryBuilder.groupBy).toHaveBeenCalledWith('template.category');
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('count', 'DESC');
    });

    it('should return empty array when no categories', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await repository.getCategories();

      expect(result).toEqual([]);
    });
  });

  describe('getPopularTags', () => {
    it('should return popular tags with counts', async () => {
      mockTypeOrmRepo.query.mockResolvedValue([
        { tag: 'security', count: '10' },
        { tag: 'auth', count: '8' },
        { tag: 'api', count: '5' },
      ]);

      const result = await repository.getPopularTags();

      expect(result).toEqual([
        { tag: 'security', count: 10 },
        { tag: 'auth', count: 8 },
        { tag: 'api', count: 5 },
      ]);
      expect(mockTypeOrmRepo.query).toHaveBeenCalledWith(expect.any(String), [20]);
    });

    it('should respect custom limit', async () => {
      mockTypeOrmRepo.query.mockResolvedValue([]);

      await repository.getPopularTags(10);

      expect(mockTypeOrmRepo.query).toHaveBeenCalledWith(expect.any(String), [10]);
    });
  });

  describe('incrementUsageCount', () => {
    it('should increment usage count', async () => {
      await repository.incrementUsageCount('template-123');

      expect(mockTypeOrmRepo.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(mockQueryBuilder.set).toHaveBeenCalledWith({
        usageCount: expect.any(Function),
      });
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('id = :id', { id: 'template-123' });
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });
  });

  describe('getStatistics', () => {
    it('should return template statistics', async () => {
      mockTypeOrmRepo.count
        .mockResolvedValueOnce(15) // total
        .mockResolvedValueOnce(10); // builtin

      mockQueryBuilder.getRawMany.mockResolvedValue([
        { category: 'authentication', count: '5' },
        { category: 'authorization', count: '3' },
        { category: 'data-integrity', count: '7' },
      ]);

      const result = await repository.getStatistics();

      expect(result).toEqual({
        total: 15,
        builtinCount: 10,
        userCreatedCount: 5,
        byCategory: {
          authentication: 5,
          authorization: 3,
          'data-integrity': 7,
          performance: 0,
          'state-transition': 0,
          'error-handling': 0,
          custom: 0,
        },
      });
    });

    it('should handle empty statistics', async () => {
      mockTypeOrmRepo.count.mockResolvedValue(0);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await repository.getStatistics();

      expect(result.total).toBe(0);
      expect(result.builtinCount).toBe(0);
      expect(result.userCreatedCount).toBe(0);
      expect(result.byCategory.authentication).toBe(0);
    });
  });
});
