/**
 * Token counting utilities using js-tiktoken (cl100k_base encoding).
 * Falls back to the char/4 approximation if the tiktoken encoding is unavailable.
 */
import { getEncoding } from "js-tiktoken";

function countWithTiktoken(text: string): number {
  try {
    const enc = getEncoding("cl100k_base");
    return enc.encode(text).length;
  } catch {
    // Fallback: char/4 approximation for unknown encodings
    return Math.ceil(text.length / 4);
  }
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return countWithTiktoken(text);
}

export function estimateTokensFromObject(obj: unknown): number {
  try {
    const json = JSON.stringify(obj);
    return estimateTokens(json);
  } catch {
    return 0;
  }
}
