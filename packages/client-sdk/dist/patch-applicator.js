"use strict";
/**
 * Patch Applicator Module
 *
 * Applies @atom annotation patches to local files.
 * Used by clients to inject atom references based on server recommendations.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatchApplicator = void 0;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
/**
 * Applies @atom annotation patches to local files.
 */
class PatchApplicator {
    projectRoot;
    createBackups;
    backupExtension;
    constructor(options) {
        this.projectRoot = options.projectRoot;
        this.createBackups = options.createBackups ?? false;
        this.backupExtension = options.backupExtension ?? '.bak';
    }
    /**
     * Apply multiple annotation patches to local files.
     *
     * @param patches - Array of patches to apply
     * @returns Results for each patch
     */
    async applyPatches(patches) {
        const results = [];
        // Group patches by file for efficient processing
        const patchesByFile = new Map();
        for (const patch of patches) {
            const existing = patchesByFile.get(patch.filePath) ?? [];
            existing.push(patch);
            patchesByFile.set(patch.filePath, existing);
        }
        // Apply patches file by file
        for (const [filePath, filePatches] of patchesByFile) {
            try {
                // Sort patches by line number in descending order
                // This ensures later line numbers aren't affected by earlier insertions
                const sortedPatches = [...filePatches].sort((a, b) => b.lineNumber - a.lineNumber);
                const result = await this.applyPatchesToFile(filePath, sortedPatches);
                results.push(...result);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                for (const patch of filePatches) {
                    results.push({
                        filePath: patch.filePath,
                        success: false,
                        error: errorMessage,
                    });
                }
            }
        }
        return results;
    }
    /**
     * Preview patches without applying them.
     *
     * @param patches - Array of patches to preview
     * @returns Results with preview content
     */
    async previewPatches(patches) {
        const results = [];
        // Group patches by file
        const patchesByFile = new Map();
        for (const patch of patches) {
            const existing = patchesByFile.get(patch.filePath) ?? [];
            existing.push(patch);
            patchesByFile.set(patch.filePath, existing);
        }
        // Preview patches file by file
        for (const [filePath, filePatches] of patchesByFile) {
            try {
                const sortedPatches = [...filePatches].sort((a, b) => b.lineNumber - a.lineNumber);
                const preview = await this.previewPatchesToFile(filePath, sortedPatches);
                for (const patch of filePatches) {
                    results.push({
                        filePath: patch.filePath,
                        success: true,
                        preview,
                    });
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                for (const patch of filePatches) {
                    results.push({
                        filePath: patch.filePath,
                        success: false,
                        error: errorMessage,
                    });
                }
            }
        }
        return results;
    }
    /**
     * Apply a single patch.
     *
     * @param patch - Patch to apply
     * @returns Result
     */
    async applyPatch(patch) {
        const results = await this.applyPatches([patch]);
        return results[0];
    }
    /**
     * Validate that patches can be applied.
     *
     * @param patches - Patches to validate
     * @returns Array of validation errors (empty if all valid)
     */
    async validatePatches(patches) {
        const errors = [];
        for (const patch of patches) {
            const fullPath = path.join(this.projectRoot, patch.filePath);
            // Check file exists
            if (!fs.existsSync(fullPath)) {
                errors.push(`File not found: ${patch.filePath}`);
                continue;
            }
            // Check file is readable
            try {
                await fs.promises.access(fullPath, fs.constants.R_OK | fs.constants.W_OK);
            }
            catch {
                errors.push(`File not accessible: ${patch.filePath}`);
                continue;
            }
            // Check line number is valid
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            const lines = content.split('\n');
            if (patch.lineNumber < 1 || patch.lineNumber > lines.length + 1) {
                errors.push(`Invalid line number ${patch.lineNumber} for ${patch.filePath} (file has ${lines.length} lines)`);
            }
            // Check annotation format
            if (!patch.annotation.includes('@atom')) {
                errors.push(`Invalid annotation format: ${patch.annotation}`);
            }
        }
        return errors;
    }
    /**
     * Apply patches to a single file.
     */
    async applyPatchesToFile(filePath, patches) {
        const fullPath = path.join(this.projectRoot, filePath);
        // Read file content
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');
        // Create backup if enabled
        if (this.createBackups) {
            await fs.promises.writeFile(fullPath + this.backupExtension, content, 'utf-8');
        }
        // Apply patches (already sorted in descending line order)
        for (const patch of patches) {
            const insertIndex = patch.lineNumber - 1;
            // Determine indentation from the target line
            const targetLine = lines[insertIndex] ?? '';
            const indentation = targetLine.match(/^(\s*)/)?.[1] ?? '';
            // Format the annotation with proper indentation
            const formattedAnnotation = `${indentation}${patch.annotation}`;
            // Insert the annotation line
            lines.splice(insertIndex, 0, formattedAnnotation);
        }
        // Write updated content
        const newContent = lines.join('\n');
        await fs.promises.writeFile(fullPath, newContent, 'utf-8');
        return patches.map((patch) => ({
            filePath: patch.filePath,
            success: true,
        }));
    }
    /**
     * Preview patches to a single file without applying.
     */
    async previewPatchesToFile(filePath, patches) {
        const fullPath = path.join(this.projectRoot, filePath);
        // Read file content
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');
        // Apply patches to a copy (already sorted in descending line order)
        for (const patch of patches) {
            const insertIndex = patch.lineNumber - 1;
            // Determine indentation from the target line
            const targetLine = lines[insertIndex] ?? '';
            const indentation = targetLine.match(/^(\s*)/)?.[1] ?? '';
            // Format the annotation with proper indentation
            const formattedAnnotation = `${indentation}${patch.annotation}`;
            // Insert the annotation line
            lines.splice(insertIndex, 0, formattedAnnotation);
        }
        return lines.join('\n');
    }
    /**
     * Restore files from backups.
     *
     * @param filePaths - File paths to restore
     * @returns Results for each file
     */
    async restoreFromBackups(filePaths) {
        const results = [];
        for (const filePath of filePaths) {
            const fullPath = path.join(this.projectRoot, filePath);
            const backupPath = fullPath + this.backupExtension;
            try {
                if (!fs.existsSync(backupPath)) {
                    results.push({
                        filePath,
                        success: false,
                        error: `Backup file not found: ${backupPath}`,
                    });
                    continue;
                }
                // Restore from backup
                await fs.promises.copyFile(backupPath, fullPath);
                // Remove backup
                await fs.promises.unlink(backupPath);
                results.push({
                    filePath,
                    success: true,
                });
            }
            catch (error) {
                results.push({
                    filePath,
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        return results;
    }
    /**
     * Clean up backup files.
     *
     * @param filePaths - File paths whose backups should be removed
     */
    async cleanupBackups(filePaths) {
        for (const filePath of filePaths) {
            const backupPath = path.join(this.projectRoot, filePath) + this.backupExtension;
            try {
                if (fs.existsSync(backupPath)) {
                    await fs.promises.unlink(backupPath);
                }
            }
            catch {
                // Ignore cleanup errors
            }
        }
    }
}
exports.PatchApplicator = PatchApplicator;
