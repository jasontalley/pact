/**
 * Coverage Data Parser
 *
 * Parses existing coverage artifacts found in cloned repositories.
 * Supports LCOV, Istanbul JSON, and Cobertura XML formats.
 *
 * No test execution — only reads pre-existing coverage files.
 *
 * @see Phase 21D in implementation plan
 */

// ============================================================================
// Types
// ============================================================================

export type CoverageFormat = 'lcov' | 'istanbul' | 'cobertura';

export interface CoverageData {
  format: CoverageFormat;
  totalLines: number;
  coveredLines: number;
  coveragePercent: number;
  files: CoverageFileData[];
}

export interface CoverageFileData {
  filePath: string;
  totalLines: number;
  coveredLines: number;
  coveragePercent: number;
  uncoveredRanges: Array<{ start: number; end: number }>;
}

/**
 * Well-known coverage artifact paths to search for.
 */
export const COVERAGE_ARTIFACT_PATHS = [
  'coverage/lcov.info',
  'coverage/lcov-report/lcov.info',
  'coverage/coverage-summary.json',
  '.nyc_output/coverage-summary.json',
  'coverage.xml',
  'coverage/cobertura-coverage.xml',
  'coverage/clover.xml',
];

// ============================================================================
// Format Detection
// ============================================================================

/**
 * Detect the coverage format from file content.
 */
export function detectCoverageFormat(filePath: string, content: string): CoverageFormat | null {
  if (filePath.endsWith('.info') || content.startsWith('TN:') || content.startsWith('SF:')) {
    return 'lcov';
  }
  if (filePath.endsWith('.json')) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.total || parsed.result) return 'istanbul';
    } catch {
      return null;
    }
  }
  if (filePath.endsWith('.xml') && content.includes('<coverage')) {
    return 'cobertura';
  }
  return null;
}

// ============================================================================
// LCOV Parser
// ============================================================================

/**
 * Parse LCOV format coverage data.
 *
 * LCOV format:
 * ```
 * TN:test name
 * SF:/path/to/file.ts
 * DA:1,1      (line 1, hit 1 time)
 * DA:2,0      (line 2, not hit)
 * LH:1        (lines hit)
 * LF:2        (lines found)
 * end_of_record
 * ```
 */
export function parseLcov(content: string): CoverageData {
  const files: CoverageFileData[] = [];
  const records = content.split('end_of_record');

  for (const record of records) {
    const lines = record.trim().split('\n');
    if (lines.length === 0) continue;

    let filePath = '';
    let totalLines = 0;
    let coveredLines = 0;
    const uncoveredLineNumbers: number[] = [];

    for (const line of lines) {
      if (line.startsWith('SF:')) {
        filePath = line.substring(3).trim();
      } else if (line.startsWith('LF:')) {
        totalLines = parseInt(line.substring(3), 10) || 0;
      } else if (line.startsWith('LH:')) {
        coveredLines = parseInt(line.substring(3), 10) || 0;
      } else if (line.startsWith('DA:')) {
        const parts = line.substring(3).split(',');
        const lineNum = parseInt(parts[0], 10);
        const hitCount = parseInt(parts[1], 10);
        if (hitCount === 0 && !isNaN(lineNum)) {
          uncoveredLineNumbers.push(lineNum);
        }
      }
    }

    if (!filePath) continue;

    files.push({
      filePath,
      totalLines,
      coveredLines,
      coveragePercent: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
      uncoveredRanges: collapseLineNumbers(uncoveredLineNumbers),
    });
  }

  const totalLines = files.reduce((sum, f) => sum + f.totalLines, 0);
  const coveredLines = files.reduce((sum, f) => sum + f.coveredLines, 0);

  return {
    format: 'lcov',
    totalLines,
    coveredLines,
    coveragePercent: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
    files,
  };
}

// ============================================================================
// Istanbul JSON Parser
// ============================================================================

/**
 * Parse Istanbul JSON coverage summary.
 *
 * Istanbul format (coverage-summary.json):
 * ```json
 * {
 *   "total": { "lines": { "total": 100, "covered": 80, "pct": 80 }, ... },
 *   "/path/to/file.ts": { "lines": { "total": 50, "covered": 40, "pct": 80 }, ... }
 * }
 * ```
 */
export function parseIstanbul(content: string): CoverageData {
  const parsed = JSON.parse(content);
  const files: CoverageFileData[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'total') continue;

    const fileData = value as {
      lines?: { total?: number; covered?: number; pct?: number };
      statements?: { total?: number; covered?: number };
    };

    const totalLines = fileData.lines?.total || fileData.statements?.total || 0;
    const coveredLines = fileData.lines?.covered || fileData.statements?.covered || 0;

    files.push({
      filePath: key,
      totalLines,
      coveredLines,
      coveragePercent: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
      uncoveredRanges: [], // Istanbul summary doesn't include line-level detail
    });
  }

  const total = parsed.total as {
    lines?: { total?: number; covered?: number; pct?: number };
  } | undefined;

  const totalLines = total?.lines?.total || files.reduce((s, f) => s + f.totalLines, 0);
  const coveredLines = total?.lines?.covered || files.reduce((s, f) => s + f.coveredLines, 0);

  return {
    format: 'istanbul',
    totalLines,
    coveredLines,
    coveragePercent: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
    files,
  };
}

// ============================================================================
// Cobertura XML Parser
// ============================================================================

/**
 * Parse Cobertura XML coverage data.
 *
 * Simplified regex-based parser (no XML dependency).
 * Extracts file-level line coverage from:
 * ```xml
 * <package name="...">
 *   <class name="..." filename="path/to/file.ts" line-rate="0.8">
 *     <lines>
 *       <line number="1" hits="1"/>
 *       <line number="2" hits="0"/>
 *     </lines>
 *   </class>
 * </package>
 * ```
 */
export function parseCobertura(content: string): CoverageData {
  const files: CoverageFileData[] = [];

  // Extract class elements with filename and line-rate
  const classRegex = /<class\s[^>]*filename="([^"]+)"[^>]*>/g;
  let classMatch: RegExpExecArray | null;

  while ((classMatch = classRegex.exec(content)) !== null) {
    const filePath = classMatch[1];
    const classStart = classMatch.index;

    // Find the closing </class> tag
    const classEndIdx = content.indexOf('</class>', classStart);
    if (classEndIdx === -1) continue;

    const classContent = content.substring(classStart, classEndIdx);

    // Extract line hits
    const lineRegex = /<line\s+number="(\d+)"\s+hits="(\d+)"/g;
    let lineMatch: RegExpExecArray | null;
    let totalLines = 0;
    let coveredLines = 0;
    const uncoveredLineNumbers: number[] = [];

    while ((lineMatch = lineRegex.exec(classContent)) !== null) {
      totalLines++;
      const lineNum = parseInt(lineMatch[1], 10);
      const hits = parseInt(lineMatch[2], 10);
      if (hits > 0) {
        coveredLines++;
      } else {
        uncoveredLineNumbers.push(lineNum);
      }
    }

    // Check if this file already exists (multiple classes in same file)
    const existing = files.find((f) => f.filePath === filePath);
    if (existing) {
      existing.totalLines += totalLines;
      existing.coveredLines += coveredLines;
      existing.coveragePercent =
        existing.totalLines > 0 ? (existing.coveredLines / existing.totalLines) * 100 : 0;
      existing.uncoveredRanges.push(...collapseLineNumbers(uncoveredLineNumbers));
    } else {
      files.push({
        filePath,
        totalLines,
        coveredLines,
        coveragePercent: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
        uncoveredRanges: collapseLineNumbers(uncoveredLineNumbers),
      });
    }
  }

  const totalLines = files.reduce((sum, f) => sum + f.totalLines, 0);
  const coveredLines = files.reduce((sum, f) => sum + f.coveredLines, 0);

  return {
    format: 'cobertura',
    totalLines,
    coveredLines,
    coveragePercent: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
    files,
  };
}

// ============================================================================
// Unified Parser
// ============================================================================

/**
 * Parse coverage data from any supported format.
 * Auto-detects format from file path and content.
 *
 * @returns CoverageData or null if format is unrecognized
 */
export function parseCoverageFile(filePath: string, content: string): CoverageData | null {
  const format = detectCoverageFormat(filePath, content);
  if (!format) return null;

  switch (format) {
    case 'lcov':
      return parseLcov(content);
    case 'istanbul':
      return parseIstanbul(content);
    case 'cobertura':
      return parseCobertura(content);
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Collapse an array of line numbers into contiguous ranges.
 * E.g., [1, 2, 3, 7, 8, 10] → [{start:1, end:3}, {start:7, end:8}, {start:10, end:10}]
 */
function collapseLineNumbers(lines: number[]): Array<{ start: number; end: number }> {
  if (lines.length === 0) return [];

  const sorted = [...lines].sort((a, b) => a - b);
  const ranges: Array<{ start: number; end: number }> = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push({ start, end });
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push({ start, end });

  return ranges;
}
