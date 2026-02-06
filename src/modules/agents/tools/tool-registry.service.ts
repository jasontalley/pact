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
   * Check if a tool is registered
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
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
    // Structured readers for JSON and coverage reports
    this.registerStructuredReaders();
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

  /**
   * Register structured reader tools for parsing JSON and coverage reports
   */
  private registerStructuredReaders(): void {
    this.registerReadJsonTool();
    this.registerReadCoverageReportTool();
  }

  /**
   * Register read_json tool for parsing JSON files server-side
   */
  private registerReadJsonTool(): void {
    this.registerTool(
      {
        name: 'read_json',
        description:
          'Read and parse a JSON file server-side. Returns parsed structure with schema summary for large files. ' +
          'Use this instead of read_file for JSON files to get reliable parsing.',
        parameters: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the JSON file, relative to workspace root',
            },
            json_pointer: {
              type: 'string',
              description:
                'Optional: JSON Pointer to extract specific value (e.g., "/total/lines/pct" or "/coverage")',
            },
          },
          required: ['file_path'],
        },
      },
      {
        execute: async (_name, args) => {
          const filePath = path.resolve(this.rootDirectory, args.file_path as string);

          // Security: Ensure path is within workspace
          if (!filePath.startsWith(this.rootDirectory)) {
            return {
              parseSuccess: false,
              error: `Path ${args.file_path} is outside workspace root`,
            };
          }

          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const parsed = JSON.parse(content);
            const size = content.length;

            // If JSON pointer specified, extract that value
            if (args.json_pointer) {
              const extracted = this.extractJsonPointer(parsed, args.json_pointer as string);
              return {
                parseSuccess: true,
                pointer: args.json_pointer,
                value: extracted.value,
                found: extracted.found,
                size,
              };
            }

            // For small files, return full parsed content
            if (size < 5000) {
              return {
                parseSuccess: true,
                parsed,
                size,
                schema: this.summarizeJsonSchema(parsed),
              };
            }

            // For large files, return schema summary only
            return {
              parseSuccess: true,
              size,
              schema: this.summarizeJsonSchema(parsed),
              sample: this.extractJsonSample(parsed),
              note: 'File too large to return in full. Use json_pointer to extract specific values.',
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Check if it's a parse error vs file not found
            if (errorMessage.includes('ENOENT')) {
              return {
                parseSuccess: false,
                error: `File not found: ${args.file_path}`,
              };
            }

            return {
              parseSuccess: false,
              error: `JSON parse failed: ${errorMessage}`,
              hint: 'File may be malformed JSON or binary',
            };
          }
        },
      },
    );
  }

  /**
   * Register read_coverage_report tool for parsing coverage reports
   */
  private registerReadCoverageReportTool(): void {
    this.registerTool(
      {
        name: 'read_coverage_report',
        description:
          'Read and parse a coverage report file (Istanbul JSON, coverage-summary.json, or lcov). ' +
          'Returns structured metrics with totals. Use this for coverage data instead of read_file.',
        parameters: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the coverage report file, relative to workspace root',
            },
          },
          required: ['file_path'],
        },
      },
      {
        execute: async (_name, args) => {
          const filePath = path.resolve(this.rootDirectory, args.file_path as string);

          // Security: Ensure path is within workspace
          if (!filePath.startsWith(this.rootDirectory)) {
            return {
              parseSuccess: false,
              error: `Path ${args.file_path} is outside workspace root`,
            };
          }

          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const fileName = path.basename(filePath);

            // Detect format and parse accordingly
            if (fileName === 'coverage-summary.json' || fileName.includes('summary')) {
              return this.parseCoverageSummary(content, filePath);
            }

            if (filePath.endsWith('.json')) {
              return this.parseIstanbulJson(content, filePath);
            }

            if (filePath.endsWith('.lcov') || filePath.endsWith('.info')) {
              return this.parseLcov(content, filePath);
            }

            // Try to auto-detect format
            const trimmed = content.trim();
            if (trimmed.startsWith('{')) {
              // Try JSON formats
              try {
                const parsed = JSON.parse(content);
                if (parsed.total) {
                  return this.parseCoverageSummary(content, filePath);
                }
                return this.parseIstanbulJson(content, filePath);
              } catch {
                return {
                  parseSuccess: false,
                  error: 'Could not parse as JSON coverage format',
                };
              }
            }

            if (trimmed.startsWith('TN:') || trimmed.startsWith('SF:')) {
              return this.parseLcov(content, filePath);
            }

            return {
              parseSuccess: false,
              error:
                'Unknown coverage format. Supported: coverage-summary.json, Istanbul JSON, lcov',
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              parseSuccess: false,
              error: `Failed to read coverage report: ${errorMessage}`,
            };
          }
        },
      },
    );
  }

  /**
   * Extract value using JSON Pointer (RFC 6901)
   */
  private extractJsonPointer(obj: unknown, pointer: string): { found: boolean; value: unknown } {
    if (!pointer || pointer === '/') {
      return { found: true, value: obj };
    }

    const parts = pointer.split('/').filter((p) => p !== '');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return { found: false, value: undefined };
      }

      if (typeof current !== 'object') {
        return { found: false, value: undefined };
      }

      const key = part.replaceAll('~1', '/').replaceAll('~0', '~');

      if (Array.isArray(current)) {
        const index = Number.parseInt(key, 10);
        if (Number.isNaN(index) || index < 0 || index >= current.length) {
          return { found: false, value: undefined };
        }
        current = current[index];
      } else {
        const record = current as Record<string, unknown>;
        if (!(key in record)) {
          return { found: false, value: undefined };
        }
        current = record[key];
      }
    }

    return { found: true, value: current };
  }

  /**
   * Summarize JSON schema for large objects
   */
  private summarizeJsonSchema(obj: unknown): {
    type: string;
    topLevelKeys?: string[];
    schemaSummary: string;
    arrayLength?: number;
  } {
    if (obj === null) {
      return { type: 'null', schemaSummary: 'null value' };
    }

    if (Array.isArray(obj)) {
      return {
        type: 'array',
        arrayLength: obj.length,
        schemaSummary: `Array with ${obj.length} items`,
      };
    }

    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      return {
        type: 'object',
        topLevelKeys: keys.slice(0, 30),
        schemaSummary: `Object with ${keys.length} keys: ${keys.slice(0, 10).join(', ')}${keys.length > 10 ? '...' : ''}`,
      };
    }

    const objType = typeof obj;
    const objStr =
      obj === null || obj === undefined ? String(obj) : JSON.stringify(obj).slice(0, 100);
    return {
      type: objType,
      schemaSummary: `Primitive ${objType}: ${objStr}`,
    };
  }

  /**
   * Extract sample data from large JSON
   */
  private extractJsonSample(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      return obj.slice(0, 3);
    }

    if (typeof obj === 'object' && obj !== null) {
      const sample: Record<string, unknown> = {};
      const keys = Object.keys(obj);
      for (const key of keys.slice(0, 5)) {
        const value = (obj as Record<string, unknown>)[key];
        // Only include primitive values or summarize nested objects
        if (typeof value !== 'object' || value === null) {
          sample[key] = value;
        } else {
          sample[key] = Array.isArray(value)
            ? `[Array(${value.length})]`
            : `{Object(${Object.keys(value).length} keys)}`;
        }
      }
      return sample;
    }

    return obj;
  }

  /**
   * Parse coverage-summary.json format
   */
  private parseCoverageSummary(
    content: string,
    filePath: string,
  ): {
    parseSuccess: boolean;
    format: string;
    filePath: string;
    summary?: Record<string, unknown>;
    metrics?: Record<string, { total: number; covered: number; pct: number }>;
    error?: string;
  } {
    try {
      const parsed = JSON.parse(content);

      // Extract the total section which contains the summary
      const total = parsed.total;
      if (!total) {
        return {
          parseSuccess: false,
          format: 'coverage-summary',
          filePath,
          error: 'No "total" section found in coverage summary',
        };
      }

      const metrics: Record<string, { total: number; covered: number; pct: number }> = {};

      for (const key of ['lines', 'statements', 'functions', 'branches']) {
        if (total[key]) {
          metrics[key] = {
            total: total[key].total ?? 0,
            covered: total[key].covered ?? 0,
            pct: total[key].pct ?? 0,
          };
        }
      }

      return {
        parseSuccess: true,
        format: 'coverage-summary',
        filePath,
        summary: total,
        metrics,
      };
    } catch (error) {
      return {
        parseSuccess: false,
        format: 'coverage-summary',
        filePath,
        error: `Parse error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Aggregate Istanbul coverage for a single file
   */
  private aggregateIstanbulFileCoverage(
    fileCoverage: Record<string, unknown>,
    totals: {
      statements: { total: number; covered: number };
      functions: { total: number; covered: number };
      branches: { total: number; covered: number };
    },
  ): void {
    // Statements
    const statements = fileCoverage.s as Record<string, number> | undefined;
    if (statements) {
      const stmtKeys = Object.keys(statements);
      totals.statements.total += stmtKeys.length;
      totals.statements.covered += stmtKeys.filter((k) => statements[k] > 0).length;
    }

    // Functions
    const functions = fileCoverage.f as Record<string, number> | undefined;
    if (functions) {
      const fnKeys = Object.keys(functions);
      totals.functions.total += fnKeys.length;
      totals.functions.covered += fnKeys.filter((k) => functions[k] > 0).length;
    }

    // Branches
    const branches = fileCoverage.b as Record<string, number[]> | undefined;
    if (branches) {
      for (const branch of Object.values(branches)) {
        if (Array.isArray(branch)) {
          totals.branches.total += branch.length;
          totals.branches.covered += branch.filter((count) => count > 0).length;
        }
      }
    }
  }

  /**
   * Calculate coverage percentages from totals
   */
  private calculateCoveragePercentages(
    totals: Record<string, { total: number; covered: number }>,
  ): Record<string, { total: number; covered: number; pct: number }> {
    const metrics: Record<string, { total: number; covered: number; pct: number }> = {};
    for (const [key, value] of Object.entries(totals)) {
      metrics[key] = {
        total: value.total,
        covered: value.covered,
        pct: value.total > 0 ? Math.round((value.covered / value.total) * 10000) / 100 : 100,
      };
    }
    return metrics;
  }

  /**
   * Parse Istanbul JSON coverage format
   */
  private parseIstanbulJson(
    content: string,
    filePath: string,
  ): {
    parseSuccess: boolean;
    format: string;
    filePath: string;
    fileCount?: number;
    metrics?: Record<string, { total: number; covered: number; pct: number }>;
    error?: string;
  } {
    try {
      const parsed = JSON.parse(content);
      const files = Object.keys(parsed);

      const totals = {
        lines: { total: 0, covered: 0 },
        statements: { total: 0, covered: 0 },
        functions: { total: 0, covered: 0 },
        branches: { total: 0, covered: 0 },
      };

      for (const file of files) {
        this.aggregateIstanbulFileCoverage(parsed[file], totals);
      }

      return {
        parseSuccess: true,
        format: 'istanbul',
        filePath,
        fileCount: files.length,
        metrics: this.calculateCoveragePercentages(totals),
      };
    } catch (error) {
      return {
        parseSuccess: false,
        format: 'istanbul',
        filePath,
        error: `Parse error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Parse lcov format
   */
  private parseLcov(
    content: string,
    filePath: string,
  ): {
    parseSuccess: boolean;
    format: string;
    filePath: string;
    fileCount?: number;
    metrics?: Record<string, { total: number; covered: number; pct: number }>;
    error?: string;
  } {
    try {
      const lines = content.split('\n');
      const totals = {
        lines: { total: 0, covered: 0 },
        functions: { total: 0, covered: 0 },
        branches: { total: 0, covered: 0 },
      };

      let fileCount = 0;

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('SF:')) {
          fileCount++;
        } else if (trimmed.startsWith('LF:')) {
          totals.lines.total += Number.parseInt(trimmed.slice(3), 10) || 0;
        } else if (trimmed.startsWith('LH:')) {
          totals.lines.covered += Number.parseInt(trimmed.slice(3), 10) || 0;
        } else if (trimmed.startsWith('FNF:')) {
          totals.functions.total += Number.parseInt(trimmed.slice(4), 10) || 0;
        } else if (trimmed.startsWith('FNH:')) {
          totals.functions.covered += Number.parseInt(trimmed.slice(4), 10) || 0;
        } else if (trimmed.startsWith('BRF:')) {
          totals.branches.total += Number.parseInt(trimmed.slice(4), 10) || 0;
        } else if (trimmed.startsWith('BRH:')) {
          totals.branches.covered += Number.parseInt(trimmed.slice(4), 10) || 0;
        }
      }

      // Calculate percentages
      const metrics: Record<string, { total: number; covered: number; pct: number }> = {};
      for (const [key, value] of Object.entries(totals)) {
        metrics[key] = {
          total: value.total,
          covered: value.covered,
          pct: value.total > 0 ? Math.round((value.covered / value.total) * 10000) / 100 : 100,
        };
      }

      return {
        parseSuccess: true,
        format: 'lcov',
        filePath,
        fileCount,
        metrics,
      };
    } catch (error) {
      return {
        parseSuccess: false,
        format: 'lcov',
        filePath,
        error: `Parse error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
