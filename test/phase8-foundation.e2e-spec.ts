/**
 * E2E tests for Phase 8: Foundation
 *
 * Tests the four Phase 8 subsystems:
 * 1. Conflict Detection (8.1)
 * 2. Coupling Metrics (8.2)
 * 3. Conversation Persistence (8.3)
 * 4. Intent Identity (8.4)
 */
import * as request from 'supertest';
import { setupE2EApp, teardownE2EApp } from './setup-e2e';
import { INestApplication } from '@nestjs/common';

describe('Phase 8: Foundation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await setupE2EApp();
  }, 30000);

  afterAll(async () => {
    await teardownE2EApp();
  });

  // ========================
  // 8.1 Conflict Detection
  // ========================

  describe('Conflicts API', () => {
    let atomIdA: string;
    let atomIdB: string;
    let conflictId: string;

    beforeAll(async () => {
      // Create two atoms to reference in conflicts
      const resA = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'User can log in with email and password',
          category: 'functional',
        })
        .expect(201);
      atomIdA = resA.body.id;

      const resB = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'User authenticates via email credentials',
          category: 'functional',
        })
        .expect(201);
      atomIdB = resB.body.id;
    });

    it('POST /conflicts - should create a conflict record', async () => {
      const response = await request(app.getHttpServer())
        .post('/conflicts')
        .send({
          conflictType: 'semantic_overlap',
          atomIdA,
          atomIdB,
          similarityScore: 87.5,
          description: 'Both atoms describe user authentication login behavior',
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.conflictType).toBe('semantic_overlap');
      expect(response.body.status).toBe('open');
      expect(response.body.atomIdA).toBe(atomIdA);
      expect(response.body.atomIdB).toBe(atomIdB);

      conflictId = response.body.id;
    });

    it('GET /conflicts - should list all conflicts', async () => {
      const response = await request(app.getHttpServer()).get('/conflicts').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /conflicts?status=open - should filter by status', async () => {
      const response = await request(app.getHttpServer()).get('/conflicts?status=open').expect(200);

      for (const conflict of response.body) {
        expect(conflict.status).toBe('open');
      }
    });

    it('GET /conflicts/:id - should return a specific conflict', async () => {
      const response = await request(app.getHttpServer())
        .get(`/conflicts/${conflictId}`)
        .expect(200);

      expect(response.body.id).toBe(conflictId);
      expect(response.body.conflictType).toBe('semantic_overlap');
    });

    it('GET /conflicts/:id - should return 404 for non-existent conflict', async () => {
      await request(app.getHttpServer())
        .get('/conflicts/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('GET /conflicts/metrics - should return conflict metrics', async () => {
      const response = await request(app.getHttpServer()).get('/conflicts/metrics').expect(200);

      expect(response.body.total).toBeGreaterThanOrEqual(1);
      expect(response.body.open).toBeGreaterThanOrEqual(1);
      expect(response.body.byType).toBeDefined();
      expect(response.body.byType.semantic_overlap).toBeGreaterThanOrEqual(1);
    });

    it('PATCH /conflicts/:id/escalate - should escalate a conflict', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/conflicts/${conflictId}/escalate`)
        .expect(200);

      expect(response.body.status).toBe('escalated');
    });

    it('PATCH /conflicts/:id/resolve - should resolve a conflict', async () => {
      // Create a new conflict to resolve
      const createRes = await request(app.getHttpServer())
        .post('/conflicts')
        .send({
          conflictType: 'same_test',
          atomIdA,
          atomIdB,
          description: 'Both claim test auth.spec.ts:42',
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .patch(`/conflicts/${createRes.body.id}/resolve`)
        .send({
          action: 'supersede_a',
          resolvedBy: 'test-user',
          reason: 'Atom A was less precise',
        })
        .expect(200);

      expect(response.body.status).toBe('resolved');
      expect(response.body.resolution).toBeDefined();
      expect(response.body.resolution.action).toBe('supersede_a');
      expect(response.body.resolvedAt).toBeDefined();
    });
  });

  // ========================
  // 8.2 Coupling Metrics
  // ========================

  describe('Metrics API', () => {
    it('GET /metrics/coupling - should return coupling metrics', async () => {
      const response = await request(app.getHttpServer()).get('/metrics/coupling').expect(200);

      expect(response.body.atomTestCoupling).toBeDefined();
      expect(response.body.atomTestCoupling.totalAtoms).toBeGreaterThanOrEqual(0);
      expect(response.body.atomTestCoupling.rate).toBeGreaterThanOrEqual(0);
      expect(response.body.atomTestCoupling.rate).toBeLessThanOrEqual(1);

      expect(response.body.testAtomCoupling).toBeDefined();
      expect(response.body.testAtomCoupling.totalTests).toBeGreaterThanOrEqual(0);

      expect(response.body.codeAtomCoverage).toBeDefined();

      expect(response.body.timestamp).toBeDefined();
    });

    it('GET /metrics/coupling/atom-test - should return atom-test metrics only', async () => {
      const response = await request(app.getHttpServer())
        .get('/metrics/coupling/atom-test')
        .expect(200);

      expect(response.body.totalAtoms).toBeDefined();
      expect(response.body.atomsWithTests).toBeDefined();
      expect(response.body.rate).toBeDefined();
      expect(response.body.orphanAtoms).toBeDefined();
    });

    it('GET /metrics/coupling/orphans - should return orphan lists', async () => {
      const response = await request(app.getHttpServer())
        .get('/metrics/coupling/orphans')
        .expect(200);

      expect(response.body.orphanAtoms).toBeDefined();
      expect(response.body.orphanTests).toBeDefined();
      expect(Array.isArray(response.body.orphanAtoms)).toBe(true);
      expect(Array.isArray(response.body.orphanTests)).toBe(true);
    });
  });

  // ========================
  // 8.3 Conversation Persistence
  // ========================

  describe('Conversations API', () => {
    let conversationId: string;

    it('POST /conversations - should create a new conversation', async () => {
      const response = await request(app.getHttpServer())
        .post('/conversations')
        .send({})
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.messageCount).toBe(0);
      expect(response.body.isArchived).toBe(false);

      conversationId = response.body.id;
    });

    it('POST /conversations - should create with custom title', async () => {
      const response = await request(app.getHttpServer())
        .post('/conversations')
        .send({ title: 'Test Discussion' })
        .expect(201);

      expect(response.body.title).toBe('Test Discussion');
    });

    it('GET /conversations - should list recent conversations', async () => {
      const response = await request(app.getHttpServer()).get('/conversations').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /conversations/:id - should return conversation details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/conversations/${conversationId}`)
        .expect(200);

      expect(response.body.id).toBe(conversationId);
    });

    it('GET /conversations/:id - should return 404 for non-existent conversation', async () => {
      await request(app.getHttpServer())
        .get('/conversations/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('GET /conversations/:id/messages - should return empty messages for new conversation', async () => {
      const response = await request(app.getHttpServer())
        .get(`/conversations/${conversationId}/messages`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    it('PATCH /conversations/:id - should update title', async () => {
      await request(app.getHttpServer())
        .patch(`/conversations/${conversationId}`)
        .send({ title: 'Updated Title' })
        .expect(200);

      const verifyRes = await request(app.getHttpServer())
        .get(`/conversations/${conversationId}`)
        .expect(200);

      expect(verifyRes.body.title).toBe('Updated Title');
    });

    it('DELETE /conversations/:id - should archive a conversation', async () => {
      // Create a conversation to archive
      const createRes = await request(app.getHttpServer())
        .post('/conversations')
        .send({})
        .expect(201);

      await request(app.getHttpServer()).delete(`/conversations/${createRes.body.id}`).expect(204);

      // Verify it's archived
      const verifyRes = await request(app.getHttpServer())
        .get(`/conversations/${createRes.body.id}`)
        .expect(200);

      expect(verifyRes.body.isArchived).toBe(true);
    });
  });

  // ========================
  // 8.4 Intent Identity
  // ========================

  describe('Intent Identity', () => {
    let atomUUID: string;
    let atomId: string;

    it('should auto-generate intentIdentity on atom creation', async () => {
      const response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'System must log all authentication attempts',
          category: 'security',
        })
        .expect(201);

      expect(response.body.intentIdentity).toBeDefined();
      expect(response.body.intentVersion).toBe(1);

      atomUUID = response.body.id;
      atomId = response.body.atomId;
    });

    it('should copy intentIdentity on supersession', async () => {
      // First commit the atom (need quality score >= 80)
      await request(app.getHttpServer())
        .patch(`/atoms/${atomUUID}`)
        .send({ qualityScore: 90 })
        .expect(200);

      await request(app.getHttpServer()).patch(`/atoms/${atomUUID}/commit`).expect(200);

      // Get the original atom's intentIdentity
      const originalRes = await request(app.getHttpServer()).get(`/atoms/${atomUUID}`).expect(200);

      const originalIntentIdentity = originalRes.body.intentIdentity;

      // Supersede it
      const supersedeRes = await request(app.getHttpServer())
        .post(`/atoms/${atomUUID}/supersede-with-new`)
        .send({
          newDescription: 'System must log all authentication attempts with IP address',
        })
        .expect(201);

      // Verify new atom inherits intentIdentity
      expect(supersedeRes.body.newAtom.intentIdentity).toBe(originalIntentIdentity);
      expect(supersedeRes.body.newAtom.intentVersion).toBe(2);
    });

    it('GET /atoms/intent/:intentIdentity - should return version history', async () => {
      // Get the original atom to find its intentIdentity
      const atomRes = await request(app.getHttpServer()).get(`/atoms/${atomUUID}`).expect(200);

      const intentIdentity = atomRes.body.intentIdentity;

      const response = await request(app.getHttpServer())
        .get(`/atoms/intent/${intentIdentity}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2); // Original + superseded version
      expect(response.body[0].intentVersion).toBe(1);
      expect(response.body[1].intentVersion).toBe(2);
    });

    it('GET /atoms/:id/versions - should return version history for an atom', async () => {
      const response = await request(app.getHttpServer())
        .get(`/atoms/${atomUUID}/versions`)
        .expect(200);

      expect(response.body.intentIdentity).toBeDefined();
      expect(response.body.versions).toBeDefined();
      expect(response.body.currentVersion).toBeDefined();
      expect(response.body.versions.length).toBe(2);
    });
  });
});
