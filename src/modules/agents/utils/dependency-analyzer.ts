/**
 * Dependency Analyzer
 *
 * Analyzes TypeScript file dependencies to build a dependency graph
 * and compute topological order for processing.
 *
 * @see docs/implementation-checklist-phase5.md Section 3.3
 * @see docs/implementation-checklist-phase17.md Section 17A.13
 */

import * as path from 'path';
import { ContentProvider, FilesystemContentProvider } from '../content';

/**
 * Represents a dependency edge between files
 */
export interface DependencyEdge {
  /** Source file path (the importer) */
  from: string;
  /** Target file path (the imported file) */
  to: string;
}

/**
 * Dependency graph representation
 */
export interface DependencyGraph {
  /** All files in the graph */
  files: string[];
  /** Edges representing imports (from -> to) */
  edges: DependencyEdge[];
  /** Adjacency list for efficient traversal */
  adjacencyList: Map<string, string[]>;
  /** Reverse adjacency list (what imports this file) */
  reverseAdjacencyList: Map<string, string[]>;
}

/**
 * Result of topological sort
 */
export interface TopologicalSortResult {
  /** Files in topological order (dependencies first) */
  order: string[];
  /** Whether the graph has cycles */
  hasCycles: boolean;
  /** Files involved in cycles (if any) */
  cycleFiles?: string[];
}

/**
 * Analyzes TypeScript file dependencies
 */
export class DependencyAnalyzer {
  private rootDirectory: string;
  private contentProvider: ContentProvider;

  constructor(rootDirectory: string, contentProvider?: ContentProvider) {
    this.rootDirectory = rootDirectory;
    this.contentProvider = contentProvider || new FilesystemContentProvider(rootDirectory);
  }

  /**
   * Parse import statements from a TypeScript file
   *
   * Supports:
   * - ES6 imports: import X from 'path', import { X } from 'path', import * as X from 'path'
   * - Dynamic imports: import('path')
   * - CommonJS require: require('path')
   *
   * @param filePath - Path to the file (relative to root)
   * @returns Array of imported file paths (relative to root)
   */
  async parseImports(filePath: string): Promise<string[]> {
    const fullPath = path.join(this.rootDirectory, filePath);

    const content = await this.contentProvider.readFileOrNull(fullPath);
    if (content === null) {
      return [];
    }

    const imports: string[] = [];
    const fileDir = path.dirname(filePath);

    // ES6 import patterns
    const es6ImportRegex = /import\s+(?:(?:\{[^}]*\}|[\w*\s,]+)\s+from\s+)?['"`]([^'"`]+)['"`]/g;
    // Dynamic import
    const dynamicImportRegex = /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    // CommonJS require
    const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

    const processMatch = async (_match: RegExpMatchArray | null, regex: RegExp) => {
      let m: RegExpExecArray | null;
      regex.lastIndex = 0; // Reset regex state
      while ((m = regex.exec(content)) !== null) {
        const importPath = m[1];
        const resolved = await this.resolveImportPath(importPath, fileDir);
        if (resolved) {
          imports.push(resolved);
        }
      }
    };

    await processMatch(null, es6ImportRegex);
    await processMatch(null, dynamicImportRegex);
    await processMatch(null, requireRegex);

    return [...new Set(imports)]; // Deduplicate
  }

  /**
   * Resolve an import path to a file path relative to root
   *
   * @param importPath - The import path from the source file
   * @param fromDir - The directory of the importing file
   * @returns Resolved file path relative to root, or null if external/not found
   */
  private async resolveImportPath(importPath: string, fromDir: string): Promise<string | null> {
    // Skip external packages (not starting with . or /)
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      return null;
    }

    // Handle absolute imports (starting with /)
    let resolvedPath: string;
    if (importPath.startsWith('/')) {
      resolvedPath = importPath;
    } else {
      resolvedPath = path.normalize(path.join(fromDir, importPath));
    }

    // Try different extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

    for (const ext of extensions) {
      const withExt = resolvedPath + ext;
      const fullPath = path.join(this.rootDirectory, withExt);
      if (await this.contentProvider.exists(fullPath)) {
        return withExt;
      }
    }

    // Check if the path already has an extension
    const fullPath = path.join(this.rootDirectory, resolvedPath);
    if (await this.contentProvider.exists(fullPath)) {
      return resolvedPath;
    }

    return null;
  }

  /**
   * Build a dependency graph from a list of files
   *
   * @param files - List of file paths (relative to root)
   * @returns Dependency graph
   */
  async buildDependencyGraph(files: string[]): Promise<DependencyGraph> {
    const edges: DependencyEdge[] = [];
    const adjacencyList = new Map<string, string[]>();
    const reverseAdjacencyList = new Map<string, string[]>();

    // Initialize adjacency lists
    for (const file of files) {
      adjacencyList.set(file, []);
      reverseAdjacencyList.set(file, []);
    }

    // Build edges by parsing imports
    const fileSet = new Set(files);

    for (const file of files) {
      const imports = await this.parseImports(file);

      for (const importedFile of imports) {
        // Only include edges to files in our file set
        if (fileSet.has(importedFile)) {
          edges.push({ from: file, to: importedFile });

          // Update adjacency list
          const adj = adjacencyList.get(file) || [];
          adj.push(importedFile);
          adjacencyList.set(file, adj);

          // Update reverse adjacency list
          const revAdj = reverseAdjacencyList.get(importedFile) || [];
          revAdj.push(file);
          reverseAdjacencyList.set(importedFile, revAdj);
        }
      }
    }

    return {
      files,
      edges,
      adjacencyList,
      reverseAdjacencyList,
    };
  }

  /**
   * Perform topological sort on the dependency graph
   *
   * Uses Kahn's algorithm for topological sorting.
   * Files with no dependencies come first (can be processed first).
   *
   * @param graph - The dependency graph
   * @returns Topologically sorted files and cycle detection info
   */
  topologicalSort(graph: DependencyGraph): TopologicalSortResult {
    const { files, adjacencyList, reverseAdjacencyList } = graph;

    // Calculate in-degrees (number of files this file imports)
    const inDegree = new Map<string, number>();
    for (const file of files) {
      inDegree.set(file, adjacencyList.get(file)?.length || 0);
    }

    // Start with files that have no imports (leaves in dependency tree)
    const queue: string[] = [];
    for (const file of files) {
      if (inDegree.get(file) === 0) {
        queue.push(file);
      }
    }

    const order: string[] = [];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);
      visited.add(current);

      // For each file that imports current file
      const importers = reverseAdjacencyList.get(current) || [];
      for (const importer of importers) {
        const degree = inDegree.get(importer) || 0;
        inDegree.set(importer, degree - 1);

        if (inDegree.get(importer) === 0 && !visited.has(importer)) {
          queue.push(importer);
        }
      }
    }

    // Check for cycles
    const hasCycles = order.length < files.length;
    let cycleFiles: string[] | undefined;

    if (hasCycles) {
      cycleFiles = files.filter((f) => !visited.has(f));
    }

    return {
      order,
      hasCycles,
      cycleFiles,
    };
  }

  /**
   * Get files that a given file depends on (transitively)
   *
   * @param filePath - The file to analyze
   * @param graph - The dependency graph
   * @returns All files that the given file depends on
   */
  getTransitiveDependencies(filePath: string, graph: DependencyGraph): string[] {
    const visited = new Set<string>();
    const dependencies: string[] = [];

    const dfs = (current: string) => {
      if (visited.has(current)) return;
      visited.add(current);

      const imports = graph.adjacencyList.get(current) || [];
      for (const imported of imports) {
        dependencies.push(imported);
        dfs(imported);
      }
    };

    dfs(filePath);
    return dependencies;
  }

  /**
   * Get files that depend on a given file (transitively)
   *
   * @param filePath - The file to analyze
   * @param graph - The dependency graph
   * @returns All files that depend on the given file
   */
  getTransitiveDependents(filePath: string, graph: DependencyGraph): string[] {
    const visited = new Set<string>();
    const dependents: string[] = [];

    const dfs = (current: string) => {
      if (visited.has(current)) return;
      visited.add(current);

      const importers = graph.reverseAdjacencyList.get(current) || [];
      for (const importer of importers) {
        dependents.push(importer);
        dfs(importer);
      }
    };

    dfs(filePath);
    return dependents;
  }

  /**
   * Analyze the full repository and return dependency information
   *
   * @param files - List of file paths to analyze
   * @returns Complete dependency analysis
   */
  async analyzeRepository(files: string[]): Promise<{
    graph: DependencyGraph;
    topologicalOrder: TopologicalSortResult;
    stats: {
      totalFiles: number;
      totalEdges: number;
      filesWithNoDependencies: number;
      filesWithNoDependents: number;
      hasCycles: boolean;
    };
  }> {
    const graph = await this.buildDependencyGraph(files);
    const topologicalOrder = this.topologicalSort(graph);

    // Calculate stats
    let filesWithNoDependencies = 0;
    let filesWithNoDependents = 0;

    for (const file of files) {
      const deps = graph.adjacencyList.get(file) || [];
      const dependents = graph.reverseAdjacencyList.get(file) || [];

      if (deps.length === 0) filesWithNoDependencies++;
      if (dependents.length === 0) filesWithNoDependents++;
    }

    return {
      graph,
      topologicalOrder,
      stats: {
        totalFiles: files.length,
        totalEdges: graph.edges.length,
        filesWithNoDependencies,
        filesWithNoDependents,
        hasCycles: topologicalOrder.hasCycles,
      },
    };
  }
}
