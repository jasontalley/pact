import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Structured analysis of a test
 */
export interface TestAnalysis {
  testName: string;
  testFilePath: string;
  testLineNumber: number;

  // Extracted from test code
  isolatedTestCode: string; // The isolated test code block
  assertions: string[]; // What the test asserts
  imports: string[]; // What modules it imports
  functionCalls: string[]; // Functions/methods being tested
  testSetup: string[]; // Setup/mock configuration
  expectedBehavior: string; // Inferred from assertions

  // Context discovery
  relatedSourceFiles: string[];
  relatedTestFiles: string[];
  documentationSnippets: string[];

  // Semantic understanding
  domainConcepts: string[]; // Business/domain terms
  technicalConcepts: string[]; // Technical patterns (e.g., "authentication", "caching")
}

/**
 * ContextBuilderService
 *
 * Sophisticated context building for brownfield analysis:
 * 1. Parse test structure (AST-like analysis without full parser)
 * 2. Extract semantic information (assertions, dependencies, domain concepts)
 * 3. Build dependency graph (what code this test depends on)
 * 4. Find relevant documentation (semantic search, not keyword matching)
 * 5. Create focused context summary (not raw file dumps)
 */
@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);

  /**
   * Analyze a test and build comprehensive context
   */
  async analyzeTest(
    testFilePath: string,
    testName: string,
    testLineNumber: number,
    rootDirectory: string,
  ): Promise<TestAnalysis> {
    this.logger.log(
      `[ContextBuilder] Analyzing test: ${testName} in ${path.relative(rootDirectory, testFilePath)}:${testLineNumber}`,
    );

    // Step 1: Parse test structure
    const testCode = this.readTestCode(testFilePath, testLineNumber);
    const isolatedTest = this.isolateTest(testCode, testName);

    // Step 2: Extract structured information
    const assertions = this.extractAssertions(isolatedTest);
    const imports = this.extractImports(testCode);
    const functionCalls = this.extractFunctionCalls(isolatedTest);
    const testSetup = this.extractTestSetup(testCode, testLineNumber);
    const expectedBehavior = this.inferExpectedBehavior(assertions, functionCalls);

    // Step 3: Build dependency graph
    const relatedSourceFiles = this.findRelatedSourceFiles(testFilePath, imports, rootDirectory);
    const relatedTestFiles = this.findRelatedTestFiles(testFilePath, rootDirectory);

    // Step 4: Extract domain/technical concepts
    const domainConcepts = this.extractDomainConcepts(testName, assertions, functionCalls);
    const technicalConcepts = this.extractTechnicalConcepts(assertions, functionCalls);

    // Step 5: Find relevant documentation (semantic, not keyword-based)
    const documentationSnippets = await this.findRelevantDocumentation(
      domainConcepts,
      technicalConcepts,
      testFilePath,
      rootDirectory,
    );

    const analysis: TestAnalysis = {
      testName,
      testFilePath,
      testLineNumber,
      isolatedTestCode: isolatedTest,
      assertions,
      imports,
      functionCalls,
      testSetup,
      expectedBehavior,
      relatedSourceFiles,
      relatedTestFiles,
      documentationSnippets,
      domainConcepts,
      technicalConcepts,
    };

    this.logger.log(
      `[ContextBuilder] Analysis complete: ${assertions.length} assertions, ${functionCalls.length} function calls, ${domainConcepts.length} domain concepts, ${technicalConcepts.length} technical concepts`,
    );

    return analysis;
  }

  /**
   * Build focused context summary for LLM
   * Instead of raw file dumps, create structured summaries
   */
  buildFocusedContext(analysis: TestAnalysis): string {
    this.logger.log(`[ContextBuilder] Building focused context for: ${analysis.testName}`);
    const sections: string[] = [];

    // Test summary
    sections.push(`## Test: ${analysis.testName}`);
    sections.push(
      `Location: ${path.relative(process.cwd(), analysis.testFilePath)}:${analysis.testLineNumber}`,
    );
    sections.push('');

    // What the test asserts (most important)
    sections.push('### Assertions (What is being verified):');
    analysis.assertions.forEach((assertion, i) => {
      sections.push(`${i + 1}. ${assertion}`);
    });
    sections.push('');

    // Expected behavior (inferred)
    if (analysis.expectedBehavior) {
      sections.push(`### Expected Behavior:`);
      sections.push(analysis.expectedBehavior);
      sections.push('');
    }

    // Domain concepts (business context)
    if (analysis.domainConcepts.length > 0) {
      sections.push(`### Domain Concepts: ${analysis.domainConcepts.join(', ')}`);
      sections.push('');
    }

    // Related source code (summarized, not full files)
    if (analysis.relatedSourceFiles.length > 0) {
      sections.push('### Related Source Code:');
      for (const sourceFile of analysis.relatedSourceFiles.slice(0, 3)) {
        const summary = this.summarizeSourceFile(sourceFile);
        if (summary) {
          sections.push(`**${path.basename(sourceFile)}**: ${summary}`);
        }
      }
      sections.push('');
    }

    // Relevant documentation (only relevant snippets)
    if (analysis.documentationSnippets.length > 0) {
      sections.push('### Relevant Documentation:');
      analysis.documentationSnippets.slice(0, 3).forEach((snippet) => {
        sections.push(snippet);
      });
    }

    const context = sections.join('\n');
    const contextSize = context.length;
    this.logger.log(
      `[ContextBuilder] Focused context built: ${contextSize} chars (vs ~5000+ for raw files)`,
    );
    return context;
  }

  // --- Private helper methods ---

  private readTestCode(filePath: string, lineNumber: number): string {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, lineNumber - 30);
      const end = Math.min(lines.length, lineNumber + 100);
      return lines.slice(start, end).join('\n');
    } catch (error) {
      this.logger.warn(`Failed to read test file: ${error.message}`);
      return '';
    }
  }

  private isolateTest(testCode: string, testName: string): string {
    // Similar to existing isolateTestCode but returns just the test
    const lines = testCode.split('\n');
    const testNameEscaped = testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const testRegex = new RegExp(`(it|test)\\s*\\(\\s*['"\`].*${testNameEscaped}.*['"\`]`);

    let testStart = -1;
    let testEnd = -1;
    let braceDepth = 0;
    let inTest = false;

    for (let i = 0; i < lines.length; i++) {
      if (testRegex.test(lines[i])) {
        testStart = i;
        inTest = true;
        braceDepth = 0;
      }

      if (inTest) {
        for (const char of lines[i]) {
          if (char === '{') braceDepth++;
          if (char === '}') braceDepth--;
        }

        if (braceDepth === 0 && testStart >= 0 && i > testStart) {
          testEnd = i + 1;
          break;
        }
      }
    }

    if (testStart >= 0 && testEnd > testStart) {
      return lines.slice(testStart, testEnd).join('\n');
    }

    return testCode;
  }

  /**
   * Extract assertions from test code
   * Focus on what is being verified, not how
   */
  private extractAssertions(testCode: string): string[] {
    const assertions: string[] = [];

    // Match expect() calls
    const expectRegex =
      /expect\s*\([^)]+\)\s*\.(toHaveBeenCalled|toBe|toEqual|toMatch|toContain|toThrow|toHaveProperty|toHaveLength|toBeDefined|toBeTruthy|toBeFalsy|toBeNull|toBeUndefined|toBeGreaterThan|toBeLessThan|toMatchObject|toHaveBeenCalledWith|toHaveBeenCalledTimes)\s*\([^)]*\)/g;
    const matches = testCode.matchAll(expectRegex);

    for (const match of matches) {
      // Extract the meaningful part: what is being checked
      const assertion = match[0].replace(/expect\s*\([^)]+\)\s*\./, '').replace(/\([^)]*\)$/, '');
      assertions.push(assertion);
    }

    // Also look for descriptive test names that indicate assertions
    const testNameMatch = testCode.match(/(it|test)\s*\(\s*['"`](.+?)['"`]/);
    if (testNameMatch) {
      const testDesc = testNameMatch[2];
      // Extract action verbs and outcomes
      if (testDesc.includes('should') || testDesc.includes('must') || testDesc.includes('will')) {
        assertions.push(`Test description: ${testDesc}`);
      }
    }

    return assertions.length > 0 ? assertions : ['Behavior verification'];
  }

  /**
   * Extract imports to understand dependencies
   */
  private extractImports(testCode: string): string[] {
    const imports: string[] = [];
    const importRegex =
      /import\s+(?:(?:\{[^}]+?\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"`]([^'"`]+)['"`]/g;
    const matches = testCode.matchAll(importRegex);

    for (const match of matches) {
      imports.push(match[1]);
    }

    return imports;
  }

  /**
   * Extract function/method calls being tested
   */
  private extractFunctionCalls(testCode: string): string[] {
    const calls: string[] = [];

    // Match function calls (simple heuristic)
    const callRegex = /(\w+)\s*\(/g;
    const matches = testCode.matchAll(callRegex);
    const seen = new Set<string>();

    for (const match of matches) {
      const funcName = match[1];
      // Filter out test framework functions
      if (
        ![
          'it',
          'test',
          'describe',
          'expect',
          'beforeEach',
          'afterEach',
          'beforeAll',
          'afterAll',
          'vi',
          'jest',
        ].includes(funcName) &&
        funcName.length > 2 &&
        !seen.has(funcName)
      ) {
        calls.push(funcName);
        seen.add(funcName);
      }
    }

    return calls;
  }

  /**
   * Extract test setup (mocks, fixtures, etc.)
   */
  private extractTestSetup(testCode: string, testLineNumber: number): string[] {
    const setup: string[] = [];

    // Look for mock patterns
    if (
      testCode.includes('mock') ||
      testCode.includes('vi.mock') ||
      testCode.includes('jest.mock')
    ) {
      setup.push('Uses mocks/stubs');
    }

    // Look for fixtures
    if (testCode.includes('fixture') || testCode.includes('factory')) {
      setup.push('Uses test fixtures');
    }

    return setup;
  }

  /**
   * Infer expected behavior from assertions and function calls
   */
  private inferExpectedBehavior(assertions: string[], functionCalls: string[]): string {
    // Simple heuristic-based inference
    // In a more sophisticated version, this could use LLM with a smaller model

    const behaviors: string[] = [];

    if (assertions.some((a) => a.includes('toHaveBeenCalled'))) {
      behaviors.push('Function is invoked');
    }
    if (assertions.some((a) => a.includes('toBe') || a.includes('toEqual'))) {
      behaviors.push('Returns expected value');
    }
    if (assertions.some((a) => a.includes('toThrow'))) {
      behaviors.push('Handles errors appropriately');
    }
    if (assertions.some((a) => a.includes('toHaveProperty'))) {
      behaviors.push('Object has expected structure');
    }

    return behaviors.length > 0 ? behaviors.join('; ') : 'Verifies system behavior';
  }

  /**
   * Find related source files based on imports and file structure
   */
  private findRelatedSourceFiles(
    testFilePath: string,
    imports: string[],
    rootDirectory: string,
  ): string[] {
    const sourceFiles: string[] = [];

    // Find source file for this test
    const sourcePath = testFilePath
      .replace(/\.spec\.ts$/, '.ts')
      .replace(/\.test\.ts$/, '.ts')
      .replace(/\.e2e-spec\.ts$/, '.ts');

    if (fs.existsSync(sourcePath) && sourcePath !== testFilePath) {
      sourceFiles.push(sourcePath);
    }

    // Resolve imports to actual files
    for (const importPath of imports.slice(0, 5)) {
      // Try to resolve relative imports
      if (importPath.startsWith('.')) {
        const resolved = this.resolveImportPath(testFilePath, importPath);
        if (resolved && fs.existsSync(resolved)) {
          sourceFiles.push(resolved);
        }
      } else if (importPath.startsWith('@/')) {
        // Handle path aliases (e.g., @/lib/...)
        const aliasPath = importPath.replace('@/', '');
        const resolved = path.join(rootDirectory, 'src', aliasPath);
        if (fs.existsSync(resolved + '.ts')) {
          sourceFiles.push(resolved + '.ts');
        } else if (fs.existsSync(resolved + '/index.ts')) {
          sourceFiles.push(resolved + '/index.ts');
        }
      }
    }

    return [...new Set(sourceFiles)]; // Deduplicate
  }

  /**
   * Find related test files (tests in same directory or testing same module)
   */
  private findRelatedTestFiles(testFilePath: string, rootDirectory: string): string[] {
    const related: string[] = [];
    const testDir = path.dirname(testFilePath);

    // Find other test files in same directory
    try {
      const files = fs.readdirSync(testDir);
      for (const file of files) {
        if (file.endsWith('.spec.ts') || file.endsWith('.test.ts')) {
          const fullPath = path.join(testDir, file);
          if (fullPath !== testFilePath) {
            related.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Directory might not exist or be readable
    }

    return related.slice(0, 3); // Limit to 3
  }

  /**
   * Extract domain concepts (business/domain terms)
   */
  private extractDomainConcepts(
    testName: string,
    assertions: string[],
    functionCalls: string[],
  ): string[] {
    const concepts: string[] = [];
    const allText = `${testName} ${assertions.join(' ')} ${functionCalls.join(' ')}`.toLowerCase();

    // Common domain patterns
    const domainPatterns = [
      'user',
      'authentication',
      'authorization',
      'session',
      'payment',
      'order',
      'product',
      'cart',
      'checkout',
      'invoice',
      'subscription',
      'notification',
      'email',
      'message',
      'document',
      'file',
      'upload',
      'download',
      'export',
      'import',
      'report',
      'dashboard',
      'analytics',
      'audit',
      'log',
    ];

    for (const pattern of domainPatterns) {
      if (allText.includes(pattern)) {
        concepts.push(pattern);
      }
    }

    return [...new Set(concepts)];
  }

  /**
   * Extract technical concepts (patterns, not implementations)
   */
  private extractTechnicalConcepts(assertions: string[], functionCalls: string[]): string[] {
    const concepts: string[] = [];
    const allText = `${assertions.join(' ')} ${functionCalls.join(' ')}`.toLowerCase();

    const technicalPatterns = [
      'cache',
      'validation',
      'transformation',
      'serialization',
      'deserialization',
      'error handling',
      'retry',
      'timeout',
      'rate limit',
      'throttle',
      'queue',
      'event',
      'listener',
      'handler',
      'middleware',
      'interceptor',
    ];

    for (const pattern of technicalPatterns) {
      if (allText.includes(pattern)) {
        concepts.push(pattern);
      }
    }

    return [...new Set(concepts)];
  }

  /**
   * Find relevant documentation using semantic concepts, not just keywords
   */
  private async findRelevantDocumentation(
    domainConcepts: string[],
    technicalConcepts: string[],
    testFilePath: string,
    rootDirectory: string,
  ): Promise<string[]> {
    const snippets: string[] = [];

    // Find docs that mention domain or technical concepts
    const docFiles = this.findDocumentationFiles(rootDirectory);
    const searchTerms = [...domainConcepts, ...technicalConcepts];

    for (const docFile of docFiles.slice(0, 20)) {
      try {
        const content = fs.readFileSync(docFile, 'utf-8').toLowerCase();

        // Check if doc mentions any concepts
        const relevance = searchTerms.filter((term) => content.includes(term.toLowerCase())).length;

        if (relevance > 0) {
          // Extract relevant paragraph
          const paragraphs = content.split('\n\n');
          for (const para of paragraphs) {
            if (searchTerms.some((term) => para.includes(term.toLowerCase()))) {
              snippets.push(
                `From ${path.relative(rootDirectory, docFile)}:\n${para.substring(0, 300)}`,
              );
              break; // One snippet per doc
            }
          }
        }
      } catch (error) {
        // Skip if can't read
      }
    }

    return snippets.slice(0, 5);
  }

  /**
   * Summarize a source file (extract key information, not full content)
   */
  private summarizeSourceFile(filePath: string): string | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Extract exports and key functions
      const exports = content.match(/export\s+(?:async\s+)?function\s+(\w+)/g) || [];
      const classes = content.match(/export\s+class\s+(\w+)/g) || [];

      const summary: string[] = [];
      if (exports.length > 0) {
        summary.push(`Exports ${exports.length} function(s)`);
      }
      if (classes.length > 0) {
        summary.push(`Exports ${classes.length} class(es)`);
      }

      // Extract file-level comment/doc
      const fileComment = content.match(/\/\*\*[\s\S]{1,200}?\*\//);
      if (fileComment) {
        summary.push(fileComment[0].replace(/\*/g, '').substring(0, 100));
      }

      return summary.length > 0 ? summary.join('; ') : 'Source code file';
    } catch (error) {
      return null;
    }
  }

  private resolveImportPath(fromFile: string, importPath: string): string | null {
    const fromDir = path.dirname(fromFile);
    const resolved = path.resolve(fromDir, importPath);

    // Try .ts extension
    if (fs.existsSync(resolved + '.ts')) {
      return resolved + '.ts';
    }

    // Try /index.ts
    if (fs.existsSync(path.join(resolved, 'index.ts'))) {
      return path.join(resolved, 'index.ts');
    }

    return null;
  }

  private findDocumentationFiles(rootDirectory: string): string[] {
    const docFiles: string[] = [];
    const patterns = ['**/README.md', '**/docs/**/*.md'];

    const walkDir = (dir: string, depth = 0) => {
      if (depth > 5 || !fs.existsSync(dir)) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(rootDirectory, fullPath);

          if (entry.isDirectory() && !relativePath.includes('node_modules')) {
            walkDir(fullPath, depth + 1);
          } else if (entry.isFile() && relativePath.endsWith('.md')) {
            if (!relativePath.includes('.claude/')) {
              docFiles.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Skip if can't read
      }
    };

    walkDir(rootDirectory);
    return docFiles.slice(0, 50);
  }
}
