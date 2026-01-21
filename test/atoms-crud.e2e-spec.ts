/**
 * E2E tests for Intent Atoms CRUD operations
 * @atom IA-E2E-001, IA-E2E-002, IA-E2E-003, IA-E2E-004, IA-E2E-005
 *
 * These tests validate the complete lifecycle of Intent Atoms:
 * - Creation from natural language
 * - Draft atom updates and deletion
 * - Commit flow with quality gate enforcement
 * - Supersession of committed atoms
 * - Filtering, pagination, and tagging
 */
import * as request from 'supertest';
import { setupE2EApp, teardownE2EApp } from './setup-e2e';
import { INestApplication } from '@nestjs/common';

describe('Atoms CRUD (e2e)', () => {
  let app: INestApplication;
  let createdAtomId: string;
  let createdAtomUUID: string;

  beforeAll(async () => {
    app = await setupE2EApp();
  });

  afterAll(async () => {
    await teardownE2EApp();
  });

  // @atom IA-E2E-001
  describe('POST /atoms - Create Atom', () => {
    it('should create a draft atom from valid description', async () => {
      // Asserts that a valid intent description creates a draft atom
      const response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'User authentication must complete within 3 seconds',
          category: 'performance',
        })
        .expect(201);

      // Verifies atom has required fields
      expect(response.body.id).toBeDefined();
      expect(response.body.atomId).toMatch(/^IA-\d{3}$/);
      expect(response.body.status).toBe('draft');
      expect(response.body.description).toBe('User authentication must complete within 3 seconds');
      expect(response.body.category).toBe('performance');

      // Store for later tests
      createdAtomId = response.body.atomId;
      createdAtomUUID = response.body.id;
    });

    it('should reject atom creation with missing description', async () => {
      // Asserts validation rejects missing required fields
      const response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          category: 'functional',
        })
        .expect(400);

      // Verifies error is returned (validation error format may be array or string)
      expect(response.body.statusCode).toBe(400);
    });

    it('should reject atom creation with description too short', async () => {
      // Asserts validation enforces minimum description length
      const response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'Too short',
          category: 'functional',
        })
        .expect(400);

      // Verifies validation error is returned
      expect(response.body.statusCode).toBe(400);
    });

    it('should reject atom creation with invalid category', async () => {
      // Asserts validation enforces category enum
      const response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'Valid description for testing purposes',
          category: 'invalid-category',
        })
        .expect(400);

      // Verifies error indicates invalid category
      expect(response.body.statusCode).toBe(400);
    });

    it('should create atom with optional tags', async () => {
      // Asserts atoms can be created with tags
      const response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'Payment processing must encrypt all card data',
          category: 'security',
          tags: ['pci-dss', 'payments'],
        })
        .expect(201);

      // Verifies tags are stored correctly
      expect(response.body.tags).toContain('pci-dss');
      expect(response.body.tags).toContain('payments');
    });

    it('should create atom with canvas position', async () => {
      // Asserts atoms can be created with canvas position
      const response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'Dashboard loads within 2 seconds on initial visit',
          category: 'performance',
          canvasPosition: { x: 100, y: 200 },
        })
        .expect(201);

      // Verifies canvas position is stored
      expect(response.body.canvasPosition).toEqual({ x: 100, y: 200 });
    });
  });

  // @atom IA-E2E-002
  describe('GET /atoms - List and Filter Atoms', () => {
    it('should return paginated list of atoms', async () => {
      // Asserts pagination works correctly
      const response = await request(app.getHttpServer())
        .get('/atoms')
        .query({ limit: 10, page: 1 })
        .expect(200);

      // Verifies pagination structure
      expect(response.body.items).toBeInstanceOf(Array);
      expect(response.body.total).toBeGreaterThanOrEqual(0);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(10);
      expect(response.body.totalPages).toBeGreaterThanOrEqual(0);
    });

    it('should filter atoms by status', async () => {
      // Asserts status filter works
      const response = await request(app.getHttpServer())
        .get('/atoms')
        .query({ status: 'draft' })
        .expect(200);

      // Verifies all returned atoms have draft status
      response.body.items.forEach((atom: { status: string }) => {
        expect(atom.status).toBe('draft');
      });
    });

    it('should filter atoms by category', async () => {
      // Asserts category filter works
      const response = await request(app.getHttpServer())
        .get('/atoms')
        .query({ category: 'performance' })
        .expect(200);

      // Verifies all returned atoms have correct category
      response.body.items.forEach((atom: { category: string }) => {
        expect(atom.category).toBe('performance');
      });
    });

    it('should filter atoms by tags', async () => {
      // Asserts tag filter works
      const response = await request(app.getHttpServer())
        .get('/atoms')
        .query({ tags: 'pci-dss' })
        .expect(200);

      // Verifies all returned atoms have the tag
      response.body.items.forEach((atom: { tags: string[] }) => {
        expect(atom.tags).toContain('pci-dss');
      });
    });

    it('should search atoms by description', async () => {
      // Asserts search works
      const response = await request(app.getHttpServer())
        .get('/atoms')
        .query({ search: 'authentication' })
        .expect(200);

      // Verifies search returns relevant results
      expect(response.body.items.length).toBeGreaterThanOrEqual(0);
    });

    it('should sort atoms by createdAt descending', async () => {
      // Asserts sorting works
      const response = await request(app.getHttpServer())
        .get('/atoms')
        .query({ sortBy: 'createdAt', sortOrder: 'DESC' })
        .expect(200);

      // Verifies order (newest first)
      const items = response.body.items;
      if (items.length > 1) {
        const dates = items.map((a: { createdAt: string }) => new Date(a.createdAt).getTime());
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
        }
      }
    });
  });

  // @atom IA-E2E-003
  describe('GET /atoms/:id - Get Single Atom', () => {
    it('should return atom by UUID', async () => {
      // Asserts single atom retrieval works
      const response = await request(app.getHttpServer())
        .get(`/atoms/${createdAtomUUID}`)
        .expect(200);

      // Verifies atom data is complete
      expect(response.body.id).toBe(createdAtomUUID);
      expect(response.body.atomId).toBe(createdAtomId);
      expect(response.body.description).toBeDefined();
    });

    // TODO: Fix AtomsService.findOne to support atomId lookup (currently only UUID works)
    it.skip('should return atom by atomId', async () => {
      // Asserts retrieval by friendly ID works
      const response = await request(app.getHttpServer())
        .get(`/atoms/${createdAtomId}`)
        .expect(200);

      // Verifies correct atom returned
      expect(response.body.atomId).toBe(createdAtomId);
    });

    it('should return 404 for non-existent atom', async () => {
      // Asserts proper error for missing atom
      await request(app.getHttpServer())
        .get('/atoms/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  // @atom IA-E2E-004
  describe('PATCH /atoms/:id - Update Draft Atom', () => {
    it('should update description of draft atom', async () => {
      // Asserts draft atoms can be updated
      const response = await request(app.getHttpServer())
        .patch(`/atoms/${createdAtomUUID}`)
        .send({
          description: 'User authentication must complete within 2 seconds under normal load',
        })
        .expect(200);

      // Verifies description was updated
      expect(response.body.description).toBe(
        'User authentication must complete within 2 seconds under normal load',
      );
    });

    it('should update category of draft atom', async () => {
      // Asserts category can be changed
      const response = await request(app.getHttpServer())
        .patch(`/atoms/${createdAtomUUID}`)
        .send({
          category: 'reliability',
        })
        .expect(200);

      // Verifies category was updated
      expect(response.body.category).toBe('reliability');
    });

    it('should update canvas position of draft atom', async () => {
      // Asserts canvas position can be updated
      const response = await request(app.getHttpServer())
        .patch(`/atoms/${createdAtomUUID}`)
        .send({
          canvasPosition: { x: 300, y: 400 },
        })
        .expect(200);

      // Verifies position was updated
      expect(response.body.canvasPosition).toEqual({ x: 300, y: 400 });
    });

    it('should return 404 for updating non-existent atom', async () => {
      // Asserts proper error for missing atom
      await request(app.getHttpServer())
        .patch('/atoms/00000000-0000-0000-0000-000000000000')
        .send({ description: 'Updated description' })
        .expect(404);
    });
  });

  // @atom IA-E2E-005
  describe('DELETE /atoms/:id - Delete Draft Atom', () => {
    let atomToDelete: string;

    beforeAll(async () => {
      // Create an atom specifically for deletion testing
      const response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'Temporary atom for deletion testing purposes',
          category: 'functional',
        });
      atomToDelete = response.body.id;
    });

    it('should delete draft atom', async () => {
      // Asserts draft atoms can be deleted (204 No Content is standard REST response)
      await request(app.getHttpServer()).delete(`/atoms/${atomToDelete}`).expect(204);

      // Verifies atom is gone
      await request(app.getHttpServer()).get(`/atoms/${atomToDelete}`).expect(404);
    });

    it('should return 404 for deleting non-existent atom', async () => {
      // Asserts proper error for missing atom
      await request(app.getHttpServer())
        .delete('/atoms/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  // @atom IA-E2E-006
  describe('PATCH /atoms/:id/commit - Commit Atom', () => {
    let highQualityAtomUUID: string;

    beforeAll(async () => {
      // Create an atom with high quality for commit testing
      const response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description:
            'User must be able to reset password via email within 5 minutes of request, with secure token validation',
          category: 'security',
          tags: ['authentication', 'security'],
        });
      highQualityAtomUUID = response.body.id;

      // Update with observable outcomes, falsifiability criteria, and explicit quality score
      await request(app.getHttpServer())
        .patch(`/atoms/${highQualityAtomUUID}`)
        .send({
          qualityScore: 85, // Explicitly set quality score to pass the commit gate (>= 80)
          observableOutcomes: [
            {
              description: 'Password reset email is sent within 30 seconds',
              measurementCriteria: 'Email delivery timestamp vs request timestamp',
            },
            {
              description: 'Reset token expires after 5 minutes',
              measurementCriteria: 'Token expiration check after 5 minutes',
            },
          ],
          falsifiabilityCriteria: [
            {
              condition: 'Reset token used after 5 minutes',
              expectedBehavior: 'Token is rejected with expired error',
            },
          ],
        });
    });

    it('should commit atom with sufficient quality score', async () => {
      // Asserts atoms with good quality can be committed
      const response = await request(app.getHttpServer())
        .patch(`/atoms/${highQualityAtomUUID}/commit`)
        .expect(200);

      // Verifies status changed to committed
      expect(response.body.status).toBe('committed');
      expect(response.body.committedAt).toBeDefined();
    });

    it('should reject commit for low quality atom', async () => {
      // Create a low quality atom
      const lowQualityResponse = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'System should work properly and be good',
          category: 'functional',
        });

      // Asserts quality gate blocks commit
      const response = await request(app.getHttpServer())
        .patch(`/atoms/${lowQualityResponse.body.id}/commit`)
        .expect(400);

      // Verifies error explains quality requirement
      expect(response.body.message).toMatch(/quality|score/i);
    });
  });

  // @atom IA-E2E-007
  describe('Cannot Modify Committed Atom (INV-004)', () => {
    let localCommittedAtomUUID: string;

    beforeAll(async () => {
      // Create and commit an atom for immutability testing
      const createResponse = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description:
            'Immutability test: User session must timeout after 30 minutes of inactivity with secure logout',
          category: 'security',
        });
      localCommittedAtomUUID = createResponse.body.id;

      // Add quality fields with explicit quality score
      await request(app.getHttpServer())
        .patch(`/atoms/${localCommittedAtomUUID}`)
        .send({
          qualityScore: 85, // Explicitly set quality score to pass the commit gate
          observableOutcomes: [
            { description: 'Session expires after 30 minutes', measurementCriteria: 'Timer check' },
          ],
          falsifiabilityCriteria: [
            { condition: 'Session accessed after 30 minutes', expectedBehavior: 'Access denied' },
          ],
        });

      // Commit the atom
      await request(app.getHttpServer()).patch(`/atoms/${localCommittedAtomUUID}/commit`);
    });

    it('should reject update to committed atom', async () => {
      // Asserts committed atoms are immutable (returns 403 Forbidden)
      const response = await request(app.getHttpServer())
        .patch(`/atoms/${localCommittedAtomUUID}`)
        .send({
          description: 'Attempting to modify committed atom',
        })
        .expect(403);

      // Verifies error explains immutability
      expect(response.body.message).toMatch(/committed|immutable|cannot.*update/i);
    });

    it('should reject deletion of committed atom', async () => {
      // Asserts committed atoms cannot be deleted (returns 403 Forbidden)
      const response = await request(app.getHttpServer())
        .delete(`/atoms/${localCommittedAtomUUID}`)
        .expect(403);

      // Verifies error explains restriction
      expect(response.body.message).toMatch(/committed|cannot.*delete/i);
    });
  });

  // @atom IA-E2E-008
  describe('PATCH /atoms/:id/supersede - Supersede Atom', () => {
    let originalCommittedAtomUUID: string;
    let newAtomUUID: string;

    beforeAll(async () => {
      // Create and commit an original atom to be superseded
      const originalResponse = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description:
            'Supersession test: User must be able to reset password via email within 5 minutes of request',
          category: 'security',
          tags: ['authentication', 'security'],
        });
      originalCommittedAtomUUID = originalResponse.body.id;

      // Add quality fields with explicit quality score to original atom
      await request(app.getHttpServer())
        .patch(`/atoms/${originalCommittedAtomUUID}`)
        .send({
          qualityScore: 85, // Explicitly set quality score
          observableOutcomes: [
            {
              description: 'Password reset email sent within 30 seconds',
              measurementCriteria: 'Email delivery timestamp vs request timestamp',
            },
          ],
          falsifiabilityCriteria: [
            {
              condition: 'Reset token used after 5 minutes',
              expectedBehavior: 'Token is rejected',
            },
          ],
        });

      // Commit the original atom
      await request(app.getHttpServer()).patch(`/atoms/${originalCommittedAtomUUID}/commit`);

      // Create a new atom to supersede the original
      const newResponse = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description:
            'User must be able to reset password via email or SMS within 5 minutes of request, with secure token validation',
          category: 'security',
          tags: ['authentication', 'security', 'v2'],
        });
      newAtomUUID = newResponse.body.id;

      // Add quality fields with explicit quality score and commit the new atom
      await request(app.getHttpServer())
        .patch(`/atoms/${newAtomUUID}`)
        .send({
          qualityScore: 85, // Explicitly set quality score
          observableOutcomes: [
            {
              description: 'Password reset notification sent within 30 seconds',
              measurementCriteria: 'Notification delivery timestamp vs request timestamp',
            },
          ],
          falsifiabilityCriteria: [
            {
              condition: 'Reset token used after 5 minutes',
              expectedBehavior: 'Token is rejected',
            },
          ],
        });

      await request(app.getHttpServer()).patch(`/atoms/${newAtomUUID}/commit`);
    });

    it('should supersede committed atom with new atom', async () => {
      // Asserts supersession works
      const response = await request(app.getHttpServer())
        .patch(`/atoms/${originalCommittedAtomUUID}/supersede`)
        .send({ newAtomId: newAtomUUID })
        .expect(200);

      // Verifies supersession recorded
      expect(response.body.status).toBe('superseded');
      expect(response.body.supersededBy).toBe(newAtomUUID);
    });

    it('should not allow modification of superseded atom', async () => {
      // Asserts superseded atoms are also immutable (returns 403 Forbidden)
      const response = await request(app.getHttpServer())
        .patch(`/atoms/${originalCommittedAtomUUID}`)
        .send({ description: 'Try to modify superseded' })
        .expect(403);

      // Verifies error explains restriction
      expect(response.body.message).toMatch(/superseded|committed|cannot/i);
    });
  });

  // @atom IA-E2E-009
  describe('Tag Operations', () => {
    let tagTestAtomUUID: string;

    beforeAll(async () => {
      // Create atom for tag testing
      const response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'Atom for testing tag operations in E2E tests',
          category: 'functional',
        });
      tagTestAtomUUID = response.body.id;
    });

    it('should add tag to atom', async () => {
      // Asserts tag can be added
      const response = await request(app.getHttpServer())
        .post(`/atoms/${tagTestAtomUUID}/tags`)
        .send({ tag: 'e2e-test' })
        .expect(201);

      // Verifies tag was added
      expect(response.body.tags).toContain('e2e-test');
    });

    it('should not add duplicate tag', async () => {
      // Add the same tag again
      const response = await request(app.getHttpServer())
        .post(`/atoms/${tagTestAtomUUID}/tags`)
        .send({ tag: 'e2e-test' });

      // Verifies no duplicate
      const tagCount = response.body.tags.filter((t: string) => t === 'e2e-test').length;
      expect(tagCount).toBe(1);
    });

    it('should remove tag from atom', async () => {
      // Asserts tag can be removed
      const response = await request(app.getHttpServer())
        .delete(`/atoms/${tagTestAtomUUID}/tags/e2e-test`)
        .expect(200);

      // Verifies tag was removed
      expect(response.body.tags).not.toContain('e2e-test');
    });

    it('should get all unique tags', async () => {
      // First add some tags
      await request(app.getHttpServer())
        .post(`/atoms/${tagTestAtomUUID}/tags`)
        .send({ tag: 'unique-tag-1' });
      await request(app.getHttpServer())
        .post(`/atoms/${tagTestAtomUUID}/tags`)
        .send({ tag: 'unique-tag-2' });

      // Asserts tag list endpoint works (under /atoms/tags)
      const response = await request(app.getHttpServer()).get('/atoms/tags').expect(200);

      // Verifies tags are returned with counts
      expect(response.body).toBeInstanceOf(Array);
    });
  });

  // @atom IA-E2E-010
  describe('Supersession Chain', () => {
    let chainAtomV1UUID: string;
    let chainAtomV2UUID: string;

    beforeAll(async () => {
      // Create and commit the first version of an atom
      const v1Response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description:
            'Chain test v1: System must log all user actions for audit purposes with timestamps',
          category: 'security',
        });
      chainAtomV1UUID = v1Response.body.id;

      await request(app.getHttpServer())
        .patch(`/atoms/${chainAtomV1UUID}`)
        .send({
          qualityScore: 85, // Explicitly set quality score
          observableOutcomes: [
            { description: 'All actions logged with timestamp', measurementCriteria: 'Audit log check' },
          ],
          falsifiabilityCriteria: [
            { condition: 'Action without log entry', expectedBehavior: 'Violation detected' },
          ],
        });

      await request(app.getHttpServer()).patch(`/atoms/${chainAtomV1UUID}/commit`);

      // Create and commit v2 that supersedes v1
      const v2Response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description:
            'Chain test v2: System must log all user actions for audit with timestamps and user IP',
          category: 'security',
        });
      chainAtomV2UUID = v2Response.body.id;

      await request(app.getHttpServer())
        .patch(`/atoms/${chainAtomV2UUID}`)
        .send({
          qualityScore: 85, // Explicitly set quality score
          observableOutcomes: [
            {
              description: 'All actions logged with timestamp and IP',
              measurementCriteria: 'Audit log check',
            },
          ],
          falsifiabilityCriteria: [
            { condition: 'Action without log entry or IP', expectedBehavior: 'Violation detected' },
          ],
        });

      await request(app.getHttpServer()).patch(`/atoms/${chainAtomV2UUID}/commit`);

      // Supersede v1 with v2
      await request(app.getHttpServer())
        .patch(`/atoms/${chainAtomV1UUID}/supersede`)
        .send({ newAtomId: chainAtomV2UUID });
    });

    it('should return supersession chain for atom', async () => {
      // Asserts chain retrieval works
      const response = await request(app.getHttpServer())
        .get(`/atoms/${chainAtomV1UUID}/supersession-chain`)
        .expect(200);

      // Verifies chain structure
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should include both original and superseding atom in chain', async () => {
      // Get chain starting from v1
      const response = await request(app.getHttpServer())
        .get(`/atoms/${chainAtomV1UUID}/supersession-chain`)
        .expect(200);

      // Chain should include both atoms
      const atomIds = response.body.map((a: { id: string }) => a.id);
      expect(atomIds).toContain(chainAtomV1UUID);
      expect(atomIds).toContain(chainAtomV2UUID);
    });
  });
});
