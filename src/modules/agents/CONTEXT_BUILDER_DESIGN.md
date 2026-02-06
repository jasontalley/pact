# Context Builder Design

## Problem Statement

The current brownfield analysis agent sends entire files (or large chunks) to the LLM, which is:
- **Inefficient**: Wastes tokens on irrelevant code
- **Expensive**: Large context = high costs
- **Low quality**: LLM gets lost in noise
- **Slow**: Processing large files takes time

## Solution: Multi-Step Context Building Pipeline

Instead of dumping raw files, we build **structured, focused context** through multiple analysis steps.

## Architecture

```
Test File
  ↓
[Step 1: Parse Structure]
  ├─ Extract assertions (what is verified)
  ├─ Extract imports (dependencies)
  ├─ Extract function calls (what's being tested)
  └─ Extract test setup (mocks, fixtures)
  ↓
[Step 2: Semantic Analysis]
  ├─ Infer expected behavior from assertions
  ├─ Extract domain concepts (business terms)
  └─ Extract technical concepts (patterns)
  ↓
[Step 3: Dependency Graph]
  ├─ Find related source files (from imports)
  ├─ Find related test files (same module)
  └─ Resolve import paths
  ↓
[Step 4: Semantic Documentation Search]
  ├─ Search docs by domain concepts (not keywords)
  ├─ Extract relevant paragraphs (not entire files)
  └─ Rank by relevance
  ↓
[Step 5: Context Summarization]
  ├─ Summarize source files (exports, key functions)
  ├─ Create focused context summary
  └─ Structure for LLM consumption
  ↓
[Focused Context] → LLM Inference
```

## Key Improvements

### 1. **Structured Extraction** (Not Raw Dumps)

**Before:**
```typescript
// Send entire test file (200 lines)
const testCode = fs.readFileSync(filePath, 'utf-8');
```

**After:**
```typescript
// Extract only what matters
const assertions = extractAssertions(testCode); // ["toHaveBeenCalled", "toEqual"]
const imports = extractImports(testCode); // ["@/lib/socket/client"]
const functionCalls = extractFunctionCalls(testCode); // ["connectSocket", "io"]
```

### 2. **Semantic Concept Extraction**

**Before:**
- Keyword matching: "socket" → find docs with "socket"

**After:**
- Domain concepts: ["connection", "event handling", "real-time communication"]
- Technical concepts: ["lifecycle management", "error handling"]
- Semantic search: Find docs about these concepts, not just keywords

### 3. **Dependency-Aware Context**

**Before:**
- Read entire source file if it exists

**After:**
- Resolve imports to actual files
- Summarize source files (exports, key functions, file-level docs)
- Only include relevant parts

### 4. **Focused Context Summary**

**Before:**
```
Test Code: [200 lines of code]
Documentation: [5000 chars of docs]
Source File: [300 lines of code]
```

**After:**
```
## Test: creates a socket with correct configuration
Location: frontend/__tests__/lib/socket/client.test.ts:15

### Assertions (What is being verified):
1. toHaveBeenCalled - socket.io is initialized
2. toHaveBeenCalledWith - correct configuration options

### Expected Behavior:
Function is invoked; Returns expected value

### Domain Concepts: connection, real-time communication

### Related Source Code:
**client.ts**: Exports 2 function(s); Socket client implementation

### Relevant Documentation:
From docs/architecture/websockets.md:
WebSocket connections are established with auto-reconnect...
```

## Benefits

1. **Token Efficiency**: 80-90% reduction in context size
2. **Better Quality**: LLM focuses on relevant information
3. **Faster Processing**: Less data to process
4. **Lower Costs**: Fewer tokens = lower API costs
5. **More Accurate**: Structured context leads to better inferences

## Implementation Strategy

### Phase 1: Basic Structure Extraction (Current)
- ✅ Extract assertions
- ✅ Extract imports
- ✅ Extract function calls
- ✅ Isolate test code

### Phase 2: Semantic Analysis (Next)
- Extract domain/technical concepts
- Infer expected behavior
- Build concept taxonomy

### Phase 3: Dependency Resolution (Future)
- Resolve import paths
- Build dependency graph
- Find related files

### Phase 4: Semantic Documentation Search (Future)
- Use embeddings for semantic search
- Rank docs by relevance
- Extract relevant paragraphs

### Phase 5: Context Summarization (Future)
- Summarize source files with smaller model
- Create structured summaries
- Build focused context

## Example: Before vs After

### Before (Current Approach)
```
Test File: /app/frontend/__tests__/lib/socket/client.test.ts
Test Code: [200 lines including all tests, mocks, setup]
Documentation: [5000 chars from 10 different docs]
```

**Token Count**: ~3000 tokens

### After (Context Builder)
```
## Test: creates a socket with correct configuration

### Assertions:
1. socket.io is initialized with correct namespace
2. Configuration options match expected values

### Expected Behavior:
Socket client is initialized with specific configuration

### Domain Concepts: connection, real-time communication

### Related Source Code:
**client.ts**: Exports connectSocket, socket instance

### Relevant Documentation:
WebSocket connections use auto-reconnect with 5 attempts...
```

**Token Count**: ~300 tokens (90% reduction)

## Next Steps

1. Integrate `ContextBuilderService` into `BrownfieldAnalysisService`
2. Replace raw file dumps with focused context
3. Measure token reduction and quality improvement
4. Iterate on concept extraction accuracy
