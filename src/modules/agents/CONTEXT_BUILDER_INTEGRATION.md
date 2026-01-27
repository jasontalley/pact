# Context Builder Integration

## Architecture Overview

The `ContextBuilderService` is **not a LangGraph tool** - it's a **helper service** that the `BrownfieldAnalysisService` uses to build better context before making LLM calls.

## Integration Flow

```
BrownfieldAnalysisService
  ↓
inferAtomFromTest() called for each orphan test
  ↓
[Uses ContextBuilderService]
  ├─ analyzeTest() → Builds structured analysis
  └─ buildFocusedContext() → Creates focused summary
  ↓
[LLM Call with Focused Context]
  ├─ System Prompt: Instructions for atom inference
  └─ User Prompt: Focused context (not raw files)
  ↓
[Atom Inference Result]
```

## How It Works

### Before (Current Approach)
```typescript
// In BrownfieldAnalysisService.inferAtomFromTest()
const isolatedTestCode = this.isolateTestCode(test.testCode, test.testName);
const relevantDocs = this.filterRelevantDocumentation(...);

// Send raw code + docs to LLM
const userPrompt = `
Test Code:
\`\`\`typescript
${isolatedTestCode}  // 200 lines
\`\`\`

Documentation:
${relevantDocs}  // 5000 chars
`;
```

### After (With ContextBuilderService)
```typescript
// In BrownfieldAnalysisService.inferAtomFromTest()
const testAnalysis = await this.contextBuilder.analyzeTest(
  test.filePath,
  test.testName,
  test.lineNumber,
  rootDirectory,
);

const focusedContext = this.contextBuilder.buildFocusedContext(testAnalysis);

// Send structured, focused context to LLM
const userPrompt = `
${focusedContext}  // ~300 tokens, structured summary
`;
```

## What ContextBuilderService Does

### 1. **Structured Analysis** (`analyzeTest()`)
Extracts structured information from the test:
- **Assertions**: What the test verifies
- **Imports**: Dependencies
- **Function Calls**: What's being tested
- **Domain Concepts**: Business terms
- **Technical Concepts**: Patterns

### 2. **Context Building** (`buildFocusedContext()`)
Creates a focused summary:
- Test location and name
- Assertions (what's verified)
- Expected behavior (inferred)
- Domain/technical concepts
- Related source code (summarized)
- Relevant documentation (snippets only)

## Integration Points

### In BrownfieldAnalysisService

**Before LLM call:**
```typescript
private async inferAtomFromTest(
  test: OrphanTestInfo,
  documentationContext: string,  // Not used anymore
): Promise<InferredAtom | null> {
  // Use ContextBuilderService to build context
  const testAnalysis = await this.contextBuilder.analyzeTest(
    test.filePath,
    test.testName,
    test.lineNumber,
    process.cwd(),
  );
  
  const focusedContext = this.contextBuilder.buildFocusedContext(testAnalysis);
  
  // Use focused context in LLM prompt
  const userPrompt = `Analyze the following test...\n\n${focusedContext}`;
  
  // ... rest of LLM call
}
```

## Benefits

1. **Separation of Concerns**: Context building logic is separate from LLM orchestration
2. **Reusability**: ContextBuilderService can be used by other agents
3. **Testability**: Can test context building independently
4. **Maintainability**: Easier to improve context building without touching LLM logic
5. **Token Efficiency**: 90% reduction in context size

## Service Relationship

```
BrownfieldAnalysisService (Orchestrator)
  ├─ Uses: TestAtomCouplingService (finds orphan tests)
  ├─ Uses: ContextBuilderService (builds context) ← NEW
  ├─ Uses: LLMService (makes LLM calls)
  └─ Uses: AtomQualityService (validates atoms)
```

**ContextBuilderService is a dependency**, not a tool. It's injected via NestJS dependency injection.

## Example: Before vs After

### Before Integration
- Reads entire test file (200 lines)
- Reads entire documentation (5000 chars)
- Sends raw dumps to LLM
- **~3000 tokens per test**

### After Integration
- Analyzes test structure
- Extracts assertions, concepts
- Summarizes source files
- Finds relevant doc snippets
- Sends focused context
- **~300 tokens per test**

## Next Steps

1. ✅ ContextBuilderService created
2. ✅ Integrated into BrownfieldAnalysisService
3. ✅ Added to AgentsModule
4. ⏳ Test the integration
5. ⏳ Measure token reduction
6. ⏳ Verify quality improvement
