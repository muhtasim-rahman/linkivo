import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import appInfo from '../data/appInfo.json';
import { LogOut, Moon, Sun, Download, Upload, Shield, X, FileJson, FileText, FileCode, Printer, Bookmark } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  
  const [folders, setFolders] = useState<any[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState('json');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchFolders = async () => {
      const q = query(collection(db, 'folders'), where('uid', '==', user.uid), where('deletedAt', '==', null));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFolders(data);
    };
    fetchFolders();
  }, [user]);

  const handleExportClick = () => {
    setSelectedFolders(folders.map(f => f.id)); // Select all by default
    setShowExportModal(true);
  };

  const toggleFolderSelection = (id: string) => {
    if (selectedFolders.includes(id)) {
      setSelectedFolders(selectedFolders.filter(f => f !== id));
    } else {
      setSelectedFolders([...selectedFolders, id]);
    }
  };

  const executeExport = async () => {
    if (selectedFolders.length === 0) {
      toast.error('অন্তত একটি ফোল্ডার নির্বাচন করুন');
      return;
    }
    
    setIsExporting(true);
    try {
      let exportData: any = { folders: [], links: [] };
      
      // Fetch selected folders
      const selectedFolderData = folders.filter(f => selectedFolders.includes(f.id));
      exportData.folders = selectedFolderData;

      // Fetch links for selected folders
      for (const folder of selectedFolderData) {
        const q = query(collection(db, 'links'), where('folderId', '==', folder.id), where('deletedAt', '==', null));
        const snapshot = await getDocs(q);
        snapshot.docs.forEach(doc => {
          exportData.links.push({ id: doc.id, ...doc.data() });
        });
      }

      if (exportFormat === 'json') {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href",     dataStr);
        downloadAnchorNode.setAttribute("download", "linkivo_export.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        toast.success('JSON এক্সপোর্ট সফল হয়েছে!');
      } else if (exportFormat === 'csv') {
        let csvContent = "data:text/csv;charset=utf-8,Folder,Title,URL,Status,Points\n";
        exportData.links.forEach((link: any) => {
          const folderName = exportData.folders.find((f:any) => f.id === link.folderId)?.name || 'Unknown';
          csvContent += `"${folderName}","${link.title}","${link.url}","${link.status}","${link.points}"\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "linkivo_export.csv");
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success('CSV এক্সপোর্ট সফল হয়েছে!');
      } else if (exportFormat === 'print') {
        window.print();
        toast.success('প্রিন্ট ডায়ালগ ওপেন করা হয়েছে');
      } else {
        toast.error(`${exportFormat.toUpperCase()} ফরম্যাটটি এখনো সম্পূর্ণ প্রস্তুত নয়। JSON বা CSV ব্যবহার করুন।`);
      }
      
      setShowExportModal(false);
    } catch (error) {
      toast.error('এক্সপোর্ট করতে সমস্যা হয়েছে');
    }
    setIsExporting(false);
  };

  const handleImport = () => {
    // Mock import for now
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.csv';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        toast.success(`${file.name} ইমপোর্ট করা হচ্ছে... (শীঘ্রই আসছে)`);
      }
    };
    input.click();
  };

  return (
    <div className="pb-20 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 dark:text-white">সেটিংস</h1>

      {/* App Install Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-2xl p-6 text-white mb-6 flex items-center justify-between shadow-lg">
        <div>
          <h3 className="font-bold text-lg mb-1">Linkivo অ্যাপ ইনস্টল করুন</h3>
          <p className="text-blue-100 text-sm">অফলাইনে ব্যবহারের জন্য এবং দ্রুত অ্যাক্সেস পেতে</p>
        </div>
        <button className="bg-white text-blue-600 px-4 py-2 rounded-xl font-bold text-sm shadow-sm hover:bg-blue-50">
          ইনস্টল
        </button>
      </div>

      {/* Profile Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 mb-6 flex items-center gap-4">
        <img src={user?.photoURL || `https://ui-avatars.com/api/?name=${user?.email}`} alt="Profile" className="w-16 h-16 rounded-full border-2 border-gray-100 dark:border-gray-700" />
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg dark:text-white truncate">{user?.displayName || 'ব্যবহারকারী'}</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm truncate">{user?.email}</p>
        </div>
        <button onClick={signOut} className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors shrink-0">
          <LogOut size={20} />
        </button>
      </div>

      {/* Options List */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-6">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300">
              {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
            </div>
            <span className="font-medium dark:text-white">ডার্ক মোড</span>
          </div>
          <button 
            onClick={toggleTheme}
            className={`w-12 h-6 rounded-full relative transition-colors ${theme === 'dark' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <button onClick={handleExportClick} className="w-full p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left">
          <div className="p-2 bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 rounded-lg">
            <Download size={20} />
          </div>
          <div className="flex-1">
            <span className="font-medium block dark:text-white">ডাটা এক্সপোর্ট</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">JSON, CSV, PDF বা বুকমার্ক ফরম্যাটে সেভ করুন</span>
          </div>
        </button>

        <button onClick={handleImport} className="w-full p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left">
          <div className="p-2 bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 rounded-lg">
            <Upload size={20} />
          </div>
          <div className="flex-1">
            <span className="font-medium block dark:text-white">ডাটা ইমপোর্ট</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">আগের ডাটা রিস্টোর করুন (JSON, CSV)</span>
          </div>
        </button>

        <div className="p-4 flex items-center gap-3 text-left">
          <div className="p-2 bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 rounded-lg">
            <Shield size={20} />
          </div>
          <div className="flex-1">
            <span className="font-medium block dark:text-white">সিকিউরিটি পিন</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">ফোল্ডার লক করার জন্য পিন সেট করুন</span>
          </div>
        </div>
      </div>

      {/* App Info */}
      <div className="text-center text-sm text-gray-500 p-6">
        <img src={theme === 'dark' ? '/src/assets/logo-dark.svg' : '/src/assets/logo-light.svg'} alt="Linkivo" className="h-8 mx-auto mb-4 opacity-50" />
        <p className="font-bold text-gray-700 dark:text-gray-300">{appInfo.name} {appInfo.version}</p>
        <p className="mt-1">{appInfo.tagline}</p>
        <p className="mt-4 text-xs">{appInfo.copyright}</p>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold dark:text-white">ডাটা এক্সপোর্ট</h3>
              <button onClick={() => setShowExportModal(false)} className="text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded-lg">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 mb-4 space-y-4">
              <div>
                <h4 className="font-medium mb-2 dark:text-gray-300">ফোল্ডার নির্বাচন করুন</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl p-2">
                  <label className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedFolders.length === folders.length && folders.length > 0}
                      onChange={(e) => setSelectedFolders(e.target.checked ? folders.map(f => f.id) : [])}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium dark:text-white">সবগুলো নির্বাচন করুন</span>
                  </label>
                  <hr className="border-gray-100 dark:border-gray-700 my-1" />
                  {folders.map(folder => (
                    <label key={folder.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={selectedFolders.includes(folder.id)}
                        onChange={() => toggleFolderSelection(folder.id)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="dark:text-gray-300">{folder.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2 dark:text-gray-300">ফরম্যাট নির্বাচন করুন</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setExportFormat('json')} className={`flex flex-col items-center justify-center p-3 rounded-xl border ${exportFormat==='json'?'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600':'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    <FileJson size={24} className="mb-1" />
                    <span className="text-sm font-medium">JSON</span>
                  </button>
                  <button onClick={() => setExportFormat('csv')} className={`flex flex-col items-center justify-center p-3 rounded-xl border ${exportFormat==='csv'?'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600':'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    <FileText size={24} className="mb-1" />
                    <span className="text-sm font-medium">CSV</span>
                  </button>
                  <button onClick={() => setExportFormat('pdf')} className={`flex flex-col items-center justify-center p-3 rounded-xl border ${exportFormat==='pdf'?'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600':'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    <FileCode size={24} className="mb-1" />
                    <span className="text-sm font-medium">PDF</span>
                  </button>
                  <button onClick={() => setExportFormat('bookmark')} className={`flex flex-col items-center justify-center p-3 rounded-xl border ${exportFormat==='bookmark'?'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600':'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    <Bookmark size={24} className="mb-1" />
                    <span className="text-sm font-medium">Bookmark</span>
                  </button>
                  <button onClick={() => setExportFormat('print')} className={`col-span-2 flex flex-col items-center justify-center p-3 rounded-xl border ${exportFormat==='print'?'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600':'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    <Printer size={24} className="mb-1" />
                    <span className="text-sm font-medium">Print</span>
                  </button>
                </div>
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-800">
                <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-1">সামারি:</h4>
                <p className="text-sm text-blue-600 dark:text-blue-400">আপনি {selectedFolders.length} টি ফোল্ডার {exportFormat.toUpperCase()} ফরম্যাটে এক্সপোর্ট করতে যাচ্ছেন।</p>
              </div>
            </div>

            <button 
              onClick={executeExport}
              disabled={isExporting || selectedFolders.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isExporting ? 'এক্সপোর্ট হচ্ছে...' : <><Download size={20} /> এক্সপোর্ট করুন</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
