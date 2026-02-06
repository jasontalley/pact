/**
 * Scope Middleware
 *
 * Extracts Pact scope headers from incoming requests:
 * - x-pact-project-id: Project ID for multi-tenant deployments
 * - x-pact-scope: Scope mode ('main' or 'local')
 *
 * Default scope: 'main' when header not provided.
 *
 * Note: There is no 'merged' scope - local is advisory only, never mixed into canonical queries.
 *
 * @see docs/implementation-checklist-phase17.md Section 17E
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Pact scope types
 *
 * - 'main': Committed atoms on Pact Main (default for agents and CI)
 * - 'local': Advisory; used only by local client tooling for plausibility checks
 */
export type PactScope = 'main' | 'local';

/**
 * Pact scope context attached to requests
 */
export interface PactScopeContext {
  /** Project ID for multi-tenant filtering (optional) */
  projectId?: string;
  /** Scope mode: 'main' (canonical) or 'local' (advisory) */
  scope: PactScope;
}

/**
 * Header names for Pact scope
 */
export const PACT_PROJECT_ID_HEADER = 'x-pact-project-id';
export const PACT_SCOPE_HEADER = 'x-pact-scope';

/**
 * Request property key for storing scope context
 */
export const PACT_SCOPE_KEY = 'pactScope';

/**
 * Extend Express Request to include pactScope
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      pactScope?: PactScopeContext;
    }
  }
}

/**
 * Middleware to extract Pact scope headers from incoming requests.
 *
 * Usage:
 * ```typescript
 * // In module configuration
 * configure(consumer: MiddlewareConsumer) {
 *   consumer.apply(ScopeMiddleware).forRoutes('*');
 * }
 * ```
 */
@Injectable()
export class ScopeMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Extract project ID header (optional)
    const projectIdHeader = req.headers[PACT_PROJECT_ID_HEADER];
    const projectId = Array.isArray(projectIdHeader)
      ? projectIdHeader[0]
      : projectIdHeader;

    // Extract scope header (optional, defaults to 'main')
    const scopeHeader = req.headers[PACT_SCOPE_HEADER];
    const scopeValue = Array.isArray(scopeHeader)
      ? scopeHeader[0]
      : scopeHeader;

    // Validate and normalize scope
    let scope: PactScope = 'main';
    if (scopeValue === 'local') {
      scope = 'local';
    }
    // Note: 'merged' scope is explicitly NOT supported (Phase 17 design decision)

    // Attach scope context to request
    req.pactScope = {
      projectId: projectId || undefined,
      scope,
    };

    next();
  }
}

/**
 * Helper function to get scope context from a request.
 * Returns default context if not set.
 */
export function getPactScope(req: Request): PactScopeContext {
  return req.pactScope ?? { scope: 'main' };
}

/**
 * Helper function to check if request is in main scope (canonical).
 */
export function isMainScope(req: Request): boolean {
  return getPactScope(req).scope === 'main';
}

/**
 * Helper function to check if request is in local scope (advisory).
 */
export function isLocalScope(req: Request): boolean {
  return getPactScope(req).scope === 'local';
}
