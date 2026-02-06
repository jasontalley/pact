import { LcovParser } from './lcov.parser';
import { IstanbulJsonParser } from './istanbul.parser';
import { CoberturaParser } from './cobertura.parser';
import { autoDetectAndParse } from './index';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LCOV_SINGLE_FILE = `TN:
SF:/src/utils/math.ts
FNF:3
FNH:2
BRF:4
BRH:3
LF:20
LH:18
DA:1,5
DA:2,5
DA:3,0
DA:4,5
DA:10,0
end_of_record
`;

const LCOV_MULTI_FILE = `TN:
SF:/src/services/auth.ts
FNF:5
FNH:5
BRF:6
BRH:4
LF:30
LH:28
DA:1,10
DA:2,10
DA:5,0
DA:8,0
end_of_record
SF:/src/services/users.ts
FNF:3
FNH:1
BRF:2
BRH:0
LF:15
LH:10
DA:1,2
DA:3,0
end_of_record
`;

const LCOV_ZERO_TOTALS = `TN:
SF:/src/empty.ts
FNF:0
FNH:0
BRF:0
BRH:0
LF:0
LH:0
end_of_record
`;

const LCOV_MISSING_DIMENSIONS = `TN:
SF:/src/partial.ts
LF:10
LH:7
DA:1,1
DA:2,0
DA:3,1
end_of_record
`;

const ISTANBUL_SUMMARY = JSON.stringify({
  total: {
    lines: { total: 100, covered: 85, skipped: 0, pct: 85 },
    statements: { total: 120, covered: 100, skipped: 0, pct: 83.33 },
    functions: { total: 30, covered: 25, skipped: 0, pct: 83.33 },
    branches: { total: 40, covered: 30, skipped: 0, pct: 75 },
  },
  '/src/app.ts': {
    lines: { total: 50, covered: 45, skipped: 0, pct: 90 },
    statements: { total: 60, covered: 55, skipped: 0, pct: 91.67 },
    functions: { total: 10, covered: 9, skipped: 0, pct: 90 },
    branches: { total: 20, covered: 18, skipped: 0, pct: 90 },
  },
  '/src/utils.ts': {
    lines: { total: 50, covered: 40, skipped: 0, pct: 80 },
    statements: { total: 60, covered: 45, skipped: 0, pct: 75 },
    functions: { total: 20, covered: 16, skipped: 0, pct: 80 },
    branches: { total: 20, covered: 12, skipped: 0, pct: 60 },
  },
});

const ISTANBUL_FINAL = JSON.stringify({
  '/src/controller.ts': {
    path: '/src/controller.ts',
    s: { '0': 5, '1': 5, '2': 0, '3': 3 },
    b: { '0': [3, 2], '1': [5, 0] },
    f: { '0': 5, '1': 0, '2': 3 },
    statementMap: {
      '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 20 } },
      '1': { start: { line: 2, column: 0 }, end: { line: 2, column: 30 } },
      '2': { start: { line: 5, column: 0 }, end: { line: 5, column: 15 } },
      '3': { start: { line: 8, column: 0 }, end: { line: 8, column: 25 } },
    },
    branchMap: {},
    fnMap: {},
  },
});

const ISTANBUL_FINAL_MULTI = JSON.stringify({
  '/src/a.ts': {
    path: '/src/a.ts',
    s: { '0': 1, '1': 1 },
    b: {},
    f: { '0': 1 },
    statementMap: {
      '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
      '1': { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
    },
  },
  '/src/b.ts': {
    path: '/src/b.ts',
    s: { '0': 0, '1': 0 },
    b: { '0': [0, 0] },
    f: { '0': 0 },
    statementMap: {
      '0': { start: { line: 3, column: 0 }, end: { line: 3, column: 10 } },
      '1': { start: { line: 7, column: 0 }, end: { line: 7, column: 10 } },
    },
  },
});

const COBERTURA_CLASS_LEVEL = `<?xml version="1.0"?>
<coverage line-rate="0.85" branch-rate="0.75" lines-covered="170" lines-valid="200" branches-covered="30" branches-valid="40" complexity="0" version="1.0" timestamp="1234567890">
  <packages>
    <package name="src" line-rate="0.85" branch-rate="0.75" complexity="0">
      <classes>
        <class name="service.ts" filename="src/service.ts" line-rate="0.9" branch-rate="0.8" complexity="0">
          <methods>
            <method name="getUser" signature="()" line-rate="1.0" branch-rate="1.0" complexity="1">
              <lines><line number="10" hits="5" branch="false"/></lines>
            </method>
            <method name="deleteUser" signature="()" line-rate="0" branch-rate="0" complexity="1">
              <lines><line number="20" hits="0" branch="false"/></lines>
            </method>
          </methods>
          <lines>
            <line number="1" hits="3" branch="false"/>
            <line number="2" hits="3" branch="false"/>
            <line number="5" hits="0" branch="false"/>
            <line number="8" hits="2" branch="true" condition-coverage="50% (1/2)"/>
          </lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>`;

const COBERTURA_MULTI_CLASS = `<?xml version="1.0"?>
<coverage line-rate="0.80" branch-rate="0.60" lines-covered="80" lines-valid="100" branches-covered="12" branches-valid="20" complexity="0" version="1.0" timestamp="1234567890">
  <packages>
    <package name="src" line-rate="0.80" branch-rate="0.60" complexity="0">
      <classes>
        <class name="alpha.ts" filename="src/alpha.ts" line-rate="1.0" branch-rate="1.0" complexity="0">
          <lines>
            <line number="1" hits="5" branch="false"/>
            <line number="2" hits="5" branch="false"/>
          </lines>
        </class>
        <class name="beta.ts" filename="src/beta.ts" line-rate="0.5" branch-rate="0.5" complexity="0">
          <lines>
            <line number="1" hits="1" branch="false"/>
            <line number="2" hits="0" branch="false"/>
            <line number="3" hits="0" branch="true" condition-coverage="25% (1/4)"/>
          </lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>`;

const COBERTURA_TOP_LEVEL_ONLY = `<?xml version="1.0"?>
<coverage line-rate="0.72" branch-rate="0.55" lines-covered="72" lines-valid="100" branches-covered="11" branches-valid="20" complexity="0" version="1.0" timestamp="1234567890">
  <packages/>
</coverage>`;

// ---------------------------------------------------------------------------
// LcovParser
// ---------------------------------------------------------------------------

describe('LcovParser', () => {
  const parser = new LcovParser();

  describe('canParse', () => {
    it('returns true for content starting with TN:', () => {
      expect(parser.canParse('TN:\nSF:/src/file.ts\nend_of_record\n')).toBe(true);
    });

    it('returns true for content starting with SF:', () => {
      expect(parser.canParse('SF:/src/file.ts\nLF:10\nLH:5\nend_of_record\n')).toBe(true);
    });

    it('returns true when TN: appears mid-content', () => {
      expect(parser.canParse('some header\nTN:\nSF:/a.ts\nend_of_record\n')).toBe(true);
    });

    it('returns false for Istanbul JSON', () => {
      expect(parser.canParse(ISTANBUL_SUMMARY)).toBe(false);
    });

    it('returns false for Cobertura XML', () => {
      expect(parser.canParse(COBERTURA_CLASS_LEVEL)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(parser.canParse('')).toBe(false);
    });

    it('returns false for arbitrary text', () => {
      expect(parser.canParse('hello world, nothing to see here')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses a single file record with all dimensions', () => {
      const result = parser.parse(LCOV_SINGLE_FILE);

      expect(result.files).toHaveLength(1);

      const file = result.files[0];
      expect(file.filePath).toBe('/src/utils/math.ts');
      expect(file.statements).toEqual({ total: 20, covered: 18, pct: 90 });
      expect(file.branches).toEqual({ total: 4, covered: 3, pct: 75 });
      expect(file.functions).toEqual({ total: 3, covered: 2, pct: 66.67 });
      expect(file.lines).toEqual({ total: 20, covered: 18, pct: 90 });
    });

    it('extracts uncovered lines from DA records', () => {
      const result = parser.parse(LCOV_SINGLE_FILE);
      const file = result.files[0];

      // DA:3,0 and DA:10,0 are uncovered
      expect(file.uncoveredLines).toEqual([3, 10]);
    });

    it('returns uncovered lines in sorted order', () => {
      const lcov = `SF:/src/z.ts
DA:20,0
DA:5,1
DA:10,0
DA:1,0
LF:4
LH:1
end_of_record
`;
      const result = parser.parse(lcov);
      expect(result.files[0].uncoveredLines).toEqual([1, 10, 20]);
    });

    it('parses multiple file records and aggregates summary', () => {
      const result = parser.parse(LCOV_MULTI_FILE);

      expect(result.files).toHaveLength(2);
      expect(result.files[0].filePath).toBe('/src/services/auth.ts');
      expect(result.files[1].filePath).toBe('/src/services/users.ts');

      // Aggregate summary: lines 28+10=38 covered out of 30+15=45
      expect(result.summary.lines.total).toBe(45);
      expect(result.summary.lines.covered).toBe(38);
      expect(result.summary.lines.pct).toBe(84.44);

      // Aggregate functions: 5+1=6 covered out of 5+3=8
      expect(result.summary.functions.total).toBe(8);
      expect(result.summary.functions.covered).toBe(6);
      expect(result.summary.functions.pct).toBe(75);

      // Aggregate branches: 4+0=4 covered out of 6+2=8
      expect(result.summary.branches.total).toBe(8);
      expect(result.summary.branches.covered).toBe(4);
      expect(result.summary.branches.pct).toBe(50);
    });

    it('handles zero totals with 100% percentage', () => {
      const result = parser.parse(LCOV_ZERO_TOTALS);

      expect(result.files).toHaveLength(1);
      const file = result.files[0];
      expect(file.statements.pct).toBe(100);
      expect(file.branches.pct).toBe(100);
      expect(file.functions.pct).toBe(100);
      expect(file.lines.pct).toBe(100);
      expect(file.uncoveredLines).toEqual([]);
    });

    it('handles records with missing dimension fields', () => {
      const result = parser.parse(LCOV_MISSING_DIMENSIONS);

      expect(result.files).toHaveLength(1);
      const file = result.files[0];

      // LF/LH are present
      expect(file.lines.total).toBe(10);
      expect(file.lines.covered).toBe(7);
      expect(file.lines.pct).toBe(70);

      // FNF/FNH and BRF/BRH are absent, should default to 0
      expect(file.functions).toEqual({ total: 0, covered: 0, pct: 100 });
      expect(file.branches).toEqual({ total: 0, covered: 0, pct: 100 });
    });

    it('returns empty files array for content with no end_of_record', () => {
      const incomplete = `TN:\nSF:/src/no-end.ts\nLF:5\nLH:3\n`;
      const result = parser.parse(incomplete);
      expect(result.files).toHaveLength(0);
      expect(result.summary.lines.total).toBe(0);
    });

    it('returns empty files for empty content', () => {
      const result = parser.parse('');
      expect(result.files).toHaveLength(0);
      expect(result.summary.statements.total).toBe(0);
      expect(result.summary.statements.pct).toBe(100);
    });

    it('calculates precise percentages with two decimal places', () => {
      const lcov = `SF:/src/precise.ts
FNF:3
FNH:1
LF:7
LH:3
end_of_record
`;
      const result = parser.parse(lcov);
      // 3/7 = 42.857142... -> 42.86
      expect(result.files[0].lines.pct).toBe(42.86);
      // 1/3 = 33.333... -> 33.33
      expect(result.files[0].functions.pct).toBe(33.33);
    });
  });
});

// ---------------------------------------------------------------------------
// IstanbulJsonParser
// ---------------------------------------------------------------------------

describe('IstanbulJsonParser', () => {
  const parser = new IstanbulJsonParser();

  describe('canParse', () => {
    it('returns true for coverage-summary.json format', () => {
      expect(parser.canParse(ISTANBUL_SUMMARY)).toBe(true);
    });

    it('returns true for coverage-final.json format', () => {
      expect(parser.canParse(ISTANBUL_FINAL)).toBe(true);
    });

    it('returns false for LCOV content', () => {
      expect(parser.canParse(LCOV_SINGLE_FILE)).toBe(false);
    });

    it('returns false for Cobertura XML', () => {
      expect(parser.canParse(COBERTURA_CLASS_LEVEL)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(parser.canParse('')).toBe(false);
    });

    it('returns false for invalid JSON', () => {
      expect(parser.canParse('{ not valid json')).toBe(false);
    });

    it('returns false for JSON that is not an object', () => {
      expect(parser.canParse('"just a string"')).toBe(false);
    });

    it('returns false for null JSON', () => {
      expect(parser.canParse('null')).toBe(false);
    });

    it('returns false for JSON object without coverage keys', () => {
      expect(parser.canParse('{"name": "test", "version": "1.0"}')).toBe(false);
    });
  });

  describe('parse (summary format)', () => {
    it('extracts the total summary from the "total" key', () => {
      const result = parser.parse(ISTANBUL_SUMMARY);

      expect(result.summary.lines).toEqual({ total: 100, covered: 85, pct: 85 });
      expect(result.summary.statements).toEqual({ total: 120, covered: 100, pct: 83.33 });
      expect(result.summary.functions).toEqual({ total: 30, covered: 25, pct: 83.33 });
      expect(result.summary.branches).toEqual({ total: 40, covered: 30, pct: 75 });
    });

    it('extracts per-file data excluding the "total" key', () => {
      const result = parser.parse(ISTANBUL_SUMMARY);

      expect(result.files).toHaveLength(2);

      const appFile = result.files.find((f) => f.filePath === '/src/app.ts');
      expect(appFile).toBeDefined();
      expect(appFile!.lines).toEqual({ total: 50, covered: 45, pct: 90 });
      expect(appFile!.statements).toEqual({ total: 60, covered: 55, pct: 91.67 });

      const utilsFile = result.files.find((f) => f.filePath === '/src/utils.ts');
      expect(utilsFile).toBeDefined();
      expect(utilsFile!.branches).toEqual({ total: 20, covered: 12, pct: 60 });
    });

    it('returns empty uncoveredLines for summary format files', () => {
      const result = parser.parse(ISTANBUL_SUMMARY);
      for (const file of result.files) {
        expect(file.uncoveredLines).toEqual([]);
      }
    });

    it('handles summary format with missing dimension gracefully', () => {
      const partial = JSON.stringify({
        total: {
          lines: { total: 10, covered: 8, pct: 80 },
          // statements, functions, branches missing
        },
        '/src/x.ts': {
          lines: { total: 10, covered: 8, pct: 80 },
        },
      });
      const result = parser.parse(partial);

      expect(result.summary.lines).toEqual({ total: 10, covered: 8, pct: 80 });
      // Missing dimensions default to zeros
      expect(result.summary.statements).toEqual({ total: 0, covered: 0, pct: 0 });
      expect(result.summary.functions).toEqual({ total: 0, covered: 0, pct: 0 });
      expect(result.summary.branches).toEqual({ total: 0, covered: 0, pct: 0 });
    });
  });

  describe('parse (final format)', () => {
    it('counts statements from s map', () => {
      const result = parser.parse(ISTANBUL_FINAL);
      const file = result.files[0];

      // s has 4 entries: 3 covered (values > 0), 1 uncovered
      expect(file.statements.total).toBe(4);
      expect(file.statements.covered).toBe(3);
      expect(file.statements.pct).toBe(75);
    });

    it('counts branches including multiple paths per branch', () => {
      const result = parser.parse(ISTANBUL_FINAL);
      const file = result.files[0];

      // b: { '0': [3, 2], '1': [5, 0] } -> 4 total paths, 3 covered
      expect(file.branches.total).toBe(4);
      expect(file.branches.covered).toBe(3);
      expect(file.branches.pct).toBe(75);
    });

    it('counts functions from f map', () => {
      const result = parser.parse(ISTANBUL_FINAL);
      const file = result.files[0];

      // f: { '0': 5, '1': 0, '2': 3 } -> 3 total, 2 covered
      expect(file.functions.total).toBe(3);
      expect(file.functions.covered).toBe(2);
      expect(file.functions.pct).toBe(66.67);
    });

    it('uses statements as proxy for lines in final format', () => {
      const result = parser.parse(ISTANBUL_FINAL);
      const file = result.files[0];

      expect(file.lines.total).toBe(file.statements.total);
      expect(file.lines.covered).toBe(file.statements.covered);
    });

    it('extracts uncovered lines from statementMap', () => {
      const result = parser.parse(ISTANBUL_FINAL);
      const file = result.files[0];

      // Statement '2' has count 0 and starts at line 5
      expect(file.uncoveredLines).toEqual([5]);
    });

    it('returns uncovered lines in sorted order', () => {
      const data = JSON.stringify({
        '/src/sort.ts': {
          s: { '0': 0, '1': 1, '2': 0 },
          b: {},
          f: {},
          statementMap: {
            '0': { start: { line: 20, column: 0 }, end: { line: 20, column: 10 } },
            '1': { start: { line: 5, column: 0 }, end: { line: 5, column: 10 } },
            '2': { start: { line: 10, column: 0 }, end: { line: 10, column: 10 } },
          },
        },
      });
      const result = parser.parse(data);
      expect(result.files[0].uncoveredLines).toEqual([10, 20]);
    });

    it('aggregates summary across multiple files', () => {
      const result = parser.parse(ISTANBUL_FINAL_MULTI);

      // /src/a.ts: s=2/2, b=0/0, f=1/1
      // /src/b.ts: s=0/2, b=0/2, f=0/1
      expect(result.summary.statements.total).toBe(4);
      expect(result.summary.statements.covered).toBe(2);
      expect(result.summary.statements.pct).toBe(50);

      expect(result.summary.branches.total).toBe(2);
      expect(result.summary.branches.covered).toBe(0);
      expect(result.summary.branches.pct).toBe(0);

      expect(result.summary.functions.total).toBe(2);
      expect(result.summary.functions.covered).toBe(1);
      expect(result.summary.functions.pct).toBe(50);
    });

    it('handles file with empty s/b/f maps', () => {
      const data = JSON.stringify({
        '/src/empty.ts': {
          s: {},
          b: {},
          f: {},
          statementMap: {},
        },
      });
      const result = parser.parse(data);
      const file = result.files[0];

      expect(file.statements).toEqual({ total: 0, covered: 0, pct: 100 });
      expect(file.branches).toEqual({ total: 0, covered: 0, pct: 100 });
      expect(file.functions).toEqual({ total: 0, covered: 0, pct: 100 });
      expect(file.uncoveredLines).toEqual([]);
    });

    it('handles file without statementMap (no uncovered lines)', () => {
      const data = JSON.stringify({
        '/src/no-map.ts': {
          s: { '0': 0, '1': 1 },
          b: {},
          f: {},
        },
      });
      const result = parser.parse(data);
      // Without statementMap, uncoveredLines should be empty
      expect(result.files[0].uncoveredLines).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// CoberturaParser
// ---------------------------------------------------------------------------

describe('CoberturaParser', () => {
  const parser = new CoberturaParser();

  describe('canParse', () => {
    it('returns true for Cobertura XML with line-rate', () => {
      expect(parser.canParse(COBERTURA_CLASS_LEVEL)).toBe(true);
    });

    it('returns true for Cobertura XML with lines-covered', () => {
      expect(parser.canParse('<coverage lines-covered="50" lines-valid="100"></coverage>')).toBe(
        true,
      );
    });

    it('returns false for LCOV content', () => {
      expect(parser.canParse(LCOV_SINGLE_FILE)).toBe(false);
    });

    it('returns false for Istanbul JSON', () => {
      expect(parser.canParse(ISTANBUL_SUMMARY)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(parser.canParse('')).toBe(false);
    });

    it('returns false for generic XML without coverage element', () => {
      expect(parser.canParse('<root><item>test</item></root>')).toBe(false);
    });
  });

  describe('parse (class-level)', () => {
    it('parses file paths from class filename attributes', () => {
      const result = parser.parse(COBERTURA_CLASS_LEVEL);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].filePath).toBe('src/service.ts');
    });

    it('counts lines and line hits correctly', () => {
      const result = parser.parse(COBERTURA_CLASS_LEVEL);
      const file = result.files[0];

      // 6 line elements total (4 in class <lines> + 2 inside <method> elements):
      // hits>0: line 1(3), line 2(3), line 8(2), line 10(5) = 4 covered
      // hits=0: line 5(0), line 20(0) = 2 uncovered
      expect(file.lines.total).toBe(6);
      expect(file.lines.covered).toBe(4);
      expect(file.lines.pct).toBe(66.67);
    });

    it('counts branch coverage from condition-coverage attributes', () => {
      const result = parser.parse(COBERTURA_CLASS_LEVEL);
      const file = result.files[0];

      // One branch line: condition-coverage="50% (1/2)" -> 2 total, 1 covered
      expect(file.branches.total).toBe(2);
      expect(file.branches.covered).toBe(1);
      expect(file.branches.pct).toBe(50);
    });

    it('extracts uncovered lines (hits=0)', () => {
      const result = parser.parse(COBERTURA_CLASS_LEVEL);
      const file = result.files[0];

      // line 5 and line 20 (inside method) have hits=0
      expect(file.uncoveredLines).toEqual([5, 20]);
    });

    it('parses multiple classes and aggregates summary', () => {
      const result = parser.parse(COBERTURA_MULTI_CLASS);

      expect(result.files).toHaveLength(2);

      const alpha = result.files.find((f) => f.filePath === 'src/alpha.ts');
      expect(alpha).toBeDefined();
      expect(alpha!.lines).toEqual({ total: 2, covered: 2, pct: 100 });
      expect(alpha!.uncoveredLines).toEqual([]);

      const beta = result.files.find((f) => f.filePath === 'src/beta.ts');
      expect(beta).toBeDefined();
      expect(beta!.lines.total).toBe(3);
      expect(beta!.lines.covered).toBe(1);
      expect(beta!.uncoveredLines).toEqual([2, 3]);

      // Aggregate: 5 total lines, 3 hit
      expect(result.summary.lines.total).toBe(5);
      expect(result.summary.lines.covered).toBe(3);
      expect(result.summary.lines.pct).toBe(60);

      // Branches from beta: condition-coverage="25% (1/4)" -> 4 total, 1 covered
      expect(result.summary.branches.total).toBe(4);
      expect(result.summary.branches.covered).toBe(1);
      expect(result.summary.branches.pct).toBe(25);
    });

    it('counts methods as functions', () => {
      const result = parser.parse(COBERTURA_CLASS_LEVEL);

      // Two <method> elements -> totalFunctionsFound = 2
      expect(result.summary.functions.total).toBe(2);
    });
  });

  describe('parse (top-level fallback)', () => {
    it('falls back to top-level attributes when no class elements match', () => {
      const result = parser.parse(COBERTURA_TOP_LEVEL_ONLY);

      expect(result.files).toHaveLength(0);

      // lines-covered="72" lines-valid="100"
      expect(result.summary.lines.total).toBe(100);
      expect(result.summary.lines.covered).toBe(72);
      expect(result.summary.lines.pct).toBe(72);

      // branches-covered="11" branches-valid="20"
      expect(result.summary.branches.total).toBe(20);
      expect(result.summary.branches.covered).toBe(11);
      expect(result.summary.branches.pct).toBe(55);

      // No function data at top level
      expect(result.summary.functions).toEqual({ total: 0, covered: 0, pct: 0 });
    });

    it('uses rate attributes when valid/covered counts are absent', () => {
      const rateOnly = `<?xml version="1.0"?>
<coverage line-rate="0.88" branch-rate="0.65" complexity="0" version="1.0" timestamp="123">
  <packages/>
</coverage>`;
      const result = parser.parse(rateOnly);

      expect(result.files).toHaveLength(0);
      // line-rate=0.88 -> pct = 88
      expect(result.summary.lines.pct).toBe(88);
      // branch-rate=0.65 -> pct = 65
      expect(result.summary.branches.pct).toBe(65);
    });
  });

  describe('edge cases', () => {
    it('handles class with no line elements', () => {
      const noLines = `<?xml version="1.0"?>
<coverage line-rate="0" branch-rate="0" complexity="0" version="1.0" timestamp="123">
  <packages>
    <package name="empty" line-rate="0" branch-rate="0" complexity="0">
      <classes>
        <class name="empty.ts" filename="src/empty.ts" line-rate="0" branch-rate="0" complexity="0">
          <lines></lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>`;
      const result = parser.parse(noLines);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].lines.total).toBe(0);
      expect(result.files[0].lines.pct).toBe(100);
      expect(result.files[0].uncoveredLines).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// autoDetectAndParse
// ---------------------------------------------------------------------------

describe('autoDetectAndParse', () => {
  it('detects and parses LCOV format', () => {
    const result = autoDetectAndParse(LCOV_SINGLE_FILE);
    expect(result.format).toBe('lcov');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].filePath).toBe('/src/utils/math.ts');
  });

  it('detects and parses Istanbul summary format', () => {
    const result = autoDetectAndParse(ISTANBUL_SUMMARY);
    expect(result.format).toBe('istanbul');
    expect(result.summary.lines.pct).toBe(85);
  });

  it('detects and parses Istanbul final format', () => {
    const result = autoDetectAndParse(ISTANBUL_FINAL);
    expect(result.format).toBe('istanbul');
    expect(result.files).toHaveLength(1);
  });

  it('detects and parses Cobertura XML format', () => {
    const result = autoDetectAndParse(COBERTURA_CLASS_LEVEL);
    expect(result.format).toBe('cobertura');
    expect(result.files).toHaveLength(1);
  });

  it('throws an error for unrecognized content', () => {
    expect(() => autoDetectAndParse('this is not a coverage report')).toThrow(
      'Unable to detect coverage format',
    );
  });

  it('throws an error for empty content', () => {
    expect(() => autoDetectAndParse('')).toThrow('Unable to detect coverage format');
  });

  it('prefers LCOV parser when content matches multiple formats', () => {
    // LCOV is first in the registry, so it should win
    const result = autoDetectAndParse(LCOV_MULTI_FILE);
    expect(result.format).toBe('lcov');
  });

  it('returns correct structure with summary, files, and format', () => {
    const result = autoDetectAndParse(LCOV_SINGLE_FILE);

    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('files');
    expect(result).toHaveProperty('format');
    expect(result.summary).toHaveProperty('statements');
    expect(result.summary).toHaveProperty('branches');
    expect(result.summary).toHaveProperty('functions');
    expect(result.summary).toHaveProperty('lines');
  });
});
