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
import { CommitmentArtifact } from '../../modules/commitments/commitment.entity';

/**
 * Metadata key for allowing commitment modifications
 */
export const ALLOW_COMMITMENT_MODIFICATION = 'allowCommitmentModification';

/**
 * Decorator to mark an endpoint as allowing commitment modifications
 * Use with caution - only for specific internal operations
 */
export const AllowCommitmentModification = () => SetMetadata(ALLOW_COMMITMENT_MODIFICATION, true);

/**
 * Guard to prevent modifications to commitment artifacts
 *
 * Implements INV-004: Commitment Is Immutable
 *
 * This guard blocks all modification attempts on commitment artifacts:
 * - PUT/PATCH operations (updates)
 * - DELETE operations
 *
 * Commitments are immutable audit records. Once created, they can only be:
 * - Read (GET operations)
 * - Superseded (via POST to create a new commitment)
 *
 * The guard extracts the commitment ID from:
 * 1. Route params (e.g., /commitments/:id)
 * 2. Request body
 */
@Injectable()
export class CommitmentImmutabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(CommitmentArtifact)
    private readonly commitmentRepository: Repository<CommitmentArtifact>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if this endpoint allows commitment modifications
    const allowModification = this.reflector.get<boolean>(
      ALLOW_COMMITMENT_MODIFICATION,
      context.getHandler(),
    );
    if (allowModification) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Only check for modifying operations
    if (!['PUT', 'PATCH', 'DELETE'].includes(method)) {
      return true;
    }

    // Extract commitment ID from params
    const commitmentId = this.extractCommitmentId(request);
    if (!commitmentId) {
      // No commitment ID found, let the endpoint handle validation
      return true;
    }

    // Find the commitment
    const commitment = await this.commitmentRepository.findOne({
      where: [{ id: commitmentId }, { commitmentId: commitmentId }],
    });

    if (!commitment) {
      // Commitment not found - let the endpoint handle this
      return true;
    }

    // Block all modification attempts
    if (method === 'DELETE') {
      throw new ForbiddenException({
        error: 'INV-004',
        message: 'Commitments cannot be deleted.',
        details: `Commitment ${commitment.commitmentId} is an immutable audit record and cannot be deleted.`,
        commitmentId: commitment.commitmentId,
      });
    }

    throw new ForbiddenException({
      error: 'INV-004',
      message: 'Commitments are immutable and cannot be modified.',
      details: `Commitment ${commitment.commitmentId} cannot be updated. To make changes, create a superseding commitment.`,
      commitmentId: commitment.commitmentId,
      status: commitment.status,
    });
  }

  /**
   * Extract commitment ID from request params or body
   */
  private extractCommitmentId(request: any): string | null {
    // Check route params
    if (request.params?.id) {
      return request.params.id;
    }
    if (request.params?.commitmentId) {
      return request.params.commitmentId;
    }

    // Check request body
    if (request.body?.commitmentId) {
      return request.body.commitmentId;
    }
    if (request.body?.id) {
      return request.body.id;
    }

    return null;
  }
}
