import { Test, TestingModule } from '@nestjs/testing';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { TemplateCategory } from './validator-template.entity';
import { ValidatorFormat } from './validator.entity';

/**
 * @atom IA-PHASE2-008 Template CRUD endpoints work correctly
 */
describe('TemplatesController', () => {
  let controller: TemplatesController;
  let service: jest.Mocked<TemplatesService>;

  const mockTemplate = {
    id: 'template-uuid-123',
    name: 'Role-Based Access Check',
    description: 'Validates role-based access',
    category: 'authorization' as TemplateCategory,
    format: 'gherkin' as ValidatorFormat,
    templateContent:
      'Given a user with role {{roleName}}\nWhen they access {{resource}}\nThen access is granted',
    parametersSchema: {
      type: 'object' as const,
      properties: {
        roleName: { type: 'string' as const, description: 'Role name' },
        resource: { type: 'string' as const, description: 'Resource path' },
      },
      required: ['roleName', 'resource'],
    },
    exampleUsage: 'roleName: admin, resource: /api/users',
    tags: ['rbac', 'security'],
    isBuiltin: false,
    usageCount: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
  };

  const mockValidator = {
    id: 'validator-uuid-456',
    atomId: 'atom-uuid-123',
    name: 'Role-Based Access Check - admin',
    content: 'Given a user with role admin\nWhen they access /api/users\nThen access is granted',
    format: 'gherkin',
    templateId: 'template-uuid-123',
    parameters: { roleName: 'admin', resource: '/api/users' },
  };

  const mockTemplatesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByCategory: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    instantiate: jest.fn(),
    getCategories: jest.fn(),
    getPopularTags: jest.fn(),
    getStatistics: jest.fn(),
    getTemplateUsage: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatesController],
      providers: [
        {
          provide: TemplatesService,
          useValue: mockTemplatesService,
        },
      ],
    }).compile();

    controller = module.get<TemplatesController>(TemplatesController);
    service = module.get(TemplatesService);
  });

  describe('create', () => {
    it('should create a template', async () => {
      // Arrange
      const createDto = {
        name: 'Role-Based Access Check',
        description: 'Validates role-based access',
        category: 'authorization' as TemplateCategory,
        format: 'gherkin' as ValidatorFormat,
        templateContent:
          'Given a user with role {{roleName}}\nWhen they access {{resource}}\nThen access is granted',
        parametersSchema: mockTemplate.parametersSchema,
      };
      mockTemplatesService.create.mockResolvedValue(mockTemplate);

      // Act
      const result = await controller.create(createDto);

      // Assert
      expect(service.create).toHaveBeenCalledWith(createDto);
      expect(result).toEqual(mockTemplate);
    });
  });

  describe('findAll', () => {
    it('should return paginated templates', async () => {
      // Arrange
      const paginatedResult = {
        items: [mockTemplate],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      };
      mockTemplatesService.findAll.mockResolvedValue(paginatedResult);

      // Act
      const result = await controller.findAll({ page: 1, limit: 20 });

      // Assert
      expect(result).toEqual(paginatedResult);
    });
  });

  describe('getCategories', () => {
    it('should return all categories with counts', async () => {
      // Arrange
      const categories = [
        { category: 'authorization' as TemplateCategory, count: 10 },
        { category: 'authentication' as TemplateCategory, count: 5 },
      ];
      mockTemplatesService.getCategories.mockResolvedValue(categories);

      // Act
      const result = await controller.getCategories();

      // Assert
      expect(result).toEqual(categories);
    });
  });

  describe('getPopularTags', () => {
    it('should return popular tags', async () => {
      // Arrange
      const tags = [
        { tag: 'security', count: 15 },
        { tag: 'rbac', count: 10 },
      ];
      mockTemplatesService.getPopularTags.mockResolvedValue(tags);

      // Act
      const result = await controller.getPopularTags(10);

      // Assert
      expect(result).toEqual(tags);
    });
  });

  describe('findByCategory', () => {
    it('should return templates in a category', async () => {
      // Arrange
      mockTemplatesService.findByCategory.mockResolvedValue([mockTemplate]);

      // Act
      const result = await controller.findByCategory('authorization');

      // Assert
      expect(service.findByCategory).toHaveBeenCalledWith('authorization');
      expect(result).toEqual([mockTemplate]);
    });
  });

  describe('findOne', () => {
    it('should return a template by ID', async () => {
      // Arrange
      mockTemplatesService.findOne.mockResolvedValue(mockTemplate);

      // Act
      const result = await controller.findOne('template-uuid-123');

      // Assert
      expect(service.findOne).toHaveBeenCalledWith('template-uuid-123');
      expect(result).toEqual(mockTemplate);
    });
  });

  describe('getUsage', () => {
    it('should return template usage information', async () => {
      // Arrange
      const usage = {
        templateId: 'template-uuid-123',
        usageCount: 5,
        validators: [mockValidator],
      };
      mockTemplatesService.getTemplateUsage.mockResolvedValue(usage);

      // Act
      const result = await controller.getUsage('template-uuid-123');

      // Assert
      expect(service.getTemplateUsage).toHaveBeenCalledWith('template-uuid-123');
      expect(result).toEqual(usage);
    });
  });

  describe('instantiate', () => {
    it('should create a validator from template', async () => {
      // Arrange
      const instantiateDto = {
        atomId: 'atom-uuid-123',
        parameters: { roleName: 'admin', resource: '/api/users' },
      };
      mockTemplatesService.instantiate.mockResolvedValue(mockValidator as any);

      // Act
      const result = await controller.instantiate('template-uuid-123', instantiateDto);

      // Assert
      expect(service.instantiate).toHaveBeenCalledWith({
        ...instantiateDto,
        templateId: 'template-uuid-123',
      });
      expect(result).toEqual(mockValidator);
    });
  });

  describe('update', () => {
    it('should update a template', async () => {
      // Arrange
      const updateDto = { name: 'Updated Template Name' };
      const updatedTemplate = { ...mockTemplate, ...updateDto };
      mockTemplatesService.update.mockResolvedValue(updatedTemplate);

      // Act
      const result = await controller.update('template-uuid-123', updateDto);

      // Assert
      expect(service.update).toHaveBeenCalledWith('template-uuid-123', updateDto);
      expect(result.name).toBe('Updated Template Name');
    });
  });

  describe('remove', () => {
    it('should delete a template', async () => {
      // Arrange
      mockTemplatesService.remove.mockResolvedValue(undefined);

      // Act
      await controller.remove('template-uuid-123');

      // Assert
      expect(service.remove).toHaveBeenCalledWith('template-uuid-123');
    });
  });

  describe('getStatistics', () => {
    it('should return template statistics', async () => {
      // Arrange
      const stats = {
        total: 25,
        builtinCount: 20,
        userCreatedCount: 5,
        byCategory: {
          authentication: 5,
          authorization: 7,
          'data-integrity': 5,
          performance: 3,
          'state-transition': 3,
          'error-handling': 2,
          custom: 0,
        },
      };
      mockTemplatesService.getStatistics.mockResolvedValue(stats);

      // Act
      const result = await controller.getStatistics();

      // Assert
      expect(result).toEqual(stats);
    });
  });
});
