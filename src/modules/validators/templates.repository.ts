import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ValidatorTemplate, TemplateCategory } from './validator-template.entity';
import { ValidatorFormat } from './validator.entity';
import { TemplateSearchDto } from './dto/template-search.dto';

/**
 * Paginated response for templates
 */
export interface PaginatedTemplatesResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Custom repository for ValidatorTemplates with specialized query methods
 */
@Injectable()
export class TemplatesRepository {
  constructor(
    @InjectRepository(ValidatorTemplate)
    private readonly repository: Repository<ValidatorTemplate>,
  ) {}

  /**
   * Get the underlying TypeORM repository for basic operations
   */
  get baseRepository(): Repository<ValidatorTemplate> {
    return this.repository;
  }

  /**
   * Find templates by category
   */
  async findByCategory(category: TemplateCategory): Promise<ValidatorTemplate[]> {
    return this.repository.find({
      where: { category },
      order: { usageCount: 'DESC', name: 'ASC' },
    });
  }

  /**
   * Find templates by format
   */
  async findByFormat(format: ValidatorFormat): Promise<ValidatorTemplate[]> {
    return this.repository.find({
      where: { format },
      order: { usageCount: 'DESC', name: 'ASC' },
    });
  }

  /**
   * Find built-in templates only
   */
  async findBuiltin(): Promise<ValidatorTemplate[]> {
    return this.repository.find({
      where: { isBuiltin: true },
      order: { category: 'ASC', name: 'ASC' },
    });
  }

  /**
   * Find user-created templates only
   */
  async findUserCreated(): Promise<ValidatorTemplate[]> {
    return this.repository.find({
      where: { isBuiltin: false },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find a template by name (case-insensitive)
   */
  async findByName(name: string): Promise<ValidatorTemplate | null> {
    return this.repository
      .createQueryBuilder('template')
      .where('LOWER(template.name) = LOWER(:name)', { name })
      .getOne();
  }

  /**
   * Search templates with comprehensive filtering, sorting, and pagination
   */
  async search(
    criteria: TemplateSearchDto,
  ): Promise<PaginatedTemplatesResponse<ValidatorTemplate>> {
    const {
      category,
      format,
      isBuiltin,
      search,
      tag,
      page = 1,
      limit = 20,
      sortBy = 'usageCount',
      sortOrder = 'desc',
    } = criteria;

    const qb = this.repository.createQueryBuilder('template');

    // Apply filters
    this.applyFilters(qb, {
      category,
      format,
      isBuiltin,
      search,
      tag,
    });

    // Get total count before pagination
    const total = await qb.getCount();

    // Apply sorting
    qb.orderBy(`template.${sortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC');

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
    qb: SelectQueryBuilder<ValidatorTemplate>,
    filters: {
      category?: TemplateCategory;
      format?: ValidatorFormat;
      isBuiltin?: boolean;
      search?: string;
      tag?: string;
    },
  ): void {
    // Category filter
    if (filters.category) {
      qb.andWhere('template.category = :category', { category: filters.category });
    }

    // Format filter
    if (filters.format) {
      qb.andWhere('template.format = :format', { format: filters.format });
    }

    // Built-in status filter
    if (filters.isBuiltin !== undefined) {
      qb.andWhere('template.isBuiltin = :isBuiltin', { isBuiltin: filters.isBuiltin });
    }

    // Tag filter
    if (filters.tag) {
      qb.andWhere('template.tags @> :tag', { tag: JSON.stringify([filters.tag]) });
    }

    // Full-text search on name, description, and tags
    if (filters.search) {
      qb.andWhere(
        '(template.name ILIKE :search OR template.description ILIKE :search OR template.tags::text ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }
  }

  /**
   * Get all unique categories with their template counts
   */
  async getCategories(): Promise<Array<{ category: TemplateCategory; count: number }>> {
    const result = await this.repository
      .createQueryBuilder('template')
      .select('template.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('template.category')
      .orderBy('count', 'DESC')
      .getRawMany();

    return result.map((row: { category: string; count: string }) => ({
      category: row.category as TemplateCategory,
      count: parseInt(row.count, 10),
    }));
  }

  /**
   * Get popular tags with their usage counts
   */
  async getPopularTags(limit = 20): Promise<Array<{ tag: string; count: number }>> {
    const result = await this.repository.query(
      `
      SELECT tag, COUNT(*) as count
      FROM validator_templates, jsonb_array_elements_text(tags) as tag
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
   * Increment usage count for a template
   */
  async incrementUsageCount(id: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(ValidatorTemplate)
      .set({
        usageCount: () => 'usageCount + 1',
      })
      .where('id = :id', { id })
      .execute();
  }

  /**
   * Get templates summary statistics
   */
  async getStatistics(): Promise<{
    total: number;
    builtinCount: number;
    userCreatedCount: number;
    byCategory: Record<TemplateCategory, number>;
  }> {
    const total = await this.repository.count();
    const builtinCount = await this.repository.count({ where: { isBuiltin: true } });
    const userCreatedCount = total - builtinCount;

    // Count by category
    const categoryCounts = await this.repository
      .createQueryBuilder('template')
      .select('template.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('template.category')
      .getRawMany();

    const byCategory: Record<TemplateCategory, number> = {
      authentication: 0,
      authorization: 0,
      'data-integrity': 0,
      performance: 0,
      'state-transition': 0,
      'error-handling': 0,
      custom: 0,
    };
    for (const row of categoryCounts) {
      byCategory[row.category as TemplateCategory] = parseInt(row.count, 10);
    }

    return {
      total,
      builtinCount,
      userCreatedCount,
      byCategory,
    };
  }
}
