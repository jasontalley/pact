/**
 * Patch Applicator Module
 *
 * Applies @atom annotation patches to local files.
 * Used by clients to inject atom references based on server recommendations.
 */
import { AnnotationPatch, PatchResult } from './types';
export interface PatchApplicatorOptions {
    /** Project root directory */
    projectRoot: string;
    /** Create backup files before patching */
    createBackups?: boolean;
    /** Backup file extension (default: '.bak') */
    backupExtension?: string;
}
/**
 * Applies @atom annotation patches to local files.
 */
export declare class PatchApplicator {
    private readonly projectRoot;
    private readonly createBackups;
    private readonly backupExtension;
    constructor(options: PatchApplicatorOptions);
    /**
     * Apply multiple annotation patches to local files.
     *
     * @param patches - Array of patches to apply
     * @returns Results for each patch
     */
    applyPatches(patches: AnnotationPatch[]): Promise<PatchResult[]>;
    /**
     * Preview patches without applying them.
     *
     * @param patches - Array of patches to preview
     * @returns Results with preview content
     */
    previewPatches(patches: AnnotationPatch[]): Promise<PatchResult[]>;
    /**
     * Apply a single patch.
     *
     * @param patch - Patch to apply
     * @returns Result
     */
    applyPatch(patch: AnnotationPatch): Promise<PatchResult>;
    /**
     * Validate that patches can be applied.
     *
     * @param patches - Patches to validate
     * @returns Array of validation errors (empty if all valid)
     */
    validatePatches(patches: AnnotationPatch[]): Promise<string[]>;
    /**
     * Apply patches to a single file.
     */
    private applyPatchesToFile;
    /**
     * Preview patches to a single file without applying.
     */
    private previewPatchesToFile;
    /**
     * Restore files from backups.
     *
     * @param filePaths - File paths to restore
     * @returns Results for each file
     */
    restoreFromBackups(filePaths: string[]): Promise<PatchResult[]>;
    /**
     * Clean up backup files.
     *
     * @param filePaths - File paths whose backups should be removed
     */
    cleanupBackups(filePaths: string[]): Promise<void>;
}
