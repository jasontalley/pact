import { Atom } from '../../atoms/atom.entity';
import { InvariantConfig, InvariantCheckConfig } from '../invariant-config.entity';
import { InvariantCheckResultDto, InvariantCheckSeverity } from '../dto/invariant-check-result.dto';

/**
 * Context provided to invariant checkers during check execution
 */
export interface CheckContext {
  /** Project ID if checking for a specific project */
  projectId?: string;

  /** Human identifier performing the commitment */
  committedBy: string;

  /** Whether this is a preview (dry-run) check */
  isPreview: boolean;

  /** Additional context metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a single invariant check
 * Maps to InvariantCheckResultDto but used internally
 */
export interface InvariantCheckResult {
  invariantId: string;
  name: string;
  passed: boolean;
  severity: InvariantCheckSeverity;
  message: string;
  affectedAtomIds: string[];
  suggestions: string[];
}

/**
 * Interface for all invariant checkers
 *
 * Each checker implements a specific invariant validation.
 * Checkers can be:
 * - Built-in: Hardcoded logic (INV-001, INV-002, INV-004, INV-005, INV-006, INV-007, INV-008, INV-009)
 * - LLM-based: Use AI to check for violations (INV-003)
 * - Custom: User-defined rules
 */
export interface InvariantChecker {
  /** Invariant ID this checker handles (e.g., 'INV-001') */
  readonly invariantId: string;

  /**
   * Check atoms against this invariant
   *
   * @param atoms - Atoms to check
   * @param context - Check context with project info and metadata
   * @param config - Invariant configuration (may include custom thresholds)
   * @returns Check result indicating pass/fail and details
   */
  check(
    atoms: Atom[],
    context: CheckContext,
    config: InvariantConfig,
  ): Promise<InvariantCheckResult>;

  /**
   * Get suggestions for fixing violations
   *
   * @param result - The check result with violations
   * @param atoms - The atoms that were checked
   * @returns Array of suggestion strings
   */
  getSuggestions?(result: InvariantCheckResult, atoms: Atom[]): Promise<string[]>;
}

/**
 * Registry interface for managing invariant checkers
 */
export interface InvariantCheckerRegistry {
  /**
   * Register a checker for an invariant
   */
  register(checker: InvariantChecker): void;

  /**
   * Get a checker by invariant ID
   */
  get(invariantId: string): InvariantChecker | undefined;

  /**
   * Get all registered checkers
   */
  getAll(): InvariantChecker[];

  /**
   * Check if a checker is registered for an invariant
   */
  has(invariantId: string): boolean;
}

/**
 * Type for checker factory functions
 * Used to create checkers with dependencies
 */
export type InvariantCheckerFactory = () => InvariantChecker;

/**
 * Configuration options for the checking service
 */
export interface CheckingServiceOptions {
  /** Run checks in parallel (default: true) */
  parallel?: boolean;

  /** Timeout for individual checks in milliseconds (default: 30000) */
  timeout?: number;

  /** Whether to stop on first blocking failure (default: false) */
  failFast?: boolean;
}

/**
 * Aggregated results from running multiple invariant checks
 */
export interface AggregatedCheckResults {
  /** All individual check results */
  results: InvariantCheckResult[];

  /** Whether all checks passed */
  allPassed: boolean;

  /** Whether there are any blocking (error severity) violations */
  hasBlockingViolations: boolean;

  /** Count of passed checks */
  passedCount: number;

  /** Count of failed checks */
  failedCount: number;

  /** Count of warnings (non-blocking failures) */
  warningCount: number;

  /** Blocking issues (error severity failures) */
  blockingIssues: string[];

  /** Warning messages (warning severity failures) */
  warnings: string[];
}
