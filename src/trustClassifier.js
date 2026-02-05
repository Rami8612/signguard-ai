/**
 * Trust Classification Engine
 *
 * Classifies transactions based on trust profile context.
 * Generates warnings and trust assessments based on contract and selector recognition.
 *
 * CRITICAL SECURITY RULES:
 * 1. Unknown contracts = NEVER interpret selectors meaningfully
 * 2. Trust is explicit, never inferred from selector names
 * 3. Even trusted contracts get warnings for unusual selectors
 */

import {
  TRUST_LEVELS,
  getTrustedContract,
  isSelectorAllowed,
  getSelectorUsage,
  getSelectorLabel,
  isDelegatecallAllowed
} from "./trustProfile.js";

/**
 * Contract classification results
 */
export const CONTRACT_CLASSIFICATION = {
  TRUSTED: "TRUSTED",
  WATCHED: "WATCHED",
  UNKNOWN: "UNKNOWN"
};

/**
 * Selector classification results
 */
export const SELECTOR_CLASSIFICATION = {
  EXPECTED: "EXPECTED",           // Selector is whitelisted and commonly used
  UNUSUAL: "UNUSUAL",             // Selector is allowed but rarely/never used
  NEVER_USED: "NEVER_USED",       // First time seeing this selector with this contract
  NOT_ALLOWED: "NOT_ALLOWED",     // Selector is not in the allowed list
  NO_CONTEXT: "NO_CONTEXT"        // Cannot classify (unknown contract)
};

/**
 * DELEGATECALL classification results
 *
 * SECURITY: DELEGATECALL executes external code with the caller's FULL permissions.
 * This is the attack vector used in the Bybit Safe multisig hack.
 */
export const DELEGATECALL_CLASSIFICATION = {
  TRUSTED: "TRUSTED",       // Contract+selector is in trustedDelegateCalls whitelist
  NOT_TRUSTED: "NOT_TRUSTED" // Not whitelisted - CRITICAL risk
};

/**
 * Generate complete trust context for a transaction
 *
 * @param {string} targetAddress - Contract being called
 * @param {string} selector - Function selector
 * @param {object} profile - Trust profile
 * @param {object} options - Additional options
 * @param {number} options.operation - Operation type (0=CALL, 1=DELEGATECALL)
 * @returns {object} Trust context with classifications and warnings
 */
export function getTrustContext(targetAddress, selector, profile, options = {}) {
  const operation = options.operation ?? 0;

  if (!profile || profile.error) {
    const baseContext = {
      profileLoaded: false,
      profileError: profile?.error || "No profile provided",
      contractClassification: CONTRACT_CLASSIFICATION.UNKNOWN,
      selectorClassification: SELECTOR_CLASSIFICATION.NO_CONTEXT,
      warnings: ["No trust profile loaded - cannot assess transaction context"],
      trustLevel: null,
      label: null,
      usageStats: null
    };

    // Add DELEGATECALL context even without profile
    if (operation === 1) {
      baseContext.delegatecallContext = {
        classification: DELEGATECALL_CLASSIFICATION.NOT_TRUSTED,
        warnings: [
          "DELEGATECALL executes external code with YOUR wallet's full permissions",
          "No trust profile loaded - cannot verify if this DELEGATECALL is safe",
          "The target code can modify ANY state: owners, balances, approvals",
          "Calldata semantics may be misleading"
        ]
      };
    }

    return baseContext;
  }

  const normalizedAddress = targetAddress?.toLowerCase();
  const normalizedSelector = selector?.toLowerCase();

  // Classify the contract
  const contractResult = classifyContract(normalizedAddress, profile);

  // Classify the selector (only meaningful if contract is trusted)
  const selectorResult = classifySelector(normalizedAddress, normalizedSelector, profile);

  // Generate contextual warnings
  const warnings = generateTrustWarnings(contractResult, selectorResult, profile);

  // Get additional context
  const contract = getTrustedContract(normalizedAddress, profile);
  const usageStats = getSelectorUsage(normalizedAddress, normalizedSelector, profile);
  const selectorLabel = getSelectorLabel(normalizedAddress, normalizedSelector, profile);

  const context = {
    profileLoaded: true,
    contractClassification: contractResult.classification,
    selectorClassification: selectorResult.classification,
    trustLevel: contract?.trustLevel || null,
    trustLevelInfo: contract ? TRUST_LEVELS[contract.trustLevel] : null,
    label: contract?.label || null,
    selectorLabel: selectorLabel,
    usageStats: usageStats,
    notes: contract?.notes || null,
    warnings: warnings,
    // Detailed results for debugging/logging
    details: {
      contract: contractResult,
      selector: selectorResult
    }
  };

  // Add DELEGATECALL classification if operation is DELEGATECALL
  if (operation === 1) {
    context.delegatecallContext = classifyDelegatecall(normalizedAddress, normalizedSelector, profile);
  }

  return context;
}

/**
 * Classify a DELEGATECALL operation
 *
 * SECURITY: This is the critical function that determines whether a DELEGATECALL
 * is trusted or not. Untrusted DELEGATECALLs are ALWAYS CRITICAL severity.
 *
 * @param {string} address - Target contract address
 * @param {string} selector - Function selector
 * @param {object} profile - Trust profile
 * @returns {object} Classification result with warnings
 */
export function classifyDelegatecall(address, selector, profile) {
  const result = isDelegatecallAllowed(address, selector, profile);

  if (result.allowed) {
    return {
      classification: DELEGATECALL_CLASSIFICATION.TRUSTED,
      reason: result.reason,
      warnings: [
        "DELEGATECALL executes code in your wallet's context - this is trusted in your profile"
      ]
    };
  }

  return {
    classification: DELEGATECALL_CLASSIFICATION.NOT_TRUSTED,
    reason: result.reason,
    warnings: [
      "DELEGATECALL executes external code with YOUR wallet's full permissions",
      "This contract+selector is NOT in your trustedDelegateCalls whitelist",
      "The target code can modify ANY state: owners, balances, approvals",
      "Calldata semantics may be misleading - function names can lie"
    ]
  };
}

/**
 * Classify a contract address against the trust profile
 *
 * @param {string} address - Contract address
 * @param {object} profile - Trust profile
 * @returns {object} Classification result
 */
export function classifyContract(address, profile) {
  if (!address || !profile) {
    return {
      classification: CONTRACT_CLASSIFICATION.UNKNOWN,
      reason: "No address or profile provided"
    };
  }

  const contract = getTrustedContract(address, profile);

  if (!contract) {
    return {
      classification: CONTRACT_CLASSIFICATION.UNKNOWN,
      reason: "Contract not in trust profile"
    };
  }

  // WATCHED contracts are recognized but not trusted for execution
  if (contract.trustLevel === "WATCHED") {
    return {
      classification: CONTRACT_CLASSIFICATION.WATCHED,
      reason: "Contract is watched but not fully trusted",
      label: contract.label
    };
  }

  return {
    classification: CONTRACT_CLASSIFICATION.TRUSTED,
    reason: `Contract trusted at ${contract.trustLevel} level`,
    label: contract.label,
    trustLevel: contract.trustLevel
  };
}

/**
 * Classify a selector for a given contract
 *
 * @param {string} address - Contract address
 * @param {string} selector - Function selector
 * @param {object} profile - Trust profile
 * @returns {object} Classification result
 */
export function classifySelector(address, selector, profile) {
  if (!address || !selector || !profile) {
    return {
      classification: SELECTOR_CLASSIFICATION.NO_CONTEXT,
      reason: "Missing address, selector, or profile"
    };
  }

  // First check if the contract is trusted at all
  const contractClass = classifyContract(address, profile);

  if (contractClass.classification === CONTRACT_CLASSIFICATION.UNKNOWN) {
    return {
      classification: SELECTOR_CLASSIFICATION.NO_CONTEXT,
      reason: "Cannot classify selector for unknown contract"
    };
  }

  if (contractClass.classification === CONTRACT_CLASSIFICATION.WATCHED) {
    return {
      classification: SELECTOR_CLASSIFICATION.NO_CONTEXT,
      reason: "Watched contracts are not trusted for selector interpretation"
    };
  }

  // Check if selector is allowed
  const allowedResult = isSelectorAllowed(address, selector, profile);

  if (!allowedResult.allowed) {
    return {
      classification: SELECTOR_CLASSIFICATION.NOT_ALLOWED,
      reason: allowedResult.description
    };
  }

  // Selector is allowed - check usage history
  const usage = getSelectorUsage(address, selector, profile);

  if (!usage) {
    return {
      classification: SELECTOR_CLASSIFICATION.NEVER_USED,
      reason: "First time using this selector with this contract"
    };
  }

  // Check if usage is unusual (e.g., last used a long time ago or very few uses)
  if (usage.count <= 2) {
    return {
      classification: SELECTOR_CLASSIFICATION.UNUSUAL,
      reason: `Rarely used (${usage.count} previous uses)`,
      usageCount: usage.count,
      lastUsed: usage.lastUsed
    };
  }

  return {
    classification: SELECTOR_CLASSIFICATION.EXPECTED,
    reason: `Commonly used (${usage.count} previous uses)`,
    usageCount: usage.count,
    lastUsed: usage.lastUsed
  };
}

/**
 * Generate trust-related warnings based on classification
 *
 * @param {object} contractResult - Contract classification result
 * @param {object} selectorResult - Selector classification result
 * @param {object} profile - Trust profile
 * @returns {string[]} Array of warning messages
 */
function generateTrustWarnings(contractResult, selectorResult, profile) {
  const warnings = [];

  // CRITICAL: Unknown contract warnings
  if (contractResult.classification === CONTRACT_CLASSIFICATION.UNKNOWN) {
    warnings.push("Target contract is NOT in your Safe's trust profile");
    warnings.push("Do NOT trust the function name - selectors can be misleading for unknown contracts");
    warnings.push("This could be a phishing attempt using familiar-looking function names");
    return warnings; // Don't add more warnings - this is the critical one
  }

  // WATCHED contract warnings
  if (contractResult.classification === CONTRACT_CLASSIFICATION.WATCHED) {
    warnings.push("Target contract is WATCHED but not fully trusted");
    warnings.push("Exercise caution - this contract has not been approved for transactions");
  }

  // Selector-specific warnings for trusted contracts
  switch (selectorResult.classification) {
    case SELECTOR_CLASSIFICATION.NOT_ALLOWED:
      warnings.push("This function is NOT in the allowed list for this contract");
      warnings.push("The contract is trusted, but this specific function has not been approved");
      break;

    case SELECTOR_CLASSIFICATION.NEVER_USED:
      warnings.push("FIRST TIME using this function with this contract");
      warnings.push("Verify this is intentional before signing");
      break;

    case SELECTOR_CLASSIFICATION.UNUSUAL:
      warnings.push(`This function is rarely used (only ${selectorResult.usageCount} previous times)`);
      if (selectorResult.lastUsed) {
        warnings.push(`Last used: ${selectorResult.lastUsed}`);
      }
      break;

    case SELECTOR_CLASSIFICATION.EXPECTED:
      // No warnings for expected selectors on trusted contracts
      break;
  }

  return warnings;
}

/**
 * Determine if full selector interpretation is allowed
 *
 * CRITICAL: This is the gatekeeper function that determines whether
 * we should interpret a selector meaningfully or refuse.
 *
 * @param {object} trustContext - Trust context from getTrustContext
 * @returns {boolean} True if selector can be interpreted, false otherwise
 */
export function canInterpretSelector(trustContext) {
  // No profile = no interpretation
  if (!trustContext.profileLoaded) {
    return false;
  }

  // Unknown contracts = NEVER interpret
  if (trustContext.contractClassification === CONTRACT_CLASSIFICATION.UNKNOWN) {
    return false;
  }

  // Watched contracts = don't interpret
  if (trustContext.contractClassification === CONTRACT_CLASSIFICATION.WATCHED) {
    return false;
  }

  // Trusted contract with disallowed selector = don't interpret
  if (trustContext.selectorClassification === SELECTOR_CLASSIFICATION.NOT_ALLOWED) {
    return false;
  }

  // Trusted contract with allowed selector = OK to interpret
  return true;
}

/**
 * Calculate trust-adjusted severity
 *
 * @param {string} baseSeverity - Original severity from effect analysis
 * @param {object} trustContext - Trust context
 * @returns {object} { severity, adjusted, reason }
 */
export function adjustSeverityForTrust(baseSeverity, trustContext) {
  // If we can't interpret, severity becomes UNKNOWN
  if (!canInterpretSelector(trustContext)) {
    return {
      severity: "UNKNOWN",
      adjusted: true,
      reason: "Cannot assess severity without trusted contract context"
    };
  }

  // For NOT_ALLOWED selectors, always CRITICAL
  if (trustContext.selectorClassification === SELECTOR_CLASSIFICATION.NOT_ALLOWED) {
    return {
      severity: "CRITICAL",
      adjusted: true,
      reason: "Selector not in allowed list for this contract"
    };
  }

  // For NEVER_USED selectors, elevate severity
  if (trustContext.selectorClassification === SELECTOR_CLASSIFICATION.NEVER_USED) {
    const elevated = elevateSeverity(baseSeverity);
    return {
      severity: elevated,
      adjusted: elevated !== baseSeverity,
      reason: "First time using this selector - elevated for caution"
    };
  }

  // For UNUSUAL selectors, consider elevating
  if (trustContext.selectorClassification === SELECTOR_CLASSIFICATION.UNUSUAL) {
    // Don't elevate CRITICAL, but elevate others by one level
    if (baseSeverity !== "CRITICAL") {
      const elevated = elevateSeverity(baseSeverity);
      return {
        severity: elevated,
        adjusted: elevated !== baseSeverity,
        reason: "Rarely used selector - elevated for caution"
      };
    }
  }

  // No adjustment needed
  return {
    severity: baseSeverity,
    adjusted: false,
    reason: null
  };
}

/**
 * Elevate severity by one level
 */
function elevateSeverity(severity) {
  const levels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const index = levels.indexOf(severity);
  if (index === -1 || index >= levels.length - 1) return severity;
  return levels[index + 1];
}

/**
 * Header Severity Levels
 * Trust-based severity that indicates confidence in transaction interpretation.
 * This is SEPARATE from effect.severity (impact/risk).
 */
export const HEADER_SEVERITY = {
  LOW: "LOW",           // Trusted contract + allowed selector
  UNKNOWN: "UNKNOWN",   // Cannot confidently interpret
  CRITICAL: "CRITICAL"  // Known dangerous pattern or blocked selector
};

/**
 * Compute trust-first header severity for a single transaction.
 *
 * This is SEPARATE from effect.severity:
 * - effect.severity = impact/risk of the operation itself
 * - headerSeverity = confidence in our interpretation based on trust context
 *
 * Rules:
 * 1. If no trust profile loaded -> null (no header severity)
 * 2. If DELEGATECALL with untrusted contract+selector -> CRITICAL (non-negotiable)
 * 3. If contract classification is NOT TRUSTED -> UNKNOWN
 * 4. If selector classification is NOT_ALLOWED -> CRITICAL
 * 5. If selector classification is NO_CONTEXT -> UNKNOWN
 * 6. If contract TRUSTED and selector EXPECTED/UNUSUAL/NEVER_USED -> LOW
 *
 * @param {object} trustContext - Trust context from getTrustContext()
 * @returns {string|null} Header severity: "LOW", "UNKNOWN", "CRITICAL", or null
 */
export function computeHeaderSeverity(trustContext) {
  // Rule 1: No profile = no header severity (return null, not UNKNOWN)
  if (!trustContext || !trustContext.profileLoaded) {
    // Exception: If there's a DELEGATECALL context, it should still be CRITICAL
    if (trustContext?.delegatecallContext?.classification === DELEGATECALL_CLASSIFICATION.NOT_TRUSTED) {
      return HEADER_SEVERITY.CRITICAL;
    }
    return null;
  }

  // Rule 2: DELEGATECALL with untrusted contract+selector is ALWAYS CRITICAL
  if (trustContext.delegatecallContext?.classification === DELEGATECALL_CLASSIFICATION.NOT_TRUSTED) {
    return HEADER_SEVERITY.CRITICAL;
  }

  // Rule 3: Contract not TRUSTED -> UNKNOWN
  if (trustContext.contractClassification !== CONTRACT_CLASSIFICATION.TRUSTED) {
    return HEADER_SEVERITY.UNKNOWN;
  }

  // Contract is TRUSTED - now check selector

  // Rule 4: NOT_ALLOWED selector on trusted contract -> CRITICAL
  if (trustContext.selectorClassification === SELECTOR_CLASSIFICATION.NOT_ALLOWED) {
    return HEADER_SEVERITY.CRITICAL;
  }

  // Rule 5: NO_CONTEXT selector (shouldn't happen for TRUSTED contract, but handle it)
  if (trustContext.selectorClassification === SELECTOR_CLASSIFICATION.NO_CONTEXT) {
    return HEADER_SEVERITY.UNKNOWN;
  }

  // Rule 6: TRUSTED contract with allowed selector (EXPECTED, UNUSUAL, NEVER_USED) -> LOW
  if (trustContext.selectorClassification === SELECTOR_CLASSIFICATION.EXPECTED ||
      trustContext.selectorClassification === SELECTOR_CLASSIFICATION.UNUSUAL ||
      trustContext.selectorClassification === SELECTOR_CLASSIFICATION.NEVER_USED) {
    return HEADER_SEVERITY.LOW;
  }

  // Fallback for unexpected cases
  return HEADER_SEVERITY.UNKNOWN;
}

/**
 * Compute trust-first header severity for a batch transaction.
 *
 * Batch rules:
 * 1. If no trust profile -> null
 * 2. If ANY subcall has DELEGATECALL -> CRITICAL
 * 3. If ANY subcall is trust-blocked (unknown contract OR NOT_ALLOWED selector) -> CRITICAL
 * 4. If ALL subcalls are trusted/expected -> LOW
 * 5. Otherwise -> UNKNOWN
 *
 * @param {Array} calls - Array of subcall objects with analysis results
 * @param {boolean} hasProfile - Whether a trust profile was loaded
 * @returns {string|null} Header severity for the batch, or null if no profile
 */
export function computeBatchHeaderSeverity(calls, hasProfile) {
  // No profile = no header severity
  if (!hasProfile) {
    return null;
  }

  // Empty batch edge case
  if (!calls || calls.length === 0) {
    return HEADER_SEVERITY.UNKNOWN;
  }

  let allTrusted = true;

  for (const call of calls) {
    // Rule 2: DELEGATECALL is always CRITICAL
    if (call.operation === 1 || call.isDelegatecall || call.analysis?.isDelegatecall) {
      return HEADER_SEVERITY.CRITICAL;
    }

    // Check trust status of subcall
    const analysis = call.analysis;

    if (analysis) {
      // Rule 3: Trust-blocked subcall -> CRITICAL
      if (analysis.trustBlocked) {
        return HEADER_SEVERITY.CRITICAL;
      }

      // Check if this subcall's contract is not trusted
      const contractClass = analysis.trustContext?.contractClassification;
      if (contractClass && contractClass !== CONTRACT_CLASSIFICATION.TRUSTED) {
        return HEADER_SEVERITY.CRITICAL;
      }

      // Check for NOT_ALLOWED selector
      const selectorClass = analysis.trustContext?.selectorClassification;
      if (selectorClass === SELECTOR_CLASSIFICATION.NOT_ALLOWED) {
        return HEADER_SEVERITY.CRITICAL;
      }

      // Track if all are trusted
      if (contractClass !== CONTRACT_CLASSIFICATION.TRUSTED) {
        allTrusted = false;
      }
    } else {
      // No analysis = not trusted
      allTrusted = false;
    }
  }

  // Rule 4: All trusted -> LOW
  if (allTrusted) {
    return HEADER_SEVERITY.LOW;
  }

  // Rule 5: Mixed or unknown -> UNKNOWN
  return HEADER_SEVERITY.UNKNOWN;
}

export default {
  CONTRACT_CLASSIFICATION,
  SELECTOR_CLASSIFICATION,
  DELEGATECALL_CLASSIFICATION,
  HEADER_SEVERITY,
  getTrustContext,
  classifyContract,
  classifySelector,
  classifyDelegatecall,
  canInterpretSelector,
  adjustSeverityForTrust,
  computeHeaderSeverity,
  computeBatchHeaderSeverity
};
