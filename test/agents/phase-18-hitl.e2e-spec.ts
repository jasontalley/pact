/**
 * Phase 18 E2E Integration Tests - HITL Workflow
 *
 * Tests the complete Human-in-the-Loop workflow for agent-suggested atoms:
 * - Agent suggests atom → Pending review
 * - Human approves → Committed
 * - Human rejects → Abandoned
 * - CI policy enforcement
 */

import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { setupE2EApp, teardownE2EApp } from '../setup-e2e';

describe('Phase 18 HITL Workflow (E2E)', () => {
  let app: INestApplication;
  let testProjectId: string;
  let proposedAtomId: string;

  beforeAll(async () => {
    app = await setupE2EApp();

    // Create test project policy
    testProjectId = '550e8400-e29b-41d4-a716-446655440000'; // Test UUID
    // Note: Policy creation endpoint may not exist yet, skip for now
  });

  afterAll(async () => {
    // Cleanup: delete test atoms
    if (proposedAtomId) {
      await request(app.getHttpServer())
        .delete(`/atoms/${proposedAtomId}`)
        .catch(() => {
          // Atom may be committed or doesn't exist, ignore error
        });
    }

    await teardownE2EApp();
  });

  describe('Agent Suggests Atom', () => {
    it('should create a proposed atom via API', async () => {
      const response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'User can reset password securely via email',
          category: 'security',
          status: 'proposed',
          source: 'agent_inference',
          confidence: 0.85,
          rationale: 'Inferred from orphan test during reconciliation',
          proposedBy: 'reconciliation-agent',
          observableOutcomes: [
            {
              description: 'Email is sent within 5 seconds',
              measurementCriteria: undefined,
            },
            {
              description: 'Reset token expires after 1 hour',
              measurementCriteria: undefined,
            },
          ],
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('atomId');
      expect(response.body.status).toBe('proposed');
      expect(response.body.confidence).toBe(0.85);
      expect(response.body.proposedBy).toBe('reconciliation-agent');

      proposedAtomId = response.body.id;
    });

    it('should appear in pending review list', async () => {
      const response = await request(app.getHttpServer()).get('/atoms/pending-review').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const atom = response.body.find((a) => a.id === proposedAtomId);
      expect(atom).toBeDefined();
      expect(atom.status).toBe('proposed');
    });

    it('should return count of pending atoms', async () => {
      const response = await request(app.getHttpServer())
        .get('/atoms/pending-review/count')
        .expect(200);

      expect(response.body).toHaveProperty('count');
      expect(response.body.count).toBeGreaterThan(0);
    });
  });

  describe('CI Policy Enforcement', () => {
    it('should block CI when proposed atoms exist', async () => {
      const response = await request(app.getHttpServer())
        .get(`/agents/reconciliation/ci-policy/check?projectId=${testProjectId}`)
        .expect(200);

      expect(response.body.passed).toBe(false);
      expect(response.body.blocked).toBe(true);
      expect(response.body.proposedAtomsCount).toBeGreaterThan(0);
      expect(response.body.reason).toContain('CI blocked');
      expect(response.body.reviewUrl).toContain('/atoms/pending');
    });

    it('should return policy status', async () => {
      const response = await request(app.getHttpServer())
        .get(`/agents/reconciliation/ci-policy/status?projectId=${testProjectId}`)
        .expect(200);

      expect(response.body.ciBlockOnProposedAtoms).toBe(true);
      expect(response.body.currentProposedCount).toBeGreaterThan(0);
      expect(response.body.wouldBlock).toBe(true);
    });
  });

  describe('Human Approves Atom', () => {
    it('should approve proposed atom with optional edits', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/atoms/${proposedAtomId}/approve`)
        .send({
          approvedBy: 'test-user',
          description: 'User can securely reset password via email with time-limited token',
          category: 'security',
        })
        .expect(200);

      expect(response.body.status).toBe('committed');
      expect(response.body.approvedBy).toBe('test-user');
      expect(response.body.description).toContain('time-limited token');
      expect(response.body).toHaveProperty('committedAt');
    });

    it('should no longer appear in pending review', async () => {
      const response = await request(app.getHttpServer()).get('/atoms/pending-review').expect(200);

      const atom = response.body.find((a) => a.id === proposedAtomId);
      expect(atom).toBeUndefined();
    });

    it('should appear in committed atoms list', async () => {
      const response = await request(app.getHttpServer())
        .get('/atoms?status=committed')
        .expect(200);

      const atom = response.body.items.find((a) => a.id === proposedAtomId);
      expect(atom).toBeDefined();
      expect(atom.status).toBe('committed');
    });
  });

  describe('Human Rejects Atom', () => {
    let rejectedAtomId: string;

    it('should create another proposed atom for rejection test', async () => {
      const response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'Low-confidence atom for rejection test',
          category: 'functional',
          status: 'proposed',
          source: 'agent_inference',
          confidence: 0.65,
          rationale: 'Low confidence inference',
          proposedBy: 'test-agent',
        })
        .expect(201);

      rejectedAtomId = response.body.id;
    });

    it('should reject proposed atom with reason', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/atoms/${rejectedAtomId}/reject`)
        .send({
          rejectedBy: 'test-user',
          reason: 'Duplicate of IA-042',
        })
        .expect(200);

      expect(response.body.status).toBe('abandoned');
      expect(response.body.rejectedBy).toBe('test-user');
    });

    it('should not appear in pending review after rejection', async () => {
      const response = await request(app.getHttpServer()).get('/atoms/pending-review').expect(200);

      const atom = response.body.find((a) => a.id === rejectedAtomId);
      expect(atom).toBeUndefined();
    });

    it('should appear in abandoned atoms list', async () => {
      const response = await request(app.getHttpServer())
        .get('/atoms?status=abandoned')
        .expect(200);

      const atom = response.body.items.find((a) => a.id === rejectedAtomId);
      expect(atom).toBeDefined();
      expect(atom.status).toBe('abandoned');
    });

    // Cleanup rejected atom
    afterAll(async () => {
      if (rejectedAtomId) {
        await request(app.getHttpServer())
          .delete(`/atoms/${rejectedAtomId}`)
          .catch(() => {
            // Ignore error
          });
      }
    });
  });

  describe('CI Policy After All Atoms Reviewed', () => {
    it('should pass CI check when no proposed atoms remain', async () => {
      // Ensure all proposed atoms are reviewed
      const pendingResponse = await request(app.getHttpServer())
        .get('/atoms/pending-review')
        .expect(200);

      // Review any remaining proposed atoms
      for (const atom of pendingResponse.body) {
        await request(app.getHttpServer())
          .patch(`/atoms/${atom.id}/reject`)
          .send({
            rejectedBy: 'cleanup-user',
            reason: 'Cleanup for E2E test',
          })
          .catch(() => {
            // Ignore errors
          });
      }

      // Check CI policy
      const response = await request(app.getHttpServer())
        .get(`/agents/reconciliation/ci-policy/check?projectId=${testProjectId}`)
        .expect(200);

      expect(response.body.passed).toBe(true);
      expect(response.body.blocked).toBe(false);
      expect(response.body.proposedAtomsCount).toBe(0);
    });
  });

  describe('CI Policy Disabled', () => {
    it('should pass CI check when blocking is disabled', async () => {
      // Disable CI blocking
      await request(app.getHttpServer())
        .patch(`/reconciliation-policies/${testProjectId}`)
        .send({ ciBlockOnProposedAtoms: false })
        .catch(() => {
          // Policy endpoint may not exist, skip test
        });

      // Create a proposed atom
      const createResponse = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'Test atom with disabled policy',
          category: 'functional',
          status: 'proposed',
          source: 'test',
          confidence: 0.9,
          proposedBy: 'test',
        })
        .expect(201);

      const testAtomId = createResponse.body.id;

      // Check CI policy (should pass even with proposed atom)
      const response = await request(app.getHttpServer())
        .get(`/agents/reconciliation/ci-policy/check?projectId=${testProjectId}`)
        .expect(200);

      expect(response.body.passed).toBe(true);
      expect(response.body.blocked).toBe(false);

      // Cleanup
      await request(app.getHttpServer())
        .delete(`/atoms/${testAtomId}`)
        .catch(() => {
          // Ignore error
        });
    });
  });
});
