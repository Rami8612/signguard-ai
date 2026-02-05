/**
 * Address Display Utilities
 *
 * Provides context-aware address formatting that maintains security:
 *
 * TECHNICAL SECTIONS (parameters, technical details):
 * - ALWAYS show full, non-abbreviated addresses
 * - No truncation, no labels substitution
 * - This is the source of truth for auditing
 *
 * HUMAN SUMMARY SECTIONS (consequences, AI explanation):
 * - Use human-readable names ONLY from trusted registry
 * - If address is NOT in registry, use generic descriptions
 * - NEVER infer symbols from calldata or external sources
 *
 * SECURITY RULES (never violate):
 * - Never infer token symbols from calldata alone
 * - Never infer token symbols from on-chain calls
 * - Never infer token symbols from external APIs
 * - Only display symbols from explicit trust profile registry
 */

import {
  getAddressLabel as _getAddressLabel,
  getTrustedAsset,
  getTrustedContract
} from "./trustProfile.js";

// Re-export getAddressLabel for use by other modules
export const getAddressLabel = _getAddressLabel;

/**
 * Display context types
 */
export const DISPLAY_CONTEXT = {
  TECHNICAL: "TECHNICAL",     // Full addresses, no labels
  HUMAN_SUMMARY: "HUMAN_SUMMARY"  // Labels from registry, generic if unknown
};

/**
 * Format an address for technical sections.
 * ALWAYS returns the full address, never truncated.
 *
 * @param {string} address - The address to format
 * @returns {string} The full address or "unknown address"
 */
export function formatAddressTechnical(address) {
  if (!address) return "unknown address";
  return address;
}

/**
 * Format an address for human summary sections.
 *
 * Rules:
 * - If address is in trustedContracts → return contract label
 * - If address is in trustedAssets → return asset symbol
 * - Otherwise → return generic description (no address shown)
 *
 * @param {string} address - The address to format
 * @param {object} profile - Trust profile
 * @param {string} genericFallback - Generic text if not in registry
 * @returns {string} Human-readable label or generic fallback
 */
export function formatAddressHuman(address, profile, genericFallback = "an address") {
  if (!address) return genericFallback;

  const labelInfo = getAddressLabel(address, profile);
  if (labelInfo) {
    return labelInfo.label;
  }

  // Not in any registry - return generic description
  return genericFallback;
}

/**
 * Format a token/asset address for human summary.
 *
 * SECURITY: Only shows symbol if in trustedAssets registry.
 *
 * @param {string} address - Token address
 * @param {object} profile - Trust profile
 * @returns {string} Token symbol or generic "tokens"
 */
export function formatTokenHuman(address, profile) {
  if (!address) return "tokens";

  const asset = getTrustedAsset(address, profile);
  if (asset && asset.symbol) {
    return asset.symbol;
  }

  // Not in trusted assets - return generic
  return "tokens";
}

/**
 * Format a recipient/beneficiary for human summary.
 *
 * @param {string} address - Recipient address
 * @param {object} profile - Trust profile
 * @returns {string} Label or generic description
 */
export function formatRecipientHuman(address, profile) {
  return formatAddressHuman(address, profile, "a recipient address");
}

/**
 * Format a spender for human summary.
 *
 * @param {string} address - Spender address
 * @param {object} profile - Trust profile
 * @returns {string} Label or generic description
 */
export function formatSpenderHuman(address, profile) {
  return formatAddressHuman(address, profile, "a spender address");
}

/**
 * Format a module address for human summary.
 *
 * @param {string} address - Module address
 * @param {object} profile - Trust profile
 * @returns {string} Label or generic description
 */
export function formatModuleHuman(address, profile) {
  return formatAddressHuman(address, profile, "a module");
}

/**
 * Format an owner address for human summary.
 *
 * @param {string} address - Owner address
 * @param {object} profile - Trust profile
 * @returns {string} Label or generic description
 */
export function formatOwnerHuman(address, profile) {
  return formatAddressHuman(address, profile, "an owner address");
}

/**
 * Check if we can show a label for an address.
 * Used to decide whether to include address details in summaries.
 *
 * @param {string} address - Address to check
 * @param {object} profile - Trust profile
 * @returns {boolean} True if we have a trusted label
 */
export function hasKnownLabel(address, profile) {
  return getAddressLabel(address, profile) !== null;
}

/**
 * Get detailed address info for display.
 * Used when we need both the label and the address.
 *
 * @param {string} address - Address to look up
 * @param {object} profile - Trust profile
 * @returns {object} { address, label?, type?, isTrusted }
 */
export function getAddressDisplayInfo(address, profile) {
  if (!address) {
    return { address: null, isTrusted: false };
  }

  const labelInfo = getAddressLabel(address, profile);
  if (labelInfo) {
    return {
      address,
      label: labelInfo.label,
      type: labelInfo.type,
      isTrusted: true,
      ...labelInfo
    };
  }

  return {
    address,
    isTrusted: false
  };
}

export default {
  DISPLAY_CONTEXT,
  formatAddressTechnical,
  formatAddressHuman,
  formatTokenHuman,
  formatRecipientHuman,
  formatSpenderHuman,
  formatModuleHuman,
  formatOwnerHuman,
  hasKnownLabel,
  getAddressDisplayInfo
};
