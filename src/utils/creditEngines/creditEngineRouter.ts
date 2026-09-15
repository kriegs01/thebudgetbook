// utils/creditEngines/creditEngineRouter.ts
import { Account, Transaction, Installment } from '../../types';
import { calculateSPayLaterCycle } from './SpayLaterEngine';
// import { calculateEastWestCycle } from './EastWestEngine';

export const getCreditStatementTotal = (
  account: Account,
  transactions: Transaction[],
  installments: Installment[],
  targetStatementId: string
): number => {
  
  // Safely parse the provider configuration from the database
  const providerType = account.provider_config?.type || 'standard';

  switch (providerType) {
    case 'spaylater':
      return calculateSPayLaterCycle(account, transactions, installments, targetStatementId);
    
    // case 'eastwest':
    //   return calculateEastWestCycle(account, transactions, installments, targetStatementId);

    default:
      // Fallback to legacy generic calculation if no specific engine exists
      return 0; // Replace with your legacy getFrozenCycleAmount logic
  }
};
