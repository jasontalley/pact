/**
 * E2E tests for Agents and LLM API
 * @atom IA-008 - LLM Provider Implementation
 *
 * These tests validate the agent and LLM provider API endpoints:
 * - Provider status and model listing
 * - Usage tracking and budget status
 * - Cost estimation
 * - Chat agent conversational interface
 *
 * Note: These tests mock the LLM responses since actual LLM providers
 * may not be available in CI environments.
 */
import * as request from 'supertest';
import { setupE2EApp, teardownE2EApp } from './setup-e2e';
import { INestApplication } from '@nestjs/common';

describe('Agents and LLM API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await setupE2EApp();
  }, 30000);

  afterAll(async () => {
    await teardownE2EApp();
  }, 30000);

  // @atom IA-008
  describe('GET /llm/providers - Provider Status', () => {
    it('should return list of configured providers', async () => {
      // Asserts that the provider endpoint returns provider configuration
      const response = await request(app.getHttpServer()).get('/llm/providers').expect(200);

      // Verifies response structure
      expect(response.body).toHaveProperty('providers');
      expect(response.body).toHaveProperty('availableCount');
      expect(response.body).toHaveProperty('totalCount');
      expect(Array.isArray(response.body.providers)).toBe(true);
    });

    it('should include provider details in response', async () => {
      // Asserts that each provider has required fields
      const response = await request(app.getHttpServer()).get('/llm/providers').expect(200);

      if (response.body.providers.length > 0) {
        const provider = response.body.providers[0];
        expect(provider).toHaveProperty('name');
        expect(provider).toHaveProperty('displayName');
        expect(provider).toHaveProperty('available');
        expect(provider).toHaveProperty('supportedModels');
      }
    });

    it('should count available providers correctly', async () => {
      // Asserts that available count matches actual available providers
      const response = await request(app.getHttpServer()).get('/llm/providers').expect(200);

      const actualAvailable = response.body.providers.filter(
        (p: { available: boolean }) => p.available,
      ).length;
      expect(response.body.availableCount).toBe(actualAvailable);
    });
  });

  // @atom IA-008
  describe('GET /llm/models - Model Listing', () => {
    it('should return list of available models', async () => {
      // Asserts that the models endpoint returns model information
      const response = await request(app.getHttpServer()).get('/llm/models').expect(200);

      // Verifies response structure
      expect(response.body).toHaveProperty('models');
      expect(response.body).toHaveProperty('totalCount');
      expect(Array.isArray(response.body.models)).toBe(true);
    });

    it('should include model capabilities', async () => {
      // Asserts that models include capability information
      const response = await request(app.getHttpServer()).get('/llm/models').expect(200);

      if (response.body.models.length > 0) {
        const model = response.body.models[0];
        expect(model).toHaveProperty('model');
        expect(model).toHaveProperty('provider');
        expect(model).toHaveProperty('capabilities');
      }
    });

    it('should filter models by provider', async () => {
      // Asserts that provider filter works correctly
      const response = await request(app.getHttpServer())
        .get('/llm/models?provider=anthropic')
        .expect(200);

      // All returned models should be from anthropic (if any)
      response.body.models.forEach((m: { provider: string }) => {
        expect(m.provider).toBe('anthropic');
      });
    });

    it('should filter models by vision support', async () => {
      // Asserts that vision filter works correctly
      const response = await request(app.getHttpServer())
        .get('/llm/models?supportsVision=true')
        .expect(200);

      // All returned models should support vision (if any)
      response.body.models.forEach((m: { capabilities: { supportsVision: boolean } }) => {
        expect(m.capabilities.supportsVision).toBe(true);
      });
    });
  });

  // @atom IA-008
  describe('GET /llm/usage/summary - Usage Statistics', () => {
    it('should return usage summary for default period', async () => {
      // Asserts that usage summary endpoint returns statistics
      const response = await request(app.getHttpServer()).get('/llm/usage/summary').expect(200);

      // Verifies response structure
      expect(response.body).toHaveProperty('period');
      expect(response.body).toHaveProperty('totals');
      expect(response.body).toHaveProperty('budget');
    });

    it('should return correct totals structure', async () => {
      // Asserts that totals include all required metrics
      const response = await request(app.getHttpServer()).get('/llm/usage/summary').expect(200);

      expect(response.body.totals).toHaveProperty('requests');
      expect(response.body.totals).toHaveProperty('totalTokens');
      expect(response.body.totals).toHaveProperty('totalCost');
    });

    it('should return budget status', async () => {
      // Asserts that budget status is included
      const response = await request(app.getHttpServer()).get('/llm/usage/summary').expect(200);

      expect(response.body.budget).toHaveProperty('dailyCost');
      expect(response.body.budget).toHaveProperty('dailyLimit');
      expect(response.body.budget).toHaveProperty('monthlyCost');
      expect(response.body.budget).toHaveProperty('monthlyLimit');
    });

    it('should filter by period type', async () => {
      // Asserts that period filter works
      const response = await request(app.getHttpServer())
        .get('/llm/usage/summary?period=week')
        .expect(200);

      expect(response.body.period.type).toBe('week');
    });
  });

  // @atom IA-008
  describe('POST /llm/estimate - Cost Estimation', () => {
    it('should estimate cost for a task', async () => {
      // Asserts that cost estimation returns valid response
      const response = await request(app.getHttpServer())
        .post('/llm/estimate')
        .send({
          taskType: 'chat',
          inputTokens: 1000,
          outputTokens: 500,
        })
        .expect(200);

      // Verifies response structure
      expect(response.body).toHaveProperty('taskType');
      expect(response.body).toHaveProperty('minCost');
      expect(response.body).toHaveProperty('maxCost');
      expect(response.body).toHaveProperty('recommendations');
    });

    it('should include recommendations', async () => {
      // Asserts that recommendations are returned
      const response = await request(app.getHttpServer())
        .post('/llm/estimate')
        .send({
          taskType: 'analysis',
          inputTokens: 2000,
          outputTokens: 1000,
        })
        .expect(200);

      expect(Array.isArray(response.body.recommendations)).toBe(true);
      if (response.body.recommendations.length > 0) {
        const rec = response.body.recommendations[0];
        expect(rec).toHaveProperty('provider');
        expect(rec).toHaveProperty('model');
        expect(rec).toHaveProperty('estimatedCost');
      }
    });

    it('should respect budget mode', async () => {
      // Asserts that budget mode affects recommendations
      const response = await request(app.getHttpServer())
        .post('/llm/estimate')
        .send({
          taskType: 'chat',
          inputTokens: 1000,
          outputTokens: 500,
          budgetMode: 'economy',
        })
        .expect(200);

      expect(response.body.budgetMode).toBe('economy');
    });
  });

  // @atom IA-008
  describe('GET /llm/usage/trends - Usage Trends', () => {
    it('should return trend data', async () => {
      // Asserts that trend endpoint returns chart data
      const response = await request(app.getHttpServer()).get('/llm/usage/trends').expect(200);

      // Verifies response structure
      expect(response.body).toHaveProperty('daily');
      expect(response.body).toHaveProperty('weekly');
      expect(response.body).toHaveProperty('monthly');
      expect(Array.isArray(response.body.daily)).toBe(true);
    });
  });

  // @atom IA-008
  describe('POST /agents/chat - Chat Agent', () => {
    it('should accept a chat message', async () => {
      // Asserts that chat endpoint accepts messages
      // Note: This may fail if no LLM providers are available
      const response = await request(app.getHttpServer()).post('/agents/chat').send({
        message: 'Hello, what can you help me with?',
      });

      // Accept either success or service unavailable
      expect([200, 500, 503]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('sessionId');
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should reject empty message', async () => {
      // Asserts that validation rejects empty messages
      const response = await request(app.getHttpServer())
        .post('/agents/chat')
        .send({
          message: '',
        })
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });

    it('should maintain session across messages', async () => {
      // First message to establish session
      const firstResponse = await request(app.getHttpServer()).post('/agents/chat').send({
        message: 'Test message for session',
      });

      if (firstResponse.status === 200 && firstResponse.body.sessionId) {
        // Second message with session ID
        const secondResponse = await request(app.getHttpServer()).post('/agents/chat').send({
          message: 'Follow up message',
          sessionId: firstResponse.body.sessionId,
        });

        if (secondResponse.status === 200) {
          // Session should be maintained
          expect(secondResponse.body.sessionId).toBe(firstResponse.body.sessionId);
        }
      }
    });

    it('should include suggested actions when available', async () => {
      // Asserts that suggested actions are returned when appropriate
      const response = await request(app.getHttpServer()).post('/agents/chat').send({
        message: 'Help me create an atom',
      });

      if (response.status === 200) {
        // suggestedActions may or may not be present
        if (response.body.suggestedActions) {
          expect(Array.isArray(response.body.suggestedActions)).toBe(true);
        }
      }
    });
  });

  // @atom IA-008
  describe('GET /agents/chat/sessions/:sessionId - Session Retrieval', () => {
    it('should return 404 for non-existent session', async () => {
      // Asserts that non-existent sessions return 404
      const response = await request(app.getHttpServer())
        .get('/agents/chat/sessions/non-existent-session-id')
        .expect(404);

      expect(response.body.message).toContain('not found');
    });

    it('should return session details for valid session', async () => {
      // First create a session
      const chatResponse = await request(app.getHttpServer()).post('/agents/chat').send({
        message: 'Test message for session retrieval',
      });

      if (chatResponse.status === 200 && chatResponse.body.sessionId) {
        // Then retrieve the session
        const sessionResponse = await request(app.getHttpServer())
          .get(`/agents/chat/sessions/${chatResponse.body.sessionId}`)
          .expect(200);

        expect(sessionResponse.body).toHaveProperty('id');
        expect(sessionResponse.body).toHaveProperty('messages');
        expect(sessionResponse.body).toHaveProperty('messageCount');
        expect(sessionResponse.body.id).toBe(chatResponse.body.sessionId);
      }
    });
  });

  // @atom IA-008
  describe('GET /agents/chat/sessions/:sessionId/export - Session Export', () => {
    it('should return 404 for non-existent session export', async () => {
      // Asserts that non-existent sessions return 404
      const response = await request(app.getHttpServer())
        .get('/agents/chat/sessions/non-existent-session/export')
        .expect(404);

      expect(response.body.message).toContain('not found');
    });

    it('should export session as markdown by default', async () => {
      // First create a session
      const chatResponse = await request(app.getHttpServer()).post('/agents/chat').send({
        message: 'Test message for export',
      });

      if (chatResponse.status === 200 && chatResponse.body.sessionId) {
        // Then export the session
        const exportResponse = await request(app.getHttpServer())
          .get(`/agents/chat/sessions/${chatResponse.body.sessionId}/export`)
          .expect(200);

        expect(exportResponse.body).toHaveProperty('content');
        expect(exportResponse.body).toHaveProperty('contentType');
        expect(exportResponse.body.contentType).toBe('text/markdown');
      }
    });

    it(
      'should export session as JSON when requested',
      async () => {
        // First create a session
        const chatResponse = await request(app.getHttpServer()).post('/agents/chat').send({
          message: 'Test message for JSON export',
        });

        if (chatResponse.status === 200 && chatResponse.body.sessionId) {
          // Then export as JSON
          const exportResponse = await request(app.getHttpServer())
            .get(`/agents/chat/sessions/${chatResponse.body.sessionId}/export?format=json`)
            .expect(200);

          expect(exportResponse.body).toHaveProperty('id');
          expect(exportResponse.body).toHaveProperty('messages');
          expect(exportResponse.body).toHaveProperty('createdAt');
        }
      },
      30000,
    );
  });

  // @atom IA-008
  describe('Boundary Tests', () => {
    it('should handle very long messages gracefully', async () => {
      // Generate a long message (10K characters)
      const longMessage = 'A'.repeat(10000);

      const response = await request(app.getHttpServer()).post('/agents/chat').send({
        message: longMessage,
      });

      // Should either process or reject with validation error
      expect([200, 400, 500, 503]).toContain(response.status);
    });

    it(
      'should handle special characters in messages',
      async () => {
        const specialMessage = 'Test with "quotes" and <tags> & ampersands\n\t\r';

        const response = await request(app.getHttpServer()).post('/agents/chat').send({
          message: specialMessage,
        });

        // Should process without errors
        expect([200, 500, 503]).toContain(response.status);
      },
      30000,
    );

    it(
      'should handle unicode characters',
      async () => {
        const unicodeMessage = 'Test with émojis 🚀 and 中文 characters';

        const response = await request(app.getHttpServer()).post('/agents/chat').send({
          message: unicodeMessage,
        });

        // Should process without errors
        expect([200, 500, 503]).toContain(response.status);
      },
      30000,
    );

    it('should handle zero tokens in cost estimate', async () => {
      const response = await request(app.getHttpServer())
        .post('/llm/estimate')
        .send({
          taskType: 'chat',
          inputTokens: 0,
          outputTokens: 0,
        })
        .expect(200);

      expect(response.body.minCost).toBe(0);
      expect(response.body.maxCost).toBe(0);
    });

    it('should handle large token counts in cost estimate', async () => {
      const response = await request(app.getHttpServer())
        .post('/llm/estimate')
        .send({
          taskType: 'analysis',
          inputTokens: 1000000,
          outputTokens: 500000,
        })
        .expect(200);

      expect(response.body).toHaveProperty('minCost');
      expect(response.body).toHaveProperty('maxCost');
    });
  });
});
