export default function AnalyzeButton({ onClick, disabled, isLoading }) {
  return (
    <button
      className="analyze-btn"
      onClick={onClick}
      disabled={disabled || isLoading}
    >
      {isLoading ? 'Analyzing...' : 'Analyze Calldata'}
    </button>
  )
}
