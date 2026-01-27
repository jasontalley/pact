import { Test, TestingModule } from '@nestjs/testing';
import { ValidatorsController } from './validators.controller';
import { ValidatorsService } from './validators.service';
import { ValidatorTranslationService } from './validator-translation.service';
import { ValidatorType, ValidatorFormat } from './validator.entity';

/**
 * @atom IA-PHASE2-007 Validator CRUD endpoints work correctly
 */
describe('ValidatorsController', () => {
  let controller: ValidatorsController;
  let service: jest.Mocked<ValidatorsService>;
  let translationService: jest.Mocked<ValidatorTranslationService>;

  const mockValidator = {
    id: 'validator-uuid-123',
    atomId: 'atom-uuid-123',
    name: 'Test Validator',
    description: 'A test validator',
    validatorType: 'gherkin' as ValidatorType,
    content: 'Given a test\nWhen executed\nThen it passes',
    format: 'gherkin' as ValidatorFormat,
    originalFormat: 'gherkin' as ValidatorFormat,
    translatedContent: {},
    templateId: null,
    parameters: {},
    isActive: true,
    executionCount: 0,
    lastExecutedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
  };

  const mockValidatorsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    hardRemove: jest.fn(),
    activate: jest.fn(),
    deactivate: jest.fn(),
    getStatistics: jest.fn(),
    getTranslations: jest.fn(),
    cacheTranslation: jest.fn(),
  };

  const mockTranslationService = {
    translate: jest.fn(),
    validateTranslation: jest.fn(),
    testRoundTrip: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ValidatorsController],
      providers: [
        {
          provide: ValidatorsService,
          useValue: mockValidatorsService,
        },
        {
          provide: ValidatorTranslationService,
          useValue: mockTranslationService,
        },
      ],
    }).compile();

    controller = module.get<ValidatorsController>(ValidatorsController);
    service = module.get(ValidatorsService);
    translationService = module.get(ValidatorTranslationService);
  });

  describe('create', () => {
    it('should create a validator', async () => {
      // Arrange
      const createDto = {
        atomId: 'atom-uuid-123',
        name: 'Test Validator',
        validatorType: 'gherkin' as ValidatorType,
        content: 'Given a test\nWhen executed\nThen it passes',
        format: 'gherkin' as ValidatorFormat,
      };
      mockValidatorsService.create.mockResolvedValue(mockValidator);

      // Act
      const result = await controller.create(createDto);

      // Assert
      expect(service.create).toHaveBeenCalledWith(createDto);
      expect(result).toEqual(mockValidator);
    });
  });

  describe('findAll', () => {
    it('should return paginated validators', async () => {
      // Arrange
      const paginatedResult = {
        items: [mockValidator],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      };
      mockValidatorsService.findAll.mockResolvedValue(paginatedResult);

      // Act
      const result = await controller.findAll({ page: 1, limit: 20 });

      // Assert
      expect(result).toEqual(paginatedResult);
    });
  });

  describe('findOne', () => {
    it('should return a validator by ID', async () => {
      // Arrange
      mockValidatorsService.findOne.mockResolvedValue(mockValidator);

      // Act
      const result = await controller.findOne('validator-uuid-123');

      // Assert
      expect(service.findOne).toHaveBeenCalledWith('validator-uuid-123');
      expect(result).toEqual(mockValidator);
    });
  });

  describe('getTranslations', () => {
    it('should return cached translations', async () => {
      // Arrange
      const translations = {
        id: 'validator-uuid-123',
        originalFormat: 'gherkin' as ValidatorFormat,
        translations: {
          gherkin: { content: mockValidator.content },
        },
      };
      mockValidatorsService.getTranslations.mockResolvedValue(translations);

      // Act
      const result = await controller.getTranslations('validator-uuid-123');

      // Assert
      expect(result).toEqual(translations);
    });
  });

  describe('update', () => {
    it('should update a validator', async () => {
      // Arrange
      const updateDto = { name: 'Updated Name' };
      const updatedValidator = { ...mockValidator, ...updateDto };
      mockValidatorsService.update.mockResolvedValue(updatedValidator);

      // Act
      const result = await controller.update('validator-uuid-123', updateDto);

      // Assert
      expect(service.update).toHaveBeenCalledWith('validator-uuid-123', updateDto);
      expect(result.name).toBe('Updated Name');
    });
  });

  describe('activate', () => {
    it('should activate a validator', async () => {
      // Arrange
      const activeValidator = { ...mockValidator, isActive: true };
      mockValidatorsService.activate.mockResolvedValue(activeValidator);

      // Act
      const result = await controller.activate('validator-uuid-123');

      // Assert
      expect(service.activate).toHaveBeenCalledWith('validator-uuid-123');
      expect(result.isActive).toBe(true);
    });
  });

  describe('deactivate', () => {
    it('should deactivate a validator', async () => {
      // Arrange
      const inactiveValidator = { ...mockValidator, isActive: false };
      mockValidatorsService.deactivate.mockResolvedValue(inactiveValidator);

      // Act
      const result = await controller.deactivate('validator-uuid-123');

      // Assert
      expect(service.deactivate).toHaveBeenCalledWith('validator-uuid-123');
      expect(result.isActive).toBe(false);
    });
  });

  describe('remove', () => {
    it('should soft delete a validator', async () => {
      // Arrange
      const deactivatedValidator = { ...mockValidator, isActive: false };
      mockValidatorsService.remove.mockResolvedValue(deactivatedValidator);

      // Act
      const result = await controller.remove('validator-uuid-123');

      // Assert
      expect(service.remove).toHaveBeenCalledWith('validator-uuid-123');
      expect(result.isActive).toBe(false);
    });
  });

  describe('hardRemove', () => {
    it('should permanently delete a validator', async () => {
      // Arrange
      mockValidatorsService.hardRemove.mockResolvedValue(undefined);

      // Act
      await controller.hardRemove('validator-uuid-123');

      // Assert
      expect(service.hardRemove).toHaveBeenCalledWith('validator-uuid-123');
    });
  });

  describe('getStatistics', () => {
    it('should return validator statistics', async () => {
      // Arrange
      const stats = {
        total: 10,
        byType: { gherkin: 5, executable: 3, declarative: 2 },
        byFormat: { gherkin: 5, typescript: 3, natural_language: 2, json: 0 },
        activeCount: 8,
        inactiveCount: 2,
      };
      mockValidatorsService.getStatistics.mockResolvedValue(stats);

      // Act
      const result = await controller.getStatistics();

      // Assert
      expect(result).toEqual(stats);
    });
  });

  // ========================
  // Translation Endpoint Tests
  // ========================

  describe('translate', () => {
    it('should translate content between formats', async () => {
      // Arrange
      const dto = {
        content: 'Given a user exists\nWhen they log in\nThen they see dashboard',
        sourceFormat: 'gherkin' as ValidatorFormat,
        targetFormat: 'natural_language' as ValidatorFormat,
      };
      const translationResult = {
        content: 'When a user exists and logs in, they should see the dashboard',
        sourceFormat: 'gherkin' as ValidatorFormat,
        targetFormat: 'natural_language' as ValidatorFormat,
        confidence: 0.95,
        warnings: [],
        wasLLMUsed: true,
      };
      mockTranslationService.translate.mockResolvedValue(translationResult);

      // Act
      const result = await controller.translate(dto);

      // Assert
      expect(translationService.translate).toHaveBeenCalledWith(
        dto.content,
        dto.sourceFormat,
        dto.targetFormat,
      );
      expect(result).toEqual(translationResult);
    });

    it('should return warnings when translation has issues', async () => {
      // Arrange
      const dto = {
        content: 'ambiguous test content',
        sourceFormat: 'natural_language' as ValidatorFormat,
        targetFormat: 'gherkin' as ValidatorFormat,
      };
      const translationResult = {
        content: 'Given ambiguous test content\nThen result is unclear',
        sourceFormat: 'natural_language' as ValidatorFormat,
        targetFormat: 'gherkin' as ValidatorFormat,
        confidence: 0.6,
        warnings: ['Low confidence translation', 'Missing explicit assertions'],
        wasLLMUsed: true,
      };
      mockTranslationService.translate.mockResolvedValue(translationResult);

      // Act
      const result = await controller.translate(dto);

      // Assert
      expect(result.confidence).toBe(0.6);
      expect(result.warnings).toHaveLength(2);
    });
  });

  describe('translateValidator', () => {
    it('should translate an existing validator and cache the result', async () => {
      // Arrange
      const validatorId = 'validator-uuid-123';
      const targetFormat = 'typescript' as ValidatorFormat;

      mockValidatorsService.findOne.mockResolvedValue(mockValidator);

      const translationResult = {
        content: 'expect(test).toPass()',
        sourceFormat: 'gherkin' as ValidatorFormat,
        targetFormat: 'typescript' as ValidatorFormat,
        confidence: 0.9,
        warnings: [],
        wasLLMUsed: true,
      };
      mockTranslationService.translate.mockResolvedValue(translationResult);

      const updatedValidator = {
        ...mockValidator,
        translatedContent: { typescript: { content: translationResult.content, confidence: 0.9 } },
      };
      mockValidatorsService.cacheTranslation.mockResolvedValue(updatedValidator);

      // Act
      const result = await controller.translateValidator(validatorId, targetFormat);

      // Assert
      expect(service.findOne).toHaveBeenCalledWith(validatorId);
      expect(translationService.translate).toHaveBeenCalledWith(
        mockValidator.content,
        mockValidator.format,
        targetFormat,
      );
      expect(service.cacheTranslation).toHaveBeenCalledWith(
        validatorId,
        targetFormat,
        translationResult.content,
        translationResult.confidence,
      );
      expect(result.translation).toEqual(translationResult);
      expect(result.validator).toEqual(updatedValidator);
    });

    it('should handle translation to multiple formats', async () => {
      // Arrange
      mockValidatorsService.findOne.mockResolvedValue(mockValidator);

      const translationResult = {
        content: '{"test": "passes"}',
        sourceFormat: 'gherkin' as ValidatorFormat,
        targetFormat: 'json' as ValidatorFormat,
        confidence: 0.85,
        warnings: [],
        wasLLMUsed: false,
      };
      mockTranslationService.translate.mockResolvedValue(translationResult);
      mockValidatorsService.cacheTranslation.mockResolvedValue({
        ...mockValidator,
        translatedContent: { json: { content: translationResult.content } },
      });

      // Act
      const result = await controller.translateValidator(
        'validator-uuid-123',
        'json' as ValidatorFormat,
      );

      // Assert
      expect(result.translation.wasLLMUsed).toBe(false);
      expect(result.translation.confidence).toBe(0.85);
    });
  });

  describe('validateTranslation', () => {
    it('should validate semantic equivalence of a translation', async () => {
      // Arrange
      const validatorId = 'validator-uuid-123';
      const body = {
        translatedContent: 'expect(user).toBeLoggedIn()',
        targetFormat: 'typescript' as ValidatorFormat,
      };

      mockValidatorsService.findOne.mockResolvedValue(mockValidator);

      const validationResult = {
        isValid: true,
        semanticEquivalence: 0.92,
        warnings: [],
        suggestions: [],
      };
      mockTranslationService.validateTranslation.mockResolvedValue(validationResult);

      // Act
      const result = await controller.validateTranslation(validatorId, body);

      // Assert
      expect(service.findOne).toHaveBeenCalledWith(validatorId);
      expect(translationService.validateTranslation).toHaveBeenCalledWith(
        mockValidator.content,
        body.translatedContent,
        mockValidator.format,
        body.targetFormat,
      );
      expect(result).toEqual(validationResult);
    });

    it('should return validation issues when translation is not equivalent', async () => {
      // Arrange
      const validatorId = 'validator-uuid-123';
      const body = {
        translatedContent: 'incorrect translation',
        targetFormat: 'typescript' as ValidatorFormat,
      };

      mockValidatorsService.findOne.mockResolvedValue(mockValidator);

      const validationResult = {
        isValid: false,
        semanticEquivalence: 0.4,
        warnings: ['Missing preconditions', 'Assertion does not match original intent'],
        suggestions: ['Add Given clause equivalent', 'Verify expected outcome'],
      };
      mockTranslationService.validateTranslation.mockResolvedValue(validationResult);

      // Act
      const result = await controller.validateTranslation(validatorId, body);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.semanticEquivalence).toBe(0.4);
      expect(result.warnings).toHaveLength(2);
      expect(result.suggestions).toHaveLength(2);
    });
  });

  describe('testRoundTrip', () => {
    it('should test round-trip translation preservation', async () => {
      // Arrange
      const validatorId = 'validator-uuid-123';
      const targetFormat = 'natural_language' as ValidatorFormat;

      mockValidatorsService.findOne.mockResolvedValue(mockValidator);

      const roundTripResult = {
        originalContent: mockValidator.content,
        translatedContent: 'When a test is executed, it passes',
        roundTripContent: 'Given a test\nWhen executed\nThen it passes',
        preservationScore: 0.95,
        isAcceptable: true,
        differences: [],
      };
      mockTranslationService.testRoundTrip.mockResolvedValue(roundTripResult);

      // Act
      const result = await controller.testRoundTrip(validatorId, targetFormat);

      // Assert
      expect(service.findOne).toHaveBeenCalledWith(validatorId);
      expect(translationService.testRoundTrip).toHaveBeenCalledWith(
        mockValidator.content,
        mockValidator.format,
        targetFormat,
      );
      expect(result).toEqual(roundTripResult);
      expect(result.isAcceptable).toBe(true);
    });

    it('should detect information loss in round-trip translation', async () => {
      // Arrange
      const validatorId = 'validator-uuid-123';
      const targetFormat = 'json' as ValidatorFormat;

      mockValidatorsService.findOne.mockResolvedValue(mockValidator);

      const roundTripResult = {
        originalContent: mockValidator.content,
        translatedContent: '{"given":"a test","when":"executed","then":"passes"}',
        roundTripContent: 'Given a test\nWhen executed\nThen passes',
        preservationScore: 0.7,
        isAcceptable: false,
        differences: ['Missing "it" in assertion', 'Structural formatting lost'],
      };
      mockTranslationService.testRoundTrip.mockResolvedValue(roundTripResult);

      // Act
      const result = await controller.testRoundTrip(validatorId, targetFormat);

      // Assert
      expect(result.isAcceptable).toBe(false);
      expect(result.preservationScore).toBe(0.7);
      expect(result.differences).toHaveLength(2);
    });
  });

  // ========================
  // Translation Service Unavailable Tests
  // ========================

  describe('translation endpoints without translation service', () => {
    let controllerWithoutTranslation: ValidatorsController;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [ValidatorsController],
        providers: [
          {
            provide: ValidatorsService,
            useValue: mockValidatorsService,
          },
          // Note: No ValidatorTranslationService provided
        ],
      }).compile();

      controllerWithoutTranslation = module.get<ValidatorsController>(ValidatorsController);
    });

    it('translate should throw when translation service unavailable', async () => {
      // Arrange
      const dto = {
        content: 'test content',
        sourceFormat: 'gherkin' as ValidatorFormat,
        targetFormat: 'typescript' as ValidatorFormat,
      };

      // Act & Assert
      await expect(controllerWithoutTranslation.translate(dto)).rejects.toThrow(
        'Translation service is not available',
      );
    });

    it('translateValidator should throw when translation service unavailable', async () => {
      // Act & Assert
      await expect(
        controllerWithoutTranslation.translateValidator(
          'validator-uuid-123',
          'typescript' as ValidatorFormat,
        ),
      ).rejects.toThrow('Translation service is not available');
    });

    it('validateTranslation should throw when translation service unavailable', async () => {
      // Arrange
      const body = {
        translatedContent: 'test',
        targetFormat: 'typescript' as ValidatorFormat,
      };

      // Act & Assert
      await expect(
        controllerWithoutTranslation.validateTranslation('validator-uuid-123', body),
      ).rejects.toThrow('Translation service is not available');
    });

    it('testRoundTrip should throw when translation service unavailable', async () => {
      // Act & Assert
      await expect(
        controllerWithoutTranslation.testRoundTrip(
          'validator-uuid-123',
          'typescript' as ValidatorFormat,
        ),
      ).rejects.toThrow('Translation service is not available');
    });
  });
});
