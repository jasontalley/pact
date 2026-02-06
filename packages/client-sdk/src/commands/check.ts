/**
 * Check Command
 *
 * Runs a local reconciliation check using cached Main state
 * and local files. Produces an advisory plausibility report.
 *
 * This is the `pact check` developer command.
 *
 * IMPORTANT: Local = plausible, Canonical = true.
 * This command produces advisory reports only - it does not
 * update any canonical state on the server.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { MainCacheStore } from '../main-cache-store';
import { MainCache } from '../main-cache';
import { FileReader } from '../file-reader';
import { GitClient } from '../git-client';
import { LocalReconciliationReport } from '../types';

export interface CheckCommandOptions {
  /** Project root directory */
  projectRoot: string;
  /** Patterns to exclude from file scanning */
  excludePatterns?: string[];
  /** Maximum files to scan */
  maxFiles?: number;
  /** Maximum cache age before warning (milliseconds) */
  maxCacheAge?: number;
  /** Output file path (default: .pact/local-report.json) */
  outputPath?: string;
}

export interface CheckCommandResult {
  /** The generated report */
  report: LocalReconciliationReport;
  /** Path where report was saved */
  reportPath: string;
  /** Warnings about the check (e.g., stale cache) */
  warnings: string[];
}

/**
 * Execute the check command.
 *
 * Performs a local reconciliation using:
 * 1. Cached Main state (atoms, molecules, links)
 * 2. Local test files
 *
 * Produces a plausibility report showing:
 * - Plausible atom-test links found locally
 * - Orphan tests (no atom linkage)
 * - Uncovered atoms (no test linkage)
 *
 * @param options - Check command options
 * @returns Check result with report
 */
export async function check(options: CheckCommandOptions): Promise<CheckCommandResult> {
  const warnings: string[] = [];

  // Load cached Main state
  const cacheStore = new MainCacheStore({
    projectRoot: options.projectRoot,
  });

  let cache: MainCache;
  if (!cacheStore.exists()) {
    warnings.push('No Main state cache found. Run "pact pull" first for accurate results.');
    cache = new MainCache(); // Empty cache
  } else {
    cache = await cacheStore.load();

    // Check cache freshness
    const maxAge = options.maxCacheAge ?? 24 * 60 * 60 * 1000;
    if (cache.isStale(maxAge)) {
      warnings.push(
        `Cache is stale (last pulled: ${cache.getPulledAt()?.toISOString()}). Consider running "pact pull".`,
      );
    }
  }

  // Scan local test files
  const fileReader = new FileReader({
    projectRoot: options.projectRoot,
    excludePatterns: options.excludePatterns,
    maxFiles: options.maxFiles,
  });

  const manifest = await fileReader.buildManifest();

  // Get git commit hash if available
  let commitHash: string | undefined;
  try {
    const gitClient = new GitClient({ projectRoot: options.projectRoot });
    if (gitClient.isGitRepository()) {
      commitHash = gitClient.getCurrentCommitHash();
    }
  } catch {
    // Git not available
  }

  // Find plausible links by scanning test files for @atom annotations
  const plausibleLinks: LocalReconciliationReport['plausibleLinks'] = [];
  const linkedTestFiles = new Set<string>();

  for (const testFile of manifest.testFiles) {
    const content = await fileReader.readFile(testFile);
    if (!content) continue;

    // Find @atom annotations
    const atomAnnotations = findAtomAnnotations(content);

    for (const annotation of atomAnnotations) {
      const atom = cache.getAtom(annotation.atomId);
      const confidence = atom ? 1.0 : 0.5; // Lower confidence if atom not in cache

      plausibleLinks.push({
        atomId: annotation.atomId,
        testFile,
        confidence,
      });
      linkedTestFiles.add(testFile);
    }
  }

  // Find orphan tests (test files with no @atom annotations)
  const orphanTests = manifest.testFiles.filter((file) => !linkedTestFiles.has(file));

  // Find uncovered atoms (atoms with no test links in cache)
  const uncoveredAtoms = cache.getUncoveredAtoms().map((atom) => atom.id);

  // Build report
  const report: LocalReconciliationReport = {
    plausibleLinks,
    orphanTests,
    uncoveredAtoms,
    generatedAt: new Date(),
    commitHash,
    isAdvisory: true,
  };

  // Add quality summary if we have enough data
  if (plausibleLinks.length > 0) {
    const avgConfidence =
      plausibleLinks.reduce((sum, link) => sum + link.confidence, 0) / plausibleLinks.length;

    report.qualitySummary = {
      averageScore: avgConfidence * 100,
      gradeDistribution: {
        high: plausibleLinks.filter((l) => l.confidence >= 0.8).length,
        medium: plausibleLinks.filter((l) => l.confidence >= 0.5 && l.confidence < 0.8).length,
        low: plausibleLinks.filter((l) => l.confidence < 0.5).length,
      },
    };
  }

  // Save report
  const reportPath =
    options.outputPath ?? path.join(options.projectRoot, '.pact', 'local-report.json');

  // Ensure directory exists
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    await fs.promises.mkdir(reportDir, { recursive: true });
  }

  await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  return {
    report,
    reportPath,
    warnings,
  };
}

/**
 * Find @atom annotations in file content.
 */
function findAtomAnnotations(content: string): Array<{ atomId: string; line: number }> {
  const annotations: Array<{ atomId: string; line: number }> = [];
  const lines = content.split('\n');

  // Pattern to match @atom annotations
  // Supports: // @atom IA-001, /* @atom IA-001 */, # @atom IA-001
  const atomPattern = /@atom\s+(IA-\d+|[a-zA-Z0-9_-]+)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;

    // Reset regex state
    atomPattern.lastIndex = 0;

    while ((match = atomPattern.exec(line)) !== null) {
      annotations.push({
        atomId: match[1],
        line: i + 1,
      });
    }
  }

  return annotations;
}

/**
 * Create a check command with pre-configured options.
 * Useful for CLI tools.
 */
export function createCheckCommand(
  defaultOptions: Partial<CheckCommandOptions>,
): (options?: Partial<CheckCommandOptions>) => Promise<CheckCommandResult> {
  return (options?: Partial<CheckCommandOptions>) => {
    const mergedOptions = {
      ...defaultOptions,
      ...options,
    } as CheckCommandOptions;

    if (!mergedOptions.projectRoot) {
      throw new Error('projectRoot is required');
    }

    return check(mergedOptions);
  };
}

/**
 * Format the check result for CLI output.
 */
export function formatCheckResult(result: CheckCommandResult): string {
  const { report, warnings } = result;
  const lines: string[] = [];

  // Header
  lines.push('=== Pact Local Check Report ===');
  lines.push(`Generated: ${report.generatedAt.toISOString()}`);
  if (report.commitHash) {
    lines.push(`Commit: ${report.commitHash.substring(0, 8)}`);
  }
  lines.push('');

  // Warnings
  if (warnings.length > 0) {
    lines.push('⚠️  Warnings:');
    for (const warning of warnings) {
      lines.push(`   - ${warning}`);
    }
    lines.push('');
  }

  // Summary
  lines.push('📊 Summary:');
  lines.push(`   Plausible links: ${report.plausibleLinks.length}`);
  lines.push(`   Orphan tests: ${report.orphanTests.length}`);
  lines.push(`   Uncovered atoms: ${report.uncoveredAtoms.length}`);
  lines.push('');

  // Quality summary
  if (report.qualitySummary) {
    lines.push('📈 Quality:');
    lines.push(`   Average confidence: ${report.qualitySummary.averageScore.toFixed(1)}%`);
    lines.push(
      `   High confidence: ${report.qualitySummary.gradeDistribution.high || 0}`,
    );
    lines.push(
      `   Medium confidence: ${report.qualitySummary.gradeDistribution.medium || 0}`,
    );
    lines.push(
      `   Low confidence: ${report.qualitySummary.gradeDistribution.low || 0}`,
    );
    lines.push('');
  }

  // Orphan tests (if any)
  if (report.orphanTests.length > 0) {
    lines.push('📝 Orphan Tests (no @atom annotation):');
    const displayCount = Math.min(report.orphanTests.length, 10);
    for (let i = 0; i < displayCount; i++) {
      lines.push(`   - ${report.orphanTests[i]}`);
    }
    if (report.orphanTests.length > displayCount) {
      lines.push(`   ... and ${report.orphanTests.length - displayCount} more`);
    }
    lines.push('');
  }

  // Uncovered atoms (if any)
  if (report.uncoveredAtoms.length > 0) {
    lines.push('🔴 Uncovered Atoms (no test linkage):');
    const displayCount = Math.min(report.uncoveredAtoms.length, 10);
    for (let i = 0; i < displayCount; i++) {
      lines.push(`   - ${report.uncoveredAtoms[i]}`);
    }
    if (report.uncoveredAtoms.length > displayCount) {
      lines.push(`   ... and ${report.uncoveredAtoms.length - displayCount} more`);
    }
    lines.push('');
  }

  // Advisory notice
  lines.push('ℹ️  This report is advisory only (local = plausible).');
  lines.push('   Canonical truth requires CI-attested reconciliation.');

  return lines.join('\n');
}
