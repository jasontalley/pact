/**
 * Manifest Types
 *
 * Type definitions for the RepoManifest — a durable, deterministic
 * snapshot of a repository's structure, evidence, domain model, and
 * health signals. Produced by ManifestService without any LLM calls.
 *
 * Used by:
 * - ManifestService (generation)
 * - RepoManifest entity (storage)
 * - load-manifest node (graph hydration)
 * - ManifestViewer frontend component (display)
 */

import type {
  RepoStructure,
  OrphanTestInfo,
  EvidenceItem,
  TestQualityScore,
  TestAnalysis,
  EvidenceAnalysis,
  DocChunk,
} from './reconciliation-state';
import type { CoverageData } from '../../coverage/coverage-parser';

// ============================================================================
// Manifest Section Types
// ============================================================================

/**
 * Project identity extracted from package.json, git, and file extensions.
 */
export interface ManifestIdentity {
  /** Package name from package.json */
  name: string | null;
  /** Package description from package.json */
  description: string | null;
  /** Programming languages detected (from file extensions) */
  languages: string[];
  /** Frameworks detected (from dependencies) */
  frameworks: string[];
  /** Git commit hash at time of manifest generation */
  commitHash: string | null;
  /** Repository URL (from package.json or GitHub config) */
  repositoryUrl: string | null;
}

/**
 * Structural summary of the repository.
 */
export interface ManifestStructure {
  /** Total number of files scanned */
  totalFiles: number;
  /** Number of source code files */
  sourceFileCount: number;
  /** Number of test files */
  testFileCount: number;
  /** Number of UI component files */
  uiFileCount: number;
  /** Number of documentation files */
  docFileCount: number;
  /** Number of configuration files */
  configFileCount: number;
  /** File count by extension (e.g., { ".ts": 120, ".tsx": 45 }) */
  filesByExtension: Record<string, number>;
  /** Top-level directory tree (3 levels deep) */
  directoryTree: DirectoryTreeNode[];
  /** Application entry points (main.ts, index.ts, etc.) */
  entryPoints: string[];
  /** Detected test file naming patterns */
  testFilePatterns: string[];
}

/**
 * Inventory of all evidence discovered in the repository.
 */
export interface ManifestEvidenceInventory {
  /** Aggregate counts */
  summary: {
    total: number;
    byType: Record<string, number>;
  };
  /** Test evidence */
  tests: {
    count: number;
    orphanCount: number;
    linkedCount: number;
  };
  /** Source export evidence */
  sourceExports: {
    count: number;
    byExportType: Record<string, number>;
  };
  /** UI component evidence */
  uiComponents: {
    count: number;
    frameworks: string[];
  };
  /** API endpoint evidence */
  apiEndpoints: {
    count: number;
    byMethod: Record<string, number>;
  };
  /** Documentation evidence */
  documentation: {
    count: number;
    files: string[];
  };
  /** Code comment evidence */
  codeComments: {
    count: number;
    byCommentType: Record<string, number>;
  };
  /** Coverage gap evidence */
  coverageGaps: {
    count: number;
    avgCoveragePercent: number | null;
  };
}

/**
 * Domain model extracted deterministically from source code.
 */
export interface ManifestDomainModel {
  /** TypeScript/Java/etc. entities (classes, interfaces, types) */
  entities: Array<{
    name: string;
    filePath: string;
    type: 'class' | 'interface' | 'type';
  }>;
  /** API surface (routes, controllers, resolvers) */
  apiSurface: Array<{
    method: string;
    path: string;
    handler: string;
    filePath: string;
  }>;
  /** UI surface (components with traits) */
  uiSurface: Array<{
    name: string;
    filePath: string;
    framework: string;
    traits: string[];
  }>;
}

/**
 * Repository health signals computed from deterministic analysis.
 */
export interface ManifestHealthSignals {
  /** Aggregate test quality from static analysis */
  testQuality: {
    averageScore: number;
    passRate: number;
    dimensionAverages: Record<string, number>;
  } | null;
  /** Code coverage summary */
  coverage: {
    overallPercent: number;
    format: string;
    fileCount: number;
  } | null;
  /** Test-atom coupling score (0-100) */
  couplingScore: number | null;
  /** Total dependency count */
  dependencyCount: number;
}

/**
 * Domain concepts extracted from code structure and naming.
 */
export interface ManifestDomainConcepts {
  /** Individual concepts with frequency and source files */
  concepts: Array<{
    name: string;
    frequency: number;
    sources: string[];
  }>;
  /** Concept clusters (groups of related concepts) */
  clusters: Array<{
    name: string;
    concepts: string[];
    fileCount: number;
  }>;
}

/**
 * Node in the directory tree representation.
 */
export interface DirectoryTreeNode {
  /** Directory or file name */
  name: string;
  /** Whether this is a file or directory */
  type: 'file' | 'directory';
  /** Child nodes (directories only) */
  children?: DirectoryTreeNode[];
  /** Total file count below this node (directories only) */
  count?: number;
}

// ============================================================================
// Context Snapshot (for graph state hydration)
// ============================================================================

/**
 * Snapshot of context data from the deterministic context extraction phase.
 * Stored as JSONB in the manifest for later graph state hydration.
 *
 * Maps are serialized as Record<string, T> since JSONB doesn't support Maps.
 */
export interface ContextSnapshotData {
  /** Per-test context analysis (key: filePath:testName) */
  contextPerTest: Record<string, TestAnalysis>;
  /** Per-evidence analysis (key: filePath:name) */
  evidenceAnalysis: Record<string, EvidenceAnalysis>;
  /** Documentation index */
  documentationIndex: DocChunk[] | null;
}

// ============================================================================
// Manifest Generation Options
// ============================================================================

/**
 * Options for generating a manifest.
 */
export interface ManifestGenerateOptions {
  /** Project ID (for association and dedup by commit) */
  projectId?: string;
  /** Root directory of the repository */
  rootDirectory?: string;
  /** Content source type */
  contentSource?: 'filesystem' | 'github' | 'pre_read';
  /** Force regeneration even if a matching manifest exists */
  force?: boolean;
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export type {
  RepoStructure,
  OrphanTestInfo,
  EvidenceItem,
  TestQualityScore,
  CoverageData,
  TestAnalysis,
  EvidenceAnalysis,
  DocChunk,
};
