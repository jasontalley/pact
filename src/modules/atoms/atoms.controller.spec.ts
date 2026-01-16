import { Test, TestingModule } from '@nestjs/testing';
import { AtomsController } from './atoms.controller';
import { AtomsService } from './atoms.service';

describe('AtomsController', () => {
  let controller: AtomsController;
  let atomsService: AtomsService;

  const mockAtomsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    commit: jest.fn(),
    supersede: jest.fn(),
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
    atomsService = module.get<AtomsService>(AtomsService);
    jest.clearAllMocks();
  });

  // @atom IA-027
  describe('controller instantiation', () => {
    // @atom IA-027
    it('should be instantiated by NestJS dependency injection', () => {
      // Controller must be instantiated
      expect(controller).not.toBeNull();
      // Controller must be correct instance
      expect(controller instanceof AtomsController).toBe(true);
    });
  });

  // @atom IA-028
  describe('POST /atoms', () => {
    // @atom IA-028
    it('should call atomsService.create with provided DTO', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        description: 'Test atom',
        category: 'functional',
        status: 'draft',
      };
      mockAtomsService.create.mockResolvedValue(mockAtom);

      const dto = {
        description: 'Test atom',
        category: 'functional',
      };

      const result = await controller.create(dto);

      // Service must be called with the DTO
      expect(mockAtomsService.create).toHaveBeenCalledWith(dto);
      // Result must match service response
      expect(result.atomId).toBe('IA-001');
      // Atom must be returned with correct status
      expect(result.status).toBe('draft');
    });
  });

  // @atom IA-029
  describe('GET /atoms', () => {
    // @atom IA-029
    it('should return all atoms from service', async () => {
      const mockAtoms = [
        { id: '1', atomId: 'IA-001', description: 'First' },
        { id: '2', atomId: 'IA-002', description: 'Second' },
      ];
      mockAtomsService.findAll.mockResolvedValue(mockAtoms);

      const result = await controller.findAll();

      // Service findAll must be called
      expect(mockAtomsService.findAll).toHaveBeenCalled();
      // Result must contain all atoms
      expect(result).toHaveLength(2);
      // First atom must match
      expect(result[0].atomId).toBe('IA-001');
    });

    // @atom IA-029
    it('should return empty array when no atoms exist', async () => {
      mockAtomsService.findAll.mockResolvedValue([]);

      const result = await controller.findAll();

      // Service findAll must be called
      expect(mockAtomsService.findAll).toHaveBeenCalled();
      // Result must be empty array
      expect(result).toHaveLength(0);
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

      // Service must be called with correct ID
      expect(mockAtomsService.findOne).toHaveBeenCalledWith('test-uuid');
      // Result must match found atom
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

      // Service commit must be called with ID
      expect(mockAtomsService.commit).toHaveBeenCalledWith('test-uuid');
      // Result must show committed status
      expect(result.status).toBe('committed');
      // committedAt must be set
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

      // Service supersede must be called with both IDs
      expect(mockAtomsService.supersede).toHaveBeenCalledWith('old-uuid', 'new-uuid');
      // Result must show superseded status
      expect(result.status).toBe('superseded');
      // supersededBy must reference new atom
      expect(result.supersededBy).toBe('new-uuid');
    });
  });

  // @atom IA-033
  describe('boundary and negative cases', () => {
    // @atom IA-033
    it('should propagate NotFoundException from service for invalid atom ID', async () => {
      const notFoundError = new Error('Atom not found');
      mockAtomsService.findOne.mockRejectedValue(notFoundError);

      // Controller must propagate error for non-existent atom
      await expect(controller.findOne('invalid-uuid')).rejects.toThrow('Atom not found');
    });

    // @atom IA-033
    it('should propagate error from service when committing already committed atom', async () => {
      const alreadyCommittedError = new Error('Atom is already committed');
      mockAtomsService.commit.mockRejectedValue(alreadyCommittedError);

      // Controller must reject commit attempt on committed atom
      await expect(controller.commit('committed-uuid')).rejects.toThrow('already committed');
    });

    // @atom IA-033
    it('should handle empty description in create DTO', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        description: '',
        category: 'functional',
        status: 'draft',
      };
      mockAtomsService.create.mockResolvedValue(mockAtom);

      const dto = {
        description: '',
        category: 'functional',
      };

      const result = await controller.create(dto);

      // Empty description must be passed through to service
      expect(mockAtomsService.create).toHaveBeenCalledWith(dto);
      // Result must reflect empty description
      expect(result.description).toBe('');
    });

    // @atom IA-033
    it('should correctly pass null newAtomId in supersede', async () => {
      mockAtomsService.supersede.mockResolvedValue({
        id: 'test-uuid',
        status: 'superseded',
        supersededBy: null,
      });

      const result = await controller.supersede('test-uuid', null as any);

      // Service must be called with null reference
      expect(mockAtomsService.supersede).toHaveBeenCalledWith('test-uuid', null);
      // supersededBy must be null
      expect(result.supersededBy).toBeNull();
    });
  });
});
