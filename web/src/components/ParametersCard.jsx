/**
 * ParametersCard - Displays decoded function parameters
 *
 * Features:
 * - Full addresses (no truncation)
 * - Token symbols from trustedAssets (e.g., "LINK — 0x514910...")
 * - Human-readable amounts with decimals (e.g., "100 LINK")
 * - Raw value shown as secondary text
 */

export default function ParametersCard({ params, trustedAssets }) {
  if (!params || Object.keys(params).length === 0) return null

  // Build token context from params (for amount formatting)
  const tokenContext = buildTokenContext(params, trustedAssets)

  return (
    <div className="parameters-card">
      <h4 className="card-title">Parameters</h4>
      <div className="parameters-list">
        {Object.entries(params).map(([name, value]) => (
          <ParameterRow
            key={name}
            name={name}
            value={value}
            trustedAssets={trustedAssets}
            tokenContext={tokenContext}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Build token context by finding asset/amount pairs in params
 * Returns { tokenAddress, tokenInfo } if found
 */
function buildTokenContext(params, trustedAssets) {
  if (!trustedAssets) return null

  // Look for common token address parameter names
  const tokenParamNames = ['asset', 'token', 'tokenAddress', 'underlying']

  for (const paramName of tokenParamNames) {
    const tokenAddress = params[paramName]
    if (tokenAddress && isAddress(tokenAddress)) {
      const tokenInfo = lookupToken(tokenAddress, trustedAssets)
      if (tokenInfo) {
        return { tokenAddress, tokenInfo, paramName }
      }
    }
  }

  return null
}

/**
 * Lookup token in trustedAssets by address
 */
function lookupToken(address, trustedAssets) {
  if (!trustedAssets || !address) return null

  const normalized = address.toLowerCase()
  const token = trustedAssets[normalized]

  if (token && token.symbol) {
    return {
      symbol: token.symbol,
      decimals: token.decimals ?? 18,
      name: token.name || token.symbol
    }
  }

  return null
}

/**
 * Check if value is an Ethereum address
 */
function isAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/i.test(value)
}

/**
 * Check if value is a numeric string (potential amount)
 */
function isNumericString(value) {
  return typeof value === 'string' && /^\d+$/.test(value)
}

/**
 * Format a single parameter row
 */
function ParameterRow({ name, value, trustedAssets, tokenContext }) {
  // Check if this is an address that might be a token
  if (isAddress(value)) {
    return <AddressParameter name={name} value={value} trustedAssets={trustedAssets} />
  }

  // Check if this is an amount we can format with token context
  const amountParamNames = ['amount', 'value', 'amountIn', 'amountOut', 'shares', 'assets']
  if (isNumericString(value) && amountParamNames.includes(name) && tokenContext) {
    return (
      <AmountParameter
        name={name}
        value={value}
        tokenInfo={tokenContext.tokenInfo}
      />
    )
  }

  // Default formatting
  return (
    <div className="parameter-row">
      <span className="parameter-name">{name}</span>
      <code className="parameter-value">{formatValue(value)}</code>
    </div>
  )
}

/**
 * Address parameter with optional token symbol
 */
function AddressParameter({ name, value, trustedAssets }) {
  const tokenInfo = lookupToken(value, trustedAssets)

  if (tokenInfo) {
    return (
      <div className="parameter-row parameter-address">
        <span className="parameter-name">{name}</span>
        <div className="parameter-value-compound">
          <span className="token-symbol">{tokenInfo.symbol}</span>
          <span className="token-separator">—</span>
          <code className="parameter-value address-full">{value}</code>
        </div>
      </div>
    )
  }

  // No token info - just show full address
  return (
    <div className="parameter-row parameter-address">
      <span className="parameter-name">{name}</span>
      <code className="parameter-value address-full">{value}</code>
    </div>
  )
}

/**
 * Amount parameter with human-readable formatting
 */
function AmountParameter({ name, value, tokenInfo }) {
  const formatted = formatTokenAmount(value, tokenInfo.decimals)
  const isMax = value === '115792089237316195423570985008687907853269984665640564039457584007913129639935'

  if (isMax) {
    return (
      <div className="parameter-row parameter-amount">
        <span className="parameter-name">{name}</span>
        <div className="parameter-value-compound">
          <span className="amount-formatted amount-max">MAX (unlimited)</span>
          <span className="amount-symbol">{tokenInfo.symbol}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="parameter-row parameter-amount">
      <span className="parameter-name">{name}</span>
      <div className="parameter-value-compound">
        <span className="amount-formatted">{formatted}</span>
        <span className="amount-symbol">{tokenInfo.symbol}</span>
        <span className="amount-raw">raw: {formatLargeNumber(value)}</span>
      </div>
    </div>
  )
}

/**
 * Format token amount with decimals
 */
function formatTokenAmount(rawAmount, decimals = 18) {
  try {
    // Handle very large numbers
    if (rawAmount.length > 30) {
      // Use BigInt for precision
      const raw = BigInt(rawAmount)
      const divisor = BigInt(10 ** decimals)
      const whole = raw / divisor
      const remainder = raw % divisor

      if (remainder === 0n) {
        return formatWithCommas(whole.toString())
      }

      // Format with decimal places (up to 6)
      const remainderStr = remainder.toString().padStart(decimals, '0')
      const significantDecimals = remainderStr.slice(0, 6).replace(/0+$/, '')

      if (significantDecimals) {
        return `${formatWithCommas(whole.toString())}.${significantDecimals}`
      }
      return formatWithCommas(whole.toString())
    }

    // Smaller numbers - use regular math
    const raw = BigInt(rawAmount)
    const divisor = BigInt(10 ** decimals)
    const whole = raw / divisor
    const remainder = raw % divisor

    if (remainder === 0n) {
      return formatWithCommas(whole.toString())
    }

    const remainderStr = remainder.toString().padStart(decimals, '0')
    const significantDecimals = remainderStr.slice(0, 6).replace(/0+$/, '')

    if (significantDecimals) {
      return `${formatWithCommas(whole.toString())}.${significantDecimals}`
    }
    return formatWithCommas(whole.toString())
  } catch (e) {
    // Fallback to raw formatting
    return formatLargeNumber(rawAmount)
  }
}

/**
 * Add commas to number string
 */
function formatWithCommas(numStr) {
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Format large number with commas
 */
function formatLargeNumber(numStr) {
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Default value formatter
 */
function formatValue(value) {
  if (value === null || value === undefined) return 'null'

  // Handle BigInt (already serialized to string by server)
  if (typeof value === 'string' && /^\d+$/.test(value) && value.length > 15) {
    // Check if it's max uint256
    if (value === '115792089237316195423570985008687907853269984665640564039457584007913129639935') {
      return 'MAX_UINT256 (unlimited)'
    }
    return formatLargeNumber(value)
  }

  // Handle addresses - always show full
  if (isAddress(value)) {
    return value
  }

  // Handle hex data - don't truncate
  if (typeof value === 'string' && /^0x[a-fA-F0-9]+$/.test(value)) {
    return value
  }

  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length <= 3) {
      return `[${value.map(v => formatValue(v)).join(', ')}]`
    }
    return `[${value.length} items]`
  }

  // Handle objects
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}
