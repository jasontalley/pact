import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';

/**
 * Custom World class for Cucumber tests.
 * Holds shared state between step definitions.
 */
export class PactWorld extends World {
  // Intent being tested
  intentDescription: string | null = null;
  category: string | null = null;

  // Atomization result
  atomizationResult: {
    success: boolean;
    atom?: {
      id: string;
      atomId: string;
      description: string;
      category: string;
      status: string;
    };
    confidence: number;
    analysis: string;
    message?: string;
  } | null = null;

  // Authentication context
  isAuthenticated = false;
  userRole: string | null = null;

  constructor(options: IWorldOptions) {
    super(options);
  }

  /**
   * Reset world state between scenarios
   */
  reset(): void {
    this.intentDescription = null;
    this.category = null;
    this.atomizationResult = null;
  }
}

setWorldConstructor(PactWorld);
