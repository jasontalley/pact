import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TemplatesRepository } from './templates.repository';
import { BUILTIN_TEMPLATES, BuiltinTemplateDefinition } from './data/builtin-templates';
import { ValidatorTemplate } from './validator-template.entity';

/**
 * Service for seeding built-in validator templates.
 * Runs on application startup to ensure all built-in templates exist.
 *
 * @atom IA-PHASE2-010 Built-in template library for common validation patterns
 */
@Injectable()
export class TemplateSeedService implements OnModuleInit {
  private readonly logger = new Logger(TemplateSeedService.name);

  constructor(private readonly templatesRepository: TemplatesRepository) {}

  /**
   * Called automatically on module initialization.
   * Seeds built-in templates if they don't exist.
   */
  async onModuleInit(): Promise<void> {
    await this.seedBuiltinTemplates();
  }

  /**
   * Seed all built-in templates into the database.
   * Skips templates that already exist (by name).
   *
   * @returns Summary of seeding operation
   */
  async seedBuiltinTemplates(): Promise<{
    created: number;
    skipped: number;
    errors: number;
    templates: string[];
  }> {
    this.logger.log('Starting built-in template seeding...');

    let created = 0;
    let skipped = 0;
    let errors = 0;
    const createdTemplates: string[] = [];

    for (const templateDef of BUILTIN_TEMPLATES) {
      try {
        const result = await this.seedTemplate(templateDef);
        if (result.created) {
          created++;
          createdTemplates.push(templateDef.name);
        } else {
          skipped++;
        }
      } catch (error) {
        errors++;
        this.logger.error(`Failed to seed template "${templateDef.name}": ${error}`);
      }
    }

    this.logger.log(
      `Template seeding complete: ${created} created, ${skipped} skipped, ${errors} errors`,
    );

    return { created, skipped, errors, templates: createdTemplates };
  }

  /**
   * Seed a single template.
   * Returns whether the template was created or already existed.
   */
  private async seedTemplate(
    templateDef: BuiltinTemplateDefinition,
  ): Promise<{ created: boolean; template: ValidatorTemplate | null }> {
    // Check if template already exists by name
    const existing = await this.templatesRepository.findByName(templateDef.name);

    if (existing) {
      this.logger.debug(`Template "${templateDef.name}" already exists, skipping`);
      return { created: false, template: existing };
    }

    // Create the template
    const template = this.templatesRepository.baseRepository.create({
      name: templateDef.name,
      description: templateDef.description,
      category: templateDef.category,
      format: templateDef.format,
      templateContent: templateDef.templateContent,
      parametersSchema: templateDef.parametersSchema,
      exampleUsage: templateDef.exampleUsage,
      tags: templateDef.tags,
      isBuiltin: true,
      usageCount: 0,
      metadata: {},
    });

    const saved = await this.templatesRepository.baseRepository.save(template);
    this.logger.log(`Created built-in template: ${templateDef.name}`);

    return { created: true, template: saved };
  }

  /**
   * Force re-seed all built-in templates.
   * Updates existing templates with latest definitions.
   *
   * Use with caution - this will overwrite any manual changes
   * to built-in templates.
   *
   * @returns Summary of update operation
   */
  async reseedBuiltinTemplates(): Promise<{
    created: number;
    updated: number;
    errors: number;
  }> {
    this.logger.log('Force re-seeding built-in templates...');

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const templateDef of BUILTIN_TEMPLATES) {
      try {
        const existing = await this.templatesRepository.findByName(templateDef.name);

        if (existing) {
          // Update existing template
          Object.assign(existing, {
            description: templateDef.description,
            category: templateDef.category,
            format: templateDef.format,
            templateContent: templateDef.templateContent,
            parametersSchema: templateDef.parametersSchema,
            exampleUsage: templateDef.exampleUsage,
            tags: templateDef.tags,
          });

          await this.templatesRepository.baseRepository.save(existing);
          updated++;
          this.logger.log(`Updated built-in template: ${templateDef.name}`);
        } else {
          // Create new template
          const template = this.templatesRepository.baseRepository.create({
            ...templateDef,
            isBuiltin: true,
            usageCount: 0,
            metadata: {},
          });

          await this.templatesRepository.baseRepository.save(template);
          created++;
          this.logger.log(`Created built-in template: ${templateDef.name}`);
        }
      } catch (error) {
        errors++;
        this.logger.error(`Failed to reseed template "${templateDef.name}": ${error}`);
      }
    }

    this.logger.log(
      `Template re-seeding complete: ${created} created, ${updated} updated, ${errors} errors`,
    );

    return { created, updated, errors };
  }

  /**
   * Get the count of expected built-in templates.
   */
  getExpectedTemplateCount(): number {
    return BUILTIN_TEMPLATES.length;
  }

  /**
   * Verify all built-in templates exist in the database.
   */
  async verifyTemplates(): Promise<{
    valid: boolean;
    missing: string[];
    extra: string[];
  }> {
    const expected = new Set(BUILTIN_TEMPLATES.map((t) => t.name));
    const actual = await this.templatesRepository.findBuiltin();
    const actualNames = new Set(actual.map((t) => t.name));

    const missing: string[] = [];
    const extra: string[] = [];

    for (const name of expected) {
      if (!actualNames.has(name)) {
        missing.push(name);
      }
    }

    for (const name of actualNames) {
      if (!expected.has(name)) {
        extra.push(name);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
      extra,
    };
  }
}
