# Brownfield Analysis Agent

## Overview

The Brownfield Analysis Agent analyzes existing repositories (code + documentation) to infer intent atoms from orphan tests (tests without `@atom` annotations). This is designed for brownfield environments where you want to reverse-engineer intent from existing test code.

## Architecture

The agent uses a **sequential workflow** with three main steps:

1. **Discover Orphan Tests**: Uses `TestAtomCouplingService` to find all tests without `@atom` annotations
2. **Analyze Documentation**: Optionally reads documentation files (README, docs/, etc.) to build context
3. **Infer Atoms**: Uses LLM to analyze each orphan test and infer the intent atom it represents

### LangSmith Integration

All LLM calls are automatically traced to **LangSmith Studio** via the `LLMService`, which includes:
- `LangChainTracer` for observability
- Request/response logging
- Cost and latency tracking
- Agent name tagging (`brownfield-analysis-agent`)

To view traces in LangSmith Studio:
1. Set `LANGCHAIN_TRACING_V2=true` in your `.env`
2. Set `LANGCHAIN_API_KEY` to your LangSmith API key
3. Set `LANGCHAIN_PROJECT` (optional, defaults to `pact-agents`)
4. Run the analysis - traces will appear at https://smith.langchain.com

## API Usage

### Endpoint

```
POST /agents/brownfield-analysis/analyze
```

### Request Body

```typescript
{
  rootDirectory?: string;           // Default: process.cwd()
  includePatterns?: string[];       // Test file patterns (default: **/*.spec.ts, etc.)
  excludePatterns?: string[];        // Exclude patterns (default: node_modules, dist, etc.)
  analyzeDocumentation?: boolean;   // Default: true
  autoCreateAtoms?: boolean;        // Default: false (only infer, don't create)
  createdBy?: string;               // User ID for created atoms
}
```

### Response

```typescript
{
  success: boolean;
  totalOrphanTests: number;
  inferredAtomsCount: number;
  createdAtomsCount: number;        // Only if autoCreateAtoms=true
  inferredAtoms: InferredAtom[];
  unanalyzedTests: OrphanTestInfo[];
  summary: string;
  metadata: {
    rootDirectory: string;
    testFilesAnalyzed: number;
    documentationFilesAnalyzed: number;
    analysisDurationMs: number;
  };
}
```

## Example Usage

### 1. Analyze and Infer (No Creation)

```bash
curl -X POST http://localhost:3000/agents/brownfield-analysis/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "rootDirectory": "/path/to/repo",
    "analyzeDocumentation": true,
    "autoCreateAtoms": false
  }'
```

This will:
- Find all orphan tests
- Analyze documentation for context
- Infer intent atoms from tests
- Return inferred atoms (but not create them in database)

### 2. Analyze and Auto-Create Atoms

```bash
curl -X POST http://localhost:3000/agents/brownfield-analysis/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "rootDirectory": "/path/to/repo",
    "analyzeDocumentation": true,
    "autoCreateAtoms": true,
    "createdBy": "user-123"
  }'
```

This will:
- Find all orphan tests
- Infer intent atoms
- **Create atoms in database** (if confidence >= 0.6)
- Link atoms to source tests via metadata

## Where Recommendations Are Captured

Recommendations from the brownfield analysis agent are captured in **three places**:

### 1. **Draft Atoms (Primary Storage)**
   - **Location**: `atoms` table with `status = 'draft'`
   - **Metadata Flag**: `metadata.pendingReview = true` (when `autoCreateAtoms: false`)
   - **Query**: Find all pending recommendations:
     ```sql
     SELECT * FROM atoms 
     WHERE status = 'draft' 
     AND metadata->>'pendingReview' = 'true'
     AND metadata->>'source' = 'brownfield-analysis-agent';
     ```
   - **Access**: Via `/atoms` API endpoint with filters

### 2. **AgentAction Log (Audit Trail)**
   - **Location**: `agent_actions` table
   - **Content**: Full list of recommendations in `output.recommendations` JSONB field
   - **Query**: Find analysis runs:
     ```sql
     SELECT * FROM agent_actions 
     WHERE agent_name = 'brownfield-analysis-agent'
     ORDER BY timestamp DESC;
     ```
   - **Purpose**: Complete audit trail of what was recommended, when, and why

### 3. **API Response (Immediate Access)**
   - **Location**: `POST /agents/brownfield-analysis/analyze` response
   - **Content**: `inferredAtoms` array with full details
   - **Purpose**: Immediate access to recommendations without database query

### Recommendation Lifecycle

1. **Analysis**: Agent infers atoms from orphan tests
2. **Storage**: Recommendations stored as draft atoms (always, regardless of `autoCreateAtoms`)
3. **Review**: Users can query draft atoms with `pendingReview: true`
4. **Accept**: User accepts → remove `pendingReview` flag (or commit atom)
5. **Reject**: User rejects → delete draft atom

## How It Works

### Step 1: Discover Orphan Tests

The agent uses `TestAtomCouplingService.analyzeCoupling()` to:
- Scan repository for test files (`*.spec.ts`, `*.test.ts`, `*.e2e-spec.ts`)
- Parse test files for `@atom` annotations
- Identify orphan tests (tests without annotations)
- Extract test code snippets and find related source files

### Step 2: Analyze Documentation (Optional)

If `analyzeDocumentation: true`:
- Scans for documentation files (README.md, docs/**/*.md, etc.)
- Reads up to 50 documentation files
- Limits each file to 2000 characters
- Concatenates into context for LLM

### Step 3: Infer Atoms from Tests

For each orphan test (processed in batches of 5):
- Extracts test code (20 lines before, 50 lines after test declaration)
- Finds related source file (if exists)
- Builds LLM prompt with:
  - Test file path and name
  - Test code snippet
  - Related source file (if found)
  - Documentation context (if available)
- LLM analyzes and returns:
  - Atomic behavioral description
  - Category (functional, performance, security, etc.)
  - Confidence score (0-1)
  - Reasoning
  - Observable outcomes
  - Related documentation snippets

### Step 4: Store Recommendations

**Always stores recommendations** (regardless of `autoCreateAtoms` setting):

For each inferred atom with confidence >= 0.6:
- Validates atom quality using `AtomQualityService`
- Generates next atom ID (IA-001, IA-002, etc.)
- Creates atom with:
  - Inferred description and category
  - Quality score from validator
  - Observable outcomes
  - Metadata linking to source test
  - Parent intent: "Inferred from test: {testName}"
  - **`metadata.pendingReview: true`** (if `autoCreateAtoms: false`)
  - **`metadata.pendingReview: false`** (if `autoCreateAtoms: true` - auto-approved)
- Saves to database with status `draft`

**Also logs to AgentAction**:
- Full list of recommendations in `output.recommendations`
- Summary statistics
- Complete audit trail

## LangSmith Studio Refinement

### Viewing Traces

1. Go to https://smith.langchain.com
2. Select your project (`pact-agents` by default)
3. Filter by agent name: `brownfield-analysis-agent`
4. View individual LLM calls for each test inference

### Refining Prompts

The agent uses these prompts (in `inferAtomFromTest`):

**System Prompt:**
```
You are an expert at analyzing test code to infer behavioral intent.

Your task is to analyze a test and infer the intent atom it represents. An intent atom must be:
1. Atomic (irreducible behavioral primitive)
2. Observable and falsifiable (testable)
3. Implementation-agnostic (describes WHAT, not HOW)

Respond in JSON format only.
```

**User Prompt Template:**
```
Analyze the following test and infer the intent atom:

Test File: {filePath}
Test Name: {testName}
Test Code:
```typescript
{testCode}
```

{relatedSourceFile ? `Related Source File: {relatedSourceFile}` : ''}

{documentationContext ? `Documentation Context:\n{documentationContext}` : ''}

Respond with JSON:
{
  "description": "atomic behavioral description",
  "category": "functional|performance|security|reliability|usability|maintainability",
  "confidence": 0.0-1.0,
  "reasoning": "explanation of how the test maps to this intent",
  "observableOutcomes": ["outcome1", "outcome2"],
  "relatedDocs": ["relevant doc snippet 1", "relevant doc snippet 2"]
}

If the test is too vague, implementation-specific, or cannot be mapped to atomic behavior, return null.
```

### Improving Results

Based on LangSmith traces, you can:

1. **Adjust temperature** (currently 0.2) for more/less creativity
2. **Refine prompts** to better extract atomic behavior
3. **Add examples** of good vs. bad atom inferences
4. **Tune confidence thresholds** (currently 0.6 for auto-creation)
5. **Adjust batch sizes** (currently 5 tests per batch)

## Limitations

- **Test Quality**: The agent depends on test quality. Vague or implementation-specific tests may not yield good atoms
- **Documentation**: Limited to 50 files, 2000 chars each to avoid context limits
- **Batch Processing**: Processes tests in batches of 5 to avoid overwhelming LLM
- **Confidence Threshold**: Only creates atoms with confidence >= 0.6

## Future Enhancements

- **LangGraph Orchestration**: Use LangGraph for more complex multi-agent workflows
- **Parallel Processing**: Process multiple tests in parallel (with rate limiting)
- **Incremental Analysis**: Track which tests have been analyzed to avoid re-processing
- **Test Code Analysis**: Use AST parsing for more accurate test code extraction
- **Documentation Embeddings**: Use vector search for better documentation context retrieval
