import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictsService } from './conflicts.service';
import { ConflictRecord } from './conflict-record.entity';
import { NotFoundException } from '@nestjs/common';

describe('ConflictsService', () => {
  let service: ConflictsService;

  const mockConflicts: ConflictRecord[] = [
    {
      id: 'conflict-1',
      conflictType: 'same_test',
      atomIdA: 'atom-a',
      atomIdB: 'atom-b',
      atomA: null as any,
      atomB: null as any,
      testRecordId: 'test-1',
      testRecord: null,
      similarityScore: null,
      description: 'Both atoms claim test X',
      status: 'open',
      resolution: null,
      createdAt: new Date(),
      resolvedAt: null,
    },
    {
      id: 'conflict-2',
      conflictType: 'semantic_overlap',
      atomIdA: 'atom-c',
      atomIdB: 'atom-d',
      atomA: null as any,
      atomB: null as any,
      testRecordId: null,
      testRecord: null,
      similarityScore: 85,
      description: 'High semantic similarity',
      status: 'open',
      resolution: null,
      createdAt: new Date(),
      resolvedAt: null,
    },
    {
      id: 'conflict-3',
      conflictType: 'contradiction',
      atomIdA: 'atom-a',
      atomIdB: 'atom-e',
      atomA: null as any,
      atomB: null as any,
      testRecordId: null,
      testRecord: null,
      similarityScore: null,
      description: 'Contradictory requirements',
      status: 'resolved',
      resolution: {
        action: 'supersede_a',
        resolvedBy: 'user-1',
        resolvedAt: new Date(),
        reason: 'Atom A was outdated',
      },
      createdAt: new Date(),
      resolvedAt: new Date(),
    },
  ];

  const mockQueryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(mockConflicts),
  };

  const mockRepository = {
    create: jest.fn().mockImplementation((data) => ({ ...data, id: 'new-conflict' })),
    save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    find: jest.fn().mockResolvedValue(mockConflicts),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConflictsService,
        { provide: getRepositoryToken(ConflictRecord), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<ConflictsService>(ConflictsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new conflict record', async () => {
      const dto = {
        conflictType: 'same_test' as const,
        atomIdA: 'atom-a',
        atomIdB: 'atom-b',
        testRecordId: 'test-1',
        description: 'Both atoms claim same test',
      };

      const result = await service.create(dto);

      expect(mockRepository.create).toHaveBeenCalledWith({
        conflictType: 'same_test',
        atomIdA: 'atom-a',
        atomIdB: 'atom-b',
        testRecordId: 'test-1',
        similarityScore: null,
        description: 'Both atoms claim same test',
        status: 'open',
        resolution: null,
        resolvedAt: null,
      });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create a semantic_overlap conflict with similarity score', async () => {
      const dto = {
        conflictType: 'semantic_overlap' as const,
        atomIdA: 'atom-c',
        atomIdB: 'atom-d',
        similarityScore: 92,
        description: 'High overlap',
      };

      await service.create(dto);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conflictType: 'semantic_overlap',
          similarityScore: 92,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return all conflicts without filters', async () => {
      const result = await service.findAll();

      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('conflict');
      expect(result).toBeDefined();
    });

    it('should filter by status', async () => {
      await service.findAll({ status: 'open' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('conflict.status = :status', {
        status: 'open',
      });
    });

    it('should filter by type', async () => {
      await service.findAll({ type: 'same_test' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('conflict.conflictType = :type', {
        type: 'same_test',
      });
    });

    it('should filter by atomId', async () => {
      await service.findAll({ atomId: 'atom-a' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(conflict.atomIdA = :atomId OR conflict.atomIdB = :atomId)',
        { atomId: 'atom-a' },
      );
    });
  });

  describe('findById', () => {
    it('should return a conflict by ID', async () => {
      mockRepository.findOne.mockResolvedValue(mockConflicts[0]);

      const result = await service.findById('conflict-1');

      expect(result).toEqual(mockConflicts[0]);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'conflict-1' },
        relations: ['atomA', 'atomB', 'testRecord'],
      });
    });

    it('should throw NotFoundException when conflict not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolve', () => {
    it('should resolve a conflict', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockConflicts[0] });

      const result = await service.resolve('conflict-1', {
        action: 'supersede_a',
        resolvedBy: 'user-1',
        reason: 'A is outdated',
      });

      expect(result.status).toBe('resolved');
      expect(result.resolution).toBeDefined();
      expect(result.resolution!.action).toBe('supersede_a');
      expect(result.resolution!.resolvedBy).toBe('user-1');
      expect(result.resolvedAt).toBeDefined();
    });
  });

  describe('escalate', () => {
    it('should escalate a conflict', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockConflicts[0] });

      const result = await service.escalate('conflict-1');

      expect(result.status).toBe('escalated');
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('getMetrics', () => {
    it('should return correct metrics breakdown', async () => {
      const result = await service.getMetrics();

      expect(result.total).toBe(3);
      expect(result.open).toBe(2);
      expect(result.resolved).toBe(1);
      expect(result.escalated).toBe(0);
      expect(result.byType.same_test).toBe(1);
      expect(result.byType.semantic_overlap).toBe(1);
      expect(result.byType.contradiction).toBe(1);
      expect(result.byType.cross_boundary).toBe(0);
    });

    it('should return zero metrics for empty database', async () => {
      mockRepository.find.mockResolvedValueOnce([]);

      const result = await service.getMetrics();

      expect(result.total).toBe(0);
      expect(result.open).toBe(0);
      expect(result.resolved).toBe(0);
      expect(result.escalated).toBe(0);
    });
  });

  describe('existsBetween', () => {
    it('should return true when conflict exists', async () => {
      mockRepository.findOne.mockResolvedValue(mockConflicts[0]);

      const result = await service.existsBetween('atom-a', 'atom-b', 'same_test');

      expect(result).toBe(true);
    });

    it('should return false when no conflict exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.existsBetween('atom-x', 'atom-y', 'same_test');

      expect(result).toBe(false);
    });
  });
});
