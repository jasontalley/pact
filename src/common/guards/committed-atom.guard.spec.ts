import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommittedAtomGuard, ALLOW_COMMITTED_ATOM_OPERATION } from './committed-atom.guard';
import { Atom } from '../../modules/atoms/atom.entity';

describe('CommittedAtomGuard', () => {
  let guard: CommittedAtomGuard;
  let reflector: Reflector;
  let atomRepository: jest.Mocked<Repository<Atom>>;

  const mockAtomRepository = {
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
        CommittedAtomGuard,
        Reflector,
        {
          provide: getRepositoryToken(Atom),
          useValue: mockAtomRepository,
        },
      ],
    }).compile();

    guard = module.get<CommittedAtomGuard>(CommittedAtomGuard);
    reflector = module.get<Reflector>(Reflector);
    atomRepository = module.get(getRepositoryToken(Atom));

    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('should allow GET requests without checking atom status', async () => {
      const context = createMockExecutionContext('GET', { id: 'atom-uuid' });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(atomRepository.findOne).not.toHaveBeenCalled();
    });

    it('should allow POST requests without checking atom status', async () => {
      const context = createMockExecutionContext('POST', {}, { description: 'test' });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(atomRepository.findOne).not.toHaveBeenCalled();
    });

    it('should allow PATCH on draft atoms', async () => {
      const draftAtom = {
        id: 'atom-uuid',
        atomId: 'IA-001',
        status: 'draft',
      };
      atomRepository.findOne.mockResolvedValue(draftAtom as Atom);

      const context = createMockExecutionContext('PATCH', { id: 'atom-uuid' });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(atomRepository.findOne).toHaveBeenCalledWith({
        where: [{ id: 'atom-uuid' }, { atomId: 'atom-uuid' }],
      });
    });

    it('should block PATCH on committed atoms with INV-004 error', async () => {
      const committedAtom = {
        id: 'atom-uuid',
        atomId: 'IA-001',
        status: 'committed',
      };
      atomRepository.findOne.mockResolvedValue(committedAtom as Atom);

      const context = createMockExecutionContext('PATCH', { id: 'atom-uuid' });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: {
          error: 'INV-004',
          message: 'Committed atoms are immutable and cannot be modified.',
        },
      });
    });

    it('should block DELETE on committed atoms with INV-004 error', async () => {
      const committedAtom = {
        id: 'atom-uuid',
        atomId: 'IA-001',
        status: 'committed',
      };
      atomRepository.findOne.mockResolvedValue(committedAtom as Atom);

      const context = createMockExecutionContext('DELETE', { id: 'atom-uuid' });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should block PATCH on superseded atoms with INV-004 error', async () => {
      const supersededAtom = {
        id: 'atom-uuid',
        atomId: 'IA-001',
        status: 'superseded',
        supersededBy: 'new-atom-uuid',
      };
      atomRepository.findOne.mockResolvedValue(supersededAtom as Atom);

      const context = createMockExecutionContext('PATCH', { id: 'atom-uuid' });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: {
          error: 'INV-004',
          message: 'Superseded atoms cannot be modified.',
        },
      });
    });

    it('should allow operations when @AllowCommittedAtomOperation is set', async () => {
      const committedAtom = {
        id: 'atom-uuid',
        atomId: 'IA-001',
        status: 'committed',
      };
      atomRepository.findOne.mockResolvedValue(committedAtom as Atom);

      const context = createMockExecutionContext('PATCH', { id: 'atom-uuid' });

      // Mock the reflector to return true for the decorator
      jest.spyOn(reflector, 'get').mockReturnValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(atomRepository.findOne).not.toHaveBeenCalled();
    });

    it('should pass through when atom is not found', async () => {
      atomRepository.findOne.mockResolvedValue(null);

      const context = createMockExecutionContext('PATCH', { id: 'nonexistent-uuid' });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should pass through when no atom ID is provided', async () => {
      const context = createMockExecutionContext('PATCH', {}, {});
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(atomRepository.findOne).not.toHaveBeenCalled();
    });

    it('should extract atom ID from request body', async () => {
      const draftAtom = {
        id: 'atom-uuid',
        atomId: 'IA-001',
        status: 'draft',
      };
      atomRepository.findOne.mockResolvedValue(draftAtom as Atom);

      const context = createMockExecutionContext('PATCH', {}, { atomId: 'atom-uuid' });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(atomRepository.findOne).toHaveBeenCalledWith({
        where: [{ id: 'atom-uuid' }, { atomId: 'atom-uuid' }],
      });
    });

    it('should allow DELETE on draft atoms', async () => {
      const draftAtom = {
        id: 'atom-uuid',
        atomId: 'IA-001',
        status: 'draft',
      };
      atomRepository.findOne.mockResolvedValue(draftAtom as Atom);

      const context = createMockExecutionContext('DELETE', { id: 'atom-uuid' });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should block DELETE on superseded atoms', async () => {
      const supersededAtom = {
        id: 'atom-uuid',
        atomId: 'IA-001',
        status: 'superseded',
        supersededBy: 'new-atom-uuid',
      };
      atomRepository.findOne.mockResolvedValue(supersededAtom as Atom);

      const context = createMockExecutionContext('DELETE', { id: 'atom-uuid' });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });
});
