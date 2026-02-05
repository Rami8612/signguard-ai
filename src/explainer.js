/**
 * Explainer Integration Layer
 *
 * Connects the decoder analysis with the AI explainer.
 * This module orchestrates the flow:
 *   1. Takes decoded analysis
 *   2. Builds safe prompt (no raw calldata)
 *   3. Calls AI for human-friendly explanation
 *   4. Formats final output
 */

import { buildExplainerPrompt, validatePromptSafety } from "./explainerPrompt.js";
import { generateExplanation, hasApiKey } from "./aiClient.js";
import { lookupAddress } from "./selectors.js";

/**
 * Generate a human-friendly explanation for a decoded transaction
 *
 * @param {object} analysis - Decoded analysis from decode()
 * @param {object} options - Options
 * @param {boolean} options.skipAI - If true, return prompt without calling AI
 * @returns {object} Explanation result
 */
export async function explain(analysis, options = {}) {
  // Enrich analysis with known address names
  const enrichedAnalysis = enrichWithKnownAddresses(analysis);

  // Build the safe prompt
  const prompt = buildExplainerPrompt(enrichedAnalysis, options);

  // If prompt indicates to skip AI (unverified AND not trust-profile-verified)
  if (prompt.skipAI) {
    return {
      success: true,
      verified: false,
      trustProfileVerified: false,
      explanation: prompt.fixedResponse,
      severity: prompt.metadata.severity
    };
  }

  // If error building prompt
  if (prompt.error) {
    return {
      success: false,
      error: prompt.message
    };
  }

  // If --skipAI flag, return the prompt for inspection
  if (options.skipAI) {
    return {
      success: true,
      verified: prompt.metadata.verified,
      abiVerified: prompt.metadata.abiVerified || false,
      trustProfileVerified: prompt.metadata.trustProfileVerified || false,
      source: prompt.metadata.source || (prompt.metadata.verified ? "verified_database" : "unknown"),
      promptOnly: true,
      prompt: prompt,
      severity: prompt.metadata.severity
    };
  }

  // Check for API key
  if (!hasApiKey()) {
    return {
      success: false,
      error: "NO_API_KEY",
      message: "Set OPENROUTER_API_KEY environment variable to enable AI explanations",
      fallback: buildFallbackExplanation(enrichedAnalysis)
    };
  }

  // Generate AI explanation
  // Note: Don't pass apiKey here - let generateExplanation pick the correct key based on provider
  const result = await generateExplanation(prompt, {
    provider: options.provider,
    model: options.model
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      message: result.message,
      fallback: buildFallbackExplanation(enrichedAnalysis)
    };
  }

  return {
    success: true,
    verified: prompt.metadata.verified,
    abiVerified: prompt.metadata.abiVerified || false,
    trustProfileVerified: prompt.metadata.trustProfileVerified || false,
    source: prompt.metadata.source || (prompt.metadata.verified ? "verified_database" : "unknown"),
    explanation: result.explanation,
    severity: prompt.metadata.severity,
    model: result.model
  };
}

/**
 * Enrich analysis with known address names
 */
function enrichWithKnownAddresses(analysis) {
  const enriched = { ...analysis };

  if (analysis.effect?.beneficiary) {
    const known = lookupAddress(analysis.effect.beneficiary);
    if (known) {
      enriched.knownBeneficiary = known;
    }
  }

  return enriched;
}

/**
 * Build a fallback explanation when AI is not available
 * Uses the pre-analyzed consequences directly
 */
function buildFallbackExplanation(analysis) {
  const { effect, signature, verified, trustContext, abiVerified } = analysis;

  // Check if this is trust-profile-verified
  const isTrustProfileVerified = effect?.trustProfileVerified === true ||
                                  effect?.source === "TRUST_PROFILE" ||
                                  analysis.source === "TRUST_PROFILE";

  // Check if this is ABI-verified
  const isAbiVerified = abiVerified === true || analysis.abiVerified === true;

  // For truly unknown transactions (not verified AND not trust-profile-verified AND not ABI-verified)
  if (!verified && !isTrustProfileVerified && !isAbiVerified) {
    return {
      summary: "Unable to explain this transaction.",
      details: "The function signature could not be verified."
    };
  }

  // Handle trust-profile-verified transactions
  if (isTrustProfileVerified && !verified) {
    return buildTrustProfileFallback(analysis, effect, trustContext);
  }

  // Handle ABI-verified transactions
  if (isAbiVerified && !verified) {
    return buildAbiVerifiedFallback(analysis, effect, trustContext);
  }

  // Standard verified fallback
  const parts = [];

  // Summary based on effect type
  parts.push("## What This Transaction Does");
  parts.push(getEffectSummary(effect.effectType));

  // Consequences
  if (effect.consequences?.length > 0) {
    parts.push("");
    parts.push("## What Changes After Signing");
    effect.consequences.forEach(c => parts.push(`- ${c}`));
  }

  // Beneficiary
  if (effect.beneficiary) {
    const known = lookupAddress(effect.beneficiary);
    parts.push("");
    parts.push("## Who Benefits or Gains Control");
    if (known) {
      parts.push(`**${known.name}** (${effect.beneficiary})`);
    } else {
      parts.push(`Address: ${effect.beneficiary}`);
    }
  }

  // Permanence
  if (effect.permanence) {
    parts.push("");
    parts.push("## Permanence & Reversibility");
    parts.push(getPermanenceDescription(effect.permanence));
  }

  return {
    summary: getEffectSummary(effect.effectType),
    text: parts.join("\n")
  };
}

/**
 * Build fallback explanation for trust-profile-verified transactions.
 * Does NOT describe as "unknown" - the trust profile provides verification.
 */
function buildTrustProfileFallback(analysis, effect, trustContext) {
  const parts = [];

  const label = effect.label ||
                trustContext?.selectorLabel ||
                "trusted function";
  const contractLabel = trustContext?.label || "trusted contract";
  const trustLevel = trustContext?.trustLevel || "TRUSTED";

  // Summary acknowledging trust profile verification
  parts.push("## What This Transaction Does");
  parts.push(`This transaction calls the **"${label}"** function on **${contractLabel}**.`);

  // Verification info
  parts.push("");
  parts.push("## Verification");
  parts.push(`- **Source:** Trust Profile (not ABI-verified)`);
  parts.push(`- **Trust Level:** ${trustLevel}`);

  // Usage history adds confidence
  if (trustContext?.usageStats) {
    parts.push(`- **Previously used:** ${trustContext.usageStats.count} times`);
  }

  // Consequences
  if (effect.consequences?.length > 0) {
    parts.push("");
    parts.push("## What Changes After Signing");
    effect.consequences.forEach(c => parts.push(`- ${c}`));
  }

  // Beneficiary
  if (effect.beneficiary) {
    const known = lookupAddress(effect.beneficiary);
    parts.push("");
    parts.push("## Who Benefits or Gains Control");
    if (known) {
      parts.push(`**${known.name}** (${effect.beneficiary})`);
    } else {
      parts.push(`Address: ${effect.beneficiary}`);
    }
  }

  // Permanence
  if (effect.permanence) {
    parts.push("");
    parts.push("## Permanence & Reversibility");
    parts.push(getPermanenceDescription(effect.permanence));
  }

  // Trust profile note
  parts.push("");
  parts.push("## Note");
  parts.push("This interpretation is based on your trust profile configuration, not ABI verification. The contract and selector are explicitly trusted.");

  return {
    summary: `Calls "${label}" on ${contractLabel} (Trust Profile verified)`,
    text: parts.join("\n"),
    source: "TRUST_PROFILE"
  };
}

/**
 * Build fallback explanation for ABI-verified transactions.
 * Does NOT describe as "unknown" - the ABI provides verification.
 */
function buildAbiVerifiedFallback(analysis, effect, trustContext) {
  const parts = [];

  const functionName = analysis.functionName ||
                       (analysis.signature ? analysis.signature.split('(')[0] : null) ||
                       "function";
  const contractLabel = trustContext?.label || "the contract";

  // Summary acknowledging ABI verification
  parts.push("## What This Transaction Does");
  parts.push(`This transaction calls the **"${functionName}"** function on **${contractLabel}**.`);

  // Verification info
  parts.push("");
  parts.push("## Verification");
  parts.push(`- **Source:** Local ABI Registry`);

  if (trustContext?.trustLevel) {
    parts.push(`- **Trust Level:** ${trustContext.trustLevel}`);
  }

  // Consequences
  if (effect.consequences?.length > 0) {
    parts.push("");
    parts.push("## What Changes After Signing");
    effect.consequences.forEach(c => parts.push(`- ${c}`));
  }

  // Beneficiary
  if (effect.beneficiary) {
    const known = lookupAddress(effect.beneficiary);
    parts.push("");
    parts.push("## Who Benefits or Gains Control");
    if (known) {
      parts.push(`**${known.name}** (${effect.beneficiary})`);
    } else {
      parts.push(`Address: ${effect.beneficiary}`);
    }
  }

  // Permanence
  if (effect.permanence) {
    parts.push("");
    parts.push("## Permanence & Reversibility");
    parts.push(getPermanenceDescription(effect.permanence));
  }

  // ABI note
  parts.push("");
  parts.push("## Note");
  parts.push("This interpretation is based on the contract's ABI from the local registry. The function signature and parameters were decoded from the ABI.");

  return {
    summary: `Calls "${functionName}" on ${contractLabel} (ABI verified)`,
    text: parts.join("\n"),
    source: "LOCAL_ABI"
  };
}

/**
 * Get a summary for an effect type
 */
function getEffectSummary(effectType) {
  const summaries = {
    PERMISSION_GRANT: "This transaction grants permission to another address.",
    PERMISSION_REVOKE: "This transaction removes a previously granted permission.",
    ASSET_TRANSFER: "This transaction moves assets.",
    CONTROL_TRANSFER: "This transaction transfers control of a contract.",
    UPGRADE_AUTHORITY: "This transaction changes contract code.",
    EXECUTION_GRANT: "This transaction grants execution rights.",
    BATCH_OPERATION: "This transaction executes multiple operations.",
    TRUST_PROFILE_SEMANTIC: "This transaction calls a trusted function (identified via trust profile).",
    UNKNOWN: "This transaction performs an unknown action."
  };
  return summaries[effectType] || summaries.UNKNOWN;
}

/**
 * Get a description for permanence
 */
function getPermanenceDescription(permanence) {
  const descriptions = {
    PERMANENT_UNTIL_REVOKED: "This remains active until you explicitly revoke it.",
    IMMEDIATE: "This takes effect immediately.",
    IMMEDIATE_IRREVERSIBLE: "This takes effect immediately and cannot be undone.",
    PERMANENT: "This is permanent.",
    PERMANENT_UNTIL_CHANGED: "This remains in effect until explicitly changed.",
    VARIES: "Permanence varies by operation.",
    CONTEXT_DEPENDENT: "Permanence depends on the specific function behavior.",
    UNKNOWN: "Permanence is unknown."
  };
  return descriptions[permanence] || descriptions.UNKNOWN;
}

/**
 * Format an explanation for display
 */
export function formatExplanation(result, options = {}) {
  const lines = [];

  if (!result.success) {
    lines.push("AI EXPLANATION UNAVAILABLE");
    lines.push("");
    if (result.message) {
      lines.push(result.message);
    }
    if (result.fallback) {
      lines.push("");
      lines.push("Fallback explanation:");
      lines.push(result.fallback.text || result.fallback.summary);
    }
    return lines.join("\n");
  }

  // Header
  lines.push("┌─────────────────────────────────────────────────────────────────┐");
  lines.push("│                     PLAIN ENGLISH EXPLANATION                   │");
  lines.push("└─────────────────────────────────────────────────────────────────┘");
  lines.push("");

  // Verification status - handle different verification sources
  if (result.trustProfileVerified) {
    lines.push("VERIFICATION: Trust Profile (not database-verified)");
    lines.push("");
  } else if (result.abiVerified) {
    lines.push("VERIFICATION: Local ABI Registry");
    lines.push("");
  } else if (!result.verified) {
    lines.push("⚠️  UNVERIFIED TRANSACTION");
    lines.push("");
  }

  // Main explanation
  if (result.explanation) {
    if (result.explanation.text) {
      // AI-generated
      lines.push(result.explanation.text);
    } else if (result.explanation.summary) {
      // Fixed response for unverified or trust profile fallback
      lines.push(result.explanation.summary);
      lines.push("");

      if (result.explanation.what_changes) {
        lines.push("## What Changes");
        lines.push(result.explanation.what_changes);
        lines.push("");
      }

      if (result.explanation.who_benefits) {
        lines.push("## Who Benefits");
        lines.push(result.explanation.who_benefits);
        lines.push("");
      }

      if (result.explanation.permanence) {
        lines.push("## Permanence");
        lines.push(result.explanation.permanence);
        lines.push("");
      }

      if (result.explanation.reversibility) {
        lines.push("## Reversibility");
        lines.push(result.explanation.reversibility);
        lines.push("");
      }

      if (result.explanation.note) {
        lines.push("## Note");
        lines.push(result.explanation.note);
      }
    }
  }

  // Severity (stated as fact, not AI-determined)
  lines.push("");
  lines.push("─".repeat(65));
  lines.push(`Pre-assessed severity: ${result.severity}`);

  // Source indication
  if (result.source === "TRUST_PROFILE" || result.trustProfileVerified) {
    lines.push("Verification source: TRUST_PROFILE");
  } else if (result.source === "LOCAL_ABI" || result.abiVerified) {
    lines.push("Verification source: LOCAL_ABI");
  } else if (result.verified) {
    lines.push("Verification source: ABI-verified database");
  }

  if (result.model) {
    lines.push(`Explanation by: ${result.model}`);
  }

  return lines.join("\n");
}
