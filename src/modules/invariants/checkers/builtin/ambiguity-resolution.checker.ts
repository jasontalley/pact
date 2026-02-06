import { Atom } from '../../../atoms/atom.entity';
import { InvariantConfig } from '../../invariant-config.entity';
import { AbstractInvariantChecker } from '../abstract-checker';
import { InvariantCheckResult, CheckContext } from '../interfaces';

/**
 * INV-009: Post-Commitment Ambiguity Must Be Resolved Explicitly
 *
 * Ambiguity discovered after commitment may never be resolved in place.
 * It must result in either a superseding commitment or an explicit
 * Clarification Artifact.
 *
 * This checker verifies that:
 * 1. Atoms being committed don't reference unresolved clarifications
 * 2. Any clarification notes are properly documented
 * 3. Supersession chains are used for ambiguity resolution
 *
 * Note: This checker is most relevant when re-committing or superseding
 * atoms. For initial commitment, it validates that the atoms don't have
 * unresolved clarification requirements.
 */
export class AmbiguityResolutionChecker extends AbstractInvariantChecker {
  constructor() {
    super('INV-009');
  }

  async check(
    atoms: Atom[],
    context: CheckContext,
    config: InvariantConfig,
  ): Promise<InvariantCheckResult> {
    this.logCheckStart(atoms.length);

    const atomsWithIssues: Array<{
      atom: Atom;
      issues: string[];
    }> = [];

    for (const atom of atoms) {
      const issues: string[] = [];

      // Check for unresolved clarifications in metadata
      if (atom.metadata) {
        // Check for pending clarifications
        const pendingClarifications = atom.metadata.pendingClarifications as string[] | undefined;
        if (pendingClarifications && pendingClarifications.length > 0) {
          issues.push(
            `Has ${pendingClarifications.length} unresolved clarification(s): ${pendingClarifications.join(', ')}`,
          );
        }

        // Check for ambiguity flags
        if (atom.metadata.hasAmbiguity === true) {
          issues.push('Marked as having unresolved ambiguity');
        }

        // Check for needs clarification flag
        if (atom.metadata.needsClarification === true) {
          const clarificationNote = atom.metadata.clarificationNote || 'unspecified';
          issues.push(`Needs clarification: ${clarificationNote}`);
        }

        // Check for in-place resolution attempts (not allowed)
        if (atom.metadata.inPlaceResolution === true) {
          issues.push(
            'Contains in-place resolution marker - ambiguity must be resolved via supersession',
          );
        }
      }

      // Check refinement history for unresolved ambiguity notes
      if (atom.refinementHistory && atom.refinementHistory.length > 0) {
        const unresolvedInHistory = atom.refinementHistory.filter((r) => {
          const feedback = r.feedback.toLowerCase();
          return (
            feedback.includes('needs clarification') ||
            feedback.includes('ambiguous') ||
            feedback.includes('unclear') ||
            feedback.includes('tbd')
          );
        });

        // If the last refinement mentions ambiguity, it might be unresolved
        if (unresolvedInHistory.length > 0) {
          const lastRefinement = atom.refinementHistory[atom.refinementHistory.length - 1];
          if (unresolvedInHistory.includes(lastRefinement)) {
            issues.push('Last refinement indicates unresolved ambiguity in feedback');
          }
        }
      }

      if (issues.length > 0) {
        atomsWithIssues.push({ atom, issues });
      }
    }

    if (atomsWithIssues.length > 0) {
      const affectedAtomIds = atomsWithIssues.map((f) => f.atom.id);
      const issueDetails = atomsWithIssues
        .map((f) => `${f.atom.atomId}: ${f.issues.join(', ')}`)
        .join('; ');

      const result = this.createFailResult(
        config,
        `${atomsWithIssues.length} atom(s) have unresolved ambiguity requiring explicit resolution: ${issueDetails}`,
        affectedAtomIds,
        [
          'Resolve ambiguity before committing',
          'Create a Clarification Artifact to document resolution',
          'If ambiguity was discovered post-commitment, create a superseding atom',
          'Clear pendingClarifications and needs-clarification flags after resolution',
        ],
      );
      this.logCheckResult(result);
      return result;
    }

    const result = this.createPassResult(
      config,
      'All atoms have properly resolved any ambiguity',
      atoms.map((a) => a.id),
    );
    this.logCheckResult(result);
    return result;
  }
}
