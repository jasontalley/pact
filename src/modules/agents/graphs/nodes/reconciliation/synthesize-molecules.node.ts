/**
 * Synthesize Molecules Node
 *
 * Groups inferred atoms into molecules using deterministic clustering.
 * Molecules are descriptive lenses, not truth (per INV-R004).
 *
 * **Phase 5 Updates**:
 * - Added domain_concept clustering method
 * - Added semantic clustering method (optional, requires embeddings)
 * - Enhanced molecule descriptions with domain context
 *
 * Uses the `cluster_atoms_for_molecules` tool via ToolRegistryService.
 *
 * @see docs/implementation-checklist-phase5.md Section 1.9
 * @see docs/implementation-checklist-phase5.md Section 2.3 (refactored to use tools)
 * @see docs/implementation-checklist-phase5.md Section 5.2 (enhanced clustering)
 */

import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { NodeConfig } from '../types';
import {
  ReconciliationGraphStateType,
  InferredAtom,
  InferredMolecule,
  EvidenceSource,
} from '../../types/reconciliation-state';

/**
 * Available clustering methods
 */
export type ClusteringMethod = 'module' | 'category' | 'namespace' | 'domain_concept' | 'semantic';

/**
 * Options for customizing synthesize molecules node behavior
 */
export interface SynthesizeMoleculesNodeOptions {
  /** Clustering method (default: 'module') */
  clusteringMethod?: ClusteringMethod;
  /** Minimum atoms per molecule */
  minAtomsPerMolecule?: number;
  /** Whether to use LLM for naming (default: false in Phase 1) */
  useLLMForNaming?: boolean;
  /** Use tool-based clustering (default: true) */
  useTool?: boolean;
  /** Similarity threshold for semantic clustering (0-1, default: 0.7) */
  semanticSimilarityThreshold?: number;
}

/**
 * Tool result type for cluster_atoms_for_molecules
 */
interface ClusteredMoleculeResult {
  temp_id: string;
  name: string;
  description: string;
  atom_temp_ids: string[];
  confidence: number;
  clustering_reason: string;
}

/**
 * Extract module/namespace from file path
 *
 * Examples:
 * - src/modules/users/users.service.spec.ts -> users
 * - src/modules/auth/login.spec.ts -> auth
 * - frontend/components/Button/Button.spec.tsx -> Button
 */
function extractModuleFromPath(filePath: string): string {
  const parts = filePath.split(path.sep);

  // Look for common module indicators
  const moduleIndex = parts.findIndex(
    (p) => p === 'modules' || p === 'components' || p === 'pages' || p === 'features',
  );

  if (moduleIndex >= 0 && moduleIndex < parts.length - 1) {
    return parts[moduleIndex + 1];
  }

  // Fallback: use directory name
  const dirName = parts[parts.length - 2];
  return dirName || 'misc';
}

/**
 * Generate a molecule name from clustered atoms
 */
function generateMoleculeName(atoms: InferredAtom[], groupKey: string): string {
  // Capitalize first letter
  const name = groupKey.charAt(0).toUpperCase() + groupKey.slice(1);

  // Add suffix based on atom categories
  const categories = new Set(atoms.map((a) => a.category));
  if (categories.size === 1) {
    const category = categories.values().next().value;
    if (category === 'security') return `${name} Security`;
    if (category === 'performance') return `${name} Performance`;
  }

  return `${name} Functionality`;
}

/**
 * Generate a molecule description from clustered atoms
 */
function generateMoleculeDescription(atoms: InferredAtom[], groupKey: string): string {
  if (atoms.length === 1) {
    return `Behavior related to ${groupKey}: ${atoms[0].description}`;
  }

  const behaviors = atoms.slice(0, 3).map((a) => a.description);
  return `Behaviors related to ${groupKey} including: ${behaviors.join('; ')}${atoms.length > 3 ? ' and more' : ''}`;
}

/**
 * Calculate molecule confidence as average of atom confidences
 * Per INV-R004: molecule confidence MUST NOT affect atom confidence
 */
function calculateMoleculeConfidence(atoms: InferredAtom[]): number {
  if (atoms.length === 0) return 0;
  const sum = atoms.reduce((acc, a) => acc + a.confidence, 0);
  return Math.round(sum / atoms.length);
}

/**
 * Cluster atoms by module/namespace
 */
function clusterByModule(atoms: InferredAtom[]): Map<string, InferredAtom[]> {
  const clusters = new Map<string, InferredAtom[]>();

  for (const atom of atoms) {
    const module = extractModuleFromPath(atom.sourceTest.filePath);
    const existing = clusters.get(module) || [];
    existing.push(atom);
    clusters.set(module, existing);
  }

  return clusters;
}

/**
 * Cluster atoms by category
 */
function clusterByCategory(atoms: InferredAtom[]): Map<string, InferredAtom[]> {
  const clusters = new Map<string, InferredAtom[]>();

  for (const atom of atoms) {
    const category = atom.category || 'functional';
    const existing = clusters.get(category) || [];
    existing.push(atom);
    clusters.set(category, existing);
  }

  return clusters;
}

/**
 * Cluster atoms by namespace (file path directory)
 */
function clusterByNamespace(atoms: InferredAtom[]): Map<string, InferredAtom[]> {
  const clusters = new Map<string, InferredAtom[]>();

  for (const atom of atoms) {
    const dir = path.dirname(atom.sourceTest.filePath);
    const existing = clusters.get(dir) || [];
    existing.push(atom);
    clusters.set(dir, existing);
  }

  return clusters;
}

/**
 * Extract domain concepts from atom description and observable outcomes
 */
function extractDomainConcepts(atom: InferredAtom): string[] {
  const concepts: Set<string> = new Set();

  // Common domain concept patterns
  const domainPatterns = [
    // User/Auth domain
    /\b(user|users|account|profile|authentication|login|logout|session|permission|role)\b/gi,
    // Data domain
    /\b(create|read|update|delete|crud|save|load|store|fetch|retrieve)\b/gi,
    // Business domain
    /\b(order|payment|cart|checkout|invoice|subscription|billing)\b/gi,
    // System domain
    /\b(cache|queue|event|message|notification|email|webhook)\b/gi,
    // Validation domain
    /\b(validate|validation|verify|check|constraint|rule)\b/gi,
    // Error/Security domain
    /\b(error|exception|security|authorization|access|encrypt|decrypt)\b/gi,
  ];

  const textToAnalyze = [
    atom.description,
    ...(atom.observableOutcomes || []),
    atom.reasoning || '',
  ].join(' ');

  for (const pattern of domainPatterns) {
    const matches = textToAnalyze.match(pattern);
    if (matches) {
      for (const match of matches) {
        concepts.add(match.toLowerCase());
      }
    }
  }

  return Array.from(concepts);
}

/**
 * Cluster atoms by domain concepts
 * Groups atoms that share common domain terminology
 */
function clusterByDomainConcept(atoms: InferredAtom[]): Map<string, InferredAtom[]> {
  const clusters = new Map<string, InferredAtom[]>();
  const atomConcepts = new Map<InferredAtom, string[]>();

  // Extract concepts for each atom
  for (const atom of atoms) {
    const concepts = extractDomainConcepts(atom);
    atomConcepts.set(atom, concepts);
  }

  // Build concept frequency map
  const conceptFrequency = new Map<string, number>();
  for (const concepts of atomConcepts.values()) {
    for (const concept of concepts) {
      conceptFrequency.set(concept, (conceptFrequency.get(concept) || 0) + 1);
    }
  }

  // Find primary concept for each atom (most frequent shared concept)
  for (const atom of atoms) {
    const concepts = atomConcepts.get(atom) || [];

    if (concepts.length === 0) {
      // No concepts found - use fallback
      const existing = clusters.get('misc') || [];
      existing.push(atom);
      clusters.set('misc', existing);
      continue;
    }

    // Pick the concept that appears most frequently across all atoms
    let primaryConcept = concepts[0];
    let maxFrequency = conceptFrequency.get(concepts[0]) || 0;

    for (const concept of concepts) {
      const freq = conceptFrequency.get(concept) || 0;
      if (freq > maxFrequency) {
        maxFrequency = freq;
        primaryConcept = concept;
      }
    }

    const existing = clusters.get(primaryConcept) || [];
    existing.push(atom);
    clusters.set(primaryConcept, existing);
  }

  return clusters;
}

/**
 * Simple text-based similarity for semantic clustering
 * Uses word overlap (Jaccard similarity) as a simple approximation
 */
function computeTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(
    text1
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
  const words2 = new Set(
    text2
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );

  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Get text representation of an atom for similarity computation
 */
function getAtomText(atom: InferredAtom): string {
  return [atom.description, ...(atom.observableOutcomes || []), atom.category].join(' ');
}

/**
 * Cluster atoms by semantic similarity
 * Uses agglomerative clustering with text similarity
 */
function clusterBySemantic(
  atoms: InferredAtom[],
  similarityThreshold: number = 0.3,
): Map<string, InferredAtom[]> {
  const clusters = new Map<string, InferredAtom[]>();

  if (atoms.length === 0) return clusters;

  // Track which atoms have been assigned
  const assigned = new Set<number>();
  let clusterIndex = 0;

  // Simple agglomerative clustering
  for (let i = 0; i < atoms.length; i++) {
    if (assigned.has(i)) continue;

    // Start a new cluster with this atom
    const clusterName = `semantic-group-${clusterIndex++}`;
    const clusterAtoms: InferredAtom[] = [atoms[i]];
    assigned.add(i);

    const atomText = getAtomText(atoms[i]);

    // Find similar atoms to add to this cluster
    for (let j = i + 1; j < atoms.length; j++) {
      if (assigned.has(j)) continue;

      const otherAtomText = getAtomText(atoms[j]);
      const similarity = computeTextSimilarity(atomText, otherAtomText);

      if (similarity >= similarityThreshold) {
        clusterAtoms.push(atoms[j]);
        assigned.add(j);
      }
    }

    clusters.set(clusterName, clusterAtoms);
  }

  return clusters;
}

/**
 * Creates the synthesize molecules node for the reconciliation graph.
 *
 * This node:
 * 1. Groups inferredAtoms by module/category/namespace
 * 2. Creates InferredMolecule for each group
 * 3. Assigns deterministic names based on group key
 * 4. Updates state with inferredMolecules array
 *
 * INV-R004: Molecules are lenses, not truth.
 * - Molecule creation MUST NOT block atom creation
 * - Molecule confidence MUST NOT affect atom confidence
 * - Failures degrade to "unnamed cluster", not rejection
 *
 * @param options - Optional customization options
 * @returns Node factory function
 */
// ============================================================================
// Phase 21C: Cross-Evidence Deduplication
// ============================================================================

/**
 * Deduplicate atoms that were inferred from different evidence sources
 * but describe the same behavior. Merges their evidenceSources and applies
 * a corroboration confidence boost.
 *
 * @param atoms - All inferred atoms (may contain near-duplicates from different evidence)
 * @param similarityThreshold - Jaccard similarity threshold for merging (default: 0.4)
 * @param logger - Optional logger
 * @returns Deduplicated atoms with merged evidence sources
 */
function deduplicateAcrossEvidence(
  atoms: InferredAtom[],
  similarityThreshold: number = 0.4,
  logger?: NodeConfig['logger'],
): InferredAtom[] {
  if (atoms.length <= 1) return atoms;

  // Group atoms into merge sets using union-find approach
  const parent = atoms.map((_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]; // path compression
      i = parent[i];
    }
    return i;
  }

  function union(i: number, j: number): void {
    const pi = find(i);
    const pj = find(j);
    if (pi !== pj) parent[pi] = pj;
  }

  // Compare all pairs and union similar atoms
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      // Only merge atoms from different evidence types
      const typeI = atoms[i].primaryEvidenceType || 'test';
      const typeJ = atoms[j].primaryEvidenceType || 'test';
      if (typeI === typeJ) continue;

      const similarity = computeTextSimilarity(getAtomText(atoms[i]), getAtomText(atoms[j]));
      if (similarity >= similarityThreshold) {
        union(i, j);
      }
    }
  }

  // Group atoms by their root parent
  const groups = new Map<number, number[]>();
  for (let i = 0; i < atoms.length; i++) {
    const root = find(i);
    const list = groups.get(root) || [];
    list.push(i);
    groups.set(root, list);
  }

  // Merge each group into a single atom
  const result: InferredAtom[] = [];
  let mergedCount = 0;

  for (const indices of groups.values()) {
    if (indices.length === 1) {
      result.push(atoms[indices[0]]);
      continue;
    }

    // Pick the highest-confidence atom as primary
    let primaryIdx = indices[0];
    for (const idx of indices) {
      if (atoms[idx].confidence > atoms[primaryIdx].confidence) {
        primaryIdx = idx;
      }
    }

    const primary = { ...atoms[primaryIdx] };

    // Merge evidence sources from all atoms in the group
    const allSources: EvidenceSource[] = [];
    for (const idx of indices) {
      const sources = atoms[idx].evidenceSources || [];
      allSources.push(...sources);
    }
    primary.evidenceSources = allSources;

    // Corroboration bonus: atoms supported by multiple evidence types
    const uniqueTypes = new Set(allSources.map((s) => s.type));
    if (uniqueTypes.size >= 3) {
      primary.confidence = Math.min(100, primary.confidence + 15);
    } else if (uniqueTypes.size >= 2) {
      primary.confidence = Math.min(100, primary.confidence + 10);
    }

    result.push(primary);
    mergedCount += indices.length - 1;
  }

  if (mergedCount > 0) {
    logger?.log(
      `[SynthesizeMoleculesNode] Deduplicated: merged ${mergedCount} duplicate atoms ` +
        `(${atoms.length} → ${result.length})`,
    );
  }

  return result;
}

/**
 * Cluster atoms using direct implementation (fallback when tool unavailable)
 */
function clusterAtomsDirect(
  inferredAtoms: InferredAtom[],
  clusteringMethod: ClusteringMethod,
  minAtomsPerMolecule: number,
  logger?: NodeConfig['logger'],
  semanticSimilarityThreshold?: number,
): InferredMolecule[] {
  // Step 1: Cluster atoms
  let clusters: Map<string, InferredAtom[]>;

  switch (clusteringMethod) {
    case 'category':
      clusters = clusterByCategory(inferredAtoms);
      break;
    case 'namespace':
      clusters = clusterByNamespace(inferredAtoms);
      break;
    case 'domain_concept':
      clusters = clusterByDomainConcept(inferredAtoms);
      break;
    case 'semantic':
      clusters = clusterBySemantic(inferredAtoms, semanticSimilarityThreshold);
      break;
    case 'module':
    default:
      clusters = clusterByModule(inferredAtoms);
      break;
  }

  logger?.log(`[SynthesizeMoleculesNode] Created ${clusters.size} clusters`);

  // Step 2: Create molecules from clusters
  const inferredMolecules: InferredMolecule[] = [];

  for (const [groupKey, atoms] of clusters) {
    // Skip clusters below minimum size
    if (atoms.length < minAtomsPerMolecule) {
      logger?.log(
        `[SynthesizeMoleculesNode] Skipping cluster "${groupKey}" with ${atoms.length} atoms (below minimum ${minAtomsPerMolecule})`,
      );
      continue;
    }

    try {
      const molecule: InferredMolecule = {
        tempId: `temp-mol-${uuidv4()}`,
        name: generateMoleculeName(atoms, groupKey),
        description: generateMoleculeDescription(atoms, groupKey),
        atomTempIds: atoms.map((a) => a.tempId),
        confidence: calculateMoleculeConfidence(atoms),
        reasoning: `Grouped ${atoms.length} atoms by ${clusteringMethod}: ${groupKey}`,
      };

      inferredMolecules.push(molecule);
    } catch (error) {
      // INV-R004: Failures degrade to "unnamed cluster", not rejection
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.warn(
        `[SynthesizeMoleculesNode] Failed to create molecule for "${groupKey}": ${errorMessage}. Using unnamed cluster.`,
      );

      const fallbackMolecule: InferredMolecule = {
        tempId: `temp-mol-${uuidv4()}`,
        name: 'Unnamed Cluster',
        description: `Atoms from ${groupKey} (molecule synthesis failed)`,
        atomTempIds: atoms.map((a) => a.tempId),
        confidence: 0,
        reasoning: `Fallback cluster due to error: ${errorMessage}`,
      };

      inferredMolecules.push(fallbackMolecule);
    }
  }

  return inferredMolecules;
}

export function createSynthesizeMoleculesNode(options: SynthesizeMoleculesNodeOptions = {}) {
  const clusteringMethod = options.clusteringMethod || 'module';
  const minAtomsPerMolecule = options.minAtomsPerMolecule || 1;
  const useTool = options.useTool ?? true;
  const semanticSimilarityThreshold = options.semanticSimilarityThreshold ?? 0.3;

  return (config: NodeConfig) =>
    async (state: ReconciliationGraphStateType): Promise<Partial<ReconciliationGraphStateType>> => {
      const rawAtoms = state.inferredAtoms || [];

      // Phase 21C: Deduplicate atoms from different evidence sources
      const inferredAtoms = deduplicateAcrossEvidence(rawAtoms, 0.4, config.logger);

      config.logger?.log(
        `[SynthesizeMoleculesNode] Clustering ${inferredAtoms.length} atoms using method: ${clusteringMethod} (useTool=${useTool})`,
      );

      // Check if tool is available
      const hasClusterTool = useTool && config.toolRegistry.hasTool('cluster_atoms_for_molecules');
      let inferredMolecules: InferredMolecule[] = [];

      // Try tool-based clustering first
      if (hasClusterTool) {
        try {
          config.logger?.log('[SynthesizeMoleculesNode] Using cluster_atoms_for_molecules tool');

          // Prepare atoms for tool (convert to expected format)
          const atomsForTool = inferredAtoms.map((a) => ({
            temp_id: a.tempId,
            description: a.description,
            category: a.category,
            source_file: a.sourceTest.filePath,
          }));

          const toolResult = (await config.toolRegistry.executeTool('cluster_atoms_for_molecules', {
            atoms: JSON.stringify(atomsForTool),
            clustering_method: clusteringMethod,
            min_atoms_per_cluster: String(minAtomsPerMolecule),
          })) as ClusteredMoleculeResult[];

          // Convert tool result to InferredMolecule format
          inferredMolecules = toolResult.map((result) => ({
            tempId: result.temp_id,
            name: result.name,
            description: result.description,
            atomTempIds: result.atom_temp_ids,
            confidence: result.confidence,
            reasoning: result.clustering_reason,
          }));

          config.logger?.log(
            `[SynthesizeMoleculesNode] Tool synthesized ${inferredMolecules.length} molecules`,
          );
        } catch (toolError) {
          const toolErrorMessage =
            toolError instanceof Error ? toolError.message : String(toolError);
          config.logger?.warn(
            `[SynthesizeMoleculesNode] Tool execution failed, falling back to direct implementation: ${toolErrorMessage}`,
          );

          // Fallback to direct implementation
          inferredMolecules = clusterAtomsDirect(
            inferredAtoms,
            clusteringMethod,
            minAtomsPerMolecule,
            config.logger,
            semanticSimilarityThreshold,
          );
        }
      } else {
        // Fallback: Direct implementation
        inferredMolecules = clusterAtomsDirect(
          inferredAtoms,
          clusteringMethod,
          minAtomsPerMolecule,
          config.logger,
          semanticSimilarityThreshold,
        );
      }

      config.logger?.log(
        `[SynthesizeMoleculesNode] Synthesized ${inferredMolecules.length} molecules`,
      );

      return {
        inferredAtoms, // Return deduplicated atoms for downstream nodes
        inferredMolecules,
        currentPhase: 'verify',
      };
    };
}
