import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative flex items-center tracking-tight cursor-pointer group ${className}`}>
      {/* Upper-left shadow layer (Bright Cyan) */}
      <div className="absolute -top-[3px] -left-[3px] flex items-center text-cyan-400 dark:text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)] pointer-events-none select-none z-0">
        <span className="font-titan transition-transform duration-300 group-hover:translate-x-2 rotate-[-6deg]">B</span>
        <span className="font-titan transition-transform duration-300 group-hover:translate-x-1 translate-y-0.5 rotate-[3deg]">u</span>
        <span className="font-titan transition-transform duration-300 -translate-y-0.5 rotate-[-4deg]">d</span>
        <span className="font-titan transition-transform duration-300 group-hover:-translate-x-1 translate-y-1 rotate-[5deg]">e</span>
        <span className="font-titan transition-transform duration-300 group-hover:-translate-x-2 -translate-y-1 rotate-[-3deg]">e</span>
      </div>

      {/* Bottom-right shadow layer (Sunny Amber) */}
      <div className="absolute top-[3px] left-[3px] flex items-center text-amber-400 dark:text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)] pointer-events-none select-none z-0">
        <span className="font-titan transition-transform duration-300 group-hover:translate-x-2 rotate-[-6deg]">B</span>
        <span className="font-titan transition-transform duration-300 group-hover:translate-x-1 translate-y-0.5 rotate-[3deg]">u</span>
        <span className="font-titan transition-transform duration-300 -translate-y-0.5 rotate-[-4deg]">d</span>
        <span className="font-titan transition-transform duration-300 group-hover:-translate-x-1 translate-y-1 rotate-[5deg]">e</span>
        <span className="font-titan transition-transform duration-300 group-hover:-translate-x-2 -translate-y-1 rotate-[-3deg]">e</span>
      </div>
      
      {/* Foreground gradient text layer */}
      <div className="relative z-10 flex items-center">
        <span className="bg-gradient-to-r from-rose-500 to-pink-500 bg-clip-text text-transparent font-titan transition-transform duration-300 group-hover:translate-x-2 rotate-[-6deg]">B</span>
        <span className="bg-gradient-to-r from-pink-500 to-fuchsia-500 bg-clip-text text-transparent font-titan transition-transform duration-300 group-hover:translate-x-1 translate-y-0.5 rotate-[3deg]">u</span>
        <span className="bg-gradient-to-r from-fuchsia-500 to-purple-500 bg-clip-text text-transparent font-titan transition-transform duration-300 -translate-y-0.5 rotate-[-4deg]">d</span>
        <span className="bg-gradient-to-r from-purple-500 to-violet-500 bg-clip-text text-transparent font-titan transition-transform duration-300 group-hover:-translate-x-1 translate-y-1 rotate-[5deg]">e</span>
        <span className="bg-gradient-to-r from-violet-500 to-indigo-500 bg-clip-text text-transparent font-titan transition-transform duration-300 group-hover:-translate-x-2 -translate-y-1 rotate-[-3deg]">e</span>
      </div>
    </div>
  );
};