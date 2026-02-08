/**
 * JSON Recovery Utility
 *
 * Robust JSON extraction from LLM responses that may include:
 * - Markdown code fences (```json ... ```)
 * - Preamble/trailing text around JSON
 * - Trailing commas
 * - Truncated output (unclosed braces/brackets)
 *
 * Uses a 3-layer recovery strategy:
 * 1. Direct parse (clean JSON)
 * 2. Strip fences + extract JSON region + parse
 * 3. Repair common issues (trailing commas, unclosed structures)
 */

/**
 * Extract JSON text from content that may have surrounding text.
 * Finds the outermost JSON object or array using brace/bracket matching.
 *
 * @returns The extracted JSON string, or null if no JSON found
 */
export function extractJsonFromContent(content: string): string | null {
  // Find the first { or [
  const objStart = content.indexOf('{');
  const arrStart = content.indexOf('[');

  let startIdx: number;
  let openChar: string;
  let closeChar: string;

  if (objStart === -1 && arrStart === -1) return null;

  if (objStart === -1) {
    startIdx = arrStart;
    openChar = '[';
    closeChar = ']';
  } else if (arrStart === -1) {
    startIdx = objStart;
    openChar = '{';
    closeChar = '}';
  } else {
    // Pick whichever comes first
    if (objStart <= arrStart) {
      startIdx = objStart;
      openChar = '{';
      closeChar = '}';
    } else {
      startIdx = arrStart;
      openChar = '[';
      closeChar = ']';
    }
  }

  // Match braces/brackets, respecting strings
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIdx; i < content.length; i++) {
    const ch = content[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === openChar || (openChar === '{' && ch === '{') || (openChar === '[' && ch === '[')) {
      if (ch === '{' || ch === '[') depth++;
    }
    if (
      ch === closeChar ||
      (closeChar === '}' && ch === '}') ||
      (closeChar === ']' && ch === ']')
    ) {
      if (ch === '}' || ch === ']') depth--;
    }

    if (depth === 0 && i > startIdx) {
      return content.substring(startIdx, i + 1);
    }
  }

  // Unclosed - return from start to end (will be repaired later)
  return content.substring(startIdx);
}

/**
 * Strip markdown code fences from content.
 */
function stripMarkdownFences(content: string): string {
  let text = content.trim();

  // Handle ```json ... ``` or ``` ... ``` anywhere in the text
  const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)```/;
  const match = text.match(fenceRegex);
  if (match) {
    text = match[1].trim();
  }

  return text;
}

/**
 * Repair common JSON issues from LLM output.
 */
function repairJson(text: string): string {
  let repaired = text;

  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  // Close unclosed structures
  const opens = { '{': 0, '[': 0 };
  const closes = { '}': 0, ']': 0 };
  let inStr = false;
  let escape = false;

  for (const ch of repaired) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inStr) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;

    if (ch === '{') opens['{']++;
    if (ch === '}') closes['}']++;
    if (ch === '[') opens['[']++;
    if (ch === ']') closes[']']++;
  }

  // Append missing closing characters
  const missingBrackets = opens['['] - closes[']'];
  const missingBraces = opens['{'] - closes['}'];

  for (let i = 0; i < missingBrackets; i++) repaired += ']';
  for (let i = 0; i < missingBraces; i++) repaired += '}';

  return repaired;
}

/**
 * Parse JSON from an LLM response with 3-layer recovery.
 *
 * Layer 1: Direct JSON.parse
 * Layer 2: Strip fences, extract JSON region, parse
 * Layer 3: Repair common issues (trailing commas, unclosed structures), parse
 *
 * @param content - Raw LLM response text
 * @returns Parsed JSON value, or null if unrecoverable
 */
export function parseJsonWithRecovery(content: string): Record<string, unknown> | unknown[] | null {
  if (!content || content.trim().length === 0) return null;

  // Layer 1: Try direct parse
  try {
    return JSON.parse(content.trim());
  } catch {
    // Continue to layer 2
  }

  // Layer 2: Strip fences, extract JSON region
  const stripped = stripMarkdownFences(content);

  // Try parsing the stripped content directly
  try {
    return JSON.parse(stripped);
  } catch {
    // Continue
  }

  // Extract JSON region from stripped content
  const extracted = extractJsonFromContent(stripped);
  if (extracted) {
    try {
      return JSON.parse(extracted);
    } catch {
      // Continue to layer 3
    }

    // Layer 3: Repair + parse
    const repaired = repairJson(extracted);
    try {
      return JSON.parse(repaired);
    } catch {
      // Continue
    }
  }

  // Also try extracting from original content (fence stripping may have been wrong)
  const extractedOriginal = extractJsonFromContent(content);
  if (extractedOriginal && extractedOriginal !== extracted) {
    try {
      return JSON.parse(extractedOriginal);
    } catch {
      const repaired = repairJson(extractedOriginal);
      try {
        return JSON.parse(repaired);
      } catch {
        // Unrecoverable
      }
    }
  }

  return null;
}
