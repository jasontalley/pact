/**
 * Infer Atoms Node
 *
 * Uses the `infer_atom_from_test` tool to infer Intent Atoms from test context.
 * Enforces observable-outcomes-only semantics.
 *
 * **Dependency-Aware Inference (Phase 3.4)**:
 * - Considers file dependency relationships when inferring atoms
 * - Tests for heavily-depended-upon modules may receive confidence boost
 * - Dependency context is included in inference prompts for better LLM understanding
 *
 * @see docs/implementation-checklist-phase5.md Section 1.8
 * @see docs/implementation-checklist-phase5.md Section 2.3 (refactored to use tools)
 * @see docs/implementation-checklist-phase5.md Section 3.4 (dependency-aware processing)
 */

import { v4 as uuidv4 } from 'uuid';
import { NodeConfig } from '../types';
import { AgentTaskType } from '../../../../../common/llm/providers/types';
import {
  ReconciliationGraphStateType,
  InferredAtom,
  TestAnalysis,
  OrphanTestInfo,
  RepoStructure,
  DependencyEdge,
  cleanupPhaseState,
} from '../../types/reconciliation-state';

/**
 * Options for customizing infer atoms node behavior
 */
export interface InferAtomsNodeOptions {
  /** Batch size for LLM calls */
  batchSize?: number;
  /** Custom inference prompt template */
  customPrompt?: string;
  /** Minimum confidence threshold to include atom (0-100) */
  minConfidence?: number;
  /** Use tool-based inference (default: true) */
  useTool?: boolean;
  /** Use dependency information to enhance inference (default: true) */
  useDependencyContext?: boolean;
  /** Confidence boost for foundational modules (0-20, default: 10) */
  foundationalBoost?: number;
}

/**
 * Dependency context for a test file.
 * Used to provide additional context to the LLM for better inference.
 */
interface DependencyContext {
  /** Number of files that depend on this file's source */
  dependentCount: number;
  /** Number of files this file's source depends on */
  dependencyCount: number;
  /** Whether this is a foundational module (many dependents, few dependencies) */
  isFoundational: boolean;
  /** List of direct dependents (files that import this) */
  directDependents: string[];
  /** List of direct dependencies (files this imports) */
  directDependencies: string[];
}

/**
 * Build dependency context for a test file.
 *
 * @param test - The orphan test
 * @param repoStructure - Repository structure with dependency edges
 * @returns Dependency context or null if not available
 */
function buildDependencyContext(
  test: OrphanTestInfo,
  repoStructure: RepoStructure | null,
): DependencyContext | null {
  if (!repoStructure?.dependencyEdges || repoStructure.dependencyEdges.length === 0) {
    return null;
  }

  const edges = repoStructure.dependencyEdges;

  // Get the source file(s) this test is likely testing
  const sourceFiles = test.relatedSourceFiles || [];
  if (sourceFiles.length === 0) {
    // Try to infer from test file path
    const testPath = test.filePath;
    const potentialSource = testPath
      .replace(/\.spec\.ts$/, '.ts')
      .replace(/\.test\.ts$/, '.ts')
      .replace(/\.e2e-spec\.ts$/, '.ts');
    if (potentialSource !== testPath) {
      sourceFiles.push(potentialSource);
    }
  }

  if (sourceFiles.length === 0) {
    return null;
  }

  // Count dependents and dependencies for all related source files
  const directDependents = new Set<string>();
  const directDependencies = new Set<string>();

  for (const sourceFile of sourceFiles) {
    for (const edge of edges) {
      // Files that import this source (dependents)
      if (edge.to === sourceFile) {
        directDependents.add(edge.from);
      }
      // Files that this source imports (dependencies)
      if (edge.from === sourceFile) {
        directDependencies.add(edge.to);
      }
    }
  }

  const dependentCount = directDependents.size;
  const dependencyCount = directDependencies.size;

  // A module is "foundational" if it has many dependents but few dependencies
  // This suggests it's a core utility or shared module
  const isFoundational = dependentCount >= 3 && dependencyCount <= 2;

  return {
    dependentCount,
    dependencyCount,
    isFoundational,
    directDependents: Array.from(directDependents).slice(0, 5), // Limit for prompt size
    directDependencies: Array.from(directDependencies).slice(0, 5),
  };
}

/**
 * Schema for LLM response
 */
interface InferenceResponse {
  description: string;
  category: string;
  observableOutcomes: string[];
  confidence: number;
  ambiguityReasons?: string[];
  reasoning: string;
}

/**
 * Default inference prompt that enforces observable-outcomes-only semantics
 */
function getInferencePrompt(
  testName: string,
  testCode: string,
  context: TestAnalysis,
  dependencyContext?: DependencyContext | null,
): string {
  // Build dependency section if available
  let dependencySection = '';
  if (dependencyContext) {
    dependencySection = `
## Dependency Analysis
- This module is ${dependencyContext.isFoundational ? '**foundational** (core utility used by many other modules)' : 'a regular module'}
- Dependents (files that use this): ${dependencyContext.dependentCount} ${dependencyContext.directDependents.length > 0 ? `(e.g., ${dependencyContext.directDependents.slice(0, 3).join(', ')})` : ''}
- Dependencies (files this uses): ${dependencyContext.dependencyCount} ${dependencyContext.directDependencies.length > 0 ? `(e.g., ${dependencyContext.directDependencies.slice(0, 3).join(', ')})` : ''}

${dependencyContext.isFoundational ? '**Note**: As a foundational module, this behavior is likely critical to multiple features. Ensure the atom description is sufficiently general to apply across all use cases.' : ''}
`;
  }

  return `You are analyzing a test to infer an Intent Atom - a description of WHAT the system should do, not HOW.

## Test Name
${testName}

## Test Code
\`\`\`typescript
${testCode}
\`\`\`

## Context
${context.summary}

Domain Concepts: ${context.domainConcepts.join(', ') || 'None identified'}
${context.relatedDocs?.length ? `\nRelated Documentation:\n${context.relatedDocs.slice(0, 2).join('\n')}` : ''}
${dependencySection}
## Instructions

Infer an Intent Atom that describes the behavioral intent this test validates.

CRITICAL REQUIREMENTS:
1. **Observable Outcomes Only**: Describe WHAT happens, not HOW it's implemented
   - GOOD: "User receives email notification within 5 minutes of order placement"
   - BAD: "EmailService.send() is called with correct parameters"

2. **Testable and Falsifiable**: The atom must be verifiable through this test
   - GOOD: "Login with invalid credentials returns 401 Unauthorized"
   - BAD: "System handles authentication properly"

3. **Implementation Agnostic**: No mentions of specific classes, methods, or technologies
   - GOOD: "Passwords are stored securely with one-way hashing"
   - BAD: "bcrypt.hash() is used with salt rounds of 10"

4. **Single Behavior**: One atom = one verifiable behavior
   - GOOD: "User can reset password using email link"
   - BAD: "User authentication including login, logout, and password reset"

## Response Format

Respond with JSON only (no markdown, no explanation):
{
  "description": "Clear, behavior-focused description (1-2 sentences)",
  "category": "functional|security|performance|reliability|usability",
  "observableOutcomes": ["Outcome 1 that can be verified", "Outcome 2 if applicable"],
  "confidence": 0-100,
  "ambiguityReasons": ["Reason for uncertainty (if confidence < 80)"],
  "reasoning": "Brief explanation of how you derived this atom from the test"
}`;
}

/**
 * Parse LLM response with fallback handling
 */
function parseInferenceResponse(
  response: string,
  testName: string,
): InferenceResponse | null {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as InferenceResponse;

    // Validate required fields
    if (!parsed.description || !parsed.category || !parsed.observableOutcomes) {
      return null;
    }

    // Normalize confidence to 0-100 range
    if (parsed.confidence > 1 && parsed.confidence <= 100) {
      // Already in 0-100 range
    } else if (parsed.confidence >= 0 && parsed.confidence <= 1) {
      parsed.confidence = Math.round(parsed.confidence * 100);
    } else {
      parsed.confidence = 50; // Default to medium confidence
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Create a fallback atom when LLM inference fails
 */
function createFallbackAtom(
  test: OrphanTestInfo,
  context: TestAnalysis | undefined,
): InferredAtom {
  return {
    tempId: `temp-${uuidv4()}`,
    description: `Behavior verified by test: ${test.testName}`,
    category: 'functional',
    sourceTest: {
      filePath: test.filePath,
      testName: test.testName,
      lineNumber: test.lineNumber,
    },
    observableOutcomes: ['Test passes as expected'],
    confidence: 30, // Low confidence for fallback
    ambiguityReasons: ['LLM inference failed, using fallback'],
    reasoning: 'Fallback atom - requires manual review',
    relatedDocs: context?.relatedDocs,
  };
}

/**
 * Creates the infer atoms node for the reconciliation graph.
 *
 * This node:
 * 1. Iterates over contextPerTest
 * 2. Calls LLM with inference prompt for each test
 * 3. Parses response into InferredAtom structure
 * 4. Implements state shedding (INV-R005) by clearing raw context
 * 5. Updates state with inferredAtoms array
 *
 * @param options - Optional customization options
 * @returns Node factory function
 */
/**
 * Tool result type for infer_atom_from_test
 */
interface InferAtomToolResult {
  temp_id: string;
  description: string;
  category: string;
  observable_outcomes: string[];
  confidence: number;
  ambiguity_reasons?: string[];
  reasoning: string;
}

/**
 * Infer atom using direct LLM call (fallback when tool unavailable)
 */
async function inferAtomWithLLM(
  test: OrphanTestInfo,
  context: TestAnalysis | undefined,
  config: NodeConfig,
  customPrompt?: string,
  minConfidence: number = 0,
  dependencyContext?: DependencyContext | null,
  foundationalBoost: number = 0,
): Promise<InferredAtom | null> {
  const testKey = `${test.filePath}:${test.testName}`;

  const prompt = customPrompt
    || getInferencePrompt(
      test.testName,
      test.testCode || '',
      context || {
        testId: testKey,
        summary: '',
        domainConcepts: [],
      },
      dependencyContext,
    );

  const response = await config.llmService.invoke({
    messages: [{ role: 'user', content: prompt }],
    taskType: AgentTaskType.ANALYSIS,
    agentName: 'infer-atoms-node',
    purpose: 'infer-intent-atom',
  });

  const parsed = parseInferenceResponse(response.content, test.testName);

  if (parsed && parsed.confidence >= minConfidence) {
    // Apply foundational boost for core modules (Phase 3.4)
    let adjustedConfidence = parsed.confidence;
    if (dependencyContext?.isFoundational && foundationalBoost > 0) {
      adjustedConfidence = Math.min(100, parsed.confidence + foundationalBoost);
    }

    return {
      tempId: `temp-${uuidv4()}`,
      description: parsed.description,
      category: parsed.category,
      sourceTest: {
        filePath: test.filePath,
        testName: test.testName,
        lineNumber: test.lineNumber,
      },
      observableOutcomes: parsed.observableOutcomes,
      confidence: adjustedConfidence,
      ambiguityReasons: parsed.ambiguityReasons,
      reasoning: parsed.reasoning,
      relatedDocs: context?.relatedDocs,
    };
  } else if (!parsed) {
    return null; // Signal to use fallback
  } else {
    return undefined as unknown as null; // Below threshold, skip
  }
}

export function createInferAtomsNode(options: InferAtomsNodeOptions = {}) {
  const batchSize = options.batchSize || 5;
  const minConfidence = options.minConfidence || 0; // Include all by default
  const useTool = options.useTool ?? true;
  const useDependencyContext = options.useDependencyContext ?? true;
  const foundationalBoost = options.foundationalBoost ?? 10;

  return (config: NodeConfig) =>
    async (state: ReconciliationGraphStateType): Promise<Partial<ReconciliationGraphStateType>> => {
      const orphanTests = state.orphanTests || [];
      const contextPerTest = state.contextPerTest || new Map();
      const repoStructure = state.repoStructure;

      // Check if dependency context is available
      const hasDependencyInfo = useDependencyContext &&
        repoStructure?.dependencyEdges &&
        repoStructure.dependencyEdges.length > 0;

      config.logger?.log(
        `[InferAtomsNode] Inferring atoms for ${orphanTests.length} tests ` +
        `(useTool=${useTool}, dependencyContext=${hasDependencyInfo})`,
      );

      // Check if tool is available
      const hasInferTool = useTool && config.toolRegistry.hasTool('infer_atom_from_test');

      const inferredAtoms: InferredAtom[] = [];
      let llmCallCount = 0;
      let processedCount = 0;

      // Process tests in batches
      for (let i = 0; i < orphanTests.length; i += batchSize) {
        const batch = orphanTests.slice(i, i + batchSize);

        // Process batch in parallel
        const batchPromises = batch.map(async (test) => {
          const testKey = `${test.filePath}:${test.testName}`;
          const context = contextPerTest.get(testKey);

          // Build dependency context for this test (Phase 3.4)
          const depContext = hasDependencyInfo
            ? buildDependencyContext(test, repoStructure)
            : null;

          try {
            // Try tool-based inference first
            if (hasInferTool) {
              try {
                const toolResult = await config.toolRegistry.executeTool(
                  'infer_atom_from_test',
                  {
                    test_file_path: test.filePath,
                    test_name: test.testName,
                    test_line_number: test.lineNumber,
                    test_code: test.testCode || '',
                    context_summary: context?.summary || '',
                    domain_concepts: context?.domainConcepts?.join(',') || '',
                    // Include dependency info if available
                    is_foundational: depContext?.isFoundational || false,
                    dependent_count: depContext?.dependentCount || 0,
                  },
                ) as InferAtomToolResult;

                llmCallCount++;

                // Apply foundational boost for core modules (Phase 3.4)
                let adjustedConfidence = toolResult.confidence;
                if (depContext?.isFoundational && foundationalBoost > 0) {
                  adjustedConfidence = Math.min(100, toolResult.confidence + foundationalBoost);
                  config.logger?.log(
                    `[InferAtomsNode] Applied foundational boost (+${foundationalBoost}) to ${testKey}`,
                  );
                }

                if (adjustedConfidence >= minConfidence) {
                  const atom: InferredAtom = {
                    tempId: toolResult.temp_id || `temp-${uuidv4()}`,
                    description: toolResult.description,
                    category: toolResult.category,
                    sourceTest: {
                      filePath: test.filePath,
                      testName: test.testName,
                      lineNumber: test.lineNumber,
                    },
                    observableOutcomes: toolResult.observable_outcomes,
                    confidence: adjustedConfidence,
                    ambiguityReasons: toolResult.ambiguity_reasons,
                    reasoning: toolResult.reasoning,
                    relatedDocs: context?.relatedDocs,
                  };
                  return atom;
                } else {
                  config.logger?.log(
                    `[InferAtomsNode] Skipping ${testKey} - confidence ${adjustedConfidence} below threshold ${minConfidence}`,
                  );
                  return null;
                }
              } catch (toolError) {
                const toolErrorMessage = toolError instanceof Error ? toolError.message : String(toolError);
                config.logger?.warn(
                  `[InferAtomsNode] Tool failed for ${testKey}, falling back to LLM: ${toolErrorMessage}`,
                );
                // Fall through to LLM fallback
              }
            }

            // Fallback: Direct LLM call with dependency context
            const result = await inferAtomWithLLM(
              test,
              context,
              config,
              options.customPrompt,
              minConfidence,
              depContext,
              foundationalBoost,
            );
            llmCallCount++;

            if (result === null) {
              config.logger?.warn(
                `[InferAtomsNode] Failed to parse response for ${testKey}, using fallback`,
              );
              return createFallbackAtom(test, context);
            } else if (result === undefined) {
              // Below threshold
              return null;
            }
            return result;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            config.logger?.warn(
              `[InferAtomsNode] Inference failed for ${testKey}: ${errorMessage}`,
            );
            return createFallbackAtom(test, context);
          }
        });

        const batchResults = await Promise.all(batchPromises);

        // Collect non-null results
        for (const atom of batchResults) {
          if (atom) {
            inferredAtoms.push(atom);
          }
        }

        processedCount += batch.length;
        config.logger?.log(
          `[InferAtomsNode] Processed ${processedCount}/${orphanTests.length} tests, ${inferredAtoms.length} atoms inferred`,
        );
      }

      config.logger?.log(
        `[InferAtomsNode] Inference complete: ${inferredAtoms.length} atoms from ${orphanTests.length} tests (${llmCallCount} LLM calls)`,
      );

      // INV-R005: State shedding - clear raw context from contextPerTest
      const cleanupUpdates = cleanupPhaseState(state, 'infer', 'synthesize');

      return {
        inferredAtoms,
        ...cleanupUpdates,
        currentPhase: 'synthesize',
        llmCallCount,
      };
    };
}
