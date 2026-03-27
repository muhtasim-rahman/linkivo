import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { Shuffle, ExternalLink, Maximize, Heart, ThumbsUp, ThumbsDown, Ban, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RandomOpener() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [currentLink, setCurrentLink] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Load folders
    getDocs(query(collection(db, 'folders'), where('uid', '==', user.uid), where('deletedAt', '==', null)))
      .then(snap => {
        const f = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setFolders(f);
        // Load saved selection from localStorage
        const saved = localStorage.getItem('selectedFolders');
        if (saved) {
          setSelectedFolders(JSON.parse(saved));
        } else {
          setSelectedFolders(f.map(x => x.id));
        }
      });
  }, [user]);

  const toggleFolder = (id: string) => {
    const newSel = selectedFolders.includes(id) 
      ? selectedFolders.filter(x => x !== id)
      : [...selectedFolders, id];
    setSelectedFolders(newSel);
    localStorage.setItem('selectedFolders', JSON.stringify(newSel));
  };

  const openRandomLink = async () => {
    if (selectedFolders.length === 0) {
      toast.error('অন্তত একটি ফোল্ডার সিলেক্ট করুন');
      return;
    }
    setLoading(true);
    try {
      // Fetch links from selected folders
      // Note: Firestore 'in' query is limited to 10, so we fetch all and filter client-side for simplicity in this prototype
      const q = query(collection(db, 'links'), where('uid', '==', user?.uid), where('deletedAt', '==', null));
      const snap = await getDocs(q);
      let validLinks: any[] = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((l: any) => selectedFolders.includes(l.folderId) && l.status !== 'blocked');

      if (validLinks.length === 0) {
        toast.error('সিলেক্ট করা ফোল্ডারে কোনো লিংক নেই');
        setLoading(false);
        return;
      }

      // Weighted random selection based on points
      let totalPoints = validLinks.reduce((sum, link: any) => sum + (link.points || 1), 0);
      let randomVal = Math.random() * totalPoints;
      let selected = validLinks[0];
      
      for (const link of validLinks) {
        randomVal -= (link.points || 1);
        if (randomVal <= 0) {
          selected = link;
          break;
        }
      }

      setCurrentLink(selected);
      
      // Save to history
      await addDoc(collection(db, 'history'), {
        uid: user?.uid,
        linkId: selected.id,
        url: selected.url,
        title: selected.title,
        openedAt: serverTimestamp()
      });

    } catch (error) {
      console.error(error);
      toast.error('লিংক ওপেন করতে সমস্যা হয়েছে');
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] md:h-[calc(100vh-64px)]">
      {/* Settings Panel */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-4 overflow-hidden shrink-0">
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="w-full flex items-center justify-between p-4 font-medium"
        >
          <div className="flex items-center gap-2">
            <Settings2 size={20} className="text-blue-500" />
            <span>র‍্যান্ডম ওপেনার সেটিংস</span>
          </div>
          {showSettings ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        
        {showSettings && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <h3 className="text-sm font-medium mb-3 text-gray-500">ফোল্ডার সিলেক্ট করুন:</h3>
            <div className="flex flex-wrap gap-2">
              {folders.map(f => (
                <button
                  key={f.id}
                  onClick={() => toggleFolder(f.id)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    selectedFolders.includes(f.id)
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Action Area */}
      {!currentLink ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
          <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6">
            <Shuffle size={48} className="text-blue-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">নতুন কিছু আবিষ্কার করুন</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md">
            আপনার সেভ করা লিংকগুলো থেকে পয়েন্টের ভিত্তিতে একটি র‍্যান্ডম লিংক ওপেন হবে।
          </p>
          <button
            onClick={openRandomLink}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-lg shadow-blue-500/30 transition-transform hover:scale-105 active:scale-95 flex items-center gap-3 disabled:opacity-70"
          >
            <Shuffle size={24} />
            {loading ? 'খোঁজা হচ্ছে...' : 'র‍্যান্ডম লিংক ওপেন করুন'}
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
            <div className="flex-1 min-w-0 pr-4">
              <h3 className="font-medium truncate">{currentLink.title}</h3>
              <p className="text-xs text-gray-500 truncate">{currentLink.url}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={openRandomLink} className="p-2 bg-blue-100 text-blue-600 dark:bg-blue-900/40 rounded-lg mr-2" title="পরবর্তী লিংক">
                <Shuffle size={18} />
              </button>
              <a href={currentLink.url} target="_blank" rel="noreferrer" className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg" title="নতুন ট্যাবে ওপেন">
                <ExternalLink size={18} />
              </a>
              <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg hidden md:block" title="ফুলস্ক্রিন">
                <Maximize size={18} />
              </button>
            </div>
          </div>
          
          {/* Iframe View */}
          <div className="flex-1 relative bg-gray-100 dark:bg-gray-950">
            {/* Note: Many sites block iframes. We show it, but it might fail to load depending on X-Frame-Options */}
            <iframe 
              src={currentLink.url} 
              className="w-full h-full border-none"
              sandbox="allow-scripts allow-same-origin"
              title={currentLink.title}
            />
          </div>

          {/* Bottom Actions */}
          <div className="p-3 border-t border-gray-100 dark:border-gray-700 flex justify-center gap-4 bg-gray-50 dark:bg-gray-900/50">
            <button className={`p-2 rounded-full ${currentLink.status==='favorite'?'text-red-500 bg-red-50':'text-gray-500 hover:bg-gray-200'}`}><Heart size={20} fill={currentLink.status==='favorite'?'currentColor':'none'}/></button>
            <button className={`p-2 rounded-full ${currentLink.status==='liked'?'text-blue-500 bg-blue-50':'text-gray-500 hover:bg-gray-200'}`}><ThumbsUp size={20} fill={currentLink.status==='liked'?'currentColor':'none'}/></button>
            <button className={`p-2 rounded-full ${currentLink.status==='disliked'?'text-orange-500 bg-orange-50':'text-gray-500 hover:bg-gray-200'}`}><ThumbsDown size={20} fill={currentLink.status==='disliked'?'currentColor':'none'}/></button>
            <button className={`p-2 rounded-full ${currentLink.status==='blocked'?'text-gray-800 bg-gray-200':'text-gray-500 hover:bg-gray-200'}`}><Ban size={20} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
