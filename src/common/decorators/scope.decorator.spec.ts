/**
 * Scope Decorator Tests
 *
 * These decorators are thin wrappers around getPactScope from the middleware.
 * The core logic is fully tested in scope.middleware.spec.ts.
 * Here we verify the decorators are correctly exported and callable.
 */

import { PactScope, ProjectId, IsMainScope } from './scope.decorator';

describe('Scope Decorators', () => {
  describe('PactScope decorator', () => {
    it('should be a function', () => {
      expect(typeof PactScope).toBe('function');
    });

    it('should create a parameter decorator', () => {
      const decorator = PactScope();
      expect(decorator).toBeDefined();
      expect(typeof decorator).toBe('function');
    });
  });

  describe('ProjectId decorator', () => {
    it('should be a function', () => {
      expect(typeof ProjectId).toBe('function');
    });

    it('should create a parameter decorator', () => {
      const decorator = ProjectId();
      expect(decorator).toBeDefined();
      expect(typeof decorator).toBe('function');
    });
  });

  describe('IsMainScope decorator', () => {
    it('should be a function', () => {
      expect(typeof IsMainScope).toBe('function');
    });

    it('should create a parameter decorator', () => {
      const decorator = IsMainScope();
      expect(decorator).toBeDefined();
      expect(typeof decorator).toBe('function');
    });
  });

  describe('Decorator exports', () => {
    it('all decorators are properly exported', () => {
      expect(PactScope).toBeDefined();
      expect(ProjectId).toBeDefined();
      expect(IsMainScope).toBeDefined();
    });
  });
});

/**
 * Integration note:
 * These decorators call getPactScope() from scope.middleware.ts.
 * The getPactScope function is comprehensively tested in scope.middleware.spec.ts.
 * Full E2E integration with the middleware is tested via controller e2e tests.
 */
