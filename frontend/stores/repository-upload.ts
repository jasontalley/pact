import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Manifest describing the files read from a directory.
 */
export interface UploadManifest {
  files: string[];
  testFiles: string[];
  sourceFiles: string[];
}

/**
 * Shared state for browser-uploaded repository files.
 * Used by both Repository Settings page (to pick/preview) and
 * ReconciliationWizard (to send as pre-read payload).
 */
interface RepositoryUploadState {
  /** Name of the selected directory (from the handle) */
  directoryName: string | null;
  /** File contents keyed by relative path */
  fileContents: Record<string, string> | null;
  /** File manifest (files, testFiles, sourceFiles) */
  manifest: UploadManifest | null;
  /** Human-readable summary string */
  summary: string | null;
  /** Whether a directory read is in progress */
  isReading: boolean;

  // Actions
  setReading: (reading: boolean) => void;
  setUpload: (
    directoryName: string,
    fileContents: Record<string, string>,
    manifest: UploadManifest,
    summary: string,
  ) => void;
  clear: () => void;
}

export const useRepositoryUploadStore = create<RepositoryUploadState>()(
  persist(
    (set) => ({
      directoryName: null,
      fileContents: null,
      manifest: null,
      summary: null,
      isReading: false,

      setReading: (reading) => set({ isReading: reading }),

      setUpload: (directoryName, fileContents, manifest, summary) =>
        set({ directoryName, fileContents, manifest, summary, isReading: false }),

      clear: () =>
        set({
          directoryName: null,
          fileContents: null,
          manifest: null,
          summary: null,
          isReading: false,
        }),
    }),
    {
      name: 'pact-repository-upload',
      // Only persist lightweight metadata — fileContents is too large for localStorage
      partialize: (state) => ({
        directoryName: state.directoryName,
        manifest: state.manifest,
        summary: state.summary,
      }),
    },
  ),
);

/**
 * Shared directory reading logic.
 * Reads files from a FileSystemDirectoryHandle and stores them in the shared store.
 */
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage',
  '.next', '.nuxt', '__pycache__', '.pytest_cache', 'vendor',
  '.idea', '.vscode',
]);
const INCLUDE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md)$/;
const TEST_PATTERN = /\.(spec|test|e2e-spec)\.(ts|tsx|js|jsx)$/;
const MAX_FILES = 1000;

async function readDirRecursive(
  handle: FileSystemDirectoryHandle,
  path: string,
  out: { fileContents: Record<string, string>; files: string[]; testFiles: string[]; sourceFiles: string[] },
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- File System Access API types not in default TS lib
  for await (const entry of (handle as any).values()) {
    if (out.files.length >= MAX_FILES) break;
    const fullPath = path ? `${path}/${entry.name}` : entry.name;

    if (entry.kind === 'directory') {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      await readDirRecursive(entry as FileSystemDirectoryHandle, fullPath, out);
    } else {
      if (!INCLUDE_EXT.test(entry.name)) continue;
      const file = await (entry as FileSystemFileHandle).getFile();
      const content = await file.text();
      out.fileContents[fullPath] = content;
      out.files.push(fullPath);
      if (TEST_PATTERN.test(entry.name)) {
        out.testFiles.push(fullPath);
      } else {
        out.sourceFiles.push(fullPath);
      }
    }
  }
}

/**
 * Check if a relative path segment should be excluded.
 * webkitRelativePath looks like "rootDir/node_modules/foo/bar.js"
 */
function shouldExcludePath(relativePath: string): boolean {
  const segments = relativePath.split('/');
  // Skip first segment (root dir name) — check the rest
  return segments.slice(1).some((seg) => EXCLUDE_DIRS.has(seg));
}

/**
 * Read files from an <input webkitdirectory> file list.
 * Used as fallback for Firefox and Safari.
 */
function readFromFileList(
  fileList: FileList,
): Promise<{ directoryName: string; out: { fileContents: Record<string, string>; files: string[]; testFiles: string[]; sourceFiles: string[] } }> {
  return new Promise((resolve, reject) => {
    const out = {
      fileContents: {} as Record<string, string>,
      files: [] as string[],
      testFiles: [] as string[],
      sourceFiles: [] as string[],
    };

    // Determine root directory name from the first file's path
    const firstFile = fileList[0];
    if (!firstFile) {
      reject(new Error('No files selected'));
      return;
    }
    const rootName = (firstFile as File & { webkitRelativePath?: string }).webkitRelativePath?.split('/')[0] || 'unknown';

    const promises: Promise<void>[] = [];
    for (let i = 0; i < fileList.length && out.files.length < MAX_FILES; i++) {
      const file = fileList[i] as File & { webkitRelativePath?: string };
      const relativePath = file.webkitRelativePath || file.name;

      // Skip excluded directories
      if (shouldExcludePath(relativePath)) continue;

      // Strip root directory prefix to get path relative to project root
      const pathWithoutRoot = relativePath.split('/').slice(1).join('/');
      if (!pathWithoutRoot) continue;

      // Only include matching extensions
      if (!INCLUDE_EXT.test(file.name)) continue;

      promises.push(
        file.text().then((content) => {
          if (out.files.length >= MAX_FILES) return;
          out.fileContents[pathWithoutRoot] = content;
          out.files.push(pathWithoutRoot);
          if (TEST_PATTERN.test(file.name)) {
            out.testFiles.push(pathWithoutRoot);
          } else {
            out.sourceFiles.push(pathWithoutRoot);
          }
        }),
      );
    }

    Promise.all(promises)
      .then(() => resolve({ directoryName: rootName, out }))
      .catch(reject);
  });
}

/**
 * Open a hidden <input webkitdirectory> picker and return the selected files.
 */
function openFallbackDirectoryPicker(): Promise<FileList> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.multiple = true;
    input.style.display = 'none';

    input.addEventListener('change', () => {
      input.remove();
      if (input.files && input.files.length > 0) {
        resolve(input.files);
      } else {
        reject(new DOMException('No files selected', 'AbortError'));
      }
    });

    input.addEventListener('cancel', () => {
      input.remove();
      reject(new DOMException('User cancelled', 'AbortError'));
    });

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Finalize the read results into the store.
 */
function finalizeUpload(
  directoryName: string,
  out: { fileContents: Record<string, string>; files: string[]; testFiles: string[]; sourceFiles: string[] },
): { directoryName: string; fileCount: number } {
  const store = useRepositoryUploadStore.getState();
  const totalSize = Object.values(out.fileContents).reduce((sum, c) => sum + c.length, 0);
  const summary = `${out.files.length} files (${out.testFiles.length} test, ${out.sourceFiles.length} source) — ${(totalSize / 1024).toFixed(0)} KB`;

  store.setUpload(
    directoryName,
    out.fileContents,
    { files: out.files, testFiles: out.testFiles, sourceFiles: out.sourceFiles },
    summary,
  );

  return { directoryName, fileCount: out.files.length };
}

/**
 * Browse a directory and populate the shared store.
 *
 * Uses File System Access API (showDirectoryPicker) on Chrome/Edge for best UX.
 * Falls back to <input webkitdirectory> on Firefox/Safari.
 */
export async function browseAndReadDirectory(): Promise<{ directoryName: string; fileCount: number }> {
  const store = useRepositoryUploadStore.getState();
  store.setReading(true);

  try {
    // Prefer File System Access API (Chrome/Edge) — gives directory handle with streaming reads
    if ('showDirectoryPicker' in globalThis) {
      const dirHandle = await (
        globalThis as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
      ).showDirectoryPicker();

      const out = { fileContents: {} as Record<string, string>, files: [] as string[], testFiles: [] as string[], sourceFiles: [] as string[] };
      await readDirRecursive(dirHandle, '', out);
      return finalizeUpload(dirHandle.name, out);
    }

    // Fallback: <input webkitdirectory> (Firefox, Safari)
    const fileList = await openFallbackDirectoryPicker();
    const { directoryName, out } = await readFromFileList(fileList);
    return finalizeUpload(directoryName, out);
  } catch (err) {
    store.setReading(false);
    throw err;
  }
}
