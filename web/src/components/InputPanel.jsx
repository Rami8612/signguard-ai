import CalldataInput from './CalldataInput'
import AddressInput from './AddressInput'
import TransactionHashInput from './TransactionHashInput'
import ProfileUpload from './ProfileUpload'
import AnalyzeButton from './AnalyzeButton'
import ManagementButtons from './ManagementButtons'
import AIProviderSelector from './AIProviderSelector'

export default function InputPanel({
  calldata,
  setCalldata,
  targetAddress,
  setTargetAddress,
  profile,
  setProfile,
  onAnalyze,
  isLoading,
  onManageAbis,
  onEditProfile,
  aiProvider,
  setAiProvider,
  aiModel,
  setAiModel,
  operation,
  setOperation
}) {
  const canAnalyze = calldata.trim().length >= 10 // At least selector

  const handleAnalyze = () => {
    if (canAnalyze) {
      onAnalyze({ calldata, targetAddress, profile, aiProvider, aiModel, operation })
    }
  }

  const handleTransactionFetched = (txData) => {
    // Auto-fill fields from fetched transaction
    if (txData.calldata) {
      setCalldata(txData.calldata)
    }
    if (txData.targetAddress) {
      setTargetAddress(txData.targetAddress)
    }
    if (typeof txData.operation === 'number') {
      setOperation(txData.operation)
    }
  }

  return (
    <div className="input-panel">
      {/* Transaction Hash Input (optional - auto-fills other fields) */}
      <TransactionHashInput
        onTransactionFetched={handleTransactionFetched}
        isLoading={isLoading}
      />

      <div className="input-divider">
        <span className="input-divider-text">or enter manually</span>
      </div>

      <CalldataInput value={calldata} onChange={setCalldata} />

      <AddressInput value={targetAddress} onChange={setTargetAddress} />

      {/* Safe Operation Field */}
      <div className="input-group">
        <label className="input-label">
          Operation <span className="input-label-hint">(Safe execTransaction)</span>
        </label>
        <div className="operation-input-row">
          <div className="operation-input-wrapper">
            <input
              type="number"
              className={`operation-input ${operation === 1 ? 'delegatecall' : ''}`}
              value={operation}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (val === 0 || val === 1) {
                  setOperation(val)
                } else if (e.target.value === '') {
                  setOperation(0)
                }
              }}
              min="0"
              max="1"
              placeholder="0"
            />
            <span className="operation-type-label">
              {operation === 0 ? 'CALL' : 'DELEGATECALL'}
            </span>
          </div>
          <div className="operation-quick-btns">
            <button
              type="button"
              className={`operation-quick-btn ${operation === 0 ? 'active' : ''}`}
              onClick={() => setOperation(0)}
              title="CALL"
            >
              0
            </button>
            <button
              type="button"
              className={`operation-quick-btn delegatecall ${operation === 1 ? 'active' : ''}`}
              onClick={() => setOperation(1)}
              title="DELEGATECALL"
            >
              1
            </button>
          </div>
        </div>
        {operation === 1 && (
          <p className="operation-warning">
            DELEGATECALL (1) executes code with your Safe's full permissions
          </p>
        )}
      </div>

      <ProfileUpload
        profile={profile}
        onUpload={setProfile}
        onClear={() => setProfile(null)}
      />

      <ManagementButtons
        onManageAbis={onManageAbis}
        onEditProfile={onEditProfile}
      />

      <div className="input-panel-spacer" />

      <div className="input-panel-actions">
        <AnalyzeButton
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          isLoading={isLoading}
        />
      </div>

      <AIProviderSelector
        selectedProvider={aiProvider}
        selectedModel={aiModel}
        onProviderChange={setAiProvider}
        onModelChange={setAiModel}
      />
    </div>
  )
}
