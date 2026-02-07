import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface TestEnvironmentContextType {
  isTestMode: boolean;
  setTestMode: (enabled: boolean) => void;
  getTableName: (baseTable: string) => string;
}

const TestEnvironmentContext = createContext<TestEnvironmentContextType | undefined>(undefined);

export const TestEnvironmentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isTestMode, setIsTestMode] = useState<boolean>(() => {
    // Load from localStorage on initialization
    const stored = localStorage.getItem('test_environment_enabled');
    return stored === 'true';
  });

  useEffect(() => {
    // Save to localStorage whenever it changes
    localStorage.setItem('test_environment_enabled', isTestMode.toString());
  }, [isTestMode]);

  const setTestMode = (enabled: boolean) => {
    setIsTestMode(enabled);
    // Reload the page to ensure all services use the new table names
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const getTableName = (baseTable: string): string => {
    return isTestMode ? `${baseTable}_test` : baseTable;
  };

  return (
    <TestEnvironmentContext.Provider value={{ isTestMode, setTestMode, getTableName }}>
      {children}
    </TestEnvironmentContext.Provider>
  );
};

export const useTestEnvironment = () => {
  const context = useContext(TestEnvironmentContext);
  if (context === undefined) {
    throw new Error('useTestEnvironment must be used within a TestEnvironmentProvider');
  }
  return context;
};
