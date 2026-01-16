import { Test, TestingModule } from '@nestjs/testing';
import { AtomsController } from './atoms.controller';
import { AtomsService } from './atoms.service';
import { CreateAtomDto } from './dto/create-atom.dto';
import { AtomCategory } from './atom.entity';

describe('AtomsController', () => {
  let controller: AtomsController;

  const mockAtomsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    commit: jest.fn(),
    supersede: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    addTag: jest.fn(),
    removeTag: jest.fn(),
    getPopularTags: jest.fn(),
    getStatistics: jest.fn(),
    findSupersessionChain: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AtomsController],
      providers: [
        {
          provide: AtomsService,
          useValue: mockAtomsService,
        },
      ],
    }).compile();

    controller = module.get<AtomsController>(AtomsController);
    jest.clearAllMocks();
  });

  // @atom IA-027
  describe('controller instantiation', () => {
    // @atom IA-027
    it('should be instantiated by NestJS dependency injection', () => {
      // IA-027: Controller must be instantiated by DI container
      expect(controller).toBeDefined();
      // IA-027: Controller must not be null
      expect(controller).not.toBeNull();
      // IA-027: Controller must be correct class instance
      expect(controller).toBeInstanceOf(AtomsController);
    });
  });

  // @atom IA-028
  describe('POST /atoms', () => {
    // @atom IA-028
    it('should call atomsService.create with provided DTO', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        description: 'Test atom description that is long enough',
        category: 'functional' as AtomCategory,
        status: 'draft',
      };
      mockAtomsService.create.mockResolvedValue(mockAtom);

      const dto: CreateAtomDto = {
        description: 'Test atom description that is long enough',
        category: 'functional' as AtomCategory,
      };

      const result = await controller.create(dto);

      // IA-028: Controller must delegate atom creation to service layer
      expect(mockAtomsService.create).toHaveBeenCalledWith(dto);
      // IA-028: Service must be called exactly once
      expect(mockAtomsService.create).toHaveBeenCalledTimes(1);
      // IA-028: Response must include generated atomId
      expect(result.atomId).toBe('IA-001');
      // IA-028: New atoms must always be created in draft status
      expect(result.status).toBe('draft');
    });

    // @atom IA-028 - Negative: service error propagation
    it('should propagate service errors to caller', async () => {
      const error = new Error('Database connection failed');
      mockAtomsService.create.mockRejectedValue(error);

      // IA-028: Controller must not swallow service errors
      await expect(
        controller.create({ description: 'Test atom', category: 'functional' as AtomCategory }),
      ).rejects.toThrow('Database connection failed');
    });
  });

  // @atom IA-029
  describe('GET /atoms', () => {
    // @atom IA-029
    it('should return paginated atoms from service', async () => {
      const mockPaginatedResult = {
        items: [
          { id: '1', atomId: 'IA-001', description: 'First' },
          { id: '2', atomId: 'IA-002', description: 'Second' },
        ],
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      };
      mockAtomsService.findAll.mockResolvedValue(mockPaginatedResult);

      const result = await controller.findAll({});

      // IA-029: Controller must delegate to service with search DTO
      expect(mockAtomsService.findAll).toHaveBeenCalledWith({});
      // IA-029: Response must include paginated items array
      expect(result.items).toHaveLength(2);
      // IA-029: First item must have correct atomId
      expect(result.items[0].atomId).toBe('IA-001');
      // IA-029: Response must include correct total count
      expect(result.total).toBe(2);
      // IA-029: Response must include correct page number
      expect(result.page).toBe(1);
    });

    // @atom IA-029 - Boundary: empty results
    it('should return empty items when no atoms exist (boundary: zero results)', async () => {
      const mockEmptyResult = {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      };
      mockAtomsService.findAll.mockResolvedValue(mockEmptyResult);

      const result = await controller.findAll({});

      // IA-029: Empty result must return empty array, not null
      expect(result.items).toEqual([]);
      // IA-029: Items must be an array type
      expect(Array.isArray(result.items)).toBe(true);
      // IA-029: Total count must be zero for empty result
      expect(result.total).toBe(0);
      // IA-029: Total pages must be zero when no items
      expect(result.totalPages).toBe(0);
    });

    // @atom IA-029 - Filter passthrough
    it('should pass filter parameters to service', async () => {
      mockAtomsService.findAll.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      await controller.findAll({ status: 'draft', page: 2, limit: 10 });

      // IA-029: Controller must pass all filter parameters to service
      expect(mockAtomsService.findAll).toHaveBeenCalledWith({
        status: 'draft',
        page: 2,
        limit: 10,
      });
    });
  });

  // @atom IA-030
  describe('GET /atoms/:id', () => {
    // @atom IA-030
    it('should return atom by UUID from service', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        description: 'Test atom',
      };
      mockAtomsService.findOne.mockResolvedValue(mockAtom);

      const result = await controller.findOne('test-uuid');

      // IA-030: Service must be called with correct ID
      expect(mockAtomsService.findOne).toHaveBeenCalledWith('test-uuid');
      // IA-030: Result must match found atom
      expect(result.id).toBe('test-uuid');
    });
  });

  // @atom IA-031
  describe('PATCH /atoms/:id/commit', () => {
    // @atom IA-031
    it('should commit draft atom via service', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        status: 'committed',
        committedAt: new Date('2024-01-15T10:00:00Z'),
      };
      mockAtomsService.commit.mockResolvedValue(mockAtom);

      const result = await controller.commit('test-uuid');

      // IA-031: Service commit must be called with ID
      expect(mockAtomsService.commit).toHaveBeenCalledWith('test-uuid');
      // IA-031: Result must show committed status
      expect(result.status).toBe('committed');
      // IA-031: committedAt timestamp must be set
      expect(result.committedAt).not.toBeNull();
    });
  });

  // @atom IA-032
  describe('PATCH /atoms/:id/supersede', () => {
    // @atom IA-032
    it('should supersede atom with reference to new atom', async () => {
      const mockAtom = {
        id: 'old-uuid',
        atomId: 'IA-001',
        status: 'superseded',
        supersededBy: 'new-uuid',
      };
      mockAtomsService.supersede.mockResolvedValue(mockAtom);

      const result = await controller.supersede('old-uuid', 'new-uuid');

      // IA-032: Service supersede must be called with both IDs
      expect(mockAtomsService.supersede).toHaveBeenCalledWith('old-uuid', 'new-uuid');
      // IA-032: Result must show superseded status
      expect(result.status).toBe('superseded');
      // IA-032: supersededBy must reference new atom
      expect(result.supersededBy).toBe('new-uuid');
    });
  });

  // @atom IA-033
  describe('boundary and negative cases', () => {
    // @atom IA-033
    it('should propagate NotFoundException from service for invalid atom ID', async () => {
      const notFoundError = new Error('Atom not found');
      mockAtomsService.findOne.mockRejectedValue(notFoundError);

      // IA-033: Controller must propagate error for non-existent atom
      await expect(controller.findOne('invalid-uuid')).rejects.toThrow('Atom not found');
    });

    // @atom IA-033
    it('should propagate error from service when committing already committed atom', async () => {
      const alreadyCommittedError = new Error('Atom is already committed');
      mockAtomsService.commit.mockRejectedValue(alreadyCommittedError);

      // IA-033: Controller must reject commit attempt on committed atom
      await expect(controller.commit('committed-uuid')).rejects.toThrow('already committed');
    });

    // @atom IA-033
    it('should correctly pass null newAtomId in supersede', async () => {
      mockAtomsService.supersede.mockResolvedValue({
        id: 'test-uuid',
        status: 'superseded',
        supersededBy: null,
      });

      const result = await controller.supersede('test-uuid', null as unknown as string);

      // IA-033: Service must be called with null reference
      expect(mockAtomsService.supersede).toHaveBeenCalledWith('test-uuid', null);
      // IA-033: supersededBy must be null
      expect(result.supersededBy).toBeNull();
    });
  });

  // @atom IA-034
  describe('new endpoints', () => {
    // @atom IA-034
    it('should get popular tags', async () => {
      const mockTags = [{ tag: 'security', count: 10 }];
      mockAtomsService.getPopularTags.mockResolvedValue(mockTags);

      const result = await controller.getPopularTags('10');

      // IA-034: Service must be called with parsed limit
      expect(mockAtomsService.getPopularTags).toHaveBeenCalledWith(10);
      // IA-034: Result must match service response
      expect(result).toEqual(mockTags);
    });

    // @atom IA-034
    it('should get statistics', async () => {
      const mockStats = { total: 100, byStatus: { draft: 50 } };
      mockAtomsService.getStatistics.mockResolvedValue(mockStats);

      const result = await controller.getStatistics();

      // IA-034: Service getStatistics must be called
      expect(mockAtomsService.getStatistics).toHaveBeenCalled();
      // IA-034: Result total must match service response
      expect(result.total).toBe(100);
    });

    // @atom IA-034
    it('should get supersession chain', async () => {
      const mockChain = [{ id: '1', atomId: 'IA-001' }];
      mockAtomsService.findSupersessionChain.mockResolvedValue(mockChain);

      const result = await controller.findSupersessionChain('1');

      // IA-034: Service must be called with correct ID
      expect(mockAtomsService.findSupersessionChain).toHaveBeenCalledWith('1');
      // IA-034: Result must contain chain items
      expect(result).toHaveLength(1);
    });

    // @atom IA-034
    it('should add tag to atom', async () => {
      const mockAtom = { id: '1', tags: ['new-tag'] };
      mockAtomsService.addTag.mockResolvedValue(mockAtom);

      const result = await controller.addTag('1', 'new-tag');

      // IA-034: Service must be called with correct ID and tag
      expect(mockAtomsService.addTag).toHaveBeenCalledWith('1', 'new-tag');
      // IA-034: Result must contain new tag
      expect(result.tags).toContain('new-tag');
    });

    // @atom IA-034
    it('should remove tag from atom', async () => {
      const mockAtom = { id: '1', tags: [] };
      mockAtomsService.removeTag.mockResolvedValue(mockAtom);

      const result = await controller.removeTag('1', 'old-tag');

      // IA-034: Service must be called with correct ID and tag
      expect(mockAtomsService.removeTag).toHaveBeenCalledWith('1', 'old-tag');
      // IA-034: Result must have zero tags after removal
      expect(result.tags).toHaveLength(0);
    });
  });

  // @atom IA-035
  describe('PATCH /atoms/:id', () => {
    // @atom IA-035
    it('should update draft atom via service', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        description: 'Updated description',
        category: 'security',
        status: 'draft',
      };
      mockAtomsService.update.mockResolvedValue(mockAtom);

      const result = await controller.update('test-uuid', {
        description: 'Updated description',
        category: 'security' as AtomCategory,
      });

      // IA-035: Service update must be called with ID and DTO
      expect(mockAtomsService.update).toHaveBeenCalledWith('test-uuid', {
        description: 'Updated description',
        category: 'security',
      });
      // IA-035: Result description must match updated value
      expect(result.description).toBe('Updated description');
      // IA-035: Result category must match updated value
      expect(result.category).toBe('security');
    });

    // @atom IA-035
    it('should propagate ForbiddenException when updating non-draft atom', async () => {
      const forbiddenError = new Error('Cannot update committed atom');
      mockAtomsService.update.mockRejectedValue(forbiddenError);

      // IA-035/INV-004: Controller must propagate forbidden error for non-draft update
      await expect(
        controller.update('committed-uuid', { description: 'New desc' }),
      ).rejects.toThrow('Cannot update committed atom');
    });
  });

  // @atom IA-036
  describe('DELETE /atoms/:id', () => {
    // @atom IA-036
    it('should delete draft atom via service', async () => {
      mockAtomsService.remove.mockResolvedValue(undefined);

      await controller.remove('test-uuid');

      // IA-036: Service remove must be called with ID
      expect(mockAtomsService.remove).toHaveBeenCalledWith('test-uuid');
    });

    // @atom IA-036
    it('should propagate ForbiddenException when deleting non-draft atom', async () => {
      const forbiddenError = new Error('Cannot delete committed atom');
      mockAtomsService.remove.mockRejectedValue(forbiddenError);

      // IA-036/INV-004: Controller must propagate forbidden error for non-draft delete
      await expect(controller.remove('committed-uuid')).rejects.toThrow(
        'Cannot delete committed atom',
      );
    });

    // @atom IA-036
    it('should propagate NotFoundException when atom not found', async () => {
      const notFoundError = new Error('Atom not found');
      mockAtomsService.remove.mockRejectedValue(notFoundError);

      // IA-036: Controller must propagate not found error
      await expect(controller.remove('non-existent')).rejects.toThrow('Atom not found');
    });
  });
});
