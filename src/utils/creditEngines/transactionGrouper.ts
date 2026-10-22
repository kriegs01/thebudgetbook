// utils/creditEngines/transactionGrouper.ts
import { Installment, Transaction } from '../../types';

export interface GroupedTransaction {
  isGroup: boolean;
  id: string; // Either the raw transaction ID or the conversion_group_id
  date: string;
  totalAmount: number;
  transactions: Transaction[];
  parentInstallment?: Installment;
}

export const groupBNPLTransactions = (
  transactions: Transaction[],
  installments: Installment[] = []
): GroupedTransaction[] => {
  const groupedResult: GroupedTransaction[] = [];
  const groupMap = new Map<string, GroupedTransaction>();
  const installmentByConversionId = new Map(
    installments
      .filter(installment => installment.conversion_group_id || (installment as any).conversionGroupId)
      .map(installment => [
        installment.conversion_group_id || (installment as any).conversionGroupId,
        installment,
      ])
  );

  transactions.forEach(tx => {
    const conversionGroupId = tx.conversion_group_id || (tx as any).conversionGroupId;

    // If it's a normal transaction, push it directly to the result array
    if (!conversionGroupId) {
      groupedResult.push({
        isGroup: false,
        id: tx.id,
        date: tx.date || tx.completed_date || new Date().toISOString(),
        totalAmount: tx.amount,
        transactions: [tx],
      });
      return;
    }

    // If it belongs to a BNPL conversion, aggregate it into the Map
    if (groupMap.has(conversionGroupId)) {
      const existingGroup = groupMap.get(conversionGroupId)!;
      if (tx.transaction_type === 'installment') {
        existingGroup.parentInstallment = existingGroup.parentInstallment || installmentByConversionId.get(conversionGroupId);
        existingGroup.totalAmount = existingGroup.parentInstallment?.monthlyAmount || tx.amount;
      } else {
        existingGroup.transactions.push(tx);
      }
    } else {
      const parentInstallment = installmentByConversionId.get(conversionGroupId);
      const isParentInstallment = tx.transaction_type === 'installment';
      groupMap.set(conversionGroupId, {
        isGroup: true,
        id: conversionGroupId,
        // Use the date of the first item in the conversion group as the anchor date
        date: tx.date || tx.completed_date || new Date().toISOString(),
        totalAmount: parentInstallment?.monthlyAmount || (isParentInstallment ? tx.amount : 0),
        transactions: isParentInstallment ? [] : [tx],
        parentInstallment,
      });
    }
  });

  // Merge the aggregated groups back into the main timeline
  const finalTimeline = [...groupedResult, ...Array.from(groupMap.values())];

  // Sort by date descending (newest first)
  return finalTimeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};
