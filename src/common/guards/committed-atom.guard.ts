import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Atom } from '../../modules/atoms/atom.entity';

/**
 * Metadata key for allowing operations on committed atoms
 */
export const ALLOW_COMMITTED_ATOM_OPERATION = 'allowCommittedAtomOperation';

/**
 * Decorator to mark an endpoint as allowing operations on committed atoms
 * Use with caution - only for supersession endpoints
 */
export const AllowCommittedAtomOperation = () => SetMetadata(ALLOW_COMMITTED_ATOM_OPERATION, true);

/**
 * Guard to prevent modifications to committed atoms
 *
 * Implements INV-004: Commitment Is Immutable
 *
 * This guard checks if the target atom is committed and blocks:
 * - PUT/PATCH operations (updates)
 * - DELETE operations
 *
 * The guard extracts the atom ID from:
 * 1. Route params (e.g., /atoms/:id)
 * 2. Request body (e.g., { atomId: '...' })
 *
 * To allow specific operations (like supersession), use @AllowCommittedAtomOperation()
 */
@Injectable()
export class CommittedAtomGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Atom)
    private readonly atomRepository: Repository<Atom>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if this endpoint allows committed atom operations
    const allowOperation = this.reflector.get<boolean>(
      ALLOW_COMMITTED_ATOM_OPERATION,
      context.getHandler(),
    );
    if (allowOperation) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Only check for modifying operations
    if (!['PUT', 'PATCH', 'DELETE'].includes(method)) {
      return true;
    }

    // Extract atom ID from params or body
    const atomId = this.extractAtomId(request);
    if (!atomId) {
      // No atom ID found, let the endpoint handle validation
      return true;
    }

    // Find the atom
    const atom = await this.atomRepository.findOne({
      where: [{ id: atomId }, { atomId: atomId }],
    });

    if (!atom) {
      // Atom not found - let the endpoint handle this
      return true;
    }

    // Check if atom is committed
    if (atom.status === 'committed') {
      throw new ForbiddenException({
        error: 'INV-004',
        message: 'Committed atoms are immutable and cannot be modified.',
        details: `Atom ${atom.atomId} is committed and cannot be updated or deleted. Use supersession to create a new version.`,
        atomId: atom.atomId,
        status: atom.status,
      });
    }

    // Check if atom is superseded
    if (atom.status === 'superseded') {
      throw new ForbiddenException({
        error: 'INV-004',
        message: 'Superseded atoms cannot be modified.',
        details: `Atom ${atom.atomId} has been superseded and cannot be updated or deleted.`,
        atomId: atom.atomId,
        status: atom.status,
        supersededBy: atom.supersededBy,
      });
    }

    return true;
  }

  /**
   * Extract atom ID from request params or body
   */
  private extractAtomId(request: any): string | null {
    // Check route params
    if (request.params?.id) {
      return request.params.id;
    }
    if (request.params?.atomId) {
      return request.params.atomId;
    }

    // Check request body
    if (request.body?.atomId) {
      return request.body.atomId;
    }
    if (request.body?.id) {
      return request.body.id;
    }

    return null;
  }
}
