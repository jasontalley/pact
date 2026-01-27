import { Atom } from '../../../atoms/atom.entity';
import { InvariantConfig } from '../../invariant-config.entity';
import { AbstractInvariantChecker } from '../abstract-checker';
import { InvariantCheckResult, CheckContext } from '../interfaces';

/**
 * INV-008: Rejection Is Limited to Invariants
 *
 * The system may reject intent only due to violations of declared global invariants.
 *
 * This checker ensures that:
 * 1. Any rejection of atoms is based on declared invariant violations
 * 2. Arbitrary rejection is not permitted
 * 3. All rejection reasons are traceable to specific invariants
 *
 * Note: This is a meta-invariant that primarily affects how other invariants
 * report rejections. For commitment flow, it verifies that all checks are
 * properly declared and transparent.
 */
export class RejectionLimitedChecker extends AbstractInvariantChecker {
  constructor() {
    super('INV-008');
  }

  async check(
    atoms: Atom[],
    context: CheckContext,
    config: InvariantConfig,
  ): Promise<InvariantCheckResult> {
    this.logCheckStart(atoms.length);

    const issues: string[] = [];
    const affectedAtomIds: string[] = [];

    // This checker validates that the commitment context is proper
    // and that any metadata indicating rejection is based on invariants

    for (const atom of atoms) {
      // Check if atom has any metadata indicating rejection
      if (atom.metadata) {
        const rejection = atom.metadata.rejection as
          | { reason: string; invariantId?: string }
          | undefined;

        if (rejection) {
          // If there's a rejection, it must reference an invariant
          if (!rejection.invariantId) {
            issues.push(`Atom ${atom.atomId} has a rejection without invariant reference`);
            affectedAtomIds.push(atom.id);
          }
        }

        // Check for arbitrary rejection flags
        if (atom.metadata.rejected === true && !atom.metadata.rejectionInvariant) {
          issues.push(
            `Atom ${atom.atomId} is marked rejected without specifying the violating invariant`,
          );
          affectedAtomIds.push(atom.id);
        }
      }
    }

    // Check context for undeclared rejection reasons
    if (context.metadata?.rejectionReason && !context.metadata?.rejectionInvariant) {
      issues.push('Context contains rejection reason without referencing a specific invariant');
    }

    if (issues.length > 0) {
      const result = this.createFailResult(
        config,
        `Rejection transparency violation: ${issues.join('; ')}`,
        affectedAtomIds,
        [
          'All rejections must reference a specific declared invariant',
          'Arbitrary rejection of intent is not permitted',
          'If rejecting, specify which invariant (INV-XXX) was violated',
        ],
      );
      this.logCheckResult(result);
      return result;
    }

    const result = this.createPassResult(
      config,
      'All atoms and context comply with rejection limitation requirements',
      atoms.map((a) => a.id),
    );
    this.logCheckResult(result);
    return result;
  }
}
