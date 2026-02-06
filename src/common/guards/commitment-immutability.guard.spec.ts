import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CommitmentImmutabilityGuard,
  ALLOW_COMMITMENT_MODIFICATION,
} from './commitment-immutability.guard';
import { CommitmentArtifact } from '../../modules/commitments/commitment.entity';

describe('CommitmentImmutabilityGuard', () => {
  let guard: CommitmentImmutabilityGuard;
  let reflector: Reflector;
  let commitmentRepository: jest.Mocked<Repository<CommitmentArtifact>>;

  const mockCommitmentRepository = {
    findOne: jest.fn(),
  };

  const createMockExecutionContext = (
    method: string,
    params: Record<string, string> = {},
    body: Record<string, any> = {},
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          params,
          body,
        }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommitmentImmutabilityGuard,
        Reflector,
        {
          provide: getRepositoryToken(CommitmentArtifact),
          useValue: mockCommitmentRepository,
        },
      ],
    }).compile();

    guard = module.get<CommitmentImmutabilityGuard>(CommitmentImmutabilityGuard);
    reflector = module.get<Reflector>(Reflector);
    commitmentRepository = module.get(getRepositoryToken(CommitmentArtifact));

    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('should allow GET requests without checking commitment', async () => {
      const context = createMockExecutionContext('GET', { id: 'commitment-uuid' });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(commitmentRepository.findOne).not.toHaveBeenCalled();
    });

    it('should allow POST requests without checking commitment', async () => {
      const context = createMockExecutionContext('POST', {}, { atomIds: ['atom-1'] });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(commitmentRepository.findOne).not.toHaveBeenCalled();
    });

    it('should block PATCH on any commitment with INV-004 error', async () => {
      const commitment = {
        id: 'commitment-uuid',
        commitmentId: 'CMT-001',
        status: 'active',
      };
      commitmentRepository.findOne.mockResolvedValue(commitment as CommitmentArtifact);

      const context = createMockExecutionContext('PATCH', { id: 'commitment-uuid' });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: {
          error: 'INV-004',
          message: 'Commitments are immutable and cannot be modified.',
        },
      });
    });

    it('should block DELETE on any commitment with INV-004 error', async () => {
      const commitment = {
        id: 'commitment-uuid',
        commitmentId: 'CMT-001',
        status: 'active',
      };
      commitmentRepository.findOne.mockResolvedValue(commitment as CommitmentArtifact);

      const context = createMockExecutionContext('DELETE', { id: 'commitment-uuid' });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: {
          error: 'INV-004',
          message: 'Commitments cannot be deleted.',
        },
      });
    });

    it('should block PUT on any commitment with INV-004 error', async () => {
      const commitment = {
        id: 'commitment-uuid',
        commitmentId: 'CMT-001',
        status: 'active',
      };
      commitmentRepository.findOne.mockResolvedValue(commitment as CommitmentArtifact);

      const context = createMockExecutionContext('PUT', { id: 'commitment-uuid' });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should allow operations when @AllowCommitmentModification is set', async () => {
      const commitment = {
        id: 'commitment-uuid',
        commitmentId: 'CMT-001',
        status: 'active',
      };
      commitmentRepository.findOne.mockResolvedValue(commitment as CommitmentArtifact);

      const context = createMockExecutionContext('PATCH', { id: 'commitment-uuid' });

      // Mock the reflector to return true for the decorator
      jest.spyOn(reflector, 'get').mockReturnValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(commitmentRepository.findOne).not.toHaveBeenCalled();
    });

    it('should pass through when commitment is not found', async () => {
      commitmentRepository.findOne.mockResolvedValue(null);

      const context = createMockExecutionContext('PATCH', { id: 'nonexistent-uuid' });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should pass through when no commitment ID is provided', async () => {
      const context = createMockExecutionContext('PATCH', {}, {});
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(commitmentRepository.findOne).not.toHaveBeenCalled();
    });

    it('should extract commitment ID from request body', async () => {
      const commitment = {
        id: 'commitment-uuid',
        commitmentId: 'CMT-001',
        status: 'active',
      };
      commitmentRepository.findOne.mockResolvedValue(commitment as CommitmentArtifact);

      const context = createMockExecutionContext('PATCH', {}, { commitmentId: 'commitment-uuid' });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      expect(commitmentRepository.findOne).toHaveBeenCalledWith({
        where: [{ id: 'commitment-uuid' }, { commitmentId: 'commitment-uuid' }],
      });
    });

    it('should include commitment details in error response', async () => {
      const commitment = {
        id: 'commitment-uuid',
        commitmentId: 'CMT-001',
        status: 'active',
      };
      commitmentRepository.findOne.mockResolvedValue(commitment as CommitmentArtifact);

      const context = createMockExecutionContext('PATCH', { id: 'commitment-uuid' });

      try {
        await guard.canActivate(context);
        fail('Expected ForbiddenException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect(error.response).toMatchObject({
          error: 'INV-004',
          commitmentId: 'CMT-001',
          status: 'active',
        });
      }
    });

    it('should block modification of superseded commitments', async () => {
      const commitment = {
        id: 'commitment-uuid',
        commitmentId: 'CMT-001',
        status: 'superseded',
      };
      commitmentRepository.findOne.mockResolvedValue(commitment as CommitmentArtifact);

      const context = createMockExecutionContext('PATCH', { id: 'commitment-uuid' });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });
});
