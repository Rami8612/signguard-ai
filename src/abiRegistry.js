/**
 * Local ABI Registry
 *
 * Loads and caches ABI files from local filesystem.
 * Supports both default registry path and trust profile overrides.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default chain (hardcoded for now)
const DEFAULT_CHAIN = "ethereum";

// Cache for loaded ABIs
const abiCache = new Map();

/**
 * Get the registry base path
 */
function getRegistryPath() {
  return join(__dirname, "..", "abis");
}

/**
 * Normalize an address to lowercase
 */
function normalizeAddress(address) {
  if (!address || typeof address !== "string") return null;
  return address.toLowerCase();
}

/**
 * Load ABI from a file path
 *
 * @param {string} filePath - Path to ABI JSON file
 * @returns {Array|null} Parsed ABI or null if not found/invalid
 */
function loadAbiFromPath(filePath) {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    const content = readFileSync(filePath, "utf-8");
    const abi = JSON.parse(content);

    // Validate it's an array (ABI format)
    if (!Array.isArray(abi)) {
      console.warn(`ABI file is not an array: ${filePath}`);
      return null;
    }

    return abi;
  } catch (error) {
    console.warn(`Failed to load ABI from ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Get ABI for a contract address
 *
 * Lookup priority:
 * 1. Trust profile override (if trustedContracts[address].abiPath exists)
 * 2. Default registry: abis/<chain>/<address>.json
 *
 * @param {string} address - Contract address
 * @param {object} options - Options
 * @param {string} options.chain - Chain name (default: "ethereum")
 * @param {object} options.profile - Trust profile (optional)
 * @returns {object} { abi, source, path } or { abi: null } if not found
 */
export function getAbi(address, options = {}) {
  const chain = options.chain || DEFAULT_CHAIN;
  const profile = options.profile || null;

  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress) {
    return { abi: null, source: null, path: null };
  }

  // Check cache first
  const cacheKey = `${chain}:${normalizedAddress}`;
  if (abiCache.has(cacheKey)) {
    return abiCache.get(cacheKey);
  }

  let abi = null;
  let source = null;
  let path = null;

  // Priority 1: Trust profile override
  if (profile && profile.trustedContracts) {
    const contract = profile.trustedContracts[normalizedAddress];
    if (contract && contract.abiPath) {
      // Validate abiPath resolves within the abis directory (prevent arbitrary file read)
      const registryBase = resolve(getRegistryPath());
      const resolvedAbiPath = resolve(contract.abiPath);
      if (resolvedAbiPath.startsWith(registryBase + "\\") || resolvedAbiPath.startsWith(registryBase + "/")) {
        path = resolvedAbiPath;
        abi = loadAbiFromPath(path);
        if (abi) {
          source = "TRUST_PROFILE_ABI";
        }
      } else {
        console.warn(`Blocked abiPath outside registry: ${contract.abiPath}`);
      }
    }
  }

  // Priority 2: Default registry path
  if (!abi) {
    path = join(getRegistryPath(), chain, `${normalizedAddress}.json`);
    abi = loadAbiFromPath(path);
    if (abi) {
      source = "LOCAL_REGISTRY";
    }
  }

  const result = { abi, source, path: abi ? path : null };

  // Cache the result
  abiCache.set(cacheKey, result);

  return result;
}

/**
 * Check if ABI exists for a contract
 *
 * @param {string} address - Contract address
 * @param {object} options - Options (chain, profile)
 * @returns {boolean}
 */
export function hasAbi(address, options = {}) {
  const result = getAbi(address, options);
  return result.abi !== null;
}

/**
 * Clear the ABI cache (useful for testing)
 */
export function clearAbiCache() {
  abiCache.clear();
}

/**
 * Get registry statistics (for debugging)
 */
export function getRegistryStats() {
  return {
    cacheSize: abiCache.size,
    registryPath: getRegistryPath()
  };
}

export default {
  getAbi,
  hasAbi,
  clearAbiCache,
  getRegistryStats
};
