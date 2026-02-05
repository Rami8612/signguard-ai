/**
 * Consequence/effect analysis engine.
 * Analyzes the real-world effects of signing a transaction.
 *
 * ADDRESS DISPLAY RULES:
 * - Consequences use human-readable labels from trusted registry only
 * - If address is NOT in trusted registry, use generic descriptions
 * - Full addresses are shown ONLY in technical sections (handled by formatter)
 * - Never infer token symbols from calldata or external sources
 */

import { isMaxApproval, isZero } from "./decoder.js";
import {
  formatAddressHuman,
  formatTokenHuman,
  formatRecipientHuman,
  formatSpenderHuman,
  formatModuleHuman,
  formatOwnerHuman,
  hasKnownLabel
} from "./addressDisplay.js";

/**
 * Effect type definitions with severity and descriptions
 */
export const EFFECT_TYPES = {
  PERMISSION_GRANT: {
    baseSeverity: "HIGH",
    permanence: "PERMANENT_UNTIL_REVOKED",
    description: "Grants ongoing permissions to another address"
  },
  PERMISSION_REVOKE: {
    baseSeverity: "LOW",
    permanence: "IMMEDIATE",
    description: "Removes previously granted permissions"
  },
  ASSET_TRANSFER: {
    baseSeverity: "HIGH",
    permanence: "IMMEDIATE_IRREVERSIBLE",
    description: "Moves assets from your control"
  },
  CONTROL_TRANSFER: {
    baseSeverity: "CRITICAL",
    permanence: "PERMANENT",
    description: "Changes who controls a contract or asset"
  },
  UPGRADE_AUTHORITY: {
    baseSeverity: "CRITICAL",
    permanence: "PERMANENT",
    description: "Changes or uses upgrade capabilities"
  },
  EXECUTION_GRANT: {
    baseSeverity: "CRITICAL",
    permanence: "PERMANENT_UNTIL_REVOKED",
    description: "Allows future execution without approval"
  },
  BATCH_OPERATION: {
    baseSeverity: "HIGH",
    permanence: "VARIES",
    description: "Contains multiple operations - each must be analyzed"
  },
  UNKNOWN: {
    baseSeverity: "UNKNOWN",
    permanence: "UNKNOWN",
    description: "Cannot determine effects"
  },

  // ═══════════════════════════════════════════════════════════════════
  // Safe/Gnosis Multisig Effect Types
  // ═══════════════════════════════════════════════════════════════════

  SAFE_EXECUTION: {
    baseSeverity: "HIGH",
    permanence: "IMMEDIATE",
    description: "Executes a transaction from the Safe multisig"
  },
  SAFE_MODULE_CHANGE: {
    baseSeverity: "CRITICAL",
    permanence: "PERMANENT_UNTIL_REVOKED",
    description: "Changes which modules can execute transactions without signatures"
  },
  SAFE_MODULE_EXECUTION: {
    baseSeverity: "CRITICAL",
    permanence: "IMMEDIATE",
    description: "Module executing transaction without signature requirements"
  },
  SAFE_OWNER_CHANGE: {
    baseSeverity: "CRITICAL",
    permanence: "PERMANENT_UNTIL_CHANGED",
    description: "Changes who has signing authority on the Safe"
  },
  SAFE_THRESHOLD_CHANGE: {
    baseSeverity: "CRITICAL",
    permanence: "PERMANENT_UNTIL_CHANGED",
    description: "Changes how many signatures are required"
  },
  SAFE_FALLBACK_CHANGE: {
    baseSeverity: "HIGH",
    permanence: "PERMANENT_UNTIL_CHANGED",
    description: "Changes how undefined function calls are handled"
  },
  SAFE_GUARD_CHANGE: {
    baseSeverity: "CRITICAL",
    permanence: "PERMANENT_UNTIL_CHANGED",
    description: "Changes or removes transaction validation guard"
  },

  // ═══════════════════════════════════════════════════════════════════
  // Trust Profile Semantic Effect Type
  // ═══════════════════════════════════════════════════════════════════

  TRUST_PROFILE_SEMANTIC: {
    baseSeverity: "CONTEXT_DEPENDENT",
    permanence: "CONTEXT_DEPENDENT",
    description: "Function identified via trust profile (not ABI-verified)"
  },

  // ═══════════════════════════════════════════════════════════════════
  // ABI Verified Effect Type
  // ═══════════════════════════════════════════════════════════════════

  ABI_VERIFIED: {
    baseSeverity: "CONTEXT_DEPENDENT",
    permanence: "CONTEXT_DEPENDENT",
    description: "Function verified via local ABI registry"
  },

  // ═══════════════════════════════════════════════════════════════════
  // DELEGATECALL Effect Type
  // SECURITY: DELEGATECALL executes external code with full caller permissions.
  // This is the attack vector used in the Bybit Safe multisig hack.
  // ═══════════════════════════════════════════════════════════════════

  DELEGATECALL_EXECUTION: {
    baseSeverity: "CRITICAL",
    permanence: "IMMEDIATE",
    description: "Executes external code with full caller permissions"
  }
};

/**
 * Analyze the effects of a decoded transaction
 *
 * @param {object} selectorInfo - Selector information from lookup
 * @param {object} decodedParams - Decoded parameters
 * @param {object} paramAnalysis - Analyzed parameters
 * @param {object} options - Additional options
 * @param {object} options.profile - Trust profile for address labels
 */
export function analyzeEffects(selectorInfo, decodedParams, paramAnalysis, options = {}) {
  const { profile } = options;

  // Handle unverified signatures
  // Accept database-verified, ABI-verified, OR trust-profile-verified selectors
  if (!selectorInfo || (!selectorInfo.verified && !selectorInfo.abiVerified && !selectorInfo.trustProfileVerified)) {
    return createUnknownEffect(selectorInfo);
  }

  // Handle trust-profile-verified selectors (semantic interpretation only)
  if (selectorInfo.trustProfileVerified && !selectorInfo.verified && !selectorInfo.abiVerified) {
    return createTrustProfileEffect(selectorInfo, decodedParams, paramAnalysis);
  }

  // Handle ABI-verified selectors (has local ABI but not in verified database)
  if (selectorInfo.abiVerified && !selectorInfo.verified) {
    return createAbiVerifiedEffect(selectorInfo, decodedParams, paramAnalysis, options);
  }

  const effectType = selectorInfo.effectType;
  const baseEffect = EFFECT_TYPES[effectType] || EFFECT_TYPES.UNKNOWN;

  // Build the effect analysis
  const effect = {
    effectType,
    verified: true,
    severity: calculateSeverity(effectType, paramAnalysis),
    permanence: baseEffect.permanence,
    scope: paramAnalysis?.scope || "UNKNOWN",
    beneficiary: paramAnalysis?.beneficiary || null,
    consequences: generateConsequences(effectType, selectorInfo, paramAnalysis, profile),
    warnings: generateWarnings(effectType, paramAnalysis),
    mitigations: generateMitigations(effectType, paramAnalysis)
  };

  // Check for special cases that modify the effect type
  if (effectType === "PERMISSION_GRANT" && paramAnalysis?.isRevocation) {
    effect.effectType = "PERMISSION_REVOKE";
    effect.severity = "LOW";
    effect.permanence = "IMMEDIATE";
    effect.consequences = ["This revokes a previously granted permission"];
    effect.warnings = [];
  }

  return effect;
}

/**
 * Create an effect for unknown/unverified signatures
 */
function createUnknownEffect(selectorInfo) {
  return {
    effectType: "UNKNOWN",
    verified: false,
    severity: "UNKNOWN",
    permanence: "UNKNOWN",
    scope: "UNKNOWN",
    beneficiary: null,
    consequences: [
      "Cannot determine the consequences of this transaction",
      "The function signature is unverified and may be incorrect",
      "You should verify this transaction through other means before signing"
    ],
    warnings: [
      "UNVERIFIED FUNCTION - Do not trust the displayed function name",
      "Effect analysis not possible without verified signature"
    ],
    mitigations: [
      "Verify the contract source code on a block explorer",
      "Contact the dApp developer for clarification",
      "Do not sign if you cannot verify the transaction's purpose"
    ]
  };
}

/**
 * Create an effect for untrusted DELEGATECALL operations.
 *
 * SECURITY: This is used when operation=1 (DELEGATECALL) and the contract+selector
 * is NOT in the trustedDelegateCalls whitelist. Severity is ALWAYS CRITICAL.
 *
 * @param {string} targetAddress - Target contract address
 * @param {string} selector - Function selector
 * @param {object} selectorInfo - Selector information (may be misleading!)
 * @returns {object} Effect with CRITICAL severity
 */
export function createDelegatecallEffect(targetAddress, selector, selectorInfo) {
  return {
    effectType: "DELEGATECALL_EXECUTION",
    verified: false, // Even if we have a signature, we can't trust it in DELEGATECALL context
    severity: "CRITICAL",
    permanence: "IMMEDIATE",
    scope: "FULL_CONTROL",
    beneficiary: null,
    isDelegatecall: true,
    consequences: [
      "DELEGATECALL executes external code with YOUR wallet's FULL PERMISSIONS",
      "The target contract's code runs in YOUR wallet's context",
      "Any displayed function name or parameters may be MISLEADING",
      "The code can modify ANY state: owners, balances, approvals, modules",
      "This is the same attack vector used in major multisig hacks"
    ],
    warnings: [
      "CRITICAL: DELEGATECALL to non-whitelisted contract",
      "DO NOT trust the function name - it can be spoofed",
      "This contract+selector is NOT in your trustedDelegateCalls whitelist",
      "Signing this could result in TOTAL LOSS of all assets"
    ],
    mitigations: [
      "STOP - Do not sign unless you have verified the target contract",
      "Add this contract to trustedDelegateCalls ONLY if you trust it completely",
      "Review the target contract's source code on a block explorer",
      "Contact your security team before proceeding"
    ]
  };
}

/**
 * Create an effect for trust-profile-verified selectors.
 *
 * This provides semantic interpretation based on the trust profile's label,
 * clearly marking the source as TRUST_PROFILE (not ABI-verified).
 *
 * IMPORTANT: This does NOT provide the same level of confidence as ABI verification.
 * The trust profile asserts that this selector is expected for this contract,
 * but parameter semantics may not be fully verified.
 */
function createTrustProfileEffect(selectorInfo, decodedParams, paramAnalysis) {
  const label = selectorInfo.trustProfileLabel || selectorInfo.label || "unknown function";
  const hasDecodedParams = decodedParams && Object.keys(decodedParams).length > 0;
  const hasParamAnalysis = paramAnalysis && Object.keys(paramAnalysis).length > 0;

  // Base effect for trust-profile-verified selectors
  const effect = {
    effectType: "TRUST_PROFILE_SEMANTIC",
    verified: false,
    trustProfileVerified: true,
    source: "TRUST_PROFILE",
    severity: determineTrustProfileSeverity(label, paramAnalysis),
    permanence: "CONTEXT_DEPENDENT",
    scope: paramAnalysis?.scope || "TRUST_PROFILE_INFERRED",
    beneficiary: paramAnalysis?.beneficiary || null,
    label: label,
    consequences: generateTrustProfileConsequences(label, hasDecodedParams, hasParamAnalysis, paramAnalysis),
    warnings: generateTrustProfileWarnings(label, hasDecodedParams),
    mitigations: generateTrustProfileMitigations(label)
  };

  return effect;
}

/**
 * Determine severity for trust-profile-verified selectors.
 *
 * Without full ABI verification, we use the label and any available
 * parameter analysis to make an informed estimate. We err on the side
 * of caution (higher severity) when uncertain.
 */
function determineTrustProfileSeverity(label, paramAnalysis) {
  const lowerLabel = label.toLowerCase();

  // If we have parameter analysis from a matching signature, use it for hints
  if (paramAnalysis) {
    if (paramAnalysis.scope === "UNLIMITED") {
      return "HIGH";
    }
    if (paramAnalysis.isDelegateCall) {
      return "CRITICAL";
    }
    if (paramAnalysis.grantsAutonomousExecution) {
      return "CRITICAL";
    }
  }

  // Heuristic severity based on common function name patterns
  // These are CONSERVATIVE estimates - we default to higher severity when uncertain

  // Critical operations
  if (lowerLabel.includes("delegatecall") ||
      lowerLabel.includes("selfdestruct") ||
      lowerLabel.includes("upgrade") ||
      lowerLabel.includes("setimplementation")) {
    return "CRITICAL";
  }

  // High-risk operations
  if (lowerLabel.includes("transfer") ||
      lowerLabel.includes("approve") ||
      lowerLabel.includes("withdraw") ||
      lowerLabel.includes("execute") ||
      lowerLabel.includes("owner") ||
      lowerLabel.includes("admin")) {
    return "HIGH";
  }

  // Medium-risk operations
  if (lowerLabel.includes("deposit") ||
      lowerLabel.includes("supply") ||
      lowerLabel.includes("stake") ||
      lowerLabel.includes("swap") ||
      lowerLabel.includes("borrow") ||
      lowerLabel.includes("repay")) {
    return "MEDIUM";
  }

  // Low-risk operations (read-like names, though these shouldn't typically be called)
  if (lowerLabel.includes("view") ||
      lowerLabel.includes("get") ||
      lowerLabel.includes("balance") ||
      lowerLabel.includes("allowance")) {
    return "LOW";
  }

  // Default to MEDIUM for unknown patterns - not as alarming as UNKNOWN
  // but still warrants attention
  return "MEDIUM";
}

/**
 * Generate consequences for trust-profile-verified selectors
 */
function generateTrustProfileConsequences(label, hasDecodedParams, hasParamAnalysis, paramAnalysis) {
  const consequences = [];

  consequences.push(
    `This transaction calls the "${label}" function on a TRUSTED contract`
  );

  consequences.push(
    "The trust profile explicitly allows this selector for this contract"
  );

  if (hasDecodedParams && hasParamAnalysis) {
    consequences.push(
      "Parameters were decoded and analyzed based on matching function signature"
    );

    // Add parameter-specific consequences if available
    if (paramAnalysis?.scope === "UNLIMITED") {
      consequences.push(
        "The operation scope appears to be UNLIMITED based on parameter values"
      );
    }
    if (paramAnalysis?.beneficiary) {
      consequences.push(
        `Beneficiary/recipient: ${paramAnalysis.beneficiary}`
      );
    }
    if (paramAnalysis?.amount !== undefined) {
      consequences.push(
        `Amount involved: ${paramAnalysis.amount}`
      );
    }
  } else if (hasDecodedParams) {
    consequences.push(
      "Parameters were decoded but detailed analysis is not available"
    );
  } else {
    consequences.push(
      "Parameter details could not be decoded - verify calldata manually"
    );
  }

  return consequences;
}

/**
 * Generate warnings for trust-profile-verified selectors
 */
function generateTrustProfileWarnings(label, hasDecodedParams) {
  const warnings = [];

  warnings.push(
    "INTERPRETATION SOURCE: TRUST_PROFILE (not ABI-verified)"
  );

  warnings.push(
    "The function name is based on your trust profile's label for this selector"
  );

  if (!hasDecodedParams) {
    warnings.push(
      "Parameters could not be decoded - the trust profile label may not match the actual ABI"
    );
  }

  return warnings;
}

/**
 * Generate mitigations for trust-profile-verified selectors
 */
function generateTrustProfileMitigations(label) {
  const mitigations = [];

  mitigations.push(
    "Verify this function matches your expectation for this interaction"
  );

  mitigations.push(
    "Review historical usage of this selector in your transaction history"
  );

  mitigations.push(
    "Consider adding the full ABI signature to your verified database for stronger verification"
  );

  return mitigations;
}

/**
 * Create an effect for ABI-verified selectors.
 *
 * This provides semantic interpretation based on the local ABI registry.
 * The ABI provides function signature and parameter names, giving high confidence
 * in the decoded values.
 */
function createAbiVerifiedEffect(selectorInfo, decodedParams, paramAnalysis, options = {}) {
  const { profile, trustContext } = options;
  const functionName = selectorInfo.signature ? selectorInfo.signature.split('(')[0] : "function";
  const hasDecodedParams = decodedParams && Object.keys(decodedParams).length > 0;
  const hasParamAnalysis = paramAnalysis && Object.keys(paramAnalysis).length > 0;

  // Check if contract is in trust profile
  const hasTrustProfile = trustContext?.profileLoaded && trustContext?.contractClassification === "TRUSTED";

  // Determine severity based on function name pattern and trust profile status
  const severity = determineAbiVerifiedSeverity(functionName, paramAnalysis, hasTrustProfile);

  // Base effect for ABI-verified selectors
  const effect = {
    effectType: "ABI_VERIFIED",
    verified: false,
    abiVerified: true,
    source: "LOCAL_ABI",
    severity: severity,
    permanence: determineAbiPermanence(functionName),
    scope: paramAnalysis?.scope || determineAbiScope(functionName, decodedParams),
    beneficiary: paramAnalysis?.beneficiary || extractBeneficiary(decodedParams),
    label: functionName,
    consequences: generateAbiVerifiedConsequences(functionName, hasDecodedParams, hasParamAnalysis, paramAnalysis, decodedParams, profile),
    warnings: generateAbiVerifiedWarnings(functionName, hasDecodedParams, hasTrustProfile),
    mitigations: generateAbiVerifiedMitigations(functionName, hasTrustProfile)
  };

  return effect;
}

/**
 * Determine severity for ABI-verified selectors based on function name patterns.
 *
 * Severity logic:
 * - With trust profile: can go as low as LOW for safe operations
 * - Without trust profile: MEDIUM minimum (we know the function but not the contract)
 * - Critical/dangerous operations are always HIGH/CRITICAL regardless of trust
 */
function determineAbiVerifiedSeverity(functionName, paramAnalysis, hasTrustProfile = false) {
  const lowerName = functionName.toLowerCase();

  // If we have parameter analysis, use it for hints
  if (paramAnalysis) {
    if (paramAnalysis.scope === "UNLIMITED") {
      return "HIGH";
    }
    if (paramAnalysis.isDelegateCall) {
      return "CRITICAL";
    }
  }

  // Critical operations - always CRITICAL regardless of trust
  if (lowerName.includes("delegatecall") ||
      lowerName.includes("selfdestruct") ||
      lowerName.includes("upgrade") ||
      lowerName.includes("setimplementation")) {
    return "CRITICAL";
  }

  // High-risk operations - always HIGH regardless of trust
  if (lowerName.includes("transfer") && !lowerName.includes("from") ||
      lowerName.includes("approve") ||
      lowerName.includes("execute") ||
      lowerName.includes("owner") ||
      lowerName.includes("admin")) {
    return "HIGH";
  }

  // Without trust profile, minimum severity is MEDIUM
  // We know the function signature but not if the contract is trustworthy
  if (!hasTrustProfile) {
    return "MEDIUM";
  }

  // With trust profile, we can use more granular severity

  // Medium-risk operations (common DeFi actions)
  if (lowerName.includes("deposit") ||
      lowerName.includes("withdraw") ||
      lowerName.includes("supply") ||
      lowerName.includes("stake") ||
      lowerName.includes("swap") ||
      lowerName.includes("borrow")) {
    return "MEDIUM";
  }

  // Low-risk operations (only with trust profile)
  if (lowerName.includes("repay") ||
      lowerName.includes("claim") ||
      lowerName.includes("view") ||
      lowerName.includes("get") ||
      lowerName.includes("balance")) {
    return "LOW";
  }

  // Default to MEDIUM for unknown patterns
  return "MEDIUM";
}

/**
 * Determine permanence based on function name
 */
function determineAbiPermanence(functionName) {
  const lowerName = functionName.toLowerCase();

  if (lowerName.includes("approve")) {
    return "PERMANENT_UNTIL_REVOKED";
  }
  if (lowerName.includes("transfer") || lowerName.includes("swap") || lowerName.includes("repay")) {
    return "IMMEDIATE";
  }
  if (lowerName.includes("deposit") || lowerName.includes("stake") || lowerName.includes("supply")) {
    return "PERMANENT_UNTIL_CHANGED";
  }

  return "CONTEXT_DEPENDENT";
}

/**
 * Determine scope based on function name and parameters
 */
function determineAbiScope(functionName, decodedParams) {
  const lowerName = functionName.toLowerCase();

  if (lowerName.includes("swap")) return "SWAP";
  if (lowerName.includes("deposit") || lowerName.includes("supply")) return "LIQUIDITY_PROVISION";
  if (lowerName.includes("withdraw")) return "LIQUIDITY_REMOVAL";
  if (lowerName.includes("repay")) return "LIMITED";
  if (lowerName.includes("borrow")) return "LIMITED";

  return "UNKNOWN";
}

/**
 * Extract beneficiary from decoded parameters
 */
function extractBeneficiary(decodedParams) {
  if (!decodedParams) return null;

  // Common parameter names for beneficiaries
  const beneficiaryKeys = ['to', 'recipient', 'onBehalfOf', 'receiver', 'beneficiary'];

  for (const key of beneficiaryKeys) {
    if (decodedParams[key] && typeof decodedParams[key] === 'string' && decodedParams[key].startsWith('0x')) {
      return decodedParams[key];
    }
  }

  return null;
}

/**
 * Generate consequences for ABI-verified selectors
 */
function generateAbiVerifiedConsequences(functionName, hasDecodedParams, hasParamAnalysis, paramAnalysis, decodedParams, profile) {
  const consequences = [];
  const lowerName = functionName.toLowerCase();

  consequences.push(
    `This transaction calls the "${functionName}" function (verified via local ABI)`
  );

  // Function-specific consequences
  if (lowerName.includes("repay")) {
    consequences.push("This will repay a loan/debt position");
    consequences.push("Your debt balance will decrease by the repaid amount");
  } else if (lowerName.includes("deposit") || lowerName.includes("supply")) {
    consequences.push("This will deposit/supply assets to the protocol");
    consequences.push("You will receive a position or receipt token in return");
  } else if (lowerName.includes("withdraw")) {
    consequences.push("This will withdraw assets from the protocol");
    consequences.push("Your deposited balance will decrease");
  } else if (lowerName.includes("borrow")) {
    consequences.push("This will borrow assets from the protocol");
    consequences.push("You will incur debt that must be repaid with interest");
  } else if (lowerName.includes("swap")) {
    consequences.push("This will exchange one token for another");
  } else if (lowerName.includes("approve")) {
    consequences.push("This grants permission to spend your tokens");
    consequences.push("The approved address can transfer tokens up to the approved amount");
  } else if (lowerName.includes("transfer")) {
    consequences.push("This will transfer assets to another address");
  }

  // Add beneficiary if found
  const beneficiary = paramAnalysis?.beneficiary || extractBeneficiary(decodedParams);
  if (beneficiary) {
    consequences.push(`Beneficiary/recipient: ${beneficiary}`);
  }

  return consequences;
}

/**
 * Generate warnings for ABI-verified selectors
 */
function generateAbiVerifiedWarnings(functionName, hasDecodedParams, hasTrustProfile) {
  const warnings = [];

  // Only show verification source warning when there's no trust profile
  // With trust profile, the contract is already trusted so this is redundant
  if (!hasTrustProfile) {
    warnings.push(
      "VERIFICATION SOURCE: LOCAL_ABI (contract ABI from local registry)"
    );
  }

  if (!hasDecodedParams) {
    warnings.push(
      "Parameters could not be fully decoded"
    );
  }

  return warnings;
}

/**
 * Generate mitigations for ABI-verified selectors
 */
function generateAbiVerifiedMitigations(functionName, hasTrustProfile) {
  const mitigations = [];
  const lowerName = functionName.toLowerCase();

  // Only show generic verification message when there's no trust profile
  if (!hasTrustProfile) {
    mitigations.push(
      "Verify the function matches your expected action"
    );
  }

  if (lowerName.includes("approve")) {
    mitigations.push(
      "Review the approved amount and spender address carefully"
    );
    mitigations.push(
      "Consider using limited approvals instead of unlimited"
    );
  }

  if (lowerName.includes("transfer") || lowerName.includes("withdraw")) {
    mitigations.push(
      "Verify the recipient address is correct"
    );
  }

  return mitigations;
}

/**
 * Calculate severity based on effect type and parameters
 */
function calculateSeverity(effectType, paramAnalysis) {
  const baseEffect = EFFECT_TYPES[effectType];
  if (!baseEffect) return "UNKNOWN";

  let severity = baseEffect.baseSeverity;

  // Adjust based on scope
  if (paramAnalysis) {
    if (paramAnalysis.scope === "UNLIMITED") {
      severity = elevate(severity);
    }
    if (paramAnalysis.irreversible) {
      severity = elevate(severity);
    }

    // Safe-specific severity adjustments
    if (paramAnalysis.safeContext) {
      // DELEGATECALL is always CRITICAL - executes arbitrary code in Safe's context
      if (paramAnalysis.isDelegateCall) {
        severity = "CRITICAL";
      }
      // Modules granting autonomous execution are CRITICAL
      if (paramAnalysis.grantsAutonomousExecution) {
        severity = "CRITICAL";
      }
      // Bypassing signatures is always high risk
      if (paramAnalysis.bypassesSignatures) {
        severity = elevate(severity);
      }
    }
  }

  return severity;
}

/**
 * Elevate severity level
 */
function elevate(severity) {
  const levels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const index = levels.indexOf(severity);
  if (index === -1 || index >= levels.length - 1) return severity;
  return levels[index + 1];
}

/**
 * Generate human-readable consequences based on effect type
 *
 * ADDRESS DISPLAY RULES:
 * - Use human-readable labels from trusted registry (profile) when available
 * - Use generic descriptions when address is NOT in registry
 * - Full addresses are shown in technical sections (handled by formatter)
 *
 * @param {string} effectType - The effect type
 * @param {object} selectorInfo - Selector information
 * @param {object} paramAnalysis - Analyzed parameters
 * @param {object} profile - Trust profile for address labels (optional)
 */
function generateConsequences(effectType, selectorInfo, paramAnalysis, profile) {
  const consequences = [];

  // Helper to format beneficiary/spender with trust-aware labels
  const humanSpender = (addr) => formatSpenderHuman(addr, profile);
  const humanRecipient = (addr) => formatRecipientHuman(addr, profile);
  const humanToken = (addr) => formatTokenHuman(addr, profile);

  switch (effectType) {
    case "PERMISSION_GRANT":
      if (paramAnalysis?.scope === "UNLIMITED") {
        const spenderLabel = humanSpender(paramAnalysis.beneficiary);
        if (hasKnownLabel(paramAnalysis.beneficiary, profile)) {
          consequences.push(
            `${spenderLabel} can transfer ANY AMOUNT of this token from your wallet at ANY TIME`
          );
        } else {
          consequences.push(
            "A spender address can transfer ANY AMOUNT of this token from your wallet at ANY TIME"
          );
        }
        consequences.push("This permission is PERMANENT until you explicitly revoke it");
        consequences.push("No further approval from you will be required for future transfers");
      } else {
        const amount = paramAnalysis?.amount;
        const spenderLabel = humanSpender(paramAnalysis.beneficiary);
        if (hasKnownLabel(paramAnalysis.beneficiary, profile)) {
          consequences.push(
            `${spenderLabel} can transfer up to ${formatAmount(amount)} tokens from your wallet`
          );
        } else {
          consequences.push(
            `A spender address can transfer up to ${formatAmount(amount)} tokens from your wallet`
          );
        }
        consequences.push("Each transfer will reduce this allowance until it reaches zero");
      }
      break;

    case "ASSET_TRANSFER":
      if (paramAnalysis?.scope === "SINGLE_TOKEN") {
        const recipientLabel = humanRecipient(paramAnalysis.beneficiary);
        if (hasKnownLabel(paramAnalysis.beneficiary, profile)) {
          consequences.push(
            `NFT #${paramAnalysis.tokenId} will be transferred to ${recipientLabel}`
          );
        } else {
          consequences.push(
            `NFT #${paramAnalysis.tokenId} will be transferred to a recipient address`
          );
        }
        consequences.push("This transfer is IMMEDIATE and IRREVERSIBLE once confirmed");
      } else if (paramAnalysis?.scope === "SWAP") {
        if (paramAnalysis.inputAmount) {
          consequences.push(
            `You will swap ${formatAmount(paramAnalysis.inputAmount)} tokens`
          );
        } else if (paramAnalysis.exactOutput) {
          consequences.push(
            `You will receive exactly ${formatAmount(paramAnalysis.exactOutput)} tokens`
          );
        } else {
          consequences.push("You will swap ETH for tokens");
        }
        if (paramAnalysis.minOutput) {
          consequences.push(
            `Minimum output: ${formatAmount(paramAnalysis.minOutput)} (transaction reverts if not met)`
          );
        }
        if (paramAnalysis.recipient) {
          const recipientLabel = humanRecipient(paramAnalysis.recipient);
          if (hasKnownLabel(paramAnalysis.recipient, profile)) {
            consequences.push(
              `Output tokens will be sent to: ${recipientLabel}`
            );
          } else {
            consequences.push("Output tokens will be sent to a recipient address");
          }
        }
        if (paramAnalysis.deadline) {
          const deadlineDate = new Date(Number(paramAnalysis.deadline) * 1000);
          consequences.push(
            `Transaction expires: ${deadlineDate.toISOString()}`
          );
        }
      } else if (paramAnalysis?.scope === "LIQUIDITY_PROVISION") {
        consequences.push("You will deposit tokens into a liquidity pool");
        consequences.push("You will receive LP tokens representing your share");
        consequences.push("Your tokens will be used by others for trading (you earn fees)");
      } else if (paramAnalysis?.scope === "LIQUIDITY_REMOVAL") {
        consequences.push("You will burn LP tokens and receive underlying assets");
        consequences.push("The exact amounts depend on current pool ratios");
      } else if (paramAnalysis?.scope === "WRAP") {
        consequences.push("Your ETH will be converted to WETH (1:1)");
        consequences.push("WETH is an ERC20 token that can be used in DeFi protocols");
      } else if (paramAnalysis?.scope === "UNWRAP") {
        consequences.push(`${formatAmount(paramAnalysis.amount)} WETH will be converted back to ETH`);
      } else {
        const recipientLabel = humanRecipient(paramAnalysis?.beneficiary);
        if (hasKnownLabel(paramAnalysis?.beneficiary, profile)) {
          consequences.push(
            `${formatAmount(paramAnalysis?.amount)} tokens will be transferred to ${recipientLabel}`
          );
        } else {
          consequences.push(
            `${formatAmount(paramAnalysis?.amount)} tokens will be transferred to a recipient address`
          );
        }
        consequences.push("This transfer is IMMEDIATE and IRREVERSIBLE once confirmed");
      }
      break;

    case "CONTROL_TRANSFER":
      if (paramAnalysis?.irreversible) {
        consequences.push("Contract ownership will be permanently renounced");
        consequences.push("NO ONE will be able to perform owner-only functions after this");
        consequences.push("This action is IRREVERSIBLE");
      } else {
        const newOwnerLabel = humanRecipient(paramAnalysis.beneficiary);
        if (hasKnownLabel(paramAnalysis.beneficiary, profile)) {
          consequences.push(
            `Full control of this contract will be transferred to ${newOwnerLabel}`
          );
        } else {
          consequences.push(
            "Full control of this contract will be transferred to an address"
          );
        }
        consequences.push("The new owner will have complete administrative control");
        consequences.push("You will lose all owner privileges");
      }
      break;

    case "UPGRADE_AUTHORITY":
      consequences.push("The contract's code/logic will be changed");
      consequences.push("All future interactions with this contract will use the new implementation");
      consequences.push("This could change how your funds or assets are handled");
      break;

    case "EXECUTION_GRANT":
      if (paramAnalysis?.scope === "SIGNER_ADDITION") {
        const signerLabel = formatOwnerHuman(paramAnalysis.newOwner, profile);
        if (hasKnownLabel(paramAnalysis.newOwner, profile)) {
          consequences.push(
            `${signerLabel} will become a signer on this multisig`
          );
        } else {
          consequences.push("An address will become a signer on this multisig");
        }
        consequences.push(`The signature threshold will be set to ${paramAnalysis.newThreshold}`);
      } else if (paramAnalysis?.scope === "THRESHOLD_CHANGE") {
        consequences.push(
          `The required number of signatures will change to ${paramAnalysis.newThreshold}`
        );
      } else {
        consequences.push("This grants execution rights that bypass normal approval processes");
      }
      break;

    case "BATCH_OPERATION":
      consequences.push(
        `This transaction contains ${paramAnalysis?.callCount || "multiple"} bundled operations`
      );
      consequences.push("Each operation within the batch must be analyzed separately");
      consequences.push("All operations execute atomically - all succeed or all fail");
      break;

    // ═══════════════════════════════════════════════════════════════════
    // Safe/Gnosis Multisig Consequences
    // ═══════════════════════════════════════════════════════════════════

    case "SAFE_EXECUTION":
      consequences.push(...generateSafeExecutionConsequences(paramAnalysis, profile));
      break;

    case "SAFE_MODULE_CHANGE":
      consequences.push(...generateSafeModuleChangeConsequences(paramAnalysis, profile));
      break;

    case "SAFE_MODULE_EXECUTION":
      consequences.push(...generateSafeModuleExecutionConsequences(paramAnalysis, profile));
      break;

    case "SAFE_OWNER_CHANGE":
      consequences.push(...generateSafeOwnerChangeConsequences(paramAnalysis, profile));
      break;

    case "SAFE_THRESHOLD_CHANGE":
      consequences.push(...generateSafeThresholdChangeConsequences(paramAnalysis, profile));
      break;

    case "SAFE_FALLBACK_CHANGE":
      consequences.push(...generateSafeFallbackChangeConsequences(paramAnalysis, profile));
      break;

    case "SAFE_GUARD_CHANGE":
      consequences.push(...generateSafeGuardChangeConsequences(paramAnalysis, profile));
      break;

    default:
      consequences.push(selectorInfo?.description || "Unable to determine consequences");
  }

  return consequences;
}

// ═══════════════════════════════════════════════════════════════════════════
// Safe-Specific Consequence Generators
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate consequences for Safe execTransaction
 */
function generateSafeExecutionConsequences(paramAnalysis, profile) {
  const consequences = [];
  const targetLabel = formatAddressHuman(paramAnalysis?.targetAddress, profile, "a target contract");
  const hasTargetLabel = hasKnownLabel(paramAnalysis?.targetAddress, profile);

  if (paramAnalysis?.isDelegateCall) {
    consequences.push(
      "⚠️ DELEGATECALL: External code will execute IN THE CONTEXT of your Safe"
    );
    consequences.push(
      "The target contract's code will run with your Safe's storage and permissions"
    );
    consequences.push(
      "This can modify ANY Safe state including owners, threshold, and modules"
    );
    // No address in consequences - shown in technical details
  } else {
    if (hasTargetLabel) {
      consequences.push(
        `The Safe will execute a CALL to ${targetLabel}`
      );
    } else {
      consequences.push(
        "The Safe will execute a CALL to a target contract"
      );
    }
    if (paramAnalysis?.hasValue) {
      consequences.push(
        `${formatAmount(paramAnalysis.value)} wei will be sent with this call`
      );
    }
    if (paramAnalysis?.hasData) {
      consequences.push(
        "The call includes data (a function call on the target contract)"
      );
    }
  }

  consequences.push(
    "Once executed, this transaction cannot be reversed"
  );

  return consequences;
}

/**
 * Generate consequences for Safe module enable/disable
 */
function generateSafeModuleChangeConsequences(paramAnalysis, profile) {
  const consequences = [];
  const moduleLabel = formatModuleHuman(paramAnalysis?.moduleAddress, profile);
  const hasModuleLabel = hasKnownLabel(paramAnalysis?.moduleAddress, profile);

  if (paramAnalysis?.scope === "MODULE_ENABLE") {
    if (hasModuleLabel) {
      consequences.push(
        `${moduleLabel} will gain AUTONOMOUS EXECUTION POWER`
      );
    } else {
      consequences.push(
        "A module will gain AUTONOMOUS EXECUTION POWER"
      );
    }
    consequences.push(
      "This module can execute ANY transaction from your Safe WITHOUT owner signatures"
    );
    consequences.push(
      "No approval from Safe owners will be required for module-initiated transactions"
    );
    consequences.push(
      "This permission remains active until the module is explicitly disabled"
    );
  } else if (paramAnalysis?.scope === "MODULE_DISABLE") {
    if (hasModuleLabel) {
      consequences.push(
        `${moduleLabel} will LOSE execution power`
      );
    } else {
      consequences.push(
        "A module will LOSE execution power"
      );
    }
    consequences.push(
      "This module will no longer be able to execute transactions from your Safe"
    );
    consequences.push(
      "Any pending operations from this module will fail after this change"
    );
  }

  return consequences;
}

/**
 * Generate consequences for module-initiated execution
 */
function generateSafeModuleExecutionConsequences(paramAnalysis, profile) {
  const consequences = [];

  consequences.push(
    "⚠️ MODULE EXECUTION: This transaction BYPASSES signature requirements"
  );
  consequences.push(
    "No owner signatures are needed - the module has autonomous execution power"
  );

  if (paramAnalysis?.isDelegateCall) {
    consequences.push(
      "⚠️ DELEGATECALL: External code will execute in your Safe's context"
    );
    consequences.push(
      "This can modify Safe state including owners, threshold, and balances"
    );
  } else {
    const targetLabel = formatAddressHuman(paramAnalysis?.targetAddress, profile, "a target contract");
    const hasTargetLabel = hasKnownLabel(paramAnalysis?.targetAddress, profile);
    if (hasTargetLabel) {
      consequences.push(
        `Target: ${targetLabel}`
      );
    }
    // If no known label, don't show target in consequences - shown in technical details
  }

  return consequences;
}

/**
 * Generate consequences for Safe owner changes
 */
function generateSafeOwnerChangeConsequences(paramAnalysis, profile) {
  const consequences = [];

  if (paramAnalysis?.scope === "SIGNER_ADDITION") {
    const newOwnerLabel = formatOwnerHuman(paramAnalysis.newOwner, profile);
    const hasNewOwnerLabel = hasKnownLabel(paramAnalysis.newOwner, profile);

    if (hasNewOwnerLabel) {
      consequences.push(
        `${newOwnerLabel} will become a Safe owner`
      );
    } else {
      consequences.push(
        "An address will become a Safe owner"
      );
    }
    consequences.push(
      "This address will gain SIGNING AUTHORITY on your Safe"
    );
    consequences.push(
      "They can approve transactions and participate in reaching the signature threshold"
    );
    consequences.push(
      `After this change, ${paramAnalysis.newThreshold} signature(s) will be required`
    );
  } else if (paramAnalysis?.scope === "SIGNER_REMOVAL") {
    const removedOwnerLabel = formatOwnerHuman(paramAnalysis.removedOwner, profile);
    const hasRemovedOwnerLabel = hasKnownLabel(paramAnalysis.removedOwner, profile);

    if (hasRemovedOwnerLabel) {
      consequences.push(
        `${removedOwnerLabel} will be REMOVED as a Safe owner`
      );
    } else {
      consequences.push(
        "An address will be REMOVED as a Safe owner"
      );
    }
    consequences.push(
      "This address will LOSE all signing authority on your Safe"
    );
    consequences.push(
      "Any pending transactions they approved may need re-approval"
    );
    consequences.push(
      `After this change, ${paramAnalysis.newThreshold} signature(s) will be required`
    );
  } else if (paramAnalysis?.scope === "SIGNER_REPLACEMENT") {
    const oldOwnerLabel = formatOwnerHuman(paramAnalysis.oldOwner, profile);
    const newOwnerLabel = formatOwnerHuman(paramAnalysis.newOwner, profile);
    const hasOldOwnerLabel = hasKnownLabel(paramAnalysis.oldOwner, profile);
    const hasNewOwnerLabel = hasKnownLabel(paramAnalysis.newOwner, profile);

    if (hasOldOwnerLabel && hasNewOwnerLabel) {
      consequences.push(
        `Safe owner ${oldOwnerLabel} will be REPLACED by ${newOwnerLabel}`
      );
    } else if (hasOldOwnerLabel) {
      consequences.push(
        `Safe owner ${oldOwnerLabel} will be REPLACED by another address`
      );
    } else if (hasNewOwnerLabel) {
      consequences.push(
        `A Safe owner will be REPLACED by ${newOwnerLabel}`
      );
    } else {
      consequences.push(
        "A Safe owner will be REPLACED by another address"
      );
    }
    consequences.push(
      "Signing authority transfers from the old owner to the new owner"
    );
    consequences.push(
      "The old owner loses all control; the new owner gains signing rights"
    );
  }

  return consequences;
}

/**
 * Generate consequences for Safe threshold changes
 */
function generateSafeThresholdChangeConsequences(paramAnalysis, profile) {
  const consequences = [];

  consequences.push(
    `The signature threshold will change to ${paramAnalysis?.newThreshold}`
  );
  consequences.push(
    `After this change, ${paramAnalysis?.newThreshold} owner signature(s) will be required to execute transactions`
  );

  // Note: We can't know the current threshold without additional context,
  // so we describe what different threshold values mean
  if (paramAnalysis?.newThreshold === BigInt(1) || paramAnalysis?.newThreshold === 1) {
    consequences.push(
      "⚠️ A threshold of 1 means ANY single owner can execute transactions alone"
    );
  }

  return consequences;
}

/**
 * Generate consequences for Safe fallback handler changes
 */
function generateSafeFallbackChangeConsequences(paramAnalysis, profile) {
  const consequences = [];

  if (paramAnalysis?.isRemoval) {
    consequences.push(
      "The fallback handler will be REMOVED"
    );
    consequences.push(
      "Calls to undefined functions will revert instead of being forwarded"
    );
  } else {
    const handlerLabel = formatAddressHuman(paramAnalysis?.handlerAddress, profile, "a handler address");
    const hasHandlerLabel = hasKnownLabel(paramAnalysis?.handlerAddress, profile);

    if (hasHandlerLabel) {
      consequences.push(
        `Fallback handler will be set to ${handlerLabel}`
      );
    } else {
      consequences.push(
        "A fallback handler will be set"
      );
    }
    consequences.push(
      "Calls to undefined functions on your Safe will be forwarded to this address"
    );
    consequences.push(
      "The handler can interpret and respond to arbitrary calls to your Safe"
    );
  }

  return consequences;
}

/**
 * Generate consequences for Safe guard changes
 */
function generateSafeGuardChangeConsequences(paramAnalysis, profile) {
  const consequences = [];

  if (paramAnalysis?.isRemoval) {
    consequences.push(
      "The transaction guard will be REMOVED"
    );
    consequences.push(
      "Transactions will no longer be validated by an external guard contract"
    );
    consequences.push(
      "Any restrictions enforced by the previous guard will no longer apply"
    );
  } else {
    const guardLabel = formatAddressHuman(paramAnalysis?.guardAddress, profile, "a guard contract");
    const hasGuardLabel = hasKnownLabel(paramAnalysis?.guardAddress, profile);

    if (hasGuardLabel) {
      consequences.push(
        `Transaction guard will be set to ${guardLabel}`
      );
    } else {
      consequences.push(
        "A transaction guard will be set"
      );
    }
    consequences.push(
      "This guard contract can BLOCK any Safe transaction from executing"
    );
    consequences.push(
      "All transactions must pass the guard's validation before execution"
    );
    consequences.push(
      "⚠️ A malicious guard could permanently block all Safe operations"
    );
  }

  return consequences;
}

/**
 * Generate warnings based on effect analysis
 */
function generateWarnings(effectType, paramAnalysis) {
  const warnings = [];

  if (paramAnalysis?.scope === "UNLIMITED") {
    warnings.push("UNLIMITED permission - the recipient can drain your entire balance");
  }

  if (effectType === "CONTROL_TRANSFER") {
    warnings.push("This permanently changes who controls this contract");
  }

  if (effectType === "UPGRADE_AUTHORITY") {
    warnings.push("Contract upgrades can completely change functionality");
  }

  if (effectType === "BATCH_OPERATION") {
    warnings.push("Batch operations may hide dangerous calls within benign ones");
  }

  // ═══════════════════════════════════════════════════════════════════
  // Safe-Specific Warnings
  // ═══════════════════════════════════════════════════════════════════

  if (paramAnalysis?.safeContext) {
    // DELEGATECALL warnings
    if (paramAnalysis.isDelegateCall) {
      warnings.push("DELEGATECALL executes external code with your Safe's full permissions");
      warnings.push("Malicious code could steal all assets, add owners, or change settings");
    }

    // Module warnings
    if (paramAnalysis.grantsAutonomousExecution) {
      warnings.push("Enabled modules can execute transactions WITHOUT any owner signatures");
      warnings.push("Module has COMPLETE control over Safe assets and settings");
    }

    if (paramAnalysis.bypassesSignatures) {
      warnings.push("This execution bypasses normal signature requirements");
    }

    // Owner change warnings
    if (paramAnalysis.changesSigningPower) {
      warnings.push("This changes who can sign transactions for the Safe");
    }

    // Threshold warnings
    if (paramAnalysis.changesSigningRequirements) {
      warnings.push("This changes how many signatures are needed to execute transactions");
    }

    // Guard warnings
    if (paramAnalysis.canBlockExecution) {
      warnings.push("A guard contract can block ALL transactions if misconfigured");
    }
  }

  return warnings;
}

/**
 * Generate mitigation suggestions
 */
function generateMitigations(effectType, paramAnalysis) {
  const mitigations = [];

  if (effectType === "PERMISSION_GRANT" && paramAnalysis?.scope === "UNLIMITED") {
    mitigations.push("Consider approving only the specific amount needed for this transaction");
    mitigations.push("Revoke unused approvals regularly using revoke.cash or similar tools");
  }

  if (effectType === "ASSET_TRANSFER") {
    mitigations.push("Verify the recipient address is correct before signing");
  }

  if (effectType === "CONTROL_TRANSFER" || effectType === "UPGRADE_AUTHORITY") {
    mitigations.push("Ensure you trust the destination address completely");
    mitigations.push("This action may be irreversible - double-check everything");
  }

  // ═══════════════════════════════════════════════════════════════════
  // Safe-Specific Mitigations
  // ═══════════════════════════════════════════════════════════════════

  if (paramAnalysis?.safeContext) {
    if (paramAnalysis.isDelegateCall) {
      mitigations.push("Verify the target contract is from a trusted, audited source");
      mitigations.push("Consider using CALL instead of DELEGATECALL if possible");
      mitigations.push("Review the target contract's code on a block explorer");
    }

    if (paramAnalysis.grantsAutonomousExecution) {
      mitigations.push("Verify the module contract is audited and from a trusted source");
      mitigations.push("Understand exactly what the module can do with your Safe's assets");
      mitigations.push("Monitor module activity and disable it when no longer needed");
    }

    if (paramAnalysis.changesSigningPower) {
      mitigations.push("Verify you trust the new owner address completely");
      mitigations.push("Consider the impact on threshold requirements");
    }

    if (paramAnalysis.changesSigningRequirements) {
      mitigations.push("Consider the security implications of the new threshold");
      mitigations.push("Lower thresholds make execution easier but less secure");
    }

    if (paramAnalysis.canBlockExecution) {
      mitigations.push("Ensure the guard contract is well-audited");
      mitigations.push("Verify the guard has mechanisms to be disabled if needed");
    }
  }

  return mitigations;
}

/**
 * Format an address for display
 */
function formatAddress(address) {
  if (!address) return "unknown address";
  return address;
}

/**
 * Format an amount for display
 */
function formatAmount(amount) {
  if (amount === undefined || amount === null) return "an unknown amount of";

  if (typeof amount === "bigint") {
    if (isMaxApproval(amount)) {
      return "UNLIMITED";
    }
    return amount.toString();
  }

  return String(amount);
}

/**
 * Get severity color/level info for display
 */
export function getSeverityInfo(severity) {
  const info = {
    CRITICAL: {
      level: 4,
      label: "CRITICAL",
      description: "Extremely high risk - may result in total loss of assets or control"
    },
    HIGH: {
      level: 3,
      label: "HIGH",
      description: "Significant risk - grants substantial permissions or moves assets"
    },
    MEDIUM: {
      level: 2,
      label: "MEDIUM",
      description: "Moderate risk - limited scope but still requires attention"
    },
    LOW: {
      level: 1,
      label: "LOW",
      description: "Low risk - typically revocations or read-only operations"
    },
    CONTEXT_DEPENDENT: {
      level: 2,
      label: "CONTEXT_DEPENDENT",
      description: "Risk depends on context - function identified via trust profile"
    },
    UNKNOWN: {
      level: -1,
      label: "UNKNOWN",
      description: "Cannot assess risk - unverified function signature"
    }
  };

  return info[severity] || info.UNKNOWN;
}
