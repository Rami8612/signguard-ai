# SignGuard AI - Roadmap

## Phase 1: Core Decoding Engine
> Foundation for calldata analysis

- [x] Extract 4-byte function selectors from calldata
- [x] ABI parameter decoding using ethers.js
- [x] Verified selector database (manually curated)
- [x] 4byte.directory fallback lookup
- [x] Mark external lookups as UNVERIFIED
- [x] Handle decoding errors gracefully
- [x] Normalize calldata input (0x prefix, validation)

## Phase 2: Consequence Analysis
> Power-centric effect analysis

- [x] Define effect type taxonomy (PERMISSION_GRANT, ASSET_TRANSFER, etc.)
- [x] Severity classification system (CRITICAL, HIGH, MEDIUM, LOW, UNKNOWN)
- [x] Permanence classification (IMMEDIATE, PERMANENT, REVERSIBLE)
- [x] Consequence text generation
- [x] Warning generation based on effect type
- [x] Mitigation suggestions
- [x] Scope detection (UNLIMITED approvals, etc.)
- [x] Beneficiary identification

## Phase 3: Token Operations Support
> ERC20, ERC721, ERC1155

- [x] ERC20 `approve` - unlimited approval detection
- [x] ERC20 `transfer` / `transferFrom`
- [x] ERC721 `setApprovalForAll`
- [x] ERC721 `safeTransferFrom`
- [x] ERC1155 `safeTransferFrom` / `safeBatchTransferFrom`
- [x] EIP-2612 `permit` (gasless approvals)
- [x] WETH `deposit` / `withdraw`
- [x] Revocation detection (amount = 0)

## Phase 4: DEX Operations Support
> Uniswap, liquidity operations

- [x] Uniswap V2 swap functions
- [x] Uniswap V3 swap functions
- [x] Liquidity provision detection
- [x] Liquidity removal detection
- [x] Deadline/slippage parameter extraction
- [x] Recipient address extraction

## Phase 5: Ownership & Upgrades
> Contract control operations

- [x] `transferOwnership` analysis
- [x] `renounceOwnership` - irreversibility warning
- [x] `upgradeTo` proxy upgrades
- [x] `upgradeToAndCall` with initialization

## Phase 6: Safe/Gnosis Multisig Deep Support
> Comprehensive Safe transaction analysis

- [x] `execTransaction` - CALL vs DELEGATECALL detection
- [x] `execTransactionFromModule` - module execution
- [x] `enableModule` - autonomous execution warning
- [x] `disableModule` - module removal
- [x] `addOwnerWithThreshold` - signer addition
- [x] `removeOwner` - signer removal
- [x] `swapOwner` - signer replacement
- [x] `changeThreshold` - threshold=1 warning
- [x] `setGuard` - lock-out risk warning
- [x] `setFallbackHandler` - handler change
- [x] DELEGATECALL severity elevation
- [x] Power change visualization (WHO GAINS/LOSES)
- [x] Safe-specific output formatting

## Phase 7: Output Formatting
> Human-readable and structured output

- [x] Human-readable consequence-first format
- [x] Box drawing and visual hierarchy
- [x] JSON structured output
- [x] Safe-specific JSON fields
- [x] Known address labels (Uniswap, Safe singletons, etc.)
- [x] Text wrapping for long content
- [x] Error formatting

## Phase 8: AI Explanation Layer
> Plain English explanations

- [x] OpenRouter API integration
- [x] Safe prompt building (no raw calldata to AI)
- [x] AI as translator, not risk assessor
- [x] Prompt safety validation
- [x] Model configuration (Claude, etc.)
- [x] Graceful degradation without API key
- [x] `--explain` and `--explain-only` CLI options
- [x] **Multi-provider support** (OpenRouter, Claude, OpenAI, Gemini, Ollama)
- [x] **Custom model ID input** - use any model supported by provider
- [x] **Provider auto-detection** - uses first available API key
- [x] **Local Ollama support** - no API key required
- [x] **Structured explanation format** - AI outputs with ## headers, bullet points, clear sections
- [x] **Provider-specific API key handling** - each provider uses its own key correctly

## Phase 9: CLI Interface
> Command-line tooling

- [x] Basic calldata argument
- [x] `--offline` mode
- [x] `--json` output
- [x] `--stdin` input
- [x] `--explain` AI explanation
- [x] `--explain-only` mode
- [x] `--model` selection
- [x] Environment variable configuration (.env)
- [x] Error handling and exit codes

## Phase 10: Safe Trust Profile System
> Context-aware analysis based on expected team behavior

- [x] Trust profile JSON schema design
- [x] Profile loading and validation
- [x] Address normalization (case-insensitive)
- [x] Trust levels (INTERNAL, PROTOCOL, PARTNER, WATCHED)
- [x] Contract classification (TRUSTED, WATCHED, UNKNOWN)
- [x] Selector whitelisting per contract
- [x] Selector classification (EXPECTED, UNUSUAL, NEVER_USED, NOT_ALLOWED)
- [x] Usage history tracking structure
- [x] `--target` CLI option for contract address
- [x] `--profile` CLI option for profile path
- [x] `--init-profile` template generation
- [x] Trust context in human-readable output
- [x] Trust context in JSON output
- [x] Unknown contract blocking (refuse interpretation)
- [x] First-time selector warnings
- [x] Severity adjustment based on trust context
- [x] Example trust profile (Aave, WETH, Uniswap)
- [x] README documentation

---

## Phase 11: Trust Profile to Consequence Analysis Bridge
> Semantic interpretation from trust profile when ABI is unavailable

- [x] `TRUST_PROFILE` source type for selector info
- [x] `trustProfileVerified` flag distinct from ABI-verified
- [x] Trust profile label as semantic source for allowed selectors
- [x] Parameter decoding only when function name matches label
- [x] `TRUST_PROFILE_SEMANTIC` effect type
- [x] Severity heuristics based on function name patterns
- [x] Clear "Source: TRUST_PROFILE" marking in human output
- [x] Clear source marking in JSON output
- [x] Preserve UNKNOWN treatment for untrusted contracts
- [x] Test suite for trust profile bridge behavior
- [x] AI explanation layer updated for trust profile support
- [x] AI prompts acknowledge trust profile verification (not describe as "unknown")
- [x] AI fallback explanations for trust-profile-verified selectors
- [x] AI test suite for trust profile explanation behavior
- [x] Trusted asset registry in trust profile (`trustedAssets` section)
- [x] Address display utilities module (`addressDisplay.js`)
- [x] Human summaries use labels from trusted registry only
- [x] Generic descriptions for addresses NOT in trusted registry
- [x] Full addresses always shown in Technical Details sections
- [x] Security: never infer token symbols from calldata/external sources
- [x] **Interpretation Source Hierarchy** - ABI takes precedence over Trust Profile label

### Interpretation Source Hierarchy

The decoder evaluates multiple sources in strict priority order. **Higher priority sources always take precedence**:

| Priority | Source | `result.source` | Condition |
|----------|--------|-----------------|-----------|
| 1 (Highest) | Verified Database | `"verified_database"` | Selector in `src/selectors.js` |
| 2 | Local ABI | `"LOCAL_REGISTRY"` | ABI file at `abis/<chain>/<address>.json` |
| 3 | Trust Profile ABI | `"TRUST_PROFILE_ABI"` | ABI path in trust profile's `abiPath` |
| 4 | Trust Profile Label | `"TRUST_PROFILE"` | Label in profile, NOT verified, NOT abiVerified |
| 5 (Lowest) | 4byte.directory | `"4byte.directory"` | External lookup, always marked UNVERIFIED |

**Key behavior:**
- ABI decoding (priorities 2-3) provides named parameters and full signature
- Trust Profile Label (priority 4) only activates when `!verified && !abiVerified`
- 4byte.directory is never used for risk assessment, only as display hint

---

## Phase 12: Batch / Nested Transactions Support
> Parse and analyze Safe MultiSend batch transactions

**Step 1: Parsing (Complete)**
- [x] Detect MultiSend and MultiSendCallOnly selectors
- [x] Parse batch calldata into ordered sub-transactions
- [x] Extract operation type (CALL vs DELEGATECALL) per sub-transaction
- [x] Extract target address per sub-transaction
- [x] Extract ETH value per sub-transaction
- [x] Extract raw calldata per sub-transaction
- [x] Preserve exact execution order
- [x] Fail safely with UNPARSEABLE_BATCH on parse errors
- [x] Known MultiSend contract address recognition
- [x] DELEGATECALL validation for MultiSendCallOnly variant

**Step 2: Sub-transaction Analysis (Complete)**
- [x] Run decode pipeline on each sub-transaction
- [x] Apply trust profile context per sub-transaction target
- [x] Attach analysis results to each call (call.analysis)
- [x] Calculate overall batch severity (max of subcalls)
- [x] DELEGATECALL always flagged as CRITICAL
- [x] Unknown contracts flagged with trust profile
- [x] Batch summary counts (OK/WARN/DANGER/UNKNOWN)
- [x] CLI output: "Batch: N sub-transactions" header
- [x] Per-subcall severity indicators and summaries
- [x] JSON output includes analysis per call and batchSummary
- [x] Test suite extended (41 tests total)

**Remaining (Future)**
- [ ] Cross-operation dependency detection
- [ ] Nested batch detection (batches within batches)

## Phase 13: Enhanced Trust Profiles (Planned)
> Advanced trust profile features

- [ ] Profile schema versioning and migration
- [ ] Multiple profile support (dev, prod, etc.)
- [ ] Profile inheritance (base + overrides)
- [ ] Automatic usage history updates
- [ ] Profile export from transaction history
- [ ] Contract ABI embedding in profiles
- [ ] Selector auto-discovery from verified contracts
- [ ] Profile diff tool (compare two profiles)

## Phase 14: Extended Protocol Support (Planned)
> More DeFi protocol coverage

- [ ] Aave V3 operations
- [ ] Compound V3 operations
- [ ] Curve pool operations
- [ ] Balancer operations
- [ ] 1inch aggregator
- [ ] 0x Exchange
- [ ] Lido staking
- [ ] Rocket Pool
- [ ] ENS operations
- [ ] OpenSea Seaport

## Phase 15: Web Interface
> Browser-based analysis

- [x] React web UI with Vite
- [x] Two-panel layout (Input / Results)
- [x] Calldata input with validation
- [x] Target address input
- [x] Trust profile upload (JSON)
- [x] **ABI Manager modal** - add, list, delete ABIs
- [x] **Trust Profile Editor modal** - create/edit profiles visually
- [x] **AI Provider Selector** - choose provider and model
- [x] **Custom model input** - enter any model ID
- [x] **Settings persistence** - localStorage for AI preferences
- [x] Real-time decode results display
- [x] Severity badges and visual indicators
- [x] Trust context display card
- [x] AI explanation display card
- [x] Parameters display card
- [x] Effect/consequences display card
- [x] Batch transaction timeline view
- [x] **Markdown rendering for AI explanations** - headers, bullet points, bold text, code
- [x] **Critical severity visual alert** - header pulses red on CRITICAL transactions
- [ ] Drag-and-drop calldata input
- [ ] Visual consequence diagrams
- [ ] Side-by-side comparison view
- [ ] Transaction history view
- [ ] Export reports (PDF, markdown)

## Phase 16: Safe App Integration (Planned)
> Native Safe{Wallet} integration

- [ ] Safe App manifest
- [ ] Transaction review hook
- [ ] Inline warnings in Safe UI
- [ ] Team profile sync
- [ ] Transaction approval workflow
- [ ] Historical analysis dashboard

## Phase 17: API Service
> Hosted analysis service

- [x] REST API server (Express.js)
- [x] `POST /api/decode` - decode calldata with options
- [x] `GET /api/health` - health check endpoint
- [x] `GET /api/ai-providers` - list available AI providers/models
- [x] **ABI Management endpoints:**
  - [x] `POST /api/abis` - save new ABI
  - [x] `GET /api/abis` - list all ABIs
  - [x] `DELETE /api/abis/:chain/:address` - delete ABI
- [x] **Profile Management endpoints:**
  - [x] `POST /api/profiles` - save/update profile
  - [x] `GET /api/profiles` - list all profiles
  - [x] `GET /api/profiles/:address` - get specific profile
  - [x] `DELETE /api/profiles/:address` - delete profile
- [x] AI provider/model selection in decode endpoint
- [x] CORS support for web frontend
- [x] JSON request/response handling
- [x] BigInt serialization
- [ ] WebSocket real-time analysis
- [ ] Rate limiting and authentication
- [ ] Webhook notifications
- [ ] Multi-chain support
- [ ] Analytics and monitoring

---

## Backlog / Ideas

- [ ] Simulation integration (Tenderly, Foundry)
- [ ] Contract verification check (Etherscan API)
- [ ] Historical transaction comparison
- [ ] Risk scoring model
- [ ] Team notification system (Slack, Discord)
- [ ] Audit log for analyzed transactions
- [ ] Custom selector database per team
- [ ] i18n / multi-language support
- [ ] Chrome extension
- [ ] GitHub Action for PR reviews

---

## Legend

- [x] Completed
- [ ] Planned / Not started

---

*Last updated: February 5, 2026*
