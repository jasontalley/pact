import { Atom } from '../../../atoms/atom.entity';
import { InvariantConfig } from '../../invariant-config.entity';
import { AbstractInvariantChecker } from '../abstract-checker';
import { InvariantCheckResult, CheckContext } from '../interfaces';

/**
 * INV-005: Traceability Is Mandatory
 *
 * All Realization and Evidence Artifacts must reference the Commitment Artifact they satisfy.
 * For atoms, this means they must have proper lineage (parentIntent or refinementHistory).
 *
 * This checker verifies that:
 * 1. Atoms have a parent intent or source identified
 * 2. Atoms have refinement history (if they've been refined)
 * 3. Atoms can be traced back to their origin
 */
export class TraceabilityChecker extends AbstractInvariantChecker {
  constructor() {
    super('INV-005');
  }

  async check(
    atoms: Atom[],
    context: CheckContext,
    config: InvariantConfig,
  ): Promise<InvariantCheckResult> {
    this.logCheckStart(atoms.length);

    const atomsLackingTraceability: Array<{
      atom: Atom;
      issues: string[];
    }> = [];

    for (const atom of atoms) {
      const issues: string[] = [];

      // Check for parent intent or some form of source
      const hasParentIntent = atom.parentIntent && atom.parentIntent.trim().length > 0;
      const hasRefinementHistory = atom.refinementHistory && atom.refinementHistory.length > 0;
      const hasCreatedBy = atom.createdBy && atom.createdBy.trim().length > 0;
      const hasMetadataSource = atom.metadata && (atom.metadata.source || atom.metadata.origin);

      // At least one form of traceability must exist
      if (!hasParentIntent && !hasRefinementHistory && !hasCreatedBy && !hasMetadataSource) {
        issues.push(
          'No traceability information found (no parentIntent, refinementHistory, createdBy, or metadata.source)',
        );
      }

      // If has refinement history, verify it's not empty
      if (hasRefinementHistory) {
        const validHistory = atom.refinementHistory.filter(
          (r) => r.feedback && r.previousDescription && r.newDescription,
        );
        if (validHistory.length === 0) {
          issues.push('Refinement history exists but contains no valid entries');
        }
      }

      if (issues.length > 0) {
        atomsLackingTraceability.push({ atom, issues });
      }
    }

    if (atomsLackingTraceability.length > 0) {
      const affectedAtomIds = atomsLackingTraceability.map((f) => f.atom.id);
      const issueDetails = atomsLackingTraceability
        .map((f) => `${f.atom.atomId}: ${f.issues.join(', ')}`)
        .join('; ');

      const result = this.createFailResult(
        config,
        `${atomsLackingTraceability.length} atom(s) lack proper traceability: ${issueDetails}`,
        affectedAtomIds,
        [
          'Ensure atoms have a parentIntent that describes the original user requirement',
          'Include createdBy to identify who created the atom',
          'Maintain refinementHistory when atoms are refined from initial input',
          'Add metadata.source or metadata.origin if created programmatically',
        ],
      );
      this.logCheckResult(result);
      return result;
    }

    const result = this.createPassResult(
      config,
      'All atoms have proper traceability information',
      atoms.map((a) => a.id),
    );
    this.logCheckResult(result);
    return result;
  }
}
