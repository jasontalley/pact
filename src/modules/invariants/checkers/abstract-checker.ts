import { Logger } from '@nestjs/common';
import { Atom } from '../../atoms/atom.entity';
import { InvariantConfig } from '../invariant-config.entity';
import { InvariantCheckSeverity } from '../dto/invariant-check-result.dto';
import { InvariantChecker, InvariantCheckResult, CheckContext } from './interfaces';

/**
 * Abstract base class for invariant checkers
 *
 * Provides common functionality for all checkers:
 * - Logging
 * - Result creation helpers
 * - Default severity handling
 */
export abstract class AbstractInvariantChecker implements InvariantChecker {
  protected readonly logger: Logger;

  constructor(public readonly invariantId: string) {
    this.logger = new Logger(`${this.constructor.name}`);
  }

  /**
   * Check atoms against this invariant
   * Subclasses must implement this method
   */
  abstract check(
    atoms: Atom[],
    context: CheckContext,
    config: InvariantConfig,
  ): Promise<InvariantCheckResult>;

  /**
   * Create a passing result
   */
  protected createPassResult(
    config: InvariantConfig,
    message: string,
    affectedAtomIds: string[] = [],
  ): InvariantCheckResult {
    return {
      invariantId: this.invariantId,
      name: config.name,
      passed: true,
      severity: this.getSeverity(config),
      message,
      affectedAtomIds,
      suggestions: [],
    };
  }

  /**
   * Create a failing result
   */
  protected createFailResult(
    config: InvariantConfig,
    message: string,
    affectedAtomIds: string[] = [],
    suggestions: string[] = [],
  ): InvariantCheckResult {
    return {
      invariantId: this.invariantId,
      name: config.name,
      passed: false,
      severity: this.getSeverity(config),
      message: message || config.errorMessage,
      affectedAtomIds,
      suggestions: suggestions.length > 0 ? suggestions : this.getDefaultSuggestions(config),
    };
  }

  /**
   * Get severity from config (blocking = error, non-blocking = warning)
   */
  protected getSeverity(config: InvariantConfig): InvariantCheckSeverity {
    return config.isBlocking ? 'error' : 'warning';
  }

  /**
   * Get default suggestions from config
   */
  protected getDefaultSuggestions(config: InvariantConfig): string[] {
    if (config.errorMessage) {
      return [config.errorMessage];
    }
    return [];
  }

  /**
   * Log check start
   */
  protected logCheckStart(atomCount: number): void {
    this.logger.debug(`Checking ${atomCount} atoms against ${this.invariantId}`);
  }

  /**
   * Log check result
   */
  protected logCheckResult(result: InvariantCheckResult): void {
    if (result.passed) {
      this.logger.debug(`${this.invariantId} check passed`);
    } else {
      this.logger.debug(
        `${this.invariantId} check failed: ${result.message} (severity: ${result.severity})`,
      );
    }
  }
}
