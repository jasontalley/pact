/**
 * Artifact Capture Service
 *
 * Wraps graph invocation to record Run Artifacts. Captures inputs,
 * outputs, node transitions, evidence references, and metrics
 * for evaluation, regression testing, and cost analysis.
 *
 * @see docs/architecture/agent-contracts.md
 * @see docs/implementation-checklist-phase13.md (13.2.2, 13.9.2)
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { GraphRegistryService, InvokeOptions } from '../graphs/graph-registry.service';
import {
  AgentType,
  EvidenceReference,
  NodeMetrics,
  NodeTransition,
  ReconciliationRunOutput,
  InterviewRunOutput,
  RunArtifact,
  RunMetrics,
} from './run-artifact.types';
import { ReconciliationGraphStateType } from '../graphs/types/reconciliation-state';
import { InterviewGraphStateType } from '../graphs/types/interview-state';

/**
 * Options for artifact capture.
 */
export interface CaptureOptions extends InvokeOptions {
  /** Agent type being evaluated */
  agent: AgentType;
  /** Model name override (for pinned model evaluation) */
  model?: string;
  /** Temperature override */
  temperature?: number;
  /** Additional config to include in the artifact */
  additionalConfig?: Record<string, unknown>;
}

/**
 * Service that instruments graph invocation and captures Run Artifacts.
 */
@Injectable()
export class ArtifactCaptureService {
  private readonly logger = new Logger(ArtifactCaptureService.name);

  constructor(@Optional() private readonly graphRegistry?: GraphRegistryService) {}

  /**
   * Invoke a graph and capture a Run Artifact.
   *
   * @param graphName - Name of the graph to invoke
   * @param input - Input state for the graph
   * @param options - Capture options (agent type, model, etc.)
   * @returns The Run Artifact with full execution trace
   */
  async captureRun<TOutput>(
    graphName: string,
    input: unknown,
    options: CaptureOptions,
  ): Promise<{ result: TOutput; artifact: RunArtifact }> {
    if (!this.graphRegistry) {
      throw new Error('GraphRegistryService not available');
    }

    const runId = this.generateRunId();
    const startedAt = new Date();
    const nodeTransitions: NodeTransition[] = [];

    // Generate a thread ID for the checkpointer if not provided
    const threadId = options.threadId || `eval-${runId}`;

    this.logger.debug(
      `Starting artifact capture for ${options.agent} run ${runId} (thread: ${threadId})`,
    );

    // Compute input hash for deduplication
    const inputHash = this.hashInput(input);

    // Invoke the graph
    const graphStartTime = Date.now();
    let result: TOutput;
    let errors: string[] = [];

    try {
      result = await this.graphRegistry.invoke<TOutput>(graphName, input, {
        threadId,
        configurable: options.configurable,
        runName: options.runName || `eval:${options.agent}:${runId}`,
        tags: ['evaluation', options.agent, ...(options.tags || [])],
        metadata: {
          evaluationRunId: runId,
          ...options.metadata,
        },
      });
    } catch (error) {
      const endTime = Date.now();
      // Build a partial artifact even on failure
      const artifact = this.buildArtifact({
        runId,
        agent: options.agent,
        startedAt,
        completedAt: new Date(),
        input,
        inputHash,
        output: null,
        nodeTransitions,
        evidenceReferences: [],
        metrics: this.buildEmptyMetrics(endTime - graphStartTime),
        config: {
          model: options.model,
          temperature: options.temperature,
          ...options.additionalConfig,
        },
        errors: [error.message],
      });

      return { result: null as TOutput, artifact };
    }

    const completedAt = new Date();
    const totalDurationMs = Date.now() - graphStartTime;

    // Extract agent-specific output and evidence
    const { output, evidenceReferences, extractedErrors } = this.extractOutput(
      options.agent,
      result,
    );
    errors = extractedErrors;

    // Extract node transitions from the result state
    const transitions = this.extractNodeTransitions(options.agent, result);
    nodeTransitions.push(...transitions);

    // Build metrics
    const metrics = this.buildMetrics(result, totalDurationMs, nodeTransitions);

    // Build the artifact
    const artifact = this.buildArtifact({
      runId,
      agent: options.agent,
      startedAt,
      completedAt,
      input,
      inputHash,
      output,
      nodeTransitions,
      evidenceReferences,
      metrics,
      config: {
        model: options.model,
        temperature: options.temperature,
        ...options.additionalConfig,
      },
      errors,
    });

    this.logger.debug(
      `Artifact captured for ${options.agent} run ${runId}: ` +
        `${metrics.totalLlmCalls} LLM calls, ${metrics.totalTokens} tokens, ${totalDurationMs}ms`,
    );

    return { result, artifact };
  }

  /**
   * Build a Run Artifact from components.
   */
  private buildArtifact(params: {
    runId: string;
    agent: AgentType;
    startedAt: Date;
    completedAt: Date;
    input: unknown;
    inputHash: string;
    output: unknown;
    nodeTransitions: NodeTransition[];
    evidenceReferences: EvidenceReference[];
    metrics: RunMetrics;
    config: Record<string, unknown>;
    errors: string[];
  }): RunArtifact {
    const sanitizedInput = this.sanitizeInput(params.agent, params.input);

    return {
      runId: params.runId,
      agent: params.agent,
      startedAt: params.startedAt.toISOString(),
      completedAt: params.completedAt.toISOString(),
      config: params.config,
      input: sanitizedInput,
      inputHash: params.inputHash,
      output: params.output || this.buildEmptyOutput(params.agent, params.errors),
      nodeTransitions: params.nodeTransitions,
      evidenceReferences: params.evidenceReferences,
      metrics: params.metrics,
    } as RunArtifact;
  }

  /**
   * Extract agent-specific output from graph result state.
   */
  private extractOutput(
    agent: AgentType,
    result: unknown,
  ): {
    output: ReconciliationRunOutput | InterviewRunOutput | Record<string, unknown>;
    evidenceReferences: EvidenceReference[];
    extractedErrors: string[];
  } {
    if (agent === 'reconciliation') {
      return this.extractReconciliationOutput(result as ReconciliationGraphStateType);
    } else if (agent === 'interview') {
      return this.extractInterviewOutput(result as InterviewGraphStateType);
    }

    return {
      output: result as Record<string, unknown>,
      evidenceReferences: [],
      extractedErrors: [],
    };
  }

  /**
   * Extract output from Reconciliation graph state.
   */
  private extractReconciliationOutput(state: ReconciliationGraphStateType): {
    output: ReconciliationRunOutput;
    evidenceReferences: EvidenceReference[];
    extractedErrors: string[];
  } {
    const inferredAtoms = (state.inferredAtoms || []).map((atom) => ({
      tempId: atom.tempId,
      description: atom.description,
      category: atom.category,
      confidence: atom.confidence,
      qualityScore: atom.qualityScore,
      sourceTest: {
        filePath: atom.sourceTest.filePath,
        testName: atom.sourceTest.testName,
        lineNumber: atom.sourceTest.lineNumber,
      },
      observableOutcomes: atom.observableOutcomes,
    }));

    const inferredMolecules = (state.inferredMolecules || []).map((mol) => ({
      tempId: mol.tempId,
      name: mol.name,
      description: mol.description,
      atomTempIds: mol.atomTempIds,
      confidence: mol.confidence,
    }));

    // Extract evidence references from inferred atoms
    const evidenceReferences: EvidenceReference[] = inferredAtoms.map((atom) => ({
      type: 'test_file' as const,
      filePath: atom.sourceTest.filePath,
      lineNumber: atom.sourceTest.lineNumber,
      symbolName: atom.sourceTest.testName,
    }));

    return {
      output: {
        inferredAtoms,
        inferredMolecules,
        orphanTestCount: (state.orphanTests || []).length,
        changedLinkedTestCount: (state.changedAtomLinkedTests || []).length,
        errors: state.errors || [],
        decisions: (state.decisions || []).map(String),
      },
      evidenceReferences,
      extractedErrors: state.errors || [],
    };
  }

  /**
   * Extract output from Interview graph state.
   */
  private extractInterviewOutput(state: InterviewGraphStateType): {
    output: InterviewRunOutput;
    evidenceReferences: EvidenceReference[];
    extractedErrors: string[];
  } {
    const atomCandidates = (state.atomCandidates || []).map((atom) => ({
      description: atom.description,
      category: atom.category,
      observableOutcomes: atom.observableOutcomes,
      confidence: atom.confidence,
      sourceEvidence: atom.sourceEvidence,
    }));

    const moleculeCandidates = (state.moleculeCandidates || []).map((mol) => ({
      name: mol.name,
      description: mol.description,
      lensType: mol.lensType,
      atomIndices: mol.atomIndices,
    }));

    return {
      output: {
        atomCandidates,
        moleculeCandidates,
        questionsAsked: (state.allQuestions || []).length,
        allQuestions: (state.allQuestions || []).map((q) => ({
          question: q.question,
          category: q.category,
          answered: q.answered,
          answerStatus: q.answerStatus,
          responseScope: q.responseScope,
        })),
        roundsCompleted: state.round || 0,
        userSignaledDone: state.userDone || false,
        completionReason: state.completionReason || undefined,
        errors: state.errors || [],
      },
      evidenceReferences: [],
      extractedErrors: state.errors || [],
    };
  }

  /**
   * Extract node transitions from the result state.
   * When graph-level instrumentation is available, this can be replaced
   * with actual timing data per node.
   */
  private extractNodeTransitions(agent: AgentType, result: unknown): NodeTransition[] {
    const now = new Date().toISOString();

    if (agent === 'reconciliation') {
      const state = result as ReconciliationGraphStateType;
      const phase = state.currentPhase || 'persist';
      const phases: string[] = [
        'structure',
        'discover',
        'context',
        'infer',
        'synthesize',
        'verify',
        'persist',
      ];
      const reachedIndex = phases.indexOf(phase);

      return phases.slice(0, reachedIndex + 1).map((p) => ({
        node:
          p === 'discover'
            ? state.input?.reconciliationMode === 'delta'
              ? 'discover_delta'
              : 'discover_fullscan'
            : p === 'infer'
              ? 'infer_atoms'
              : p === 'synthesize'
                ? 'synthesize_molecules'
                : p,
        startedAt: now,
        completedAt: now,
        durationMs: 0, // Populated by graph-level instrumentation when available
        success: !(state.errors || []).some((e) => e.includes(p)),
        interrupted: p === 'verify' && state.pendingHumanReview,
      }));
    }

    if (agent === 'interview') {
      const state = result as InterviewGraphStateType;
      const transitions: NodeTransition[] = [
        { node: 'analyze_intent', startedAt: now, completedAt: now, durationMs: 0, success: true },
        {
          node: 'generate_questions',
          startedAt: now,
          completedAt: now,
          durationMs: 0,
          success: true,
        },
      ];

      if (
        state.currentPhase === 'extract_atoms' ||
        state.currentPhase === 'compose_molecule' ||
        state.currentPhase === 'complete'
      ) {
        transitions.push({
          node: 'extract_atoms',
          startedAt: now,
          completedAt: now,
          durationMs: 0,
          success: true,
        });
      }
      if (state.currentPhase === 'compose_molecule' || state.currentPhase === 'complete') {
        transitions.push({
          node: 'compose_molecule',
          startedAt: now,
          completedAt: now,
          durationMs: 0,
          success: true,
        });
      }

      return transitions;
    }

    return [];
  }

  /**
   * Build metrics from the result state and timing data.
   */
  private buildMetrics(
    result: unknown,
    totalDurationMs: number,
    nodeTransitions: NodeTransition[],
  ): RunMetrics {
    const llmCallCount = this.extractLlmCallCount(result);

    const perNode: NodeMetrics[] = nodeTransitions.map((t) => ({
      nodeName: t.node,
      durationMs: t.durationMs,
      llmCallCount: 0, // Populated by graph-level instrumentation when available
      toolCallCount: 0,
    }));

    return {
      totalDurationMs,
      totalInputTokens: 0, // Populated when LLM callback instrumentation is wired
      totalOutputTokens: 0,
      totalTokens: 0,
      totalLlmCalls: llmCallCount,
      totalToolCalls: 0,
      perNode,
    };
  }

  /**
   * Build empty metrics for error cases.
   */
  private buildEmptyMetrics(totalDurationMs: number): RunMetrics {
    return {
      totalDurationMs,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalLlmCalls: 0,
      totalToolCalls: 0,
      perNode: [],
    };
  }

  /**
   * Build empty output for error cases.
   */
  private buildEmptyOutput(
    agent: AgentType,
    errors: string[],
  ): ReconciliationRunOutput | InterviewRunOutput | Record<string, unknown> {
    if (agent === 'reconciliation') {
      return {
        inferredAtoms: [],
        inferredMolecules: [],
        orphanTestCount: 0,
        changedLinkedTestCount: 0,
        errors,
        decisions: [],
      } as ReconciliationRunOutput;
    }

    if (agent === 'interview') {
      return {
        atomCandidates: [],
        moleculeCandidates: [],
        questionsAsked: 0,
        roundsCompleted: 0,
        userSignaledDone: false,
        errors,
      } as InterviewRunOutput;
    }

    return { errors };
  }

  /**
   * Extract LLM call count from result state.
   */
  private extractLlmCallCount(result: unknown): number {
    const state = result as Record<string, unknown>;
    if (typeof state?.llmCallCount === 'number') {
      return state.llmCallCount;
    }
    return 0;
  }

  /**
   * Sanitize input for the artifact (remove secrets, PII).
   */
  private sanitizeInput(agent: AgentType, input: unknown): Record<string, unknown> {
    const raw = input as Record<string, unknown>;

    if (agent === 'reconciliation') {
      return {
        rootDirectory: raw.rootDirectory || '',
        mode:
          (raw.input as Record<string, unknown>)?.reconciliationMode ||
          raw.reconciliationMode ||
          'full-scan',
        options: (raw.input as Record<string, unknown>)?.options || raw.options || {},
      };
    }

    if (agent === 'interview') {
      return {
        rawIntent: raw.rawIntent || '',
        maxRounds: raw.maxRounds || 5,
        conversationTurns: Array.isArray(raw.conversationHistory)
          ? (raw.conversationHistory as unknown[]).length
          : 0,
      };
    }

    return { ...raw };
  }

  /**
   * Generate a unique run ID.
   */
  private generateRunId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `eval-${timestamp}-${random}`;
  }

  /**
   * Compute SHA-256 hash of the input for deduplication.
   */
  private hashInput(input: unknown): string {
    const serialized = JSON.stringify(input, (_, value) => {
      // Normalize Maps and Sets for consistent hashing
      if (value instanceof Map) return Object.fromEntries(value);
      if (value instanceof Set) return Array.from(value);
      return value;
    });
    return createHash('sha256').update(serialized).digest('hex').substring(0, 16);
  }
}
