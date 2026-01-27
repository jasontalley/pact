import { Atom } from '../../../atoms/atom.entity';
import { InvariantConfig } from '../../invariant-config.entity';
import { AbstractInvariantChecker } from '../abstract-checker';
import { InvariantCheckResult, CheckContext } from '../interfaces';

/**
 * INV-003: No Ambiguity in Commitment Artifacts
 *
 * Commitment Artifacts must not contain unresolved ambiguity or implementation directives.
 *
 * This checker uses pattern matching and (optionally) LLM analysis to detect:
 * 1. Vague terms (e.g., "fast", "user-friendly", "appropriate")
 * 2. Implementation directives (e.g., "use React", "implement with SQL")
 * 3. Unresolved questions (e.g., "TBD", "to be determined")
 * 4. Conditional language without clear conditions
 *
 * Note: Full LLM-based analysis requires the LLM service to be injected.
 * This implementation provides rule-based checking as a baseline.
 */
export class NoAmbiguityChecker extends AbstractInvariantChecker {
  // Vague terms that indicate ambiguity
  private static readonly VAGUE_TERMS = [
    /\bfast\b/i,
    /\bquick(ly)?\b/i,
    /\befficient(ly)?\b/i,
    /\bappropriate(ly)?\b/i,
    /\buser[- ]friendly\b/i,
    /\beasy\b/i,
    /\bsimple\b/i,
    /\bintuitive\b/i,
    /\bscalable\b/i,
    /\brobust\b/i,
    /\breliable\b/i,
    /\bsecure(ly)?\b/i, // Too vague without specifics
    /\bgood\b/i,
    /\bbetter\b/i,
    /\bbest\b/i,
    /\boptimal\b/i,
    /\breasonable\b/i,
    /\bacceptable\b/i,
    /\bsufficient\b/i,
    /\bas needed\b/i,
    /\bwhere applicable\b/i,
    /\bif necessary\b/i,
    /\betc\.?\b/i,
    /\band so on\b/i,
    /\band more\b/i,
  ];

  // Implementation directives (prescribing HOW instead of WHAT)
  private static readonly IMPLEMENTATION_DIRECTIVES = [
    /\buse\s+\w+\s+(framework|library|tool|language|database|api)\b/i,
    /\bimplement(ed)?\s+(with|using|in)\b/i,
    /\bwritten\s+in\b/i,
    /\bbuilt\s+(with|using)\b/i,
    /\bdeploy(ed)?\s+(to|on)\b/i,
    /\buse\s+react\b/i,
    /\buse\s+angular\b/i,
    /\buse\s+vue\b/i,
    /\buse\s+sql\b/i,
    /\buse\s+mongodb\b/i,
    /\buse\s+redis\b/i,
    /\buse\s+docker\b/i,
    /\buse\s+kubernetes\b/i,
    /\buse\s+aws\b/i,
    /\buse\s+gcp\b/i,
    /\buse\s+azure\b/i,
  ];

  // Unresolved markers
  private static readonly UNRESOLVED_MARKERS = [
    /\btbd\b/i,
    /\bto\s+be\s+determined\b/i,
    /\bto\s+be\s+defined\b/i,
    /\bto\s+be\s+decided\b/i,
    /\bpending\b/i,
    /\bunknown\b/i,
    /\bunclear\b/i,
    /\b\?\?\?+\b/,
    /\btodo\b/i,
    /\bfixme\b/i,
    /\bneed(s)?\s+to\s+(be\s+)?(define|determine|decide)\b/i,
    /\bwill\s+be\s+(defined|determined|decided)\b/i,
    /\bplaceholder\b/i,
  ];

  // Vague conditionals
  private static readonly VAGUE_CONDITIONALS = [
    /\bif\s+applicable\b/i,
    /\bwhen\s+necessary\b/i,
    /\bas\s+appropriate\b/i,
    /\bdepending\s+on\b/i,
    /\bwhere\s+relevant\b/i,
    /\boptionally\b/i,
    /\bpossibly\b/i,
    /\bmight\b/i,
    /\bcould\b/i,
    /\bmay\s+or\s+may\s+not\b/i,
    /\bsome(times)?\b/i,
    /\busually\b/i,
    /\bgenerally\b/i,
  ];

  constructor() {
    super('INV-003');
  }

  async check(
    atoms: Atom[],
    context: CheckContext,
    config: InvariantConfig,
  ): Promise<InvariantCheckResult> {
    this.logCheckStart(atoms.length);

    const atomsWithAmbiguity: Array<{
      atom: Atom;
      issues: string[];
    }> = [];

    for (const atom of atoms) {
      const issues: string[] = [];
      const description = atom.description;

      // Check for vague terms
      const vagueMatches = this.findMatches(description, NoAmbiguityChecker.VAGUE_TERMS);
      if (vagueMatches.length > 0) {
        issues.push(`Vague terms found: "${vagueMatches.join('", "')}"`);
      }

      // Check for implementation directives
      const implMatches = this.findMatches(
        description,
        NoAmbiguityChecker.IMPLEMENTATION_DIRECTIVES,
      );
      if (implMatches.length > 0) {
        issues.push(`Implementation directives found: "${implMatches.join('", "')}"`);
      }

      // Check for unresolved markers
      const unresolvedMatches = this.findMatches(
        description,
        NoAmbiguityChecker.UNRESOLVED_MARKERS,
      );
      if (unresolvedMatches.length > 0) {
        issues.push(`Unresolved markers found: "${unresolvedMatches.join('", "')}"`);
      }

      // Check for vague conditionals
      const conditionalMatches = this.findMatches(
        description,
        NoAmbiguityChecker.VAGUE_CONDITIONALS,
      );
      if (conditionalMatches.length > 0) {
        issues.push(`Vague conditionals found: "${conditionalMatches.join('", "')}"`);
      }

      if (issues.length > 0) {
        atomsWithAmbiguity.push({ atom, issues });
      }
    }

    if (atomsWithAmbiguity.length > 0) {
      const affectedAtomIds = atomsWithAmbiguity.map((f) => f.atom.id);
      const issueDetails = atomsWithAmbiguity
        .map((f) => `${f.atom.atomId}: ${f.issues.join(', ')}`)
        .join('; ');

      const result = this.createFailResult(
        config,
        `${atomsWithAmbiguity.length} atom(s) contain ambiguous language: ${issueDetails}`,
        affectedAtomIds,
        [
          'Replace vague terms with specific, measurable criteria',
          'Remove implementation directives - describe WHAT, not HOW',
          'Resolve all TBD/pending items before commitment',
          'Replace vague conditionals with explicit conditions',
        ],
      );
      this.logCheckResult(result);
      return result;
    }

    const result = this.createPassResult(
      config,
      'All atoms are free of detected ambiguity',
      atoms.map((a) => a.id),
    );
    this.logCheckResult(result);
    return result;
  }

  /**
   * Find all matches for patterns in text
   */
  private findMatches(text: string, patterns: RegExp[]): string[] {
    const matches: string[] = [];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        matches.push(match[0]);
      }
    }
    return matches;
  }
}
