import React, { createContext, useContext, useState } from 'react'

type UserRole = 'annotator1' | 'annotator2' | 'adjudicator'

interface AppContextType {
  currentRole: UserRole | null
  setCurrentRole: (role: UserRole) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export const useApp = () => {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null)

  const value = {
    currentRole,
    setCurrentRole,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}