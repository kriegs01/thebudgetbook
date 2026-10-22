// src/components/EngineInfoModal.tsx
import React from 'react';
import { AccountProfile } from '../utils/creditEngines/accountProfiles';

interface EngineInfoModalProps {
  profile: AccountProfile | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EngineInfoModal: React.FC<EngineInfoModalProps> = ({ profile, isOpen, onClose }) => {
  if (!isOpen || !profile || profile.id === 'default') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-md rounded-2xl border-[3px] border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:bg-gray-900 dark:border-gray-700 dark:shadow-[8px_8px_0px_0px_rgba(0,0,0,0.5)]">
        
        <h3 className="mb-2 text-xl font-black text-gray-900 dark:text-white">
          Active Engine: {profile.name}
        </h3>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
          This account uses specialized logic to accurately mirror its real-world counterpart. Here is what changes:
        </p>

        <div className="space-y-4">
          <div className="rounded-xl border-2 border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-900/30 dark:bg-indigo-900/10">
            <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-300">Statement Naming</h4>
            <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-400">{profile.namingDescription}</p>
          </div>

          {profile.features.length > 0 && (
            <div className="rounded-xl border-2 border-amber-100 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-900/10">
              <h4 className="mb-2 text-sm font-bold text-amber-900 dark:text-amber-300">Unlocked Features</h4>
              <ul className="space-y-3">
                {profile.features.map((feature, idx) => (
                  <li key={idx}>
                    <span className="block text-xs font-bold text-amber-800 dark:text-amber-400">{feature.title}</span>
                    <span className="block text-xs text-amber-700/80 dark:text-amber-500/80">{feature.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl border-2 border-black bg-black py-3 font-bold text-white transition-transform hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] active:translate-y-0 active:shadow-none dark:border-white dark:bg-white dark:text-black"
        >
          Got it
        </button>
      </div>
    </div>
  );
};
