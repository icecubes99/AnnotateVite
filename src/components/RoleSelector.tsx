import React from 'react'
import { useApp } from '../contexts/AppContext'

const RoleSelector: React.FC = () => {
  const { setCurrentRole } = useApp()

  return (
    <div className="role-selector">
      <h2>Select Your Role</h2>
      <div className="role-buttons">
        <button 
          onClick={() => setCurrentRole('annotator1')}
          className="role-button annotator1"
        >
          Annotator 1 (San San)
        </button>
        <button 
          onClick={() => setCurrentRole('annotator2')}
          className="role-button annotator2"
        >
          Annotator 2 (Yunny)
        </button>
        <button 
          onClick={() => setCurrentRole('adjudicator')}
          className="role-button adjudicator"
        >
          Adjudicator (Emman)
        </button>
      </div>
    </div>
  )
}

export default RoleSelector