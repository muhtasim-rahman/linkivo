import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { Shuffle, Folder, Settings, Settings2, Heart, ThumbsUp, ThumbsDown, Ban, Trash2, Maximize, ExternalLink, X, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RandomOpener() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [currentLink, setCurrentLink] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showFolders, setShowFolders] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchFolders = async () => {
      const q = query(collection(db, 'folders'), where('uid', '==', user.uid), where('deletedAt', '==', null));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFolders(data);
      
      const saved = localStorage.getItem('selectedFolders');
      if (saved) {
        setSelectedFolders(JSON.parse(saved));
      } else {
        setSelectedFolders(data.map(f => f.id));
      }
    };
    fetchFolders();
  }, [user]);

  const toggleFolder = (id: string) => {
    const newSelection = selectedFolders.includes(id) 
      ? selectedFolders.filter(f => f !== id)
      : [...selectedFolders, id];
    setSelectedFolders(newSelection);
    localStorage.setItem('selectedFolders', JSON.stringify(newSelection));
  };

  const openRandomLink = async () => {
    if (selectedFolders.length === 0) {
      toast.error('কমপক্ষে একটি ফোল্ডার নির্বাচন করুন');
      return;
    }

    setLoading(true);
    try {
      let allLinks: any[] = [];
      
      // Fetch links from selected folders
      for (const folderId of selectedFolders) {
        const q = query(collection(db, 'links'), where('folderId', '==', folderId), where('deletedAt', '==', null));
        const snapshot = await getDocs(q);
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.status !== 'blocked') {
            allLinks.push({ id: doc.id, ...data });
          }
        });
      }

      if (allLinks.length === 0) {
        toast.error('নির্বাচিত ফোল্ডারগুলোতে কোনো লিংক নেই');
        setLoading(false);
        return;
      }

      // Weighted random selection
      let weightedLinks: any[] = [];
      allLinks.forEach(link => {
        let weight = 1;
        if (link.status === 'favorite') weight = 10;
        else if (link.status === 'liked') weight = 5;
        else if (link.status === 'disliked') weight = 1;
        else weight = 2; // default active
        
        for (let i = 0; i < weight; i++) {
          weightedLinks.push(link);
        }
      });

      const randomIndex = Math.floor(Math.random() * weightedLinks.length);
      const selectedLink = weightedLinks[randomIndex];
      
      setCurrentLink(selectedLink);

      // Save to history
      await addDoc(collection(db, 'history'), {
        uid: user?.uid,
        linkId: selectedLink.id,
        url: selectedLink.url,
        title: selectedLink.title,
        openedAt: serverTimestamp()
      });

    } catch (error) {
      toast.error('লিংক ওপেন করতে সমস্যা হয়েছে');
    }
    setLoading(false);
  };

  const updateLinkStatus = async (status: string, points: number) => {
    if (!currentLink) return;
    await updateDoc(doc(db, 'links', currentLink.id), { status, points });
    setCurrentLink({ ...currentLink, status, points });
    toast.success('স্ট্যাটাস আপডেট হয়েছে');
  };

  const deleteLink = async () => {
    if (!currentLink) return;
    setDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!currentLink) return;
    await updateDoc(doc(db, 'links', currentLink.id), { deletedAt: serverTimestamp() });
    toast.success('লিংক ডিলিট করা হয়েছে');
    setCurrentLink(null);
    setDeleteConfirm(false);
  };

  return (
    <div className={`pb-20 ${isFullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900 pb-0' : ''}`}>
      {!isFullscreen && (
        <>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold dark:text-white">র‍্যান্ডম লিংক</h1>
            <button 
              onClick={openRandomLink}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl shadow-lg transition-transform hover:scale-105 flex items-center gap-2 disabled:opacity-50"
            >
              <Shuffle size={20} />
              {loading ? 'খুঁজছে...' : 'ওপেন করুন'}
            </button>
          </div>

          {/* Folders Selection Section */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 overflow-hidden">
            <button 
              onClick={() => setShowFolders(!showFolders)}
              className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2 font-medium dark:text-white">
                <Folder size={20} className="text-blue-500" />
                ফোল্ডার নির্বাচন করুন
              </div>
              {showFolders ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
            </button>
            
            {showFolders && (
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {folders.map(folder => (
                  <label key={folder.id} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors ${selectedFolders.includes(folder.id) ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300'}`}>
                    <input 
                      type="checkbox" 
                      checked={selectedFolders.includes(folder.id)}
                      onChange={() => toggleFolder(folder.id)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="truncate text-sm font-medium">{folder.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Advanced Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-6">
        <button 
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 rounded-xl">
              <Settings size={20} />
            </div>
            <span className="font-bold text-gray-900 dark:text-white">অ্যাডভান্সড সেটিংস</span>
          </div>
          {showAdvanced ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
        </button>
        
        {showAdvanced && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">লিংক ফিল্টার</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded text-blue-600" />
                  <span className="text-sm dark:text-gray-300">ফেভারিট</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded text-blue-600" />
                  <span className="text-sm dark:text-gray-300">লাইকড</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded text-blue-600" />
                  <span className="text-sm dark:text-gray-300">সাধারণ</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded text-blue-600" />
                  <span className="text-sm dark:text-gray-300">ডিসলাইকড</span>
                </label>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ওপেন করার নিয়ম</h4>
              <select className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:text-white">
                <option value="weighted">পয়েন্ট অনুযায়ী (ডিফল্ট)</option>
                <option value="random">সম্পূর্ণ র‍্যান্ডম</option>
                <option value="oldest">পুরোনো লিংক আগে</option>
                <option value="newest">নতুন লিংক আগে</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Embedded Link View */}
      {currentLink && (
        <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : 'h-[600px] mt-6'}`}>
          {/* Header */}
          <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex flex-wrap gap-2 items-center justify-between bg-gray-50 dark:bg-gray-800/80">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 dark:text-white truncate" title={currentLink.title}>{currentLink.title}</h3>
              <p className="text-xs text-blue-500 truncate">{currentLink.url}</p>
            </div>
            {isFullscreen && (
              <button onClick={() => setIsFullscreen(false)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 ml-2" title="বন্ধ করুন">
                <X size={20} />
              </button>
            )}
          </div>
          
          {/* Iframe */}
          <div className="flex-1 bg-gray-100 dark:bg-gray-900 relative">
            <iframe 
              src={currentLink.url} 
              className="w-full h-full border-none"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              title="Link Preview"
            />
            <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_20px_rgba(0,0,0,0.05)]"></div>
          </div>

          {/* Footer Actions */}
          <div className="p-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex items-center justify-center gap-2 sm:gap-4 overflow-x-auto">
            <button onClick={() => updateLinkStatus('favorite', 10)} className={`p-2.5 rounded-xl flex items-center gap-2 transition-colors ${currentLink.status==='favorite'?'text-red-500 bg-red-50 dark:bg-red-900/20':'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="ফেভারিট (সবচেয়ে বেশি ওপেন হবে)">
              <Heart size={20} fill={currentLink.status==='favorite'?'currentColor':'none'} />
              <span className="hidden sm:inline text-sm font-medium">ফেভারিট</span>
            </button>
            <button onClick={() => updateLinkStatus('liked', 5)} className={`p-2.5 rounded-xl flex items-center gap-2 transition-colors ${currentLink.status==='liked'?'text-blue-500 bg-blue-50 dark:bg-blue-900/20':'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="লাইক (বেশি ওপেন হবে)">
              <ThumbsUp size={20} fill={currentLink.status==='liked'?'currentColor':'none'} />
              <span className="hidden sm:inline text-sm font-medium">লাইক</span>
            </button>
            <button onClick={() => updateLinkStatus('disliked', 1)} className={`p-2.5 rounded-xl flex items-center gap-2 transition-colors ${currentLink.status==='disliked'?'text-orange-500 bg-orange-50 dark:bg-orange-900/20':'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="ডিসলাইক (কম ওপেন হবে)">
              <ThumbsDown size={20} fill={currentLink.status==='disliked'?'currentColor':'none'} />
              <span className="hidden sm:inline text-sm font-medium">ডিসলাইক</span>
            </button>
            <button onClick={() => updateLinkStatus('blocked', 0)} className={`p-2.5 rounded-xl flex items-center gap-2 transition-colors ${currentLink.status==='blocked'?'text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-gray-600':'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="ব্লক (কখনো ওপেন হবে না)">
              <Ban size={20} />
              <span className="hidden sm:inline text-sm font-medium">ব্লক</span>
            </button>
            
            <div className="w-px h-8 bg-gray-300 dark:bg-gray-600 mx-1"></div>
            
            <button onClick={deleteLink} className="p-2.5 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="ডিলিট করুন">
              <Trash2 size={20} />
            </button>
            <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="ফুলস্ক্রিন">
              <Maximize size={20} />
            </button>
            <a href={currentLink.url} target="_blank" rel="noreferrer" className="p-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="নতুন ট্যাবে ওপেন করুন">
              <ExternalLink size={20} />
            </a>
          </div>
        </div>
      )}

      {!currentLink && !loading && (
        <div className="text-center py-20 text-gray-400">
          <Shuffle size={64} className="mx-auto mb-6 opacity-20" />
          <p className="text-lg">উপরের "ওপেন করুন" বাটনে ক্লিক করে র‍্যান্ডম লিংক দেখুন</p>
        </div>
      )}
      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-xl font-bold mb-2 dark:text-white">লিংক ডিলিট</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">লিংকটি ডিলিট করতে চান?</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteConfirm(false)}
                className="flex-1 py-3 rounded-xl font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                বাতিল
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 py-3 rounded-xl font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                ডিলিট করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
