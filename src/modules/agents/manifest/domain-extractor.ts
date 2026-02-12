/**
 * Domain Extractor
 *
 * Deterministic utilities for extracting domain concepts, building
 * domain model, and generating context analysis from evidence.
 *
 * Used by ManifestService to produce the domainConcepts, domainModel,
 * healthSignals, and contextSnapshot sections of a RepoManifest.
 */

import * as path from 'path';
import { ContentProvider } from '../content';
import type {
  EvidenceItem,
  EvidenceAnalysis,
  TestAnalysis,
  TestQualityScore,
  OrphanTestInfo,
  DocChunk,
} from '../graphs/types/reconciliation-state';
import type {
  ManifestDomainModel,
  ManifestDomainConcepts,
  ManifestHealthSignals,
  ContextSnapshotData,
} from '../graphs/types/manifest.types';
import type { CoverageData } from '../coverage/coverage-parser';
import {
  analyzeTestQuality,
} from '../../quality/test-quality-analyzer';

// ============================================================================
// Concept Extraction (mirrored from context.node.ts)
// ============================================================================

const CONCEPT_ALIASES: Record<string, string> = {
  users: 'user', creating: 'create', creates: 'create', created: 'create',
  updates: 'update', updating: 'update', updated: 'update',
  deletes: 'delete', deleting: 'delete', deleted: 'delete',
  validates: 'validate', validating: 'validate', validated: 'validate', validation: 'validate',
  searches: 'search', searching: 'search',
  filters: 'filter', filtering: 'filter',
  sorts: 'sort', sorting: 'sort',
  uploads: 'upload', uploading: 'upload',
  downloads: 'download', downloading: 'download',
  submits: 'submit', submitting: 'submit',
  notifications: 'notification', permissions: 'permission', settings: 'setting',
  sessions: 'session', tokens: 'token', payments: 'payment', orders: 'order',
  profiles: 'profile', emails: 'email', errors: 'error',
  configs: 'config', configuration: 'config', configurations: 'config',
  logins: 'login',
  authenticating: 'auth', authentication: 'auth', authenticated: 'auth',
  authorizing: 'auth', authorization: 'auth', authorized: 'auth',
  products: 'product', categories: 'category', reviews: 'review', ratings: 'rating',
  comments: 'comment', accounts: 'account', addresses: 'address',
  events: 'event', webhooks: 'webhook', reports: 'report',
};

const DOMAIN_PATTERNS = [
  'user', 'auth', 'login', 'session', 'token', 'payment', 'order',
  'cart', 'checkout', 'create', 'update', 'delete', 'get', 'list',
  'validate', 'error', 'success', 'fail', 'submit', 'upload',
  'download', 'notification', 'email', 'search', 'filter', 'sort',
  'permission', 'role', 'admin', 'config', 'setting', 'profile',
  'product', 'category', 'price', 'inventory', 'shipping',
  'review', 'rating', 'comment', 'address', 'account',
  'dashboard', 'report', 'analytics', 'export', 'import',
  'webhook', 'event', 'queue', 'cache', 'database',
];

/**
 * Extract domain concepts from a name and code snippet.
 */
export function extractDomainConceptsFromCode(name: string, code: string): string[] {
  const concepts = new Set<string>();

  const nameWords = name
    .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((w) => w.length > 2);

  for (const w of nameWords) {
    concepts.add(CONCEPT_ALIASES[w] || w);
  }

  const codeLower = code.toLowerCase();
  for (const pattern of DOMAIN_PATTERNS) {
    if (codeLower.includes(pattern)) {
      concepts.add(CONCEPT_ALIASES[pattern] || pattern);
    }
  }

  for (const [alias, canonical] of Object.entries(CONCEPT_ALIASES)) {
    if (codeLower.includes(alias)) {
      concepts.add(canonical);
    }
  }

  return Array.from(concepts).slice(0, 15);
}

// ============================================================================
// Test Quality Extraction
// ============================================================================

export interface TestQualityResult {
  scores: Record<string, TestQualityScore>;
  healthSignalQuality: ManifestHealthSignals['testQuality'];
}

/**
 * Run static test quality analysis on orphan tests.
 * 100% deterministic — no LLM calls.
 */
export function extractTestQuality(
  orphanTests: OrphanTestInfo[],
): TestQualityResult {
  const scores: Record<string, TestQualityScore> = {};

  // Group tests by file
  const testsByFile = new Map<string, OrphanTestInfo[]>();
  for (const test of orphanTests) {
    const existing = testsByFile.get(test.filePath) || [];
    existing.push(test);
    testsByFile.set(test.filePath, existing);
  }

  for (const [filePath, tests] of testsByFile) {
    const sourceCode = tests[0].testSourceCode || tests[0].testCode;
    if (!sourceCode) continue;

    try {
      const result = analyzeTestQuality(sourceCode, { filePath });

      for (const test of tests) {
        const key = `${test.filePath}:${test.testName}`;
        const issues = Object.values(result.dimensions)
          .flatMap((d) => d.issues)
          .map((i) => i.message);

        scores[key] = {
          overallScore: result.overallScore,
          passed: result.passed,
          dimensions: {
            intentFidelity: result.dimensions.intentFidelity?.score ?? 1,
            noVacuousTests: result.dimensions.noVacuousTests?.score ?? 1,
            noBrittleTests: result.dimensions.noBrittleTests?.score ?? 1,
            determinism: result.dimensions.determinism?.score ?? 1,
            failureSignalQuality: result.dimensions.failureSignalQuality?.score ?? 1,
            integrationAuthenticity: result.dimensions.integrationTestAuthenticity?.score ?? 1,
            boundaryAndNegativeCoverage: result.dimensions.boundaryAndNegativeCoverage?.score ?? 1,
          },
          issues,
        };
      }
    } catch {
      // Skip files that fail analysis
    }
  }

  // Build aggregate health signal
  const allScores = Object.values(scores);
  const healthSignalQuality = allScores.length > 0 ? {
    averageScore: allScores.reduce((sum, s) => sum + s.overallScore, 0) / allScores.length,
    passRate: allScores.filter((s) => s.passed).length / allScores.length,
    dimensionAverages: aggregateDimensions(allScores),
  } : null;

  return { scores, healthSignalQuality };
}

function aggregateDimensions(scores: TestQualityScore[]): Record<string, number> {
  if (scores.length === 0) return {};

  const sums: Record<string, number> = {};
  const keys = Object.keys(scores[0].dimensions);

  for (const key of keys) {
    sums[key] = scores.reduce((sum, s) => sum + (s.dimensions[key as keyof TestQualityScore['dimensions']] || 0), 0);
  }

  const averages: Record<string, number> = {};
  for (const key of keys) {
    averages[key] = sums[key] / scores.length;
  }

  return averages;
}

// ============================================================================
// Context Analysis (deterministic parts from context.node.ts)
// ============================================================================

/**
 * Build context analysis for orphan tests and evidence items.
 * Pure static analysis — no LLM calls.
 */
export function buildContextSnapshot(
  orphanTests: OrphanTestInfo[],
  evidenceItems: EvidenceItem[],
  testQualityScores: Record<string, TestQualityScore>,
  documentationIndex: DocChunk[] | null,
): ContextSnapshotData {
  const contextPerTest: Record<string, TestAnalysis> = {};
  const evidenceAnalysis: Record<string, EvidenceAnalysis> = {};

  // Build test analysis
  for (const test of orphanTests) {
    const testKey = `${test.filePath}:${test.testName}`;
    const testCode = test.testCode || '';
    const domainConcepts = extractDomainConceptsFromCode(test.testName, testCode);

    contextPerTest[testKey] = {
      testId: testKey,
      summary: `Test: ${test.testName}`,
      domainConcepts,
      relatedCode: test.relatedSourceFiles?.map((f) => path.basename(f)),
      relatedDocs: [],
      rawContext: testCode,
    };
  }

  // Build evidence analysis
  for (const evidence of evidenceItems) {
    const evidenceId = `${evidence.type}:${evidence.filePath}:${evidence.name}`;

    if (evidence.type === 'test') {
      const testKey = `${evidence.filePath}:${evidence.name}`;
      const testAnalysis = contextPerTest[testKey];
      const qualityScore = testQualityScores[testKey];

      evidenceAnalysis[evidenceId] = {
        evidenceId,
        type: 'test',
        summary: testAnalysis?.summary || `Test: ${evidence.name}`,
        domainConcepts: testAnalysis?.domainConcepts || [],
        relatedCode: testAnalysis?.relatedCode,
        relatedDocs: testAnalysis?.relatedDocs,
        rawContext: testAnalysis?.rawContext || evidence.code,
        qualityScore: qualityScore?.overallScore,
      };
    } else {
      evidenceAnalysis[evidenceId] = buildNonTestEvidenceAnalysis(evidence, evidenceId);
    }
  }

  return { contextPerTest, evidenceAnalysis, documentationIndex };
}

function buildNonTestEvidenceAnalysis(evidence: EvidenceItem, evidenceId: string): EvidenceAnalysis {
  const code = evidence.code || '';
  const domainConcepts = extractDomainConceptsFromCode(evidence.name, code);

  switch (evidence.type) {
    case 'source_export': {
      const exportType = evidence.metadata?.exportType || 'unknown';
      return {
        evidenceId,
        type: 'source_export',
        summary: `Exported ${exportType} "${evidence.name}"${evidence.metadata?.isDefault ? ' (default)' : ''}`,
        domainConcepts,
        relatedCode: evidence.relatedFiles,
        rawContext: code,
      };
    }
    case 'ui_component': {
      const framework = evidence.metadata?.framework || 'unknown';
      const traits: string[] = [];
      if (evidence.metadata?.hasForm) traits.push('form input');
      if (evidence.metadata?.hasNavigation) traits.push('navigation');
      return {
        evidenceId,
        type: 'ui_component',
        summary: `${framework} component "${evidence.name}"${traits.length > 0 ? ` (${traits.join(', ')})` : ''}`,
        domainConcepts,
        relatedCode: evidence.relatedFiles,
        rawContext: code,
      };
    }
    case 'api_endpoint': {
      const method = evidence.metadata?.method || 'UNKNOWN';
      const routePath = evidence.metadata?.path || '/';
      const routeConcepts = routePath
        .split('/')
        .filter((s: string) => s && !s.startsWith(':') && !s.startsWith('{'))
        .map((s: string) => s.toLowerCase());
      return {
        evidenceId,
        type: 'api_endpoint',
        summary: `${method} ${routePath} → ${evidence.name}()`,
        domainConcepts: [...new Set([...domainConcepts, ...routeConcepts])],
        relatedCode: evidence.relatedFiles,
        rawContext: code,
      };
    }
    case 'code_comment': {
      const commentType = evidence.metadata?.commentType || 'comment';
      const typeLabels: Record<string, string> = {
        jsdoc: 'JSDoc documentation', task_annotation: 'task annotation',
        atom_reference: '@atom reference', business_logic: 'business logic comment',
      };
      return {
        evidenceId,
        type: 'code_comment',
        summary: `${typeLabels[commentType] || 'code comment'} in ${evidence.filePath}`,
        domainConcepts,
        rawContext: code,
      };
    }
    case 'coverage_gap': {
      const pct = evidence.metadata?.coveragePercent?.toFixed(0) || '?';
      return {
        evidenceId,
        type: 'coverage_gap',
        summary: `Coverage gap in ${evidence.filePath} (${pct}% covered)`,
        domainConcepts,
        rawContext: code,
      };
    }
    default:
      return {
        evidenceId,
        type: evidence.type,
        summary: `${evidence.type}: ${evidence.name}`,
        domainConcepts,
        rawContext: code,
      };
  }
}

// ============================================================================
// Domain Model Extraction (NEW — not in current pipeline)
// ============================================================================

/**
 * Build a domain model from evidence items.
 * Extracts entities, API surface, and UI surface.
 */
export function buildDomainModel(evidenceItems: EvidenceItem[]): ManifestDomainModel {
  const entities: ManifestDomainModel['entities'] = [];
  const apiSurface: ManifestDomainModel['apiSurface'] = [];
  const uiSurface: ManifestDomainModel['uiSurface'] = [];

  for (const item of evidenceItems) {
    if (item.type === 'source_export') {
      const exportType = item.metadata?.exportType;
      if (exportType === 'class' || exportType === 'interface') {
        entities.push({
          name: item.name,
          filePath: item.filePath,
          type: exportType,
        });
      }
    }

    if (item.type === 'api_endpoint') {
      apiSurface.push({
        method: item.metadata?.method || 'UNKNOWN',
        path: item.metadata?.path || '/',
        handler: item.name,
        filePath: item.filePath,
      });
    }

    if (item.type === 'ui_component') {
      const traits: string[] = [];
      if (item.metadata?.hasForm) traits.push('form');
      if (item.metadata?.hasNavigation) traits.push('navigation');
      uiSurface.push({
        name: item.name,
        filePath: item.filePath,
        framework: item.metadata?.framework || 'unknown',
        traits,
      });
    }
  }

  return { entities, apiSurface, uiSurface };
}

// ============================================================================
// Domain Concepts Aggregation (NEW — not in current pipeline)
// ============================================================================

/**
 * Aggregate domain concepts from all evidence analyses.
 */
export function aggregateDomainConcepts(
  evidenceAnalysis: Record<string, EvidenceAnalysis>,
): ManifestDomainConcepts {
  const conceptFreq = new Map<string, { count: number; sources: Set<string> }>();

  for (const analysis of Object.values(evidenceAnalysis)) {
    for (const concept of analysis.domainConcepts) {
      const normalized = CONCEPT_ALIASES[concept] || concept;
      const existing = conceptFreq.get(normalized) || { count: 0, sources: new Set() };
      existing.count++;
      existing.sources.add(analysis.evidenceId.split(':').slice(1).join(':'));
      conceptFreq.set(normalized, existing);
    }
  }

  // Sort by frequency
  const concepts = Array.from(conceptFreq.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50)
    .map(([name, data]) => ({
      name,
      frequency: data.count,
      sources: Array.from(data.sources).slice(0, 10),
    }));

  // Build clusters via simple co-occurrence
  const clusters = buildConceptClusters(concepts, evidenceAnalysis);

  return { concepts, clusters };
}

function buildConceptClusters(
  concepts: ManifestDomainConcepts['concepts'],
  evidenceAnalysis: Record<string, EvidenceAnalysis>,
): ManifestDomainConcepts['clusters'] {
  // Group concepts that frequently co-occur in the same evidence items
  const coOccurrence = new Map<string, Map<string, number>>();
  const conceptNames = new Set(concepts.map((c) => c.name));

  for (const analysis of Object.values(evidenceAnalysis)) {
    const normalizedConcepts = analysis.domainConcepts
      .map((c) => CONCEPT_ALIASES[c] || c)
      .filter((c) => conceptNames.has(c));

    for (let i = 0; i < normalizedConcepts.length; i++) {
      for (let j = i + 1; j < normalizedConcepts.length; j++) {
        const a = normalizedConcepts[i];
        const b = normalizedConcepts[j];

        if (!coOccurrence.has(a)) coOccurrence.set(a, new Map());
        if (!coOccurrence.has(b)) coOccurrence.set(b, new Map());
        coOccurrence.get(a)!.set(b, (coOccurrence.get(a)!.get(b) || 0) + 1);
        coOccurrence.get(b)!.set(a, (coOccurrence.get(b)!.get(a) || 0) + 1);
      }
    }
  }

  // Simple greedy clustering: pick the highest-frequency concept as a cluster seed
  const clustered = new Set<string>();
  const clusters: ManifestDomainConcepts['clusters'] = [];

  for (const concept of concepts) {
    if (clustered.has(concept.name)) continue;

    const neighbors = coOccurrence.get(concept.name);
    if (!neighbors) {
      clustered.add(concept.name);
      clusters.push({
        name: concept.name,
        concepts: [concept.name],
        fileCount: concept.sources.length,
      });
      continue;
    }

    // Find strong co-occurring concepts (threshold: 3+ co-occurrences)
    const clusterConcepts = [concept.name];
    for (const [neighbor, count] of neighbors.entries()) {
      if (count >= 3 && !clustered.has(neighbor)) {
        clusterConcepts.push(neighbor);
        clustered.add(neighbor);
      }
    }
    clustered.add(concept.name);

    clusters.push({
      name: concept.name,
      concepts: clusterConcepts,
      fileCount: concept.sources.length,
    });
  }

  return clusters.slice(0, 20);
}

// ============================================================================
// Health Signals Aggregation
// ============================================================================

/**
 * Build health signals from quality scores, coverage data, and dependency info.
 */
export function buildHealthSignals(
  testQualityHealth: ManifestHealthSignals['testQuality'],
  coverageData: CoverageData | null,
  dependencyCount: number,
): ManifestHealthSignals {
  return {
    testQuality: testQualityHealth,
    coverage: coverageData ? {
      overallPercent: coverageData.coveragePercent,
      format: coverageData.format,
      fileCount: coverageData.files.length,
    } : null,
    couplingScore: null, // Computed separately if needed
    dependencyCount,
  };
}

// ============================================================================
// Documentation Index Builder (mirrored from context.node.ts)
// ============================================================================

/**
 * Build a documentation index by scanning the docs directory.
 */
export async function buildDocumentationIndex(
  rootDirectory: string,
  maxChunks: number,
  contentProvider: ContentProvider,
): Promise<DocChunk[]> {
  const chunks: DocChunk[] = [];
  const docsDir = path.join(rootDirectory, 'docs');

  if (!(await contentProvider.exists(docsDir))) {
    return chunks;
  }

  const docFiles = await contentProvider.walkDirectory(docsDir, {
    excludePatterns: ['node_modules'],
    maxFiles: maxChunks * 2,
    includeExtensions: ['.md'],
  });

  for (const relativePath of docFiles) {
    if (chunks.length >= maxChunks) break;

    const fullPath = path.join(docsDir, relativePath);
    const content = await contentProvider.readFileOrNull(fullPath);
    if (content === null) continue;

    const keywords = extractDocKeywords(content);
    chunks.push({
      filePath: path.join('docs', relativePath),
      content: content.substring(0, 2000),
      keywords,
    });
  }

  return chunks;
}

function extractDocKeywords(content: string): string[] {
  const keywords = new Set<string>();
  let match: RegExpExecArray | null;

  const headingRegex = /^#{1,3}\s+(.+)$/gm;
  while ((match = headingRegex.exec(content)) !== null) {
    match[1].toLowerCase().split(/[\s\-_:/]+/).forEach((w) => {
      if (w.length > 2) keywords.add(w);
    });
  }

  const codeRegex = /`([^`]+)`/g;
  while ((match = codeRegex.exec(content)) !== null) {
    const code = match[1].toLowerCase();
    if (code.length > 2 && code.length < 50) keywords.add(code);
  }

  return Array.from(keywords).slice(0, 20);
}
