/**
 * Graph Registry Service Tests
 *
 * Tests for the centralized graph registry that manages LangGraph state machines.
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { GraphRegistryService, GraphConfig } from './graph-registry.service';
import { LLMService } from '../../../common/llm/llm.service';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { CompiledStateGraph, StateGraph, Annotation, START, END } from '@langchain/langgraph';

describe('GraphRegistryService', () => {
  let service: GraphRegistryService;
  let mockLLMService: jest.Mocked<LLMService>;
  let mockToolRegistry: jest.Mocked<ToolRegistryService>;

  // Create a simple test graph
  const TestState = Annotation.Root({
    input: Annotation<string>({ reducer: (_, u) => u, default: () => '' }),
    output: Annotation<string | null>({ reducer: (_, u) => u, default: () => null }),
  });

  function createTestGraph() {
    const builder = new StateGraph(TestState) as any;
    builder.addNode('process', (state: typeof TestState.State) => ({
      output: `Processed: ${state.input}`,
    }));
    builder.addEdge(START, 'process');
    builder.addEdge('process', END);
    return builder.compile();
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    mockLLMService = {
      invoke: jest.fn(),
    } as unknown as jest.Mocked<LLMService>;

    mockToolRegistry = {
      getAllTools: jest.fn().mockReturnValue([]),
      getToolsByCategory: jest.fn().mockReturnValue([]),
      executeTool: jest.fn(),
    } as unknown as jest.Mocked<ToolRegistryService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GraphRegistryService,
        { provide: LLMService, useValue: mockLLMService },
        { provide: ToolRegistryService, useValue: mockToolRegistry },
      ],
    }).compile();

    service = module.get<GraphRegistryService>(GraphRegistryService);
  });

  describe('registerGraph', () => {
    it('should register a new graph successfully', () => {
      const graph = createTestGraph();
      const config: Omit<GraphConfig, 'name'> = {
        description: 'Test graph',
        stateType: 'TestState',
        pattern: 'custom',
      };

      service.registerGraph('test-graph', graph, config);

      expect(service.hasGraph('test-graph')).toBe(true);
    });

    it('should overwrite existing graph with same name', () => {
      const graph1 = createTestGraph();
      const graph2 = createTestGraph();
      const config: Omit<GraphConfig, 'name'> = {
        description: 'Test graph',
        stateType: 'TestState',
        pattern: 'custom',
      };

      service.registerGraph('test-graph', graph1, config);
      service.registerGraph('test-graph', graph2, config);

      expect(service.hasGraph('test-graph')).toBe(true);
      // Should log a warning about overwriting
    });

    it('should store graph configuration', () => {
      const graph = createTestGraph();
      const config: Omit<GraphConfig, 'name'> = {
        description: 'Test graph for processing',
        stateType: 'TestState',
        pattern: 'react',
      };

      service.registerGraph('test-graph', graph, config);
      const retrievedConfig = service.getGraphConfig('test-graph');

      expect(retrievedConfig).toEqual({
        name: 'test-graph',
        description: 'Test graph for processing',
        stateType: 'TestState',
        pattern: 'react',
      });
    });
  });

  describe('getGraph', () => {
    it('should return registered graph', () => {
      const graph = createTestGraph();
      service.registerGraph('test-graph', graph, {
        description: 'Test',
        stateType: 'TestState',
        pattern: 'custom',
      });

      const retrieved = service.getGraph('test-graph');

      expect(retrieved).toBeDefined();
    });

    it('should return undefined for non-existent graph', () => {
      const graph = service.getGraph('non-existent');

      expect(graph).toBeUndefined();
    });
  });

  describe('hasGraph', () => {
    it('should return true for registered graph', () => {
      const graph = createTestGraph();
      service.registerGraph('test-graph', graph, {
        description: 'Test',
        stateType: 'TestState',
        pattern: 'custom',
      });

      expect(service.hasGraph('test-graph')).toBe(true);
    });

    it('should return false for non-existent graph', () => {
      expect(service.hasGraph('non-existent')).toBe(false);
    });
  });

  describe('listGraphs', () => {
    it('should return empty array when no graphs registered', () => {
      const graphs = service.listGraphs();

      expect(graphs).toEqual([]);
    });

    it('should return all registered graph configs', () => {
      const graph1 = createTestGraph();
      const graph2 = createTestGraph();

      service.registerGraph('graph-1', graph1, {
        description: 'First graph',
        stateType: 'TestState',
        pattern: 'react',
      });
      service.registerGraph('graph-2', graph2, {
        description: 'Second graph',
        stateType: 'TestState',
        pattern: 'plan-execute',
      });

      const graphs = service.listGraphs();

      expect(graphs).toHaveLength(2);
      expect(graphs.map((g) => g.name)).toContain('graph-1');
      expect(graphs.map((g) => g.name)).toContain('graph-2');
    });
  });

  describe('getGraphConfig', () => {
    it('should return config for registered graph', () => {
      const graph = createTestGraph();
      service.registerGraph('test-graph', graph, {
        description: 'Test description',
        stateType: 'TestState',
        pattern: 'custom',
      });

      const config = service.getGraphConfig('test-graph');

      expect(config).toBeDefined();
      expect(config?.name).toBe('test-graph');
      expect(config?.description).toBe('Test description');
    });

    it('should return undefined for non-existent graph', () => {
      const config = service.getGraphConfig('non-existent');

      expect(config).toBeUndefined();
    });
  });

  describe('invoke', () => {
    it('should invoke registered graph with input', async () => {
      const graph = createTestGraph();
      service.registerGraph('test-graph', graph, {
        description: 'Test',
        stateType: 'TestState',
        pattern: 'custom',
      });

      const result = await service.invoke<{ input: string }, { output: string }>('test-graph', {
        input: 'hello',
      });

      expect(result.output).toBe('Processed: hello');
    });

    it('should throw error for non-existent graph', async () => {
      await expect(service.invoke('non-existent', { input: 'test' })).rejects.toThrow(
        "Graph 'non-existent' not found in registry",
      );
    });

    it('should pass thread_id when provided', async () => {
      const graph = createTestGraph();
      service.registerGraph('test-graph', graph, {
        description: 'Test',
        stateType: 'TestState',
        pattern: 'custom',
      });

      // Should not throw even with threadId (checkpointer not required for this test)
      const result = await service.invoke<{ input: string }, { output: string }>(
        'test-graph',
        { input: 'hello' },
        { threadId: 'thread-123' },
      );

      expect(result.output).toBe('Processed: hello');
    });

    it('should pass configurable options', async () => {
      const graph = createTestGraph();
      service.registerGraph('test-graph', graph, {
        description: 'Test',
        stateType: 'TestState',
        pattern: 'custom',
      });

      const result = await service.invoke<{ input: string }, { output: string }>(
        'test-graph',
        { input: 'hello' },
        { configurable: { customOption: 'value' } },
      );

      expect(result.output).toBe('Processed: hello');
    });
  });

  describe('getNodeConfig', () => {
    it('should return node configuration with dependencies', () => {
      const nodeConfig = service.getNodeConfig();

      expect(nodeConfig).toBeDefined();
      expect(nodeConfig.llmService).toBe(mockLLMService);
      expect(nodeConfig.toolRegistry).toBe(mockToolRegistry);
      expect(nodeConfig.logger).toBeDefined();
    });
  });

  describe('onModuleInit', () => {
    it('should initialize graphs on module init', async () => {
      // After module creation, the service should call onModuleInit automatically
      // which imports and registers the chat-exploration graph
      await service.onModuleInit();

      // After initialization, the chat-exploration graph should be registered
      expect(service.hasGraph('chat-exploration')).toBe(true);
    });

    it('should register reconciliation graph on module init', async () => {
      await service.onModuleInit();

      // The reconciliation graph should be registered
      expect(service.hasGraph('reconciliation')).toBe(true);
    });
  });

  describe('LangSmith tracing options', () => {
    it('should include runName in invoke config by default', async () => {
      const graph = createTestGraph();
      const invokeSpy = jest.spyOn(graph, 'invoke');
      service.registerGraph('test-graph', graph, {
        description: 'Test',
        stateType: 'TestState',
        pattern: 'custom',
      });

      await service.invoke('test-graph', { input: 'hello' });

      // Verify that runName is passed in config
      expect(invokeSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          runName: 'graph:test-graph',
        }),
      );
    });

    it('should include tags in invoke config', async () => {
      const graph = createTestGraph();
      const invokeSpy = jest.spyOn(graph, 'invoke');
      service.registerGraph('test-graph', graph, {
        description: 'Test',
        stateType: 'TestState',
        pattern: 'custom',
      });

      await service.invoke('test-graph', { input: 'hello' });

      // Verify that tags include langgraph and graph name
      expect(invokeSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tags: expect.arrayContaining(['langgraph', 'test-graph']),
        }),
      );
    });

    it('should include metadata with graphName in invoke config', async () => {
      const graph = createTestGraph();
      const invokeSpy = jest.spyOn(graph, 'invoke');
      service.registerGraph('test-graph', graph, {
        description: 'Test',
        stateType: 'TestState',
        pattern: 'react',
      });

      await service.invoke('test-graph', { input: 'hello' });

      // Verify that metadata includes graph info
      expect(invokeSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: expect.objectContaining({
            graphName: 'test-graph',
            graphPattern: 'react',
          }),
        }),
      );
    });

    it('should allow custom runName to override default', async () => {
      const graph = createTestGraph();
      const invokeSpy = jest.spyOn(graph, 'invoke');
      service.registerGraph('test-graph', graph, {
        description: 'Test',
        stateType: 'TestState',
        pattern: 'custom',
      });

      await service.invoke('test-graph', { input: 'hello' }, { runName: 'custom-run-name' });

      expect(invokeSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          runName: 'custom-run-name',
        }),
      );
    });

    it('should merge custom tags with default tags', async () => {
      const graph = createTestGraph();
      const invokeSpy = jest.spyOn(graph, 'invoke');
      service.registerGraph('test-graph', graph, {
        description: 'Test',
        stateType: 'TestState',
        pattern: 'custom',
      });

      await service.invoke('test-graph', { input: 'hello' }, { tags: ['custom-tag'] });

      expect(invokeSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tags: expect.arrayContaining(['langgraph', 'test-graph', 'custom-tag']),
        }),
      );
    });

    it('should merge custom metadata with default metadata', async () => {
      const graph = createTestGraph();
      const invokeSpy = jest.spyOn(graph, 'invoke');
      service.registerGraph('test-graph', graph, {
        description: 'Test',
        stateType: 'TestState',
        pattern: 'custom',
      });

      await service.invoke('test-graph', { input: 'hello' }, { metadata: { userId: 'user-123' } });

      expect(invokeSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: expect.objectContaining({
            graphName: 'test-graph',
            userId: 'user-123',
          }),
        }),
      );
    });
  });

  describe('invoke with thread_id and configurable', () => {
    it('should combine thread_id with other configurable options', async () => {
      const graph = createTestGraph();
      const invokeSpy = jest.spyOn(graph, 'invoke');
      service.registerGraph('test-graph', graph, {
        description: 'Test',
        stateType: 'TestState',
        pattern: 'custom',
      });

      await service.invoke(
        'test-graph',
        { input: 'hello' },
        {
          threadId: 'thread-abc',
          configurable: { customKey: 'customValue' },
        },
      );

      expect(invokeSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          configurable: expect.objectContaining({
            thread_id: 'thread-abc',
            customKey: 'customValue',
          }),
        }),
      );
    });
  });
});
