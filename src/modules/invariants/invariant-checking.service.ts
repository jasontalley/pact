import { Injectable, Logger } from '@nestjs/common';
import { Atom } from '../atoms/atom.entity';
import { InvariantsService } from './invariants.service';
import { CheckerRegistry } from './checkers/checker-registry';
import {
  CheckContext,
  InvariantCheckResult,
  AggregatedCheckResults,
  CheckingServiceOptions,
} from './checkers/interfaces';
import {
  InvariantCheckResultDto,
  InvariantCheckSummaryDto,
} from './dto/invariant-check-result.dto';

/**
 * Service for running invariant checks on atoms
 *
 * This service orchestrates the execution of all enabled invariant checkers
 * and aggregates the results. It's the main entry point for commitment
 * validation.
 */
@Injectable()
export class InvariantCheckingService {
  private readonly logger = new Logger(InvariantCheckingService.name);

  constructor(
    private readonly invariantsService: InvariantsService,
    private readonly checkerRegistry: CheckerRegistry,
  ) {}

  /**
   * Run all enabled invariant checks on the given atoms
   *
   * @param atoms - Atoms to check
   * @param context - Check context with project info and metadata
   * @param options - Optional configuration for check execution
   * @returns Aggregated check results
   */
  async checkAll(
    atoms: Atom[],
    context: CheckContext,
    options: CheckingServiceOptions = {},
  ): Promise<AggregatedCheckResults> {
    const { parallel = true, timeout = 30000, failFast = false } = options;

    this.logger.log(
      `Starting invariant checks for ${atoms.length} atoms (project: ${context.projectId || 'global'})`,
    );

    // Get enabled invariants for this project
    const enabledInvariants = await this.invariantsService.findEnabled(context.projectId);

    this.logger.debug(`Found ${enabledInvariants.length} enabled invariants`);

    const results: InvariantCheckResult[] = [];
    const checkPromises: Array<Promise<InvariantCheckResult | null>> = [];

    for (const invariantConfig of enabledInvariants) {
      const checker = this.checkerRegistry.get(invariantConfig.invariantId);

      if (!checker) {
        this.logger.warn(`No checker registered for invariant ${invariantConfig.invariantId}`);
        // Create a pass result for invariants without checkers (custom invariants without implementation)
        results.push({
          invariantId: invariantConfig.invariantId,
          name: invariantConfig.name,
          passed: true,
          severity: invariantConfig.isBlocking ? 'error' : 'warning',
          message: 'No checker implementation available (skipped)',
          affectedAtomIds: [],
          suggestions: [],
        });
        continue;
      }

      const checkPromise = this.runCheckerWithTimeout(
        checker.check(atoms, context, invariantConfig),
        timeout,
        invariantConfig.invariantId,
      );

      if (parallel) {
        checkPromises.push(checkPromise);
      } else {
        const result = await checkPromise;
        if (result) {
          results.push(result);
          if (failFast && !result.passed && result.severity === 'error') {
            this.logger.debug(`Fail-fast triggered by ${result.invariantId}`);
            break;
          }
        }
      }
    }

    if (parallel) {
      const parallelResults = await Promise.all(checkPromises);
      for (const result of parallelResults) {
        if (result) {
          results.push(result);
        }
      }
    }

    return this.aggregateResults(results);
  }

  /**
   * Run a single invariant check
   *
   * @param atoms - Atoms to check
   * @param invariantId - ID of the invariant to check
   * @param context - Check context
   * @returns Check result or null if invariant not found
   */
  async checkSingle(
    atoms: Atom[],
    invariantId: string,
    context: CheckContext,
  ): Promise<InvariantCheckResult | null> {
    const invariantConfig = await this.invariantsService.findByInvariantId(
      invariantId,
      context.projectId,
    );

    if (!invariantConfig) {
      this.logger.warn(`Invariant ${invariantId} not found`);
      return null;
    }

    const checker = this.checkerRegistry.get(invariantId);

    if (!checker) {
      this.logger.warn(`No checker registered for invariant ${invariantId}`);
      return null;
    }

    return checker.check(atoms, context, invariantConfig);
  }

  /**
   * Get a summary of check results suitable for API responses
   */
  toSummaryDto(results: AggregatedCheckResults): InvariantCheckSummaryDto {
    return {
      allPassed: results.allPassed,
      hasBlockingViolations: results.hasBlockingViolations,
      passedCount: results.passedCount,
      failedCount: results.failedCount,
      warningCount: results.warningCount,
      results: results.results.map((r) => this.toResultDto(r)),
    };
  }

  /**
   * Convert internal result to DTO
   */
  toResultDto(result: InvariantCheckResult): InvariantCheckResultDto {
    const dto = new InvariantCheckResultDto();
    dto.invariantId = result.invariantId;
    dto.name = result.name;
    dto.passed = result.passed;
    dto.severity = result.severity;
    dto.message = result.message;
    dto.affectedAtomIds = result.affectedAtomIds;
    dto.suggestions = result.suggestions;
    return dto;
  }

  /**
   * Convert results to DTO array
   */
  toResultDtos(results: InvariantCheckResult[]): InvariantCheckResultDto[] {
    return results.map((r) => this.toResultDto(r));
  }

  /**
   * Run a checker with timeout protection
   */
  private async runCheckerWithTimeout(
    checkPromise: Promise<InvariantCheckResult>,
    timeout: number,
    invariantId: string,
  ): Promise<InvariantCheckResult | null> {
    try {
      const timeoutPromise = new Promise<InvariantCheckResult>((_, reject) => {
        setTimeout(() => reject(new Error(`Checker timeout for ${invariantId}`)), timeout);
      });

      return await Promise.race([checkPromise, timeoutPromise]);
    } catch (error) {
      this.logger.error(
        `Checker error for ${invariantId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Return a failure result for checker errors
      return {
        invariantId,
        name: invariantId,
        passed: false,
        severity: 'error',
        message: `Checker error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        affectedAtomIds: [],
        suggestions: ['Contact support if this error persists'],
      };
    }
  }

  /**
   * Aggregate individual check results into a summary
   */
  private aggregateResults(results: InvariantCheckResult[]): AggregatedCheckResults {
    const passed = results.filter((r) => r.passed);
    const failed = results.filter((r) => !r.passed);
    const warnings = failed.filter((r) => r.severity === 'warning');
    const errors = failed.filter((r) => r.severity === 'error');

    return {
      results,
      allPassed: failed.length === 0,
      hasBlockingViolations: errors.length > 0,
      passedCount: passed.length,
      failedCount: failed.length,
      warningCount: warnings.length,
      blockingIssues: errors.map((r) => r.message),
      warnings: warnings.map((r) => r.message),
    };
  }
}
