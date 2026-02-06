import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InvariantsService } from './invariants.service';
import { InvariantConfig } from './invariant-config.entity';
import { BUILTIN_INVARIANTS } from './builtin-invariants';

describe('InvariantsService', () => {
  let service: InvariantsService;

  const mockInvariantRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvariantsService,
        {
          provide: getRepositoryToken(InvariantConfig),
          useValue: mockInvariantRepository,
        },
      ],
    }).compile();

    service = module.get<InvariantsService>(InvariantsService);
    jest.clearAllMocks();
  });

  describe('service instantiation', () => {
    it('should be instantiated by NestJS dependency injection', () => {
      expect(service).toBeDefined();
      expect(service).not.toBeNull();
      expect(service).toBeInstanceOf(InvariantsService);
    });
  });

  describe('seedBuiltinInvariants', () => {
    it('should seed all 9 built-in invariants when none exist', async () => {
      mockInvariantRepository.findOne.mockResolvedValue(null);
      mockInvariantRepository.create.mockImplementation((data) => data);
      mockInvariantRepository.save.mockImplementation((data) =>
        Promise.resolve({ id: 'uuid', ...data }),
      );

      await service.seedBuiltinInvariants();

      // Should have checked for each invariant
      expect(mockInvariantRepository.findOne).toHaveBeenCalledTimes(9);
      // Should have created each invariant
      expect(mockInvariantRepository.save).toHaveBeenCalledTimes(9);
    });

    it('should not re-seed existing invariants', async () => {
      // First invariant exists, others don't
      mockInvariantRepository.findOne.mockImplementation(({ where }) => {
        if (where.invariantId === 'INV-001') {
          return Promise.resolve({ id: 'existing', invariantId: 'INV-001' });
        }
        return Promise.resolve(null);
      });
      mockInvariantRepository.create.mockImplementation((data) => data);
      mockInvariantRepository.save.mockImplementation((data) =>
        Promise.resolve({ id: 'uuid', ...data }),
      );

      await service.seedBuiltinInvariants();

      // Should have checked all 9
      expect(mockInvariantRepository.findOne).toHaveBeenCalledTimes(9);
      // Should have created only 8 (not INV-001)
      expect(mockInvariantRepository.save).toHaveBeenCalledTimes(8);
    });

    it('should seed invariants with correct properties', async () => {
      mockInvariantRepository.findOne.mockResolvedValue(null);
      mockInvariantRepository.create.mockImplementation((data) => data);
      mockInvariantRepository.save.mockImplementation((data) =>
        Promise.resolve({ id: 'uuid', ...data }),
      );

      await service.seedBuiltinInvariants();

      // Verify INV-001 properties
      expect(mockInvariantRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          invariantId: 'INV-001',
          name: 'Explicit Commitment Required',
          isBuiltin: true,
          isEnabled: true,
          isBlocking: true,
          checkType: 'builtin',
        }),
      );
    });
  });

  describe('create', () => {
    it('should create a custom invariant', async () => {
      const createDto = {
        invariantId: 'INV-010',
        name: 'Custom Invariant',
        description: 'A custom test invariant',
        checkType: 'custom' as const,
        errorMessage: 'Custom error message',
      };

      mockInvariantRepository.findOne.mockResolvedValue(null);
      mockInvariantRepository.create.mockImplementation((data) => data);
      mockInvariantRepository.save.mockImplementation((data) =>
        Promise.resolve({ id: 'new-uuid', ...data }),
      );

      const result = await service.create(createDto);

      expect(result.invariantId).toBe('INV-010');
      expect(result.name).toBe('Custom Invariant');
      expect(result.isBuiltin).toBe(false);
    });

    it('should reject creation with built-in invariant ID', async () => {
      const createDto = {
        invariantId: 'INV-001', // Reserved
        name: 'Trying to override',
        description: 'Should fail',
        checkType: 'custom' as const,
        errorMessage: 'Error',
      };

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(createDto)).rejects.toThrow(
        'Cannot create invariant with reserved ID: INV-001',
      );
    });

    it('should reject duplicate invariantId for same project', async () => {
      const createDto = {
        invariantId: 'INV-010',
        name: 'Custom Invariant',
        description: 'A custom test invariant',
        checkType: 'custom' as const,
        errorMessage: 'Error',
      };

      mockInvariantRepository.findOne.mockResolvedValue({
        id: 'existing',
        invariantId: 'INV-010',
      });

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(createDto)).rejects.toThrow(
        'Invariant INV-010 already exists for this project',
      );
    });

    it('should create invariant with project-specific scope', async () => {
      const createDto = {
        projectId: 'project-uuid',
        invariantId: 'INV-010',
        name: 'Project Custom',
        description: 'Project-specific invariant',
        checkType: 'custom' as const,
        errorMessage: 'Error',
      };

      mockInvariantRepository.findOne.mockResolvedValue(null);
      mockInvariantRepository.create.mockImplementation((data) => data);
      mockInvariantRepository.save.mockImplementation((data) =>
        Promise.resolve({ id: 'new-uuid', ...data }),
      );

      const result = await service.create(createDto);

      expect(result.projectId).toBe('project-uuid');
    });
  });

  describe('findAll', () => {
    it('should return all global invariants when no projectId specified', async () => {
      const invariants = [
        { id: 'uuid-1', invariantId: 'INV-001', projectId: null },
        { id: 'uuid-2', invariantId: 'INV-002', projectId: null },
      ];

      mockInvariantRepository.find.mockResolvedValue(invariants);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
    });

    it('should return project-specific and global invariants when projectId specified', async () => {
      const invariants = [
        { id: 'uuid-1', invariantId: 'INV-001', projectId: null },
        { id: 'uuid-2', invariantId: 'INV-010', projectId: 'project-uuid' },
      ];

      mockInvariantRepository.find.mockResolvedValue(invariants);

      const result = await service.findAll('project-uuid');

      expect(result).toHaveLength(2);
    });
  });

  describe('findEnabled', () => {
    it('should return only enabled invariants', async () => {
      const invariants = [
        { id: 'uuid-1', invariantId: 'INV-001', isEnabled: true },
        { id: 'uuid-2', invariantId: 'INV-002', isEnabled: false },
        { id: 'uuid-3', invariantId: 'INV-003', isEnabled: true },
      ];

      mockInvariantRepository.find.mockResolvedValue(invariants);

      const result = await service.findEnabled();

      expect(result).toHaveLength(2);
      expect(result.every((inv) => inv.isEnabled)).toBe(true);
    });
  });

  describe('findOne', () => {
    it('should return an invariant by ID', async () => {
      const invariant = {
        id: 'test-uuid',
        invariantId: 'INV-001',
        name: 'Explicit Commitment Required',
      };

      mockInvariantRepository.findOne.mockResolvedValue(invariant);

      const result = await service.findOne('test-uuid');

      expect(result.id).toBe('test-uuid');
      expect(result.invariantId).toBe('INV-001');
    });

    it('should throw NotFoundException when invariant does not exist', async () => {
      mockInvariantRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent-uuid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update invariant properties', async () => {
      const existingInvariant = {
        id: 'test-uuid',
        invariantId: 'INV-010',
        name: 'Old Name',
        description: 'Old description',
        isEnabled: true,
        isBlocking: true,
        checkType: 'custom',
        checkConfig: {},
        errorMessage: 'Old error',
        isBuiltin: false,
      };

      mockInvariantRepository.findOne.mockResolvedValue(existingInvariant);
      mockInvariantRepository.save.mockImplementation((data) => Promise.resolve(data));

      const result = await service.update('test-uuid', {
        name: 'New Name',
        isEnabled: false,
      });

      expect(result.name).toBe('New Name');
      expect(result.isEnabled).toBe(false);
    });

    it('should prevent changing checkType for built-in invariants', async () => {
      const builtinInvariant = {
        id: 'test-uuid',
        invariantId: 'INV-001',
        name: 'Explicit Commitment Required',
        checkType: 'builtin',
        isBuiltin: true,
      };

      mockInvariantRepository.findOne.mockResolvedValue(builtinInvariant);

      await expect(service.update('test-uuid', { checkType: 'custom' })).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.update('test-uuid', { checkType: 'custom' })).rejects.toThrow(
        'Cannot change checkType for built-in invariants',
      );
    });

    it('should allow changing isEnabled and isBlocking for built-in invariants', async () => {
      const builtinInvariant = {
        id: 'test-uuid',
        invariantId: 'INV-001',
        name: 'Explicit Commitment Required',
        checkType: 'builtin',
        isEnabled: true,
        isBlocking: true,
        isBuiltin: true,
      };

      mockInvariantRepository.findOne.mockResolvedValue(builtinInvariant);
      mockInvariantRepository.save.mockImplementation((data) => Promise.resolve(data));

      const result = await service.update('test-uuid', {
        isEnabled: false,
        isBlocking: false,
      });

      expect(result.isEnabled).toBe(false);
      expect(result.isBlocking).toBe(false);
    });
  });

  describe('remove', () => {
    it('should remove a custom invariant', async () => {
      const customInvariant = {
        id: 'test-uuid',
        invariantId: 'INV-010',
        isBuiltin: false,
      };

      mockInvariantRepository.findOne.mockResolvedValue(customInvariant);
      mockInvariantRepository.remove.mockResolvedValue(undefined);

      await service.remove('test-uuid');

      expect(mockInvariantRepository.remove).toHaveBeenCalledWith(customInvariant);
    });

    it('should prevent deletion of built-in invariants', async () => {
      const builtinInvariant = {
        id: 'test-uuid',
        invariantId: 'INV-001',
        isBuiltin: true,
      };

      mockInvariantRepository.findOne.mockResolvedValue(builtinInvariant);

      await expect(service.remove('test-uuid')).rejects.toThrow(ForbiddenException);
      await expect(service.remove('test-uuid')).rejects.toThrow(
        'Cannot delete built-in invariants',
      );
    });
  });

  describe('enable', () => {
    it('should enable an invariant', async () => {
      const invariant = {
        id: 'test-uuid',
        invariantId: 'INV-001',
        isEnabled: false,
        isBlocking: true,
        isBuiltin: true,
        checkType: 'builtin',
      };

      mockInvariantRepository.findOne.mockResolvedValue(invariant);
      mockInvariantRepository.save.mockImplementation((data) => Promise.resolve(data));

      const result = await service.enable('test-uuid');

      expect(result.isEnabled).toBe(true);
    });
  });

  describe('disable', () => {
    it('should disable an invariant', async () => {
      const invariant = {
        id: 'test-uuid',
        invariantId: 'INV-001',
        isEnabled: true,
        isBlocking: true,
        isBuiltin: true,
        checkType: 'builtin',
      };

      mockInvariantRepository.findOne.mockResolvedValue(invariant);
      mockInvariantRepository.save.mockImplementation((data) => Promise.resolve(data));

      const result = await service.disable('test-uuid');

      expect(result.isEnabled).toBe(false);
    });
  });

  describe('copyForProject', () => {
    it('should copy global invariant for project-specific customization', async () => {
      const globalInvariant = {
        id: 'global-uuid',
        invariantId: 'INV-001',
        name: 'Explicit Commitment Required',
        description: 'Description',
        isEnabled: true,
        isBlocking: true,
        checkType: 'builtin',
        checkConfig: {},
        errorMessage: 'Error',
        suggestionPrompt: 'Prompt',
        isBuiltin: true,
        projectId: null,
      };

      // Service order:
      // 1. First: get global default (projectId: IsNull())
      // 2. Second: check for existing project-specific
      mockInvariantRepository.findOne
        .mockResolvedValueOnce(globalInvariant) // Found global default
        .mockResolvedValueOnce(null); // No existing project-specific

      mockInvariantRepository.create.mockImplementation((data) => data);
      mockInvariantRepository.save.mockImplementation((data) =>
        Promise.resolve({ id: 'new-uuid', ...data }),
      );

      const result = await service.copyForProject('INV-001', 'project-uuid');

      expect(result.projectId).toBe('project-uuid');
      expect(result.invariantId).toBe('INV-001');
      expect(result.name).toBe('Explicit Commitment Required');
    });

    it('should throw if global invariant does not exist', async () => {
      // First call returns null (no global default)
      mockInvariantRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.copyForProject('INV-999', 'project-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if project-specific config already exists', async () => {
      const globalInvariant = {
        id: 'global-uuid',
        invariantId: 'INV-001',
        name: 'Explicit Commitment Required',
        description: 'Description',
        isEnabled: true,
        isBlocking: true,
        checkType: 'builtin',
        checkConfig: {},
        errorMessage: 'Error',
        suggestionPrompt: 'Prompt',
        isBuiltin: true,
        projectId: null,
      };

      const existingProjectConfig = {
        id: 'existing-uuid',
        invariantId: 'INV-001',
        projectId: 'project-uuid',
      };

      // Service order:
      // 1. First: get global default
      // 2. Second: check for existing project-specific (already exists!)
      mockInvariantRepository.findOne
        .mockResolvedValueOnce(globalInvariant) // Found global default
        .mockResolvedValueOnce(existingProjectConfig); // Project-specific already exists

      await expect(service.copyForProject('INV-001', 'project-uuid')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('BUILTIN_INVARIANTS constant', () => {
    it('should contain exactly 9 built-in invariants', () => {
      expect(BUILTIN_INVARIANTS).toHaveLength(9);
    });

    it('should have sequential IDs from INV-001 to INV-009', () => {
      const ids = BUILTIN_INVARIANTS.map((inv) => inv.invariantId);
      expect(ids).toEqual([
        'INV-001',
        'INV-002',
        'INV-003',
        'INV-004',
        'INV-005',
        'INV-006',
        'INV-007',
        'INV-008',
        'INV-009',
      ]);
    });

    it('should have required properties for each invariant', () => {
      for (const inv of BUILTIN_INVARIANTS) {
        expect(inv.invariantId).toBeDefined();
        expect(inv.name).toBeDefined();
        expect(inv.description).toBeDefined();
        expect(inv.checkType).toBeDefined();
        expect(inv.checkConfig).toBeDefined();
        expect(inv.errorMessage).toBeDefined();
        expect(inv.suggestionPrompt).toBeDefined();
      }
    });
  });
});
