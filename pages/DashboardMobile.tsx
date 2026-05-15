
import React from 'react';
import { Account, BudgetItem, Installment, Transaction, SavedBudgetSetup } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { SupabaseUserProfile } from '../src/types/supabase';
import { DashboardHeader } from '../DashboardHeader';

interface DashboardProps {
  accounts: Account[];
  budget: BudgetItem[];
  installments: Installment[];
  transactions?: Transaction[];
  budgetSetups?: SavedBudgetSetup[];
  userProfile?: SupabaseUserProfile | null;
  theme?: 'light' | 'dark';
}

interface PeriodProjection {
  period: string;
  shortPeriod: string;
  monthYear: string;
  income: number;
  totalBudget: number;
  remaining: number;
}

const DashboardMobile: React.FC<DashboardProps> = ({ accounts, budget, installments, transactions = [], budgetSetups = [], userProfile, theme }) => {
  const isDarkMode = theme === 'dark';
  const tickColor = isDarkMode ? '#6b7280' : '#94a3b8';
  const gridColor = isDarkMode ? '#374151' : '#f1f5f9';
  const tooltipBg = isDarkMode ? '#1f2937' : '#ffffff';
  const tooltipColor = isDarkMode ? '#d1d5db' : '#374151';

  const totalBalance = accounts.reduce((acc, a) => acc + (a.type === 'Debit' ? a.balance : -a.balance), 0);
  const monthlySpending = budget.reduce((acc, b) => acc + b.amount, 0);
  const totalDebt = accounts.filter(a => a.type === 'Credit').reduce((acc, a) => acc + a.balance, 0);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  const periodProjections: PeriodProjection[] = [];

  return (
    <div className="animate-in fade-in duration-500 w-full">
      <DashboardHeader name={userProfile?.first_name || 'Budee User'} />
      <div className="space-y-4 pb-24 px-4">
        {/* Top Cards */}
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4">
            <h3 className="text-black text-[10px] font-black uppercase tracking-[0.2em]">Total Balance</h3>
            <p className="text-2xl font-black mt-1 dark:text-gray-100">{formatCurrency(totalBalance)}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-3xl border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4">
            <h3 className="text-black text-[10px] font-black uppercase tracking-[0.2em]">Budget Used</h3>
            <p className="text-2xl font-black mt-1 dark:text-gray-100">{formatCurrency(monthlySpending)}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-3xl border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4">
            <h3 className="text-black text-[10px] font-black uppercase tracking-[0.2em]">Credit Debt</h3>
            <p className="text-2xl font-black mt-1 dark:text-gray-100">{formatCurrency(totalDebt)}</p>
          </div>
        </div>

        {/* Budget Projections Section */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
          <div className="p-4 bg-blue-500 border-b-[3px] border-black">
            <h3 className="font-['Titan_One'] text-xl text-white uppercase tracking-tight">Budget Projections</h3>
          </div>
          <div className="p-4">
            <div className="h-64">
              {periodProjections.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={periodProjections} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                    <XAxis dataKey="shortPeriod" axisLine={false} tickLine={false} tick={{fill: tickColor, fontSize: 11}}/>
                    <YAxis axisLine={false} tickLine={false} tick={{fill: tickColor, fontSize: 12}} tickFormatter={(value) => formatCurrency(value)}/>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{borderRadius: '12px', border: 'none', backgroundColor: tooltipBg, color: tooltipColor}}/>
                    <Bar dataKey="income" fill="#10B981" name="Income" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="totalBudget" fill="#F59E0B" name="Budget" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="remaining" fill="#3B82F6" name="Remaining" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-center">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 mb-2">No budget setups found for projections.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
          <div className="p-4 bg-white border-b-[3px] border-black flex items-center justify-between">
            <h3 className="font-['Titan_One'] text-xl text-black uppercase tracking-tight">Recent Activity</h3>
            <button className={`text-xs font-black uppercase tracking-widest border-2 border-black px-3 py-1 rounded-lg`}>View All</button>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {transactions.slice(0, 5).map((transaction) => {
              const account = accounts.find(a => a.id === transaction.paymentMethodId);
              return (
                <div key={transaction.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{transaction.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(transaction.date).toLocaleDateString()} • {account?.bank || 'Unknown'}</p>
                  </div>
                  <p className="font-bold text-gray-900 dark:text-gray-100">-{formatCurrency(transaction.amount)}</p>
                </div>
              );
            })}
            {transactions.length === 0 && (
              <div className="p-8 text-center text-gray-400 dark:text-gray-500">
                No transactions yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardMobile;
