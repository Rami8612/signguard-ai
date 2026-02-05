export default function CalldataInput({ value, onChange }) {
  return (
    <div className="input-group">
      <label className="input-label">Calldata</label>
      <textarea
        className="calldata-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0x095ea7b3000000000000000000000000..."
        spellCheck={false}
      />
    </div>
  )
}
