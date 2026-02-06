import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictRecord } from './conflict-record.entity';
import { CreateConflictDto } from './dto/create-conflict.dto';
import { ResolveConflictDto } from './dto/resolve-conflict.dto';
import {
  ConflictFilters,
  ConflictMetrics,
  ConflictResolution,
  ConflictType,
} from './conflict.types';

@Injectable()
export class ConflictsService {
  constructor(
    @InjectRepository(ConflictRecord)
    private readonly conflictRepository: Repository<ConflictRecord>,
  ) {}

  async create(dto: CreateConflictDto): Promise<ConflictRecord> {
    const conflict = this.conflictRepository.create({
      conflictType: dto.conflictType,
      atomIdA: dto.atomIdA,
      atomIdB: dto.atomIdB,
      testRecordId: dto.testRecordId ?? null,
      similarityScore: dto.similarityScore ?? null,
      description: dto.description,
      status: 'open',
      resolution: null,
      resolvedAt: null,
    });

    return this.conflictRepository.save(conflict);
  }

  async findAll(filters?: ConflictFilters): Promise<ConflictRecord[]> {
    const qb = this.conflictRepository.createQueryBuilder('conflict');

    if (filters?.status) {
      qb.andWhere('conflict.status = :status', { status: filters.status });
    }

    if (filters?.type) {
      qb.andWhere('conflict.conflictType = :type', { type: filters.type });
    }

    if (filters?.atomId) {
      qb.andWhere('(conflict.atomIdA = :atomId OR conflict.atomIdB = :atomId)', {
        atomId: filters.atomId,
      });
    }

    qb.orderBy('conflict.createdAt', 'DESC');

    return qb.getMany();
  }

  async findById(id: string): Promise<ConflictRecord> {
    const conflict = await this.conflictRepository.findOne({
      where: { id },
      relations: ['atomA', 'atomB', 'testRecord'],
    });

    if (!conflict) {
      throw new NotFoundException(`Conflict with ID ${id} not found`);
    }

    return conflict;
  }

  async findByAtom(atomId: string): Promise<ConflictRecord[]> {
    return this.conflictRepository
      .createQueryBuilder('conflict')
      .where('conflict.atomIdA = :atomId OR conflict.atomIdB = :atomId', { atomId })
      .orderBy('conflict.createdAt', 'DESC')
      .getMany();
  }

  async resolve(id: string, dto: ResolveConflictDto): Promise<ConflictRecord> {
    const conflict = await this.findById(id);

    const resolution: ConflictResolution = {
      action: dto.action,
      resolvedBy: dto.resolvedBy,
      resolvedAt: new Date(),
      reason: dto.reason,
      clarificationArtifactId: dto.clarificationArtifactId,
    };

    conflict.status = 'resolved';
    conflict.resolution = resolution;
    conflict.resolvedAt = new Date();

    return this.conflictRepository.save(conflict);
  }

  async escalate(id: string): Promise<ConflictRecord> {
    const conflict = await this.findById(id);

    conflict.status = 'escalated';

    return this.conflictRepository.save(conflict);
  }

  async getMetrics(): Promise<ConflictMetrics> {
    const all = await this.conflictRepository.find();

    const byType: Record<ConflictType, number> = {
      same_test: 0,
      semantic_overlap: 0,
      contradiction: 0,
      cross_boundary: 0,
    };

    let open = 0;
    let resolved = 0;
    let escalated = 0;

    for (const conflict of all) {
      byType[conflict.conflictType]++;
      if (conflict.status === 'open') open++;
      else if (conflict.status === 'resolved') resolved++;
      else if (conflict.status === 'escalated') escalated++;
    }

    return {
      total: all.length,
      open,
      resolved,
      escalated,
      byType,
    };
  }

  /**
   * Check if a conflict already exists between two atoms.
   * Used to prevent duplicate conflict records.
   */
  async existsBetween(atomIdA: string, atomIdB: string, type: ConflictType): Promise<boolean> {
    const existing = await this.conflictRepository.findOne({
      where: [
        { atomIdA, atomIdB, conflictType: type, status: 'open' as const },
        { atomIdA: atomIdB, atomIdB: atomIdA, conflictType: type, status: 'open' as const },
      ],
    });

    return !!existing;
  }
}
