/**
 * Tool Registry Service
 *
 * Centralized registry for all agent tools, including:
 * - Custom Pact tools (atom management, etc.)
 * - LangChain standard tools (file system, etc.)
 * - Converted tools from various sources
 *
 * This provides a unified interface for all agents to access tools.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ToolDefinition } from '../../../common/llm/providers/types';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Tool executor interface - all tools must implement this
 */
export interface ToolExecutor {
  execute(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/**
 * Tool registry that manages all available tools
 */
@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private tools: Map<string, ToolDefinition> = new Map();
  private executors: Map<string, ToolExecutor> = new Map();
  private rootDirectory: string;

  constructor() {
    // Set root directory to workspace root (one level up from src)
    this.rootDirectory = path.resolve(__dirname, '../../../../');
    this.initializeStandardTools();
  }

  /**
   * Register a custom tool
   */
  registerTool(definition: ToolDefinition, executor: ToolExecutor): void {
    if (this.tools.has(definition.name)) {
      this.logger.warn(`Tool ${definition.name} already registered, overwriting`);
    }
    this.tools.set(definition.name, definition);
    this.executors.set(definition.name, executor);
    this.logger.log(`Registered tool: ${definition.name}`);
  }

  /**
   * Get all registered tools as ToolDefinition array
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool definition
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Execute a tool
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const executor = this.executors.get(name);
    if (!executor) {
      throw new Error(`Tool ${name} not found`);
    }
    return executor.execute(name, args);
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: 'atom' | 'filesystem' | 'code' | 'all'): ToolDefinition[] {
    if (category === 'all') {
      return this.getAllTools();
    }

    // Categorize tools by name prefix or description
    return this.getAllTools().filter((tool) => {
      if (category === 'atom') {
        return (
          tool.name.includes('atom') || tool.name.includes('intent') || tool.name.includes('refine')
        );
      }
      if (category === 'filesystem') {
        return (
          tool.name.includes('file') ||
          tool.name.includes('directory') ||
          tool.name.includes('read') ||
          tool.name.includes('write') ||
          tool.name.includes('grep') ||
          tool.name.includes('list')
        );
      }
      if (category === 'code') {
        return (
          tool.name.includes('grep') || tool.name.includes('search') || tool.name.includes('code')
        );
      }
      return false;
    });
  }

  /**
   * Initialize standard tools (file system tools from LangChain)
   */
  private initializeStandardTools(): void {
    // File System Tools
    this.registerFileSystemTools();
  }

  /**
   * Register file system tools (converted from LangChain)
   */
  private registerFileSystemTools(): void {
    // Read File Tool
    this.registerTool(
      {
        name: 'read_file',
        description:
          'Read the contents of a file. Use this to examine code, documentation, or any file in the codebase.',
        parameters: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the file to read, relative to the workspace root',
            },
            start_line: {
              type: 'number',
              description:
                'Optional: Start line number (1-indexed). If not provided, reads entire file.',
            },
            end_line: {
              type: 'number',
              description:
                'Optional: End line number (1-indexed). If not provided, reads entire file.',
            },
          },
          required: ['file_path'],
        },
      },
      {
        execute: async (name, args) => {
          const filePath = path.resolve(this.rootDirectory, args.file_path as string);

          // Security: Ensure path is within workspace
          if (!filePath.startsWith(this.rootDirectory)) {
            throw new Error(`Path ${args.file_path} is outside workspace root`);
          }

          try {
            const content = await fs.readFile(filePath, 'utf-8');

            // If line numbers specified, extract those lines
            if (args.start_line || args.end_line) {
              const lines = content.split('\n');
              const start = (args.start_line as number) ? (args.start_line as number) - 1 : 0;
              const end = (args.end_line as number) || lines.length;
              const selectedLines = lines.slice(start, end);

              return {
                content: selectedLines.join('\n'),
                start_line: start + 1,
                end_line: end,
                total_lines: lines.length,
              };
            }

            return {
              content,
              total_lines: content.split('\n').length,
            };
          } catch (error) {
            throw new Error(`Failed to read file ${args.file_path}: ${error.message}`);
          }
        },
      },
    );

    // List Directory Tool
    this.registerTool(
      {
        name: 'list_directory',
        description:
          'List files and directories in a given path. Use this to explore the codebase structure.',
        parameters: {
          type: 'object',
          properties: {
            directory_path: {
              type: 'string',
              description:
                'Path to the directory to list, relative to workspace root. Defaults to root if not provided.',
            },
            include_hidden: {
              type: 'boolean',
              description: 'Whether to include hidden files (starting with .). Defaults to false.',
            },
          },
        },
      },
      {
        execute: async (name, args) => {
          const dirPath = args.directory_path
            ? path.resolve(this.rootDirectory, args.directory_path as string)
            : this.rootDirectory;

          // Security: Ensure path is within workspace
          if (!dirPath.startsWith(this.rootDirectory)) {
            throw new Error(`Path ${args.directory_path} is outside workspace root`);
          }

          try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            const includeHidden = args.include_hidden === true;

            const items = entries
              .filter((entry) => includeHidden || !entry.name.startsWith('.'))
              .map((entry) => ({
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file',
                path: path.relative(this.rootDirectory, path.join(dirPath, entry.name)),
              }));

            return {
              path: path.relative(this.rootDirectory, dirPath),
              items,
              count: items.length,
            };
          } catch (error) {
            throw new Error(
              `Failed to list directory ${args.directory_path || 'root'}: ${error.message}`,
            );
          }
        },
      },
    );

    // Grep Tool (search file contents)
    this.registerTool(
      {
        name: 'grep',
        description:
          'Search for a pattern in files. Use this to find where code, functions, or text appear in the codebase.',
        parameters: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'The search pattern (regex supported)',
            },
            directory_path: {
              type: 'string',
              description: 'Directory to search in, relative to workspace root. Defaults to root.',
            },
            file_pattern: {
              type: 'string',
              description:
                'Optional: File pattern to match (e.g., "*.ts", "*.md"). Defaults to all files.',
            },
            max_results: {
              type: 'number',
              description: 'Maximum number of results to return. Defaults to 50.',
            },
            case_sensitive: {
              type: 'boolean',
              description: 'Whether search is case sensitive. Defaults to false.',
            },
          },
          required: ['pattern'],
        },
      },
      {
        execute: async (name, args) => {
          const searchDir = args.directory_path
            ? path.resolve(this.rootDirectory, args.directory_path as string)
            : this.rootDirectory;

          // Security: Ensure path is within workspace
          if (!searchDir.startsWith(this.rootDirectory)) {
            throw new Error(`Path ${args.directory_path} is outside workspace root`);
          }

          const pattern = args.pattern as string;
          const filePattern = (args.file_pattern as string) || '*';
          const maxResults = (args.max_results as number) || 50;
          const caseSensitive = args.case_sensitive === true;

          try {
            const results = await this.grepRecursive(
              searchDir,
              pattern,
              filePattern,
              caseSensitive,
              maxResults,
            );
            return {
              pattern,
              directory: path.relative(this.rootDirectory, searchDir),
              results,
              count: results.length,
            };
          } catch (error) {
            throw new Error(`Grep failed: ${error.message}`);
          }
        },
      },
    );
  }

  /**
   * Recursive grep implementation
   */
  private async grepRecursive(
    dir: string,
    pattern: string,
    filePattern: string,
    caseSensitive: boolean,
    maxResults: number,
  ): Promise<Array<{ file: string; line: number; content: string }>> {
    const results: Array<{ file: string; line: number; content: string }> = [];
    const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');

    async function searchDirectory(currentDir: string): Promise<void> {
      if (results.length >= maxResults) return;

      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          if (results.length >= maxResults) break;

          const fullPath = path.join(currentDir, entry.name);

          // Skip node_modules, .git, dist, etc.
          if (
            entry.name === 'node_modules' ||
            entry.name === '.git' ||
            entry.name === 'dist' ||
            entry.name === 'build'
          ) {
            continue;
          }

          if (entry.isDirectory()) {
            await searchDirectory(fullPath);
          } else if (entry.isFile()) {
            // Check file pattern match
            if (this.matchesPattern(entry.name, filePattern)) {
              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                const lines = content.split('\n');

                for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                  if (regex.test(lines[i])) {
                    results.push({
                      file: path.relative(this.rootDirectory, fullPath),
                      line: i + 1,
                      content: lines[i].trim(),
                    });
                    // Reset regex lastIndex for next file
                    regex.lastIndex = 0;
                  }
                }
              } catch {
                // Skip files that can't be read (binary, etc.)
              }
            }
          }
        }
      } catch {
        // Skip directories that can't be read
      }
    }

    await searchDirectory(dir);
    return results;
  }

  /**
   * Check if filename matches pattern (simple glob support)
   */
  private matchesPattern(filename: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1); // Remove '*'
      return filename.endsWith(ext);
    }
    // Simple exact match for now
    return filename === pattern || filename.includes(pattern);
  }
}
