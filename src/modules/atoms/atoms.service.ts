import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Atom, AtomStatus, AtomCategory } from './atom.entity';
import { AtomsRepository } from './atoms.repository';
import { CreateAtomDto } from './dto/create-atom.dto';
import { UpdateAtomDto } from './dto/update-atom.dto';
import { AtomSearchDto, PaginatedAtomsResponse } from './dto/atom-search.dto';
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

    const nextId = latestAtom
      ? Number.parseInt(latestAtom.atomId.split('-')[1], 10) + 1
      : 1;
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
   * Update a draft atom
   * Throws ForbiddenException if atom is not in draft status (INV-004)
   */
  async update(id: string, updateAtomDto: UpdateAtomDto): Promise<Atom> {
    const atom = await this.findOne(id);

    if (atom.status !== 'draft') {
      throw new ForbiddenException(
        `Cannot update atom with status '${atom.status}'. Only draft atoms can be updated.`,
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
   * Delete a draft atom
   * Throws ForbiddenException if atom is not in draft status (INV-004)
   */
  async remove(id: string): Promise<void> {
    const atom = await this.findOne(id);
    const atomId = atom.id;

    if (atom.status !== 'draft') {
      throw new ForbiddenException(
        `Cannot delete atom with status '${atom.status}'. Only draft atoms can be deleted.`,
      );
    }

    await this.atomRepository.remove(atom);

    // Emit WebSocket event
    this.atomsGateway?.emitAtomDeleted(atomId);
  }

  /**
   * Commit an atom (make it immutable)
   * Enforces quality gate: atom must have quality score >= 80
   */
  async commit(id: string): Promise<Atom> {
    const atom = await this.findOne(id);

    if (atom.status === 'committed') {
      throw new BadRequestException('Atom is already committed');
    }

    if (atom.status === 'superseded') {
      throw new BadRequestException('Cannot commit a superseded atom');
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

    const savedAtom = await this.atomRepository.save(atom);

    // Emit WebSocket event
    this.atomsGateway?.emitAtomCommitted(savedAtom);

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
   * Add a tag to an atom
   */
  async addTag(id: string, tag: string): Promise<Atom> {
    const atom = await this.findOne(id);

    if (atom.status !== 'draft') {
      throw new ForbiddenException(
        `Cannot modify tags on atom with status '${atom.status}'. Only draft atoms can be modified.`,
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

    if (atom.status !== 'draft') {
      throw new ForbiddenException(
        `Cannot modify tags on atom with status '${atom.status}'. Only draft atoms can be modified.`,
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
}
