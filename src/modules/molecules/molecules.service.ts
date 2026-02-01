import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Molecule, LensType, LENS_TYPE_LABELS, LENS_TYPE_DESCRIPTIONS } from './molecule.entity';
import { MoleculeAtom } from './molecule-atom.entity';
import { MoleculesRepository, PaginatedMoleculesResponse } from './molecules.repository';
import {
  CreateMoleculeDto,
  UpdateMoleculeDto,
  MoleculeSearchDto,
  AddAtomToMoleculeDto,
  BatchAddAtomsDto,
  ReorderAtomsDto,
  BatchUpdateAtomsDto,
  GetAtomsQueryDto,
  MoleculeMetricsDto,
  RealizationStatusDto,
  QualityScoreDto,
  MoleculeStatisticsDto,
  LensTypeInfoDto,
} from './dto';
import { Atom } from '../atoms/atom.entity';
import { Validator } from '../validators/validator.entity';

/**
 * Service for managing molecules and their relationships with atoms
 */
@Injectable()
export class MoleculesService {
  constructor(
    private readonly moleculesRepository: MoleculesRepository,
    @InjectRepository(Atom)
    private readonly atomRepository: Repository<Atom>,
    @InjectRepository(Validator)
    private readonly validatorRepository: Repository<Validator>,
  ) {}

  /**
   * Create a new molecule
   */
  async create(dto: CreateMoleculeDto, userId: string): Promise<Molecule> {
    // Validate parent molecule if provided
    if (dto.parentMoleculeId) {
      const parent = await this.moleculesRepository.baseRepository.findOne({
        where: { id: dto.parentMoleculeId },
      });
      if (!parent) {
        throw new NotFoundException(`Parent molecule with ID "${dto.parentMoleculeId}" not found`);
      }

      // Check hierarchy depth (trigger will also check, but nice to give clear error)
      const ancestors = await this.moleculesRepository.getAncestorChain(dto.parentMoleculeId);
      if (ancestors.length >= 10) {
        throw new BadRequestException(
          'Cannot create molecule: would exceed maximum hierarchy depth of 10 levels',
        );
      }
    }

    // Validate custom lens label
    if (dto.lensType === 'custom' && !dto.lensLabel) {
      throw new BadRequestException('Custom label is required when lens type is "custom"');
    }

    // Generate molecule ID
    const moleculeId = await this.moleculesRepository.generateMoleculeId();

    // Create the molecule
    const molecule = this.moleculesRepository.baseRepository.create({
      moleculeId,
      name: dto.name,
      description: dto.description || null,
      lensType: dto.lensType,
      lensLabel: dto.lensType === 'custom' ? dto.lensLabel : null,
      parentMoleculeId: dto.parentMoleculeId || null,
      ownerId: userId,
      tags: dto.tags || [],
      metadata: {},
    });

    return this.moleculesRepository.baseRepository.save(molecule);
  }

  /**
   * Find all molecules with filtering and pagination
   */
  async findAll(options: MoleculeSearchDto): Promise<PaginatedMoleculesResponse<Molecule>> {
    return this.moleculesRepository.search(options);
  }

  /**
   * Find a single molecule by ID
   */
  async findOne(id: string): Promise<Molecule> {
    const molecule = await this.moleculesRepository.baseRepository.findOne({
      where: { id },
      relations: ['parentMolecule', 'childMolecules', 'moleculeAtoms'],
    });

    if (!molecule) {
      throw new NotFoundException(`Molecule with ID "${id}" not found`);
    }

    return molecule;
  }

  /**
   * Find a molecule by moleculeId (e.g., "M-001")
   */
  async findByMoleculeId(moleculeId: string): Promise<Molecule> {
    const molecule = await this.moleculesRepository.baseRepository.findOne({
      where: { moleculeId },
      relations: ['parentMolecule', 'childMolecules'],
    });

    if (!molecule) {
      throw new NotFoundException(`Molecule with ID "${moleculeId}" not found`);
    }

    return molecule;
  }

  /**
   * Update a molecule
   */
  async update(id: string, dto: UpdateMoleculeDto): Promise<Molecule> {
    const molecule = await this.findOne(id);

    // Validate parent molecule change if provided
    if (dto.parentMoleculeId !== undefined && dto.parentMoleculeId !== molecule.parentMoleculeId) {
      if (dto.parentMoleculeId) {
        // Can't set self as parent
        if (dto.parentMoleculeId === id) {
          throw new BadRequestException('A molecule cannot be its own parent');
        }

        const parent = await this.moleculesRepository.baseRepository.findOne({
          where: { id: dto.parentMoleculeId },
        });
        if (!parent) {
          throw new NotFoundException(
            `Parent molecule with ID "${dto.parentMoleculeId}" not found`,
          );
        }

        // Check for cycles (would setting this parent create a cycle?)
        const descendants = await this.moleculesRepository.getDescendantIds(id);
        if (descendants.includes(dto.parentMoleculeId)) {
          throw new BadRequestException(
            'Cannot set parent: would create a cycle in molecule hierarchy',
          );
        }

        // Check hierarchy depth
        const ancestors = await this.moleculesRepository.getAncestorChain(dto.parentMoleculeId);
        if (ancestors.length >= 10) {
          throw new BadRequestException(
            'Cannot set parent: would exceed maximum hierarchy depth of 10 levels',
          );
        }
      }
    }

    // Validate custom lens label
    const newLensType = dto.lensType ?? molecule.lensType;
    if (newLensType === 'custom' && !dto.lensLabel && !molecule.lensLabel) {
      throw new BadRequestException('Custom label is required when lens type is "custom"');
    }

    // Apply updates
    Object.assign(molecule, {
      ...dto,
      lensLabel: newLensType === 'custom' ? (dto.lensLabel ?? molecule.lensLabel) : null,
    });

    return this.moleculesRepository.baseRepository.save(molecule);
  }

  /**
   * Delete a molecule (does not delete atoms!)
   */
  async remove(id: string): Promise<void> {
    const molecule = await this.findOne(id);

    // Update children to remove parent reference
    await this.moleculesRepository.baseRepository.update(
      { parentMoleculeId: id },
      { parentMoleculeId: null },
    );

    // Delete the molecule (junction table rows deleted by CASCADE)
    await this.moleculesRepository.baseRepository.remove(molecule);
  }

  /**
   * Add an atom to a molecule
   */
  async addAtom(
    moleculeId: string,
    dto: AddAtomToMoleculeDto,
    userId: string,
  ): Promise<MoleculeAtom> {
    // Verify molecule exists
    await this.findOne(moleculeId);

    // Verify atom exists
    const atom = await this.atomRepository.findOne({
      where: { id: dto.atomId },
    });
    if (!atom) {
      throw new NotFoundException(`Atom with ID "${dto.atomId}" not found`);
    }

    // Check if atom is already in molecule (and active)
    const existing = await this.moleculesRepository.atomJunctionRepository.findOne({
      where: { moleculeId, atomId: dto.atomId },
    });

    if (existing && !existing.removedAt) {
      throw new ConflictException(`Atom "${dto.atomId}" is already in molecule "${moleculeId}"`);
    }

    // If atom was previously removed, reactivate it
    if (existing && existing.removedAt) {
      existing.removedAt = null;
      existing.removedBy = null;
      existing.order = dto.order ?? existing.order;
      existing.note = dto.note ?? existing.note;
      existing.addedAt = new Date();
      existing.addedBy = userId;
      return this.moleculesRepository.atomJunctionRepository.save(existing);
    }

    // Determine order if not provided
    let order = dto.order;
    if (order === undefined) {
      const maxOrder = await this.moleculesRepository.atomJunctionRepository
        .createQueryBuilder('ma')
        .select('MAX(ma.order)', 'maxOrder')
        .where('ma.moleculeId = :moleculeId', { moleculeId })
        .andWhere('ma.removedAt IS NULL')
        .getRawOne();
      order = (maxOrder?.maxOrder ?? -1) + 1;
    }

    // Create junction record
    const junction = this.moleculesRepository.atomJunctionRepository.create({
      moleculeId,
      atomId: dto.atomId,
      order,
      note: dto.note || null,
      addedBy: userId,
    });

    return this.moleculesRepository.atomJunctionRepository.save(junction);
  }

  /**
   * Batch add atoms to a molecule
   */
  async batchAddAtoms(
    moleculeId: string,
    dto: BatchAddAtomsDto,
    userId: string,
  ): Promise<MoleculeAtom[]> {
    // Verify molecule exists
    await this.findOne(moleculeId);

    // Verify all atoms exist
    const atomIds = dto.atoms.map((a) => a.atomId);
    const existingAtoms = await this.atomRepository.find({
      where: { id: In(atomIds) },
    });
    const existingAtomIds = new Set(existingAtoms.map((a) => a.id));

    const missingAtoms = atomIds.filter((id) => !existingAtomIds.has(id));
    if (missingAtoms.length > 0) {
      throw new NotFoundException(`Atoms not found: ${missingAtoms.join(', ')}`);
    }

    // Get current max order
    const maxOrderResult = await this.moleculesRepository.atomJunctionRepository
      .createQueryBuilder('ma')
      .select('MAX(ma.order)', 'maxOrder')
      .where('ma.moleculeId = :moleculeId', { moleculeId })
      .andWhere('ma.removedAt IS NULL')
      .getRawOne();
    let nextOrder = (maxOrderResult?.maxOrder ?? -1) + 1;

    const results: MoleculeAtom[] = [];

    for (const atomDto of dto.atoms) {
      try {
        const junction = await this.addAtom(
          moleculeId,
          {
            atomId: atomDto.atomId,
            order: atomDto.order ?? nextOrder++,
            note: atomDto.note,
          },
          userId,
        );
        results.push(junction);
      } catch (error) {
        // Skip conflicts (already in molecule)
        if (!(error instanceof ConflictException)) {
          throw error;
        }
      }
    }

    return results;
  }

  /**
   * Remove an atom from a molecule (soft delete)
   */
  async removeAtom(moleculeId: string, atomId: string, userId: string): Promise<void> {
    const junction = await this.moleculesRepository.atomJunctionRepository.findOne({
      where: { moleculeId, atomId },
    });

    if (!junction) {
      throw new NotFoundException(`Atom "${atomId}" not found in molecule "${moleculeId}"`);
    }

    if (junction.removedAt) {
      throw new BadRequestException(
        `Atom "${atomId}" was already removed from molecule "${moleculeId}"`,
      );
    }

    // Soft delete - set removedAt and removedBy
    junction.removedAt = new Date();
    junction.removedBy = userId;

    await this.moleculesRepository.atomJunctionRepository.save(junction);
  }

  /**
   * Reorder atoms within a molecule
   */
  async reorderAtoms(moleculeId: string, dto: ReorderAtomsDto): Promise<void> {
    // Verify molecule exists
    await this.findOne(moleculeId);

    // Update order for each atom
    for (const item of dto.atomOrders) {
      await this.moleculesRepository.atomJunctionRepository.update(
        { moleculeId, atomId: item.atomId },
        { order: item.order },
      );
    }
  }

  /**
   * Batch update atom properties in a molecule
   */
  async batchUpdateAtoms(moleculeId: string, dto: BatchUpdateAtomsDto): Promise<void> {
    // Verify molecule exists
    await this.findOne(moleculeId);

    for (const item of dto.atoms) {
      const updates: { order?: number; note?: string | null } = {};
      if (item.order !== undefined) updates.order = item.order;
      if (item.note !== undefined) updates.note = item.note;

      if (Object.keys(updates).length > 0) {
        await this.moleculesRepository.atomJunctionRepository.update(
          { moleculeId, atomId: item.atomId },
          updates,
        );
      }
    }
  }

  /**
   * Get atoms in a molecule with optional transitive closure
   */
  async getAtoms(moleculeId: string, options: GetAtomsQueryDto = {}): Promise<Atom[]> {
    const { includeChildMolecules = false, recursive = true, activeOnly = true } = options;

    let moleculeIds = [moleculeId];

    // If including child molecules, get all descendant IDs
    if (includeChildMolecules) {
      if (recursive) {
        const descendants = await this.moleculesRepository.getDescendantIds(moleculeId);
        moleculeIds = [moleculeId, ...descendants];
      } else {
        // Just direct children
        const children = await this.moleculesRepository.baseRepository.find({
          where: { parentMoleculeId: moleculeId },
          select: ['id'],
        });
        moleculeIds = [moleculeId, ...children.map((c) => c.id)];
      }
    }

    // Build query for atoms
    const qb = this.atomRepository
      .createQueryBuilder('atom')
      .innerJoin('molecule_atoms', 'ma', 'ma.atomId = atom.id')
      .where('ma.moleculeId IN (:...moleculeIds)', { moleculeIds });

    if (activeOnly) {
      qb.andWhere('ma.removedAt IS NULL');
    }

    qb.orderBy('ma.order', 'ASC');

    return qb.getMany();
  }

  /**
   * Get child molecules
   */
  async getChildren(moleculeId: string): Promise<Molecule[]> {
    return this.moleculesRepository.baseRepository.find({
      where: { parentMoleculeId: moleculeId },
      order: { name: 'ASC' },
    });
  }

  /**
   * Get ancestor chain (from immediate parent to root)
   */
  async getAncestors(moleculeId: string): Promise<Molecule[]> {
    return this.moleculesRepository.getAncestorChain(moleculeId);
  }

  /**
   * Compute metrics for a molecule
   */
  async getMetrics(moleculeId: string): Promise<MoleculeMetricsDto> {
    // Get atoms in molecule
    const atoms = await this.getAtoms(moleculeId, { activeOnly: true });
    const atomCount = atoms.length;

    // Get child molecule count
    const children = await this.moleculesRepository.baseRepository.count({
      where: { parentMoleculeId: moleculeId },
    });

    if (atomCount === 0) {
      return {
        atomCount: 0,
        validatorCoverage: 0,
        verificationHealth: 0,
        realizationStatus: {
          draft: 0,
          committed: 0,
          superseded: 0,
          overall: 'unrealized',
        },
        aggregateQuality: {
          average: 0,
          min: null,
          max: null,
        },
        childMoleculeCount: children,
      };
    }

    // Calculate realization status
    const statusCounts = { draft: 0, committed: 0, superseded: 0 };
    for (const atom of atoms) {
      const status = atom.status as 'draft' | 'committed' | 'superseded';
      statusCounts[status]++;
    }

    const committedRatio = statusCounts.committed / atomCount;
    let overall: 'unrealized' | 'partial' | 'realized' = 'unrealized';
    if (committedRatio === 1) {
      overall = 'realized';
    } else if (committedRatio > 0) {
      overall = 'partial';
    }

    const realizationStatus: RealizationStatusDto = {
      ...statusCounts,
      overall,
    };

    // Calculate quality scores
    const qualityScores = atoms
      .filter((a) => a.qualityScore !== null)
      .map((a) => Number(a.qualityScore));

    const aggregateQuality: QualityScoreDto = {
      average:
        qualityScores.length > 0
          ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
          : 0,
      min: qualityScores.length > 0 ? Math.min(...qualityScores) : null,
      max: qualityScores.length > 0 ? Math.max(...qualityScores) : null,
    };

    // Calculate validator coverage and verification health
    const atomIds = atoms.map((a) => a.id);
    const validators = await this.validatorRepository.find({
      where: { atomId: In(atomIds), isActive: true },
    });

    const atomsWithValidators = new Set(validators.map((v) => v.atomId));
    const validatorCoverage = atomCount > 0 ? (atomsWithValidators.size / atomCount) * 100 : 0;

    // For verification health, we'd need actual execution results
    // For now, assume all active validators are passing (placeholder)
    const verificationHealth = atomsWithValidators.size > 0 ? 100 : 0;

    return {
      atomCount,
      validatorCoverage,
      verificationHealth,
      realizationStatus,
      aggregateQuality,
      childMoleculeCount: children,
    };
  }

  /**
   * Get orphan atoms (not in any molecule)
   */
  async getOrphanAtoms(): Promise<Atom[]> {
    const orphanIds = await this.moleculesRepository.getOrphanAtomIds();
    if (orphanIds.length === 0) {
      return [];
    }
    return this.atomRepository.find({
      where: { id: In(orphanIds) },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get statistics about molecules
   */
  async getStatistics(): Promise<MoleculeStatisticsDto> {
    const stats = await this.moleculesRepository.getStatistics();
    const orphanCount = (await this.moleculesRepository.getOrphanAtomIds()).length;

    return {
      totalMolecules: stats.totalMolecules,
      byLensType: stats.byLensType,
      averageAtomsPerMolecule: stats.averageAtomsPerMolecule,
      rootMoleculeCount: stats.rootMoleculeCount,
      orphanAtomCount: orphanCount,
    };
  }

  /**
   * Get available lens types with metadata
   */
  getLensTypes(): LensTypeInfoDto[] {
    const types: LensType[] = [
      'user_story',
      'feature',
      'journey',
      'epic',
      'release',
      'capability',
      'custom',
    ];

    return types.map((type) => ({
      type,
      label: LENS_TYPE_LABELS[type],
      description: LENS_TYPE_DESCRIPTIONS[type],
    }));
  }

  /**
   * Get molecules containing a specific atom
   */
  async getMoleculesForAtom(atomId: string): Promise<Molecule[]> {
    return this.moleculesRepository.findMoleculesContainingAtom(atomId);
  }
}
