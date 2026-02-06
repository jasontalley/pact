import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { TemplatesRepository, PaginatedTemplatesResponse } from './templates.repository';
import { ValidatorTemplate, TemplateCategory } from './validator-template.entity';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplateSearchDto } from './dto/template-search.dto';
import { InstantiateTemplateDto } from './dto/instantiate-template.dto';
import { ValidatorsService } from './validators.service';
import { Validator } from './validator.entity';

/**
 * Service for managing validator templates
 * Handles CRUD operations and template instantiation
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly templatesRepository: TemplatesRepository,
    private readonly validatorsService: ValidatorsService,
  ) {}

  /**
   * Create a new template
   */
  async create(dto: CreateTemplateDto): Promise<ValidatorTemplate> {
    // Validate that template content contains at least one placeholder
    if (!dto.templateContent.includes('{{')) {
      throw new BadRequestException(
        'Template content must contain at least one placeholder (e.g., {{paramName}})',
      );
    }

    // Validate that all required parameters in schema have corresponding placeholders
    const placeholders = this.extractPlaceholders(dto.templateContent);
    const requiredParams = dto.parametersSchema.required || [];

    for (const param of requiredParams) {
      if (!placeholders.includes(param)) {
        throw new BadRequestException(
          `Required parameter "${param}" is not used in the template content`,
        );
      }
    }

    const template = this.templatesRepository.baseRepository.create({
      ...dto,
      tags: dto.tags || [],
      isBuiltin: dto.isBuiltin || false,
      usageCount: 0,
      metadata: {},
    });

    return this.templatesRepository.baseRepository.save(template);
  }

  /**
   * Find all templates with optional filtering and pagination
   */
  async findAll(
    options?: TemplateSearchDto,
  ): Promise<PaginatedTemplatesResponse<ValidatorTemplate>> {
    return this.templatesRepository.search(options || {});
  }

  /**
   * Find templates by category
   */
  async findByCategory(category: TemplateCategory): Promise<ValidatorTemplate[]> {
    return this.templatesRepository.findByCategory(category);
  }

  /**
   * Find a single template by ID
   */
  async findOne(id: string): Promise<ValidatorTemplate> {
    const template = await this.templatesRepository.baseRepository.findOne({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    return template;
  }

  /**
   * Update a template (only user-created templates can be updated)
   */
  async update(id: string, dto: UpdateTemplateDto): Promise<ValidatorTemplate> {
    const template = await this.findOne(id);

    if (template.isBuiltin) {
      throw new ForbiddenException('Built-in templates cannot be modified');
    }

    // If template content is being updated, validate placeholders
    if (dto.templateContent) {
      if (!dto.templateContent.includes('{{')) {
        throw new BadRequestException(
          'Template content must contain at least one placeholder (e.g., {{paramName}})',
        );
      }

      const placeholders = this.extractPlaceholders(dto.templateContent);
      const schema = dto.parametersSchema || template.parametersSchema;
      const requiredParams = schema.required || [];

      for (const param of requiredParams) {
        if (!placeholders.includes(param)) {
          throw new BadRequestException(
            `Required parameter "${param}" is not used in the template content`,
          );
        }
      }
    }

    Object.assign(template, dto);
    return this.templatesRepository.baseRepository.save(template);
  }

  /**
   * Delete a template (only user-created templates can be deleted)
   */
  async remove(id: string): Promise<void> {
    const template = await this.findOne(id);

    if (template.isBuiltin) {
      throw new ForbiddenException('Built-in templates cannot be deleted');
    }

    await this.templatesRepository.baseRepository.remove(template);
  }

  /**
   * Instantiate a validator from a template
   */
  async instantiate(dto: InstantiateTemplateDto): Promise<Validator> {
    const template = await this.findOne(dto.templateId);

    // Validate parameters against schema
    this.validateParameters(template, dto.parameters);

    // Substitute placeholders with actual values
    const content = this.substituteParameters(template.templateContent, dto.parameters);

    // Generate default name if not provided
    const name = dto.name || this.generateValidatorName(template, dto.parameters);

    // Create the validator
    const validator = await this.validatorsService.create({
      atomId: dto.atomId,
      name,
      description: dto.description || template.description,
      validatorType: template.format === 'typescript' ? 'executable' : 'gherkin',
      content,
      format: template.format,
      templateId: template.id,
      parameters: dto.parameters,
    });

    // Increment template usage count
    await this.templatesRepository.incrementUsageCount(template.id);

    return validator;
  }

  /**
   * Get all available categories
   */
  async getCategories(): Promise<Array<{ category: TemplateCategory; count: number }>> {
    return this.templatesRepository.getCategories();
  }

  /**
   * Get popular tags
   */
  async getPopularTags(limit = 20): Promise<Array<{ tag: string; count: number }>> {
    return this.templatesRepository.getPopularTags(limit);
  }

  /**
   * Get validators created from a template
   */
  async getTemplateUsage(templateId: string): Promise<{
    templateId: string;
    usageCount: number;
    validators: Validator[];
  }> {
    const template = await this.findOne(templateId);

    // Get validators using the validatorsRepository through the service
    const result = await this.validatorsService.findAll({ templateId });

    return {
      templateId: template.id,
      usageCount: template.usageCount,
      validators: result.items,
    };
  }

  /**
   * Get template statistics
   */
  async getStatistics() {
    return this.templatesRepository.getStatistics();
  }

  /**
   * Extract placeholder names from template content
   */
  private extractPlaceholders(content: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const placeholders: string[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (!placeholders.includes(match[1])) {
        placeholders.push(match[1]);
      }
    }

    return placeholders;
  }

  /**
   * Validate parameters against template schema
   */
  private validateParameters(
    template: ValidatorTemplate,
    parameters: Record<string, unknown>,
  ): void {
    const schema = template.parametersSchema;

    // Check required parameters
    const requiredParams = schema.required || [];
    for (const param of requiredParams) {
      if (!(param in parameters)) {
        throw new BadRequestException(`Missing required parameter: ${param}`);
      }
    }

    // Validate parameter types
    for (const [name, value] of Object.entries(parameters)) {
      const paramSchema = schema.properties[name];

      if (!paramSchema) {
        throw new BadRequestException(`Unknown parameter: ${name}`);
      }

      // Basic type validation
      const expectedType = paramSchema.type;
      const actualType = Array.isArray(value) ? 'array' : typeof value;

      if (expectedType !== actualType) {
        throw new BadRequestException(
          `Parameter "${name}" should be of type ${expectedType}, got ${actualType}`,
        );
      }

      // Enum validation
      if (paramSchema.enum && !paramSchema.enum.includes(value)) {
        throw new BadRequestException(
          `Parameter "${name}" must be one of: ${paramSchema.enum.join(', ')}`,
        );
      }
    }
  }

  /**
   * Substitute placeholders in template content with parameter values
   */
  private substituteParameters(
    templateContent: string,
    parameters: Record<string, unknown>,
  ): string {
    let content = templateContent;

    for (const [name, value] of Object.entries(parameters)) {
      const placeholder = `{{${name}}}`;
      const replacement = Array.isArray(value) ? value.join(', ') : String(value);
      content = content.split(placeholder).join(replacement);
    }

    return content;
  }

  /**
   * Generate a default validator name from template and parameters
   */
  private generateValidatorName(
    template: ValidatorTemplate,
    parameters: Record<string, unknown>,
  ): string {
    // Use first parameter value to create a more specific name
    const firstParam = Object.values(parameters)[0];
    const paramPart = firstParam ? ` - ${String(firstParam)}` : '';

    return `${template.name}${paramPart}`;
  }
}
