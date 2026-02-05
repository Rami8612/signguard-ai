/**
 * Verified function selector database with effect metadata.
 * Each entry is manually verified and includes consequence information.
 */

export const VERIFIED_SELECTORS = {
  // ERC20 Functions
  "0x095ea7b3": {
    signature: "approve(address,uint256)",
    verified: true,
    effectType: "PERMISSION_GRANT",
    description: "Grants spending permission on your tokens",
    paramNames: ["spender", "amount"],
    analyzeParams: (params) => {
      const isMaxApproval = params.amount === BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") ||
                           params.amount > BigInt("0x8000000000000000000000000000000000000000000000000000000000000000");
      return {
        scope: isMaxApproval ? "UNLIMITED" : "LIMITED",
        amount: params.amount,
        beneficiary: params.spender,
        isRevocation: params.amount === BigInt(0)
      };
    }
  },
  "0xa9059cbb": {
    signature: "transfer(address,uint256)",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Transfers tokens from your wallet",
    paramNames: ["to", "amount"],
    analyzeParams: (params) => ({
      scope: "SPECIFIC_AMOUNT",
      amount: params.amount,
      beneficiary: params.to
    })
  },
  "0x23b872dd": {
    signature: "transferFrom(address,address,uint256)",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Transfers tokens between addresses (requires prior approval)",
    paramNames: ["from", "to", "amount"],
    analyzeParams: (params) => ({
      scope: "SPECIFIC_AMOUNT",
      amount: params.amount,
      from: params.from,
      beneficiary: params.to
    })
  },

  // ERC721 Functions
  "0xa22cb465": {
    signature: "setApprovalForAll(address,bool)",
    verified: true,
    effectType: "PERMISSION_GRANT",
    description: "Grants or revokes permission to manage ALL your NFTs in this collection",
    paramNames: ["operator", "approved"],
    analyzeParams: (params) => ({
      scope: "UNLIMITED",
      beneficiary: params.operator,
      isRevocation: !params.approved
    })
  },
  "0x42842e0e": {
    signature: "safeTransferFrom(address,address,uint256)",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Safely transfers an NFT",
    paramNames: ["from", "to", "tokenId"],
    analyzeParams: (params) => ({
      scope: "SINGLE_TOKEN",
      tokenId: params.tokenId,
      from: params.from,
      beneficiary: params.to
    })
  },
  "0xb88d4fde": {
    signature: "safeTransferFrom(address,address,uint256,bytes)",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Safely transfers an NFT with additional data",
    paramNames: ["from", "to", "tokenId", "data"],
    analyzeParams: (params) => ({
      scope: "SINGLE_TOKEN",
      tokenId: params.tokenId,
      from: params.from,
      beneficiary: params.to
    })
  },

  // ERC1155 Functions
  "0xf242432a": {
    signature: "safeTransferFrom(address,address,uint256,uint256,bytes)",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Transfers ERC1155 tokens",
    paramNames: ["from", "to", "id", "amount", "data"],
    analyzeParams: (params) => ({
      scope: "SPECIFIC_AMOUNT",
      tokenId: params.id,
      amount: params.amount,
      from: params.from,
      beneficiary: params.to
    })
  },
  "0x2eb2c2d6": {
    signature: "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)",
    verified: true,
    effectType: "BATCH_OPERATION",
    description: "Transfers multiple ERC1155 token types in a batch",
    paramNames: ["from", "to", "ids", "amounts", "data"],
    analyzeParams: (params) => ({
      scope: "BATCH",
      tokenIds: params.ids,
      amounts: params.amounts,
      from: params.from,
      beneficiary: params.to
    })
  },

  // Ownership Functions
  "0xf2fde38b": {
    signature: "transferOwnership(address)",
    verified: true,
    effectType: "CONTROL_TRANSFER",
    description: "Transfers contract ownership to another address",
    paramNames: ["newOwner"],
    analyzeParams: (params) => ({
      scope: "FULL_CONTROL",
      beneficiary: params.newOwner
    })
  },
  "0x715018a6": {
    signature: "renounceOwnership()",
    verified: true,
    effectType: "CONTROL_TRANSFER",
    description: "Permanently renounces contract ownership (irreversible)",
    paramNames: [],
    analyzeParams: () => ({
      scope: "FULL_CONTROL",
      irreversible: true
    })
  },

  // Proxy/Upgrade Functions
  "0x3659cfe6": {
    signature: "upgradeTo(address)",
    verified: true,
    effectType: "UPGRADE_AUTHORITY",
    description: "Upgrades the contract implementation",
    paramNames: ["newImplementation"],
    analyzeParams: (params) => ({
      scope: "CONTRACT_LOGIC",
      newImplementation: params.newImplementation
    })
  },
  "0x4f1ef286": {
    signature: "upgradeToAndCall(address,bytes)",
    verified: true,
    effectType: "UPGRADE_AUTHORITY",
    description: "Upgrades the contract and executes initialization",
    paramNames: ["newImplementation", "data"],
    analyzeParams: (params) => ({
      scope: "CONTRACT_LOGIC",
      newImplementation: params.newImplementation,
      hasInitData: params.data && params.data.length > 2
    })
  },

  // Multicall/Batch Functions
  "0xac9650d8": {
    signature: "multicall(bytes[])",
    verified: true,
    effectType: "BATCH_OPERATION",
    description: "Executes multiple function calls in a single transaction",
    paramNames: ["data"],
    analyzeParams: (params) => ({
      scope: "MULTIPLE_CALLS",
      callCount: params.data ? params.data.length : 0
    })
  },
  "0x5ae401dc": {
    signature: "multicall(uint256,bytes[])",
    verified: true,
    effectType: "BATCH_OPERATION",
    description: "Executes multiple function calls with a deadline",
    paramNames: ["deadline", "data"],
    analyzeParams: (params) => ({
      scope: "MULTIPLE_CALLS",
      deadline: params.deadline,
      callCount: params.data ? params.data.length : 0
    })
  },
  "0x252dba42": {
    signature: "aggregate((address,bytes)[])",
    verified: true,
    effectType: "BATCH_OPERATION",
    description: "Aggregates multiple contract calls",
    paramNames: ["calls"],
    analyzeParams: (params) => ({
      scope: "MULTIPLE_CALLS",
      callCount: params.calls ? params.calls.length : 0
    })
  },

  // ═══════════════════════════════════════════════════════════════════
  // Safe/Gnosis Multisig Functions
  // ═══════════════════════════════════════════════════════════════════

  // Safe: Execute Transaction (the core execution function)
  "0x6a761202": {
    signature: "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)",
    verified: true,
    effectType: "SAFE_EXECUTION",
    description: "Executes a transaction from the Safe multisig",
    paramNames: ["to", "value", "data", "operation", "safeTxGas", "baseGas", "gasPrice", "gasToken", "refundReceiver", "signatures"],
    analyzeParams: (params) => {
      // Operation: 0 = CALL, 1 = DELEGATECALL
      const isDelegateCall = Number(params.operation) === 1;
      const hasValue = params.value && params.value > BigInt(0);
      const hasData = params.data && params.data.length > 2;

      return {
        scope: "SAFE_EXEC",
        safeContext: true,
        targetAddress: params.to,
        value: params.value,
        operation: isDelegateCall ? "DELEGATECALL" : "CALL",
        isDelegateCall,
        hasValue,
        hasData,
        // DELEGATECALL is extremely dangerous - executes foreign code in Safe's context
        executionRisk: isDelegateCall ? "CRITICAL" : (hasValue || hasData ? "HIGH" : "MEDIUM")
      };
    }
  },

  // Safe: Enable Module (grants autonomous execution power)
  "0x610b5925": {
    signature: "enableModule(address)",
    verified: true,
    effectType: "SAFE_MODULE_CHANGE",
    description: "Enables a module that can execute transactions WITHOUT owner signatures",
    paramNames: ["module"],
    analyzeParams: (params) => ({
      scope: "MODULE_ENABLE",
      safeContext: true,
      moduleAddress: params.module,
      // Modules can execute ANY transaction without signatures
      grantsAutonomousExecution: true,
      powerGranted: "UNLIMITED_EXECUTION"
    })
  },

  // Safe: Disable Module
  "0xe009cfde": {
    signature: "disableModule(address,address)",
    verified: true,
    effectType: "SAFE_MODULE_CHANGE",
    description: "Disables a module, removing its ability to execute transactions",
    paramNames: ["prevModule", "module"],
    analyzeParams: (params) => ({
      scope: "MODULE_DISABLE",
      safeContext: true,
      moduleAddress: params.module,
      revokesAutonomousExecution: true,
      isRevocation: true
    })
  },

  // Safe: Set Fallback Handler
  "0xf08a0323": {
    signature: "setFallbackHandler(address)",
    verified: true,
    effectType: "SAFE_FALLBACK_CHANGE",
    description: "Sets the fallback handler that receives calls to undefined functions",
    paramNames: ["handler"],
    analyzeParams: (params) => {
      const isRemoval = params.handler === "0x0000000000000000000000000000000000000000";
      return {
        scope: "FALLBACK_HANDLER",
        safeContext: true,
        handlerAddress: params.handler,
        isRemoval,
        // Fallback handlers can intercept calls and potentially manipulate behavior
        affectsCallRouting: true
      };
    }
  },

  // Safe: Set Guard (can block transactions)
  "0xe19a9dd9": {
    signature: "setGuard(address)",
    verified: true,
    effectType: "SAFE_GUARD_CHANGE",
    description: "Sets a guard contract that can block or modify transaction execution",
    paramNames: ["guard"],
    analyzeParams: (params) => {
      const isRemoval = params.guard === "0x0000000000000000000000000000000000000000";
      return {
        scope: "GUARD_CHANGE",
        safeContext: true,
        guardAddress: params.guard,
        isRemoval,
        // Guards can block ANY transaction from executing
        canBlockExecution: !isRemoval
      };
    }
  },

  // Safe: Add Owner with Threshold
  "0x0d582f13": {
    signature: "addOwnerWithThreshold(address,uint256)",
    verified: true,
    effectType: "SAFE_OWNER_CHANGE",
    description: "Adds a new owner to the Safe multisig",
    paramNames: ["owner", "threshold"],
    analyzeParams: (params) => ({
      scope: "SIGNER_ADDITION",
      safeContext: true,
      newOwner: params.owner,
      newThreshold: params.threshold,
      changesSigningPower: true,
      // New owner gains ability to participate in approvals
      powerGranted: "SIGNING_AUTHORITY"
    })
  },

  // Safe: Remove Owner
  "0xf8dc5dd9": {
    signature: "removeOwner(address,address,uint256)",
    verified: true,
    effectType: "SAFE_OWNER_CHANGE",
    description: "Removes an owner from the Safe multisig",
    paramNames: ["prevOwner", "owner", "threshold"],
    analyzeParams: (params) => ({
      scope: "SIGNER_REMOVAL",
      safeContext: true,
      removedOwner: params.owner,
      newThreshold: params.threshold,
      changesSigningPower: true,
      isRevocation: true,
      // Removed owner loses all signing authority
      powerRevoked: "SIGNING_AUTHORITY"
    })
  },

  // Safe: Swap Owner
  "0xe318b52b": {
    signature: "swapOwner(address,address,address)",
    verified: true,
    effectType: "SAFE_OWNER_CHANGE",
    description: "Replaces an existing Safe owner with a new one",
    paramNames: ["prevOwner", "oldOwner", "newOwner"],
    analyzeParams: (params) => ({
      scope: "SIGNER_REPLACEMENT",
      safeContext: true,
      oldOwner: params.oldOwner,
      newOwner: params.newOwner,
      changesSigningPower: true,
      // Transfers signing authority from one address to another
      powerTransfer: "SIGNING_AUTHORITY"
    })
  },

  // Safe: Change Threshold
  "0x694e80c3": {
    signature: "changeThreshold(uint256)",
    verified: true,
    effectType: "SAFE_THRESHOLD_CHANGE",
    description: "Changes the number of required signatures for Safe transactions",
    paramNames: ["threshold"],
    analyzeParams: (params) => ({
      scope: "THRESHOLD_CHANGE",
      safeContext: true,
      newThreshold: params.threshold,
      changesSigningRequirements: true,
      // Lower threshold = easier to execute, higher = harder
      affectsExecutionDifficulty: true
    })
  },

  // Safe: Execute Transaction from Module (called BY a module)
  "0x468721a7": {
    signature: "execTransactionFromModule(address,uint256,bytes,uint8)",
    verified: true,
    effectType: "SAFE_MODULE_EXECUTION",
    description: "Executes a transaction from an enabled module (no signatures required)",
    paramNames: ["to", "value", "data", "operation"],
    analyzeParams: (params) => {
      const isDelegateCall = Number(params.operation) === 1;
      return {
        scope: "MODULE_EXEC",
        safeContext: true,
        targetAddress: params.to,
        value: params.value,
        operation: isDelegateCall ? "DELEGATECALL" : "CALL",
        isDelegateCall,
        // Module executions bypass signature requirements entirely
        bypassesSignatures: true,
        executionRisk: isDelegateCall ? "CRITICAL" : "HIGH"
      };
    }
  },

  // Safe: Execute Transaction from Module with Return Data
  "0x5229073f": {
    signature: "execTransactionFromModuleReturnData(address,uint256,bytes,uint8)",
    verified: true,
    effectType: "SAFE_MODULE_EXECUTION",
    description: "Executes a transaction from an enabled module and returns data",
    paramNames: ["to", "value", "data", "operation"],
    analyzeParams: (params) => {
      const isDelegateCall = Number(params.operation) === 1;
      return {
        scope: "MODULE_EXEC",
        safeContext: true,
        targetAddress: params.to,
        value: params.value,
        operation: isDelegateCall ? "DELEGATECALL" : "CALL",
        isDelegateCall,
        bypassesSignatures: true,
        executionRisk: isDelegateCall ? "CRITICAL" : "HIGH"
      };
    }
  },

  // Permit (EIP-2612)
  "0xd505accf": {
    signature: "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)",
    verified: true,
    effectType: "PERMISSION_GRANT",
    description: "Grants spending permission via signature (gasless approval)",
    paramNames: ["owner", "spender", "value", "deadline", "v", "r", "s"],
    analyzeParams: (params) => {
      const isMaxApproval = params.value === BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
      return {
        scope: isMaxApproval ? "UNLIMITED" : "LIMITED",
        amount: params.value,
        beneficiary: params.spender,
        deadline: params.deadline
      };
    }
  },

  // Uniswap V2 Router Functions
  "0x7ff36ab5": {
    signature: "swapExactETHForTokens(uint256,address[],address,uint256)",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Swaps exact ETH for tokens via Uniswap V2",
    paramNames: ["amountOutMin", "path", "to", "deadline"],
    analyzeParams: (params) => ({
      scope: "SWAP",
      minOutput: params.amountOutMin,
      recipient: params.to,
      deadline: params.deadline,
      swapPath: params.path
    })
  },
  "0x18cbafe5": {
    signature: "swapExactTokensForETH(uint256,uint256,address[],address,uint256)",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Swaps exact tokens for ETH via Uniswap V2",
    paramNames: ["amountIn", "amountOutMin", "path", "to", "deadline"],
    analyzeParams: (params) => ({
      scope: "SWAP",
      inputAmount: params.amountIn,
      minOutput: params.amountOutMin,
      recipient: params.to,
      deadline: params.deadline,
      swapPath: params.path
    })
  },
  "0x38ed1739": {
    signature: "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Swaps exact tokens for tokens via Uniswap V2",
    paramNames: ["amountIn", "amountOutMin", "path", "to", "deadline"],
    analyzeParams: (params) => ({
      scope: "SWAP",
      inputAmount: params.amountIn,
      minOutput: params.amountOutMin,
      recipient: params.to,
      deadline: params.deadline,
      swapPath: params.path
    })
  },
  "0xfb3bdb41": {
    signature: "swapETHForExactTokens(uint256,address[],address,uint256)",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Swaps ETH for exact amount of tokens via Uniswap V2",
    paramNames: ["amountOut", "path", "to", "deadline"],
    analyzeParams: (params) => ({
      scope: "SWAP",
      exactOutput: params.amountOut,
      recipient: params.to,
      deadline: params.deadline,
      swapPath: params.path
    })
  },
  "0x8803dbee": {
    signature: "swapTokensForExactTokens(uint256,uint256,address[],address,uint256)",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Swaps tokens for exact amount of tokens via Uniswap V2",
    paramNames: ["amountOut", "amountInMax", "path", "to", "deadline"],
    analyzeParams: (params) => ({
      scope: "SWAP",
      exactOutput: params.amountOut,
      maxInput: params.amountInMax,
      recipient: params.to,
      deadline: params.deadline,
      swapPath: params.path
    })
  },
  "0x4a25d94a": {
    signature: "swapTokensForExactETH(uint256,uint256,address[],address,uint256)",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Swaps tokens for exact amount of ETH via Uniswap V2",
    paramNames: ["amountOut", "amountInMax", "path", "to", "deadline"],
    analyzeParams: (params) => ({
      scope: "SWAP",
      exactOutput: params.amountOut,
      maxInput: params.amountInMax,
      recipient: params.to,
      deadline: params.deadline,
      swapPath: params.path
    })
  },

  // Uniswap V2 Liquidity Functions
  "0xe8e33700": {
    signature: "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Adds liquidity to a Uniswap V2 token pair",
    paramNames: ["tokenA", "tokenB", "amountADesired", "amountBDesired", "amountAMin", "amountBMin", "to", "deadline"],
    analyzeParams: (params) => ({
      scope: "LIQUIDITY_PROVISION",
      tokenA: params.tokenA,
      tokenB: params.tokenB,
      recipient: params.to,
      deadline: params.deadline
    })
  },
  "0xf305d719": {
    signature: "addLiquidityETH(address,uint256,uint256,uint256,address,uint256)",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Adds liquidity to a Uniswap V2 ETH pair",
    paramNames: ["token", "amountTokenDesired", "amountTokenMin", "amountETHMin", "to", "deadline"],
    analyzeParams: (params) => ({
      scope: "LIQUIDITY_PROVISION",
      token: params.token,
      recipient: params.to,
      deadline: params.deadline
    })
  },
  "0xbaa2abde": {
    signature: "removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Removes liquidity from a Uniswap V2 token pair",
    paramNames: ["tokenA", "tokenB", "liquidity", "amountAMin", "amountBMin", "to", "deadline"],
    analyzeParams: (params) => ({
      scope: "LIQUIDITY_REMOVAL",
      tokenA: params.tokenA,
      tokenB: params.tokenB,
      lpAmount: params.liquidity,
      recipient: params.to,
      deadline: params.deadline
    })
  },
  "0x02751cec": {
    signature: "removeLiquidityETH(address,uint256,uint256,uint256,address,uint256)",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Removes liquidity from a Uniswap V2 ETH pair",
    paramNames: ["token", "liquidity", "amountTokenMin", "amountETHMin", "to", "deadline"],
    analyzeParams: (params) => ({
      scope: "LIQUIDITY_REMOVAL",
      token: params.token,
      lpAmount: params.liquidity,
      recipient: params.to,
      deadline: params.deadline
    })
  },

  // Uniswap Universal Router (execute)
  "0x3593564c": {
    signature: "execute(bytes,bytes[],uint256)",
    verified: true,
    effectType: "BATCH_OPERATION",
    description: "Executes multiple commands via Uniswap Universal Router",
    paramNames: ["commands", "inputs", "deadline"],
    analyzeParams: (params) => ({
      scope: "UNIVERSAL_ROUTER",
      commandCount: params.commands ? (params.commands.length - 2) / 2 : 0,
      deadline: params.deadline
    })
  },

  // WETH Functions
  "0xd0e30db0": {
    signature: "deposit()",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Wraps ETH into WETH",
    paramNames: [],
    analyzeParams: () => ({
      scope: "WRAP",
      direction: "ETH_TO_WETH"
    })
  },
  "0x2e1a7d4d": {
    signature: "withdraw(uint256)",
    verified: true,
    effectType: "ASSET_TRANSFER",
    description: "Unwraps WETH back to ETH",
    paramNames: ["wad"],
    analyzeParams: (params) => ({
      scope: "UNWRAP",
      direction: "WETH_TO_ETH",
      amount: params.wad
    })
  }
};

/**
 * Known contract addresses (for display purposes only, not for risk assessment)
 */
export const KNOWN_ADDRESSES = {
  // DEX Routers
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": {
    name: "Uniswap V2 Router",
    verified: true
  },
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": {
    name: "Uniswap Universal Router",
    verified: true
  },
  "0x1111111254eeb25477b68fb85ed929f73a960582": {
    name: "1inch v5 Router",
    verified: true
  },
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": {
    name: "0x Exchange Proxy",
    verified: true
  },

  // Safe/Gnosis Infrastructure (Ethereum Mainnet)
  "0xd9db270c1b5e3bd161e8c8503c55ceabee709552": {
    name: "Safe Singleton 1.3.0",
    verified: true,
    isSafeContract: true
  },
  "0x69f4d1788e39c87893c980c06edf4b7f686e2938": {
    name: "Safe Singleton L2 1.3.0",
    verified: true,
    isSafeContract: true
  },
  "0xa6b71e26c5e0845f74c812102ca7114b6a896ab2": {
    name: "Safe Proxy Factory 1.3.0",
    verified: true,
    isSafeContract: true
  },
  "0xf48f2b2d2a534e402487b3ee7c18c33aec0fe5e4": {
    name: "Safe Compatibility Fallback Handler",
    verified: true,
    isSafeContract: true
  },
  "0x40a2accbd92bca938b02010e17a5b8929b49130d": {
    name: "Safe Singleton 1.4.1",
    verified: true,
    isSafeContract: true
  },

  // Common Safe Modules
  "0x9641d764fc13c8b624c04430c7356c1c7c8102e2": {
    name: "Zodiac Roles Modifier",
    verified: true,
    isSafeModule: true
  },
  "0x0da0c3e52c977ed3cbc641ff02dd271c3ed55afe": {
    name: "Allowance Module",
    verified: true,
    isSafeModule: true
  }
};

/**
 * Look up a selector in the verified database
 */
export function lookupSelector(selector) {
  const normalized = selector.toLowerCase();
  return VERIFIED_SELECTORS[normalized] || null;
}

/**
 * Look up a known address
 */
export function lookupAddress(address) {
  const normalized = address.toLowerCase();
  return KNOWN_ADDRESSES[normalized] || null;
}
