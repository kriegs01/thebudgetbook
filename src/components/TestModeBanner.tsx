import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTestEnvironment } from '../contexts/TestEnvironmentContext';

export const TestModeBanner: React.FC = () => {
  const { isTestMode, setTestMode } = useTestEnvironment();

  if (!isTestMode) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <AlertTriangle className="w-5 h-5 animate-pulse" />
          <div>
            <p className="font-black text-sm uppercase tracking-wide">Test Environment Active</p>
            <p className="text-xs opacity-90">Changes will not affect production data</p>
          </div>
        </div>
        <button
          onClick={() => setTestMode(false)}
          className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold uppercase tracking-wide transition-all"
        >
          Exit Test Mode
        </button>
      </div>
    </div>
  );
};
