import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CommitmentsController } from './commitments.controller';
import { CommitmentsService } from './commitments.service';
import { CommitmentImmutabilityGuard } from '../../common/guards/commitment-immutability.guard';

describe('CommitmentsController', () => {
  let controller: CommitmentsController;
  let service: CommitmentsService;

  const mockCommitmentsService = {
    create: jest.fn(),
    preview: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    supersede: jest.fn(),
    getHistory: jest.fn(),
    getAtoms: jest.fn(),
  };

  // Mock guard that always allows access
  const mockGuard = { canActivate: jest.fn().mockReturnValue(true) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommitmentsController],
      providers: [
        {
          provide: CommitmentsService,
          useValue: mockCommitmentsService,
        },
      ],
    })
      .overrideGuard(CommitmentImmutabilityGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<CommitmentsController>(CommitmentsController);
    service = module.get<CommitmentsService>(CommitmentsService);
    jest.clearAllMocks();
  });

  describe('controller instantiation', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a new commitment', async () => {
      const createDto = {
        atomIds: ['uuid-1', 'uuid-2'],
        committedBy: 'jane@company.com',
      };

      const expectedResult = {
        id: 'commitment-uuid',
        commitmentId: 'COM-001',
        status: 'active',
      };

      mockCommitmentsService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(createDto);

      expect(result).toEqual(expectedResult);
      expect(mockCommitmentsService.create).toHaveBeenCalledWith(createDto);
    });

    it('should propagate BadRequestException from service', async () => {
      mockCommitmentsService.create.mockRejectedValue(
        new BadRequestException('Invariant violation'),
      );

      await expect(
        controller.create({
          atomIds: ['uuid-1'],
          committedBy: 'jane@company.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('preview', () => {
    it('should return preview results', async () => {
      const previewDto = {
        atomIds: ['uuid-1'],
        committedBy: 'jane@company.com',
      };

      const expectedResult = {
        canCommit: true,
        hasBlockingIssues: false,
        hasWarnings: false,
        atomCount: 1,
        atoms: [],
        invariantChecks: [],
      };

      mockCommitmentsService.preview.mockResolvedValue(expectedResult);

      const result = await controller.preview(previewDto);

      expect(result).toEqual(expectedResult);
      expect(mockCommitmentsService.preview).toHaveBeenCalledWith(previewDto);
    });
  });

  describe('findAll', () => {
    it('should return paginated commitments', async () => {
      const query = { page: 1, limit: 20 };

      const expectedResult = {
        items: [{ id: 'uuid-1', commitmentId: 'COM-001' }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };

      mockCommitmentsService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(query);

      expect(result).toEqual(expectedResult);
      expect(mockCommitmentsService.findAll).toHaveBeenCalledWith(query);
    });

    it('should filter by status', async () => {
      const query = { page: 1, limit: 20, status: 'active' as const };

      mockCommitmentsService.findAll.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      await controller.findAll(query);

      expect(mockCommitmentsService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('should return a commitment by ID', async () => {
      const commitment = {
        id: 'test-uuid',
        commitmentId: 'COM-001',
        status: 'active',
      };

      mockCommitmentsService.findOne.mockResolvedValue(commitment);

      const result = await controller.findOne('test-uuid');

      expect(result).toEqual(commitment);
      expect(mockCommitmentsService.findOne).toHaveBeenCalledWith('test-uuid');
    });

    it('should propagate NotFoundException', async () => {
      mockCommitmentsService.findOne.mockRejectedValue(
        new NotFoundException('Commitment not found'),
      );

      await expect(controller.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('supersede', () => {
    it('should supersede an existing commitment', async () => {
      const supersedeDto = {
        atomIds: ['new-uuid'],
        committedBy: 'jane@company.com',
        reason: 'Updated requirements',
      };

      const newCommitment = {
        id: 'new-commitment-uuid',
        commitmentId: 'COM-002',
        supersedes: 'original-uuid',
        status: 'active',
      };

      mockCommitmentsService.supersede.mockResolvedValue(newCommitment);

      const result = await controller.supersede('original-uuid', supersedeDto);

      expect(result).toEqual(newCommitment);
      expect(mockCommitmentsService.supersede).toHaveBeenCalledWith('original-uuid', supersedeDto);
    });

    it('should propagate BadRequestException for already superseded', async () => {
      mockCommitmentsService.supersede.mockRejectedValue(
        new BadRequestException('Already superseded'),
      );

      await expect(
        controller.supersede('original-uuid', {
          atomIds: ['uuid-1'],
          committedBy: 'jane@company.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getHistory', () => {
    it('should return supersession history', async () => {
      const history = [
        { id: 'uuid-1', commitmentId: 'COM-001' },
        { id: 'uuid-2', commitmentId: 'COM-002' },
      ];

      mockCommitmentsService.getHistory.mockResolvedValue(history);

      const result = await controller.getHistory('uuid-2');

      expect(result).toEqual(history);
      expect(mockCommitmentsService.getHistory).toHaveBeenCalledWith('uuid-2');
    });
  });

  describe('getAtoms', () => {
    it('should return atoms for a commitment', async () => {
      const atoms = [
        { id: 'atom-1', atomId: 'IA-001' },
        { id: 'atom-2', atomId: 'IA-002' },
      ];

      mockCommitmentsService.getAtoms.mockResolvedValue(atoms);

      const result = await controller.getAtoms('commitment-uuid');

      expect(result).toEqual(atoms);
      expect(mockCommitmentsService.getAtoms).toHaveBeenCalledWith('commitment-uuid');
    });
  });
});
