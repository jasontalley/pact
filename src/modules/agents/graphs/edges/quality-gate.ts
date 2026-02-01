/**
 * Quality Gate Edges
 *
 * Edge conditions for routing based on quality scores or thresholds.
 */

/**
 * State interface for quality-aware graphs
 */
export interface QualityAwareState {
  qualityScore?: number;
  [key: string]: unknown;
}

/**
 * Quality gate edge that routes based on a score threshold.
 *
 * @param options - Threshold and node configuration
 * @returns Edge function
 */
export function createQualityGateEdge<TState extends QualityAwareState>(options: {
  /** Score threshold (inclusive) */
  threshold: number;
  /** Node to route to if score >= threshold */
  passNode: string;
  /** Node to route to if score < threshold */
  failNode: string;
  /** Optional: Field name for score (default: 'qualityScore') */
  scoreField?: keyof TState;
}): (state: TState) => string {
  return (state) => {
    const scoreField = (options.scoreField as string) || 'qualityScore';
    const score = (state[scoreField] as number) ?? 0;
    return score >= options.threshold ? options.passNode : options.failNode;
  };
}

/**
 * Multi-threshold quality gate for more granular routing.
 *
 * @param options - Thresholds and node configuration
 * @returns Edge function
 */
export function createMultiThresholdEdge<TState extends QualityAwareState>(options: {
  /** Thresholds in descending order with node names */
  thresholds: Array<{ min: number; node: string }>;
  /** Default node if no threshold matched */
  defaultNode: string;
  /** Optional: Field name for score (default: 'qualityScore') */
  scoreField?: keyof TState;
}): (state: TState) => string {
  return (state) => {
    const scoreField = (options.scoreField as string) || 'qualityScore';
    const score = (state[scoreField] as number) ?? 0;

    // Find first threshold that matches (assumes sorted descending)
    for (const { min, node } of options.thresholds) {
      if (score >= min) {
        return node;
      }
    }

    return options.defaultNode;
  };
}
