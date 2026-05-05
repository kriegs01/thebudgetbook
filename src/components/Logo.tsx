import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`flex items-center tracking-tight text-indigo-600 dark:text-indigo-400 drop-shadow-[3px_3px_0_rgba(244,114,182,1)] cursor-pointer group ${className}`}>
      <span className="font-titan transition-transform duration-300 group-hover:-translate-y-2 rotate-[-6deg]">B</span>
      <span className="font-titan transition-transform duration-300 group-hover:-translate-y-2 group-hover:delay-75 translate-y-0.5 rotate-[3deg]">u</span>
      <span className="font-titan transition-transform duration-300 group-hover:-translate-y-2 group-hover:delay-100 -translate-y-0.5 rotate-[-4deg]">d</span>
      <span className="font-titan transition-transform duration-300 group-hover:-translate-y-2 group-hover:delay-150 translate-y-1 rotate-[5deg]">e</span>
      <span className="font-titan transition-transform duration-300 group-hover:-translate-y-2 group-hover:delay-200 -translate-y-1 rotate-[-3deg]">e</span>
    </div>
  );
};