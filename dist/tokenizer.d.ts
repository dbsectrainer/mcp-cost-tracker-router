/**
 * Token count estimation utilities.
 * Uses a simple character-based approximation: chars / 4 ≈ tokens.
 * All counts are labeled as estimates.
 */
export declare function estimateTokens(text: string): number;
export declare function estimateTokensFromObject(obj: unknown): number;
