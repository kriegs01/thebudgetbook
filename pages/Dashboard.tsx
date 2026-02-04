
import React from 'react';
import { Account, BudgetItem, Installment } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { TrendingUp, TrendingDown, Landmark, ArrowUpRight, CreditCard, Wallet } from 'lucide-react';

interface Transaction {
  id: string;
  name: string;
  date: string;
  amount: number;
  paymentMethodId: string;
}

interface DashboardProps {
  accounts: Account[];
  budget: BudgetItem[];
  installments: Installment[];
  transactions?: Transaction[];
}

const Dashboard: React.FC<DashboardProps> = ({ accounts, budget, installments, transactions = [] }) => {
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

  // Calculate credit account utilization
  const creditAccounts = accounts.filter(a => a.type === 'Credit');
  const debitAccounts = accounts.filter(a => a.type === 'Debit');

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Greeting Header */}
      <div className="mb-2">
        <h1 className="text-3xl font-bold text-gray-900">Hello, JM!</h1>
      </div>
      
      {/* Top Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Landmark className="w-6 h-6" />
            </div>
            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">+2.5%</span>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Total Balance</h3>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalBalance)}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <TrendingUp className="w-6 h-6" />
            </div>
            <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full">+12%</span>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Monthly Budget Used</h3>
          <p className="text-2xl font-bold mt-1">{formatCurrency(monthlySpending)}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
              <TrendingDown className="w-6 h-6" />
            </div>
            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">-5%</span>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Credit Utilization</h3>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalDebt)}</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold">Spending Activity</h3>
            <select className="bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-0">
              <option>This Week</option>
              <option>Last Week</option>
            </select>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Bar dataKey="spend" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold mb-8">Categories</h3>
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
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3 mt-4">
            {categoryData.map((cat: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full mr-2" style={{backgroundColor: COLORS[i % COLORS.length]}}></div>
                  <span className="text-gray-600">{cat.name}</span>
                </div>
                <span className="font-semibold">{formatCurrency(cat.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Account Utilization Stats */}
      <div className="space-y-6">
        {/* Credit Accounts Utilization */}
        {creditAccounts.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center space-x-2">
              <CreditCard className="w-5 h-5 text-purple-600" />
              <h3 className="text-lg font-bold">Credit Accounts Utilization</h3>
            </div>
            <div className="p-6 space-y-4">
              {creditAccounts.map((account) => {
                const creditLimit = account.creditLimit ?? 0;
                const used = account.balance;
                const usedPercent = creditLimit > 0 ? Math.min(100, Math.round((used / creditLimit) * 100)) : 0;
                const available = creditLimit - used;
                
                return (
                  <div key={account.id} className="bg-gray-50 p-4 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-bold text-gray-900">{account.bank}</h4>
                        <p className="text-xs text-gray-500">{account.classification}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Used / Limit</p>
                        <p className="font-bold text-gray-900">{formatCurrency(used)} / {formatCurrency(creditLimit)}</p>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden mb-2">
                      <div
                        className={`h-3 rounded-full transition-all ${usedPercent >= 90 ? 'bg-red-500' : usedPercent >= 70 ? 'bg-yellow-500' : 'bg-purple-600'}`}
                        style={{ width: `${usedPercent}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <span>{usedPercent}% utilized</span>
                      <span className="text-green-600 font-medium">{formatCurrency(available)} available</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Debit Accounts Stats */}
        {debitAccounts.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center space-x-2">
              <Wallet className="w-5 h-5 text-green-600" />
              <h3 className="text-lg font-bold">Debit Accounts Overview</h3>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {debitAccounts.map((account) => {
                const balance = account.balance;
                const monthlyExpense = budget
                  .filter(b => b.accountId === account.id)
                  .reduce((sum, b) => sum + b.amount, 0);
                const percentSpent = balance > 0 ? Math.round((monthlyExpense / balance) * 100) : 0;
                const isOverdraft = percentSpent > 100;
                
                return (
                  <div key={account.id} className="bg-gray-50 p-4 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-bold text-gray-900">{account.bank}</h4>
                        <p className="text-xs text-gray-500">{account.classification}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Balance</span>
                        <span className="font-bold text-gray-900">{formatCurrency(balance)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Monthly Expense</span>
                        <span className="font-bold text-red-600">{formatCurrency(monthlyExpense)}</span>
                      </div>
                      {balance > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                            <span>Spent this month</span>
                            <span className={`font-medium ${isOverdraft ? 'text-red-600' : ''}`}>
                              {isOverdraft ? 'OVERDRAFT' : `${percentSpent}%`}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all ${isOverdraft ? 'bg-red-600' : percentSpent >= 90 ? 'bg-red-500' : percentSpent >= 70 ? 'bg-yellow-500' : 'bg-green-600'}`}
                              style={{ width: `${Math.min(percentSpent, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-bold">Recent Transactions</h3>
          <button className="text-blue-600 text-sm font-medium hover:underline">View All</button>
        </div>
        <div className="divide-y divide-gray-50">
          {transactions.slice(0, 5).map((transaction) => {
            const account = accounts.find(a => a.id === transaction.paymentMethodId);
            return (
              <div key={transaction.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{transaction.name}</p>
                    <p className="text-xs text-gray-500">{new Date(transaction.date).toLocaleDateString()} • {account?.bank || 'Unknown Account'}</p>
                  </div>
                </div>
                <p className="font-bold text-gray-900">-{formatCurrency(transaction.amount)}</p>
              </div>
            );
          })}
          {transactions.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              No transactions yet. Start recording your expenses!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
