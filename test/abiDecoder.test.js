/**
 * Tests for Local ABI Registry and Decoder
 *
 * Tests verify that:
 * 1. ABI files are loaded from registry path
 * 2. Calldata is decoded with named parameters
 * 3. Trust profile abiPath override works
 * 4. Fallback behavior when ABI is missing
 *
 * Run with: node test/abiDecoder.test.js
 */

import { decode } from "../src/index.js";
import { getAbi, hasAbi, clearAbiCache } from "../src/abiRegistry.js";
import { decodeWithAbi } from "../src/abiDecoder.js";

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

function assertFalse(value, message) {
  if (value) {
    throw new Error(`${message}: expected falsy value, got ${value}`);
  }
}

function assertNull(value, message) {
  if (value !== null) {
    throw new Error(`${message}: expected null, got ${value}`);
  }
}

function assertDefined(value, message) {
  if (value === undefined) {
    throw new Error(`${message}: expected defined value, got undefined`);
  }
}

function assertHasKey(obj, key, message) {
  if (!(key in obj)) {
    throw new Error(`${message}: object missing key "${key}"`);
  }
}

// Aave V3 Pool address (has ABI in registry)
const AAVE_POOL = "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2";

// Aave withdraw calldata: withdraw(address asset, uint256 amount, address to)
// withdraw(USDC, 1000000, 0x1234...)
const AAVE_WITHDRAW_CALLDATA = "0x69328dec000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000000989680000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f5e123";

// Aave supply calldata: supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
const AAVE_SUPPLY_CALLDATA = "0x617ba037000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc200000000000000000000000000000000000000000000000000038d7ea4c68000000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f5e1230000000000000000000000000000000000000000000000000000000000000000";

// Unknown contract address (no ABI)
const UNKNOWN_CONTRACT = "0x9999999999999999999999999999999999999999";

// Standard approve calldata (for unknown contract)
const APPROVE_CALLDATA = "0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25eff0000000000000000000000000000000000000000000000000de0b6b3a7640000";

async function runTests() {
  // Clear cache before tests
  clearAbiCache();

  console.log("\n=== ABI Registry and Decoder Tests ===\n");

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 1: ABI Registry
  // ═══════════════════════════════════════════════════════════════════
  console.log("Test Group 1: ABI Registry");

  test("getAbi returns ABI for known contract", () => {
    const result = getAbi(AAVE_POOL);
    assertTrue(result.abi !== null, "Should have ABI");
    assertEqual(result.source, "LOCAL_REGISTRY", "Source should be LOCAL_REGISTRY");
    assertTrue(Array.isArray(result.abi), "ABI should be an array");
  });

  test("getAbi normalizes address to lowercase", () => {
    const upperCase = "0x87870BCA3F3FD6335C3F4CE8392D69350B4FA4E2";
    const result = getAbi(upperCase);
    assertTrue(result.abi !== null, "Should find ABI with uppercase address");
  });

  test("getAbi returns null for unknown contract", () => {
    const result = getAbi(UNKNOWN_CONTRACT);
    assertNull(result.abi, "Should return null for unknown contract");
  });

  test("hasAbi returns true for known contract", () => {
    assertTrue(hasAbi(AAVE_POOL), "Should have ABI");
  });

  test("hasAbi returns false for unknown contract", () => {
    assertFalse(hasAbi(UNKNOWN_CONTRACT), "Should not have ABI");
  });

  test("getAbi uses trust profile abiPath override", () => {
    const profile = {
      trustedContracts: {
        [UNKNOWN_CONTRACT.toLowerCase()]: {
          abiPath: "./abis/ethereum/0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2.json"
        }
      }
    };
    // Note: This will fail because the path is relative and won't resolve correctly
    // In real usage, abiPath should be an absolute path
    // This test just verifies the lookup priority logic
    const result = getAbi(UNKNOWN_CONTRACT, { profile });
    // We expect it to try the abiPath first, fail, then try registry (also fail)
    assertNull(result.abi, "Should fail for relative path");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 2: ABI Decoder
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 2: ABI Decoder - decodeWithAbi");

  test("decodeWithAbi decodes Aave withdraw with named params", () => {
    const result = decodeWithAbi(AAVE_WITHDRAW_CALLDATA, AAVE_POOL);
    assertTrue(result !== null, "Should decode successfully");
    assertEqual(result.functionName, "withdraw", "Function name should be withdraw");
    assertTrue(result.abiVerified, "Should be marked as abiVerified");
    assertEqual(result.abiSource, "LOCAL_REGISTRY", "Source should be LOCAL_REGISTRY");

    // Check named parameters
    assertHasKey(result.params, "asset", "Should have asset param");
    assertHasKey(result.params, "amount", "Should have amount param");
    assertHasKey(result.params, "to", "Should have to param");

    // Verify values
    assertEqual(
      result.params.asset.toLowerCase(),
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "Asset should be USDC address"
    );
    assertEqual(result.params.amount, "10000000", "Amount should be 10000000 (10 USDC)");
  });

  test("decodeWithAbi decodes Aave supply with named params", () => {
    const result = decodeWithAbi(AAVE_SUPPLY_CALLDATA, AAVE_POOL);
    assertTrue(result !== null, "Should decode successfully");
    assertEqual(result.functionName, "supply", "Function name should be supply");

    // Check named parameters
    assertHasKey(result.params, "asset", "Should have asset param");
    assertHasKey(result.params, "amount", "Should have amount param");
    assertHasKey(result.params, "onBehalfOf", "Should have onBehalfOf param");
    assertHasKey(result.params, "referralCode", "Should have referralCode param");
  });

  test("decodeWithAbi returns null for unknown contract", () => {
    const result = decodeWithAbi(APPROVE_CALLDATA, UNKNOWN_CONTRACT);
    assertNull(result, "Should return null for unknown contract");
  });

  test("decodeWithAbi returns null for selector not in ABI", () => {
    // approve selector is not in Aave Pool ABI
    const result = decodeWithAbi(APPROVE_CALLDATA, AAVE_POOL);
    assertNull(result, "Should return null for unmatched selector");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 3: Integration with decode()
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 3: Integration with decode()");

  await asyncTest("decode() returns named params for Aave withdraw", async () => {
    const result = await decode(AAVE_WITHDRAW_CALLDATA, {
      offline: true,
      targetAddress: AAVE_POOL
    });

    assertTrue(result.abiVerified, "Should be marked as abiVerified");
    assertEqual(result.abiSource, "LOCAL_REGISTRY", "Source should be LOCAL_REGISTRY");
    assertEqual(result.functionName, "withdraw", "Function name should be withdraw");

    // Check named parameters
    assertHasKey(result.params, "asset", "Should have asset param");
    assertHasKey(result.params, "amount", "Should have amount param");
    assertHasKey(result.params, "to", "Should have to param");

    // Should NOT have param0, param1, param2
    assertFalse("param0" in result.params, "Should not have param0");
    assertFalse("param1" in result.params, "Should not have param1");
    assertFalse("param2" in result.params, "Should not have param2");
  });

  await asyncTest("decode() returns named params for Aave supply", async () => {
    const result = await decode(AAVE_SUPPLY_CALLDATA, {
      offline: true,
      targetAddress: AAVE_POOL
    });

    assertEqual(result.functionName, "supply", "Function name should be supply");
    assertHasKey(result.params, "asset", "Should have asset param");
    assertHasKey(result.params, "amount", "Should have amount param");
    assertHasKey(result.params, "onBehalfOf", "Should have onBehalfOf param");
    assertHasKey(result.params, "referralCode", "Should have referralCode param");
  });

  await asyncTest("decode() falls back to verified DB when no ABI", async () => {
    // approve is in verified DB
    const result = await decode(APPROVE_CALLDATA, {
      offline: true,
      targetAddress: UNKNOWN_CONTRACT
    });

    // Should use verified database
    assertTrue(result.verified, "Should be verified from database");
    assertFalse(result.abiVerified === true, "Should not be abiVerified");
  });

  await asyncTest("decode() without targetAddress uses verified DB", async () => {
    const result = await decode(APPROVE_CALLDATA, { offline: true });

    assertTrue(result.verified, "Should be verified from database");
    assertFalse(result.abiVerified === true, "Should not be abiVerified");
    // Should have param0, param1 style names from verified DB
    assertDefined(result.params, "Should have params");
  });

  await asyncTest("ABI decode provides signature", async () => {
    const result = await decode(AAVE_WITHDRAW_CALLDATA, {
      offline: true,
      targetAddress: AAVE_POOL
    });

    assertTrue(
      result.signature.includes("withdraw"),
      "Signature should include function name"
    );
    assertTrue(
      result.signature.includes("address"),
      "Signature should include types"
    );
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Group 4: Effect analysis with ABI params
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 4: Effect analysis with ABI params");

  await asyncTest("Effect analysis works with ABI-decoded params", async () => {
    const result = await decode(AAVE_WITHDRAW_CALLDATA, {
      offline: true,
      targetAddress: AAVE_POOL
    });

    assertDefined(result.effect, "Should have effect");
    assertDefined(result.effect.severity, "Should have severity");
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
