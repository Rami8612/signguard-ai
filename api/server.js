/**
 * Calldata Decoder API Server
 *
 * Simple Express server that exposes the decoder as a REST API.
 * Run with: node api/server.js
 */

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { decode } from '../src/index.js'
import { explain } from '../src/explainer.js'
import { clearAbiCache } from '../src/abiRegistry.js'
import { getAvailableProviders, getDefaultProvider } from '../src/aiClient.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Base paths
const ABIS_PATH = join(__dirname, '..', 'abis')
const PROFILES_PATH = join(__dirname, '..', 'profiles')

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json({ limit: '1mb' }))

/**
 * POST /api/decode
 *
 * Decode calldata and return structured analysis.
 *
 * Request body:
 *   - calldata: string (required) - hex calldata with or without 0x prefix
 *   - targetAddress: string (optional) - contract address for trust context
 *   - profile: object (optional) - trust profile JSON
 *   - offline: boolean (optional) - skip external lookups
 *   - aiProvider: string (optional) - AI provider (openrouter, claude, openai, gemini, ollama)
 *   - aiModel: string (optional) - model to use for explanations
 *   - operation: number (optional) - 0=CALL (default), 1=DELEGATECALL
 *
 * Response:
 *   Full decode result object (see src/index.js for structure)
 */
app.post('/api/decode', async (req, res) => {
  const startTime = Date.now()

  try {
    const { calldata, targetAddress, profile, offline, aiProvider, aiModel, operation } = req.body

    // Validate required field
    if (!calldata || typeof calldata !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid calldata',
        message: 'Request body must include a "calldata" string field'
      })
    }

    // Validate calldata format
    const normalized = calldata.startsWith('0x') ? calldata : `0x${calldata}`
    if (!/^0x[a-fA-F0-9]*$/.test(normalized)) {
      return res.status(400).json({
        error: 'Invalid calldata format',
        message: 'Calldata must be a valid hex string'
      })
    }

    if (normalized.length < 10) {
      return res.status(400).json({
        error: 'Calldata too short',
        message: 'Calldata must be at least 4 bytes (8 hex chars + 0x prefix)'
      })
    }

    // Normalize targetAddress to lowercase
    const normalizedTargetAddress = targetAddress ? targetAddress.toLowerCase() : undefined

    // Normalize profile keys to lowercase
    const normalizedProfile = profile ? normalizeProfileKeys(profile) : undefined

    // Validate and normalize operation parameter
    let validatedOperation = 0
    if (operation !== undefined) {
      if (operation !== 0 && operation !== 1) {
        return res.status(400).json({
          error: 'Invalid operation',
          message: 'operation must be 0 (CALL) or 1 (DELEGATECALL)'
        })
      }
      validatedOperation = operation
    }

    // Build options
    const options = {
      offline: offline ?? true, // Default to offline for faster responses
      targetAddress: normalizedTargetAddress,
      profile: normalizedProfile,
      operation: validatedOperation
    }

    // Run decoder with normalized calldata
    const result = await decode(normalized, options)

    // Generate AI explanation (if API key configured)
    let aiExplanation = null
    try {
      const explanationResult = await explain(result, {
        provider: aiProvider,
        model: aiModel
      })
      if (explanationResult.success) {
        aiExplanation = explanationResult.explanation?.text ||
                        explanationResult.explanation?.summary ||
                        explanationResult.fallback?.text ||
                        explanationResult.fallback?.summary ||
                        null
      } else if (explanationResult.fallback) {
        aiExplanation = explanationResult.fallback.text || explanationResult.fallback.summary
      }
    } catch (err) {
      console.error('AI explanation error:', err.message)
    }

    // Serialize BigInt values for JSON response
    const serialized = serializeBigInt(result)

    // Add AI explanation to response
    serialized.aiExplanation = aiExplanation

    // Add timing info
    serialized._meta = {
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    }

    res.json(serialized)

  } catch (error) {
    console.error('Decode error:', error)

    res.status(500).json({
      error: 'Decode failed',
      message: error.message,
      _meta: {
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    })
  }
})

/**
 * GET /api/health
 *
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' })
})

// ═══════════════════════════════════════════════════════════════
// Transaction Fetch Endpoint
// ═══════════════════════════════════════════════════════════════

/**
 * Safe execTransaction selector and ABI fragment
 */
const SAFE_EXEC_TRANSACTION_SELECTOR = '0x6a761202'
const SAFE_EXEC_TRANSACTION_ABI = [
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool success)'
]

/**
 * POST /api/fetch-tx
 *
 * Fetch a transaction by hash and extract calldata/operation.
 * If the tx.to is a Safe (detected by execTransaction selector), decode the inner call.
 *
 * Request body:
 *   - txHash: string (required) - transaction hash
 *   - rpcUrl: string (optional) - RPC endpoint URL
 *
 * Response:
 *   - txHash: original transaction hash
 *   - isSafe: boolean - whether this was a Safe execTransaction
 *   - targetAddress: the contract being called (inner target if Safe)
 *   - calldata: the calldata to analyze (inner data if Safe)
 *   - operation: 0 (CALL) or 1 (DELEGATECALL)
 *   - safeAddress: the Safe address (if isSafe)
 *   - value: ETH value sent
 */
app.post('/api/fetch-tx', async (req, res) => {
  try {
    const { txHash, rpcUrl = 'https://eth.llamarpc.com' } = req.body

    // Validate txHash
    if (!txHash || typeof txHash !== 'string') {
      return res.status(400).json({
        error: 'Missing transaction hash',
        message: 'Request body must include a "txHash" string field'
      })
    }

    if (!txHash.match(/^0x[a-fA-F0-9]{64}$/)) {
      return res.status(400).json({
        error: 'Invalid transaction hash',
        message: 'Transaction hash must be 66 characters (0x + 64 hex chars)'
      })
    }

    // Fetch transaction via JSON-RPC
    const rpcResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionByHash',
        params: [txHash],
        id: 1
      })
    })

    if (!rpcResponse.ok) {
      throw new Error(`RPC request failed: ${rpcResponse.status}`)
    }

    const rpcData = await rpcResponse.json()

    if (rpcData.error) {
      throw new Error(rpcData.error.message || 'RPC error')
    }

    const tx = rpcData.result

    if (!tx) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: `No transaction found for hash ${txHash}`
      })
    }

    // Check if this is a Safe execTransaction call
    const inputData = tx.input || '0x'
    const selector = inputData.slice(0, 10).toLowerCase()
    const isSafeExecTransaction = selector === SAFE_EXEC_TRANSACTION_SELECTOR

    let result = {
      txHash,
      chainId: tx.chainId ? parseInt(tx.chainId, 16) : null,
      from: tx.from,
      blockNumber: tx.blockNumber ? parseInt(tx.blockNumber, 16) : null
    }

    if (isSafeExecTransaction) {
      // Decode Safe execTransaction
      try {
        const { ethers } = await import('ethers')
        const iface = new ethers.Interface(SAFE_EXEC_TRANSACTION_ABI)
        const decoded = iface.decodeFunctionData('execTransaction', inputData)

        result.isSafe = true
        result.safeAddress = tx.to
        result.targetAddress = decoded.to
        result.calldata = decoded.data
        result.operation = Number(decoded.operation) // 0=CALL, 1=DELEGATECALL
        result.value = decoded.value.toString()
        result.safeTxGas = decoded.safeTxGas.toString()
        result.baseGas = decoded.baseGas.toString()
        result.gasPrice = decoded.gasPrice.toString()
        result.gasToken = decoded.gasToken
        result.refundReceiver = decoded.refundReceiver
      } catch (decodeError) {
        // Failed to decode as execTransaction, treat as normal tx
        console.warn('Failed to decode execTransaction:', decodeError.message)
        result.isSafe = false
        result.targetAddress = tx.to
        result.calldata = inputData
        result.operation = 0
        result.value = tx.value ? BigInt(tx.value).toString() : '0'
        result.decodeWarning = 'Failed to decode execTransaction: ' + decodeError.message
      }
    } else {
      // Not a Safe execTransaction, use raw tx data
      result.isSafe = false
      result.targetAddress = tx.to
      result.calldata = inputData
      result.operation = 0
      result.value = tx.value ? BigInt(tx.value).toString() : '0'
    }

    res.json(result)

  } catch (error) {
    console.error('Fetch transaction error:', error)
    res.status(500).json({
      error: 'Failed to fetch transaction',
      message: error.message
    })
  }
})

// ═══════════════════════════════════════════════════════════════
// AI Provider Endpoints
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/ai-providers
 *
 * Get available AI providers and their models
 */
app.get('/api/ai-providers', (req, res) => {
  try {
    const providers = getAvailableProviders()
    const defaultProvider = getDefaultProvider()

    res.json({
      providers,
      defaultProvider
    })
  } catch (error) {
    console.error('Get AI providers error:', error)
    res.status(500).json({
      error: 'Failed to get AI providers',
      message: error.message
    })
  }
})

// ═══════════════════════════════════════════════════════════════
// ABI Management Endpoints
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/abis
 *
 * Save a new ABI to the local registry
 *
 * Request body:
 *   - address: string (required) - contract address
 *   - abi: array (required) - ABI array
 *   - chain: string (optional) - chain name, defaults to "ethereum"
 *   - name: string (optional) - friendly name for the contract
 */
app.post('/api/abis', (req, res) => {
  try {
    const { address, abi, chain = 'ethereum', name } = req.body

    // Validate address
    if (!address || typeof address !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid address',
        message: 'Request body must include an "address" string field'
      })
    }

    const normalizedAddress = address.toLowerCase()
    if (!/^0x[a-fA-F0-9]{40}$/.test(normalizedAddress)) {
      return res.status(400).json({
        error: 'Invalid address format',
        message: 'Address must be a valid Ethereum address (0x + 40 hex chars)'
      })
    }

    // Validate ABI
    if (!abi || !Array.isArray(abi)) {
      return res.status(400).json({
        error: 'Missing or invalid ABI',
        message: 'Request body must include an "abi" array field'
      })
    }

    // Validate chain name (alphanumeric only)
    if (!/^[a-zA-Z0-9_-]+$/.test(chain)) {
      return res.status(400).json({
        error: 'Invalid chain name',
        message: 'Chain name must contain only alphanumeric characters, underscores, or hyphens'
      })
    }

    // Ensure chain directory exists
    const chainPath = join(ABIS_PATH, chain)
    if (!existsSync(chainPath)) {
      mkdirSync(chainPath, { recursive: true })
    }

    // Save ABI file
    const filePath = join(chainPath, `${normalizedAddress}.json`)
    writeFileSync(filePath, JSON.stringify(abi, null, 2))

    // Clear cache so new ABI is picked up
    clearAbiCache()

    res.json({
      success: true,
      address: normalizedAddress,
      chain,
      name: name || null,
      functionCount: abi.filter(item => item.type === 'function').length
    })

  } catch (error) {
    console.error('Save ABI error:', error)
    res.status(500).json({
      error: 'Failed to save ABI',
      message: error.message
    })
  }
})

/**
 * GET /api/abis
 *
 * List all saved ABIs
 */
app.get('/api/abis', (req, res) => {
  try {
    const abis = []

    if (!existsSync(ABIS_PATH)) {
      return res.json(abis)
    }

    // List chain directories
    const chains = readdirSync(ABIS_PATH, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)

    for (const chain of chains) {
      const chainPath = join(ABIS_PATH, chain)
      const files = readdirSync(chainPath)
        .filter(f => f.endsWith('.json'))

      for (const file of files) {
        const address = file.replace('.json', '')
        const filePath = join(chainPath, file)

        try {
          const content = readFileSync(filePath, 'utf-8')
          const abi = JSON.parse(content)
          const functionCount = Array.isArray(abi)
            ? abi.filter(item => item.type === 'function').length
            : 0

          abis.push({
            address,
            chain,
            functionCount
          })
        } catch (e) {
          // Skip invalid files
          console.warn(`Skipping invalid ABI file: ${filePath}`)
        }
      }
    }

    res.json(abis)

  } catch (error) {
    console.error('List ABIs error:', error)
    res.status(500).json({
      error: 'Failed to list ABIs',
      message: error.message
    })
  }
})

/**
 * DELETE /api/abis/:chain/:address
 *
 * Delete an ABI from the registry
 */
app.delete('/api/abis/:chain/:address', (req, res) => {
  try {
    const { chain, address } = req.params

    const normalizedAddress = address.toLowerCase()
    const filePath = join(ABIS_PATH, chain, `${normalizedAddress}.json`)

    if (!existsSync(filePath)) {
      return res.status(404).json({
        error: 'ABI not found',
        message: `No ABI found for ${address} on ${chain}`
      })
    }

    unlinkSync(filePath)

    // Clear cache
    clearAbiCache()

    res.json({
      success: true,
      address: normalizedAddress,
      chain
    })

  } catch (error) {
    console.error('Delete ABI error:', error)
    res.status(500).json({
      error: 'Failed to delete ABI',
      message: error.message
    })
  }
})

// ═══════════════════════════════════════════════════════════════
// Profile Management Endpoints
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/profiles
 *
 * Save or update a trust profile
 *
 * Request body:
 *   - profile: object (required) - complete profile object
 */
app.post('/api/profiles', (req, res) => {
  try {
    const { profile } = req.body

    if (!profile || typeof profile !== 'object') {
      return res.status(400).json({
        error: 'Missing or invalid profile',
        message: 'Request body must include a "profile" object field'
      })
    }

    // Validate profile structure
    const validation = validateProfileStructure(profile)
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid profile structure',
        message: validation.error
      })
    }

    // Ensure profiles directory exists
    if (!existsSync(PROFILES_PATH)) {
      mkdirSync(PROFILES_PATH, { recursive: true })
    }

    // Normalize safeAddress
    const safeAddress = profile.safeAddress.toLowerCase()

    // Save profile file
    const filePath = join(PROFILES_PATH, `${safeAddress}.json`)
    writeFileSync(filePath, JSON.stringify(profile, null, 2))

    res.json({
      success: true,
      safeAddress,
      contractCount: Object.keys(profile.trustedContracts || {}).length
    })

  } catch (error) {
    console.error('Save profile error:', error)
    res.status(500).json({
      error: 'Failed to save profile',
      message: error.message
    })
  }
})

/**
 * GET /api/profiles
 *
 * List all saved profiles
 */
app.get('/api/profiles', (req, res) => {
  try {
    const profiles = []

    if (!existsSync(PROFILES_PATH)) {
      return res.json(profiles)
    }

    const files = readdirSync(PROFILES_PATH)
      .filter(f => f.endsWith('.json'))

    for (const file of files) {
      const safeAddress = file.replace('.json', '')
      const filePath = join(PROFILES_PATH, file)

      try {
        const content = readFileSync(filePath, 'utf-8')
        const profile = JSON.parse(content)

        profiles.push({
          safeAddress,
          description: profile.description || '',
          contractCount: Object.keys(profile.trustedContracts || {}).length
        })
      } catch (e) {
        // Skip invalid files
        console.warn(`Skipping invalid profile file: ${filePath}`)
      }
    }

    res.json(profiles)

  } catch (error) {
    console.error('List profiles error:', error)
    res.status(500).json({
      error: 'Failed to list profiles',
      message: error.message
    })
  }
})

/**
 * GET /api/profiles/:address
 *
 * Get a specific profile by safe address
 */
app.get('/api/profiles/:address', (req, res) => {
  try {
    const { address } = req.params
    const normalizedAddress = address.toLowerCase()
    const filePath = join(PROFILES_PATH, `${normalizedAddress}.json`)

    if (!existsSync(filePath)) {
      return res.status(404).json({
        error: 'Profile not found',
        message: `No profile found for ${address}`
      })
    }

    const content = readFileSync(filePath, 'utf-8')
    const profile = JSON.parse(content)

    res.json(profile)

  } catch (error) {
    console.error('Get profile error:', error)
    res.status(500).json({
      error: 'Failed to get profile',
      message: error.message
    })
  }
})

/**
 * DELETE /api/profiles/:address
 *
 * Delete a profile
 */
app.delete('/api/profiles/:address', (req, res) => {
  try {
    const { address } = req.params
    const normalizedAddress = address.toLowerCase()
    const filePath = join(PROFILES_PATH, `${normalizedAddress}.json`)

    if (!existsSync(filePath)) {
      return res.status(404).json({
        error: 'Profile not found',
        message: `No profile found for ${address}`
      })
    }

    unlinkSync(filePath)

    res.json({
      success: true,
      safeAddress: normalizedAddress
    })

  } catch (error) {
    console.error('Delete profile error:', error)
    res.status(500).json({
      error: 'Failed to delete profile',
      message: error.message
    })
  }
})

/**
 * Validate profile structure for saving
 */
function validateProfileStructure(profile) {
  if (!profile.safeAddress || typeof profile.safeAddress !== 'string') {
    return { valid: false, error: 'Profile must have a safeAddress field' }
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(profile.safeAddress)) {
    return { valid: false, error: 'Invalid safeAddress format' }
  }

  if (!profile.version) {
    return { valid: false, error: 'Profile must have a version field' }
  }

  if (!profile.trustedContracts || typeof profile.trustedContracts !== 'object') {
    return { valid: false, error: 'Profile must have trustedContracts object' }
  }

  const VALID_TRUST_LEVELS = ['INTERNAL', 'PROTOCOL', 'PARTNER', 'WATCHED']

  for (const [address, config] of Object.entries(profile.trustedContracts)) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return { valid: false, error: `Invalid contract address: ${address}` }
    }

    if (!config.label || typeof config.label !== 'string') {
      return { valid: false, error: `Contract ${address} must have a label` }
    }

    if (!config.trustLevel || !VALID_TRUST_LEVELS.includes(config.trustLevel)) {
      return {
        valid: false,
        error: `Contract ${address} has invalid trustLevel. Must be one of: ${VALID_TRUST_LEVELS.join(', ')}`
      }
    }

    if (config.allowedSelectors !== '*' && !Array.isArray(config.allowedSelectors)) {
      return {
        valid: false,
        error: `Contract ${address} allowedSelectors must be "*" or an array`
      }
    }

    if (Array.isArray(config.allowedSelectors)) {
      for (const selector of config.allowedSelectors) {
        if (!/^0x[a-fA-F0-9]{8}$/.test(selector)) {
          return { valid: false, error: `Invalid selector ${selector} for contract ${address}` }
        }
      }
    }
  }

  return { valid: true }
}

/**
 * Normalize profile address keys to lowercase for matching
 */
function normalizeProfileKeys(profile) {
  if (!profile) return profile

  const normalized = { ...profile }

  // Normalize trustedContracts keys
  if (profile.trustedContracts) {
    normalized.trustedContracts = {}
    for (const [addr, value] of Object.entries(profile.trustedContracts)) {
      normalized.trustedContracts[addr.toLowerCase()] = value
    }
  }

  // Normalize trustedAssets keys
  if (profile.trustedAssets) {
    normalized.trustedAssets = {}
    for (const [addr, value] of Object.entries(profile.trustedAssets)) {
      normalized.trustedAssets[addr.toLowerCase()] = value
    }
  }

  // Normalize selectorUsageHistory keys
  if (profile.selectorUsageHistory) {
    normalized.selectorUsageHistory = {}
    for (const [addr, value] of Object.entries(profile.selectorUsageHistory)) {
      normalized.selectorUsageHistory[addr.toLowerCase()] = value
    }
  }

  // Normalize trustedDelegateCalls keys
  if (profile.trustedDelegateCalls) {
    normalized.trustedDelegateCalls = {}
    for (const [addr, value] of Object.entries(profile.trustedDelegateCalls)) {
      normalized.trustedDelegateCalls[addr.toLowerCase()] = {
        ...value,
        allowedSelectors: value.allowedSelectors?.map(s => s.toLowerCase()) || []
      }
    }
  }

  return normalized
}

/**
 * Recursively convert BigInt values to strings for JSON serialization
 */
function serializeBigInt(obj) {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (typeof obj === 'bigint') {
    return obj.toString()
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt)
  }

  if (typeof obj === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value)
    }
    return result
  }

  return obj
}

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                      SignGuard AI API                         ║
╠═══════════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}                      ║
║                                                               ║
║  Endpoints:                                                   ║
║    POST /api/decode              - Decode calldata            ║
║    GET  /api/health              - Health check               ║
║    GET  /api/ai-providers        - List AI providers          ║
║                                                               ║
║  ABI Management:                                              ║
║    POST   /api/abis              - Save new ABI               ║
║    GET    /api/abis              - List all ABIs              ║
║    DELETE /api/abis/:chain/:addr - Delete ABI                 ║
║                                                               ║
║  Profile Management:                                          ║
║    POST   /api/profiles          - Save/update profile        ║
║    GET    /api/profiles          - List all profiles          ║
║    GET    /api/profiles/:addr    - Get specific profile       ║
║    DELETE /api/profiles/:addr    - Delete profile             ║
╚═══════════════════════════════════════════════════════════════╝
  `)
})

export default app
