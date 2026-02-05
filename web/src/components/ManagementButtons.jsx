export default function ManagementButtons({ onManageAbis, onEditProfile }) {
  return (
    <div className="management-buttons">
      <button
        className="management-btn"
        onClick={onManageAbis}
        title="Manage local ABI registry"
      >
        <span className="management-btn-icon">{ }</span>
        Manage ABIs
      </button>
      <button
        className="management-btn"
        onClick={onEditProfile}
        title="Create and edit trust profiles"
      >
        <span className="management-btn-icon">*</span>
        Edit Profiles
      </button>
    </div>
  )
}
