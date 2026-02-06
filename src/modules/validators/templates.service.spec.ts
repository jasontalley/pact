import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplatesRepository } from './templates.repository';
import { ValidatorsService } from './validators.service';
import { ValidatorTemplate, TemplateCategory, ParameterSchema } from './validator-template.entity';
import { ValidatorFormat } from './validator.entity';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

/**
 * @atom IA-PHASE2-004 Validator templates provide reusable patterns
 * @atom IA-PHASE2-005 Templates can be instantiated with custom parameters
 * @atom IA-PHASE2-006 Built-in templates cannot be modified or deleted
 */
describe('TemplatesService', () => {
  let service: TemplatesService;
  let templatesRepository: jest.Mocked<TemplatesRepository>;
  let validatorsService: jest.Mocked<ValidatorsService>;

  const mockParametersSchema: ParameterSchema = {
    type: 'object',
    properties: {
      roleName: { type: 'string', description: 'The required role name' },
      resource: { type: 'string', description: 'The resource path to access' },
    },
    required: ['roleName', 'resource'],
  };

  const mockTemplate: ValidatorTemplate = {
    id: 'template-uuid-123',
    name: 'Role-Based Access Check',
    description: 'Validates that users with a specific role can access a resource',
    category: 'authorization' as TemplateCategory,
    format: 'gherkin' as ValidatorFormat,
    templateContent:
      'Given a user with role {{roleName}}\nWhen they access {{resource}}\nThen access is granted',
    parametersSchema: mockParametersSchema,
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

  const mockTemplatesRepository = {
    baseRepository: {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    },
    search: jest.fn(),
    findByCategory: jest.fn(),
    getCategories: jest.fn(),
    getPopularTags: jest.fn(),
    getStatistics: jest.fn(),
    incrementUsageCount: jest.fn(),
  };

  const mockValidatorsService = {
    create: jest.fn(),
    findAll: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        {
          provide: TemplatesRepository,
          useValue: mockTemplatesRepository,
        },
        {
          provide: ValidatorsService,
          useValue: mockValidatorsService,
        },
      ],
    }).compile();

    service = module.get<TemplatesService>(TemplatesService);
    templatesRepository = module.get(TemplatesRepository);
    validatorsService = module.get(ValidatorsService);
  });

  describe('create', () => {
    const createDto: CreateTemplateDto = {
      name: 'Role-Based Access Check',
      description: 'Validates that users with a specific role can access a resource',
      category: 'authorization',
      format: 'gherkin',
      templateContent:
        'Given a user with role {{roleName}}\nWhen they access {{resource}}\nThen access is granted',
      parametersSchema: mockParametersSchema,
      tags: ['rbac', 'security'],
    };

    it('should create a template with valid placeholders', async () => {
      // Arrange
      mockTemplatesRepository.baseRepository.create.mockReturnValue(mockTemplate);
      mockTemplatesRepository.baseRepository.save.mockResolvedValue(mockTemplate);

      // Act
      const result = await service.create(createDto);

      // Assert
      expect(templatesRepository.baseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: createDto.name,
          templateContent: createDto.templateContent,
        }),
      );
      expect(result).toEqual(mockTemplate);
    });

    it('should throw BadRequestException when template has no placeholders', async () => {
      // Arrange
      const invalidDto = {
        ...createDto,
        templateContent: 'No placeholders here',
      };

      // Act & Assert
      await expect(service.create(invalidDto)).rejects.toThrow(BadRequestException);
      expect(templatesRepository.baseRepository.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when required parameter is not in template', async () => {
      // Arrange
      const invalidDto = {
        ...createDto,
        templateContent: 'Given a user with role {{roleName}}\nThen access is granted', // missing {{resource}}
      };

      // Act & Assert
      await expect(service.create(invalidDto)).rejects.toThrow(BadRequestException);
    });

    it('should default isBuiltin to false', async () => {
      // Arrange
      mockTemplatesRepository.baseRepository.create.mockReturnValue(mockTemplate);
      mockTemplatesRepository.baseRepository.save.mockResolvedValue(mockTemplate);

      // Act
      await service.create(createDto);

      // Assert
      expect(templatesRepository.baseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isBuiltin: false,
        }),
      );
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
      mockTemplatesRepository.search.mockResolvedValue(paginatedResult);

      // Act
      const result = await service.findAll({ page: 1, limit: 20 });

      // Assert
      expect(result).toEqual(paginatedResult);
    });
  });

  describe('findByCategory', () => {
    it('should return templates in category', async () => {
      // Arrange
      mockTemplatesRepository.findByCategory.mockResolvedValue([mockTemplate]);

      // Act
      const result = await service.findByCategory('authorization');

      // Assert
      expect(result).toEqual([mockTemplate]);
      expect(templatesRepository.findByCategory).toHaveBeenCalledWith('authorization');
    });
  });

  describe('findOne', () => {
    it('should return template when found', async () => {
      // Arrange
      mockTemplatesRepository.baseRepository.findOne.mockResolvedValue(mockTemplate);

      // Act
      const result = await service.findOne('template-uuid-123');

      // Assert
      expect(result).toEqual(mockTemplate);
    });

    it('should throw NotFoundException when template not found', async () => {
      // Arrange
      mockTemplatesRepository.baseRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateDto: UpdateTemplateDto = {
      name: 'Updated Template Name',
      description: 'Updated description',
    };

    it('should update user-created template', async () => {
      // Arrange
      const userTemplate = { ...mockTemplate, isBuiltin: false };
      mockTemplatesRepository.baseRepository.findOne.mockResolvedValue(userTemplate);
      mockTemplatesRepository.baseRepository.save.mockImplementation((t) => Promise.resolve(t));

      // Act
      const result = await service.update('template-uuid-123', updateDto);

      // Assert
      expect(result.name).toBe(updateDto.name);
    });

    it('should throw ForbiddenException when updating built-in template', async () => {
      // Arrange
      const builtinTemplate = { ...mockTemplate, isBuiltin: true };
      mockTemplatesRepository.baseRepository.findOne.mockResolvedValue(builtinTemplate);

      // Act & Assert
      await expect(service.update('template-uuid-123', updateDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should validate new template content has placeholders', async () => {
      // Arrange
      const userTemplate = { ...mockTemplate, isBuiltin: false };
      mockTemplatesRepository.baseRepository.findOne.mockResolvedValue(userTemplate);

      // Act & Assert
      await expect(
        service.update('template-uuid-123', { templateContent: 'No placeholders' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should delete user-created template', async () => {
      // Arrange
      const userTemplate = { ...mockTemplate, isBuiltin: false };
      mockTemplatesRepository.baseRepository.findOne.mockResolvedValue(userTemplate);
      mockTemplatesRepository.baseRepository.remove.mockResolvedValue(userTemplate);

      // Act
      await service.remove('template-uuid-123');

      // Assert
      expect(templatesRepository.baseRepository.remove).toHaveBeenCalledWith(userTemplate);
    });

    it('should throw ForbiddenException when deleting built-in template', async () => {
      // Arrange
      const builtinTemplate = { ...mockTemplate, isBuiltin: true };
      mockTemplatesRepository.baseRepository.findOne.mockResolvedValue(builtinTemplate);

      // Act & Assert
      await expect(service.remove('template-uuid-123')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('instantiate', () => {
    const instantiateDto = {
      templateId: 'template-uuid-123',
      atomId: 'atom-uuid-123',
      parameters: { roleName: 'admin', resource: '/api/users' },
    };

    it('should create validator from template with parameters', async () => {
      // Arrange
      mockTemplatesRepository.baseRepository.findOne.mockResolvedValue(mockTemplate);
      mockValidatorsService.create.mockResolvedValue(mockValidator as any);
      mockTemplatesRepository.incrementUsageCount.mockResolvedValue(undefined);

      // Act
      const result = await service.instantiate(instantiateDto);

      // Assert
      expect(validatorsService.create).toHaveBeenCalled();
      const createCall = mockValidatorsService.create.mock.calls[0][0];
      expect(createCall.atomId).toBe('atom-uuid-123');
      expect(createCall.templateId).toBe('template-uuid-123');
      expect(createCall.parameters).toEqual(instantiateDto.parameters);
      expect(createCall.content).toContain('admin');
      expect(createCall.content).toContain('/api/users');
      expect(templatesRepository.incrementUsageCount).toHaveBeenCalledWith('template-uuid-123');
    });

    it('should throw BadRequestException when required parameter is missing', async () => {
      // Arrange
      mockTemplatesRepository.baseRepository.findOne.mockResolvedValue(mockTemplate);

      // Act & Assert
      await expect(
        service.instantiate({
          ...instantiateDto,
          parameters: { roleName: 'admin' }, // missing 'resource'
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when parameter has wrong type', async () => {
      // Arrange
      mockTemplatesRepository.baseRepository.findOne.mockResolvedValue(mockTemplate);

      // Act & Assert
      await expect(
        service.instantiate({
          ...instantiateDto,
          parameters: { roleName: 123, resource: '/api/users' }, // roleName should be string
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when unknown parameter is provided', async () => {
      // Arrange
      mockTemplatesRepository.baseRepository.findOne.mockResolvedValue(mockTemplate);

      // Act & Assert
      await expect(
        service.instantiate({
          ...instantiateDto,
          parameters: { roleName: 'admin', resource: '/api/users', unknownParam: 'value' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow custom name override', async () => {
      // Arrange
      mockTemplatesRepository.baseRepository.findOne.mockResolvedValue(mockTemplate);
      mockValidatorsService.create.mockResolvedValue(mockValidator as any);
      mockTemplatesRepository.incrementUsageCount.mockResolvedValue(undefined);

      // Act
      await service.instantiate({
        ...instantiateDto,
        name: 'Custom Validator Name',
      });

      // Assert
      expect(validatorsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Custom Validator Name',
        }),
      );
    });
  });

  describe('getCategories', () => {
    it('should return all categories with counts', async () => {
      // Arrange
      const categories = [
        { category: 'authorization' as TemplateCategory, count: 10 },
        { category: 'authentication' as TemplateCategory, count: 5 },
      ];
      mockTemplatesRepository.getCategories.mockResolvedValue(categories);

      // Act
      const result = await service.getCategories();

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
      mockTemplatesRepository.getPopularTags.mockResolvedValue(tags);

      // Act
      const result = await service.getPopularTags(10);

      // Assert
      expect(result).toEqual(tags);
      expect(templatesRepository.getPopularTags).toHaveBeenCalledWith(10);
    });
  });

  describe('getTemplateUsage', () => {
    it('should return validators created from template', async () => {
      // Arrange
      mockTemplatesRepository.baseRepository.findOne.mockResolvedValue(mockTemplate);
      mockValidatorsService.findAll.mockResolvedValue({
        items: [mockValidator as any],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      // Act
      const result = await service.getTemplateUsage('template-uuid-123');

      // Assert
      expect(result.templateId).toBe('template-uuid-123');
      expect(result.usageCount).toBe(5);
      expect(result.validators).toHaveLength(1);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics from repository', async () => {
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
      mockTemplatesRepository.getStatistics.mockResolvedValue(stats);

      // Act
      const result = await service.getStatistics();

      // Assert
      expect(result).toEqual(stats);
    });
  });
});
