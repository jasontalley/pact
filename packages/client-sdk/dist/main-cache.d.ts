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
export declare class MainCache {
    private atoms;
    private molecules;
    private atomTestLinks;
    private snapshotVersion;
    private pulledAt;
    private serverUrl;
    private projectId?;
    /**
     * Load cache data from serialized format.
     */
    load(data: MainStateCache): void;
    /**
     * Export cache data to serialized format.
     */
    export(): MainStateCache;
    /**
     * Check if the cache is empty.
     */
    isEmpty(): boolean;
    /**
     * Check if the cache is stale.
     *
     * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
     */
    isStale(maxAgeMs?: number): boolean;
    /**
     * Get the snapshot version.
     */
    getSnapshotVersion(): number;
    /**
     * Get when the cache was last pulled.
     */
    getPulledAt(): Date | null;
    /**
     * Get the server URL this cache was pulled from.
     */
    getServerUrl(): string;
    /**
     * Get the project ID (if multi-tenant).
     */
    getProjectId(): string | undefined;
    /**
     * Get an atom by ID.
     */
    getAtom(id: string): AtomSummary | undefined;
    /**
     * Get all atoms.
     */
    getAllAtoms(): AtomSummary[];
    /**
     * Query atoms with filters.
     */
    queryAtoms(options?: CacheQueryOptions): AtomSummary[];
    /**
     * Get committed atoms only.
     */
    getCommittedAtoms(): AtomSummary[];
    /**
     * Get atoms by category.
     */
    getAtomsByCategory(category: 'functional' | 'performance' | 'security' | 'ux' | 'operational'): AtomSummary[];
    /**
     * Get atom count.
     */
    getAtomCount(): number;
    /**
     * Get a molecule by ID.
     */
    getMolecule(id: string): MoleculeSummary | undefined;
    /**
     * Get all molecules.
     */
    getAllMolecules(): MoleculeSummary[];
    /**
     * Get molecules by lens type.
     */
    getMoleculesByLensType(lensType: 'user_story' | 'feature' | 'journey' | 'epic' | 'release' | 'capability' | 'custom'): MoleculeSummary[];
    /**
     * Get child molecules of a parent.
     */
    getChildMolecules(parentId: string): MoleculeSummary[];
    /**
     * Get molecule count.
     */
    getMoleculeCount(): number;
    /**
     * Get all atom-test links.
     */
    getAllLinks(): AtomTestLinkSummary[];
    /**
     * Get links for a specific atom.
     */
    getLinksForAtom(atomId: string): AtomTestLinkSummary[];
    /**
     * Get links for a specific test file.
     */
    getLinksForTestFile(testFilePath: string): AtomTestLinkSummary[];
    /**
     * Get atoms with no test links (uncovered atoms).
     */
    getUncoveredAtoms(): AtomSummary[];
    /**
     * Get link count.
     */
    getLinkCount(): number;
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
    };
}
