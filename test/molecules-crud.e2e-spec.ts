import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

/**
 * E2E tests for Molecules (Phase 4)
 *
 * These tests verify:
 * 1. Molecule CRUD operations
 * 2. Atom-molecule associations
 * 3. Hierarchy management
 * 4. Computed metrics
 * 5. Orphan atoms
 */
describe('Molecules CRUD (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  // Test data
  let testAtomId: string;
  let testAtomUuid: string;
  let testMoleculeId: string;
  let testMoleculeUuid: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();
    dataSource = moduleFixture.get(DataSource);

    // Create a test atom for association tests
    const atomResponse = await request(app.getHttpServer())
      .post('/atoms')
      .send({
        description: 'Test atom for molecule tests',
        category: 'functional',
      })
      .expect(201);

    testAtomId = atomResponse.body.atomId;
    testAtomUuid = atomResponse.body.id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testMoleculeUuid) {
      await request(app.getHttpServer())
        .delete(`/molecules/${testMoleculeUuid}`)
        .catch(() => {}); // Ignore errors
    }
    if (testAtomUuid) {
      await request(app.getHttpServer())
        .delete(`/atoms/${testAtomUuid}`)
        .catch(() => {}); // Ignore errors
    }
    await app.close();
  });

  // ========================================
  // Molecule CRUD Tests
  // ========================================

  describe('POST /molecules', () => {
    it('should create a molecule with minimal fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/molecules')
        .send({
          name: 'Test User Story',
          lensType: 'user_story',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('moleculeId');
      expect(response.body.moleculeId).toMatch(/^M-\d{3}$/);
      expect(response.body.name).toBe('Test User Story');
      expect(response.body.lensType).toBe('user_story');

      testMoleculeId = response.body.moleculeId;
      testMoleculeUuid = response.body.id;
    });

    it('should create a molecule with all fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/molecules')
        .send({
          name: 'Complete Feature',
          description: 'A fully specified feature',
          lensType: 'feature',
          tags: ['phase-1', 'priority-high'],
        })
        .expect(201);

      expect(response.body.description).toBe('A fully specified feature');
      expect(response.body.tags).toContain('phase-1');

      // Clean up
      await request(app.getHttpServer())
        .delete(`/molecules/${response.body.id}`)
        .expect(204);
    });

    it('should create a molecule with custom lens type and label', async () => {
      const response = await request(app.getHttpServer())
        .post('/molecules')
        .send({
          name: 'Sprint Goal',
          lensType: 'custom',
          lensLabel: 'Sprint Goal',
        })
        .expect(201);

      expect(response.body.lensType).toBe('custom');
      expect(response.body.lensLabel).toBe('Sprint Goal');

      // Clean up
      await request(app.getHttpServer())
        .delete(`/molecules/${response.body.id}`)
        .expect(204);
    });

    it('should reject custom lens type without label', async () => {
      await request(app.getHttpServer())
        .post('/molecules')
        .send({
          name: 'Missing Label',
          lensType: 'custom',
        })
        .expect(400);
    });

    it('should reject invalid lens type', async () => {
      await request(app.getHttpServer())
        .post('/molecules')
        .send({
          name: 'Invalid Type',
          lensType: 'invalid',
        })
        .expect(400);
    });

    it('should reject name shorter than 3 characters', async () => {
      await request(app.getHttpServer())
        .post('/molecules')
        .send({
          name: 'AB',
          lensType: 'feature',
        })
        .expect(400);
    });
  });

  describe('GET /molecules', () => {
    it('should list molecules with pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/molecules')
        .query({ limit: 10, offset: 0 })
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('offset');
      expect(Array.isArray(response.body.items)).toBe(true);
    });

    it('should filter by lens type', async () => {
      const response = await request(app.getHttpServer())
        .get('/molecules')
        .query({ lensType: 'user_story' })
        .expect(200);

      expect(
        response.body.items.every((m: { lensType: string }) => m.lensType === 'user_story'),
      ).toBe(true);
    });

    it('should search by name', async () => {
      const response = await request(app.getHttpServer())
        .get('/molecules')
        .query({ search: 'Test User Story' })
        .expect(200);

      expect(response.body.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /molecules/lens-types', () => {
    it('should return all lens types with metadata', async () => {
      const response = await request(app.getHttpServer())
        .get('/molecules/lens-types')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(7);

      const userStory = response.body.find(
        (lt: { type: string }) => lt.type === 'user_story',
      );
      expect(userStory).toBeDefined();
      expect(userStory.label).toBe('User Story');
      expect(userStory.description).toBeDefined();
    });
  });

  describe('GET /molecules/:id', () => {
    it('should get a molecule by UUID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/molecules/${testMoleculeUuid}`)
        .expect(200);

      expect(response.body.id).toBe(testMoleculeUuid);
      expect(response.body.moleculeId).toBe(testMoleculeId);
      expect(response.body).toHaveProperty('metrics');
    });

    it('should return 404 for non-existent molecule', async () => {
      await request(app.getHttpServer())
        .get('/molecules/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  describe('PATCH /molecules/:id', () => {
    it('should update molecule name', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/molecules/${testMoleculeUuid}`)
        .send({ name: 'Updated User Story' })
        .expect(200);

      expect(response.body.name).toBe('Updated User Story');
    });

    it('should update molecule description', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/molecules/${testMoleculeUuid}`)
        .send({ description: 'New description' })
        .expect(200);

      expect(response.body.description).toBe('New description');
    });

    it('should update tags', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/molecules/${testMoleculeUuid}`)
        .send({ tags: ['new-tag'] })
        .expect(200);

      expect(response.body.tags).toContain('new-tag');
    });
  });

  // ========================================
  // Atom-Molecule Association Tests
  // ========================================

  describe('POST /molecules/:id/atoms', () => {
    it('should add an atom to a molecule', async () => {
      const response = await request(app.getHttpServer())
        .post(`/molecules/${testMoleculeUuid}/atoms`)
        .send({
          atomId: testAtomUuid,
          note: 'Core authentication requirement',
        })
        .expect(201);

      expect(response.body.moleculeId).toBe(testMoleculeUuid);
      expect(response.body.atomId).toBe(testAtomUuid);
      expect(response.body.note).toBe('Core authentication requirement');
    });

    it('should reject adding same atom twice', async () => {
      await request(app.getHttpServer())
        .post(`/molecules/${testMoleculeUuid}/atoms`)
        .send({ atomId: testAtomUuid })
        .expect(409);
    });

    it('should reject adding non-existent atom', async () => {
      await request(app.getHttpServer())
        .post(`/molecules/${testMoleculeUuid}/atoms`)
        .send({ atomId: '00000000-0000-0000-0000-000000000000' })
        .expect(404);
    });
  });

  describe('GET /molecules/:id/atoms', () => {
    it('should get atoms in a molecule', async () => {
      const response = await request(app.getHttpServer())
        .get(`/molecules/${testMoleculeUuid}/atoms`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PATCH /molecules/:id/atoms:reorder', () => {
    it('should reorder atoms', async () => {
      await request(app.getHttpServer())
        .patch(`/molecules/${testMoleculeUuid}/atoms:reorder`)
        .send({
          atomOrders: [{ atomId: testAtomUuid, order: 10 }],
        })
        .expect(204);
    });
  });

  describe('DELETE /molecules/:id/atoms/:atomId', () => {
    it('should remove an atom from a molecule (soft delete)', async () => {
      await request(app.getHttpServer())
        .delete(`/molecules/${testMoleculeUuid}/atoms/${testAtomUuid}`)
        .expect(204);

      // Verify atom is no longer in active list
      const response = await request(app.getHttpServer())
        .get(`/molecules/${testMoleculeUuid}/atoms`)
        .expect(200);

      const atomIds = response.body.map((a: { id: string }) => a.id);
      expect(atomIds).not.toContain(testAtomUuid);
    });

    it('should allow re-adding a previously removed atom', async () => {
      const response = await request(app.getHttpServer())
        .post(`/molecules/${testMoleculeUuid}/atoms`)
        .send({ atomId: testAtomUuid })
        .expect(201);

      expect(response.body.removedAt).toBeNull();
    });
  });

  // ========================================
  // Hierarchy Tests
  // ========================================

  describe('Molecule Hierarchy', () => {
    let parentMoleculeId: string;
    let childMoleculeId: string;

    beforeAll(async () => {
      // Create parent molecule
      const parentResponse = await request(app.getHttpServer())
        .post('/molecules')
        .send({
          name: 'Parent Epic',
          lensType: 'epic',
        })
        .expect(201);

      parentMoleculeId = parentResponse.body.id;

      // Create child molecule
      const childResponse = await request(app.getHttpServer())
        .post('/molecules')
        .send({
          name: 'Child Feature',
          lensType: 'feature',
          parentMoleculeId,
        })
        .expect(201);

      childMoleculeId = childResponse.body.id;
    });

    afterAll(async () => {
      // Clean up
      await request(app.getHttpServer())
        .delete(`/molecules/${childMoleculeId}`)
        .catch(() => {});
      await request(app.getHttpServer())
        .delete(`/molecules/${parentMoleculeId}`)
        .catch(() => {});
    });

    it('should create child molecule with parent', async () => {
      const response = await request(app.getHttpServer())
        .get(`/molecules/${childMoleculeId}`)
        .expect(200);

      expect(response.body.parentMoleculeId).toBe(parentMoleculeId);
    });

    it('should get children of a molecule', async () => {
      const response = await request(app.getHttpServer())
        .get(`/molecules/${parentMoleculeId}/children`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.some((m: { id: string }) => m.id === childMoleculeId)).toBe(
        true,
      );
    });

    it('should get ancestors of a molecule', async () => {
      const response = await request(app.getHttpServer())
        .get(`/molecules/${childMoleculeId}/ancestors`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should reject setting self as parent', async () => {
      await request(app.getHttpServer())
        .patch(`/molecules/${parentMoleculeId}`)
        .send({ parentMoleculeId })
        .expect(400);
    });

    it('should reject creating cycle', async () => {
      await request(app.getHttpServer())
        .patch(`/molecules/${parentMoleculeId}`)
        .send({ parentMoleculeId: childMoleculeId })
        .expect(400);
    });
  });

  // ========================================
  // Metrics Tests
  // ========================================

  describe('GET /molecules/:id/metrics', () => {
    it('should return computed metrics', async () => {
      const response = await request(app.getHttpServer())
        .get(`/molecules/${testMoleculeUuid}/metrics`)
        .expect(200);

      expect(response.body).toHaveProperty('atomCount');
      expect(response.body).toHaveProperty('validatorCoverage');
      expect(response.body).toHaveProperty('verificationHealth');
      expect(response.body).toHaveProperty('realizationStatus');
      expect(response.body).toHaveProperty('aggregateQuality');
      expect(response.body).toHaveProperty('childMoleculeCount');

      expect(response.body.realizationStatus).toHaveProperty('draft');
      expect(response.body.realizationStatus).toHaveProperty('committed');
      expect(response.body.realizationStatus).toHaveProperty('superseded');
      expect(response.body.realizationStatus).toHaveProperty('overall');
    });
  });

  describe('GET /molecules/statistics', () => {
    it('should return aggregate statistics', async () => {
      const response = await request(app.getHttpServer())
        .get('/molecules/statistics')
        .expect(200);

      expect(response.body).toHaveProperty('totalMolecules');
      expect(response.body).toHaveProperty('byLensType');
      expect(response.body).toHaveProperty('averageAtomsPerMolecule');
      expect(response.body).toHaveProperty('rootMoleculeCount');
      expect(response.body).toHaveProperty('orphanAtomCount');
    });
  });

  // ========================================
  // Orphan Atoms Tests
  // ========================================

  describe('GET /molecules/orphan-atoms', () => {
    it('should return orphan atoms', async () => {
      const response = await request(app.getHttpServer())
        .get('/molecules/orphan-atoms')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  // ========================================
  // Delete Tests
  // ========================================

  describe('DELETE /molecules/:id', () => {
    it('should delete a molecule (not atoms)', async () => {
      // Create a molecule to delete
      const createResponse = await request(app.getHttpServer())
        .post('/molecules')
        .send({
          name: 'To Be Deleted',
          lensType: 'feature',
        })
        .expect(201);

      const moleculeToDelete = createResponse.body.id;

      // Delete it
      await request(app.getHttpServer())
        .delete(`/molecules/${moleculeToDelete}`)
        .expect(204);

      // Verify it's gone
      await request(app.getHttpServer())
        .get(`/molecules/${moleculeToDelete}`)
        .expect(404);
    });
  });

  // ========================================
  // Atom Integration Tests
  // ========================================

  describe('GET /atoms/:id/molecules', () => {
    it('should get molecules containing an atom', async () => {
      const response = await request(app.getHttpServer())
        .get(`/atoms/${testAtomUuid}/molecules`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});
