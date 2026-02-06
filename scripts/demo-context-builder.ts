/**
 * Demonstration script showing ContextBuilderService in action
 * 
 * Usage:
 *   npx ts-node scripts/demo-context-builder.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ContextBuilderService } from '../src/modules/agents/context-builder.service';
import * as path from 'path';

async function demonstrateContextBuilder() {
  console.log('🔍 Demonstrating ContextBuilderService\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const contextBuilder = app.get(ContextBuilderService);

    // Analyze a specific test from the frontend
    const testFilePath = path.join(process.cwd(), 'frontend/__tests__/lib/api/atoms.test.ts');
    const testName = 'list > fetches atoms list without filters';
    const testLineNumber = 34;

    console.log('='.repeat(60));
    console.log('TEST ANALYSIS DEMONSTRATION');
    console.log('='.repeat(60));
    console.log('');
    console.log(`Test File: ${path.relative(process.cwd(), testFilePath)}`);
    console.log(`Test Name: ${testName}`);
    console.log(`Line Number: ${testLineNumber}`);
    console.log('');

    // Step 1: Analyze the test
    console.log('📊 Step 1: Analyzing test structure...\n');
    const testAnalysis = await contextBuilder.analyzeTest(
      testFilePath,
      testName,
      testLineNumber,
      process.cwd(),
    );

    console.log('Extracted Information:');
    console.log(`  Assertions: ${testAnalysis.assertions.length}`);
    testAnalysis.assertions.forEach((a, i) => {
      console.log(`    ${i + 1}. ${a}`);
    });
    console.log('');
    console.log(`  Imports: ${testAnalysis.imports.length}`);
    testAnalysis.imports.slice(0, 5).forEach((imp) => {
      console.log(`    - ${imp}`);
    });
    console.log('');
    console.log(`  Function Calls: ${testAnalysis.functionCalls.length}`);
    testAnalysis.functionCalls.slice(0, 5).forEach((call) => {
      console.log(`    - ${call}()`);
    });
    console.log('');
    console.log(`  Expected Behavior: ${testAnalysis.expectedBehavior}`);
    console.log('');
    console.log(`  Domain Concepts: ${testAnalysis.domainConcepts.join(', ') || 'none'}`);
    console.log(`  Technical Concepts: ${testAnalysis.technicalConcepts.join(', ') || 'none'}`);
    console.log('');
    console.log(`  Related Source Files: ${testAnalysis.relatedSourceFiles.length}`);
    testAnalysis.relatedSourceFiles.forEach((file) => {
      console.log(`    - ${path.relative(process.cwd(), file)}`);
    });
    console.log('');

    // Step 2: Build focused context
    console.log('📝 Step 2: Building focused context summary...\n');
    const focusedContext = contextBuilder.buildFocusedContext(testAnalysis);

    console.log('Focused Context (sent to LLM):');
    console.log('-'.repeat(60));
    console.log(focusedContext);
    console.log('-'.repeat(60));
    console.log('');
    console.log(`Context Size: ${focusedContext.length} characters`);
    console.log(`Estimated Tokens: ~${Math.ceil(focusedContext.length / 4)} tokens`);
    console.log('');
    console.log('💡 Comparison:');
    console.log('  Raw file dump would be: ~2000-5000 characters');
    console.log('  Focused context is: ~' + focusedContext.length + ' characters');
    console.log(`  Reduction: ~${Math.round((1 - focusedContext.length / 3000) * 100)}%`);
    console.log('');

    console.log('='.repeat(60));
    console.log('✅ ContextBuilderService demonstration complete!');
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('❌ Demonstration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

demonstrateContextBuilder();
