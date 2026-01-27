# Chat Agent Analysis

## Current Issues

### 1. **No Function Calling Support**
- The `AGENT_TOOLS` array is defined but **never passed to the LLM**
- The LLM service doesn't support passing tools/functions to providers
- Tool calls are parsed using a brittle regex pattern: `[TOOL:name]{args}`
- This means the LLM can't actually use tools - it would need to output this specific format

### 2. **Missing Critical Tools**
The agent lacks essential tools for basic operations:
- ❌ `count_atoms` - Answer "How many atoms do we have?"
- ❌ `get_statistics` - Get atom statistics (counts by status, category, etc.)
- ❌ `list_atoms` - List atoms with pagination (currently only `search_atoms` exists)
- ❌ `commit_atom` - Commit a draft atom
- ❌ `update_atom` - Update a draft atom
- ❌ `delete_atom` - Delete a draft atom
- ❌ `get_popular_tags` - Get popular tags

### 3. **Tool Execution Issues**
- `get_atom` uses a search instead of direct lookup by ID
- No proper error handling for tool failures
- Tool results are passed back to LLM as text, not structured data

### 4. **LLM Integration Problems**
- `LLMService.invoke()` doesn't accept tools parameter
- `ProviderRequest` interface doesn't include tools
- Providers (OpenAI, Anthropic, Ollama) support function calling but it's not exposed

## Required Changes

### Phase 1: Add Function Calling Infrastructure
1. Extend `ProviderRequest` to include `tools?: ToolDefinition[]`
2. Update `LLMRequest` to include `tools?: ToolDefinition[]`
3. Update providers to pass tools to LangChain clients
4. Parse tool calls from LangChain responses

### Phase 2: Add Missing Tools
1. `count_atoms` - Get total atom count
2. `get_statistics` - Get comprehensive atom statistics
3. `list_atoms` - List atoms with pagination
4. `commit_atom` - Commit a draft atom
5. `update_atom` - Update a draft atom
6. `delete_atom` - Delete a draft atom
7. `get_popular_tags` - Get popular tags

### Phase 3: Fix Tool Execution
1. Fix `get_atom` to use direct lookup
2. Improve error handling
3. Pass structured tool results to LLM

### Phase 4: Update System Prompt
1. Document all available tools
2. Provide examples of tool usage
3. Explain when to use each tool

## Implementation Plan

1. **Add tool types** to `src/common/llm/providers/types.ts`
2. **Update ProviderRequest** to include tools
3. **Update LLMRequest** to include tools
4. **Update providers** (OpenAI, Anthropic, Ollama) to handle tools
5. **Update chat-agent.service.ts** to:
   - Pass tools to LLM
   - Parse tool calls from response
   - Execute tools properly
   - Add missing tool implementations
6. **Update system prompt** with all tools

## Example: How It Should Work

```typescript
// User asks: "How many atoms do we have?"

// 1. LLM receives tools definition
const tools = [
  {
    name: 'count_atoms',
    description: 'Get the total count of atoms',
    parameters: { type: 'object', properties: {} }
  }
];

// 2. LLM calls the tool
const response = await llm.invoke({
  messages: [...],
  tools: tools
});
// Response includes: { toolCalls: [{ name: 'count_atoms', arguments: {} }] }

// 3. Execute tool
const count = await atomsService.findAll();
const result = { total: count.total };

// 4. LLM generates final response
const finalResponse = await llm.invoke({
  messages: [
    ...previousMessages,
    { role: 'assistant', toolCalls: [...] },
    { role: 'tool', content: JSON.stringify(result) }
  ],
  tools: tools
});
```
