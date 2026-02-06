/**
 * Coverage Collector Module
 *
 * Collects test coverage data from various formats (Istanbul, c8, lcov)
 * and transforms it for upload to the Pact server.
 */
import { CoverageData } from './types';
export interface CoverageCollectorOptions {
    /** Project root directory */
    projectRoot: string;
}
/**
 * Coverage collector for various coverage formats.
 */
export declare class CoverageCollector {
    private readonly projectRoot;
    constructor(options: CoverageCollectorOptions);
    /**
     * Collect coverage from a file path.
     * Auto-detects the format based on file content/extension.
     *
     * @param coveragePath - Path to coverage file (relative or absolute)
     * @returns Normalized coverage data
     */
    collectFromFile(coveragePath: string): Promise<CoverageData>;
    /**
     * Collect coverage from the default Istanbul/NYC output locations.
     *
     * @returns Coverage data or null if no coverage found
     */
    collectFromDefaults(): Promise<CoverageData | null>;
    /**
     * Parse Istanbul coverage-summary.json format.
     */
    private parseIstanbulSummary;
    /**
     * Parse Istanbul coverage-final.json or coverage.json format.
     */
    private parseIstanbulCoverage;
    /**
     * Parse Istanbul JSON format (can be either summary or detailed).
     */
    private parseIstanbulJson;
    /**
     * Parse LCOV format.
     */
    private parseLcov;
    /**
     * Normalize file path to be relative to project root.
     */
    private normalizeFilePath;
    /**
     * Get current git commit hash.
     */
    private getCommitHash;
}
