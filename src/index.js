/**
 * Main orchestration module for calldata decoding
 */

import { extractSelector, decodeParams } from "./decoder.js";
import { lookupSelector as lookupVerifiedSelector } from "./selectors.js";
import { lookupSelector as lookup4byte, parseUnverifiedSignature } from "./fourByte.js";
import { analyzeEffects } from "./effectAnalyzer.js";
import { formatHumanReadable, formatJSON, formatError } from "./formatter.js";
import { loadProfile, createEmptyProfile, getSelectorLabel } from "./trustProfile.js";
import {
  getTrustContext,
  canInterpretSelector,
  computeHeaderSeverity,
  computeBatchHeaderSeverity
} from "./trustClassifier.js";
import { parseBatchTransaction, isMultiSendCalldata, BATCH_TYPE } from "./batchParser.js";
import { decodeWithAbi } from "./abiDecoder.js";

/**
 * Extract function name from a full signature.
 * e.g., "supply(address,uint256,address,uint16)" -> "supply"
 */
function extractFunctionName(signature) {
  if (!signature) return null;
  const match = signature.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
  return match ? match[1] : null;
}

/**
 * Severity levels in order of increasing severity
 */
const SEVERITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"];

/**
 * Compare two severity levels
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
function compareSeverity(a, b) {
  const indexA = SEVERITY_ORDER.indexOf(a);
  const indexB = SEVERITY_ORDER.indexOf(b);
  // UNKNOWN is treated as highest severity for safety
  const effectiveA = indexA === -1 ? SEVERITY_ORDER.length : indexA;
  const effectiveB = indexB === -1 ? SEVERITY_ORDER.length : indexB;
  return effectiveA - effectiveB;
}

/**
 * Get the maximum severity from a list
 */
function maxSeverity(severities) {
  return severities.reduce((max, current) => {
    return compareSeverity(current, max) > 0 ? current : max;
  }, "LOW");
}

/**
 * Classify severity into summary category
 */
function classifySeverity(severity) {
  switch (severity) {
    case "LOW":
    case "MEDIUM":
      return "OK";
    case "HIGH":
      return "WARN";
    case "CRITICAL":
      return "DANGER";
    case "UNKNOWN":
    default:
      return "UNKNOWN";
  }
}

/**
 * Check if a function name matches a trust profile label.
 * Case-insensitive comparison.
 */
function functionNameMatchesLabel(functionName, label) {
  if (!functionName || !label) return false;
  return functionName.toLowerCase() === label.toLowerCase();
}

/**
 * Analyze a single sub-transaction from a batch
 *
 * @param {object} call - Sub-transaction from batch
 * @param {object} options - Decode options (profile, offline)
 * @returns {object} Analysis result for this sub-transaction
 */
async function analyzeSubCall(call, options) {
  // Skip analysis for empty calldata (pure ETH transfers)
  if (!call.data || call.data === "0x" || call.dataLength === 0) {
    return {
      isEthTransfer: true,
      severity: "MEDIUM", // ETH transfers have medium risk
      summary: "ETH transfer",
      category: "OK"
    };
  }

  // Validate calldata has at least a selector
  if (call.data.length < 10) {
    return {
      error: "Calldata too short",
      severity: "UNKNOWN",
      summary: "Invalid calldata",
      category: "UNKNOWN"
    };
  }

  try {
    // Run the decode pipeline on the sub-transaction calldata
    // Use the sub-transaction's target address for trust profile context
    const subOptions = {
      ...options,
      targetAddress: call.to,
      // Always offline for sub-transaction analysis (no recursive 4byte lookups)
      offline: true
    };

    const selector = extractSelector(call.data);

    // Try verified database first
    let selectorInfo = lookupVerifiedSelector(selector);

    // Load trust profile if provided
    let profile = options.profile || null;
    if (!profile && options.profilePath) {
      profile = loadProfile(options.profilePath);
    }

    // Generate trust context for sub-transaction target
    let trustContext = null;
    let trustBlocked = false;

    if (profile && call.to) {
      trustContext = getTrustContext(call.to, selector, profile);

      // Check if trust profile blocks interpretation
      if (trustContext.profileLoaded && !canInterpretSelector(trustContext)) {
        trustBlocked = true;
      }

      // Try trust profile label if no verified selector
      if (trustContext.profileLoaded &&
          canInterpretSelector(trustContext) &&
          trustContext.selectorLabel &&
          !selectorInfo?.verified) {

        const trustProfileLabel = trustContext.selectorLabel;
        selectorInfo = {
          ...selectorInfo,
          trustProfileVerified: true,
          trustProfileLabel: trustProfileLabel,
          source: "TRUST_PROFILE",
          verified: false,
          description: `Function "${trustProfileLabel}" identified via trust profile`
        };
      }
    }

    // Try local ABI decode first for named parameters
    let params = null;
    let paramAnalysis = null;
    let abiVerified = false;

    if (call.to) {
      const abiResult = decodeWithAbi(call.data, call.to, { profile });
      if (abiResult) {
        params = abiResult.params;
        abiVerified = true;
        if (!selectorInfo) {
          selectorInfo = {};
        }
        selectorInfo = {
          ...selectorInfo,
          signature: abiResult.signature,
          paramNames: abiResult.paramNames,
          abiVerified: true
        };
      }
    }

    // Fallback: Decode parameters if we have a signature but no ABI decode
    if (!params && selectorInfo?.signature) {
      try {
        const decoded = decodeParams(
          call.data,
          selectorInfo.signature,
          selectorInfo.paramNames || []
        );
        params = decoded.params;

        if (selectorInfo.analyzeParams) {
          paramAnalysis = selectorInfo.analyzeParams(decoded.params);
        }
      } catch (e) {
        // Parameter decode failed - continue without params
      }
    }

    // Analyze effects
    const effect = analyzeEffects(selectorInfo, params, paramAnalysis, { profile, trustContext });

    // Apply trust override if blocked
    let severity = effect.severity;
    if (trustBlocked) {
      severity = "UNKNOWN";
    }

    // Check for DELEGATECALL - always flag as CRITICAL
    if (call.operation === 1) { // DELEGATECALL
      severity = "CRITICAL";
    }

    return {
      selector,
      signature: selectorInfo?.signature || null,
      verified: selectorInfo?.verified || false,
      abiVerified: abiVerified,
      trustProfileVerified: selectorInfo?.trustProfileVerified || false,
      trustBlocked,
      effectType: effect.effectType,
      severity,
      category: classifySeverity(severity),
      summary: effect.consequences?.[0] || (selectorInfo?.description || "Unknown function"),
      functionName: selectorInfo?.signature ? extractFunctionName(selectorInfo.signature) : null,
      params,
      isDelegatecall: call.operation === 1,
      trustContext: trustContext ? {
        contractClassification: trustContext.contractClassification,
        label: trustContext.label,
        trustLevel: trustContext.trustLevel
      } : null
    };
  } catch (error) {
    return {
      error: error.message,
      severity: "UNKNOWN",
      summary: "Analysis failed",
      category: "UNKNOWN"
    };
  }
}

/**
 * Analyze all sub-transactions in a batch
 *
 * @param {object} batchInfo - Parsed batch info from parseBatchTransaction
 * @param {object} options - Decode options
 * @returns {object} Enhanced batchInfo with analysis results
 */
async function analyzeSubTransactions(batchInfo, options) {
  const severities = [];
  const categories = { OK: 0, WARN: 0, DANGER: 0, UNKNOWN: 0 };

  // Load profile to check if we have one
  let profile = options.profile || null;
  if (!profile && options.profilePath) {
    profile = loadProfile(options.profilePath);
  }
  const hasProfile = profile && !profile.error;

  // Analyze each sub-transaction
  for (const call of batchInfo.calls) {
    const analysis = await analyzeSubCall(call, options);
    call.analysis = analysis;

    severities.push(analysis.severity);
    categories[analysis.category] = (categories[analysis.category] || 0) + 1;
  }

  // Calculate batch summary
  batchInfo.batchSummary = {
    overallSeverity: maxSeverity(severities),
    overallCategory: classifySeverity(maxSeverity(severities)),
    counts: categories,
    analyzed: true
  };

  // Compute trust-first header severity for the batch
  batchInfo.headerSeverity = computeBatchHeaderSeverity(batchInfo.calls, hasProfile);

  return batchInfo;
}

/**
 * Decode calldata and return structured result
 *
 * @param {string} calldata - Raw hex calldata
 * @param {object} options - Decoding options
 * @param {boolean} options.offline - If true, don't query external services
 * @param {string} options.targetAddress - Target contract address (for trust profile)
 * @param {string} options.profilePath - Path to trust profile JSON file
 * @param {object} options.profile - Pre-loaded trust profile object
 * @param {number} options.operation - Operation type: 0=CALL (default), 1=DELEGATECALL
 * @returns {object} Decoded result with effect analysis
 */
export async function decode(calldata, options = {}) {
  // Validate operation parameter
  const operation = options.operation ?? 0;
  if (operation !== 0 && operation !== 1) {
    throw new Error("Invalid operation: must be 0 (CALL) or 1 (DELEGATECALL)");
  }

  // Validate input
  if (!calldata || typeof calldata !== "string") {
    throw new Error("Calldata must be a non-empty string");
  }

  // Normalize calldata
  const normalizedCalldata = calldata.trim();
  if (!normalizedCalldata.match(/^(0x)?[0-9a-fA-F]*$/)) {
    throw new Error("Invalid calldata: must be hexadecimal");
  }

  if (normalizedCalldata.replace("0x", "").length < 8) {
    throw new Error("Calldata too short: must contain at least a 4-byte selector");
  }

  // Extract selector
  const selector = extractSelector(normalizedCalldata);

  // ═══════════════════════════════════════════════════════════════════
  // BATCH TRANSACTION DETECTION (Phase 12)
  // Detect MultiSend batch transactions and analyze sub-transactions
  // ═══════════════════════════════════════════════════════════════════

  let batchInfo = null;
  if (isMultiSendCalldata(normalizedCalldata)) {
    batchInfo = parseBatchTransaction(normalizedCalldata, {
      targetAddress: options.targetAddress
    });

    // Phase 12 Step 2: Analyze each sub-transaction
    if (batchInfo && batchInfo.isBatch && batchInfo.batchType !== BATCH_TYPE.UNPARSEABLE_BATCH) {
      batchInfo = await analyzeSubTransactions(batchInfo, options);
    }
  }

  // Try verified database first
  let selectorInfo = lookupVerifiedSelector(selector);
  let source = "verified_database";
  let unverifiedLookup = null;

  // If not found and not offline, try 4byte.directory
  if (!selectorInfo && !options.offline) {
    unverifiedLookup = await lookup4byte(selector);
    if (unverifiedLookup && !unverifiedLookup.error) {
      selectorInfo = {
        signature: unverifiedLookup.signature,
        verified: false,
        source: "4byte.directory",
        allMatches: unverifiedLookup.allMatches
      };
      source = "4byte.directory";
    }
  }

  // Build result
  const result = {
    calldata: normalizedCalldata,
    selector,
    verified: selectorInfo?.verified || false,
    source,
    targetAddress: options.targetAddress || null
  };

  // Add batch info if this is a batch transaction
  if (batchInfo && batchInfo.isBatch) {
    result.isBatch = true;
    result.batchInfo = batchInfo;
    // Propagate batch header severity to top level
    if (batchInfo.headerSeverity) {
      result.headerSeverity = batchInfo.headerSeverity;
    }
  }

  // If we have a signature, try to decode parameters
  if (selectorInfo?.signature) {
    result.signature = selectorInfo.signature;
    result.description = selectorInfo.description || "Function from unverified source";

    try {
      const decoded = decodeParams(
        normalizedCalldata,
        selectorInfo.signature,
        selectorInfo.paramNames || []
      );
      result.functionName = decoded.functionName;
      result.params = decoded.params;

      // Analyze parameters if we have a verified analyzer
      if (selectorInfo.analyzeParams) {
        result.paramAnalysis = selectorInfo.analyzeParams(decoded.params);
      }
    } catch (decodeError) {
      // Parameter decoding failed - signature might be wrong
      result.decodeError = decodeError.message;
      if (!selectorInfo.verified) {
        result.signature = null; // Don't show potentially wrong signature
      }
    }
  }

  // Add unverified lookup info
  if (unverifiedLookup) {
    result.allMatches = unverifiedLookup.allMatches;
  }

  // ═══════════════════════════════════════════════════════════════════
  // TRUST PROFILE ANALYSIS
  // ═══════════════════════════════════════════════════════════════════

  // Load trust profile if provided
  let profile = options.profile || null;
  if (!profile && options.profilePath) {
    profile = loadProfile(options.profilePath);
  }

  // ═══════════════════════════════════════════════════════════════════
  // LOCAL ABI DECODING
  // If targetAddress is provided, try to decode using local ABI registry.
  // This provides named parameters (asset, amount, to) instead of param0/param1.
  // ═══════════════════════════════════════════════════════════════════
  if (options.targetAddress) {
    const abiResult = decodeWithAbi(normalizedCalldata, options.targetAddress, { profile });

    if (abiResult) {
      // ABI decode succeeded - use named parameters
      result.abiVerified = true;
      result.abiSource = abiResult.abiSource;
      result.functionName = abiResult.functionName;
      result.signature = abiResult.signature;
      result.params = abiResult.params;

      // Update selectorInfo with ABI-derived info for effect analysis
      if (!selectorInfo) {
        selectorInfo = {};
      }
      selectorInfo = {
        ...selectorInfo,
        signature: abiResult.signature,
        paramNames: abiResult.paramNames,
        verified: false, // Local ABI is not the same as verified database
        abiVerified: true
      };
      result.source = abiResult.abiSource;
    }
  }

  // Generate trust context if we have both profile and target address
  if (profile && options.targetAddress) {
    result.trustContext = getTrustContext(
      options.targetAddress,
      result.selector,
      profile,
      { operation }
    );

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 11: TRUST PROFILE TO CONSEQUENCE ANALYSIS BRIDGE
    // ═══════════════════════════════════════════════════════════════════
    //
    // When a selector is:
    // 1. Explicitly allowed by the trust profile for this contract
    // 2. Has a label in the trust profile
    // 3. Is NOT in the verified database (so would otherwise be UNKNOWN)
    //
    // We MAY use the trust profile label as a trusted semantic source,
    // PROVIDED that any available signature matches the label.
    //
    // This is marked as Source: TRUST_PROFILE and is NOT ABI-verified.
    // ═══════════════════════════════════════════════════════════════════

    if (result.trustContext.profileLoaded &&
        canInterpretSelector(result.trustContext) &&
        result.trustContext.selectorLabel &&
        !selectorInfo?.verified &&
        !selectorInfo?.abiVerified) {

      const trustProfileLabel = result.trustContext.selectorLabel;

      // Check if we can use trust profile for semantic interpretation
      let canUseTrustProfile = false;
      let labelMatchesSignature = false;

      if (selectorInfo?.signature) {
        // We have a signature (from 4byte) - check if function name matches label
        const functionName = extractFunctionName(selectorInfo.signature);
        labelMatchesSignature = functionNameMatchesLabel(functionName, trustProfileLabel);

        if (labelMatchesSignature) {
          // Function name matches trust profile label - we can use this
          canUseTrustProfile = true;
        }
      } else {
        // No signature at all - trust profile label provides semantic context
        // but we can't decode parameters
        canUseTrustProfile = true;
      }

      if (canUseTrustProfile) {
        // Enhance selectorInfo with trust profile verification
        selectorInfo = {
          ...selectorInfo,
          trustProfileVerified: true,
          trustProfileLabel: trustProfileLabel,
          source: "TRUST_PROFILE",
          // Keep the original signature if we have one and it matches
          signature: labelMatchesSignature ? selectorInfo.signature : null,
          // If we have matching signature, keep paramNames for decoding
          paramNames: labelMatchesSignature ? selectorInfo.paramNames : [],
          // Mark verified as false - this is NOT ABI verified
          verified: false,
          // Description indicates trust profile source
          description: `Function "${trustProfileLabel}" identified via trust profile`
        };
        source = "TRUST_PROFILE";
        result.source = "TRUST_PROFILE";

        // Re-decode parameters if we have a matching signature
        if (labelMatchesSignature && selectorInfo.signature) {
          try {
            const decoded = decodeParams(
              normalizedCalldata,
              selectorInfo.signature,
              selectorInfo.paramNames || []
            );
            result.functionName = decoded.functionName;
            result.params = decoded.params;

            // Analyze parameters if we have analyzeParams from 4byte (we won't, but future-proof)
            if (selectorInfo.analyzeParams) {
              result.paramAnalysis = selectorInfo.analyzeParams(decoded.params);
            }
          } catch (decodeError) {
            // Parameter decoding failed - label might not match actual ABI
            result.decodeError = decodeError.message;
            // Clear signature since it doesn't work
            selectorInfo.signature = null;
          }
        }
      }
    }

    // CRITICAL: If trust context says we can't interpret, override the analysis
    if (result.trustContext.profileLoaded && !canInterpretSelector(result.trustContext)) {
      // For unknown/untrusted contracts, we refuse to provide confident analysis
      result.trustBlocked = true;
    }
  }

  // Analyze effects (now with potentially trust-enhanced selectorInfo)
  // Pass the profile and trustContext for human-readable consequence generation
  result.effect = analyzeEffects(selectorInfo, result.params, result.paramAnalysis, {
    profile,
    trustContext: result.trustContext
  });

  // Apply trust overrides after effect analysis
  if (result.trustBlocked) {
    result.effect = {
      ...result.effect,
      trustOverride: true,
      originalSeverity: result.effect.severity,
      severity: "UNKNOWN",
      trustWarnings: result.trustContext?.warnings || []
    };
  } else if (result.trustContext?.profileLoaded) {
    // Add trust warnings to the effect analysis
    // Filter out "FIRST TIME" and "NEVER_USED" warnings when ABI is verified
    // because the ABI provides sufficient verification
    let trustWarnings = result.trustContext.warnings || [];
    if (result.abiVerified) {
      trustWarnings = trustWarnings.filter(w =>
        !w.includes("FIRST TIME") &&
        !w.includes("Verify this is intentional")
      );
      // Also update trustContext.warnings so the Trust Profile Context card doesn't show them
      result.trustContext.warnings = trustWarnings;
    }
    result.effect.trustWarnings = trustWarnings;
  }

  // ═══════════════════════════════════════════════════════════════════
  // DELEGATECALL SEVERITY OVERRIDE (MANDATORY)
  // If operation is DELEGATECALL (1) and NOT in trustedDelegateCalls whitelist,
  // severity is ALWAYS CRITICAL. This is non-negotiable.
  // ═══════════════════════════════════════════════════════════════════
  if (operation === 1) {
    result.isDelegatecall = true;
    result.operation = operation;

    const delegateClass = result.trustContext?.delegatecallContext?.classification;
    if (delegateClass !== "TRUSTED") {
      result.effect = {
        ...result.effect,
        delegatecallOverride: true,
        originalSeverity: result.effect.severity,
        severity: "CRITICAL",
        delegatecallWarnings: result.trustContext?.delegatecallContext?.warnings || [
          "DELEGATECALL executes external code with YOUR wallet's full permissions",
          "This contract+selector is NOT in your trustedDelegateCalls whitelist",
          "The target code can modify ANY state: owners, balances, approvals",
          "Calldata semantics may be misleading"
        ]
      };
      result.headerSeverity = "CRITICAL";
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // COMPUTE HEADER SEVERITY (Trust-based)
  // For single (non-batch) transactions, compute from trust context
  // ═══════════════════════════════════════════════════════════════════
  if (!result.isBatch && result.trustContext && !result.isDelegatecall) {
    const headerSev = computeHeaderSeverity(result.trustContext);
    if (headerSev) {
      result.headerSeverity = headerSev;
    }
  } else if (!result.isBatch && result.isDelegatecall && !result.headerSeverity) {
    // Ensure DELEGATECALL without profile still gets severity computed
    const headerSev = computeHeaderSeverity(result.trustContext);
    if (headerSev) {
      result.headerSeverity = headerSev;
    }
  }

  // Include profile in result for trust-aware address display in formatter
  if (profile) {
    result.profile = profile;
  }

  return result;
}

/**
 * Decode and format output
 *
 * @param {string} calldata - Raw hex calldata
 * @param {object} options - Options
 * @param {boolean} options.offline - Don't query external services
 * @param {boolean} options.json - Output JSON instead of human-readable
 * @param {string} options.targetAddress - Target contract address (for trust profile)
 * @param {string} options.profilePath - Path to trust profile JSON file
 * @param {object} options.profile - Pre-loaded trust profile object
 * @returns {string} Formatted output
 */
export async function decodeAndFormat(calldata, options = {}) {
  try {
    const result = await decode(calldata, options);

    // Add targetAddress to result for formatter (if provided)
    if (options.targetAddress) {
      result.targetAddress = options.targetAddress;
    }

    if (options.json) {
      return formatJSON(result);
    }

    return formatHumanReadable(result);
  } catch (error) {
    return formatError(error, options.json);
  }
}

// Export components for direct use
export {
  extractSelector,
  decodeParams,
  lookupVerifiedSelector,
  lookup4byte,
  analyzeEffects,
  formatHumanReadable,
  formatJSON
};

// Export AI explainer components
export { buildExplainerPrompt, validatePromptSafety } from "./explainerPrompt.js";
export { generateExplanation, hasApiKey } from "./aiClient.js";
export { explain, formatExplanation } from "./explainer.js";

// Export trust profile components
export { loadProfile, createEmptyProfile, isDelegatecallAllowed } from "./trustProfile.js";
export {
  getTrustContext,
  canInterpretSelector,
  computeHeaderSeverity,
  computeBatchHeaderSeverity,
  classifyDelegatecall,
  CONTRACT_CLASSIFICATION,
  SELECTOR_CLASSIFICATION,
  DELEGATECALL_CLASSIFICATION,
  HEADER_SEVERITY
} from "./trustClassifier.js";

// Export ABI components
export { getAbi, hasAbi, clearAbiCache } from "./abiRegistry.js";
export { decodeWithAbi, canDecodeWithAbi } from "./abiDecoder.js";
