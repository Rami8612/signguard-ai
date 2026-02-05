import geminiLogo from '../assets/gemini.png'

export default function PoweredByBadge({ provider, model }) {
  // Only show for Gemini 3 models
  const isGemini3 = provider === 'gemini' && model?.includes('gemini-3')

  if (!isGemini3) return null

  return (
    <div className="powered-by-badge">
      <span className="powered-by-text">Powered by</span>
      <img
        src={geminiLogo}
        alt="Gemini"
        className="powered-by-logo"
      />
      
    </div>
  )
}
