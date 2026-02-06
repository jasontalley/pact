/**
 * Edge Function Tests
 *
 * Tests for graph edge functions that control flow routing.
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import {
  createDecisionEdge,
  createShouldContinueEdge,
  alwaysAnalyze,
  alwaysRouteTo,
  DecisionAwareState,
} from './should-continue';
import { createQualityGateEdge, createMultiThresholdEdge, QualityAwareState } from './quality-gate';
import { AnalyzeDecisionType } from '../types/schemas';
import { BaseExplorationStateType } from '../types/base-state';

// Helper to create minimal decision state for testing
function createDecisionState(
  decision: AnalyzeDecisionType | null,
  iteration = 1,
  maxIterations = 5,
  isComplete = false,
): DecisionAwareState {
  return {
    input: '',
    findings: [],
    toolHistory: [],
    iteration,
    maxIterations,
    isComplete,
    output: null,
    messages: [],
    errors: [],
    analysisDecision: decision,
    clarificationNeeded: null,
    evidenceLevel: 2 as const,
    limitations: [],
  };
}

// Helper to create minimal base state for testing
function createBaseState(
  iteration = 1,
  maxIterations = 5,
  isComplete = false,
): BaseExplorationStateType {
  return {
    input: '',
    findings: [],
    toolHistory: [],
    iteration,
    maxIterations,
    isComplete,
    output: null,
    messages: [],
    errors: [],
    evidenceLevel: 2 as const,
    limitations: [],
  };
}

describe('Edge Functions', () => {
  describe('createDecisionEdge', () => {
    const defaultOptions = {
      searchNode: 'search',
      synthesizeNode: 'synthesize',
    };

    it('should route to search when decision is need_more_search', () => {
      const edge = createDecisionEdge(defaultOptions);
      const state = createDecisionState('need_more_search');

      const result = edge(state);

      expect(result).toBe('search');
    });

    it('should route to synthesize when decision is ready_to_answer', () => {
      const edge = createDecisionEdge(defaultOptions);
      const state = createDecisionState('ready_to_answer');

      const result = edge(state);

      expect(result).toBe('synthesize');
    });

    it('should route to synthesize when decision is max_iterations_reached', () => {
      const edge = createDecisionEdge(defaultOptions);
      const state = createDecisionState('max_iterations_reached', 5, 5);

      const result = edge(state);

      expect(result).toBe('synthesize');
    });

    it('should route to clarify node when decision is request_clarification', () => {
      const edge = createDecisionEdge({
        ...defaultOptions,
        clarifyNode: 'clarify',
      });
      const state = createDecisionState('request_clarification');

      const result = edge(state);

      expect(result).toBe('clarify');
    });

    it('should route to synthesize when request_clarification but no clarify node', () => {
      const edge = createDecisionEdge(defaultOptions);
      const state = createDecisionState('request_clarification');

      const result = edge(state);

      expect(result).toBe('synthesize');
    });

    it('should route to synthesize when iteration exceeds max', () => {
      const edge = createDecisionEdge(defaultOptions);
      const state = createDecisionState('need_more_search', 6, 5);

      const result = edge(state);

      expect(result).toBe('synthesize');
    });

    it('should route to search on default case when under max iterations', () => {
      const edge = createDecisionEdge(defaultOptions);
      // Null decision should fall to default case
      const state = createDecisionState(null, 1, 5);

      const result = edge(state);

      expect(result).toBe('search');
    });
  });

  describe('createShouldContinueEdge', () => {
    const options = {
      continueNode: 'search',
      completeNode: 'synthesize',
    };

    it('should route to continue when not complete and under limit', () => {
      const edge = createShouldContinueEdge(options);
      const state = createBaseState(1, 5, false);

      const result = edge(state);

      expect(result).toBe('search');
    });

    it('should route to complete when isComplete is true', () => {
      const edge = createShouldContinueEdge(options);
      const state = createBaseState(1, 5, true);

      const result = edge(state);

      expect(result).toBe('synthesize');
    });

    it('should route to complete when iteration equals maxIterations', () => {
      const edge = createShouldContinueEdge(options);
      const state = createBaseState(5, 5, false);

      const result = edge(state);

      expect(result).toBe('synthesize');
    });

    it('should route to complete when iteration exceeds maxIterations', () => {
      const edge = createShouldContinueEdge(options);
      const state = createBaseState(6, 5, false);

      const result = edge(state);

      expect(result).toBe('synthesize');
    });
  });

  describe('alwaysAnalyze', () => {
    it('should always return analyze', () => {
      const edge = alwaysAnalyze();

      expect(edge({})).toBe('analyze');
      expect(edge({ any: 'state' })).toBe('analyze');
    });
  });

  describe('alwaysRouteTo', () => {
    it('should always return the specified node', () => {
      const edge = alwaysRouteTo('myNode');

      expect(edge({})).toBe('myNode');
      expect(edge({ any: 'state' })).toBe('myNode');
    });

    it('should work with any node name', () => {
      expect(alwaysRouteTo('synthesize')({})).toBe('synthesize');
      expect(alwaysRouteTo('search')({})).toBe('search');
      expect(alwaysRouteTo('custom_node')({})).toBe('custom_node');
    });
  });

  describe('createQualityGateEdge', () => {
    it('should route to passNode when score meets threshold', () => {
      const edge = createQualityGateEdge<QualityAwareState>({
        threshold: 80,
        passNode: 'commit',
        failNode: 'refine',
      });
      const state: QualityAwareState = {
        qualityScore: 85,
      };

      const result = edge(state);

      expect(result).toBe('commit');
    });

    it('should route to passNode when score equals threshold', () => {
      const edge = createQualityGateEdge<QualityAwareState>({
        threshold: 80,
        passNode: 'commit',
        failNode: 'refine',
      });
      const state: QualityAwareState = {
        qualityScore: 80,
      };

      const result = edge(state);

      expect(result).toBe('commit');
    });

    it('should route to failNode when score below threshold', () => {
      const edge = createQualityGateEdge<QualityAwareState>({
        threshold: 80,
        passNode: 'commit',
        failNode: 'refine',
      });
      const state: QualityAwareState = {
        qualityScore: 79,
      };

      const result = edge(state);

      expect(result).toBe('refine');
    });

    it('should default to 0 when qualityScore is undefined', () => {
      const edge = createQualityGateEdge<QualityAwareState>({
        threshold: 80,
        passNode: 'commit',
        failNode: 'refine',
      });
      const state: QualityAwareState = {};

      const result = edge(state);

      expect(result).toBe('refine');
    });

    it('should use custom score field', () => {
      interface CustomState extends QualityAwareState {
        confidenceLevel: number;
      }
      const edge = createQualityGateEdge<CustomState>({
        threshold: 0.9,
        passNode: 'accept',
        failNode: 'reject',
        scoreField: 'confidenceLevel',
      });
      const state: CustomState = {
        confidenceLevel: 0.95,
      };

      const result = edge(state);

      expect(result).toBe('accept');
    });
  });

  describe('createMultiThresholdEdge', () => {
    it('should route to highest matching threshold node', () => {
      const edge = createMultiThresholdEdge<QualityAwareState>({
        thresholds: [
          { min: 90, node: 'excellent' },
          { min: 70, node: 'good' },
          { min: 50, node: 'acceptable' },
        ],
        defaultNode: 'needs_work',
      });
      const state: QualityAwareState = {
        qualityScore: 95,
      };

      const result = edge(state);

      expect(result).toBe('excellent');
    });

    it('should route to appropriate tier', () => {
      const edge = createMultiThresholdEdge<QualityAwareState>({
        thresholds: [
          { min: 90, node: 'excellent' },
          { min: 70, node: 'good' },
          { min: 50, node: 'acceptable' },
        ],
        defaultNode: 'needs_work',
      });
      const state: QualityAwareState = {
        qualityScore: 75,
      };

      const result = edge(state);

      expect(result).toBe('good');
    });

    it('should route to defaultNode when below all thresholds', () => {
      const edge = createMultiThresholdEdge<QualityAwareState>({
        thresholds: [
          { min: 90, node: 'excellent' },
          { min: 70, node: 'good' },
          { min: 50, node: 'acceptable' },
        ],
        defaultNode: 'needs_work',
      });
      const state: QualityAwareState = {
        qualityScore: 40,
      };

      const result = edge(state);

      expect(result).toBe('needs_work');
    });

    it('should use custom score field', () => {
      interface CustomState extends QualityAwareState {
        priority: number;
      }
      const edge = createMultiThresholdEdge<CustomState>({
        thresholds: [
          { min: 80, node: 'high' },
          { min: 50, node: 'medium' },
        ],
        defaultNode: 'low',
        scoreField: 'priority',
      });
      const state: CustomState = {
        priority: 60,
      };

      const result = edge(state);

      expect(result).toBe('medium');
    });

    it('should default to 0 when score is undefined', () => {
      const edge = createMultiThresholdEdge<QualityAwareState>({
        thresholds: [{ min: 50, node: 'pass' }],
        defaultNode: 'fail',
      });
      const state: QualityAwareState = {};

      const result = edge(state);

      expect(result).toBe('fail');
    });

    it('should route to exact threshold boundary', () => {
      const edge = createMultiThresholdEdge<QualityAwareState>({
        thresholds: [
          { min: 90, node: 'excellent' },
          { min: 70, node: 'good' },
        ],
        defaultNode: 'poor',
      });
      const state: QualityAwareState = {
        qualityScore: 70,
      };

      const result = edge(state);

      expect(result).toBe('good');
    });
  });
});
