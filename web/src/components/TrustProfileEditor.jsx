import { useState, useEffect, useCallback } from 'react'
import Modal from './Modal'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const TRUST_LEVELS = ['INTERNAL', 'PROTOCOL', 'PARTNER', 'WATCHED']

const TRUST_LEVEL_DESCRIPTIONS = {
  INTERNAL: 'Team-controlled contract - highest trust',
  PROTOCOL: 'Verified DeFi protocol - high trust, selector-restricted',
  PARTNER: 'Known external party - medium trust, selector-restricted',
  WATCHED: 'Recognized but not trusted - informational only'
}

export default function TrustProfileEditor({ isOpen, onClose, currentProfile, onProfileChange }) {
  const [profiles, setProfiles] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  // New profile form state
  const [newProfile, setNewProfile] = useState({
    safeAddress: '',
    description: ''
  })

  // Contract form state
  const [isAddingContract, setIsAddingContract] = useState(false)
  const [editingContract, setEditingContract] = useState(null)
  const [contractForm, setContractForm] = useState({
    address: '',
    label: '',
    trustLevel: 'PROTOCOL',
    allowedSelectors: '*',
    selectorsText: '',
    notes: ''
  })

  // Load profiles list
  const loadProfiles = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/api/profiles`)
      if (!response.ok) {
        throw new Error('Failed to load profiles')
      }
      const data = await response.json()
      setProfiles(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load specific profile
  const loadProfile = async (safeAddress) => {
    try {
      const response = await fetch(`${API_BASE}/api/profiles/${safeAddress}`)
      if (!response.ok) {
        throw new Error('Failed to load profile')
      }
      const data = await response.json()
      setSelectedProfile(data)
      setIsEditing(true)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadProfiles()
      setSelectedProfile(null)
      setIsEditing(false)
      setIsCreating(false)
    }
  }, [isOpen, loadProfiles])

  // Validation helpers
  const isValidAddress = (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr)
  const isValidSelector = (sel) => /^0x[a-fA-F0-9]{8}$/.test(sel)

  // Parse selectors from text
  const parseSelectors = (text) => {
    if (!text.trim() || text.trim() === '*') return '*'
    const selectors = text.split(/[\s,]+/).filter(s => s.trim())
    return selectors
  }

  // Truncate address
  const truncateAddress = (addr) => `${addr.slice(0, 10)}...${addr.slice(-8)}`

  // Create new profile
  const handleCreateProfile = () => {
    setIsCreating(true)
    setNewProfile({ safeAddress: '', description: '' })
    setFormError(null)
  }

  // Save new profile
  const handleSaveNewProfile = async () => {
    setFormError(null)

    if (!isValidAddress(newProfile.safeAddress)) {
      setFormError('Invalid Safe address format')
      return
    }

    const profile = {
      safeAddress: newProfile.safeAddress.toLowerCase(),
      version: '1.0',
      description: newProfile.description || '',
      trustedContracts: {},
      trustedAssets: {},
      selectorUsageHistory: {}
    }

    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE}/api/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to save profile')
      }

      await loadProfiles()
      setIsCreating(false)
      setSelectedProfile(profile)
      setIsEditing(true)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  // Save profile changes
  const handleSaveProfile = async () => {
    if (!selectedProfile) return

    setIsSaving(true)
    setFormError(null)
    try {
      const response = await fetch(`${API_BASE}/api/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: selectedProfile })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to save profile')
      }

      await loadProfiles()

      // Notify parent if this profile is loaded
      if (onProfileChange && currentProfile?.safeAddress?.toLowerCase() === selectedProfile.safeAddress.toLowerCase()) {
        onProfileChange(selectedProfile)
      }
    } catch (err) {
      setFormError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  // Delete profile
  const handleDeleteProfile = async (safeAddress) => {
    if (!confirm(`Delete profile for ${safeAddress}?`)) return

    try {
      const response = await fetch(`${API_BASE}/api/profiles/${safeAddress}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete profile')
      }

      await loadProfiles()

      // Clear selection if deleted
      if (selectedProfile?.safeAddress.toLowerCase() === safeAddress.toLowerCase()) {
        setSelectedProfile(null)
        setIsEditing(false)
      }

      // Notify parent if this was the loaded profile
      if (onProfileChange && currentProfile?.safeAddress?.toLowerCase() === safeAddress.toLowerCase()) {
        onProfileChange(null)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  // Open contract form for adding
  const handleAddContract = () => {
    setIsAddingContract(true)
    setEditingContract(null)
    setContractForm({
      address: '',
      label: '',
      trustLevel: 'PROTOCOL',
      allowedSelectors: '*',
      selectorsText: '',
      notes: ''
    })
    setFormError(null)
  }

  // Open contract form for editing
  const handleEditContract = (address, config) => {
    setEditingContract(address)
    setIsAddingContract(true)
    setContractForm({
      address: address,
      label: config.label || '',
      trustLevel: config.trustLevel || 'PROTOCOL',
      allowedSelectors: config.allowedSelectors,
      selectorsText: config.allowedSelectors === '*' ? '*' : config.allowedSelectors.join(', '),
      notes: config.notes || ''
    })
    setFormError(null)
  }

  // Save contract to profile
  const handleSaveContract = () => {
    setFormError(null)

    if (!isValidAddress(contractForm.address)) {
      setFormError('Invalid contract address format')
      return
    }

    if (!contractForm.label.trim()) {
      setFormError('Label is required')
      return
    }

    const selectors = parseSelectors(contractForm.selectorsText)
    if (selectors !== '*') {
      for (const sel of selectors) {
        if (!isValidSelector(sel)) {
          setFormError(`Invalid selector format: ${sel}`)
          return
        }
      }
    }

    const normalizedAddress = contractForm.address.toLowerCase()
    const contractConfig = {
      label: contractForm.label.trim(),
      trustLevel: contractForm.trustLevel,
      allowedSelectors: selectors,
      notes: contractForm.notes.trim() || undefined
    }

    // Update profile
    const updatedContracts = { ...selectedProfile.trustedContracts }

    // If editing and address changed, remove old entry
    if (editingContract && editingContract.toLowerCase() !== normalizedAddress) {
      delete updatedContracts[editingContract.toLowerCase()]
    }

    updatedContracts[normalizedAddress] = contractConfig

    setSelectedProfile({
      ...selectedProfile,
      trustedContracts: updatedContracts
    })

    setIsAddingContract(false)
    setEditingContract(null)
  }

  // Delete contract from profile
  const handleDeleteContract = (address) => {
    if (!confirm(`Remove contract ${truncateAddress(address)} from profile?`)) return

    const updatedContracts = { ...selectedProfile.trustedContracts }
    delete updatedContracts[address.toLowerCase()]

    setSelectedProfile({
      ...selectedProfile,
      trustedContracts: updatedContracts
    })
  }

  // Load profile into decoder
  const handleLoadProfile = () => {
    if (selectedProfile && onProfileChange) {
      onProfileChange(selectedProfile)
      onClose()
    }
  }

  // Render profile list view
  const renderProfileList = () => (
    <div className="profile-list-view">
      <div className="manager-actions">
        <button className="btn-primary" onClick={handleCreateProfile}>
          + New Profile
        </button>
      </div>

      {error && <div className="manager-error">{error}</div>}
      {isLoading && <div className="manager-loading">Loading profiles...</div>}

      {!isLoading && (
        <div className="profile-list">
          {profiles.length === 0 ? (
            <div className="empty-state">
              <p>No profiles saved yet.</p>
              <p className="empty-hint">Create a profile to define trusted contracts for your Safe.</p>
            </div>
          ) : (
            profiles.map((profile) => (
              <div key={profile.safeAddress} className="profile-item">
                <div className="profile-item-info">
                  <span className="profile-address" title={profile.safeAddress}>
                    {truncateAddress(profile.safeAddress)}
                  </span>
                  <span className="profile-contracts">{profile.contractCount} contracts</span>
                  {profile.description && (
                    <span className="profile-description">{profile.description}</span>
                  )}
                </div>
                <div className="profile-item-actions">
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => loadProfile(profile.safeAddress)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-danger btn-sm"
                    onClick={() => handleDeleteProfile(profile.safeAddress)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )

  // Render create profile form
  const renderCreateForm = () => (
    <div className="profile-create-form">
      <h3 className="form-section-title">Create New Profile</h3>

      {formError && <div className="form-error">{formError}</div>}

      <div className="form-row">
        <label className="form-label">Safe Address *</label>
        <input
          type="text"
          className={`form-input ${newProfile.safeAddress && !isValidAddress(newProfile.safeAddress) ? 'invalid' : ''}`}
          placeholder="0x..."
          value={newProfile.safeAddress}
          onChange={e => setNewProfile({ ...newProfile, safeAddress: e.target.value })}
        />
      </div>

      <div className="form-row">
        <label className="form-label">Description (optional)</label>
        <input
          type="text"
          className="form-input"
          placeholder="e.g., Treasury Safe"
          value={newProfile.description}
          onChange={e => setNewProfile({ ...newProfile, description: e.target.value })}
        />
      </div>

      <div className="form-actions">
        <button className="btn-secondary" onClick={() => setIsCreating(false)}>
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={handleSaveNewProfile}
          disabled={isSaving || !newProfile.safeAddress}
        >
          {isSaving ? 'Creating...' : 'Create Profile'}
        </button>
      </div>
    </div>
  )

  // Render contract form
  const renderContractForm = () => (
    <div className="contract-form">
      <h4 className="form-section-title">
        {editingContract ? 'Edit Contract' : 'Add Trusted Contract'}
      </h4>

      {formError && <div className="form-error">{formError}</div>}

      <div className="form-row">
        <label className="form-label">Contract Address *</label>
        <input
          type="text"
          className={`form-input ${contractForm.address && !isValidAddress(contractForm.address) ? 'invalid' : ''}`}
          placeholder="0x..."
          value={contractForm.address}
          onChange={e => setContractForm({ ...contractForm, address: e.target.value })}
          disabled={!!editingContract}
        />
      </div>

      <div className="form-row">
        <label className="form-label">Label *</label>
        <input
          type="text"
          className="form-input"
          placeholder="e.g., Uniswap V3 Router"
          value={contractForm.label}
          onChange={e => setContractForm({ ...contractForm, label: e.target.value })}
        />
      </div>

      <div className="form-row">
        <label className="form-label">Trust Level</label>
        <select
          className="form-input form-select"
          value={contractForm.trustLevel}
          onChange={e => setContractForm({ ...contractForm, trustLevel: e.target.value })}
        >
          {TRUST_LEVELS.map(level => (
            <option key={level} value={level}>{level}</option>
          ))}
        </select>
        <span className="form-hint">{TRUST_LEVEL_DESCRIPTIONS[contractForm.trustLevel]}</span>
      </div>

      <div className="form-row">
        <label className="form-label">Allowed Selectors</label>
        <input
          type="text"
          className="form-input"
          placeholder='* for all, or comma-separated: 0x12345678, 0xabcdef01'
          value={contractForm.selectorsText}
          onChange={e => setContractForm({ ...contractForm, selectorsText: e.target.value })}
        />
        <span className="form-hint">Use * to allow all selectors, or list specific 4-byte selectors</span>
      </div>

      <div className="form-row">
        <label className="form-label">Notes (optional)</label>
        <textarea
          className="form-input form-textarea-sm"
          placeholder="Why is this contract trusted?"
          value={contractForm.notes}
          onChange={e => setContractForm({ ...contractForm, notes: e.target.value })}
          rows={2}
        />
      </div>

      <div className="form-actions">
        <button className="btn-secondary" onClick={() => {
          setIsAddingContract(false)
          setEditingContract(null)
        }}>
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={handleSaveContract}
          disabled={!contractForm.address || !contractForm.label}
        >
          {editingContract ? 'Update Contract' : 'Add Contract'}
        </button>
      </div>
    </div>
  )

  // Render profile editor
  const renderProfileEditor = () => (
    <div className="profile-editor">
      <div className="editor-header">
        <button className="btn-back" onClick={() => {
          setIsEditing(false)
          setSelectedProfile(null)
          setIsAddingContract(false)
        }}>
          &larr; Back to List
        </button>
        <div className="editor-title">
          <h3>Edit Profile</h3>
          <span className="profile-address-display">{selectedProfile.safeAddress}</span>
        </div>
      </div>

      {formError && <div className="form-error">{formError}</div>}

      {/* Profile info */}
      <div className="editor-section">
        <div className="form-row">
          <label className="form-label">Description</label>
          <input
            type="text"
            className="form-input"
            value={selectedProfile.description || ''}
            onChange={e => setSelectedProfile({ ...selectedProfile, description: e.target.value })}
            placeholder="Profile description..."
          />
        </div>
      </div>

      {/* Contract form or list */}
      {isAddingContract ? (
        renderContractForm()
      ) : (
        <div className="editor-section">
          <div className="section-header">
            <h4 className="section-title">Trusted Contracts</h4>
            <button className="btn-primary btn-sm" onClick={handleAddContract}>
              + Add Contract
            </button>
          </div>

          <div className="contracts-list">
            {Object.keys(selectedProfile.trustedContracts || {}).length === 0 ? (
              <div className="empty-state-sm">
                <p>No trusted contracts defined.</p>
              </div>
            ) : (
              Object.entries(selectedProfile.trustedContracts).map(([address, config]) => (
                <div key={address} className="contract-item">
                  <div className="contract-item-info">
                    <div className="contract-header">
                      <span className="contract-label">{config.label}</span>
                      <span className={`trust-level trust-level-${config.trustLevel.toLowerCase()}`}>
                        {config.trustLevel}
                      </span>
                    </div>
                    <span className="contract-address">{truncateAddress(address)}</span>
                    <span className="contract-selectors">
                      {config.allowedSelectors === '*'
                        ? 'All selectors allowed'
                        : `${config.allowedSelectors.length} selectors allowed`
                      }
                    </span>
                  </div>
                  <div className="contract-item-actions">
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => handleEditContract(address, config)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => handleDeleteContract(address)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      {!isAddingContract && (
        <div className="editor-actions">
          <button className="btn-secondary" onClick={handleLoadProfile}>
            Load in Decoder
          </button>
          <button
            className="btn-primary"
            onClick={handleSaveProfile}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Trust Profiles">
      <div className="trust-profile-editor">
        {isCreating && renderCreateForm()}
        {isEditing && selectedProfile && renderProfileEditor()}
        {!isCreating && !isEditing && renderProfileList()}
      </div>
    </Modal>
  )
}
