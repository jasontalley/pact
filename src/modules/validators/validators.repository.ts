import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Validator, ValidatorType, ValidatorFormat } from './validator.entity';
import { ValidatorSearchDto } from './dto/validator-search.dto';

/**
 * Paginated response for validators
 */
export interface PaginatedValidatorsResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Custom repository for Validators with specialized query methods
 */
@Injectable()
export class ValidatorsRepository {
  constructor(
    @InjectRepository(Validator)
    private readonly repository: Repository<Validator>,
  ) {}

  /**
   * Get the underlying TypeORM repository for basic operations
   */
  get baseRepository(): Repository<Validator> {
    return this.repository;
  }

  /**
   * Find validators by atom ID
   */
  async findByAtom(atomId: string): Promise<Validator[]> {
    return this.repository.find({
      where: { atomId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find active validators by atom ID
   */
  async findActiveByAtom(atomId: string): Promise<Validator[]> {
    return this.repository.find({
      where: { atomId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find validators by template ID
   */
  async findByTemplate(templateId: string): Promise<Validator[]> {
    return this.repository.find({
      where: { templateId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find validators by type
   */
  async findByType(validatorType: ValidatorType): Promise<Validator[]> {
    return this.repository.find({
      where: { validatorType },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find validators by format
   */
  async findByFormat(format: ValidatorFormat): Promise<Validator[]> {
    return this.repository.find({
      where: { format },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Search validators with comprehensive filtering, sorting, and pagination
   */
  async search(criteria: ValidatorSearchDto): Promise<PaginatedValidatorsResponse<Validator>> {
    const {
      atomId,
      validatorType,
      format,
      isActive,
      templateId,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = criteria;

    const qb = this.repository.createQueryBuilder('validator');

    // Apply filters
    this.applyFilters(qb, {
      atomId,
      validatorType,
      format,
      isActive,
      templateId,
      search,
    });

    // Get total count before pagination
    const total = await qb.getCount();

    // Apply sorting
    qb.orderBy(`validator.${sortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    // Apply pagination
    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    const items = await qb.getMany();

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return {
      items,
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPreviousPage,
    };
  }

  /**
   * Apply all filters to a query builder
   */
  private applyFilters(
    qb: SelectQueryBuilder<Validator>,
    filters: {
      atomId?: string;
      validatorType?: ValidatorType;
      format?: ValidatorFormat;
      isActive?: boolean;
      templateId?: string;
      search?: string;
    },
  ): void {
    // Atom ID filter
    if (filters.atomId) {
      qb.andWhere('validator.atomId = :atomId', { atomId: filters.atomId });
    }

    // Validator type filter
    if (filters.validatorType) {
      qb.andWhere('validator.validatorType = :validatorType', {
        validatorType: filters.validatorType,
      });
    }

    // Format filter
    if (filters.format) {
      qb.andWhere('validator.format = :format', { format: filters.format });
    }

    // Active status filter
    if (filters.isActive !== undefined) {
      qb.andWhere('validator.isActive = :isActive', { isActive: filters.isActive });
    }

    // Template ID filter
    if (filters.templateId) {
      qb.andWhere('validator.templateId = :templateId', { templateId: filters.templateId });
    }

    // Full-text search on name, description, and content
    if (filters.search) {
      qb.andWhere(
        '(validator.name ILIKE :search OR validator.description ILIKE :search OR validator.content ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }
  }

  /**
   * Get validator count by atom
   */
  async getCountByAtom(atomId: string): Promise<number> {
    return this.repository.count({
      where: { atomId },
    });
  }

  /**
   * Get active validator count by atom
   */
  async getActiveCountByAtom(atomId: string): Promise<number> {
    return this.repository.count({
      where: { atomId, isActive: true },
    });
  }

  /**
   * Get validators summary statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byType: Record<ValidatorType, number>;
    byFormat: Record<ValidatorFormat, number>;
    activeCount: number;
    inactiveCount: number;
  }> {
    const total = await this.repository.count();
    const activeCount = await this.repository.count({ where: { isActive: true } });
    const inactiveCount = total - activeCount;

    // Count by type
    const typeCounts = await this.repository
      .createQueryBuilder('validator')
      .select('validator.validatorType', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('validator.validatorType')
      .getRawMany();

    const byType: Record<ValidatorType, number> = {
      gherkin: 0,
      executable: 0,
      declarative: 0,
    };
    for (const row of typeCounts) {
      byType[row.type as ValidatorType] = parseInt(row.count, 10);
    }

    // Count by format
    const formatCounts = await this.repository
      .createQueryBuilder('validator')
      .select('validator.format', 'format')
      .addSelect('COUNT(*)', 'count')
      .groupBy('validator.format')
      .getRawMany();

    const byFormat: Record<ValidatorFormat, number> = {
      gherkin: 0,
      natural_language: 0,
      typescript: 0,
      json: 0,
    };
    for (const row of formatCounts) {
      byFormat[row.format as ValidatorFormat] = parseInt(row.count, 10);
    }

    return {
      total,
      byType,
      byFormat,
      activeCount,
      inactiveCount,
    };
  }

  /**
   * Increment execution count for a validator
   */
  async incrementExecutionCount(id: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(Validator)
      .set({
        executionCount: () => 'executionCount + 1',
        lastExecutedAt: new Date(),
      })
      .where('id = :id', { id })
      .execute();
  }
}
