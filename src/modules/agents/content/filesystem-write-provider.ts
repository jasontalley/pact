import * as fs from 'fs';
import * as path from 'path';
import {
  WriteProvider,
  FilePatch,
  PatchResult,
  BatchPatchResult,
} from './write-provider.interface';

/**
 * FilesystemWriteProvider - writes directly to the local filesystem
 *
 * Used in co-located mode where Pact runs on the same machine as the project.
 */
export class FilesystemWriteProvider implements WriteProvider {
  readonly providerType = 'filesystem' as const;

  constructor(private readonly basePath?: string) {}

  /**
   * Resolve a path relative to the base path (if set)
   */
  private resolvePath(filePath: string): string {
    if (this.basePath && !path.isAbsolute(filePath)) {
      return path.join(this.basePath, filePath);
    }
    return filePath;
  }

  /**
   * Write content to a file (overwrite)
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const resolvedPath = this.resolvePath(filePath);

    // Ensure directory exists
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolvedPath, content, 'utf-8');
  }

  /**
   * Insert a line at a specific position
   */
  async insertLine(filePath: string, lineNumber: number, content: string): Promise<void> {
    const resolvedPath = this.resolvePath(filePath);
    const existingContent = fs.readFileSync(resolvedPath, 'utf-8');
    const lines = existingContent.split('\n');

    // Insert at the specified line (1-indexed)
    const insertIndex = Math.max(0, Math.min(lineNumber - 1, lines.length));
    lines.splice(insertIndex, 0, content);

    fs.writeFileSync(resolvedPath, lines.join('\n'), 'utf-8');
  }

  /**
   * Apply a patch to a file
   */
  async applyPatch(patch: FilePatch): Promise<PatchResult> {
    try {
      const resolvedPath = this.resolvePath(patch.filePath);
      const existingContent = fs.readFileSync(resolvedPath, 'utf-8');
      const lines = existingContent.split('\n');

      const lineIndex = patch.lineNumber - 1;

      // Validate line number
      if (lineIndex < 0 || lineIndex > lines.length) {
        return {
          success: false,
          filePath: patch.filePath,
          error: `Invalid line number: ${patch.lineNumber} (file has ${lines.length} lines)`,
        };
      }

      // Verify original line content if provided
      if (patch.originalLine !== undefined && patch.operation !== 'insert') {
        const actualLine = lines[lineIndex];
        if (actualLine !== patch.originalLine) {
          return {
            success: false,
            filePath: patch.filePath,
            error: `Line content mismatch at line ${patch.lineNumber}. Expected: "${patch.originalLine}", Found: "${actualLine}"`,
          };
        }
      }

      let linesModified = 0;

      switch (patch.operation) {
        case 'insert':
          lines.splice(lineIndex, 0, patch.content);
          linesModified = 1;
          break;

        case 'replace':
          const replaceCount = patch.lineCount ?? 1;
          lines.splice(lineIndex, replaceCount, patch.content);
          linesModified = replaceCount;
          break;

        case 'delete':
          const deleteCount = patch.lineCount ?? 1;
          lines.splice(lineIndex, deleteCount);
          linesModified = deleteCount;
          break;
      }

      fs.writeFileSync(resolvedPath, lines.join('\n'), 'utf-8');

      return {
        success: true,
        filePath: patch.filePath,
        linesModified,
      };
    } catch (error) {
      return {
        success: false,
        filePath: patch.filePath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Apply multiple patches (applies each sequentially)
   */
  async applyPatches(patches: FilePatch[]): Promise<BatchPatchResult> {
    const results: PatchResult[] = [];
    let successful = 0;
    let failed = 0;

    // Sort patches by file, then by line number descending
    // (apply from bottom to top to preserve line numbers)
    const sortedPatches = [...patches].sort((a, b) => {
      if (a.filePath !== b.filePath) {
        return a.filePath.localeCompare(b.filePath);
      }
      return b.lineNumber - a.lineNumber;
    });

    for (const patch of sortedPatches) {
      const result = await this.applyPatch(patch);
      results.push(result);

      if (result.success) {
        successful++;
      } else {
        failed++;
      }
    }

    return {
      total: patches.length,
      successful,
      failed,
      results,
    };
  }

  /**
   * Check if a file is writable
   */
  async isWritable(filePath: string): Promise<boolean> {
    try {
      const resolvedPath = this.resolvePath(filePath);
      fs.accessSync(resolvedPath, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}
