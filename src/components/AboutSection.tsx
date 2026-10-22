import React, { useState, useEffect } from 'react';
import { fetchChangelogs, ChangelogEntry } from '../services/changelogService';
import { Sparkles, ChevronDown, Wrench, Info, Loader2 } from 'lucide-react';

export const AboutSection: React.FC = () => {
  const [changelogs, setChangelogs] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadLogs() {
      setLoading(true);
      const { data, error } = await fetchChangelogs();
      if (!error && data && isMounted) {
        setChangelogs(data);
        const latest = data.find(c => c.is_latest) || data[0];
        if (latest) setExpandedVersion(latest.version);
      }
      if (isMounted) setLoading(false);
    }

    loadLogs();
    return () => { isMounted = false; };
  }, []);

  const latestVersion = changelogs.find(c => c.is_latest)?.version || changelogs[0]?.version || 'v1.0.0';

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 space-y-6">
      {/* Header Info */}
      <div className="flex items-center justify-between border-b-2 border-black/10 dark:border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border-2 border-black flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <Info className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-gray-900 dark:text-gray-100">About & Updates</h3>
            <p className="text-xs text-gray-500 font-medium">App info & release history</p>
          </div>
        </div>

        {/* Dynamic Version Badge */}
        <span className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-2 border-black px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          {loading ? '...' : latestVersion}
        </span>
      </div>

      {/* Content Container */}
      <div className="space-y-3">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Changelogs</h4>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400 gap-2 text-xs font-bold">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading updates...
          </div>
        ) : changelogs.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-4 text-center">No changelogs recorded yet.</p>
        ) : (
          changelogs.map((release) => {
            const isExpanded = expandedVersion === release.version;
            const displayDate = release.release_date
              ? new Date(release.release_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : '';

            return (
              <div 
                key={release.id}
                className="border-2 border-black rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800/40 transition-all"
              >
                {/* Accordion Toggle Header */}
<button
  type="button"
  onClick={() => setExpandedVersion(isExpanded ? null : release.version)}
  className="w-full flex items-center justify-between p-3.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
>
  {/* LEFT: Version title & Date stacked */}
  <div className="flex flex-col min-w-0">
    <span className="font-black text-sm text-gray-900 dark:text-gray-100 leading-tight">
      {release.version}
    </span>
    {displayDate && (
      <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-0.5">
        {displayDate}
      </span>
    )}
  </div>

  {/* RIGHT: Latest Badge & Chevron Arrow */}
  <div className="flex items-center gap-2 shrink-0">
    {release.is_latest && (
      <span className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border border-green-400 text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
        Latest
      </span>
    )}
    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
  </div>
</button>


                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-4 pt-1 border-t-2 border-dashed border-black/10 dark:border-white/10 space-y-3 text-xs">
                    {/* Highlights */}
                    {release.highlights && release.highlights.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="font-black text-[10px] uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" /> What's New
                        </p>
                        <ul className="space-y-1 pl-1">
                          {release.highlights.map((h, i) => (
                            <li key={i} className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                              <span>{h}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Fixes */}
                    {release.fixes && release.fixes.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <p className="font-black text-[10px] uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <Wrench className="w-3.5 h-3.5" /> Bug Fixes & Improvements
                        </p>
                        <ul className="space-y-1 pl-1">
                          {release.fixes.map((f, i) => (
                            <li key={i} className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
