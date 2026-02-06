import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { InvariantsController } from './invariants.controller';
import { InvariantsService } from './invariants.service';

describe('InvariantsController', () => {
  let controller: InvariantsController;
  let service: InvariantsService;

  const mockInvariantsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findEnabled: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
    copyForProject: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvariantsController],
      providers: [
        {
          provide: InvariantsService,
          useValue: mockInvariantsService,
        },
      ],
    }).compile();

    controller = module.get<InvariantsController>(InvariantsController);
    service = module.get<InvariantsService>(InvariantsService);
    jest.clearAllMocks();
  });

  describe('controller instantiation', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a new custom invariant', async () => {
      const createDto = {
        invariantId: 'INV-010',
        name: 'Custom Invariant',
        description: 'A custom invariant',
        checkType: 'custom' as const,
        errorMessage: 'Error',
      };

      const expectedResult = {
        id: 'test-uuid',
        ...createDto,
        projectId: null,
        isEnabled: true,
        isBlocking: true,
        checkConfig: {},
        suggestionPrompt: null,
        isBuiltin: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockInvariantsService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(createDto);

      expect(result).toEqual(expectedResult);
      expect(mockInvariantsService.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('findAll', () => {
    it('should return all global invariants when no projectId', async () => {
      const invariants = [
        { id: 'uuid-1', invariantId: 'INV-001' },
        { id: 'uuid-2', invariantId: 'INV-002' },
      ];

      mockInvariantsService.findAll.mockResolvedValue(invariants);

      const result = await controller.findAll();

      expect(result).toEqual(invariants);
      expect(mockInvariantsService.findAll).toHaveBeenCalledWith(undefined);
    });

    it('should return project-specific invariants when projectId provided', async () => {
      const invariants = [
        { id: 'uuid-1', invariantId: 'INV-001', projectId: null },
        { id: 'uuid-2', invariantId: 'INV-010', projectId: 'project-uuid' },
      ];

      mockInvariantsService.findAll.mockResolvedValue(invariants);

      const result = await controller.findAll('project-uuid');

      expect(result).toEqual(invariants);
      expect(mockInvariantsService.findAll).toHaveBeenCalledWith('project-uuid');
    });
  });

  describe('findEnabled', () => {
    it('should return only enabled invariants', async () => {
      const invariants = [
        { id: 'uuid-1', invariantId: 'INV-001', isEnabled: true },
        { id: 'uuid-2', invariantId: 'INV-003', isEnabled: true },
      ];

      mockInvariantsService.findEnabled.mockResolvedValue(invariants);

      const result = await controller.findEnabled();

      expect(result).toEqual(invariants);
      expect(mockInvariantsService.findEnabled).toHaveBeenCalledWith(undefined);
    });
  });

  describe('findOne', () => {
    it('should return an invariant by ID', async () => {
      const invariant = { id: 'test-uuid', invariantId: 'INV-001' };

      mockInvariantsService.findOne.mockResolvedValue(invariant);

      const result = await controller.findOne('test-uuid');

      expect(result).toEqual(invariant);
      expect(mockInvariantsService.findOne).toHaveBeenCalledWith('test-uuid');
    });

    it('should propagate NotFoundException', async () => {
      mockInvariantsService.findOne.mockRejectedValue(new NotFoundException('Invariant not found'));

      await expect(controller.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update an invariant', async () => {
      const updateDto = { isEnabled: false };
      const updatedInvariant = {
        id: 'test-uuid',
        invariantId: 'INV-001',
        isEnabled: false,
      };

      mockInvariantsService.update.mockResolvedValue(updatedInvariant);

      const result = await controller.update('test-uuid', updateDto);

      expect(result).toEqual(updatedInvariant);
      expect(mockInvariantsService.update).toHaveBeenCalledWith('test-uuid', updateDto);
    });

    it('should propagate ForbiddenException for built-in modification', async () => {
      mockInvariantsService.update.mockRejectedValue(
        new ForbiddenException('Cannot modify built-in'),
      );

      await expect(controller.update('test-uuid', { checkType: 'custom' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('remove', () => {
    it('should remove a custom invariant', async () => {
      mockInvariantsService.remove.mockResolvedValue(undefined);

      await controller.remove('test-uuid');

      expect(mockInvariantsService.remove).toHaveBeenCalledWith('test-uuid');
    });

    it('should propagate ForbiddenException for built-in deletion', async () => {
      mockInvariantsService.remove.mockRejectedValue(
        new ForbiddenException('Cannot delete built-in'),
      );

      await expect(controller.remove('test-uuid')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('enable', () => {
    it('should enable an invariant', async () => {
      const enabledInvariant = {
        id: 'test-uuid',
        invariantId: 'INV-001',
        isEnabled: true,
      };

      mockInvariantsService.enable.mockResolvedValue(enabledInvariant);

      const result = await controller.enable('test-uuid');

      expect(result).toEqual(enabledInvariant);
      expect(mockInvariantsService.enable).toHaveBeenCalledWith('test-uuid');
    });
  });

  describe('disable', () => {
    it('should disable an invariant', async () => {
      const disabledInvariant = {
        id: 'test-uuid',
        invariantId: 'INV-001',
        isEnabled: false,
      };

      mockInvariantsService.disable.mockResolvedValue(disabledInvariant);

      const result = await controller.disable('test-uuid');

      expect(result).toEqual(disabledInvariant);
      expect(mockInvariantsService.disable).toHaveBeenCalledWith('test-uuid');
    });
  });

  describe('copyForProject', () => {
    it('should copy a global invariant for a project', async () => {
      const projectInvariant = {
        id: 'new-uuid',
        invariantId: 'INV-001',
        projectId: 'project-uuid',
      };

      mockInvariantsService.copyForProject.mockResolvedValue(projectInvariant);

      const result = await controller.copyForProject('INV-001', 'project-uuid');

      expect(result).toEqual(projectInvariant);
      expect(mockInvariantsService.copyForProject).toHaveBeenCalledWith('INV-001', 'project-uuid');
    });
  });
});
