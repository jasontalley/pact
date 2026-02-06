#!/usr/bin/env npx ts-node

/**
 * LangSmith Trace Analyzer
 *
 * Analyzes a specific trace to understand execution flow, timing, and failures.
 *
 * Usage: npx ts-node scripts/analyze-langsmith-trace.ts <trace-id>
 */

import { Client, Run } from 'langsmith';
import * as dotenv from 'dotenv';

// Load environment variables from .env.development
dotenv.config({ path: '.env.development' });

interface RunSummary {
  id: string;
  name: string;
  runType: string;
  status: string;
  startTime: Date;
  endTime?: Date;
  latencyMs: number;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  parentId?: string;
  depth: number;
}

async function analyzeTrace(traceId: string): Promise<void> {
  const apiKey = process.env.LANGCHAIN_API_KEY;

  if (!apiKey) {
    console.error('ERROR: LANGCHAIN_API_KEY not found in .env.development');
    process.exit(1);
  }

  console.log('Connecting to LangSmith...');
  console.log(`API Key: ${apiKey.substring(0, 10)}...`);

  const client = new Client({ apiKey });

  console.log(`\nFetching trace: ${traceId}\n`);
  console.log('='.repeat(80));

  try {
    // Get the root run
    const rootRun = await client.readRun(traceId);

    console.log('\n📊 ROOT RUN SUMMARY');
    console.log('='.repeat(80));
    printRunInfo(rootRun, 0);

    // Get all child runs
    console.log('\n\n📋 EXECUTION TIMELINE');
    console.log('='.repeat(80));

    const allRuns: RunSummary[] = [];
    await collectRuns(client, traceId, allRuns, 0);

    // Sort by start time
    allRuns.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // Print timeline
    const startTime = allRuns[0]?.startTime.getTime() || 0;

    console.log('\nTime(s) | Duration | Status | Node');
    console.log('-'.repeat(80));

    for (const run of allRuns) {
      const relativeStart = ((run.startTime.getTime() - startTime) / 1000).toFixed(1);
      const duration = (run.latencyMs / 1000).toFixed(1);
      const status = run.status === 'success' ? '✅' : run.status === 'error' ? '❌' : '⏳';
      const indent = '  '.repeat(run.depth);

      console.log(`${relativeStart.padStart(7)}s | ${duration.padStart(6)}s | ${status} | ${indent}${run.name}`);

      if (run.error) {
        console.log(`        |        |    | ${indent}  └─ ERROR: ${run.error.substring(0, 60)}...`);
      }

      if (run.totalTokens && run.totalTokens > 0) {
        console.log(`        |        |    | ${indent}  └─ Tokens: ${run.totalTokens} (in: ${run.inputTokens}, out: ${run.outputTokens})`);
      }
    }

    // Analyze failures
    console.log('\n\n🚨 FAILURES ANALYSIS');
    console.log('='.repeat(80));

    const failures = allRuns.filter(r => r.status === 'error');

    if (failures.length === 0) {
      console.log('No failed runs found at the run level.');
    } else {
      console.log(`Found ${failures.length} failed runs:\n`);
      for (const failure of failures) {
        console.log(`❌ ${failure.name}`);
        console.log(`   Duration: ${(failure.latencyMs / 1000).toFixed(1)}s`);
        console.log(`   Error: ${failure.error || 'Unknown'}`);
        console.log();
      }
    }

    // Look for timeout patterns
    console.log('\n\n⏱️ TIMEOUT ANALYSIS');
    console.log('='.repeat(80));

    const longRunning = allRuns.filter(r => r.latencyMs > 30000);

    if (longRunning.length === 0) {
      console.log('No runs exceeded 30s timeout threshold.');
    } else {
      console.log(`Found ${longRunning.length} runs exceeding 30s:\n`);
      for (const run of longRunning) {
        console.log(`⏰ ${run.name}`);
        console.log(`   Duration: ${(run.latencyMs / 1000).toFixed(1)}s`);
        console.log(`   Status: ${run.status}`);
        console.log();
      }
    }

    // Token usage summary
    console.log('\n\n📈 TOKEN USAGE SUMMARY');
    console.log('='.repeat(80));

    const llmRuns = allRuns.filter(r => r.totalTokens && r.totalTokens > 0);
    const totalInputTokens = llmRuns.reduce((sum, r) => sum + (r.inputTokens || 0), 0);
    const totalOutputTokens = llmRuns.reduce((sum, r) => sum + (r.outputTokens || 0), 0);
    const totalTokens = llmRuns.reduce((sum, r) => sum + (r.totalTokens || 0), 0);

    console.log(`Total LLM calls: ${llmRuns.length}`);
    console.log(`Total input tokens: ${totalInputTokens.toLocaleString()}`);
    console.log(`Total output tokens: ${totalOutputTokens.toLocaleString()}`);
    console.log(`Total tokens: ${totalTokens.toLocaleString()}`);

    // Node-by-node breakdown
    console.log('\n\nBreakdown by node:');
    const byNode = new Map<string, { count: number; tokens: number; duration: number }>();

    for (const run of allRuns) {
      const existing = byNode.get(run.name) || { count: 0, tokens: 0, duration: 0 };
      existing.count++;
      existing.tokens += run.totalTokens || 0;
      existing.duration += run.latencyMs;
      byNode.set(run.name, existing);
    }

    console.log('\nNode                 | Count | Tokens    | Duration');
    console.log('-'.repeat(60));
    for (const [name, stats] of byNode) {
      console.log(`${name.padEnd(20)} | ${stats.count.toString().padStart(5)} | ${stats.tokens.toString().padStart(9)} | ${(stats.duration / 1000).toFixed(1)}s`);
    }

    // Circuit breaker analysis
    console.log('\n\n🔌 CIRCUIT BREAKER ANALYSIS');
    console.log('='.repeat(80));

    // Find any error messages mentioning circuit breaker
    const circuitBreakerErrors = allRuns.filter(r =>
      r.error?.toLowerCase().includes('breaker') ||
      r.error?.toLowerCase().includes('circuit')
    );

    if (circuitBreakerErrors.length > 0) {
      console.log(`Found ${circuitBreakerErrors.length} circuit breaker related errors:\n`);
      for (const run of circuitBreakerErrors) {
        console.log(`🔌 ${run.name}`);
        console.log(`   Time: ${((run.startTime.getTime() - startTime) / 1000).toFixed(1)}s from start`);
        console.log(`   Duration: ${(run.latencyMs / 1000).toFixed(1)}s`);
        console.log(`   Error: ${run.error}`);
        console.log();
      }
    } else {
      console.log('No explicit circuit breaker errors found in run metadata.');
      console.log('\nLooking for patterns that could trigger circuit breaker...');

      // Count failures in sliding window
      const window = 120000; // 2 minute window
      let maxFailuresInWindow = 0;

      for (let i = 0; i < failures.length; i++) {
        let count = 1;
        for (let j = i + 1; j < failures.length; j++) {
          if (failures[j].startTime.getTime() - failures[i].startTime.getTime() <= window) {
            count++;
          }
        }
        maxFailuresInWindow = Math.max(maxFailuresInWindow, count);
      }

      console.log(`Maximum failures in 2-minute window: ${maxFailuresInWindow}`);
      console.log(`Circuit breaker threshold: 5 failures`);

      if (maxFailuresInWindow >= 5) {
        console.log('\n⚠️  Failure count could have triggered circuit breaker!');
      }
    }

  } catch (error: any) {
    console.error('Error analyzing trace:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

function printRunInfo(run: Run, depth: number): void {
  const indent = '  '.repeat(depth);

  console.log(`${indent}ID: ${run.id}`);
  console.log(`${indent}Name: ${run.name}`);
  console.log(`${indent}Type: ${run.run_type}`);
  console.log(`${indent}Status: ${run.status}`);

  if (run.start_time) {
    console.log(`${indent}Start: ${new Date(run.start_time).toISOString()}`);
  }
  if (run.end_time) {
    console.log(`${indent}End: ${new Date(run.end_time).toISOString()}`);

    if (run.start_time) {
      const latency = new Date(run.end_time).getTime() - new Date(run.start_time).getTime();
      console.log(`${indent}Duration: ${(latency / 1000).toFixed(2)}s`);
    }
  }

  if (run.error) {
    console.log(`${indent}Error: ${run.error}`);
  }

  // Token usage
  if (run.total_tokens || run.prompt_tokens || run.completion_tokens) {
    console.log(`${indent}Tokens: ${run.total_tokens} (in: ${run.prompt_tokens}, out: ${run.completion_tokens})`);
  }

  // Feedback
  if (run.feedback_stats) {
    console.log(`${indent}Feedback: ${JSON.stringify(run.feedback_stats)}`);
  }
}

async function collectRuns(
  client: Client,
  runId: string,
  allRuns: RunSummary[],
  depth: number
): Promise<void> {
  try {
    const run = await client.readRun(runId);

    const startTime = run.start_time ? new Date(run.start_time) : new Date();
    const endTime = run.end_time ? new Date(run.end_time) : undefined;

    const summary: RunSummary = {
      id: run.id,
      name: run.name || 'unknown',
      runType: run.run_type,
      status: run.status || 'unknown',
      startTime,
      endTime,
      latencyMs: endTime
        ? endTime.getTime() - startTime.getTime()
        : 0,
      error: run.error || undefined,
      inputTokens: run.prompt_tokens || 0,
      outputTokens: run.completion_tokens || 0,
      totalTokens: run.total_tokens || 0,
      parentId: run.parent_run_id || undefined,
      depth,
    };

    allRuns.push(summary);

    // Get child runs
    const childRuns = await client.listRuns({
      projectName: process.env.LANGCHAIN_PROJECT || 'pact-agents',
      filter: `eq(parent_run_id, "${runId}")`,
    });

    for await (const childRun of childRuns) {
      await collectRuns(client, childRun.id, allRuns, depth + 1);
    }
  } catch (error: any) {
    console.error(`Error fetching run ${runId}:`, error.message);
  }
}

// Main execution
const traceId = process.argv[2];

if (!traceId) {
  console.log('Usage: npx ts-node scripts/analyze-langsmith-trace.ts <trace-id>');
  console.log('\nExample: npx ts-node scripts/analyze-langsmith-trace.ts 42cfd1dc-9f6e-4218-841b-1ef9d9c7015b');
  process.exit(1);
}

analyzeTrace(traceId).then(() => {
  console.log('\n\nAnalysis complete.');
}).catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
