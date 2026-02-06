import { Injectable, Logger } from '@nestjs/common';
import { InvariantChecker, InvariantCheckerRegistry } from './interfaces';
import {
  ExplicitCommitmentChecker,
  BehavioralTestabilityChecker,
  NoAmbiguityChecker,
  ImmutabilityChecker,
  TraceabilityChecker,
  HumanCommitChecker,
  EvidenceImmutabilityChecker,
  RejectionLimitedChecker,
  AmbiguityResolutionChecker,
} from './builtin';

/**
 * Registry for invariant checkers
 *
 * Manages all registered checkers and provides lookup by invariant ID.
 * Built-in checkers are registered automatically on instantiation.
 */
@Injectable()
export class CheckerRegistry implements InvariantCheckerRegistry {
  private readonly logger = new Logger(CheckerRegistry.name);
  private readonly checkers: Map<string, InvariantChecker> = new Map();

  constructor() {
    this.registerBuiltinCheckers();
  }

  /**
   * Register all built-in checkers
   */
  private registerBuiltinCheckers(): void {
    const builtinCheckers: InvariantChecker[] = [
      new ExplicitCommitmentChecker(), // INV-001
      new BehavioralTestabilityChecker(), // INV-002
      new NoAmbiguityChecker(), // INV-003
      new ImmutabilityChecker(), // INV-004
      new TraceabilityChecker(), // INV-005
      new HumanCommitChecker(), // INV-006
      new EvidenceImmutabilityChecker(), // INV-007
      new RejectionLimitedChecker(), // INV-008
      new AmbiguityResolutionChecker(), // INV-009
    ];

    for (const checker of builtinCheckers) {
      this.register(checker);
    }

    this.logger.log(`Registered ${builtinCheckers.length} built-in invariant checkers`);
  }

  /**
   * Register a checker
   */
  register(checker: InvariantChecker): void {
    if (this.checkers.has(checker.invariantId)) {
      this.logger.warn(`Overwriting existing checker for ${checker.invariantId}`);
    }
    this.checkers.set(checker.invariantId, checker);
    this.logger.debug(`Registered checker for ${checker.invariantId}`);
  }

  /**
   * Get a checker by invariant ID
   */
  get(invariantId: string): InvariantChecker | undefined {
    return this.checkers.get(invariantId);
  }

  /**
   * Get all registered checkers
   */
  getAll(): InvariantChecker[] {
    return Array.from(this.checkers.values());
  }

  /**
   * Check if a checker is registered
   */
  has(invariantId: string): boolean {
    return this.checkers.has(invariantId);
  }

  /**
   * Unregister a checker (mainly for testing)
   */
  unregister(invariantId: string): boolean {
    return this.checkers.delete(invariantId);
  }

  /**
   * Get count of registered checkers
   */
  get size(): number {
    return this.checkers.size;
  }
}
