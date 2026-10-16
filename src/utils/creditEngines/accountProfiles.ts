const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface AccountProfile {
  id: string;
  name: string;
  namingDescription: string;
  features: { title: string; desc: string }[];
  getStatementName: (cycleStart: Date, cycleEnd: Date, dueDate: Date) => { targetMonth: string, targetYear: number };
  supportsBNPLConversion: boolean;
}

export const accountProfiles: AccountProfile[] = [
  {
    id: 'default',
    name: 'Standard Credit Card',
    namingDescription: 'Names the statement based on the month the bill is due (Standard Banking Practice).',
    features: [],
    getStatementName: (_cycleStart, _cycleEnd, dueDate) => ({
      targetMonth: MONTHS[dueDate.getMonth()],
      targetYear: dueDate.getFullYear()
    }),
    supportsBNPLConversion: false,
  },
  {
    id: 'spaylater',
    name: 'SPayLater',
    namingDescription: 'Matches the month your billing cycle started, aligning perfectly with how statements are named and appear in the Shopee app.',
    features: [
        {
          title: 'Convert to Installments',
          desc: 'Easily group your regular purchases together and split them into manageable monthly payments.'
        },
        {
          title: 'Smart Monthly Billing',
          desc: 'No manual math needed. It automatically tracks overlapping installment plans and adds the exact amount due to your monthly statement.'
        }
      ],
  
    getStatementName: (cycleStart) => ({
      targetMonth: MONTHS[cycleStart.getMonth()],
      targetYear: cycleStart.getFullYear()
    }),
    supportsBNPLConversion: true,
  }
];

export const getAccountProfile = (account: any): AccountProfile => {
    // 1. If the account has a specific engine saved, use it
    if (account?.engine_id && account.engine_id !== 'default') {
      const found = accountProfiles.find(p => p.id === account.engine_id);
      if (found) return found;
    }
    
    // 2. Fallback to the default standard credit card engine
    return accountProfiles.find(p => p.id === 'default')!;
  };
  