import React from 'react';

interface DashboardHeaderProps {
  name: string;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ name }) => {
  return (
    <header className="pt-12 mb-12 pr-48">
      {/* Sub-header Greeting */}
      <p className="text-2xl font-bold text-black/50 italic mb-[-6px] ml-1">
        Hello, {name} 
      </p>

      {/* Main Page Title */}
      <div className="relative inline-block">
        <h1 className="text-7xl font-[950] uppercase tracking-tighter text-black leading-none relative z-10">
          Dashboard
        </h1>
        {/* Retro Highlighter Accent */}
        <div className="absolute bottom-1 left-0 w-[110%] h-5 bg-teal-400/70 -z-0 -rotate-1 -translate-x-2" />
      </div>
      
      {/* Bottom Border Accent */}
      <div className="h-2 w-32 bg-black mt-4" />
    </header>
  );
};