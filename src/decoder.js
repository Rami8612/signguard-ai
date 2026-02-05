/**
 * ABI decoding using ethers.js v6
 */

import { AbiCoder, Interface } from "ethers";

const abiCoder = AbiCoder.defaultAbiCoder();

/**
 * Extract the function selector (first 4 bytes) from calldata
 */
export function extractSelector(calldata) {
  if (!calldata || calldata.length < 10) {
    throw new Error("Invalid calldata: must be at least 10 characters (0x + 4 bytes)");
  }

  const normalized = calldata.startsWith("0x") ? calldata : `0x${calldata}`;
  return normalized.slice(0, 10).toLowerCase();
}

/**
 * Extract the parameter data (everything after the selector)
 */
export function extractParamData(calldata) {
  const normalized = calldata.startsWith("0x") ? calldata : `0x${calldata}`;
  if (normalized.length <= 10) {
    return "0x";
  }
  return "0x" + normalized.slice(10);
}

/**
 * Parse a function signature into its components
 * e.g., "approve(address,uint256)" -> { name: "approve", types: ["address", "uint256"] }
 */
export function parseSignature(signature) {
  const match = signature.match(/^(\w+)\((.*)\)$/);
  if (!match) {
    throw new Error(`Invalid function signature: ${signature}`);
  }

  const name = match[1];
  const typeString = match[2];

  // Handle empty parameter list
  if (!typeString.trim()) {
    return { name, types: [] };
  }

  // Parse types, handling nested tuples
  const types = parseTypes(typeString);

  return { name, types };
}

/**
 * Parse a comma-separated type string, handling nested parentheses
 */
function parseTypes(typeString) {
  const types = [];
  let current = "";
  let depth = 0;

  for (const char of typeString) {
    if (char === "(") {
      depth++;
      current += char;
    } else if (char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      if (current.trim()) {
        types.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    types.push(current.trim());
  }

  return types;
}

/**
 * Decode calldata parameters using a known signature
 */
export function decodeParams(calldata, signature, paramNames = []) {
  const { name, types } = parseSignature(signature);
  const paramData = extractParamData(calldata);

  if (types.length === 0 && paramData === "0x") {
    return { functionName: name, params: {} };
  }

  try {
    const decoded = abiCoder.decode(types, paramData);

    const params = {};
    for (let i = 0; i < types.length; i++) {
      const paramName = paramNames[i] || `param${i}`;
      params[paramName] = decoded[i];
    }

    return { functionName: name, params };
  } catch (error) {
    throw new Error(`Failed to decode parameters: ${error.message}`);
  }
}

/**
 * Format a decoded value for display
 */
export function formatValue(value, type) {
  if (value === null || value === undefined) {
    return "null";
  }

  // Handle BigInt
  if (typeof value === "bigint") {
    // Check for max uint256
    if (value === BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")) {
      return `${value.toString()} (MAX_UINT256)`;
    }
    return value.toString();
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return `[${value.map((v, i) => formatValue(v)).join(", ")}]`;
  }

  // Handle bytes
  if (typeof value === "string" && value.startsWith("0x")) {
    if (value.length > 66) {
      return `${value.slice(0, 34)}...${value.slice(-32)} (${(value.length - 2) / 2} bytes)`;
    }
    return value;
  }

  // Handle booleans
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

/**
 * Check if a value represents a "max" approval amount
 */
export function isMaxApproval(amount) {
  if (typeof amount !== "bigint") {
    return false;
  }

  const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
  const halfMax = BigInt("0x8000000000000000000000000000000000000000000000000000000000000000");

  return amount === maxUint256 || amount >= halfMax;
}

/**
 * Check if a value is zero (for revocation detection)
 */
export function isZero(amount) {
  if (typeof amount === "bigint") {
    return amount === BigInt(0);
  }
  if (typeof amount === "number") {
    return amount === 0;
  }
  return false;
}
