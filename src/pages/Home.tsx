import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Folder, Plus, MoreVertical, Lock, Trash2, Edit2, Pin } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Home() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'folders'), where('uid', '==', user.uid), where('deletedAt', '==', null));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort pinned first, then by date
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
  };

  const moveToTrash = async (id: string) => {
    if(confirm('ফোল্ডারটি রিসাইকেল বিনে পাঠাতে চান?')) {
      await updateDoc(doc(db, 'folders', id), { deletedAt: serverTimestamp() });
      toast.success('রিসাইকেল বিনে পাঠানো হয়েছে');
    }
  };

  return (
    <div className="pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">আমার ফোল্ডারসমূহ</h1>
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
            className="flex-1 bg-transparent border-none focus:ring-0 px-2 outline-none"
            autoFocus
          />
          <button type="submit" className="text-blue-600 font-medium px-4">তৈরি করুন</button>
          <button type="button" onClick={() => setShowCreate(false)} className="text-gray-400 px-2">বাতিল</button>
        </form>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {folders.map(folder => (
          <div key={folder.id} className="relative group bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
            <Link to={`/folder/${folder.id}`} className="block text-center">
              <div className="mx-auto w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mb-3 text-blue-500">
                {folder.isLocked ? <Lock size={32} /> : <Folder size={32} />}
              </div>
              <h3 className="font-medium truncate px-2">{folder.name}</h3>
            </Link>
            
            {/* Quick Actions */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
              <button onClick={() => togglePin(folder.id, folder.isPinned)} className={`p-1.5 rounded-full bg-white dark:bg-gray-700 shadow-sm ${folder.isPinned ? 'text-blue-500' : 'text-gray-400'}`}>
                <Pin size={14} />
              </button>
              <button onClick={() => moveToTrash(folder.id)} className="p-1.5 rounded-full bg-white dark:bg-gray-700 shadow-sm text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
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
    </div>
  );
}
