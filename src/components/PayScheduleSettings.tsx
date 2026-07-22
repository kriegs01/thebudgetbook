import React, { useState, useEffect } from 'react';
import { savePayScheduleRule, getPayScheduleRules, PayScheduleRule } from '../services/payScheduleService';
import { ChevronDown, Check, AlertCircle, Banknote, AlertTriangle, Plus } from 'lucide-react';
import { UNSAFE_RemixErrorBoundary } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient'; // Check that this path matches your project!

export const PayScheduleSettings: React.FC<{ onRuleSaved?: () => void }> = ({ onRuleSaved }) => {
  const [frequency, setFrequency] = useState<'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly'>('bi-weekly');
  const [effectiveFromDate, setEffectiveFromDate] = useState('');
  const [firstPaycheckDate, setFirstPaycheckDate] = useState('');
  
  const [payDate1, setPayDate1] = useState<number | ''>('');
  const [payDate2, setPayDate2] = useState<number | ''>('');
  const [dayOfWeek, setDayOfWeek] = useState<number | ''>('');
  

  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // State for toggling the form drawer
  const [isFormOpen, setIsFormOpen] = useState(false);

  // State for duplicate check confirmation
  const [showDuplicatePrompt, setShowDuplicatePrompt] = useState(false);

  const [showHistory, setShowHistory] = useState(false);


  // State for active / existing rules
  const [existingRules, setExistingRules] = useState<PayScheduleRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);

  const fetchRules = async () => {
    setLoadingRules(true);
    const { data } = await getPayScheduleRules();
    if (data) {
      setExistingRules(data);
    }
    setLoadingRules(false);
  };
  useEffect(() => {
    fetchRules();
  }, []);

  const handleDeleteRule = async (ruleId: any, effectiveFromDate: string) => {
    console.log("Delete function triggered! ID:", ruleId);
    
    if (!ruleId) {
      alert("Error: Rule ID is missing! Check console.");
      return;
    }

    // 1. The Hard Guard: Check if the rule is already active
    const today = new Date().toISOString().split('T')[0];
    if (effectiveFromDate <= today) {
      alert("You cannot delete a schedule that is already active or in the past.");
      return;
    }
    
    
    // 3. The Database Execution
    try {
      const { error } = await supabase
        .from('pay_schedule_rules') // Make sure this matches your exact table name
        .delete()
        .eq('id', ruleId);
        
      if (error) throw error;
      
      // Refresh the UI list
      await fetchRules();
    } catch (err: any) {
      console.error('Error deleting rule:', err);
      alert('Failed to delete rule.');
    }
  };

  const executeSave = async () => {
    setShowDuplicatePrompt(false);
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // 1. Fetch the user directly from your Supabase session
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error('You must be logged in to save a rule.');
      }

      // 2. Build the payload using the fetched user.id
      const newRule: PayScheduleRule = {
        user_id: user.id, // <-- This is now safely defined!
        effectiveFromDate,
        frequency,
        firstPaycheckDate: firstPaycheckDate || new Date().toISOString().split('T')[0],
        pay_date_1: payDate1 === '' ? null : payDate1,
        pay_date_2: payDate2 === '' ? null : payDate2,
        day_of_week: dayOfWeek === '' ? null : dayOfWeek,
      };

      const { error } = await savePayScheduleRule(newRule);
      if (error) throw error;

      // 1. Show success message
      setSuccessMessage('Pay schedule successfully updated!');
      
      // 2. Refresh the local state instantly
      await fetchRules();

      // 3. Close the form drawer
      setIsFormOpen(false);

      // 4. Reset the form inputs for the next time it's opened
      setEffectiveFromDate('');
      setFirstPaycheckDate('');
      setFrequency('bi-weekly'); // or whatever your default is
      setPayDate1('');
      setPayDate2('');
      setDayOfWeek('');

      // 5. Tell the parent component to update (if applicable)
      if (onRuleSaved) {
        onRuleSaved();
      }

      // Hide the success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);

    } catch (err: any) {
      console.error('Error saving pay schedule rule:', err);
      setErrorMessage(err.message || 'Failed to save rule. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!effectiveFromDate || (frequency === 'bi-weekly' && !firstPaycheckDate)) {
      setErrorMessage('Please fill out all required date fields.');
      return;
    }

    const isDuplicate = existingRules.some(
      r => r.effectiveFromDate === effectiveFromDate && 
           r.frequency === frequency && 
           (frequency === 'bi-weekly' ? r.firstPaycheckDate === firstPaycheckDate : true) &&
           r.pay_date_1 === (payDate1 === '' ? null : payDate1) &&
           r.pay_date_2 === (payDate2 === '' ? null : payDate2) &&
           r.day_of_week === (dayOfWeek === '' ? null : dayOfWeek)
    );

    if (isDuplicate) {
      setShowDuplicatePrompt(true); // Or just setErrorMessage('This exact rule already exists for this date.')
      setSubmitting(false);
      return;
    }

    await executeSave();
  };

  // Get the most recent rule as the primary current pay rule
  const currentRule = existingRules.length > 0 ? existingRules[existingRules.length - 1] : null;

  return (
    <div className="bg-white dark:bg-gray-900 border-4 border-black p-6 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-6 relative">
      <div>
        <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight flex items-center gap-2">
          <Banknote className="w-5 h-5 text-indigo-600" />
          Pay Schedule Engine
        </h2>
        <p className="text-xs text-gray-500 mt-1 font-medium">
          Configure how your pay periods and bill allocations are sliced. Future effective dates safely preserve past history.
        </p>
      </div>

      {successMessage && (
        <div className="flex items-center space-x-2 bg-green-50 border-2 border-black p-3 rounded-xl text-xs font-bold text-green-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <Check className="w-4 h-4 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center space-x-2 bg-red-50 border-2 border-black p-3 rounded-xl text-xs font-bold text-red-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

                      {/* CURRENT & SCHEDULED RULES LIST */}
        {loadingRules ? (
          <p className="text-xs text-gray-400 italic py-2">Loading current rules...</p>
        ) : (
          <div className="mt-6 mb-6">
            {(() => {
              const today = new Date().toISOString().split('T')[0];
              
              // 1. Separate and sort Active/Past rules (newest active first)
              const pastAndActive = existingRules
                .filter(r => r.effectiveFromDate <= today)
                .sort((a, b) => new Date(b.effectiveFromDate).getTime() - new Date(a.effectiveFromDate).getTime());
                
              // 2. Separate and sort Future rules (closest upcoming date first)
              const scheduled = existingRules
                .filter(r => r.effectiveFromDate > today)
                .sort((a, b) => new Date(a.effectiveFromDate).getTime() - new Date(b.effectiveFromDate).getTime());

              const currentActive = pastAndActive[0];
              const nextScheduled = scheduled[0];
              
              // 3. Bundle everything else into a "See More" list (sorted newest first)
              const remainingRules = [...scheduled.slice(1), ...pastAndActive.slice(1)]
                .sort((a, b) => new Date(b.effectiveFromDate).getTime() - new Date(a.effectiveFromDate).getTime());

              // Helper component to keep the JSX clean
              const renderRuleCard = (rule: any, isScheduled: boolean) => (
                <div key={rule.id} className="border-2 border-black rounded-xl p-4 bg-white shadow-[2px_2px_0px_rgba(0,0,0,1)] flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm uppercase">{rule.frequency}</span>
                      {isScheduled ? (
                        <span className="bg-yellow-200 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-yellow-800">
                          SCHEDULED
                        </span>
                      ) : (
                        <span className="bg-green-200 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-800">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 font-bold block mt-1">
                      Effective: {new Date(rule.effectiveFromDate).toLocaleDateString()}
                    </span>
                  </div>
                  {isScheduled && (
                    <button 
                      type="button"
                      onClick={() => {
                        console.log("Cancel clicked! Rule data:", rule);
                        handleDeleteRule(rule.id, rule.effectiveFromDate);
                      }}                      
                      className="bg-red-100 hover:bg-red-200 text-red-600 font-bold text-xs px-3 py-1.5 rounded-lg border-2 border-red-200 hover:border-red-600 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              );

              return (
                <div className="space-y-4">
                  {/* CURRENT RULE */}
                  {currentActive && (
                    <div className="space-y-2">
                      <h3 className="font-bold text-gray-700 uppercase text-xs tracking-wider">Current Rule</h3>
                      {renderRuleCard(currentActive, false)}
                    </div>
                  )}

                  {/* NEXT UPCOMING RULE */}
                  {nextScheduled && (
                    <div className="space-y-2 mt-4">
                      <h3 className="font-bold text-gray-700 uppercase text-xs tracking-wider">Next Scheduled Change</h3>
                      {renderRuleCard(nextScheduled, true)}
                    </div>
                  )}

                  {/* SEE MORE / HISTORY TOGGLE */}
                  {remainingRules.length > 0 && (
                    <div className="pt-2">
                      <button 
                        type="button"
                        onClick={() => setShowHistory(!showHistory)}
                        className="text-[10px] font-black uppercase text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1"
                      >
                        {showHistory ? 'Hide History & Others' : `See More (${remainingRules.length})`}
                      </button>
                      
                      {showHistory && (
                        <div className="mt-3 space-y-3 p-4 bg-gray-50 dark:bg-gray-800/50 border-2 border-black rounded-xl border-dashed">
                          {remainingRules.map(rule => renderRuleCard(rule, rule.effectiveFromDate > today))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}


        {/* 2. ADD / CONFIGURE BUTTON (Triggers collapsible form) */}
        {!isFormOpen && (
          <button
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="w-full mt-2 bg-black text-white border-2 border-black py-2.5 rounded-xl font-black uppercase tracking-wider text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{currentRule ? 'Change Pay Frequency' : 'Add Pay Frequency'}</span>
          </button>
        )}
      

      {/* 3. COLLAPSIBLE FORM CONTAINER */}
      {isFormOpen && (
        <div className="border-2 border-black rounded-2xl p-4 bg-white dark:bg-gray-900 space-y-4 animate-in slide-in-from-top-2 duration-300 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between border-b-2 border-black pb-2">
            <span className="text-xs font-black uppercase tracking-tight">Configure New Rule</span>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="text-xs font-bold text-gray-400 hover:text-black dark:hover:text-white uppercase"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Frequency
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as any)}
                disabled={submitting}
                className="w-full h-12 bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-3 text-xs font-black outline-none transition-colors"
              >
                <option value="semi-monthly">Semi-Monthly (Twice a month)</option>
                <option value="bi-weekly">Bi-Weekly (Every 2 weeks)</option>
                <option value="weekly">Weekly (Every week)</option>
                <option value="monthly">Monthly (Once a month)</option>
              </select>
            </div>
              {/* SEMI-MONTHLY INPUTS */}
{frequency === 'semi-monthly' && (
  <div className="flex gap-4">
    <div className="space-y-1 w-full">
      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
        First Pay Date
      </label>
      <input 
        type="number" min="1" max="31" 
        value={payDate1} 
        onChange={(e) => setPayDate1(e.target.value === '' ? '' : parseInt(e.target.value))} 
        placeholder="e.g. 15"
        className="w-full h-12 bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-3"
        disabled={submitting}
      />
    </div>
    <div className="space-y-1 w-full">
      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
        Second Pay Date
      </label>
      <input 
        type="number" min="1" max="31" 
        value={payDate2} 
        onChange={(e) => setPayDate2(e.target.value === '' ? '' : parseInt(e.target.value))} 
        placeholder="e.g. 30"
        className="w-full h-12 bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-3"
        disabled={submitting}
      />
    </div>
  </div>
)}

{/* MONTHLY INPUT */}
{frequency === 'monthly' && (
  <div className="space-y-1">
    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
      Pay Date
    </label>
    <input 
      type="number" min="1" max="31" 
      value={payDate1} 
      onChange={(e) => setPayDate1(e.target.value === '' ? '' : parseInt(e.target.value))} 
      placeholder="e.g. 1"
      className="w-full h-12 bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-3"
      disabled={submitting}
    />
  </div>
)}

{/* WEEKLY INPUT */}
{frequency === 'weekly' && (
  <div className="space-y-1">
    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
      Day of the Week
    </label>
    <select 
      value={dayOfWeek} 
      onChange={(e) => setDayOfWeek(e.target.value === '' ? '' : parseInt(e.target.value))}
      className="w-full h-12 bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-3"
      disabled={submitting}
    >
      <option value="">Select a day...</option>
      <option value="0">Sunday</option>
      <option value="1">Monday</option>
      <option value="2">Tuesday</option>
      <option value="3">Wednesday</option>
      <option value="4">Thursday</option>
      <option value="5">Friday</option>
      <option value="6">Saturday</option>
    </select>
  </div>
)}

{/* BI-WEEKLY INPUT */}
{frequency === 'bi-weekly' && (
  <div className="space-y-1">
    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
      Select ANY Paycheck Date to Anchor
    </label>
    <input 
      type="date" 
      value={firstPaycheckDate} 
      onChange={(e) => setFirstPaycheckDate(e.target.value)} 
      className="w-full h-12 bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-3"
      disabled={submitting}
    />
  </div>
)}


            <div className="space-y-1">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Effective Date (Start of rule)
              </label>
              <input
                type="date"
                required
                disabled={submitting}
                value={effectiveFromDate}
                onChange={(e) => setEffectiveFromDate(e.target.value)}
                className="w-full h-12 block bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-0 text-xs font-black outline-none transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
                First Paycheck Date (Anchor date)
              </label>
              <input
                type="date"
                disabled={submitting}
                value={firstPaycheckDate}
                onChange={(e) => setFirstPaycheckDate(e.target.value)}
                className="w-full h-12 block bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-0 text-xs font-black outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`w-full h-12 bg-indigo-600 text-white border-2 border-black rounded-xl font-black uppercase tracking-wider text-xs shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all ${
                submitting ? 'opacity-50 cursor-not-allowed shadow-none' : 'hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]'
              }`}
            >
              {submitting ? 'Saving Rule...' : 'Save Pay Rule'}
            </button>
          </form>
        </div>
      )}

      {/* Duplicate Confirmation Modal */}
      {showDuplicatePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 border-4 border-black rounded-3xl p-6 max-w-sm w-full shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] space-y-4 text-center">
            <div className="w-14 h-14 bg-amber-100 border-2 border-black text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase text-gray-900 dark:text-gray-100">Duplicate Rule Detected</h3>
              <p className="text-xs text-gray-500 font-medium mt-1">
                A rule with this exact frequency, effective date, and first paycheck already exists. Do you still want to proceed and save it?
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDuplicatePrompt(false)}
                className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-2 border-black py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeSave}
                className="flex-1 bg-amber-500 text-white border-2 border-black py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
              >
                Proceed anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
