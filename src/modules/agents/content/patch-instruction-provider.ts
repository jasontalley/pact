import {
  PatchInstructionCollector,
  FilePatch,
  PatchResult,
  BatchPatchResult,
} from './write-provider.interface';

/**
 * PatchInstructionProvider - collects patch instructions for remote mode
 *
 * Instead of writing to files directly, this provider collects patch instructions
 * that can be sent back to the client for local application.
 */
export class PatchInstructionProvider implements PatchInstructionCollector {
  readonly providerType = 'instruction' as const;

  private patches: FilePatch[] = [];

  /**
   * Write content to a file (converts to replace patch)
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    // For a full file write, we create a replace-all patch
    this.patches.push({
      filePath,
      lineNumber: 1,
      content,
      operation: 'replace',
      lineCount: -1, // Indicates replace entire file
    });
  }

  /**
   * Insert a line at a specific position
   */
  async insertLine(filePath: string, lineNumber: number, content: string): Promise<void> {
    this.patches.push({
      filePath,
      lineNumber,
      content,
      operation: 'insert',
    });
  }

  /**
   * Apply a patch (collect it for later application)
   */
  async applyPatch(patch: FilePatch): Promise<PatchResult> {
    this.patches.push(patch);

    return {
      success: true,
      filePath: patch.filePath,
      linesModified: patch.lineCount ?? 1,
    };
  }

  /**
   * Apply multiple patches (collect all)
   */
  async applyPatches(patches: FilePatch[]): Promise<BatchPatchResult> {
    const results: PatchResult[] = [];

    for (const patch of patches) {
      const result = await this.applyPatch(patch);
      results.push(result);
    }

    return {
      total: patches.length,
      successful: patches.length,
      failed: 0,
      results,
    };
  }

  /**
   * Check if a file is writable (always true for instruction mode)
   */
  async isWritable(_filePath: string): Promise<boolean> {
    return true;
  }

  /**
   * Get all collected patch instructions
   */
  getPatches(): FilePatch[] {
    return [...this.patches];
  }

  /**
   * Clear collected patches
   */
  clearPatches(): void {
    this.patches = [];
  }

  /**
   * Get patches as a serializable object
   */
  toJSON(): { patches: FilePatch[] } {
    return {
      patches: this.getPatches(),
    };
  }

  /**
   * Get patches grouped by file
   */
  getPatchesByFile(): Map<string, FilePatch[]> {
    const byFile = new Map<string, FilePatch[]>();

    for (const patch of this.patches) {
      const existing = byFile.get(patch.filePath) || [];
      existing.push(patch);
      byFile.set(patch.filePath, existing);
    }

    return byFile;
  }

  /**
   * Get the number of files affected
   */
  getAffectedFileCount(): number {
    const files = new Set(this.patches.map((p) => p.filePath));
    return files.size;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalPatches: number;
    filesAffected: number;
    insertions: number;
    replacements: number;
    deletions: number;
  } {
    let insertions = 0;
    let replacements = 0;
    let deletions = 0;

    for (const patch of this.patches) {
      switch (patch.operation) {
        case 'insert':
          insertions++;
          break;
        case 'replace':
          replacements++;
          break;
        case 'delete':
          deletions++;
          break;
      }
    }

    return {
      totalPatches: this.patches.length,
      filesAffected: this.getAffectedFileCount(),
      insertions,
      replacements,
      deletions,
    };
  }
}
