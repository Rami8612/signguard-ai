/**
 * 4byte.directory client for unverified signature lookup.
 *
 * IMPORTANT: Results from this source are NEVER verified and should
 * NEVER influence risk assessment. This is purely for reference.
 */

const FOURBYTE_API = "https://www.4byte.directory/api/v1/signatures/";

/**
 * Look up a function selector on 4byte.directory
 * Returns unverified signature information
 */
export async function lookupSelector(selector) {
  const normalizedSelector = selector.toLowerCase().replace("0x", "");

  try {
    const response = await fetch(
      `${FOURBYTE_API}?hex_signature=0x${normalizedSelector}`,
      {
        headers: {
          "Accept": "application/json"
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return null;
    }

    // Return the most popular (first) result, but mark as unverified
    // 4byte sorts by number of times a signature has been added
    const bestMatch = data.results[0];

    return {
      signature: bestMatch.text_signature,
      verified: false, // ALWAYS false - this is unverified data
      source: "4byte.directory",
      sourceNote: "External, unverified database - do not trust for risk assessment",
      allMatches: data.results.map(r => r.text_signature)
    };
  } catch (error) {
    // Network errors, timeouts, etc. - fail gracefully
    if (error.name === "TimeoutError") {
      return {
        error: "timeout",
        message: "4byte.directory lookup timed out"
      };
    }
    return {
      error: "network",
      message: `4byte.directory lookup failed: ${error.message}`
    };
  }
}

/**
 * Parse parameter types from an unverified signature
 * This is best-effort only - the signature may be wrong
 */
export function parseUnverifiedSignature(signature) {
  if (!signature) return null;

  const match = signature.match(/^(\w+)\((.*)\)$/);
  if (!match) return null;

  const name = match[1];
  const typeString = match[2];

  // Handle empty parameter list
  if (!typeString.trim()) {
    return { name, types: [], paramCount: 0 };
  }

  // Simple type parsing (may fail on complex tuple types)
  const types = [];
  let current = "";
  let depth = 0;

  for (const char of typeString) {
    if (char === "(") {
      depth++;
      current += char;
    } else if (char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      if (current.trim()) {
        types.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    types.push(current.trim());
  }

  return {
    name,
    types,
    paramCount: types.length
  };
}
