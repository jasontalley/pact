/**
 * ReconciliationSchedulerService Tests
 *
 * Tests for cron-based reconciliation scheduling (Phase 12.3).
 */

import { SchedulerRegistry } from '@nestjs/schedule';
import { ReconciliationSchedulerService } from './reconciliation-scheduler.service';
import { ReconciliationService } from './reconciliation.service';
import { createEmptyResult } from './graphs/types/reconciliation-result';

describe('ReconciliationSchedulerService', () => {
  let service: ReconciliationSchedulerService;
  let schedulerRegistry: SchedulerRegistry;
  let reconciliationService: jest.Mocked<ReconciliationService>;

  // Track registered cron jobs manually since SchedulerRegistry is real
  let mockCronJobs: Map<string, { stop: jest.Mock; start: jest.Mock; nextDate: jest.Mock }>;

  beforeEach(() => {
    mockCronJobs = new Map();

    schedulerRegistry = new SchedulerRegistry();

    reconciliationService = {
      analyze: jest.fn(),
      analyzeFullScan: jest.fn(),
      analyzeDelta: jest.fn(),
      isAvailable: jest.fn().mockReturnValue(true),
      analyzeWithInterrupt: jest.fn(),
      getPendingReview: jest.fn(),
      submitReviewAndResume: jest.fn(),
      getRunStatus: jest.fn(),
      listActiveRuns: jest.fn(),
      cleanupRuns: jest.fn(),
      getMetrics: jest.fn(),
      getRunDetails: jest.fn(),
      getRecommendations: jest.fn(),
      getPatch: jest.fn(),
      listRecoverableRuns: jest.fn(),
      recoverRun: jest.fn(),
    } as unknown as jest.Mocked<ReconciliationService>;

    service = new ReconciliationSchedulerService(schedulerRegistry, reconciliationService);
  });

  afterEach(() => {
    // Clean up any registered cron jobs
    service.onModuleDestroy();
  });

  describe('getSchedule', () => {
    it('should return disabled schedule by default', () => {
      const info = service.getSchedule();

      expect(info.enabled).toBe(false);
      expect(info.cron).toBe('0 */6 * * *');
      expect(info.mode).toBe('delta');
      expect(info.rootDirectory).toBe('.');
      expect(info.qualityThreshold).toBe(80);
      expect(info.excludePaths).toEqual([]);
      expect(info.lastRunAt).toBeNull();
      expect(info.lastRunStatus).toBeNull();
      expect(info.nextRunAt).toBeNull();
      expect(info.runCount).toBe(0);
    });
  });

  describe('setSchedule', () => {
    it('should enable the schedule with provided cron expression', () => {
      const info = service.setSchedule({ cron: '0 0 * * *' });

      expect(info.enabled).toBe(true);
      expect(info.cron).toBe('0 0 * * *');
      expect(info.mode).toBe('delta');
      expect(info.nextRunAt).toBeInstanceOf(Date);
    });

    it('should use default cron if none provided', () => {
      const info = service.setSchedule({});

      expect(info.enabled).toBe(true);
      expect(info.cron).toBe('0 */6 * * *');
    });

    it('should merge config with existing settings', () => {
      service.setSchedule({ rootDirectory: '/custom/path', qualityThreshold: 90 });
      const info = service.setSchedule({ cron: '0 0 * * *' });

      expect(info.rootDirectory).toBe('/custom/path');
      expect(info.qualityThreshold).toBe(90);
      expect(info.cron).toBe('0 0 * * *');
    });

    it('should set excludePaths', () => {
      const info = service.setSchedule({
        excludePaths: ['node_modules', 'dist'],
      });

      expect(info.excludePaths).toEqual(['node_modules', 'dist']);
    });

    it('should replace previous schedule when called again', () => {
      service.setSchedule({ cron: '0 0 * * *' });
      const info = service.setSchedule({ cron: '*/30 * * * *' });

      expect(info.enabled).toBe(true);
      expect(info.cron).toBe('*/30 * * * *');
    });
  });

  describe('clearSchedule', () => {
    it('should disable the schedule', () => {
      service.setSchedule({ cron: '0 0 * * *' });
      service.clearSchedule();

      const info = service.getSchedule();
      expect(info.enabled).toBe(false);
      expect(info.nextRunAt).toBeNull();
    });

    it('should not throw if no schedule is set', () => {
      expect(() => service.clearSchedule()).not.toThrow();
    });

    it('should be idempotent', () => {
      service.setSchedule({ cron: '0 0 * * *' });
      service.clearSchedule();
      service.clearSchedule();

      const info = service.getSchedule();
      expect(info.enabled).toBe(false);
    });
  });

  describe('getHistory', () => {
    it('should return empty history initially', () => {
      expect(service.getHistory()).toEqual([]);
    });

    it('should respect limit parameter', () => {
      // We need to trigger some runs to have history
      // Since executeScheduledRun is private, we test indirectly
      expect(service.getHistory(5)).toEqual([]);
    });
  });

  describe('isCurrentlyRunning', () => {
    it('should return false initially', () => {
      expect(service.isCurrentlyRunning()).toBe(false);
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear the schedule on module destroy', () => {
      service.setSchedule({ cron: '0 0 * * *' });
      service.onModuleDestroy();

      const info = service.getSchedule();
      expect(info.enabled).toBe(false);
    });
  });

  describe('scheduled execution', () => {
    it('should call reconciliationService.analyze on cron trigger', async () => {
      const mockResult = createEmptyResult('REC-test1234', 'delta');
      reconciliationService.analyze.mockResolvedValueOnce(mockResult);

      service.setSchedule({
        rootDirectory: '/test/repo',
        qualityThreshold: 85,
        excludePaths: ['vendor'],
      });

      // Access the private method via reflection to simulate cron trigger
      const executeMethod = (service as any).executeScheduledRun.bind(service);
      await executeMethod();

      expect(reconciliationService.analyze).toHaveBeenCalledWith({
        rootDirectory: '/test/repo',
        mode: 'delta',
        options: {
          qualityThreshold: 85,
          excludePaths: ['vendor'],
        },
      });
    });

    it('should record success in history', async () => {
      const mockResult = createEmptyResult('REC-test1234', 'delta');
      reconciliationService.analyze.mockResolvedValueOnce(mockResult);

      service.setSchedule({});

      const executeMethod = (service as any).executeScheduledRun.bind(service);
      await executeMethod();

      const history = service.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('success');
      expect(history[0].runId).toBe('REC-test1234');
      expect(history[0].startedAt).toBeInstanceOf(Date);
      expect(history[0].completedAt).toBeInstanceOf(Date);

      const info = service.getSchedule();
      expect(info.lastRunStatus).toBe('success');
      expect(info.lastRunAt).toBeInstanceOf(Date);
      expect(info.runCount).toBe(1);
    });

    it('should record failure in history when analyze throws', async () => {
      reconciliationService.analyze.mockRejectedValueOnce(new Error('LLM service unavailable'));

      service.setSchedule({});

      const executeMethod = (service as any).executeScheduledRun.bind(service);
      await executeMethod();

      const history = service.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('failed');
      expect(history[0].error).toBe('LLM service unavailable');
      expect(history[0].atomsFound).toBe(0);

      const info = service.getSchedule();
      expect(info.lastRunStatus).toBe('failed');
      expect(info.runCount).toBe(1);
    });

    it('should skip execution when a run is already in progress', async () => {
      // Simulate a long-running analyze call
      let resolveAnalyze: (value: any) => void;
      const analyzePromise = new Promise((resolve) => {
        resolveAnalyze = resolve;
      });
      reconciliationService.analyze.mockReturnValueOnce(analyzePromise as any);

      service.setSchedule({});

      const executeMethod = (service as any).executeScheduledRun.bind(service);

      // Start first run (will be in progress)
      const firstRun = executeMethod();

      // Try second run while first is still running
      await executeMethod();

      // Verify skip was recorded
      const history = service.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('skipped');

      const info = service.getSchedule();
      expect(info.lastRunStatus).toBe('skipped');

      // Resolve the first run
      resolveAnalyze!(createEmptyResult('REC-test1234', 'delta'));
      await firstRun;

      // Now history should have both entries
      const fullHistory = service.getHistory();
      expect(fullHistory).toHaveLength(2);
      expect(fullHistory[0].status).toBe('skipped');
      expect(fullHistory[1].status).toBe('success');
    });

    it('should reset isRunning flag after failure', async () => {
      reconciliationService.analyze.mockRejectedValueOnce(new Error('fail'));

      service.setSchedule({});
      const executeMethod = (service as any).executeScheduledRun.bind(service);
      await executeMethod();

      expect(service.isCurrentlyRunning()).toBe(false);
    });

    it('should accumulate history across multiple runs', async () => {
      const mockResult = createEmptyResult('REC-run1', 'delta');
      reconciliationService.analyze
        .mockResolvedValueOnce(mockResult)
        .mockRejectedValueOnce(new Error('oops'))
        .mockResolvedValueOnce({ ...mockResult, runId: 'REC-run3' });

      service.setSchedule({});
      const executeMethod = (service as any).executeScheduledRun.bind(service);

      await executeMethod();
      await executeMethod();
      await executeMethod();

      const history = service.getHistory();
      expect(history).toHaveLength(3);
      expect(history[0].status).toBe('success');
      expect(history[1].status).toBe('failed');
      expect(history[2].status).toBe('success');

      expect(service.getSchedule().runCount).toBe(3);
    });

    it('should limit history results when limit is specified', async () => {
      const mockResult = createEmptyResult('REC-run', 'delta');
      reconciliationService.analyze.mockResolvedValue(mockResult);

      service.setSchedule({});
      const executeMethod = (service as any).executeScheduledRun.bind(service);

      // Run 5 times
      for (let i = 0; i < 5; i++) {
        await executeMethod();
      }

      const limited = service.getHistory(3);
      expect(limited).toHaveLength(3);

      const full = service.getHistory();
      expect(full).toHaveLength(5);
    });
  });
});
