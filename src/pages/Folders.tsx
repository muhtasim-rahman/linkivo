import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, rtdb } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { ref, set, get } from 'firebase/database';
import { Folder, Plus, MoreVertical, Lock, Trash2, Edit2, Pin, Unlock, Shuffle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Folders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [folders, setFolders] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  
  // Modals state
  const [renameModal, setRenameModal] = useState<{id: string, name: string} | null>(null);
  const [lockModal, setLockModal] = useState<{id: string, isLocked: boolean} | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'folders'), where('uid', '==', user.uid), where('deletedAt', '==', null));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a: any, b: any) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
      });
      setFolders(data);
    });
    return unsubscribe;
  }, [user]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await addDoc(collection(db, 'folders'), {
        uid: user?.uid,
        name: newFolderName,
        isPinned: false,
        isLocked: false,
        createdAt: serverTimestamp(),
        deletedAt: null
      });
      setNewFolderName('');
      setShowCreate(false);
      toast.success('ফোল্ডার তৈরি হয়েছে!');
    } catch (error) {
      toast.error('ফোল্ডার তৈরি করতে সমস্যা হয়েছে।');
    }
  };

  const togglePin = async (id: string, current: boolean) => {
    await updateDoc(doc(db, 'folders', id), { isPinned: !current });
    setActiveMenu(null);
  };

  const moveToTrash = async (id: string) => {
    setDeleteConfirm(id);
    setActiveMenu(null);
  };

  const confirmDelete = async () => {
    if (deleteConfirm) {
      await updateDoc(doc(db, 'folders', deleteConfirm), { deletedAt: serverTimestamp() });
      toast.success('রিসাইকেল বিনে পাঠানো হয়েছে');
      setDeleteConfirm(null);
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameModal || !renameModal.name.trim()) return;
    await updateDoc(doc(db, 'folders', renameModal.id), { name: renameModal.name });
    toast.success('নাম পরিবর্তন করা হয়েছে');
    setRenameModal(null);
  };

  const handleLockToggle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lockModal || pinInput.length !== 6) {
      toast.error('৬ ডিজিটের পিন দিন');
      return;
    }
    
    try {
      const pinRef = ref(rtdb, `folderPins/${user?.uid}/${lockModal.id}`);
      
      if (lockModal.isLocked) {
        // Unlocking
        const snapshot = await get(pinRef);
        if (snapshot.val() === pinInput) {
          await updateDoc(doc(db, 'folders', lockModal.id), { isLocked: false });
          await set(pinRef, null);
          toast.success('ফোল্ডার আনলক করা হয়েছে');
          setLockModal(null);
        } else {
          toast.error('ভুল পিন!');
        }
      } else {
        // Locking
        await set(pinRef, pinInput);
        await updateDoc(doc(db, 'folders', lockModal.id), { isLocked: true });
        toast.success('ফোল্ডার লক করা হয়েছে');
        setLockModal(null);
      }
      setPinInput('');
    } catch (error) {
      toast.error('সমস্যা হয়েছে, আবার চেষ্টা করুন');
    }
  };

  const openFolder = async (folder: any) => {
    if (folder.isLocked) {
      const enteredPin = window.prompt('এই ফোল্ডারটি লক করা। ৬ ডিজিটের পিন দিন:');
      if (!enteredPin) return;
      
      const pinRef = ref(rtdb, `folderPins/${user?.uid}/${folder.id}`);
      const snapshot = await get(pinRef);
      if (snapshot.val() === enteredPin) {
        navigate(`/folder/${folder.id}`);
      } else {
        toast.error('ভুল পিন!');
      }
    } else {
      navigate(`/folder/${folder.id}`);
    }
  };

  const openRandomFromFolder = (folderId: string) => {
    navigate(`/random?folderId=${folderId}`);
  };

  return (
    <div className="pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">আমার ফোল্ডারসমূহ</h1>
        <button 
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full shadow-lg transition-transform hover:scale-105"
        >
          <Plus size={24} />
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreateFolder} className="mb-6 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex gap-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="ফোল্ডারের নাম..."
            className="flex-1 bg-transparent border-none focus:ring-0 px-2 outline-none dark:text-white"
            autoFocus
          />
          <button type="submit" className="text-blue-600 font-medium px-4">তৈরি করুন</button>
          <button type="button" onClick={() => setShowCreate(false)} className="text-gray-400 px-2">বাতিল</button>
        </form>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {folders.map(folder => (
          <div key={folder.id} className="relative group bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
            <div onClick={() => openFolder(folder)} className="block text-center cursor-pointer">
              <div className="mx-auto w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mb-3 text-blue-500">
                {folder.isLocked ? <Lock size={32} /> : <Folder size={32} />}
              </div>
              <h3 className="font-medium truncate px-2 dark:text-white">{folder.name}</h3>
            </div>
            
            {/* 3-dot Menu Button */}
            <button 
              onClick={() => setActiveMenu(activeMenu === folder.id ? null : folder.id)}
              className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <MoreVertical size={18} />
            </button>

            {/* Dropdown Menu */}
            {activeMenu === folder.id && (
              <div className="absolute top-8 right-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-10 overflow-hidden">
                <button onClick={() => openRandomFromFolder(folder.id)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 dark:text-gray-200">
                  <Shuffle size={16} className="text-green-500" /> র‍্যান্ডম লিংক ওপেন
                </button>
                <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                <button onClick={() => togglePin(folder.id, folder.isPinned)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 dark:text-gray-200">
                  <Pin size={16} className={folder.isPinned ? "text-blue-500" : ""} /> {folder.isPinned ? 'আনপিন করুন' : 'পিন করুন'}
                </button>
                <button onClick={() => { setRenameModal({id: folder.id, name: folder.name}); setActiveMenu(null); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 dark:text-gray-200">
                  <Edit2 size={16} /> রিনেম করুন
                </button>
                <button onClick={() => { setLockModal({id: folder.id, isLocked: folder.isLocked}); setActiveMenu(null); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 dark:text-gray-200">
                  {folder.isLocked ? <Unlock size={16} /> : <Lock size={16} />} {folder.isLocked ? 'আনলক করুন' : 'লক করুন'}
                </button>
                <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                <button onClick={() => moveToTrash(folder.id)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 flex items-center gap-2">
                  <Trash2 size={16} /> ডিলিট করুন
                </button>
              </div>
            )}

            {folder.isPinned && <div className="absolute top-2 left-2 text-blue-500"><Pin size={14} fill="currentColor" /></div>}
          </div>
        ))}
        {folders.length === 0 && !showCreate && (
          <div className="col-span-full text-center py-12 text-gray-400">
            <Folder size={48} className="mx-auto mb-4 opacity-20" />
            <p>কোনো ফোল্ডার নেই। নতুন ফোল্ডার তৈরি করুন।</p>
          </div>
        )}
      </div>

      {/* Rename Modal */}
      {renameModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-4 dark:text-white">ফোল্ডারের নাম পরিবর্তন</h3>
            <form onSubmit={handleRename}>
              <input 
                type="text" 
                value={renameModal.name} 
                onChange={e => setRenameModal({...renameModal, name: e.target.value})}
                className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white mb-4 outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setRenameModal(null)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">বাতিল</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">সেভ করুন</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lock/Unlock Modal */}
      {lockModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-4 dark:text-white">{lockModal.isLocked ? 'ফোল্ডার আনলক করুন' : 'ফোল্ডার লক করুন'}</h3>
            <p className="text-sm text-gray-500 mb-4">৬ ডিজিটের পিন নম্বর দিন।</p>
            <form onSubmit={handleLockToggle}>
              <input 
                type="password" 
                maxLength={6}
                value={pinInput} 
                onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white mb-4 outline-none focus:ring-2 focus:ring-blue-500 text-center tracking-widest text-xl font-mono"
                placeholder="••••••"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => {setLockModal(null); setPinInput('');}} className="px-4 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">বাতিল</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">নিশ্চিত করুন</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-xl font-bold mb-2 dark:text-white">ফোল্ডার ডিলিট</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">ফোল্ডারটি রিসাইকেল বিনে পাঠাতে চান? (৩০ দিন পর মুছে যাবে)</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteConfirm(null)}
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
