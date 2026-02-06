/**
 * Molecule Verifier Service
 *
 * Provides molecule quality verification with INV-R004 guardrails.
 * Molecules are views/lenses, not truth - failures never block atom creation.
 *
 * **INV-R004 Guardrails**:
 * - Verifier output MUST NOT block atom creation
 * - Molecule confidence MUST NOT affect atom confidence
 * - Molecule failures MUST degrade to "unnamed cluster", NOT rejection
 *
 * @see docs/implementation-checklist-phase5.md Section 5.3
 */

import { Injectable, Logger } from '@nestjs/common';
import { InferredAtom, InferredMolecule } from './graphs/types/reconciliation-state';

/**
 * Molecule verification result
 */
export interface MoleculeVerificationResult {
  /** Molecule temp ID */
  moleculeTempId: string;
  /** Whether the molecule passes verification (informational only) */
  passes: boolean;
  /** Completeness score (0-100) */
  completenessScore: number;
  /** Atom-molecule fit score (0-100) */
  fitScore: number;
  /** Overall verification score (0-100) */
  overallScore: number;
  /** Feedback for refinement */
  feedback: string[];
  /** Issues found during verification */
  issues: string[];
  /**
   * Recommended action (NEVER 'reject' - per INV-R004)
   * Options: 'accept' | 'rename' | 'split' | 'merge'
   */
  recommendedAction: 'accept' | 'rename' | 'split' | 'merge';
  /** Original molecule (preserved regardless of verification) */
  molecule: InferredMolecule;
  /**
   * Degraded molecule if verification fails.
   * Per INV-R004: failures degrade to "unnamed cluster", not rejection.
   */
  degradedMolecule?: InferredMolecule;
}

/**
 * Batch verification result
 */
export interface BatchVerificationResult {
  /** Total molecules verified */
  totalMolecules: number;
  /** Molecules that passed verification */
  passedCount: number;
  /** Molecules that were degraded (but NOT rejected) */
  degradedCount: number;
  /** Individual verification results */
  results: MoleculeVerificationResult[];
  /**
   * Output molecules (original or degraded per INV-R004).
   * NEVER fewer molecules than input - failures become unnamed clusters.
   */
  outputMolecules: InferredMolecule[];
}

/**
 * Verification options
 */
export interface VerificationOptions {
  /** Minimum completeness score (default: 60) */
  minCompletenessScore?: number;
  /** Minimum fit score (default: 60) */
  minFitScore?: number;
  /** Minimum atoms per molecule for coherence check (default: 2) */
  minAtomsForCoherence?: number;
}

@Injectable()
export class MoleculeVerifierService {
  private readonly logger = new Logger(MoleculeVerifierService.name);

  /**
   * Verify a single molecule's quality.
   *
   * **INV-R004**: This method NEVER rejects a molecule. If verification fails,
   * the molecule is degraded to an "unnamed cluster" with zero confidence.
   *
   * @param molecule - The molecule to verify
   * @param atoms - All atoms (for context and fit checking)
   * @param options - Verification options
   * @returns Verification result (always includes molecule, possibly degraded)
   */
  verifyMolecule(
    molecule: InferredMolecule,
    atoms: InferredAtom[],
    options: VerificationOptions = {},
  ): MoleculeVerificationResult {
    const minCompletenessScore = options.minCompletenessScore ?? 60;
    const minFitScore = options.minFitScore ?? 60;
    const minAtomsForCoherence = options.minAtomsForCoherence ?? 2;

    const feedback: string[] = [];
    const issues: string[] = [];

    // Get atoms belonging to this molecule
    const moleculeAtoms = atoms.filter((a) => molecule.atomTempIds.includes(a.tempId));

    // Evaluate completeness: Does this molecule cover a coherent feature?
    const completenessScore = this.evaluateCompleteness(
      molecule,
      moleculeAtoms,
      minAtomsForCoherence,
      issues,
    );

    // Evaluate atom-molecule fit: Does each atom belong in this molecule?
    const fitScore = this.evaluateAtomFit(molecule, moleculeAtoms, issues);

    // Calculate overall score
    const overallScore = Math.round((completenessScore + fitScore) / 2);

    // Determine if passes threshold
    const passes = completenessScore >= minCompletenessScore && fitScore >= minFitScore;

    // Determine recommended action
    const recommendedAction = this.determineRecommendedAction(
      completenessScore,
      fitScore,
      moleculeAtoms.length,
      issues,
    );

    // Generate feedback
    feedback.push(...this.generateFeedback(molecule, completenessScore, fitScore, issues));

    // Create result
    const result: MoleculeVerificationResult = {
      moleculeTempId: molecule.tempId,
      passes,
      completenessScore,
      fitScore,
      overallScore,
      feedback,
      issues,
      recommendedAction,
      molecule,
    };

    // INV-R004: If verification fails, degrade to unnamed cluster (NEVER reject)
    if (!passes) {
      result.degradedMolecule = this.degradeToUnnamedCluster(molecule, issues);
      this.logger.log(
        `[INV-R004] Molecule ${molecule.tempId} degraded to unnamed cluster (completeness: ${completenessScore}, fit: ${fitScore})`,
      );
    }

    return result;
  }

  /**
   * Verify a batch of molecules.
   *
   * **INV-R004**: Output always contains same number of molecules as input.
   * Failed molecules are degraded, never removed.
   *
   * @param molecules - Molecules to verify
   * @param atoms - All atoms for context
   * @param options - Verification options
   * @returns Batch verification result with output molecules
   */
  verifyMolecules(
    molecules: InferredMolecule[],
    atoms: InferredAtom[],
    options: VerificationOptions = {},
  ): BatchVerificationResult {
    const results: MoleculeVerificationResult[] = [];
    const outputMolecules: InferredMolecule[] = [];
    let passedCount = 0;
    let degradedCount = 0;

    for (const molecule of molecules) {
      const result = this.verifyMolecule(molecule, atoms, options);
      results.push(result);

      if (result.passes) {
        passedCount++;
        outputMolecules.push(result.molecule);
      } else {
        degradedCount++;
        // INV-R004: Use degraded molecule, not rejection
        outputMolecules.push(result.degradedMolecule || result.molecule);
      }
    }

    // INV-R004 enforcement check: output count must equal input count
    if (outputMolecules.length !== molecules.length) {
      this.logger.error(
        `[INV-R004 VIOLATION] Output molecule count (${outputMolecules.length}) !== input count (${molecules.length})`,
      );
    }

    this.logger.log(
      `Verified ${molecules.length} molecules: ${passedCount} passed, ${degradedCount} degraded (INV-R004 enforced)`,
    );

    return {
      totalMolecules: molecules.length,
      passedCount,
      degradedCount,
      results,
      outputMolecules,
    };
  }

  /**
   * Evaluate molecule completeness.
   * Checks if the molecule covers a coherent feature.
   */
  private evaluateCompleteness(
    molecule: InferredMolecule,
    moleculeAtoms: InferredAtom[],
    minAtomsForCoherence: number,
    issues: string[],
  ): number {
    let score = 100;

    // Check: Has description
    if (!molecule.description || molecule.description.length < 10) {
      score -= 20;
      issues.push('Molecule description is too short or missing');
    }

    // Check: Has meaningful name (not generic)
    const genericNames = ['unnamed', 'misc', 'other', 'cluster', 'group'];
    if (genericNames.some((g) => molecule.name.toLowerCase().includes(g))) {
      score -= 15;
      issues.push('Molecule name is too generic');
    }

    // Check: Has enough atoms for coherence
    if (moleculeAtoms.length < minAtomsForCoherence) {
      score -= 15;
      issues.push(`Molecule has fewer than ${minAtomsForCoherence} atoms`);
    }

    // Check: Atom categories are related
    const categories = new Set(moleculeAtoms.map((a) => a.category));
    if (categories.size > 3) {
      score -= 10;
      issues.push('Molecule contains atoms from too many different categories');
    }

    // Check: Description mentions atoms' concepts
    const atomConcepts = moleculeAtoms.flatMap((a) =>
      a.description
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4),
    );
    const descriptionWords = molecule.description.toLowerCase().split(/\s+/);
    const conceptOverlap = atomConcepts.filter((c) => descriptionWords.includes(c)).length;
    if (conceptOverlap === 0 && atomConcepts.length > 0) {
      score -= 10;
      issues.push('Molecule description does not reference atom concepts');
    }

    return Math.max(0, score);
  }

  /**
   * Evaluate atom-molecule fit.
   * Checks if each atom belongs in this molecule.
   */
  private evaluateAtomFit(
    molecule: InferredMolecule,
    moleculeAtoms: InferredAtom[],
    issues: string[],
  ): number {
    if (moleculeAtoms.length === 0) {
      issues.push('Molecule has no atoms');
      return 0;
    }

    let totalFitScore = 0;

    for (const atom of moleculeAtoms) {
      let atomFit = 100;

      // Check: Atom description relates to molecule name
      const moleculeNameWords = molecule.name.toLowerCase().split(/\s+/);
      const atomDescWords = atom.description.toLowerCase().split(/\s+/);
      const nameOverlap = moleculeNameWords.filter((w) =>
        atomDescWords.some((aw) => aw.includes(w) || w.includes(aw)),
      ).length;

      if (nameOverlap === 0 && moleculeNameWords.length > 1) {
        atomFit -= 20;
      }

      // Check: Atom category matches molecule's implied category
      if (molecule.name.toLowerCase().includes('security') && atom.category !== 'security') {
        atomFit -= 15;
      }
      if (molecule.name.toLowerCase().includes('performance') && atom.category !== 'performance') {
        atomFit -= 15;
      }

      // Check: Atom has reasonable confidence
      if (atom.confidence < 50) {
        atomFit -= 10;
      }

      totalFitScore += atomFit;
    }

    const averageFit = Math.round(totalFitScore / moleculeAtoms.length);

    if (averageFit < 70) {
      issues.push('Some atoms may not fit well in this molecule');
    }

    return averageFit;
  }

  /**
   * Determine recommended action based on scores and issues.
   * Per INV-R004: NEVER recommend 'reject'.
   */
  private determineRecommendedAction(
    completenessScore: number,
    fitScore: number,
    atomCount: number,
    issues: string[],
  ): 'accept' | 'rename' | 'split' | 'merge' {
    // Too many categories: recommend split (check first, before accept)
    if (issues.some((i) => i.includes('categories'))) {
      return 'split';
    }

    // Poor fit: split
    if (fitScore < 50) {
      return 'split';
    }

    // Too few atoms: merge
    if (atomCount < 2) {
      return 'merge';
    }

    // Generic name but otherwise OK: rename
    if (issues.some((i) => i.includes('generic'))) {
      return 'rename';
    }

    // Default: accept (never reject per INV-R004)
    return 'accept';
  }

  /**
   * Generate feedback for molecule refinement.
   */
  private generateFeedback(
    molecule: InferredMolecule,
    completenessScore: number,
    fitScore: number,
    issues: string[],
  ): string[] {
    const feedback: string[] = [];

    if (completenessScore < 60) {
      feedback.push(
        'Consider improving molecule description to better summarize the grouped behaviors',
      );
    }

    if (fitScore < 60) {
      feedback.push('Review atom grouping - some atoms may fit better in other molecules');
    }

    if (issues.some((i) => i.includes('generic'))) {
      feedback.push(`Consider renaming "${molecule.name}" to something more descriptive`);
    }

    if (issues.some((i) => i.includes('categories'))) {
      feedback.push('Consider splitting into separate molecules by category for better cohesion');
    }

    if (issues.some((i) => i.includes('fewer than'))) {
      feedback.push('Consider merging with related molecules to improve coherence');
    }

    if (feedback.length === 0) {
      feedback.push('Molecule appears well-formed');
    }

    return feedback;
  }

  /**
   * Degrade a molecule to an unnamed cluster.
   * Per INV-R004: failures degrade to unnamed cluster, NOT rejection.
   */
  private degradeToUnnamedCluster(molecule: InferredMolecule, issues: string[]): InferredMolecule {
    return {
      ...molecule,
      name: 'Unnamed Cluster',
      description: `Atoms grouped for review (original: ${molecule.name}). ${issues.join('. ')}`,
      confidence: 0, // Zero confidence for degraded molecules
      reasoning: `[INV-R004 Degraded] Original reasoning: ${molecule.reasoning}. Issues: ${issues.join('; ')}`,
    };
  }
}
