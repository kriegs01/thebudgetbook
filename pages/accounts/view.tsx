import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { Account } from '../../types';
import { getAllTransactions, createTransaction, createTransfer, getLoanTransactionsWithPayments } from '../../src/services/transactionsService';
import { getAllAccountsFrontend } from '../../src/services/accountsService';
import { combineDateWithCurrentTime } from '../../src/utils/dateUtils';

type Transaction = {
  id: string;
  name: string;
  date: string; // ISO string
  amount: number;
  paymentMethodId: string;
  transaction_type?: 'payment' | 'withdraw' | 'transfer' | 'loan' | 'cash_in' | 'loan_payment';
  notes?: string | null;
  related_transaction_id?: string | null;
};

type LoanTransaction = Transaction & {
  payments?: Transaction[];
  totalPaid?: number;
  remainingBalance?: number;
};

type AccountMeta = { bank?: string };

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);

interface AccountFilteredTransactionsProps {
  accounts: Account[];
  onTransactionCreated?: () => void;
}

const AccountFilteredTransactions: React.FC<AccountFilteredTransactionsProps> = ({ accounts, onTransactionCreated }) => {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get("account") || searchParams.get("id");
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loanTransactions, setLoanTransactions] = useState<LoanTransaction[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  
  // Modal states
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showCashInModal, setShowCashInModal] = useState(false);
  const [showLoanPaymentModal, setShowLoanPaymentModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<LoanTransaction | null>(null);
  
  // Loading states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [withdrawForm, setWithdrawForm] = useState({ forWhat: '', amount: '', date: new Date().toISOString().split('T')[0] });
  const [transferForm, setTransferForm] = useState({ amount: '', receivingAccountId: '', date: new Date().toISOString().split('T')[0] });
  const [loanForm, setLoanForm] = useState({ what: '', amount: '', date: new Date().toISOString().split('T')[0] });
  const [cashInForm, setCashInForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0], notes: '' });
  const [loanPaymentForm, setLoanPaymentForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0] });

  const loadTransactions = async () => {
    if (typeof window === "undefined" || !accountId) return;
    
    try {
      const { data: transactionsData, error: transactionsError } = await getAllTransactions();
      
      if (transactionsError) {
        console.error('Error loading transactions:', transactionsError);
        return;
      }
      
      if (!transactionsData) {
        setTransactions([]);
        return;
      }
      
      // Convert Supabase transactions to local format
      const allTx: Transaction[] = transactionsData.map(t => ({
        id: t.id,
        name: t.name,
        date: t.date,
        amount: t.amount,
        paymentMethodId: t.payment_method_id,
        transaction_type: t.transaction_type,
        notes: t.notes,
        related_transaction_id: t.related_transaction_id
      }));
      
      const filtered = allTx.filter(tx => tx.paymentMethodId === accountId);
      setTransactions(filtered);

      // Load loan transactions with payments
      // Find the account from props to ensure we have the latest account type
      const currentAccount = accounts.find(a => a.id === accountId);
      if (currentAccount?.type === 'Debit') {
        const { data: loansData } = await getLoanTransactionsWithPayments(accountId);
        if (loansData) {
          const loansWithMeta = loansData.map(loan => ({
            id: loan.id,
            name: loan.name,
            date: loan.date,
            amount: loan.amount,
            paymentMethodId: loan.payment_method_id,
            transaction_type: loan.transaction_type as 'loan',
            notes: loan.notes,
            related_transaction_id: loan.related_transaction_id,
            payments: loan.payments?.map(p => ({
              id: p.id,
              name: p.name,
              date: p.date,
              amount: p.amount,
              paymentMethodId: p.payment_method_id,
              transaction_type: p.transaction_type as 'loan_payment',
              notes: p.notes,
              related_transaction_id: p.related_transaction_id
            })) || [],
            totalPaid: loan.totalPaid,
            remainingBalance: loan.remainingBalance
          }));
          setLoanTransactions(loansWithMeta);
        }
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (accountId) {
        const foundAccount = accounts.find(a => a.id === accountId);
        if (foundAccount) {
          setAccount(foundAccount);
        }
      }

      // Load all accounts for transfer dropdown
      const { data: accountsData } = await getAllAccountsFrontend();
      if (accountsData) {
        setAllAccounts(accountsData);
      }

      await loadTransactions();
    };
    
    loadData();
  }, [accountId, accounts]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await createTransaction({
        name: withdrawForm.forWhat,
        date: combineDateWithCurrentTime(withdrawForm.date),
        amount: Math.abs(parseFloat(withdrawForm.amount)), // Positive - money going out
        payment_method_id: accountId,
        transaction_type: 'withdraw',
        notes: null,
        payment_schedule_id: null,
        related_transaction_id: null
      });

      if (error) throw error;
      
      showMessage('success', 'Withdrawal recorded successfully');
      setShowWithdrawModal(false);
      setWithdrawForm({ forWhat: '', amount: '', date: new Date().toISOString().split('T')[0] });
      await loadTransactions();
      onTransactionCreated?.();
    } catch (error) {
      console.error('Error creating withdrawal:', error);
      showMessage('error', 'Failed to create withdrawal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await createTransfer(
        accountId,
        transferForm.receivingAccountId,
        parseFloat(transferForm.amount),
        combineDateWithCurrentTime(transferForm.date)
      );

      if (error) throw error;
      
      showMessage('success', 'Transfer completed successfully');
      setShowTransferModal(false);
      setTransferForm({ amount: '', receivingAccountId: '', date: new Date().toISOString().split('T')[0] });
      await loadTransactions();
      onTransactionCreated?.();
    } catch (error) {
      console.error('Error creating transfer:', error);
      showMessage('error', 'Failed to create transfer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await createTransaction({
        name: `Loan: ${loanForm.what}`,
        date: combineDateWithCurrentTime(loanForm.date),
        amount: Math.abs(parseFloat(loanForm.amount)), // Positive - money going out (lent)
        payment_method_id: accountId,
        transaction_type: 'loan',
        notes: loanForm.what,
        payment_schedule_id: null,
        related_transaction_id: null
      });

      if (error) throw error;
      
      showMessage('success', 'Loan recorded successfully');
      setShowLoanModal(false);
      setLoanForm({ what: '', amount: '', date: new Date().toISOString().split('T')[0] });
      await loadTransactions();
      onTransactionCreated?.();
    } catch (error) {
      console.error('Error creating loan:', error);
      showMessage('error', 'Failed to create loan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCashInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await createTransaction({
        name: 'Cash In',
        date: combineDateWithCurrentTime(cashInForm.date),
        amount: -Math.abs(parseFloat(cashInForm.amount)), // Negative - money coming in
        payment_method_id: accountId,
        transaction_type: 'cash_in',
        notes: cashInForm.notes || null,
        payment_schedule_id: null,
        related_transaction_id: null
      });

      if (error) throw error;
      
      showMessage('success', 'Cash in recorded successfully');
      setShowCashInModal(false);
      setCashInForm({ amount: '', date: new Date().toISOString().split('T')[0], notes: '' });
      await loadTransactions();
      onTransactionCreated?.();
    } catch (error) {
      console.error('Error creating cash in:', error);
      showMessage('error', 'Failed to record cash in');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoanPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !selectedLoan) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await createTransaction({
        name: 'Loan Payment Received',
        date: combineDateWithCurrentTime(loanPaymentForm.date),
        amount: -Math.abs(parseFloat(loanPaymentForm.amount)), // Negative - money coming in
        payment_method_id: accountId,
        transaction_type: 'loan_payment',
        notes: `Payment for: ${selectedLoan.name}`,
        payment_schedule_id: null,
        related_transaction_id: selectedLoan.id
      });

      if (error) throw error;
      
      showMessage('success', 'Loan payment recorded successfully');
      setShowLoanPaymentModal(false);
      setSelectedLoan(null);
      setLoanPaymentForm({ amount: '', date: new Date().toISOString().split('T')[0] });
      await loadTransactions();
      onTransactionCreated?.();
    } catch (error) {
      console.error('Error creating loan payment:', error);
      showMessage('error', 'Failed to record loan payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openLoanPaymentModal = (loan: LoanTransaction) => {
    setSelectedLoan(loan);
    setShowLoanPaymentModal(true);
  };

  const getTransactionTypeBadge = (type?: string) => {
    if (!type || type === 'payment') return null;
    
    const badges: Record<string, { color: string; label: string }> = {
      withdraw: { color: 'bg-red-100 text-red-700', label: 'Withdraw' },
      transfer: { color: 'bg-blue-100 text-blue-700', label: 'Transfer' },
      loan: { color: 'bg-orange-100 text-orange-700', label: 'Loan' },
      cash_in: { color: 'bg-green-100 text-green-700', label: 'Cash In' },
      loan_payment: { color: 'bg-purple-100 text-purple-700', label: 'Loan Payment' }
    };
    
    const badge = badges[type];
    if (!badge) return null;
    
    return (
      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  // Filter for transfer dropdown: only debit accounts, exclude current account
  const transferAccountOptions = allAccounts.filter(
    a => a.type === 'Debit' && a.id !== accountId
  );

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center space-x-4">
          <Link to="/accounts" className="p-2 rounded-lg bg-white shadow-sm hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </Link>
          <h1 className="text-2xl font-black text-gray-900">
            {account ? account.bank : `Account ${accountId}`}
          </h1>
        </div>

        {/* Success/Error Message */}
        {message && (
          <div className={`mb-4 p-4 rounded-xl ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase text-gray-600 tracking-widest">Transactions</h2>
            <div className="flex items-center gap-2">
              <div className="text-sm text-gray-500">{transactions.length} items</div>
              
              {/* Transaction Action Buttons - Only for Debit accounts */}
              {account?.type === 'Debit' && (
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => setShowWithdrawModal(true)}
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl transition-colors"
                  >
                    Withdraw
                  </button>
                  <button
                    onClick={() => setShowTransferModal(true)}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded-xl transition-colors"
                  >
                    Transfer
                  </button>
                  <button
                    onClick={() => setShowLoanModal(true)}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition-colors"
                  >
                    Loan
                  </button>
                  <button
                    onClick={() => setShowCashInModal(true)}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold rounded-xl transition-colors"
                  >
                    Cash In
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="p-4">
            <div className="w-full overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Amount</th>
                    {account?.type === 'Debit' && (
                      <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(tx => {
                    const loanTx = loanTransactions.find(l => l.id === tx.id);
                    return (
                      <tr key={tx.id} className="border-t border-gray-100">
                        <td className="px-4 py-3"><div className="text-sm font-medium text-gray-900">{tx.name}</div></td>
                        <td className="px-4 py-3">{getTransactionTypeBadge(tx.transaction_type)}</td>
                        <td className="px-4 py-3"><div className="text-sm text-gray-500">{new Date(tx.date).toLocaleDateString()}</div></td>
                        <td className="px-4 py-3">
                          <div className={`text-sm font-semibold ${tx.amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(-tx.amount)}
                          </div>
                        </td>
                        {account?.type === 'Debit' && (
                          <td className="px-4 py-3">
                            {tx.transaction_type === 'loan' && loanTx && (loanTx.remainingBalance ?? 0) > 0 && (
                              <button
                                onClick={() => openLoanPaymentModal(loanTx)}
                                className="px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold rounded-lg transition-colors"
                              >
                                Receive Payment
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {transactions.length === 0 && (
                    <tr><td colSpan={account?.type === 'Debit' ? 5 : 4} className="px-4 py-6 text-center text-gray-400">No transactions for this account.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-md bg-white rounded-3xl p-10 shadow-2xl relative">
            <h2 className="text-2xl font-black text-gray-900 mb-2">Withdraw</h2>
            <p className="text-gray-500 text-sm mb-8">Record a withdrawal from this account</p>
            <form onSubmit={handleWithdrawSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">For What?</label>
                <input 
                  value={withdrawForm.forWhat} 
                  onChange={e => setWithdrawForm(f => ({ ...f, forWhat: e.target.value }))} 
                  required 
                  placeholder="e.g. ATM Withdrawal"
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold focus:ring-2 focus:ring-red-500 transition-all" 
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={withdrawForm.amount} 
                    onChange={e => setWithdrawForm(f => ({ ...f, amount: e.target.value }))} 
                    required 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-red-500 transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date" 
                  value={withdrawForm.date} 
                  onChange={e => setWithdrawForm(f => ({ ...f, date: e.target.value }))} 
                  required 
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" 
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-4 rounded-2xl font-bold transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-4 rounded-2xl font-bold transition-colors disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : 'Record Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-md bg-white rounded-3xl p-10 shadow-2xl relative">
            <h2 className="text-2xl font-black text-gray-900 mb-2">Transfer</h2>
            <p className="text-gray-500 text-sm mb-8">Transfer money to another account</p>
            <form onSubmit={handleTransferSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={transferForm.amount} 
                    onChange={e => setTransferForm(f => ({ ...f, amount: e.target.value }))} 
                    required 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-blue-500 transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Receiving Account</label>
                {transferAccountOptions.length === 0 ? (
                  <div className="text-xs text-red-600 p-4 bg-red-50 rounded-xl">No other debit accounts available</div>
                ) : (
                  <select 
                    value={transferForm.receivingAccountId} 
                    onChange={e => setTransferForm(f => ({ ...f, receivingAccountId: e.target.value }))} 
                    required
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none"
                  >
                    <option value="">Select account...</option>
                    {transferAccountOptions.map(a => <option key={a.id} value={a.id}>{a.bank}</option>)}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date" 
                  value={transferForm.date} 
                  onChange={e => setTransferForm(f => ({ ...f, date: e.target.value }))} 
                  required 
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" 
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-4 rounded-2xl font-bold transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-4 rounded-2xl font-bold transition-colors disabled:opacity-50"
                  disabled={isSubmitting || transferAccountOptions.length === 0}
                >
                  {isSubmitting ? 'Processing...' : 'Complete Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loan Modal */}
      {showLoanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-md bg-white rounded-3xl p-10 shadow-2xl relative">
            <h2 className="text-2xl font-black text-gray-900 mb-2">Loan</h2>
            <p className="text-gray-500 text-sm mb-8">Record money lent out</p>
            <form onSubmit={handleLoanSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">What?</label>
                <input 
                  value={loanForm.what} 
                  onChange={e => setLoanForm(f => ({ ...f, what: e.target.value }))} 
                  required 
                  placeholder="e.g. John Doe, Emergency Loan"
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold focus:ring-2 focus:ring-orange-500 transition-all" 
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={loanForm.amount} 
                    onChange={e => setLoanForm(f => ({ ...f, amount: e.target.value }))} 
                    required 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-orange-500 transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date" 
                  value={loanForm.date} 
                  onChange={e => setLoanForm(f => ({ ...f, date: e.target.value }))} 
                  required 
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" 
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowLoanModal(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-4 rounded-2xl font-bold transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-2xl font-bold transition-colors disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : 'Record Loan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cash In Modal */}
      {showCashInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-md bg-white rounded-3xl p-10 shadow-2xl relative">
            <h2 className="text-2xl font-black text-gray-900 mb-2">Cash In</h2>
            <p className="text-gray-500 text-sm mb-8">Add money to this account</p>
            <form onSubmit={handleCashInSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={cashInForm.amount} 
                    onChange={e => setCashInForm(f => ({ ...f, amount: e.target.value }))} 
                    required 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-green-500 transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date" 
                  value={cashInForm.date} 
                  onChange={e => setCashInForm(f => ({ ...f, date: e.target.value }))} 
                  required 
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" 
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Notes (Optional)</label>
                <textarea
                  value={cashInForm.notes} 
                  onChange={e => setCashInForm(f => ({ ...f, notes: e.target.value }))} 
                  placeholder="e.g. Salary, Bonus, etc."
                  rows={3}
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm focus:ring-2 focus:ring-green-500 transition-all resize-none" 
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCashInModal(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-4 rounded-2xl font-bold transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white py-4 rounded-2xl font-bold transition-colors disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : 'Record Cash In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loan Payment Modal */}
      {showLoanPaymentModal && selectedLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-md bg-white rounded-3xl p-10 shadow-2xl relative">
            <h2 className="text-2xl font-black text-gray-900 mb-2">Receive Loan Payment</h2>
            <p className="text-gray-500 text-sm mb-4">Record payment received for: {selectedLoan.name}</p>
            
            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-600">Original Loan:</span>
                <span className="text-sm font-bold">{formatCurrency(Math.abs(selectedLoan.amount))}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-600">Total Paid:</span>
                <span className="text-sm font-bold text-green-600">{formatCurrency(selectedLoan.totalPaid || 0)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span className="text-sm font-bold text-gray-900">Remaining Balance:</span>
                <span className="text-sm font-bold text-orange-600">{formatCurrency(selectedLoan.remainingBalance || 0)}</span>
              </div>
            </div>

            <form onSubmit={handleLoanPaymentSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount Received</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    max={selectedLoan.remainingBalance || undefined}
                    value={loanPaymentForm.amount} 
                    onChange={e => setLoanPaymentForm(f => ({ ...f, amount: e.target.value }))} 
                    required 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-purple-500 transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date" 
                  value={loanPaymentForm.date} 
                  onChange={e => setLoanPaymentForm(f => ({ ...f, date: e.target.value }))} 
                  required 
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" 
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowLoanPaymentModal(false);
                    setSelectedLoan(null);
                  }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-4 rounded-2xl font-bold transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-purple-500 hover:bg-purple-600 text-white py-4 rounded-2xl font-bold transition-colors disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountFilteredTransactions;
