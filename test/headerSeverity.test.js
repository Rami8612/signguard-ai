/**
 * Tests for Header Severity (Trust-first severity)
 *
 * Tests verify that:
 * 1. headerSeverity is computed correctly for single transactions
 * 2. headerSeverity is computed correctly for batch transactions
 * 3. headerSeverity is null when no trust profile is loaded
 * 4. headerSeverity rules are applied in correct priority
 *
 * Run with: node test/headerSeverity.test.js
 */

import { decode } from "../src/index.js";
import {
  computeHeaderSeverity,
  computeBatchHeaderSeverity,
  getTrustContext,
  HEADER_SEVERITY,
  CONTRACT_CLASSIFICATION,
  SELECTOR_CLASSIFICATION
} from "../src/trustClassifier.js";

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

async function asyncTest(name, fn) {
  try {
    await fn();
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

function assertNull(value, message) {
  if (value !== null) {
    throw new Error(`${message}: expected null, got ${value}`);
  }
}

function assertUndefined(value, message) {
  if (value !== undefined) {
    throw new Error(`${message}: expected undefined, got ${value}`);
  }
}

// Test profile with trusted contract
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
    },
    "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2": {
      label: "Aave V3 Pool",
      trustLevel: "PROTOCOL",
      allowedSelectors: ["0x617ba037"],
      allowedSelectorsLabels: {
        "0x617ba037": "supply"
      }
    },
    "0xwatched1234567890123456789012345678901234": {
      label: "Watched Contract",
      trustLevel: "WATCHED"
    }
  },
  selectorUsageHistory: {
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": {
      "0x095ea7b3": { count: 50, lastUsed: "2025-12-01" }
    }
  }
};

// Standard approve calldata (selector 0x095ea7b3)
const approveCalldata = "0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25eff0000000000000000000000000000000000000000000000000de0b6b3a7640000";

// Disallowed selector for trusted contract (selector 0x12345678)
const disallowedCalldata = "0x12345678000000000000000000000000000000000000000000000000000000000000000a";

async function runTests() {
  console.log("\n=== Header Severity Tests ===\n");

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 1: Unit tests for computeHeaderSeverity
  // ═══════════════════════════════════════════════════════════════════
  console.log("Test Group 1: computeHeaderSeverity unit tests");

  test("Returns null when no trust context", () => {
    assertNull(computeHeaderSeverity(null), "Should return null for null context");
  });

  test("Returns null when profile not loaded", () => {
    const context = { profileLoaded: false };
    assertNull(computeHeaderSeverity(context), "Should return null when profile not loaded");
  });

  test("Returns UNKNOWN for UNKNOWN contract", () => {
    const context = {
      profileLoaded: true,
      contractClassification: CONTRACT_CLASSIFICATION.UNKNOWN
    };
    assertEqual(computeHeaderSeverity(context), HEADER_SEVERITY.UNKNOWN, "Should be UNKNOWN");
  });

  test("Returns UNKNOWN for WATCHED contract", () => {
    const context = {
      profileLoaded: true,
      contractClassification: CONTRACT_CLASSIFICATION.WATCHED
    };
    assertEqual(computeHeaderSeverity(context), HEADER_SEVERITY.UNKNOWN, "Should be UNKNOWN");
  });

  test("Returns CRITICAL for NOT_ALLOWED selector", () => {
    const context = {
      profileLoaded: true,
      contractClassification: CONTRACT_CLASSIFICATION.TRUSTED,
      selectorClassification: SELECTOR_CLASSIFICATION.NOT_ALLOWED
    };
    assertEqual(computeHeaderSeverity(context), HEADER_SEVERITY.CRITICAL, "Should be CRITICAL");
  });

  test("Returns UNKNOWN for NO_CONTEXT selector", () => {
    const context = {
      profileLoaded: true,
      contractClassification: CONTRACT_CLASSIFICATION.TRUSTED,
      selectorClassification: SELECTOR_CLASSIFICATION.NO_CONTEXT
    };
    assertEqual(computeHeaderSeverity(context), HEADER_SEVERITY.UNKNOWN, "Should be UNKNOWN");
  });

  test("Returns LOW for EXPECTED selector on TRUSTED contract", () => {
    const context = {
      profileLoaded: true,
      contractClassification: CONTRACT_CLASSIFICATION.TRUSTED,
      selectorClassification: SELECTOR_CLASSIFICATION.EXPECTED
    };
    assertEqual(computeHeaderSeverity(context), HEADER_SEVERITY.LOW, "Should be LOW");
  });

  test("Returns LOW for UNUSUAL selector on TRUSTED contract", () => {
    const context = {
      profileLoaded: true,
      contractClassification: CONTRACT_CLASSIFICATION.TRUSTED,
      selectorClassification: SELECTOR_CLASSIFICATION.UNUSUAL
    };
    assertEqual(computeHeaderSeverity(context), HEADER_SEVERITY.LOW, "Should be LOW");
  });

  test("Returns LOW for NEVER_USED selector on TRUSTED contract", () => {
    const context = {
      profileLoaded: true,
      contractClassification: CONTRACT_CLASSIFICATION.TRUSTED,
      selectorClassification: SELECTOR_CLASSIFICATION.NEVER_USED
    };
    assertEqual(computeHeaderSeverity(context), HEADER_SEVERITY.LOW, "Should be LOW");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 2: Unit tests for computeBatchHeaderSeverity
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 2: computeBatchHeaderSeverity unit tests");

  test("Returns null without profile", () => {
    const calls = [{ analysis: {} }];
    assertNull(computeBatchHeaderSeverity(calls, false), "Should be null without profile");
  });

  test("Returns UNKNOWN for empty calls", () => {
    assertEqual(computeBatchHeaderSeverity([], true), HEADER_SEVERITY.UNKNOWN, "Should be UNKNOWN for empty");
  });

  test("Returns CRITICAL for DELEGATECALL (operation=1)", () => {
    const calls = [
      { operation: 0, analysis: { trustContext: { contractClassification: "TRUSTED" } } },
      { operation: 1, analysis: {} } // DELEGATECALL
    ];
    assertEqual(computeBatchHeaderSeverity(calls, true), HEADER_SEVERITY.CRITICAL, "Should be CRITICAL");
  });

  test("Returns CRITICAL for isDelegatecall flag", () => {
    const calls = [
      { operation: 0, analysis: { isDelegatecall: true } }
    ];
    assertEqual(computeBatchHeaderSeverity(calls, true), HEADER_SEVERITY.CRITICAL, "Should be CRITICAL");
  });

  test("Returns CRITICAL for trust-blocked subcall", () => {
    const calls = [
      { operation: 0, analysis: { trustBlocked: true } }
    ];
    assertEqual(computeBatchHeaderSeverity(calls, true), HEADER_SEVERITY.CRITICAL, "Should be CRITICAL");
  });

  test("Returns CRITICAL for unknown contract in batch", () => {
    const calls = [
      { operation: 0, analysis: { trustContext: { contractClassification: "UNKNOWN" } } }
    ];
    assertEqual(computeBatchHeaderSeverity(calls, true), HEADER_SEVERITY.CRITICAL, "Should be CRITICAL");
  });

  test("Returns CRITICAL for NOT_ALLOWED selector in batch", () => {
    const calls = [
      { operation: 0, analysis: { trustContext: { contractClassification: "TRUSTED", selectorClassification: "NOT_ALLOWED" } } }
    ];
    assertEqual(computeBatchHeaderSeverity(calls, true), HEADER_SEVERITY.CRITICAL, "Should be CRITICAL");
  });

  test("Returns LOW when all subcalls are trusted", () => {
    const calls = [
      {
        operation: 0,
        analysis: {
          trustContext: {
            contractClassification: "TRUSTED",
            selectorClassification: "EXPECTED"
          }
        }
      },
      {
        operation: 0,
        analysis: {
          trustContext: {
            contractClassification: "TRUSTED",
            selectorClassification: "UNUSUAL"
          }
        }
      }
    ];
    assertEqual(computeBatchHeaderSeverity(calls, true), HEADER_SEVERITY.LOW, "Should be LOW");
  });

  test("Returns UNKNOWN for mixed trust status", () => {
    const calls = [
      {
        operation: 0,
        analysis: {
          trustContext: {
            contractClassification: "TRUSTED",
            selectorClassification: "EXPECTED"
          }
        }
      },
      {
        operation: 0,
        analysis: {} // No trust context
      }
    ];
    assertEqual(computeBatchHeaderSeverity(calls, true), HEADER_SEVERITY.UNKNOWN, "Should be UNKNOWN");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 3: Integration tests with decode()
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 3: Integration with decode()");

  await asyncTest("No headerSeverity without trust profile", async () => {
    const result = await decode(approveCalldata, { offline: true });
    assertUndefined(result.headerSeverity, "Should have no headerSeverity without profile");
  });

  await asyncTest("headerSeverity = LOW for trusted contract + expected selector", async () => {
    const result = await decode(approveCalldata, {
      offline: true,
      targetAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      profile: testProfile
    });
    assertEqual(result.headerSeverity, "LOW", "Should be LOW for trusted+expected");
  });

  await asyncTest("headerSeverity = CRITICAL for NOT_ALLOWED selector", async () => {
    const result = await decode(disallowedCalldata, {
      offline: true,
      targetAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      profile: testProfile
    });
    assertEqual(result.headerSeverity, "CRITICAL", "Should be CRITICAL for NOT_ALLOWED");
  });

  await asyncTest("headerSeverity = UNKNOWN for unknown contract", async () => {
    const result = await decode(approveCalldata, {
      offline: true,
      targetAddress: "0x9999999999999999999999999999999999999999",
      profile: testProfile
    });
    assertEqual(result.headerSeverity, "UNKNOWN", "Should be UNKNOWN for unknown contract");
  });

  await asyncTest("effect.severity unchanged by headerSeverity", async () => {
    const result = await decode(approveCalldata, {
      offline: true,
      targetAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      profile: testProfile
    });
    // approve with unlimited allowance should have HIGH effect severity
    assertTrue(
      result.effect?.severity === "HIGH" || result.effect?.severity === "CRITICAL",
      `effect.severity should remain impact-based (got ${result.effect?.severity})`
    );
    // But headerSeverity is trust-based (LOW because trusted contract)
    assertEqual(result.headerSeverity, "LOW", "headerSeverity should be LOW (trust-based)");
  });

  await asyncTest("headerSeverity = UNKNOWN for WATCHED contract", async () => {
    const result = await decode(approveCalldata, {
      offline: true,
      targetAddress: "0xwatched1234567890123456789012345678901234",
      profile: testProfile
    });
    assertEqual(result.headerSeverity, "UNKNOWN", "Should be UNKNOWN for WATCHED contract");
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
