import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { extractLinks } from '../lib/linkExtractor';
import { Upload, Link as LinkIcon, MoreVertical, ArrowLeft, LayoutGrid, List as ListIcon, Heart, ThumbsUp, ThumbsDown, Trash2, Ban } from 'lucide-react';
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

  useEffect(() => {
    if (!id || !user) return;
    getDoc(doc(db, 'folders', id)).then(d => {
      if(d.exists()) setFolder({ id: d.id, ...d.data() });
    });

    const q = query(collection(db, 'links'), where('folderId', '==', id), where('deletedAt', '==', null));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLinks(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsubscribe;
  }, [id, user]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user || !id) return;
    
    setUploading(true);
    let totalLinks = 0;
    
    for (let i = 0; i < files.length; i++) {
      const extracted = await extractLinks(files[i]);
      for (const url of extracted) {
        // Check duplicate in this folder
        const exists = links.some(l => l.url === url);
        if (!exists) {
          await addDoc(collection(db, 'links'), {
            uid: user.uid,
            folderId: id,
            url,
            title: url.split('/')[2] || 'Unknown Site',
            status: 'active', // active, liked, disliked, favorite, blocked
            points: 2,
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
  };

  const deleteLink = async (linkId: string) => {
    if(confirm('লিংকটি ডিলিট করতে চান?')) {
      await updateDoc(doc(db, 'links', linkId), { deletedAt: serverTimestamp() });
    }
  };

  if (!folder) return <div className="p-8 text-center">লোড হচ্ছে...</div>;

  return (
    <div className="pb-20">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 bg-white dark:bg-gray-800 rounded-full shadow-sm">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold flex-1 truncate">{folder.name}</h1>
        <div className="flex gap-2">
          <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg ${viewMode==='list'?'bg-blue-100 text-blue-600 dark:bg-blue-900/30':'bg-white dark:bg-gray-800'}`}>
            <ListIcon size={20} />
          </button>
          <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg ${viewMode==='grid'?'bg-blue-100 text-blue-600 dark:bg-blue-900/30':'bg-white dark:bg-gray-800'}`}>
            <LayoutGrid size={20} />
          </button>
        </div>
      </div>

      {/* Upload Area */}
      <div 
        onClick={() => fileInputRef.current?.click()}
        className="mb-8 border-2 border-dashed border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl p-8 text-center cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
      >
        <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileUpload} accept=".txt,.html,.json,.pdf,.zip" />
        <Upload size={32} className="mx-auto mb-3 text-blue-500" />
        <p className="font-medium text-blue-700 dark:text-blue-400">
          {uploading ? 'লিংক এক্সট্র্যাক্ট হচ্ছে...' : 'ফাইল আপলোড করুন (Text, HTML, JSON, ZIP)'}
        </p>
        <p className="text-sm text-blue-500/70 mt-1">ফাইল থেকে স্বয়ংক্রিয়ভাবে লিংক খুঁজে বের করা হবে</p>
      </div>

      {/* Links List */}
      <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'flex flex-col gap-3'}>
        {links.map(link => (
          <div key={link.id} className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 flex ${viewMode==='grid'?'flex-col':'items-center gap-4'}`}>
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center shrink-0">
              <img src={`https://www.google.com/s2/favicons?domain=${link.url}&sz=64`} alt="" className="w-6 h-6" onError={(e) => {e.currentTarget.style.display='none'}} />
              <LinkIcon size={20} className="text-gray-400 absolute -z-10" />
            </div>
            <div className={`flex-1 min-w-0 ${viewMode==='grid'?'mt-3':''}`}>
              <h3 className="font-medium truncate" title={link.title}>{link.title}</h3>
              <a href={link.url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 truncate block hover:underline">{link.url}</a>
            </div>
            
            {/* Action Buttons */}
            <div className={`flex items-center gap-1 ${viewMode==='grid'?'mt-4 justify-between border-t border-gray-100 dark:border-gray-700 pt-3':''}`}>
              <button onClick={() => updateLinkStatus(link.id, 'favorite', 10)} className={`p-1.5 rounded-lg ${link.status==='favorite'?'text-red-500 bg-red-50 dark:bg-red-900/20':'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="ফেভারিট">
                <Heart size={16} fill={link.status==='favorite'?'currentColor':'none'} />
              </button>
              <button onClick={() => updateLinkStatus(link.id, 'liked', 5)} className={`p-1.5 rounded-lg ${link.status==='liked'?'text-blue-500 bg-blue-50 dark:bg-blue-900/20':'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="লাইক">
                <ThumbsUp size={16} fill={link.status==='liked'?'currentColor':'none'} />
              </button>
              <button onClick={() => updateLinkStatus(link.id, 'disliked', 1)} className={`p-1.5 rounded-lg ${link.status==='disliked'?'text-orange-500 bg-orange-50 dark:bg-orange-900/20':'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="ডিসলাইক">
                <ThumbsDown size={16} fill={link.status==='disliked'?'currentColor':'none'} />
              </button>
              <button onClick={() => updateLinkStatus(link.id, 'blocked', 0)} className={`p-1.5 rounded-lg ${link.status==='blocked'?'text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-gray-600':'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`} title="ব্লক">
                <Ban size={16} />
              </button>
              <button onClick={() => deleteLink(link.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 ml-auto" title="ডিলিট">
                <Trash2 size={16} />
              </button>
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
    </div>
  );
}
