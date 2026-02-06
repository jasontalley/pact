/**
 * Content Provider Module
 *
 * Abstracts filesystem access to enable:
 * - Co-located mode (FilesystemContentProvider)
 * - Remote mode (PreReadContentProvider)
 * - Hybrid mode (combination of both)
 */

// Interfaces
export {
  ContentProvider,
  FileEntry,
  ListOptions,
  WalkOptions,
  ReadContentResult,
  supportsBatchRead,
  supportsCommitHash,
} from './content-provider.interface';

export {
  WriteProvider,
  PatchInstructionCollector,
  FilePatch,
  PatchResult,
  BatchPatchResult,
} from './write-provider.interface';

// Implementations
export { FilesystemContentProvider } from './filesystem-content-provider';
export { PreReadContentProvider, PreReadContentConfig } from './pre-read-content-provider';
export { FilesystemWriteProvider } from './filesystem-write-provider';
export { PatchInstructionProvider } from './patch-instruction-provider';
