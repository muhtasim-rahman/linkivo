import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { Plus, Link as LinkIcon, FileText, Folder } from 'lucide-react';
import toast from 'react-hot-toast';
import { extractLinks, extractLinksFromText } from '../lib/linkExtractor';

export default function Home() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  // Quick Import State
  const [importText, setImportText] = useState('');
  const [selectedFolderForImport, setSelectedFolderForImport] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (data.length > 0 && !selectedFolderForImport) {
        setSelectedFolderForImport(data[0].id);
      }
    });
    return unsubscribe;
  }, [user]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const docRef = await addDoc(collection(db, 'folders'), {
        uid: user?.uid,
        name: newFolderName,
        isPinned: false,
        isLocked: false,
        createdAt: serverTimestamp(),
        deletedAt: null
      });
      setNewFolderName('');
      setShowCreate(false);
      setSelectedFolderForImport(docRef.id);
      toast.success('ফোল্ডার তৈরি হয়েছে!');
    } catch (error) {
      toast.error('ফোল্ডার তৈরি করতে সমস্যা হয়েছে।');
    }
  };

  const processExtractedLinks = async (links: string[]) => {
    if (links.length === 0) {
      toast.error('কোনো লিংক পাওয়া যায়নি!');
      setIsExtracting(false);
      return;
    }

    if (!selectedFolderForImport) {
      toast.error('দয়া করে একটি ফোল্ডার সিলেক্ট করুন বা নতুন তৈরি করুন।');
      setIsExtracting(false);
      return;
    }

    try {
      let addedCount = 0;
      for (const url of links) {
        // Check for duplicates in the selected folder
        const q = query(collection(db, 'links'), 
          where('uid', '==', user?.uid), 
          where('folderId', '==', selectedFolderForImport),
          where('url', '==', url),
          where('deletedAt', '==', null)
        );
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          await addDoc(collection(db, 'links'), {
            uid: user?.uid,
            folderId: selectedFolderForImport,
            url,
            title: url, // Default title
            status: 'active',
            points: 0,
            isPinned: false,
            createdAt: serverTimestamp(),
            deletedAt: null
          });
          addedCount++;
        }
      }
      
      if (addedCount > 0) {
        toast.success(`${addedCount} টি নতুন লিংক সেভ হয়েছে!`);
        setImportText('');
      } else {
        toast.error('সবগুলো লিংক আগে থেকেই এই ফোল্ডারে আছে।');
      }
    } catch (error) {
      console.error("Error saving links:", error);
      toast.error('লিংক সেভ করতে সমস্যা হয়েছে।');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleTextImport = async () => {
    if (!importText.trim()) return;
    setIsExtracting(true);
    const links = extractLinksFromText(importText);
    await processExtractedLinks(links);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsExtracting(true);
    toast.loading('ফাইল থেকে লিংক খোঁজা হচ্ছে...', { id: 'extracting' });
    
    try {
      const links = await extractLinks(file);
      toast.dismiss('extracting');
      await processExtractedLinks(links);
    } catch (error) {
      toast.dismiss('extracting');
      toast.error('ফাইল পড়তে সমস্যা হয়েছে।');
      setIsExtracting(false);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="pb-20 max-w-4xl mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">স্বাগতম, Linkivo তে!</h1>
        <p className="text-gray-500 dark:text-gray-400">এখানে আপনি যেকোনো টেক্সট বা ফাইল থেকে লিংক ইমপোর্ট করতে পারবেন।</p>
      </div>

      {/* Quick Import Section */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 dark:text-white">
          <LinkIcon size={24} className="text-blue-500" />
          লিংক ইমপোর্ট করুন
        </h2>
        
        <div className="space-y-6">
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="এখানে টেক্সট বা লিংক পেস্ট করুন..."
            className="w-full h-32 px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 flex gap-2">
              <select
                value={selectedFolderForImport}
                onChange={(e) => setSelectedFolderForImport(e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="" disabled>ফোল্ডার সিলেক্ট করুন</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <button 
                onClick={() => setShowCreate(!showCreate)}
                className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                title="নতুন ফোল্ডার"
              >
                <Plus size={20} />
              </button>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleTextImport}
                disabled={isExtracting || !importText.trim() || !selectedFolderForImport}
                className="flex-1 sm:flex-none px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                {isExtracting ? 'খোঁজা হচ্ছে...' : 'সেভ করুন'}
              </button>
              
              <div className="relative">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileImport}
                  className="hidden"
                  accept=".txt,.html,.json,.csv,.zip"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isExtracting || !selectedFolderForImport}
                  className="px-6 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-700 dark:text-gray-200 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                  title="ফাইল থেকে লিংক খুঁজুন"
                >
                  <FileText size={20} /> ফাইল
                </button>
              </div>
            </div>
          </div>

          {showCreate && (
            <form onSubmit={handleCreateFolder} className="mt-4 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl border border-gray-200 dark:border-gray-600 flex gap-2">
              <Folder className="text-gray-400" />
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="নতুন ফোল্ডারের নাম..."
                className="flex-1 bg-transparent border-none focus:ring-0 px-2 outline-none dark:text-white"
                autoFocus
              />
              <button type="submit" className="text-blue-600 font-medium px-4">তৈরি করুন</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
