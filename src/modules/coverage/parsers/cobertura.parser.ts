import { CoverageDimensionSummary } from '../coverage-report.entity';
import { CoverageParser, CoverageParserResult } from './lcov.parser';

/**
 * Parser for Cobertura XML coverage reports.
 *
 * Cobertura XML structure:
 * <coverage line-rate="0.85" branch-rate="0.75" ...>
 *   <packages>
 *     <package ...>
 *       <classes>
 *         <class filename="path/to/file.ts" line-rate="0.9" branch-rate="0.8" ...>
 *           <lines>
 *             <line number="1" hits="1" branch="false"/>
 *             <line number="5" hits="0" branch="true" condition-coverage="50% (1/2)"/>
 *           </lines>
 *         </class>
 *       </classes>
 *     </package>
 *   </packages>
 * </coverage>
 *
 * Note: Uses simple regex-based XML parsing to avoid external dependencies.
 */
export class CoberturaParser implements CoverageParser {
  canParse(content: string): boolean {
    return (
      content.includes('<coverage') &&
      (content.includes('line-rate') || content.includes('lines-covered'))
    );
  }

  parse(content: string): CoverageParserResult {
    const files: CoverageParserResult['files'] = [];

    // Extract class elements with their filenames and line data
    const classRegex =
      /<class\s+[^>]*?filename="([^"]+)"[^>]*?line-rate="([^"]*)"[^>]*?branch-rate="([^"]*)"[^>]*?(?:complexity="[^"]*")?[^>]*?>([\s\S]*?)<\/class>/g;
    let classMatch: RegExpExecArray | null;

    let totalLinesFound = 0,
      totalLinesHit = 0;
    let totalBranchesFound = 0,
      totalBranchesHit = 0;
    let totalFunctionsFound = 0,
      totalFunctionsHit = 0;

    while ((classMatch = classRegex.exec(content)) !== null) {
      const filePath = classMatch[1];
      const classBody = classMatch[4];

      // Parse line elements
      const lineRegex =
        /<line\s+number="(\d+)"\s+hits="(\d+)"(?:\s+branch="(true|false)")?(?:\s+condition-coverage="[^"]*\((\d+)\/(\d+)\)")?[^/]*\/>/g;
      let lineMatch: RegExpExecArray | null;

      let linesFound = 0;
      let linesHit = 0;
      let branchesFound = 0;
      let branchesHit = 0;
      const uncoveredLines: number[] = [];

      while ((lineMatch = lineRegex.exec(classBody)) !== null) {
        const lineNum = parseInt(lineMatch[1], 10);
        const hits = parseInt(lineMatch[2], 10);
        const isBranch = lineMatch[3] === 'true';

        linesFound++;
        if (hits > 0) {
          linesHit++;
        } else {
          uncoveredLines.push(lineNum);
        }

        if (isBranch && lineMatch[4] && lineMatch[5]) {
          const branchHit = parseInt(lineMatch[4], 10);
          const branchTotal = parseInt(lineMatch[5], 10);
          branchesFound += branchTotal;
          branchesHit += branchHit;
        }
      }

      // Count methods/functions
      const methodRegex = /<method\s+[^>]*?>/g;
      const methodHitRegex = /<method\s+[^>]*?line-rate="([^"]*)"[^>]*?>/g;
      const methods = classBody.match(methodRegex) || [];
      totalFunctionsFound += methods.length;

      let methodMatch: RegExpExecArray | null;
      while ((methodMatch = methodHitRegex.exec(classBody)) !== null) {
        const rate = parseFloat(methodMatch[1]);
        if (rate > 0) totalFunctionsHit++;
      }

      uncoveredLines.sort((a, b) => a - b);

      totalLinesFound += linesFound;
      totalLinesHit += linesHit;
      totalBranchesFound += branchesFound;
      totalBranchesHit += branchesHit;

      files.push({
        filePath,
        statements: this.makeDimension(linesFound, linesHit),
        branches: this.makeDimension(branchesFound, branchesHit),
        functions: this.makeDimension(methods.length, 0), // Simplified: exact fn hit count is complex
        lines: this.makeDimension(linesFound, linesHit),
        uncoveredLines,
      });
    }

    // If no class-level parsing worked, try top-level attributes
    if (files.length === 0) {
      return this.parseTopLevel(content);
    }

    const summary = {
      statements: this.makeDimension(totalLinesFound, totalLinesHit),
      branches: this.makeDimension(totalBranchesFound, totalBranchesHit),
      functions: this.makeDimension(totalFunctionsFound, totalFunctionsHit),
      lines: this.makeDimension(totalLinesFound, totalLinesHit),
    };

    return { summary, files };
  }

  /**
   * Fallback: parse top-level coverage attributes when class-level parsing fails
   */
  private parseTopLevel(content: string): CoverageParserResult {
    const lineRate = this.extractAttribute(content, 'line-rate');
    const branchRate = this.extractAttribute(content, 'branch-rate');
    const linesCovered = this.extractIntAttribute(content, 'lines-covered');
    const linesValid = this.extractIntAttribute(content, 'lines-valid');
    const branchesCovered = this.extractIntAttribute(content, 'branches-covered');
    const branchesValid = this.extractIntAttribute(content, 'branches-valid');

    const summary = {
      statements:
        linesValid > 0
          ? this.makeDimension(linesValid, linesCovered)
          : { total: 0, covered: 0, pct: Math.round(lineRate * 10000) / 100 },
      branches:
        branchesValid > 0
          ? this.makeDimension(branchesValid, branchesCovered)
          : { total: 0, covered: 0, pct: Math.round(branchRate * 10000) / 100 },
      functions: { total: 0, covered: 0, pct: 0 },
      lines:
        linesValid > 0
          ? this.makeDimension(linesValid, linesCovered)
          : { total: 0, covered: 0, pct: Math.round(lineRate * 10000) / 100 },
    };

    return { summary, files: [] };
  }

  private extractAttribute(content: string, attr: string): number {
    const match = content.match(new RegExp(`${attr}="([^"]+)"`));
    return match ? parseFloat(match[1]) || 0 : 0;
  }

  private extractIntAttribute(content: string, attr: string): number {
    const match = content.match(new RegExp(`${attr}="([^"]+)"`));
    return match ? parseInt(match[1], 10) || 0 : 0;
  }

  private makeDimension(total: number, covered: number): CoverageDimensionSummary {
    return {
      total,
      covered,
      pct: total === 0 ? 100 : Math.round((covered / total) * 10000) / 100,
    };
  }
}
