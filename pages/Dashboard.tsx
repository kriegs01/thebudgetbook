import React, { useState } from 'react';
import { Account, BudgetItem, Installment, Transaction, SavedBudgetSetup } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, LabelList } from 'recharts';
import { TrendingUp, TrendingDown, Landmark, ArrowUpRight, Calendar } from 'lucide-react';
import type { SupabaseUserProfile } from '../src/types/supabase';
import { useTheme } from '../src/contexts/ThemeContext';

interface DashboardProps {
  budget: BudgetItem[];
  installments: Installment[];
  transactions?: Transaction[];
  budgetSetups?: SavedBudgetSetup[];
  userProfile?: SupabaseUserProfile | null;
  theme?: 'light' | 'dark';
}

interface PeriodProjection {
  period: string;
  monthYear: string;
  income: number;
  totalBudget: number;  // Total allocated budget (spending)
  remaining: number;
}

interface MonthlyAverage {
  month: string;
  avgRemaining: number;
}

const Dashboard: React.FC<DashboardProps> = ({ accounts = [], budget = [], installments = [], transactions = [], budgetSetups = [], userProfile, theme }) => {
  const { getAccentClasses } = useTheme();
  const isDarkMode = theme === 'dark';
  const tickColor = isDarkMode ? '#6b7280' : '#94a3b8'; // gray-500 dark, gray-400 light
  const gridColor = isDarkMode ? '#374151' : '#f1f5f9'; // gray-700 dark, gray-100 light
  const tooltipBg = isDarkMode ? '#1f2937' : '#ffffff';
  const tooltipColor = isDarkMode ? '#d1d5db' : '#374151';
  const labelListIncomeColor = isDarkMode ? '#34d399' : '#059669'; // emerald-400 dark, green-700 light
  const labelListBudgetColor = isDarkMode ? '#fcd34d' : '#D97706'; // amber-300 dark, amber-600 light
  const labelListRemainingColor = isDarkMode ? '#93c5fd' : '#2563EB'; // blue-300 dark, blue-600 light

  // NEW: State for date range
  const getCurrentMonth = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  };

  const getNextMonth = (dateStr: string) => {
    const [year, month] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1);
    date.setMonth(date.getMonth() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  const [startDate, setStartDate] = useState<string>(getCurrentMonth());
  const [endDate, setEndDate] = useState<string>(getNextMonth(getCurrentMonth()));

  const monthlySpending = budget.reduce((acc, b) => acc + b.amount, 0);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(val);
  };

  const chartData = [
    { name: 'Mon', spend: 45 },
    { name: 'Tue', spend: 120 },
    { name: 'Wed', spend: 300 },
    { name: 'Thu', spend: 90 },
    { name: 'Fri', spend: 200 },
    { name: 'Sat', spend: 500 },
    { name: 'Sun', spend: 150 },
  ];

  const COLORS = ['#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'];

  const categoryData = budget.reduce((acc: any[], item) => {
    const existing = acc.find(a => a.name === item.category);
    if (existing) existing.value += item.amount;
    else acc.push({ name: item.category, value: item.amount });
    return acc;
  }, []);

  // Helper: Get income from setup
  // Priority: _actualSalary (if entered) > _projectedSalary > 0
  // When actual salary is received, it will automatically replace the projected salary
  const getSetupIncome = (setup: SavedBudgetSetup) => {
    const actualSalary = setup.data._actualSalary;
    const projectedSalary = setup.data._projectedSalary;
    
    // Prioritize actual salary over projected
    if (actualSalary && actualSalary.trim() !== '') {
      return parseFloat(actualSalary) || 0;
    } else if (projectedSalary && projectedSalary.trim() !== '') {
      return parseFloat(projectedSalary) || 0;
    }
    return 0;
  };

  // Helper: Get total budget from setup
  // Uses the totalAmount field which equals grandTotal from Budget page calculation
  // This field includes all budget items AND installments (after the installments fix)
  const getSetupTotalBudget = (setup: SavedBudgetSetup): number => {
    return setup.totalAmount || 0;
  };

  // Main calculation: Get period projections
  const calculatePeriodProjections = (): PeriodProjection[] => {
    const [startYear, startMonth] = startDate.split('-').map(Number);
    const [endYear, endMonth] = endDate.split('-').map(Number);
    const monthsDiff = (endYear - startYear) * 12 + (endMonth - startMonth);
    
    if (monthsDiff < 0) return [];
    
    const projections: PeriodProjection[] = [];
    
    for (let i = 0; i <= monthsDiff; i++) {
      const projectedDate = new Date(startYear, startMonth - 1 + i, 1);
      const month = projectedDate.toLocaleDateString('en-US', { month: 'long' });
      const monthShort = projectedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      const setup1_2 = budgetSetups.find(s => s.month === month && s.timing === '1/2');
      const setup2_2 = budgetSetups.find(s => s.month === month && s.timing === '2/2');
      
      if (setup1_2) {
        const income = getSetupIncome(setup1_2);
        const totalBudget = getSetupTotalBudget(setup1_2);
        projections.push({
          period: `${monthShort} - 1/2`,
          monthYear: monthShort,
          income,
          totalBudget,
          remaining: income - totalBudget
        });
      }
      
      if (setup2_2) {
        const income = getSetupIncome(setup2_2);
        const totalBudget = getSetupTotalBudget(setup2_2);
        projections.push({
          period: `${monthShort} - 2/2`,
          monthYear: monthShort,
          income,
          totalBudget,
          remaining: income - totalBudget
        });
      }
    }
    
    return projections;
  };

  // Calculate monthly averages
  const calculateMonthlyAverages = (periodProjections: PeriodProjection[]): MonthlyAverage[] => {
    const monthGroups = new Map<string, PeriodProjection[]>();
    
    periodProjections.forEach(p => {
      if (!monthGroups.has(p.monthYear)) {
        monthGroups.set(p.monthYear, []);
      }
      monthGroups.get(p.monthYear)!.push(p);
    });
    
    const averages: MonthlyAverage[] = [];
    monthGroups.forEach((periods, monthYear) => {
      const avgRemaining = periods.reduce((sum, p) => sum + p.remaining, 0) / periods.length;
      averages.push({
        month: monthYear,
        avgRemaining
      });
    });
    
    return averages;
  };

  const periodProjections = calculatePeriodProjections();
  const monthlyAverages = calculateMonthlyAverages(periodProjections);

  // Debug logging in development only
  if (import.meta.env.DEV && periodProjections.length > 0) {
    console.log('[Dashboard] Budget Projections Data:', periodProjections);
  }

  // Statistics for cards
  const avgPeriodRemaining = periodProjections.length > 0
    ? periodProjections.reduce((sum, p) => sum + p.remaining, 0) / periodProjections.length
    : 0;

  const avgMonthlyRemaining = monthlyAverages.length > 0
    ? monthlyAverages.reduce((sum, m) => sum + m.avgRemaining, 0) / monthlyAverages.length
    : 0;

  const bestMonth = monthlyAverages.length > 0
    ? monthlyAverages.reduce((best, m) => m.avgRemaining > best.avgRemaining ? m : best)
    : null;

  const worstMonth = monthlyAverages.length > 0
    ? monthlyAverages.reduce((worst, m) => m.avgRemaining < worst.avgRemaining ? m : worst)
    : null;


  return (
    <div className="space-y-8 animate-in fade-in duration-500 -mt-8 -mx-8">
      {/* Greeting Header */}
      {/* This header is designed to visually merge with a global top navigation bar. */}
      {/* The global nav (with actual Bell, Mail, User buttons) should be positioned */}
      {/* absolutely or fixed at the top, and its height should be accounted for by this header's padding-top. */}
      <div className="bg-indigo-600 border-b-[4px] border-black rounded-b-[5rem] px-12 pt-32 pb-20 mb-12 shadow-[0px_8px_0px_0px_black] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
        
        <div className="relative z-10 max-w-4xl"> {/* Added max-w-4xl to keep greeting from stretching too wide */}
          <h1 className="font-['Titan_One'] text-6xl md:text-9xl uppercase tracking-tighter text-white drop-shadow-[6px_6px_0px_black]">
            Hello, {userProfile?.first_name || 'there'}!
          </h1>
          <p className="font-black text-indigo-100 uppercase tracking-[0.4em] mt-6 text-xs md:text-base drop-shadow-[2px_2px_0px_black]">Just a quick vibe check!</p>
        </div>
      </div>
      
      <div className="px-8 space-y-8 pb-20">
        {/* Top Cards */}
        <div className="max-w-xl">
          {/* Budget Used Card (Primary Highlight) */}
          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border-[3px] border-black shadow-[8px_8px_0px_0px_black] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_0px_black] transition-all overflow-hidden">
            <div className="bg-rose-400 px-8 py-5 border-b-[3px] border-black flex justify-between items-center">
              <h3 className="font-['Titan_One'] text-3xl text-black uppercase tracking-tight">Monthly Budget</h3>
              <TrendingUp className="w-8 h-8 text-black" />
            </div>
            <div className="p-8 flex items-baseline gap-4">
              <p className="text-6xl font-black text-black dark:text-gray-100 tracking-tighter">{formatCurrency(monthlySpending)}</p>
              <span className="text-xs font-black text-rose-600 bg-rose-50 border-2 border-rose-200 px-3 py-1 rounded-full uppercase tracking-widest">Active</span>
            </div>
          </div>
        </div>

      {/* Budget Projections Section */}
      <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border-[3px] border-black shadow-[8px_8px_0px_0px_black] overflow-hidden">
        <div className="p-6 bg-indigo-600 border-b-[3px] border-black">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-6 h-6 text-white" />
              <h3 className="font-['Titan_One'] text-2xl text-white uppercase tracking-tight">Budget Projections</h3>
            </div>
            {/* Date range selector */}
            <div className="flex gap-2">
              <input 
                type="month" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs font-black border-2 border-black rounded-lg px-2 py-1 bg-white uppercase"
              />
              <span className="self-center text-white font-black text-[10px] uppercase tracking-widest">to</span>
              <input 
                type="month" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-xs font-bold border-2 border-black rounded-lg px-2 py-1 bg-white"
              />
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="p-6 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Card 1: Avg Period Remaining */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">Avg Period</span>
                <Calendar className="w-4 h-4 text-blue-600" />
              </div>
              <p className={`text-lg font-bold ${avgPeriodRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(avgPeriodRemaining)}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Per timing period</p>
            </div>

            {/* Card 2: Monthly Average */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">Monthly Avg</span>
                <TrendingUp className="w-4 h-4 text-purple-600" />
              </div>
              <p className={`text-lg font-bold ${avgMonthlyRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(avgMonthlyRemaining)}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Per month</p>
            </div>

            {/* Card 3: Best Month */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">Best Month</span>
                <TrendingUp className="w-4 h-4 text-green-600" />
              </div>
              {bestMonth ? (
                <>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(bestMonth.avgRemaining)}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">{bestMonth.month}</p>
                </>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">No data</p>
              )}
            </div>

            {/* Card 4: Worst Month */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">Worst Month</span>
                <TrendingDown className="w-4 h-4 text-red-600" />
              </div>
              {worstMonth ? (
                <>
                  <p className={`text-lg font-bold ${worstMonth.avgRemaining >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {formatCurrency(worstMonth.avgRemaining)}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">{worstMonth.month}</p>
                </>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">No data</p>
              )}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="p-6">
          <div className="h-80">
            {periodProjections.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={periodProjections} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                  <XAxis 
                    dataKey="period" 
                    axisLine={false}
                    tickLine={false}
                    tick={{fill: tickColor, fontSize: 11}}
                    angle={0}
                    height={40}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{fill: tickColor, fontSize: 12}}
                    tickFormatter={(value) => formatCurrency(value)}
                    domain={[0, 'dataMax + 25%']}
                  />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: tooltipBg, color: tooltipColor}}
                  />
                  <Legend />
                  <Bar 
                    dataKey="income" 
                    fill="#10B981" 
                    name="Total Budget (Income)"
                    radius={[4, 4, 0, 0]}
                  >
                    <LabelList 
                      dataKey="income" 
                      position="top" 
                      formatter={(value: number) => formatCurrency(value)}
                      style={{ fill: labelListIncomeColor, fontSize: '11px', fontWeight: 'bold' }}
                    />
                  </Bar>
                  <Bar 
                    dataKey="totalBudget" 
                    fill="#F59E0B" 
                    name="Allocated Budget"
                    radius={[4, 4, 0, 0]}
                  >
                    <LabelList 
                      dataKey="totalBudget" 
                      position="top" 
                      formatter={(value: number) => formatCurrency(value)}
                      style={{ fill: labelListBudgetColor, fontSize: '11px', fontWeight: 'bold' }}
                    />
                  </Bar>
                  <Bar 
                    dataKey="remaining" 
                    fill="#3B82F6" 
                    name="Remaining"
                    radius={[4, 4, 0, 0]}
                  >
                    <LabelList 
                      dataKey="remaining" 
                      position="top" 
                      formatter={(value: number) => formatCurrency(value)}
                      style={{ fill: labelListRemainingColor, fontSize: '11px', fontWeight: 'bold' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-center">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 mb-2">No budget setups found</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500">Create budget setups to see projections</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-[2.5rem] border-[3px] border-black shadow-[8px_8px_0px_0px_black] overflow-hidden">
          <div className="p-6 bg-violet-500 border-b-[3px] border-black flex items-center justify-between">
            <h3 className="font-['Titan_One'] text-3xl text-white uppercase tracking-tight">Spending Activity</h3>
            <select className="bg-white border-2 border-black rounded-xl text-[10px] font-black uppercase tracking-widest p-2 focus:ring-0">
              <option>This Week</option>
              <option>Last Week</option>
            </select>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: tickColor, fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: tickColor, fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: isDarkMode ? '#374151' : '#f8fafc'}}
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: tooltipBg, color: tooltipColor}}
                />
                <Bar dataKey="spend" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border-[3px] border-black shadow-[8px_8px_0px_0px_black] overflow-hidden">
          <div className="p-6 bg-fuchsia-500 border-b-[3px] border-black">
            <h3 className="font-['Titan_One'] text-3xl text-white uppercase tracking-tight">Top Categories</h3>
          </div>
          <div className="p-6">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: tooltipBg, color: tooltipColor}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3 mt-4">
            {categoryData.map((cat: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full mr-2" style={{backgroundColor: COLORS[i % COLORS.length]}}></div>
                  <span className="text-gray-600 dark:text-gray-300">{cat.name}</span>
                </div>
                <span className="font-semibold dark:text-gray-100">{formatCurrency(cat.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border-[3px] border-black shadow-[8px_8px_0px_0px_black] overflow-hidden mb-12">
        <div className="p-6 bg-lime-400 border-b-[3px] border-black flex items-center justify-between">
          <h3 className="font-['Titan_One'] text-3xl text-black uppercase tracking-tight">Recent Activity</h3>
          <button className="text-[10px] font-black uppercase tracking-widest bg-white border-2 border-black px-4 py-2 rounded-xl hover:bg-black hover:text-white transition-colors">View All</button>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {transactions.slice(0, 5).map((transaction) => {
            return (
              <div key={transaction.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${getAccentClasses('lightBg')}`}>
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{transaction.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">{new Date(transaction.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <p className="font-bold text-gray-900 dark:text-gray-100">-{formatCurrency(transaction.amount)}</p>
              </div>
            );
          })}
          {transactions.length === 0 && (
            <div className="p-8 text-center text-gray-400 dark:text-gray-500">
              No transactions yet. Start recording your expenses!
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default Dashboard;
