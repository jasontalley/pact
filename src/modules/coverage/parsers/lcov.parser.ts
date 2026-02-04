import {
  CoverageSummary,
  CoverageFileDetail,
  CoverageDimensionSummary,
} from '../coverage-report.entity';

/**
 * Parser result returned by all coverage parsers
 */
export interface CoverageParserResult {
  summary: CoverageSummary;
  files: CoverageFileDetail[];
}

/**
 * Interface that all coverage parsers implement
 */
export interface CoverageParser {
  /** Check if this parser can handle the given content */
  canParse(content: string): boolean;
  /** Parse the content into structured coverage data */
  parse(content: string): CoverageParserResult;
}

/**
 * Tracks coverage data for a single file during lcov parsing
 */
interface LcovFileData {
  filePath: string;
  linesFound: number;
  linesHit: number;
  functionsFound: number;
  functionsHit: number;
  branchesFound: number;
  branchesHit: number;
  coveredLines: Set<number>;
  allLines: Set<number>;
}

/**
 * Create a zero-value dimension summary
 */
function zeroDimension(): CoverageDimensionSummary {
  return { total: 0, covered: 0, pct: 0 };
}

/**
 * Calculate percentage safely (avoid division by zero)
 */
function pct(covered: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((covered / total) * 10000) / 100;
}

/**
 * Parser for LCOV format coverage reports.
 *
 * LCOV format uses line-based records:
 * - SF:<filepath>     Source file path
 * - FNF:<count>       Functions found
 * - FNH:<count>       Functions hit
 * - BRF:<count>       Branches found
 * - BRH:<count>       Branches hit
 * - LF:<count>        Lines found
 * - LH:<count>        Lines hit
 * - DA:<line>,<count>  Line execution count
 * - end_of_record     End of file record
 */
export class LcovParser implements CoverageParser {
  canParse(content: string): boolean {
    // LCOV format starts with TN: or SF: lines
    return /^(TN:|SF:)/m.test(content);
  }

  parse(content: string): CoverageParserResult {
    const files: CoverageFileDetail[] = [];
    const lines = content.split('\n');

    let currentFile: LcovFileData | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('SF:')) {
        // Start of a new source file
        currentFile = {
          filePath: trimmed.substring(3),
          linesFound: 0,
          linesHit: 0,
          functionsFound: 0,
          functionsHit: 0,
          branchesFound: 0,
          branchesHit: 0,
          coveredLines: new Set(),
          allLines: new Set(),
        };
      } else if (trimmed.startsWith('LF:') && currentFile) {
        currentFile.linesFound = parseInt(trimmed.substring(3), 10) || 0;
      } else if (trimmed.startsWith('LH:') && currentFile) {
        currentFile.linesHit = parseInt(trimmed.substring(3), 10) || 0;
      } else if (trimmed.startsWith('FNF:') && currentFile) {
        currentFile.functionsFound = parseInt(trimmed.substring(4), 10) || 0;
      } else if (trimmed.startsWith('FNH:') && currentFile) {
        currentFile.functionsHit = parseInt(trimmed.substring(4), 10) || 0;
      } else if (trimmed.startsWith('BRF:') && currentFile) {
        currentFile.branchesFound = parseInt(trimmed.substring(4), 10) || 0;
      } else if (trimmed.startsWith('BRH:') && currentFile) {
        currentFile.branchesHit = parseInt(trimmed.substring(4), 10) || 0;
      } else if (trimmed.startsWith('DA:') && currentFile) {
        const parts = trimmed.substring(3).split(',');
        const lineNum = parseInt(parts[0], 10);
        const count = parseInt(parts[1], 10);
        if (!isNaN(lineNum)) {
          currentFile.allLines.add(lineNum);
          if (count > 0) {
            currentFile.coveredLines.add(lineNum);
          }
        }
      } else if (trimmed === 'end_of_record' && currentFile) {
        // Compute uncovered lines
        const uncoveredLines: number[] = [];
        for (const lineNum of currentFile.allLines) {
          if (!currentFile.coveredLines.has(lineNum)) {
            uncoveredLines.push(lineNum);
          }
        }
        uncoveredLines.sort((a, b) => a - b);

        files.push({
          filePath: currentFile.filePath,
          statements: {
            total: currentFile.linesFound,
            covered: currentFile.linesHit,
            pct: pct(currentFile.linesHit, currentFile.linesFound),
          },
          branches: {
            total: currentFile.branchesFound,
            covered: currentFile.branchesHit,
            pct: pct(currentFile.branchesHit, currentFile.branchesFound),
          },
          functions: {
            total: currentFile.functionsFound,
            covered: currentFile.functionsHit,
            pct: pct(currentFile.functionsHit, currentFile.functionsFound),
          },
          lines: {
            total: currentFile.linesFound,
            covered: currentFile.linesHit,
            pct: pct(currentFile.linesHit, currentFile.linesFound),
          },
          uncoveredLines,
        });

        currentFile = null;
      }
    }

    // Calculate aggregate summary
    const summary = this.aggregateSummary(files);

    return { summary, files };
  }

  private aggregateSummary(files: CoverageFileDetail[]): CoverageSummary {
    const totals = {
      statements: zeroDimension(),
      branches: zeroDimension(),
      functions: zeroDimension(),
      lines: zeroDimension(),
    };

    for (const file of files) {
      totals.statements.total += file.statements.total;
      totals.statements.covered += file.statements.covered;
      totals.branches.total += file.branches.total;
      totals.branches.covered += file.branches.covered;
      totals.functions.total += file.functions.total;
      totals.functions.covered += file.functions.covered;
      totals.lines.total += file.lines.total;
      totals.lines.covered += file.lines.covered;
    }

    totals.statements.pct = pct(totals.statements.covered, totals.statements.total);
    totals.branches.pct = pct(totals.branches.covered, totals.branches.total);
    totals.functions.pct = pct(totals.functions.covered, totals.functions.total);
    totals.lines.pct = pct(totals.lines.covered, totals.lines.total);

    return totals;
  }
}
