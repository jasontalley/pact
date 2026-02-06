import { Atom } from '../../../atoms/atom.entity';
import { InvariantConfig } from '../../invariant-config.entity';
import { AbstractInvariantChecker } from '../abstract-checker';
import { InvariantCheckResult, CheckContext } from '../interfaces';

/**
 * INV-002: Intent Atoms Must Be Behaviorally Testable
 *
 * Every committed Intent Atom must describe behavior that is observable and falsifiable.
 *
 * This checker verifies that:
 * 1. Atoms have a minimum quality score (default: 60)
 * 2. Atoms have observable outcomes defined
 * 3. Atoms have falsifiability criteria defined
 */
export class BehavioralTestabilityChecker extends AbstractInvariantChecker {
  constructor() {
    super('INV-002');
  }

  async check(
    atoms: Atom[],
    context: CheckContext,
    config: InvariantConfig,
  ): Promise<InvariantCheckResult> {
    this.logCheckStart(atoms.length);

    // Get minimum quality score from config (default: 60)
    const minQualityScore =
      (config.checkConfig as { minQualityScore?: number })?.minQualityScore ?? 60;

    const failingAtoms: Array<{
      atom: Atom;
      issues: string[];
    }> = [];

    for (const atom of atoms) {
      const issues: string[] = [];

      // Check quality score
      if (atom.qualityScore === null || atom.qualityScore === undefined) {
        issues.push('No quality score assigned');
      } else if (atom.qualityScore < minQualityScore) {
        issues.push(
          `Quality score ${atom.qualityScore} is below minimum threshold ${minQualityScore}`,
        );
      }

      // Check for observable outcomes
      if (!atom.observableOutcomes || atom.observableOutcomes.length === 0) {
        issues.push('No observable outcomes defined');
      }

      // Check for falsifiability criteria
      if (!atom.falsifiabilityCriteria || atom.falsifiabilityCriteria.length === 0) {
        issues.push('No falsifiability criteria defined');
      }

      if (issues.length > 0) {
        failingAtoms.push({ atom, issues });
      }
    }

    if (failingAtoms.length > 0) {
      const affectedAtomIds = failingAtoms.map((f) => f.atom.id);
      const issueDetails = failingAtoms
        .map((f) => `${f.atom.atomId}: ${f.issues.join(', ')}`)
        .join('; ');

      const result = this.createFailResult(
        config,
        `${failingAtoms.length} atom(s) do not meet behavioral testability requirements: ${issueDetails}`,
        affectedAtomIds,
        [
          'Improve atom descriptions to be more specific and measurable',
          'Add observable outcomes that describe external effects',
          'Add falsifiability criteria that describe conditions for failure',
          `Ensure quality score is at least ${minQualityScore}`,
        ],
      );
      this.logCheckResult(result);
      return result;
    }

    const result = this.createPassResult(
      config,
      'All atoms meet behavioral testability requirements',
      atoms.map((a) => a.id),
    );
    this.logCheckResult(result);
    return result;
  }
}
