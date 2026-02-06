/**
 * BOOTSTRAP SCAFFOLDING - DO NOT DEPEND ON THIS
 * Scaffold ID: BS-010
 * Type: Tooling
 * Purpose: Run agent evaluations against golden datasets
 * Exit Criterion: Pact has built-in evaluation infrastructure
 * Target Removal: Phase 2
 * Owner: @jasontalley
 */

import * as fs from 'fs';
import * as path from 'path';

interface EvaluationExample {
  id: string;
  input: string;
  expected: {
    isAtomic: boolean;
    category?: string;
    confidence_min?: number;
    reason?: string;
    suggestedDecomposition?: string[];
  };
  tags: string[];
}

interface EvaluationDataset {
  name: string;
  description: string;
  version: string;
  examples: EvaluationExample[];
}

interface EvaluationResult {
  exampleId: string;
  input: string;
  expected: any;
  actual: any;
  passed: boolean;
  metrics: {
    atomicityCorrect: boolean;
    categoryCorrect: boolean;
    confidenceAboveMin: boolean;
    latencyMs: number;
  };
  error?: string;
}

interface EvaluationReport {
  datasetName: string;
  datasetVersion: string;
  timestamp: string;
  totalExamples: number;
  passed: number;
  failed: number;
  metrics: {
    atomicityAccuracy: number;
    categoryAccuracy: number;
    avgLatencyMs: number;
    avgConfidence: number;
  };
  results: EvaluationResult[];
}

const API_BASE = process.env.API_URL || 'http://localhost:3000';

async function evaluateAtomicity(input: string): Promise<any> {
  const startTime = Date.now();

  const response = await fetch(`${API_BASE}/agents/atomization/atomize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intentDescription: input }),
  });

  const latencyMs = Date.now() - startTime;
  const data = await response.json();

  return { ...data, latencyMs };
}

function compareResults(expected: any, actual: any): {
  atomicityCorrect: boolean;
  categoryCorrect: boolean;
  confidenceAboveMin: boolean;
} {
  // Determine atomicity from response
  const actualIsAtomic = actual.success === true && actual.atom !== undefined;
  const atomicityCorrect = actualIsAtomic === expected.isAtomic;

  // Check category if atomic and expected
  let categoryCorrect = true;
  if (expected.isAtomic && expected.category && actual.atom?.category) {
    categoryCorrect = actual.atom.category === expected.category;
  }

  // Check confidence threshold
  const confidenceAboveMin =
    expected.confidence_min === undefined ||
    (actual.confidence || 0) >= expected.confidence_min;

  return { atomicityCorrect, categoryCorrect, confidenceAboveMin };
}

async function runEvaluation(datasetPath: string): Promise<EvaluationReport> {
  const datasetContent = fs.readFileSync(datasetPath, 'utf-8');
  const dataset: EvaluationDataset = JSON.parse(datasetContent);

  console.log(`\nRunning evaluation: ${dataset.name} v${dataset.version}`);
  console.log(`Total examples: ${dataset.examples.length}\n`);

  const results: EvaluationResult[] = [];
  let totalLatency = 0;
  let totalConfidence = 0;
  let atomicityCorrectCount = 0;
  let categoryCorrectCount = 0;

  for (const example of dataset.examples) {
    process.stdout.write(`  Testing: ${example.id}... `);

    try {
      const actual = await evaluateAtomicity(example.input);
      const metrics = compareResults(example.expected, actual);

      const passed = metrics.atomicityCorrect && metrics.categoryCorrect;

      results.push({
        exampleId: example.id,
        input: example.input,
        expected: example.expected,
        actual,
        passed,
        metrics: {
          ...metrics,
          latencyMs: actual.latencyMs,
        },
      });

      totalLatency += actual.latencyMs;
      totalConfidence += actual.confidence || 0;
      if (metrics.atomicityCorrect) atomicityCorrectCount++;
      if (metrics.categoryCorrect) categoryCorrectCount++;

      console.log(passed ? '✓ PASS' : '✗ FAIL');

      if (!passed) {
        console.log(`    Expected: isAtomic=${example.expected.isAtomic}, category=${example.expected.category}`);
        console.log(`    Actual: success=${actual.success}, confidence=${actual.confidence}`);
      }
    } catch (error: any) {
      console.log('✗ ERROR');
      results.push({
        exampleId: example.id,
        input: example.input,
        expected: example.expected,
        actual: null,
        passed: false,
        metrics: {
          atomicityCorrect: false,
          categoryCorrect: false,
          confidenceAboveMin: false,
          latencyMs: 0,
        },
        error: error.message,
      });
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;

  return {
    datasetName: dataset.name,
    datasetVersion: dataset.version,
    timestamp: new Date().toISOString(),
    totalExamples: results.length,
    passed,
    failed,
    metrics: {
      atomicityAccuracy: atomicityCorrectCount / results.length,
      categoryAccuracy: categoryCorrectCount / results.length,
      avgLatencyMs: totalLatency / results.length,
      avgConfidence: totalConfidence / results.length,
    },
    results,
  };
}

function printReport(report: EvaluationReport): void {
  console.log('\n' + '='.repeat(60));
  console.log('EVALUATION REPORT');
  console.log('='.repeat(60));
  console.log(`Dataset: ${report.datasetName} v${report.datasetVersion}`);
  console.log(`Timestamp: ${report.timestamp}`);
  console.log('');
  console.log('SUMMARY:');
  console.log(`  Total: ${report.totalExamples}`);
  console.log(`  Passed: ${report.passed} (${(report.passed / report.totalExamples * 100).toFixed(1)}%)`);
  console.log(`  Failed: ${report.failed} (${(report.failed / report.totalExamples * 100).toFixed(1)}%)`);
  console.log('');
  console.log('METRICS:');
  console.log(`  Atomicity Accuracy: ${(report.metrics.atomicityAccuracy * 100).toFixed(1)}%`);
  console.log(`  Category Accuracy:  ${(report.metrics.categoryAccuracy * 100).toFixed(1)}%`);
  console.log(`  Avg Latency:        ${report.metrics.avgLatencyMs.toFixed(0)}ms`);
  console.log(`  Avg Confidence:     ${(report.metrics.avgConfidence * 100).toFixed(1)}%`);
  console.log('='.repeat(60));

  if (report.failed > 0) {
    console.log('\nFAILED EXAMPLES:');
    for (const result of report.results.filter(r => !r.passed)) {
      console.log(`\n  ${result.exampleId}:`);
      console.log(`    Input: "${result.input}"`);
      console.log(`    Expected: isAtomic=${result.expected.isAtomic}`);
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      } else {
        console.log(`    Actual: success=${result.actual?.success}, confidence=${result.actual?.confidence}`);
      }
    }
  }
}

async function main() {
  const datasetPath = process.argv[2] || path.join(__dirname, 'atomicity-dataset.json');

  if (!fs.existsSync(datasetPath)) {
    console.error(`Dataset not found: ${datasetPath}`);
    process.exit(1);
  }

  try {
    const report = await runEvaluation(datasetPath);
    printReport(report);

    // Save report to file
    const reportPath = path.join(__dirname, `evaluation-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport saved to: ${reportPath}`);

    // Exit with error code if any tests failed
    process.exit(report.failed > 0 ? 1 : 0);
  } catch (error: any) {
    console.error('Evaluation failed:', error.message);
    process.exit(1);
  }
}

main();
