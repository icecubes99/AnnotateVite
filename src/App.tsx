import React from 'react'
import { AppProvider, useApp } from './contexts/AppContext'
import RoleSelector from './components/RoleSelector'
import AnnotationInterface from './components/AnnotationInterface'
import AdjudicatorInterface from './components/AdjudicatorInterface'
import CSVLoader from './components/CSVLoader'
import KappaCalculator from './components/KappaCalculator'
import './App.css'

const AppContent: React.FC = () => {
  const { currentRole, setCurrentRole } = useApp()

  const renderContent = () => {
    if (!currentRole) {
      return <RoleSelector />
    }

    return (
      <>
        <div className="header-bar">
          <div className="header-bar-content">
            <h1>Annotation Tool - {currentRole === 'adjudicator' ? 'Adjudicator' : currentRole}</h1>
            <button onClick={() => setCurrentRole(null as any)} className="back-btn">
              Change Role
            </button>
          </div>
        </div>
        <div className="app-content">
          <div className="app-content-inner">
            {currentRole === 'adjudicator' ? (
              <>
                <div className="admin-section">
                  <CSVLoader />
                  <KappaCalculator />
                </div>
                <AdjudicatorInterface />
              </>
            ) : (
              <AnnotationInterface />
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="app-wrapper">
      <div className="app">{renderContent()}</div>
    </div>
  )
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}

export default App
