/**
 * Tool Registry Service Tests
 *
 * Tests for the centralized tool registry service.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ToolRegistryService, ToolExecutor } from './tool-registry.service';
import { ToolDefinition } from '../../../common/llm/providers/types';

describe('ToolRegistryService', () => {
  let service: ToolRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ToolRegistryService],
    }).compile();

    service = module.get<ToolRegistryService>(ToolRegistryService);
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize with standard tools', () => {
      const tools = service.getAllTools();
      expect(tools.length).toBeGreaterThan(0);

      // Check for expected standard tools
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('read_file');
      expect(toolNames).toContain('list_directory');
      expect(toolNames).toContain('grep');
      expect(toolNames).toContain('read_json');
      expect(toolNames).toContain('read_coverage_report');
    });
  });

  describe('registerTool', () => {
    it('should register a custom tool', () => {
      const customTool: ToolDefinition = {
        name: 'custom_tool',
        description: 'A custom test tool',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Input value' },
          },
          required: ['input'],
        },
      };

      const executor: ToolExecutor = {
        execute: async (name, args) => ({ result: args.input }),
      };

      service.registerTool(customTool, executor);

      const tool = service.getTool('custom_tool');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('custom_tool');
    });

    it('should overwrite existing tool with same name', () => {
      const tool1: ToolDefinition = {
        name: 'overwrite_test',
        description: 'First version',
        parameters: { type: 'object', properties: {} },
      };

      const tool2: ToolDefinition = {
        name: 'overwrite_test',
        description: 'Second version',
        parameters: { type: 'object', properties: {} },
      };

      service.registerTool(tool1, { execute: async () => 'v1' });
      service.registerTool(tool2, { execute: async () => 'v2' });

      const tool = service.getTool('overwrite_test');
      expect(tool?.description).toBe('Second version');
    });
  });

  describe('getAllTools', () => {
    it('should return array of all registered tools', () => {
      const tools = service.getAllTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.every((t) => t.name && t.description)).toBe(true);
    });
  });

  describe('getTool', () => {
    it('should return tool by name', () => {
      const tool = service.getTool('read_file');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('read_file');
    });

    it('should return undefined for non-existent tool', () => {
      const tool = service.getTool('non_existent_tool');
      expect(tool).toBeUndefined();
    });
  });

  describe('executeTool', () => {
    it('should execute a registered tool', async () => {
      const customTool: ToolDefinition = {
        name: 'exec_test',
        description: 'Test execution',
        parameters: { type: 'object', properties: {} },
      };

      service.registerTool(customTool, {
        execute: async (name, args) => ({ executed: true, args }),
      });

      const result = (await service.executeTool('exec_test', {
        value: 42,
      })) as Record<string, unknown>;
      expect(result.executed).toBe(true);
      expect(result.args).toEqual({ value: 42 });
    });

    it('should throw error for non-existent tool', async () => {
      await expect(service.executeTool('non_existent', {})).rejects.toThrow(
        'Tool non_existent not found',
      );
    });
  });

  describe('getToolsByCategory', () => {
    it('should return all tools when category is "all"', () => {
      const allTools = service.getAllTools();
      const categoryTools = service.getToolsByCategory('all');
      expect(categoryTools.length).toBe(allTools.length);
    });

    it('should return filesystem tools', () => {
      const tools = service.getToolsByCategory('filesystem');
      expect(tools.length).toBeGreaterThan(0);

      for (const tool of tools) {
        const hasFileKeyword =
          tool.name.includes('file') ||
          tool.name.includes('directory') ||
          tool.name.includes('read') ||
          tool.name.includes('write') ||
          tool.name.includes('grep') ||
          tool.name.includes('list');
        expect(hasFileKeyword).toBe(true);
      }
    });

    it('should return code tools', () => {
      const tools = service.getToolsByCategory('code');

      for (const tool of tools) {
        const hasCodeKeyword =
          tool.name.includes('grep') || tool.name.includes('search') || tool.name.includes('code');
        expect(hasCodeKeyword).toBe(true);
      }
    });

    it('should return atom tools when category is "atom"', () => {
      // Register an atom tool first
      const atomTool: ToolDefinition = {
        name: 'create_atom',
        description: 'Create an intent atom',
        parameters: { type: 'object', properties: {} },
      };
      service.registerTool(atomTool, { execute: async () => ({}) });

      const tools = service.getToolsByCategory('atom');
      expect(tools.some((t) => t.name.includes('atom'))).toBe(true);
    });
  });

  describe('read_file tool', () => {
    it('should have correct parameters', () => {
      const tool = service.getTool('read_file');
      expect(tool).toBeDefined();
      expect(tool?.parameters.properties.file_path).toBeDefined();
      expect(tool?.parameters.properties.start_line).toBeDefined();
      expect(tool?.parameters.properties.end_line).toBeDefined();
    });

    it('should reject paths outside workspace', async () => {
      await expect(
        service.executeTool('read_file', { file_path: '../../etc/passwd' }),
      ).rejects.toThrow('outside workspace root');
    });
  });

  describe('list_directory tool', () => {
    it('should have correct parameters', () => {
      const tool = service.getTool('list_directory');
      expect(tool).toBeDefined();
      expect(tool?.parameters.properties.directory_path).toBeDefined();
      expect(tool?.parameters.properties.include_hidden).toBeDefined();
    });

    it('should reject paths outside workspace', async () => {
      await expect(
        service.executeTool('list_directory', { directory_path: '../../' }),
      ).rejects.toThrow('outside workspace root');
    });
  });

  describe('grep tool', () => {
    it('should have correct parameters', () => {
      const tool = service.getTool('grep');
      expect(tool).toBeDefined();
      expect(tool?.parameters.properties.pattern).toBeDefined();
      expect(tool?.parameters.properties.directory_path).toBeDefined();
      expect(tool?.parameters.properties.file_pattern).toBeDefined();
      expect(tool?.parameters.properties.max_results).toBeDefined();
      expect(tool?.parameters.properties.case_sensitive).toBeDefined();
    });

    it('should reject paths outside workspace', async () => {
      await expect(
        service.executeTool('grep', { pattern: 'test', directory_path: '../../' }),
      ).rejects.toThrow('outside workspace root');
    });
  });

  describe('read_json tool', () => {
    it('should have correct parameters', () => {
      const tool = service.getTool('read_json');
      expect(tool).toBeDefined();
      expect(tool?.parameters.properties.file_path).toBeDefined();
      expect(tool?.parameters.properties.json_pointer).toBeDefined();
    });

    it('should return error for paths outside workspace', async () => {
      const result = (await service.executeTool('read_json', {
        file_path: '../../etc/passwd',
      })) as Record<string, unknown>;
      expect(result.parseSuccess).toBe(false);
      expect(result.error).toContain('outside workspace root');
    });

    it('should return error for non-existent file', async () => {
      const result = (await service.executeTool('read_json', {
        file_path: 'non_existent_file.json',
      })) as Record<string, unknown>;
      expect(result.parseSuccess).toBe(false);
    });
  });

  describe('read_coverage_report tool', () => {
    it('should have correct parameters', () => {
      const tool = service.getTool('read_coverage_report');
      expect(tool).toBeDefined();
      expect(tool?.parameters.properties.file_path).toBeDefined();
    });

    it('should return error for paths outside workspace', async () => {
      const result = (await service.executeTool('read_coverage_report', {
        file_path: '../../etc/passwd',
      })) as Record<string, unknown>;
      expect(result.parseSuccess).toBe(false);
      expect(result.error).toContain('outside workspace root');
    });

    it('should return error for non-existent file', async () => {
      const result = (await service.executeTool('read_coverage_report', {
        file_path: 'non_existent_coverage.json',
      })) as Record<string, unknown>;
      expect(result.parseSuccess).toBe(false);
    });
  });
});
