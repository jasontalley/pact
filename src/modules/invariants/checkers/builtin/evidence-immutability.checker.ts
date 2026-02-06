import { Atom } from '../../../atoms/atom.entity';
import { InvariantConfig } from '../../invariant-config.entity';
import { AbstractInvariantChecker } from '../abstract-checker';
import { InvariantCheckResult, CheckContext } from '../interfaces';

/**
 * INV-007: Evidence Is First-Class and Immutable
 *
 * Evidence Artifacts may not be altered, suppressed, or discarded.
 *
 * Note: This checker is primarily relevant for Evidence Artifacts, which
 * are not yet implemented in the system. For atoms, this serves as a
 * placeholder that always passes, but will be extended when Evidence
 * Artifacts are added.
 *
 * Future checks will verify:
 * 1. Evidence linked to atoms is immutable
 * 2. Evidence cannot be deleted or modified
 * 3. Evidence references remain valid
 */
export class EvidenceImmutabilityChecker extends AbstractInvariantChecker {
  constructor() {
    super('INV-007');
  }

  async check(
    atoms: Atom[],
    context: CheckContext,
    config: InvariantConfig,
  ): Promise<InvariantCheckResult> {
    this.logCheckStart(atoms.length);

    // For now, this is a placeholder check that passes
    // It will be expanded when Evidence Artifacts are implemented
    //
    // Future implementation will:
    // 1. Check if any atoms have linked evidence
    // 2. Verify evidence hasn't been modified since linking
    // 3. Ensure evidence artifacts referenced in metadata exist

    // Check if any atoms have evidence metadata that might need validation
    const atomsWithEvidence: Atom[] = [];
    for (const atom of atoms) {
      if (
        atom.metadata &&
        (atom.metadata.evidence || atom.metadata.evidenceIds || atom.metadata.testResults)
      ) {
        atomsWithEvidence.push(atom);
      }
    }

    if (atomsWithEvidence.length > 0) {
      // Log that we found atoms with evidence metadata
      this.logger.debug(
        `Found ${atomsWithEvidence.length} atoms with evidence metadata (validation pending full Evidence Artifact implementation)`,
      );
    }

    // For now, always pass - this will be a real check when Evidence is implemented
    const result = this.createPassResult(
      config,
      atomsWithEvidence.length > 0
        ? `Evidence immutability check passed for ${atomsWithEvidence.length} atoms with evidence (full validation pending)`
        : 'No evidence artifacts to check (Evidence Artifact system not yet implemented)',
      atoms.map((a) => a.id),
    );
    this.logCheckResult(result);
    return result;
  }
}
