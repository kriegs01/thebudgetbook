import React from 'react';
import { Bell, MessageSquare, User } from 'lucide-react';

interface FloatingHUDProps {
  userName: string;
}

export const FloatingHUD: React.FC<FloatingHUDProps> = ({ userName }) => {
  return (
    <>
      {/* The HUD Backdrop Layer: Provides a subtle fade so scrolling content doesn't clash */}
      <div className="fixed top-0 right-0 w-80 h-40 bg-gradient-to-l from-white/90 via-white/40 to-transparent backdrop-blur-[2px] z-40 pointer-events-none" />

      {/* The Sticker Container */}
      <div className="fixed top-6 right-8 z-50 flex items-center gap-4">
        
        {/* Messages Sticker */}
        <button className="bg-teal-300 border-[3px] border-black p-3 -rotate-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:rotate-0 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all duration-200">
          <MessageSquare size={24} className="text-black" />
        </button>

        {/* Notifications Sticker */}
        <button className="bg-fuchsia-400 border-[3px] border-black p-3 rotate-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:rotate-0 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all duration-200 relative">
          <Bell size={24} className="text-black" />
          {/* Notification Counter Sticker */}
          <span className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-300 border-2 border-black text-[10px] font-black flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            3
          </span>
        </button>

        {/* User Profile Sticker */}
        <button className="group relative">
          <div className="bg-white border-[3px] border-black p-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] group-hover:scale-105 transition-transform">
            <div className="w-10 h-10 bg-amber-200 border-2 border-black flex items-center justify-center overflow-hidden">
               {/* Replace with <img> if you have a profile picture */}
               <User size={28} className="text-black mt-2" />
            </div>
          </div>
          {/* Hover Label */}
          <span className="absolute top-14 right-0 bg-black text-white text-[10px] px-2 py-1 font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            {userName}
          </span>
        </button>
      </div>
    </>
  );
};