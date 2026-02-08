import React, { useState } from 'react';
import { Account, BudgetItem, Installment, Transaction, SavedBudgetSetup, Biller } from '../types';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Calendar, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

interface ProjectionsProps {
  accounts: Account[];
  budget: BudgetItem[];
  installments: Installment[];
  transactions?: Transaction[];
  budgetSetups?: SavedBudgetSetup[];
  billers?: Biller[];
}

const Projections: React.FC<ProjectionsProps> = ({ accounts, budget, installments, transactions = [], budgetSetups = [], billers = [] }) => {
  // Get current date in YYYY-MM format
  const getCurrentMonth = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  };

  // Get date one month after given date
  const getNextMonth = (dateStr: string) => {
    const [year, month] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1); // month is 0-indexed
    date.setMonth(date.getMonth() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  const [startDate, setStartDate] = useState<string>(getCurrentMonth());
  const [endDate, setEndDate] = useState<string>(getNextMonth(getCurrentMonth()));
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(val);
  };

  // Helper function to calculate total balance
  const calculateTotalBalance = (accounts: Account[]) => {
    return accounts.reduce((acc, a) => 
      acc + (a.type === 'Debit' ? a.balance : -a.balance), 0);
  };

  // Helper function to get month name from YYYY-MM format
  const getMonthName = (dateStr: string) => {
    const [year, month] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long' });
  };

  // Helper function to calculate spending from a budget setup
  const calculateSetupSpending = (setup: SavedBudgetSetup) => {
    let totalSpending = 0;
    
    // Sum up all items in the setup that are included
    Object.keys(setup.data).forEach(category => {
      if (category.startsWith('_')) return; // Skip metadata fields like _projectedSalary
      
      const items = setup.data[category];
      if (Array.isArray(items)) {
        items.forEach(item => {
          if (item.included) {
            const amount = parseFloat(item.amount) || 0;
            totalSpending += amount;
          }
        });
      }
    });
    
    return totalSpending;
  };

  // Helper function to get income from a budget setup
  const getSetupIncome = (setup: SavedBudgetSetup) => {
    const DEFAULT_SALARY = 11000;
    const actualSalary = setup.data._actualSalary;
    const projectedSalary = setup.data._projectedSalary;
    
    if (actualSalary && actualSalary.trim() !== '') {
      return parseFloat(actualSalary) || DEFAULT_SALARY;
    } else if (projectedSalary && projectedSalary.trim() !== '') {
      return parseFloat(projectedSalary) || DEFAULT_SALARY;
    }
    
    return DEFAULT_SALARY;
  };

  // Calculate surplus projections based on budget setups
  const calculateSurplusProjection = (startDateStr: string, endDateStr: string) => {
    // 1. Calculate current total balance from all accounts
    const totalBalance = calculateTotalBalance(accounts);
    
    // 2. Parse start and end dates
    const [startYear, startMonth] = startDateStr.split('-').map(Number);
    const [endYear, endMonth] = endDateStr.split('-').map(Number);
    
    // If end date is before start date, return empty array
    const monthsDiff = (endYear - startYear) * 12 + (endMonth - startMonth);
    if (monthsDiff < 0) {
      return [];
    }
    
    // 3. Build projections based on budget setups for each timing period
    const projections = [];
    let runningBalance = totalBalance;
    const DEFAULT_SALARY = 11000; // Default for periods without budget setups
    
    // Iterate through each month in the range
    for (let i = 0; i <= monthsDiff; i++) {
      const projectedDate = new Date(startYear, startMonth - 1 + i, 1);
      const year = projectedDate.getFullYear();
      const month = projectedDate.toLocaleDateString('en-US', { month: 'long' });
      const monthShort = projectedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      // Check for budget setups for this month
      const setup1_2 = budgetSetups.find(s => s.month === month && s.timing === '1/2');
      const setup2_2 = budgetSetups.find(s => s.month === month && s.timing === '2/2');
      
      // Process 1/2 timing
      if (setup1_2) {
        const income = getSetupIncome(setup1_2);
        const spending = calculateSetupSpending(setup1_2);
        const remaining = income - spending;
        runningBalance += remaining;
        
        projections.push({
          month: `${monthShort} - 1/2`,
          balance: runningBalance,
          remaining: remaining,
          income: income,
          spending: spending
        });
      } else {
        // No setup for 1/2, use default
        const income = DEFAULT_SALARY;
        const spending = 0; // No spending data
        const remaining = income - spending;
        runningBalance += remaining;
        
        projections.push({
          month: `${monthShort} - 1/2`,
          balance: runningBalance,
          remaining: remaining,
          income: income,
          spending: spending
        });
      }
      
      // Process 2/2 timing
      if (setup2_2) {
        const income = getSetupIncome(setup2_2);
        const spending = calculateSetupSpending(setup2_2);
        const remaining = income - spending;
        runningBalance += remaining;
        
        projections.push({
          month: `${monthShort} - 2/2`,
          balance: runningBalance,
          remaining: remaining,
          income: income,
          spending: spending
        });
      } else {
        // No setup for 2/2, use default
        const income = DEFAULT_SALARY;
        const spending = 0; // No spending data
        const remaining = income - spending;
        runningBalance += remaining;
        
        projections.push({
          month: `${monthShort} - 2/2`,
          balance: runningBalance,
          remaining: remaining,
          income: income,
          spending: spending
        });
      }
    }
    
    return projections;
  };

  // Calculate loan projection for a specific installment
  const calculateLoanProjection = (installment: Installment) => {
    const paidAmount = installment.paidAmount;
    const remaining = installment.totalAmount - paidAmount;
    
    // Handle edge case where monthlyAmount is 0 or very small
    if (installment.monthlyAmount <= 0) {
      return [];
    }
    
    const monthsRemaining = Math.ceil(remaining / installment.monthlyAmount);
    
    // Generate month-by-month projection
    const projections = [];
    let currentBalance = remaining;
    const startDate = installment.startDate ? new Date(installment.startDate + '-01') : new Date();
    
    for (let i = 0; i < monthsRemaining && i < 24; i++) { // Limit to 24 months for display
      const projectedDate = new Date(startDate);
      projectedDate.setMonth(startDate.getMonth() + i);
      
      const payment = Math.min(installment.monthlyAmount, currentBalance);
      currentBalance -= payment;
      
      projections.push({
        month: projectedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        payment: payment,
        balance: Math.max(0, currentBalance)
      });
    }
    
    return projections;
  };

  const surplusProjections = calculateSurplusProjection(startDate, endDate);
  const totalBalance = calculateTotalBalance(accounts);
  const projectedBalance = surplusProjections[surplusProjections.length - 1]?.balance || 0;
  const isDeficit = projectedBalance < 0;
  
  // Calculate average remaining across all projections for display
  const avgRemaining = surplusProjections.length > 0
    ? surplusProjections.reduce((acc, p) => acc + p.remaining, 0) / surplusProjections.length
    : 0;
  
  // Helper to determine status
  const getStatus = () => {
    if (isDeficit) return 'Deficit';
    if (avgRemaining < 0) return 'Deficit';
    if (avgRemaining === 0) return 'Break-even';
    return 'Surplus';
  };
  
  // Helper to get status color
  const getStatusColor = () => {
    if (isDeficit || avgRemaining < 0) return 'text-red-600';
    if (avgRemaining === 0) return 'text-yellow-600';
    return 'text-green-600';
  };
  
  const status = getStatus();
  const statusColor = getStatusColor();

  // Filter active installments (those with remaining balance)
  const activeInstallments = installments.filter(i => i.paidAmount < i.totalAmount);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Page Header */}
      <div className="mb-2">
        <h1 className="text-3xl font-bold text-gray-900">Financial Projections</h1>
        <p className="text-gray-500 mt-1">Visualize your future financial outlook</p>
      </div>

      {/* Surplus Projections Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold">Surplus Projections</h3>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex flex-col">
                <label htmlFor="startDate" className="text-xs text-gray-600 mb-1">Start Date</label>
                <input
                  id="startDate"
                  type="month"
                  value={startDate}
                  onChange={(e) => {
                    const newStartDate = e.target.value;
                    setStartDate(newStartDate);
                    // If end date is before new start date, update end date to next month
                    if (endDate < newStartDate) {
                      setEndDate(getNextMonth(newStartDate));
                    }
                  }}
                  className="bg-gray-50 border border-gray-200 rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="endDate" className="text-xs text-gray-600 mb-1">End Date</label>
                <input
                  id="endDate"
                  type="month"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="bg-gray-50 border border-gray-200 rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="p-6 bg-gray-50 border-b border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Current Balance</span>
                <DollarSign className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(totalBalance)}</p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Projected Balance</span>
                {isDeficit ? (
                  <TrendingDown className="w-4 h-4 text-red-600" />
                ) : (
                  <TrendingUp className="w-4 h-4 text-green-600" />
                )}
              </div>
              <p className={`text-xl font-bold ${isDeficit ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(projectedBalance)}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Avg Period Remaining</span>
                <Calendar className="w-4 h-4 text-purple-600" />
              </div>
              <p className={`text-xl font-bold ${avgRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(avgRemaining)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {avgRemaining >= 0 ? 'Surplus per period' : 'Deficit per period'}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Status</span>
                <AlertCircle className={`w-4 h-4 ${statusColor}`} />
              </div>
              <p className={`text-lg font-bold ${statusColor}`}>
                {status}
              </p>
            </div>
          </div>
        </div>

        {/* Line Chart */}
        <div className="p-6">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={surplusProjections}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 12}} 
                  dy={10} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 12}}
                  tickFormatter={(value) => formatCurrency(value)}
                />
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="balance" 
                  stroke="#3B82F6" 
                  strokeWidth={3}
                  name="Projected Balance"
                  dot={{ fill: '#3B82F6', r: 5 }}
                  activeDot={{ r: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Loan Projections Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center space-x-2">
          <TrendingDown className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-bold">Loan Projections</h3>
        </div>

        <div className="divide-y divide-gray-100">
          {activeInstallments.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No active loans or installments to display
            </div>
          ) : (
            activeInstallments.map((installment) => {
              const paidAmount = installment.paidAmount;
              const remaining = installment.totalAmount - paidAmount;
              const percentComplete = (paidAmount / installment.totalAmount) * 100;
              const monthsRemaining = Math.ceil(remaining / installment.monthlyAmount);
              const isExpanded = expandedLoanId === installment.id;
              const loanProjections = isExpanded ? calculateLoanProjection(installment) : [];

              // Calculate completion date
              const startDate = installment.startDate ? new Date(installment.startDate + '-01') : new Date();
              const completionDate = new Date(startDate);
              completionDate.setMonth(startDate.getMonth() + monthsRemaining);

              return (
                <div key={installment.id} className="p-6">
                  <div 
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedLoanId(isExpanded ? null : installment.id)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-bold text-gray-900">{installment.name}</h4>
                          <p className="text-sm text-gray-500">
                            {formatCurrency(installment.monthlyAmount)}/month • {monthsRemaining} months remaining
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">Total Amount</p>
                          <p className="font-bold text-gray-900">{formatCurrency(installment.totalAmount)}</p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                          <span>Paid: {formatCurrency(paidAmount)}</span>
                          <span>Remaining: {formatCurrency(remaining)}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div
                            className={`h-3 rounded-full transition-all ${
                              percentComplete >= 90 ? 'bg-green-500' : 
                              percentComplete >= 50 ? 'bg-blue-600' : 
                              'bg-purple-600'
                            }`}
                            style={{ width: `${percentComplete}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-600 mt-1">
                          <span>{Math.round(percentComplete)}% complete</span>
                          <span className="text-green-600 font-medium">
                            Est. completion: {completionDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="ml-4">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expandable Chart Section */}
                  {isExpanded && loanProjections.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-gray-100">
                      <h5 className="text-sm font-bold text-gray-700 mb-4">Month-by-Month Payment Schedule</h5>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={loanProjections}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                              dataKey="month" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{fill: '#94a3b8', fontSize: 10}} 
                              dy={10}
                              angle={-45}
                              textAnchor="end"
                              height={80}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{fill: '#94a3b8', fontSize: 12}}
                              tickFormatter={(value) => formatCurrency(value)}
                            />
                            <Tooltip 
                              formatter={(value: number) => formatCurrency(value)}
                              contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                            />
                            <Legend />
                            <Bar 
                              dataKey="payment" 
                              fill="#8B5CF6" 
                              radius={[4, 4, 0, 0]} 
                              barSize={32}
                              name="Monthly Payment"
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Summary Stats */}
                      <div className="mt-4 grid grid-cols-3 gap-4">
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <p className="text-xs text-gray-600 mb-1">Total Paid</p>
                          <p className="text-sm font-bold text-gray-900">{formatCurrency(paidAmount)}</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <p className="text-xs text-gray-600 mb-1">Remaining</p>
                          <p className="text-sm font-bold text-gray-900">{formatCurrency(remaining)}</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <p className="text-xs text-gray-600 mb-1">Progress</p>
                          <p className="text-sm font-bold text-gray-900">{Math.round(percentComplete)}%</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default Projections;
