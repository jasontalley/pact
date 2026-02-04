import { CoverageDimensionSummary } from '../coverage-report.entity';
import { CoverageParser, CoverageParserResult } from './lcov.parser';

/**
 * Istanbul JSON coverage format: per-file statement/branch/function maps
 *
 * Two variants supported:
 * 1. coverage-summary.json: { "total": { "lines": {...}, ... }, "/path/file.ts": { ... } }
 * 2. coverage-final.json: { "/path/file.ts": { "s": {...}, "b": {...}, "f": {...}, ... } }
 */
export class IstanbulJsonParser implements CoverageParser {
  canParse(content: string): boolean {
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed !== 'object' || parsed === null) return false;

      // Check for coverage-summary.json format (has "total" key with "lines" sub-key)
      if (parsed.total && typeof parsed.total.lines === 'object') {
        return true;
      }

      // Check for coverage-final.json format (file paths as keys with "s", "b", "f" sub-keys)
      const keys = Object.keys(parsed);
      if (keys.length > 0) {
        const first = parsed[keys[0]];
        if (first && (first.s !== undefined || first.statementMap !== undefined)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  parse(content: string): CoverageParserResult {
    const parsed = JSON.parse(content);

    // Detect format
    if (parsed.total && typeof parsed.total.lines === 'object') {
      return this.parseSummaryFormat(parsed);
    }

    return this.parseFinalFormat(parsed);
  }

  /**
   * Parse coverage-summary.json format
   * { "total": { "lines": { total, covered, skipped, pct }, ... }, "/path": { ... } }
   */
  private parseSummaryFormat(parsed: Record<string, unknown>): CoverageParserResult {
    const files: CoverageParserResult['files'] = [];

    for (const [key, value] of Object.entries(parsed)) {
      if (key === 'total') continue;
      const fileData = value as Record<string, { total: number; covered: number; pct: number }>;

      const uncoveredLines: number[] = [];

      files.push({
        filePath: key,
        statements: this.extractDimension(fileData.statements),
        branches: this.extractDimension(fileData.branches),
        functions: this.extractDimension(fileData.functions),
        lines: this.extractDimension(fileData.lines),
        uncoveredLines,
      });
    }

    const total = parsed.total as Record<string, { total: number; covered: number; pct: number }>;
    const summary = {
      statements: this.extractDimension(total.statements),
      branches: this.extractDimension(total.branches),
      functions: this.extractDimension(total.functions),
      lines: this.extractDimension(total.lines),
    };

    return { summary, files };
  }

  /**
   * Parse coverage-final.json format
   * { "/path": { "path": "/path", "s": { "0": 1, ... }, "b": { ... }, "f": { ... },
   *              "statementMap": { "0": { start, end } }, "branchMap": { ... }, "fnMap": { ... } } }
   */
  private parseFinalFormat(parsed: Record<string, unknown>): CoverageParserResult {
    const files: CoverageParserResult['files'] = [];

    let totalStatements = 0,
      coveredStatements = 0;
    let totalBranches = 0,
      coveredBranches = 0;
    let totalFunctions = 0,
      coveredFunctions = 0;
    let totalLines = 0,
      coveredLines = 0;

    for (const [filePath, value] of Object.entries(parsed)) {
      const fileData = value as {
        s?: Record<string, number>;
        b?: Record<string, number[]>;
        f?: Record<string, number>;
        statementMap?: Record<string, { start: { line: number }; end: { line: number } }>;
      };

      // Count statements
      const stmtTotal = fileData.s ? Object.keys(fileData.s).length : 0;
      const stmtCovered = fileData.s ? Object.values(fileData.s).filter((v) => v > 0).length : 0;

      // Count branches (each branch entry can have multiple paths)
      let branchTotal = 0;
      let branchCovered = 0;
      if (fileData.b) {
        for (const paths of Object.values(fileData.b)) {
          branchTotal += paths.length;
          branchCovered += paths.filter((v) => v > 0).length;
        }
      }

      // Count functions
      const fnTotal = fileData.f ? Object.keys(fileData.f).length : 0;
      const fnCovered = fileData.f ? Object.values(fileData.f).filter((v) => v > 0).length : 0;

      // Determine uncovered lines from statement map
      const uncovered: number[] = [];
      if (fileData.s && fileData.statementMap) {
        for (const [stmtId, count] of Object.entries(fileData.s)) {
          if (count === 0 && fileData.statementMap[stmtId]) {
            uncovered.push(fileData.statementMap[stmtId].start.line);
          }
        }
      }
      uncovered.sort((a, b) => a - b);

      // Use statements as proxy for lines (istanbul doesn't have separate line counts in final format)
      const lineTotal = stmtTotal;
      const lineCovered = stmtCovered;

      totalStatements += stmtTotal;
      coveredStatements += stmtCovered;
      totalBranches += branchTotal;
      coveredBranches += branchCovered;
      totalFunctions += fnTotal;
      coveredFunctions += fnCovered;
      totalLines += lineTotal;
      coveredLines += lineCovered;

      files.push({
        filePath,
        statements: this.makeDimension(stmtTotal, stmtCovered),
        branches: this.makeDimension(branchTotal, branchCovered),
        functions: this.makeDimension(fnTotal, fnCovered),
        lines: this.makeDimension(lineTotal, lineCovered),
        uncoveredLines: uncovered,
      });
    }

    const summary = {
      statements: this.makeDimension(totalStatements, coveredStatements),
      branches: this.makeDimension(totalBranches, coveredBranches),
      functions: this.makeDimension(totalFunctions, coveredFunctions),
      lines: this.makeDimension(totalLines, coveredLines),
    };

    return { summary, files };
  }

  private extractDimension(dim?: {
    total: number;
    covered: number;
    pct: number;
  }): CoverageDimensionSummary {
    if (!dim) return { total: 0, covered: 0, pct: 0 };
    return {
      total: dim.total || 0,
      covered: dim.covered || 0,
      pct: typeof dim.pct === 'number' ? dim.pct : 0,
    };
  }

  private makeDimension(total: number, covered: number): CoverageDimensionSummary {
    return {
      total,
      covered,
      pct: total === 0 ? 100 : Math.round((covered / total) * 10000) / 100,
    };
  }
}
