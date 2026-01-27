/**
 * Test script for the optimized atom quality service
 * 
 * Usage:
 *   npx ts-node scripts/test-atom-quality.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AtomQualityService } from '../src/modules/validators/atom-quality.service';

async function testAtomQuality() {
  console.log('🧪 Testing Optimized Atom Quality Service\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const qualityService = app.get(AtomQualityService);

    // Test with a sample atom
    const testAtom = {
      atomId: 'IA-TEST-001',
      description: 'User can retrieve and return the complete, unfiltered list of atoms',
      category: 'functional',
    };

    console.log('='.repeat(60));
    console.log('TEST ATOM');
    console.log('='.repeat(60));
    console.log(`ID: ${testAtom.atomId}`);
    console.log(`Description: ${testAtom.description}`);
    console.log(`Category: ${testAtom.category}`);
    console.log('');

    console.log('📊 Evaluating all 5 quality dimensions in a single LLM call...\n');
    const startTime = Date.now();

    const result = await qualityService.validateAtom(testAtom);

    const duration = Date.now() - startTime;

    console.log('='.repeat(60));
    console.log('QUALITY VALIDATION RESULTS');
    console.log('='.repeat(60));
    console.log('');
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📈 Total Score: ${result.totalScore}/100`);
    console.log(`✅ Decision: ${result.decision.toUpperCase()}`);
    console.log('');
    console.log('Dimension Scores:');
    console.log('-'.repeat(60));
    
    Object.entries(result.dimensions).forEach(([key, dimension]) => {
      const percentage = ((dimension.score / dimension.maxScore) * 100).toFixed(1);
      console.log(`${dimension.name.padEnd(25)} ${dimension.score.toString().padStart(2)}/${dimension.maxScore} (${percentage}%)`);
      console.log(`  Feedback: ${dimension.feedback}`);
      if (dimension.suggestions.length > 0) {
        console.log(`  Suggestions:`);
        dimension.suggestions.forEach((suggestion) => {
          console.log(`    - ${suggestion}`);
        });
      }
      console.log('');
    });

    console.log('Overall Feedback:');
    console.log(`  ${result.overallFeedback}`);
    console.log('');

    if (result.actionableImprovements.length > 0) {
      console.log('Actionable Improvements:');
      result.actionableImprovements.forEach((improvement) => {
        console.log(`  - ${improvement}`);
      });
      console.log('');
    }

    console.log('='.repeat(60));
    console.log('✅ Test completed successfully!');
    console.log('='.repeat(60));
    console.log('');
    console.log('💡 Optimization: This used 1 LLM call instead of 5 separate calls');
    console.log(`   Expected improvement: ~5x faster, ~5x fewer API calls`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

testAtomQuality();
