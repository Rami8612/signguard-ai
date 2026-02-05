export default function ProfileUpload({ profile, onUpload, onClear }) {
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result)
        onUpload(json)
      } catch (err) {
        alert('Invalid JSON file')
      }
    }
    reader.readAsText(file)
    e.target.value = '' // Reset input
  }

  return (
    <div className="input-group">
      <label className="input-label">Trust Profile (Optional)</label>
      {profile ? (
        <div className="profile-loaded">
          <span className="profile-loaded-text">
            Profile loaded: {profile.safeAddress ? `${profile.safeAddress.slice(0, 10)}...` : 'Custom'}
          </span>
          <button className="profile-clear-btn" onClick={onClear}>
            Clear
          </button>
        </div>
      ) : (
        <label className="profile-upload-btn">
          Upload JSON
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </label>
      )}
    </div>
  )
}
