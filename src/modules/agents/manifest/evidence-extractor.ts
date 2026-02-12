/**
 * Evidence Extractor
 *
 * Deterministic utilities for extracting evidence from repository files.
 * Orchestrates orphan test scanning and multi-source evidence extraction.
 *
 * Used by ManifestService to produce the evidenceInventory section
 * of a RepoManifest, and to build orphanTests + evidenceItems snapshots.
 */

import { ContentProvider } from '../content';
import { extractEvidenceFromFile } from '../graphs/nodes/reconciliation/evidence-extractors';
import type {
  RepoStructure,
  OrphanTestInfo,
  EvidenceItem,
  EvidenceType,
  EVIDENCE_CONFIDENCE_WEIGHTS,
} from '../graphs/types/reconciliation-state';
import { EVIDENCE_CONFIDENCE_WEIGHTS as WEIGHTS } from '../graphs/types/reconciliation-state';
import type { CoverageData } from '../coverage/coverage-parser';
import type { ManifestEvidenceInventory } from '../graphs/types/manifest.types';

// ============================================================================
// Orphan Test Parsing (extracted from discover-fullscan.node.ts)
// ============================================================================

/**
 * Parse a test file and extract orphan tests (tests without @atom annotation).
 */
export function parseTestFileContent(
  filePath: string,
  content: string,
  annotationLookback = 5,
): OrphanTestInfo[] {
  const orphanTests: OrphanTestInfo[] = [];
  const lines = content.split('\n');

  const atomAnnotationRegex = /@atom\s+(IA-\d+)/;
  const testRegex = /^\s*(it|test)\s*\(\s*['"`](.+?)['"`]/;
  const describeRegex = /^\s*describe\s*\(\s*['"`](.+?)['"`]/;

  let currentDescribe = '';
  const describeStack: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    const describeMatch = line.match(describeRegex);
    if (describeMatch) {
      currentDescribe = describeMatch[1];
      describeStack.push(currentDescribe);
    }

    if (line.includes('});') && describeStack.length > 0) {
      describeStack.pop();
      currentDescribe = describeStack[describeStack.length - 1] || '';
    }

    const testMatch = line.match(testRegex);
    if (testMatch) {
      const testName = testMatch[2];

      let hasAnnotation = false;
      const lookbackStart = Math.max(0, i - annotationLookback);
      for (let j = lookbackStart; j < i; j++) {
        if (atomAnnotationRegex.test(lines[j])) {
          hasAnnotation = true;
          break;
        }
      }
      if (!hasAnnotation && atomAnnotationRegex.test(line)) {
        hasAnnotation = true;
      }

      if (!hasAnnotation) {
        const testCode = extractTestCode(lines, i);
        orphanTests.push({
          filePath,
          testName: describeStack.length > 0
            ? `${describeStack.join(' > ')} > ${testName}`
            : testName,
          lineNumber,
          testCode,
          relatedSourceFiles: [],
          testSourceCode: content,
        });
      }
    }
  }

  return orphanTests;
}

function extractTestCode(lines: string[], startLine: number): string {
  const result: string[] = [];
  let braceDepth = 0;
  let started = false;

  for (let i = startLine; i < Math.min(lines.length, startLine + 100); i++) {
    const line = lines[i];
    result.push(line);

    for (const char of line) {
      if (char === '{') { braceDepth++; started = true; }
      if (char === '}') { braceDepth--; }
    }

    if (started && braceDepth === 0) break;
  }

  return result.join('\n');
}

/**
 * Count linked tests (tests WITH @atom annotation) in a file.
 */
function countLinkedTests(content: string): number {
  const atomAnnotationRegex = /@atom\s+(IA-\d+)/;
  const testRegex = /^\s*(it|test)\s*\(\s*['"`](.+?)['"`]/;
  const lines = content.split('\n');
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    const testMatch = lines[i].match(testRegex);
    if (testMatch) {
      const lookbackStart = Math.max(0, i - 5);
      for (let j = lookbackStart; j <= i; j++) {
        if (atomAnnotationRegex.test(lines[j])) {
          count++;
          break;
        }
      }
    }
  }

  return count;
}

// ============================================================================
// Options & Results
// ============================================================================

export interface EvidenceExtractorOptions {
  maxTests?: number;
  maxSourceExports?: number;
  maxApiEndpoints?: number;
  maxDocSections?: number;
}

export interface EvidenceExtractionResult {
  orphanTests: OrphanTestInfo[];
  evidenceItems: EvidenceItem[];
  linkedTestCount: number;
  evidenceInventory: ManifestEvidenceInventory;
}

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract all evidence from a repository using a ContentProvider.
 * 100% deterministic — no LLM calls.
 */
export async function extractEvidence(
  rootDirectory: string,
  contentProvider: ContentProvider,
  repoStructure: RepoStructure,
  coverageData: CoverageData | null,
  options: EvidenceExtractorOptions = {},
): Promise<EvidenceExtractionResult> {
  const maxTests = options.maxTests || 5000;
  const maxSourceExports = options.maxSourceExports || 200;
  const maxApiEndpoints = options.maxApiEndpoints || 50;
  const maxDocSections = options.maxDocSections || 20;

  const testFiles = repoStructure.testFiles || [];
  const allOrphanTests: OrphanTestInfo[] = [];
  let linkedTestCount = 0;
  const allEvidence: EvidenceItem[] = [];

  // 1. Parse test files for orphan tests
  for (const testFile of testFiles) {
    if (allOrphanTests.length >= maxTests) break;

    try {
      const content = await contentProvider.readFileOrNull(testFile);
      if (content === null) continue;

      const orphans = parseTestFileContent(testFile, content);
      linkedTestCount += countLinkedTests(content);

      // Find related source files
      for (const orphan of orphans) {
        const sourcePath = testFile
          .replace(/\.spec\.ts$/, '.ts')
          .replace(/\.test\.ts$/, '.ts')
          .replace(/\.e2e-spec\.ts$/, '.ts');

        if (sourcePath !== testFile && await contentProvider.exists(sourcePath)) {
          orphan.relatedSourceFiles = [sourcePath];
        }
      }

      allOrphanTests.push(...orphans);
    } catch {
      // Skip unreadable test files
    }
  }

  const limitedOrphanTests = allOrphanTests.slice(0, maxTests);

  // Convert orphan tests → test evidence items
  for (const orphan of limitedOrphanTests) {
    allEvidence.push({
      type: 'test',
      filePath: orphan.filePath,
      name: orphan.testName,
      code: orphan.testCode,
      lineNumber: orphan.lineNumber,
      relatedFiles: orphan.relatedSourceFiles,
      baseConfidence: WEIGHTS.test,
      metadata: {
        testCode: orphan.testCode,
        relatedSourceFiles: orphan.relatedSourceFiles,
        testSourceCode: orphan.testSourceCode,
      },
    });
  }

  // 2. Extract evidence from non-test files
  const frameworks = repoStructure.detectedFrameworks || [];
  const sourceFiles = (repoStructure.sourceFiles || []).slice(0, 300);
  const uiFiles = repoStructure.uiFiles || [];
  const docFiles = (repoStructure.docFiles || []).slice(0, 30);

  const filesToProcess: Array<{ path: string; type: 'source' | 'ui' | 'doc' }> = [
    ...uiFiles.map((f) => ({ path: f, type: 'ui' as const })),
    ...sourceFiles.map((f) => ({ path: f, type: 'source' as const })),
    ...docFiles.map((f) => ({ path: f, type: 'doc' as const })),
  ];

  let sourceExportCount = 0;
  let uiComponentCount = 0;
  let apiEndpointCount = 0;
  let docSectionCount = 0;

  for (const file of filesToProcess) {
    try {
      const fileContent = await contentProvider.readFileOrNull(file.path);
      if (fileContent === null) continue;

      const evidence = extractEvidenceFromFile(file.path, fileContent, frameworks, file.type);

      for (const item of evidence) {
        if (item.type === 'source_export' && sourceExportCount >= maxSourceExports) continue;
        if (item.type === 'api_endpoint' && apiEndpointCount >= maxApiEndpoints) continue;
        if (item.type === 'documentation' && docSectionCount >= maxDocSections) continue;

        allEvidence.push(item);

        if (item.type === 'source_export') sourceExportCount++;
        if (item.type === 'ui_component') uiComponentCount++;
        if (item.type === 'api_endpoint') apiEndpointCount++;
        if (item.type === 'documentation') docSectionCount++;
      }
    } catch {
      // Skip unreadable files
    }
  }

  // 3. Coverage gap evidence
  let coverageGapCount = 0;
  if (coverageData && coverageData.files.length > 0) {
    for (const file of coverageData.files) {
      if (file.totalLines > 0 && file.coveredLines / file.totalLines < 0.5) {
        allEvidence.push({
          type: 'coverage_gap',
          filePath: file.filePath,
          name: 'Uncovered: ' + file.filePath.split('/').pop(),
          lineNumber: file.uncoveredRanges[0]?.start,
          baseConfidence: WEIGHTS.coverage_gap,
          metadata: {
            uncoveredLines: file.totalLines - file.coveredLines,
            totalLines: file.totalLines,
            coveragePercent: (file.coveredLines / file.totalLines) * 100,
          },
        });
        coverageGapCount++;
      }
    }
  }

  // 4. Build evidence inventory summary
  const evidenceInventory = buildEvidenceInventory(
    allEvidence,
    limitedOrphanTests.length,
    linkedTestCount,
    coverageData,
  );

  return {
    orphanTests: limitedOrphanTests,
    evidenceItems: allEvidence,
    linkedTestCount,
    evidenceInventory,
  };
}

// ============================================================================
// Inventory Builder
// ============================================================================

function buildEvidenceInventory(
  evidence: EvidenceItem[],
  orphanCount: number,
  linkedCount: number,
  coverageData: CoverageData | null,
): ManifestEvidenceInventory {
  const byType: Record<string, number> = {};
  const byExportType: Record<string, number> = {};
  const byMethod: Record<string, number> = {};
  const byCommentType: Record<string, number> = {};
  const uiFrameworks = new Set<string>();
  const docFileSet = new Set<string>();

  for (const item of evidence) {
    byType[item.type] = (byType[item.type] || 0) + 1;

    if (item.type === 'source_export' && item.metadata?.exportType) {
      byExportType[item.metadata.exportType] = (byExportType[item.metadata.exportType] || 0) + 1;
    }
    if (item.type === 'api_endpoint' && item.metadata?.method) {
      byMethod[item.metadata.method] = (byMethod[item.metadata.method] || 0) + 1;
    }
    if (item.type === 'ui_component' && item.metadata?.framework) {
      uiFrameworks.add(item.metadata.framework);
    }
    if (item.type === 'documentation') {
      docFileSet.add(item.filePath);
    }
    if (item.type === 'code_comment' && item.metadata?.commentType) {
      byCommentType[item.metadata.commentType] = (byCommentType[item.metadata.commentType] || 0) + 1;
    }
  }

  const avgCoverage = coverageData ? coverageData.coveragePercent : null;

  return {
    summary: {
      total: evidence.length,
      byType,
    },
    tests: {
      count: orphanCount + linkedCount,
      orphanCount,
      linkedCount,
    },
    sourceExports: {
      count: byType['source_export'] || 0,
      byExportType,
    },
    uiComponents: {
      count: byType['ui_component'] || 0,
      frameworks: Array.from(uiFrameworks),
    },
    apiEndpoints: {
      count: byType['api_endpoint'] || 0,
      byMethod,
    },
    documentation: {
      count: byType['documentation'] || 0,
      files: Array.from(docFileSet),
    },
    codeComments: {
      count: byType['code_comment'] || 0,
      byCommentType,
    },
    coverageGaps: {
      count: byType['coverage_gap'] || 0,
      avgCoveragePercent: avgCoverage,
    },
  };
}
