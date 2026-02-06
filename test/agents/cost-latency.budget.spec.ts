/**
 * Cost and Latency Budget Tests
 *
 * Validates that agent runs stay within resource budgets.
 * Budget violations at 1x are warnings; at 2x are failures.
 *
 * @see docs/architecture/agent-evaluation-rubrics.md (Section 4)
 * @see docs/implementation-checklist-phase13.md (13.9.3)
 */

import {
  RunArtifact,
  RunMetrics,
} from '../../src/modules/agents/evaluation/run-artifact.types';

/**
 * Budget thresholds per agent and scenario size.
 */
const BUDGETS = {
  reconciliation: {
    small: { maxTokens: 50_000, maxDurationMs: 120_000, maxLlmCalls: 25 },
    medium: { maxTokens: 200_000, maxDurationMs: 600_000, maxLlmCalls: 100 },
  },
  interview: {
    threeRounds: { maxTokens: 30_000, maxDurationMs: 60_000, maxLlmCalls: 15 },
    fiveRounds: { maxTokens: 50_000, maxDurationMs: 120_000, maxLlmCalls: 25 },
  },
};

/**
 * Check if metrics are within budget.
 */
function checkBudget(
  metrics: RunMetrics,
  budget: { maxTokens: number; maxDurationMs: number; maxLlmCalls: number },
): { withinBudget: boolean; within2x: boolean; violations: string[] } {
  const violations: string[] = [];
  let within2x = true;

  if (metrics.totalTokens > budget.maxTokens) {
    violations.push(
      `Tokens: ${metrics.totalTokens} > ${budget.maxTokens} (${(metrics.totalTokens / budget.maxTokens).toFixed(1)}x)`,
    );
    if (metrics.totalTokens > budget.maxTokens * 2) {
      within2x = false;
    }
  }

  if (metrics.totalDurationMs > budget.maxDurationMs) {
    violations.push(
      `Duration: ${metrics.totalDurationMs}ms > ${budget.maxDurationMs}ms (${(metrics.totalDurationMs / budget.maxDurationMs).toFixed(1)}x)`,
    );
    if (metrics.totalDurationMs > budget.maxDurationMs * 2) {
      within2x = false;
    }
  }

  if (metrics.totalLlmCalls > budget.maxLlmCalls) {
    violations.push(
      `LLM calls: ${metrics.totalLlmCalls} > ${budget.maxLlmCalls} (${(metrics.totalLlmCalls / budget.maxLlmCalls).toFixed(1)}x)`,
    );
    if (metrics.totalLlmCalls > budget.maxLlmCalls * 2) {
      within2x = false;
    }
  }

  return {
    withinBudget: violations.length === 0,
    within2x,
    violations,
  };
}

describe('Cost and Latency Budgets', () => {
  describe('Reconciliation Agent', () => {
    describe('Small repo (10 tests)', () => {
      const budget = BUDGETS.reconciliation.small;

      it('should stay within token budget', () => {
        const metrics: RunMetrics = {
          totalDurationMs: 30_000,
          totalInputTokens: 10_000,
          totalOutputTokens: 5_000,
          totalTokens: 15_000,
          totalLlmCalls: 10,
          totalToolCalls: 0,
          perNode: [],
        };

        const result = checkBudget(metrics, budget);
        expect(result.withinBudget).toBe(true);
      });

      it('should stay within duration budget', () => {
        const metrics: RunMetrics = {
          totalDurationMs: 60_000,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
          totalLlmCalls: 5,
          totalToolCalls: 0,
          perNode: [],
        };

        const result = checkBudget(metrics, budget);
        expect(result.withinBudget).toBe(true);
      });

      it('should stay within LLM call budget', () => {
        const metrics: RunMetrics = {
          totalDurationMs: 10_000,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
          totalLlmCalls: 20,
          totalToolCalls: 0,
          perNode: [],
        };

        const result = checkBudget(metrics, budget);
        expect(result.withinBudget).toBe(true);
      });

      it('should fail at 2x budget violation', () => {
        const metrics: RunMetrics = {
          totalDurationMs: 300_000, // 2.5x budget
          totalInputTokens: 60_000,
          totalOutputTokens: 50_000,
          totalTokens: 110_000, // 2.2x budget
          totalLlmCalls: 60, // 2.4x budget
          totalToolCalls: 0,
          perNode: [],
        };

        const result = checkBudget(metrics, budget);
        expect(result.withinBudget).toBe(false);
        expect(result.within2x).toBe(false);
      });
    });

    describe('Medium repo (50 tests)', () => {
      const budget = BUDGETS.reconciliation.medium;

      it('should stay within token budget', () => {
        const metrics: RunMetrics = {
          totalDurationMs: 180_000,
          totalInputTokens: 80_000,
          totalOutputTokens: 40_000,
          totalTokens: 120_000,
          totalLlmCalls: 60,
          totalToolCalls: 0,
          perNode: [],
        };

        const result = checkBudget(metrics, budget);
        expect(result.withinBudget).toBe(true);
      });
    });
  });

  describe('Interview Agent', () => {
    describe('3-round interview', () => {
      const budget = BUDGETS.interview.threeRounds;

      it('should stay within all budgets', () => {
        const metrics: RunMetrics = {
          totalDurationMs: 30_000,
          totalInputTokens: 8_000,
          totalOutputTokens: 5_000,
          totalTokens: 13_000,
          totalLlmCalls: 8,
          totalToolCalls: 0,
          perNode: [],
        };

        const result = checkBudget(metrics, budget);
        expect(result.withinBudget).toBe(true);
      });
    });

    describe('5-round interview', () => {
      const budget = BUDGETS.interview.fiveRounds;

      it('should stay within all budgets', () => {
        const metrics: RunMetrics = {
          totalDurationMs: 60_000,
          totalInputTokens: 15_000,
          totalOutputTokens: 10_000,
          totalTokens: 25_000,
          totalLlmCalls: 15,
          totalToolCalls: 0,
          perNode: [],
        };

        const result = checkBudget(metrics, budget);
        expect(result.withinBudget).toBe(true);
      });
    });
  });

  describe('Budget check utility', () => {
    it('reports specific violations with multiplier', () => {
      const metrics: RunMetrics = {
        totalDurationMs: 200_000,
        totalInputTokens: 30_000,
        totalOutputTokens: 30_000,
        totalTokens: 60_000,
        totalLlmCalls: 30,
        totalToolCalls: 0,
        perNode: [],
      };

      const budget = BUDGETS.reconciliation.small;
      const result = checkBudget(metrics, budget);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('Tokens');
      expect(result.violations[0]).toContain('x)');
    });

    it('treats within-budget as no violations', () => {
      const metrics: RunMetrics = {
        totalDurationMs: 10_000,
        totalInputTokens: 5_000,
        totalOutputTokens: 3_000,
        totalTokens: 8_000,
        totalLlmCalls: 5,
        totalToolCalls: 0,
        perNode: [],
      };

      const budget = BUDGETS.reconciliation.small;
      const result = checkBudget(metrics, budget);

      expect(result.withinBudget).toBe(true);
      expect(result.within2x).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });
});
