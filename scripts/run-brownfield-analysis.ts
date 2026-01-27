/**
 * Script to run brownfield analysis agent against the pact repository
 * 
 * Usage:
 *   npx ts-node scripts/run-brownfield-analysis.ts
 *   npx ts-node scripts/run-brownfield-analysis.ts --auto-create
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BrownfieldAnalysisService } from '../src/modules/agents/brownfield-analysis.service';
import { BrownfieldAnalysisDto } from '../src/modules/agents/dto/brownfield-analysis.dto';
import * as path from 'path';

async function runBrownfieldAnalysis() {
  console.log('🚀 Starting Brownfield Analysis of Pact Repository...\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const autoCreate = args.includes('--auto-create');
  const rootDir = args.find((arg) => arg.startsWith('--dir='))?.split('=')[1];
  const maxTests = args.find((arg) => arg.startsWith('--max-tests='))?.split('=')[1];
  const validateQuality = args.includes('--validate-quality');

  // Create NestJS application context
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const brownfieldService = app.get(BrownfieldAnalysisService);

    const dto: BrownfieldAnalysisDto = {
      rootDirectory: rootDir || process.cwd(),
      analyzeDocumentation: true,
      autoCreateAtoms: autoCreate,
      maxTests: maxTests ? parseInt(maxTests, 10) : 10, // Default to 10 for demo
      useCache: false, // Disable cache for development to see new LLM calls
      validateQuality: validateQuality, // Enable with --validate-quality flag (now only 1 LLM call per atom instead of 5)
      createdBy: 'brownfield-analysis-script',
    };

    console.log('Configuration:');
    console.log(`  Root Directory: ${dto.rootDirectory}`);
    console.log(`  Analyze Documentation: ${dto.analyzeDocumentation}`);
    console.log(`  Auto Create Atoms: ${dto.autoCreateAtoms}`);
    console.log(`  Max Tests: ${dto.maxTests || 'unlimited'}`);
    console.log(`  Use Cache: ${dto.useCache !== false}`);
    console.log(`  Validate Quality: ${dto.validateQuality !== false}`);
    console.log('');

    const startTime = Date.now();
    const result = await brownfieldService.analyzeRepository(dto);
    const duration = Date.now() - startTime;

    console.log('='.repeat(60));
    console.log('BROWNFIELD ANALYSIS RESULTS');
    console.log('='.repeat(60));
    console.log('');
    console.log(`✅ Analysis completed in ${(duration / 1000).toFixed(2)}s`);
    console.log('');
    console.log('Summary:');
    console.log(`  Test Files Analyzed: ${result.metadata.testFilesAnalyzed}`);
    console.log(`  Documentation Files: ${result.metadata.documentationFilesAnalyzed}`);
    console.log(`  Orphan Tests Found: ${result.totalOrphanTests}`);
    console.log(`  Atoms Inferred: ${result.inferredAtomsCount}`);
    console.log(`  Atoms Stored: ${result.createdAtomsCount}`);
    console.log(`  Unanalyzed Tests: ${result.unanalyzedTests.length}`);
    console.log('');

    if (result.inferredAtoms.length > 0) {
      console.log('Top Recommendations (by confidence):');
      console.log('-'.repeat(60));
      result.inferredAtoms
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 10)
        .forEach((atom, index) => {
          console.log(`${index + 1}. [${atom.category}] ${atom.description}`);
          console.log(`   Confidence: ${(atom.confidence * 100).toFixed(1)}%`);
          console.log(`   Source: ${path.relative(process.cwd(), atom.sourceTest.filePath)}:${atom.sourceTest.lineNumber}`);
          console.log(`   Test: ${atom.sourceTest.testName}`);
          console.log('');
        });
    }

    if (result.unanalyzedTests.length > 0) {
      console.log('Unanalyzed Tests:');
      console.log('-'.repeat(60));
      result.unanalyzedTests.slice(0, 10).forEach((test, index) => {
        console.log(`${index + 1}. ${path.relative(process.cwd(), test.filePath)}:${test.lineNumber}`);
        console.log(`   ${test.testName}`);
        console.log('');
      });
      if (result.unanalyzedTests.length > 10) {
        console.log(`   ... and ${result.unanalyzedTests.length - 10} more`);
      }
    }

    // Save report to file
    const reportPath = path.join(process.cwd(), 'test-results/analysis', `brownfield-${Date.now()}.json`);
    const reportDir = path.dirname(reportPath);
    if (!require('fs').existsSync(reportDir)) {
      require('fs').mkdirSync(reportDir, { recursive: true });
    }
    require('fs').writeFileSync(
      reportPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          duration: duration,
          metadata: result.metadata,
          summary: {
            totalOrphanTests: result.totalOrphanTests,
            inferredAtomsCount: result.inferredAtomsCount,
            createdAtomsCount: result.createdAtomsCount,
            unanalyzedTestsCount: result.unanalyzedTests.length,
          },
          inferredAtoms: result.inferredAtoms.map((atom) => ({
            description: atom.description,
            category: atom.category,
            confidence: atom.confidence,
            sourceTest: {
              filePath: path.relative(process.cwd(), atom.sourceTest.filePath),
              lineNumber: atom.sourceTest.lineNumber,
              testName: atom.sourceTest.testName,
            },
          })),
          unanalyzedTests: result.unanalyzedTests.map((test) => ({
            filePath: path.relative(process.cwd(), test.filePath),
            lineNumber: test.lineNumber,
            testName: test.testName,
          })),
        },
        null,
        2
      )
    );
    console.log(`\nReport saved: ${reportPath}`);

    console.log('='.repeat(60));
    console.log('');
    console.log('Next Steps:');
    if (dto.autoCreateAtoms) {
      console.log('  ✓ Atoms have been auto-created and are ready for review');
    } else {
      console.log('  • Review recommendations stored as draft atoms:');
      console.log('    SELECT * FROM atoms WHERE metadata->>\'pendingReview\' = \'true\';');
      console.log('  • Accept or reject recommendations via the API');
    }
    console.log('  • View traces in LangSmith Studio (if LANGCHAIN_TRACING_V2=true)');
    console.log('  • Check agent_actions table for full audit trail');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runBrownfieldAnalysis();
