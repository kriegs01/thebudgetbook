import React, { useState } from 'react';
import { Account, BudgetItem, Installment, Transaction } from '../types';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Calendar, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

interface ProjectionsProps {
  accounts: Account[];
  budget: BudgetItem[];
  installments: Installment[];
  transactions?: Transaction[];
}

const Projections: React.FC<ProjectionsProps> = ({ accounts, budget, installments, transactions = [] }) => {
  const [surplusMonths, setSurplusMonths] = useState<3 | 6>(3);
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(val);
  };

  // Calculate surplus projections
  const calculateSurplusProjection = (months: number) => {
    // 1. Calculate current total balance from all accounts
    const totalBalance = accounts.reduce((acc, a) => 
      acc + (a.type === 'Debit' ? a.balance : -a.balance), 0);
    
    // 2. Calculate average monthly spending from budget items
    const monthlySpending = budget.reduce((acc, b) => acc + b.amount, 0);
    
    // 3. Project future months
    const projections = [];
    const today = new Date();
    
    for (let i = 1; i <= months; i++) {
      const futureDate = new Date(today);
      futureDate.setMonth(today.getMonth() + i);
      const monthName = futureDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const projectedBalance = totalBalance - (monthlySpending * i);
      
      projections.push({
        month: monthName,
        balance: projectedBalance,
        spending: monthlySpending
      });
    }
    
    return projections;
  };

  // Calculate loan projection for a specific installment
  const calculateLoanProjection = (installment: Installment) => {
    const paidAmount = installment.paidAmount;
    const remaining = installment.totalAmount - paidAmount;
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
        balance: Math.max(0, currentBalance),
        percentComplete: ((paidAmount + (installment.monthlyAmount * (i + 1))) / installment.totalAmount) * 100
      });
    }
    
    return projections;
  };

  const surplusProjections = calculateSurplusProjection(surplusMonths);
  const totalBalance = accounts.reduce((acc, a) => acc + (a.type === 'Debit' ? a.balance : -a.balance), 0);
  const monthlySpending = budget.reduce((acc, b) => acc + b.amount, 0);
  const projectedBalance = surplusProjections[surplusProjections.length - 1]?.balance || 0;
  const isDeficit = projectedBalance < 0;

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
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-bold">Surplus Projections</h3>
          </div>
          <select 
            value={surplusMonths}
            onChange={(e) => setSurplusMonths(Number(e.target.value) as 3 | 6)}
            className="bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value={3}>3 months</option>
            <option value={6}>6 months</option>
          </select>
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
                <span className="text-sm text-gray-600">Monthly Spending</span>
                <Calendar className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(monthlySpending)}</p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Status</span>
                <AlertCircle className={`w-4 h-4 ${isDeficit ? 'text-red-600' : projectedBalance < monthlySpending ? 'text-yellow-600' : 'text-green-600'}`} />
              </div>
              <p className={`text-lg font-bold ${isDeficit ? 'text-red-600' : projectedBalance < monthlySpending ? 'text-yellow-600' : 'text-green-600'}`}>
                {isDeficit ? 'Deficit' : projectedBalance < monthlySpending ? 'Low' : 'Surplus'}
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
