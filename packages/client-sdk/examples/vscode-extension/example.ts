/**
 * VSCode Extension Example
 *
 * Demonstrates how a VSCode extension uses the @pact/client-sdk to:
 * 1. Pull Main state from server for IDE hints
 * 2. Run local reconciliation checks for plausibility signals
 * 3. Apply @atom annotations to local files
 *
 * This is a reference implementation showing the integration pattern.
 * Actual VSCode extension code would use the vscode API for file operations.
 */

// Use relative import for development; published package uses '@pact/client-sdk'
import { PactClient } from '../../src';

// Configuration would typically come from VSCode settings
interface ExtensionConfig {
  serverUrl: string;
  projectId?: string;
  authToken?: string;
}

/**
 * Example: Initialize PactClient in extension activation
 */
export function createPactClientForWorkspace(
  workspaceRoot: string,
  config: ExtensionConfig,
): PactClient {
  return new PactClient({
    serverUrl: config.serverUrl,
    projectRoot: workspaceRoot,
    projectId: config.projectId,
    authToken: config.authToken,
  });
}

/**
 * Example: Pull Main state for IDE hints
 *
 * Called on:
 * - Extension activation
 * - User command "Pact: Refresh Main State"
 * - Timer-based refresh (e.g., every 5 minutes)
 */
export async function pullMainState(client: PactClient) {
  console.log('[Pact] Pulling Main state from server...');

  try {
    const result = await client.pull();

    console.log(`[Pact] Cached ${result.atomCount} atoms, ${result.moleculeCount} molecules`);
    console.log(`[Pact] Cache path: ${result.cachePath}`);

    if (!result.wasPerformed) {
      console.log('[Pact] Cache was fresh, no pull needed');
    }

    // The cache is now available for IDE features:
    // - Show atom coverage in test files
    // - Highlight unlinked tests
    // - Display molecule relationships in code lens
    return result;
  } catch (error) {
    console.error('[Pact] Failed to pull Main state:', error);
    throw error;
  }
}

/**
 * Example: Check local reconciliation status
 *
 * Called on:
 * - File save (debounced)
 * - User command "Pact: Check Local Status"
 * - Pre-commit hook (via CLI, not extension)
 *
 * IMPORTANT: This produces PLAUSIBILITY signals, not canonical truth.
 * Local checks are advisory — they help developers but don't update server state.
 */
export async function checkLocalStatus(client: PactClient) {
  console.log('[Pact] Running local reconciliation check...');

  try {
    const result = await client.check();
    const { report, warnings } = result;

    // Show warnings first
    if (warnings.length > 0) {
      console.log('[Pact] Warnings:');
      for (const warning of warnings) {
        console.log(`  - ${warning}`);
      }
    }

    console.log('[Pact] Local Check Results:');
    console.log(`  Plausible links: ${report.plausibleLinks.length}`);
    console.log(`  Orphan tests: ${report.orphanTests.length}`);
    console.log(`  Uncovered atoms: ${report.uncoveredAtoms.length}`);

    // Show orphan tests in Problems panel
    if (report.orphanTests.length > 0) {
      console.log('[Pact] Orphan tests (no @atom annotation):');
      for (const testFile of report.orphanTests.slice(0, 5)) {
        console.log(`  - ${testFile}`);
        // In real extension: add diagnostic for each orphan test
      }
      if (report.orphanTests.length > 5) {
        console.log(`  ... and ${report.orphanTests.length - 5} more`);
      }
    }

    // Show quality summary
    if (report.qualitySummary) {
      console.log(`[Pact] Average confidence: ${report.qualitySummary.averageScore.toFixed(1)}%`);
    }

    return report;
  } catch (error) {
    console.error('[Pact] Local check failed:', error);
    throw error;
  }
}

/**
 * Example: Apply @atom annotations
 *
 * Called when user accepts a recommendation from the server.
 * The extension previews patches before applying.
 */
export async function applyAtomAnnotations(
  client: PactClient,
  patches: Array<{
    filePath: string;
    lineNumber: number;
    annotation: string;
    atomId: string;
  }>,
) {
  console.log(`[Pact] Applying ${patches.length} @atom annotations...`);

  // Preview first
  const previews = await client.patches.previewPatches(patches);
  console.log('[Pact] Preview generated for all patches');

  // In real extension: show diff preview to user
  for (const preview of previews) {
    if (preview.success) {
      console.log(`  ${preview.filePath}: ready to apply`);
    } else {
      console.error(`  ${preview.filePath}: ${preview.error}`);
    }
  }

  // Apply patches (in real extension, only after user confirms)
  const results = await client.patches.applyPatches(patches);

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`[Pact] Applied ${successful} annotations, ${failed} failed`);

  return results;
}

/**
 * Example: Get cached atom details for hover/tooltip
 */
export async function getAtomDetails(client: PactClient, atomId: string) {
  const cache = await client.getCache();
  const atom = cache.getAtom(atomId);

  if (atom) {
    return {
      id: atom.id,
      description: atom.description,
      category: atom.category,
      status: atom.status,
      // Show in hover tooltip
    };
  }

  return null;
}

/**
 * Example: Get coverage info for a test file
 */
export async function getTestFileCoverage(client: PactClient, testFilePath: string) {
  const cache = await client.getCache();

  // Find links for this test file
  const links = cache.getLinksForTestFile(testFilePath);

  const linkedAtoms = links.map((link) => {
    const atom = cache.getAtom(link.atomId);
    return {
      atomId: link.atomId,
      atomDescription: atom?.description,
      lineNumber: link.lineNumber,
    };
  });

  return {
    filePath: testFilePath,
    linkedAtoms,
    isFullyCovered: linkedAtoms.length > 0,
  };
}

/**
 * Example: Get cache summary for status bar
 */
export async function getCacheSummary(client: PactClient) {
  const cache = await client.getCache();
  return cache.getSummary();
}

/**
 * Example: Full workflow demonstration
 */
async function demonstrateWorkflow() {
  // 1. Create client for workspace
  const client = createPactClientForWorkspace('/path/to/workspace', {
    serverUrl: 'https://pact.example.com',
    projectId: 'my-project',
  });

  // 2. Pull Main state on activation
  await pullMainState(client);

  // 3. Check local status periodically or on file save
  const report = await checkLocalStatus(client);

  // 4. If user accepts recommendations, apply them
  if (report.orphanTests.length > 0) {
    // In real extension: show quick fix / code action
    // Here we simulate accepting some recommendations
    const patches = report.orphanTests.slice(0, 3).map((testFile, i) => ({
      filePath: testFile,
      lineNumber: 1,
      annotation: `// @atom IA-NEW-${i + 1}`,
      atomId: `IA-NEW-${i + 1}`,
    }));

    await applyAtomAnnotations(client, patches);
  }

  console.log('[Pact] Workflow complete');
}

// Export for testing
export { demonstrateWorkflow };
