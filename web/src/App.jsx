import { useState } from 'react'
import InputPanel from './components/InputPanel'
import ResultsPanel from './components/ResultsPanel'
import AbiManager from './components/AbiManager'
import TrustProfileEditor from './components/TrustProfileEditor'
import PoweredByBadge from './components/PoweredByBadge'
import useDecoder from './hooks/useDecoder'
import signguardLogo from './assets/signguard_ai.png'

export default function App() {
  // Input state
  const [calldata, setCalldata] = useState('')
  const [targetAddress, setTargetAddress] = useState('')
  const [profile, setProfile] = useState(null)
  const [operation, setOperation] = useState(0) // 0=CALL, 1=DELEGATECALL

  // AI provider state
  const [aiProvider, setAiProvider] = useState(null)
  const [aiModel, setAiModel] = useState(null)

  // Modal state
  const [showAbiManager, setShowAbiManager] = useState(false)
  const [showProfileEditor, setShowProfileEditor] = useState(false)

  // Decoder hook
  const { result, error, isLoading, decode, reset } = useDecoder()

  // Check if result is critical severity
  const isCritical = result?.effect?.severity === 'CRITICAL' ||
                     result?.severity === 'CRITICAL' ||
                     result?.batchSummary?.overallSeverity === 'CRITICAL'

  const handleAnalyze = async (config) => {
    try {
      await decode(config)
    } catch (err) {
      // Error is handled by the hook
      console.error('Decode error:', err)
    }
  }

  const handleReset = () => {
    setCalldata('')
    setTargetAddress('')
    setProfile(null)
    setOperation(0)
    reset()
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className={`app-header ${isCritical ? 'header-critical' : ''}`}>
        <div className="app-header-left">
          <img src={signguardLogo} alt="SignGuard AI" className="app-logo" />
        </div>
        <PoweredByBadge provider={aiProvider} model={aiModel} />
      </header>

      {/* Main 2-column layout */}
      <main className="app-main">
        {/* Left Panel - Inputs */}
        <aside className="panel panel-left">
          <div className="panel-header">
            <h2 className="panel-title">Input</h2>
          </div>
          <div className="panel-content">
            <InputPanel
              calldata={calldata}
              setCalldata={setCalldata}
              targetAddress={targetAddress}
              setTargetAddress={setTargetAddress}
              profile={profile}
              setProfile={setProfile}
              onAnalyze={handleAnalyze}
              isLoading={isLoading}
              onManageAbis={() => setShowAbiManager(true)}
              onEditProfile={() => setShowProfileEditor(true)}
              aiProvider={aiProvider}
              setAiProvider={setAiProvider}
              aiModel={aiModel}
              setAiModel={setAiModel}
              operation={operation}
              setOperation={setOperation}
            />
          </div>
        </aside>

        {/* Right Panel - Results */}
        <section className="panel panel-right">
          <div className="panel-header">
            <div className="panel-header-row">
              <h2 className="panel-title">Analysis Results</h2>
              {result && (
                <button className="reset-btn" onClick={handleReset}>
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="panel-content">
            <ResultsPanel result={result} error={error} isLoading={isLoading} />
          </div>
        </section>
      </main>

      {/* Modals */}
      <AbiManager
        isOpen={showAbiManager}
        onClose={() => setShowAbiManager(false)}
      />
      <TrustProfileEditor
        isOpen={showProfileEditor}
        onClose={() => setShowProfileEditor(false)}
        currentProfile={profile}
        onProfileChange={setProfile}
      />
    </div>
  )
}
