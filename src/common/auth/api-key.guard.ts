import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from './api-key.service';

const REQUIRE_API_KEY = 'requireApiKey';

/**
 * Decorator to mark an endpoint as requiring API key authentication.
 * Apply to controller methods that should be accessible only to authenticated
 * CLI tools, CI pipelines, or external integrations.
 *
 * Usage:
 * ```typescript
 * @RequireApiKey()
 * @Post('hooks/github/push')
 * async handlePush(...) { ... }
 * ```
 */
export const RequireApiKey = () => SetMetadata(REQUIRE_API_KEY, true);

/**
 * Guard that validates API keys from the Authorization header.
 *
 * Expects: `Authorization: Bearer pact_<hex>`
 *
 * Only active on endpoints decorated with @RequireApiKey().
 * Endpoints without the decorator pass through unguarded (preserving
 * the current single-user, no-auth behavior for frontend-facing endpoints).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requireApiKey = this.reflector.getAllAndOverride<boolean>(REQUIRE_API_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If endpoint doesn't require API key, allow through
    if (!requireApiKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] as string | undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('API key required. Set Authorization: Bearer pact_<key>');
    }

    const token = authHeader.slice(7); // Remove 'Bearer '
    const apiKey = await this.apiKeyService.validateKey(token);

    if (!apiKey) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    // Attach key info to request for downstream use
    request.apiKey = { id: apiKey.id, name: apiKey.name };

    return true;
  }
}
