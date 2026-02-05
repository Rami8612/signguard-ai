/**
 * Tests for Phase 11: Trust Profile to Consequence Analysis Bridge
 *
 * These tests verify that:
 * 1. Trust-allowed selectors with matching labels get TRUST_PROFILE source
 * 2. Unknown contracts still get UNKNOWN treatment
 * 3. Source is clearly marked as TRUST_PROFILE
 * 4. Parameter decoding only proceeds when label matches
 *
 * Run with: node test/trustProfileBridge.test.js
 */

import { decode } from "../src/index.js";
import { loadProfile } from "../src/trustProfile.js";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test profile with Aave V3 Pool
const testProfile = {
  safeAddress: "0x1234567890123456789012345678901234567890",
  version: "1.0",
  trustedContracts: {
    // Aave V3 Pool - supply selector NOT in verified database
    "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2": {
      label: "Aave V3 Pool",
      trustLevel: "PROTOCOL",
      allowedSelectors: ["0x617ba037", "0x69328dec"],
      allowedSelectorsLabels: {
        "0x617ba037": "supply",
        "0x69328dec": "withdraw"
      },
      notes: "Aave V3 lending pool"
    },
    // WETH - some selectors ARE in verified database (approve, transfer)
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": {
      label: "WETH",
      trustLevel: "PROTOCOL",
      allowedSelectors: ["0x095ea7b3", "0xa9059cbb", "0xd0e30db0"],
      allowedSelectorsLabels: {
        "0x095ea7b3": "approve",
        "0xa9059cbb": "transfer",
        "0xd0e30db0": "deposit"
      },
      notes: "Wrapped Ether"
    },
    // Watched contract - should NOT be interpreted
    "0x1111111111111111111111111111111111111111": {
      label: "Suspicious Contract",
      trustLevel: "WATCHED",
      allowedSelectors: [],
      notes: "Under investigation"
    }
  },
  selectorUsageHistory: {
    "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2": {
      "0x617ba037": { count: 47, lastUsed: "2025-12-01" }
    }
  }
};

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

async function runTests() {
  console.log("\n=== Phase 11: Trust Profile to Consequence Analysis Bridge ===\n");

  // ═══════════════════════════════════════════════════════════════════
  // Test 1: Trust-allowed selector with label (Aave supply - NOT in verified DB)
  // ═══════════════════════════════════════════════════════════════════
  console.log("Test Group 1: Trust-allowed selector with label");

  // Aave V3 supply calldata (selector 0x617ba037)
  // supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
  const aaveSupplyCalldata = "0x617ba037000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000000";

  const aaveSupplyResult = await decode(aaveSupplyCalldata, {
    offline: true, // Don't query 4byte to test pure trust profile behavior
    targetAddress: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    profile: testProfile
  });

  test("Trust profile should be loaded", () => {
    assertTrue(aaveSupplyResult.trustContext?.profileLoaded, "Profile should be loaded");
  });

  test("Contract should be classified as TRUSTED", () => {
    assertEqual(aaveSupplyResult.trustContext?.contractClassification, "TRUSTED", "Contract classification");
  });

  test("Selector should have a label from trust profile", () => {
    assertEqual(aaveSupplyResult.trustContext?.selectorLabel, "supply", "Selector label");
  });

  test("For offline mode without 4byte, effect should still use trust profile", () => {
    // In offline mode without verified selector, trust profile provides semantic context
    assertTrue(
      aaveSupplyResult.effect?.trustProfileVerified ||
      aaveSupplyResult.effect?.effectType === "TRUST_PROFILE_SEMANTIC" ||
      aaveSupplyResult.effect?.source === "TRUST_PROFILE" ||
      aaveSupplyResult.source === "TRUST_PROFILE",
      "Should use trust profile as source"
    );
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test 2: Verified selector + trust profile (approve - IN verified DB)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 2: Verified selector + trust profile");

  // ERC20 approve calldata (selector 0x095ea7b3) - this IS in verified database
  const approveCalldata = "0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25eff0000000000000000000000000000000000000000000000000de0b6b3a7640000";

  const approveResult = await decode(approveCalldata, {
    offline: true,
    targetAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    profile: testProfile
  });

  test("Verified selector should remain verified (not downgraded to trust profile)", () => {
    assertTrue(approveResult.verified, "Should be ABI-verified");
  });

  test("Trust context should still be available for verified selectors", () => {
    assertTrue(approveResult.trustContext?.profileLoaded, "Profile should be loaded");
    assertEqual(approveResult.trustContext?.trustLevel, "PROTOCOL", "Trust level");
  });

  test("Effect should use verified database, not trust profile", () => {
    // For verified selectors, we use the verified database
    assertEqual(approveResult.effect?.effectType, "PERMISSION_GRANT", "Effect type from verified DB");
    assertFalse(approveResult.effect?.trustProfileVerified, "Should not be trust profile verified");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test 3: Unknown contract (NOT in trust profile)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 3: Unknown contract (NOT in trust profile)");

  const unknownContractResult = await decode(aaveSupplyCalldata, {
    offline: true,
    targetAddress: "0x9999999999999999999999999999999999999999", // Not in profile
    profile: testProfile
  });

  test("Unknown contract should be blocked by trust profile", () => {
    assertTrue(unknownContractResult.trustBlocked, "Should be trust blocked");
  });

  test("Unknown contract should get UNKNOWN severity", () => {
    assertEqual(unknownContractResult.effect?.severity, "UNKNOWN", "Severity should be UNKNOWN");
  });

  test("Unknown contract classification", () => {
    assertEqual(unknownContractResult.trustContext?.contractClassification, "UNKNOWN", "Contract classification");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test 4: WATCHED contract (recognized but not trusted)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 4: WATCHED contract");

  const watchedContractResult = await decode(aaveSupplyCalldata, {
    offline: true,
    targetAddress: "0x1111111111111111111111111111111111111111", // WATCHED
    profile: testProfile
  });

  test("WATCHED contract should be blocked", () => {
    assertTrue(watchedContractResult.trustBlocked, "Should be trust blocked");
  });

  test("WATCHED contract classification", () => {
    assertEqual(watchedContractResult.trustContext?.contractClassification, "WATCHED", "Contract classification");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test 5: Selector NOT in allowed list for trusted contract
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 5: Disallowed selector on trusted contract");

  // Use a selector not in the allowed list for Aave
  const disallowedSelectorCalldata = "0x12345678000000000000000000000000000000000000000000000000000000000000000a";

  const disallowedResult = await decode(disallowedSelectorCalldata, {
    offline: true,
    targetAddress: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    profile: testProfile
  });

  test("Disallowed selector should be blocked", () => {
    assertTrue(disallowedResult.trustBlocked, "Should be trust blocked");
  });

  test("Selector classification should be NOT_ALLOWED", () => {
    assertEqual(disallowedResult.trustContext?.selectorClassification, "NOT_ALLOWED", "Selector classification");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test 6: No trust profile provided
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 6: No trust profile");

  const noProfileResult = await decode(aaveSupplyCalldata, {
    offline: true,
    targetAddress: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"
    // No profile provided
  });

  test("Without profile, trust context should not be present", () => {
    assertTrue(!noProfileResult.trustContext, "Trust context should not exist");
  });

  test("Without profile, result should not be trust blocked", () => {
    assertFalse(noProfileResult.trustBlocked, "Should not be trust blocked");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test 7: Trust profile source marking in effect
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 7: Source marking verification");

  // When trust profile is used, source should be clearly marked
  const sourceMarkingResult = await decode(aaveSupplyCalldata, {
    offline: true,
    targetAddress: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    profile: testProfile
  });

  test("When trust profile provides semantic source, it should be marked", () => {
    // Either the result source, effect source, or trustProfileVerified should indicate TRUST_PROFILE
    const hasTrustProfileMarker =
      sourceMarkingResult.source === "TRUST_PROFILE" ||
      sourceMarkingResult.effect?.source === "TRUST_PROFILE" ||
      sourceMarkingResult.effect?.trustProfileVerified === true;

    assertTrue(hasTrustProfileMarker, "TRUST_PROFILE source should be marked");
  });

  test("Trust profile effect should NOT be marked as ABI-verified", () => {
    // If using trust profile, verified should be false
    if (sourceMarkingResult.effect?.trustProfileVerified) {
      assertFalse(sourceMarkingResult.effect?.verified, "Should not be ABI-verified");
    }
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
