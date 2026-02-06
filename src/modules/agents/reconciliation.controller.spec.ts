import { Test, TestingModule } from '@nestjs/testing';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { ApplyService } from './apply.service';
import { ReconciliationSchedulerService } from './reconciliation-scheduler.service';

describe('ReconciliationController', () => {
  let controller: ReconciliationController;
  let reconciliationService: jest.Mocked<Partial<ReconciliationService>>;
  let applyService: jest.Mocked<Partial<ApplyService>>;
  let schedulerService: jest.Mocked<Partial<ReconciliationSchedulerService>>;

  const mockReconciliationService = {
    analyze: jest.fn(),
    analyzeWithInterrupt: jest.fn(),
    getPendingReview: jest.fn(),
    submitReviewAndResume: jest.fn(),
    getRunStatus: jest.fn(),
    getMetrics: jest.fn(),
    listActiveRuns: jest.fn(),
    getRunDetails: jest.fn(),
    getRecommendations: jest.fn(),
    getPatch: jest.fn(),
    isAvailable: jest.fn(),
    listRecoverableRuns: jest.fn(),
    recoverRun: jest.fn(),
  };

  const mockApplyService = {
    applyPatch: jest.fn(),
  };

  const mockSchedulerService = {
    getSchedule: jest.fn(),
    setSchedule: jest.fn(),
    clearSchedule: jest.fn(),
    getHistory: jest.fn(),
  };

  // =========================================================================
  // Setup with all dependencies (including optional scheduler)
  // =========================================================================

  describe('with scheduler service', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [ReconciliationController],
        providers: [
          { provide: ReconciliationService, useValue: mockReconciliationService },
          { provide: ApplyService, useValue: mockApplyService },
          { provide: ReconciliationSchedulerService, useValue: mockSchedulerService },
        ],
      }).compile();

      controller = module.get<ReconciliationController>(ReconciliationController);
      reconciliationService = module.get(ReconciliationService);
      applyService = module.get(ApplyService);
      schedulerService = module.get(ReconciliationSchedulerService);
      jest.clearAllMocks();
    });

    // =======================================================================
    // Controller instantiation
    // =======================================================================

    describe('controller instantiation', () => {
      it('should be instantiated by NestJS dependency injection', () => {
        expect(controller).toBeDefined();
        expect(controller).toBeInstanceOf(ReconciliationController);
      });
    });

    // =======================================================================
    // POST /agents/reconciliation/analyze
    // =======================================================================

    describe('POST analyze', () => {
      it('should call reconciliationService.analyze with the provided DTO', async () => {
        const dto = { rootDirectory: '/test/repo', mode: 'full-scan' as const };
        const mockResult = {
          runId: 'REC-abc12345',
          status: 'completed' as const,
          patch: { operations: [] },
          summary: {},
          invariantFindings: [],
          metadata: {},
          errors: [],
        };
        mockReconciliationService.analyze.mockResolvedValue(mockResult);

        const result = await controller.analyze(dto);

        expect(mockReconciliationService.analyze).toHaveBeenCalledWith(dto);
        expect(result).toEqual(mockResult);
      });

      it('should propagate errors from the service', async () => {
        const dto = { rootDirectory: '/invalid' };
        mockReconciliationService.analyze.mockRejectedValue(new Error('Analysis failed'));

        await expect(controller.analyze(dto)).rejects.toThrow('Analysis failed');
      });
    });

    // =======================================================================
    // POST /agents/reconciliation/start
    // =======================================================================

    describe('POST start', () => {
      it('should call reconciliationService.analyzeWithInterrupt with the provided DTO', async () => {
        const dto = { rootDirectory: '/repo', mode: 'delta' as const };
        const mockResult = {
          completed: false,
          runId: 'REC-def67890',
          threadId: 'thread-123',
          pendingReview: {
            summary: { totalAtoms: 3, passCount: 2, failCount: 1, qualityThreshold: 80 },
            pendingAtoms: [],
            pendingMolecules: [],
          },
        };
        mockReconciliationService.analyzeWithInterrupt.mockResolvedValue(mockResult);

        const result = await controller.startAnalysis(dto);

        expect(mockReconciliationService.analyzeWithInterrupt).toHaveBeenCalledWith(dto);
        expect(result.completed).toBe(false);
        expect(result.runId).toBe('REC-def67890');
        expect(result.threadId).toBe('thread-123');
      });

      it('should return completed result when analysis finishes without interrupt', async () => {
        const dto = {};
        const mockResult = {
          completed: true,
          runId: 'REC-complete1',
          result: {
            runId: 'REC-complete1',
            status: 'completed' as const,
            patch: { operations: [] },
            summary: {},
            invariantFindings: [],
            metadata: {},
            errors: [],
          },
        };
        mockReconciliationService.analyzeWithInterrupt.mockResolvedValue(mockResult);

        const result = await controller.startAnalysis(dto);

        expect(result.completed).toBe(true);
        expect(result.result).toBeDefined();
      });
    });

    // =======================================================================
    // GET /agents/reconciliation/runs/:runId/pending
    // =======================================================================

    describe('GET runs/:runId/pending', () => {
      it('should call reconciliationService.getPendingReview with the runId', () => {
        const mockPayload = {
          summary: { totalAtoms: 5, passCount: 3, failCount: 2, qualityThreshold: 80 },
          pendingAtoms: [
            {
              tempId: 'atom-1',
              description: 'Test atom',
              category: 'functional',
              qualityScore: 75,
              passes: false,
              issues: ['Low quality'],
            },
          ],
          pendingMolecules: [],
        };
        mockReconciliationService.getPendingReview.mockReturnValue(mockPayload);

        const result = controller.getPendingReview('REC-abc12345');

        expect(mockReconciliationService.getPendingReview).toHaveBeenCalledWith('REC-abc12345');
        expect(result.summary.totalAtoms).toBe(5);
        expect(result.pendingAtoms).toHaveLength(1);
      });
    });

    // =======================================================================
    // POST /agents/reconciliation/runs/:runId/review
    // =======================================================================

    describe('POST runs/:runId/review', () => {
      it('should call reconciliationService.submitReviewAndResume with runId and DTO', async () => {
        const dto = {
          atomDecisions: [
            { recommendationId: 'atom-1', decision: 'approve' as const },
            { recommendationId: 'atom-2', decision: 'reject' as const, reason: 'Not atomic' },
          ],
          moleculeDecisions: [],
          comment: 'Looks good',
        };
        const mockResult = {
          runId: 'REC-abc12345',
          status: 'completed' as const,
          patch: { operations: [] },
          summary: {},
          invariantFindings: [],
          metadata: {},
          errors: [],
        };
        mockReconciliationService.submitReviewAndResume.mockResolvedValue(mockResult);

        const result = await controller.submitReview('REC-abc12345', dto);

        expect(mockReconciliationService.submitReviewAndResume).toHaveBeenCalledWith(
          'REC-abc12345',
          dto,
        );
        expect(result.runId).toBe('REC-abc12345');
      });

      it('should propagate errors when run is not found', async () => {
        const dto = { atomDecisions: [] };
        mockReconciliationService.submitReviewAndResume.mockRejectedValue(
          new Error('Run not found'),
        );

        await expect(controller.submitReview('invalid-run', dto)).rejects.toThrow('Run not found');
      });
    });

    // =======================================================================
    // GET /agents/reconciliation/runs/:runId/status
    // =======================================================================

    describe('GET runs/:runId/status', () => {
      it('should return runId and status from reconciliationService.getRunStatus', () => {
        mockReconciliationService.getRunStatus.mockReturnValue('interrupted');

        const result = controller.getRunStatus('REC-abc12345');

        expect(mockReconciliationService.getRunStatus).toHaveBeenCalledWith('REC-abc12345');
        expect(result).toEqual({ runId: 'REC-abc12345', status: 'interrupted' });
      });

      it('should return null status when run is not tracked', () => {
        mockReconciliationService.getRunStatus.mockReturnValue(null);

        const result = controller.getRunStatus('REC-unknown');

        expect(result).toEqual({ runId: 'REC-unknown', status: null });
      });
    });

    // =======================================================================
    // GET /agents/reconciliation/runs/:runId/metrics
    // =======================================================================

    describe('GET runs/:runId/metrics', () => {
      it('should call reconciliationService.getMetrics and return metrics', async () => {
        const mockMetrics = {
          runId: 'REC-abc12345',
          averageAtomConfidence: 85,
          averageAtomQualityScore: 90,
          averageMoleculeConfidence: 80,
          atomsPassingThreshold: 8,
          atomsFailingThreshold: 2,
          qualityThreshold: 80,
          categoryDistribution: { functional: 6, performance: 4 },
          atomStatusDistribution: { approved: 8, rejected: 2 },
          moleculeStatusDistribution: { approved: 3 },
          totalAtoms: 10,
          totalMolecules: 3,
        };
        mockReconciliationService.getMetrics.mockResolvedValue(mockMetrics);

        const result = await controller.getMetrics('REC-abc12345');

        expect(mockReconciliationService.getMetrics).toHaveBeenCalledWith('REC-abc12345');
        expect(result.runId).toBe('REC-abc12345');
        expect(result.totalAtoms).toBe(10);
        expect(result.averageAtomConfidence).toBe(85);
      });
    });

    // =======================================================================
    // GET /agents/reconciliation/runs
    // =======================================================================

    describe('GET runs', () => {
      it('should call reconciliationService.listActiveRuns and return the list', () => {
        const mockRuns = [
          {
            runId: 'REC-001',
            threadId: 'thread-001',
            status: 'running',
            startTime: new Date('2026-01-15'),
          },
          {
            runId: 'REC-002',
            threadId: 'thread-002',
            status: 'interrupted',
            startTime: new Date('2026-01-16'),
          },
        ];
        mockReconciliationService.listActiveRuns.mockReturnValue(mockRuns);

        const result = controller.listRuns();

        expect(mockReconciliationService.listActiveRuns).toHaveBeenCalled();
        expect(result).toHaveLength(2);
        expect(result[0].runId).toBe('REC-001');
        expect(result[1].status).toBe('interrupted');
      });

      it('should return empty array when no active runs', () => {
        mockReconciliationService.listActiveRuns.mockReturnValue([]);

        const result = controller.listRuns();

        expect(result).toEqual([]);
      });
    });

    // =======================================================================
    // GET /agents/reconciliation/runs/:runId
    // =======================================================================

    describe('GET runs/:runId', () => {
      it('should call reconciliationService.getRunDetails with the runId', async () => {
        const mockDetails = {
          id: 'uuid-123',
          runId: 'REC-abc12345',
          rootDirectory: '/test/repo',
          reconciliationMode: 'full-scan' as const,
          status: 'completed',
          createdAt: new Date('2026-01-15'),
          completedAt: new Date('2026-01-15'),
          summary: { totalAtoms: 10 },
          options: { qualityThreshold: 80 },
          currentCommitHash: 'abc123',
          deltaBaselineCommitHash: null,
          errorMessage: null,
        };
        mockReconciliationService.getRunDetails.mockResolvedValue(mockDetails);

        const result = await controller.getRunDetails('REC-abc12345');

        expect(mockReconciliationService.getRunDetails).toHaveBeenCalledWith('REC-abc12345');
        expect(result.runId).toBe('REC-abc12345');
        expect(result.reconciliationMode).toBe('full-scan');
      });
    });

    // =======================================================================
    // GET /agents/reconciliation/runs/:runId/recommendations
    // =======================================================================

    describe('GET runs/:runId/recommendations', () => {
      it('should call reconciliationService.getRecommendations with the runId', async () => {
        const mockRecommendations = {
          runId: 'REC-abc12345',
          atoms: [
            {
              id: 'uuid-1',
              tempId: 'atom-1',
              description: 'User authenticates',
              category: 'functional',
              confidence: 90,
              qualityScore: 85,
              status: 'approved',
              atomId: null,
              sourceTestFilePath: '/test/auth.spec.ts',
              sourceTestName: 'should authenticate user',
            },
          ],
          molecules: [
            {
              id: 'uuid-2',
              tempId: 'mol-1',
              name: 'Authentication',
              description: 'Auth flow',
              confidence: 88,
              status: 'approved',
              moleculeId: null,
              atomRecommendationIds: ['atom-1'],
            },
          ],
        };
        mockReconciliationService.getRecommendations.mockResolvedValue(mockRecommendations);

        const result = await controller.getRecommendations('REC-abc12345');

        expect(mockReconciliationService.getRecommendations).toHaveBeenCalledWith('REC-abc12345');
        expect(result.atoms).toHaveLength(1);
        expect(result.molecules).toHaveLength(1);
      });
    });

    // =======================================================================
    // GET /agents/reconciliation/runs/:runId/patch
    // =======================================================================

    describe('GET runs/:runId/patch', () => {
      it('should call reconciliationService.getPatch with the runId', async () => {
        const mockPatch = {
          runId: 'REC-abc12345',
          patchOps: [{ op: 'createAtom', data: {} }],
          metadata: {
            createdAt: new Date('2026-01-15'),
            mode: 'full-scan',
            commitHash: 'abc123',
            baselineCommitHash: null,
          },
        };
        mockReconciliationService.getPatch.mockResolvedValue(mockPatch);

        const result = await controller.getPatch('REC-abc12345');

        expect(mockReconciliationService.getPatch).toHaveBeenCalledWith('REC-abc12345');
        expect(result.runId).toBe('REC-abc12345');
        expect(result.patchOps).toHaveLength(1);
      });
    });

    // =======================================================================
    // POST /agents/reconciliation/runs/:runId/apply
    // =======================================================================

    describe('POST runs/:runId/apply', () => {
      it('should call applyService.applyPatch with constructed request', async () => {
        const body = {
          selections: ['atom-1', 'atom-2'],
          injectAnnotations: true,
        };
        const mockApplyResult = {
          runId: 'REC-abc12345',
          status: 'success' as const,
          atomsCreated: 2,
          moleculesCreated: 1,
          annotationsInjected: 2,
          operations: [],
        };
        mockApplyService.applyPatch.mockResolvedValue(mockApplyResult);

        const result = await controller.applyRecommendations('REC-abc12345', body);

        expect(mockApplyService.applyPatch).toHaveBeenCalledWith({
          runId: 'REC-abc12345',
          selections: ['atom-1', 'atom-2'],
          injectAnnotations: true,
        });
        expect(result.status).toBe('success');
        expect(result.atomsCreated).toBe(2);
      });

      it('should pass undefined selections and injectAnnotations when not provided', async () => {
        const body = {};
        const mockApplyResult = {
          runId: 'REC-abc12345',
          status: 'success' as const,
          atomsCreated: 5,
          moleculesCreated: 2,
          annotationsInjected: 0,
          operations: [],
        };
        mockApplyService.applyPatch.mockResolvedValue(mockApplyResult);

        await controller.applyRecommendations('REC-abc12345', body);

        expect(mockApplyService.applyPatch).toHaveBeenCalledWith({
          runId: 'REC-abc12345',
          selections: undefined,
          injectAnnotations: undefined,
        });
      });

      it('should propagate errors from apply service', async () => {
        const body = { selections: ['invalid'] };
        mockApplyService.applyPatch.mockRejectedValue(new Error('No recommendations to apply'));

        await expect(controller.applyRecommendations('REC-abc12345', body)).rejects.toThrow(
          'No recommendations to apply',
        );
      });
    });

    // =======================================================================
    // GET /agents/reconciliation/status
    // =======================================================================

    describe('GET status', () => {
      it('should return available true when service is available', () => {
        mockReconciliationService.isAvailable.mockReturnValue(true);

        const result = controller.getStatus();

        expect(mockReconciliationService.isAvailable).toHaveBeenCalled();
        expect(result).toEqual({ available: true });
      });

      it('should return available false when service is not available', () => {
        mockReconciliationService.isAvailable.mockReturnValue(false);

        const result = controller.getStatus();

        expect(result).toEqual({ available: false });
      });
    });

    // =======================================================================
    // GET /agents/reconciliation/recoverable
    // =======================================================================

    describe('GET recoverable', () => {
      it('should call reconciliationService.listRecoverableRuns', async () => {
        const mockRecoverable = [
          {
            runId: 'REC-failed1',
            runUuid: 'uuid-1',
            status: 'failed',
            createdAt: new Date('2026-01-15'),
            rootDirectory: '/repo',
            mode: 'full-scan',
            atomCount: 5,
            moleculeCount: 2,
            testCount: 10,
            lastError: 'LLM timeout',
          },
        ];
        mockReconciliationService.listRecoverableRuns.mockResolvedValue(mockRecoverable);

        const result = await controller.listRecoverableRuns();

        expect(mockReconciliationService.listRecoverableRuns).toHaveBeenCalled();
        expect(result).toHaveLength(1);
        expect(result[0].runId).toBe('REC-failed1');
        expect(result[0].lastError).toBe('LLM timeout');
      });

      it('should return empty array when no recoverable runs', async () => {
        mockReconciliationService.listRecoverableRuns.mockResolvedValue([]);

        const result = await controller.listRecoverableRuns();

        expect(result).toEqual([]);
      });
    });

    // =======================================================================
    // POST /agents/reconciliation/runs/:runId/recover
    // =======================================================================

    describe('POST runs/:runId/recover', () => {
      it('should call reconciliationService.recoverRun with the runId', async () => {
        const mockRecovery = {
          runId: 'REC-failed1',
          runUuid: 'uuid-1',
          recovered: true,
          atomCount: 5,
          moleculeCount: 2,
          testCount: 10,
          message: 'Run recovered with 5 atoms and 2 molecules',
        };
        mockReconciliationService.recoverRun.mockResolvedValue(mockRecovery);

        const result = await controller.recoverRun('REC-failed1');

        expect(mockReconciliationService.recoverRun).toHaveBeenCalledWith('REC-failed1');
        expect(result.recovered).toBe(true);
        expect(result.atomCount).toBe(5);
      });

      it('should propagate errors when run cannot be recovered', async () => {
        mockReconciliationService.recoverRun.mockRejectedValue(
          new Error('Run cannot be recovered'),
        );

        await expect(controller.recoverRun('REC-norec')).rejects.toThrow('Run cannot be recovered');
      });
    });

    // =======================================================================
    // Schedule Endpoints (with scheduler service present)
    // =======================================================================

    describe('GET schedule (with scheduler)', () => {
      it('should call schedulerService.getSchedule', () => {
        const mockSchedule = {
          enabled: true,
          cron: '0 2 * * *',
          mode: 'delta' as const,
          rootDirectory: '/repo',
          qualityThreshold: 80,
          excludePaths: ['node_modules'],
          lastRunAt: new Date('2026-01-15'),
          lastRunStatus: 'success' as const,
          nextRunAt: new Date('2026-01-16'),
          runCount: 5,
        };
        mockSchedulerService.getSchedule.mockReturnValue(mockSchedule);

        const result = controller.getSchedule();

        expect(mockSchedulerService.getSchedule).toHaveBeenCalled();
        expect(result.enabled).toBe(true);
        expect(result.cron).toBe('0 2 * * *');
      });
    });

    describe('POST schedule (with scheduler)', () => {
      it('should call schedulerService.setSchedule with the DTO', () => {
        const dto = { cron: '0 3 * * *', rootDirectory: '/repo', qualityThreshold: 90 };
        const mockSchedule = {
          enabled: true,
          cron: '0 3 * * *',
          mode: 'delta' as const,
          rootDirectory: '/repo',
          qualityThreshold: 90,
          excludePaths: [],
          lastRunAt: null,
          lastRunStatus: null,
          nextRunAt: new Date('2026-01-16'),
          runCount: 0,
        };
        mockSchedulerService.setSchedule.mockReturnValue(mockSchedule);

        const result = controller.setSchedule(dto);

        expect(mockSchedulerService.setSchedule).toHaveBeenCalledWith(dto);
        expect(result.cron).toBe('0 3 * * *');
        expect(result.qualityThreshold).toBe(90);
      });
    });

    describe('DELETE schedule (with scheduler)', () => {
      it('should call schedulerService.clearSchedule', () => {
        controller.deleteSchedule();

        expect(mockSchedulerService.clearSchedule).toHaveBeenCalled();
      });
    });

    describe('GET schedule/history (with scheduler)', () => {
      it('should call schedulerService.getHistory', () => {
        const mockHistory = [
          {
            runId: 'REC-sched1',
            startedAt: new Date('2026-01-15T02:00:00Z'),
            completedAt: new Date('2026-01-15T02:05:00Z'),
            status: 'success' as const,
            atomsFound: 10,
          },
          {
            runId: 'REC-sched2',
            startedAt: new Date('2026-01-16T02:00:00Z'),
            completedAt: new Date('2026-01-16T02:01:00Z'),
            status: 'skipped' as const,
            atomsFound: 0,
          },
        ];
        mockSchedulerService.getHistory.mockReturnValue(mockHistory);

        const result = controller.getScheduleHistory();

        expect(mockSchedulerService.getHistory).toHaveBeenCalled();
        expect(result).toHaveLength(2);
        expect(result[0].status).toBe('success');
      });
    });
  });

  // =========================================================================
  // Setup without scheduler service (optional dependency)
  // =========================================================================

  describe('without scheduler service', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [ReconciliationController],
        providers: [
          { provide: ReconciliationService, useValue: mockReconciliationService },
          { provide: ApplyService, useValue: mockApplyService },
          // ReconciliationSchedulerService intentionally not provided
        ],
      }).compile();

      controller = module.get<ReconciliationController>(ReconciliationController);
      jest.clearAllMocks();
    });

    describe('controller instantiation without scheduler', () => {
      it('should be instantiated even without scheduler service', () => {
        expect(controller).toBeDefined();
        expect(controller).toBeInstanceOf(ReconciliationController);
      });
    });

    describe('GET schedule (without scheduler)', () => {
      it('should return default disabled schedule info', () => {
        const result = controller.getSchedule();

        expect(result).toEqual({
          enabled: false,
          cron: '',
          mode: 'delta',
          rootDirectory: '.',
          qualityThreshold: 80,
          excludePaths: [],
          lastRunAt: null,
          lastRunStatus: null,
          nextRunAt: null,
          runCount: 0,
        });
      });
    });

    describe('POST schedule (without scheduler)', () => {
      it('should throw an error when scheduler is not available', () => {
        const dto = { cron: '0 3 * * *' };

        expect(() => controller.setSchedule(dto)).toThrow('Scheduler service is not available');
      });
    });

    describe('DELETE schedule (without scheduler)', () => {
      it('should be a no-op and not throw', () => {
        expect(() => controller.deleteSchedule()).not.toThrow();
      });
    });

    describe('GET schedule/history (without scheduler)', () => {
      it('should return an empty array', () => {
        const result = controller.getScheduleHistory();

        expect(result).toEqual([]);
      });
    });
  });
});
