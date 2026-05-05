import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = '' }) => {
  // Faceted 3D extrusion effect using hard layered text shadows
  const prismaticShadow = `
    1px 1px 0px #d946ef, 2px 2px 0px #d946ef, 3px 3px 0px #d946ef,
    4px 4px 0px #14b8a6, 5px 5px 0px #14b8a6, 6px 6px 0px #14b8a6,
    7px 7px 0px #f59e0b, 8px 8px 0px #f59e0b, 9px 9px 0px #f59e0b,
    10px 10px 0px #0f172a
  `;

  return (
    <div className={`relative flex items-center tracking-tight cursor-pointer group ${className}`}>
      {/* Main text with 3D faceted shadow */}
      <div className="relative z-10 flex items-center text-slate-50" style={{ WebkitTextStroke: '1px #0f172a' }}>
        <span style={{ textShadow: prismaticShadow }} className="font-titan transition-transform duration-300 group-hover:translate-x-2 rotate-[-6deg]">B</span>
        <span style={{ textShadow: prismaticShadow }} className="font-titan transition-transform duration-300 group-hover:translate-x-1 rotate-[3deg]">u</span>
        <span style={{ textShadow: prismaticShadow }} className="font-titan transition-transform duration-300 rotate-[-4deg]">d</span>
        <span style={{ textShadow: prismaticShadow }} className="font-titan transition-transform duration-300 group-hover:-translate-x-1 rotate-[5deg]">e</span>
        <span style={{ textShadow: prismaticShadow }} className="font-titan transition-transform duration-300 group-hover:-translate-x-2 rotate-[-3deg]">e</span>
      </div>
    </div>
  );
};