/**
 * Tests for Phase 12: Batch / Nested Transactions Support (Parsing)
 *
 * These tests verify that:
 * 1. MultiSend batch transactions are detected correctly
 * 2. Sub-transactions are parsed with correct operation, target, value, data
 * 3. Execution order is preserved exactly
 * 4. Non-batch transactions behave exactly as before
 * 5. Parsing failures result in UNPARSEABLE_BATCH
 *
 * Run with: node test/batchParser.test.js
 */

import {
  isMultiSendCalldata,
  isKnownMultiSendAddress,
  determineBatchType,
  parseBatchTransaction,
  formatBatchSummary,
  BATCH_TYPE,
  OPERATION_TYPE,
  OPERATION_LABELS
} from "../src/batchParser.js";
import { decode, decodeAndFormat } from "../src/index.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected "${expected}", got "${actual}"`);
  }
}

function assertTrue(value, message) {
  if (!value) {
    throw new Error(`${message}: expected truthy value, got ${value}`);
  }
}

function assertFalse(value, message) {
  if (value) {
    throw new Error(`${message}: expected falsy value, got ${value}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message}: expected ${expectedStr}, got ${actualStr}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Test Data
// ═══════════════════════════════════════════════════════════════════════════

// MultiSend selector: 0x8d80ff0a
const MULTISEND_SELECTOR = "0x8d80ff0a";

// Simple batch with 2 CALL operations:
// 1. CALL to 0xTargetA with 0 ETH and 4-byte calldata (0x12345678)
// 2. CALL to 0xTargetB with 1 ETH and 4-byte calldata (0xabcdef01)
//
// Encoding format:
// - selector: 0x8d80ff0a
// - offset to bytes: 32 (0x20)
// - length of transactions bytes
// - transactions data (packed)
//
// Each transaction:
// - operation (1 byte)
// - to (20 bytes)
// - value (32 bytes)
// - dataLength (32 bytes)
// - data (dataLength bytes)

function buildMultiSendCalldata(transactions) {
  // Build transactions bytes
  let txsHex = "";
  for (const tx of transactions) {
    // operation (1 byte)
    const opHex = tx.operation.toString(16).padStart(2, "0");
    // to (20 bytes) - remove 0x prefix and pad
    const toHex = tx.to.replace("0x", "").toLowerCase().padStart(40, "0");
    // value (32 bytes)
    const valueHex = BigInt(tx.value).toString(16).padStart(64, "0");
    // data length (32 bytes)
    const dataNoPrefix = tx.data.replace("0x", "");
    const dataLengthHex = (dataNoPrefix.length / 2).toString(16).padStart(64, "0");
    // data
    txsHex += opHex + toHex + valueHex + dataLengthHex + dataNoPrefix;
  }

  // Build full calldata
  // selector (4 bytes) + offset (32 bytes) + length (32 bytes) + transactions
  const offset = "0000000000000000000000000000000000000000000000000000000000000020"; // 32
  const txsBytesLength = (txsHex.length / 2).toString(16).padStart(64, "0");

  return "0x" + MULTISEND_SELECTOR.slice(2) + offset + txsBytesLength + txsHex;
}

// Pre-built test calldata with 2 transactions
const TWO_TX_BATCH = buildMultiSendCalldata([
  {
    operation: OPERATION_TYPE.CALL,
    to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    value: "0",
    data: "0x12345678"
  },
  {
    operation: OPERATION_TYPE.CALL,
    to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    value: "1000000000000000000", // 1 ETH
    data: "0xabcdef01"
  }
]);

// Batch with DELEGATECALL
const DELEGATECALL_BATCH = buildMultiSendCalldata([
  {
    operation: OPERATION_TYPE.CALL,
    to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    value: "0",
    data: "0x12345678"
  },
  {
    operation: OPERATION_TYPE.DELEGATECALL,
    to: "0xcccccccccccccccccccccccccccccccccccccccc",
    value: "0",
    data: "0xdeadbeef"
  }
]);

// Batch with empty calldata (ETH transfer)
const ETH_TRANSFER_BATCH = buildMultiSendCalldata([
  {
    operation: OPERATION_TYPE.CALL,
    to: "0xdddddddddddddddddddddddddddddddddddddddd",
    value: "500000000000000000", // 0.5 ETH
    data: "0x" // empty
  }
]);

// Non-batch calldata (ERC20 approve)
const NON_BATCH_CALLDATA = "0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25eff0000000000000000000000000000000000000000000000000de0b6b3a7640000";

// Malformed batch (truncated)
const MALFORMED_BATCH = "0x8d80ff0a00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000010";

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log("\n=== Phase 12: Batch Transaction Parsing ===\n");

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 1: isMultiSendCalldata detection
  // ═══════════════════════════════════════════════════════════════════
  console.log("Test Group 1: MultiSend detection");

  test("Detects valid MultiSend calldata", () => {
    assertTrue(isMultiSendCalldata(TWO_TX_BATCH), "Should detect MultiSend");
  });

  test("Detects MultiSend with lowercase hex", () => {
    assertTrue(isMultiSendCalldata(TWO_TX_BATCH.toLowerCase()), "Should detect lowercase");
  });

  test("Does not detect non-MultiSend calldata", () => {
    assertFalse(isMultiSendCalldata(NON_BATCH_CALLDATA), "Should not detect approve");
  });

  test("Handles null/undefined input", () => {
    assertFalse(isMultiSendCalldata(null), "Should return false for null");
    assertFalse(isMultiSendCalldata(undefined), "Should return false for undefined");
    assertFalse(isMultiSendCalldata(""), "Should return false for empty");
  });

  test("Handles short calldata", () => {
    assertFalse(isMultiSendCalldata("0x8d80"), "Should return false for short calldata");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 2: Known MultiSend addresses
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 2: Known MultiSend addresses");

  test("Recognizes MultiSend v1.3.0 address", () => {
    assertTrue(
      isKnownMultiSendAddress("0xa238cbeb142c10ef7ad8442c6d1f9e89e07e7761"),
      "Should recognize v1.3.0"
    );
  });

  test("Recognizes MultiSendCallOnly v1.3.0 address", () => {
    assertTrue(
      isKnownMultiSendAddress("0x9641d764fc13c8b624c04430c7356c1c7c8102e2"),
      "Should recognize CallOnly"
    );
  });

  test("Does not recognize unknown address", () => {
    assertFalse(
      isKnownMultiSendAddress("0x1234567890123456789012345678901234567890"),
      "Should not recognize unknown"
    );
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 3: Batch type determination
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 3: Batch type determination");

  test("Determines MULTISEND for MultiSend address", () => {
    assertEqual(
      determineBatchType("0xa238cbeb142c10ef7ad8442c6d1f9e89e07e7761"),
      BATCH_TYPE.MULTISEND,
      "Should be MULTISEND"
    );
  });

  test("Determines MULTISEND_CALL_ONLY for CallOnly address", () => {
    assertEqual(
      determineBatchType("0x9641d764fc13c8b624c04430c7356c1c7c8102e2"),
      BATCH_TYPE.MULTISEND_CALL_ONLY,
      "Should be MULTISEND_CALL_ONLY"
    );
  });

  test("Returns NOT_BATCH for unknown address", () => {
    assertEqual(
      determineBatchType("0x1234567890123456789012345678901234567890"),
      BATCH_TYPE.NOT_BATCH,
      "Should be NOT_BATCH"
    );
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 4: Basic batch parsing
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 4: Basic batch parsing");

  test("Parses 2-transaction batch", () => {
    const result = parseBatchTransaction(TWO_TX_BATCH);
    assertTrue(result.isBatch, "Should be batch");
    assertEqual(result.callCount, 2, "Should have 2 calls");
  });

  test("Preserves execution order", () => {
    const result = parseBatchTransaction(TWO_TX_BATCH);
    assertEqual(
      result.calls[0].to.toLowerCase(),
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "First call target"
    );
    assertEqual(
      result.calls[1].to.toLowerCase(),
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "Second call target"
    );
  });

  test("Parses operation types correctly", () => {
    const result = parseBatchTransaction(TWO_TX_BATCH);
    assertEqual(result.calls[0].operation, OPERATION_TYPE.CALL, "First should be CALL");
    assertEqual(result.calls[0].operationLabel, "CALL", "Label should be CALL");
  });

  test("Parses ETH values correctly", () => {
    const result = parseBatchTransaction(TWO_TX_BATCH);
    assertEqual(result.calls[0].valueWei, "0", "First call should have 0 ETH");
    assertEqual(result.calls[1].valueWei, "1000000000000000000", "Second call should have 1 ETH");
  });

  test("Parses calldata correctly", () => {
    const result = parseBatchTransaction(TWO_TX_BATCH);
    assertEqual(result.calls[0].data.toLowerCase(), "0x12345678", "First call data");
    assertEqual(result.calls[1].data.toLowerCase(), "0xabcdef01", "Second call data");
    assertEqual(result.calls[0].dataLength, 4, "First call data length");
    assertEqual(result.calls[1].dataLength, 4, "Second call data length");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 5: DELEGATECALL handling
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 5: DELEGATECALL handling");

  test("Parses DELEGATECALL operations", () => {
    const result = parseBatchTransaction(DELEGATECALL_BATCH);
    assertEqual(result.calls[1].operation, OPERATION_TYPE.DELEGATECALL, "Should be DELEGATECALL");
    assertEqual(result.calls[1].operationLabel, "DELEGATECALL", "Label should be DELEGATECALL");
  });

  test("Flags DELEGATECALL in CallOnly batch as unparseable", () => {
    const result = parseBatchTransaction(DELEGATECALL_BATCH, {
      targetAddress: "0x9641d764fc13c8b624c04430c7356c1c7c8102e2" // CallOnly address
    });
    assertEqual(result.batchType, BATCH_TYPE.UNPARSEABLE_BATCH, "Should be UNPARSEABLE_BATCH");
    assertTrue(result.error.includes("DELEGATECALL"), "Error should mention DELEGATECALL");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 6: Empty calldata (ETH transfers)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 6: Empty calldata handling");

  test("Handles empty calldata (ETH transfer)", () => {
    const result = parseBatchTransaction(ETH_TRANSFER_BATCH);
    assertTrue(result.isBatch, "Should be batch");
    assertEqual(result.calls[0].data, "0x", "Should have empty calldata");
    assertEqual(result.calls[0].dataLength, 0, "Data length should be 0");
    assertEqual(result.calls[0].valueWei, "500000000000000000", "Should have 0.5 ETH");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 7: Non-batch handling
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 7: Non-batch transactions");

  test("Non-batch calldata returns isBatch: false", () => {
    const result = parseBatchTransaction(NON_BATCH_CALLDATA);
    assertFalse(result.isBatch, "Should not be batch");
    assertEqual(result.batchType, BATCH_TYPE.NOT_BATCH, "Should be NOT_BATCH");
    assertEqual(result.calls.length, 0, "Should have no calls");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 8: Malformed batch handling
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 8: Malformed batch handling");

  test("Malformed batch returns UNPARSEABLE_BATCH", () => {
    const result = parseBatchTransaction(MALFORMED_BATCH);
    assertTrue(result.isBatch, "Should still be detected as batch");
    assertEqual(result.batchType, BATCH_TYPE.UNPARSEABLE_BATCH, "Should be UNPARSEABLE_BATCH");
    assertTrue(result.error !== undefined, "Should have error message");
  });

  test("UNPARSEABLE_BATCH includes raw calldata", () => {
    const result = parseBatchTransaction(MALFORMED_BATCH);
    assertTrue(result.rawCalldata !== undefined, "Should include raw calldata");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 9: Integration with decode()
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 9: Integration with decode()");

  test("decode() returns batchInfo for batch transactions", async () => {
    const result = await decode(TWO_TX_BATCH, { offline: true });
    assertTrue(result.isBatch, "Should have isBatch flag");
    assertTrue(result.batchInfo !== undefined, "Should have batchInfo");
    assertEqual(result.batchInfo.callCount, 2, "Should have 2 calls in batchInfo");
  });

  test("decode() does not return batchInfo for non-batch", async () => {
    const result = await decode(NON_BATCH_CALLDATA, { offline: true });
    assertFalse(result.isBatch, "Should not have isBatch flag");
  });

  test("Normal decode flow works unchanged for non-batch", async () => {
    const result = await decode(NON_BATCH_CALLDATA, { offline: true });
    // This is an approve call - should have normal decode results
    assertEqual(result.selector, "0x095ea7b3", "Selector should be approve");
    assertTrue(result.verified, "Should be verified selector");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 10: Formatted output
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 10: Formatted output");

  test("Human-readable output shows batch header", async () => {
    const output = await decodeAndFormat(TWO_TX_BATCH, { offline: true });
    assertTrue(
      output.includes("Batch: 2 sub-transactions"),
      "Should show batch header with count"
    );
  });

  test("Human-readable output shows sub-transaction details", async () => {
    const output = await decodeAndFormat(TWO_TX_BATCH, { offline: true });
    assertTrue(output.includes("[1/2]"), "Should show first transaction number");
    assertTrue(output.includes("[2/2]"), "Should show second transaction number");
    assertTrue(output.includes("CALL"), "Should show operation type");
    assertTrue(output.includes("Target:"), "Should show target");
  });

  test("JSON output includes batchInfo", async () => {
    const output = await decodeAndFormat(TWO_TX_BATCH, { offline: true, json: true });
    const parsed = JSON.parse(output);
    assertTrue(parsed.isBatch, "JSON should have isBatch");
    assertTrue(parsed.batchInfo !== undefined, "JSON should have batchInfo");
    assertEqual(parsed.batchInfo.callCount, 2, "JSON batchInfo should have callCount");
    assertTrue(Array.isArray(parsed.batchInfo.calls), "JSON batchInfo should have calls array");
  });

  test("UNPARSEABLE_BATCH shows in output", async () => {
    const output = await decodeAndFormat(MALFORMED_BATCH, { offline: true });
    assertTrue(
      output.includes("UNPARSEABLE") || output.includes("unable to parse"),
      "Should indicate unparseable"
    );
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 11: formatBatchSummary utility
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 11: formatBatchSummary utility");

  test("formatBatchSummary returns array of lines", () => {
    const result = parseBatchTransaction(TWO_TX_BATCH);
    const summary = formatBatchSummary(result);
    assertTrue(Array.isArray(summary), "Should return array");
    assertTrue(summary.length > 0, "Should have content");
  });

  test("formatBatchSummary returns empty for non-batch", () => {
    const result = parseBatchTransaction(NON_BATCH_CALLDATA);
    const summary = formatBatchSummary(result);
    assertEqual(summary.length, 0, "Should be empty for non-batch");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 12: Sub-transaction analysis
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 12: Sub-transaction analysis");

  // Build batch with verified approve (safe) + unknown function (unsafe)
  const MIXED_BATCH = buildMultiSendCalldata([
    {
      // Safe: ERC20 approve (verified selector)
      operation: OPERATION_TYPE.CALL,
      to: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
      value: "0",
      data: "0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25eff0000000000000000000000000000000000000000000000000de0b6b3a7640000"
    },
    {
      // Unknown: random selector
      operation: OPERATION_TYPE.CALL,
      to: "0x1234567890123456789012345678901234567890",
      value: "0",
      data: "0xdeadbeef"
    }
  ]);

  test("Batch with mixed safe+unsafe shows analysis for each", async () => {
    const result = await decode(MIXED_BATCH, { offline: true });
    assertTrue(result.isBatch, "Should be batch");
    assertTrue(result.batchInfo.batchSummary?.analyzed, "Should be analyzed");

    // First call should be verified (approve)
    const call1 = result.batchInfo.calls[0];
    assertTrue(call1.analysis, "First call should have analysis");
    assertTrue(call1.analysis.verified, "First call should be verified");
    assertEqual(call1.analysis.selector, "0x095ea7b3", "First call selector");

    // Second call should be unknown
    const call2 = result.batchInfo.calls[1];
    assertTrue(call2.analysis, "Second call should have analysis");
    assertFalse(call2.analysis.verified, "Second call should not be verified");
    assertEqual(call2.analysis.selector, "0xdeadbeef", "Second call selector");
  });

  test("Mixed batch overall severity is max of subcalls", async () => {
    const result = await decode(MIXED_BATCH, { offline: true });
    const summary = result.batchInfo.batchSummary;

    // Should have both OK (approve is HIGH->WARN) and UNKNOWN
    assertTrue(summary.counts.UNKNOWN > 0 || summary.counts.WARN > 0, "Should have varied severities");

    // Overall should be UNKNOWN (highest) since one call is unknown
    assertEqual(summary.overallSeverity, "UNKNOWN", "Overall should be UNKNOWN");
  });

  test("Batch summary counts are correct", async () => {
    const result = await decode(MIXED_BATCH, { offline: true });
    const counts = result.batchInfo.batchSummary.counts;

    // Total should equal call count
    const total = (counts.OK || 0) + (counts.WARN || 0) + (counts.DANGER || 0) + (counts.UNKNOWN || 0);
    assertEqual(total, 2, "Total counts should equal call count");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 13: DELEGATECALL flagging in batch
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 13: DELEGATECALL flagging in batch");

  test("DELEGATECALL in batch is flagged as CRITICAL", async () => {
    const result = await decode(DELEGATECALL_BATCH, { offline: true });
    assertTrue(result.isBatch, "Should be batch");

    // Find the DELEGATECALL sub-transaction
    const delegatecallSub = result.batchInfo.calls.find(c => c.operation === OPERATION_TYPE.DELEGATECALL);
    assertTrue(delegatecallSub, "Should have DELEGATECALL sub-transaction");
    assertTrue(delegatecallSub.analysis, "DELEGATECALL should have analysis");
    assertEqual(delegatecallSub.analysis.severity, "CRITICAL", "DELEGATECALL should be CRITICAL");
    assertTrue(delegatecallSub.analysis.isDelegatecall, "Should be flagged as delegatecall");
  });

  test("Batch with DELEGATECALL has high overall severity", async () => {
    const result = await decode(DELEGATECALL_BATCH, { offline: true });
    const summary = result.batchInfo.batchSummary;

    // Overall is UNKNOWN because one subcall has unknown selector
    // UNKNOWN is treated as >= CRITICAL for safety
    assertTrue(
      summary.overallSeverity === "CRITICAL" || summary.overallSeverity === "UNKNOWN",
      "Overall should be CRITICAL or UNKNOWN"
    );
    assertTrue(summary.counts.DANGER > 0, "Should have DANGER count");
  });

  test("Human output shows DELEGATECALL warning", async () => {
    const output = await decodeAndFormat(DELEGATECALL_BATCH, { offline: true });
    assertTrue(
      output.includes("DELEGATECALL") && output.includes("CRITICAL"),
      "Should show DELEGATECALL warning"
    );
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 14: Unknown contract in batch with trust profile
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 14: Unknown contract in batch with trust profile");

  // Trust profile with only WETH trusted
  const testProfile = {
    safeAddress: "0x1234567890123456789012345678901234567890",
    version: "1.0",
    trustedContracts: {
      "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": {
        label: "WETH",
        trustLevel: "PROTOCOL",
        allowedSelectors: ["0x095ea7b3", "0xd0e30db0"],
        allowedSelectorsLabels: {
          "0x095ea7b3": "approve",
          "0xd0e30db0": "deposit"
        }
      }
    }
  };

  // Batch with trusted WETH + untrusted unknown contract
  const MIXED_TRUST_BATCH = buildMultiSendCalldata([
    {
      // Trusted: WETH approve
      operation: OPERATION_TYPE.CALL,
      to: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      value: "0",
      data: "0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25eff0000000000000000000000000000000000000000000000000de0b6b3a7640000"
    },
    {
      // Untrusted: unknown contract
      operation: OPERATION_TYPE.CALL,
      to: "0x9999999999999999999999999999999999999999",
      value: "0",
      data: "0x12345678"
    }
  ]);

  test("Unknown contract in batch is flagged with trust profile", async () => {
    const result = await decode(MIXED_TRUST_BATCH, { offline: true, profile: testProfile });
    assertTrue(result.isBatch, "Should be batch");

    // First call to WETH should have trust context
    const call1 = result.batchInfo.calls[0];
    assertTrue(call1.analysis, "First call should have analysis");
    assertEqual(call1.analysis.trustContext?.label, "WETH", "First call should show WETH label");

    // Second call to unknown contract should be trust blocked
    const call2 = result.batchInfo.calls[1];
    assertTrue(call2.analysis, "Second call should have analysis");
    assertTrue(call2.analysis.trustBlocked, "Second call should be trust blocked");
    assertEqual(call2.analysis.severity, "UNKNOWN", "Second call should be UNKNOWN");
  });

  test("Human output shows unknown contract warning in batch", async () => {
    const output = await decodeAndFormat(MIXED_TRUST_BATCH, { offline: true, profile: testProfile });
    assertTrue(
      output.includes("UNKNOWN CONTRACT") || output.includes("UNKNOWN"),
      "Should show unknown contract warning"
    );
  });

  test("JSON output includes analysis for each subcall", async () => {
    const output = await decodeAndFormat(MIXED_TRUST_BATCH, { offline: true, profile: testProfile, json: true });
    const parsed = JSON.parse(output);

    assertTrue(parsed.batchInfo.batchSummary, "Should have batch summary");
    assertTrue(parsed.batchInfo.calls[0].analysis, "First call should have analysis");
    assertTrue(parsed.batchInfo.calls[1].analysis, "Second call should have analysis");
    assertEqual(parsed.batchInfo.calls[1].analysis.trustBlocked, true, "Second call should be trust blocked");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 15: ETH transfer in batch
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 15: ETH transfer in batch");

  test("ETH transfer (empty calldata) is handled correctly", async () => {
    const result = await decode(ETH_TRANSFER_BATCH, { offline: true });
    assertTrue(result.isBatch, "Should be batch");

    const call = result.batchInfo.calls[0];
    assertTrue(call.analysis, "Should have analysis");
    assertTrue(call.analysis.isEthTransfer, "Should be flagged as ETH transfer");
    assertEqual(call.analysis.severity, "MEDIUM", "ETH transfer should be MEDIUM");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60) + "\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error("Test runner error:", error);
  process.exit(1);
});
