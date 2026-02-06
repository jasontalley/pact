/**
 * Agent Evaluation Module
 *
 * Barrel exports for the evaluation harness, scorers, and runners.
 *
 * @see docs/implementation-checklist-phase13.md
 */

// Types
export * from './run-artifact.types';

// Services
export { ArtifactCaptureService } from './artifact-capture.service';
export type { CaptureOptions } from './artifact-capture.service';

// Rubric Scorer
export { scoreReconciliationRubric, scoreInterviewRubric } from './rubric-scorer';
export type {
  DimensionScore,
  DimensionResult,
  RubricResult,
  ReconciliationScoringContext,
} from './rubric-scorer';

// Golden Runners
export { runReconciliationGolden } from './reconciliation-golden.runner';
export type { GoldenRunnerOptions, GoldenCaseResult } from './reconciliation-golden.runner';

export { runInterviewGolden } from './intent-interview-golden.runner';
export type {
  InterviewGoldenRunnerOptions,
  InterviewGoldenCaseResult,
} from './intent-interview-golden.runner';
