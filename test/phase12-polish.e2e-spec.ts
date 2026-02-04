/**
 * E2E tests for Phase 12: Polish
 *
 * Tests the REST API surface for:
 * 1. Reconciliation Scheduling (12.3) - CRUD for cron-based schedule
 * 2. Semantic Diffing (12.4) - Compare two atoms semantically
 * 3. Trend Charts (12.5) - Metrics snapshots and trend retrieval
 */
import * as request from 'supertest';
import { setupE2EApp, teardownE2EApp } from './setup-e2e';
import { INestApplication } from '@nestjs/common';

describe('Phase 12: Polish (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await setupE2EApp();
  }, 30000);

  afterAll(async () => {
    await teardownE2EApp();
  });

  // ========================================
  // 12.3 Reconciliation Scheduling
  // ========================================

  describe('Reconciliation Scheduling', () => {
    it('GET /agents/reconciliation/schedule - should return schedule (initially disabled)', async () => {
      const res = await request(app.getHttpServer())
        .get('/agents/reconciliation/schedule')
        .expect(200);

      expect(res.body).toHaveProperty('enabled');
      expect(res.body.enabled).toBe(false);
      expect(res.body).toHaveProperty('cron');
      expect(res.body).toHaveProperty('mode');
      expect(res.body).toHaveProperty('rootDirectory');
      expect(res.body).toHaveProperty('qualityThreshold');
      expect(res.body).toHaveProperty('excludePaths');
      expect(res.body).toHaveProperty('lastRunAt');
      expect(res.body).toHaveProperty('lastRunStatus');
      expect(res.body).toHaveProperty('nextRunAt');
      expect(res.body).toHaveProperty('runCount');
      expect(res.body.runCount).toBe(0);
    });

    it('POST /agents/reconciliation/schedule - should set a schedule with cron expression', async () => {
      const res = await request(app.getHttpServer())
        .post('/agents/reconciliation/schedule')
        .send({
          cron: '0 3 * * *', // Every day at 3am
          rootDirectory: '.',
          qualityThreshold: 75,
        })
        .expect(200);

      expect(res.body.enabled).toBe(true);
      expect(res.body.cron).toBe('0 3 * * *');
      expect(res.body.qualityThreshold).toBe(75);
      expect(res.body.mode).toBe('delta');
      expect(res.body.nextRunAt).toBeDefined();
    });

    it('GET /agents/reconciliation/schedule - should show enabled schedule after setting', async () => {
      const res = await request(app.getHttpServer())
        .get('/agents/reconciliation/schedule')
        .expect(200);

      expect(res.body.enabled).toBe(true);
      expect(res.body.cron).toBe('0 3 * * *');
      expect(res.body.qualityThreshold).toBe(75);
    });

    it('GET /agents/reconciliation/schedule/history - should return empty history initially', async () => {
      const res = await request(app.getHttpServer())
        .get('/agents/reconciliation/schedule/history')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    it('DELETE /agents/reconciliation/schedule - should disable the schedule', async () => {
      await request(app.getHttpServer()).delete('/agents/reconciliation/schedule').expect(204);
    });

    it('GET /agents/reconciliation/schedule - should show disabled after delete', async () => {
      const res = await request(app.getHttpServer())
        .get('/agents/reconciliation/schedule')
        .expect(200);

      expect(res.body.enabled).toBe(false);
    });
  });

  // ========================================
  // 12.4 Semantic Diffing
  // ========================================

  describe('Semantic Diffing', () => {
    let atomAId: string;
    let atomBId: string;

    beforeAll(async () => {
      // Create first test atom
      const atomARes = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'Phase 12 diff test: user can upload a profile photo',
          category: 'functional',
        })
        .expect(201);

      atomAId = atomARes.body.id;

      // Create second test atom with a different description
      const atomBRes = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'Phase 12 diff test: user can upload and crop a profile photo with preview',
          category: 'functional',
        })
        .expect(201);

      atomBId = atomBRes.body.id;
    });

    it('GET /atoms/:id/diff/:compareId - should return semantic diff', async () => {
      const res = await request(app.getHttpServer())
        .get(`/atoms/${atomAId}/diff/${atomBId}`)
        .expect(200);

      // Verify top-level diff structure
      expect(res.body).toHaveProperty('atomA');
      expect(res.body).toHaveProperty('atomB');
      expect(res.body).toHaveProperty('descriptionDiff');
      expect(res.body).toHaveProperty('outcomesDiff');
      expect(res.body).toHaveProperty('tagsDiff');
      expect(res.body).toHaveProperty('overallAssessment');

      // Verify atom summaries
      expect(res.body.atomA).toHaveProperty('id', atomAId);
      expect(res.body.atomA).toHaveProperty('description');
      expect(res.body.atomB).toHaveProperty('id', atomBId);
      expect(res.body.atomB).toHaveProperty('description');

      // Verify descriptionDiff structure
      expect(res.body.descriptionDiff).toHaveProperty('changeType');
      expect(res.body.descriptionDiff).toHaveProperty('summary');
      expect(['expanded', 'narrowed', 'reframed', 'unchanged']).toContain(
        res.body.descriptionDiff.changeType,
      );

      // Verify outcomesDiff structure
      expect(res.body.outcomesDiff).toHaveProperty('added');
      expect(res.body.outcomesDiff).toHaveProperty('removed');
      expect(res.body.outcomesDiff).toHaveProperty('modified');
      expect(res.body.outcomesDiff).toHaveProperty('unchanged');

      // Verify tagsDiff structure
      expect(res.body.tagsDiff).toHaveProperty('added');
      expect(res.body.tagsDiff).toHaveProperty('removed');

      // Verify overallAssessment is a string
      expect(typeof res.body.overallAssessment).toBe('string');
    });

    it('GET /atoms/:id/diff/:compareId - should return 404 for nonexistent atom', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer()).get(`/atoms/${atomAId}/diff/${fakeId}`).expect(404);
    });
  });

  // ========================================
  // 12.5 Trend Charts
  // ========================================

  describe('Trend Charts', () => {
    it('POST /metrics/snapshot - should record a snapshot', async () => {
      const res = await request(app.getHttpServer()).post('/metrics/snapshot').expect(200);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('snapshotDate');
      expect(res.body).toHaveProperty('epistemicMetrics');
      expect(res.body).toHaveProperty('couplingMetrics');
    });

    it('GET /metrics/trends?period=week - should return trend data', async () => {
      const res = await request(app.getHttpServer())
        .get('/metrics/trends')
        .query({ period: 'week' })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      // We recorded a snapshot above, so there should be at least one entry
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const entry = res.body[0];
      expect(entry).toHaveProperty('date');
      expect(entry).toHaveProperty('epistemicMetrics');
      expect(entry).toHaveProperty('couplingMetrics');
    });

    it('GET /metrics/trends?period=month - should return trend data', async () => {
      const res = await request(app.getHttpServer())
        .get('/metrics/trends')
        .query({ period: 'month' })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /metrics/trends - should default to month period', async () => {
      const res = await request(app.getHttpServer()).get('/metrics/trends').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      // Should return the same data as month period since that's the default
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });
});
