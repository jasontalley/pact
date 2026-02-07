import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { Atom } from '../atoms/atom.entity';
import { AgentAction } from './agent-action.entity';
import { TestAtomCouplingService } from './test-atom-coupling.service';
import { AtomQualityService } from '../validators/atom-quality.service';
import { LLMService } from '../../common/llm/llm.service';
import { ContextBuilderService, CONTENT_PROVIDER } from './context-builder.service';
import {
  BrownfieldAnalysisDto,
  BrownfieldAnalysisResult,
  InferredAtom,
  OrphanTestInfo,
} from './dto/brownfield-analysis.dto';
import { ContentProvider, FilesystemContentProvider } from './content';
import { RepositoryConfigService } from '../projects/repository-config.service';

/**
 * State for the brownfield analysis agent
 */
interface BrownfieldAnalysisState {
  rootDirectory: string;
  orphanTests: OrphanTestInfo[];
  inferredAtoms: InferredAtom[];
  unanalyzedTests: OrphanTestInfo[];
  documentationContext: string;
  currentTestIndex: number;
  analysisMetadata: {
    testFilesAnalyzed: number;
    documentationFilesAnalyzed: number;
    startTime: number;
  };
}

/**
 * BrownfieldAnalysisService
 *
 * Analyzes existing repositories (code + documentation) to infer intent atoms
 * from orphan tests and create atoms in a brownfield environment.
 *
 * Uses LangGraph for multi-step reasoning:
 * 1. Discover repository structure
 * 2. Find orphan tests (tests without @atom annotations)
 * 3. Analyze code/documentation context for each test
 * 4. Infer intent atoms from test behavior
 * 5. Create atoms and link to tests
 */
@Injectable()
export class BrownfieldAnalysisService {
  private readonly logger = new Logger(BrownfieldAnalysisService.name);
  private readonly defaultTestPatterns = ['**/*.spec.ts', '**/*.test.ts', '**/*.e2e-spec.ts'];
  private readonly defaultExcludePatterns = ['**/node_modules/**', '**/dist/**', '**/.git/**'];
  private readonly defaultDocPatterns = [
    '**/README.md',
    '**/docs/**/*.md',
    '**/CHANGELOG.md',
    '**/CONTRIBUTING.md',
  ];
  private readonly excludeDocPatterns = [
    '**/.claude/**', // Exclude Claude skills - not relevant to code analysis
    '**/node_modules/**',
    '**/dist/**',
  ];

  private contentProvider: ContentProvider;

  constructor(
    @InjectRepository(Atom)
    private atomRepository: Repository<Atom>,
    @InjectRepository(AgentAction)
    private agentActionRepository: Repository<AgentAction>,
    private configService: ConfigService,
    private readonly llmService: LLMService,
    private readonly testAtomCouplingService: TestAtomCouplingService,
    private readonly atomQualityService: AtomQualityService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly repositoryConfigService: RepositoryConfigService,
    @Optional() @Inject(CONTENT_PROVIDER) contentProvider?: ContentProvider,
  ) {
    this.contentProvider = contentProvider || new FilesystemContentProvider();
  }

  /**
   * Set or replace the content provider
   */
  setContentProvider(provider: ContentProvider): void {
    this.contentProvider = provider;
  }

  /**
   * Main entry point for brownfield analysis
   */
  async analyzeRepository(dto: BrownfieldAnalysisDto): Promise<BrownfieldAnalysisResult> {
    const rootDirectory = dto.rootDirectory || await this.repositoryConfigService.getRepositoryPath();
    const startTime = Date.now();

    this.logger.log(`Starting brownfield analysis of repository: ${rootDirectory}`);

    // Initialize state
    const initialState: BrownfieldAnalysisState = {
      rootDirectory,
      orphanTests: [],
      inferredAtoms: [],
      unanalyzedTests: [],
      documentationContext: '',
      currentTestIndex: 0,
      analysisMetadata: {
        testFilesAnalyzed: 0,
        documentationFilesAnalyzed: 0,
        startTime,
      },
    };

    // Execute sequential workflow (LangGraph used for observability via LLMService tracing)
    try {
      // Step 1: Discover orphan tests
      let state = await this.discoverOrphanTests(initialState);

      // Step 2: Analyze documentation
      state = await this.analyzeDocumentation(dto, state);

      // Step 3: Infer atoms from tests
      const finalState = await this.inferAtomsFromTests(dto, state);

      // Create atoms if requested
      let createdAtomsCount = 0;
      const validateQuality = dto.validateQuality !== false; // Default to true
      if (dto.autoCreateAtoms) {
        createdAtomsCount = await this.createAtomsFromInferred(
          finalState.inferredAtoms,
          dto.createdBy,
          validateQuality,
        );
      } else {
        // Even when autoCreateAtoms=false, store recommendations as draft atoms
        // with pendingReview flag so users can review and accept/reject them
        createdAtomsCount = await this.storeRecommendationsAsDrafts(
          finalState.inferredAtoms,
          dto.createdBy,
          validateQuality,
        );
      }

      // Log agent action with full recommendations for audit trail
      await this.logAgentAction('brownfield-analysis', dto, {
        totalOrphanTests: finalState.orphanTests.length,
        inferredAtomsCount: finalState.inferredAtoms.length,
        createdAtomsCount,
        recommendations: finalState.inferredAtoms.map((atom) => ({
          description: atom.description,
          category: atom.category,
          confidence: atom.confidence,
          reasoning: atom.reasoning,
          sourceTest: {
            filePath: atom.sourceTest.filePath,
            testName: atom.sourceTest.testName,
            lineNumber: atom.sourceTest.lineNumber,
          },
          observableOutcomes: atom.observableOutcomes,
          relatedDocs: atom.relatedDocs,
        })),
        unanalyzedTests: finalState.unanalyzedTests,
      });

      const durationMs = Date.now() - startTime;

      return {
        success: true,
        totalOrphanTests: finalState.orphanTests.length,
        inferredAtomsCount: finalState.inferredAtoms.length,
        createdAtomsCount,
        inferredAtoms: finalState.inferredAtoms,
        unanalyzedTests: finalState.unanalyzedTests,
        summary: this.generateSummary(finalState, createdAtomsCount),
        metadata: {
          rootDirectory,
          testFilesAnalyzed: finalState.analysisMetadata.testFilesAnalyzed,
          documentationFilesAnalyzed: finalState.analysisMetadata.documentationFilesAnalyzed,
          analysisDurationMs: durationMs,
        },
      };
    } catch (error) {
      this.logger.error(`Brownfield analysis failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Note: LangGraph is available for future multi-agent orchestration.
   * Currently using sequential workflow with LangSmith tracing via LLMService.
   * All LLM calls are automatically traced to LangSmith Studio for refinement.
   */

  /**
   * Step 1: Discover orphan tests in the repository
   */
  private async discoverOrphanTests(
    state: BrownfieldAnalysisState,
  ): Promise<BrownfieldAnalysisState> {
    this.logger.log('Discovering orphan tests...');

    const couplingResult = await this.testAtomCouplingService.analyzeCoupling({
      testDirectory: state.rootDirectory,
    });

    const orphanTests: OrphanTestInfo[] = await Promise.all(
      couplingResult.orphanTests.map(async (orphan) => {
        const testCode = await this.extractTestCode(orphan.filePath, orphan.lineNumber);
        const relatedSourceFile = await this.findRelatedSourceFile(orphan.filePath);

        return {
          filePath: orphan.filePath,
          testName: orphan.testName,
          lineNumber: orphan.lineNumber,
          testCode,
          relatedSourceFile,
        };
      }),
    );

    return {
      ...state,
      orphanTests,
      analysisMetadata: {
        ...state.analysisMetadata,
        testFilesAnalyzed: couplingResult.summary.totalTestFiles,
      },
    };
  }

  /**
   * Step 2: Analyze documentation to build context
   */
  private async analyzeDocumentation(
    dto: BrownfieldAnalysisDto,
    state: BrownfieldAnalysisState,
  ): Promise<BrownfieldAnalysisState> {
    if (!dto.analyzeDocumentation) {
      return { ...state, documentationContext: '' };
    }

    this.logger.log('Analyzing documentation...');

    const docFiles = await this.findDocumentationFiles(state.rootDirectory);
    const docContent = await this.readDocumentationFiles(docFiles);

    return {
      ...state,
      documentationContext: docContent,
      analysisMetadata: {
        ...state.analysisMetadata,
        documentationFilesAnalyzed: docFiles.length,
      },
    };
  }

  /**
   * Step 3: Infer atoms from orphan tests using LLM
   * All LLM calls are traced to LangSmith Studio via LLMService
   */
  private async inferAtomsFromTests(
    dto: BrownfieldAnalysisDto,
    state: BrownfieldAnalysisState,
  ): Promise<BrownfieldAnalysisState> {
    this.logger.log(`Inferring atoms from ${state.orphanTests.length} orphan tests...`);

    // Deduplicate tests by file path + line number to prevent processing the same test multiple times
    const testKey = (test: OrphanTestInfo) => `${test.filePath}:${test.lineNumber}`;
    const seenTests = new Set<string>();
    const uniqueTests = state.orphanTests.filter((test) => {
      const key = testKey(test);
      if (seenTests.has(key)) {
        this.logger.warn(`Skipping duplicate test: ${key}`);
        return false;
      }
      seenTests.add(key);
      return true;
    });

    this.logger.log(
      `After deduplication: ${uniqueTests.length} unique tests (removed ${state.orphanTests.length - uniqueTests.length} duplicates)`,
    );

    const inferredAtoms: InferredAtom[] = [];
    const unanalyzedTests: OrphanTestInfo[] = [];

    // Process tests in batches to avoid overwhelming the LLM
    const batchSize = 5;
    const maxTests = dto.maxTests || 100; // Safety limit to prevent runaway processing

    const testsToProcess = uniqueTests.slice(0, maxTests);
    if (uniqueTests.length > maxTests) {
      this.logger.warn(
        `Limiting analysis to first ${maxTests} tests (found ${uniqueTests.length} total)`,
      );
    }

    for (let i = 0; i < testsToProcess.length; i += batchSize) {
      const batch = testsToProcess.slice(i, i + batchSize);
      this.logger.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(testsToProcess.length / batchSize)} (${batch.length} tests)`,
      );

      const batchResults = await Promise.all(
        batch.map((test) => this.inferAtomFromTest(test, state.documentationContext, dto)),
      );

      for (let j = 0; j < batch.length; j++) {
        const result = batchResults[j];
        if (result) {
          inferredAtoms.push(result);
        } else {
          unanalyzedTests.push(batch[j]);
        }
      }
    }

    return {
      ...state,
      inferredAtoms,
      unanalyzedTests,
    };
  }

  /**
   * Infer a single atom from a test using LLM
   * Uses ContextBuilderService to create focused, structured context
   */
  private async inferAtomFromTest(
    test: OrphanTestInfo,
    documentationContext: string,
    dto: BrownfieldAnalysisDto,
  ): Promise<InferredAtom | null> {
    // Step 1: Build structured context using ContextBuilderService
    const testAnalysis = await this.contextBuilder.analyzeTest(
      test.filePath,
      test.testName,
      test.lineNumber,
      process.cwd(),
    );

    // Step 2: Build focused context summary (not raw file dumps)
    const focusedContext = this.contextBuilder.buildFocusedContext(testAnalysis);

    const systemPrompt = `You are an expert at analyzing test code to infer behavioral intent.

Your task is to analyze a test and infer the intent atom it represents. An intent atom must be:
1. Atomic (irreducible behavioral primitive)
2. Observable and falsifiable (testable)
3. Implementation-agnostic (describes WHAT, not HOW)

Respond in JSON format only.`;

    const userPrompt = `Analyze the following test and infer the intent atom:

${focusedContext}

CRITICAL: The intent atom must be:
- ATOMIC: One irreducible behavioral primitive (not multiple behaviors combined)
- OBSERVABLE: Describes WHAT the system does, not HOW it's implemented
- IMPLEMENTATION-AGNOSTIC: No technology-specific terms (e.g., "socket.io", "REST API", "database")
- TESTABLE: Can be verified through external observation

If the test describes multiple behaviors, focus on the SINGLE atomic behavior this specific test verifies.
If the description includes implementation details, rewrite it to describe the behavior only.

Respond with JSON:
{
  "description": "atomic behavioral description (WHAT, not HOW)",
  "category": "functional|performance|security|reliability|usability|maintainability",
  "confidence": 0.0-1.0,
  "reasoning": "explanation of how the test maps to this intent and why it's atomic",
  "observableOutcomes": ["outcome1", "outcome2"],
  "relatedDocs": ["relevant doc snippet 1", "relevant doc snippet 2"]
}

If the test is too vague, implementation-specific, describes multiple behaviors, or cannot be mapped to atomic behavior, return null.`;

    try {
      const response = await this.llmService.invoke({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        agentName: 'brownfield-analysis-agent',
        purpose: 'Infer intent atom from test code',
        temperature: 0.2,
        useCache: dto.useCache !== false, // Default to true, but allow disabling for development
      });

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn(`No JSON found in LLM response for test: ${test.testName}`);
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed || !parsed.description) {
        return null;
      }

      return {
        description: parsed.description,
        category: parsed.category || 'functional',
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || 'Inferred from test code',
        sourceTest: test,
        observableOutcomes: parsed.observableOutcomes || [],
        relatedDocs: parsed.relatedDocs || [],
      };
    } catch (error) {
      this.logger.error(`Failed to infer atom from test ${test.testName}: ${error.message}`);
      return null;
    }
  }

  /**
   * Store recommendations as draft atoms (even when autoCreateAtoms=false)
   * This allows users to review and accept/reject recommendations later
   */
  async storeRecommendationsAsDrafts(
    inferredAtoms: InferredAtom[],
    createdBy?: string,
    validateQuality: boolean = true,
  ): Promise<number> {
    let storedCount = 0;

    for (const inferred of inferredAtoms) {
      // Skip if confidence is too low
      if (inferred.confidence < 0.6) {
        this.logger.warn(
          `Skipping recommendation storage for "${inferred.description}" - confidence too low (${inferred.confidence})`,
        );
        continue;
      }

      try {
        // Generate next atom ID
        const latestAtom = await this.atomRepository.findOne({
          where: {},
          order: { atomId: 'DESC' },
        });

        const nextId = latestAtom ? parseInt(latestAtom.atomId.split('-')[1]) + 1 : 1;
        const atomId = `IA-${String(nextId).padStart(3, '0')}`;

        // Validate atom quality (optional - can be disabled for faster development)
        let qualityScore = 0;
        if (validateQuality) {
          const qualityResult = await this.atomQualityService.validateAtom({
            atomId: 'pending',
            description: inferred.description,
            category: inferred.category,
          });
          qualityScore = qualityResult.totalScore;
        } else {
          this.logger.log(`Skipping quality validation for ${atomId} (validateQuality=false)`);
        }

        // Create atom with pendingReview flag
        const atom = this.atomRepository.create({
          atomId,
          description: inferred.description,
          category: inferred.category,
          status: 'draft',
          qualityScore,
          createdBy: createdBy || null,
          observableOutcomes: (inferred.observableOutcomes || []).map((outcome) => ({
            description: outcome,
          })),
          parentIntent: `Inferred from test: ${inferred.sourceTest.testName}`,
          metadata: {
            source: 'brownfield-analysis-agent',
            pendingReview: true, // Flag indicating this is a recommendation pending review
            sourceTest: {
              filePath: inferred.sourceTest.filePath,
              testName: inferred.sourceTest.testName,
              lineNumber: inferred.sourceTest.lineNumber,
            },
            inferenceConfidence: inferred.confidence,
            inferenceReasoning: inferred.reasoning,
            relatedDocs: inferred.relatedDocs,
          },
        });

        await this.atomRepository.save(atom);
        storedCount++;

        this.logger.log(
          `Stored recommendation as draft atom ${atomId} from test: ${inferred.sourceTest.testName}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to store recommendation: "${inferred.description}" - ${error.message}`,
        );
      }
    }

    return storedCount;
  }

  /**
   * Create atoms from inferred atoms (auto-approve mode)
   */
  private async createAtomsFromInferred(
    inferredAtoms: InferredAtom[],
    createdBy?: string,
    validateQuality: boolean = true,
  ): Promise<number> {
    let createdCount = 0;

    for (const inferred of inferredAtoms) {
      // Skip if confidence is too low
      if (inferred.confidence < 0.6) {
        this.logger.warn(
          `Skipping atom creation for "${inferred.description}" - confidence too low (${inferred.confidence})`,
        );
        continue;
      }

      try {
        // Generate next atom ID
        const latestAtom = await this.atomRepository.findOne({
          where: {},
          order: { atomId: 'DESC' },
        });

        const nextId = latestAtom ? parseInt(latestAtom.atomId.split('-')[1]) + 1 : 1;
        const atomId = `IA-${String(nextId).padStart(3, '0')}`;

        // Validate atom quality (optional - can be disabled for faster development)
        let qualityScore = 0;
        if (validateQuality) {
          const qualityResult = await this.atomQualityService.validateAtom({
            atomId: 'pending',
            description: inferred.description,
            category: inferred.category,
          });
          qualityScore = qualityResult.totalScore;
        } else {
          this.logger.log(`Skipping quality validation for ${atomId} (validateQuality=false)`);
        }

        // Create atom
        const atom = this.atomRepository.create({
          atomId,
          description: inferred.description,
          category: inferred.category,
          status: 'draft',
          qualityScore,
          createdBy: createdBy || null,
          observableOutcomes: (inferred.observableOutcomes || []).map((outcome) => ({
            description: outcome,
          })),
          parentIntent: `Inferred from test: ${inferred.sourceTest.testName}`,
          metadata: {
            source: 'brownfield-analysis-agent',
            sourceTest: {
              filePath: inferred.sourceTest.filePath,
              testName: inferred.sourceTest.testName,
              lineNumber: inferred.sourceTest.lineNumber,
            },
            inferenceConfidence: inferred.confidence,
            inferenceReasoning: inferred.reasoning,
            relatedDocs: inferred.relatedDocs,
          },
        });

        await this.atomRepository.save(atom);
        createdCount++;

        this.logger.log(`Created atom ${atomId} from test: ${inferred.sourceTest.testName}`);
      } catch (error) {
        this.logger.error(
          `Failed to create atom from inferred: "${inferred.description}" - ${error.message}`,
        );
      }
    }

    return createdCount;
  }

  /**
   * Extract test code snippet from file
   */
  private async extractTestCode(filePath: string, lineNumber: number): Promise<string> {
    try {
      const content = await this.contentProvider.readFileOrNull(filePath);
      if (content === null) {
        this.logger.warn(`File not found: ${filePath}`);
        return '';
      }
      const lines = content.split('\n');

      // Extract test and surrounding context (20 lines before, 50 lines after)
      const start = Math.max(0, lineNumber - 20);
      const end = Math.min(lines.length, lineNumber + 50);

      return lines.slice(start, end).join('\n');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to extract test code from ${filePath}: ${errorMessage}`);
      return '';
    }
  }

  /**
   * Isolate a specific test from surrounding tests
   * Extracts only the test that matches the testName
   */
  private isolateTestCode(testCode: string, testName: string): string {
    const lines = testCode.split('\n');
    const testNameEscaped = testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Find the test declaration
    const testRegex = new RegExp(`(it|test)\\s*\\(\\s*['"\`].*${testNameEscaped}.*['"\`]`);
    let testStart = -1;
    let testEnd = -1;
    let braceDepth = 0;
    let inTest = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if this is the test we're looking for
      if (testRegex.test(line)) {
        testStart = i;
        inTest = true;
        braceDepth = 0;
      }

      if (inTest) {
        // Count braces to find test end
        for (const char of line) {
          if (char === '{') braceDepth++;
          if (char === '}') braceDepth--;
        }

        // Test ends when we close the outermost brace
        if (braceDepth === 0 && testStart >= 0 && i > testStart) {
          testEnd = i + 1;
          break;
        }
      }
    }

    if (testStart >= 0 && testEnd > testStart) {
      // Include a few lines before for context (describe blocks, setup)
      const contextStart = Math.max(0, testStart - 5);
      return lines.slice(contextStart, testEnd).join('\n');
    }

    // Fallback: return original if we can't isolate
    return testCode;
  }

  /**
   * Filter documentation context for relevance to the test
   * Only includes docs that mention keywords from the test
   */
  private filterRelevantDocumentation(
    documentationContext: string,
    testFilePath: string,
    testCode: string,
  ): string {
    if (!documentationContext) {
      return '';
    }

    // Extract keywords from test (file path, test name, key terms)
    const testKeywords = new Set<string>();

    // Add path segments
    testFilePath.split('/').forEach((segment) => {
      if (segment.length > 3) {
        testKeywords.add(segment.toLowerCase());
      }
    });

    // Add common technical terms from test code (but not implementation-specific)
    const codeTerms: string[] = testCode.match(/\b[a-z]{4,}\b/gi) || [];
    codeTerms.forEach((term) => {
      const lower = term.toLowerCase();
      // Filter out common words and implementation terms
      if (
        lower.length > 4 &&
        !['test', 'expect', 'describe', 'before', 'after', 'mock', 'function'].includes(lower)
      ) {
        testKeywords.add(lower);
      }
    });

    // Split docs into sections and filter
    const docSections = documentationContext.split('---');
    const relevantSections: string[] = [];

    for (const section of docSections) {
      const sectionLower = section.toLowerCase();
      // Check if section mentions any keywords
      const isRelevant = Array.from(testKeywords).some((keyword) => sectionLower.includes(keyword));

      if (isRelevant) {
        relevantSections.push(section.substring(0, 1000)); // Limit each section
      }
    }

    return relevantSections.join('\n\n').substring(0, 2000); // Total limit
  }

  /**
   * Find related source file for a test file
   */
  private async findRelatedSourceFile(testFilePath: string): Promise<string | undefined> {
    // Common patterns: test.spec.ts -> test.ts, test.test.ts -> test.ts
    const sourcePath = testFilePath
      .replace(/\.spec\.ts$/, '.ts')
      .replace(/\.test\.ts$/, '.ts')
      .replace(/\.e2e-spec\.ts$/, '.ts');

    if ((await this.contentProvider.exists(sourcePath)) && sourcePath !== testFilePath) {
      return sourcePath;
    }

    return undefined;
  }

  /**
   * Find documentation files in repository
   */
  private async findDocumentationFiles(rootDirectory: string): Promise<string[]> {
    try {
      // Use ContentProvider to walk the directory
      const allFiles = await this.contentProvider.walkDirectory(rootDirectory, {
        excludePatterns: ['node_modules', 'dist', '.git', '.claude'],
        maxFiles: 200,
        includeExtensions: ['.md'],
      });

      // Filter to match doc patterns and exclude patterns
      const docFiles: string[] = [];
      for (const relativePath of allFiles) {
        // Check exclusions first
        if (this.matchesPatterns(relativePath, this.excludeDocPatterns)) {
          continue;
        }
        if (this.matchesPatterns(relativePath, this.defaultDocPatterns)) {
          docFiles.push(path.join(rootDirectory, relativePath));
        }
      }

      return docFiles.slice(0, 50); // Limit to 50 files to avoid overwhelming context
    } catch {
      return [];
    }
  }

  /**
   * Read and concatenate documentation files
   */
  private async readDocumentationFiles(filePaths: string[]): Promise<string> {
    const contents: string[] = [];

    for (const filePath of filePaths) {
      try {
        const content = await this.contentProvider.readFileOrNull(filePath);
        if (content === null) continue;
        const relativePath = path.relative(process.cwd(), filePath);
        contents.push(`\n--- ${relativePath} ---\n${content.substring(0, 2000)}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to read documentation file ${filePath}: ${errorMessage}`);
      }
    }

    return contents.join('\n\n');
  }

  /**
   * Check if a path matches any glob patterns
   */
  private matchesPatterns(filePath: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (this.matchGlob(filePath, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Simple glob matching (supports * and **)
   */
  private matchGlob(filePath: string, pattern: string): boolean {
    let regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<<<GLOBSTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<GLOBSTAR>>>/g, '.*');

    if (regexPattern.startsWith('.*/')) {
      regexPattern = `(${regexPattern}|${regexPattern.slice(3)})`;
    }

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  /**
   * Generate summary of analysis
   */
  private generateSummary(state: BrownfieldAnalysisState, createdAtomsCount: number): string {
    const lines: string[] = [];

    lines.push(`Analyzed ${state.analysisMetadata.testFilesAnalyzed} test files`);
    lines.push(`Found ${state.orphanTests.length} orphan tests (tests without @atom annotations)`);
    lines.push(`Inferred ${state.inferredAtoms.length} intent atoms from tests`);
    if (createdAtomsCount > 0) {
      lines.push(
        `Stored ${createdAtomsCount} recommendations as draft atoms (query atoms with metadata.pendingReview=true to review)`,
      );
    }
    if (state.unanalyzedTests.length > 0) {
      lines.push(
        `${state.unanalyzedTests.length} tests could not be analyzed (too vague or implementation-specific)`,
      );
    }
    if (state.analysisMetadata.documentationFilesAnalyzed > 0) {
      lines.push(
        `Analyzed ${state.analysisMetadata.documentationFilesAnalyzed} documentation files`,
      );
    }

    return lines.join('. ');
  }

  /**
   * Log agent action to database
   */
  private async logAgentAction(actionType: string, input: any, output: any): Promise<void> {
    try {
      const agentAction = this.agentActionRepository.create({
        agentName: 'brownfield-analysis-agent',
        actionType,
        input,
        output,
        confidenceScore: null,
        humanApproved: null,
      });

      await this.agentActionRepository.save(agentAction);
    } catch (error) {
      this.logger.error(`Failed to log agent action: ${error.message}`);
    }
  }
}
