import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Atom, AtomStatus, AtomCategory } from './atom.entity';
import { AtomSearchDto, PaginatedAtomsResponse } from './dto/atom-search.dto';

/**
 * Custom repository for Intent Atoms with specialized query methods
 */
@Injectable()
export class AtomsRepository {
  constructor(
    @InjectRepository(Atom)
    private readonly repository: Repository<Atom>,
  ) {}

  /**
   * Get the underlying TypeORM repository for basic operations
   */
  get baseRepository(): Repository<Atom> {
    return this.repository;
  }

  /**
   * Find atoms by status
   */
  async findByStatus(status: AtomStatus): Promise<Atom[]> {
    return this.repository.find({
      where: { status },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find atoms that have ANY of the specified tags
   */
  async findByTags(tags: string[]): Promise<Atom[]> {
    if (tags.length === 0) {
      return [];
    }

    return this.repository
      .createQueryBuilder('atom')
      .where('atom.tags ?| :tags', { tags })
      .orderBy('atom.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Find atoms that have ALL of the specified tags
   */
  async findByTagsAll(tags: string[]): Promise<Atom[]> {
    if (tags.length === 0) {
      return [];
    }

    return this.repository
      .createQueryBuilder('atom')
      .where('atom.tags ?& :tags', { tags })
      .orderBy('atom.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Find atoms by category
   */
  async findByCategory(category: AtomCategory): Promise<Atom[]> {
    return this.repository.find({
      where: { category },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find the supersession chain for an atom
   * Returns the atom and all atoms that supersede it, in chronological order
   */
  async findSupersessionChain(atomId: string): Promise<Atom[]> {
    const chain: Atom[] = [];

    // Find the starting atom (by UUID or atomId)
    let currentAtom = await this.repository.findOne({
      where: [{ id: atomId }, { atomId: atomId }],
    });

    if (!currentAtom) {
      return chain;
    }

    chain.push(currentAtom);

    // Follow the supersession chain
    while (currentAtom?.supersededBy) {
      const nextAtom = await this.repository.findOne({
        where: { id: currentAtom.supersededBy },
      });

      if (!nextAtom) {
        break;
      }

      chain.push(nextAtom);
      currentAtom = nextAtom;
    }

    return chain;
  }

  /**
   * Find the atom that supersedes a given atom (if any)
   */
  async findSupersedingAtom(atomId: string): Promise<Atom | null> {
    const atom = await this.repository.findOne({
      where: [{ id: atomId }, { atomId: atomId }],
    });

    if (!atom?.supersededBy) {
      return null;
    }

    return this.repository.findOne({
      where: { id: atom.supersededBy },
    });
  }

  /**
   * Search atoms with comprehensive filtering, sorting, and pagination
   */
  async search(criteria: AtomSearchDto): Promise<PaginatedAtomsResponse<Atom>> {
    const {
      search,
      status,
      scope,
      category,
      tags,
      tagsAll,
      qualityScoreMin,
      qualityScoreMax,
      createdAfter,
      createdBefore,
      committedAfter,
      committedBefore,
      createdBy,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      page = 1,
      limit = 20,
      cursor,
    } = criteria;

    const qb = this.repository.createQueryBuilder('atom');

    // Apply scope filter (Pact Main governance)
    if (scope === 'main') {
      qb.andWhere('atom.promotedToMainAt IS NOT NULL');
    } else if (scope === 'proposed') {
      qb.andWhere('atom.status = :scopeStatus', { scopeStatus: 'proposed' });
    }
    // scope === 'all' or undefined → no additional filter

    // Apply filters
    this.applyFilters(qb, {
      search,
      status,
      category,
      tags,
      tagsAll,
      qualityScoreMin,
      qualityScoreMax,
      createdAfter,
      createdBefore,
      committedAfter,
      committedBefore,
      createdBy,
      cursor,
    });

    // Get total count before pagination
    const total = await qb.getCount();

    // Apply sorting
    if (sortBy === 'qualityScore') {
      // Handle null quality scores - put them at the end
      qb.orderBy(`COALESCE(atom.${sortBy}, ${sortOrder === 'DESC' ? -1 : 101})`, sortOrder);
    } else {
      qb.orderBy(`atom.${sortBy}`, sortOrder);
    }

    // Apply pagination
    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    const items = await qb.getMany();

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;
    const nextCursor = items.length > 0 ? items[items.length - 1].id : undefined;

    return {
      items,
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPreviousPage,
      nextCursor,
    };
  }

  /**
   * Apply all filters to a query builder
   */
  private applyFilters(
    qb: SelectQueryBuilder<Atom>,
    filters: {
      search?: string;
      status?: AtomStatus;
      category?: AtomCategory;
      tags?: string[];
      tagsAll?: string[];
      qualityScoreMin?: number;
      qualityScoreMax?: number;
      createdAfter?: string;
      createdBefore?: string;
      committedAfter?: string;
      committedBefore?: string;
      createdBy?: string;
      cursor?: string;
    },
  ): void {
    // Full-text search on description
    if (filters.search) {
      qb.andWhere('atom.description ILIKE :search', {
        search: `%${filters.search}%`,
      });
    }

    // Status filter
    if (filters.status) {
      qb.andWhere('atom.status = :status', { status: filters.status });
    }

    // Category filter
    if (filters.category) {
      qb.andWhere('atom.category = :category', { category: filters.category });
    }

    // Tags filter (any match)
    if (filters.tags && filters.tags.length > 0) {
      qb.andWhere('atom.tags ?| :tags', { tags: filters.tags });
    }

    // Tags filter (all match)
    if (filters.tagsAll && filters.tagsAll.length > 0) {
      qb.andWhere('atom.tags ?& :tagsAll', { tagsAll: filters.tagsAll });
    }

    // Quality score range
    if (filters.qualityScoreMin !== undefined) {
      qb.andWhere('atom.qualityScore >= :qualityScoreMin', {
        qualityScoreMin: filters.qualityScoreMin,
      });
    }

    if (filters.qualityScoreMax !== undefined) {
      qb.andWhere('atom.qualityScore <= :qualityScoreMax', {
        qualityScoreMax: filters.qualityScoreMax,
      });
    }

    // Date range filters
    if (filters.createdAfter) {
      qb.andWhere('atom.createdAt >= :createdAfter', {
        createdAfter: new Date(filters.createdAfter),
      });
    }

    if (filters.createdBefore) {
      qb.andWhere('atom.createdAt <= :createdBefore', {
        createdBefore: new Date(filters.createdBefore),
      });
    }

    if (filters.committedAfter) {
      qb.andWhere('atom.committedAt >= :committedAfter', {
        committedAfter: new Date(filters.committedAfter),
      });
    }

    if (filters.committedBefore) {
      qb.andWhere('atom.committedAt <= :committedBefore', {
        committedBefore: new Date(filters.committedBefore),
      });
    }

    // Created by filter
    if (filters.createdBy) {
      qb.andWhere('atom.createdBy = :createdBy', { createdBy: filters.createdBy });
    }

    // Cursor-based pagination
    if (filters.cursor) {
      qb.andWhere('atom.id > :cursor', { cursor: filters.cursor });
    }
  }

  /**
   * Get popular tags with their usage counts
   */
  async getPopularTags(limit = 20): Promise<Array<{ tag: string; count: number }>> {
    // Use a raw query to unnest the tags array and count occurrences
    const result = await this.repository.query(
      `
      SELECT tag, COUNT(*) as count
      FROM atoms, jsonb_array_elements_text(tags) as tag
      GROUP BY tag
      ORDER BY count DESC
      LIMIT $1
    `,
      [limit],
    );

    return result.map((row: { tag: string; count: string }) => ({
      tag: row.tag,
      count: parseInt(row.count, 10),
    }));
  }

  /**
   * Get atoms summary statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byStatus: Record<AtomStatus, number>;
    byCategory: Record<AtomCategory, number>;
    averageQualityScore: number | null;
  }> {
    const total = await this.repository.count();

    // Count by status
    const statusCounts = await this.repository
      .createQueryBuilder('atom')
      .select('atom.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('atom.status')
      .getRawMany();

    const byStatus: Record<AtomStatus, number> = {
      proposed: 0,
      draft: 0,
      committed: 0,
      superseded: 0,
      abandoned: 0,
    };
    for (const row of statusCounts) {
      byStatus[row.status as AtomStatus] = parseInt(row.count, 10);
    }

    // Count by category
    const categoryCounts = await this.repository
      .createQueryBuilder('atom')
      .select('atom.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('atom.category')
      .getRawMany();

    const byCategory: Record<AtomCategory, number> = {
      functional: 0,
      performance: 0,
      security: 0,
      reliability: 0,
      usability: 0,
      maintainability: 0,
    };
    for (const row of categoryCounts) {
      byCategory[row.category as AtomCategory] = parseInt(row.count, 10);
    }

    // Average quality score
    const avgResult = await this.repository
      .createQueryBuilder('atom')
      .select('AVG(atom.qualityScore)', 'avg')
      .where('atom.qualityScore IS NOT NULL')
      .getRawOne();

    const averageQualityScore = avgResult?.avg ? parseFloat(avgResult.avg) : null;

    return {
      total,
      byStatus,
      byCategory,
      averageQualityScore,
    };
  }
}
