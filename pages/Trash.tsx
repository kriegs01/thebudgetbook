import React from 'react';
import { FileText, ArrowLeft, RefreshCw, Trash2 } from 'lucide-react';

interface TrashProps {
  items: any[];
  onRestore: (item: any) => void;
  onDeletePermanently: (id: string) => void;
}

const Trash: React.FC<TrashProps> = ({ items, onRestore, onDeletePermanently }) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(val);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 w-full">
      <div>
        <h2 className="text-3xl font-black text-gray-900 tracking-tight uppercase">TRASH</h2>
        <p className="text-xs text-gray-400 font-bold uppercase tracking-[0.2em] mt-1">Review and manage removed budget history</p>
      </div>

      <div className="bg-white/40 backdrop-blur-xl rounded-[3rem] shadow-sm border border-gray-100 p-2 w-full">
        <div className="bg-white rounded-[2.5rem] overflow-hidden w-full">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="p-8 pl-12 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Month</th>
                  <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Timing</th>
                  <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Total Budget</th>
                  <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Status</th>
                  <th className="p-8 pr-12 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.length > 0 ? (
                  items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="p-8 pl-12">
                        <div className="flex items-center space-x-5">
                          <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 shadow-sm">
                            <FileText className="w-6 h-6" />
                          </div>
                          <span className="text-base font-black text-gray-900 tracking-tight">{item.month}</span>
                        </div>
                      </td>
                      <td className="p-8">
                        <span className="text-[10px] font-black text-gray-500 bg-gray-100/80 px-4 py-1.5 rounded-full uppercase tracking-widest">{item.timing}</span>
                      </td>
                      <td className="p-8">
                        <span className="text-base font-black text-gray-900 tracking-tight">{formatCurrency(item.totalAmount)}</span>
                      </td>
                      <td className="p-8">
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] px-4 py-1.5 rounded-full bg-gray-100 text-gray-500">
                          Removed
                        </span>
                      </td>
                      <td className="p-8 pr-12 text-right">
                        <div className="flex items-center justify-end space-x-3">
                          <button 
                            onClick={() => onRestore(item)}
                            className="flex items-center space-x-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all"
                            title="Restore to Budget"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Restore</span>
                          </button>
                          <button 
                            onClick={() => {
                              if (window.confirm('Permanently delete this budget entry? This cannot be undone.')) {
                                onDeletePermanently(item.id);
                              }
                            }}
                            className="p-3 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all"
                            title="Delete Permanently"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-24 text-center">
                      <div className="flex flex-col items-center">
                        <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center text-gray-300 mb-6">
                          <Trash2 className="w-10 h-10" />
                        </div>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Trash is empty</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Trash;