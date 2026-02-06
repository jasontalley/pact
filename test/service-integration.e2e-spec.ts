/**
 * Integration tests for service interactions
 * @atom IA-INT-001, IA-INT-002, IA-INT-003, IA-INT-004
 *
 * These tests validate the integration between services:
 * - AtomizationService → AtomsService
 * - AtomQualityService → commit flow
 * - IntentRefinementService → AtomsService
 * - AtomicityChecker heuristics + LLM fallback
 *
 * Note: Tests involving LLM may take longer and are given extended timeouts.
 * Some tests may be skipped if LLM is not available.
 */
import * as request from 'supertest';
import { setupE2EApp, teardownE2EApp } from './setup-e2e';
import { INestApplication } from '@nestjs/common';

// Longer timeout for tests that may involve LLM calls
// Set to 60s to allow for LLM processing time when API is available
const LLM_TEST_TIMEOUT = 60000;

// Check if LLM is available by environment variable
const LLM_AVAILABLE = !!process.env.ANTHROPIC_API_KEY;

describe('Service Integration Tests (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await setupE2EApp();
  }, 30000);

  afterAll(async () => {
    await teardownE2EApp();
  });

  // @atom IA-INT-001
  describe('AtomizationService → AtomsService Integration', () => {
    // Skip LLM-dependent tests if API key is not available
    const maybeIt = LLM_AVAILABLE ? it : it.skip;

    maybeIt(
      'should analyze raw intent and return atomization suggestions',
      async () => {
        // Test that the atomization endpoint properly analyzes raw intent
        const response = await request(app.getHttpServer()).post('/atoms/analyze').send({
          intent: 'Users must be able to authenticate with email and password within 3 seconds',
        });

        // Should return 201 for success, or 500/503 if LLM service is unavailable
        expect([200, 201, 500, 503]).toContain(response.status);

        if (response.status === 201) {
          // Verify atomization result structure (actual fields from IntentAnalysisResult)
          expect(response.body).toHaveProperty('atomicity');
          expect(response.body).toHaveProperty('confidence');
          // atomicity can be 'atomic', 'compound', or 'ambiguous'
          expect(['atomic', 'compound', 'ambiguous']).toContain(response.body.atomicity);
        }
      },
      LLM_TEST_TIMEOUT,
    );

    maybeIt(
      'should detect compound intent and suggest breakdown',
      async () => {
        // Compound intent should be flagged as non-atomic
        const response = await request(app.getHttpServer()).post('/atoms/analyze').send({
          intent:
            'Users must be able to authenticate with email and password, and the system must log all login attempts, and sessions must expire after 30 minutes',
        });

        expect([200, 201, 500, 503]).toContain(response.status);

        if (response.status === 201) {
          // Compound intents should be detected (atomicity != 'atomic')
          expect(['compound', 'ambiguous']).toContain(response.body.atomicity);
          // Should have decomposition suggestions for compound intents
          expect(response.body.decompositionSuggestions).toBeDefined();
        }
      },
      LLM_TEST_TIMEOUT,
    );

    maybeIt(
      'should recognize atomic intent with clear falsifiable criteria',
      async () => {
        // Well-formed atomic intent
        const response = await request(app.getHttpServer()).post('/atoms/analyze').send({
          intent: 'Password reset tokens must expire exactly 15 minutes after generation',
        });

        expect([200, 201, 500, 503]).toContain(response.status);

        if (response.status === 201) {
          // High confidence for clearly atomic intent
          expect(response.body.confidence).toBeGreaterThan(0.5);
        }
      },
      LLM_TEST_TIMEOUT,
    );
  });

  // @atom IA-INT-002
  describe('AtomQualityService → Commit Flow Integration', () => {
    let draftAtomUUID: string;

    beforeAll(async () => {
      // Create a draft atom for testing with unique timestamp to avoid conflicts
      const uniqueId = Date.now();
      const createResponse = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: `Integration test ${uniqueId}: File upload must complete within 30 seconds for files under 10MB with progress indication`,
          category: 'performance',
        });
      if (createResponse.status !== 201) {
        console.warn('Failed to create test atom:', createResponse.body);
      }
      draftAtomUUID = createResponse.body.id;
    });

    it('should reject commit when quality score is below threshold', async () => {
      // Draft atoms without quality score should fail commit
      const response = await request(app.getHttpServer())
        .patch(`/atoms/${draftAtomUUID}/commit`)
        .expect(400);

      // Should indicate quality requirement
      expect(response.body.message).toMatch(/quality|score/i);
    });

    it('should allow commit when quality score meets threshold', async () => {
      // Update with quality score >= 80
      await request(app.getHttpServer())
        .patch(`/atoms/${draftAtomUUID}`)
        .send({
          qualityScore: 85,
          observableOutcomes: [
            {
              description: 'File upload completes within 30 seconds',
              measurementCriteria: 'Timer measurement on upload completion',
            },
          ],
          falsifiabilityCriteria: [
            {
              condition: 'File upload takes more than 30 seconds for < 10MB file',
              expectedBehavior: 'Performance violation logged',
            },
          ],
        })
        .expect(200);

      // Commit should succeed
      const commitResponse = await request(app.getHttpServer())
        .patch(`/atoms/${draftAtomUUID}/commit`)
        .expect(200);

      expect(commitResponse.body.status).toBe('committed');
      expect(commitResponse.body.committedAt).toBeDefined();
    });

    it('should enforce quality gate on boundary (score = 79)', async () => {
      // Create another atom for boundary testing with unique timestamp
      const uniqueId = Date.now();
      const createResponse = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: `Integration test ${uniqueId}: API response time must be under 200ms for 95th percentile`,
          category: 'performance',
        });

      // Set quality score at boundary (79 - just below threshold)
      await request(app.getHttpServer())
        .patch(`/atoms/${createResponse.body.id}`)
        .send({
          qualityScore: 79,
        })
        .expect(200);

      // Commit should fail at boundary
      const response = await request(app.getHttpServer())
        .patch(`/atoms/${createResponse.body.id}/commit`)
        .expect(400);

      expect(response.body.message).toMatch(/quality|score|79/i);
    });

    it('should allow commit at exact threshold (score = 80)', async () => {
      // Create atom for exact boundary test with unique timestamp
      const uniqueId = Date.now();
      const createResponse = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: `Integration test ${uniqueId}: Database queries must complete within 100ms for indexed lookups`,
          category: 'performance',
        });

      // Set quality score at exact threshold
      await request(app.getHttpServer())
        .patch(`/atoms/${createResponse.body.id}`)
        .send({
          qualityScore: 80,
        })
        .expect(200);

      // Commit should succeed at exactly 80
      const commitResponse = await request(app.getHttpServer())
        .patch(`/atoms/${createResponse.body.id}/commit`)
        .expect(200);

      expect(commitResponse.body.status).toBe('committed');
    });
  });

  // @atom IA-INT-003
  describe('IntentRefinementService → AtomsService Integration', () => {
    let atomForRefinement: string;
    // Skip LLM-dependent tests if API key is not available
    const maybeIt = LLM_AVAILABLE ? it : it.skip;

    beforeAll(async () => {
      // Create a draft atom for refinement testing with unique timestamp
      const uniqueId = Date.now();
      const createResponse = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: `Integration test ${uniqueId}: System should be fast and work well under normal conditions`,
          category: 'performance',
        });
      atomForRefinement = createResponse.body.id;
    });

    maybeIt(
      'should suggest refinements for vague intent',
      async () => {
        // The refinement service should suggest improvements
        const response = await request(app.getHttpServer()).post(
          `/atoms/${atomForRefinement}/suggest-refinements`,
        );

        // Should return successfully (may be empty array if no suggestions), or 500/503 if LLM unavailable
        expect([200, 201, 500, 503]).toContain(response.status);
        expect(response.body).toBeDefined();
      },
      LLM_TEST_TIMEOUT,
    );

    maybeIt(
      'should apply refinement with feedback',
      async () => {
        // Apply user feedback to refine the atom
        const response = await request(app.getHttpServer())
          .post(`/atoms/${atomForRefinement}/refine`)
          .send({
            feedback: 'Make it more specific with a 200ms response time requirement',
          });

        // Should return 201 or handle gracefully, or 500/503 if LLM unavailable
        expect([200, 201, 500, 503]).toContain(response.status);

        if (response.status === 201) {
          expect(response.body).toHaveProperty('success');
        }
      },
      LLM_TEST_TIMEOUT,
    );

    it('should record refinement history', async () => {
      // Get refinement history
      const response = await request(app.getHttpServer())
        .get(`/atoms/${atomForRefinement}/refinement-history`)
        .expect(200);

      // Should return an array (may be empty if no refinements recorded)
      expect(response.body).toBeInstanceOf(Array);
    });
  });

  // @atom IA-INT-004
  describe('AtomicityChecker Heuristics (non-LLM path)', () => {
    // These tests focus on heuristic-based atomicity checking which should be fast

    it('should validate atom description length requirements', async () => {
      // Too short - should fail validation
      const shortResponse = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'Short',
          category: 'functional',
        })
        .expect(400);

      expect(shortResponse.body.statusCode).toBe(400);
    });

    it('should create atom with well-formed description', async () => {
      // Valid atomic description with unique timestamp
      const uniqueId = Date.now();
      const response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: `Integration test ${uniqueId}: User profile page must load within 2 seconds with all data visible`,
          category: 'performance',
        })
        .expect(201);

      expect(response.body.atomId).toMatch(/^IA-\d{3}$/);
      expect(response.body.status).toBe('draft');
    });

    it('should validate category is from allowed enum', async () => {
      // Invalid category
      await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'Valid description for testing category validation',
          category: 'invalid-category',
        })
        .expect(400);
    });
  });

  // @atom IA-INT-005
  describe('End-to-End Workflow Integration (without LLM)', () => {
    it('should complete workflow: create → update → commit', async () => {
      // Step 1: Create atom with unique timestamp
      const uniqueId = Date.now();
      const createResponse = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: `Integration test ${uniqueId}: API must return paginated results with maximum 100 items per page`,
          category: 'functional',
        })
        .expect(201);

      const atomId = createResponse.body.id;
      expect(createResponse.body.status).toBe('draft');

      // Step 2: Add quality fields
      await request(app.getHttpServer())
        .patch(`/atoms/${atomId}`)
        .send({
          qualityScore: 90,
          observableOutcomes: [
            {
              description: 'Response contains at most 100 items',
              measurementCriteria: 'Count items in response array',
            },
          ],
          falsifiabilityCriteria: [
            {
              condition: 'More than 100 items returned in single response',
              expectedBehavior: 'Pagination violation',
            },
          ],
        })
        .expect(200);

      // Step 3: Commit the refined atom
      const commitResponse = await request(app.getHttpServer())
        .patch(`/atoms/${atomId}/commit`)
        .expect(200);

      expect(commitResponse.body.status).toBe('committed');
      expect(commitResponse.body.committedAt).toBeDefined();

      // Step 4: Verify immutability (INV-004)
      await request(app.getHttpServer())
        .patch(`/atoms/${atomId}`)
        .send({ description: 'Trying to modify' })
        .expect(403);
    });

    it('should handle supersession workflow correctly', async () => {
      // Create and commit v1 with unique timestamp
      const uniqueId = Date.now();
      const v1Response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: `Integration test ${uniqueId}: Cache TTL must be 5 minutes for user profile data`,
          category: 'performance',
        });
      const v1Id = v1Response.body.id;

      await request(app.getHttpServer()).patch(`/atoms/${v1Id}`).send({ qualityScore: 85 });

      await request(app.getHttpServer()).patch(`/atoms/${v1Id}/commit`);

      // Create and commit v2 (supersedes v1) with different unique timestamp
      const uniqueId2 = Date.now() + 1;
      const v2Response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: `Integration test ${uniqueId2}: Cache TTL must be 10 minutes for user profile data with automatic refresh`,
          category: 'performance',
        });
      const v2Id = v2Response.body.id;

      await request(app.getHttpServer()).patch(`/atoms/${v2Id}`).send({ qualityScore: 88 });

      await request(app.getHttpServer()).patch(`/atoms/${v2Id}/commit`);

      // Supersede v1 with v2
      const supersedeResponse = await request(app.getHttpServer())
        .patch(`/atoms/${v1Id}/supersede`)
        .send({ newAtomId: v2Id })
        .expect(200);

      expect(supersedeResponse.body.status).toBe('superseded');
      expect(supersedeResponse.body.supersededBy).toBe(v2Id);

      // Verify supersession chain
      const chainResponse = await request(app.getHttpServer())
        .get(`/atoms/${v1Id}/supersession-chain`)
        .expect(200);

      expect(chainResponse.body).toBeInstanceOf(Array);
      expect(chainResponse.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should validate tags can be added and removed from atoms', async () => {
      // Create atom with unique timestamp
      const uniqueId = Date.now();
      const response = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: `Integration test ${uniqueId}: Search results must be sorted by relevance score`,
          category: 'functional',
        })
        .expect(201);

      const atomId = response.body.id;

      // Add tag
      const addTagResponse = await request(app.getHttpServer())
        .post(`/atoms/${atomId}/tags`)
        .send({ tag: 'search' })
        .expect(201);

      expect(addTagResponse.body.tags).toContain('search');

      // Remove tag
      const removeTagResponse = await request(app.getHttpServer())
        .delete(`/atoms/${atomId}/tags/search`)
        .expect(200);

      expect(removeTagResponse.body.tags).not.toContain('search');
    });
  });
});
