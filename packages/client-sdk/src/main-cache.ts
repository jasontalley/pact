/**
 * Main Cache Module
 *
 * Data model for caching Pact Main state locally.
 * This is a read-only cache of committed atoms, molecules, and links.
 *
 * Local = plausible, Canonical = true.
 */

import { MainStateCache, AtomSummary, MoleculeSummary, AtomTestLinkSummary } from './types';

/**
 * Options for cache queries.
 */
export interface CacheQueryOptions {
  /** Filter by status */
  status?: 'draft' | 'proposed' | 'committed';
  /** Filter by category */
  category?: 'functional' | 'performance' | 'security' | 'ux' | 'operational';
  /** Search in description */
  searchTerm?: string;
}

/**
 * In-memory representation of the Main state cache.
 * Provides query methods for local tooling.
 */
export class MainCache {
  private atoms: Map<string, AtomSummary> = new Map();
  private molecules: Map<string, MoleculeSummary> = new Map();
  private atomTestLinks: AtomTestLinkSummary[] = [];
  private snapshotVersion: number = 0;
  private pulledAt: Date | null = null;
  private serverUrl: string = '';
  private projectId?: string;

  /**
   * Load cache data from serialized format.
   */
  load(data: MainStateCache): void {
    this.atoms.clear();
    this.molecules.clear();

    for (const atom of data.atoms) {
      this.atoms.set(atom.id, atom);
    }

    for (const molecule of data.molecules) {
      this.molecules.set(molecule.id, molecule);
    }

    this.atomTestLinks = [...data.atomTestLinks];
    this.snapshotVersion = data.snapshotVersion;
    this.pulledAt = new Date(data.pulledAt);
    this.serverUrl = data.serverUrl;
    this.projectId = data.projectId;
  }

  /**
   * Export cache data to serialized format.
   */
  export(): MainStateCache {
    return {
      atoms: Array.from(this.atoms.values()),
      molecules: Array.from(this.molecules.values()),
      atomTestLinks: [...this.atomTestLinks],
      snapshotVersion: this.snapshotVersion,
      pulledAt: this.pulledAt ?? new Date(),
      serverUrl: this.serverUrl,
      projectId: this.projectId,
    };
  }

  /**
   * Check if the cache is empty.
   */
  isEmpty(): boolean {
    return this.atoms.size === 0;
  }

  /**
   * Check if the cache is stale.
   *
   * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
   */
  isStale(maxAgeMs: number = 24 * 60 * 60 * 1000): boolean {
    if (!this.pulledAt) {
      return true;
    }
    return Date.now() - this.pulledAt.getTime() > maxAgeMs;
  }

  /**
   * Get the snapshot version.
   */
  getSnapshotVersion(): number {
    return this.snapshotVersion;
  }

  /**
   * Get when the cache was last pulled.
   */
  getPulledAt(): Date | null {
    return this.pulledAt;
  }

  /**
   * Get the server URL this cache was pulled from.
   */
  getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * Get the project ID (if multi-tenant).
   */
  getProjectId(): string | undefined {
    return this.projectId;
  }

  // ===========================================================================
  // Atom Queries
  // ===========================================================================

  /**
   * Get an atom by ID.
   */
  getAtom(id: string): AtomSummary | undefined {
    return this.atoms.get(id);
  }

  /**
   * Get all atoms.
   */
  getAllAtoms(): AtomSummary[] {
    return Array.from(this.atoms.values());
  }

  /**
   * Query atoms with filters.
   */
  queryAtoms(options?: CacheQueryOptions): AtomSummary[] {
    let results = Array.from(this.atoms.values());

    if (options?.status) {
      results = results.filter((a) => a.status === options.status);
    }

    if (options?.category) {
      results = results.filter((a) => a.category === options.category);
    }

    if (options?.searchTerm) {
      const term = options.searchTerm.toLowerCase();
      results = results.filter((a) => a.description.toLowerCase().includes(term));
    }

    return results;
  }

  /**
   * Get committed atoms only.
   */
  getCommittedAtoms(): AtomSummary[] {
    return this.queryAtoms({ status: 'committed' });
  }

  /**
   * Get atoms by category.
   */
  getAtomsByCategory(
    category: 'functional' | 'performance' | 'security' | 'ux' | 'operational',
  ): AtomSummary[] {
    return this.queryAtoms({ category });
  }

  /**
   * Get atom count.
   */
  getAtomCount(): number {
    return this.atoms.size;
  }

  // ===========================================================================
  // Molecule Queries
  // ===========================================================================

  /**
   * Get a molecule by ID.
   */
  getMolecule(id: string): MoleculeSummary | undefined {
    return this.molecules.get(id);
  }

  /**
   * Get all molecules.
   */
  getAllMolecules(): MoleculeSummary[] {
    return Array.from(this.molecules.values());
  }

  /**
   * Get molecules by lens type.
   */
  getMoleculesByLensType(
    lensType: 'user_story' | 'feature' | 'journey' | 'epic' | 'release' | 'capability' | 'custom',
  ): MoleculeSummary[] {
    return Array.from(this.molecules.values()).filter((m) => m.lensType === lensType);
  }

  /**
   * Get child molecules of a parent.
   */
  getChildMolecules(parentId: string): MoleculeSummary[] {
    return Array.from(this.molecules.values()).filter((m) => m.parentMoleculeId === parentId);
  }

  /**
   * Get molecule count.
   */
  getMoleculeCount(): number {
    return this.molecules.size;
  }

  // ===========================================================================
  // Atom-Test Link Queries
  // ===========================================================================

  /**
   * Get all atom-test links.
   */
  getAllLinks(): AtomTestLinkSummary[] {
    return [...this.atomTestLinks];
  }

  /**
   * Get links for a specific atom.
   */
  getLinksForAtom(atomId: string): AtomTestLinkSummary[] {
    return this.atomTestLinks.filter((link) => link.atomId === atomId);
  }

  /**
   * Get links for a specific test file.
   */
  getLinksForTestFile(testFilePath: string): AtomTestLinkSummary[] {
    return this.atomTestLinks.filter((link) => link.testFilePath === testFilePath);
  }

  /**
   * Get atoms with no test links (uncovered atoms).
   */
  getUncoveredAtoms(): AtomSummary[] {
    const linkedAtomIds = new Set(this.atomTestLinks.map((link) => link.atomId));
    return Array.from(this.atoms.values()).filter(
      (atom) => atom.status === 'committed' && !linkedAtomIds.has(atom.id),
    );
  }

  /**
   * Get link count.
   */
  getLinkCount(): number {
    return this.atomTestLinks.length;
  }

  // ===========================================================================
  // Summary Methods
  // ===========================================================================

  /**
   * Get a summary of the cache contents.
   */
  getSummary(): {
    atomCount: number;
    moleculeCount: number;
    linkCount: number;
    committedAtoms: number;
    uncoveredAtoms: number;
    snapshotVersion: number;
    pulledAt: Date | null;
  } {
    return {
      atomCount: this.atoms.size,
      moleculeCount: this.molecules.size,
      linkCount: this.atomTestLinks.length,
      committedAtoms: this.getCommittedAtoms().length,
      uncoveredAtoms: this.getUncoveredAtoms().length,
      snapshotVersion: this.snapshotVersion,
      pulledAt: this.pulledAt,
    };
  }
}
