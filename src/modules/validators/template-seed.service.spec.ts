import { Test, TestingModule } from '@nestjs/testing';
import { TemplateSeedService } from './template-seed.service';
import { TemplatesRepository } from './templates.repository';
import {
  BUILTIN_TEMPLATES,
  getTemplatesByCategory,
  getTemplateCounts,
  findTemplateByName,
} from './data/builtin-templates';
import { ValidatorTemplate } from './validator-template.entity';

/**
 * Tests for built-in template seeding functionality
 *
 * @atom IA-PHASE2-010 Built-in template library for common validation patterns
 */
describe('TemplateSeedService', () => {
  let service: TemplateSeedService;

  const mockBaseRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockTemplatesRepository = {
    baseRepository: mockBaseRepository,
    findByName: jest.fn(),
    findBuiltin: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateSeedService,
        {
          provide: TemplatesRepository,
          useValue: mockTemplatesRepository,
        },
      ],
    }).compile();

    service = module.get<TemplateSeedService>(TemplateSeedService);
  });

  describe('Built-in Templates Data', () => {
    /**
     * @atom IA-PHASE2-010
     * Must provide 20+ built-in templates
     */
    it('should have at least 20 built-in templates', () => {
      expect(BUILTIN_TEMPLATES.length).toBeGreaterThanOrEqual(20);
    });

    /**
     * @atom IA-PHASE2-010
     * Templates must cover all required categories
     */
    it('should have templates for all required categories', () => {
      const counts = getTemplateCounts();

      expect(counts.authentication).toBeGreaterThanOrEqual(4);
      expect(counts.authorization).toBeGreaterThanOrEqual(3);
      expect(counts['data-integrity']).toBeGreaterThanOrEqual(5);
      expect(counts.performance).toBeGreaterThanOrEqual(3);
      expect(counts['state-transition']).toBeGreaterThanOrEqual(3);
      expect(counts['error-handling']).toBeGreaterThanOrEqual(3);
    });

    /**
     * @atom IA-PHASE2-010
     * Each template must have required fields
     */
    it('should have all required fields for each template', () => {
      for (const template of BUILTIN_TEMPLATES) {
        expect(template.name).toBeTruthy();
        expect(template.description).toBeTruthy();
        expect(template.category).toBeTruthy();
        expect(template.format).toBeTruthy();
        expect(template.templateContent).toBeTruthy();
        expect(template.parametersSchema).toBeTruthy();
        expect(template.exampleUsage).toBeTruthy();
        expect(Array.isArray(template.tags)).toBe(true);
        expect(template.tags.length).toBeGreaterThan(0);
      }
    });

    /**
     * @atom IA-PHASE2-010
     * Template content must contain placeholders
     */
    it('should have placeholders in all template contents', () => {
      for (const template of BUILTIN_TEMPLATES) {
        expect(template.templateContent).toContain('{{');
        expect(template.templateContent).toContain('}}');
      }
    });

    /**
     * @atom IA-PHASE2-010
     * All required parameters must be used in template content
     */
    it('should use all required parameters in template content', () => {
      for (const template of BUILTIN_TEMPLATES) {
        const requiredParams = template.parametersSchema.required || [];

        for (const param of requiredParams) {
          const placeholder = `{{${param}}}`;
          expect(template.templateContent).toContain(placeholder);
        }
      }
    });

    /**
     * @atom IA-PHASE2-010
     * Parameter schema must be valid JSON Schema
     */
    it('should have valid parameter schemas', () => {
      for (const template of BUILTIN_TEMPLATES) {
        expect(template.parametersSchema.type).toBe('object');
        expect(template.parametersSchema.properties).toBeTruthy();
        expect(typeof template.parametersSchema.properties).toBe('object');

        // Check each property has type and description
        for (const [, schema] of Object.entries(template.parametersSchema.properties)) {
          expect(schema.type).toBeTruthy();
          expect(schema.description).toBeTruthy();
        }
      }
    });
  });

  describe('Template Helper Functions', () => {
    it('should get templates by category', () => {
      const authTemplates = getTemplatesByCategory('authentication');
      expect(authTemplates.length).toBeGreaterThanOrEqual(4);
      expect(authTemplates.every((t) => t.category === 'authentication')).toBe(true);
    });

    it('should get correct template counts', () => {
      const counts = getTemplateCounts();
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
      expect(total).toBe(BUILTIN_TEMPLATES.length);
    });

    it('should find template by name (case-insensitive)', () => {
      const template = findTemplateByName('Authentication Required');
      expect(template).toBeTruthy();
      expect(template?.name).toBe('Authentication Required');

      const lowercase = findTemplateByName('authentication required');
      expect(lowercase).toBeTruthy();
    });

    it('should return undefined for non-existent template', () => {
      const template = findTemplateByName('Non-Existent Template');
      expect(template).toBeUndefined();
    });
  });

  describe('seedBuiltinTemplates', () => {
    /**
     * @atom IA-PHASE2-010
     * Seed service must create templates that don't exist
     */
    it('should create templates that do not exist', async () => {
      mockTemplatesRepository.findByName.mockResolvedValue(null);
      mockBaseRepository.create.mockImplementation((data) => data as ValidatorTemplate);
      mockBaseRepository.save.mockImplementation((data) =>
        Promise.resolve({ id: 'new-id', ...data } as ValidatorTemplate),
      );

      const result = await service.seedBuiltinTemplates();

      expect(result.created).toBe(BUILTIN_TEMPLATES.length);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.templates.length).toBe(BUILTIN_TEMPLATES.length);
    });

    /**
     * @atom IA-PHASE2-010
     * Seed service must skip templates that already exist
     */
    it('should skip templates that already exist', async () => {
      mockTemplatesRepository.findByName.mockResolvedValue({ id: 'existing' } as ValidatorTemplate);

      const result = await service.seedBuiltinTemplates();

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(BUILTIN_TEMPLATES.length);
      expect(result.errors).toBe(0);
      expect(mockBaseRepository.create).not.toHaveBeenCalled();
    });

    /**
     * @atom IA-PHASE2-010
     * Seed service must handle errors gracefully
     */
    it('should handle errors during seeding', async () => {
      mockTemplatesRepository.findByName.mockRejectedValue(new Error('Database error'));

      const result = await service.seedBuiltinTemplates();

      expect(result.errors).toBe(BUILTIN_TEMPLATES.length);
      expect(result.created).toBe(0);
    });

    it('should set isBuiltin to true for seeded templates', async () => {
      mockTemplatesRepository.findByName.mockResolvedValue(null);
      mockBaseRepository.create.mockImplementation((data) => data as ValidatorTemplate);
      mockBaseRepository.save.mockImplementation((data) =>
        Promise.resolve(data as ValidatorTemplate),
      );

      await service.seedBuiltinTemplates();

      expect(mockBaseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isBuiltin: true,
        }),
      );
    });
  });

  describe('reseedBuiltinTemplates', () => {
    it('should update existing templates', async () => {
      const existingTemplate = { id: 'existing', name: 'Test' } as ValidatorTemplate;
      mockTemplatesRepository.findByName.mockResolvedValue(existingTemplate);
      mockBaseRepository.save.mockResolvedValue(existingTemplate);

      const result = await service.reseedBuiltinTemplates();

      expect(result.updated).toBe(BUILTIN_TEMPLATES.length);
      expect(result.created).toBe(0);
    });

    it('should create missing templates during reseed', async () => {
      mockTemplatesRepository.findByName.mockResolvedValue(null);
      mockBaseRepository.create.mockImplementation((data) => data as ValidatorTemplate);
      mockBaseRepository.save.mockImplementation((data) =>
        Promise.resolve(data as ValidatorTemplate),
      );

      const result = await service.reseedBuiltinTemplates();

      expect(result.created).toBe(BUILTIN_TEMPLATES.length);
      expect(result.updated).toBe(0);
    });
  });

  describe('getExpectedTemplateCount', () => {
    it('should return the count of built-in templates', () => {
      expect(service.getExpectedTemplateCount()).toBe(BUILTIN_TEMPLATES.length);
    });
  });

  describe('verifyTemplates', () => {
    it('should report valid when all templates exist', async () => {
      const builtinTemplates = BUILTIN_TEMPLATES.map((t) => ({
        name: t.name,
      })) as ValidatorTemplate[];
      mockTemplatesRepository.findBuiltin.mockResolvedValue(builtinTemplates);

      const result = await service.verifyTemplates();

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
      expect(result.extra).toHaveLength(0);
    });

    it('should report missing templates', async () => {
      // Only return half the templates
      const partialTemplates = BUILTIN_TEMPLATES.slice(0, 10).map((t) => ({
        name: t.name,
      })) as ValidatorTemplate[];
      mockTemplatesRepository.findBuiltin.mockResolvedValue(partialTemplates);

      const result = await service.verifyTemplates();

      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    });

    it('should report extra templates not in source', async () => {
      const templatesWithExtra = [
        ...BUILTIN_TEMPLATES.map((t) => ({ name: t.name })),
        { name: 'Extra Custom Template' },
      ] as ValidatorTemplate[];
      mockTemplatesRepository.findBuiltin.mockResolvedValue(templatesWithExtra);

      const result = await service.verifyTemplates();

      expect(result.extra).toContain('Extra Custom Template');
    });
  });
});

describe('Built-in Template Content Quality', () => {
  /**
   * Verify that specific templates have expected structure
   */
  describe('Authentication Templates', () => {
    it('should include Authentication Required template', () => {
      const template = findTemplateByName('Authentication Required');
      expect(template).toBeTruthy();
      expect(template?.templateContent).toContain('authenticated');
      expect(template?.templateContent.toLowerCase()).toContain('unauthenticated');
    });

    it('should include Role-Based Access template', () => {
      const template = findTemplateByName('Role-Based Access');
      expect(template).toBeTruthy();
      expect(template?.parametersSchema.required).toContain('roleName');
    });

    it('should include Permission-Based Access template', () => {
      const template = findTemplateByName('Permission-Based Access');
      expect(template).toBeTruthy();
      expect(template?.parametersSchema.required).toContain('permissionName');
    });

    it('should include Session Validity template', () => {
      const template = findTemplateByName('Session Validity');
      expect(template).toBeTruthy();
      expect(template?.templateContent).toContain('session');
      expect(template?.templateContent).toContain('expired');
    });
  });

  describe('Authorization Templates', () => {
    it('should include Resource Ownership template', () => {
      const template = findTemplateByName('Resource Ownership');
      expect(template).toBeTruthy();
      expect(template?.templateContent).toContain('owner');
    });

    it('should include Team Membership template', () => {
      const template = findTemplateByName('Team Membership');
      expect(template).toBeTruthy();
      expect(template?.parametersSchema.required).toContain('teamName');
    });

    it('should include Admin-Only Access template', () => {
      const template = findTemplateByName('Admin-Only Access');
      expect(template).toBeTruthy();
      expect(template?.templateContent).toContain('administrator');
    });
  });

  describe('Data Integrity Templates', () => {
    it('should include Unique Constraint template', () => {
      const template = findTemplateByName('Unique Constraint');
      expect(template).toBeTruthy();
      expect(template?.templateContent).toContain('unique');
      expect(template?.templateContent).toContain('duplicate');
    });

    it('should include Referential Integrity template', () => {
      const template = findTemplateByName('Referential Integrity');
      expect(template).toBeTruthy();
      expect(template?.parametersSchema.required).toContain('foreignKeyField');
    });

    it('should include Format Validation template', () => {
      const template = findTemplateByName('Format Validation');
      expect(template).toBeTruthy();
      expect(template?.parametersSchema.properties.formatType?.enum).toBeDefined();
    });

    it('should include Range Validation template', () => {
      const template = findTemplateByName('Range Validation');
      expect(template).toBeTruthy();
      expect(template?.parametersSchema.required).toContain('minValue');
      expect(template?.parametersSchema.required).toContain('maxValue');
    });

    it('should include Required Fields template', () => {
      const template = findTemplateByName('Required Fields');
      expect(template).toBeTruthy();
      expect(template?.parametersSchema.required).toContain('requiredFields');
    });
  });

  describe('Performance Templates', () => {
    it('should include Response Time template', () => {
      const template = findTemplateByName('Response Time');
      expect(template).toBeTruthy();
      expect(template?.parametersSchema.required).toContain('maxDuration');
    });

    it('should include Throughput template', () => {
      const template = findTemplateByName('Throughput');
      expect(template).toBeTruthy();
      expect(template?.parametersSchema.required).toContain('requestCount');
    });

    it('should include Resource Limits template', () => {
      const template = findTemplateByName('Resource Limits');
      expect(template).toBeTruthy();
      expect(template?.parametersSchema.properties.resourceType?.enum).toBeDefined();
    });
  });

  describe('State Transition Templates', () => {
    it('should include Valid State Transition template', () => {
      const template = findTemplateByName('Valid State Transition');
      expect(template).toBeTruthy();
      expect(template?.parametersSchema.required).toContain('fromState');
      expect(template?.parametersSchema.required).toContain('toState');
    });

    it('should include Preconditions template', () => {
      const template = findTemplateByName('Preconditions');
      expect(template).toBeTruthy();
      expect(template?.templateContent).toContain('precondition');
    });

    it('should include Postconditions template', () => {
      const template = findTemplateByName('Postconditions');
      expect(template).toBeTruthy();
      expect(template?.templateContent).toContain('postcondition');
    });
  });

  describe('Error Handling Templates', () => {
    it('should include Graceful Failure template', () => {
      const template = findTemplateByName('Graceful Failure');
      expect(template).toBeTruthy();
      expect(template?.templateContent).toContain('gracefully');
      expect(template?.templateContent).toContain('crash');
    });

    it('should include HTTP Status Codes template', () => {
      const template = findTemplateByName('HTTP Status Codes');
      expect(template).toBeTruthy();
      expect(template?.templateContent).toContain('400');
      expect(template?.templateContent).toContain('401');
      expect(template?.templateContent).toContain('403');
      expect(template?.templateContent).toContain('404');
      expect(template?.templateContent).toContain('500');
    });

    it('should include Error Messages template', () => {
      const template = findTemplateByName('Error Messages');
      expect(template).toBeTruthy();
      expect(template?.templateContent).toContain('actionable');
      expect(template?.templateContent).toContain('sensitive');
    });
  });
});
