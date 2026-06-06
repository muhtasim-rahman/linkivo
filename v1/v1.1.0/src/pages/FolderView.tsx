import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { extractLinks } from '../lib/linkExtractor';
import { Upload, Link as LinkIcon, MoreVertical, ArrowLeft, LayoutGrid, List as ListIcon, Heart, ThumbsUp, ThumbsDown, Trash2, Ban, Pin, CheckSquare, Square, SortDesc } from 'lucide-react';
import toast from 'react-hot-toast';

export default function FolderView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [folder, setFolder] = useState<any>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'grid'|'list'>('list');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  
  // New states for sorting and selection
  const [sortBy, setSortBy] = useState<'date'|'name'|'points'>('date');
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<{type: 'single' | 'bulk', id?: string} | null>(null);

  useEffect(() => {
    if (!id || !user) return;
    getDoc(doc(db, 'folders', id)).then(d => {
      if(d.exists()) setFolder({ id: d.id, ...d.data() });
    });

    const q = query(collection(db, 'links'), where('folderId', '==', id), where('deletedAt', '==', null));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Sorting logic
      data.sort((a: any, b: any) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        
        if (sortBy === 'date') {
          return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
        } else if (sortBy === 'name') {
          return (a.title || '').localeCompare(b.title || '');
        } else if (sortBy === 'points') {
          return (b.points || 0) - (a.points || 0);
        }
        return 0;
      });
      
      setLinks(data);
    });
    return unsubscribe;
  }, [id, user, sortBy]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user || !id) return;
    
    setUploading(true);
    let totalLinks = 0;
    
    for (let i = 0; i < files.length; i++) {
      const extracted = await extractLinks(files[i]);
      for (const url of extracted) {
        const exists = links.some(l => l.url === url);
        if (!exists) {
          await addDoc(collection(db, 'links'), {
            uid: user.uid,
            folderId: id,
            url,
            title: url.split('/')[2] || 'Unknown Site',
            status: 'active',
            points: 2,
            isPinned: false,
            createdAt: serverTimestamp(),
            deletedAt: null
          });
          totalLinks++;
        }
      }
    }
    setUploading(false);
    toast.success(`${totalLinks} টি নতুন লিংক যোগ করা হয়েছে!`);
    if(fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateLinkStatus = async (linkId: string, status: string, points: number) => {
    await updateDoc(doc(db, 'links', linkId), { status, points });
    toast.success('স্ট্যাটাস আপডেট হয়েছে');
    setActiveMenu(null);
  };

  const togglePin = async (linkId: string, current: boolean) => {
    await updateDoc(doc(db, 'links', linkId), { isPinned: !current });
    setActiveMenu(null);
  };

  const deleteLink = async (linkId: string) => {
    setDeleteConfirm({ type: 'single', id: linkId });
    setActiveMenu(null);
  };

  const toggleSelection = (linkId: string) => {
    const newSet = new Set(selectedLinks);
    if (newSet.has(linkId)) {
      newSet.delete(linkId);
    } else {
      newSet.add(linkId);
    }
    setSelectedLinks(newSet);
    if (newSet.size === 0) setIsSelectionMode(false);
  };

  const handleBulkDelete = async () => {
    setDeleteConfirm({ type: 'bulk' });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    
    if (deleteConfirm.type === 'single' && deleteConfirm.id) {
      await updateDoc(doc(db, 'links', deleteConfirm.id), { deletedAt: serverTimestamp() });
      toast.success('লিংক ডিলিট করা হয়েছে');
    } else if (deleteConfirm.type === 'bulk') {
      for (const linkId of selectedLinks) {
        await updateDoc(doc(db, 'links', linkId), { deletedAt: serverTimestamp() });
      }
      toast.success('লিংকগুলো ডিলিট করা হয়েছে');
      setSelectedLinks(new Set());
      setIsSelectionMode(false);
    }
    setDeleteConfirm(null);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toLocaleDateString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  if (!folder) return <div className="p-8 text-center dark:text-white">লোড হচ্ছে...</div>;

  return (
    <div className="pb-20">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 bg-white dark:bg-gray-800 rounded-full shadow-sm dark:text-white">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold flex-1 truncate dark:text-white">{folder.name}</h1>
        
        {/* Sort Dropdown */}
        <div className="relative group">
          <button className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm flex items-center gap-2 dark:text-white">
            <SortDesc size={20} />
          </button>
          <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
            <button onClick={() => setSortBy('date')} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${sortBy==='date'?'text-blue-600 font-medium':'dark:text-gray-200'}`}>তারিখ অনুযায়ী</button>
            <button onClick={() => setSortBy('name')} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${sortBy==='name'?'text-blue-600 font-medium':'dark:text-gray-200'}`}>নাম অনুযায়ী</button>
            <button onClick={() => setSortBy('points')} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${sortBy==='points'?'text-blue-600 font-medium':'dark:text-gray-200'}`}>পয়েন্ট অনুযায়ী</button>
          </div>
        </div>

        <div className="flex gap-2 bg-white dark:bg-gray-800 p-1 rounded-lg shadow-sm">
          <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md ${viewMode==='list'?'bg-blue-100 text-blue-600 dark:bg-blue-900/50':'text-gray-500 dark:text-gray-400'}`}>
            <ListIcon size={18} />
          </button>
          <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md ${viewMode==='grid'?'bg-blue-100 text-blue-600 dark:bg-blue-900/50':'text-gray-500 dark:text-gray-400'}`}>
            <LayoutGrid size={18} />
          </button>
        </div>
      </div>

      {/* Upload Area */}
      <div 
        onClick={() => fileInputRef.current?.click()}
        className="mb-6 border-2 border-dashed border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl p-6 text-center cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
      >
        <input type="file" multiple className="hidden" ref={fileInputRef} accept=".txt,.html,.json,.pdf,.zip" />
        <Upload size={28} className="mx-auto mb-2 text-blue-500" />
        <p className="font-medium text-blue-700 dark:text-blue-400">
          {uploading ? 'লিংক এক্সট্র্যাক্ট হচ্ছে...' : 'ফাইল আপলোড করুন (Text, HTML, JSON, ZIP)'}
        </p>
      </div>

      {/* Bulk Actions */}
      {isSelectionMode && (
        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl mb-4 border border-blue-100 dark:border-blue-800">
          <span className="text-blue-700 dark:text-blue-300 font-medium px-2">{selectedLinks.size} টি নির্বাচিত</span>
          <div className="flex gap-2">
            <button onClick={() => {setSelectedLinks(new Set()); setIsSelectionMode(false);}} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 rounded-lg">বাতিল</button>
            <button onClick={handleBulkDelete} className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-1"><Trash2 size={14}/> ডিলিট</button>
          </div>
        </div>
      )}

      {/* Links List */}
      <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'flex flex-col gap-3'}>
        {links.map(link => (
          <div 
            key={link.id} 
            className={`group relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border ${selectedLinks.has(link.id) ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-100 dark:border-gray-700'} p-3 flex ${viewMode==='grid'?'flex-col':'items-center gap-4'} transition-all`}
          >
            {/* Selection Checkbox */}
            <div 
              className={`absolute top-3 left-3 z-10 cursor-pointer text-gray-400 hover:text-blue-500 ${isSelectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
              onClick={(e) => { e.stopPropagation(); setIsSelectionMode(true); toggleSelection(link.id); }}
            >
              {selectedLinks.has(link.id) ? <CheckSquare className="text-blue-500" size={20} /> : <Square size={20} />}
            </div>

            {/* Thumbnail */}
            <div className={`shrink-0 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center overflow-hidden ${viewMode==='grid'?'w-full h-32 mb-3':'w-16 h-16'} ${isSelectionMode ? 'ml-6' : ''}`}>
              <img 
                src={`https://www.google.com/s2/favicons?domain=${link.url}&sz=128`} 
                alt="" 
                className={viewMode==='grid' ? 'w-16 h-16 object-contain opacity-80' : 'w-8 h-8 object-contain opacity-80'} 
                onError={(e) => {e.currentTarget.style.display='none'}} 
              />
              <LinkIcon size={24} className="text-gray-300 dark:text-gray-600 absolute -z-10" />
            </div>

            {/* Content */}
            <div className={`flex-1 min-w-0 flex flex-col justify-center ${viewMode==='grid'?'w-full':''}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-gray-900 dark:text-white truncate" title={link.title}>
                  {link.isPinned && <Pin size={12} className="inline text-blue-500 mr-1" fill="currentColor" />}
                  {link.title}
                </h3>
                
                {/* 3-dot Menu */}
                <div className="relative">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === link.id ? null : link.id); }}
                    className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <MoreVertical size={18} />
                  </button>
                  
                  {activeMenu === link.id && (
                    <div className="absolute right-0 top-8 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-20 overflow-hidden">
                      <button onClick={() => togglePin(link.id, link.isPinned)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 dark:text-gray-200">
                        <Pin size={16} className={link.isPinned ? "text-blue-500" : ""} /> {link.isPinned ? 'আনপিন করুন' : 'পিন করুন'}
                      </button>
                      <button onClick={() => updateLinkStatus(link.id, 'favorite', 10)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 dark:text-gray-200">
                        <Heart size={16} className={link.status==='favorite' ? "text-red-500" : ""} /> ফেভারিট
                      </button>
                      <button onClick={() => updateLinkStatus(link.id, 'liked', 5)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 dark:text-gray-200">
                        <ThumbsUp size={16} className={link.status==='liked' ? "text-blue-500" : ""} /> লাইক
                      </button>
                      <button onClick={() => updateLinkStatus(link.id, 'disliked', 1)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 dark:text-gray-200">
                        <ThumbsDown size={16} className={link.status==='disliked' ? "text-orange-500" : ""} /> ডিসলাইক
                      </button>
                      <button onClick={() => updateLinkStatus(link.id, 'blocked', 0)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 dark:text-gray-200">
                        <Ban size={16} className={link.status==='blocked' ? "text-gray-800 dark:text-gray-400" : ""} /> ব্লক
                      </button>
                      <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                      <button onClick={() => deleteLink(link.id)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 flex items-center gap-2">
                        <Trash2 size={16} /> ডিলিট করুন
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              <a href={link.url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 truncate block hover:underline mt-0.5 mb-1">{link.url}</a>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-auto">
                যোগ করা হয়েছে: {formatDate(link.createdAt)}
              </div>
            </div>
          </div>
        ))}
        {links.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-400">
            <LinkIcon size={48} className="mx-auto mb-4 opacity-20" />
            <p>এই ফোল্ডারে কোনো লিংক নেই।</p>
          </div>
        )}
      </div>
      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-xl font-bold mb-2 dark:text-white">লিংক ডিলিট</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {deleteConfirm.type === 'bulk' 
                ? `নির্বাচিত ${selectedLinks.size} টি লিংক ডিলিট করতে চান?` 
                : 'লিংকটি ডিলিট করতে চান?'}
            </p>
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
