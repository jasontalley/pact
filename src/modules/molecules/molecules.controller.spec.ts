/**
 * Molecules Controller Tests
 *
 * Tests for the molecules controller endpoints.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { MoleculesController } from './molecules.controller';
import { MoleculesService } from './molecules.service';
import { Molecule, LensType } from './molecule.entity';
import { MoleculeAtom } from './molecule-atom.entity';
import { Atom } from '../atoms/atom.entity';
import { MoleculeResponseDto, MoleculeMetricsDto, LensTypeInfoDto } from './dto';

describe('MoleculesController', () => {
  let controller: MoleculesController;
  let mockMoleculesService: jest.Mocked<MoleculesService>;

  const mockMolecule: Partial<Molecule> = {
    id: 'molecule-uuid-1',
    moleculeId: 'M-001',
    name: 'User Authentication Flow',
    description: 'Covers the complete authentication flow',
    lensType: 'user_story' as LensType,
    lensLabel: null,
    parentMoleculeId: null,
    ownerId: 'user-123',
    tags: ['authentication', 'security'],
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMetrics: MoleculeMetricsDto = {
    atomCount: 5,
    validatorCoverage: 80,
    verificationHealth: 90,
    realizationStatus: {
      draft: 2,
      committed: 3,
      superseded: 0,
      overall: 'partial',
    },
    aggregateQuality: {
      average: 85,
      min: 70,
      max: 95,
    },
    childMoleculeCount: 2,
  };

  const mockAtom: Partial<Atom> = {
    id: 'atom-uuid-1',
    atomId: 'IA-001',
    description: 'User can log in with valid credentials',
    category: 'functional',
    status: 'committed',
    qualityScore: 85,
    createdAt: new Date(),
    tags: [],
    metadata: {},
  };

  const mockMoleculeAtom: Partial<MoleculeAtom> = {
    moleculeId: 'molecule-uuid-1',
    atomId: 'atom-uuid-1',
    order: 0,
    note: null,
    addedAt: new Date(),
    addedBy: 'user-123',
    removedAt: null,
    removedBy: null,
  };

  beforeEach(async () => {
    mockMoleculesService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      getMetrics: jest.fn(),
      getLensTypes: jest.fn(),
      getStatistics: jest.fn(),
      getOrphanAtoms: jest.fn(),
      getAtoms: jest.fn(),
      addAtom: jest.fn(),
      batchAddAtoms: jest.fn(),
      removeAtom: jest.fn(),
      reorderAtoms: jest.fn(),
      batchUpdateAtoms: jest.fn(),
      getChildren: jest.fn(),
      getAncestors: jest.fn(),
    } as unknown as jest.Mocked<MoleculesService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MoleculesController],
      providers: [{ provide: MoleculesService, useValue: mockMoleculesService }],
    }).compile();

    controller = module.get<MoleculesController>(MoleculesController);
  });

  describe('create', () => {
    it('should create a molecule', async () => {
      mockMoleculesService.create.mockResolvedValue(mockMolecule as Molecule);

      const result = await controller.create({
        name: 'User Authentication Flow',
        description: 'Covers the complete authentication flow',
        lensType: 'user_story' as LensType,
      });

      expect(result).toBe(mockMolecule);
      expect(mockMoleculesService.create).toHaveBeenCalledWith(
        {
          name: 'User Authentication Flow',
          description: 'Covers the complete authentication flow',
          lensType: 'user_story' as LensType,
        },
        'system',
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated list of molecules with metrics', async () => {
      mockMoleculesService.findAll.mockResolvedValue({
        items: [mockMolecule as Molecule],
        total: 1,
        limit: 20,
        offset: 0,
        nextCursor: undefined,
      });
      mockMoleculesService.getMetrics.mockResolvedValue(mockMetrics);

      const result = await controller.findAll({});

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockMoleculesService.getMetrics).toHaveBeenCalledWith(mockMolecule.id);
    });

    it('should apply filters', async () => {
      mockMoleculesService.findAll.mockResolvedValue({
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
        nextCursor: undefined,
      });

      await controller.findAll({ lensType: ['feature'] as LensType[], search: 'auth' });

      expect(mockMoleculesService.findAll).toHaveBeenCalledWith({
        lensType: ['feature'],
        search: 'auth',
      });
    });
  });

  describe('getLensTypes', () => {
    it('should return available lens types', () => {
      const lensTypes: LensTypeInfoDto[] = [
        { type: 'feature' as LensType, label: 'Feature', description: 'Feature description' },
        { type: 'user_story' as LensType, label: 'User Story', description: 'User story description' },
      ];
      mockMoleculesService.getLensTypes.mockReturnValue(lensTypes);

      const result = controller.getLensTypes();

      expect(result).toEqual(lensTypes);
    });
  });

  describe('getStatistics', () => {
    it('should return molecule statistics', async () => {
      const stats = {
        totalMolecules: 10,
        byLensType: {
          feature: 5,
          user_story: 5,
          journey: 0,
          epic: 0,
          release: 0,
          capability: 0,
          custom: 0,
        } as Record<LensType, number>,
        averageAtomsPerMolecule: 3.5,
        rootMoleculeCount: 4,
        orphanAtomCount: 2,
      };
      mockMoleculesService.getStatistics.mockResolvedValue(stats);

      const result = await controller.getStatistics();

      expect(result).toEqual(stats);
    });
  });

  describe('getOrphanAtoms', () => {
    it('should return atoms not in any molecule', async () => {
      mockMoleculesService.getOrphanAtoms.mockResolvedValue([mockAtom as Atom]);

      const result = await controller.getOrphanAtoms();

      expect(result).toEqual([mockAtom]);
    });
  });

  describe('findOne', () => {
    it('should return a molecule by ID with metrics', async () => {
      mockMoleculesService.findOne.mockResolvedValue(mockMolecule as Molecule);
      mockMoleculesService.getMetrics.mockResolvedValue(mockMetrics);

      const result = await controller.findOne('molecule-uuid-1');

      expect(result).toBeInstanceOf(MoleculeResponseDto);
      expect(mockMoleculesService.findOne).toHaveBeenCalledWith('molecule-uuid-1');
      expect(mockMoleculesService.getMetrics).toHaveBeenCalledWith('molecule-uuid-1');
    });
  });

  describe('update', () => {
    it('should update a molecule', async () => {
      const updated = { ...mockMolecule, name: 'Updated Name' } as Molecule;
      mockMoleculesService.update.mockResolvedValue(updated);

      const result = await controller.update('molecule-uuid-1', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
      expect(mockMoleculesService.update).toHaveBeenCalledWith('molecule-uuid-1', {
        name: 'Updated Name',
      });
    });
  });

  describe('remove', () => {
    it('should delete a molecule', async () => {
      mockMoleculesService.remove.mockResolvedValue(undefined);

      await controller.remove('molecule-uuid-1');

      expect(mockMoleculesService.remove).toHaveBeenCalledWith('molecule-uuid-1');
    });
  });

  describe('getAtoms', () => {
    it('should return atoms in a molecule', async () => {
      mockMoleculesService.getAtoms.mockResolvedValue([mockAtom as Atom]);

      const result = await controller.getAtoms('molecule-uuid-1', {});

      expect(result).toEqual([mockAtom]);
      expect(mockMoleculesService.getAtoms).toHaveBeenCalledWith('molecule-uuid-1', {});
    });

    it('should support includeChildMolecules option', async () => {
      mockMoleculesService.getAtoms.mockResolvedValue([mockAtom as Atom]);

      await controller.getAtoms('molecule-uuid-1', { includeChildMolecules: true });

      expect(mockMoleculesService.getAtoms).toHaveBeenCalledWith('molecule-uuid-1', {
        includeChildMolecules: true,
      });
    });
  });

  describe('addAtom', () => {
    it('should add an atom to a molecule', async () => {
      mockMoleculesService.addAtom.mockResolvedValue(mockMoleculeAtom as MoleculeAtom);

      const result = await controller.addAtom('molecule-uuid-1', { atomId: 'atom-uuid-1' });

      expect(result).toBe(mockMoleculeAtom);
      expect(mockMoleculesService.addAtom).toHaveBeenCalledWith(
        'molecule-uuid-1',
        { atomId: 'atom-uuid-1' },
        'system',
      );
    });
  });

  describe('batchAddAtoms', () => {
    it('should add multiple atoms to a molecule', async () => {
      const atoms = [mockMoleculeAtom as MoleculeAtom];
      mockMoleculesService.batchAddAtoms.mockResolvedValue(atoms);

      const result = await controller.batchAddAtoms('molecule-uuid-1', {
        atoms: [{ atomId: 'atom-uuid-1' }, { atomId: 'atom-uuid-2' }],
      });

      expect(result).toBe(atoms);
      expect(mockMoleculesService.batchAddAtoms).toHaveBeenCalledWith(
        'molecule-uuid-1',
        { atoms: [{ atomId: 'atom-uuid-1' }, { atomId: 'atom-uuid-2' }] },
        'system',
      );
    });
  });

  describe('removeAtom', () => {
    it('should remove an atom from a molecule', async () => {
      mockMoleculesService.removeAtom.mockResolvedValue(undefined);

      await controller.removeAtom('molecule-uuid-1', 'atom-uuid-1');

      expect(mockMoleculesService.removeAtom).toHaveBeenCalledWith(
        'molecule-uuid-1',
        'atom-uuid-1',
        'system',
      );
    });
  });

  describe('reorderAtoms', () => {
    it('should reorder atoms in a molecule', async () => {
      mockMoleculesService.reorderAtoms.mockResolvedValue(undefined);

      await controller.reorderAtoms('molecule-uuid-1', {
        atomOrders: [
          { atomId: 'atom-uuid-2', order: 0 },
          { atomId: 'atom-uuid-1', order: 1 },
        ],
      });

      expect(mockMoleculesService.reorderAtoms).toHaveBeenCalledWith('molecule-uuid-1', {
        atomOrders: [
          { atomId: 'atom-uuid-2', order: 0 },
          { atomId: 'atom-uuid-1', order: 1 },
        ],
      });
    });
  });

  describe('batchUpdateAtoms', () => {
    it('should batch update atom properties', async () => {
      mockMoleculesService.batchUpdateAtoms.mockResolvedValue(undefined);

      await controller.batchUpdateAtoms('molecule-uuid-1', {
        atoms: [{ atomId: 'atom-uuid-1', order: 5, note: 'Updated note' }],
      });

      expect(mockMoleculesService.batchUpdateAtoms).toHaveBeenCalledWith('molecule-uuid-1', {
        atoms: [{ atomId: 'atom-uuid-1', order: 5, note: 'Updated note' }],
      });
    });
  });

  describe('getChildren', () => {
    it('should return child molecules', async () => {
      const child = { ...mockMolecule, id: 'child-uuid', parentMoleculeId: 'molecule-uuid-1' };
      mockMoleculesService.getChildren.mockResolvedValue([child as Molecule]);

      const result = await controller.getChildren('molecule-uuid-1');

      expect(result).toEqual([child]);
      expect(mockMoleculesService.getChildren).toHaveBeenCalledWith('molecule-uuid-1');
    });
  });

  describe('getAncestors', () => {
    it('should return ancestor chain', async () => {
      const parent = { ...mockMolecule, id: 'parent-uuid' };
      mockMoleculesService.getAncestors.mockResolvedValue([parent as Molecule]);

      const result = await controller.getAncestors('molecule-uuid-1');

      expect(result).toEqual([parent]);
      expect(mockMoleculesService.getAncestors).toHaveBeenCalledWith('molecule-uuid-1');
    });
  });

  describe('getMetrics', () => {
    it('should return molecule metrics', async () => {
      mockMoleculesService.getMetrics.mockResolvedValue(mockMetrics);

      const result = await controller.getMetrics('molecule-uuid-1');

      expect(result).toEqual(mockMetrics);
      expect(mockMoleculesService.getMetrics).toHaveBeenCalledWith('molecule-uuid-1');
    });
  });
});
