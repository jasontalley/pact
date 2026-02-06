"use strict";
/**
 * Main Cache Module
 *
 * Data model for caching Pact Main state locally.
 * This is a read-only cache of committed atoms, molecules, and links.
 *
 * Local = plausible, Canonical = true.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainCache = void 0;
/**
 * In-memory representation of the Main state cache.
 * Provides query methods for local tooling.
 */
class MainCache {
    atoms = new Map();
    molecules = new Map();
    atomTestLinks = [];
    snapshotVersion = 0;
    pulledAt = null;
    serverUrl = '';
    projectId;
    /**
     * Load cache data from serialized format.
     */
    load(data) {
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
    export() {
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
    isEmpty() {
        return this.atoms.size === 0;
    }
    /**
     * Check if the cache is stale.
     *
     * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
     */
    isStale(maxAgeMs = 24 * 60 * 60 * 1000) {
        if (!this.pulledAt) {
            return true;
        }
        return Date.now() - this.pulledAt.getTime() > maxAgeMs;
    }
    /**
     * Get the snapshot version.
     */
    getSnapshotVersion() {
        return this.snapshotVersion;
    }
    /**
     * Get when the cache was last pulled.
     */
    getPulledAt() {
        return this.pulledAt;
    }
    /**
     * Get the server URL this cache was pulled from.
     */
    getServerUrl() {
        return this.serverUrl;
    }
    /**
     * Get the project ID (if multi-tenant).
     */
    getProjectId() {
        return this.projectId;
    }
    // ===========================================================================
    // Atom Queries
    // ===========================================================================
    /**
     * Get an atom by ID.
     */
    getAtom(id) {
        return this.atoms.get(id);
    }
    /**
     * Get all atoms.
     */
    getAllAtoms() {
        return Array.from(this.atoms.values());
    }
    /**
     * Query atoms with filters.
     */
    queryAtoms(options) {
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
    getCommittedAtoms() {
        return this.queryAtoms({ status: 'committed' });
    }
    /**
     * Get atoms by category.
     */
    getAtomsByCategory(category) {
        return this.queryAtoms({ category });
    }
    /**
     * Get atom count.
     */
    getAtomCount() {
        return this.atoms.size;
    }
    // ===========================================================================
    // Molecule Queries
    // ===========================================================================
    /**
     * Get a molecule by ID.
     */
    getMolecule(id) {
        return this.molecules.get(id);
    }
    /**
     * Get all molecules.
     */
    getAllMolecules() {
        return Array.from(this.molecules.values());
    }
    /**
     * Get molecules by lens type.
     */
    getMoleculesByLensType(lensType) {
        return Array.from(this.molecules.values()).filter((m) => m.lensType === lensType);
    }
    /**
     * Get child molecules of a parent.
     */
    getChildMolecules(parentId) {
        return Array.from(this.molecules.values()).filter((m) => m.parentMoleculeId === parentId);
    }
    /**
     * Get molecule count.
     */
    getMoleculeCount() {
        return this.molecules.size;
    }
    // ===========================================================================
    // Atom-Test Link Queries
    // ===========================================================================
    /**
     * Get all atom-test links.
     */
    getAllLinks() {
        return [...this.atomTestLinks];
    }
    /**
     * Get links for a specific atom.
     */
    getLinksForAtom(atomId) {
        return this.atomTestLinks.filter((link) => link.atomId === atomId);
    }
    /**
     * Get links for a specific test file.
     */
    getLinksForTestFile(testFilePath) {
        return this.atomTestLinks.filter((link) => link.testFilePath === testFilePath);
    }
    /**
     * Get atoms with no test links (uncovered atoms).
     */
    getUncoveredAtoms() {
        const linkedAtomIds = new Set(this.atomTestLinks.map((link) => link.atomId));
        return Array.from(this.atoms.values()).filter((atom) => atom.status === 'committed' && !linkedAtomIds.has(atom.id));
    }
    /**
     * Get link count.
     */
    getLinkCount() {
        return this.atomTestLinks.length;
    }
    // ===========================================================================
    // Summary Methods
    // ===========================================================================
    /**
     * Get a summary of the cache contents.
     */
    getSummary() {
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
exports.MainCache = MainCache;
