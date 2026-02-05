/**
 * ABI Decoder
 *
 * Decodes calldata using local ABI files.
 * Returns named parameters instead of param0/param1/param2.
 */

import { Interface } from "ethers";
import { getAbi } from "./abiRegistry.js";

/**
 * Serialize BigInt values to strings for JSON compatibility
 */
function serializeBigInt(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeBigInt);
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = serializeBigInt(v);
    }
    return result;
  }
  return value;
}

/**
 * Extract function selector from calldata
 */
function extractSelector(calldata) {
  const hex = calldata.startsWith("0x") ? calldata : `0x${calldata}`;
  return hex.slice(0, 10).toLowerCase();
}

/**
 * Decode calldata using ABI
 *
 * @param {string} calldata - Raw hex calldata
 * @param {string} targetAddress - Contract address to lookup ABI
 * @param {object} options - Options
 * @param {object} options.profile - Trust profile (for abiPath override)
 * @param {string} options.chain - Chain name (default: "ethereum")
 * @returns {object} Decode result or null if ABI not found/decode failed
 */
export function decodeWithAbi(calldata, targetAddress, options = {}) {
  if (!calldata || !targetAddress) {
    return null;
  }

  // Get ABI for target address
  const { abi, source, path } = getAbi(targetAddress, options);
  if (!abi) {
    return null;
  }

  try {
    // Create ethers Interface from ABI
    const iface = new Interface(abi);

    // Extract selector
    const selector = extractSelector(calldata);

    // Find matching function in ABI
    let matchedFunction = null;
    for (const fragment of abi) {
      if (fragment.type === "function") {
        try {
          const funcFragment = iface.getFunction(fragment.name);
          if (funcFragment && funcFragment.selector.toLowerCase() === selector) {
            matchedFunction = funcFragment;
            break;
          }
        } catch (e) {
          // Function not found, continue
        }
      }
    }

    if (!matchedFunction) {
      // Try to decode anyway - ethers might find it
      try {
        const decoded = iface.parseTransaction({ data: calldata });
        if (decoded) {
          matchedFunction = decoded.fragment;
        }
      } catch (e) {
        return null;
      }
    }

    if (!matchedFunction) {
      return null;
    }

    // Decode the calldata
    const decoded = iface.decodeFunctionData(matchedFunction, calldata);

    // Build named parameters object
    const params = {};
    const paramNames = [];

    for (let i = 0; i < matchedFunction.inputs.length; i++) {
      const input = matchedFunction.inputs[i];
      const name = input.name || `param${i}`;
      paramNames.push(name);
      params[name] = serializeBigInt(decoded[i]);
    }

    // Build signature string
    const signature = matchedFunction.format("sighash");

    return {
      abiVerified: true,
      abiSource: source,
      abiPath: path,
      functionName: matchedFunction.name,
      signature: signature,
      paramNames: paramNames,
      params: params,
      selector: selector
    };
  } catch (error) {
    // Decode failed - return null to fall back to existing behavior
    console.warn(`ABI decode failed for ${targetAddress}: ${error.message}`);
    return null;
  }
}

/**
 * Check if calldata can be decoded with local ABI
 *
 * @param {string} calldata - Raw hex calldata
 * @param {string} targetAddress - Contract address
 * @param {object} options - Options
 * @returns {boolean}
 */
export function canDecodeWithAbi(calldata, targetAddress, options = {}) {
  const result = decodeWithAbi(calldata, targetAddress, options);
  return result !== null;
}

export default {
  decodeWithAbi,
  canDecodeWithAbi
};
