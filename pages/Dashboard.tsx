
import React from 'react';
import { Account, BudgetItem, Installment, Transaction, SavedBudgetSetup } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer as RechartsResponsiveContainer, Cell, PieChart, Pie, Legend, LabelList } from 'recharts';
import { TrendingUp, TrendingDown, Landmark, ArrowUpRight, CreditCard, Wallet, Calendar } from 'lucide-react';
import type { SupabaseUserProfile } from '../src/types/supabase';
import { useTheme } from '../src/contexts/ThemeContext';
import { DashboardHeader } from '../DashboardHeader';
import useMediaQuery from '../src/hooks/useMediaQuery';
import ResponsiveContainer from '../src/components/ResponsiveContainer';
import DashboardMobile from './DashboardMobile';

interface DashboardProps {
  accounts: Account[];
  budget: BudgetItem[];
  installments: Installment[];
  transactions?: Transaction[];
  budgetSetups?: SavedBudgetSetup[];
  userProfile?: SupabaseUserProfile | null;
  theme?: 'light' | 'dark';
}

const DashboardDesktop: React.FC<DashboardProps> = ({ accounts, budget, installments, transactions = [], budgetSetups = [], userProfile, theme }) => {
  const { getAccentClasses } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isDarkMode = theme === 'dark';
  const tickColor = isDarkMode ? '#6b7280' : '#94a3b8';
  const gridColor = isDarkMode ? '#374151' : '#f1f5f9';
  const tooltipBg = isDarkMode ? '#1f2937' : '#ffffff';
  const tooltipColor = isDarkMode ? '#d1d5db' : '#374151';
  const labelListIncomeColor = isDarkMode ? '#34d399' : '#059669';
  const labelListBudgetColor = isDarkMode ? '#fcd34d' : '#D97706';
  const labelListRemainingColor = isDarkMode ? '#93c5fd' : '#2563EB';

  const [startDate, setStartDate] = React.useState<string>("");
  const [endDate, setEndDate] = React.useState<string>("");

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

  const categoryData = budget.reduce((acc: any[], item) => {
    const existing = acc.find(a => a.name === item.category);
    if (existing) existing.value += item.amount;
    else acc.push({ name: item.category, value: item.amount });
    return acc;
  }, []);

  return (
    <div className={`animate-in fade-in duration-500 max-w-7xl mx-auto ${isMobile ? 'pt-4' : ''}`}>
      <DashboardHeader name={userProfile?.first_name || 'Budee User'} />
      <div className={`space-y-8 pb-24 ${isMobile ? 'px-4' : 'px-8'}`}>
        {/* ... (rest of the desktop layout code) ... */}
      </div>
    </div>
  );
};

const Dashboard: React.FC<DashboardProps> = (props) => {
  return (
    <ResponsiveContainer
      desktop={<DashboardDesktop {...props} />}
      mobile={<DashboardMobile {...props} />}
    />
  );
};

export default Dashboard;
