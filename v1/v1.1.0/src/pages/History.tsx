import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { Clock, ExternalLink } from 'lucide-react';

export default function History() {
  const { user } = useAuth();
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    // Note: requires composite index in Firestore if ordering by openedAt, 
    // for now we fetch and sort client side if index fails, but let's try standard query
    const q = query(
      collection(db, 'history'), 
      where('uid', '==', user.uid)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => (b.openedAt?.toMillis() || 0) - (a.openedAt?.toMillis() || 0));
      setHistory(data);
    });
    return unsubscribe;
  }, [user]);

  return (
    <div className="pb-20">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-xl">
          <Clock size={24} />
        </div>
        <h1 className="text-2xl font-bold">হিস্ট্রি</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {history.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Clock size={48} className="mx-auto mb-4 opacity-20" />
            <p>কোনো হিস্ট্রি পাওয়া যায়নি।</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {history.map(item => (
              <div key={item.id} className="p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center shrink-0">
                  <img src={`https://www.google.com/s2/favicons?domain=${item.url}&sz=64`} alt="" className="w-5 h-5" onError={(e) => {e.currentTarget.style.display='none'}} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate text-sm">{item.title}</h3>
                  <p className="text-xs text-gray-500 truncate">{item.url}</p>
                </div>
                <div className="text-xs text-gray-400 shrink-0 text-right">
                  {item.openedAt ? new Date(item.openedAt.toDate()).toLocaleDateString('bn-BD') : ''}
                  <br/>
                  {item.openedAt ? new Date(item.openedAt.toDate()).toLocaleTimeString('bn-BD', {hour: '2-digit', minute:'2-digit'}) : ''}
                </div>
                <a href={item.url} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-blue-500 shrink-0">
                  <ExternalLink size={18} />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
