# Unified Tool System

## Overview

The tool system provides a centralized registry for all agent tools, allowing any agent to access both custom Pact tools and standard tools (like file system operations from LangChain).

## Architecture

```
ToolRegistryService (Singleton)
  ├─ Registers all tools
  ├─ Manages tool definitions
  └─ Executes tools via executors

AtomToolsService
  └─ Executes atom management operations

File System Tools (Built-in)
  ├─ read_file
  ├─ list_directory
  └─ grep
```

## Components

### ToolRegistryService

Central registry that:
- Manages all tool definitions (`ToolDefinition[]`)
- Routes tool execution to appropriate executors
- Provides tool discovery and filtering
- Automatically includes file system tools

### AtomToolsService

Executes all atom-related operations:
- `analyze_intent` - Analyze raw intent
- `count_atoms` - Get atom count
- `get_statistics` - Get atom statistics
- `search_atoms` - Search atoms
- `list_atoms` - List atoms with pagination
- `get_atom` - Get atom by ID
- `refine_atom` - Get refinement suggestions
- `create_atom` - Create new atom
- `update_atom` - Update draft atom
- `commit_atom` - Commit atom
- `delete_atom` - Delete draft atom
- `get_popular_tags` - Get popular tags

### File System Tools

Built-in tools for codebase exploration:
- `read_file` - Read file contents (with optional line range)
- `list_directory` - List directory contents
- `grep` - Search for patterns in files

## Usage

### In an Agent Service

```typescript
@Injectable()
export class MyAgentService {
  constructor(
    private readonly toolRegistry: ToolRegistryService,
  ) {}

  async doSomething() {
    // Get all available tools
    const tools = this.toolRegistry.getAllTools();
    
    // Get tools by category
    const atomTools = this.toolRegistry.getToolsByCategory('atom');
    const fileTools = this.toolRegistry.getToolsByCategory('filesystem');
    
    // Execute a tool
    const result = await this.toolRegistry.executeTool('read_file', {
      file_path: 'src/modules/agents/chat-agent.service.ts',
      start_line: 1,
      end_line: 50,
    });
  }
}
```

### Registering Custom Tools

```typescript
// In agents.module.ts onModuleInit
onModuleInit() {
  // Register custom tool
  this.toolRegistry.registerTool(
    {
      name: 'my_custom_tool',
      description: 'Does something custom',
      parameters: {
        type: 'object',
        properties: {
          param1: { type: 'string', description: 'Parameter 1' },
        },
        required: ['param1'],
      },
    },
    {
      execute: async (name, args) => {
        // Tool implementation
        return { result: 'success' };
      },
    },
  );
}
```

## Security

### File System Tools

- All file paths are validated to ensure they're within the workspace root
- Path traversal attacks are prevented
- Hidden files are excluded by default (can be enabled with `include_hidden: true`)
- Large files are handled with line range support

### Tool Execution

- Tools are executed through the registry, providing a single point of control
- All tool executions are logged
- Errors are caught and returned as structured responses

## Adding New Tools

1. **Define the tool** in a definitions file (e.g., `atom-tools.definitions.ts`)
2. **Create an executor** that implements `ToolExecutor` interface
3. **Register the tool** in `agents.module.ts` `onModuleInit()`

Example:

```typescript
// 1. Define tool
export const MY_TOOLS: ToolDefinition[] = [
  {
    name: 'my_tool',
    description: 'My tool description',
    parameters: { /* ... */ },
  },
];

// 2. Create executor
@Injectable()
export class MyToolsService implements ToolExecutor {
  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'my_tool':
        return this.doSomething(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}

// 3. Register in module
onModuleInit() {
  for (const toolDef of MY_TOOLS) {
    this.toolRegistry.registerTool(toolDef, this.myToolsService);
  }
}
```

## Benefits

1. **Unified Interface**: All agents use the same tool system
2. **Reusability**: Tools can be shared across agents
3. **Extensibility**: Easy to add new tools
4. **Type Safety**: TypeScript ensures tool definitions match executors
5. **Security**: Centralized validation and execution control
6. **Standard Tools**: File system tools from LangChain are included automatically

## Future Enhancements

- Tool permissions/authorization
- Tool usage analytics
- Tool caching for expensive operations
- Tool composition (tools that call other tools)
- MCP tool integration
- More LangChain tools (web search, database, etc.)
