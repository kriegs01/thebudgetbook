import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`flex items-center tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent drop-shadow-[3px_3px_0_#d1d5db] dark:drop-shadow-[3px_3px_0_#ffffff] cursor-pointer group ${className}`}>
      <span className="font-titan transition-transform duration-300 group-hover:-translate-y-2 rotate-[-6deg]">B</span>
      <span className="font-titan transition-transform duration-300 group-hover:-translate-y-2 group-hover:delay-75 translate-y-0.5 rotate-[3deg]">u</span>
      <span className="font-titan transition-transform duration-300 group-hover:-translate-y-2 group-hover:delay-100 -translate-y-0.5 rotate-[-4deg]">d</span>
      <span className="font-titan transition-transform duration-300 group-hover:-translate-y-2 group-hover:delay-150 translate-y-1 rotate-[5deg]">e</span>
      <span className="font-titan transition-transform duration-300 group-hover:-translate-y-2 group-hover:delay-200 -translate-y-1 rotate-[-3deg]">e</span>
    </div>
  );
};