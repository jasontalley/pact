import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ValidatorsService } from './validators.service';
import { ValidatorsRepository } from './validators.repository';
import { AtomsService } from '../atoms/atoms.service';
import { Validator, ValidatorType, ValidatorFormat } from './validator.entity';
import { CreateValidatorDto } from './dto/create-validator.dto';
import { UpdateValidatorDto } from './dto/update-validator.dto';

/**
 * @atom IA-PHASE2-001 Validators can be created and associated with Intent Atoms
 * @atom IA-PHASE2-002 Validators can be updated, activated, deactivated, and deleted
 * @atom IA-PHASE2-003 Validators support multiple formats (gherkin, natural_language, typescript, json)
 */
describe('ValidatorsService', () => {
  let service: ValidatorsService;
  let validatorsRepository: jest.Mocked<ValidatorsRepository>;
  let atomsService: jest.Mocked<AtomsService>;

  const mockAtom = {
    id: 'atom-uuid-123',
    atomId: 'IA-001',
    description: 'Test atom',
    status: 'draft',
    category: 'functional',
  };

  const mockValidator: Validator = {
    id: 'validator-uuid-123',
    atomId: 'atom-uuid-123',
    atom: mockAtom as any,
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

  const mockValidatorsRepository = {
    baseRepository: {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    },
    search: jest.fn(),
    findByAtom: jest.fn(),
    getCountByAtom: jest.fn(),
    getStatistics: jest.fn(),
    incrementExecutionCount: jest.fn(),
  };

  const mockAtomsService = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidatorsService,
        {
          provide: ValidatorsRepository,
          useValue: mockValidatorsRepository,
        },
        {
          provide: AtomsService,
          useValue: mockAtomsService,
        },
      ],
    }).compile();

    service = module.get<ValidatorsService>(ValidatorsService);
    validatorsRepository = module.get(ValidatorsRepository);
    atomsService = module.get(AtomsService);
  });

  describe('create', () => {
    const createDto: CreateValidatorDto = {
      atomId: 'atom-uuid-123',
      name: 'Test Validator',
      description: 'A test validator',
      validatorType: 'gherkin',
      content: 'Given a test\nWhen executed\nThen it passes',
      format: 'gherkin',
    };

    it('should create a validator when atom exists', async () => {
      // Arrange
      mockAtomsService.findOne.mockResolvedValue(mockAtom);
      mockValidatorsRepository.baseRepository.create.mockReturnValue(mockValidator);
      mockValidatorsRepository.baseRepository.save.mockResolvedValue(mockValidator);

      // Act
      const result = await service.create(createDto);

      // Assert
      expect(atomsService.findOne).toHaveBeenCalledWith(createDto.atomId);
      expect(validatorsRepository.baseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          atomId: createDto.atomId,
          name: createDto.name,
          originalFormat: createDto.format,
          isActive: true,
        }),
      );
      expect(result).toEqual(mockValidator);
    });

    it('should throw NotFoundException when atom does not exist', async () => {
      // Arrange
      mockAtomsService.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(createDto)).rejects.toThrow(NotFoundException);
      expect(validatorsRepository.baseRepository.create).not.toHaveBeenCalled();
    });

    it('should set originalFormat to match format when creating', async () => {
      // Arrange
      mockAtomsService.findOne.mockResolvedValue(mockAtom);
      mockValidatorsRepository.baseRepository.create.mockReturnValue(mockValidator);
      mockValidatorsRepository.baseRepository.save.mockResolvedValue(mockValidator);

      // Act
      await service.create({ ...createDto, format: 'natural_language' });

      // Assert
      expect(validatorsRepository.baseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          originalFormat: 'natural_language',
        }),
      );
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
      mockValidatorsRepository.search.mockResolvedValue(paginatedResult);

      // Act
      const result = await service.findAll({ page: 1, limit: 20 });

      // Assert
      expect(result).toEqual(paginatedResult);
      expect(validatorsRepository.search).toHaveBeenCalled();
    });

    it('should pass search criteria to repository', async () => {
      // Arrange
      const searchDto = {
        atomId: 'atom-uuid-123',
        validatorType: 'gherkin' as ValidatorType,
        isActive: true,
      };
      mockValidatorsRepository.search.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      // Act
      await service.findAll(searchDto);

      // Assert
      expect(validatorsRepository.search).toHaveBeenCalledWith(searchDto);
    });
  });

  describe('findByAtom', () => {
    it('should return validators for a valid atom', async () => {
      // Arrange
      mockAtomsService.findOne.mockResolvedValue(mockAtom);
      mockValidatorsRepository.findByAtom.mockResolvedValue([mockValidator]);

      // Act
      const result = await service.findByAtom('atom-uuid-123');

      // Assert
      expect(atomsService.findOne).toHaveBeenCalledWith('atom-uuid-123');
      expect(result).toEqual([mockValidator]);
    });

    it('should throw NotFoundException when atom does not exist', async () => {
      // Arrange
      mockAtomsService.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findByAtom('invalid-atom')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('should return validator when found', async () => {
      // Arrange
      mockValidatorsRepository.baseRepository.findOne.mockResolvedValue(mockValidator);

      // Act
      const result = await service.findOne('validator-uuid-123');

      // Assert
      expect(result).toEqual(mockValidator);
    });

    it('should throw NotFoundException when validator not found', async () => {
      // Arrange
      mockValidatorsRepository.baseRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne('invalid-id')).rejects.toThrow(NotFoundException);
    });

    it('should load atom relation', async () => {
      // Arrange
      mockValidatorsRepository.baseRepository.findOne.mockResolvedValue(mockValidator);

      // Act
      await service.findOne('validator-uuid-123');

      // Assert
      expect(validatorsRepository.baseRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'validator-uuid-123' },
        relations: ['atom'],
      });
    });
  });

  describe('update', () => {
    const updateDto: UpdateValidatorDto = {
      name: 'Updated Validator Name',
      description: 'Updated description',
    };

    it('should update validator when found', async () => {
      // Arrange
      const updatedValidator = { ...mockValidator, ...updateDto };
      mockValidatorsRepository.baseRepository.findOne.mockResolvedValue(mockValidator);
      mockValidatorsRepository.baseRepository.save.mockResolvedValue(updatedValidator);

      // Act
      const result = await service.update('validator-uuid-123', updateDto);

      // Assert
      expect(result.name).toBe(updateDto.name);
      expect(result.description).toBe(updateDto.description);
    });

    it('should clear cached translations when content changes', async () => {
      // Arrange
      const validatorWithCache = {
        ...mockValidator,
        translatedContent: { natural_language: 'cached translation' },
      };
      mockValidatorsRepository.baseRepository.findOne.mockResolvedValue(validatorWithCache);
      mockValidatorsRepository.baseRepository.save.mockImplementation((v) => Promise.resolve(v));

      // Act
      await service.update('validator-uuid-123', { content: 'New content here' });

      // Assert
      expect(validatorsRepository.baseRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          translatedContent: {},
        }),
      );
    });

    it('should throw NotFoundException when validator not found', async () => {
      // Arrange
      mockValidatorsRepository.baseRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.update('invalid-id', updateDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove (soft delete)', () => {
    it('should set isActive to false', async () => {
      // Arrange
      mockValidatorsRepository.baseRepository.findOne.mockResolvedValue(mockValidator);
      mockValidatorsRepository.baseRepository.save.mockImplementation((v) => Promise.resolve(v));

      // Act
      const result = await service.remove('validator-uuid-123');

      // Assert
      expect(result.isActive).toBe(false);
    });
  });

  describe('hardRemove', () => {
    it('should permanently delete validator', async () => {
      // Arrange
      mockValidatorsRepository.baseRepository.findOne.mockResolvedValue(mockValidator);
      mockValidatorsRepository.baseRepository.remove.mockResolvedValue(mockValidator);

      // Act
      await service.hardRemove('validator-uuid-123');

      // Assert
      expect(validatorsRepository.baseRepository.remove).toHaveBeenCalledWith(mockValidator);
    });
  });

  describe('activate', () => {
    it('should set isActive to true', async () => {
      // Arrange
      const inactiveValidator = { ...mockValidator, isActive: false };
      mockValidatorsRepository.baseRepository.findOne.mockResolvedValue(inactiveValidator);
      mockValidatorsRepository.baseRepository.save.mockImplementation((v) => Promise.resolve(v));

      // Act
      const result = await service.activate('validator-uuid-123');

      // Assert
      expect(result.isActive).toBe(true);
    });
  });

  describe('deactivate', () => {
    it('should set isActive to false', async () => {
      // Arrange
      mockValidatorsRepository.baseRepository.findOne.mockResolvedValue(mockValidator);
      mockValidatorsRepository.baseRepository.save.mockImplementation((v) => Promise.resolve(v));

      // Act
      const result = await service.deactivate('validator-uuid-123');

      // Assert
      expect(result.isActive).toBe(false);
    });
  });

  describe('getValidationStatus', () => {
    it('should return summary for atom', async () => {
      // Arrange - create validators with explicit isActive values
      const activeValidator: Validator = {
        ...mockValidator,
        id: 'active-validator',
        isActive: true,
      };
      const inactiveValidator: Validator = {
        ...mockValidator,
        id: 'inactive-validator',
        validatorType: 'executable' as ValidatorType,
        format: 'typescript' as ValidatorFormat,
        isActive: false,
      };
      const validators = [activeValidator, inactiveValidator];
      mockAtomsService.findOne.mockResolvedValue(mockAtom);
      mockValidatorsRepository.findByAtom.mockResolvedValue(validators);

      // Act
      const result = await service.getValidationStatus('atom-uuid-123');

      // Assert
      expect(result.atomId).toBe('atom-uuid-123');
      expect(result.totalValidators).toBe(2);
      expect(result.activeValidators).toBe(1);
      expect(result.inactiveValidators).toBe(1);
      expect(result.byType.gherkin).toBe(1);
      expect(result.byType.executable).toBe(1);
    });

    it('should throw NotFoundException when atom not found', async () => {
      // Arrange
      mockAtomsService.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getValidationStatus('invalid-atom')).rejects.toThrow(NotFoundException);
    });
  });

  describe('cacheTranslation', () => {
    it('should store translation in translatedContent', async () => {
      // Arrange
      mockValidatorsRepository.baseRepository.findOne.mockResolvedValue(mockValidator);
      mockValidatorsRepository.baseRepository.save.mockImplementation((v) => Promise.resolve(v));

      // Act
      const result = await service.cacheTranslation(
        'validator-uuid-123',
        'natural_language',
        'A test that passes when executed',
        0.95,
      );

      // Assert
      expect(result.translatedContent.natural_language).toBe('A test that passes when executed');
      expect(result.translatedContent.confidenceScores?.natural_language).toBe(0.95);
    });
  });

  describe('getTranslations', () => {
    it('should return original and cached translations', async () => {
      // Arrange
      const validatorWithTranslations = {
        ...mockValidator,
        translatedContent: {
          natural_language: 'Translated to natural language',
          translatedAt: { natural_language: new Date() },
          confidenceScores: { natural_language: 0.92 },
        },
      };
      mockValidatorsRepository.baseRepository.findOne.mockResolvedValue(validatorWithTranslations);

      // Act
      const result = await service.getTranslations('validator-uuid-123');

      // Assert
      expect(result.originalFormat).toBe('gherkin');
      expect(result.translations.gherkin.content).toBe(mockValidator.content);
      expect(result.translations.natural_language.content).toBe('Translated to natural language');
      expect(result.translations.natural_language.confidence).toBe(0.92);
    });
  });

  describe('recordExecution', () => {
    it('should increment execution count', async () => {
      // Arrange
      mockValidatorsRepository.incrementExecutionCount.mockResolvedValue(undefined);

      // Act
      await service.recordExecution('validator-uuid-123');

      // Assert
      expect(validatorsRepository.incrementExecutionCount).toHaveBeenCalledWith(
        'validator-uuid-123',
      );
    });
  });

  describe('getStatistics', () => {
    it('should return statistics from repository', async () => {
      // Arrange
      const stats = {
        total: 10,
        byType: { gherkin: 5, executable: 3, declarative: 2 },
        byFormat: { gherkin: 5, typescript: 3, natural_language: 2, json: 0 },
        activeCount: 8,
        inactiveCount: 2,
      };
      mockValidatorsRepository.getStatistics.mockResolvedValue(stats);

      // Act
      const result = await service.getStatistics();

      // Assert
      expect(result).toEqual(stats);
    });
  });
});
