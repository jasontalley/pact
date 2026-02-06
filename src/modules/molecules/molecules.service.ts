import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Molecule, LensType, LENS_TYPE_LABELS, LENS_TYPE_DESCRIPTIONS } from './molecule.entity';
import { ChangeSetMetadata, ChangeSetStatus } from './change-set.types';
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
    const statusCounts = { proposed: 0, draft: 0, committed: 0, superseded: 0 };
    for (const atom of atoms) {
      const status = atom.status as 'proposed' | 'draft' | 'committed' | 'superseded';
      if (status in statusCounts) {
        statusCounts[status]++;
      }
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
      'change_set',
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

  // ========================================
  // Change Set Operations
  // ========================================

  /**
   * Create a new change set molecule.
   * A change set groups proposed atom changes for batch review and commitment.
   */
  async createChangeSet(
    dto: {
      name: string;
      description?: string;
      summary?: string;
      sourceRef?: string;
      source?: 'manual' | 'reconciliation' | 'import';
      reconciliationRunId?: string;
      tags?: string[];
    },
    userId: string,
  ): Promise<Molecule> {
    const moleculeId = await this.moleculesRepository.generateMoleculeId();

    const changeSetMetadata: ChangeSetMetadata = {
      status: 'draft',
      createdBy: userId,
      summary: dto.summary,
      sourceRef: dto.sourceRef,
      source: dto.source,
      reconciliationRunId: dto.reconciliationRunId,
      approvals: [],
      requiredApprovals: 1,
    };

    const molecule = this.moleculesRepository.baseRepository.create({
      moleculeId,
      name: dto.name,
      description: dto.description || null,
      lensType: 'change_set' as LensType,
      lensLabel: null,
      parentMoleculeId: null,
      ownerId: userId,
      tags: dto.tags || [],
      metadata: {},
      changeSetMetadata,
    });

    return this.moleculesRepository.baseRepository.save(molecule);
  }

  /**
   * Add an atom to a change set.
   * Only allowed when the change set is in 'draft' status.
   */
  async addAtomToChangeSet(
    changeSetId: string,
    atomId: string,
    userId: string,
    note?: string,
  ): Promise<void> {
    const molecule = await this.findOne(changeSetId);
    this.assertChangeSet(molecule);
    this.assertChangeSetStatus(molecule, ['draft']);

    await this.addAtom(changeSetId, { atomId, note }, userId);
  }

  /**
   * Submit a change set for review.
   * Transitions status from 'draft' to 'review'.
   */
  async submitChangeSetForReview(changeSetId: string, userId: string): Promise<Molecule> {
    const molecule = await this.findOne(changeSetId);
    this.assertChangeSet(molecule);
    this.assertChangeSetStatus(molecule, ['draft']);

    // Must have at least one atom
    const atoms = await this.getAtoms(changeSetId, { activeOnly: true });
    if (atoms.length === 0) {
      throw new BadRequestException('Cannot submit an empty change set for review');
    }

    molecule.changeSetMetadata = {
      ...molecule.changeSetMetadata!,
      status: 'review' as ChangeSetStatus,
      submittedAt: new Date().toISOString(),
    };

    return this.moleculesRepository.baseRepository.save(molecule);
  }

  /**
   * Approve or reject a change set.
   * When sufficient approvals are received, status transitions to 'approved'.
   */
  async approveChangeSet(
    changeSetId: string,
    userId: string,
    decision: 'approved' | 'rejected',
    comment?: string,
  ): Promise<Molecule> {
    const molecule = await this.findOne(changeSetId);
    this.assertChangeSet(molecule);
    this.assertChangeSetStatus(molecule, ['review']);

    const metadata = molecule.changeSetMetadata!;

    // Check for duplicate approval from same user
    const existingApproval = metadata.approvals.find((a) => a.userId === userId);
    if (existingApproval) {
      throw new ConflictException(`User "${userId}" has already submitted a decision`);
    }

    metadata.approvals.push({
      userId,
      decision,
      comment,
      timestamp: new Date().toISOString(),
    });

    if (decision === 'rejected') {
      metadata.status = 'rejected';
    } else {
      // Check if we have enough approvals
      const approvalCount = metadata.approvals.filter((a) => a.decision === 'approved').length;
      if (approvalCount >= metadata.requiredApprovals) {
        metadata.status = 'approved';
      }
    }

    molecule.changeSetMetadata = metadata;
    return this.moleculesRepository.baseRepository.save(molecule);
  }

  /**
   * Commit a change set — batch commits all uncommitted atoms (draft + proposed) in the set.
   * Only allowed when the change set is in 'approved' status.
   * Atoms must meet quality gate (score >= 80).
   * All committed atoms are promoted to Main (promotedToMainAt set).
   */
  async commitChangeSet(changeSetId: string, userId: string): Promise<Molecule> {
    const molecule = await this.findOne(changeSetId);
    this.assertChangeSet(molecule);
    this.assertChangeSetStatus(molecule, ['approved']);

    const atoms = await this.getAtoms(changeSetId, { activeOnly: true });
    const uncommittedAtoms = atoms.filter((a) => a.status === 'draft' || a.status === 'proposed');

    if (uncommittedAtoms.length === 0) {
      throw new BadRequestException('No uncommitted atoms to commit in this change set');
    }

    // Quality gate check for all uncommitted atoms
    const failingAtoms = uncommittedAtoms.filter((a) => (a.qualityScore ?? 0) < 80);
    if (failingAtoms.length > 0) {
      const ids = failingAtoms.map((a) => a.atomId || a.id).join(', ');
      throw new BadRequestException(
        `Cannot commit change set: atoms [${ids}] have quality score below 80`,
      );
    }

    // Batch commit all uncommitted atoms and promote to Main
    const committedAtomIds: string[] = [];
    const promotedAtomIds: string[] = [];
    const now = new Date();
    for (const atom of uncommittedAtoms) {
      atom.status = 'committed';
      atom.committedAt = now;
      atom.promotedToMainAt = now;
      atom.changeSetId = null; // Clear change set membership after commit
      await this.atomRepository.save(atom);
      committedAtomIds.push(atom.id);
      promotedAtomIds.push(atom.id);
    }

    // Update change set metadata
    molecule.changeSetMetadata = {
      ...molecule.changeSetMetadata!,
      status: 'committed' as ChangeSetStatus,
      committedAt: now.toISOString(),
      committedAtomIds,
      promotedAtomIds,
    };

    return this.moleculesRepository.baseRepository.save(molecule);
  }

  /**
   * Get a change set with its current status and atoms.
   */
  async getChangeSet(changeSetId: string): Promise<{ molecule: Molecule; atoms: Atom[] }> {
    const molecule = await this.findOne(changeSetId);
    this.assertChangeSet(molecule);

    const atoms = await this.getAtoms(changeSetId, { activeOnly: true });
    return { molecule, atoms };
  }

  /**
   * List all change sets, optionally filtered by status.
   */
  async listChangeSets(status?: ChangeSetStatus): Promise<Molecule[]> {
    const qb = this.moleculesRepository.baseRepository
      .createQueryBuilder('molecule')
      .where('molecule.lensType = :lensType', { lensType: 'change_set' })
      .orderBy('molecule.createdAt', 'DESC');

    if (status) {
      qb.andWhere("molecule.changeSetMetadata->>'status' = :status", { status });
    }

    return qb.getMany();
  }

  // ---- Change Set Helpers ----

  private assertChangeSet(molecule: Molecule): void {
    if (molecule.lensType !== 'change_set') {
      throw new BadRequestException(`Molecule "${molecule.moleculeId}" is not a change set`);
    }
  }

  private assertChangeSetStatus(molecule: Molecule, allowedStatuses: ChangeSetStatus[]): void {
    const currentStatus = molecule.changeSetMetadata?.status;
    if (!currentStatus || !allowedStatuses.includes(currentStatus)) {
      throw new BadRequestException(
        `Change set "${molecule.moleculeId}" is in status "${currentStatus}", expected one of: ${allowedStatuses.join(', ')}`,
      );
    }
  }
}
