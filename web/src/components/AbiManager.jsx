import { useState, useEffect, useCallback } from 'react'
import Modal from './Modal'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function AbiManager({ isOpen, onClose }) {
  const [abis, setAbis] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isAdding, setIsAdding] = useState(false)
  const [newAbi, setNewAbi] = useState({
    address: '',
    chain: 'ethereum',
    abiText: '',
    name: ''
  })
  const [formError, setFormError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  // Load ABIs when modal opens
  const loadAbis = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/api/abis`)
      if (!response.ok) {
        throw new Error('Failed to load ABIs')
      }
      const data = await response.json()
      setAbis(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadAbis()
    }
  }, [isOpen, loadAbis])

  // Validate address format
  const isValidAddress = (addr) => {
    return /^0x[a-fA-F0-9]{40}$/.test(addr)
  }

  // Validate ABI JSON
  const isValidAbi = (text) => {
    try {
      const parsed = JSON.parse(text)
      return Array.isArray(parsed)
    } catch {
      return false
    }
  }

  // Handle save new ABI
  const handleSave = async () => {
    setFormError(null)

    // Validate address
    if (!isValidAddress(newAbi.address)) {
      setFormError('Invalid address format. Must be 0x followed by 40 hex characters.')
      return
    }

    // Validate ABI
    if (!isValidAbi(newAbi.abiText)) {
      setFormError('Invalid ABI format. Must be a valid JSON array.')
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE}/api/abis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: newAbi.address.toLowerCase(),
          chain: newAbi.chain,
          abi: JSON.parse(newAbi.abiText),
          name: newAbi.name || undefined
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to save ABI')
      }

      // Reset form and reload list
      setNewAbi({ address: '', chain: 'ethereum', abiText: '', name: '' })
      setIsAdding(false)
      await loadAbis()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  // Handle delete ABI
  const handleDelete = async (chain, address) => {
    if (!confirm(`Delete ABI for ${address}?`)) {
      return
    }

    try {
      const response = await fetch(`${API_BASE}/api/abis/${chain}/${address}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete ABI')
      }

      await loadAbis()
    } catch (err) {
      setError(err.message)
    }
  }

  // Truncate address for display
  const truncateAddress = (addr) => {
    return `${addr.slice(0, 10)}...${addr.slice(-8)}`
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage ABIs">
      <div className="abi-manager">
        {/* Header actions */}
        <div className="manager-actions">
          {!isAdding && (
            <button className="btn-primary" onClick={() => setIsAdding(true)}>
              + Add New ABI
            </button>
          )}
        </div>

        {/* Add form */}
        {isAdding && (
          <div className="add-form">
            <h3 className="form-section-title">Add New ABI</h3>

            {formError && (
              <div className="form-error">{formError}</div>
            )}

            <div className="form-row">
              <label className="form-label">Contract Address *</label>
              <input
                type="text"
                className={`form-input ${newAbi.address && !isValidAddress(newAbi.address) ? 'invalid' : ''}`}
                placeholder="0x..."
                value={newAbi.address}
                onChange={e => setNewAbi({ ...newAbi, address: e.target.value })}
              />
            </div>

            <div className="form-row">
              <label className="form-label">Chain</label>
              <select
                className="form-input form-select"
                value={newAbi.chain}
                onChange={e => setNewAbi({ ...newAbi, chain: e.target.value })}
              >
                <option value="ethereum">Ethereum</option>
                <option value="polygon">Polygon</option>
                <option value="arbitrum">Arbitrum</option>
                <option value="optimism">Optimism</option>
                <option value="base">Base</option>
                <option value="gnosis">Gnosis</option>
              </select>
            </div>

            <div className="form-row">
              <label className="form-label">Name (optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., Uniswap Router"
                value={newAbi.name}
                onChange={e => setNewAbi({ ...newAbi, name: e.target.value })}
              />
            </div>

            <div className="form-row">
              <label className="form-label">ABI JSON *</label>
              <textarea
                className={`form-input form-textarea ${newAbi.abiText && !isValidAbi(newAbi.abiText) ? 'invalid' : ''}`}
                placeholder='[{"type":"function","name":"transfer",...}]'
                value={newAbi.abiText}
                onChange={e => setNewAbi({ ...newAbi, abiText: e.target.value })}
                rows={8}
              />
            </div>

            <div className="form-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setIsAdding(false)
                  setFormError(null)
                  setNewAbi({ address: '', chain: 'ethereum', abiText: '', name: '' })
                }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={isSaving || !newAbi.address || !newAbi.abiText}
              >
                {isSaving ? 'Saving...' : 'Save ABI'}
              </button>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="manager-error">{error}</div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="manager-loading">Loading ABIs...</div>
        )}

        {/* ABI list */}
        {!isLoading && !isAdding && (
          <div className="abi-list">
            {abis.length === 0 ? (
              <div className="empty-state">
                <p>No ABIs saved yet.</p>
                <p className="empty-hint">Add an ABI to enable verified decoding for contracts.</p>
              </div>
            ) : (
              abis.map((abi) => (
                <div key={`${abi.chain}-${abi.address}`} className="abi-item">
                  <div className="abi-item-info">
                    <span className="abi-address" title={abi.address}>
                      {truncateAddress(abi.address)}
                    </span>
                    <span className="abi-chain">{abi.chain}</span>
                    <span className="abi-functions">{abi.functionCount} functions</span>
                  </div>
                  <button
                    className="btn-danger btn-sm"
                    onClick={() => handleDelete(abi.chain, abi.address)}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
