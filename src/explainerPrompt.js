/**
 * AI Explainer Prompt Generator
 *
 * This module generates safe, structured prompts for an AI to explain
 * transaction consequences in human-friendly language.
 *
 * SECURITY PRINCIPLES:
 * - The AI NEVER sees raw calldata or hex data
 * - The AI NEVER determines risk levels or severity
 * - The AI ONLY explains pre-analyzed, verified consequences
 * - All risk assessments are passed through as immutable facts
 * - The AI's role is TRANSLATION, not ANALYSIS
 */

/**
 * Information categories the AI can explain
 */
const EXPLAINER_CATEGORIES = {
  WHAT_CHANGES: "what_changes",
  WHO_BENEFITS: "who_benefits",
  PERMANENCE: "permanence",
  REVERSIBILITY: "reversibility"
};

/**
 * Build a safe prompt for the AI explainer
 *
 * @param {object} analysis - The structured analysis from effectAnalyzer
 * @param {object} options - Prompt generation options
 * @returns {object} Safe prompt object for AI consumption
 */
export function buildExplainerPrompt(analysis, options = {}) {
  // Validate that we have pre-analyzed data
  if (!analysis || !analysis.effect) {
    return {
      error: true,
      message: "Cannot generate explanation: no analysis provided"
    };
  }

  // CRITICAL: Check for untrusted DELEGATECALL first
  // This MUST be handled before any other logic to prevent misleading explanations
  if (analysis.isDelegatecall && analysis.effect?.delegatecallOverride) {
    return buildDelegatecallPrompt(analysis);
  }

  const { effect, verified, signature, params, trustContext, abiVerified } = analysis;

  // Check if this is a trust-profile-verified selector
  const isTrustProfileVerified = effect?.trustProfileVerified === true ||
                                  effect?.source === "TRUST_PROFILE" ||
                                  analysis.source === "TRUST_PROFILE";

  // If trust-profile-verified, use trust profile explanation flow
  if (isTrustProfileVerified) {
    return buildTrustProfilePrompt(analysis, effect, trustContext);
  }

  // Check if ABI-verified (local ABI registry has this contract's ABI)
  const isAbiVerified = abiVerified === true || analysis.abiVerified === true;

  // If unverified AND not trust-profile-verified AND not ABI-verified, return a fixed UNKNOWN response
  if (!verified && !isAbiVerified) {
    return buildUnverifiedPrompt();
  }

  // If ABI-verified but not database-verified, use ABI verification flow
  if (isAbiVerified && !verified) {
    return buildAbiVerifiedPrompt(analysis, effect, trustContext);
  }

  // Build the safe context object (no raw calldata, no hex)
  const safeContext = buildSafeContext(effect, signature, params);

  // Build the system prompt with strict boundaries
  const systemPrompt = buildSystemPrompt();

  // Build the user prompt with the safe context
  const userPrompt = buildUserPrompt(safeContext);

  return {
    system: systemPrompt,
    user: userPrompt,
    context: safeContext,
    metadata: {
      verified: true,
      effectType: effect.effectType,
      severity: effect.severity,  // Passed through, not for AI to determine
      categories: Object.values(EXPLAINER_CATEGORIES)
    }
  };
}

/**
 * Build a fixed response for unverified signatures
 * AI does not attempt to explain unknown functions
 */
function buildUnverifiedPrompt() {
  return {
    skipAI: true,
    fixedResponse: {
      summary: "## Unverified Transaction\n\nThis transaction calls a function that could not be verified.",
      what_changes: "The function signature could not be verified against known contracts. We cannot determine what will change.",
      who_benefits: "Cannot determine beneficiaries without verified function analysis.",
      permanence: "Cannot assess whether effects are temporary or permanent.",
      reversibility: "Cannot determine if this action can be undone.",
      note: "**Recommended:** Verify this transaction through the contract source code on a block explorer before signing."
    },
    metadata: {
      verified: false,
      effectType: "UNKNOWN",
      severity: "UNKNOWN"
    }
  };
}

/**
 * Build a prompt for untrusted DELEGATECALL operations.
 *
 * SECURITY: This is called when operation=1 (DELEGATECALL) and the target
 * is NOT in the trustedDelegateCalls whitelist. The AI must:
 * - NEVER speculate about what the function does
 * - ALWAYS state that calldata semantics may be misleading
 * - ALWAYS emphasize the CRITICAL risk
 * - ALWAYS recommend verification before signing
 *
 * @param {object} analysis - The analysis object with DELEGATECALL context
 * @returns {object} Prompt object with strict DELEGATECALL rules
 */
function buildDelegatecallPrompt(analysis) {
  const { effect, trustContext, signature, functionName, targetAddress } = analysis;

  // Build system prompt with strict DELEGATECALL rules
  const systemPrompt = `You are explaining a DELEGATECALL transaction. This is CRITICALLY DANGEROUS.

MANDATORY RULES - YOU MUST FOLLOW THESE:
1. State that this is a DELEGATECALL that executes code with the wallet's FULL PERMISSIONS
2. State that the displayed function name and parameters MAY BE MISLEADING
3. DO NOT speculate about what the function might do
4. DO NOT provide a "neutral" or "safe-sounding" explanation
5. DO NOT downplay the risk
6. State that this contract+selector is NOT in the trustedDelegateCalls whitelist
7. Recommend the user STOP and verify the contract before signing
8. Severity is CRITICAL - this is non-negotiable

The calldata semantics CANNOT be trusted because:
- DELEGATECALL executes the target's code in the CALLER's context
- The target can perform ANY action as if it were the wallet itself
- Function names and parameters can be crafted to look benign
- This is the exact attack vector used in the Bybit Safe hack

FORMAT REQUIREMENTS (very important for readability):
Structure your response with clear visual sections:

## CRITICAL: DELEGATECALL Detected
[Brief explanation of what DELEGATECALL means]

## Why This Is Dangerous
- [Bullet point explaining the risk]
- [Bullet point explaining the risk]
- [Additional points]

## What We Cannot Verify
[Explain why the function name/params cannot be trusted]

## Recommended Action
[Tell user to STOP and verify before signing]

FORMATTING RULES:
- Use "##" headers to separate sections
- Use bullet points "-" for lists
- Keep paragraphs short (2-3 sentences max)
- Add blank lines between sections

Your explanation must convey the extreme danger of signing this transaction.`;

  // Build user prompt with context
  const parts = [];
  parts.push("Explain this DELEGATECALL transaction:\n");
  parts.push("OPERATION TYPE: DELEGATECALL (code executes with wallet's full permissions)");
  parts.push("SEVERITY: CRITICAL (non-negotiable)");
  parts.push(`TARGET ADDRESS: ${targetAddress || "Unknown"}`);
  parts.push(`DISPLAYED FUNCTION: ${functionName || signature || "Unknown"} (MAY BE MISLEADING)`);
  parts.push("WHITELIST STATUS: NOT in trustedDelegateCalls");
  parts.push("");

  if (effect?.delegatecallWarnings?.length > 0) {
    parts.push("SECURITY WARNINGS:");
    effect.delegatecallWarnings.forEach(w => parts.push(`- ${w}`));
    parts.push("");
  }

  parts.push("MANDATORY POINTS TO COVER:");
  parts.push("1. This executes external code with the wallet's FULL permissions");
  parts.push("2. The displayed function name/params may be misleading");
  parts.push("3. The target contract is NOT whitelisted for DELEGATECALL");
  parts.push("4. Signing could result in total loss of all assets");
  parts.push("5. User should STOP and verify before signing");
  parts.push("");
  parts.push("---");
  parts.push("Use the structured format with ## headers and bullet points for readability.");

  const userPrompt = parts.join("\n");

  return {
    system: systemPrompt,
    user: userPrompt,
    context: {
      isDelegatecall: true,
      severity: "CRITICAL",
      targetAddress: targetAddress,
      displayedFunction: functionName || signature,
      whitelisted: false
    },
    metadata: {
      verified: false,
      isDelegatecall: true,
      delegatecallOverride: true,
      effectType: "DELEGATECALL_EXECUTION",
      severity: "CRITICAL",
      categories: Object.values(EXPLAINER_CATEGORIES)
    }
  };
}

/**
 * Build a prompt for ABI-verified transactions.
 *
 * These are transactions where:
 * - The contract has a local ABI file in the registry
 * - The function signature was decoded from the ABI
 * - NOT in the verified database, but ABI provides verification
 *
 * The AI should:
 * - Explain the function based on signature and parameters
 * - Acknowledge verification via local ABI
 * - NOT describe the transaction as "Unknown" or "Unverifiable"
 */
function buildAbiVerifiedPrompt(analysis, effect, trustContext) {
  const functionName = analysis.functionName ||
                       extractFunctionDescription(analysis.signature) ||
                       "function";

  const contractLabel = trustContext?.label || "contract";

  // Build safe context for ABI verification
  const safeContext = {
    // Source of verification
    verificationSource: "LOCAL_ABI",

    // Contract information
    contractLabel: contractLabel,
    trustLevel: trustContext?.trustLevel || null,

    // Function information from ABI
    functionName: functionName,
    signature: analysis.signature,

    // Action type (from effect analysis)
    actionType: mapEffectTypeToAction(effect.effectType),

    // The consequences (pre-analyzed)
    consequences: effect.consequences || [],

    // Scope of the action
    scope: mapScopeToDescription(effect.scope),

    // Permanence (from effect analysis)
    permanence: mapPermanenceToDescription(effect.permanence || "CONTEXT_DEPENDENT"),

    // Warnings (pre-determined)
    warnings: effect.warnings || [],

    // Trust warnings if available
    trustWarnings: effect.trustWarnings || [],

    // Beneficiary if known
    beneficiary: formatBeneficiaryForAI(effect.beneficiary),

    // Parameter descriptions
    parameterDescriptions: formatParametersForAI(analysis.params, effect)
  };

  // Build system prompt for ABI-verified transactions
  const systemPrompt = buildAbiVerifiedSystemPrompt();

  // Build user prompt
  const userPrompt = buildAbiVerifiedUserPrompt(safeContext);

  return {
    system: systemPrompt,
    user: userPrompt,
    context: safeContext,
    metadata: {
      verified: false,  // NOT in verified database
      abiVerified: true,  // ABI provides verification
      source: "LOCAL_ABI",
      effectType: effect.effectType,
      severity: effect.severity,
      categories: Object.values(EXPLAINER_CATEGORIES)
    }
  };
}

/**
 * Build system prompt for ABI-verified transactions.
 */
function buildAbiVerifiedSystemPrompt() {
  return `You are a transaction explainer. Your role is to explain blockchain transactions in simple, neutral language.

IMPORTANT CONTEXT:
This transaction's function was verified using the contract's ABI (Application Binary Interface).
The ABI was loaded from a local registry, meaning the function signature and parameters are known.

STRICT RULES:
1. DO NOT describe this transaction as "unknown", "unverified", or "unverifiable".
2. The function IS verified via ABI - we know what function is being called.
3. DO explain the action based on the function name and parameters.
4. DO NOT determine risk levels - severity is provided as a fact.
5. DO NOT make recommendations about whether to sign.
6. DO NOT use urgent or alarming language.
7. Explain what WILL happen based on the provided context.

ABI verification means:
- The contract's ABI file is available locally
- The function signature matches the ABI
- Parameters were decoded correctly
- This is a known function call

FORMAT REQUIREMENTS (very important for readability):
Structure your response with clear visual sections using this exact format:

## What This Transaction Does
[1-2 sentence summary of the action]

## What Changes After Signing
- [Bullet point 1]
- [Bullet point 2]
- [Additional points as needed]

## Who Benefits or Gains Control
[Explain who receives permissions, assets, or control]

## Permanence & Reversibility
[Can this be undone? How long does it last?]

## Verification
This function is verified via Local ABI Registry.

FORMATTING RULES:
- Use "##" headers to separate sections
- Use bullet points "-" for lists
- Keep paragraphs short (2-3 sentences max)
- Add blank lines between sections
- Write in plain, conversational language
- Avoid technical jargon when possible

Keep explanations concise and accessible to non-technical users.`;
}

/**
 * Build user prompt for ABI-verified transactions.
 */
function buildAbiVerifiedUserPrompt(context) {
  const parts = [];

  parts.push("Explain this ABI-VERIFIED transaction to a non-technical user:\n");

  // Verification context
  parts.push("VERIFICATION SOURCE: Local ABI Registry");
  if (context.contractLabel && context.contractLabel !== "contract") {
    parts.push(`CONTRACT: ${context.contractLabel}`);
  }
  if (context.trustLevel) {
    parts.push(`TRUST LEVEL: ${context.trustLevel}`);
  }
  parts.push(`FUNCTION: ${context.functionName}`);
  if (context.signature) {
    parts.push(`SIGNATURE: ${context.signature}`);
  }
  parts.push("");

  parts.push(`ACTION TYPE: ${context.actionType}`);
  parts.push(`SCOPE: ${context.scope}`);
  parts.push(`PERMANENCE: ${context.permanence}`);

  if (context.beneficiary) {
    parts.push(`BENEFICIARY: ${context.beneficiary.address}`);
  }

  if (context.consequences.length > 0) {
    parts.push("\nPRE-ANALYZED CONSEQUENCES:");
    context.consequences.forEach((c, i) => {
      parts.push(`${i + 1}. ${c}`);
    });
  }

  if (context.warnings.length > 0) {
    parts.push("\nIMPORTANT NOTES:");
    context.warnings.forEach((w, i) => {
      parts.push(`- ${w}`);
    });
  }

  if (context.trustWarnings && context.trustWarnings.length > 0) {
    parts.push("\nTRUST NOTES:");
    context.trustWarnings.forEach((w, i) => {
      parts.push(`- ${w}`);
    });
  }

  if (context.parameterDescriptions.length > 0) {
    parts.push("\nKEY DETAILS:");
    context.parameterDescriptions.forEach(p => {
      if (p.value) {
        parts.push(`- ${p.name}: ${p.description} (${p.value})`);
      } else {
        parts.push(`- ${p.name}: ${p.description}`);
      }
    });
  }

  parts.push("\n---");
  parts.push("Provide a well-structured explanation using the format specified in the system prompt.");
  parts.push("Remember to use ## headers, bullet points, and clear section breaks for readability.");

  return parts.join("\n");
}

/**
 * Build a prompt for trust-profile-verified selectors.
 *
 * These are selectors that:
 * - Are NOT ABI-verified (not in verified database)
 * - ARE explicitly trusted via the trust profile
 * - Have a function label from the trust profile
 *
 * The AI should:
 * - Acknowledge the contract is trusted via trust profile
 * - Explain the action based on the trust profile label
 * - Clearly state this is NOT ABI-verified
 * - NOT describe the transaction as "Unknown" or "Unverifiable"
 */
function buildTrustProfilePrompt(analysis, effect, trustContext) {
  const label = effect.label ||
                trustContext?.selectorLabel ||
                "trusted function";

  const contractLabel = trustContext?.label || "trusted contract";
  const trustLevel = trustContext?.trustLevel || "TRUSTED";

  // Build safe context for trust profile verification
  const safeContext = {
    // Source of verification
    verificationSource: "TRUST_PROFILE",

    // Contract information from trust profile
    contractLabel: contractLabel,
    trustLevel: trustLevel,

    // Function information from trust profile
    functionLabel: label,

    // Action type (from effect analysis)
    actionType: mapEffectTypeToAction(effect.effectType),

    // The consequences (pre-analyzed)
    consequences: effect.consequences || [],

    // Scope of the action
    scope: mapScopeToDescription(effect.scope),

    // Permanence (from effect analysis)
    permanence: mapPermanenceToDescription(effect.permanence || "CONTEXT_DEPENDENT"),

    // Warnings (pre-determined)
    warnings: effect.warnings || [],

    // Trust warnings
    trustWarnings: effect.trustWarnings || [],

    // Usage statistics if available
    usageStats: trustContext?.usageStats || null,

    // Beneficiary if known
    beneficiary: formatBeneficiaryForAI(effect.beneficiary),

    // Parameter descriptions if available
    parameterDescriptions: formatParametersForAI(analysis.params, effect)
  };

  // Build system prompt with trust profile awareness
  const systemPrompt = buildTrustProfileSystemPrompt();

  // Build user prompt with trust profile context
  const userPrompt = buildTrustProfileUserPrompt(safeContext);

  return {
    system: systemPrompt,
    user: userPrompt,
    context: safeContext,
    metadata: {
      verified: false,  // NOT ABI-verified
      trustProfileVerified: true,  // Trust profile provides verification
      source: "TRUST_PROFILE",
      effectType: effect.effectType,
      severity: effect.severity,
      categories: Object.values(EXPLAINER_CATEGORIES)
    }
  };
}

/**
 * Build system prompt for trust-profile-verified transactions.
 *
 * Key differences from standard prompt:
 * - Acknowledges trust profile as verification source
 * - Does NOT describe as "unknown" or "unverifiable"
 * - Clearly states NOT ABI-verified
 */
function buildTrustProfileSystemPrompt() {
  return `You are a transaction explainer. Your role is to explain blockchain transactions in simple, neutral language.

IMPORTANT CONTEXT:
This transaction targets a CONTRACT that is TRUSTED via the team's Trust Profile.
The function label comes from the Trust Profile, NOT from ABI verification.

STRICT RULES:
1. DO NOT describe this transaction as "unknown", "unverified", or "unverifiable".
2. The contract IS trusted - the Trust Profile explicitly allows this interaction.
3. The function label IS meaningful - it was configured by the team for this contract.
4. DO acknowledge that verification is via Trust Profile, NOT ABI.
5. DO explain the action based on the provided function label and consequences.
6. DO NOT determine risk levels - severity is provided as a fact.
7. DO NOT make recommendations about whether to sign.
8. DO NOT use urgent or alarming language.
9. Explain what WILL happen based on the provided context.

The Trust Profile means:
- The team has explicitly marked this contract as trusted
- The team has explicitly allowed this function selector
- The function label was configured by the team
- This is NOT a random or unknown contract

FORMAT REQUIREMENTS (very important for readability):
Structure your response with clear visual sections using this exact format:

## What This Transaction Does
[1-2 sentence summary of the action]

## What Changes After Signing
- [Bullet point 1]
- [Bullet point 2]
- [Additional points as needed]

## Who Benefits or Gains Control
[Explain who receives permissions, assets, or control]

## Permanence & Reversibility
[Can this be undone? How long does it last?]

## Verification
This function is verified via Trust Profile (not ABI verified).

FORMATTING RULES:
- Use "##" headers to separate sections
- Use bullet points "-" for lists
- Keep paragraphs short (2-3 sentences max)
- Add blank lines between sections
- Write in plain, conversational language
- Avoid technical jargon when possible

Keep explanations concise and accessible to non-technical users.`;
}

/**
 * Build user prompt for trust-profile-verified transactions.
 */
function buildTrustProfileUserPrompt(context) {
  const parts = [];

  parts.push("Explain this TRUST PROFILE VERIFIED transaction to a non-technical user:\n");

  // Trust profile context
  parts.push("VERIFICATION SOURCE: Trust Profile (NOT ABI-verified)");
  parts.push(`TRUSTED CONTRACT: ${context.contractLabel}`);
  parts.push(`TRUST LEVEL: ${context.trustLevel}`);
  parts.push(`FUNCTION: ${context.functionLabel}`);
  parts.push("");

  parts.push(`ACTION TYPE: ${context.actionType}`);
  parts.push(`SCOPE: ${context.scope}`);
  parts.push(`PERMANENCE: ${context.permanence}`);

  if (context.beneficiary) {
    parts.push(`BENEFICIARY: ${context.beneficiary.address}`);
  }

  // Usage history (adds context that this is expected)
  if (context.usageStats) {
    parts.push("");
    parts.push("USAGE HISTORY:");
    parts.push(`- Used ${context.usageStats.count} times previously`);
    if (context.usageStats.lastUsed) {
      parts.push(`- Last used: ${context.usageStats.lastUsed}`);
    }
  }

  if (context.consequences.length > 0) {
    parts.push("\nPRE-ANALYZED CONSEQUENCES:");
    context.consequences.forEach((c, i) => {
      parts.push(`${i + 1}. ${c}`);
    });
  }

  if (context.warnings.length > 0) {
    parts.push("\nIMPORTANT NOTES:");
    context.warnings.forEach((w, i) => {
      parts.push(`- ${w}`);
    });
  }

  if (context.trustWarnings && context.trustWarnings.length > 0) {
    parts.push("\nTRUST PROFILE NOTES:");
    context.trustWarnings.forEach((w, i) => {
      parts.push(`- ${w}`);
    });
  }

  if (context.parameterDescriptions.length > 0) {
    parts.push("\nKEY DETAILS:");
    context.parameterDescriptions.forEach(p => {
      if (p.value) {
        parts.push(`- ${p.name}: ${p.description} (${p.value})`);
      } else {
        parts.push(`- ${p.name}: ${p.description}`);
      }
    });
  }

  parts.push("\n---");
  parts.push("Provide a well-structured explanation using the format specified in the system prompt.");
  parts.push("Remember to use ## headers, bullet points, and clear section breaks for readability.");

  return parts.join("\n");
}

/**
 * Build a safe context object that contains NO raw data
 * Only pre-analyzed, human-readable information
 */
function buildSafeContext(effect, signature, params) {
  const context = {
    // What type of action this is (pre-determined, not for AI to decide)
    actionType: mapEffectTypeToAction(effect.effectType),

    // The consequences (pre-analyzed)
    consequences: effect.consequences || [],

    // Who benefits (pre-analyzed address, formatted)
    beneficiary: formatBeneficiaryForAI(effect.beneficiary),

    // Scope of the action
    scope: mapScopeToDescription(effect.scope),

    // Permanence (pre-determined)
    permanence: mapPermanenceToDescription(effect.permanence),

    // Warnings (pre-determined, AI just needs to incorporate)
    warnings: effect.warnings || [],

    // Function name only (no parameters with raw values)
    functionDescription: extractFunctionDescription(signature),

    // Safe parameter descriptions (no raw hex, amounts formatted)
    parameterDescriptions: formatParametersForAI(params, effect)
  };

  return context;
}

/**
 * Map effect types to human-friendly action descriptions
 */
function mapEffectTypeToAction(effectType) {
  const actionMap = {
    PERMISSION_GRANT: "granting permission to another address",
    PERMISSION_REVOKE: "removing a previously granted permission",
    ASSET_TRANSFER: "moving assets",
    CONTROL_TRANSFER: "transferring control of a contract",
    UPGRADE_AUTHORITY: "changing contract code",
    EXECUTION_GRANT: "granting execution rights",
    BATCH_OPERATION: "executing multiple operations",
    UNKNOWN: "performing an unknown action",

    // Trust Profile semantic action
    TRUST_PROFILE_SEMANTIC: "performing a trusted action (identified via trust profile)",

    // Safe/Gnosis Multisig action descriptions
    SAFE_EXECUTION: "executing a transaction from a Safe multisig wallet",
    SAFE_MODULE_CHANGE: "changing which modules can control the Safe",
    SAFE_MODULE_EXECUTION: "a module executing a transaction without signatures",
    SAFE_OWNER_CHANGE: "changing who has signing authority on the Safe",
    SAFE_THRESHOLD_CHANGE: "changing how many signatures are required",
    SAFE_FALLBACK_CHANGE: "changing how the Safe handles unknown calls",
    SAFE_GUARD_CHANGE: "changing or removing the transaction guard"
  };
  return actionMap[effectType] || "performing an action";
}

/**
 * Format beneficiary address for AI (just pass through, no lookup needed)
 */
function formatBeneficiaryForAI(beneficiary) {
  if (!beneficiary) {
    return null;
  }
  return {
    address: beneficiary,
    // Note: Known address names would be added here by the caller
    // AI doesn't look up addresses
  };
}

/**
 * Map scope to human description
 */
function mapScopeToDescription(scope) {
  const scopeMap = {
    UNLIMITED: "unlimited - no restrictions on amount",
    LIMITED: "limited to a specific amount",
    SINGLE_TOKEN: "a single specific token",
    BATCH: "multiple tokens in a batch",
    FULL_CONTROL: "complete administrative control",
    CONTRACT_LOGIC: "the contract's code and behavior",
    MULTIPLE_CALLS: "multiple function calls bundled together",
    SWAP: "a token exchange",
    LIQUIDITY_PROVISION: "adding to a liquidity pool",
    LIQUIDITY_REMOVAL: "removing from a liquidity pool",
    WRAP: "converting ETH to wrapped ETH",
    UNWRAP: "converting wrapped ETH to ETH",
    SIGNER_ADDITION: "adding a new authorized signer",
    SIGNER_REMOVAL: "removing an authorized signer",
    SIGNER_REPLACEMENT: "replacing an authorized signer",
    THRESHOLD_CHANGE: "changing signature requirements",
    UNKNOWN: "unknown scope",

    // Trust Profile scope
    TRUST_PROFILE_INFERRED: "inferred from trust profile label",

    // Safe/Gnosis Multisig scopes
    SAFE_EXEC: "executing a transaction from the Safe",
    MODULE_ENABLE: "enabling a module with autonomous execution power",
    MODULE_DISABLE: "disabling a module's execution power",
    MODULE_EXEC: "module-initiated execution (no signatures required)",
    FALLBACK_HANDLER: "changing how unknown calls are handled",
    GUARD_CHANGE: "changing the transaction validation guard"
  };
  return scopeMap[scope] || scope || "unspecified scope";
}

/**
 * Map permanence to human description
 */
function mapPermanenceToDescription(permanence) {
  const permanenceMap = {
    PERMANENT_UNTIL_REVOKED: "This remains in effect until you explicitly revoke it.",
    IMMEDIATE: "This takes effect immediately upon confirmation.",
    IMMEDIATE_IRREVERSIBLE: "This takes effect immediately and cannot be undone.",
    PERMANENT: "This is permanent and cannot be reversed.",
    PERMANENT_UNTIL_CHANGED: "This remains in effect until explicitly changed by owners.",
    VARIES: "The permanence depends on the specific operations involved.",
    CONTEXT_DEPENDENT: "Permanence depends on the specific function behavior.",
    UNKNOWN: "The permanence of this action is unknown."
  };
  return permanenceMap[permanence] || "Permanence is unspecified.";
}

/**
 * Extract just the function name and type info (no raw signature)
 */
function extractFunctionDescription(signature) {
  if (!signature) return null;

  const match = signature.match(/^(\w+)\(/);
  if (!match) return null;

  return match[1]; // Just the function name
}

/**
 * Format parameters in a safe way for AI consumption
 * No raw hex values, amounts formatted appropriately
 */
function formatParametersForAI(params, effect) {
  if (!params) return [];

  const descriptions = [];

  for (const [name, value] of Object.entries(params)) {
    const desc = formatSingleParameter(name, value, effect);
    if (desc) {
      descriptions.push(desc);
    }
  }

  return descriptions;
}

/**
 * Format a single parameter safely
 */
function formatSingleParameter(name, value, effect) {
  // Skip raw byte data entirely
  if (typeof value === "string" && value.startsWith("0x") && value.length > 42) {
    return {
      name,
      description: "additional data (not shown)"
    };
  }

  // Format addresses
  if (typeof value === "string" && value.startsWith("0x") && value.length === 42) {
    return {
      name,
      description: `an Ethereum address`,
      value: value
    };
  }

  // Format BigInt amounts
  if (typeof value === "bigint") {
    const isMax = value === BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    if (isMax) {
      return {
        name,
        description: "unlimited amount (maximum possible value)"
      };
    }
    if (value === BigInt(0)) {
      return {
        name,
        description: "zero (often used to revoke permissions)"
      };
    }
    return {
      name,
      description: `a specific amount`,
      value: value.toString()
    };
  }

  // Format booleans
  if (typeof value === "boolean") {
    return {
      name,
      description: value ? "enabled/approved" : "disabled/revoked"
    };
  }

  // Format arrays (like swap paths)
  if (Array.isArray(value)) {
    return {
      name,
      description: `a list of ${value.length} items`
    };
  }

  return {
    name,
    description: String(value)
  };
}

/**
 * Build the system prompt that constrains the AI's behavior
 */
function buildSystemPrompt() {
  return `You are a transaction explainer. Your ONLY role is to explain the consequences of blockchain transactions in simple, neutral language.

STRICT RULES:
1. You explain ONLY what is provided in the context. Do not speculate or add information.
2. You NEVER determine risk levels - severity is provided as a fact, not for you to assess.
3. You NEVER make recommendations about whether to sign or not sign.
4. You NEVER use urgent language ("Act now!", "Warning!", "Danger!").
5. You NEVER claim authority ("As an expert...", "Trust me...").
6. You provide factual, neutral explanations only.
7. You explain what WILL happen, who WILL benefit, and whether it CAN be reversed.
8. You do not see raw transaction data - only pre-analyzed consequences.

FORMAT REQUIREMENTS (very important for readability):
Structure your response with clear visual sections using this exact format:

## What This Transaction Does
[1-2 sentence summary of the action]

## What Changes After Signing
- [Bullet point 1]
- [Bullet point 2]
- [Additional points as needed]

## Who Benefits or Gains Control
[Explain who receives permissions, assets, or control]

## Permanence & Reversibility
[Can this be undone? How long does it last?]

FORMATTING RULES:
- Use "##" headers to separate sections
- Use bullet points "-" for lists
- Keep paragraphs short (2-3 sentences max)
- Add blank lines between sections
- Write in plain, conversational language
- Avoid technical jargon when possible

Keep explanations concise and accessible to non-technical users.`;
}

/**
 * Build the user prompt with the safe context
 */
function buildUserPrompt(context) {
  const parts = [];

  parts.push("Explain this transaction to a non-technical user:\n");

  parts.push(`ACTION TYPE: ${context.actionType}`);
  parts.push(`SCOPE: ${context.scope}`);
  parts.push(`PERMANENCE: ${context.permanence}`);

  if (context.beneficiary) {
    parts.push(`BENEFICIARY: ${context.beneficiary.address}`);
  }

  if (context.consequences.length > 0) {
    parts.push("\nPRE-ANALYZED CONSEQUENCES:");
    context.consequences.forEach((c, i) => {
      parts.push(`${i + 1}. ${c}`);
    });
  }

  if (context.warnings.length > 0) {
    parts.push("\nFACTS TO INCORPORATE:");
    context.warnings.forEach((w, i) => {
      parts.push(`- ${w}`);
    });
  }

  if (context.parameterDescriptions.length > 0) {
    parts.push("\nKEY DETAILS:");
    context.parameterDescriptions.forEach(p => {
      if (p.value) {
        parts.push(`- ${p.name}: ${p.description} (${p.value})`);
      } else {
        parts.push(`- ${p.name}: ${p.description}`);
      }
    });
  }

  parts.push("\n---");
  parts.push("Provide a well-structured explanation using the format specified in the system prompt.");
  parts.push("Remember to use ## headers, bullet points, and clear section breaks for readability.");

  return parts.join("\n");
}

/**
 * Validate that a prompt is safe before sending to AI
 * Returns true if safe, false if contains forbidden content
 */
export function validatePromptSafety(prompt) {
  const issues = [];

  // Check for raw hex data (calldata)
  if (typeof prompt.user === "string") {
    // Look for long hex strings that might be calldata
    const hexPattern = /0x[a-fA-F0-9]{20,}/g;
    const matches = prompt.user.match(hexPattern);
    if (matches) {
      // Allow addresses (42 chars) but flag longer hex
      const longHex = matches.filter(m => m.length > 42);
      if (longHex.length > 0) {
        issues.push("Contains raw hex data longer than an address");
      }
    }
  }

  // Check that severity is not in the user prompt (AI shouldn't assess it)
  if (prompt.user && /severity|risk level|danger level/i.test(prompt.user)) {
    // This is OK if it's stating a fact, not asking for assessment
    // The system prompt handles this constraint
  }

  return {
    safe: issues.length === 0,
    issues
  };
}

// Export categories for external use
export { EXPLAINER_CATEGORIES };
