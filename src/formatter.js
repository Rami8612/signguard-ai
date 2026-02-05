/**
 * Human-readable and JSON output formatting
 */

import { lookupAddress } from "./selectors.js";
import { formatValue } from "./decoder.js";
import { getSeverityInfo } from "./effectAnalyzer.js";
import { CONTRACT_CLASSIFICATION, SELECTOR_CLASSIFICATION } from "./trustClassifier.js";
import { getAddressLabel, hasKnownLabel } from "./addressDisplay.js";
import { BATCH_TYPE, formatBatchSummary } from "./batchParser.js";

const BOX_WIDTH = 68;

/**
 * Extract function name from a signature for JSON output
 */
function extractFunctionNameForJSON(signature) {
  if (!signature) return null;
  const match = signature.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
  return match ? match[1] : null;
}

/**
 * Create the main human-readable output
 */
export function formatHumanReadable(result) {
  const lines = [];

  // ═══════════════════════════════════════════════════════════════════
  // BATCH TRANSACTION DETECTION (Phase 12)
  // If this is a batch transaction, show batch info first
  // ═══════════════════════════════════════════════════════════════════

  if (result.isBatch && result.batchInfo) {
    lines.push(...formatBatchOutput(result));
    lines.push("");
    lines.push(separator());
    lines.push("");
    // Continue with regular output for the MultiSend call itself
  }

  // If trust profile blocked interpretation, show special output
  if (result.trustBlocked) {
    lines.push(...formatTrustBlockedOutput(result));
    return lines.join("\n");
  }

  // Add trust context header if available
  if (result.trustContext && result.trustContext.profileLoaded) {
    lines.push(...formatTrustContextHeader(result));
    lines.push("");
  }

  // Check if this is ABI-verified, trust-profile-verified, or unverified
  if (result.verified) {
    lines.push(...formatVerifiedOutput(result));
  } else if (result.effect?.trustProfileVerified || result.source === "TRUST_PROFILE") {
    // Trust-profile-verified but not ABI-verified - use formatVerifiedOutput
    // which will delegate to formatTrustProfileOutput for TRUST_PROFILE_SEMANTIC effects
    lines.push(...formatVerifiedOutput(result));
  } else {
    lines.push(...formatUnverifiedOutput(result));
  }

  return lines.join("\n");
}

/**
 * Format batch transaction output
 */
/**
 * Get severity indicator emoji/symbol
 */
function getSeverityIndicator(severity) {
  switch (severity) {
    case "LOW": return "✓";
    case "MEDIUM": return "~";
    case "HIGH": return "⚠";
    case "CRITICAL": return "✗";
    case "UNKNOWN": return "?";
    default: return "?";
  }
}

/**
 * Get category color indicator
 */
function getCategoryIndicator(category) {
  switch (category) {
    case "OK": return "✓";
    case "WARN": return "⚠";
    case "DANGER": return "✗";
    case "UNKNOWN": return "?";
    default: return "?";
  }
}

function formatBatchOutput(result) {
  const lines = [];
  const batchInfo = result.batchInfo;
  const hasAnalysis = batchInfo.batchSummary?.analyzed;

  // Header box with count
  lines.push(boxTop());
  if (batchInfo.batchType === BATCH_TYPE.UNPARSEABLE_BATCH) {
    lines.push(boxLine("BATCH TRANSACTION DETECTED (UNPARSEABLE)"));
  } else {
    lines.push(boxLine(`Batch: ${batchInfo.callCount} sub-transactions`));
  }
  lines.push(boxBottom());
  lines.push("");

  // Batch type and count
  if (batchInfo.batchType === BATCH_TYPE.UNPARSEABLE_BATCH) {
    lines.push("Status: UNPARSEABLE_BATCH");
    lines.push("");
    lines.push("Unable to parse batch transaction structure.");
    if (batchInfo.error) {
      lines.push(`Error: ${batchInfo.error}`);
    }
    lines.push("");
    lines.push("The transaction appears to be a MultiSend batch but could not be decoded.");
    lines.push("Manual verification is required.");
    return lines;
  }

  lines.push(`Type: ${batchInfo.batchType}`);

  // Show overall severity if analyzed
  if (hasAnalysis && batchInfo.batchSummary) {
    const summary = batchInfo.batchSummary;
    lines.push(`Overall Severity: ${summary.overallSeverity} ${getSeverityIndicator(summary.overallSeverity)}`);
  }
  lines.push("");

  // Sub-transaction list with analysis
  lines.push("SUB-TRANSACTIONS:");
  lines.push("");

  for (let i = 0; i < batchInfo.calls.length; i++) {
    const call = batchInfo.calls[i];
    const analysis = call.analysis;
    const num = `[${i + 1}/${batchInfo.callCount}]`;

    // Header line with severity indicator
    if (analysis) {
      const indicator = getSeverityIndicator(analysis.severity);
      lines.push(`${num} ${indicator} ${call.operationLabel} → ${analysis.severity}`);
    } else {
      lines.push(`${num} ${call.operationLabel}`);
    }

    // Target address with trust context if available
    if (analysis?.trustContext?.label) {
      lines.push(`  Target: ${analysis.trustContext.label}`);
      lines.push(`    (${call.to})`);
    } else {
      lines.push(`  Target: ${call.to}`);
    }

    // ETH value
    if (call.value > 0n) {
      lines.push(`  Value: ${call.valueWei} wei`);
    }

    // Analysis details
    if (analysis) {
      if (analysis.isEthTransfer) {
        lines.push(`  Action: ETH transfer`);
      } else if (analysis.error) {
        lines.push(`  Error: ${analysis.error}`);
      } else {
        // Function info
        if (analysis.signature) {
          const verifiedTag = analysis.verified ? "[VERIFIED]" :
                              analysis.trustProfileVerified ? "[TRUST_PROFILE]" : "[UNVERIFIED]";
          lines.push(`  Function: ${analysis.functionName || analysis.signature} ${verifiedTag}`);
        } else if (analysis.selector) {
          lines.push(`  Selector: ${analysis.selector} [UNKNOWN]`);
        }

        // Summary of what it does
        if (analysis.summary) {
          lines.push(`  Effect: ${analysis.summary}`);
        }

        // Special flags
        if (analysis.isDelegatecall) {
          lines.push(`  ⚠ DELEGATECALL: External code runs in Safe's context`);
        }
        if (analysis.trustBlocked) {
          lines.push(`  ⚠ UNKNOWN CONTRACT: Not in trust profile`);
        }
      }
    } else {
      // Fallback to raw calldata info
      if (call.dataLength > 0) {
        if (call.data.length >= 10) {
          lines.push(`  Selector: ${call.data.slice(0, 10)}`);
        }
        lines.push(`  Calldata: ${call.dataLength} bytes`);
      } else {
        lines.push(`  Calldata: (empty - ETH transfer only)`);
      }
    }

    lines.push("");
  }

  // Batch summary section
  lines.push("─".repeat(68));
  lines.push("");

  if (hasAnalysis && batchInfo.batchSummary) {
    const summary = batchInfo.batchSummary;
    const counts = summary.counts;

    lines.push("BATCH SUMMARY:");
    lines.push(`  ✓ OK:      ${counts.OK || 0}`);
    lines.push(`  ⚠ WARN:    ${counts.WARN || 0}`);
    lines.push(`  ✗ DANGER:  ${counts.DANGER || 0}`);
    lines.push(`  ? UNKNOWN: ${counts.UNKNOWN || 0}`);
    lines.push("");

    // Warning if any dangerous or unknown
    if (counts.DANGER > 0 || counts.UNKNOWN > 0) {
      lines.push("╔══════════════════════════════════════════════════════════════════╗");
      if (counts.DANGER > 0) {
        lines.push("║  ⚠ This batch contains CRITICAL severity operations              ║");
      }
      if (counts.UNKNOWN > 0) {
        lines.push("║  ⚠ This batch contains UNKNOWN operations - review carefully     ║");
      }
      lines.push("╚══════════════════════════════════════════════════════════════════╝");
      lines.push("");
    }
  }

  lines.push("NOTE: Sub-transactions are shown in execution order.");
  lines.push("All operations execute atomically - all succeed or all fail.");

  return lines;
}

/**
 * Format output for verified signatures
 */
function formatVerifiedOutput(result) {
  const effect = result.effect;

  // Use Safe-specific formatter for Safe operations
  if (isSafeEffect(effect.effectType)) {
    return formatSafeOutput(result);
  }

  // Use trust profile formatter for trust-profile-verified selectors
  if (isTrustProfileEffect(effect)) {
    return formatTrustProfileOutput(result);
  }

  // Standard formatting for non-Safe operations
  return formatStandardOutput(result);
}

/**
 * Check if this is a trust-profile-verified effect
 */
function isTrustProfileEffect(effect) {
  return effect && (
    effect.effectType === "TRUST_PROFILE_SEMANTIC" ||
    effect.trustProfileVerified ||
    effect.source === "TRUST_PROFILE"
  );
}

/**
 * Format output for trust-profile-verified selectors.
 *
 * This clearly indicates that the interpretation comes from the trust profile,
 * NOT from ABI verification or 4byte.directory.
 */
function formatTrustProfileOutput(result) {
  const lines = [];
  const effect = result.effect;
  const severityInfo = getSeverityInfo(effect.severity);
  const trustContext = result.trustContext || {};

  // Header box indicating trust profile source
  lines.push(boxTop());
  lines.push(boxLine("TRUST PROFILE INTERPRETATION"));
  lines.push(boxBottom());
  lines.push("");

  // Source indicator - CRITICAL visibility
  lines.push("╔══════════════════════════════════════════════════════════════════╗");
  lines.push("║  Source: TRUST_PROFILE                                           ║");
  lines.push("║  This interpretation is based on your trust profile, NOT ABI.    ║");
  lines.push("╚══════════════════════════════════════════════════════════════════╝");
  lines.push("");

  // Contract and function identification
  lines.push("TRUSTED CONTRACT:");
  if (trustContext.label) {
    lines.push(`  Contract: ${trustContext.label}`);
  }
  if (result.targetAddress) {
    lines.push(`  Address: ${result.targetAddress}`);
  }
  if (trustContext.trustLevel) {
    lines.push(`  Trust Level: ${trustContext.trustLevel}`);
  }
  lines.push("");

  // Function identification
  lines.push("FUNCTION IDENTIFICATION:");
  lines.push(`  Label: ${effect.label || trustContext.selectorLabel || "unknown"}`);
  lines.push(`  Selector: ${result.selector}`);
  if (result.signature) {
    lines.push(`  Matched signature: ${result.signature}`);
    lines.push("    (Function name matches trust profile label)");
  } else {
    lines.push("  Signature: Not available");
    lines.push("    (Trust profile provides label only - no parameter decoding)");
  }
  lines.push("");

  // Consequences
  if (effect.consequences && effect.consequences.length > 0) {
    lines.push("WHAT WE CAN INFER:");
    for (const consequence of effect.consequences) {
      lines.push(wrapText(`  • ${consequence}`, 66, "    "));
    }
    lines.push("");
  }

  // Parameters (if decoded)
  if (result.params && Object.keys(result.params).length > 0) {
    lines.push("DECODED PARAMETERS:");
    for (const [name, value] of Object.entries(result.params)) {
      const formatted = formatValue(value);
      if (formatted.length > 50) {
        lines.push(`    ${name}:`);
        lines.push(`      ${formatted}`);
      } else {
        lines.push(`    ${name}: ${formatted}`);
      }
    }
    lines.push("");
  }

  // Warnings - important for trust profile interpretations
  if (effect.warnings && effect.warnings.length > 0) {
    lines.push("⚠️  IMPORTANT NOTES:");
    for (const warning of effect.warnings) {
      lines.push(wrapText(`  • ${warning}`, 66, "    "));
    }
    lines.push("");
  }

  // Severity
  lines.push(`SEVERITY: ${effect.severity}`);
  if (severityInfo.description) {
    lines.push(`  ${severityInfo.description}`);
  }
  lines.push("");

  // Trust context warnings (from trust classifier)
  if (effect.trustWarnings && effect.trustWarnings.length > 0) {
    lines.push("TRUST PROFILE NOTES:");
    for (const warning of effect.trustWarnings) {
      lines.push(`  • ${warning}`);
    }
    lines.push("");
  }

  // Usage stats
  if (trustContext.usageStats) {
    lines.push("USAGE HISTORY:");
    lines.push(`  Previous uses: ${trustContext.usageStats.count} times`);
    if (trustContext.usageStats.lastUsed) {
      lines.push(`  Last used: ${trustContext.usageStats.lastUsed}`);
    }
    lines.push("");
  }

  // Mitigations
  if (effect.mitigations && effect.mitigations.length > 0) {
    lines.push("RECOMMENDATIONS:");
    for (const mitigation of effect.mitigations) {
      lines.push(wrapText(`  • ${mitigation}`, 66, "    "));
    }
    lines.push("");
  }

  // Technical details
  lines.push(separator());
  lines.push("Technical Details:");
  lines.push(`  Selector: ${result.selector}`);
  lines.push(`  Source: TRUST_PROFILE (NOT ABI-verified)`);
  if (result.signature) {
    lines.push(`  Signature: ${result.signature}`);
  }
  if (trustContext.selectorLabel) {
    lines.push(`  Trust profile label: ${trustContext.selectorLabel}`);
  }
  lines.push(separator());

  return lines;
}

/**
 * Check if this is a Safe-related effect type
 */
function isSafeEffect(effectType) {
  return effectType && effectType.startsWith("SAFE_");
}

/**
 * Format output for Safe/Gnosis multisig operations
 * Prioritizes power/control changes over technical details
 */
function formatSafeOutput(result) {
  const lines = [];
  const effect = result.effect;
  const paramAnalysis = result.paramAnalysis || {};
  const severityInfo = getSeverityInfo(effect.severity);
  const profile = result.profile;

  // Header box - indicate this is a Safe transaction
  lines.push(boxTop());
  lines.push(boxLine("SAFE MULTISIG TRANSACTION"));
  lines.push(boxBottom());
  lines.push("");

  // ═══════════════════════════════════════════════════════════════════
  // POWER CHANGES FIRST - What control is being granted/revoked
  // ═══════════════════════════════════════════════════════════════════

  const powerSection = formatSafePowerChanges(effect.effectType, paramAnalysis, profile);
  if (powerSection.length > 0) {
    lines.push("WHO GAINS OR LOSES POWER:");
    lines.push(...powerSection);
    lines.push("");
  }

  // ═══════════════════════════════════════════════════════════════════
  // PLAIN LANGUAGE EXPLANATION
  // ═══════════════════════════════════════════════════════════════════

  lines.push("WHAT THIS MEANS IN PLAIN TERMS:");
  lines.push(...formatSafePlainExplanation(effect.effectType, paramAnalysis));
  lines.push("");

  // ═══════════════════════════════════════════════════════════════════
  // CONSEQUENCES
  // ═══════════════════════════════════════════════════════════════════

  if (effect.consequences && effect.consequences.length > 0) {
    lines.push("DETAILED CONSEQUENCES:");
    for (const consequence of effect.consequences) {
      lines.push(wrapText(`  • ${consequence}`, 66, "    "));
    }
    lines.push("");
  }

  // ═══════════════════════════════════════════════════════════════════
  // CRITICAL WARNINGS (prominent for Safe operations)
  // ═══════════════════════════════════════════════════════════════════

  if (effect.warnings && effect.warnings.length > 0) {
    lines.push("╔══════════════════════════════════════════════════════════════════╗");
    lines.push("║  ⚠️  CRITICAL WARNINGS                                           ║");
    lines.push("╚══════════════════════════════════════════════════════════════════╝");
    for (const warning of effect.warnings) {
      lines.push(wrapText(`  • ${warning}`, 66, "    "));
    }
    lines.push("");
  }

  // Severity
  lines.push(`SEVERITY: ${effect.severity}`);
  lines.push(`  ${severityInfo.description}`);
  lines.push("");

  // Permanence
  lines.push("PERMANENCE:");
  lines.push(`  ${formatSafePermanence(effect.effectType, paramAnalysis)}`);
  lines.push("");

  // Mitigations
  if (effect.mitigations && effect.mitigations.length > 0) {
    lines.push("BEFORE SIGNING, CONSIDER:");
    for (const mitigation of effect.mitigations) {
      lines.push(wrapText(`  • ${mitigation}`, 66, "    "));
    }
    lines.push("");
  }

  // Technical details (at the end, less prominent)
  lines.push(separator());
  lines.push("Technical Details (for developers):");
  lines.push(`  Function: ${result.signature}`);
  lines.push(`  Selector: ${result.selector}`);
  if (paramAnalysis.operation) {
    lines.push(`  Operation: ${paramAnalysis.operation}`);
  }
  if (paramAnalysis.targetAddress) {
    const targetInfo = lookupAddress(paramAnalysis.targetAddress);
    lines.push(`  Target: ${paramAnalysis.targetAddress}`);
    if (targetInfo) {
      lines.push(`    (Known: ${targetInfo.name})`);
    }
  }
  lines.push(separator());

  return lines;
}

/**
 * Format power changes for Safe operations
 *
 * ADDRESS DISPLAY: Only shows labels from trusted registry.
 * If address is not in registry, uses generic description.
 * Full addresses are shown in Technical Details section.
 */
function formatSafePowerChanges(effectType, paramAnalysis, profile) {
  const lines = [];

  // Helper to get label or generic fallback
  const getLabel = (addr, fallback) => {
    const labelInfo = getAddressLabel(addr, profile);
    return labelInfo ? labelInfo.label : fallback;
  };

  switch (effectType) {
    case "SAFE_EXECUTION":
      if (paramAnalysis.isDelegateCall) {
        lines.push("  ⚡ TARGET CONTRACT gains temporary execution power INSIDE your Safe");
        lines.push("     (Code runs with your Safe's identity and permissions)");
      } else {
        lines.push("  → Your Safe will execute an action on another contract");
      }
      break;

    case "SAFE_MODULE_CHANGE":
      if (paramAnalysis.scope === "MODULE_ENABLE") {
        const moduleLabel = getLabel(paramAnalysis.moduleAddress, "A module");
        lines.push(`  ⚡ ${moduleLabel} GAINS:`);
        lines.push("     • Ability to execute ANY transaction from your Safe");
        lines.push("     • No signatures required for future transactions");
        lines.push("     • Full control over Safe assets and settings");
      } else {
        const moduleLabel = getLabel(paramAnalysis.moduleAddress, "A module");
        lines.push(`  ✖ ${moduleLabel} LOSES:`);
        lines.push("     • All execution power over your Safe");
        lines.push("     • Cannot initiate any future transactions");
      }
      break;

    case "SAFE_MODULE_EXECUTION":
      lines.push("  ⚡ A MODULE is executing this transaction");
      lines.push("     • No owner signatures were required");
      lines.push("     • The module has autonomous control");
      break;

    case "SAFE_OWNER_CHANGE":
      if (paramAnalysis.scope === "SIGNER_ADDITION") {
        const ownerLabel = getLabel(paramAnalysis.newOwner, "An address");
        lines.push(`  ⚡ ${ownerLabel} GAINS:`);
        lines.push("     • Signing authority on your Safe");
        lines.push("     • Ability to approve transactions");
      } else if (paramAnalysis.scope === "SIGNER_REMOVAL") {
        const ownerLabel = getLabel(paramAnalysis.removedOwner, "An address");
        lines.push(`  ✖ ${ownerLabel} LOSES:`);
        lines.push("     • All signing authority on your Safe");
        lines.push("     • Cannot approve any future transactions");
      } else if (paramAnalysis.scope === "SIGNER_REPLACEMENT") {
        const oldLabel = getLabel(paramAnalysis.oldOwner, "An owner");
        const newLabel = getLabel(paramAnalysis.newOwner, "another address");
        lines.push(`  ✖ ${oldLabel} LOSES all signing power`);
        lines.push(`  ⚡ ${newLabel} GAINS all signing power`);
      }
      break;

    case "SAFE_THRESHOLD_CHANGE":
      lines.push(`  ⚙ Signature requirement changes to ${paramAnalysis.newThreshold}`);
      if (paramAnalysis.newThreshold === BigInt(1) || paramAnalysis.newThreshold === 1) {
        lines.push("     ⚠️ ANY SINGLE OWNER can execute transactions alone");
      }
      break;

    case "SAFE_GUARD_CHANGE":
      if (paramAnalysis.isRemoval) {
        lines.push("  ✖ Transaction guard is being REMOVED");
        lines.push("     • Any previous restrictions no longer apply");
      } else {
        const guardLabel = getLabel(paramAnalysis.guardAddress, "A guard contract");
        lines.push(`  ⚡ ${guardLabel} GAINS:`);
        lines.push("     • Power to BLOCK any Safe transaction");
        lines.push("     • All transactions must pass guard validation");
      }
      break;

    case "SAFE_FALLBACK_CHANGE":
      if (paramAnalysis.isRemoval) {
        lines.push("  ✖ Fallback handler is being REMOVED");
      } else {
        const handlerLabel = getLabel(paramAnalysis.handlerAddress, "A handler");
        lines.push(`  ⚡ ${handlerLabel} GAINS:`);
        lines.push("     • Control over how unknown calls are handled");
      }
      break;
  }

  return lines;
}

/**
 * Format plain language explanation for Safe operations
 */
function formatSafePlainExplanation(effectType, paramAnalysis) {
  const lines = [];

  switch (effectType) {
    case "SAFE_EXECUTION":
      if (paramAnalysis.isDelegateCall) {
        lines.push("  Your Safe is about to run external code AS IF it were the Safe itself.");
        lines.push("");
        lines.push("  Think of it like giving someone your house keys and letting them");
        lines.push("  redecorate - they can move furniture, change locks, or even give");
        lines.push("  copies of keys to others. The external code has FULL ACCESS to");
        lines.push("  everything your Safe owns and controls.");
      } else {
        lines.push("  Your Safe is sending a transaction to another address.");
        lines.push("  This is like writing a check - it transfers value or triggers");
        lines.push("  an action, but doesn't give ongoing access.");
      }
      break;

    case "SAFE_MODULE_CHANGE":
      if (paramAnalysis.scope === "MODULE_ENABLE") {
        lines.push("  You are giving this address a MASTER KEY to your Safe.");
        lines.push("");
        lines.push("  After this, the module can execute ANY transaction without asking");
        lines.push("  for signatures. It's like adding a robot with full authority to");
        lines.push("  sign checks, transfer funds, and change settings on your behalf.");
        lines.push("");
        lines.push("  The module can act at any time, for any amount, to any address.");
      } else {
        lines.push("  You are taking away this address's master key.");
        lines.push("  It will no longer be able to execute transactions from your Safe.");
      }
      break;

    case "SAFE_MODULE_EXECUTION":
      lines.push("  This transaction is coming from a module, not from owners.");
      lines.push("");
      lines.push("  No signatures were collected because modules have autonomous power.");
      lines.push("  This is normal IF you intentionally enabled this module.");
      lines.push("  If you didn't, your Safe may be compromised.");
      break;

    case "SAFE_OWNER_CHANGE":
      if (paramAnalysis.scope === "SIGNER_ADDITION") {
        lines.push("  A new person/address is being added to the group that controls this Safe.");
        lines.push("  They will be able to approve transactions alongside existing owners.");
      } else if (paramAnalysis.scope === "SIGNER_REMOVAL") {
        lines.push("  Someone is being removed from the group that controls this Safe.");
        lines.push("  They will no longer be able to approve any transactions.");
      } else if (paramAnalysis.scope === "SIGNER_REPLACEMENT") {
        lines.push("  One owner is being swapped out for another.");
        lines.push("  The old owner loses all access; the new owner takes their place.");
      }
      break;

    case "SAFE_THRESHOLD_CHANGE":
      lines.push(`  The Safe will now require ${paramAnalysis.newThreshold} signature(s) to execute.`);
      if (paramAnalysis.newThreshold === BigInt(1) || paramAnalysis.newThreshold === 1) {
        lines.push("");
        lines.push("  With a threshold of 1, any single owner can move all funds alone.");
        lines.push("  This removes the security benefit of having multiple owners.");
      }
      break;

    case "SAFE_GUARD_CHANGE":
      if (paramAnalysis.isRemoval) {
        lines.push("  The safety check that reviews transactions is being removed.");
        lines.push("  Transactions will no longer be validated by an external contract.");
      } else {
        lines.push("  A new gatekeeper is being added that can BLOCK transactions.");
        lines.push("");
        lines.push("  Every future transaction must be approved by this guard contract.");
        lines.push("  If the guard malfunctions or is malicious, it could lock you out");
        lines.push("  of your Safe permanently - no transactions would be possible.");
      }
      break;

    case "SAFE_FALLBACK_CHANGE":
      if (paramAnalysis.isRemoval) {
        lines.push("  The handler for unknown function calls is being removed.");
        lines.push("  Calls to unrecognized functions will simply fail.");
      } else {
        lines.push("  A new handler will receive any calls your Safe doesn't recognize.");
        lines.push("  This is an advanced feature used for extending Safe functionality.");
      }
      break;

    default:
      lines.push(`  ${paramAnalysis.description || "This modifies your Safe's configuration."}`);
  }

  return lines;
}

/**
 * Format permanence description for Safe operations
 */
function formatSafePermanence(effectType, paramAnalysis) {
  switch (effectType) {
    case "SAFE_EXECUTION":
      return "This transaction executes immediately and cannot be undone.";

    case "SAFE_MODULE_CHANGE":
      if (paramAnalysis.scope === "MODULE_ENABLE") {
        return "The module remains enabled until explicitly disabled by owners.";
      } else {
        return "The module is disabled immediately and permanently (unless re-enabled).";
      }

    case "SAFE_MODULE_EXECUTION":
      return "This transaction executes immediately and cannot be undone.";

    case "SAFE_OWNER_CHANGE":
      return "Owner changes take effect immediately and persist until changed again.";

    case "SAFE_THRESHOLD_CHANGE":
      return "The new threshold takes effect immediately for all future transactions.";

    case "SAFE_GUARD_CHANGE":
      if (paramAnalysis.isRemoval) {
        return "The guard is removed immediately. Transactions are no longer validated.";
      } else {
        return "The guard takes effect immediately for ALL future transactions.";
      }

    case "SAFE_FALLBACK_CHANGE":
      return "The change takes effect immediately for all future calls.";

    default:
      return "This change persists until explicitly modified.";
  }
}

/**
 * Standard formatting for non-Safe operations
 */
function formatStandardOutput(result) {
  const lines = [];
  const effect = result.effect;
  const severityInfo = getSeverityInfo(effect.severity);

  // Header box
  lines.push(boxTop());
  lines.push(boxLine("TRANSACTION CONSEQUENCES"));
  lines.push(boxBottom());
  lines.push("");

  // Main description
  lines.push("WHAT THIS TRANSACTION DOES:");
  lines.push(`  ${result.description}`);
  lines.push("");

  // Consequences
  if (effect.consequences && effect.consequences.length > 0) {
    lines.push("CONSEQUENCES IF YOU SIGN:");
    for (const consequence of effect.consequences) {
      lines.push(wrapText(`  • ${consequence}`, 66, "    "));
    }
    lines.push("");
  }

  // Beneficiary info - only show labels from trusted registry, not raw addresses
  if (effect.beneficiary) {
    const profile = result.profile;
    const trustLabel = getAddressLabel(effect.beneficiary, profile);

    if (trustLabel) {
      // Address is in trusted registry - show label only in summary
      lines.push("WHO BENEFITS:");
      lines.push(`  ${trustLabel.label} (${trustLabel.type === "ASSET" ? "Trusted Asset" : "Trusted Contract"})`);
      lines.push("");
    }
    // If not in trusted registry, don't show beneficiary in summary
    // Full address is available in Technical Details section
  }

  // Warnings
  if (effect.warnings && effect.warnings.length > 0) {
    lines.push("⚠️  WARNINGS:");
    for (const warning of effect.warnings) {
      lines.push(wrapText(`  • ${warning}`, 66, "    "));
    }
    lines.push("");
  }

  // Severity
  lines.push(`SEVERITY: ${effect.severity}`);
  lines.push(`  Reason: ${severityInfo.description}`);
  lines.push("");

  // Mitigations
  if (effect.mitigations && effect.mitigations.length > 0) {
    lines.push("RECOMMENDATIONS:");
    for (const mitigation of effect.mitigations) {
      lines.push(wrapText(`  • ${mitigation}`, 66, "    "));
    }
    lines.push("");
  }

  // Technical details section
  lines.push(separator());
  lines.push("Technical Details (for reference):");
  lines.push(`  Function: ${result.signature}`);
  lines.push(`  Selector: ${result.selector}`);

  if (result.params && Object.keys(result.params).length > 0) {
    lines.push("  Parameters:");
    for (const [name, value] of Object.entries(result.params)) {
      const formatted = formatValue(value);
      if (formatted.length > 50) {
        lines.push(`    ${name}:`);
        lines.push(`      ${formatted}`);
      } else {
        lines.push(`    ${name}: ${formatted}`);
      }
    }
  }

  lines.push(separator());

  return lines;
}

/**
 * Format address for display (truncate if needed)
 */
function formatAddress(address) {
  if (!address) return "unknown address";
  return address;
}

/**
 * Format output for unverified signatures
 */
function formatUnverifiedOutput(result) {
  const lines = [];

  // Header box
  lines.push(boxTop());
  lines.push(boxLine("TRANSACTION CONSEQUENCES"));
  lines.push(boxBottom());
  lines.push("");

  // Big warning
  lines.push("⚠️  UNVERIFIED FUNCTION SIGNATURE");
  lines.push("");

  // What we know
  lines.push("WHAT WE KNOW:");
  lines.push("  This transaction calls a function we cannot verify.");
  if (result.source === "4byte.directory") {
    lines.push("  The signature was fetched from an external database and may be incorrect.");
  } else {
    lines.push("  No matching signature was found in any database.");
  }
  lines.push("");

  // What this means
  lines.push("WHAT THIS MEANS:");
  lines.push("  • We CANNOT determine the consequences of signing this transaction");
  lines.push("  • The function name below is UNVERIFIED and should NOT be trusted");
  lines.push("  • You should verify this transaction through other means before signing");
  lines.push("");

  // Severity
  lines.push("SEVERITY: UNKNOWN");
  lines.push("  Reason: Cannot analyze effects of unverified function");
  lines.push("");

  // Recommendations
  lines.push("RECOMMENDATIONS:");
  lines.push("  • Verify the contract source code on a block explorer (Etherscan, etc.)");
  lines.push("  • Contact the dApp developer for clarification");
  lines.push("  • Do NOT sign if you cannot verify the transaction's purpose");
  lines.push("");

  // Technical details
  lines.push(separator());
  lines.push("Technical Details (UNVERIFIED - do not trust):");
  if (result.signature) {
    lines.push(`  Function: ${result.signature} [UNVERIFIED]`);
  } else if (result.allMatches && result.allMatches.length > 0) {
    lines.push(`  Possible functions: ${result.allMatches.slice(0, 3).join(", ")} [UNVERIFIED]`);
  } else {
    lines.push("  Function: UNKNOWN");
  }
  lines.push(`  Selector: ${result.selector}`);
  if (result.source) {
    lines.push(`  Source: ${result.source} (external, unverified)`);
  }
  if (result.allMatches && result.allMatches.length > 1 && result.signature) {
    lines.push(`  Other possible matches: ${result.allMatches.slice(1, 4).join(", ")}`);
  }
  lines.push(separator());

  return lines;
}

/**
 * Format as JSON
 */
export function formatJSON(result) {
  const effect = result.effect;
  const paramAnalysis = result.paramAnalysis || {};

  // Determine the source accurately
  let source = "unknown";
  if (result.verified) {
    source = "verified_database";
  } else if (effect?.trustProfileVerified || effect?.source === "TRUST_PROFILE" || result.source === "TRUST_PROFILE") {
    source = "TRUST_PROFILE";
  } else if (result.source) {
    source = result.source;
  }

  // Create a clean JSON structure
  const output = {
    verified: result.verified,
    trustProfileVerified: effect?.trustProfileVerified || false,
    selector: result.selector,
    signature: result.signature || null,
    source: source,
    effect: effect ? {
      type: effect.effectType,
      severity: effect.severity,
      permanence: effect.permanence,
      scope: effect.scope,
      beneficiary: effect.beneficiary,
      label: effect.label || null,
      consequences: effect.consequences,
      warnings: effect.warnings,
      mitigations: effect.mitigations,
      trustWarnings: effect.trustWarnings || null,
      trustOverride: effect.trustOverride || false,
      trustProfileVerified: effect.trustProfileVerified || false,
      source: effect.source || null
    } : null,
    parameters: result.params ? serializeParams(result.params) : null,
    raw: {
      calldata: result.calldata,
      selector: result.selector
    }
  };

  // Add trust profile context if available
  if (result.trustContext) {
    const tc = result.trustContext;
    output.trustProfile = {
      profileLoaded: tc.profileLoaded,
      profileError: tc.profileError || null,
      blocked: result.trustBlocked || false,
      usedAsSemanticSource: effect?.trustProfileVerified || false,
      contract: {
        classification: tc.contractClassification,
        trustLevel: tc.trustLevel,
        label: tc.label,
        notes: tc.notes
      },
      selector: {
        classification: tc.selectorClassification,
        label: tc.selectorLabel,
        usageStats: tc.usageStats,
        labelMatchedSignature: result.signature && tc.selectorLabel ?
          extractFunctionNameForJSON(result.signature)?.toLowerCase() === tc.selectorLabel.toLowerCase() : false
      },
      warnings: tc.warnings
    };
  }

  // Add batch info if this is a batch transaction
  if (result.isBatch && result.batchInfo) {
    output.isBatch = true;
    output.batchInfo = {
      batchType: result.batchInfo.batchType,
      callCount: result.batchInfo.callCount,
      calls: result.batchInfo.calls.map(call => ({
        operation: call.operation,
        operationLabel: call.operationLabel,
        to: call.to,
        value: call.valueWei,
        data: call.data,
        dataLength: call.dataLength,
        // Include analysis if available
        analysis: call.analysis ? {
          selector: call.analysis.selector,
          signature: call.analysis.signature,
          functionName: call.analysis.functionName,
          verified: call.analysis.verified,
          trustProfileVerified: call.analysis.trustProfileVerified,
          trustBlocked: call.analysis.trustBlocked,
          effectType: call.analysis.effectType,
          severity: call.analysis.severity,
          category: call.analysis.category,
          summary: call.analysis.summary,
          isDelegatecall: call.analysis.isDelegatecall,
          isEthTransfer: call.analysis.isEthTransfer,
          error: call.analysis.error || null,
          trustContext: call.analysis.trustContext || null
        } : null
      })),
      error: result.batchInfo.error || null,
      // Include batch summary if analyzed
      batchSummary: result.batchInfo.batchSummary || null
    };
  }

  // Add Safe-specific fields if this is a Safe operation
  if (effect && isSafeEffect(effect.effectType)) {
    output.safe = {
      isSafeOperation: true,
      context: {
        isDelegateCall: paramAnalysis.isDelegateCall || false,
        operation: paramAnalysis.operation || null,
        targetAddress: paramAnalysis.targetAddress || null,
        moduleAddress: paramAnalysis.moduleAddress || null,
        guardAddress: paramAnalysis.guardAddress || null,
        handlerAddress: paramAnalysis.handlerAddress || null
      },
      powerChanges: {
        grantsAutonomousExecution: paramAnalysis.grantsAutonomousExecution || false,
        revokesAutonomousExecution: paramAnalysis.revokesAutonomousExecution || false,
        changesSigningPower: paramAnalysis.changesSigningPower || false,
        bypassesSignatures: paramAnalysis.bypassesSignatures || false,
        canBlockExecution: paramAnalysis.canBlockExecution || false
      },
      ownerChanges: paramAnalysis.newOwner || paramAnalysis.removedOwner ? {
        newOwner: paramAnalysis.newOwner || null,
        removedOwner: paramAnalysis.removedOwner || null,
        oldOwner: paramAnalysis.oldOwner || null,
        newThreshold: paramAnalysis.newThreshold ? paramAnalysis.newThreshold.toString() : null
      } : null
    };
  }

  return JSON.stringify(output, null, 2);
}

/**
 * Serialize parameters, converting BigInts to strings
 */
function serializeParams(params) {
  const serialized = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "bigint") {
      serialized[key] = value.toString();
    } else if (Array.isArray(value)) {
      serialized[key] = value.map(v => typeof v === "bigint" ? v.toString() : v);
    } else {
      serialized[key] = value;
    }
  }
  return serialized;
}

/**
 * Box drawing helpers
 */
function boxTop() {
  return "╔" + "═".repeat(BOX_WIDTH) + "╗";
}

function boxBottom() {
  return "╚" + "═".repeat(BOX_WIDTH) + "╝";
}

function boxLine(text) {
  const padding = BOX_WIDTH - text.length;
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return "║" + " ".repeat(leftPad) + text + " ".repeat(rightPad) + "║";
}

function separator() {
  return "─".repeat(BOX_WIDTH + 2);
}

/**
 * Wrap text to a maximum width
 */
function wrapText(text, maxWidth, indent = "") {
  if (text.length <= maxWidth) return text;

  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxWidth) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = indent + word;
    }
  }

  if (currentLine) lines.push(currentLine);

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// Trust Profile Formatting
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format trust context header for trusted contracts
 */
function formatTrustContextHeader(result) {
  const lines = [];
  const tc = result.trustContext;

  lines.push(boxTop());
  lines.push(boxLine("TRUST PROFILE ASSESSMENT"));
  lines.push(boxBottom());
  lines.push("");

  // Contract classification
  lines.push("TARGET CONTRACT:");
  if (tc.label) {
    lines.push(`  Label: ${tc.label}`);
  }
  if (tc.trustLevel) {
    const levelInfo = tc.trustLevelInfo;
    const checkmark = tc.contractClassification === CONTRACT_CLASSIFICATION.TRUSTED ? " ✓" : "";
    lines.push(`  Trust Level: ${tc.trustLevel}${checkmark}`);
    if (levelInfo) {
      lines.push(`    (${levelInfo.description})`);
    }
  }

  // Selector classification
  lines.push("");
  lines.push("SELECTOR ASSESSMENT:");
  if (tc.selectorLabel) {
    lines.push(`  Expected function: ${tc.selectorLabel}`);
  }
  lines.push(`  Status: ${formatSelectorStatus(tc.selectorClassification)}`);

  // Usage stats
  if (tc.usageStats) {
    lines.push(`  Previous usage: ${tc.usageStats.count} times`);
    if (tc.usageStats.lastUsed) {
      lines.push(`  Last used: ${tc.usageStats.lastUsed}`);
    }
  }

  // Trust warnings (if any, but not blocked)
  if (tc.warnings && tc.warnings.length > 0) {
    lines.push("");
    lines.push("TRUST NOTES:");
    for (const warning of tc.warnings) {
      lines.push(`  • ${warning}`);
    }
  }

  lines.push("");
  lines.push(separator());

  return lines;
}

/**
 * Format selector status for display
 */
function formatSelectorStatus(classification) {
  switch (classification) {
    case SELECTOR_CLASSIFICATION.EXPECTED:
      return "EXPECTED ✓ (commonly used with this contract)";
    case SELECTOR_CLASSIFICATION.UNUSUAL:
      return "UNUSUAL ⚠ (rarely used - verify intent)";
    case SELECTOR_CLASSIFICATION.NEVER_USED:
      return "FIRST TIME ⚠ (never used before with this contract)";
    case SELECTOR_CLASSIFICATION.NOT_ALLOWED:
      return "NOT ALLOWED ✗ (selector not in whitelist)";
    case SELECTOR_CLASSIFICATION.NO_CONTEXT:
      return "UNKNOWN (no trust context available)";
    default:
      return classification;
  }
}

/**
 * Format output when trust profile blocks interpretation
 * This is the CRITICAL case for unknown contracts
 */
function formatTrustBlockedOutput(result) {
  const lines = [];
  const tc = result.trustContext;

  // Big warning header
  lines.push("╔══════════════════════════════════════════════════════════════════════╗");
  lines.push("║  ⚠️   UNKNOWN CONTRACT - TRUST PROFILE WARNING                        ║");
  lines.push("╚══════════════════════════════════════════════════════════════════════╝");
  lines.push("");

  // Target contract info
  lines.push("TARGET CONTRACT:");
  lines.push(`  Address: ${result.targetAddress || "(not provided)"}`);
  lines.push("  Status: NOT IN TRUST PROFILE");
  lines.push("");

  // Critical explanation
  lines.push("─".repeat(72));
  lines.push("");
  lines.push("This contract is NOT part of your Safe's expected interaction set.");
  lines.push("");
  lines.push("─".repeat(72));
  lines.push("");

  // What we can determine
  lines.push("WHAT WE CAN DETERMINE:");
  lines.push(`  • Selector: ${result.selector}`);

  // Show 4byte suggestion but with strong warning
  if (result.signature && !result.verified) {
    lines.push(`  • 4byte.directory suggests: "${result.signature}"`);
    lines.push("    ⚠️  DO NOT TRUST THIS NAME - it is UNVERIFIED");
  } else if (result.verified) {
    lines.push(`  • Known selector pattern: "${result.signature}"`);
    lines.push("    ⚠️  Even verified selectors are MEANINGLESS without trusted contract");
  } else {
    lines.push("  • No matching signature found");
  }
  lines.push("");

  // Critical warning box
  lines.push("╔══════════════════════════════════════════════════════════════════════╗");
  lines.push("║  WHAT THIS MEANS                                                     ║");
  lines.push("╠══════════════════════════════════════════════════════════════════════╣");
  lines.push("║                                                                      ║");
  lines.push("║  We CANNOT tell you what this transaction does.                      ║");
  lines.push("║                                                                      ║");
  lines.push("║  The function name is MEANINGLESS without knowing the contract's     ║");
  lines.push("║  actual implementation. A function called \"withdraw\" could:          ║");
  lines.push("║                                                                      ║");
  lines.push("║    • Withdraw funds (if honest)                                      ║");
  lines.push("║    • Transfer ownership (if malicious)                               ║");
  lines.push("║    • Drain all assets (if malicious)                                 ║");
  lines.push("║    • Do literally anything else                                      ║");
  lines.push("║                                                                      ║");
  lines.push("║  Attackers deliberately use familiar function names to trick users.  ║");
  lines.push("║                                                                      ║");
  lines.push("╚══════════════════════════════════════════════════════════════════════╝");
  lines.push("");

  // Recommendations
  lines.push("BEFORE SIGNING, YOUR TEAM SHOULD:");
  lines.push("  1. Identify WHY this contract is being called");
  lines.push("  2. Review the contract source code on Etherscan/block explorer");
  lines.push("  3. Verify the contract is audited and from a trusted source");
  lines.push("  4. Add it to your trust profile if appropriate");
  lines.push("  5. If unexpected, treat as potential phishing attempt");
  lines.push("");

  // Severity
  lines.push("SEVERITY: UNKNOWN");
  lines.push("  Cannot assess risk for unknown contracts");
  lines.push("");

  // Trust warnings from classifier
  if (tc && tc.warnings && tc.warnings.length > 0) {
    lines.push("TRUST PROFILE WARNINGS:");
    for (const warning of tc.warnings) {
      lines.push(`  ⚠️  ${warning}`);
    }
    lines.push("");
  }

  // Technical details
  lines.push(separator());
  lines.push("Technical Details (DO NOT use for security decisions):");
  lines.push(`  Selector: ${result.selector}`);
  if (result.signature) {
    lines.push(`  Suggested signature: ${result.signature} [UNVERIFIED]`);
  }
  if (result.allMatches && result.allMatches.length > 1) {
    lines.push(`  Other possible matches: ${result.allMatches.slice(0, 3).join(", ")}`);
  }
  lines.push(separator());

  return lines;
}

/**
 * Format an error for display
 */
export function formatError(error, json = false) {
  if (json) {
    return JSON.stringify({
      error: true,
      message: error.message,
      type: error.name
    }, null, 2);
  }

  return `Error: ${error.message}`;
}
