import { useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const STORAGE_KEY = 'signguard-ai-settings'

export default function AIProviderSelector({
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange
}) {
  const [providers, setProviders] = useState([])
  const [defaultProvider, setDefaultProvider] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [customModel, setCustomModel] = useState('')
  const [useCustomModel, setUseCustomModel] = useState(false)

  // Load saved settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const settings = JSON.parse(saved)
        if (settings.provider) onProviderChange(settings.provider)
        if (settings.model) onModelChange(settings.model)
        if (settings.customModel) setCustomModel(settings.customModel)
        if (settings.useCustomModel) setUseCustomModel(settings.useCustomModel)
      } catch (e) {
        console.warn('Failed to load AI settings:', e)
      }
    }
  }, [])

  // Save settings to localStorage when they change
  useEffect(() => {
    if (selectedProvider) {
      const settings = {
        provider: selectedProvider,
        model: selectedModel,
        customModel,
        useCustomModel
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    }
  }, [selectedProvider, selectedModel, customModel, useCustomModel])

  useEffect(() => {
    fetchProviders()
  }, [])

  async function fetchProviders() {
    try {
      setIsLoading(true)
      const response = await fetch(`${API_BASE}/api/ai-providers`)
      if (!response.ok) throw new Error('Failed to fetch providers')
      const data = await response.json()
      setProviders(data.providers || [])
      setDefaultProvider(data.defaultProvider)

      // Set initial selection if not already set (and no saved settings)
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved && !selectedProvider && data.defaultProvider) {
        onProviderChange(data.defaultProvider)
        const provider = data.providers.find(p => p.id === data.defaultProvider)
        if (provider && !selectedModel) {
          onModelChange(provider.defaultModel)
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  function handleProviderChange(providerId) {
    onProviderChange(providerId)
    const provider = providers.find(p => p.id === providerId)
    if (provider && !useCustomModel) {
      onModelChange(provider.defaultModel)
    }
    // If using custom model, keep it
    if (useCustomModel && customModel) {
      onModelChange(customModel)
    }
  }

  function handleModelSelect(modelId) {
    setUseCustomModel(false)
    onModelChange(modelId)
    setIsExpanded(false)
  }

  function handleCustomModelChange(value) {
    setCustomModel(value)
    if (value.trim()) {
      setUseCustomModel(true)
      onModelChange(value.trim())
    }
  }

  function handleUseCustomModel() {
    if (customModel.trim()) {
      setUseCustomModel(true)
      onModelChange(customModel.trim())
      setIsExpanded(false)
    }
  }

  const currentProvider = providers.find(p => p.id === selectedProvider)
  const availableModels = currentProvider?.models || []

  // Get display name for current model
  const getModelDisplayName = () => {
    if (useCustomModel && customModel) {
      return customModel
    }
    const model = availableModels.find(m => m.id === selectedModel)
    return model?.name || selectedModel || 'Select model'
  }

  if (isLoading) {
    return (
      <div className="ai-provider-selector">
        <div className="ai-provider-loading">Loading AI providers...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ai-provider-selector">
        <div className="ai-provider-error">{error}</div>
      </div>
    )
  }

  return (
    <div className="ai-provider-selector">
      <button
        className="ai-provider-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <span className="ai-provider-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
            <circle cx="8" cy="14" r="1"/>
            <circle cx="16" cy="14" r="1"/>
          </svg>
        </span>
        <span className="ai-provider-label">
          AI: {currentProvider?.name || 'Select'} / {getModelDisplayName()}
        </span>
        <span className={`ai-provider-arrow ${isExpanded ? 'expanded' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6,9 12,15 18,9"/>
          </svg>
        </span>
      </button>

      {isExpanded && (
        <div className="ai-provider-dropdown">
          <div className="ai-provider-section">
            <label className="ai-provider-section-label">Provider</label>
            <div className="ai-provider-options">
              {providers.map(provider => (
                <button
                  key={provider.id}
                  className={`ai-provider-option ${selectedProvider === provider.id ? 'selected' : ''} ${!provider.available ? 'unavailable' : ''}`}
                  onClick={() => provider.available && handleProviderChange(provider.id)}
                  disabled={!provider.available}
                  type="button"
                >
                  <span className="provider-name">{provider.name}</span>
                  {!provider.available && (
                    <span className="provider-status">No API Key</span>
                  )}
                  {provider.id === defaultProvider && provider.available && (
                    <span className="provider-default">Default</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {currentProvider && (
            <div className="ai-provider-section">
              <label className="ai-provider-section-label">Model</label>

              {/* Predefined models */}
              <div className="ai-model-options">
                {availableModels.map(model => (
                  <button
                    key={model.id}
                    className={`ai-model-option ${selectedModel === model.id && !useCustomModel ? 'selected' : ''}`}
                    onClick={() => handleModelSelect(model.id)}
                    type="button"
                  >
                    {model.name}
                    {model.id === currentProvider.defaultModel && (
                      <span className="model-default">Default</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Custom model input */}
              <div className="ai-custom-model">
                <label className="ai-custom-model-label">Custom Model ID</label>
                <div className="ai-custom-model-input-row">
                  <input
                    type="text"
                    className={`ai-custom-model-input ${useCustomModel ? 'active' : ''}`}
                    placeholder="e.g., gpt-4-turbo-preview"
                    value={customModel}
                    onChange={(e) => handleCustomModelChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleUseCustomModel()
                      }
                    }}
                  />
                  {customModel && (
                    <button
                      type="button"
                      className={`ai-custom-model-use ${useCustomModel ? 'active' : ''}`}
                      onClick={handleUseCustomModel}
                    >
                      {useCustomModel ? 'Active' : 'Use'}
                    </button>
                  )}
                </div>
                <p className="ai-custom-model-hint">
                  Enter any model ID supported by {currentProvider?.name}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
