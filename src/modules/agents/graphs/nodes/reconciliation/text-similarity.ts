/**
 * Text Similarity Utilities
 *
 * Shared text similarity functions used by:
 * - infer-atoms.node.ts (pre-LLM evidence deduplication)
 * - synthesize-molecules.node.ts (cross-evidence atom deduplication, semantic clustering)
 */

/**
 * Tokenize text into lowercase words > 2 characters.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Generate word bigrams from a token array.
 * Captures word-order pairs like ["email", "notification"] → ["email_notification"].
 */
export function toBigrams(words: string[]): string[] {
  return words.slice(0, -1).map((w, i) => `${w}_${words[i + 1]}`);
}

/**
 * Compute text similarity using a weighted combination of:
 * - Jaccard word overlap (60%) — catches shared vocabulary
 * - Bigram overlap (40%) — catches word-order patterns, helps with paraphrases
 *
 * Returns a value between 0 (no similarity) and 1 (identical).
 */
export function computeTextSimilarity(text1: string, text2: string): number {
  const words1 = tokenize(text1);
  const words2 = tokenize(text2);

  if (words1.length === 0 && words2.length === 0) return 1;
  if (words1.length === 0 || words2.length === 0) return 0;

  // Jaccard word overlap
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = new Set([...set1].filter((w) => set2.has(w)));
  const union = new Set([...set1, ...set2]);
  const jaccardScore = intersection.size / union.size;

  // Bigram overlap (catches word reordering)
  const bigrams1 = new Set(toBigrams(words1));
  const bigrams2 = new Set(toBigrams(words2));
  if (bigrams1.size === 0 && bigrams2.size === 0) return jaccardScore;

  const bigramIntersection = new Set([...bigrams1].filter((b) => bigrams2.has(b)));
  const bigramUnion = new Set([...bigrams1, ...bigrams2]);
  const bigramScore = bigramUnion.size > 0 ? bigramIntersection.size / bigramUnion.size : 0;

  // Weighted combination: 60% word overlap, 40% bigram overlap
  return jaccardScore * 0.6 + bigramScore * 0.4;
}
