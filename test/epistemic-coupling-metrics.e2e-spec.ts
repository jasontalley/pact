/**
 * E2E tests for Epistemic and Coupling Metrics
 *
 * Tests metrics subsystems:
 * 1. Epistemic Metrics API
 * 2. Coupling + Epistemic integration
 * 3. Conflicts API integration - conflict metrics for nav badge
 */
import * as request from 'supertest';
import { setupE2EApp, teardownE2EApp } from './setup-e2e';
import { INestApplication } from '@nestjs/common';

describe('Epistemic and Coupling Metrics (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await setupE2EApp();
  }, 30000);

  afterAll(async () => {
    await teardownE2EApp();
  });

  // ========================
  // 9.1 Epistemic Metrics
  // ========================

  describe('Epistemic Metrics API', () => {
    it('GET /metrics/epistemic - should return epistemic metrics structure', async () => {
      const response = await request(app.getHttpServer()).get('/metrics/epistemic').expect(200);

      // Verify structure
      expect(response.body.proven).toBeDefined();
      expect(response.body.proven.count).toBeGreaterThanOrEqual(0);
      expect(response.body.proven.percentage).toBeGreaterThanOrEqual(0);
      expect(response.body.proven.percentage).toBeLessThanOrEqual(1);

      expect(response.body.committed).toBeDefined();
      expect(response.body.committed.count).toBeGreaterThanOrEqual(0);

      expect(response.body.inferred).toBeDefined();
      expect(response.body.inferred.count).toBeGreaterThanOrEqual(0);

      expect(response.body.unknown).toBeDefined();
      expect(response.body.unknown.orphanTestsCount).toBeGreaterThanOrEqual(0);
      expect(response.body.unknown.uncoveredCodeFilesCount).toBeGreaterThanOrEqual(0);

      expect(response.body.totalCertainty).toBeGreaterThanOrEqual(0);
      expect(response.body.totalCertainty).toBeLessThanOrEqual(1);

      expect(response.body.timestamp).toBeDefined();
    });

    it('should reflect committed atoms in epistemic metrics', async () => {
      // Create and commit an atom
      const createRes = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'Epistemic test atom - committed only',
          category: 'functional',
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/atoms/${createRes.body.id}`)
        .send({ qualityScore: 90 })
        .expect(200);

      await request(app.getHttpServer()).patch(`/atoms/${createRes.body.id}/commit`).expect(200);

      // Get epistemic metrics
      const response = await request(app.getHttpServer()).get('/metrics/epistemic').expect(200);

      // This committed atom should appear in the committed count
      // (it won't be in proven because there's no accepted test linkage)
      expect(response.body.committed.count).toBeGreaterThanOrEqual(1);
    });
  });

  // ========================
  // 9.2 Coupling Metrics (existing, verify still works)
  // ========================

  describe('Coupling Metrics API', () => {
    it('GET /metrics/coupling - should return all coupling metrics', async () => {
      const response = await request(app.getHttpServer()).get('/metrics/coupling').expect(200);

      expect(response.body.atomTestCoupling).toBeDefined();
      expect(response.body.atomTestCoupling.totalAtoms).toBeGreaterThanOrEqual(0);
      expect(response.body.atomTestCoupling.rate).toBeGreaterThanOrEqual(0);
      expect(response.body.atomTestCoupling.rate).toBeLessThanOrEqual(1);

      expect(response.body.testAtomCoupling).toBeDefined();
      expect(response.body.codeAtomCoverage).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
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
  // 9.3 Conflict Metrics (for nav badge)
  // ========================

  describe('Conflict Metrics for Badge', () => {
    it('GET /conflicts/metrics - should return metrics for nav badge', async () => {
      const response = await request(app.getHttpServer()).get('/conflicts/metrics').expect(200);

      expect(response.body.total).toBeGreaterThanOrEqual(0);
      expect(response.body.open).toBeGreaterThanOrEqual(0);
      expect(response.body.resolved).toBeGreaterThanOrEqual(0);
      expect(response.body.escalated).toBeGreaterThanOrEqual(0);
      expect(response.body.byType).toBeDefined();
    });

    it('should update conflict metrics when conflicts are created and resolved', async () => {
      // Create two atoms for conflict
      const atomA = await request(app.getHttpServer())
        .post('/atoms')
        .send({ description: 'Conflict visibility atom A', category: 'functional' })
        .expect(201);

      const atomB = await request(app.getHttpServer())
        .post('/atoms')
        .send({ description: 'Conflict visibility atom B', category: 'functional' })
        .expect(201);

      // Get baseline metrics
      const baseline = await request(app.getHttpServer()).get('/conflicts/metrics').expect(200);

      // Create a conflict
      const conflict = await request(app.getHttpServer())
        .post('/conflicts')
        .send({
          conflictType: 'semantic_overlap',
          atomIdA: atomA.body.id,
          atomIdB: atomB.body.id,
          similarityScore: 90,
          description: 'Visibility test overlap',
        })
        .expect(201);

      // Verify metrics increased
      const afterCreate = await request(app.getHttpServer()).get('/conflicts/metrics').expect(200);

      expect(afterCreate.body.total).toBe(baseline.body.total + 1);
      expect(afterCreate.body.open).toBe(baseline.body.open + 1);

      // Resolve the conflict
      await request(app.getHttpServer())
        .patch(`/conflicts/${conflict.body.id}/resolve`)
        .send({
          action: 'supersede_a',
          resolvedBy: 'test-user',
          reason: 'Test resolution',
        })
        .expect(200);

      // Verify metrics updated
      const afterResolve = await request(app.getHttpServer()).get('/conflicts/metrics').expect(200);

      expect(afterResolve.body.open).toBe(baseline.body.open);
      expect(afterResolve.body.resolved).toBe(baseline.body.resolved + 1);
    });
  });

  // ========================
  // Epistemic + Coupling integration
  // ========================

  describe('Metrics Integration', () => {
    it('epistemic and coupling metrics should be consistent', async () => {
      const [epistemic, coupling] = await Promise.all([
        request(app.getHttpServer()).get('/metrics/epistemic').expect(200),
        request(app.getHttpServer()).get('/metrics/coupling').expect(200),
      ]);

      // The committed count in epistemic should relate to the coupling total
      // (proven + committed in epistemic = total committed atoms in coupling)
      const epistemicCommittedTotal = epistemic.body.proven.count + epistemic.body.committed.count;
      const couplingTotalAtoms = coupling.body.atomTestCoupling.totalAtoms;

      // Both should measure committed atoms
      expect(epistemicCommittedTotal).toBe(couplingTotalAtoms);
    });
  });
});
