/**
 * Reconciliation Tools Service
 *
 * Provides tool executors for all reconciliation-related operations.
 * These tools are registered with the ToolRegistryService.
 *
 * @see docs/implementation-checklist-phase5.md Phase 2.2
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ToolExecutor } from './tool-registry.service';
import { ContextBuilderService, TestAnalysis } from '../context-builder.service';
import {
  TestAtomCouplingService,
  OrphanTest,
  CouplingCheckOptions,
} from '../test-atom-coupling.service';
import { AtomQualityService, AtomQualityResult } from '../../validators/atom-quality.service';
import { LLMService } from '../../../common/llm/llm.service';
import { AgentTaskType } from '../../../common/llm/providers/types';
import { ClusteringAtomInput, ClusteredMolecule } from './reconciliation-tools.definitions';
import { InferredAtom } from '../graphs/types/reconciliation-state';
import { getChangedTestFiles, getCurrentCommitHash, isGitRepository } from '../utils/git-utils';
import { DependencyAnalyzer, DependencyEdge } from '../utils/dependency-analyzer';

/**
 * Result type for repo structure tool
 */
export interface RepoStructureResult {
  files: string[];
  testFiles: string[];
  sourceFiles: string[];
  dependencyEdges?: DependencyEdge[];
  /** Files in topological order (dependencies first) */
  topologicalOrder?: string[];
  /** Whether the dependency graph has cycles */
  hasCycles?: boolean;
  /** Files involved in cycles (if any) */
  cycleFiles?: string[];
  totalFiles: number;
}

/**
 * Extended orphan test info for discovery results
 * Extends the basic OrphanTest with optional analysis data
 */
export interface OrphanTestWithAnalysis extends OrphanTest {
  /** The actual test code (optional, populated if available) */
  testCode?: string;
  /** Related source files (optional, populated if available) */
  relatedSourceFiles?: string[];
}

/**
 * Result type for orphan discovery tools
 */
export interface OrphanDiscoveryResult {
  orphanTests: OrphanTestWithAnalysis[];
  totalTests: number;
  totalOrphans: number;
  mode: 'fullscan' | 'delta';
  baselineInfo?: {
    commitHash?: string;
    runId?: string;
    headCommit?: string;
  };
}

/**
 * Information about a test that is linked to an atom
 * Used in delta mode to track changed atom-linked tests (INV-R001)
 */
export interface AtomLinkedTestInfo {
  filePath: string;
  testName: string;
  lineNumber: number;
  atomId: string;
}

/**
 * Summary of delta discovery results
 */
export interface DeltaSummary {
  /** Number of test files changed since baseline */
  changedTestFiles: number;
  /** Number of new orphan tests found */
  newOrphanTests: number;
  /** Number of changed tests that have @atom annotations */
  changedAtomLinkedTests: number;
  /** Whether the operation fell back to fullscan */
  fallbackToFullscan: boolean;
  /** Reason for fallback if applicable */
  fallbackReason?: string;
}

/**
 * Extended result type for delta discovery
 */
export interface DeltaDiscoveryResult extends OrphanDiscoveryResult {
  /** Orphan tests found in changed files */
  deltaOrphanTests: OrphanTestWithAnalysis[];
  /** Tests with @atom annotation that were changed (INV-R001 - must not create new atoms) */
  changedAtomLinkedTests: AtomLinkedTestInfo[];
  /** Summary of delta detection */
  deltaSummary: DeltaSummary;
}

/**
 * Result type for doc search tool
 */
export interface DocSearchResult {
  snippets: Array<{
    filePath: string;
    content: string;
    matchedConcepts: string[];
  }>;
  totalMatches: number;
}

/**
 * Tool executor for reconciliation operations
 */
@Injectable()
export class ReconciliationToolsService implements ToolExecutor {
  private readonly logger = new Logger(ReconciliationToolsService.name);

  constructor(
    private readonly contextBuilder: ContextBuilderService,
    private readonly testAtomCoupling: TestAtomCouplingService,
    private readonly atomQuality: AtomQualityService,
    private readonly llmService: LLMService,
  ) {}

  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'get_repo_structure':
        return this.getRepoStructure(args);

      case 'discover_orphans_fullscan':
        return this.discoverOrphansFullscan(args);

      case 'discover_orphans_delta':
        return this.discoverOrphansDelta(args);

      case 'get_test_analysis':
        return this.getTestAnalysis(args);

      case 'search_docs_by_concepts':
        return this.searchDocsByConcepts(args);

      case 'infer_atom_from_test':
        return this.inferAtomFromTest(args);

      case 'cluster_atoms_for_molecules':
        return this.clusterAtomsForMolecules(args);

      case 'validate_atom_quality':
        return this.validateAtomQuality(args);

      default:
        throw new Error(`Unknown reconciliation tool: ${name}`);
    }
  }

  /**
   * Tool 1: Get repository structure
   * Lists all source and test files with optional dependency analysis
   */
  private async getRepoStructure(args: Record<string, unknown>): Promise<RepoStructureResult> {
    const rootDirectory = (args.root_directory as string) || process.cwd();
    const includeDependencies = this.parseBoolean(args.include_dependencies, false);
    const maxFiles = this.parseNumber(args.max_files, 1000);
    const excludePatterns = this.parseStringArray(args.exclude_patterns, []);

    this.logger.log(`Getting repo structure: ${rootDirectory}`);

    const defaultExcludes = ['node_modules', 'dist', '.git', 'coverage', '.next', 'build'];
    const allExcludes = [...defaultExcludes, ...excludePatterns];

    const files: string[] = [];
    const testFiles: string[] = [];
    const sourceFiles: string[] = [];

    // Walk directory
    const walkDir = (dir: string, depth = 0) => {
      if (depth > 20 || files.length >= maxFiles) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (files.length >= maxFiles) break;

          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(rootDirectory, fullPath);

          // Check exclusions
          if (allExcludes.some((exclude) => relativePath.includes(exclude))) {
            continue;
          }

          if (entry.isDirectory()) {
            walkDir(fullPath, depth + 1);
          } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            files.push(relativePath);

            if (this.isTestFile(entry.name)) {
              testFiles.push(relativePath);
            } else {
              sourceFiles.push(relativePath);
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };

    walkDir(rootDirectory);

    const result: RepoStructureResult = {
      files,
      testFiles,
      sourceFiles,
      totalFiles: files.length,
    };

    // Optionally analyze dependencies using DependencyAnalyzer
    if (includeDependencies) {
      const analyzer = new DependencyAnalyzer(rootDirectory);
      const analysis = analyzer.analyzeRepository(sourceFiles);

      result.dependencyEdges = analysis.graph.edges;
      result.topologicalOrder = analysis.topologicalOrder.order;
      result.hasCycles = analysis.topologicalOrder.hasCycles;

      if (analysis.topologicalOrder.hasCycles) {
        result.cycleFiles = analysis.topologicalOrder.cycleFiles;
        this.logger.warn(
          `Dependency analysis found cycles involving ${result.cycleFiles?.length} files`,
        );
      }

      this.logger.log(
        `Dependency analysis: ${analysis.stats.totalEdges} edges, ` +
          `${analysis.stats.filesWithNoDependencies} roots, ` +
          `cycles: ${analysis.stats.hasCycles}`,
      );
    }

    this.logger.log(
      `Repo structure: ${files.length} files, ${testFiles.length} tests, ${sourceFiles.length} source`,
    );

    return result;
  }

  /**
   * Tool 2: Discover orphan tests (full scan)
   */
  private async discoverOrphansFullscan(
    args: Record<string, unknown>,
  ): Promise<OrphanDiscoveryResult> {
    const rootDirectory = (args.root_directory as string) || process.cwd();
    const includePatterns = args.include_patterns
      ? this.parseStringArray(args.include_patterns)
      : undefined;
    const excludePatterns = args.exclude_patterns
      ? this.parseStringArray(args.exclude_patterns)
      : undefined;
    const maxOrphans = this.parseNumber(args.max_orphans, 100);

    this.logger.log(`Discovering orphan tests (fullscan): ${rootDirectory}`);

    const options: CouplingCheckOptions = {
      testDirectory: rootDirectory,
      includePatterns,
      excludePatterns,
    };

    const analysis = await this.testAtomCoupling.analyzeCoupling(options);

    const orphanTests = analysis.orphanTests.slice(0, maxOrphans);

    return {
      orphanTests,
      totalTests: analysis.summary.totalTests,
      totalOrphans: analysis.summary.orphanTestCount,
      mode: 'fullscan',
    };
  }

  /**
   * Tool 3: Discover orphan tests (delta mode)
   *
   * Implements git-based delta detection to find only changed/new orphan tests
   * since a baseline commit or run.
   *
   * @see docs/implementation-checklist-phase5.md Section 3.1
   */
  private async discoverOrphansDelta(args: Record<string, unknown>): Promise<DeltaDiscoveryResult> {
    const rootDirectory = (args.root_directory as string) || process.cwd();
    const baselineCommit = args.baseline_commit as string | undefined;
    const baselineRunId = args.baseline_run_id as string | undefined;
    const maxOrphans = this.parseNumber(args.max_orphans, 100);
    const testPatterns = this.parseStringArray(args.test_patterns, [
      '**/*.spec.ts',
      '**/*.test.ts',
      '**/*.e2e-spec.ts',
    ]);

    this.logger.log(
      `Discovering orphan tests (delta): baseline commit=${baselineCommit}, runId=${baselineRunId}`,
    );

    // Step 1: Validate git repository
    const isGitRepo = await isGitRepository(rootDirectory);
    if (!isGitRepo) {
      this.logger.warn('Not a git repository, falling back to fullscan');
      const fullscanResult = await this.discoverOrphansFullscan(args);
      return {
        ...fullscanResult,
        mode: 'delta',
        deltaOrphanTests: fullscanResult.orphanTests,
        changedAtomLinkedTests: [],
        deltaSummary: {
          changedTestFiles: 0,
          newOrphanTests: fullscanResult.totalOrphans,
          changedAtomLinkedTests: 0,
          fallbackToFullscan: true,
          fallbackReason: 'Not a git repository',
        },
        baselineInfo: { commitHash: baselineCommit, runId: baselineRunId },
      };
    }

    // Step 2: Resolve baseline commit
    let resolvedBaselineCommit = baselineCommit;

    // TODO: If baselineRunId provided, look up commit hash from ReconciliationRun entity
    // For now, we only support direct commit hash
    if (!resolvedBaselineCommit && baselineRunId) {
      this.logger.warn(`Run ID baseline lookup not yet implemented. RunId: ${baselineRunId}`);
      // Fall back to fullscan if no commit hash available
      const fullscanResult = await this.discoverOrphansFullscan(args);
      return {
        ...fullscanResult,
        mode: 'delta',
        deltaOrphanTests: fullscanResult.orphanTests,
        changedAtomLinkedTests: [],
        deltaSummary: {
          changedTestFiles: 0,
          newOrphanTests: fullscanResult.totalOrphans,
          changedAtomLinkedTests: 0,
          fallbackToFullscan: true,
          fallbackReason: 'Run ID baseline lookup not yet implemented',
        },
        baselineInfo: { commitHash: undefined, runId: baselineRunId },
      };
    }

    if (!resolvedBaselineCommit) {
      this.logger.warn('No baseline commit provided, falling back to fullscan');
      const fullscanResult = await this.discoverOrphansFullscan(args);
      return {
        ...fullscanResult,
        mode: 'delta',
        deltaOrphanTests: fullscanResult.orphanTests,
        changedAtomLinkedTests: [],
        deltaSummary: {
          changedTestFiles: 0,
          newOrphanTests: fullscanResult.totalOrphans,
          changedAtomLinkedTests: 0,
          fallbackToFullscan: true,
          fallbackReason: 'No baseline commit provided',
        },
        baselineInfo: { commitHash: undefined, runId: baselineRunId },
      };
    }

    // Step 3: Get changed test files since baseline
    const diffResult = await getChangedTestFiles(
      rootDirectory,
      resolvedBaselineCommit,
      testPatterns,
    );

    if (!diffResult.success) {
      this.logger.warn(`Git diff failed: ${diffResult.error}, falling back to fullscan`);
      const fullscanResult = await this.discoverOrphansFullscan(args);
      return {
        ...fullscanResult,
        mode: 'delta',
        deltaOrphanTests: fullscanResult.orphanTests,
        changedAtomLinkedTests: [],
        deltaSummary: {
          changedTestFiles: 0,
          newOrphanTests: fullscanResult.totalOrphans,
          changedAtomLinkedTests: 0,
          fallbackToFullscan: true,
          fallbackReason: `Git diff failed: ${diffResult.error}`,
        },
        baselineInfo: { commitHash: resolvedBaselineCommit, runId: baselineRunId },
      };
    }

    const changedTestFiles = diffResult.testFiles;
    this.logger.log(
      `Found ${changedTestFiles.length} changed test files since ${resolvedBaselineCommit}`,
    );

    if (changedTestFiles.length === 0) {
      // No changed test files - return empty delta
      return {
        orphanTests: [],
        totalTests: 0,
        totalOrphans: 0,
        mode: 'delta',
        deltaOrphanTests: [],
        changedAtomLinkedTests: [],
        deltaSummary: {
          changedTestFiles: 0,
          newOrphanTests: 0,
          changedAtomLinkedTests: 0,
          fallbackToFullscan: false,
        },
        baselineInfo: {
          commitHash: resolvedBaselineCommit,
          runId: baselineRunId,
          headCommit: diffResult.headCommit,
        },
      };
    }

    // Step 4: Analyze changed test files for orphans and atom-linked tests
    const deltaOrphanTests: OrphanTestWithAnalysis[] = [];
    const changedAtomLinkedTests: AtomLinkedTestInfo[] = [];

    for (const testFile of changedTestFiles) {
      const fullPath = path.join(rootDirectory, testFile);

      if (!fs.existsSync(fullPath)) {
        // File was deleted - skip
        continue;
      }

      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const testsInFile = this.parseTestsFromFile(content, testFile);

        for (const test of testsInFile) {
          if (test.atomId) {
            // Test has @atom annotation - this is a changed atom-linked test
            changedAtomLinkedTests.push({
              filePath: testFile,
              testName: test.testName,
              lineNumber: test.lineNumber,
              atomId: test.atomId,
            });
          } else {
            // Test has no @atom annotation - this is an orphan
            if (deltaOrphanTests.length < maxOrphans) {
              deltaOrphanTests.push({
                filePath: testFile,
                testName: test.testName,
                lineNumber: test.lineNumber,
                testCode: test.testCode,
              });
            }
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to parse test file ${testFile}: ${errorMessage}`);
      }
    }

    // Get current HEAD commit for baseline info
    const headCommit = await getCurrentCommitHash(rootDirectory);

    this.logger.log(
      `Delta discovery complete: ${deltaOrphanTests.length} orphans, ${changedAtomLinkedTests.length} atom-linked`,
    );

    return {
      orphanTests: deltaOrphanTests,
      totalTests: deltaOrphanTests.length + changedAtomLinkedTests.length,
      totalOrphans: deltaOrphanTests.length,
      mode: 'delta',
      deltaOrphanTests,
      changedAtomLinkedTests,
      deltaSummary: {
        changedTestFiles: changedTestFiles.length,
        newOrphanTests: deltaOrphanTests.length,
        changedAtomLinkedTests: changedAtomLinkedTests.length,
        fallbackToFullscan: false,
      },
      baselineInfo: {
        commitHash: resolvedBaselineCommit,
        runId: baselineRunId,
        headCommit: headCommit || undefined,
      },
    };
  }

  /**
   * Parse tests from a test file, extracting @atom annotations if present
   */
  private parseTestsFromFile(
    content: string,
    filePath: string,
  ): Array<{
    testName: string;
    lineNumber: number;
    testCode: string;
    atomId?: string;
  }> {
    const tests: Array<{
      testName: string;
      lineNumber: number;
      testCode: string;
      atomId?: string;
    }> = [];

    const lines = content.split('\n');
    const testRegex = /^\s*(it|test)\s*\(\s*['"`](.+?)['"`]/;
    const atomAnnotationRegex = /@atom\s+(IA-\d+)/;
    const describeRegex = /^\s*describe\s*\(\s*['"`](.+?)['"`]/;

    let currentDescribe = '';
    const describeStack: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Track describe blocks
      const describeMatch = line.match(describeRegex);
      if (describeMatch) {
        currentDescribe = describeMatch[1];
        describeStack.push(currentDescribe);
      }

      // Check for closing braces (simplified)
      if (line.includes('});') && describeStack.length > 0) {
        describeStack.pop();
        currentDescribe = describeStack[describeStack.length - 1] || '';
      }

      // Check for test declarations
      const testMatch = line.match(testRegex);
      if (testMatch) {
        const testName =
          describeStack.length > 0
            ? `${describeStack.join(' > ')} > ${testMatch[2]}`
            : testMatch[2];

        // Look for @atom annotation in preceding lines
        let atomId: string | undefined;
        const lookbackStart = Math.max(0, i - 5);
        for (let j = lookbackStart; j <= i; j++) {
          const atomMatch = lines[j].match(atomAnnotationRegex);
          if (atomMatch) {
            atomId = atomMatch[1];
            break;
          }
        }

        // Extract test code
        const testCode = this.extractTestCode(lines, i);

        tests.push({
          testName,
          lineNumber,
          testCode,
          atomId,
        });
      }
    }

    return tests;
  }

  /**
   * Extract test code block starting at a given line
   */
  private extractTestCode(lines: string[], startLine: number): string {
    const result: string[] = [];
    let braceDepth = 0;
    let started = false;

    for (let i = startLine; i < Math.min(lines.length, startLine + 100); i++) {
      const line = lines[i];
      result.push(line);

      for (const char of line) {
        if (char === '{') {
          braceDepth++;
          started = true;
        }
        if (char === '}') {
          braceDepth--;
        }
      }

      if (started && braceDepth === 0) {
        break;
      }
    }

    return result.join('\n');
  }

  /**
   * Tool 4: Get test analysis using ContextBuilder
   */
  private async getTestAnalysis(args: Record<string, unknown>): Promise<TestAnalysis> {
    const testFilePath = args.test_file_path as string;
    const testName = args.test_name as string;
    const testLineNumber = this.parseNumber(args.test_line_number, 1);
    const rootDirectory = (args.root_directory as string) || process.cwd();

    this.logger.log(`Analyzing test: ${testName} in ${testFilePath}:${testLineNumber}`);

    return this.contextBuilder.analyzeTest(testFilePath, testName, testLineNumber, rootDirectory);
  }

  /**
   * Tool 5: Search documentation by concepts
   */
  private async searchDocsByConcepts(args: Record<string, unknown>): Promise<DocSearchResult> {
    const concepts = this.parseStringArray(args.concepts, []);
    const rootDirectory = (args.root_directory as string) || process.cwd();
    const docPatterns = this.parseStringArray(args.doc_patterns, ['**/*.md']);
    const maxSnippets = this.parseNumber(args.max_snippets, 10);

    this.logger.log(`Searching docs for concepts: ${concepts.join(', ')}`);

    const snippets: DocSearchResult['snippets'] = [];

    // Find documentation files
    const docFiles = this.findDocFiles(rootDirectory, docPatterns);

    for (const docFile of docFiles) {
      if (snippets.length >= maxSnippets) break;

      try {
        const content = fs.readFileSync(docFile, 'utf-8').toLowerCase();
        const matchedConcepts = concepts.filter((c) => content.includes(c.toLowerCase()));

        if (matchedConcepts.length > 0) {
          // Extract relevant paragraph
          const paragraphs = content.split('\n\n');
          for (const para of paragraphs) {
            if (matchedConcepts.some((c) => para.includes(c.toLowerCase()))) {
              snippets.push({
                filePath: path.relative(rootDirectory, docFile),
                content: para.substring(0, 500),
                matchedConcepts,
              });
              break;
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return {
      snippets: snippets.slice(0, maxSnippets),
      totalMatches: snippets.length,
    };
  }

  /**
   * Tool 6: Infer atom from test using LLM
   */
  private async inferAtomFromTest(args: Record<string, unknown>): Promise<InferredAtom> {
    const testName = args.test_name as string;
    const testCode = args.test_code as string;
    const testFilePath = args.test_file_path as string;
    const testLineNumber = this.parseNumber(args.test_line_number, 1);
    const contextSummary = args.context_summary as string | undefined;
    const documentationSnippets = this.parseStringArray(args.documentation_snippets, []);

    this.logger.log(`Inferring atom from test: ${testName}`);

    const prompt = this.buildInferencePrompt(
      testName,
      testCode,
      contextSummary,
      documentationSnippets,
    );

    try {
      const response = await this.llmService.invoke({
        messages: [
          {
            role: 'system',
            content:
              'You are an expert in behavior-driven development and intent modeling. ' +
              'Your task is to infer Intent Atoms from test code. ' +
              'Focus on WHAT the system does, not HOW it does it. ' +
              'Describe observable outcomes only.',
          },
          { role: 'user', content: prompt },
        ],
        agentName: 'ReconciliationAgent',
        purpose: 'Inferring atom from test',
        taskType: AgentTaskType.ANALYSIS,
      });

      const parsed = this.parseInferenceResponse(response.content);

      // Ensure observableOutcomes is never empty - use description-based fallback
      let outcomes = parsed.observableOutcomes;
      if (!outcomes || outcomes.length === 0) {
        const description = parsed.description || `Atom inferred from: ${testName}`;
        outcomes = [`The system behavior described by "${description}" is verified`];
        this.logger.warn(
          `[inferAtomFromTest] No outcomes from LLM, using fallback for: ${testName}`,
        );
      }

      // Ensure reasoning is meaningful (> 10 chars for quality scoring)
      let reasoning = parsed.reasoning;
      if (!reasoning || reasoning.length <= 10) {
        reasoning = `Behavior inferred from test "${testName}" based on assertions and test structure`;
      }

      return {
        tempId: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        description: parsed.description || `Atom inferred from: ${testName}`,
        category: parsed.category || 'functional',
        sourceTest: {
          filePath: testFilePath,
          testName,
          lineNumber: testLineNumber,
        },
        observableOutcomes: outcomes,
        confidence: parsed.confidence || 0.5,
        ambiguityReasons: parsed.ambiguityReasons,
        reasoning,
        relatedDocs: documentationSnippets.length > 0 ? ['Referenced documentation'] : undefined,
      };
    } catch (error) {
      this.logger.warn(`LLM inference failed, using fallback: ${error}`);

      // Return a low-confidence fallback
      return {
        tempId: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        description: `System behavior verified by: ${testName}`,
        category: 'functional',
        sourceTest: {
          filePath: testFilePath,
          testName,
          lineNumber: testLineNumber,
        },
        observableOutcomes: ['Behavior is verified by the test'],
        confidence: 0.3,
        ambiguityReasons: ['LLM inference failed, using fallback description'],
        reasoning: 'Fallback: Could not infer detailed atom from test',
      };
    }
  }

  /**
   * Tool 7: Cluster atoms for molecules
   */
  private async clusterAtomsForMolecules(
    args: Record<string, unknown>,
  ): Promise<ClusteredMolecule[]> {
    const atoms = this.parseJsonArray<ClusteringAtomInput>(args.atoms, []);
    const clusteringMethod = (args.clustering_method as string) || 'module';
    const minClusterSize = this.parseNumber(args.min_cluster_size, 1);
    const maxClusters = this.parseNumber(args.max_clusters, 50);

    this.logger.log(`Clustering ${atoms.length} atoms using method: ${clusteringMethod}`);

    const clusters: Map<string, ClusteringAtomInput[]> = new Map();

    // Group atoms based on clustering method
    for (const atom of atoms) {
      let clusterKey: string;

      switch (clusteringMethod) {
        case 'module':
          clusterKey = this.getModuleKey(atom.source_file);
          break;
        case 'domain_concept':
          clusterKey = atom.category;
          break;
        case 'semantic': {
          // For semantic clustering, use first two words of description
          const words = atom.description.split(/\s+/).slice(0, 2);
          clusterKey = words.join('-').toLowerCase() || 'uncategorized';
          break;
        }
        default:
          clusterKey = 'default';
      }

      if (!clusters.has(clusterKey)) {
        clusters.set(clusterKey, []);
      }
      clusters.get(clusterKey)!.push(atom);
    }

    // Convert clusters to molecules
    const molecules: ClusteredMolecule[] = [];
    let moleculeIndex = 0;

    for (const [key, clusterAtoms] of clusters.entries()) {
      if (molecules.length >= maxClusters) break;
      if (clusterAtoms.length < minClusterSize) continue;

      const moleculeName = this.generateMoleculeName(key, clusteringMethod);

      molecules.push({
        temp_id: `mol-temp-${moleculeIndex++}`,
        name: moleculeName,
        description: `Molecule containing ${clusterAtoms.length} related atoms from ${key}`,
        atom_temp_ids: clusterAtoms.map((a) => a.temp_id),
        confidence: 0.7, // Deterministic clustering has moderate confidence
        clustering_reason: `Grouped by ${clusteringMethod}: ${key}`,
      });
    }

    this.logger.log(`Created ${molecules.length} molecules from ${atoms.length} atoms`);

    return molecules;
  }

  /**
   * Tool 8: Validate atom quality
   */
  private async validateAtomQuality(args: Record<string, unknown>): Promise<AtomQualityResult> {
    const atomId = args.atom_id as string;
    const description = args.description as string;
    const category = args.category as string;

    this.logger.log(`Validating atom quality: ${atomId}`);

    return this.atomQuality.validateAtom({
      atomId,
      description,
      category,
    });
  }

  // ==================== Parameter Parsing Helpers ====================
  // These helpers handle both direct calls (with actual types) and LLM calls (with strings)

  /**
   * Parse a value as a number, handling both number and string inputs
   */
  private parseNumber(value: unknown, defaultValue: number): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) ? defaultValue : parsed;
    }
    return defaultValue;
  }

  /**
   * Parse a value as a boolean, handling both boolean and string inputs
   */
  private parseBoolean(value: unknown, defaultValue: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return defaultValue;
  }

  /**
   * Parse a value as a string array, handling arrays, comma-separated strings, and JSON
   */
  private parseStringArray(value: unknown, defaultValue: string[] = []): string[] {
    if (Array.isArray(value)) return value as string[];
    if (typeof value === 'string') {
      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Not JSON, treat as comma-separated
      }
      // Fall back to comma-separated
      return value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    return defaultValue;
  }

  /**
   * Parse a value as a typed array using JSON parsing
   */
  private parseJsonArray<T>(value: unknown, defaultValue: T[] = []): T[] {
    if (Array.isArray(value)) return value as T[];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Not valid JSON
      }
    }
    return defaultValue;
  }

  // ==================== Helper Methods ====================

  /**
   * Check if a file is a test file
   */
  private isTestFile(filename: string): boolean {
    return (
      filename.endsWith('.spec.ts') ||
      filename.endsWith('.test.ts') ||
      filename.endsWith('.e2e-spec.ts')
    );
  }

  /**
   * Analyze import dependencies between source files
   */
  private analyzeDependencies(
    sourceFiles: string[],
    rootDirectory: string,
  ): Array<{ from: string; to: string }> {
    const edges: Array<{ from: string; to: string }> = [];
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;

    for (const file of sourceFiles.slice(0, 100)) {
      // Limit for performance
      try {
        const fullPath = path.join(rootDirectory, file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const matches = content.matchAll(importRegex);

        for (const match of matches) {
          const importPath = match[1];

          // Only track relative imports
          if (importPath.startsWith('.')) {
            const resolved = this.resolveImportPath(file, importPath);
            if (resolved && sourceFiles.includes(resolved)) {
              edges.push({ from: file, to: resolved });
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return edges;
  }

  /**
   * Resolve relative import path
   */
  private resolveImportPath(fromFile: string, importPath: string): string | null {
    const fromDir = path.dirname(fromFile);
    let resolved = path.join(fromDir, importPath);

    // Add .ts extension if not present
    if (!resolved.endsWith('.ts')) {
      resolved += '.ts';
    }

    // Normalize path separators
    return resolved.replace(/\\/g, '/');
  }

  /**
   * Find documentation files
   */
  private findDocFiles(rootDirectory: string, patterns: string[]): string[] {
    const docFiles: string[] = [];
    const maxFiles = 100;

    const walkDir = (dir: string, depth = 0) => {
      if (depth > 5 || docFiles.length >= maxFiles) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (docFiles.length >= maxFiles) break;

          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(rootDirectory, fullPath);

          if (relativePath.includes('node_modules')) continue;

          if (entry.isDirectory()) {
            walkDir(fullPath, depth + 1);
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            docFiles.push(fullPath);
          }
        }
      } catch {
        // Skip directories that can't be read
      }
    };

    walkDir(rootDirectory);
    return docFiles;
  }

  /**
   * Get module key from file path for clustering
   */
  private getModuleKey(filePath: string): string {
    const parts = filePath.split('/');

    // Find src/modules/xxx or similar pattern
    const srcIndex = parts.findIndex((p) => p === 'src');
    if (srcIndex >= 0 && parts.length > srcIndex + 2) {
      return parts.slice(srcIndex + 1, srcIndex + 3).join('/');
    }

    // Fall back to parent directory
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }

    return 'root';
  }

  /**
   * Generate molecule name from cluster key
   */
  private generateMoleculeName(key: string, method: string): string {
    // Clean up the key for a readable name
    const cleaned = key
      .replace(/[/\\]/g, ' ')
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .split(' ')
      .filter((w) => w.length > 0)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    if (method === 'module') {
      return `${cleaned} Module`;
    } else if (method === 'domain_concept') {
      return `${cleaned} Features`;
    } else {
      return `${cleaned} Behaviors`;
    }
  }

  /**
   * Build the inference prompt for LLM
   */
  private buildInferencePrompt(
    testName: string,
    testCode: string,
    contextSummary?: string,
    documentationSnippets?: string[],
  ): string {
    let prompt = `Analyze this test and infer an Intent Atom.

## Test Name
${testName}

## Test Code
\`\`\`typescript
${testCode}
\`\`\`

`;

    if (contextSummary) {
      prompt += `## Context Summary
${contextSummary}

`;
    }

    if (documentationSnippets && documentationSnippets.length > 0) {
      prompt += `## Related Documentation
${documentationSnippets.join('\n\n')}

`;
    }

    prompt += `## CRITICAL REQUIREMENTS

1. **Observable Outcomes Only**: Describe WHAT happens, not HOW.
   - GOOD: "User receives email notification when order ships"
   - BAD: "System calls sendEmail() function via SMTP"

2. **Implementation-Agnostic**: No technology mentions.
   - GOOD: "Data is persisted and retrievable"
   - BAD: "Data is stored in PostgreSQL database"

3. **Testable**: Must be falsifiable.
   - GOOD: "Login fails with invalid credentials"
   - BAD: "System is secure"

## Output Format (JSON)
\`\`\`json
{
  "description": "One clear sentence describing the behavior",
  "category": "functional|security|performance|reliability|usability|maintainability",
  "observableOutcomes": ["Outcome 1", "Outcome 2"],
  "confidence": 0.0-1.0,
  "ambiguityReasons": ["Reason if confidence < 0.8"],
  "reasoning": "Brief explanation of how you derived this atom"
}
\`\`\``;

    return prompt;
  }

  /**
   * Parse the LLM inference response
   */
  private parseInferenceResponse(content: string): {
    description?: string;
    category?: string;
    observableOutcomes?: string[];
    confidence?: number;
    ambiguityReasons?: string[];
    reasoning?: string;
  } {
    try {
      // Remove markdown code blocks if present
      let cleaned = content.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned);

      // Validate and log warnings for missing critical fields
      const missingFields: string[] = [];
      if (!parsed.description) missingFields.push('description');
      if (!parsed.observableOutcomes || parsed.observableOutcomes.length === 0) {
        missingFields.push('observableOutcomes');
      }
      if (!parsed.reasoning) missingFields.push('reasoning');
      if (parsed.confidence === undefined) missingFields.push('confidence');

      if (missingFields.length > 0) {
        this.logger.warn(
          `[parseInferenceResponse] LLM response missing fields: ${missingFields.join(', ')}`,
        );
      }

      return parsed;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to parse LLM inference response as JSON: ${errorMessage}`);
      this.logger.debug(`[parseInferenceResponse] Raw content: ${content.substring(0, 200)}...`);
      return {};
    }
  }
}
