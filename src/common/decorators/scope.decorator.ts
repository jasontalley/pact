/**
 * Scope Decorator
 *
 * Parameter decorator to extract Pact scope context from requests.
 *
 * @see docs/implementation-checklist-phase17.md Section 17E
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { PactScopeContext, getPactScope } from '../middleware/scope.middleware';

/**
 * Parameter decorator to extract PactScopeContext from the request.
 *
 * Usage:
 * ```typescript
 * @Get('atoms')
 * async listAtoms(@PactScope() scope: PactScopeContext) {
 *   if (scope.projectId) {
 *     // Filter by project
 *   }
 *   if (scope.scope === 'main') {
 *     // Return only committed atoms
 *   }
 * }
 * ```
 */
export const PactScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PactScopeContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return getPactScope(request);
  },
);

/**
 * Parameter decorator to extract just the project ID from scope.
 *
 * Usage:
 * ```typescript
 * @Get('atoms')
 * async listAtoms(@ProjectId() projectId?: string) {
 *   // projectId will be undefined if header not provided
 * }
 * ```
 */
export const ProjectId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return getPactScope(request).projectId;
  },
);

/**
 * Parameter decorator to check if request is in main scope.
 *
 * Usage:
 * ```typescript
 * @Get('atoms')
 * async listAtoms(@IsMainScope() isMain: boolean) {
 *   if (isMain) {
 *     // Return canonical data
 *   }
 * }
 * ```
 */
export const IsMainScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): boolean => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return getPactScope(request).scope === 'main';
  },
);
