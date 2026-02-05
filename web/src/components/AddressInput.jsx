export default function AddressInput({ value, onChange }) {
  const isValid = !value || /^0x[a-fA-F0-9]{40}$/.test(value)
  const hasValue = value.length > 0

  return (
    <div className="input-group">
      <label className="input-label">Target Contract Address</label>
      <div className="address-input-wrapper">
        <input
          type="text"
          className={`address-input ${hasValue ? (isValid ? 'valid' : 'invalid') : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0x..."
          spellCheck={false}
        />
        {hasValue && (
          <span className={`validation-indicator ${isValid ? 'valid' : 'invalid'}`}>
            {isValid ? '✓' : '✗'}
          </span>
        )}
      </div>
      {hasValue && !isValid && (
        <span className="input-error">Invalid Ethereum address</span>
      )}
    </div>
  )
}
