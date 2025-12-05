/**
 * Token estimation utilities for LLM cost prediction
 */

/**
 * Approximate tokens per character for different content types
 * Code typically has more tokens per character than prose
 */
const TOKENS_PER_CHAR = {
  code: 0.35, // TypeScript/JavaScript averages ~0.35 tokens per char
  prose: 0.25, // English prose averages ~0.25 tokens per char (1 token ≈ 4 chars)
};

/**
 * Pricing per 1M tokens (input) for common models - as of 2024
 * These are rough estimates and may change
 */
export const MODEL_PRICING: Record<string, { input: number; output: number; context: number }> = {
  // --- OpenAI ---
  // GPT-5 Series (Flagship 2025)
  "gpt-5": { input: 1.25, output: 10, context: 400000 },
  "gpt-5-mini": { input: 0.25, output: 2, context: 400000 },

  // Reasoning (o1 Series)
  "o1-preview": { input: 15, output: 60, context: 128000 },
  "o1-mini": { input: 3, output: 12, context: 128000 },

  // Legacy / Previous Gen
  "gpt-4o": { input: 2.5, output: 10, context: 128000 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, context: 128000 },
  "gpt-4-turbo": { input: 10, output: 30, context: 128000 },

  // --- Anthropic ---
  // Claude 4.5 Series (Late 2025)
  "claude-4-5-opus": { input: 5, output: 25, context: 200000 }, // Huge price cut from 3.0 Opus
  "claude-4-5-sonnet": { input: 3, output: 15, context: 200000 },

  // Claude 3.5 Series
  "claude-3-5-sonnet-20241022": { input: 3, output: 15, context: 200000 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4, context: 200000 },

  // Claude 3 Legacy
  "claude-3-opus-20240229": { input: 15, output: 75, context: 200000 },

  // --- Google (Vertex AI / Gemini API) ---
  // Note: Prices below are for prompts <= 200k.
  // Prompts > 200k are typically 2x the input price.

  // Gemini 3 (New Flagship)
  "gemini-3-pro": { input: 2, output: 12, context: 1000000 }, // + Audio/Video native

  // Gemini 2.5 Series
  "gemini-2.5-pro": { input: 1.25, output: 10, context: 1000000 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, context: 1000000 },

  // Gemini 1.5 Series (Legacy)
  "gemini-1.5-pro": { input: 1.25, output: 5, context: 2000000 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3, context: 1000000 },
  "gemini-1.5-flash-8b": { input: 0.0375, output: 0.15, context: 1000000 },

  // --- Mistral ---
  "mistral-large-latest": { input: 2, output: 6, context: 128000 },
  "mistral-nemo": { input: 0.15, output: 0.15, context: 128000 },
};

/**
 * Token estimation result
 */
export interface TokenEstimate {
  /** Total characters in the content */
  characters: number;
  /** Estimated token count */
  tokens: number;
  /** Estimated cost in USD (if model pricing available) */
  estimatedCost?: number;
  /** Model context window size */
  contextWindow?: number;
  /** Percentage of context window used */
  contextUsagePercent?: number;
  /** Warning if approaching context limit */
  warning?: string;
}

/**
 * Estimate tokens for a given text content
 * Uses a simple heuristic based on character count
 */
export function estimateTokens(content: string, isCode = true): number {
  const ratio = isCode ? TOKENS_PER_CHAR.code : TOKENS_PER_CHAR.prose;
  return Math.ceil(content.length * ratio);
}

/**
 * Get comprehensive token estimate with cost prediction
 */
export function getTokenEstimate(content: string, model?: string, isCode = true): TokenEstimate {
  const characters = content.length;
  const tokens = estimateTokens(content, isCode);

  const result: TokenEstimate = {
    characters,
    tokens,
  };

  // Try to find pricing for the model
  if (model) {
    // Try exact match first, then partial match
    let pricing = MODEL_PRICING[model];

    if (!pricing) {
      // Try partial match (e.g., "gpt-4o" matches "gpt-4o-2024-05-13")
      const modelLower = model.toLowerCase();
      for (const [key, value] of Object.entries(MODEL_PRICING)) {
        if (modelLower.includes(key.toLowerCase()) || key.toLowerCase().includes(modelLower)) {
          pricing = value;
          break;
        }
      }
    }

    if (pricing) {
      // Calculate cost (pricing is per 1M tokens)
      result.estimatedCost = (tokens / 1_000_000) * pricing.input;
      result.contextWindow = pricing.context;
      result.contextUsagePercent = Math.round((tokens / pricing.context) * 100 * 10) / 10;

      // Add warning if approaching context limit
      if (result.contextUsagePercent > 80) {
        result.warning = `High context usage (${result.contextUsagePercent}%). Consider splitting into subfolders.`;
      } else if (result.contextUsagePercent > 95) {
        result.warning = `Critical: Approaching context limit (${result.contextUsagePercent}%). Request may fail.`;
      }
    }
  }

  return result;
}

/**
 * Format token estimate for display
 */
export function formatTokenEstimate(estimate: TokenEstimate, model?: string): string {
  const lines: string[] = [];

  lines.push(`Characters: ${estimate.characters.toLocaleString()}`);
  lines.push(`Estimated tokens: ~${estimate.tokens.toLocaleString()}`);

  if (estimate.contextWindow) {
    lines.push(`Context usage: ${estimate.contextUsagePercent}% of ${(estimate.contextWindow / 1000).toFixed(0)}K`);
  }

  if (estimate.estimatedCost !== undefined) {
    const cost = estimate.estimatedCost;
    if (cost < 0.01) {
      lines.push(`Estimated input cost: <$0.01`);
    } else {
      lines.push(`Estimated input cost: $${cost.toFixed(4)}`);
    }
  } else if (model) {
    lines.push(`Cost estimate: unavailable for model "${model}"`);
  }

  if (estimate.warning) {
    lines.push(`⚠️  ${estimate.warning}`);
  }

  return lines.join("\n");
}

/**
 * Aggregate multiple token estimates
 */
export function aggregateEstimates(estimates: TokenEstimate[]): TokenEstimate {
  const total: TokenEstimate = {
    characters: 0,
    tokens: 0,
    estimatedCost: 0,
  };

  for (const est of estimates) {
    total.characters += est.characters;
    total.tokens += est.tokens;
    if (est.estimatedCost !== undefined) {
      total.estimatedCost = (total.estimatedCost ?? 0) + est.estimatedCost;
    }
  }

  // Take context info from first estimate that has it
  const withContext = estimates.find((e) => e.contextWindow);
  if (withContext) {
    total.contextWindow = withContext.contextWindow;
    total.contextUsagePercent = Math.round((total.tokens / total.contextWindow!) * 100 * 10) / 10;

    if (total.contextUsagePercent > 80) {
      total.warning = `High context usage (${total.contextUsagePercent}%). Consider splitting into subfolders.`;
    }
  }

  return total;
}
