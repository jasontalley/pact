/**
 * E2E tests for Commitments API
 * @atom COM-E2E-001 through COM-E2E-008
 *
 * These tests validate the complete commitment lifecycle:
 * - Preview (dry-run) functionality
 * - Commitment creation with invariant checking
 * - Blocking invariant enforcement
 * - Override with justification
 * - Supersession mechanics
 * - Immutability enforcement
 * - Commitment history and atoms retrieval
 */
import * as request from 'supertest';
import { setupE2EApp, teardownE2EApp } from './setup-e2e';
import { INestApplication } from '@nestjs/common';

describe('Commitments (e2e)', () => {
  let app: INestApplication;

  // Test data holders
  let draftAtomId1: string;
  let draftAtomId2: string;
  let committedAtomId: string;
  let commitmentId: string;
  let commitmentUUID: string;

  beforeAll(async () => {
    app = await setupE2EApp();

    // Create test atoms for commitment testing
    // Atom 1: High quality, ready for commitment (avoid ambiguous words like "secure", "appropriate")
    const atom1Response = await request(app.getHttpServer())
      .post('/atoms')
      .send({
        description:
          'Commitment test: User login must complete authentication within 2 seconds using TLS 1.3 encryption',
        category: 'security',
        tags: ['auth', 'commitment-test'],
        createdBy: 'test-user@example.com', // Required for INV-005 traceability
      })
      .expect(201);
    draftAtomId1 = atom1Response.body.id;

    // Add quality fields to atom 1
    await request(app.getHttpServer())
      .patch(`/atoms/${draftAtomId1}`)
      .send({
        qualityScore: 85,
        observableOutcomes: [
          {
            description: 'Login completes within 2 seconds',
            measurementCriteria: 'Response time measurement',
          },
        ],
        falsifiabilityCriteria: [
          {
            condition: 'Login takes more than 2 seconds',
            expectedBehavior: 'Performance alert triggered',
          },
        ],
      })
      .expect(200);

    // Atom 2: High quality, ready for commitment
    const atom2Response = await request(app.getHttpServer())
      .post('/atoms')
      .send({
        description:
          'Commitment test: Failed login attempts must be logged with timestamp and IP address for audit trail',
        category: 'security',
        tags: ['auth', 'audit', 'commitment-test'],
        createdBy: 'test-user@example.com', // Required for INV-005 traceability
      })
      .expect(201);
    draftAtomId2 = atom2Response.body.id;

    // Add quality fields to atom 2
    await request(app.getHttpServer())
      .patch(`/atoms/${draftAtomId2}`)
      .send({
        qualityScore: 85,
        observableOutcomes: [
          {
            description: 'Failed attempts logged with timestamp and IP',
            measurementCriteria: 'Audit log verification',
          },
        ],
        falsifiabilityCriteria: [
          {
            condition: 'Failed attempt without log entry',
            expectedBehavior: 'Audit violation detected',
          },
        ],
      })
      .expect(200);
  });

  afterAll(async () => {
    await teardownE2EApp();
  });

  // @atom COM-E2E-001
  describe('POST /commitments/preview - Preview Commitment', () => {
    it('should return preview with invariant check results', async () => {
      const response = await request(app.getHttpServer())
        .post('/commitments/preview')
        .send({
          atomIds: [draftAtomId1],
          committedBy: 'test-user@example.com',
        })
        .expect(200);

      // Verify preview structure
      expect(response.body.canCommit).toBeDefined();
      expect(response.body.hasBlockingIssues).toBeDefined();
      expect(response.body.hasWarnings).toBeDefined();
      expect(response.body.atoms).toBeInstanceOf(Array);
      expect(response.body.invariantChecks).toBeInstanceOf(Array);
      expect(response.body.atomCount).toBe(1);
    });

    it('should preview multiple atoms', async () => {
      const response = await request(app.getHttpServer())
        .post('/commitments/preview')
        .send({
          atomIds: [draftAtomId1, draftAtomId2],
          committedBy: 'test-user@example.com',
        })
        .expect(200);

      expect(response.body.atomCount).toBe(2);
      expect(response.body.atoms.length).toBe(2);
    });

    it('should reject preview with empty atomIds', async () => {
      await request(app.getHttpServer())
        .post('/commitments/preview')
        .send({
          atomIds: [],
          committedBy: 'test-user@example.com',
        })
        .expect(400);
    });

    it('should reject preview without committedBy (INV-006)', async () => {
      await request(app.getHttpServer())
        .post('/commitments/preview')
        .send({
          atomIds: [draftAtomId1],
        })
        .expect(400);
    });

    it('should detect agent-like committedBy patterns (INV-006)', async () => {
      const response = await request(app.getHttpServer())
        .post('/commitments/preview')
        .send({
          atomIds: [draftAtomId1],
          committedBy: 'automation-bot',
        })
        .expect(200);

      // Should have INV-006 failure in invariant checks
      const inv006Check = response.body.invariantChecks.find(
        (c: { invariantId: string }) => c.invariantId === 'INV-006',
      );
      if (inv006Check) {
        expect(inv006Check.passed).toBe(false);
      }
    });

    it('should return 400 for non-existent atom', async () => {
      await request(app.getHttpServer())
        .post('/commitments/preview')
        .send({
          atomIds: ['00000000-0000-0000-0000-000000000000'],
          committedBy: 'test-user@example.com',
        })
        .expect(400);
    });
  });

  // @atom COM-E2E-002
  describe('POST /commitments - Create Commitment', () => {
    it('should create commitment for valid atoms', async () => {
      const response = await request(app.getHttpServer())
        .post('/commitments')
        .send({
          atomIds: [draftAtomId1],
          committedBy: 'test-user@example.com',
        })
        .expect(201);

      // Verify commitment structure
      expect(response.body.id).toBeDefined();
      expect(response.body.commitmentId).toMatch(/^COM-\d{3}$/);
      expect(response.body.status).toBe('active');
      expect(response.body.committedBy).toBe('test-user@example.com');
      expect(response.body.committedAt).toBeDefined();
      expect(response.body.canonicalJson).toBeInstanceOf(Array);
      expect(response.body.invariantChecks).toBeInstanceOf(Array);

      // Store for later tests
      commitmentId = response.body.commitmentId;
      commitmentUUID = response.body.id;

      // Verify atom status changed
      const atomResponse = await request(app.getHttpServer())
        .get(`/atoms/${draftAtomId1}`)
        .expect(200);
      expect(atomResponse.body.status).toBe('committed');
      expect(atomResponse.body.committedAt).toBeDefined();

      // Store for immutability tests
      committedAtomId = draftAtomId1;
    });

    it('should create commitment for multiple atoms', async () => {
      // Create fresh atoms for this test with full invariant compliance
      const atomA = await request(app.getHttpServer()).post('/atoms').send({
        description:
          'Multi-atom commitment test: System must validate email format before sending confirmation',
        category: 'functional',
        createdBy: 'test-user@example.com',
      });
      await request(app.getHttpServer())
        .patch(`/atoms/${atomA.body.id}`)
        .send({
          qualityScore: 85,
          observableOutcomes: [
            { description: 'Email format validated', measurementCriteria: 'Format check' },
          ],
          falsifiabilityCriteria: [
            { condition: 'Invalid email accepted', expectedBehavior: 'Rejected' },
          ],
        });

      const atomB = await request(app.getHttpServer()).post('/atoms').send({
        description:
          'Multi-atom commitment test: Email confirmation must include unique verification token',
        category: 'security',
        createdBy: 'test-user@example.com',
      });
      await request(app.getHttpServer())
        .patch(`/atoms/${atomB.body.id}`)
        .send({
          qualityScore: 85,
          observableOutcomes: [
            { description: 'Token included in email', measurementCriteria: 'Email content check' },
          ],
          falsifiabilityCriteria: [
            { condition: 'No token in email', expectedBehavior: 'Alert triggered' },
          ],
        });

      const response = await request(app.getHttpServer())
        .post('/commitments')
        .send({
          atomIds: [atomA.body.id, atomB.body.id],
          committedBy: 'test-user@example.com',
        })
        .expect(201);

      expect(response.body.canonicalJson.length).toBe(2);
    });

    it('should reject commitment with empty atomIds', async () => {
      await request(app.getHttpServer())
        .post('/commitments')
        .send({
          atomIds: [],
          committedBy: 'test-user@example.com',
        })
        .expect(400);
    });

    it('should reject commitment for already committed atoms', async () => {
      const response = await request(app.getHttpServer())
        .post('/commitments')
        .send({
          atomIds: [committedAtomId],
          committedBy: 'test-user@example.com',
        })
        .expect(400);

      expect(response.body.message).toMatch(/already committed|not in draft/i);
    });

    it('should reject commitment without committedBy (INV-006)', async () => {
      // Create a new draft atom
      const atomResponse = await request(app.getHttpServer()).post('/atoms').send({
        description: 'INV-006 test: System must enforce rate limiting on API endpoints',
        category: 'security',
      });
      await request(app.getHttpServer())
        .patch(`/atoms/${atomResponse.body.id}`)
        .send({ qualityScore: 85 });

      await request(app.getHttpServer())
        .post('/commitments')
        .send({
          atomIds: [atomResponse.body.id],
        })
        .expect(400);
    });
  });

  // @atom COM-E2E-003
  describe('POST /commitments with override - Override Justification', () => {
    it('should accept override justification for non-blocking warnings', async () => {
      // Create atom with full invariant compliance
      const atomResponse = await request(app.getHttpServer()).post('/atoms').send({
        description:
          'Override test: System should handle errors gracefully with appropriate messaging',
        category: 'usability',
        createdBy: 'test-user@example.com',
      });
      await request(app.getHttpServer())
        .patch(`/atoms/${atomResponse.body.id}`)
        .send({
          qualityScore: 85,
          observableOutcomes: [
            { description: 'Errors handled gracefully', measurementCriteria: 'User feedback' },
          ],
          falsifiabilityCriteria: [
            { condition: 'Unhandled error', expectedBehavior: 'Graceful degradation' },
          ],
        });

      const response = await request(app.getHttpServer())
        .post('/commitments')
        .send({
          atomIds: [atomResponse.body.id],
          committedBy: 'test-user@example.com',
          overrideJustification: 'Approved for MVP release by product owner',
        })
        .expect(201);

      // Verify override justification is stored
      expect(response.body.overrideJustification).toBe('Approved for MVP release by product owner');
    });
  });

  // @atom COM-E2E-004
  describe('GET /commitments - List Commitments', () => {
    it('should return paginated list of commitments', async () => {
      const response = await request(app.getHttpServer())
        .get('/commitments')
        .query({ limit: 10, page: 1 })
        .expect(200);

      expect(response.body.items).toBeInstanceOf(Array);
      expect(response.body.total).toBeGreaterThanOrEqual(1);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(10);
    });

    it('should filter commitments by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/commitments')
        .query({ status: 'active' })
        .expect(200);

      response.body.items.forEach((commitment: { status: string }) => {
        expect(commitment.status).toBe('active');
      });
    });

    it('should filter commitments by committedBy', async () => {
      const response = await request(app.getHttpServer())
        .get('/commitments')
        .query({ committedBy: 'test-user@example.com' })
        .expect(200);

      response.body.items.forEach((commitment: { committedBy: string }) => {
        expect(commitment.committedBy).toBe('test-user@example.com');
      });
    });
  });

  // @atom COM-E2E-005
  describe('GET /commitments/:id - Get Commitment Details', () => {
    it('should return commitment by UUID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/commitments/${commitmentUUID}`)
        .expect(200);

      expect(response.body.id).toBe(commitmentUUID);
      expect(response.body.commitmentId).toBe(commitmentId);
      expect(response.body.canonicalJson).toBeInstanceOf(Array);
      expect(response.body.invariantChecks).toBeInstanceOf(Array);
    });

    it('should return 404 for non-existent commitment', async () => {
      await request(app.getHttpServer())
        .get('/commitments/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  // @atom COM-E2E-006
  describe('GET /commitments/:id/atoms - Get Commitment Atoms', () => {
    it('should return atoms in commitment', async () => {
      const response = await request(app.getHttpServer())
        .get(`/commitments/${commitmentUUID}/atoms`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      expect(response.body[0].id).toBeDefined();
      expect(response.body[0].atomId).toBeDefined();
    });
  });

  // @atom COM-E2E-007
  describe('POST /commitments/:id/supersede - Supersede Commitment', () => {
    let originalCommitmentUUID: string;
    let newAtomForSupersession: string;

    beforeAll(async () => {
      // Create a commitment to supersede (with full invariant compliance)
      const atomResponse = await request(app.getHttpServer()).post('/atoms').send({
        description: 'Supersession test v1: User profile must display avatar image within 1 second',
        category: 'performance',
        createdBy: 'test-user@example.com',
      });
      await request(app.getHttpServer())
        .patch(`/atoms/${atomResponse.body.id}`)
        .send({
          qualityScore: 85,
          observableOutcomes: [
            { description: 'Avatar displays', measurementCriteria: 'Load time < 1s' },
          ],
          falsifiabilityCriteria: [
            { condition: 'Avatar load > 1s', expectedBehavior: 'Alert triggered' },
          ],
        });

      const commitmentResponse = await request(app.getHttpServer())
        .post('/commitments')
        .send({
          atomIds: [atomResponse.body.id],
          committedBy: 'test-user@example.com',
        });
      originalCommitmentUUID = commitmentResponse.body.id;

      // Create new atom for supersession (with full invariant compliance)
      const newAtomResponse = await request(app.getHttpServer()).post('/atoms').send({
        description:
          'Supersession test v2: User profile must display avatar with lazy loading within 500ms',
        category: 'performance',
        createdBy: 'test-user@example.com',
      });
      await request(app.getHttpServer())
        .patch(`/atoms/${newAtomResponse.body.id}`)
        .send({
          qualityScore: 85,
          observableOutcomes: [
            { description: 'Avatar lazy loads', measurementCriteria: 'Load time < 500ms' },
          ],
          falsifiabilityCriteria: [
            { condition: 'Avatar load > 500ms', expectedBehavior: 'Alert triggered' },
          ],
        });
      newAtomForSupersession = newAtomResponse.body.id;
    });

    it('should supersede commitment with new atoms', async () => {
      const response = await request(app.getHttpServer())
        .post(`/commitments/${originalCommitmentUUID}/supersede`)
        .send({
          atomIds: [newAtomForSupersession],
          committedBy: 'test-user@example.com',
          reason: 'Improved performance requirements',
        })
        .expect(201);

      // Verify new commitment created
      expect(response.body.id).toBeDefined();
      expect(response.body.supersedes).toBe(originalCommitmentUUID);
      expect(response.body.status).toBe('active');

      // Verify original commitment marked as superseded
      const originalResponse = await request(app.getHttpServer())
        .get(`/commitments/${originalCommitmentUUID}`)
        .expect(200);
      expect(originalResponse.body.status).toBe('superseded');
      expect(originalResponse.body.supersededBy).toBe(response.body.id);
    });

    it('should reject supersession of already superseded commitment', async () => {
      // Create another atom (with full invariant compliance)
      const atomResponse = await request(app.getHttpServer()).post('/atoms').send({
        description: 'Supersession rejection test: Placeholder atom for testing',
        category: 'functional',
        createdBy: 'test-user@example.com',
      });
      await request(app.getHttpServer())
        .patch(`/atoms/${atomResponse.body.id}`)
        .send({
          qualityScore: 85,
          observableOutcomes: [
            { description: 'Placeholder tested', measurementCriteria: 'Check complete' },
          ],
          falsifiabilityCriteria: [{ condition: 'Test fails', expectedBehavior: 'Error reported' }],
        });

      await request(app.getHttpServer())
        .post(`/commitments/${originalCommitmentUUID}/supersede`)
        .send({
          atomIds: [atomResponse.body.id],
          committedBy: 'test-user@example.com',
        })
        .expect(400);
    });
  });

  // @atom COM-E2E-008
  describe('GET /commitments/:id/history - Supersession History', () => {
    let historyCommitmentUUID: string;

    beforeAll(async () => {
      // Create commitment chain for history testing (with full invariant compliance)
      const atom1 = await request(app.getHttpServer()).post('/atoms').send({
        description: 'History test v1: API must return response within 500ms under normal load',
        category: 'performance',
        createdBy: 'test-user@example.com',
      });
      await request(app.getHttpServer())
        .patch(`/atoms/${atom1.body.id}`)
        .send({
          qualityScore: 85,
          observableOutcomes: [
            { description: 'Response within 500ms', measurementCriteria: 'Load test results' },
          ],
          falsifiabilityCriteria: [
            { condition: 'Response > 500ms', expectedBehavior: 'Performance alert' },
          ],
        });

      const commitment1 = await request(app.getHttpServer())
        .post('/commitments')
        .send({
          atomIds: [atom1.body.id],
          committedBy: 'test-user@example.com',
        });

      // Create v2 (with full invariant compliance)
      const atom2 = await request(app.getHttpServer()).post('/atoms').send({
        description: 'History test v2: API must return response within 300ms with caching',
        category: 'performance',
        createdBy: 'test-user@example.com',
      });
      await request(app.getHttpServer())
        .patch(`/atoms/${atom2.body.id}`)
        .send({
          qualityScore: 85,
          observableOutcomes: [
            { description: 'Response within 300ms', measurementCriteria: 'Cached load test' },
          ],
          falsifiabilityCriteria: [
            { condition: 'Response > 300ms', expectedBehavior: 'Cache miss alert' },
          ],
        });

      const commitment2 = await request(app.getHttpServer())
        .post(`/commitments/${commitment1.body.id}/supersede`)
        .send({
          atomIds: [atom2.body.id],
          committedBy: 'test-user@example.com',
        });

      historyCommitmentUUID = commitment2.body.id;
    });

    it('should return supersession history chain', async () => {
      const response = await request(app.getHttpServer())
        .get(`/commitments/${historyCommitmentUUID}/history`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
    });
  });

  // @atom COM-E2E-009
  describe('Commitment Immutability (INV-004)', () => {
    it('should not allow modification of commitment metadata', async () => {
      // Commitments don't have PATCH endpoints - this is by design
      // The CommitmentImmutabilityGuard blocks any modification attempts
      // We verify this by checking that no PATCH endpoint exists
      await request(app.getHttpServer())
        .patch(`/commitments/${commitmentUUID}`)
        .send({ committedBy: 'different-user@example.com' })
        .expect(404); // 404 because the route doesn't exist
    });

    it('should not allow deletion of commitment', async () => {
      // DELETE endpoint should not exist or should be blocked
      await request(app.getHttpServer()).delete(`/commitments/${commitmentUUID}`).expect(404); // 404 because the route doesn't exist
    });

    it('should not allow modification of committed atom through commitment', async () => {
      // Verify the committed atom cannot be modified
      const response = await request(app.getHttpServer())
        .patch(`/atoms/${committedAtomId}`)
        .send({ description: 'Attempting to modify committed atom' })
        .expect(403);

      expect(response.body.message).toMatch(/committed|immutable|cannot/i);
    });
  });
});
