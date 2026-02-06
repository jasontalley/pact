/**
 * Reconciliation Tools Definitions
 *
 * Tool definitions for reconciliation agent operations.
 * These tools enable the reconciliation graph to interact with
 * the codebase, analyze tests, and infer atoms.
 *
 * @see docs/implementation-checklist-phase5.md Phase 2
 */

import { ToolDefinition } from '../../../common/llm/providers/types';

/**
 * All reconciliation tool definitions
 *
 * Note: The ToolDefinition type doesn't support nested array schemas.
 * For array parameters, we use type: 'string' and document JSON format
 * in the description, or the service handles comma-separated values.
 */
export const RECONCILIATION_TOOLS: ToolDefinition[] = [
  // Tool 1: Get repository structure
  {
    name: 'get_repo_structure',
    description:
      'List all source and test files in the repository. Returns file lists with optional dependency edges for understanding code relationships.',
    parameters: {
      type: 'object',
      properties: {
        root_directory: {
          type: 'string',
          description: 'Root directory to analyze (defaults to current working directory)',
        },
        include_dependencies: {
          type: 'string',
          description:
            'Whether to analyze import statements and build dependency edges ("true" or "false", default: "false")',
        },
        max_files: {
          type: 'string',
          description: 'Maximum number of files to return (default: "1000")',
        },
        exclude_patterns: {
          type: 'string',
          description:
            'Comma-separated glob patterns to exclude (node_modules, dist, .git always excluded)',
        },
      },
    },
  },

  // Tool 2: Discover orphan tests (full scan)
  {
    name: 'discover_orphans_fullscan',
    description:
      'Find all tests in the repository that do not have an @atom annotation. Returns list of orphan tests with file path, test name, and line number.',
    parameters: {
      type: 'object',
      properties: {
        root_directory: {
          type: 'string',
          description: 'Root directory to scan for tests (defaults to current working directory)',
        },
        include_patterns: {
          type: 'string',
          description:
            'Comma-separated glob patterns for test files (default: "**/*.spec.ts,**/*.test.ts")',
        },
        exclude_patterns: {
          type: 'string',
          description:
            'Comma-separated glob patterns to exclude (default: "**/node_modules/**,**/dist/**")',
        },
        max_orphans: {
          type: 'string',
          description: 'Maximum number of orphan tests to return (default: "100")',
        },
      },
    },
  },

  // Tool 3: Discover orphan tests (delta mode)
  {
    name: 'discover_orphans_delta',
    description:
      'Find orphan tests that have changed since a baseline (commit hash or previous run). Stub implementation in Phase 1 - falls back to fullscan.',
    parameters: {
      type: 'object',
      properties: {
        root_directory: {
          type: 'string',
          description: 'Root directory to scan (defaults to current working directory)',
        },
        baseline_commit: {
          type: 'string',
          description: 'Git commit hash to use as baseline for comparison',
        },
        baseline_run_id: {
          type: 'string',
          description:
            'Previous reconciliation run ID to use as baseline (will look up commit hash)',
        },
        include_patterns: {
          type: 'string',
          description: 'Comma-separated glob patterns for test files',
        },
        exclude_patterns: {
          type: 'string',
          description: 'Comma-separated glob patterns to exclude',
        },
      },
    },
  },

  // Tool 4: Get test analysis
  {
    name: 'get_test_analysis',
    description:
      'Run ContextBuilder analysis for a single test. Returns structured analysis including assertions, imports, function calls, domain concepts, and related files.',
    parameters: {
      type: 'object',
      properties: {
        test_file_path: {
          type: 'string',
          description: 'Path to the test file',
        },
        test_name: {
          type: 'string',
          description: 'Name of the test (from it() or test())',
        },
        test_line_number: {
          type: 'string',
          description: 'Line number where the test starts',
        },
        root_directory: {
          type: 'string',
          description: 'Root directory for resolving paths (defaults to current working directory)',
        },
      },
      required: ['test_file_path', 'test_name', 'test_line_number'],
    },
  },

  // Tool 5: Search docs by concepts
  {
    name: 'search_docs_by_concepts',
    description:
      'Search documentation files for content matching domain or technical concepts. Returns relevant documentation snippets.',
    parameters: {
      type: 'object',
      properties: {
        concepts: {
          type: 'string',
          description: 'Comma-separated list of domain or technical concepts to search for',
        },
        root_directory: {
          type: 'string',
          description: 'Root directory to search (defaults to current working directory)',
        },
        doc_patterns: {
          type: 'string',
          description: 'Comma-separated glob patterns for documentation files (default: "**/*.md")',
        },
        max_snippets: {
          type: 'string',
          description: 'Maximum number of snippets to return (default: "10")',
        },
      },
      required: ['concepts'],
    },
  },

  // Tool 6: Infer atom from test
  {
    name: 'infer_atom_from_test',
    description:
      'Use LLM to infer an Intent Atom from a single test and its context. Returns InferredAtom with description, category, observable outcomes, and confidence score.',
    parameters: {
      type: 'object',
      properties: {
        test_name: {
          type: 'string',
          description: 'Name of the test',
        },
        test_code: {
          type: 'string',
          description: 'The test code to analyze',
        },
        test_file_path: {
          type: 'string',
          description: 'Path to the test file',
        },
        test_line_number: {
          type: 'string',
          description: 'Line number where the test starts',
        },
        context_summary: {
          type: 'string',
          description: 'Focused context summary from ContextBuilder',
        },
        documentation_snippets: {
          type: 'string',
          description: 'JSON array of relevant documentation snippets',
        },
      },
      required: ['test_name', 'test_code', 'test_file_path', 'test_line_number'],
    },
  },

  // Tool 7: Cluster atoms for molecules
  {
    name: 'cluster_atoms_for_molecules',
    description:
      'Group inferred atoms into molecules using deterministic clustering. Groups by module/category, optionally by semantic similarity.',
    parameters: {
      type: 'object',
      properties: {
        atoms: {
          type: 'string',
          description:
            'JSON array of atoms to cluster. Each atom: {temp_id, description, category, source_file}',
        },
        clustering_method: {
          type: 'string',
          enum: ['module', 'domain_concept', 'semantic'],
          description:
            'Clustering method: "module" (by source path), "domain_concept" (by category), "semantic" (by description similarity). Default: "module"',
        },
        min_cluster_size: {
          type: 'string',
          description: 'Minimum atoms per molecule (default: "1")',
        },
        max_clusters: {
          type: 'string',
          description: 'Maximum number of molecules to create (default: "50")',
        },
      },
      required: ['atoms'],
    },
  },

  // Tool 8: Validate atom quality
  {
    name: 'validate_atom_quality',
    description:
      'Validate a single atom against the 5 quality dimensions (Observable, Falsifiable, Implementation-Agnostic, Unambiguous, Clear Success Criteria). Returns quality score and suggestions.',
    parameters: {
      type: 'object',
      properties: {
        atom_id: {
          type: 'string',
          description: 'Temporary ID or atom ID for the atom being validated',
        },
        description: {
          type: 'string',
          description: 'Atom description to validate',
        },
        category: {
          type: 'string',
          description: 'Atom category',
        },
        observable_outcomes: {
          type: 'string',
          description: 'JSON array of observable outcomes for the atom',
        },
      },
      required: ['atom_id', 'description', 'category'],
    },
  },
];

/**
 * Type definition for atoms passed to clustering tool
 */
export interface ClusteringAtomInput {
  temp_id: string;
  description: string;
  category: string;
  source_file: string;
}

/**
 * Type definition for clustered molecule output
 */
export interface ClusteredMolecule {
  temp_id: string;
  name: string;
  description: string;
  atom_temp_ids: string[];
  confidence: number;
  clustering_reason: string;
}
