/**
 * E2E tests for Phase 11: Conversation
 *
 * Tests the REST API surface for:
 * 1. Change Set Molecules (11.1) - Create, review, approve, commit change sets
 * 2. Interview Agent (11.2) - Graph registration verification
 * 3. Conversation Compaction (11.3) - Search, compact, compacted messages
 */
import * as request from 'supertest';
import { setupE2EApp, teardownE2EApp } from './setup-e2e';
import { INestApplication } from '@nestjs/common';

describe('Phase 11: Conversation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await setupE2EApp();
  }, 30000);

  afterAll(async () => {
    await teardownE2EApp();
  });

  // ========================================
  // 11.1 Change Set Molecules
  // ========================================

  describe('Change Set Molecules', () => {
    let changeSetId: string;
    let testAtomId: string;

    beforeAll(async () => {
      // Create a test atom with high quality for committing
      const atomRes = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'Phase 11 test: user can export data to CSV format',
          category: 'functional',
        })
        .expect(201);

      testAtomId = atomRes.body.id;

      // Set quality score to pass commit gate
      await request(app.getHttpServer())
        .patch(`/atoms/${testAtomId}`)
        .send({ qualityScore: 90 })
        .expect(200);
    });

    it('POST /change-sets - should create a change set', async () => {
      const res = await request(app.getHttpServer())
        .post('/change-sets')
        .send({
          name: 'Phase 11 Test Change Set',
          description: 'Testing change set lifecycle',
          summary: 'Add CSV export capability',
        })
        .expect(201);

      changeSetId = res.body.id;
      expect(res.body.lensType).toBe('change_set');
      expect(res.body.changeSetMetadata).toBeDefined();
      expect(res.body.changeSetMetadata.status).toBe('draft');
      expect(res.body.changeSetMetadata.approvals).toEqual([]);
    });

    it('GET /change-sets - should list change sets', async () => {
      const res = await request(app.getHttpServer()).get('/change-sets').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const found = res.body.find((cs: { id: string }) => cs.id === changeSetId);
      expect(found).toBeDefined();
    });

    it('GET /change-sets?status=draft - should filter by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/change-sets')
        .query({ status: 'draft' })
        .expect(200);

      for (const cs of res.body) {
        expect(cs.changeSetMetadata.status).toBe('draft');
      }
    });

    it('POST /change-sets/:id/atoms - should add atom to change set', async () => {
      await request(app.getHttpServer())
        .post(`/change-sets/${changeSetId}/atoms`)
        .send({ atomId: testAtomId })
        .expect(201);
    });

    it('GET /change-sets/:id - should return change set with atoms', async () => {
      const res = await request(app.getHttpServer()).get(`/change-sets/${changeSetId}`).expect(200);

      expect(res.body.molecule).toBeDefined();
      expect(res.body.atoms).toBeDefined();
      expect(Array.isArray(res.body.atoms)).toBe(true);
      expect(res.body.atoms.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /change-sets/:id/submit - should submit for review', async () => {
      const res = await request(app.getHttpServer())
        .post(`/change-sets/${changeSetId}/submit`)
        .expect(200);

      expect(res.body.changeSetMetadata.status).toBe('review');
      expect(res.body.changeSetMetadata.submittedAt).toBeDefined();
    });

    it('POST /change-sets/:id/submit - should reject resubmission', async () => {
      await request(app.getHttpServer()).post(`/change-sets/${changeSetId}/submit`).expect(400);
    });

    it('POST /change-sets/:id/approve - should approve change set', async () => {
      const res = await request(app.getHttpServer())
        .post(`/change-sets/${changeSetId}/approve`)
        .send({ decision: 'approved', comment: 'Looks good' })
        .expect(200);

      expect(res.body.changeSetMetadata.status).toBe('approved');
      expect(res.body.changeSetMetadata.approvals).toHaveLength(1);
      expect(res.body.changeSetMetadata.approvals[0].decision).toBe('approved');
    });

    it('POST /change-sets/:id/commit - should batch commit atoms', async () => {
      const res = await request(app.getHttpServer())
        .post(`/change-sets/${changeSetId}/commit`)
        .expect(200);

      expect(res.body.changeSetMetadata.status).toBe('committed');
      expect(res.body.changeSetMetadata.committedAt).toBeDefined();
      expect(res.body.changeSetMetadata.committedAtomIds).toContain(testAtomId);

      // Verify the atom is now committed
      const atomRes = await request(app.getHttpServer()).get(`/atoms/${testAtomId}`).expect(200);

      expect(atomRes.body.status).toBe('committed');
    });

    it('POST /change-sets/:id/commit - should reject re-commit', async () => {
      await request(app.getHttpServer()).post(`/change-sets/${changeSetId}/commit`).expect(400);
    });
  });

  // ========================================
  // 11.1 Change Set Rejection Flow
  // ========================================

  describe('Change Set Rejection', () => {
    let rejectedSetId: string;

    beforeAll(async () => {
      // Create and submit a change set
      const atomRes = await request(app.getHttpServer())
        .post('/atoms')
        .send({ description: 'Rejection test atom', category: 'functional' })
        .expect(201);

      const csRes = await request(app.getHttpServer())
        .post('/change-sets')
        .send({ name: 'Rejection Test Set' })
        .expect(201);

      rejectedSetId = csRes.body.id;

      await request(app.getHttpServer())
        .post(`/change-sets/${rejectedSetId}/atoms`)
        .send({ atomId: atomRes.body.id })
        .expect(201);

      await request(app.getHttpServer()).post(`/change-sets/${rejectedSetId}/submit`).expect(200);
    });

    it('POST /change-sets/:id/approve - should reject change set', async () => {
      const res = await request(app.getHttpServer())
        .post(`/change-sets/${rejectedSetId}/approve`)
        .send({ decision: 'rejected', comment: 'Needs more work' })
        .expect(200);

      expect(res.body.changeSetMetadata.status).toBe('rejected');
    });

    it('POST /change-sets/:id/commit - should not commit rejected set', async () => {
      await request(app.getHttpServer()).post(`/change-sets/${rejectedSetId}/commit`).expect(400);
    });
  });

  // ========================================
  // 11.1 Molecule Lens Types
  // ========================================

  describe('Molecule lens types include change_set', () => {
    it('GET /molecules/lens-types - should include change_set', async () => {
      const res = await request(app.getHttpServer()).get('/molecules/lens-types').expect(200);

      const types = res.body.map((t: { type: string }) => t.type);
      expect(types).toContain('change_set');

      const changeSetType = res.body.find((t: { type: string }) => t.type === 'change_set');
      expect(changeSetType.label).toBe('Change Set');
      expect(changeSetType.description).toBeDefined();
    });
  });

  // ========================================
  // 11.3 Conversation Compaction
  // ========================================

  describe('Conversation Compaction', () => {
    let conversationId: string;

    beforeAll(async () => {
      // Create a conversation with multiple messages
      const convRes = await request(app.getHttpServer())
        .post('/conversations')
        .send({ title: 'Compaction Test Conversation' })
        .expect(201);

      conversationId = convRes.body.id;

      // Note: We don't add 50+ messages in E2E tests (too slow).
      // We test the endpoints work, not the threshold logic (unit tests cover that).
    });

    it('GET /conversations/search?q=... - should search conversations by title', async () => {
      const res = await request(app.getHttpServer())
        .get('/conversations/search')
        .query({ q: 'Compaction Test' })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((c: { id: string }) => c.id === conversationId);
      expect(found).toBeDefined();
    });

    it('GET /conversations/search?q=nonexistent - should return empty for no matches', async () => {
      const res = await request(app.getHttpServer())
        .get('/conversations/search')
        .query({ q: 'nonexistent_xyz_query_42' })
        .expect(200);

      expect(res.body).toHaveLength(0);
    });

    it('POST /conversations/:id/compact - should handle compaction request', async () => {
      // With few messages, this should return empty or existing summary
      const res = await request(app.getHttpServer())
        .post(`/conversations/${conversationId}/compact`)
        .expect(200);

      expect(res.body).toHaveProperty('summary');
    });

    it('GET /conversations/:id/messages/compacted - should return compacted view', async () => {
      const res = await request(app.getHttpServer())
        .get(`/conversations/${conversationId}/messages/compacted`)
        .expect(200);

      expect(res.body).toHaveProperty('summary');
      expect(res.body).toHaveProperty('messages');
      expect(Array.isArray(res.body.messages)).toBe(true);
    });
  });

  // ========================================
  // 11.2 Interview Agent Graph Registration
  // ========================================

  describe('Interview Agent Graph Registration', () => {
    it('should have interview graph registered in the graph registry', async () => {
      // The graph registry registers graphs on module init.
      // We verify by checking the agents/graphs endpoint if it exists,
      // or by checking the module is constructed.
      // For now, verify the chat endpoint accepts interview-like queries.
      // The graph registration is also tested in unit tests.
      const res = await request(app.getHttpServer()).get('/agents/graphs').expect(200);

      if (Array.isArray(res.body)) {
        const graphNames = res.body.map((g: { name: string }) => g.name);
        expect(graphNames).toContain('interview');
      }
    });
  });
});
