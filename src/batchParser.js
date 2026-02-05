/**
 * Batch Transaction Parser
 *
 * Parses Safe MultiSend and MultiSendCallOnly batch transactions
 * into individual sub-transactions without analysis.
 *
 * SECURITY PRINCIPLES:
 * - Parsing is deterministic and offline-only
 * - No reliance on on-chain calls, external ABIs, or APIs
 * - Order and boundaries preserved exactly as encoded
 * - Never merge sub-transactions or infer intent
 * - Fail safely with UNPARSEABLE_BATCH on any parsing error
 *
 * Safe MultiSend Encoding Format:
 * - Selector: 0x8d80ff0a (multiSend(bytes))
 * - Each sub-transaction is packed as:
 *   - operation (1 byte): 0 = CALL, 1 = DELEGATECALL
 *   - to (20 bytes): target address
 *   - value (32 bytes): ETH value in wei
 *   - dataLength (32 bytes): length of data
 *   - data (dataLength bytes): calldata
 */

// Known Safe MultiSend contract addresses (canonical deployments)
// These are the official Safe deployment addresses across chains
const KNOWN_MULTISEND_ADDRESSES = new Set([
  // MultiSend (allows DELEGATECALL)
  "0x40a2accbd92bca938b02010e17a5b8929b49130d", // v1.1.1
  "0xa238cbeb142c10ef7ad8442c6d1f9e89e07e7761", // v1.3.0
  "0x998739bfdaadde7c933b942a68053933098f9eda", // v1.4.1

  // MultiSendCallOnly (CALL only, no DELEGATECALL)
  "0x40a2accbd92bca938b02010e17a5b8929b49130d", // v1.1.1 (same contract)
  "0x9641d764fc13c8b624c04430c7356c1c7c8102e2", // v1.3.0 MultiSendCallOnly
  "0x9641d764fc13c8b624c04430c7356c1c7c8102e2", // v1.4.1 MultiSendCallOnly
]);

// MultiSend function selector: multiSend(bytes)
const MULTISEND_SELECTOR = "0x8d80ff0a";

// Operation types
export const OPERATION_TYPE = {
  CALL: 0,
  DELEGATECALL: 1
};

// Operation type labels
export const OPERATION_LABELS = {
  [OPERATION_TYPE.CALL]: "CALL",
  [OPERATION_TYPE.DELEGATECALL]: "DELEGATECALL"
};

/**
 * Batch parsing result types
 */
export const BATCH_TYPE = {
  MULTISEND: "MULTISEND",
  MULTISEND_CALL_ONLY: "MULTISEND_CALL_ONLY",
  NOT_BATCH: "NOT_BATCH",
  UNPARSEABLE_BATCH: "UNPARSEABLE_BATCH"
};

/**
 * Check if calldata appears to be a MultiSend transaction
 *
 * @param {string} calldata - Raw hex calldata
 * @returns {boolean} True if this looks like a MultiSend call
 */
export function isMultiSendCalldata(calldata) {
  if (!calldata || typeof calldata !== "string") {
    return false;
  }

  const normalized = calldata.toLowerCase().trim();

  // Must start with 0x
  if (!normalized.startsWith("0x")) {
    return false;
  }

  // Must have at least the selector (4 bytes = 8 hex chars + 0x)
  if (normalized.length < 10) {
    return false;
  }

  // Check for MultiSend selector
  const selector = normalized.slice(0, 10);
  return selector === MULTISEND_SELECTOR;
}

/**
 * Check if an address is a known MultiSend contract
 *
 * @param {string} address - Contract address
 * @returns {boolean} True if this is a known MultiSend contract
 */
export function isKnownMultiSendAddress(address) {
  if (!address || typeof address !== "string") {
    return false;
  }
  return KNOWN_MULTISEND_ADDRESSES.has(address.toLowerCase());
}

/**
 * Determine the batch type based on the target address
 *
 * @param {string} targetAddress - Target contract address
 * @returns {string} MULTISEND, MULTISEND_CALL_ONLY, or NOT_BATCH
 */
export function determineBatchType(targetAddress) {
  if (!targetAddress) {
    return BATCH_TYPE.NOT_BATCH;
  }

  const normalized = targetAddress.toLowerCase();

  // MultiSendCallOnly addresses (CALL only, safer)
  const callOnlyAddresses = new Set([
    "0x9641d764fc13c8b624c04430c7356c1c7c8102e2", // v1.3.0 / v1.4.1
  ]);

  if (callOnlyAddresses.has(normalized)) {
    return BATCH_TYPE.MULTISEND_CALL_ONLY;
  }

  // Full MultiSend addresses (allows DELEGATECALL)
  const multiSendAddresses = new Set([
    "0x40a2accbd92bca938b02010e17a5b8929b49130d", // v1.1.1
    "0xa238cbeb142c10ef7ad8442c6d1f9e89e07e7761", // v1.3.0
    "0x998739bfdaadde7c933b942a68053933098f9eda", // v1.4.1
  ]);

  if (multiSendAddresses.has(normalized)) {
    return BATCH_TYPE.MULTISEND;
  }

  return BATCH_TYPE.NOT_BATCH;
}

/**
 * Parse a MultiSend batch transaction into individual sub-transactions.
 *
 * This function is deterministic and offline-only.
 * It preserves the exact order and boundaries of sub-transactions.
 *
 * @param {string} calldata - Raw hex calldata of the multiSend call
 * @param {object} options - Parsing options
 * @param {string} options.targetAddress - Target contract address (for determining batch type)
 * @returns {object} Parsed batch result
 */
export function parseBatchTransaction(calldata, options = {}) {
  const { targetAddress } = options;

  // Default result for non-batch transactions
  const notBatchResult = {
    isBatch: false,
    batchType: BATCH_TYPE.NOT_BATCH,
    calls: []
  };

  // Validate input
  if (!calldata || typeof calldata !== "string") {
    return notBatchResult;
  }

  // Check if this is a MultiSend call
  if (!isMultiSendCalldata(calldata)) {
    return notBatchResult;
  }

  // Determine batch type from target address
  let batchType = BATCH_TYPE.MULTISEND; // Default assumption
  if (targetAddress) {
    const detectedType = determineBatchType(targetAddress);
    if (detectedType !== BATCH_TYPE.NOT_BATCH) {
      batchType = detectedType;
    }
  }

  // Parse the batch
  try {
    const calls = parseMultiSendPayload(calldata);

    // Validate DELEGATECALL operations for CallOnly variant
    if (batchType === BATCH_TYPE.MULTISEND_CALL_ONLY) {
      const hasDelegatecall = calls.some(c => c.operation === OPERATION_TYPE.DELEGATECALL);
      if (hasDelegatecall) {
        // This shouldn't happen with a real MultiSendCallOnly contract,
        // but we flag it if the calldata claims to have DELEGATECALL operations
        return {
          isBatch: true,
          batchType: BATCH_TYPE.UNPARSEABLE_BATCH,
          calls: [],
          error: "MultiSendCallOnly calldata contains DELEGATECALL operations",
          rawCalldata: calldata
        };
      }
    }

    return {
      isBatch: true,
      batchType,
      calls,
      callCount: calls.length
    };

  } catch (error) {
    // Fail safely with UNPARSEABLE_BATCH
    return {
      isBatch: true,
      batchType: BATCH_TYPE.UNPARSEABLE_BATCH,
      calls: [],
      error: error.message,
      rawCalldata: calldata
    };
  }
}

/**
 * Parse the MultiSend payload into individual sub-transactions.
 *
 * MultiSend encoding format (packed, no padding between transactions):
 * - operation (1 byte): 0 = CALL, 1 = DELEGATECALL
 * - to (20 bytes): target address
 * - value (32 bytes): ETH value in wei
 * - dataLength (32 bytes): length of data
 * - data (dataLength bytes): calldata
 *
 * @param {string} calldata - Raw hex calldata including selector
 * @returns {Array} Array of sub-transaction objects
 * @throws {Error} If parsing fails
 */
function parseMultiSendPayload(calldata) {
  const normalized = calldata.toLowerCase().trim();

  // Remove 0x prefix
  const hex = normalized.startsWith("0x") ? normalized.slice(2) : normalized;

  // Skip the selector (4 bytes = 8 hex chars)
  if (hex.length < 8) {
    throw new Error("Calldata too short for MultiSend selector");
  }

  // After selector, we have ABI-encoded bytes parameter
  // Format: offset (32 bytes) + length (32 bytes) + data
  const afterSelector = hex.slice(8);

  // Need at least offset (64 hex) + length (64 hex)
  if (afterSelector.length < 128) {
    throw new Error("Calldata too short for ABI-encoded bytes parameter");
  }

  // Read offset (should be 0x20 = 32)
  const offset = parseInt(afterSelector.slice(0, 64), 16);
  if (offset !== 32) {
    throw new Error(`Unexpected offset: ${offset}, expected 32`);
  }

  // Read length of the transactions bytes
  const transactionsLength = parseInt(afterSelector.slice(64, 128), 16);

  // Extract the transactions data
  const transactionsHex = afterSelector.slice(128, 128 + transactionsLength * 2);

  if (transactionsHex.length < transactionsLength * 2) {
    throw new Error(`Transactions data truncated: expected ${transactionsLength * 2} hex chars, got ${transactionsHex.length}`);
  }

  // Parse individual transactions
  const calls = [];
  let cursor = 0;

  while (cursor < transactionsHex.length) {
    // Minimum transaction size: 1 + 20 + 32 + 32 = 85 bytes = 170 hex chars
    if (cursor + 170 > transactionsHex.length) {
      // If we have leftover bytes but not enough for a full header, that's an error
      // unless we're exactly at the end
      if (cursor < transactionsHex.length) {
        throw new Error(`Incomplete transaction at offset ${cursor / 2}`);
      }
      break;
    }

    // Operation (1 byte = 2 hex chars)
    const operationHex = transactionsHex.slice(cursor, cursor + 2);
    const operation = parseInt(operationHex, 16);
    cursor += 2;

    // Validate operation type
    if (operation !== OPERATION_TYPE.CALL && operation !== OPERATION_TYPE.DELEGATECALL) {
      throw new Error(`Invalid operation type ${operation} at offset ${(cursor - 2) / 2}`);
    }

    // To address (20 bytes = 40 hex chars)
    const toHex = transactionsHex.slice(cursor, cursor + 40);
    const to = "0x" + toHex;
    cursor += 40;

    // Value (32 bytes = 64 hex chars)
    const valueHex = transactionsHex.slice(cursor, cursor + 64);
    const value = BigInt("0x" + valueHex);
    cursor += 64;

    // Data length (32 bytes = 64 hex chars)
    const dataLengthHex = transactionsHex.slice(cursor, cursor + 64);
    const dataLength = parseInt(dataLengthHex, 16);
    cursor += 64;

    // Data (dataLength bytes = dataLength * 2 hex chars)
    if (cursor + dataLength * 2 > transactionsHex.length) {
      throw new Error(`Transaction data truncated at offset ${cursor / 2}: expected ${dataLength} bytes`);
    }

    const dataHex = transactionsHex.slice(cursor, cursor + dataLength * 2);
    const data = dataLength > 0 ? "0x" + dataHex : "0x";
    cursor += dataLength * 2;

    calls.push({
      operation,
      operationLabel: OPERATION_LABELS[operation],
      to,
      value,
      valueWei: value.toString(),
      data,
      dataLength
    });
  }

  return calls;
}

/**
 * Format a parsed batch for display
 *
 * @param {object} batchResult - Result from parseBatchTransaction
 * @returns {string[]} Array of formatted lines
 */
export function formatBatchSummary(batchResult) {
  const lines = [];

  if (!batchResult.isBatch) {
    return lines;
  }

  if (batchResult.batchType === BATCH_TYPE.UNPARSEABLE_BATCH) {
    lines.push("BATCH TRANSACTION (UNPARSEABLE)");
    lines.push("");
    lines.push("Unable to parse batch transaction structure.");
    if (batchResult.error) {
      lines.push(`Error: ${batchResult.error}`);
    }
    lines.push("");
    lines.push("The transaction appears to be a MultiSend batch but could not be decoded.");
    lines.push("Manual verification is required.");
    return lines;
  }

  lines.push(`BATCH TRANSACTION DETECTED: ${batchResult.callCount} sub-transactions`);
  lines.push(`Type: ${batchResult.batchType}`);
  lines.push("");

  for (let i = 0; i < batchResult.calls.length; i++) {
    const call = batchResult.calls[i];
    lines.push(`[${i + 1}/${batchResult.callCount}] ${call.operationLabel}`);
    lines.push(`  Target: ${call.to}`);
    if (call.value > 0n) {
      lines.push(`  Value: ${call.valueWei} wei`);
    }
    if (call.dataLength > 0) {
      lines.push(`  Calldata: ${call.data.slice(0, 10)}... (${call.dataLength} bytes)`);
    } else {
      lines.push(`  Calldata: (empty)`);
    }
    lines.push("");
  }

  return lines;
}

export default {
  OPERATION_TYPE,
  OPERATION_LABELS,
  BATCH_TYPE,
  isMultiSendCalldata,
  isKnownMultiSendAddress,
  determineBatchType,
  parseBatchTransaction,
  formatBatchSummary
};
