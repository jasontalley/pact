/**
 * Scope Middleware Tests
 */

import { Request, Response } from 'express';
import {
  ScopeMiddleware,
  getPactScope,
  isMainScope,
  isLocalScope,
  PACT_PROJECT_ID_HEADER,
  PACT_SCOPE_HEADER,
  PactScopeContext,
} from './scope.middleware';

describe('ScopeMiddleware', () => {
  let middleware: ScopeMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;

  beforeEach(() => {
    middleware = new ScopeMiddleware();
    mockRequest = {
      headers: {},
    };
    mockResponse = {};
    nextFunction = jest.fn();
  });

  describe('use', () => {
    it('should set default scope to main when no headers provided', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      expect((mockRequest as Request).pactScope).toEqual({
        projectId: undefined,
        scope: 'main',
      });
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should extract project ID from header', () => {
      mockRequest.headers = {
        [PACT_PROJECT_ID_HEADER]: 'project-123',
      };

      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      expect((mockRequest as Request).pactScope?.projectId).toBe('project-123');
    });

    it('should set scope to local when header is local', () => {
      mockRequest.headers = {
        [PACT_SCOPE_HEADER]: 'local',
      };

      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      expect((mockRequest as Request).pactScope?.scope).toBe('local');
    });

    it('should set scope to main when header is main', () => {
      mockRequest.headers = {
        [PACT_SCOPE_HEADER]: 'main',
      };

      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      expect((mockRequest as Request).pactScope?.scope).toBe('main');
    });

    it('should default to main scope for invalid scope values', () => {
      mockRequest.headers = {
        [PACT_SCOPE_HEADER]: 'invalid',
      };

      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      expect((mockRequest as Request).pactScope?.scope).toBe('main');
    });

    it('should handle array header values', () => {
      mockRequest.headers = {
        [PACT_PROJECT_ID_HEADER]: ['project-1', 'project-2'],
        [PACT_SCOPE_HEADER]: ['local', 'main'],
      };

      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      // Should take first value from array
      expect((mockRequest as Request).pactScope?.projectId).toBe('project-1');
      expect((mockRequest as Request).pactScope?.scope).toBe('local');
    });

    it('should handle both headers together', () => {
      mockRequest.headers = {
        [PACT_PROJECT_ID_HEADER]: 'my-project',
        [PACT_SCOPE_HEADER]: 'local',
      };

      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      expect((mockRequest as Request).pactScope).toEqual({
        projectId: 'my-project',
        scope: 'local',
      });
    });

    it('should reject merged scope (not supported)', () => {
      mockRequest.headers = {
        [PACT_SCOPE_HEADER]: 'merged',
      };

      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      // 'merged' is not a valid scope, should default to 'main'
      expect((mockRequest as Request).pactScope?.scope).toBe('main');
    });
  });

  describe('getPactScope', () => {
    it('should return scope context from request', () => {
      const context: PactScopeContext = { projectId: 'test', scope: 'local' };
      mockRequest.pactScope = context;

      const result = getPactScope(mockRequest as Request);

      expect(result).toEqual(context);
    });

    it('should return default context when not set', () => {
      const result = getPactScope(mockRequest as Request);

      expect(result).toEqual({ scope: 'main' });
    });
  });

  describe('isMainScope', () => {
    it('should return true for main scope', () => {
      mockRequest.pactScope = { scope: 'main' };

      expect(isMainScope(mockRequest as Request)).toBe(true);
    });

    it('should return false for local scope', () => {
      mockRequest.pactScope = { scope: 'local' };

      expect(isMainScope(mockRequest as Request)).toBe(false);
    });

    it('should return true when scope not set (defaults to main)', () => {
      expect(isMainScope(mockRequest as Request)).toBe(true);
    });
  });

  describe('isLocalScope', () => {
    it('should return true for local scope', () => {
      mockRequest.pactScope = { scope: 'local' };

      expect(isLocalScope(mockRequest as Request)).toBe(true);
    });

    it('should return false for main scope', () => {
      mockRequest.pactScope = { scope: 'main' };

      expect(isLocalScope(mockRequest as Request)).toBe(false);
    });

    it('should return false when scope not set (defaults to main)', () => {
      expect(isLocalScope(mockRequest as Request)).toBe(false);
    });
  });
});
