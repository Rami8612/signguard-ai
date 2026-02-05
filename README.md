# SignGuard AI

**A visual, AI-powered transaction security tool that decodes Ethereum calldata into human-understandable consequences** — so you know exactly what you're signing before you sign it.

Built for **Safe multisig teams** who need to review transactions with confidence, SignGuard AI goes beyond raw hex and function names. It answers the question that actually matters: **"What happens to my assets and control if I sign this?"**

The recommended way to use SignGuard AI is through its **web interface**, which provides visual calldata analysis, batch transaction timelines, trust profile management, and AI-powered plain-English explanations — all in one place.

## The Problem

When signing an Ethereum transaction—especially a Safe multisig transaction—users are presented with raw hexadecimal calldata. Most people sign based on trust in the interface, the dApp, or whoever requested the signature.

This creates risk:
- A legitimate-looking approval could grant unlimited token spending
- A Safe transaction could enable a module with autonomous execution power
- A DELEGATECALL could run arbitrary code with your Safe's full permissions
- An owner change could shift control away from intended parties

Generic calldata decoders show function names and parameters, but they don't answer the question that matters: **"What happens to my assets and control if I sign this?"**

## Who This Tool Is For

- **Safe/Gnosis multisig signers** reviewing transactions before signing
- **Security reviewers** auditing proposed multisig operations
- **Developers** building transaction review interfaces
- **Security-conscious users** who want to understand transaction consequences

This tool is not a replacement for understanding what you're signing. It's an aid for those who want to verify consequences before committing.

---

## Quick Start (Web App)

```bash
# 1. Install dependencies
npm install
cd web && npm install && cd ..

# 2. Configure AI (optional but recommended — get a free key at aistudio.google.com)
cp .env.example .env
# Edit .env and add: IA_GEMINI_API_KEY=your_key_here

# 3. Start the app
npm run dev
```

| Service | URL |
|---------|-----|
| **Web Interface** | http://localhost:5173 |
| **API Server** | http://localhost:3001 |

The `npm run dev` command starts both the API server and the web frontend simultaneously.

---

## Web Interface

The web UI is the primary way to interact with SignGuard AI. It provides a two-panel layout — input on the left, results on the right — designed for rapid transaction review.

### Core Features

| Feature | Description |
|---------|-------------|
| **Visual Calldata Analysis** | Paste raw calldata or a transaction hash and get a full visual breakdown of function, parameters, consequences, and severity |
| **Safe Multisig Deep Inspection** | Automatically detects `execTransaction`, distinguishes CALL vs DELEGATECALL, and surfaces Safe-specific risks (module changes, owner changes, threshold manipulation) |
| **Batch (MultiSend) Visualization** | Interactive timeline view of all sub-transactions in a Safe MultiSend batch, with per-call severity indicators and an overall batch summary |
| **Transaction Hash Lookup** | Fetch a transaction by hash from an RPC endpoint — auto-fills calldata, target address, and operation type |
| **Trust Profile Upload & Editor** | Upload existing trust profile JSON files or create and edit profiles directly in the browser with a visual interface |
| **ABI Manager** | Add, list, and delete contract ABIs from the UI — supports multiple chains (Ethereum, Polygon, Arbitrum, Optimism, Base, Gnosis) |
| **AI-Powered Explanations** | One-click plain-English explanations powered by your choice of AI provider (Gemini, Claude, OpenAI, OpenRouter, Ollama) |
| **Severity Alerts & Visual Indicators** | Color-coded severity badges (CRITICAL, HIGH, WARN, OK, UNKNOWN) — the header pulses red on CRITICAL transactions |
| **Trust Context Display** | When a trust profile is loaded, shows contract classification, selector assessment, and usage history inline with results |
| **Settings Persistence** | AI provider and model preferences are saved in localStorage across sessions |

### AI Provider Support

The web interface lets you select your preferred AI provider and model for generating explanations. **Google Gemini** is the default and recommended provider — it's fast and has a free tier.

| Provider | Models | API Key Variable |
|----------|--------|------------------|
| **Google Gemini** (Default) | Gemini 3 Flash/Pro, 2.5 Flash/Pro, 2.0 Flash | `IA_GEMINI_API_KEY` |
| **OpenRouter** | Claude, GPT-4, Gemini, Llama, etc. | `OPENROUTER_API_KEY` |
| **Claude (Anthropic)** | Claude 3 Haiku/Sonnet/Opus, Claude 3.5 | `ANTHROPIC_API_KEY` |
| **OpenAI** | GPT-4o, GPT-4 Turbo, GPT-3.5 | `OPENAI_API_KEY` |
| **Ollama (Local)** | Any locally installed model | None (local) |

You can also enter custom model IDs if your provider supports models not in the default list. The system automatically uses the first available provider in priority order: **Gemini** > OpenRouter > Claude > OpenAI > Ollama.

---

## What This Tool Analyzes

Given raw calldata, the tool:

1. **Identifies the function** using a verified selector database
2. **Decodes parameters** using ethers.js ABI decoding
3. **Analyzes consequences** in terms of:
   - What changes after signing
   - Who gains or loses power/control
   - Whether effects are permanent or reversible
   - What assets are at risk
4. **Generates human-readable output** prioritizing consequences over technical details

### Supported Operation Categories

| Category | Examples |
|----------|----------|
| Token Approvals | `approve`, `setApprovalForAll`, `permit` |
| Token Transfers | `transfer`, `transferFrom`, `safeTransferFrom` |
| DEX Operations | Uniswap swaps, liquidity provision |
| Ownership Changes | `transferOwnership`, `renounceOwnership` |
| Proxy Upgrades | `upgradeTo`, `upgradeToAndCall` |
| Safe Multisig | `execTransaction`, `enableModule`, `addOwner`, `changeThreshold` |
| Batch Transactions | Safe `multiSend` parsing (sub-transactions listed) |

### Safe/Gnosis Multisig Support

The tool has deep support for Safe operations:

- **execTransaction**: Distinguishes CALL vs DELEGATECALL
- **multiSend**: Parses batch transactions into individual sub-transactions
- **Module changes**: Flags that modules can execute without signatures
- **Owner changes**: Explains who gains/loses signing authority
- **Threshold changes**: Warns when threshold=1 allows single-signer control
- **Guard changes**: Explains that guards can block all transactions

## What This Tool Does NOT Analyze

| Out of Scope | Reason |
|--------------|--------|
| Nested batches (batches within batches) | Only single-level batch analysis is supported |
| Behavior of enabled modules | Cannot predict what module code will do |
| Guard contract logic | Cannot verify if guard is safe or malicious |
| Current on-chain state | Tool works offline with calldata only |
| Signature validity | Analyzes intent, not cryptographic correctness |
| Contract source code | Only analyzes the calldata being signed |
| Token decimals/symbols | No on-chain queries for metadata |
| Historical context | Cannot know if this is a routine or unusual operation |

The tool tells you what the calldata **instructs**. It cannot tell you whether the target contracts are trustworthy or what they will do with the permissions granted.

## Why This Tool Is Different

Most calldata decoders output:
```
Function: approve(address,uint256)
  spender: 0x7a25...
  amount: 115792089237316195423570985008687907853269...
```

This tool outputs:
```
## What This Transaction Does
You are granting token spending permission to another address.

## What Changes After Signing
- The spender address gains the ability to transfer ANY AMOUNT of this token
- No further approval is needed for future transfers
- This permission remains active until you explicitly revoke it

## Who Benefits or Gains Control
**Spender:** 0x7a25... gains unlimited access to your tokens

## Permanence & Reversibility
This remains active until you explicitly revoke it by setting approval to 0.

SEVERITY: CRITICAL
```

The difference: **consequences before parameters, power changes before addresses**.

---

## Configuration

Copy `.env.example` to `.env` and configure your AI provider:

```bash
cp .env.example .env
```

**Minimum configuration** (recommended):

```bash
IA_GEMINI_API_KEY=your_gemini_key_here
```

**All available environment variables:**

```bash
# Server
PORT=3001                      # API server port

# AI Providers (Gemini is default and recommended)
IA_GEMINI_API_KEY=               # Google Gemini (default) - get free key at aistudio.google.com
OPENROUTER_API_KEY=           # OpenRouter - access multiple models
ANTHROPIC_API_KEY=            # Claude direct API
OPENAI_API_KEY=               # OpenAI GPT models
OLLAMA_URL=http://localhost:11434  # Local Ollama (no key needed)
```

---

## CLI Usage (Advanced)

The command-line interface provides direct access to the decoder for scripting, automation, and advanced use cases.

```bash
# Basic decode
node bin/decode.js <calldata>

# Offline mode (no 4byte.directory lookup)
node bin/decode.js --offline <calldata>

# JSON output
node bin/decode.js --json <calldata>

# AI-powered plain English explanation (requires API key)
node bin/decode.js --explain <calldata>

# From stdin
echo "0x095ea7b3..." | node bin/decode.js --stdin

# Batch transaction (Safe MultiSend) - automatically detected and parsed
node bin/decode.js 0x8d80ff0a...
```

### Batch Transaction Output

When decoding a Safe MultiSend batch transaction, the tool automatically detects, parses, and analyzes each sub-transaction:

```
╔════════════════════════════════════════════════════════════════════╗
║                     Batch: 3 sub-transactions                      ║
╚════════════════════════════════════════════════════════════════════╝

Type: MULTISEND
Overall Severity: UNKNOWN ?

SUB-TRANSACTIONS:

[1/3] ⚠ CALL → HIGH
  Target: 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
  Function: approve [VERIFIED]
  Effect: A spender address can transfer tokens from your wallet

[2/3] ~ CALL → MEDIUM
  Target: 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  Value: 500000000000000000 wei
  Action: ETH transfer

[3/3] ? CALL → UNKNOWN
  Target: 0x1234567890123456789012345678901234567890
  Selector: 0xdeadbeef [UNKNOWN]
  Effect: Cannot determine the consequences of this transaction

────────────────────────────────────────────────────────────────────

BATCH SUMMARY:
  ✓ OK:      1
  ⚠ WARN:    1
  ✗ DANGER:  0
  ? UNKNOWN: 1

NOTE: Sub-transactions are shown in execution order.
All operations execute atomically - all succeed or all fail.
```

**Batch Analysis Features:**
- Each sub-transaction is analyzed using the same decode pipeline
- Trust profile context is applied per sub-transaction target
- DELEGATECALL operations are always flagged as CRITICAL
- Overall batch severity = maximum severity of all sub-transactions
- Summary shows counts of OK/WARN/DANGER/UNKNOWN operations

### Trust Profile Analysis (CLI)

```bash
# Decode with trust profile context
node bin/decode.js <calldata> --target <contract_address> --profile <path_to_profile.json>

# Generate an empty trust profile template
node bin/decode.js --init-profile <safe_address> > my-safe-profile.json

# Example: Analyze a transaction to WETH with trust profile
node bin/decode.js 0x095ea7b3... --target 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --profile profiles/example-profile.json
```

See the [Trust Profile System](#trust-profile-system) section below for detailed documentation.

---

## Trust Profile System

The Trust Profile system enables **context-aware transaction analysis** based on your Safe's expected interactions. Instead of analyzing transactions in isolation, the tool can warn when:

- A transaction targets a contract **not in your trusted set**
- A selector is being used **for the first time** with a contract
- A selector is **not whitelisted** for a trusted contract

Trust profiles can be created and managed through the **web UI's visual editor** or as JSON files for CLI usage.

### Why Trust Profiles?

**The Problem**: A selector like `0x3ccfd60b` might match `withdraw()` in 4byte.directory, but this is meaningless without knowing the contract. An attacker could deploy a malicious contract where `withdraw()` actually drains your Safe.

**The Solution**: Trust profiles anchor analysis on **contract addresses**, not selectors. Selectors are only interpreted meaningfully when the target contract is explicitly trusted.

### Trust Profile Structure

```json
{
  "safeAddress": "0xYourSafe...",
  "version": "1.0",
  "trustedContracts": {
    "0xContractAddress...": {
      "label": "Aave V3 Pool",
      "trustLevel": "PROTOCOL",
      "allowedSelectors": ["0x617ba037", "0x69328dec"],
      "allowedSelectorsLabels": {
        "0x617ba037": "supply",
        "0x69328dec": "withdraw"
      },
      "notes": "Main lending pool - audited"
    }
  },
  "selectorUsageHistory": {
    "0xContractAddress...": {
      "0x617ba037": { "count": 47, "lastUsed": "2025-12-01" }
    }
  }
}
```

### Trust Levels

| Level | Description | Selector Handling |
|-------|-------------|-------------------|
| `INTERNAL` | Team-controlled contracts | All selectors allowed (`"*"`) |
| `PROTOCOL` | Verified DeFi protocols | Only whitelisted selectors |
| `PARTNER` | Known external parties | Only whitelisted selectors |
| `WATCHED` | Recognized but untrusted | No selector interpretation |

### Contract Classification

| Classification | Meaning | Tool Behavior |
|----------------|---------|---------------|
| `TRUSTED` | Contract is in profile with INTERNAL/PROTOCOL/PARTNER level | Full analysis with trust context |
| `WATCHED` | Contract is in profile but marked for observation only | Warning displayed, no trusted interpretation |
| `UNKNOWN` | Contract not in profile | **Blocks interpretation** - shows strong warning |

### Selector Classification

For trusted contracts, selectors are further classified:

| Classification | Meaning | Severity Impact |
|----------------|---------|-----------------|
| `EXPECTED` | Whitelisted and commonly used | No adjustment |
| `UNUSUAL` | Whitelisted but rarely used (≤2 times) | Elevated |
| `NEVER_USED` | Whitelisted but first-time use | Elevated + warning |
| `NOT_ALLOWED` | Not in whitelist for this contract | **CRITICAL** |

### Example Output: Unknown Contract

When a transaction targets a contract not in your trust profile:

```
╔══════════════════════════════════════════════════════════════════════╗
║  ⚠️   UNKNOWN CONTRACT - TRUST PROFILE WARNING                        ║
╚══════════════════════════════════════════════════════════════════════╝

TARGET CONTRACT:
  Address: 0xUnknown...
  Status: NOT IN TRUST PROFILE

This contract is NOT part of your Safe's expected interaction set.

WHAT WE CAN DETERMINE:
  • Selector: 0x3ccfd60b
  • 4byte.directory suggests: "withdraw()"
    ⚠️  DO NOT TRUST THIS NAME - it is UNVERIFIED

╔══════════════════════════════════════════════════════════════════════╗
║  WHAT THIS MEANS                                                     ║
║  We CANNOT tell you what this transaction does.                      ║
║  The function name is MEANINGLESS without knowing the contract's     ║
║  actual implementation. A function called "withdraw" could:          ║
║    • Withdraw funds (if honest)                                      ║
║    • Transfer ownership (if malicious)                               ║
║    • Drain all assets (if malicious)                                 ║
╚══════════════════════════════════════════════════════════════════════╝

SEVERITY: UNKNOWN
```

### Example Output: Trusted Contract

When a transaction targets a trusted contract:

```
╔════════════════════════════════════════════════════════════════════╗
║                      TRUST PROFILE ASSESSMENT                      ║
╚════════════════════════════════════════════════════════════════════╝

TARGET CONTRACT:
  Label: WETH
  Trust Level: PROTOCOL ✓

SELECTOR ASSESSMENT:
  Expected function: approve
  Status: EXPECTED ✓ (commonly used with this contract)
  Previous usage: 156 times
  Last used: 2025-12-10

[... normal consequence analysis follows ...]
```

### Creating a Trust Profile

**Via the Web UI (recommended):**
Open the Trust Profile Editor from the web interface to create and manage profiles visually.

**Via the CLI:**

1. Generate a template:
   ```bash
   node bin/decode.js --init-profile 0xYourSafeAddress > my-profile.json
   ```

2. Edit the profile to add your trusted contracts:
   - Add contract addresses your Safe regularly interacts with
   - Set appropriate trust levels
   - Whitelist only the selectors you expect to use
   - Add usage history if you have it (optional)

3. Use the profile when decoding:
   ```bash
   node bin/decode.js <calldata> --target <contract> --profile my-profile.json
   ```

### Security Principles

1. **Trust is anchored on addresses, not selectors** - A recognized selector name means nothing without a trusted contract
2. **Unknown contracts are always high-risk** - The tool refuses to interpret selectors for unknown contracts
3. **No on-chain validation** - Profiles are static JSON files, no network requests
4. **Classify, don't block** - The tool warns but never prevents signing

### Integration with Safe UI

Trust profiles are designed to be embedded in Safe transaction review flows:

```javascript
import { decode, loadProfile } from 'calldata-decoder';

const profile = loadProfile('./safe-profile.json');
const result = await decode(calldata, {
  targetAddress: '0x...',
  profile: profile
});

if (result.trustBlocked) {
  // Show strong warning - unknown contract
}

if (result.trustContext?.warnings?.length > 0) {
  // Show trust warnings
}
```

---

## Threat Model

### Threats This Tool Helps Mitigate

| Threat | How the Tool Helps |
|--------|-------------------|
| **Blind signing** | Shows consequences in plain language before signing |
| **Unlimited approvals** | Explicitly flags MAX_UINT256 approvals as "UNLIMITED" |
| **Hidden DELEGATECALL** | Prominently warns that external code runs in Safe's context |
| **Module backdoors** | Explains that enabled modules bypass signature requirements |
| **Threshold manipulation** | Warns when threshold=1 enables single-signer control |
| **Guard lock-out risk** | Explains that malicious guards can block all transactions |
| **Owner replacement attacks** | Shows exactly who gains and loses signing power |
| **Unverified functions** | Refuses to assess risk for unknown selectors |
| **Unknown contract phishing** | Trust profiles warn when target is not in expected set |
| **Selector name spoofing** | Refuses to interpret selectors for untrusted contracts |
| **First-time function calls** | Warns when a selector has never been used with a contract |
| **Unexpected contract interactions** | Trust profiles highlight deviations from normal behavior |

### Threats Out of Scope

| Threat | Why Out of Scope |
|--------|------------------|
| **Malicious contract logic** | Tool analyzes calldata, not contract code |
| **Compromised module behavior** | Cannot predict what enabled modules will do |
| **Phishing/social engineering** | Tool doesn't validate the source of the transaction |
| **Front-running/MEV** | Tool analyzes intent, not execution environment |
| **Signature replay** | Tool doesn't track nonces or chain state |
| **Multi-step attacks** | Each transaction analyzed in isolation |
| **Upgradeable proxy destinations** | Cannot know what implementation will be called |
| **Time-dependent logic** | No awareness of block timestamps or deadlines |

### Trust Assumptions

1. **The verified selector database is correct** - Selectors are manually verified against known contract ABIs
2. **ethers.js ABI decoding is correct** - Parameter decoding relies on ethers.js
3. **4byte.directory results are untrusted** - External lookups are marked UNVERIFIED and never influence risk assessment
4. **Trust profiles are team-maintained** - The team is responsible for correctly configuring trusted contracts and selectors
5. **Contract addresses in profiles are verified** - Adding a wrong address to a profile could create false trust

---

## Philosophy

### Deterministic Analysis

Given the same calldata, the tool always produces the same output. There is no machine learning, no probabilistic assessment, no "confidence scores." Either the function signature is verified and consequences are known, or it's marked as unverified with unknown risk.

### Power-Centric Model

Traditional decoders focus on **what function is called**. This tool focuses on **who gains or loses power**:

- Who can now move assets without further approval?
- Who can now execute transactions without signatures?
- Who gains or loses signing authority?
- What restrictions are being added or removed?

This framing helps signers understand the **control implications**, not just the technical operation.

### No Heuristics, No On-Chain Assumptions

The tool does not:
- Guess based on contract names or addresses
- Assume "known" addresses are safe
- Query on-chain state to infer context
- Use pattern matching to estimate risk

If a selector isn't in the verified database, the tool says "unknown" rather than guessing. Known addresses (like Uniswap Router) are displayed for reference but do not influence severity assessment.

### Honest Uncertainty

When the tool cannot determine consequences, it says so clearly:

```
SEVERITY: UNKNOWN
  Reason: Cannot analyze effects of unverified function

⚠️  UNVERIFIED FUNCTION SIGNATURE
  We CANNOT determine the consequences of signing this transaction.
```

The tool does not fabricate certainty.

---

## Interpretation Source Hierarchy

The decoder evaluates multiple sources to identify and decode function calls. Sources are evaluated in **strict priority order** - higher priority sources always take precedence over lower ones.

### Priority Order

| Priority | Source | Description | Trustworthiness |
|----------|--------|-------------|-----------------|
| 1 (Highest) | **Verified Database** | Manually curated selectors in `src/selectors.js` | Fully trusted |
| 2 | **Local ABI** | ABI files in `abis/<chain>/<address>.json` | Trusted (team-maintained) |
| 3 | **Trust Profile ABI** | ABI path specified in trust profile | Trusted (team-maintained) |
| 4 | **Trust Profile Label** | Selector label from trust profile | Semantic hint only |
| 5 (Lowest) | **4byte.directory** | External crowdsourced database | NEVER trusted for risk assessment |

### Source Indicators in Output

| `result.source` | `verified` | `abiVerified` | Meaning |
|-----------------|------------|---------------|---------|
| `"verified_database"` | `true` | - | Selector in verified database |
| `"LOCAL_REGISTRY"` | `false` | `true` | Decoded via local ABI file |
| `"TRUST_PROFILE_ABI"` | `false` | `true` | Decoded via trust profile ABI path |
| `"TRUST_PROFILE"` | `false` | `false` | Label from trust profile (no ABI) |
| `"4byte.directory"` | `false` | `false` | External lookup, unverified |

### Key Behaviors

1. **ABI always beats Trust Profile Label**: If a local ABI exists and decodes successfully, the result uses `"LOCAL_REGISTRY"` as source, even if the trust profile has a label for that selector.

2. **Verified Database is absolute**: Selectors in the verified database are never overridden by any other source.

3. **Trust Profile Label is a fallback**: Only used when the selector is NOT in the verified database AND no ABI is available.

4. **4byte.directory is display-only**: External lookups are shown as hints but NEVER influence risk assessment or severity.

### Example: Same Selector, Different Sources

```
Selector 0x69328dec on Aave V3 Pool (0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2):

With local ABI:
  source: "LOCAL_REGISTRY"
  abiVerified: true
  params: { asset: "0x...", amount: 1000000, to: "0x..." }  (named)

Without ABI, with trust profile:
  source: "TRUST_PROFILE"
  trustProfileVerified: true
  params: null  (cannot decode without ABI)

Without ABI, without profile:
  source: "4byte.directory"
  verified: false
  params: { param0: "0x...", param1: 1000000, param2: "0x..." }  (unnamed)
```

---

## Limitations

1. **Requires known function selectors** - Unknown selectors produce "UNKNOWN" risk assessment
2. **Single-level batch analysis** - Nested batches (batches within batches) are not recursively analyzed
3. **No state awareness** - Cannot compare "before" and "after" on-chain
4. **English only** - Output is in English
5. **Trust profiles are manual** - Profiles must be created and maintained by the team

---

## Project Structure

```
signguard_ai/
├── bin/
│   └── decode.js              # CLI entry point
├── src/
│   ├── index.js               # Main orchestration
│   ├── decoder.js             # Low-level ABI decoding
│   ├── selectors.js           # Verified selector database
│   ├── fourByte.js            # 4byte.directory client
│   ├── effectAnalyzer.js      # Consequence analysis engine
│   ├── formatter.js           # Output formatting
│   ├── batchParser.js         # Safe MultiSend batch parsing
│   ├── trustProfile.js        # Trust profile loading/validation
│   ├── trustClassifier.js     # Trust-based classification
│   ├── addressDisplay.js      # Address label utilities
│   ├── abiRegistry.js         # Local ABI file registry
│   ├── aiClient.js            # Multi-provider AI client
│   ├── explainer.js           # AI explanation orchestrator
│   └── explainerPrompt.js     # Safe prompt builder
├── api/
│   └── server.js              # Express REST API server
├── web/
│   ├── src/
│   │   ├── App.jsx            # Main React application
│   │   ├── components/
│   │   │   ├── InputPanel.jsx
│   │   │   ├── ResultsPanel.jsx
│   │   │   ├── AbiManager.jsx          # ABI management modal
│   │   │   ├── TrustProfileEditor.jsx  # Profile editor modal
│   │   │   ├── AIProviderSelector.jsx  # AI provider/model selector
│   │   │   ├── AIExplanationCard.jsx   # Markdown-rendered AI explanations
│   │   │   └── ...
│   │   └── hooks/
│   │       └── useDecoder.js  # API interaction hook
│   └── index.html
├── abis/                      # Local ABI storage
│   └── ethereum/              # Chain-specific ABIs
├── profiles/
│   └── example-profile.json   # Example trust profile
├── test/
│   ├── batchParser.test.js
│   ├── trustProfileBridge.test.js
│   └── aiExplainerTrustProfile.test.js
├── .env.example               # Environment configuration template
└── README.md
```

---

## Contributing

This tool prioritizes correctness over coverage. New selectors should only be added with:
1. Verified ABI from authoritative source
2. Clear consequence analysis
3. Accurate severity classification

Do not add selectors based on 4byte.directory alone.

### Trust Profile Contributions

Example trust profiles for common DeFi protocols are welcome, but must:
1. Use verified contract addresses from official sources
2. Include only well-documented selectors
3. Set appropriate trust levels (PROTOCOL for audited protocols)

---

## License

MIT
