import { useState } from 'react'

export default function TransactionHashInput({ onTransactionFetched, isLoading: externalLoading }) {
  const [txHash, setTxHash] = useState('')
  const [rpcUrl, setRpcUrl] = useState('https://eth.llamarpc.com')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showRpcInput, setShowRpcInput] = useState(false)

  const isValidTxHash = txHash.match(/^0x[a-fA-F0-9]{64}$/)

  const handleFetch = async () => {
    if (!isValidTxHash) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/fetch-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash, rpcUrl })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to fetch transaction')
      }

      onTransactionFetched(data)
      setTxHash('')
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && isValidTxHash && !isLoading) {
      handleFetch()
    }
  }

  return (
    <div className="input-group tx-hash-group">
      <div className="tx-hash-label-row">
        <label className="input-label">
          Transaction Hash <span className="input-label-hint">(optional)</span>
        </label>
        <button
          type="button"
          className="rpc-toggle-btn"
          onClick={() => setShowRpcInput(!showRpcInput)}
          title="Configure RPC URL"
        >
          RPC
        </button>
      </div>

      {showRpcInput && (
        <div className="rpc-input-wrapper">
          <input
            type="text"
            className="rpc-input"
            value={rpcUrl}
            onChange={(e) => setRpcUrl(e.target.value)}
            placeholder="https://eth.llamarpc.com"
          />
        </div>
      )}

      <div className="tx-hash-input-row">
        <input
          type="text"
          className={`tx-hash-input ${txHash && !isValidTxHash ? 'invalid' : ''} ${isValidTxHash ? 'valid' : ''}`}
          value={txHash}
          onChange={(e) => setTxHash(e.target.value.trim())}
          onKeyDown={handleKeyDown}
          placeholder="0x..."
          disabled={isLoading || externalLoading}
        />
        <button
          type="button"
          className="tx-fetch-btn"
          onClick={handleFetch}
          disabled={!isValidTxHash || isLoading || externalLoading}
        >
          {isLoading ? 'Fetching...' : 'Fetch'}
        </button>
      </div>

      {error && (
        <p className="tx-hash-error">{error}</p>
      )}

      <p className="tx-hash-hint">
        Paste a tx hash to auto-fill calldata, target, and operation from chain
      </p>
    </div>
  )
}
