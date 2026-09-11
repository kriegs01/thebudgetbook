import React, { useEffect, useState } from 'react';
import { Cloud, RefreshCw, CheckCircle2, CloudOff } from 'lucide-react';

export type SyncStatus = 'idle' | 'syncing' | 'saved' | 'error';

interface SyncIndicatorProps {
  status: SyncStatus;
}

export const SyncIndicator: React.FC<SyncIndicatorProps> = ({ status }) => {
  const [displayStatus, setDisplayStatus] = useState<SyncStatus>(status);

  useEffect(() => {
    if (status === 'saved') {
      setDisplayStatus('saved');
      const timer = setTimeout(() => setDisplayStatus('idle'), 3000);
      return () => clearTimeout(timer);
    }

    setDisplayStatus(status);
  }, [status]);

  const config = {
    idle: { icon: Cloud, color: 'text-gray-400 dark:text-gray-500' },
    syncing: { icon: RefreshCw, color: 'text-blue-500', animate: 'animate-spin' },
    saved: { icon: CheckCircle2, color: 'text-green-500' },
    error: { icon: CloudOff, color: 'text-red-500' }
  };

  const CurrentIcon = config[displayStatus].icon;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex items-center justify-center w-12 h-12 rounded-full bg-white dark:bg-gray-800 border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-colors">
      <CurrentIcon className={`w-6 h-6 ${config[displayStatus].color} ${config[displayStatus].animate || ''}`} />
    </div>
  );
};
