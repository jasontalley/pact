import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AtomsService } from './atoms.service';
import { AtomsRepository } from './atoms.repository';
import { Atom } from './atom.entity';

describe('AtomsService', () => {
  let service: AtomsService;

  const mockAtomRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockAtomsRepository = {
    findByStatus: jest.fn(),
    findByTags: jest.fn(),
    findByCategory: jest.fn(),
    findSupersessionChain: jest.fn(),
    search: jest.fn(),
    getPopularTags: jest.fn(),
    getStatistics: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtomsService,
        {
          provide: getRepositoryToken(Atom),
          useValue: mockAtomRepository,
        },
        {
          provide: AtomsRepository,
          useValue: mockAtomsRepository,
        },
      ],
    }).compile();

    service = module.get<AtomsService>(AtomsService);
    jest.clearAllMocks();
  });

  // @atom IA-018
  describe('service instantiation', () => {
    // @atom IA-018
    it('should be instantiated by NestJS dependency injection', () => {
      // IA-018: AtomsService must be instantiated by DI container
      expect(service).toBeDefined();
      expect(service).not.toBeNull();
      // IA-018: Service must be correct class instance
      expect(service).toBeInstanceOf(AtomsService);
    });
  });

  // @atom IA-019
  describe('create', () => {
    // @atom IA-019 - Boundary: first atom in empty database
    it('should create atom with auto-generated ID starting from IA-001 (boundary: first atom)', async () => {
      // No existing atoms - empty database scenario
      mockAtomRepository.findOne.mockResolvedValue(null);
      mockAtomRepository.create.mockReturnValue({
        atomId: 'IA-001',
        description: 'Test description',
        category: 'functional',
        status: 'draft',
      });
      mockAtomRepository.save.mockResolvedValue({
        id: 'test-uuid',
        atomId: 'IA-001',
        description: 'Test description',
        category: 'functional',
        status: 'draft',
      });

      const result = await service.create({
        description: 'Test description',
        category: 'functional',
      });

      // IA-019: First atom must receive ID IA-001
      expect(result.atomId).toBe('IA-001');
      // IA-019: New atoms must always start in draft status
      expect(result.status).toBe('draft');
      // IA-019: Atom must be persisted to database
      expect(mockAtomRepository.save).toHaveBeenCalledTimes(1);
    });

    // @atom IA-019 - Sequential ID generation
    it('should increment atom ID from existing highest ID', async () => {
      // Existing atom with IA-042
      mockAtomRepository.findOne.mockResolvedValue({ atomId: 'IA-042' });
      mockAtomRepository.create.mockReturnValue({
        atomId: 'IA-043',
        description: 'New atom',
        category: 'performance',
        status: 'draft',
      });
      mockAtomRepository.save.mockResolvedValue({
        id: 'test-uuid',
        atomId: 'IA-043',
        description: 'New atom',
        category: 'performance',
        status: 'draft',
      });

      const result = await service.create({
        description: 'New atom',
        category: 'performance',
      });

      // IA-019: Atom ID must be exactly one higher than previous highest
      expect(result.atomId).toBe('IA-043');
      // IA-019: ID format must be IA-XXX with zero-padded number
      expect(result.atomId).toMatch(/^IA-\d{3}$/);
    });

    // @atom IA-019 - Category preservation
    it('should create atom with provided category', async () => {
      mockAtomRepository.findOne.mockResolvedValue(null);
      mockAtomRepository.create.mockReturnValue({
        atomId: 'IA-001',
        description: 'Security test',
        category: 'security',
        status: 'draft',
      });
      mockAtomRepository.save.mockResolvedValue({
        id: 'test-uuid',
        atomId: 'IA-001',
        description: 'Security test',
        category: 'security',
        status: 'draft',
      });

      const result = await service.create({
        description: 'Security test',
        category: 'security',
      });

      // IA-019: Category must be preserved exactly as provided
      expect(result.category).toBe('security');
    });

    // @atom IA-019 - Boundary: ID padding
    it('should pad single-digit IDs to three digits (boundary: ID formatting)', async () => {
      mockAtomRepository.findOne.mockResolvedValue({ atomId: 'IA-009' });
      mockAtomRepository.create.mockReturnValue({
        atomId: 'IA-010',
        description: 'Test',
        category: 'functional',
        status: 'draft',
      });
      mockAtomRepository.save.mockImplementation((atom) => Promise.resolve(atom));

      const result = await service.create({
        description: 'Test',
        category: 'functional',
      });

      // IA-019: ID must be zero-padded to 3 digits (010, not 10)
      expect(result.atomId).toBe('IA-010');
    });
  });

  // @atom IA-020
  describe('findAll', () => {
    // @atom IA-020
    it('should return paginated atoms ordered by creation date descending', async () => {
      const mockAtoms = [
        { id: '1', atomId: 'IA-002', description: 'Second' },
        { id: '2', atomId: 'IA-001', description: 'First' },
      ];
      mockAtomRepository.find.mockResolvedValue(mockAtoms);

      const result = await service.findAll();

      // IA-020: Result must contain all atoms in items array
      expect(result.items).toHaveLength(2);
      // IA-020: Result must have correct total count
      expect(result.total).toBe(2);
      // IA-020: Default page must be 1
      expect(result.page).toBe(1);
      // IA-020: Repository must be called with DESC ordering
      expect(mockAtomRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
    });

    // @atom IA-020
    it('should return empty items array when no atoms exist', async () => {
      mockAtomRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      // IA-020: Empty database must return zero-length items array
      expect(result.items).toHaveLength(0);
      // IA-020: Total count must be zero
      expect(result.total).toBe(0);
    });

    // @atom IA-020
    it('should use repository search when search criteria provided', async () => {
      const mockPaginatedResult = {
        items: [{ id: '1', atomId: 'IA-001', status: 'draft' }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      };
      mockAtomsRepository.search.mockResolvedValue(mockPaginatedResult);

      const result = await service.findAll({ status: 'draft' });

      // IA-020: Must delegate to repository search with criteria
      expect(mockAtomsRepository.search).toHaveBeenCalledWith({ status: 'draft' });
      // IA-020: Must return repository search results
      expect(result.items).toHaveLength(1);
    });
  });

  // @atom IA-021
  describe('findOne', () => {
    // @atom IA-021
    it('should return atom by UUID', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        description: 'Test atom',
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);

      const result = await service.findOne('test-uuid');

      // IA-021: Result must match the found atom
      expect(result.id).toBe('test-uuid');
      // IA-021: Repository must be called with correct where clause
      expect(mockAtomRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'test-uuid' },
      });
    });

    // @atom IA-021
    it('should throw NotFoundException when atom not found', async () => {
      mockAtomRepository.findOne.mockResolvedValue(null);

      // IA-021: Must throw NotFoundException for non-existent atom
      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // @atom IA-022
  describe('findByAtomId', () => {
    // @atom IA-022
    it('should return atom by atom ID (IA-XXX format)', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        description: 'Test atom',
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);

      const result = await service.findByAtomId('IA-001');

      // IA-022: Result must match the found atom
      expect(result.atomId).toBe('IA-001');
      // IA-022: Repository must be called with atomId
      expect(mockAtomRepository.findOne).toHaveBeenCalledWith({
        where: { atomId: 'IA-001' },
      });
    });

    // @atom IA-022
    it('should throw NotFoundException when atom ID not found', async () => {
      mockAtomRepository.findOne.mockResolvedValue(null);

      // IA-022: Must throw NotFoundException for non-existent atom ID
      await expect(service.findByAtomId('IA-999')).rejects.toThrow(NotFoundException);
    });
  });

  // @atom IA-023
  describe('commit', () => {
    // @atom IA-023 - Quality gate: passing score
    it('should commit draft atom with quality score >= 80 (quality gate: pass)', async () => {
      const fixedDate = new Date('2024-01-15T10:00:00Z');
      jest.spyOn(globalThis, 'Date').mockImplementation(() => fixedDate);

      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        status: 'draft',
        qualityScore: 85,
        committedAt: null,
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomRepository.save.mockImplementation((atom) => Promise.resolve({
        ...atom,
        committedAt: fixedDate,
      }));

      const result = await service.commit('test-uuid');

      // IA-023: Status must transition from draft to committed
      expect(result.status).toBe('committed');
      // IA-023: committedAt timestamp must be set
      expect(result.committedAt).not.toBeNull();

      jest.restoreAllMocks();
    });

    // @atom IA-023 - Boundary: exactly 80 (threshold)
    it('should commit atom with exactly 80 quality score (boundary: threshold)', async () => {
      const fixedDate = new Date('2024-01-15T10:00:00Z');
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        status: 'draft',
        qualityScore: 80, // Exactly at threshold
        committedAt: null,
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomRepository.save.mockImplementation((atom) => Promise.resolve({
        ...atom,
        committedAt: fixedDate,
      }));

      const result = await service.commit('test-uuid');

      // IA-023: Score of exactly 80 must pass quality gate (>= 80)
      expect(result.status).toBe('committed');
    });

    // @atom IA-023 - Boundary: just below threshold
    it('should reject atom with quality score 79 (boundary: just below threshold)', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        status: 'draft',
        qualityScore: 79, // Just below threshold
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);

      // IA-023: Score of 79 must fail quality gate (< 80)
      await expect(service.commit('test-uuid')).rejects.toThrow(BadRequestException);
      await expect(service.commit('test-uuid')).rejects.toThrow(/quality score 79/i);
    });

    // @atom IA-023 - Negative: already committed (INV-004 idempotency)
    it('should reject committing already committed atom (negative: INV-004 violation)', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        status: 'committed',
        qualityScore: 90,
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);

      // IA-023/INV-004: Cannot commit an already committed atom
      await expect(service.commit('test-uuid')).rejects.toThrow(BadRequestException);
      await expect(service.commit('test-uuid')).rejects.toThrow('Atom is already committed');
      // IA-023: Save should NOT be called for invalid state transition
      expect(mockAtomRepository.save).not.toHaveBeenCalled();
    });

    // @atom IA-023 - Negative: non-existent atom
    it('should throw NotFoundException when atom to commit not found (negative: invalid ID)', async () => {
      mockAtomRepository.findOne.mockResolvedValue(null);

      // IA-023: Non-existent atom must throw NotFoundException
      await expect(service.commit('non-existent')).rejects.toThrow(NotFoundException);
    });

    // @atom IA-023 - Boundary: zero quality score
    it('should reject atom with zero quality score (boundary: minimum)', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        status: 'draft',
        qualityScore: 0,
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);

      // IA-023: Zero score must fail quality gate
      await expect(service.commit('test-uuid')).rejects.toThrow(BadRequestException);
      await expect(service.commit('test-uuid')).rejects.toThrow(/quality score 0/i);
    });
  });

  // @atom IA-024
  describe('supersede', () => {
    // @atom IA-024
    it('should mark atom as superseded with reference to new atom', async () => {
      const mockAtom = {
        id: 'old-uuid',
        atomId: 'IA-001',
        status: 'committed',
        supersededBy: null,
      };
      const mockNewAtom = {
        id: 'new-uuid',
        atomId: 'IA-002',
      };
      // First call returns the atom to supersede, second returns the new atom
      mockAtomRepository.findOne
        .mockResolvedValueOnce(mockAtom)
        .mockResolvedValueOnce(mockNewAtom);
      mockAtomRepository.save.mockResolvedValue({
        ...mockAtom,
        status: 'superseded',
        supersededBy: 'new-uuid',
      });

      const result = await service.supersede('old-uuid', 'new-uuid');

      // IA-024: Status must be changed to superseded
      expect(result.status).toBe('superseded');
      // IA-024: supersededBy must reference new atom
      expect(result.supersededBy).toBe('new-uuid');
    });

    // @atom IA-024
    it('should throw NotFoundException when atom to supersede not found', async () => {
      mockAtomRepository.findOne.mockResolvedValue(null);

      // IA-024: Must throw NotFoundException for non-existent atom
      await expect(service.supersede('non-existent', 'new-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });

    // @atom IA-024
    it('should throw NotFoundException when new atom not found', async () => {
      const mockAtom = {
        id: 'old-uuid',
        atomId: 'IA-001',
        status: 'committed',
      };
      mockAtomRepository.findOne
        .mockResolvedValueOnce(mockAtom)
        .mockResolvedValueOnce(null);

      // IA-024: Must throw NotFoundException when new atom doesn't exist
      await expect(service.supersede('old-uuid', 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // @atom IA-025
  describe('update', () => {
    // @atom IA-025
    it('should update draft atom successfully', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        description: 'Original',
        category: 'functional',
        status: 'draft',
        tags: [],
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomRepository.save.mockResolvedValue({
        ...mockAtom,
        description: 'Updated description',
      });

      const result = await service.update('test-uuid', {
        description: 'Updated description',
      });

      // IA-025: Description must be updated
      expect(result.description).toBe('Updated description');
      // IA-025: Repository save must be called
      expect(mockAtomRepository.save).toHaveBeenCalled();
    });

    // @atom IA-025
    it('should throw ForbiddenException when updating committed atom', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        status: 'committed',
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);

      // IA-025/INV-004: Must throw ForbiddenException for committed atom
      await expect(
        service.update('test-uuid', { description: 'New desc' }),
      ).rejects.toThrow(ForbiddenException);
    });

    // @atom IA-025
    it('should throw ForbiddenException when updating superseded atom', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        status: 'superseded',
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);

      // IA-025: Must throw ForbiddenException for superseded atom
      await expect(
        service.update('test-uuid', { description: 'New desc' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // @atom IA-026
  describe('remove', () => {
    // @atom IA-026
    it('should delete draft atom successfully', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        status: 'draft',
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomRepository.remove.mockResolvedValue(mockAtom);

      await service.remove('test-uuid');

      // IA-026: Repository remove must be called
      expect(mockAtomRepository.remove).toHaveBeenCalledWith(mockAtom);
    });

    // @atom IA-026
    it('should throw ForbiddenException when deleting committed atom', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        status: 'committed',
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);

      // IA-026/INV-004: Must throw ForbiddenException for committed atom
      await expect(service.remove('test-uuid')).rejects.toThrow(ForbiddenException);
    });
  });

  // @atom IA-027
  describe('addTag', () => {
    // @atom IA-027
    it('should add tag to draft atom', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        status: 'draft',
        tags: ['existing'],
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomRepository.save.mockResolvedValue({
        ...mockAtom,
        tags: ['existing', 'new-tag'],
      });

      const result = await service.addTag('test-uuid', 'new-tag');

      // IA-027: Tag must be added
      expect(result.tags).toContain('new-tag');
    });

    // @atom IA-027
    it('should throw ForbiddenException when adding tag to committed atom', async () => {
      const mockAtom = {
        id: 'test-uuid',
        status: 'committed',
        tags: [],
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);

      // IA-027/INV-004: Must throw ForbiddenException for committed atom
      await expect(service.addTag('test-uuid', 'tag')).rejects.toThrow(ForbiddenException);
    });
  });

  // @atom IA-028
  describe('removeTag', () => {
    // @atom IA-028
    it('should remove tag from draft atom', async () => {
      const mockAtom = {
        id: 'test-uuid',
        status: 'draft',
        tags: ['tag-to-remove', 'other-tag'],
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomRepository.save.mockResolvedValue({
        ...mockAtom,
        tags: ['other-tag'],
      });

      const result = await service.removeTag('test-uuid', 'tag-to-remove');

      // IA-028: Tag must be removed
      expect(result.tags).not.toContain('tag-to-remove');
    });

    // @atom IA-028
    it('should return atom unchanged when tag does not exist', async () => {
      const mockAtom = {
        id: 'test-uuid',
        status: 'draft',
        tags: ['existing-tag'],
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);

      const result = await service.removeTag('test-uuid', 'non-existent-tag');

      // IA-028: Atom should be returned unchanged when tag not found
      expect(result.tags).toEqual(['existing-tag']);
      // IA-028: Save should not be called when no change made
      expect(mockAtomRepository.save).not.toHaveBeenCalled();
    });

    // @atom IA-028
    it('should throw ForbiddenException when removing tag from committed atom', async () => {
      const mockAtom = {
        id: 'test-uuid',
        status: 'committed',
        tags: ['tag'],
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);

      // IA-028/INV-004: Must throw ForbiddenException for committed atom
      await expect(service.removeTag('test-uuid', 'tag')).rejects.toThrow(ForbiddenException);
    });
  });

  // @atom IA-029
  describe('update - all field branches', () => {
    // @atom IA-029
    it('should update category field when provided', async () => {
      const mockAtom = {
        id: 'test-uuid',
        description: 'Original',
        category: 'functional',
        status: 'draft',
        tags: [],
        qualityScore: null,
        canvasPosition: null,
        parentIntent: null,
        observableOutcomes: [],
        falsifiabilityCriteria: [],
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomRepository.save.mockImplementation((atom) => Promise.resolve(atom));

      await service.update('test-uuid', { category: 'security' });

      // IA-029: Category must be updated when provided
      expect(mockAtomRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'security' }),
      );
    });

    // @atom IA-029
    it('should update qualityScore field when provided', async () => {
      const mockAtom = {
        id: 'test-uuid',
        description: 'Original',
        category: 'functional',
        status: 'draft',
        tags: [],
        qualityScore: null,
        canvasPosition: null,
        parentIntent: null,
        observableOutcomes: [],
        falsifiabilityCriteria: [],
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomRepository.save.mockImplementation((atom) => Promise.resolve(atom));

      await service.update('test-uuid', { qualityScore: 85 });

      // IA-029: Quality score must be updated when provided
      expect(mockAtomRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ qualityScore: 85 }),
      );
    });

    // @atom IA-029
    it('should update tags field when provided', async () => {
      const mockAtom = {
        id: 'test-uuid',
        description: 'Original',
        category: 'functional',
        status: 'draft',
        tags: ['old-tag'],
        qualityScore: null,
        canvasPosition: null,
        parentIntent: null,
        observableOutcomes: [],
        falsifiabilityCriteria: [],
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomRepository.save.mockImplementation((atom) => Promise.resolve(atom));

      await service.update('test-uuid', { tags: ['new-tag1', 'new-tag2'] });

      // IA-029: Tags must be updated when provided
      expect(mockAtomRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['new-tag1', 'new-tag2'] }),
      );
    });

    // @atom IA-029
    it('should update canvasPosition field when provided', async () => {
      const mockAtom = {
        id: 'test-uuid',
        description: 'Original',
        category: 'functional',
        status: 'draft',
        tags: [],
        qualityScore: null,
        canvasPosition: null,
        parentIntent: null,
        observableOutcomes: [],
        falsifiabilityCriteria: [],
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomRepository.save.mockImplementation((atom) => Promise.resolve(atom));

      await service.update('test-uuid', { canvasPosition: { x: 100, y: 200 } });

      // IA-029: Canvas position must be updated when provided
      expect(mockAtomRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ canvasPosition: { x: 100, y: 200 } }),
      );
    });

    // @atom IA-029
    it('should update parentIntent field when provided', async () => {
      const mockAtom = {
        id: 'test-uuid',
        description: 'Original',
        category: 'functional',
        status: 'draft',
        tags: [],
        qualityScore: null,
        canvasPosition: null,
        parentIntent: null,
        observableOutcomes: [],
        falsifiabilityCriteria: [],
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomRepository.save.mockImplementation((atom) => Promise.resolve(atom));

      await service.update('test-uuid', { parentIntent: 'parent-atom-id' });

      // IA-029: Parent intent must be updated when provided
      expect(mockAtomRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ parentIntent: 'parent-atom-id' }),
      );
    });

    // @atom IA-029
    it('should update observableOutcomes field when provided', async () => {
      const mockAtom = {
        id: 'test-uuid',
        description: 'Original',
        category: 'functional',
        status: 'draft',
        tags: [],
        qualityScore: null,
        canvasPosition: null,
        parentIntent: null,
        observableOutcomes: [],
        falsifiabilityCriteria: [],
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomRepository.save.mockImplementation((atom) => Promise.resolve(atom));

      const outcomes = [{ description: 'Outcome 1', measurementCriteria: 'Criteria 1' }];
      await service.update('test-uuid', { observableOutcomes: outcomes });

      // IA-029: Observable outcomes must be updated when provided
      expect(mockAtomRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ observableOutcomes: outcomes }),
      );
    });

    // @atom IA-029
    it('should update falsifiabilityCriteria field when provided', async () => {
      const mockAtom = {
        id: 'test-uuid',
        description: 'Original',
        category: 'functional',
        status: 'draft',
        tags: [],
        qualityScore: null,
        canvasPosition: null,
        parentIntent: null,
        observableOutcomes: [],
        falsifiabilityCriteria: [],
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomRepository.save.mockImplementation((atom) => Promise.resolve(atom));

      const criteria = [{ condition: 'Condition 1', expectedBehavior: 'Behavior 1' }];
      await service.update('test-uuid', { falsifiabilityCriteria: criteria });

      // IA-029: Falsifiability criteria must be updated when provided
      expect(mockAtomRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ falsifiabilityCriteria: criteria }),
      );
    });
  });

  // @atom IA-030
  describe('commit - edge cases', () => {
    // @atom IA-030
    it('should throw BadRequestException when committing superseded atom', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        status: 'superseded',
        qualityScore: 90,
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);

      // IA-030: Must reject commit for superseded atom
      await expect(service.commit('test-uuid')).rejects.toThrow(BadRequestException);
      // IA-030: Error message must indicate superseded status
      await expect(service.commit('test-uuid')).rejects.toThrow('Cannot commit a superseded atom');
    });

    // @atom IA-030
    it('should treat null quality score as 0 for quality gate', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        status: 'draft',
        qualityScore: null,
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);

      // IA-030: Null quality score must be treated as 0
      await expect(service.commit('test-uuid')).rejects.toThrow(BadRequestException);
      // IA-030: Error message must show quality score as 0
      await expect(service.commit('test-uuid')).rejects.toThrow(/quality score 0/i);
    });
  });

  // @atom IA-031
  describe('supersede - edge cases', () => {
    // @atom IA-031
    it('should throw BadRequestException when atom is already superseded', async () => {
      const mockAtom = {
        id: 'old-uuid',
        atomId: 'IA-001',
        status: 'superseded',
        supersededBy: 'another-uuid',
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);

      // IA-031: Must reject supersede for already superseded atom
      await expect(service.supersede('old-uuid', 'new-uuid')).rejects.toThrow(BadRequestException);
      // IA-031: Error message must indicate already superseded
      await expect(service.supersede('old-uuid', 'new-uuid')).rejects.toThrow(
        'Atom is already superseded',
      );
    });
  });

  // @atom IA-032
  describe('addTag - edge cases', () => {
    // @atom IA-032
    it('should not add duplicate tag', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        status: 'draft',
        tags: ['existing-tag'],
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);

      const result = await service.addTag('test-uuid', 'existing-tag');

      // IA-032: Duplicate tag must not be added
      expect(result.tags).toEqual(['existing-tag']);
      // IA-032: Save must not be called when no change made
      expect(mockAtomRepository.save).not.toHaveBeenCalled();
    });
  });

  // @atom IA-033
  describe('delegated repository methods', () => {
    // @atom IA-033
    it('should delegate findByStatus to repository', async () => {
      const mockAtoms = [{ id: '1', status: 'draft' }];
      mockAtomsRepository.findByStatus.mockResolvedValue(mockAtoms);

      const result = await service.findByStatus('draft');

      // IA-033: Must delegate to repository with correct status
      expect(mockAtomsRepository.findByStatus).toHaveBeenCalledWith('draft');
      // IA-033: Must return repository result
      expect(result).toEqual(mockAtoms);
    });

    // @atom IA-033
    it('should delegate findByTags to repository', async () => {
      const mockAtoms = [{ id: '1', tags: ['security'] }];
      mockAtomsRepository.findByTags.mockResolvedValue(mockAtoms);

      const result = await service.findByTags(['security']);

      // IA-033: Must delegate to repository with correct tags
      expect(mockAtomsRepository.findByTags).toHaveBeenCalledWith(['security']);
      // IA-033: Must return repository result
      expect(result).toEqual(mockAtoms);
    });

    // @atom IA-033
    it('should delegate findByCategory to repository', async () => {
      const mockAtoms = [{ id: '1', category: 'security' }];
      mockAtomsRepository.findByCategory.mockResolvedValue(mockAtoms);

      const result = await service.findByCategory('security');

      // IA-033: Must delegate to repository with correct category
      expect(mockAtomsRepository.findByCategory).toHaveBeenCalledWith('security');
      // IA-033: Must return repository result
      expect(result).toEqual(mockAtoms);
    });

    // @atom IA-033
    it('should delegate findSupersessionChain to repository', async () => {
      const mockChain = [{ id: '1', atomId: 'IA-001' }, { id: '2', atomId: 'IA-002' }];
      mockAtomsRepository.findSupersessionChain.mockResolvedValue(mockChain);

      const result = await service.findSupersessionChain('1');

      // IA-033: Must delegate to repository with correct ID
      expect(mockAtomsRepository.findSupersessionChain).toHaveBeenCalledWith('1');
      // IA-033: Must return repository result
      expect(result).toEqual(mockChain);
    });

    // @atom IA-033
    it('should delegate getStatistics to repository', async () => {
      const mockStats = {
        total: 100,
        byStatus: { draft: 50, committed: 45, superseded: 5 },
        byCategory: {},
        averageQualityScore: 82.5,
      };
      mockAtomsRepository.getStatistics.mockResolvedValue(mockStats);

      const result = await service.getStatistics();

      // IA-033: Must delegate to repository
      expect(mockAtomsRepository.getStatistics).toHaveBeenCalled();
      // IA-033: Must return repository result
      expect(result).toEqual(mockStats);
    });

    // @atom IA-033
    it('should delegate getPopularTags to repository with default limit', async () => {
      const mockTags = [{ tag: 'security', count: 10 }];
      mockAtomsRepository.getPopularTags.mockResolvedValue(mockTags);

      const result = await service.getPopularTags();

      // IA-033: Default limit must be 20
      expect(mockAtomsRepository.getPopularTags).toHaveBeenCalledWith(20);
      // IA-033: Must return repository result
      expect(result).toEqual(mockTags);
    });

    // @atom IA-033
    it('should delegate getPopularTags to repository with custom limit', async () => {
      const mockTags = [{ tag: 'security', count: 10 }];
      mockAtomsRepository.getPopularTags.mockResolvedValue(mockTags);

      const result = await service.getPopularTags(5);

      // IA-033: Custom limit must be passed to repository
      expect(mockAtomsRepository.getPopularTags).toHaveBeenCalledWith(5);
      // IA-033: Must return repository result
      expect(result).toEqual(mockTags);
    });
  });
});
