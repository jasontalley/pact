import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, IsNull, Not } from 'typeorm';
import { Molecule, LensType } from './molecule.entity';
import { MoleculeAtom } from './molecule-atom.entity';
import { MoleculeSearchDto } from './dto/molecule-search.dto';

/**
 * Paginated response for molecules
 */
export interface PaginatedMoleculesResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  nextCursor?: string;
}

/**
 * Custom repository for Molecules with specialized query methods
 */
@Injectable()
export class MoleculesRepository {
  constructor(
    @InjectRepository(Molecule)
    private readonly moleculeRepository: Repository<Molecule>,
    @InjectRepository(MoleculeAtom)
    private readonly moleculeAtomRepository: Repository<MoleculeAtom>,
  ) {}

  /**
   * Get the underlying TypeORM repository for basic operations
   */
  get baseRepository(): Repository<Molecule> {
    return this.moleculeRepository;
  }

  /**
   * Get the junction table repository
   */
  get atomJunctionRepository(): Repository<MoleculeAtom> {
    return this.moleculeAtomRepository;
  }

  /**
   * Find molecules by lens type
   */
  async findByLensType(lensType: LensType): Promise<Molecule[]> {
    return this.moleculeRepository.find({
      where: { lensType },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find molecules by owner
   */
  async findByOwner(ownerId: string): Promise<Molecule[]> {
    return this.moleculeRepository.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find root-level molecules (no parent)
   */
  async findRootMolecules(): Promise<Molecule[]> {
    return this.moleculeRepository.find({
      where: { parentMoleculeId: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find molecules by tags (must contain all specified tags)
   */
  async findByTags(tags: string[]): Promise<Molecule[]> {
    const qb = this.moleculeRepository.createQueryBuilder('molecule');

    for (let i = 0; i < tags.length; i++) {
      qb.andWhere(`molecule.tags @> :tag${i}::jsonb`, {
        [`tag${i}`]: JSON.stringify([tags[i]]),
      });
    }

    return qb.orderBy('molecule.createdAt', 'DESC').getMany();
  }

  /**
   * Search molecules with comprehensive filtering, sorting, and pagination
   */
  async search(criteria: MoleculeSearchDto): Promise<PaginatedMoleculesResponse<Molecule>> {
    const {
      lensType,
      ownerId,
      parentMoleculeId,
      hasAtoms,
      tags,
      search,
      limit = 20,
      offset = 0,
      cursor,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = criteria;

    const qb = this.moleculeRepository.createQueryBuilder('molecule');

    // Apply filters
    this.applyFilters(qb, {
      lensType,
      ownerId,
      parentMoleculeId,
      hasAtoms,
      tags,
      search,
    });

    // Get total count before pagination
    const total = await qb.getCount();

    // Apply sorting
    qb.orderBy(`molecule.${sortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    // Apply cursor-based pagination if cursor provided
    if (cursor) {
      const cursorMolecule = await this.moleculeRepository.findOne({
        where: { id: cursor },
      });
      if (cursorMolecule) {
        if (sortOrder === 'desc') {
          qb.andWhere(`molecule.${sortBy} < :cursorValue`, {
            cursorValue: cursorMolecule[sortBy as keyof Molecule],
          });
        } else {
          qb.andWhere(`molecule.${sortBy} > :cursorValue`, {
            cursorValue: cursorMolecule[sortBy as keyof Molecule],
          });
        }
      }
    }

    // Apply offset-based pagination
    qb.skip(offset).take(limit + 1); // +1 to check if there's a next page

    const items = await qb.getMany();

    // Determine next cursor
    let nextCursor: string | undefined;
    if (items.length > limit) {
      const lastItem = items.pop(); // Remove the extra item
      nextCursor = lastItem?.id;
    }

    return {
      items,
      total,
      limit,
      offset,
      nextCursor,
    };
  }

  /**
   * Apply all filters to a query builder
   */
  private applyFilters(
    qb: SelectQueryBuilder<Molecule>,
    filters: {
      lensType?: LensType[];
      ownerId?: string;
      parentMoleculeId?: string | null;
      hasAtoms?: boolean;
      tags?: string[];
      search?: string;
    },
  ): void {
    // Lens type filter
    if (filters.lensType && filters.lensType.length > 0) {
      qb.andWhere('molecule.lensType IN (:...lensTypes)', { lensTypes: filters.lensType });
    }

    // Owner ID filter
    if (filters.ownerId) {
      qb.andWhere('molecule.ownerId = :ownerId', { ownerId: filters.ownerId });
    }

    // Parent molecule filter (null for root level)
    if (filters.parentMoleculeId === null) {
      qb.andWhere('molecule.parentMoleculeId IS NULL');
    } else if (filters.parentMoleculeId) {
      qb.andWhere('molecule.parentMoleculeId = :parentMoleculeId', {
        parentMoleculeId: filters.parentMoleculeId,
      });
    }

    // Has atoms filter
    if (filters.hasAtoms !== undefined) {
      const subQuery = qb
        .subQuery()
        .select('1')
        .from(MoleculeAtom, 'ma')
        .where('ma.moleculeId = molecule.id')
        .andWhere('ma.removedAt IS NULL')
        .getQuery();

      if (filters.hasAtoms) {
        qb.andWhere(`EXISTS ${subQuery}`);
      } else {
        qb.andWhere(`NOT EXISTS ${subQuery}`);
      }
    }

    // Tags filter (must contain all tags)
    if (filters.tags && filters.tags.length > 0) {
      for (let i = 0; i < filters.tags.length; i++) {
        qb.andWhere(`molecule.tags @> :tag${i}::jsonb`, {
          [`tag${i}`]: JSON.stringify([filters.tags[i]]),
        });
      }
    }

    // Full-text search on name and description
    if (filters.search) {
      qb.andWhere('(molecule.name ILIKE :search OR molecule.description ILIKE :search)', {
        search: `%${filters.search}%`,
      });
    }
  }

  /**
   * Get atom counts for multiple molecules
   */
  async getAtomCounts(moleculeIds: string[]): Promise<Map<string, number>> {
    if (moleculeIds.length === 0) {
      return new Map();
    }

    const results = await this.moleculeAtomRepository
      .createQueryBuilder('ma')
      .select('ma.moleculeId', 'moleculeId')
      .addSelect('COUNT(*)', 'count')
      .where('ma.moleculeId IN (:...moleculeIds)', { moleculeIds })
      .andWhere('ma.removedAt IS NULL')
      .groupBy('ma.moleculeId')
      .getRawMany();

    const countMap = new Map<string, number>();
    for (const row of results) {
      countMap.set(row.moleculeId, parseInt(row.count, 10));
    }

    // Fill in zeros for molecules with no atoms
    for (const id of moleculeIds) {
      if (!countMap.has(id)) {
        countMap.set(id, 0);
      }
    }

    return countMap;
  }

  /**
   * Find all molecules containing a specific atom
   */
  async findMoleculesContainingAtom(atomId: string): Promise<Molecule[]> {
    return this.moleculeRepository
      .createQueryBuilder('molecule')
      .innerJoin('molecule_atoms', 'ma', 'ma.moleculeId = molecule.id')
      .where('ma.atomId = :atomId', { atomId })
      .andWhere('ma.removedAt IS NULL')
      .orderBy('molecule.name', 'ASC')
      .getMany();
  }

  /**
   * Get IDs of orphan atoms (not in any molecule)
   */
  async getOrphanAtomIds(): Promise<string[]> {
    const result = await this.moleculeRepository.manager.query(`
      SELECT a.id
      FROM atoms a
      LEFT JOIN molecule_atoms ma ON a.id = ma."atomId" AND ma."removedAt" IS NULL
      WHERE ma."atomId" IS NULL
    `);
    return result.map((row: { id: string }) => row.id);
  }

  /**
   * Get ancestor chain for a molecule (from immediate parent to root)
   * Uses a recursive CTE for efficient traversal
   */
  async getAncestorChain(moleculeId: string): Promise<Molecule[]> {
    const result = await this.moleculeRepository.manager.query(
      `
      WITH RECURSIVE ancestors AS (
        -- Base case: start with the molecule's parent
        SELECT m.*
        FROM molecules m
        WHERE m.id = (SELECT "parentMoleculeId" FROM molecules WHERE id = $1)

        UNION ALL

        -- Recursive case: get each ancestor's parent
        SELECT m.*
        FROM molecules m
        INNER JOIN ancestors a ON m.id = a."parentMoleculeId"
      )
      SELECT * FROM ancestors
    `,
      [moleculeId],
    );

    return result.map((row: Record<string, unknown>) =>
      this.moleculeRepository.create(row as Partial<Molecule>),
    );
  }

  /**
   * Get all descendant IDs for a molecule (children, grandchildren, etc.)
   * Uses a recursive CTE for efficient traversal
   */
  async getDescendantIds(moleculeId: string): Promise<string[]> {
    const result = await this.moleculeRepository.manager.query(
      `
      WITH RECURSIVE descendants AS (
        -- Base case: direct children
        SELECT id
        FROM molecules
        WHERE "parentMoleculeId" = $1

        UNION ALL

        -- Recursive case: children of children
        SELECT m.id
        FROM molecules m
        INNER JOIN descendants d ON m."parentMoleculeId" = d.id
      )
      SELECT id FROM descendants
    `,
      [moleculeId],
    );

    return result.map((row: { id: string }) => row.id);
  }

  /**
   * Get molecule count by lens type
   */
  async getCountByLensType(): Promise<Record<LensType, number>> {
    const results = await this.moleculeRepository
      .createQueryBuilder('molecule')
      .select('molecule.lensType', 'lensType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('molecule.lensType')
      .getRawMany();

    const countMap: Record<LensType, number> = {
      user_story: 0,
      feature: 0,
      journey: 0,
      epic: 0,
      release: 0,
      capability: 0,
      custom: 0,
    };

    for (const row of results) {
      countMap[row.lensType as LensType] = parseInt(row.count, 10);
    }

    return countMap;
  }

  /**
   * Get statistics about molecules
   */
  async getStatistics(): Promise<{
    totalMolecules: number;
    byLensType: Record<LensType, number>;
    averageAtomsPerMolecule: number;
    rootMoleculeCount: number;
  }> {
    const totalMolecules = await this.moleculeRepository.count();
    const byLensType = await this.getCountByLensType();
    const rootMoleculeCount = await this.moleculeRepository.count({
      where: { parentMoleculeId: IsNull() },
    });

    // Calculate average atoms per molecule
    const avgResult = await this.moleculeRepository.manager.query(`
      SELECT AVG(atom_count)::float as average
      FROM (
        SELECT m.id, COUNT(ma."atomId") as atom_count
        FROM molecules m
        LEFT JOIN molecule_atoms ma ON m.id = ma."moleculeId" AND ma."removedAt" IS NULL
        GROUP BY m.id
      ) subq
    `);

    const averageAtomsPerMolecule = avgResult[0]?.average || 0;

    return {
      totalMolecules,
      byLensType,
      averageAtomsPerMolecule,
      rootMoleculeCount,
    };
  }

  /**
   * Generate the next molecule ID following M-XXX pattern
   */
  async generateMoleculeId(): Promise<string> {
    // Find the highest existing molecule number
    const result = await this.moleculeRepository
      .createQueryBuilder('molecule')
      .select('molecule.moleculeId')
      .where("molecule.moleculeId LIKE 'M-%'")
      .orderBy('CAST(SUBSTRING(molecule.moleculeId FROM 3) AS INTEGER)', 'DESC')
      .limit(1)
      .getOne();

    let nextNumber = 1;
    if (result) {
      const match = result.moleculeId.match(/M-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `M-${nextNumber.toString().padStart(3, '0')}`;
  }
}
