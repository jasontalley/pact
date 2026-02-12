/**
 * Structure Extractor
 *
 * Deterministic utilities for extracting repository structure information.
 * Used by ManifestService to produce the identity + structure sections
 * of a RepoManifest.
 *
 * These functions mirror the logic in structure.node.ts but are
 * decoupled from LangGraph state, making them reusable.
 */

import { ContentProvider } from '../content';
import type {
  ManifestIdentity,
  ManifestStructure,
  DirectoryTreeNode,
  RepoStructure,
} from '../graphs/types/manifest.types';
import type { CoverageData } from '../coverage/coverage-parser';
import {
  COVERAGE_ARTIFACT_PATHS,
  parseCoverageFile,
} from '../coverage/coverage-parser';

// ============================================================================
// Constants (mirrored from structure.node.ts)
// ============================================================================

const DEFAULT_TEST_PATTERNS = ['**/*.spec.ts', '**/*.test.ts', '**/*.e2e-spec.ts'];
const DEFAULT_SOURCE_PATTERNS = ['**/*.ts', '**/*.tsx'];
const DEFAULT_UI_PATTERNS = ['**/*.tsx', '**/*.jsx', '**/*.vue', '**/*.svelte'];
const DEFAULT_DOC_PATTERNS = [
  '**/README.md', '**/README.rst', '**/docs/**/*.md',
  '**/CHANGELOG.md', '**/CONTRIBUTING.md',
];
const DEFAULT_CONFIG_PATTERNS = ['package.json', 'tsconfig.json', '.env.example'];
const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules', 'dist', '.git', 'coverage', '.next', '.cache', 'build',
];

// ============================================================================
// Glob Matching (mirrored from structure.node.ts)
// ============================================================================

function matchGlob(filePath: string, pattern: string): boolean {
  let regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*');

  if (regexPattern.startsWith('.*/')) {
    regexPattern = `(${regexPattern}|${regexPattern.slice(3)})`;
  }

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchGlob(filePath, pattern));
}

// ============================================================================
// Options
// ============================================================================

export interface StructureExtractorOptions {
  testPatterns?: string[];
  sourcePatterns?: string[];
  excludePatterns?: string[];
  maxFiles?: number;
}

// ============================================================================
// Results
// ============================================================================

export interface StructureExtractionResult {
  repoStructure: RepoStructure;
  coverageData: CoverageData | null;
  identity: ManifestIdentity;
  structure: ManifestStructure;
}

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract structure information from a repository using a ContentProvider.
 * 100% deterministic — no LLM calls.
 */
export async function extractStructure(
  rootDirectory: string,
  contentProvider: ContentProvider,
  options: StructureExtractorOptions = {},
): Promise<StructureExtractionResult> {
  const testPatterns = options.testPatterns || DEFAULT_TEST_PATTERNS;
  const sourcePatterns = options.sourcePatterns || DEFAULT_SOURCE_PATTERNS;
  const excludePatterns = options.excludePatterns || DEFAULT_EXCLUDE_PATTERNS;
  const maxFiles = options.maxFiles || 10000;

  // Walk directory
  const allFiles = await contentProvider.walkDirectory(rootDirectory, {
    excludePatterns,
    maxFiles,
  });

  // Categorize files
  const testFiles: string[] = [];
  const sourceFiles: string[] = [];
  const uiFiles: string[] = [];
  const docFiles: string[] = [];
  const configFiles: string[] = [];

  for (const file of allFiles) {
    if (matchesAnyPattern(file, testPatterns)) {
      testFiles.push(file);
    } else if (matchesAnyPattern(file, DEFAULT_DOC_PATTERNS)) {
      docFiles.push(file);
    } else if (matchesAnyPattern(file, DEFAULT_CONFIG_PATTERNS)) {
      configFiles.push(file);
    } else if (matchesAnyPattern(file, DEFAULT_UI_PATTERNS)) {
      uiFiles.push(file);
    } else if (matchesAnyPattern(file, sourcePatterns)) {
      sourceFiles.push(file);
    }
  }

  // Detect frameworks from all package.json files
  const frameworkSet = new Set<string>();
  let packageInfo: RepoStructure['packageInfo'] | undefined;
  const allPkgPaths = allFiles.filter(
    (f) => f === 'package.json' || f.endsWith('/package.json'),
  );

  for (const pkgPath of allPkgPaths) {
    try {
      const pkgContent = await contentProvider.readFile(
        pkgPath.startsWith('/') ? pkgPath : `${rootDirectory}/${pkgPath}`,
      );
      const pkg = JSON.parse(pkgContent);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['react'] || deps['next']) frameworkSet.add('react');
      if (deps['vue']) frameworkSet.add('vue');
      if (deps['@nestjs/core']) frameworkSet.add('nestjs');
      if (deps['express']) frameworkSet.add('express');
      if (deps['@angular/core']) frameworkSet.add('angular');
      if (deps['svelte']) frameworkSet.add('svelte');
      if (deps['fastify']) frameworkSet.add('fastify');
      if (deps['graphql'] || deps['@nestjs/graphql'] || deps['@apollo/server']) frameworkSet.add('graphql');

      packageInfo ??= {
        name: pkg.name,
        description: pkg.description,
        scripts: pkg.scripts,
      };
    } catch {
      // package.json not readable or parseable — not critical
    }
  }

  const detectedFrameworks = frameworkSet.size > 0 ? Array.from(frameworkSet) : undefined;

  // Build RepoStructure (same shape as graph state)
  const repoStructure: RepoStructure = {
    files: [...sourceFiles, ...testFiles],
    testFiles,
    sourceFiles,
    uiFiles: uiFiles.length > 0 ? uiFiles : undefined,
    docFiles: docFiles.length > 0 ? docFiles : undefined,
    configFiles: configFiles.length > 0 ? configFiles : undefined,
    detectedFrameworks,
    packageInfo,
  };

  // Scan for coverage artifacts
  let coverageData: CoverageData | null = null;
  for (const coveragePath of COVERAGE_ARTIFACT_PATHS) {
    try {
      const fullPath = coveragePath.startsWith('/')
        ? coveragePath
        : `${rootDirectory}/${coveragePath}`;
      const coverageContent = await contentProvider.readFileOrNull(fullPath);
      if (coverageContent !== null) {
        coverageData = parseCoverageFile(coveragePath, coverageContent);
        if (coverageData) break;
      }
    } catch {
      // Coverage artifact not readable — not critical
    }
  }

  // Build manifest-specific sections
  const identity = buildIdentity(packageInfo, detectedFrameworks || []);
  const structure = buildStructureSummary(
    allFiles, sourceFiles, testFiles, uiFiles, docFiles, configFiles,
  );

  return { repoStructure, coverageData, identity, structure };
}

// ============================================================================
// Manifest Section Builders
// ============================================================================

function buildIdentity(
  packageInfo?: RepoStructure['packageInfo'],
  frameworks?: string[],
): ManifestIdentity {
  return {
    name: packageInfo?.name ?? null,
    description: packageInfo?.description ?? null,
    languages: detectLanguages(frameworks || []),
    frameworks: frameworks || [],
    commitHash: null, // Set by caller (ManifestService) from git
    repositoryUrl: null, // Set by caller from project settings
  };
}

function detectLanguages(frameworks: string[]): string[] {
  const languages = new Set<string>();
  languages.add('TypeScript'); // Base assumption for this codebase
  if (frameworks.includes('react') || frameworks.includes('angular') || frameworks.includes('vue')) {
    languages.add('JavaScript');
  }
  return Array.from(languages);
}

function buildStructureSummary(
  allFiles: string[],
  sourceFiles: string[],
  testFiles: string[],
  uiFiles: string[],
  docFiles: string[],
  configFiles: string[],
): ManifestStructure {
  return {
    totalFiles: allFiles.length,
    sourceFileCount: sourceFiles.length,
    testFileCount: testFiles.length,
    uiFileCount: uiFiles.length,
    docFileCount: docFiles.length,
    configFileCount: configFiles.length,
    filesByExtension: countByExtension(allFiles),
    directoryTree: buildDirectoryTree(allFiles, 3),
    entryPoints: detectEntryPoints(allFiles),
    testFilePatterns: detectTestPatterns(testFiles),
  };
}

function countByExtension(files: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of files) {
    const lastDot = file.lastIndexOf('.');
    const ext = lastDot >= 0 ? file.substring(lastDot) : '(none)';
    counts[ext] = (counts[ext] || 0) + 1;
  }
  return counts;
}

function buildDirectoryTree(files: string[], maxDepth: number): DirectoryTreeNode[] {
  const root: DirectoryTreeNode = { name: '.', type: 'directory', children: [], count: files.length };

  for (const file of files) {
    const parts = file.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < Math.min(parts.length - 1, maxDepth); i++) {
      const dirName = parts[i];
      let child = current.children?.find((c) => c.name === dirName && c.type === 'directory');
      if (!child) {
        child = { name: dirName, type: 'directory', children: [], count: 0 };
        current.children = current.children || [];
        current.children.push(child);
      }
      child.count = (child.count || 0) + 1;
      current = child;
    }
  }

  // Sort children by count descending at each level
  sortTreeByCount(root);

  return root.children || [];
}

function sortTreeByCount(node: DirectoryTreeNode): void {
  if (node.children) {
    node.children.sort((a, b) => (b.count || 0) - (a.count || 0));
    for (const child of node.children) {
      sortTreeByCount(child);
    }
  }
}

function detectEntryPoints(files: string[]): string[] {
  const entryPatterns = [
    /^(src\/)?main\.ts$/,
    /^(src\/)?index\.ts$/,
    /^(src\/)?app\.ts$/,
    /^(src\/)?server\.ts$/,
    /^(frontend\/|app\/)?(src\/)?index\.tsx?$/,
    /^(frontend\/|app\/)?(src\/)?main\.tsx?$/,
  ];

  return files.filter((f) => entryPatterns.some((p) => p.test(f)));
}

function detectTestPatterns(testFiles: string[]): string[] {
  const patterns = new Set<string>();
  for (const file of testFiles) {
    if (file.endsWith('.spec.ts')) patterns.add('*.spec.ts');
    else if (file.endsWith('.test.ts')) patterns.add('*.test.ts');
    else if (file.endsWith('.e2e-spec.ts')) patterns.add('*.e2e-spec.ts');
    else if (file.endsWith('.spec.tsx')) patterns.add('*.spec.tsx');
    else if (file.endsWith('.test.tsx')) patterns.add('*.test.tsx');
  }
  return Array.from(patterns);
}
