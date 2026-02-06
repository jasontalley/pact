#!/usr/bin/env ts-node
/**
 * Agent Evaluation CLI
 *
 * Single entry point for running all evaluation suites:
 * - Golden suite: fixed scenarios → expected outputs
 * - Property suite: invariants that must hold on every run
 * - Adversarial suite: trap prompts, partial states, malformed inputs
 * - Cost suite: token and wall-clock budgets per run
 *
 * Usage:
 *   npx ts-node scripts/evaluate-agents.ts --suite=golden --agent=reconciliation
 *   npx ts-node scripts/evaluate-agents.ts --suite=stochastic --agent=interview
 *   npx ts-node scripts/evaluate-agents.ts --suite=property --agent=interview
 *   npx ts-node scripts/evaluate-agents.ts --suite=cost --agent=reconciliation
 *   npx ts-node scripts/evaluate-agents.ts --suite=golden --agent=reconciliation --update-snapshots
 *
 * @see docs/implementation-checklist-phase13.md (13.2.3)
 */

import * as path from 'path';
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { INestApplicationContext } from '@nestjs/common';
import { EvaluationReport, AgentType } from '../src/modules/agents/evaluation/run-artifact.types';
import { ArtifactCaptureService } from '../src/modules/agents/evaluation/artifact-capture.service';
import { LLMService } from '../src/common/llm/llm.service';
import { ToolRegistryService } from '../src/modules/agents/tools/tool-registry.service';

// Cached app instance for reuse across suites
let appInstance: INestApplicationContext | null = null;

/**
 * Bootstrap the NestJS application and get the ArtifactCaptureService.
 */
async function getAppAndCaptureService(): Promise<{
  app: INestApplicationContext;
  captureService: ArtifactCaptureService;
}> {
  if (!appInstance) {
    // Dynamic import to avoid loading NestJS modules when just parsing args
    const { AppModule } = await import('../src/app.module');
    appInstance = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'], // Suppress verbose logs during evaluation
    });
  }

  const captureService = appInstance.get(ArtifactCaptureService);
  return { app: appInstance, captureService };
}

/**
 * Cleanup the NestJS application.
 */
async function cleanupApp(): Promise<void> {
  if (appInstance) {
    await appInstance.close();
    appInstance = null;
  }
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliArgs {
  suite: 'golden' | 'stochastic' | 'property' | 'adversarial' | 'cost' | 'all';
  agent: AgentType | 'all';
  updateSnapshots: boolean;
  model?: string;
  temperature?: number;
  fixtureIds?: string[];
  outputDir: string;
  verbose: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: CliArgs = {
    suite: 'golden',
    agent: 'all',
    updateSnapshots: false,
    outputDir: path.resolve(__dirname, '../test-results/agents'),
    verbose: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--suite=')) {
      parsed.suite = arg.split('=')[1] as CliArgs['suite'];
    } else if (arg.startsWith('--agent=')) {
      parsed.agent = arg.split('=')[1] as CliArgs['agent'];
    } else if (arg === '--update-snapshots') {
      parsed.updateSnapshots = true;
    } else if (arg.startsWith('--model=')) {
      parsed.model = arg.split('=')[1];
    } else if (arg.startsWith('--temperature=')) {
      parsed.temperature = parseFloat(arg.split('=')[1]);
    } else if (arg.startsWith('--fixtures=')) {
      parsed.fixtureIds = arg.split('=')[1].split(',');
    } else if (arg.startsWith('--output=')) {
      parsed.outputDir = path.resolve(arg.split('=')[1]);
    } else if (arg === '--verbose' || arg === '-v') {
      parsed.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  return parsed;
}

function printUsage(): void {
  console.log(`
Agent Evaluation CLI

Usage:
  npx ts-node scripts/evaluate-agents.ts [options]

Options:
  --suite=<suite>       Suite to run: golden, stochastic, property, adversarial, cost, all (default: golden)
  --agent=<agent>       Agent to evaluate: reconciliation, interview, all (default: all)
  --update-snapshots    Update baseline snapshots instead of comparing
  --model=<model>       Pinned model for LLM-in-the-loop tests
  --temperature=<temp>  Temperature override (default: 0 for deterministic)
  --fixtures=<ids>      Comma-separated fixture/scenario IDs to run
  --output=<dir>        Output directory (default: test-results/agents/)
  --verbose, -v         Verbose output
  --help, -h            Show this help

Examples:
  # Run all golden tests for reconciliation
  npx ts-node scripts/evaluate-agents.ts --suite=golden --agent=reconciliation

  # Run specific fixtures
  npx ts-node scripts/evaluate-agents.ts --suite=golden --agent=reconciliation --fixtures=rec-001,rec-003

  # Update snapshots after intentional changes
  npx ts-node scripts/evaluate-agents.ts --suite=golden --update-snapshots

  # Run property tests for all agents
  npx ts-node scripts/evaluate-agents.ts --suite=property

  # Run stochastic (LLM interviewee) tests for interview agent
  npx ts-node scripts/evaluate-agents.ts --suite=stochastic --agent=interview

  # Run cost/latency budget checks
  npx ts-node scripts/evaluate-agents.ts --suite=cost --agent=interview
`);
}

// ============================================================================
// Suite Runners
// ============================================================================

async function runGoldenSuite(args: CliArgs): Promise<EvaluationReport[]> {
  const reports: EvaluationReport[] = [];

  if (args.agent === 'reconciliation' || args.agent === 'all') {
    console.log('\n--- Reconciliation Golden Suite ---');
    const report = await runReconciliationGoldenSuite(args);
    reports.push(report);
    printReportSummary(report);
  }

  if (args.agent === 'interview' || args.agent === 'all') {
    console.log('\n--- Interview Golden Suite ---');
    const report = await runInterviewGoldenSuite(args);
    reports.push(report);
    printReportSummary(report);
  }

  return reports;
}

async function runReconciliationGoldenSuite(args: CliArgs): Promise<EvaluationReport> {
  const { runReconciliationGolden } = await import(
    '../src/modules/agents/evaluation/reconciliation-golden.runner'
  );

  // Get the capture service from the bootstrapped NestJS app
  const { captureService } = await getAppAndCaptureService();
  const fixturesDir = path.resolve(__dirname, '../test/fixtures/agents/reconciliation/fixtures');
  const snapshotDir = path.resolve(args.outputDir, 'snapshots/reconciliation');

  return runReconciliationGolden(captureService, {
    fixturesDir,
    fixtureIds: args.fixtureIds,
    updateSnapshots: args.updateSnapshots,
    snapshotDir,
    model: args.model,
    temperature: args.temperature,
  });
}

async function runInterviewGoldenSuite(args: CliArgs): Promise<EvaluationReport> {
  const { runInterviewGolden } = await import(
    '../src/modules/agents/evaluation/intent-interview-golden.runner'
  );

  // Get the capture service from the bootstrapped NestJS app
  const { captureService } = await getAppAndCaptureService();
  const scenariosDir = path.resolve(
    __dirname,
    '../test/fixtures/agents/intent-interview/scenarios',
  );
  const snapshotDir = path.resolve(args.outputDir, 'snapshots/interview');

  return runInterviewGolden(captureService, {
    scenariosDir,
    scenarioIds: args.fixtureIds,
    updateSnapshots: args.updateSnapshots,
    snapshotDir,
    model: args.model,
    temperature: args.temperature,
  });
}

async function runStochasticSuite(args: CliArgs): Promise<EvaluationReport[]> {
  const reports: EvaluationReport[] = [];

  if (args.agent === 'interview' || args.agent === 'all') {
    console.log('\n--- Interview Stochastic Suite ---');
    const report = await runInterviewStochasticSuite(args);
    reports.push(report);
    printReportSummary(report);
  }

  if (args.agent !== 'interview' && args.agent !== 'all') {
    console.log(`\nStochastic suite not available for agent: ${args.agent}`);
  }

  return reports;
}

async function runInterviewStochasticSuite(args: CliArgs): Promise<EvaluationReport> {
  const { runInterviewStochastic } = await import(
    '../src/modules/agents/evaluation/intent-interview-stochastic.runner'
  );

  // Get LLMService and ToolRegistryService from the NestJS app
  const { app } = await getAppAndCaptureService();
  const llmService = app.get(LLMService);
  const toolRegistry = app.get(ToolRegistryService);

  const scenariosDir = path.resolve(
    __dirname,
    '../test/fixtures/agents/intent-interview/stochastic-scenarios',
  );

  return runInterviewStochastic(llmService, toolRegistry, {
    scenariosDir,
    scenarioIds: args.fixtureIds,
    model: args.model,
    temperature: args.temperature,
  });
}

async function runPropertySuite(args: CliArgs): Promise<EvaluationReport[]> {
  console.log('\n--- Property Suite ---');
  console.log('Property tests run via Jest: npm run test:agents:property');
  console.log('See: test/agents/reconciliation/properties.spec.ts');
  console.log('See: test/agents/intent-interview/properties.spec.ts');
  return [];
}

async function runCostSuite(args: CliArgs): Promise<EvaluationReport[]> {
  console.log('\n--- Cost/Latency Budget Suite ---');
  console.log('Cost budget tests run via Jest: npm run test:agents:cost');
  console.log('See: test/agents/cost-latency.budget.spec.ts');
  return [];
}

// ============================================================================
// Output Formatting
// ============================================================================

function printReportSummary(report: EvaluationReport): void {
  const statusIcon = report.failedCases === 0 ? 'PASS' : 'FAIL';
  console.log(`\n  ${statusIcon}: ${report.agent} ${report.suite} suite`);
  console.log(`  Total: ${report.totalCases} | Passed: ${report.passedCases} | Failed: ${report.failedCases} | Skipped: ${report.skippedCases}`);

  if (report.aggregateMetrics) {
    console.log(`  Avg duration: ${Math.round(report.aggregateMetrics.avgDurationMs)}ms | Avg tokens: ${Math.round(report.aggregateMetrics.avgTokens)}`);
  }

  // Print failures
  for (const c of report.cases) {
    if (c.result === 'fail') {
      console.log(`\n  FAIL: ${c.caseId} — ${c.name}`);
      console.log(`    Reason: ${c.reason}`);
      if (c.failures) {
        for (const f of c.failures) {
          console.log(`    [${f.tag}${f.isCritical ? ' CRITICAL' : ''}] ${f.reason}`);
        }
      }
    }
  }
}

function saveReports(reports: EvaluationReport[], outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(outputDir, `evaluation-${timestamp}.json`);

  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        reports,
        summary: {
          totalSuites: reports.length,
          totalCases: reports.reduce((s, r) => s + r.totalCases, 0),
          totalPassed: reports.reduce((s, r) => s + r.passedCases, 0),
          totalFailed: reports.reduce((s, r) => s + r.failedCases, 0),
        },
      },
      null,
      2,
    ),
  );

  console.log(`\nReport saved to: ${reportPath}`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('=== Pact Agent Evaluation ===');
  console.log(`Suite: ${args.suite} | Agent: ${args.agent}`);
  if (args.updateSnapshots) {
    console.log('Mode: Updating snapshots');
  }

  let reports: EvaluationReport[] = [];

  try {
    switch (args.suite) {
      case 'golden':
        reports = await runGoldenSuite(args);
        break;
      case 'stochastic':
        reports = await runStochasticSuite(args);
        break;
      case 'property':
        reports = await runPropertySuite(args);
        break;
      case 'cost':
        reports = await runCostSuite(args);
        break;
      case 'adversarial':
        console.log('Adversarial suite not yet implemented');
        break;
      case 'all':
        reports = [
          ...(await runGoldenSuite(args)),
          ...(await runStochasticSuite(args)),
          ...(await runPropertySuite(args)),
          ...(await runCostSuite(args)),
        ];
        break;
    }

    // Save reports
    if (reports.length > 0) {
      saveReports(reports, args.outputDir);
    }

    // Exit with failure code if any tests failed
    const totalFailed = reports.reduce((s, r) => s + r.failedCases, 0);
    if (totalFailed > 0) {
      console.log(`\n${totalFailed} case(s) failed.`);
      process.exit(1);
    } else if (reports.length > 0) {
      console.log('\nAll cases passed.');
    }
  } catch (error) {
    console.error(`\nEvaluation error: ${error.message}`);
    await cleanupApp();
    process.exit(1);
  }

  // Cleanup NestJS app
  await cleanupApp();
}

main();
