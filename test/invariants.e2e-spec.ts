/**
 * E2E tests for Invariants API
 * @atom INV-E2E-001 through INV-E2E-006
 *
 * These tests validate the invariant configuration system:
 * - CRUD operations for invariant configs
 * - Enable/disable functionality
 * - Built-in invariants behavior
 * - Custom invariant creation
 * - Project-specific invariant overrides
 */
import * as request from 'supertest';
import { setupE2EApp, teardownE2EApp } from './setup-e2e';
import { INestApplication } from '@nestjs/common';

describe('Invariants (e2e)', () => {
  let app: INestApplication;

  // Test data holders
  let builtinInvariantId: string;
  let customInvariantId: string;

  beforeAll(async () => {
    app = await setupE2EApp();
  });

  afterAll(async () => {
    await teardownE2EApp();
  });

  // @atom INV-E2E-001
  describe('GET /invariants - List Invariants', () => {
    it('should return all built-in invariants', async () => {
      const response = await request(app.getHttpServer()).get('/invariants').expect(200);

      expect(response.body).toBeInstanceOf(Array);
      // Should have at least the 9 built-in invariants
      expect(response.body.length).toBeGreaterThanOrEqual(9);

      // Verify built-in invariants are present
      const invariantIds = response.body.map((inv: { invariantId: string }) => inv.invariantId);
      expect(invariantIds).toContain('INV-001');
      expect(invariantIds).toContain('INV-002');
      expect(invariantIds).toContain('INV-003');
      expect(invariantIds).toContain('INV-004');
      expect(invariantIds).toContain('INV-005');
      expect(invariantIds).toContain('INV-006');
      expect(invariantIds).toContain('INV-007');
      expect(invariantIds).toContain('INV-008');
      expect(invariantIds).toContain('INV-009');

      // Store a built-in invariant ID for later tests
      const inv001 = response.body.find(
        (inv: { invariantId: string }) => inv.invariantId === 'INV-001',
      );
      builtinInvariantId = inv001.id;
    });

    it('should return invariants with correct structure', async () => {
      const response = await request(app.getHttpServer()).get('/invariants').expect(200);

      const invariant = response.body[0];
      expect(invariant.id).toBeDefined();
      expect(invariant.invariantId).toBeDefined();
      expect(invariant.name).toBeDefined();
      expect(invariant.description).toBeDefined();
      expect(invariant.isEnabled).toBeDefined();
      expect(invariant.isBlocking).toBeDefined();
      expect(invariant.checkType).toBeDefined();
      expect(invariant.errorMessage).toBeDefined();
    });
  });

  // @atom INV-E2E-002
  describe('GET /invariants/enabled - List Enabled Invariants', () => {
    it('should return only enabled invariants', async () => {
      const response = await request(app.getHttpServer()).get('/invariants/enabled').expect(200);

      expect(response.body).toBeInstanceOf(Array);
      response.body.forEach((inv: { isEnabled: boolean }) => {
        expect(inv.isEnabled).toBe(true);
      });
    });
  });

  // @atom INV-E2E-003
  describe('GET /invariants/:id - Get Single Invariant', () => {
    it('should return invariant by UUID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/invariants/${builtinInvariantId}`)
        .expect(200);

      expect(response.body.id).toBe(builtinInvariantId);
      expect(response.body.invariantId).toBe('INV-001');
    });

    it('should return 404 for non-existent invariant', async () => {
      await request(app.getHttpServer())
        .get('/invariants/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  // @atom INV-E2E-004
  describe('POST /invariants - Create Custom Invariant', () => {
    it('should create custom invariant with valid data', async () => {
      const response = await request(app.getHttpServer())
        .post('/invariants')
        .send({
          invariantId: 'INV-CUSTOM-001',
          name: 'Custom Test Invariant',
          description: 'A custom invariant for E2E testing',
          checkType: 'custom',
          checkConfig: {
            rules: [{ type: 'regex', pattern: 'test' }],
          },
          errorMessage: 'Custom validation failed',
          isEnabled: true,
          isBlocking: false,
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.invariantId).toBe('INV-CUSTOM-001');
      expect(response.body.name).toBe('Custom Test Invariant');
      expect(response.body.isBuiltin).toBe(false);
      expect(response.body.checkType).toBe('custom');

      customInvariantId = response.body.id;
    });

    it('should reject custom invariant with duplicate invariantId', async () => {
      await request(app.getHttpServer())
        .post('/invariants')
        .send({
          invariantId: 'INV-CUSTOM-001', // Same as above
          name: 'Duplicate Invariant',
          description: 'This should fail',
          errorMessage: 'Error',
        })
        .expect(400);
    });

    it('should reject custom invariant without required fields', async () => {
      await request(app.getHttpServer())
        .post('/invariants')
        .send({
          name: 'Missing invariantId',
        })
        .expect(400);
    });
  });

  // @atom INV-E2E-005
  describe('PATCH /invariants/:id - Update Invariant', () => {
    it('should update custom invariant', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/invariants/${customInvariantId}`)
        .send({
          name: 'Updated Custom Invariant',
          isBlocking: true,
        })
        .expect(200);

      expect(response.body.name).toBe('Updated Custom Invariant');
      expect(response.body.isBlocking).toBe(true);
    });

    it('should allow updating built-in invariant config', async () => {
      // Built-in invariants can have their enabled/blocking status changed
      const response = await request(app.getHttpServer())
        .patch(`/invariants/${builtinInvariantId}`)
        .send({
          isEnabled: true,
        })
        .expect(200);

      expect(response.body.isEnabled).toBe(true);
    });

    it('should reject changing checkType of built-in invariant', async () => {
      await request(app.getHttpServer())
        .patch(`/invariants/${builtinInvariantId}`)
        .send({
          checkType: 'custom',
        })
        .expect(403);
    });
  });

  // @atom INV-E2E-006
  describe('PATCH /invariants/:id/enable and /disable - Toggle Invariant', () => {
    it('should disable invariant', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/invariants/${customInvariantId}/disable`)
        .expect(200);

      expect(response.body.isEnabled).toBe(false);
    });

    it('should enable invariant', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/invariants/${customInvariantId}/enable`)
        .expect(200);

      expect(response.body.isEnabled).toBe(true);
    });

    it('should disable built-in invariant', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/invariants/${builtinInvariantId}/disable`)
        .expect(200);

      expect(response.body.isEnabled).toBe(false);

      // Re-enable for other tests
      await request(app.getHttpServer())
        .patch(`/invariants/${builtinInvariantId}/enable`)
        .expect(200);
    });
  });

  // @atom INV-E2E-007
  describe('DELETE /invariants/:id - Delete Invariant', () => {
    it('should delete custom invariant', async () => {
      await request(app.getHttpServer()).delete(`/invariants/${customInvariantId}`).expect(204);

      // Verify it's gone
      await request(app.getHttpServer()).get(`/invariants/${customInvariantId}`).expect(404);
    });

    it('should reject deletion of built-in invariant', async () => {
      await request(app.getHttpServer()).delete(`/invariants/${builtinInvariantId}`).expect(403);
    });
  });

  // @atom INV-E2E-008
  describe('Built-in Invariant Checkers', () => {
    let testAtomId: string;

    beforeAll(async () => {
      // Create a test atom for invariant checking
      const response = await request(app.getHttpServer()).post('/atoms').send({
        description:
          'Invariant test: System must validate user input before processing with proper sanitization',
        category: 'security',
      });
      testAtomId = response.body.id;

      // Add quality fields
      await request(app.getHttpServer())
        .patch(`/atoms/${testAtomId}`)
        .send({
          qualityScore: 85,
          observableOutcomes: [
            {
              description: 'User input is validated',
              measurementCriteria: 'Input validation check',
            },
          ],
          falsifiabilityCriteria: [
            {
              condition: 'Invalid input accepted',
              expectedBehavior: 'Validation error returned',
            },
          ],
        });
    });

    it('should run INV-001 (Explicit Commitment) check', async () => {
      const response = await request(app.getHttpServer())
        .post('/commitments/preview')
        .send({
          atomIds: [testAtomId],
          committedBy: 'test-user@example.com',
        })
        .expect(200);

      const inv001 = response.body.invariantChecks.find(
        (c: { invariantId: string }) => c.invariantId === 'INV-001',
      );
      expect(inv001).toBeDefined();
      expect(inv001.passed).toBe(true);
    });

    it('should run INV-002 (Behavioral Testability) check', async () => {
      const response = await request(app.getHttpServer())
        .post('/commitments/preview')
        .send({
          atomIds: [testAtomId],
          committedBy: 'test-user@example.com',
        })
        .expect(200);

      const inv002 = response.body.invariantChecks.find(
        (c: { invariantId: string }) => c.invariantId === 'INV-002',
      );
      expect(inv002).toBeDefined();
      // Should pass because we set quality score >= 80
      expect(inv002.passed).toBe(true);
    });

    it('should run INV-006 (Human Commit) check with valid human', async () => {
      const response = await request(app.getHttpServer())
        .post('/commitments/preview')
        .send({
          atomIds: [testAtomId],
          committedBy: 'jane.doe@company.com',
        })
        .expect(200);

      const inv006 = response.body.invariantChecks.find(
        (c: { invariantId: string }) => c.invariantId === 'INV-006',
      );
      expect(inv006).toBeDefined();
      expect(inv006.passed).toBe(true);
    });

    it('should fail INV-006 (Human Commit) for bot-like identifier', async () => {
      const response = await request(app.getHttpServer())
        .post('/commitments/preview')
        .send({
          atomIds: [testAtomId],
          committedBy: 'ci-bot',
        })
        .expect(200);

      const inv006 = response.body.invariantChecks.find(
        (c: { invariantId: string }) => c.invariantId === 'INV-006',
      );
      expect(inv006).toBeDefined();
      expect(inv006.passed).toBe(false);
    });

    it('should run INV-004 (Immutability) check for draft atoms', async () => {
      const response = await request(app.getHttpServer())
        .post('/commitments/preview')
        .send({
          atomIds: [testAtomId],
          committedBy: 'test-user@example.com',
        })
        .expect(200);

      const inv004 = response.body.invariantChecks.find(
        (c: { invariantId: string }) => c.invariantId === 'INV-004',
      );
      expect(inv004).toBeDefined();
      // Should pass because atom is in draft status
      expect(inv004.passed).toBe(true);
    });
  });
});
