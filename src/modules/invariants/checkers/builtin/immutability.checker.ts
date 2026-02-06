import { Atom } from '../../../atoms/atom.entity';
import { InvariantConfig } from '../../invariant-config.entity';
import { AbstractInvariantChecker } from '../abstract-checker';
import { InvariantCheckResult, CheckContext } from '../interfaces';

/**
 * INV-004: Commitment Is Immutable
 *
 * Committed intent may not be edited. It may only be superseded by a new commitment.
 *
 * This checker verifies that:
 * 1. Atoms being committed are in 'draft' status (not already committed)
 * 2. No committed atoms are being modified
 */
export class ImmutabilityChecker extends AbstractInvariantChecker {
  constructor() {
    super('INV-004');
  }

  async check(
    atoms: Atom[],
    context: CheckContext,
    config: InvariantConfig,
  ): Promise<InvariantCheckResult> {
    this.logCheckStart(atoms.length);

    const alreadyCommitted: Atom[] = [];
    const superseded: Atom[] = [];

    for (const atom of atoms) {
      if (atom.status === 'committed') {
        alreadyCommitted.push(atom);
      } else if (atom.status === 'superseded') {
        superseded.push(atom);
      }
    }

    const issues: string[] = [];
    const affectedAtomIds: string[] = [];

    if (alreadyCommitted.length > 0) {
      issues.push(
        `${alreadyCommitted.length} atom(s) are already committed: ${alreadyCommitted.map((a) => a.atomId).join(', ')}`,
      );
      affectedAtomIds.push(...alreadyCommitted.map((a) => a.id));
    }

    if (superseded.length > 0) {
      issues.push(
        `${superseded.length} atom(s) have been superseded: ${superseded.map((a) => a.atomId).join(', ')}`,
      );
      affectedAtomIds.push(...superseded.map((a) => a.id));
    }

    if (issues.length > 0) {
      const result = this.createFailResult(
        config,
        `Immutability violation: ${issues.join('; ')}`,
        affectedAtomIds,
        [
          'Only draft atoms can be committed',
          'Committed atoms cannot be modified - create a new atom to supersede',
          'Superseded atoms cannot be recommitted - they have been replaced',
        ],
      );
      this.logCheckResult(result);
      return result;
    }

    const result = this.createPassResult(
      config,
      'All atoms are in draft status and eligible for commitment',
      atoms.map((a) => a.id),
    );
    this.logCheckResult(result);
    return result;
  }
}
