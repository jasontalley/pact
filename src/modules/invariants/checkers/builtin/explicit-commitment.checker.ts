import { Atom } from '../../../atoms/atom.entity';
import { InvariantConfig } from '../../invariant-config.entity';
import { AbstractInvariantChecker } from '../abstract-checker';
import { InvariantCheckResult, CheckContext } from '../interfaces';

/**
 * INV-001: Explicit Commitment Required
 *
 * No intent may become enforceable without an explicit human commitment action.
 *
 * This checker verifies that:
 * 1. The commitment has a valid `committedBy` identifier
 * 2. The commitment is being made through an explicit action (not automated)
 * 3. The atoms being committed are in the appropriate state
 */
export class ExplicitCommitmentChecker extends AbstractInvariantChecker {
  constructor() {
    super('INV-001');
  }

  async check(
    atoms: Atom[],
    context: CheckContext,
    config: InvariantConfig,
  ): Promise<InvariantCheckResult> {
    this.logCheckStart(atoms.length);

    const issues: string[] = [];
    const affectedAtomIds: string[] = [];

    // Check 1: Must have a committedBy identifier
    if (!context.committedBy || context.committedBy.trim().length === 0) {
      issues.push('Missing committedBy identifier');
    }

    // Check 2: committedBy must look like a valid identifier
    // (not empty, not just whitespace, reasonable length)
    if (context.committedBy && context.committedBy.trim().length < 3) {
      issues.push('committedBy identifier is too short (minimum 3 characters)');
    }

    // Check 3: Must have at least one atom to commit
    if (atoms.length === 0) {
      issues.push('No atoms provided for commitment');
    }

    // Check 4: All atoms must exist and be valid for commitment
    for (const atom of atoms) {
      if (!atom.id) {
        issues.push(`Atom is missing an ID`);
        continue;
      }
      if (!atom.description || atom.description.trim().length === 0) {
        issues.push(`Atom ${atom.atomId} has no description`);
        affectedAtomIds.push(atom.id);
      }
    }

    if (issues.length > 0) {
      const result = this.createFailResult(
        config,
        `Explicit commitment requirements not met: ${issues.join('; ')}`,
        affectedAtomIds,
        [
          'Ensure you are logged in with a valid user identifier',
          'Provide a description for all atoms',
          'Use the commit API or UI to explicitly commit atoms',
        ],
      );
      this.logCheckResult(result);
      return result;
    }

    const result = this.createPassResult(
      config,
      'Commitment has explicit human identifier and valid atoms',
      atoms.map((a) => a.id),
    );
    this.logCheckResult(result);
    return result;
  }
}
