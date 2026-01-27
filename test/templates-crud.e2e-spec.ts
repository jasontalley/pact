/**
 * E2E tests for Validator Templates CRUD operations
 * @atom IA-PHASE2-010
 *
 * Tests template lifecycle: create, read, update, delete
 * Tests built-in template seeding and protection
 * Tests template instantiation to create validators
 * Tests filtering, pagination, and search
 */
import * as request from 'supertest';
import { setupE2EApp, teardownE2EApp } from './setup-e2e';
import { INestApplication } from '@nestjs/common';

describe('Templates CRUD (e2e)', () => {
  let app: INestApplication;
  let testAtomId: string;

  beforeAll(async () => {
    app = await setupE2EApp();

    // Create a test atom for template instantiation tests
    const uniqueId = Date.now();
    const atomResponse = await request(app.getHttpServer())
      .post('/atoms')
      .send({
        description: `E2E Test ${uniqueId}: Template test atom for validation patterns`,
        category: 'functional',
      });

    testAtomId = atomResponse.body.id;
  }, 30000);

  afterAll(async () => {
    await teardownE2EApp();
  });

  // @atom IA-PHASE2-010 - Built-in templates exist
  describe('Built-in Templates (seeded)', () => {
    it('should have built-in templates seeded on startup', async () => {
      const response = await request(app.getHttpServer()).get('/templates').expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data.length).toBeGreaterThan(0);

      // Check for specific built-in templates
      const templateNames = response.body.data.map((t: any) => t.name);
      expect(templateNames).toContain('Authentication Required');
      expect(templateNames).toContain('Role-Based Access');
    });

    it('should have at least 20 built-in templates', async () => {
      const response = await request(app.getHttpServer())
        .get('/templates?isBuiltin=true')
        .expect(200);

      expect(response.body.total).toBeGreaterThanOrEqual(20);
    });

    it('should have templates for all required categories', async () => {
      const response = await request(app.getHttpServer()).get('/templates/categories').expect(200);

      const categories = response.body.map((c: any) => c.category);
      expect(categories).toContain('authentication');
      expect(categories).toContain('authorization');
      expect(categories).toContain('data-integrity');
      expect(categories).toContain('performance');
      expect(categories).toContain('state-transition');
      expect(categories).toContain('error-handling');
    });
  });

  // @atom IA-PHASE2-010 - Create custom templates
  describe('POST /templates - Create Template', () => {
    it('should create a custom template with valid data', async () => {
      const response = await request(app.getHttpServer())
        .post('/templates')
        .send({
          name: 'Custom Rate Limit Template',
          description: 'Validates API rate limiting enforcement for endpoints',
          category: 'performance',
          format: 'gherkin',
          templateContent:
            'Given an API endpoint {{endpointPath}}\nWhen {{requestCount}} requests are made in {{timeWindow}}\nThen rate limiting is enforced',
          parametersSchema: {
            type: 'object',
            properties: {
              endpointPath: { type: 'string', description: 'The API endpoint path' },
              requestCount: { type: 'number', description: 'Number of requests' },
              timeWindow: { type: 'string', description: 'Time window (e.g., "1 minute")' },
            },
            required: ['endpointPath', 'requestCount', 'timeWindow'],
          },
          exampleUsage: 'endpointPath=/api/users, requestCount=100, timeWindow=1 minute',
          tags: ['rate-limiting', 'api', 'performance'],
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Custom Rate Limit Template');
      expect(response.body.category).toBe('performance');
      expect(response.body.isBuiltin).toBe(false);
    });

    it('should create a template with natural language format', async () => {
      const response = await request(app.getHttpServer())
        .post('/templates')
        .send({
          name: 'Data Encryption Template',
          description: 'Validates that sensitive data is encrypted at rest',
          category: 'data-integrity',
          format: 'natural_language',
          templateContent:
            'The {{dataType}} stored in {{storageLocation}} must be encrypted using {{encryptionAlgorithm}}',
          parametersSchema: {
            type: 'object',
            properties: {
              dataType: { type: 'string', description: 'Type of data' },
              storageLocation: { type: 'string', description: 'Where data is stored' },
              encryptionAlgorithm: { type: 'string', description: 'Encryption algorithm' },
            },
            required: ['dataType', 'storageLocation', 'encryptionAlgorithm'],
          },
          tags: ['encryption', 'security', 'data'],
        })
        .expect(201);

      expect(response.body.format).toBe('natural_language');
    });

    it('should reject template with name too short', async () => {
      const response = await request(app.getHttpServer())
        .post('/templates')
        .send({
          name: 'AB',
          description: 'Valid description for the template',
          category: 'custom',
          format: 'gherkin',
          templateContent: 'Valid template content here',
          parametersSchema: { type: 'object', properties: {} },
        })
        .expect(400);

      expect(response.body.message).toContain('Name must be at least 3 characters');
    });

    it('should reject template with invalid category', async () => {
      await request(app.getHttpServer())
        .post('/templates')
        .send({
          name: 'Invalid Category Template',
          description: 'Valid description for the template',
          category: 'invalid-category',
          format: 'gherkin',
          templateContent: 'Valid template content here',
          parametersSchema: { type: 'object', properties: {} },
        })
        .expect(400);
    });

    it('should reject template with invalid format', async () => {
      await request(app.getHttpServer())
        .post('/templates')
        .send({
          name: 'Invalid Format Template',
          description: 'Valid description for the template',
          category: 'custom',
          format: 'invalid-format',
          templateContent: 'Valid template content here',
          parametersSchema: { type: 'object', properties: {} },
        })
        .expect(400);
    });
  });

  // @atom IA-PHASE2-010 - List and filter templates
  describe('GET /templates - List Templates', () => {
    it('should list all templates', async () => {
      const response = await request(app.getHttpServer()).get('/templates').expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('limit');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter templates by category', async () => {
      const response = await request(app.getHttpServer())
        .get('/templates?category=authentication')
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data.every((t: any) => t.category === 'authentication')).toBe(true);
    });

    it('should filter templates by format', async () => {
      const response = await request(app.getHttpServer())
        .get('/templates?format=gherkin')
        .expect(200);

      expect(response.body.data.every((t: any) => t.format === 'gherkin')).toBe(true);
    });

    it('should filter built-in templates', async () => {
      const response = await request(app.getHttpServer())
        .get('/templates?isBuiltin=true')
        .expect(200);

      expect(response.body.data.every((t: any) => t.isBuiltin === true)).toBe(true);
    });

    it('should filter custom templates', async () => {
      const response = await request(app.getHttpServer())
        .get('/templates?isBuiltin=false')
        .expect(200);

      expect(response.body.data.every((t: any) => t.isBuiltin === false)).toBe(true);
    });

    it('should search templates by name', async () => {
      const response = await request(app.getHttpServer())
        .get('/templates?search=Authentication')
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should paginate templates', async () => {
      const response = await request(app.getHttpServer())
        .get('/templates?page=1&limit=5')
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(5);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(5);
    });
  });

  // @atom IA-PHASE2-010 - Get templates by category
  describe('GET /templates/category/:category', () => {
    it('should get authentication templates', async () => {
      const response = await request(app.getHttpServer())
        .get('/templates/category/authentication')
        .expect(200);

      expect(response.body.length).toBeGreaterThanOrEqual(4);
      expect(response.body.every((t: any) => t.category === 'authentication')).toBe(true);
    });

    it('should get authorization templates', async () => {
      const response = await request(app.getHttpServer())
        .get('/templates/category/authorization')
        .expect(200);

      expect(response.body.length).toBeGreaterThanOrEqual(3);
    });

    it('should get data-integrity templates', async () => {
      const response = await request(app.getHttpServer())
        .get('/templates/category/data-integrity')
        .expect(200);

      expect(response.body.length).toBeGreaterThanOrEqual(5);
    });
  });

  // @atom IA-PHASE2-010 - Get single template
  describe('GET /templates/:id', () => {
    let builtinTemplateId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .get('/templates?search=Authentication Required&limit=1')
        .expect(200);

      builtinTemplateId = response.body.data[0]?.id;
    });

    it('should return a template by ID', async () => {
      if (!builtinTemplateId) {
        return; // Skip if template not found
      }

      const response = await request(app.getHttpServer())
        .get(`/templates/${builtinTemplateId}`)
        .expect(200);

      expect(response.body.id).toBe(builtinTemplateId);
      expect(response.body.name).toBe('Authentication Required');
    });

    it('should return 404 for non-existent template', async () => {
      await request(app.getHttpServer())
        .get('/templates/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(app.getHttpServer()).get('/templates/not-a-uuid').expect(400);
    });
  });

  // @atom IA-PHASE2-010 - Template instantiation
  describe('POST /templates/:id/instantiate - Create Validator from Template', () => {
    let roleBasedTemplateId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .get('/templates?search=Role-Based Access&limit=1')
        .expect(200);

      roleBasedTemplateId = response.body.data[0]?.id;
    });

    it('should instantiate a validator from a template', async () => {
      if (!roleBasedTemplateId) {
        return; // Skip if template not found
      }

      const response = await request(app.getHttpServer())
        .post(`/templates/${roleBasedTemplateId}/instantiate`)
        .send({
          atomId: testAtomId,
          parameters: {
            roleName: 'admin',
            resource: '/api/admin/settings',
          },
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.atomId).toBe(testAtomId);
      expect(response.body.templateId).toBe(roleBasedTemplateId);
      expect(response.body.content).toContain('admin');
      expect(response.body.content).toContain('/api/admin/settings');
    });

    it('should instantiate with custom name and description', async () => {
      if (!roleBasedTemplateId) {
        return;
      }

      const response = await request(app.getHttpServer())
        .post(`/templates/${roleBasedTemplateId}/instantiate`)
        .send({
          atomId: testAtomId,
          parameters: {
            roleName: 'moderator',
            resource: '/api/content',
          },
          name: 'Moderator Content Access Check',
          description: 'Custom description for moderator access',
        })
        .expect(201);

      expect(response.body.name).toBe('Moderator Content Access Check');
      expect(response.body.description).toBe('Custom description for moderator access');
    });

    it('should reject instantiation with missing required parameters', async () => {
      if (!roleBasedTemplateId) {
        return;
      }

      await request(app.getHttpServer())
        .post(`/templates/${roleBasedTemplateId}/instantiate`)
        .send({
          atomId: testAtomId,
          parameters: {
            // Missing required 'roleName' parameter
            resource: '/api/users',
          },
        })
        .expect(400);
    });

    it('should reject instantiation with non-existent atom', async () => {
      if (!roleBasedTemplateId) {
        return;
      }

      await request(app.getHttpServer())
        .post(`/templates/${roleBasedTemplateId}/instantiate`)
        .send({
          atomId: '00000000-0000-0000-0000-000000000000',
          parameters: {
            roleName: 'admin',
            resource: '/api/admin',
          },
        })
        .expect(404);
    });
  });

  // @atom IA-PHASE2-010 - Update templates (custom only)
  describe('PATCH /templates/:id - Update Template', () => {
    let customTemplateId: string;
    let builtinTemplateId: string;

    beforeAll(async () => {
      // Create a custom template
      const customResponse = await request(app.getHttpServer())
        .post('/templates')
        .send({
          name: 'Update Test Template',
          description: 'Template for update testing',
          category: 'custom',
          format: 'natural_language',
          templateContent: 'The {{item}} must satisfy {{condition}}',
          parametersSchema: {
            type: 'object',
            properties: {
              item: { type: 'string', description: 'Item to validate' },
              condition: { type: 'string', description: 'Condition to satisfy' },
            },
            required: ['item', 'condition'],
          },
        });
      customTemplateId = customResponse.body.id;

      // Get a built-in template
      const builtinResponse = await request(app.getHttpServer()).get(
        '/templates?isBuiltin=true&limit=1',
      );
      builtinTemplateId = builtinResponse.body.data[0]?.id;
    });

    it('should update a custom template', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/templates/${customTemplateId}`)
        .send({
          description: 'Updated description for custom template',
        })
        .expect(200);

      expect(response.body.description).toBe('Updated description for custom template');
    });

    it('should reject update of built-in template', async () => {
      if (!builtinTemplateId) {
        return;
      }

      await request(app.getHttpServer())
        .patch(`/templates/${builtinTemplateId}`)
        .send({
          description: 'Trying to update built-in',
        })
        .expect(403);
    });
  });

  // @atom IA-PHASE2-010 - Delete templates (custom only)
  describe('DELETE /templates/:id - Delete Template', () => {
    let customTemplateId: string;
    let builtinTemplateId: string;

    beforeEach(async () => {
      // Create a custom template for each test
      const customResponse = await request(app.getHttpServer())
        .post('/templates')
        .send({
          name: `Delete Test Template ${Date.now()}`,
          description: 'Template for delete testing',
          category: 'custom',
          format: 'natural_language',
          templateContent: 'The {{item}} must be deleted',
          parametersSchema: {
            type: 'object',
            properties: {
              item: { type: 'string', description: 'Item to delete' },
            },
            required: ['item'],
          },
        });
      customTemplateId = customResponse.body.id;

      // Get a built-in template
      const builtinResponse = await request(app.getHttpServer()).get(
        '/templates?isBuiltin=true&limit=1',
      );
      builtinTemplateId = builtinResponse.body.data[0]?.id;
    });

    it('should delete a custom template', async () => {
      await request(app.getHttpServer()).delete(`/templates/${customTemplateId}`).expect(204);

      // Verify it's gone
      await request(app.getHttpServer()).get(`/templates/${customTemplateId}`).expect(404);
    });

    it('should reject deletion of built-in template', async () => {
      if (!builtinTemplateId) {
        return;
      }

      await request(app.getHttpServer()).delete(`/templates/${builtinTemplateId}`).expect(403);
    });
  });

  // @atom IA-PHASE2-010 - Template statistics and metadata
  describe('GET /templates/statistics', () => {
    it('should return template statistics', async () => {
      const response = await request(app.getHttpServer()).get('/templates/statistics').expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('byCategory');
      expect(response.body).toHaveProperty('byFormat');
      expect(response.body).toHaveProperty('builtinCount');
      expect(response.body).toHaveProperty('customCount');
    });
  });

  describe('GET /templates/tags', () => {
    it('should return popular tags', async () => {
      const response = await request(app.getHttpServer()).get('/templates/tags').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should limit tags when specified', async () => {
      const response = await request(app.getHttpServer())
        .get('/templates/tags?limit=5')
        .expect(200);

      expect(response.body.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /templates/:id/usage', () => {
    let templateId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer()).get('/templates?isBuiltin=true&limit=1');
      templateId = response.body.data[0]?.id;
    });

    it('should return usage information for a template', async () => {
      if (!templateId) {
        return;
      }

      const response = await request(app.getHttpServer())
        .get(`/templates/${templateId}/usage`)
        .expect(200);

      expect(response.body).toHaveProperty('usageCount');
      expect(response.body).toHaveProperty('validators');
    });
  });
});
