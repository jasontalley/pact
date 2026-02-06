import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Atom, AtomStatus, AtomCategory } from './atom.entity';
import { MoleculeAtom } from '../molecules/molecule-atom.entity';
import { AtomsRepository } from './atoms.repository';
import { CreateAtomDto } from './dto/create-atom.dto';
import { UpdateAtomDto } from './dto/update-atom.dto';
import { AtomSearchDto, PaginatedAtomsResponse } from './dto/atom-search.dto';
import { SupersedeAtomDto, SupersessionResultDto } from './dto/supersede-atom.dto';
import { AtomsGateway } from '../../gateways/atoms.gateway';

/**
 * Service for managing Intent Atoms
 *
 * Enforces the following invariants:
 * - INV-004: Committed atoms are immutable (cannot be updated or deleted)
 * - Quality gate: Atoms must have quality score >= 80 to be committed
 *
 * Emits WebSocket events for real-time updates:
 * - atom:created - when a new atom is created
 * - atom:updated - when a draft atom is updated
 * - atom:deleted - when a draft atom is deleted
 * - atom:committed - when an atom is committed
 * - atom:superseded - when an atom is superseded
 */
@Injectable()
export class AtomsService {
  constructor(
    @InjectRepository(Atom)
    private readonly atomRepository: Repository<Atom>,
    @InjectRepository(MoleculeAtom)
    private readonly moleculeAtomRepository: Repository<MoleculeAtom>,
    private readonly atomsRepository: AtomsRepository,
    @Optional() private readonly atomsGateway?: AtomsGateway,
  ) {}

  /**
   * Generate the next atom ID in sequence (IA-001, IA-002, etc.)
   */
  private async generateAtomId(): Promise<string> {
    const latestAtom = await this.atomRepository.findOne({
      where: {},
      order: { atomId: 'DESC' },
    });

    const nextId = latestAtom ? Number.parseInt(latestAtom.atomId.split('-')[1], 10) + 1 : 1;
    return `IA-${String(nextId).padStart(3, '0')}`;
  }

  /**
   * Create a new Intent Atom
   */
  async create(createAtomDto: CreateAtomDto): Promise<Atom> {
    const atomId = await this.generateAtomId();

    const atom = this.atomRepository.create({
      atomId,
      description: createAtomDto.description,
      category: createAtomDto.category,
      qualityScore: createAtomDto.qualityScore ?? null,
      createdBy: createAtomDto.createdBy ?? null,
      tags: createAtomDto.tags ?? [],
      canvasPosition: createAtomDto.canvasPosition ?? null,
      parentIntent: createAtomDto.parentIntent ?? null,
      observableOutcomes: createAtomDto.observableOutcomes ?? [],
      falsifiabilityCriteria: createAtomDto.falsifiabilityCriteria ?? [],
      refinementHistory: [],
      status: 'draft',
      intentIdentity: (createAtomDto as any).intentIdentity ?? uuidv4(),
      intentVersion: (createAtomDto as any).intentVersion ?? 1,
    });

    const savedAtom = await this.atomRepository.save(atom);

    // Emit WebSocket event
    this.atomsGateway?.emitAtomCreated(savedAtom);

    return savedAtom;
  }

  /**
   * Get all atoms with optional filtering and pagination
   */
  async findAll(searchDto?: AtomSearchDto): Promise<PaginatedAtomsResponse<Atom>> {
    if (searchDto) {
      return this.atomsRepository.search(searchDto);
    }

    // Default: return all atoms without pagination
    const items = await this.atomRepository.find({
      order: { createdAt: 'DESC' },
    });

    return {
      items,
      total: items.length,
      page: 1,
      limit: items.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    };
  }

  /**
   * Get a single atom by UUID
   */
  async findOne(id: string): Promise<Atom> {
    const atom = await this.atomRepository.findOne({ where: { id } });
    if (!atom) {
      throw new NotFoundException(`Atom with ID ${id} not found`);
    }
    return atom;
  }

  /**
   * Get a single atom by atomId (e.g., "IA-001")
   */
  async findByAtomId(atomId: string): Promise<Atom> {
    const atom = await this.atomRepository.findOne({ where: { atomId } });
    if (!atom) {
      throw new NotFoundException(`Atom with atomId ${atomId} not found`);
    }
    return atom;
  }

  /**
   * Create a proposed atom within a governed change set.
   * Proposed atoms are mutable (like drafts) but must go through
   * change set approval before being committed.
   */
  async propose(createAtomDto: CreateAtomDto, changeSetId: string): Promise<Atom> {
    const atomId = await this.generateAtomId();

    const atom = this.atomRepository.create({
      atomId,
      description: createAtomDto.description,
      category: createAtomDto.category,
      qualityScore: createAtomDto.qualityScore ?? null,
      createdBy: createAtomDto.createdBy ?? null,
      tags: createAtomDto.tags ?? [],
      canvasPosition: createAtomDto.canvasPosition ?? null,
      parentIntent: createAtomDto.parentIntent ?? null,
      observableOutcomes: createAtomDto.observableOutcomes ?? [],
      falsifiabilityCriteria: createAtomDto.falsifiabilityCriteria ?? [],
      refinementHistory: [],
      status: 'proposed',
      changeSetId,
      intentIdentity: (createAtomDto as any).intentIdentity ?? uuidv4(),
      intentVersion: (createAtomDto as any).intentVersion ?? 1,
    });

    const savedAtom = await this.atomRepository.save(atom);

    // Emit WebSocket event
    this.atomsGateway?.emitAtomProposed?.(savedAtom, changeSetId);

    return savedAtom;
  }

  /**
   * Convert a proposed atom back to a draft, removing it from governance.
   * Escape hatch for atoms that should not go through change set approval.
   */
  async convertToDraft(id: string): Promise<Atom> {
    const atom = await this.findOne(id);

    if (atom.status !== 'proposed') {
      throw new BadRequestException(
        `Only proposed atoms can be converted to draft. Current status: '${atom.status}'`,
      );
    }

    atom.status = 'draft';
    atom.changeSetId = null;

    const savedAtom = await this.atomRepository.save(atom);

    this.atomsGateway?.emitAtomUpdated(savedAtom);

    return savedAtom;
  }

  /**
   * Update a draft or proposed atom
   * Throws ForbiddenException if atom is not in draft/proposed status (INV-004)
   */
  async update(id: string, updateAtomDto: UpdateAtomDto): Promise<Atom> {
    const atom = await this.findOne(id);

    if (atom.status !== 'draft' && atom.status !== 'proposed') {
      throw new ForbiddenException(
        `Cannot update atom with status '${atom.status}'. Only draft or proposed atoms can be updated.`,
      );
    }

    // Update allowed fields
    if (updateAtomDto.description !== undefined) {
      atom.description = updateAtomDto.description;
    }
    if (updateAtomDto.category !== undefined) {
      atom.category = updateAtomDto.category;
    }
    if (updateAtomDto.qualityScore !== undefined) {
      atom.qualityScore = updateAtomDto.qualityScore;
    }
    if (updateAtomDto.tags !== undefined) {
      atom.tags = updateAtomDto.tags;
    }
    if (updateAtomDto.canvasPosition !== undefined) {
      atom.canvasPosition = updateAtomDto.canvasPosition;
    }
    if (updateAtomDto.parentIntent !== undefined) {
      atom.parentIntent = updateAtomDto.parentIntent;
    }
    if (updateAtomDto.observableOutcomes !== undefined) {
      atom.observableOutcomes = updateAtomDto.observableOutcomes;
    }
    if (updateAtomDto.falsifiabilityCriteria !== undefined) {
      atom.falsifiabilityCriteria = updateAtomDto.falsifiabilityCriteria;
    }

    const savedAtom = await this.atomRepository.save(atom);

    // Emit WebSocket event
    this.atomsGateway?.emitAtomUpdated(savedAtom);

    return savedAtom;
  }

  /**
   * Delete a draft or proposed atom
   * Throws ForbiddenException if atom is not in draft/proposed status (INV-004)
   */
  async remove(id: string): Promise<void> {
    const atom = await this.findOne(id);
    const atomId = atom.id;

    if (atom.status !== 'draft' && atom.status !== 'proposed') {
      throw new ForbiddenException(
        `Cannot delete atom with status '${atom.status}'. Only draft or proposed atoms can be deleted.`,
      );
    }

    // Remove any molecule junction records for this atom
    // This is necessary because MoleculeAtom has onDelete: 'RESTRICT'
    await this.moleculeAtomRepository.delete({ atomId: atom.id });

    await this.atomRepository.remove(atom);

    // Emit WebSocket event
    this.atomsGateway?.emitAtomDeleted(atomId);
  }

  /**
   * Commit an atom (make it immutable) and promote to Main.
   * Enforces quality gate: atom must have quality score >= 80.
   * Proposed atoms must go through their change set — use commitChangeSet() instead.
   */
  async commit(id: string): Promise<Atom> {
    const atom = await this.findOne(id);

    if (atom.status === 'committed') {
      throw new BadRequestException('Atom is already committed');
    }

    if (atom.status === 'superseded') {
      throw new BadRequestException('Cannot commit a superseded atom');
    }

    if (atom.status === 'proposed') {
      throw new BadRequestException(
        'Proposed atoms must be committed through their change set',
      );
    }

    // Quality gate enforcement
    const qualityScore = atom.qualityScore ?? 0;
    if (qualityScore < 80) {
      throw new BadRequestException(
        `Cannot commit atom with quality score ${qualityScore}. Minimum required score is 80.`,
      );
    }

    atom.status = 'committed';
    atom.committedAt = new Date();
    atom.promotedToMainAt = new Date();

    const savedAtom = await this.atomRepository.save(atom);

    // Emit WebSocket events
    this.atomsGateway?.emitAtomCommitted(savedAtom);
    this.atomsGateway?.emitAtomPromotedToMain?.(savedAtom);

    return savedAtom;
  }

  /**
   * Supersede an atom with a new atom
   */
  async supersede(id: string, newAtomId: string): Promise<Atom> {
    const atom = await this.findOne(id);

    if (atom.status === 'superseded') {
      throw new BadRequestException('Atom is already superseded');
    }

    // Verify the new atom exists
    const newAtom = await this.atomRepository.findOne({
      where: [{ id: newAtomId }, { atomId: newAtomId }],
    });

    if (!newAtom) {
      throw new NotFoundException(`New atom with ID ${newAtomId} not found`);
    }

    atom.status = 'superseded';
    atom.supersededBy = newAtom.id;

    const savedAtom = await this.atomRepository.save(atom);

    // Emit WebSocket event
    this.atomsGateway?.emitAtomSuperseded(atom.id, newAtom.id);

    return savedAtom;
  }

  /**
   * Supersede an atom by creating a new version with updated content
   *
   * This is a convenience method that:
   * 1. Creates a new atom with the provided description
   * 2. Marks the original atom as superseded
   * 3. Links the original to the new atom
   *
   * Use this when you need to "fix" or "update" a committed atom.
   * The original atom remains immutable; this creates a new version.
   */
  async supersedeWithNewAtom(
    id: string,
    supersedeDto: SupersedeAtomDto,
  ): Promise<SupersessionResultDto> {
    const originalAtom = await this.findOne(id);

    if (originalAtom.status === 'superseded') {
      throw new BadRequestException('Atom is already superseded');
    }

    if (originalAtom.status === 'draft') {
      throw new BadRequestException(
        'Cannot supersede a draft atom. Either update it directly or commit it first.',
      );
    }

    // Ensure the original atom has an intentIdentity (pre-migration backfill)
    if (!originalAtom.intentIdentity) {
      originalAtom.intentIdentity = uuidv4();
      originalAtom.intentVersion = 1;
      await this.atomRepository.save(originalAtom);
    }

    // Create the new superseding atom with inherited intentIdentity
    const newAtom = await this.create({
      description: supersedeDto.newDescription,
      category: supersedeDto.category ?? (originalAtom.category as AtomCategory),
      qualityScore: supersedeDto.qualityScore,
      tags: supersedeDto.tags ?? [...originalAtom.tags],
      observableOutcomes: supersedeDto.observableOutcomes ?? originalAtom.observableOutcomes,
      falsifiabilityCriteria:
        supersedeDto.falsifiabilityCriteria ?? originalAtom.falsifiabilityCriteria,
      parentIntent: originalAtom.id, // Link to original as parent
      intentIdentity: originalAtom.intentIdentity,
      intentVersion: originalAtom.intentVersion + 1,
    } as any);

    // Mark the original as superseded
    originalAtom.status = 'superseded';
    originalAtom.supersededBy = newAtom.id;

    const savedOriginal = await this.atomRepository.save(originalAtom);

    // Emit WebSocket event
    this.atomsGateway?.emitAtomSuperseded(originalAtom.id, newAtom.id);

    const reasonSuffix = supersedeDto.supersessionReason
      ? `. Reason: ${supersedeDto.supersessionReason}`
      : '';

    return {
      originalAtom: savedOriginal,
      newAtom,
      message: `Atom ${originalAtom.atomId} superseded by ${newAtom.atomId}${reasonSuffix}`,
    };
  }

  /**
   * Add a tag to an atom
   */
  async addTag(id: string, tag: string): Promise<Atom> {
    const atom = await this.findOne(id);

    if (atom.status !== 'draft' && atom.status !== 'proposed') {
      throw new ForbiddenException(
        `Cannot modify tags on atom with status '${atom.status}'. Only draft or proposed atoms can be modified.`,
      );
    }

    if (!atom.tags.includes(tag)) {
      atom.tags.push(tag);
      return this.atomRepository.save(atom);
    }

    return atom;
  }

  /**
   * Remove a tag from an atom
   */
  async removeTag(id: string, tag: string): Promise<Atom> {
    const atom = await this.findOne(id);

    if (atom.status !== 'draft' && atom.status !== 'proposed') {
      throw new ForbiddenException(
        `Cannot modify tags on atom with status '${atom.status}'. Only draft or proposed atoms can be modified.`,
      );
    }

    const tagIndex = atom.tags.indexOf(tag);
    if (tagIndex > -1) {
      atom.tags.splice(tagIndex, 1);
      return this.atomRepository.save(atom);
    }

    return atom;
  }

  /**
   * Get popular tags with usage counts
   */
  async getPopularTags(limit = 20): Promise<Array<{ tag: string; count: number }>> {
    return this.atomsRepository.getPopularTags(limit);
  }

  /**
   * Find atoms by status
   */
  async findByStatus(status: AtomStatus): Promise<Atom[]> {
    return this.atomsRepository.findByStatus(status);
  }

  /**
   * Find atoms by tags
   */
  async findByTags(tags: string[]): Promise<Atom[]> {
    return this.atomsRepository.findByTags(tags);
  }

  /**
   * Find atoms by category
   */
  async findByCategory(category: AtomCategory): Promise<Atom[]> {
    return this.atomsRepository.findByCategory(category);
  }

  /**
   * Get the supersession chain for an atom
   */
  async findSupersessionChain(atomId: string): Promise<Atom[]> {
    return this.atomsRepository.findSupersessionChain(atomId);
  }

  /**
   * Get statistics about atoms
   */
  async getStatistics() {
    return this.atomsRepository.getStatistics();
  }

  /**
   * Get all versions of an intent by intentIdentity
   */
  async findByIntentIdentity(intentIdentity: string): Promise<Atom[]> {
    return this.atomRepository.find({
      where: { intentIdentity },
      order: { intentVersion: 'ASC' },
    });
  }

  /**
   * Get the version history for a specific atom's intent
   */
  async getVersionHistory(
    id: string,
  ): Promise<{ intentIdentity: string; versions: Atom[]; currentVersion: Atom }> {
    const atom = await this.findOne(id);

    if (!atom.intentIdentity) {
      // Atom predates intent identity — return just this atom
      return {
        intentIdentity: atom.id,
        versions: [atom],
        currentVersion: atom,
      };
    }

    const versions = await this.findByIntentIdentity(atom.intentIdentity);

    return {
      intentIdentity: atom.intentIdentity,
      versions,
      currentVersion: atom,
    };
  }
}
