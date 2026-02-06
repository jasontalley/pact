/**
 * Reconciliation Scheduler Service
 *
 * Manages cron-based scheduling for automated reconciliation runs.
 * Uses @nestjs/schedule to register and manage cron jobs.
 *
 * Features:
 * - Configurable cron schedule for delta reconciliation
 * - Skip-if-running guard to prevent overlapping executions
 * - Execution history tracking
 * - Schedule info with next run time
 *
 * @see src/config/reconciliation.config.ts
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ReconciliationService } from './reconciliation.service';
import {
  ReconciliationScheduleConfig,
  DEFAULT_RECONCILIATION_SCHEDULE,
} from '../../config/reconciliation.config';

/**
 * Current schedule status and configuration
 */
export interface ScheduleInfo {
  enabled: boolean;
  cron: string;
  mode: 'delta';
  rootDirectory: string;
  qualityThreshold: number;
  excludePaths: string[];
  lastRunAt: Date | null;
  lastRunStatus: 'success' | 'failed' | 'skipped' | null;
  nextRunAt: Date | null;
  runCount: number;
}

/**
 * A single entry in the schedule execution history
 */
export interface ScheduleHistoryEntry {
  runId: string;
  startedAt: Date;
  completedAt: Date;
  status: 'success' | 'failed' | 'skipped';
  atomsFound: number;
  error?: string;
}

@Injectable()
export class ReconciliationSchedulerService implements OnModuleDestroy {
  private readonly logger = new Logger(ReconciliationSchedulerService.name);
  private config: ReconciliationScheduleConfig = { ...DEFAULT_RECONCILIATION_SCHEDULE };
  private isRunning = false;
  private lastRunAt: Date | null = null;
  private lastRunStatus: 'success' | 'failed' | 'skipped' | null = null;
  private runCount = 0;
  private readonly history: ScheduleHistoryEntry[] = [];
  private static readonly CRON_JOB_NAME = 'reconciliation-schedule';

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  onModuleDestroy(): void {
    this.clearSchedule();
  }

  /**
   * Set or update the reconciliation schedule.
   *
   * @param config - Partial schedule configuration to merge with current config
   * @returns Current schedule info after update
   */
  setSchedule(config: Partial<ReconciliationScheduleConfig>): ScheduleInfo {
    // Clear existing schedule if any
    this.clearSchedule();

    // Merge with current config (which may have prior settings)
    this.config = { ...this.config, ...config, enabled: true };

    // Create new cron job
    const job = new CronJob(this.config.cron, () => this.executeScheduledRun());

    this.schedulerRegistry.addCronJob(ReconciliationSchedulerService.CRON_JOB_NAME, job);
    job.start();

    this.logger.log(`Reconciliation schedule set: ${this.config.cron}`);
    return this.getSchedule();
  }

  /**
   * Clear the reconciliation schedule and disable it.
   */
  clearSchedule(): void {
    try {
      const job = this.schedulerRegistry.getCronJob(ReconciliationSchedulerService.CRON_JOB_NAME);
      if (job) {
        job.stop();
        this.schedulerRegistry.deleteCronJob(ReconciliationSchedulerService.CRON_JOB_NAME);
      }
    } catch {
      // Job doesn't exist, nothing to clear
    }
    this.config.enabled = false;
    this.logger.log('Reconciliation schedule cleared');
  }

  /**
   * Get current schedule info including next run time.
   *
   * @returns Current schedule configuration and status
   */
  getSchedule(): ScheduleInfo {
    let nextRunAt: Date | null = null;
    if (this.config.enabled) {
      try {
        const job = this.schedulerRegistry.getCronJob(ReconciliationSchedulerService.CRON_JOB_NAME);
        nextRunAt = job?.nextDate()?.toJSDate() ?? null;
      } catch {
        // Job not registered
      }
    }

    return {
      enabled: this.config.enabled,
      cron: this.config.cron,
      mode: this.config.mode,
      rootDirectory: this.config.rootDirectory,
      qualityThreshold: this.config.qualityThreshold,
      excludePaths: this.config.excludePaths,
      lastRunAt: this.lastRunAt,
      lastRunStatus: this.lastRunStatus,
      nextRunAt,
      runCount: this.runCount,
    };
  }

  /**
   * Get schedule execution history.
   *
   * @param limit - Maximum number of history entries to return (default: 20)
   * @returns Array of history entries, most recent last
   */
  getHistory(limit = 20): ScheduleHistoryEntry[] {
    return this.history.slice(-limit);
  }

  /**
   * Check if a scheduled run is currently executing.
   *
   * @returns True if a scheduled run is in progress
   */
  isCurrentlyRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Execute a scheduled reconciliation run.
   * Skips if a previous run is still in progress.
   */
  private async executeScheduledRun(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Skipping scheduled run — previous run still in progress');
      this.history.push({
        runId: '',
        startedAt: new Date(),
        completedAt: new Date(),
        status: 'skipped',
        atomsFound: 0,
      });
      this.lastRunStatus = 'skipped';
      return;
    }

    this.isRunning = true;
    const startedAt = new Date();
    this.logger.log('Starting scheduled reconciliation run...');

    try {
      const result = await this.reconciliationService.analyze({
        rootDirectory: this.config.rootDirectory,
        mode: 'delta',
        options: {
          qualityThreshold: this.config.qualityThreshold,
          excludePaths: this.config.excludePaths,
        },
      });

      const atomsFound = result.summary?.inferredAtomsCount ?? 0;

      this.history.push({
        runId: result.runId || '',
        startedAt,
        completedAt: new Date(),
        status: 'success',
        atomsFound,
      });

      this.lastRunAt = new Date();
      this.lastRunStatus = 'success';
      this.runCount++;

      this.logger.log(`Scheduled run complete. Found ${atomsFound} atom recommendations.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Scheduled reconciliation run failed: ${message}`);

      this.history.push({
        runId: '',
        startedAt,
        completedAt: new Date(),
        status: 'failed',
        atomsFound: 0,
        error: message,
      });

      this.lastRunAt = new Date();
      this.lastRunStatus = 'failed';
      this.runCount++;
    } finally {
      this.isRunning = false;
    }
  }
}
