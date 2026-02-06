/**
 * Agent Safety Guard
 *
 * NestJS guard that enforces safety checks at the route level.
 * Apply to controllers/routes that accept user input for agent processing.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AgentSafetyService, SafetyContext } from './agent-safety.service';
import { SafetyViolationType } from './constitution';

/**
 * Metadata key for specifying agent ID on routes
 */
export const AGENT_ID_KEY = 'agentId';

/**
 * Metadata key for skipping safety checks (use with caution!)
 */
export const SKIP_SAFETY_KEY = 'skipSafety';

/**
 * Decorator to specify the agent ID for a route
 */
export const AgentId = (agentId: string) => SetMetadata(AGENT_ID_KEY, agentId);

/**
 * Decorator to skip safety checks (requires explicit opt-in)
 * Use only for internal routes that don't accept user input
 */
export const SkipSafety = () => SetMetadata(SKIP_SAFETY_KEY, true);

/**
 * Safety exception with detailed violation information
 */
export class SafetyException extends HttpException {
  constructor(
    message: string,
    public readonly violations: Array<{
      type: SafetyViolationType;
      message: string;
      severity: string;
    }>,
    public readonly riskScore: number,
  ) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Safety Violation',
        message,
        violations: violations.map((v) => ({
          type: v.type,
          message: v.message,
          severity: v.severity,
        })),
        riskScore,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

@Injectable()
export class AgentSafetyGuard implements CanActivate {
  constructor(
    private readonly safetyService: AgentSafetyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if safety should be skipped
    const skipSafety = this.reflector.getAllAndOverride<boolean>(SKIP_SAFETY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipSafety) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    // Get agent ID from metadata or request
    const agentId =
      this.reflector.getAllAndOverride<string>(AGENT_ID_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ||
      (request.body as { agentId?: string })?.agentId ||
      'unknown';

    // Extract input from request
    const input = this.extractInput(request);
    if (!input) {
      // No input to validate
      return true;
    }

    // Extract requested tools (if any)
    const requestedTools = this.extractRequestedTools(request);

    // Create safety context
    const safetyContext: SafetyContext = this.safetyService.createContext({
      agentId,
      sessionId:
        (request.body as { sessionId?: string })?.sessionId ||
        (request.headers['x-session-id'] as string),
      userId: (request as Request & { user?: { id: string } }).user?.id,
      workspaceRoot: process.cwd(),
    });

    // Validate the request
    const result = this.safetyService.validateRequest(input, requestedTools, safetyContext);

    if (!result.allowed) {
      const criticalViolations = result.allViolations.filter(
        (v) => v.severity === 'critical' || v.severity === 'high',
      );

      throw new SafetyException(
        'Request blocked due to safety violations',
        criticalViolations.map((v) => ({
          type: v.type,
          message: v.message,
          severity: v.severity,
        })),
        result.overallRiskScore,
      );
    }

    // Attach sanitized input and agent profile to request for downstream use
    (request as Request & { sanitizedInput?: string }).sanitizedInput = result.sanitizedInput;
    (request as Request & { agentProfile?: typeof result.agentProfile }).agentProfile =
      result.agentProfile;
    (request as Request & { safetyContext?: SafetyContext }).safetyContext = safetyContext;

    return true;
  }

  /**
   * Extract input from request body
   */
  private extractInput(request: Request): string | null {
    const body = request.body as Record<string, unknown>;

    // Common input field names
    const inputFields = ['message', 'input', 'query', 'prompt', 'content', 'text'];

    for (const field of inputFields) {
      if (typeof body[field] === 'string') {
        return body[field] as string;
      }
    }

    return null;
  }

  /**
   * Extract requested tools from request
   */
  private extractRequestedTools(request: Request): string[] {
    const body = request.body as Record<string, unknown>;

    // Check for explicit tools array
    if (Array.isArray(body.tools)) {
      return body.tools
        .filter((t): t is { name: string } => typeof t === 'object' && t !== null && 'name' in t)
        .map((t) => t.name);
    }

    // Check for tool calls
    if (Array.isArray(body.toolCalls)) {
      return body.toolCalls
        .filter((t): t is { name: string } => typeof t === 'object' && t !== null && 'name' in t)
        .map((t) => t.name);
    }

    return [];
  }
}

/**
 * Interceptor for validating responses
 * Use in conjunction with AgentSafetyGuard
 */
import { Injectable as NestInjectable, NestInterceptor, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@NestInjectable()
export class AgentSafetyInterceptor implements NestInterceptor {
  constructor(private readonly safetyService: AgentSafetyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const safetyContext = (request as Request & { safetyContext?: SafetyContext }).safetyContext;

    if (!safetyContext) {
      // No safety context, likely safety was skipped
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        // If response has a message field, validate it
        if (
          data &&
          typeof data === 'object' &&
          'message' in data &&
          typeof (data as { message: unknown }).message === 'string'
        ) {
          const result = this.safetyService.validateResponse(
            (data as { message: string }).message,
            safetyContext,
          );

          // Replace message with sanitized version
          return {
            ...(data as object),
            message: result.sanitizedOutput,
          };
        }

        return data;
      }),
    );
  }
}
