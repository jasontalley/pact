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
export declare function check(options: CheckCommandOptions): Promise<CheckCommandResult>;
/**
 * Create a check command with pre-configured options.
 * Useful for CLI tools.
 */
export declare function createCheckCommand(defaultOptions: Partial<CheckCommandOptions>): (options?: Partial<CheckCommandOptions>) => Promise<CheckCommandResult>;
/**
 * Format the check result for CLI output.
 */
export declare function formatCheckResult(result: CheckCommandResult): string;
