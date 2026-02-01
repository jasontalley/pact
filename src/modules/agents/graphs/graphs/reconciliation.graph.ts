/**
 * Reconciliation Graph
 *
 * LangGraph-based agent for reconciling repo state with Pact system.
 * Supports two modes: full-scan (brownfield) and delta (incremental).
 *
 * **Phase 4 Updates**:
 * - Supports checkpointing for pause/resume flow
 * - Handles NodeInterrupt for human-in-the-loop review
 * - Uses MemorySaver by default for development
 *
 * Flow:
 * ```
 * START -> structure -> discover -> context -> infer -> synthesize -> verify -> persist -> END
 *                          |                                            |
 *                 [fullscan | delta]                              [interrupt if review needed]
 * ```
 *
 * @see docs/implementation-checklist-phase5.md Section 1.12
 * @see docs/implementation-checklist-phase5.md Section 4.3 (checkpointing)
 * @see docs/architecture/reconcilation-agent-architecture-proposal.md
 */

import { StateGraph, END, START, MemorySaver, BaseCheckpointSaver } from '@langchain/langgraph';
import { NodeConfig } from '../nodes/types';
import {
  ReconciliationGraphState,
  ReconciliationGraphStateType,
} from '../types/reconciliation-state';
import {
  createStructureNode,
  StructureNodeOptions,
} from '../nodes/reconciliation/structure.node';
import {
  createDiscoverFullscanNode,
  DiscoverFullscanNodeOptions,
} from '../nodes/reconciliation/discover-fullscan.node';
import {
  createDiscoverDeltaNode,
  DiscoverDeltaNodeOptions,
} from '../nodes/reconciliation/discover-delta.node';
import {
  createContextNode,
  ContextNodeOptions,
} from '../nodes/reconciliation/context.node';
import {
  createInferAtomsNode,
  InferAtomsNodeOptions,
} from '../nodes/reconciliation/infer-atoms.node';
import {
  createSynthesizeMoleculesNode,
  SynthesizeMoleculesNodeOptions,
} from '../nodes/reconciliation/synthesize-molecules.node';
import {
  createVerifyNode,
  VerifyNodeOptions,
} from '../nodes/reconciliation/verify.node';
import {
  createPersistNode,
  PersistNodeOptions,
} from '../nodes/reconciliation/persist.node';
import {
  createInterimPersistNode,
  InterimPersistNodeOptions,
} from '../nodes/reconciliation/interim-persist.node';

/**
 * Options for customizing the Reconciliation graph
 */
export interface ReconciliationGraphOptions {
  /** Override default node options */
  nodeOptions?: {
    structure?: StructureNodeOptions;
    discoverFullscan?: DiscoverFullscanNodeOptions;
    discoverDelta?: DiscoverDeltaNodeOptions;
    context?: ContextNodeOptions;
    inferAtoms?: InferAtomsNodeOptions;
    synthesizeMolecules?: SynthesizeMoleculesNodeOptions;
    interimPersist?: InterimPersistNodeOptions;
    verify?: VerifyNodeOptions;
    persist?: PersistNodeOptions;
  };
  /** Custom checkpointer for state persistence (default: MemorySaver) */
  checkpointer?: BaseCheckpointSaver;
  /** Whether to enable interrupt support (default: true) */
  interruptEnabled?: boolean;
}

/**
 * Node names used in the graph
 */
export const RECONCILIATION_NODES = {
  STRUCTURE: 'structure',
  DISCOVER_FULLSCAN: 'discover_fullscan',
  DISCOVER_DELTA: 'discover_delta',
  CONTEXT: 'context',
  INFER_ATOMS: 'infer_atoms',
  SYNTHESIZE_MOLECULES: 'synthesize_molecules',
  INTERIM_PERSIST: 'interim_persist',
  VERIFY: 'verify',
  PERSIST: 'persist',
} as const;

/**
 * Wraps a node function with error handling.
 * On error, logs the error, stores it in state.errors, and allows graph to continue.
 * Critical nodes (structure, discover) will still throw to stop the graph.
 *
 * @param nodeName - Name of the node for logging
 * @param nodeFunc - The node function to wrap
 * @param config - Node config with logger
 * @param isCritical - If true, errors will still throw (default: false)
 * @returns Wrapped node function
 */
function wrapWithErrorHandling(
  nodeName: string,
  nodeFunc: (state: ReconciliationGraphStateType) => Promise<Partial<ReconciliationGraphStateType>>,
  config: NodeConfig,
  isCritical = false,
): (state: ReconciliationGraphStateType) => Promise<Partial<ReconciliationGraphStateType>> {
  return async (state: ReconciliationGraphStateType): Promise<Partial<ReconciliationGraphStateType>> => {
    try {
      return await nodeFunc(state);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      config.logger?.error(`[${nodeName}] Node failed: ${errorMessage}`);
      if (errorStack) {
        config.logger?.debug(`[${nodeName}] Stack trace: ${errorStack}`);
      }

      // For critical nodes (structure, discover), re-throw to stop the graph
      if (isCritical) {
        config.logger?.error(`[${nodeName}] Critical node failed, stopping graph`);
        throw error;
      }

      // For non-critical nodes, store error and continue
      config.logger?.warn(`[${nodeName}] Non-critical error, continuing to persist partial results`);

      // Format error string with timestamp and details
      const timestamp = new Date().toISOString();
      const errorString = `[${timestamp}] ${nodeName}: ${errorMessage}`;

      return {
        errors: [errorString],
        currentPhase: 'persist', // Signal that we should persist what we have
      };
    }
  };
}

/**
 * Conditional router to select discover mode
 */
function discoverRouter(
  state: ReconciliationGraphStateType,
): typeof RECONCILIATION_NODES.DISCOVER_FULLSCAN | typeof RECONCILIATION_NODES.DISCOVER_DELTA {
  const mode = state.input?.reconciliationMode || 'full-scan';

  if (mode === 'delta') {
    return RECONCILIATION_NODES.DISCOVER_DELTA;
  }

  return RECONCILIATION_NODES.DISCOVER_FULLSCAN;
}

/**
 * Creates the Reconciliation Agent graph.
 *
 * This graph implements the 7-phase reconciliation flow:
 * 1. Structure - List all files in the repository
 * 2. Discover - Find orphan tests (fullscan or delta mode)
 * 3. Context - Build rich context for each test
 * 4. Infer - Use LLM to infer atoms from tests
 * 5. Synthesize - Group atoms into molecules
 * 6. Verify - Validate atom quality
 * 7. Persist - Build patch and result
 *
 * @param config - Node configuration (LLM, tools, logger)
 * @param options - Graph customization options
 * @returns Compiled reconciliation graph
 */
export function createReconciliationGraph(
  config: NodeConfig,
  options: ReconciliationGraphOptions = {},
) {
  // Create base nodes with defaults or overrides
  const structureNodeBase = createStructureNode(options.nodeOptions?.structure)(config);
  const discoverFullscanNodeBase = createDiscoverFullscanNode(options.nodeOptions?.discoverFullscan)(config);
  const discoverDeltaNodeBase = createDiscoverDeltaNode(options.nodeOptions?.discoverDelta)(config);
  const contextNodeBase = createContextNode(options.nodeOptions?.context)(config);
  const inferAtomsNodeBase = createInferAtomsNode(options.nodeOptions?.inferAtoms)(config);
  const synthesizeMoleculesNodeBase = createSynthesizeMoleculesNode(options.nodeOptions?.synthesizeMolecules)(config);
  const interimPersistNodeBase = createInterimPersistNode(options.nodeOptions?.interimPersist)(config);
  const verifyNodeBase = createVerifyNode(options.nodeOptions?.verify)(config);
  const persistNodeBase = createPersistNode(options.nodeOptions?.persist)(config);

  // Wrap nodes with error handling
  // Critical nodes (structure, discover) will stop graph on error
  // Non-critical nodes will store error and continue to persist
  const structureNode = wrapWithErrorHandling(
    RECONCILIATION_NODES.STRUCTURE, structureNodeBase, config, true,
  );
  const discoverFullscanNode = wrapWithErrorHandling(
    RECONCILIATION_NODES.DISCOVER_FULLSCAN, discoverFullscanNodeBase, config, true,
  );
  const discoverDeltaNode = wrapWithErrorHandling(
    RECONCILIATION_NODES.DISCOVER_DELTA, discoverDeltaNodeBase, config, true,
  );
  const contextNode = wrapWithErrorHandling(
    RECONCILIATION_NODES.CONTEXT, contextNodeBase, config, false,
  );
  const inferAtomsNode = wrapWithErrorHandling(
    RECONCILIATION_NODES.INFER_ATOMS, inferAtomsNodeBase, config, false,
  );
  const synthesizeMoleculesNode = wrapWithErrorHandling(
    RECONCILIATION_NODES.SYNTHESIZE_MOLECULES, synthesizeMoleculesNodeBase, config, false,
  );
  // Interim persist is non-critical - we can continue without it
  const interimPersistNode = wrapWithErrorHandling(
    RECONCILIATION_NODES.INTERIM_PERSIST, interimPersistNodeBase, config, false,
  );
  const verifyNode = wrapWithErrorHandling(
    RECONCILIATION_NODES.VERIFY, verifyNodeBase, config, false,
  );
  // Persist node is not wrapped - it must always try to save what we have
  const persistNode = persistNodeBase;

  // Build graph
  const workflow = new StateGraph(ReconciliationGraphState)
    // Add nodes
    .addNode(RECONCILIATION_NODES.STRUCTURE, structureNode)
    .addNode(RECONCILIATION_NODES.DISCOVER_FULLSCAN, discoverFullscanNode)
    .addNode(RECONCILIATION_NODES.DISCOVER_DELTA, discoverDeltaNode)
    .addNode(RECONCILIATION_NODES.CONTEXT, contextNode)
    .addNode(RECONCILIATION_NODES.INFER_ATOMS, inferAtomsNode)
    .addNode(RECONCILIATION_NODES.SYNTHESIZE_MOLECULES, synthesizeMoleculesNode)
    .addNode(RECONCILIATION_NODES.INTERIM_PERSIST, interimPersistNode)
    .addNode(RECONCILIATION_NODES.VERIFY, verifyNode)
    .addNode(RECONCILIATION_NODES.PERSIST, persistNode)

    // Add edges
    // START -> structure
    .addEdge(START, RECONCILIATION_NODES.STRUCTURE)

    // structure -> [discover_fullscan | discover_delta] (conditional)
    .addConditionalEdges(
      RECONCILIATION_NODES.STRUCTURE,
      discoverRouter,
      [RECONCILIATION_NODES.DISCOVER_FULLSCAN, RECONCILIATION_NODES.DISCOVER_DELTA],
    )

    // discover_fullscan -> context
    .addEdge(RECONCILIATION_NODES.DISCOVER_FULLSCAN, RECONCILIATION_NODES.CONTEXT)

    // discover_delta -> context
    .addEdge(RECONCILIATION_NODES.DISCOVER_DELTA, RECONCILIATION_NODES.CONTEXT)

    // context -> infer_atoms
    .addEdge(RECONCILIATION_NODES.CONTEXT, RECONCILIATION_NODES.INFER_ATOMS)

    // infer_atoms -> synthesize_molecules
    .addEdge(RECONCILIATION_NODES.INFER_ATOMS, RECONCILIATION_NODES.SYNTHESIZE_MOLECULES)

    // synthesize_molecules -> interim_persist (save before verify)
    .addEdge(RECONCILIATION_NODES.SYNTHESIZE_MOLECULES, RECONCILIATION_NODES.INTERIM_PERSIST)

    // interim_persist -> verify
    .addEdge(RECONCILIATION_NODES.INTERIM_PERSIST, RECONCILIATION_NODES.VERIFY)

    // verify -> persist
    .addEdge(RECONCILIATION_NODES.VERIFY, RECONCILIATION_NODES.PERSIST)

    // persist -> END
    .addEdge(RECONCILIATION_NODES.PERSIST, END);

  // Use provided checkpointer or create default MemorySaver for development
  const checkpointer = options.checkpointer ?? new MemorySaver();

  // Compile with checkpointer for pause/resume support
  return workflow.compile({
    checkpointer,
    // Interrupt before persist node if verify sets pendingHumanReview
    // The NodeInterrupt thrown in verify.node.ts handles the actual pause
  });
}

/**
 * Graph name for registry
 */
export const RECONCILIATION_GRAPH_NAME = 'reconciliation';

/**
 * Graph configuration for registry
 */
export const RECONCILIATION_GRAPH_CONFIG = {
  description: 'Reconciliation agent for syncing repo state with Pact system',
  stateType: 'ReconciliationGraphState',
  pattern: 'linear-with-conditional',
  modes: ['full-scan', 'delta'] as const,
};
