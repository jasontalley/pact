/**
 * E2E tests for MCP Tools and External Access
 *
 * Tests the REST API surface that the MCP tool handlers depend on.
 * The MCP server is a stdio proxy that translates MCP tool calls into
 * HTTP requests to the Pact REST API. These tests verify:
 *
 * 1. API endpoints return data in the shape MCP tools expect
 * 2. Search and filter patterns used by MCP tools work correctly
 * 3. Epistemic + coupling + conflicts API integration
 * 4. MCP tool registry and handler wiring (unit-level, no API mocks)
 */
import * as request from 'supertest';
import { setupE2EApp, teardownE2EApp } from './setup-e2e';
import { INestApplication } from '@nestjs/common';

describe('MCP Tools and External Access (e2e)', () => {
  let app: INestApplication;
  let testAtomId: string;
  let testAtomHumanId: string;

  beforeAll(async () => {
    app = await setupE2EApp();

    // Create a test atom for MCP tool exercises
    const res = await request(app.getHttpServer())
      .post('/atoms')
      .send({
        description: 'MCP test: user can authenticate with SSO',
        category: 'functional',
      })
      .expect(201);

    testAtomId = res.body.id;
    testAtomHumanId = res.body.atomId;
  }, 30000);

  afterAll(async () => {
    await teardownE2EApp();
  });

  // ========================================
  // 10.2 read_atom tool - API surface
  // ========================================

  describe('read_atom API surface', () => {
    it('GET /atoms/:id - UUID lookup returns full atom shape', async () => {
      const res = await request(app.getHttpServer()).get(`/atoms/${testAtomId}`).expect(200);

      // Verify the shape MCP read_atom tool expects
      expect(res.body.id).toBe(testAtomId);
      expect(res.body.atomId).toBeDefined();
      expect(res.body.description).toContain('authenticate');
      expect(res.body.category).toBe('functional');
      expect(res.body.status).toBeDefined();
      expect(res.body.qualityScore).toBeDefined();
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.tags).toBeDefined();
    });

    it('GET /atoms - search by description text (used by read_atom fallback)', async () => {
      // The MCP read_atom tool falls back to listAtoms({ search: query, limit: 1 })
      // The search param matches on description text, not atomId
      const res = await request(app.getHttpServer())
        .get('/atoms')
        .query({ search: 'authenticate with SSO', limit: 1 })
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);

      const found = res.body.items.find((a: { id: string }) => a.id === testAtomId);
      expect(found).toBeDefined();
    });

    it('GET /atoms/:id - returns 404 for nonexistent UUID', async () => {
      await request(app.getHttpServer())
        .get('/atoms/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  // ========================================
  // 10.2 list_atoms tool - API surface
  // ========================================

  describe('list_atoms API surface', () => {
    it('GET /atoms - returns paginated list with expected shape', async () => {
      const res = await request(app.getHttpServer()).get('/atoms').expect(200);

      expect(res.body.items).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.total).toBeDefined();
      expect(typeof res.body.total).toBe('number');

      if (res.body.items.length > 0) {
        const atom = res.body.items[0];
        expect(atom.id).toBeDefined();
        expect(atom.atomId).toBeDefined();
        expect(atom.description).toBeDefined();
        expect(atom.category).toBeDefined();
        expect(atom.status).toBeDefined();
      }
    });

    it('GET /atoms?status=draft - filters by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/atoms')
        .query({ status: 'draft' })
        .expect(200);

      for (const atom of res.body.items) {
        expect(atom.status).toBe('draft');
      }
    });

    it('GET /atoms?category=functional - filters by category', async () => {
      const res = await request(app.getHttpServer())
        .get('/atoms')
        .query({ category: 'functional' })
        .expect(200);

      for (const atom of res.body.items) {
        expect(atom.category).toBe('functional');
      }
    });

    it('GET /atoms?limit=2 - respects limit parameter', async () => {
      const res = await request(app.getHttpServer()).get('/atoms').query({ limit: 2 }).expect(200);

      expect(res.body.items.length).toBeLessThanOrEqual(2);
    });
  });

  // ========================================
  // 10.2 search_atoms tool - API surface
  // ========================================

  describe('search_atoms API surface', () => {
    it('GET /atoms?search=authenticate - text search works', async () => {
      const res = await request(app.getHttpServer())
        .get('/atoms')
        .query({ search: 'authenticate' })
        .expect(200);

      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      const found = res.body.items.some((a: { description: string }) =>
        a.description.toLowerCase().includes('authenticate'),
      );
      expect(found).toBe(true);
    });

    it('GET /atoms?search=nonexistent_xyz - returns empty for no matches', async () => {
      const res = await request(app.getHttpServer())
        .get('/atoms')
        .query({ search: 'nonexistent_xyz_query_42' })
        .expect(200);

      expect(res.body.items).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });
  });

  // ========================================
  // 10.3 get_coupling_status tool - API surface
  // ========================================

  describe('get_coupling_status API surface', () => {
    it('GET /metrics/coupling - returns shape expected by MCP tool', async () => {
      const res = await request(app.getHttpServer()).get('/metrics/coupling').expect(200);

      // The MCP tool reads these exact fields
      expect(res.body.atomTestCoupling).toBeDefined();
      expect(res.body.atomTestCoupling.rate).toBeDefined();
      expect(res.body.atomTestCoupling.atomsWithTests).toBeDefined();
      expect(res.body.atomTestCoupling.totalAtoms).toBeDefined();
      expect(res.body.atomTestCoupling.orphanAtoms).toBeDefined();
      expect(Array.isArray(res.body.atomTestCoupling.orphanAtoms)).toBe(true);

      expect(res.body.testAtomCoupling).toBeDefined();
      expect(res.body.testAtomCoupling.rate).toBeDefined();
      expect(res.body.testAtomCoupling.testsWithAtoms).toBeDefined();
      expect(res.body.testAtomCoupling.totalTests).toBeDefined();
      expect(res.body.testAtomCoupling.orphanTests).toBeDefined();

      expect(res.body.codeAtomCoverage).toBeDefined();
      expect(res.body.codeAtomCoverage.rate).toBeDefined();
      expect(res.body.codeAtomCoverage.filesWithAtoms).toBeDefined();
      expect(res.body.codeAtomCoverage.totalSourceFiles).toBeDefined();
      expect(res.body.codeAtomCoverage.uncoveredFiles).toBeDefined();

      expect(res.body.timestamp).toBeDefined();
    });
  });

  // ========================================
  // 10.3 get_epistemic_status tool - API surface
  // ========================================

  describe('get_epistemic_status API surface', () => {
    it('GET /metrics/epistemic - returns shape expected by MCP tool', async () => {
      const res = await request(app.getHttpServer()).get('/metrics/epistemic').expect(200);

      // The MCP tool reads these exact fields
      expect(res.body.proven).toBeDefined();
      expect(typeof res.body.proven.count).toBe('number');
      expect(typeof res.body.proven.percentage).toBe('number');

      expect(res.body.committed).toBeDefined();
      expect(typeof res.body.committed.count).toBe('number');
      expect(typeof res.body.committed.percentage).toBe('number');

      expect(res.body.inferred).toBeDefined();
      expect(typeof res.body.inferred.count).toBe('number');
      expect(typeof res.body.inferred.percentage).toBe('number');

      expect(res.body.unknown).toBeDefined();
      expect(typeof res.body.unknown.orphanTestsCount).toBe('number');
      expect(typeof res.body.unknown.uncoveredCodeFilesCount).toBe('number');

      expect(typeof res.body.totalCertainty).toBe('number');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  // ========================================
  // 10.3 get_conflicts tool - API surface
  // ========================================

  describe('get_conflicts API surface', () => {
    let conflictAtomA: string;
    let conflictAtomB: string;

    beforeAll(async () => {
      // Create atoms for conflict testing
      const resA = await request(app.getHttpServer())
        .post('/atoms')
        .send({ description: 'MCP conflict atom alpha', category: 'functional' })
        .expect(201);
      conflictAtomA = resA.body.id;

      const resB = await request(app.getHttpServer())
        .post('/atoms')
        .send({ description: 'MCP conflict atom beta', category: 'functional' })
        .expect(201);
      conflictAtomB = resB.body.id;

      // Create a conflict
      await request(app.getHttpServer())
        .post('/conflicts')
        .send({
          conflictType: 'semantic_overlap',
          atomIdA: conflictAtomA,
          atomIdB: conflictAtomB,
          similarityScore: 85,
          description: 'MCP test: overlapping intent descriptions',
        })
        .expect(201);
    });

    it('GET /conflicts - returns shape expected by MCP tool', async () => {
      const res = await request(app.getHttpServer()).get('/conflicts').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const conflict = res.body[0];
      // The MCP tool reads these exact fields
      expect(conflict.id).toBeDefined();
      expect(conflict.conflictType).toBeDefined();
      expect(conflict.status).toBeDefined();
      expect(conflict.atomIdA).toBeDefined();
      expect(conflict.atomIdB).toBeDefined();
      expect(conflict.description).toBeDefined();
      expect(conflict.createdAt).toBeDefined();
    });

    it('GET /conflicts?status=open - filters by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/conflicts')
        .query({ status: 'open' })
        .expect(200);

      for (const c of res.body) {
        expect(c.status).toBe('open');
      }
    });

    it('GET /conflicts?type=semantic_overlap - filters by type', async () => {
      const res = await request(app.getHttpServer())
        .get('/conflicts')
        .query({ type: 'semantic_overlap' })
        .expect(200);

      for (const c of res.body) {
        expect(c.conflictType).toBe('semantic_overlap');
      }
    });
  });

  // ========================================
  // 10.4 Tool Registry Verification
  // ========================================

  describe('MCP Tool Registry (unit verification)', () => {
    // These are unit-level checks but included here to validate
    // the registry is correctly wired before production deployment

    it('should export all 8 tools with valid schemas', async () => {
      // Dynamic import to avoid module caching issues with env vars
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { allTools, toolHandlers, toolDefinitions } = require('../src/mcp/tools/index');

      expect(allTools).toHaveLength(8);
      expect(toolHandlers.size).toBe(8);
      expect(toolDefinitions).toHaveLength(8);

      // Verify each tool has required fields
      for (const tool of allTools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(typeof tool.handler).toBe('function');
      }
    });

    it('should have unique tool names', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { allTools } = require('../src/mcp/tools/index');
      const names = allTools.map((t: { name: string }) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('should have expected tool names registered', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { toolHandlers } = require('../src/mcp/tools/index');
      const expectedTools = [
        'read_atom',
        'list_atoms',
        'get_atom_for_test',
        'search_atoms',
        'get_coupling_status',
        'get_epistemic_status',
        'get_intent_history',
        'get_conflicts',
      ];

      for (const name of expectedTools) {
        expect(toolHandlers.has(name)).toBe(true);
      }
    });
  });

  // ========================================
  // Integration: Atom lifecycle through MCP lens
  // ========================================

  describe('MCP Integration: atom lifecycle', () => {
    it('should support the full read-list-search cycle for a single atom', async () => {
      // 1. Create an atom
      const createRes = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'MCP lifecycle: payment must validate card number',
          category: 'security',
        })
        .expect(201);

      const atomId = createRes.body.id;

      // 2. Read by UUID (read_atom primary path)
      const readRes = await request(app.getHttpServer()).get(`/atoms/${atomId}`).expect(200);
      expect(readRes.body.description).toContain('payment');

      // 3. Search by description (search_atoms path)
      const searchRes = await request(app.getHttpServer())
        .get('/atoms')
        .query({ search: 'payment' })
        .expect(200);
      expect(searchRes.body.items.some((a: { id: string }) => a.id === atomId)).toBe(true);

      // 4. Search by description keywords (read_atom fallback path)
      const descRes = await request(app.getHttpServer())
        .get('/atoms')
        .query({ search: 'validate card number', limit: 1 })
        .expect(200);
      expect(descRes.body.items.length).toBeGreaterThanOrEqual(1);
      expect(descRes.body.items.some((a: { id: string }) => a.id === atomId)).toBe(true);

      // 5. Filter by category (list_atoms path)
      const catRes = await request(app.getHttpServer())
        .get('/atoms')
        .query({ category: 'security' })
        .expect(200);
      expect(catRes.body.items.some((a: { id: string }) => a.id === atomId)).toBe(true);
    });

    it('should reflect committed atom in epistemic metrics', async () => {
      // Create + commit an atom
      const createRes = await request(app.getHttpServer())
        .post('/atoms')
        .send({
          description: 'MCP epistemic lifecycle atom',
          category: 'functional',
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/atoms/${createRes.body.id}`)
        .send({ qualityScore: 90 })
        .expect(200);

      await request(app.getHttpServer()).patch(`/atoms/${createRes.body.id}/commit`).expect(200);

      // Verify epistemic metrics reflect the committed atom
      const epistemicRes = await request(app.getHttpServer()).get('/metrics/epistemic').expect(200);

      expect(epistemicRes.body.committed.count).toBeGreaterThanOrEqual(1);

      // Verify coupling metrics also updated
      const couplingRes = await request(app.getHttpServer()).get('/metrics/coupling').expect(200);

      expect(couplingRes.body.atomTestCoupling.totalAtoms).toBeGreaterThanOrEqual(1);
    });
  });
});
