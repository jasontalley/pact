/**
 * Reconciliation Agent Entities
 *
 * These entities support the reconciliation agent's persistence schema
 * for tracking runs, recommendations, and test records.
 *
 * @see docs/implementation-checklist-phase5.md Section 3.5
 */

export { ReconciliationRun } from './reconciliation-run.entity';
export type {
  ReconciliationMode,
  ReconciliationRunStatus,
  ReconciliationSummary,
  ReconciliationRunOptions,
} from './reconciliation-run.entity';

export { AtomRecommendation } from './atom-recommendation.entity';
export type { AtomRecommendationStatus, ObservableOutcomeData } from './atom-recommendation.entity';

export { MoleculeRecommendation } from './molecule-recommendation.entity';
export type { MoleculeRecommendationStatus } from './molecule-recommendation.entity';

export { TestRecord } from './test-record.entity';
export type { TestRecordStatus } from './test-record.entity';
