import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTestEnvironment } from '../contexts/TestEnvironmentContext';

interface TestModeBannerProps {
  sidebarOpen?: boolean;
}

export const TestModeBanner: React.FC<TestModeBannerProps> = ({ sidebarOpen = true }) => {
  const { isTestMode, setTestMode } = useTestEnvironment();

  if (!isTestMode) return null;

  return (
    <div className={`fixed top-0 right-0 z-[9999] bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg transition-all duration-300 ease-in-out ${sidebarOpen ? 'left-64' : 'left-20'}`}>
      <div className="container mx-auto px-4 py-1.5 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 animate-pulse" />
          <p className="font-bold text-xs uppercase tracking-wide">Test Mode Active</p>
        </div>
        <button
          onClick={() => setTestMode(false)}
          className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-bold uppercase tracking-wide transition-all"
        >
          Exit
        </button>
      </div>
    </div>
  );
};
