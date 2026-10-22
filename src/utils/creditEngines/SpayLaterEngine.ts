// utils/creditEngines/SPayLaterEngine.ts
import { Account, Transaction, Installment } from '../../types';

export const calculateSPayLaterCycle = (
  account: Account,
  transactions: Transaction[],
  installments: Installment[],
  targetStatementId: string // e.g., "2026-08"
) => {
  let statementTotal = 0;

  // 1. Process active, resolved installments anchored to this statement
  const activeInstallments = installments.filter(inst => {
    if (inst.status === 'pending') return false;
    const linkedId = inst.accountId || inst.linkedAccountId;
    if (linkedId !== account.id) return false;
    
    // Guard: Exclude receivables (where you are the lender)
    if (!inst.funding_friend_id && (inst.debtor_friend_id || inst.friend_user_id)) return false;
    
    return inst.statement_id === targetStatementId && !inst.isArchived;
  });

  statementTotal += activeInstallments.reduce((sum, inst) => sum + (Number(inst.monthlyAmount) || 0), 0);

  // 2. Process standard purchases that bypassed BNPL
  const standardSwipes = transactions.filter(tx => {
    if (tx.payment_method_id !== account.id) return false;
    
    // Ignore physical delivery items, but keep pending BNPL drafts as standard charges.
    if (tx.order_status === 'pending_delivery') return false;
    
    // Only approved BNPL groups replace their original charges.
    if (tx.conversion_group_id && tx.conversion_status === 'approved') return false;

    // Standard statement matching logic here...
    const txDate = new Date(tx.completed_date || tx.date);
    const txStatementId = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
    
    return txStatementId === targetStatementId && tx.transaction_type === 'cash_out';
  });

  statementTotal += standardSwipes.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  return statementTotal;
};
