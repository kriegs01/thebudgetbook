import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative flex items-center tracking-tight cursor-pointer group ${className}`}>
      {/* Backdrop shadow layer */}
      <div className="absolute top-[3px] left-[3px] flex items-center text-gray-300 dark:text-white pointer-events-none select-none z-0">
        <span className="font-titan transition-transform duration-300 group-hover:-translate-y-2 rotate-[-6deg]">B</span>
        <span className="font-titan transition-transform duration-300 group-hover:-translate-y-2 group-hover:delay-75 translate-y-0.5 rotate-[3deg]">u</span>
        <span className="font-titan transition-transform duration-300 group-hover:-translate-y-2 group-hover:delay-100 -translate-y-0.5 rotate-[-4deg]">d</span>
        <span className="font-titan transition-transform duration-300 group-hover:-translate-y-2 group-hover:delay-150 translate-y-1 rotate-[5deg]">e</span>
        <span className="font-titan transition-transform duration-300 group-hover:-translate-y-2 group-hover:delay-200 -translate-y-1 rotate-[-3deg]">e</span>
      </div>
      
      {/* Foreground gradient text layer */}
      <div className="relative z-10 flex items-center">
        <span className="bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent font-titan transition-transform duration-300 group-hover:-translate-y-2 rotate-[-6deg]">B</span>
        <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent font-titan transition-transform duration-300 group-hover:-translate-y-2 group-hover:delay-75 translate-y-0.5 rotate-[3deg]">u</span>
        <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent font-titan transition-transform duration-300 group-hover:-translate-y-2 group-hover:delay-100 -translate-y-0.5 rotate-[-4deg]">d</span>
        <span className="bg-gradient-to-r from-violet-500 to-purple-500 bg-clip-text text-transparent font-titan transition-transform duration-300 group-hover:-translate-y-2 group-hover:delay-150 translate-y-1 rotate-[5deg]">e</span>
        <span className="bg-gradient-to-r from-purple-500 to-purple-600 bg-clip-text text-transparent font-titan transition-transform duration-300 group-hover:-translate-y-2 group-hover:delay-200 -translate-y-1 rotate-[-3deg]">e</span>
      </div>
    </div>
  );
};