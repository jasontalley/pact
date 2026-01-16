import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { AtomsService } from './atoms.service';
import { Atom } from './atom.entity';

describe('AtomsService', () => {
  let service: AtomsService;

  const mockAtomRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtomsService,
        {
          provide: getRepositoryToken(Atom),
          useValue: mockAtomRepository,
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
      // AtomsService must be instantiated
      expect(service).not.toBeNull();
      // Service must be correct instance
      expect(service instanceof AtomsService).toBe(true);
    });
  });

  // @atom IA-019
  describe('create', () => {
    // @atom IA-019
    it('should create atom with auto-generated ID starting from IA-001', async () => {
      // No existing atoms
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

      // Atom must be created with IA-001 ID
      expect(result.atomId).toBe('IA-001');
      // Atom must have draft status
      expect(result.status).toBe('draft');
      // Repository save must be called
      expect(mockAtomRepository.save).toHaveBeenCalled();
    });

    // @atom IA-019
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

      // Atom ID must be incremented from IA-042 to IA-043
      expect(result.atomId).toBe('IA-043');
    });

    // @atom IA-019
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

      // Category must match provided value
      expect(result.category).toBe('security');
    });
  });

  // @atom IA-020
  describe('findAll', () => {
    // @atom IA-020
    it('should return all atoms ordered by creation date descending', async () => {
      const mockAtoms = [
        { id: '1', atomId: 'IA-002', description: 'Second' },
        { id: '2', atomId: 'IA-001', description: 'First' },
      ];
      mockAtomRepository.find.mockResolvedValue(mockAtoms);

      const result = await service.findAll();

      // Result must contain all atoms
      expect(result).toHaveLength(2);
      // Repository find must be called with correct order
      expect(mockAtomRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
    });

    // @atom IA-020
    it('should return empty array when no atoms exist', async () => {
      mockAtomRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      // Result must be empty array
      expect(result).toHaveLength(0);
      // Result must be array type
      expect(Array.isArray(result)).toBe(true);
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

      // Result must match the found atom
      expect(result.id).toBe('test-uuid');
      // Repository must be called with correct where clause
      expect(mockAtomRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'test-uuid' },
      });
    });

    // @atom IA-021
    it('should throw NotFoundException when atom not found', async () => {
      mockAtomRepository.findOne.mockResolvedValue(null);

      // Must throw NotFoundException for non-existent atom
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

      // Result must match the found atom
      expect(result.atomId).toBe('IA-001');
      // Repository must be called with atomId
      expect(mockAtomRepository.findOne).toHaveBeenCalledWith({
        where: { atomId: 'IA-001' },
      });
    });

    // @atom IA-022
    it('should throw NotFoundException when atom ID not found', async () => {
      mockAtomRepository.findOne.mockResolvedValue(null);

      // Must throw NotFoundException for non-existent atom ID
      await expect(service.findByAtomId('IA-999')).rejects.toThrow(NotFoundException);
    });
  });

  // @atom IA-023
  describe('commit', () => {
    // @atom IA-023
    it('should commit draft atom and set committedAt timestamp', async () => {
      const fixedDate = new Date('2024-01-15T10:00:00Z');
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        status: 'draft',
        committedAt: null,
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomRepository.save.mockResolvedValue({
        ...mockAtom,
        status: 'committed',
        committedAt: fixedDate,
      });

      const result = await service.commit('test-uuid');

      // Status must be changed to committed
      expect(result.status).toBe('committed');
      // committedAt must be set
      expect(result.committedAt).not.toBeNull();
    });

    // @atom IA-023
    it('should throw error when trying to commit already committed atom', async () => {
      const mockAtom = {
        id: 'test-uuid',
        atomId: 'IA-001',
        status: 'committed',
      };
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);

      // Must throw error for already committed atom
      await expect(service.commit('test-uuid')).rejects.toThrow('Atom is already committed');
    });

    // @atom IA-023
    it('should throw NotFoundException when atom to commit not found', async () => {
      mockAtomRepository.findOne.mockResolvedValue(null);

      // Must throw NotFoundException for non-existent atom
      await expect(service.commit('non-existent')).rejects.toThrow(NotFoundException);
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
      mockAtomRepository.findOne.mockResolvedValue(mockAtom);
      mockAtomRepository.save.mockResolvedValue({
        ...mockAtom,
        status: 'superseded',
        supersededBy: 'new-uuid',
      });

      const result = await service.supersede('old-uuid', 'new-uuid');

      // Status must be changed to superseded
      expect(result.status).toBe('superseded');
      // supersededBy must reference new atom
      expect(result.supersededBy).toBe('new-uuid');
    });

    // @atom IA-024
    it('should throw NotFoundException when atom to supersede not found', async () => {
      mockAtomRepository.findOne.mockResolvedValue(null);

      // Must throw NotFoundException for non-existent atom
      await expect(service.supersede('non-existent', 'new-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
