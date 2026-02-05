/**
 * Tests for AI Explanation Layer - Trust Profile Support
 *
 * These tests verify that:
 * 1. Trust-profile-verified selectors get proper AI prompts (not UNKNOWN)
 * 2. The AI prompt acknowledges trust profile verification
 * 3. Unknown/untrusted contracts still get UNKNOWN treatment
 * 4. The source is clearly marked in explanations
 *
 * Run with: node test/aiExplainerTrustProfile.test.js
 */

import { buildExplainerPrompt } from "../src/explainerPrompt.js";
import { explain, formatExplanation } from "../src/explainer.js";
import { decode } from "../src/index.js";

// Test profile
const testProfile = {
  safeAddress: "0x1234567890123456789012345678901234567890",
  version: "1.0",
  trustedContracts: {
    "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2": {
      label: "Aave V3 Pool",
      trustLevel: "PROTOCOL",
      allowedSelectors: ["0x617ba037", "0x69328dec"],
      allowedSelectorsLabels: {
        "0x617ba037": "supply",
        "0x69328dec": "withdraw"
      },
      notes: "Aave V3 lending pool"
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

function assertContains(str, substring, message) {
  if (!str || !str.includes(substring)) {
    throw new Error(`${message}: expected "${str}" to contain "${substring}"`);
  }
}

function assertNotContains(str, substring, message) {
  if (str && str.includes(substring)) {
    throw new Error(`${message}: expected "${str}" to NOT contain "${substring}"`);
  }
}

async function runTests() {
  console.log("\n=== AI Explanation Layer - Trust Profile Support ===\n");

  // ═══════════════════════════════════════════════════════════════════
  // Test 1: Trust-profile-verified selector should NOT get UNKNOWN prompt
  // ═══════════════════════════════════════════════════════════════════
  console.log("Test Group 1: Trust-profile-verified prompt generation");

  const aaveSupplyCalldata = "0x617ba037000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000000";

  const aaveAnalysis = await decode(aaveSupplyCalldata, {
    offline: true,
    targetAddress: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    profile: testProfile
  });

  const prompt = buildExplainerPrompt(aaveAnalysis);

  test("Trust-profile-verified should NOT skip AI", () => {
    assertFalse(prompt.skipAI, "Should not skip AI for trust-profile-verified");
  });

  test("Prompt should have trustProfileVerified metadata", () => {
    assertTrue(prompt.metadata?.trustProfileVerified, "Should have trustProfileVerified in metadata");
  });

  test("Prompt should have TRUST_PROFILE source", () => {
    assertEqual(prompt.metadata?.source, "TRUST_PROFILE", "Source should be TRUST_PROFILE");
  });

  test("Prompt context should include contract label", () => {
    assertTrue(
      prompt.context?.contractLabel === "Aave V3 Pool" ||
      prompt.user?.includes("Aave V3 Pool"),
      "Should include contract label"
    );
  });

  test("Prompt context should include function label", () => {
    assertTrue(
      prompt.context?.functionLabel === "supply" ||
      prompt.user?.includes("supply"),
      "Should include function label"
    );
  });

  test("System prompt should NOT tell AI to describe as unknown", () => {
    assertNotContains(
      prompt.system,
      "unknown action",
      "System prompt should not mention unknown action"
    );
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test 2: Unknown contract should still get UNKNOWN prompt
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 2: Unknown contract prompt generation");

  const unknownAnalysis = await decode(aaveSupplyCalldata, {
    offline: true,
    targetAddress: "0x9999999999999999999999999999999999999999",
    profile: testProfile
  });

  const unknownPrompt = buildExplainerPrompt(unknownAnalysis);

  test("Unknown contract should skip AI", () => {
    assertTrue(unknownPrompt.skipAI, "Should skip AI for unknown contracts");
  });

  test("Unknown contract should have UNKNOWN severity", () => {
    assertEqual(unknownPrompt.metadata?.severity, "UNKNOWN", "Severity should be UNKNOWN");
  });

  test("Unknown contract response should say 'could not be verified'", () => {
    assertContains(
      unknownPrompt.fixedResponse?.summary,
      "could not be verified",
      "Should mention verification failure"
    );
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test 3: Verified selector (ABI-verified) should work normally
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 3: ABI-verified selector prompt generation");

  // ERC20 approve (in verified database)
  const approveCalldata = "0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25eff0000000000000000000000000000000000000000000000000de0b6b3a7640000";

  const approveAnalysis = await decode(approveCalldata, {
    offline: true,
    targetAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    profile: testProfile
  });

  const approvePrompt = buildExplainerPrompt(approveAnalysis);

  test("ABI-verified selector should NOT skip AI", () => {
    assertFalse(approvePrompt.skipAI, "Should not skip AI for verified");
  });

  test("ABI-verified selector should have verified=true", () => {
    assertTrue(approvePrompt.metadata?.verified, "Should be verified");
  });

  test("ABI-verified selector should NOT be trustProfileVerified", () => {
    assertFalse(approvePrompt.metadata?.trustProfileVerified, "Should not be trust profile verified");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test 4: Explain function with trust profile
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 4: Full explain flow with trust profile");

  // Skip actual AI call, just check the prompt
  const explainResult = await explain(aaveAnalysis, { skipAI: true });

  test("Explain should succeed for trust-profile-verified", () => {
    assertTrue(explainResult.success, "Should succeed");
  });

  test("Explain result should have trustProfileVerified", () => {
    assertTrue(explainResult.trustProfileVerified, "Should have trustProfileVerified");
  });

  test("Explain result should have TRUST_PROFILE source", () => {
    assertEqual(explainResult.source, "TRUST_PROFILE", "Source should be TRUST_PROFILE");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test 5: Format explanation with trust profile
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 5: Format explanation for trust profile");

  // Create a mock successful result
  const mockTrustProfileResult = {
    success: true,
    verified: false,
    trustProfileVerified: true,
    source: "TRUST_PROFILE",
    explanation: {
      text: "This calls the supply function on Aave V3 Pool."
    },
    severity: "MEDIUM"
  };

  const formatted = formatExplanation(mockTrustProfileResult);

  test("Formatted output should mention Trust Profile verification", () => {
    assertContains(formatted, "Trust Profile", "Should mention Trust Profile");
  });

  test("Formatted output should NOT show UNVERIFIED warning", () => {
    assertNotContains(formatted, "UNVERIFIED TRANSACTION", "Should not show unverified warning");
  });

  test("Formatted output should show verification source", () => {
    assertContains(formatted, "TRUST_PROFILE", "Should show TRUST_PROFILE source");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test 6: User prompt content for trust profile
  // ═══════════════════════════════════════════════════════════════════
  console.log("\nTest Group 6: User prompt content verification");

  test("User prompt should mention Trust Profile verification", () => {
    assertContains(prompt.user, "TRUST PROFILE", "Should mention trust profile");
  });

  test("User prompt should include trust level", () => {
    assertContains(prompt.user, "PROTOCOL", "Should include trust level");
  });

  test("User prompt should include function label", () => {
    assertContains(prompt.user, "supply", "Should include function label");
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
