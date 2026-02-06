import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';

/**
 * Atom interface for BDD tests
 */
export interface Atom {
  id: string;
  atomId: string;
  description: string;
  category: string;
  status: 'draft' | 'committed' | 'superseded';
  qualityScore: number | null;
  committedAt: Date | null;
  supersededBy: string | null;
  tags: string[];
}

/**
 * Atomization result interface
 */
export interface AtomizationResult {
  success: boolean;
  atom?: Atom;
  confidence: number;
  analysis: string;
  message?: string;
}

/**
 * Custom World class for Cucumber tests.
 * Holds shared state between step definitions.
 */
export class PactWorld extends World {
  // Intent being tested
  intentDescription: string | null = null;
  category: string | null = null;

  // Atomization result
  atomizationResult: AtomizationResult | null = null;

  // Current atom being operated on
  currentAtom: Atom | null = null;

  // Multiple atoms for filtering/searching scenarios
  atoms: Atom[] = [];

  // Response from last operation
  lastResponse: {
    status: number;
    message?: string;
    data?: any;
  } | null = null;

  // Search/filter results
  searchResults: Atom[] = [];

  // Authentication context
  isAuthenticated = false;
  userRole: string | null = null;

  // ID counter for generating atom IDs
  private atomIdCounter = 100;

  constructor(options: IWorldOptions) {
    super(options);
  }

  /**
   * Generate next atom ID
   */
  generateAtomId(): string {
    return `IA-${String(this.atomIdCounter++).padStart(3, '0')}`;
  }

  /**
   * Create a mock atom
   */
  createMockAtom(
    description: string,
    category: string = 'functional',
    status: 'draft' | 'committed' | 'superseded' = 'draft',
  ): Atom {
    const atomId = this.generateAtomId();
    return {
      id: `uuid-${atomId}`,
      atomId,
      description,
      category,
      status,
      qualityScore: null,
      committedAt: status === 'committed' ? new Date() : null,
      supersededBy: null,
      tags: [],
    };
  }

  /**
   * Reset world state between scenarios
   */
  reset(): void {
    this.intentDescription = null;
    this.category = null;
    this.atomizationResult = null;
    this.currentAtom = null;
    this.atoms = [];
    this.lastResponse = null;
    this.searchResults = [];
  }
}

setWorldConstructor(PactWorld);
