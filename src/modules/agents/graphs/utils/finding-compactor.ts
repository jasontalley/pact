/**
 * Finding Compactor Utilities
 *
 * Provides functions to compact findings for context efficiency.
 * This reduces token usage by replacing raw content with summaries
 * while preserving key facts and metadata.
 */

import { Finding, CompactFinding, EvidenceLevel } from '../types/base-state';

/**
 * Maximum length for compact finding summaries
 */
const MAX_SUMMARY_LENGTH = 200;

/**
 * Determine evidence level from a finding.
 * Higher levels indicate more valuable/processed information.
 */
export function getEvidenceLevelFromFinding(finding: Finding): EvidenceLevel {
  if (finding.computedFacts && Object.keys(finding.computedFacts).length > 0) {
    return 4; // Computed facts
  }
  if (finding.parseMetadata?.parseSuccess) {
    return 3; // Parsed structured data
  }
  if (
    finding.relevance === 'Directory listing' ||
    finding.relevance === 'Directory listing (discovery phase)'
  ) {
    return 1; // Directory listing
  }
  return 2; // Raw file read
}

/**
 * Compact a finding by replacing raw content with a summary.
 * Preserves computed facts and key metadata.
 */
export function compactFinding(finding: Finding): CompactFinding {
  // For computed facts - keep facts, summarize content
  if (finding.computedFacts && Object.keys(finding.computedFacts).length > 0) {
    const factKeys = Object.keys(finding.computedFacts);
    return {
      source: finding.source,
      type: 'computed',
      summary: `Computed: ${factKeys.slice(0, 5).join(', ')}${factKeys.length > 5 ? '...' : ''}`,
      facts: finding.computedFacts,
      confidence: finding.confidence ?? 1,
    };
  }

  // For parsed JSON - extract key facts
  if (finding.parseMetadata?.parseSuccess) {
    const summary =
      finding.parseMetadata.schemaSummary ||
      `Parsed ${finding.parseMetadata.format || 'JSON'}` +
        (finding.parseMetadata.topLevelKeys
          ? `: ${finding.parseMetadata.topLevelKeys.slice(0, 5).join(', ')}`
          : '');
    return {
      source: finding.source,
      type: 'file',
      summary: summary.slice(0, MAX_SUMMARY_LENGTH),
      facts: extractKeyFacts(finding),
      confidence: finding.confidence ?? 0.9,
    };
  }

  // For directory listings - count items
  if (
    finding.relevance === 'Directory listing' ||
    finding.relevance === 'Directory listing (discovery phase)'
  ) {
    const lines = finding.content.split('\n').filter((l) => l.trim());
    const fileCount = lines.length;
    return {
      source: finding.source,
      type: 'directory',
      summary: `Directory with ${fileCount} items`,
      confidence: 1,
    };
  }

  // For raw content - truncate aggressively
  const contentPreview = finding.content
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SUMMARY_LENGTH - 3);
  return {
    source: finding.source,
    type: 'file',
    summary: contentPreview + (finding.content.length > MAX_SUMMARY_LENGTH ? '...' : ''),
    confidence: finding.confidence ?? 0.5,
  };
}

/**
 * Extract key facts from a parsed finding.
 * Looks for common patterns like coverage metrics, counts, etc.
 */
function extractKeyFacts(finding: Finding): Record<string, unknown> | undefined {
  if (!finding.parseMetadata?.parseSuccess || !finding.content) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(finding.content);
    const facts: Record<string, unknown> = {};

    // Extract coverage metrics if present
    if (parsed.total && typeof parsed.total === 'object') {
      if (parsed.total.lines) facts.lines = parsed.total.lines;
      if (parsed.total.statements) facts.statements = parsed.total.statements;
      if (parsed.total.branches) facts.branches = parsed.total.branches;
      if (parsed.total.functions) facts.functions = parsed.total.functions;
    }

    // Extract common metric patterns
    if (typeof parsed.coverage === 'number') facts.coverage = parsed.coverage;
    if (typeof parsed.passed === 'number') facts.passed = parsed.passed;
    if (typeof parsed.failed === 'number') facts.failed = parsed.failed;
    if (typeof parsed.total === 'number') facts.total = parsed.total;
    if (typeof parsed.count === 'number') facts.count = parsed.count;

    return Object.keys(facts).length > 0 ? facts : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Deduplicate findings by source, keeping the one with higher evidence level.
 */
export function deduplicateFindingsBySource(findings: Finding[]): Finding[] {
  const map = new Map<string, Finding>();

  for (const finding of findings) {
    const existing = map.get(finding.source);
    if (!existing) {
      map.set(finding.source, finding);
    } else {
      // Keep the one with higher evidence level
      const existingLevel = getEvidenceLevelFromFinding(existing);
      const newLevel = getEvidenceLevelFromFinding(finding);
      if (newLevel > existingLevel) {
        map.set(finding.source, finding);
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Format findings for prompt inclusion.
 * After iteration 2, uses compact summaries instead of full content.
 *
 * @param findings - All findings to format
 * @param iteration - Current iteration (0-indexed)
 * @param recentCount - Number of recent findings to keep full content (default: 3)
 */
export function formatFindingsForPrompt(
  findings: Finding[],
  iteration: number,
  recentCount: number = 3,
): string {
  if (findings.length === 0) {
    return 'None yet';
  }

  // Before iteration 2, show all findings with full relevance
  if (iteration < 2) {
    return findings.map((f) => `- ${f.source}: ${f.relevance}`).join('\n');
  }

  // After iteration 2, compact older findings
  const lines: string[] = [];
  const deduped = deduplicateFindingsBySource(findings);

  for (let i = 0; i < deduped.length; i++) {
    const finding = deduped[i];
    const isRecent = i >= deduped.length - recentCount;

    if (isRecent) {
      // Keep full relevance for recent findings
      lines.push(`- ${finding.source}: ${finding.relevance}`);
    } else {
      // Compact older findings
      const compact = compactFinding(finding);
      lines.push(`- ${compact.source}: [${compact.type}] ${compact.summary}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format findings for synthesis (final output generation).
 * Uses compacted summaries but includes facts for computed findings.
 */
export function formatFindingsForSynthesis(findings: Finding[]): string {
  if (findings.length === 0) {
    return 'No findings gathered.';
  }

  const deduped = deduplicateFindingsBySource(findings);
  const lines: string[] = [];

  for (const finding of deduped) {
    const compact = compactFinding(finding);
    lines.push(`### ${finding.source}`);
    lines.push(`Type: ${compact.type}`);
    lines.push(`Summary: ${compact.summary}`);

    if (compact.facts && Object.keys(compact.facts).length > 0) {
      lines.push('Facts:');
      for (const [key, value] of Object.entries(compact.facts)) {
        lines.push(`  - ${key}: ${JSON.stringify(value)}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}
