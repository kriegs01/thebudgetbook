/**
 * Payment Sync Demo Component
 * 
 * PROTOTYPE: Demonstration component showing how to use the centralized
 * payment synchronization utility and hooks.
 * 
 * This component serves as both:
 * 1. Integration example for the payment sync system
 * 2. Debugging/testing tool for payment sync calculations
 * 3. Documentation of proper usage patterns
 * 
 * TODO: Before production:
 * 1. Move this to a dedicated admin/debug section
 * 2. Add export functionality for sync reports
 * 3. Add visual indicators for sync discrepancies
 * 4. Consider making this a modal/drawer instead of full page
 * 5. Add filtering and search functionality
 * 6. Add date range selection
 */

import React, { useState, useEffect } from 'react';
import type { Installment, Biller, Account } from '../types';
import type { SupabaseTransaction } from '../src/types/supabase';
import { usePaymentSync } from '../src/utils/usePaymentSync';
import { AlertTriangle, CheckCircle2, Info, TrendingUp, Calendar } from 'lucide-react';
import { getAllTransactions } from '../src/services/transactionsService';

interface PaymentSyncDemoProps {
  installments: Installment[];
  billers: Biller[];
  accounts: Account[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * PROTOTYPE: Payment Synchronization Demo Component
 * 
 * This component demonstrates the usage of the centralized payment sync utility.
 * It shows payment status computed from transactions vs stored values.
 */
const PaymentSyncDemo: React.FC<PaymentSyncDemoProps> = ({ 
  installments, 
  billers, 
  accounts 
}) => {
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  
  // Load transactions
  useEffect(() => {
    const loadTransactions = async () => {
      setLoading(true);
      try {
        const { data, error } = await getAllTransactions();
        if (error) {
          console.error('[PaymentSyncDemo] Failed to load transactions:', error);
        } else if (data) {
          setTransactions(data);
        }
      } catch (error) {
        console.error('[PaymentSyncDemo] Error loading transactions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, []);

  // Use the payment sync hook
  const paymentSync = usePaymentSync({
    installments,
    billers,
    accounts,
    transactions,
    targetMonth: selectedMonth,
    targetYear: selectedYear,
  });

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(val);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading payment sync data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 mb-1">
              Payment Synchronization Prototype
            </h3>
            <p className="text-sm text-blue-800">
              This component demonstrates the centralized payment synchronization system.
              It compares payment data stored in entities (installments, billers) with
              actual transaction records to ensure consistency.
            </p>
          </div>
        </div>
      </div>

      {/* Month/Year Selector */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Select Period</h3>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            >
              {MONTHS.map(month => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            >
              {[2024, 2025, 2026].map(year => (
                <option key={year} value={year.toString()}>{year}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">Total Installments</div>
          <div className="text-2xl font-bold">{paymentSync.stats.totalInstallments}</div>
          <div className="text-xs text-green-600 mt-1">
            {paymentSync.stats.paidInstallments} paid
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">Total Billers</div>
          <div className="text-2xl font-bold">{paymentSync.stats.totalBillers}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">Active Accounts</div>
          <div className="text-2xl font-bold">{paymentSync.stats.activeAccounts}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">Total Transactions</div>
          <div className="text-2xl font-bold">{paymentSync.stats.totalTransactions}</div>
        </div>
      </div>

      {/* Installments Sync Status */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Installments Payment Status (from Transactions)
        </h3>
        {installments.length === 0 ? (
          <p className="text-gray-500 text-sm">No installments to display</p>
        ) : (
          <div className="space-y-2">
            {installments.map(installment => {
              const status = paymentSync.installmentStatus.get(installment.id);
              const syncStatus = paymentSync.syncStatus.get(installment.id);
              
              if (!status || !syncStatus) return null;

              return (
                <div key={installment.id} className="border rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{installment.name}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        Expected: {formatCurrency(installment.totalAmount)} | 
                        Monthly: {formatCurrency(installment.monthlyAmount)}
                      </div>
                      <div className="text-sm mt-1">
                        <span className="text-gray-700">Stored Paid:</span>{' '}
                        <span className="font-medium">{formatCurrency(installment.paidAmount)}</span>
                        {' '} | {' '}
                        <span className="text-gray-700">Transaction-based:</span>{' '}
                        <span className="font-medium">{formatCurrency(status.paidAmount)}</span>
                      </div>
                      {status.matchingTransactionIds.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          {status.matchingTransactionIds.length} matching transaction(s)
                        </div>
                      )}
                      {!syncStatus.inSync && (
                        <div className="flex items-center gap-2 mt-2 text-sm text-orange-700 bg-orange-50 px-2 py-1 rounded">
                          <AlertTriangle className="w-4 h-4" />
                          <span>
                            Sync difference: {formatCurrency(syncStatus.difference)} - {syncStatus.recommendation}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="ml-4">
                      {status.isPaid ? (
                        <CheckCircle2 className="w-6 h-6 text-green-500" />
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Loans Budget Section */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Loans Budget for {selectedMonth} {selectedYear}
        </h3>
        {paymentSync.loansBudget.length === 0 ? (
          <p className="text-gray-500 text-sm">No loan payments for this period</p>
        ) : (
          <div className="space-y-2">
            {paymentSync.loansBudget.map((loan, index) => (
              <div key={`${loan.installmentId || index}`} className="border rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{loan.installmentName}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Expected: {formatCurrency(loan.expectedAmount)} | 
                      Paid: {formatCurrency(loan.paidAmount)}
                    </div>
                    {loan.transactions.length > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        {loan.transactions.length} transaction(s) found
                      </div>
                    )}
                  </div>
                  <div className="ml-4">
                    {loan.isPaid ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : (
                      <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Account Billing Periods */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Account Transaction Summary by Billing Period</h3>
        {accounts.length === 0 ? (
          <p className="text-gray-500 text-sm">No accounts to display</p>
        ) : (
          <div className="space-y-4">
            {accounts.map(account => {
              const periods = paymentSync.accountBillingPeriods.get(account.id) || [];
              const recentPeriods = periods.slice(0, 3); // Show last 3 periods

              return (
                <div key={account.id} className="border-l-4 border-blue-500 pl-3">
                  <div className="font-medium mb-2">{account.bank} - {account.classification}</div>
                  {recentPeriods.length === 0 ? (
                    <p className="text-sm text-gray-500">No transactions</p>
                  ) : (
                    <div className="space-y-1">
                      {recentPeriods.map((period, idx) => (
                        <div key={idx} className="text-sm flex justify-between">
                          <span className="text-gray-600">
                            {period.period.month} {period.period.year}
                          </span>
                          <span className="font-medium">
                            {formatCurrency(period.totalAmount)} ({period.transactionCount} txs)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Note */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <strong>Note:</strong> This is a prototype implementation. The payment sync logic
            uses fuzzy matching (name + amount + date) which may produce false positives or negatives.
            Review the TODO comments in the source code for production considerations.
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentSyncDemo;
