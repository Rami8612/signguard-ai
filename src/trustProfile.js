/**
 * Trust Profile Management
 *
 * Loads and validates Safe-specific trust profiles that define
 * which contracts and selectors are expected for a given Safe.
 *
 * SECURITY PRINCIPLE: Trust is anchored on CONTRACT ADDRESSES, not selectors.
 * Selectors are only meaningful in the context of a trusted contract.
 */

import { readFileSync, existsSync } from "fs";
import { dirname, resolve } from "path";

/**
 * Trust levels for contracts
 */
export const TRUST_LEVELS = {
  INTERNAL: {
    level: 4,
    label: "INTERNAL",
    description: "Team-controlled contract - highest trust"
  },
  PROTOCOL: {
    level: 3,
    label: "PROTOCOL",
    description: "Verified DeFi protocol - high trust, selector-restricted"
  },
  PARTNER: {
    level: 2,
    label: "PARTNER",
    description: "Known external party - medium trust, selector-restricted"
  },
  WATCHED: {
    level: 1,
    label: "WATCHED",
    description: "Recognized but not trusted - informational only"
  }
};

/**
 * Load a trust profile from a JSON file
 *
 * @param {string} profilePath - Path to the profile JSON file
 * @returns {object|null} Parsed and validated profile, or null if invalid
 */
export function loadProfile(profilePath) {
  try {
    if (!existsSync(profilePath)) {
      return { error: `Profile file not found: ${profilePath}` };
    }

    const content = readFileSync(profilePath, "utf-8");
    const profile = JSON.parse(content);

    // Validate profile structure
    const validation = validateProfile(profile);
    if (!validation.valid) {
      return { error: validation.error };
    }

    // Normalize addresses to lowercase for consistent comparison
    return normalizeProfile(profile);
  } catch (error) {
    return { error: `Failed to load profile: ${error.message}` };
  }
}

/**
 * Validate profile structure
 */
function validateProfile(profile) {
  if (!profile || typeof profile !== "object") {
    return { valid: false, error: "Profile must be an object" };
  }

  if (!profile.version) {
    return { valid: false, error: "Profile must have a version field" };
  }

  if (!profile.trustedContracts || typeof profile.trustedContracts !== "object") {
    return { valid: false, error: "Profile must have trustedContracts object" };
  }

  // Validate each trusted contract entry
  for (const [address, config] of Object.entries(profile.trustedContracts)) {
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return { valid: false, error: `Invalid contract address: ${address}` };
    }

    if (!config.label || typeof config.label !== "string") {
      return { valid: false, error: `Contract ${address} must have a label` };
    }

    if (!config.trustLevel || !TRUST_LEVELS[config.trustLevel]) {
      return {
        valid: false,
        error: `Contract ${address} has invalid trustLevel. Must be one of: ${Object.keys(TRUST_LEVELS).join(", ")}`
      };
    }

    // allowedSelectors must be "*" (all) or an array of selectors
    if (config.allowedSelectors !== "*" && !Array.isArray(config.allowedSelectors)) {
      return {
        valid: false,
        error: `Contract ${address} allowedSelectors must be "*" or an array of selector strings`
      };
    }

    if (Array.isArray(config.allowedSelectors)) {
      for (const selector of config.allowedSelectors) {
        if (!selector.match(/^0x[a-fA-F0-9]{8}$/)) {
          return { valid: false, error: `Invalid selector ${selector} for contract ${address}` };
        }
      }
    }
  }

  // Validate trustedDelegateCalls if present
  if (profile.trustedDelegateCalls !== undefined) {
    if (typeof profile.trustedDelegateCalls !== "object" || profile.trustedDelegateCalls === null) {
      return { valid: false, error: "trustedDelegateCalls must be an object" };
    }
    for (const [address, config] of Object.entries(profile.trustedDelegateCalls)) {
      if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
        return { valid: false, error: `Invalid address in trustedDelegateCalls: ${address}` };
      }
      if (!config.allowedSelectors || !Array.isArray(config.allowedSelectors)) {
        return { valid: false, error: `trustedDelegateCalls ${address} must have allowedSelectors array` };
      }
      for (const selector of config.allowedSelectors) {
        if (!selector.match(/^0x[a-fA-F0-9]{8}$/)) {
          return { valid: false, error: `Invalid selector ${selector} in trustedDelegateCalls` };
        }
      }
    }
  }

  return { valid: true };
}

/**
 * Normalize profile addresses to lowercase
 */
function normalizeProfile(profile) {
  const normalized = {
    ...profile,
    safeAddress: profile.safeAddress?.toLowerCase(),
    trustedContracts: {},
    trustedAssets: {},
    selectorUsageHistory: {}
  };

  // Normalize trusted contracts
  for (const [address, config] of Object.entries(profile.trustedContracts)) {
    const normalizedAddress = address.toLowerCase();
    normalized.trustedContracts[normalizedAddress] = {
      ...config,
      allowedSelectors: config.allowedSelectors === "*"
        ? "*"
        : config.allowedSelectors.map(s => s.toLowerCase()),
      allowedSelectorsLabels: config.allowedSelectorsLabels
        ? normalizeSelectorsLabels(config.allowedSelectorsLabels)
        : {}
    };
  }

  // Normalize trusted assets if present
  if (profile.trustedAssets) {
    for (const [address, asset] of Object.entries(profile.trustedAssets)) {
      const normalizedAddress = address.toLowerCase();
      normalized.trustedAssets[normalizedAddress] = { ...asset };
    }
  }

  // Normalize usage history if present
  if (profile.selectorUsageHistory) {
    for (const [address, selectors] of Object.entries(profile.selectorUsageHistory)) {
      const normalizedAddress = address.toLowerCase();
      normalized.selectorUsageHistory[normalizedAddress] = {};
      for (const [selector, usage] of Object.entries(selectors)) {
        normalized.selectorUsageHistory[normalizedAddress][selector.toLowerCase()] = usage;
      }
    }
  }

  // Normalize trustedDelegateCalls if present
  normalized.trustedDelegateCalls = {};
  if (profile.trustedDelegateCalls) {
    for (const [address, config] of Object.entries(profile.trustedDelegateCalls)) {
      normalized.trustedDelegateCalls[address.toLowerCase()] = {
        ...config,
        allowedSelectors: config.allowedSelectors.map(s => s.toLowerCase())
      };
    }
  }

  return normalized;
}

/**
 * Normalize selector labels object
 */
function normalizeSelectorsLabels(labels) {
  const normalized = {};
  for (const [selector, label] of Object.entries(labels)) {
    normalized[selector.toLowerCase()] = label;
  }
  return normalized;
}

/**
 * Create an empty profile template
 *
 * @param {string} safeAddress - The Safe address this profile is for
 * @returns {object} Empty profile template
 */
export function createEmptyProfile(safeAddress) {
  return {
    safeAddress: safeAddress,
    version: "1.0",
    description: "Trust profile for Safe multisig. Define trusted contracts and allowed selectors.",
    trustedContracts: {
      "0x0000000000000000000000000000000000000000": {
        label: "Example Contract (replace this)",
        trustLevel: "PROTOCOL",
        allowedSelectors: ["0x00000000"],
        allowedSelectorsLabels: {
          "0x00000000": "exampleFunction"
        },
        notes: "Add notes about why this contract is trusted"
      }
    },
    selectorUsageHistory: {}
  };
}

/**
 * Check if a contract is in the trust profile
 *
 * @param {string} address - Contract address to check
 * @param {object} profile - Trust profile
 * @returns {object|null} Contract config if trusted, null otherwise
 */
export function getTrustedContract(address, profile) {
  if (!profile || !profile.trustedContracts || !address) {
    return null;
  }

  const normalizedAddress = address.toLowerCase();
  return profile.trustedContracts[normalizedAddress] || null;
}

/**
 * Check if a selector is allowed for a trusted contract
 *
 * @param {string} address - Contract address
 * @param {string} selector - Function selector
 * @param {object} profile - Trust profile
 * @returns {object} { allowed: boolean, reason: string }
 */
export function isSelectorAllowed(address, selector, profile) {
  const contract = getTrustedContract(address, profile);

  if (!contract) {
    return {
      allowed: false,
      reason: "CONTRACT_NOT_TRUSTED",
      description: "Contract is not in trust profile"
    };
  }

  // Check if all selectors are allowed
  if (contract.allowedSelectors === "*") {
    return {
      allowed: true,
      reason: "ALL_SELECTORS_ALLOWED",
      description: "All selectors are allowed for this contract"
    };
  }

  // Check if specific selector is in the allowed list
  const normalizedSelector = selector.toLowerCase();
  if (contract.allowedSelectors.includes(normalizedSelector)) {
    return {
      allowed: true,
      reason: "SELECTOR_WHITELISTED",
      description: "Selector is in the allowed list"
    };
  }

  return {
    allowed: false,
    reason: "SELECTOR_NOT_ALLOWED",
    description: "Selector is not in the allowed list for this contract"
  };
}

/**
 * Get selector usage history for a contract
 *
 * @param {string} address - Contract address
 * @param {string} selector - Function selector
 * @param {object} profile - Trust profile
 * @returns {object|null} Usage stats or null if no history
 */
export function getSelectorUsage(address, selector, profile) {
  if (!profile || !profile.selectorUsageHistory) {
    return null;
  }

  const normalizedAddress = address.toLowerCase();
  const normalizedSelector = selector.toLowerCase();

  const contractHistory = profile.selectorUsageHistory[normalizedAddress];
  if (!contractHistory) {
    return null;
  }

  return contractHistory[normalizedSelector] || null;
}

/**
 * Get the label for a selector on a trusted contract
 *
 * @param {string} address - Contract address
 * @param {string} selector - Function selector
 * @param {object} profile - Trust profile
 * @returns {string|null} Selector label or null
 */
export function getSelectorLabel(address, selector, profile) {
  const contract = getTrustedContract(address, profile);
  if (!contract || !contract.allowedSelectorsLabels) {
    return null;
  }

  const normalizedSelector = selector.toLowerCase();
  return contract.allowedSelectorsLabels[normalizedSelector] || null;
}

/**
 * Get a trusted asset by address from the profile's trustedAssets registry.
 *
 * SECURITY: This is the ONLY source of token/asset symbols.
 * Never infer symbols from calldata, on-chain calls, or external APIs.
 *
 * @param {string} address - Asset (token) address
 * @param {object} profile - Trust profile
 * @returns {object|null} Asset info { symbol, name, decimals } or null
 */
export function getTrustedAsset(address, profile) {
  if (!profile || !profile.trustedAssets || !address) {
    return null;
  }

  const normalizedAddress = address.toLowerCase();
  return profile.trustedAssets[normalizedAddress] || null;
}

/**
 * Get a human-readable label for an address.
 *
 * Resolution order:
 * 1. Trusted contracts (from trustedContracts)
 * 2. Trusted assets (from trustedAssets)
 * 3. Returns null if not in any registry
 *
 * SECURITY: Only returns labels from explicit trust registries.
 * Never infers labels from external sources.
 *
 * @param {string} address - Address to look up
 * @param {object} profile - Trust profile
 * @returns {object|null} { label, type: "CONTRACT"|"ASSET" } or null
 */
export function getAddressLabel(address, profile) {
  if (!address || !profile) {
    return null;
  }

  const normalizedAddress = address.toLowerCase();

  // Check trusted contracts first
  const contract = getTrustedContract(normalizedAddress, profile);
  if (contract && contract.label) {
    return {
      label: contract.label,
      type: "CONTRACT",
      trustLevel: contract.trustLevel
    };
  }

  // Check trusted assets
  const asset = getTrustedAsset(normalizedAddress, profile);
  if (asset) {
    return {
      label: asset.symbol || asset.name,
      type: "ASSET",
      symbol: asset.symbol,
      name: asset.name,
      decimals: asset.decimals
    };
  }

  return null;
}

/**
 * Check if an address is in any trusted registry (contracts or assets)
 *
 * @param {string} address - Address to check
 * @param {object} profile - Trust profile
 * @returns {boolean} True if address is trusted
 */
export function isAddressTrusted(address, profile) {
  return getAddressLabel(address, profile) !== null;
}

/**
 * Check if a DELEGATECALL to a specific contract+selector is allowed.
 *
 * SECURITY: DELEGATECALL executes external code with the caller's full permissions.
 * This is extremely dangerous and should only be allowed for explicitly whitelisted
 * contract+selector combinations (e.g., MultiSend for batch transactions).
 *
 * @param {string} address - Target contract address
 * @param {string} selector - Function selector
 * @param {object} profile - Trust profile
 * @returns {object} { allowed: boolean, reason: string }
 */
export function isDelegatecallAllowed(address, selector, profile) {
  if (!profile?.trustedDelegateCalls || !address) {
    return { allowed: false, reason: "DELEGATECALL_NOT_WHITELISTED" };
  }

  const normalizedAddress = address.toLowerCase();
  const normalizedSelector = selector.toLowerCase();
  const config = profile.trustedDelegateCalls[normalizedAddress];

  if (!config) {
    return { allowed: false, reason: "DELEGATECALL_CONTRACT_NOT_TRUSTED" };
  }

  if (!config.allowedSelectors.includes(normalizedSelector)) {
    return { allowed: false, reason: "DELEGATECALL_SELECTOR_NOT_ALLOWED" };
  }

  return { allowed: true, reason: "DELEGATECALL_WHITELISTED" };
}

export default {
  TRUST_LEVELS,
  loadProfile,
  createEmptyProfile,
  getTrustedContract,
  isSelectorAllowed,
  getSelectorUsage,
  getSelectorLabel,
  getTrustedAsset,
  getAddressLabel,
  isAddressTrusted,
  isDelegatecallAllowed
};
