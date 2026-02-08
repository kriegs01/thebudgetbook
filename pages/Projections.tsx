import React, { useState, useMemo } from 'react';
import { SavedBudgetSetup, Account } from '../types';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Calendar } from 'lucide-react';

interface ProjectionsProps {
  budgetSetups: SavedBudgetSetup[];
  accounts: Account[];
}

interface PeriodProjection {
  month: string;
  periodLabel: string;
  monthYear: string;
  timing: '1/2' | '2/2';
  income: number;
  spending: number;
  remaining: number;
}

interface MonthlyAverage {
  month: string;
  income: number;
  spending: number;
  remaining: number;
  periodCount: number;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const Projections: React.FC<ProjectionsProps> = ({ budgetSetups, accounts }) => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  
  // Default to current month, project 6 months ahead
  const [startDate, setStartDate] = useState(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`);
  const [endDate, setEndDate] = useState(`${currentYear}-${String(Math.min(currentMonth + 7, 12)).padStart(2, '0')}`);
  const [viewMode, setViewMode] = useState<'period' | 'monthly'>('period');

  // Helper function to format currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  // Calculate spending from a budget setup
  const calculateSetupSpending = (setup: SavedBudgetSetup): number => {
    let totalSpending = 0;
    Object.keys(setup.data).forEach(category => {
      if (category.startsWith('_')) return;
      const items = setup.data[category];
      if (Array.isArray(items)) {
        items.forEach(item => {
          if (item.included) {
            totalSpending += parseFloat(item.amount) || 0;
          }
        });
      }
    });
    return totalSpending;
  };

  // Get income from setup
  const getSetupIncome = (setup: SavedBudgetSetup): number => {
    const actualSalary = setup.data._actualSalary;
    const projectedSalary = setup.data._projectedSalary;
    
    if (actualSalary && actualSalary.trim() !== '') {
      return parseFloat(actualSalary) || 0;
    } else if (projectedSalary && projectedSalary.trim() !== '') {
      return parseFloat(projectedSalary) || 0;
    }
    return 0;
  };

  // Calculate remaining for a setup
  const calculateSetupRemaining = (setup: SavedBudgetSetup): number => {
    const income = getSetupIncome(setup);
    const spending = calculateSetupSpending(setup);
    return income - spending;
  };

  // Calculate remaining projections for date range
  const calculateRemainingProjections = (startDateStr: string, endDateStr: string): PeriodProjection[] => {
    const [startYear, startMonth] = startDateStr.split('-').map(Number);
    const [endYear, endMonth] = endDateStr.split('-').map(Number);
    const monthsDiff = (endYear - startYear) * 12 + (endMonth - startMonth);
    
    if (monthsDiff < 0) return [];
    
    const periodProjections: PeriodProjection[] = [];
    
    // Iterate through each month
    for (let i = 0; i <= monthsDiff; i++) {
      const projectedDate = new Date(startYear, startMonth - 1 + i, 1);
      const month = MONTHS[projectedDate.getMonth()];
      const year = projectedDate.getFullYear();
      const monthShort = projectedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      // Find budget setups for this month
      const setup1_2 = budgetSetups.find(s => s.month === month && s.timing === '1/2');
      const setup2_2 = budgetSetups.find(s => s.month === month && s.timing === '2/2');
      
      // Process 1/2 timing
      if (setup1_2) {
        const income = getSetupIncome(setup1_2);
        const spending = calculateSetupSpending(setup1_2);
        const remaining = income - spending;
        
        periodProjections.push({
          month: `${monthShort} - 1/2`,
          periodLabel: `${monthShort} - 1/2`,
          monthYear: monthShort,
          timing: '1/2',
          income,
          spending,
          remaining
        });
      }
      
      // Process 2/2 timing
      if (setup2_2) {
        const income = getSetupIncome(setup2_2);
        const spending = calculateSetupSpending(setup2_2);
        const remaining = income - spending;
        
        periodProjections.push({
          month: `${monthShort} - 2/2`,
          periodLabel: `${monthShort} - 2/2`,
          monthYear: monthShort,
          timing: '2/2',
          income,
          spending,
          remaining
        });
      }
    }
    
    return periodProjections;
  };

  // Calculate monthly averages from period projections
  const calculateMonthlyAverages = (periodProjections: PeriodProjection[]): MonthlyAverage[] => {
    // Group by month
    const monthGroups = new Map<string, PeriodProjection[]>();
    
    periodProjections.forEach(period => {
      if (!monthGroups.has(period.monthYear)) {
        monthGroups.set(period.monthYear, []);
      }
      monthGroups.get(period.monthYear)!.push(period);
    });
    
    // Calculate averages
    const monthlyAverages: MonthlyAverage[] = [];
    monthGroups.forEach((periods, monthYear) => {
      const avgIncome = periods.reduce((sum, p) => sum + p.income, 0) / periods.length;
      const avgSpending = periods.reduce((sum, p) => sum + p.spending, 0) / periods.length;
      const avgRemaining = periods.reduce((sum, p) => sum + p.remaining, 0) / periods.length;
      
      monthlyAverages.push({
        month: monthYear,
        income: avgIncome,
        spending: avgSpending,
        remaining: avgRemaining,
        periodCount: periods.length
      });
    });
    
    return monthlyAverages;
  };

  // Memoized calculations
  const periodProjections = useMemo(() => 
    calculateRemainingProjections(startDate, endDate), 
    [startDate, endDate, budgetSetups]
  );

  const monthlyAverages = useMemo(() => 
    calculateMonthlyAverages(periodProjections), 
    [periodProjections]
  );

  // Calculate statistics
  const avgPeriodRemaining = useMemo(() => {
    return periodProjections.length > 0
      ? periodProjections.reduce((sum, p) => sum + p.remaining, 0) / periodProjections.length
      : 0;
  }, [periodProjections]);

  const avgMonthlyRemaining = useMemo(() => {
    return monthlyAverages.length > 0
      ? monthlyAverages.reduce((sum, m) => sum + m.remaining, 0) / monthlyAverages.length
      : 0;
  }, [monthlyAverages]);

  const bestMonth = useMemo(() => {
    return monthlyAverages.length > 0
      ? monthlyAverages.reduce((best, m) => m.remaining > best.remaining ? m : best)
      : null;
  }, [monthlyAverages]);

  const worstMonth = useMemo(() => {
    return monthlyAverages.length > 0
      ? monthlyAverages.reduce((worst, m) => m.remaining < worst.remaining ? m : worst)
      : null;
  }, [monthlyAverages]);

  // Get color based on value
  const getValueColor = (value: number): string => {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Financial Projections</h1>
          <p className="text-gray-600">Project your budget surplus and deficit based on income and spending</p>
        </div>

        {/* Surplus Projections Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 md:mb-0">Surplus Projections</h2>
            
            {/* View Mode Toggle */}
            <div className="flex space-x-2 mb-4 md:mb-0">
              <button 
                onClick={() => setViewMode('period')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  viewMode === 'period' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Period View
              </button>
              <button 
                onClick={() => setViewMode('monthly')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  viewMode === 'monthly' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Monthly View
              </button>
            </div>

            {/* Date Range Selector */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-gray-500" />
                <label className="text-sm font-medium text-gray-700">Start:</label>
                <input
                  type="month"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">End:</label>
                <input
                  type="month"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Avg Period Remaining */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="text-xs font-semibold text-gray-600 uppercase">Avg Period Remaining</div>
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div className={`text-2xl font-bold ${getValueColor(avgPeriodRemaining)}`}>
                {formatCurrency(avgPeriodRemaining)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Across {periodProjections.length} periods
              </div>
            </div>

            {/* Monthly Average */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="text-xs font-semibold text-gray-600 uppercase">Monthly Average</div>
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div className={`text-2xl font-bold ${getValueColor(avgMonthlyRemaining)}`}>
                {formatCurrency(avgMonthlyRemaining)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Across {monthlyAverages.length} months
              </div>
            </div>

            {/* Best Month */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="text-xs font-semibold text-gray-600 uppercase">Best Month</div>
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              {bestMonth ? (
                <>
                  <div className="text-lg font-bold text-gray-900 mb-1">{bestMonth.month}</div>
                  <div className={`text-xl font-bold ${getValueColor(bestMonth.remaining)}`}>
                    {formatCurrency(bestMonth.remaining)}
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-500">No data</div>
              )}
            </div>

            {/* Worst Month */}
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="text-xs font-semibold text-gray-600 uppercase">Worst Month</div>
                <TrendingDown className="w-5 h-5 text-red-600" />
              </div>
              {worstMonth ? (
                <>
                  <div className="text-lg font-bold text-gray-900 mb-1">{worstMonth.month}</div>
                  <div className={`text-xl font-bold ${getValueColor(worstMonth.remaining)}`}>
                    {formatCurrency(worstMonth.remaining)}
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-500">No data</div>
              )}
            </div>
          </div>

          {/* Charts */}
          {periodProjections.length > 0 ? (
            <div className="bg-white rounded-lg p-4 h-96">
              {viewMode === 'period' ? (
                // Period View (Bar Chart)
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={periodProjections}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis 
                      dataKey="periodLabel" 
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tickFormatter={(value) => formatCurrency(value)} />
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                    <Legend />
                    <Bar dataKey="remaining" fill="#3B82F6" name="Remaining" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                // Monthly View (Line Chart)
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyAverages}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis tickFormatter={(value) => formatCurrency(value)} />
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="remaining" 
                      stroke="#3B82F6" 
                      strokeWidth={3}
                      name="Avg Monthly Remaining"
                      dot={{ fill: '#3B82F6', r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          ) : (
            // Empty State
            <div className="p-8 text-center bg-gray-50 rounded-lg">
              <p className="text-gray-500 mb-4 text-lg font-medium">No budget setups found</p>
              <p className="text-sm text-gray-400 mb-4">
                Create budget setups in the Budget page to see projections
              </p>
              <a 
                href="/budget" 
                className="inline-block text-blue-600 hover:text-blue-700 underline font-medium"
              >
                Go to Budget Page
              </a>
            </div>
          )}
        </div>

        {/* Loan Projections Section - Placeholder */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Loan Projections</h2>
          <div className="p-8 text-center bg-gray-50 rounded-lg">
            <p className="text-gray-500">Loan projections feature coming soon</p>
            <p className="text-sm text-gray-400 mt-2">
              Track your loan payments and projection over time
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Projections;
