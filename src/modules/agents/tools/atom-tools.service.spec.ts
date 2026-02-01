/**
 * Atom Tools Service Tests
 *
 * Tests for the atom-related tool executors.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AtomToolsService } from './atom-tools.service';
import { AtomsService } from '../../atoms/atoms.service';
import { AtomizationService } from '../atomization.service';
import { IntentRefinementService } from '../intent-refinement.service';

describe('AtomToolsService', () => {
  let service: AtomToolsService;
  let atomsService: jest.Mocked<AtomsService>;
  let atomizationService: jest.Mocked<AtomizationService>;
  let refinementService: jest.Mocked<IntentRefinementService>;

  const mockAtom = {
    id: 'uuid-123',
    atomId: 'IA-001',
    description: 'Test atom',
    category: 'functional',
    status: 'draft',
    tags: ['test'],
    qualityScore: 80,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtomToolsService,
        {
          provide: AtomsService,
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
            findByAtomId: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            commit: jest.fn(),
            remove: jest.fn(),
            getStatistics: jest.fn(),
            getPopularTags: jest.fn(),
          },
        },
        {
          provide: AtomizationService,
          useValue: {
            atomize: jest.fn(),
          },
        },
        {
          provide: IntentRefinementService,
          useValue: {
            suggestRefinements: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AtomToolsService>(AtomToolsService);
    atomsService = module.get(AtomsService);
    atomizationService = module.get(AtomizationService);
    refinementService = module.get(IntentRefinementService);
  });

  describe('analyze_intent', () => {
    it('should call atomization service', async () => {
      const result = { atoms: [mockAtom] };
      atomizationService.atomize.mockResolvedValue(result as any);

      const response = await service.execute('analyze_intent', {
        intent: 'User can log in',
      });

      expect(response).toEqual(result);
      expect(atomizationService.atomize).toHaveBeenCalledWith({
        intentDescription: 'User can log in',
      });
    });
  });

  describe('count_atoms', () => {
    it('should count atoms with filters', async () => {
      atomsService.findAll.mockResolvedValue({ items: [], total: 5 } as any);

      const response = await service.execute('count_atoms', {
        status: 'draft',
        category: 'functional',
      });

      expect(response).toEqual({ total: 5 });
      expect(atomsService.findAll).toHaveBeenCalledWith({
        status: 'draft',
        category: 'functional',
      });
    });

    it('should count all atoms without filters', async () => {
      atomsService.findAll.mockResolvedValue({ items: [], total: 10 } as any);

      const response = await service.execute('count_atoms', {});

      expect(response).toEqual({ total: 10 });
    });
  });

  describe('get_statistics', () => {
    it('should return atom statistics', async () => {
      const stats = { total: 100, byStatus: { draft: 50, committed: 50 } };
      atomsService.getStatistics.mockResolvedValue(stats as any);

      const response = await service.execute('get_statistics', {});

      expect(response).toEqual(stats);
    });
  });

  describe('search_atoms', () => {
    it('should search atoms with query', async () => {
      atomsService.findAll.mockResolvedValue({ items: [mockAtom], total: 1 } as any);

      const response = await service.execute('search_atoms', {
        query: 'login',
        category: 'functional',
        limit: 10,
      });

      expect(atomsService.findAll).toHaveBeenCalledWith({
        search: 'login',
        category: 'functional',
        status: undefined,
        limit: 10,
      });
    });
  });

  describe('list_atoms', () => {
    it('should list atoms with pagination', async () => {
      atomsService.findAll.mockResolvedValue({ items: [mockAtom], total: 1 } as any);

      await service.execute('list_atoms', {
        page: 2,
        limit: 10,
        sortBy: 'qualityScore',
        sortOrder: 'ASC',
      });

      expect(atomsService.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        status: undefined,
        category: undefined,
        sortBy: 'qualityScore',
        sortOrder: 'ASC',
      });
    });

    it('should use defaults for pagination', async () => {
      atomsService.findAll.mockResolvedValue({ items: [], total: 0 } as any);

      await service.execute('list_atoms', {});

      expect(atomsService.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        status: undefined,
        category: undefined,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      });
    });
  });

  describe('get_atom', () => {
    it('should get atom by atomId (IA-XXX format)', async () => {
      atomsService.findByAtomId.mockResolvedValue(mockAtom as any);

      const response = await service.execute('get_atom', { atomId: 'IA-001' });

      expect(response).toEqual(mockAtom);
      expect(atomsService.findByAtomId).toHaveBeenCalledWith('IA-001');
    });

    it('should get atom by UUID', async () => {
      atomsService.findOne.mockResolvedValue(mockAtom as any);

      const response = await service.execute('get_atom', { atomId: 'uuid-123' });

      expect(response).toEqual(mockAtom);
      expect(atomsService.findOne).toHaveBeenCalledWith('uuid-123');
    });

    it('should return null when atom not found', async () => {
      atomsService.findOne.mockRejectedValue(new Error('Not found'));

      const response = await service.execute('get_atom', { atomId: 'non-existent' });

      expect(response).toBeNull();
    });
  });

  describe('refine_atom', () => {
    it('should suggest refinements for atom', async () => {
      const refinements = { suggestions: ['Add observable criteria'] };
      refinementService.suggestRefinements.mockResolvedValue(refinements as any);

      const response = await service.execute('refine_atom', { atomId: 'uuid-123' });

      expect(response).toEqual(refinements);
      expect(refinementService.suggestRefinements).toHaveBeenCalledWith('uuid-123');
    });
  });

  describe('create_atom', () => {
    it('should create atom with tags', async () => {
      atomsService.create.mockResolvedValue(mockAtom as any);

      const response = await service.execute('create_atom', {
        description: 'New atom',
        category: 'functional',
        tags: 'tag1, tag2',
      });

      expect(response).toEqual(mockAtom);
      expect(atomsService.create).toHaveBeenCalledWith({
        description: 'New atom',
        category: 'functional',
        tags: ['tag1', 'tag2'],
      });
    });

    it('should create atom without tags', async () => {
      atomsService.create.mockResolvedValue(mockAtom as any);

      await service.execute('create_atom', {
        description: 'New atom',
        category: 'functional',
      });

      expect(atomsService.create).toHaveBeenCalledWith({
        description: 'New atom',
        category: 'functional',
        tags: [],
      });
    });
  });

  describe('update_atom', () => {
    it('should update atom by atomId', async () => {
      atomsService.findByAtomId.mockResolvedValue(mockAtom as any);
      atomsService.update.mockResolvedValue({ ...mockAtom, description: 'Updated' } as any);

      const response = await service.execute('update_atom', {
        atomId: 'IA-001',
        description: 'Updated',
      });

      expect(atomsService.findByAtomId).toHaveBeenCalledWith('IA-001');
      expect(atomsService.update).toHaveBeenCalledWith('uuid-123', {
        description: 'Updated',
      });
    });

    it('should update atom by UUID', async () => {
      atomsService.findOne.mockResolvedValue(mockAtom as any);
      atomsService.update.mockResolvedValue(mockAtom as any);

      await service.execute('update_atom', {
        atomId: 'uuid-123',
        category: 'performance',
        tags: 'new-tag',
        qualityScore: 90,
      });

      expect(atomsService.update).toHaveBeenCalledWith('uuid-123', {
        category: 'performance',
        tags: ['new-tag'],
        qualityScore: 90,
      });
    });

    it('should throw when atom not found', async () => {
      atomsService.findOne.mockRejectedValue(new Error('Not found'));

      await expect(
        service.execute('update_atom', { atomId: 'non-existent', description: 'Updated' }),
      ).rejects.toThrow('Atom non-existent not found');
    });
  });

  describe('commit_atom', () => {
    it('should commit atom by atomId', async () => {
      atomsService.findByAtomId.mockResolvedValue(mockAtom as any);
      atomsService.commit.mockResolvedValue({ ...mockAtom, status: 'committed' } as any);

      const response = await service.execute('commit_atom', { atomId: 'IA-001' });

      expect(atomsService.findByAtomId).toHaveBeenCalledWith('IA-001');
      expect(atomsService.commit).toHaveBeenCalledWith('uuid-123');
    });

    it('should commit atom by UUID', async () => {
      atomsService.findOne.mockResolvedValue(mockAtom as any);
      atomsService.commit.mockResolvedValue(mockAtom as any);

      await service.execute('commit_atom', { atomId: 'uuid-123' });

      expect(atomsService.findOne).toHaveBeenCalledWith('uuid-123');
      expect(atomsService.commit).toHaveBeenCalledWith('uuid-123');
    });

    it('should throw when atom not found', async () => {
      atomsService.findOne.mockRejectedValue(new Error('Not found'));

      await expect(service.execute('commit_atom', { atomId: 'non-existent' })).rejects.toThrow(
        'Atom non-existent not found',
      );
    });
  });

  describe('delete_atom', () => {
    it('should delete atom by atomId', async () => {
      atomsService.findByAtomId.mockResolvedValue(mockAtom as any);
      atomsService.remove.mockResolvedValue(undefined);

      const response = await service.execute('delete_atom', { atomId: 'IA-001' });

      expect(response).toEqual({ success: true, message: 'Atom IA-001 deleted' });
      expect(atomsService.remove).toHaveBeenCalledWith('uuid-123');
    });

    it('should throw when atom not found', async () => {
      atomsService.findOne.mockRejectedValue(new Error('Not found'));

      await expect(service.execute('delete_atom', { atomId: 'non-existent' })).rejects.toThrow(
        'Atom non-existent not found',
      );
    });
  });

  describe('get_popular_tags', () => {
    it('should get popular tags with limit', async () => {
      const tags = [{ tag: 'auth', count: 10 }];
      atomsService.getPopularTags.mockResolvedValue(tags as any);

      const response = await service.execute('get_popular_tags', { limit: 5 });

      expect(response).toEqual(tags);
      expect(atomsService.getPopularTags).toHaveBeenCalledWith(5);
    });

    it('should use default limit', async () => {
      atomsService.getPopularTags.mockResolvedValue([]);

      await service.execute('get_popular_tags', {});

      expect(atomsService.getPopularTags).toHaveBeenCalledWith(20);
    });
  });

  describe('unknown tool', () => {
    it('should throw for unknown tool name', async () => {
      await expect(service.execute('unknown_tool', {})).rejects.toThrow(
        'Unknown atom tool: unknown_tool',
      );
    });
  });
});
