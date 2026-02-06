import {
  getEvidenceLevelFromFinding,
  compactFinding,
  deduplicateFindingsBySource,
  formatFindingsForPrompt,
  formatFindingsForSynthesis,
} from './finding-compactor';
import { Finding } from '../types/base-state';

describe('finding-compactor', () => {
  describe('getEvidenceLevelFromFinding', () => {
    it('returns 4 for findings with computed facts', () => {
      const finding: Finding = {
        source: 'test.json',
        content: '{}',
        relevance: 'test',
        computedFacts: { lines: { pct: 85 } },
      };
      expect(getEvidenceLevelFromFinding(finding)).toBe(4);
    });

    it('returns 3 for findings with successful parse', () => {
      const finding: Finding = {
        source: 'test.json',
        content: '{}',
        relevance: 'test',
        parseMetadata: { parseSuccess: true, format: 'json' },
      };
      expect(getEvidenceLevelFromFinding(finding)).toBe(3);
    });

    it('returns 1 for directory listings', () => {
      const finding: Finding = {
        source: 'test/',
        content: 'file1.ts\nfile2.ts',
        relevance: 'Directory listing',
      };
      expect(getEvidenceLevelFromFinding(finding)).toBe(1);
    });

    it('returns 2 for raw file content', () => {
      const finding: Finding = {
        source: 'test.ts',
        content: 'const x = 1;',
        relevance: 'Source code',
      };
      expect(getEvidenceLevelFromFinding(finding)).toBe(2);
    });
  });

  describe('compactFinding', () => {
    it('compacts computed facts findings', () => {
      const finding: Finding = {
        source: 'coverage.json',
        content: '{"total": {"lines": {"pct": 85}}}',
        relevance: 'Coverage report',
        computedFacts: { lines: 85, statements: 80 },
      };

      const compact = compactFinding(finding);
      expect(compact.type).toBe('computed');
      expect(compact.facts).toEqual({ lines: 85, statements: 80 });
      expect(compact.confidence).toBe(1);
    });

    it('compacts directory listings', () => {
      const finding: Finding = {
        source: 'src/',
        content: 'file1.ts\nfile2.ts\nfile3.ts',
        relevance: 'Directory listing',
      };

      const compact = compactFinding(finding);
      expect(compact.type).toBe('directory');
      expect(compact.summary).toContain('3 items');
      expect(compact.confidence).toBe(1);
    });

    it('compacts parsed JSON findings', () => {
      const finding: Finding = {
        source: 'config.json',
        content: '{"key": "value"}',
        relevance: 'Config file',
        parseMetadata: {
          parseSuccess: true,
          format: 'json',
          topLevelKeys: ['key', 'another'],
        },
      };

      const compact = compactFinding(finding);
      expect(compact.type).toBe('file');
      expect(compact.summary).toContain('Parsed json');
      expect(compact.summary).toContain('key');
      expect(compact.confidence).toBe(0.9);
    });

    it('truncates long raw content', () => {
      const finding: Finding = {
        source: 'longfile.ts',
        content: 'x'.repeat(500),
        relevance: 'Source code',
      };

      const compact = compactFinding(finding);
      expect(compact.type).toBe('file');
      expect(compact.summary.length).toBeLessThanOrEqual(203); // 200 + "..."
      expect(compact.confidence).toBe(0.5);
    });
  });

  describe('deduplicateFindingsBySource', () => {
    it('keeps findings with higher evidence level', () => {
      const findings: Finding[] = [
        {
          source: 'test.json',
          content: 'raw content',
          relevance: 'Raw read',
        },
        {
          source: 'test.json',
          content: '{"parsed": true}',
          relevance: 'Parsed read',
          parseMetadata: { parseSuccess: true },
        },
      ];

      const deduped = deduplicateFindingsBySource(findings);
      expect(deduped).toHaveLength(1);
      expect(deduped[0].parseMetadata?.parseSuccess).toBe(true);
    });

    it('preserves unique sources', () => {
      const findings: Finding[] = [
        { source: 'a.ts', content: 'a', relevance: 'test' },
        { source: 'b.ts', content: 'b', relevance: 'test' },
        { source: 'c.ts', content: 'c', relevance: 'test' },
      ];

      const deduped = deduplicateFindingsBySource(findings);
      expect(deduped).toHaveLength(3);
    });
  });

  describe('formatFindingsForPrompt', () => {
    it('returns "None yet" for empty findings', () => {
      expect(formatFindingsForPrompt([], 0)).toBe('None yet');
    });

    it('shows full relevance before iteration 2', () => {
      const findings: Finding[] = [
        { source: 'test.ts', content: 'code', relevance: 'Source code file' },
      ];

      const result = formatFindingsForPrompt(findings, 0);
      expect(result).toContain('test.ts: Source code file');
    });

    it('compacts older findings after iteration 2', () => {
      const findings: Finding[] = [
        { source: 'old.ts', content: 'x'.repeat(500), relevance: 'Old finding' },
        { source: 'new1.ts', content: 'new', relevance: 'Recent 1' },
        { source: 'new2.ts', content: 'new', relevance: 'Recent 2' },
        { source: 'new3.ts', content: 'new', relevance: 'Recent 3' },
      ];

      const result = formatFindingsForPrompt(findings, 3);
      // Recent findings should have full relevance
      expect(result).toContain('new1.ts: Recent 1');
      // Old finding should be compacted
      expect(result).toContain('[file]');
    });
  });

  describe('formatFindingsForSynthesis', () => {
    it('returns message for empty findings', () => {
      expect(formatFindingsForSynthesis([])).toBe('No findings gathered.');
    });

    it('formats findings with facts', () => {
      const findings: Finding[] = [
        {
          source: 'coverage.json',
          content: '{}',
          relevance: 'Coverage',
          computedFacts: { lines: 85 },
        },
      ];

      const result = formatFindingsForSynthesis(findings);
      expect(result).toContain('### coverage.json');
      expect(result).toContain('Type: computed');
      expect(result).toContain('lines');
    });
  });
});
