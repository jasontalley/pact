/**
 * Reconciliation Schedule Configuration
 *
 * Configuration for automated cron-based reconciliation scheduling.
 * Used by ReconciliationSchedulerService to run periodic delta reconciliations.
 *
 * @see src/modules/agents/reconciliation-scheduler.service.ts
 */

export interface ReconciliationScheduleConfig {
  /** Whether the schedule is enabled */
  enabled: boolean;
  /** Cron expression for schedule timing (default: every 6 hours) */
  cron: string;
  /** Reconciliation mode - always delta for scheduled runs */
  mode: 'delta';
  /** Root directory to analyze */
  rootDirectory: string;
  /** Minimum quality threshold for atom acceptance (0-100) */
  qualityThreshold: number;
  /** Paths to exclude from analysis */
  excludePaths: string[];
}

export const DEFAULT_RECONCILIATION_SCHEDULE: ReconciliationScheduleConfig = {
  enabled: false,
  cron: '0 */6 * * *',
  mode: 'delta',
  rootDirectory: '.',
  qualityThreshold: 80,
  excludePaths: [],
};
