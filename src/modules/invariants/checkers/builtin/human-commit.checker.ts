import { Atom } from '../../../atoms/atom.entity';
import { InvariantConfig } from '../../invariant-config.entity';
import { AbstractInvariantChecker } from '../abstract-checker';
import { InvariantCheckResult, CheckContext } from '../interfaces';

/**
 * INV-006: Agents May Not Commit Intent
 *
 * Only humans may authorize commitment across the Commitment Boundary.
 *
 * This checker verifies that:
 * 1. The committedBy identifier appears to be a human, not an agent
 * 2. No automated system is attempting to commit without human authorization
 */
export class HumanCommitChecker extends AbstractInvariantChecker {
  // Patterns that suggest an agent or automated system
  private static readonly AGENT_PATTERNS = [
    /\bagent\b/i,
    /\bbot\b/i,
    /\bautomation\b/i,
    /\bsystem\b/i,
    /\bauto[_-]?commit/i,
    /\bci[_-]?cd\b/i,
    /\bpipeline\b/i,
    /\bscheduler\b/i,
    /\bcron\b/i,
    /\bservice[_-]?account/i,
    /\bapi[_-]?key\b/i,
    /\brobot\b/i,
    /\bscript\b/i,
  ];

  constructor() {
    super('INV-006');
  }

  async check(
    atoms: Atom[],
    context: CheckContext,
    config: InvariantConfig,
  ): Promise<InvariantCheckResult> {
    this.logCheckStart(atoms.length);

    const committedBy = context.committedBy;

    // Check 1: Must have committedBy
    if (!committedBy || committedBy.trim().length === 0) {
      const result = this.createFailResult(
        config,
        'No human identifier provided for commitment',
        [],
        [
          'Commitment must be authorized by a human',
          'Provide a valid user identifier (email, username, etc.)',
        ],
      );
      this.logCheckResult(result);
      return result;
    }

    // Check 2: committedBy should not match agent patterns
    const normalizedCommittedBy = committedBy.toLowerCase();
    const matchedPatterns: string[] = [];

    for (const pattern of HumanCommitChecker.AGENT_PATTERNS) {
      if (pattern.test(normalizedCommittedBy)) {
        matchedPatterns.push(pattern.source);
      }
    }

    if (matchedPatterns.length > 0) {
      const result = this.createFailResult(
        config,
        `Commitment appears to be from an automated system or agent: "${committedBy}" matches patterns: ${matchedPatterns.join(', ')}`,
        [],
        [
          'Only humans may authorize commitment across the Commitment Boundary',
          'If this is a legitimate human identifier, consider using a different format',
          'Use your email address or username as the committedBy identifier',
        ],
      );
      this.logCheckResult(result);
      return result;
    }

    // Check 3: Basic validation - should look like a reasonable identifier
    // (has at least one letter, not just numbers/symbols)
    if (!/[a-zA-Z]/.test(committedBy)) {
      const result = this.createFailResult(
        config,
        `Commitment identifier "${committedBy}" does not appear to be a valid human identifier`,
        [],
        [
          'Use a recognizable human identifier (email, username, full name)',
          'Identifier should contain letters',
        ],
      );
      this.logCheckResult(result);
      return result;
    }

    const result = this.createPassResult(
      config,
      `Commitment authorized by human identifier: ${committedBy}`,
      atoms.map((a) => a.id),
    );
    this.logCheckResult(result);
    return result;
  }
}
