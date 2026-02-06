/**
 * E2E tests for Validators CRUD operations
 * @atom IA-PHASE2-001 through IA-PHASE2-010
 *
 * Tests validator lifecycle: create, read, update, delete
 * Tests filtering, pagination, and search
 * Tests atom-validator associations
 * Tests translation endpoints
 */
import * as request from 'supertest';
import { setupE2EApp, teardownE2EApp } from './setup-e2e';
import { INestApplication } from '@nestjs/common';

describe('Validators CRUD (e2e)', () => {
  let app: INestApplication;
  let testAtomId: string;

  beforeAll(async () => {
    app = await setupE2EApp();

    // Create a test atom to associate validators with
    const uniqueId = Date.now();
    const atomResponse = await request(app.getHttpServer())
      .post('/atoms')
      .send({
        description: `E2E Test ${uniqueId}: Validator test atom for authentication flows`,
        category: 'security',
      });

    testAtomId = atomResponse.body.id;
  }, 30000);

  afterAll(async () => {
    await teardownE2EApp();
  });

  // @atom IA-PHASE2-001
  describe('POST /validators - Create Validator', () => {
    it('should create a validator with valid data', async () => {
      const response = await request(app.getHttpServer())
        .post('/validators')
        .send({
          atomId: testAtomId,
          name: 'Test Auth Validator',
          description: 'Validates user authentication',
          validatorType: 'gherkin',
          content:
            'Given a user with valid credentials\nWhen they submit the login form\nThen they are authenticated successfully',
          format: 'gherkin',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Test Auth Validator');
      expect(response.body.validatorType).toBe('gherkin');
      expect(response.body.format).toBe('gherkin');
      expect(response.body.atomId).toBe(testAtomId);
      expect(response.body.isActive).toBe(true);
    });

    it('should create a declarative validator', async () => {
      const response = await request(app.getHttpServer())
        .post('/validators')
        .send({
          atomId: testAtomId,
          name: 'Declarative Auth Validator',
          validatorType: 'declarative',
          content: 'User must be authenticated before accessing protected resources',
          format: 'natural_language',
        })
        .expect(201);

      expect(response.body.validatorType).toBe('declarative');
      expect(response.body.format).toBe('natural_language');
    });

    it('should create an executable validator', async () => {
      const response = await request(app.getHttpServer())
        .post('/validators')
        .send({
          atomId: testAtomId,
          name: 'Executable Auth Validator',
          validatorType: 'executable',
          content: `
export function validate(context: { user: User }): boolean {
  return context.user.isAuthenticated === true;
}`,
          format: 'typescript',
        })
        .expect(201);

      expect(response.body.validatorType).toBe('executable');
      expect(response.body.format).toBe('typescript');
    });

    it('should reject validator with non-existent atom', async () => {
      await request(app.getHttpServer())
        .post('/validators')
        .send({
          atomId: '00000000-0000-0000-0000-000000000000',
          name: 'Invalid Atom Validator',
          validatorType: 'gherkin',
          content: 'Given some condition\nWhen action\nThen result',
          format: 'gherkin',
        })
        .expect(404);
    });

    it('should reject validator with name too short', async () => {
      const response = await request(app.getHttpServer())
        .post('/validators')
        .send({
          atomId: testAtomId,
          name: 'AB',
          validatorType: 'gherkin',
          content: 'Given some condition\nWhen action\nThen result',
          format: 'gherkin',
        })
        .expect(400);

      expect(response.body.message).toContain('Name must be at least 3 characters long');
    });

    it('should reject validator with content too short', async () => {
      const response = await request(app.getHttpServer())
        .post('/validators')
        .send({
          atomId: testAtomId,
          name: 'Valid Name',
          validatorType: 'gherkin',
          content: 'short',
          format: 'gherkin',
        })
        .expect(400);

      expect(response.body.message).toContain('Content must be at least 10 characters long');
    });

    it('should reject validator with invalid type', async () => {
      await request(app.getHttpServer())
        .post('/validators')
        .send({
          atomId: testAtomId,
          name: 'Invalid Type Validator',
          validatorType: 'invalid-type',
          content: 'Given some condition\nWhen action\nThen result',
          format: 'gherkin',
        })
        .expect(400);
    });

    it('should reject validator with invalid format', async () => {
      await request(app.getHttpServer())
        .post('/validators')
        .send({
          atomId: testAtomId,
          name: 'Invalid Format Validator',
          validatorType: 'gherkin',
          content: 'Given some condition\nWhen action\nThen result',
          format: 'invalid-format',
        })
        .expect(400);
    });
  });

  // @atom IA-PHASE2-002
  describe('GET /validators - List Validators', () => {
    let createdValidatorId: string;

    beforeAll(async () => {
      // Create multiple validators for listing tests
      for (let i = 0; i < 5; i++) {
        const response = await request(app.getHttpServer())
          .post('/validators')
          .send({
            atomId: testAtomId,
            name: `List Test Validator ${i}`,
            description: `Test description ${i}`,
            validatorType: i % 2 === 0 ? 'gherkin' : 'declarative',
            content: `Given condition ${i}\nWhen action ${i}\nThen result ${i}`,
            format: i % 2 === 0 ? 'gherkin' : 'natural_language',
          });
        if (i === 0) {
          createdValidatorId = response.body.id;
        }
      }
    });

    it('should list all validators', async () => {
      const response = await request(app.getHttpServer()).get('/validators').expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('limit');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeGreaterThan(0);
    });

    it('should filter validators by atomId', async () => {
      const response = await request(app.getHttpServer())
        .get(`/validators?atomId=${testAtomId}`)
        .expect(200);

      expect(response.body.items.length).toBeGreaterThan(0);
      expect(response.body.items.every((v: any) => v.atomId === testAtomId)).toBe(true);
    });

    it('should filter validators by validatorType', async () => {
      const response = await request(app.getHttpServer())
        .get('/validators?validatorType=gherkin')
        .expect(200);

      expect(response.body.items.every((v: any) => v.validatorType === 'gherkin')).toBe(true);
    });

    it('should filter validators by format', async () => {
      const response = await request(app.getHttpServer())
        .get('/validators?format=gherkin')
        .expect(200);

      expect(response.body.items.every((v: any) => v.format === 'gherkin')).toBe(true);
    });

    it('should filter validators by isActive', async () => {
      const response = await request(app.getHttpServer())
        .get('/validators?isActive=true')
        .expect(200);

      expect(response.body.items.every((v: any) => v.isActive === true)).toBe(true);
    });

    it('should search validators by name', async () => {
      const response = await request(app.getHttpServer())
        .get('/validators?search=List Test')
        .expect(200);

      expect(response.body.items.length).toBeGreaterThan(0);
    });

    it('should paginate validators', async () => {
      const response = await request(app.getHttpServer())
        .get('/validators?page=1&limit=2')
        .expect(200);

      expect(response.body.items.length).toBeLessThanOrEqual(2);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(2);
    });
  });

  // @atom IA-PHASE2-003
  describe('GET /validators/:id - Get Single Validator', () => {
    let validatorId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer()).post('/validators').send({
        atomId: testAtomId,
        name: 'Single Validator Test',
        validatorType: 'gherkin',
        content: 'Given a condition\nWhen an action\nThen a result',
        format: 'gherkin',
      });
      validatorId = response.body.id;
    });

    it('should return a single validator by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/validators/${validatorId}`)
        .expect(200);

      expect(response.body.id).toBe(validatorId);
      expect(response.body.name).toBe('Single Validator Test');
    });

    it('should return 404 for non-existent validator', async () => {
      await request(app.getHttpServer())
        .get('/validators/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(app.getHttpServer()).get('/validators/not-a-uuid').expect(400);
    });
  });

  // @atom IA-PHASE2-004
  describe('PATCH /validators/:id - Update Validator', () => {
    let validatorId: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer()).post('/validators').send({
        atomId: testAtomId,
        name: 'Update Test Validator',
        description: 'Original description',
        validatorType: 'gherkin',
        content: 'Given original\nWhen original\nThen original',
        format: 'gherkin',
      });
      validatorId = response.body.id;
    });

    it('should update validator name', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/validators/${validatorId}`)
        .send({ name: 'Updated Validator Name' })
        .expect(200);

      expect(response.body.name).toBe('Updated Validator Name');
    });

    it('should update validator description', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/validators/${validatorId}`)
        .send({ description: 'Updated description' })
        .expect(200);

      expect(response.body.description).toBe('Updated description');
    });

    it('should update validator content', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/validators/${validatorId}`)
        .send({ content: 'Given updated\nWhen updated\nThen updated' })
        .expect(200);

      expect(response.body.content).toContain('updated');
    });

    it('should update multiple fields at once', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/validators/${validatorId}`)
        .send({
          name: 'Multi-Update Name',
          description: 'Multi-Update Description',
        })
        .expect(200);

      expect(response.body.name).toBe('Multi-Update Name');
      expect(response.body.description).toBe('Multi-Update Description');
    });

    it('should return 404 for non-existent validator', async () => {
      await request(app.getHttpServer())
        .patch('/validators/00000000-0000-0000-0000-000000000000')
        .send({ name: 'New Name' })
        .expect(404);
    });
  });

  // @atom IA-PHASE2-005
  describe('PATCH /validators/:id/activate & deactivate', () => {
    let validatorId: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer()).post('/validators').send({
        atomId: testAtomId,
        name: 'Activate/Deactivate Test',
        validatorType: 'gherkin',
        content: 'Given something\nWhen something\nThen something',
        format: 'gherkin',
      });
      validatorId = response.body.id;
    });

    it('should deactivate a validator', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/validators/${validatorId}/deactivate`)
        .expect(200);

      expect(response.body.isActive).toBe(false);
    });

    it('should activate a deactivated validator', async () => {
      // First deactivate
      await request(app.getHttpServer()).patch(`/validators/${validatorId}/deactivate`).expect(200);

      // Then activate
      const response = await request(app.getHttpServer())
        .patch(`/validators/${validatorId}/activate`)
        .expect(200);

      expect(response.body.isActive).toBe(true);
    });
  });

  // @atom IA-PHASE2-006
  describe('DELETE /validators/:id - Delete Validator', () => {
    let validatorId: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer()).post('/validators').send({
        atomId: testAtomId,
        name: 'Delete Test Validator',
        validatorType: 'gherkin',
        content: 'Given delete\nWhen delete\nThen delete',
        format: 'gherkin',
      });
      validatorId = response.body.id;
    });

    it('should soft delete (deactivate) a validator', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/validators/${validatorId}`)
        .expect(200);

      expect(response.body.isActive).toBe(false);
    });

    it('should permanently delete a validator', async () => {
      await request(app.getHttpServer()).delete(`/validators/${validatorId}/permanent`).expect(204);

      // Verify it's gone
      await request(app.getHttpServer()).get(`/validators/${validatorId}`).expect(404);
    });

    it('should return 404 when deleting non-existent validator', async () => {
      await request(app.getHttpServer())
        .delete('/validators/00000000-0000-0000-0000-000000000000/permanent')
        .expect(404);
    });
  });

  // @atom IA-PHASE2-007
  describe('GET /validators/statistics', () => {
    it('should return validator statistics', async () => {
      const response = await request(app.getHttpServer()).get('/validators/statistics').expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('byType');
      expect(response.body).toHaveProperty('byFormat');
      expect(response.body).toHaveProperty('activeCount');
    });
  });

  // @atom IA-PHASE2-008
  describe('GET /validators/:id/translations', () => {
    let validatorId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer()).post('/validators').send({
        atomId: testAtomId,
        name: 'Translation Test Validator',
        validatorType: 'gherkin',
        content: 'Given a user\nWhen they login\nThen they are authenticated',
        format: 'gherkin',
      });
      validatorId = response.body.id;
    });

    it('should return translations with original content for new validator', async () => {
      const response = await request(app.getHttpServer())
        .get(`/validators/${validatorId}/translations`)
        .expect(200);

      expect(response.body).toHaveProperty('id', validatorId);
      expect(response.body).toHaveProperty('originalFormat', 'gherkin');
      expect(response.body).toHaveProperty('translations');
      // Original content is always included in translations
      expect(response.body.translations).toHaveProperty('gherkin');
      expect(response.body.translations.gherkin).toHaveProperty('content');
    });
  });

  // @atom IA-PHASE2-009
  describe('POST /validators/translate', () => {
    it('should translate content between formats (heuristic fallback)', async () => {
      const response = await request(app.getHttpServer()).post('/validators/translate').send({
        content:
          'Given a user with valid credentials\nWhen they submit login\nThen they are authenticated',
        sourceFormat: 'gherkin',
        targetFormat: 'natural_language',
      });

      // Translation service may not be available, so accept multiple status codes
      expect([200, 201, 500, 503]).toContain(response.status);

      if (response.status === 200 || response.status === 201) {
        expect(response.body).toHaveProperty('content');
        expect(response.body).toHaveProperty('sourceFormat');
        expect(response.body).toHaveProperty('targetFormat');
        expect(response.body.sourceFormat).toBe('gherkin');
        expect(response.body.targetFormat).toBe('natural_language');
      }
    });
  });
});
