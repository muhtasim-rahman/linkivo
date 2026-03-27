import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import appInfo from '../data/appInfo.json';
import { LogOut, Moon, Sun, Download, Upload, Info, Shield, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const handleExport = () => {
    toast.success('এক্সপোর্ট ফিচারটি শীঘ্রই আসছে!');
  };

  const handleImport = () => {
    toast.success('ইমপোর্ট ফিচারটি শীঘ্রই আসছে!');
  };

  return (
    <div className="pb-20 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">সেটিংস</h1>

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
        <div className="flex-1">
          <h2 className="font-bold text-lg">{user?.displayName || 'ব্যবহারকারী'}</h2>
          <p className="text-gray-500 text-sm">{user?.email}</p>
        </div>
        <button onClick={signOut} className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors">
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
            <span className="font-medium">ডার্ক মোড</span>
          </div>
          <button 
            onClick={toggleTheme}
            className={`w-12 h-6 rounded-full relative transition-colors ${theme === 'dark' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <button onClick={handleExport} className="w-full p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left">
          <div className="p-2 bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 rounded-lg">
            <Download size={20} />
          </div>
          <div className="flex-1">
            <span className="font-medium block">ডাটা এক্সপোর্ট</span>
            <span className="text-xs text-gray-500">JSON বা CSV ফরম্যাটে সেভ করুন</span>
          </div>
        </button>

        <button onClick={handleImport} className="w-full p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left">
          <div className="p-2 bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 rounded-lg">
            <Upload size={20} />
          </div>
          <div className="flex-1">
            <span className="font-medium block">ডাটা ইমপোর্ট</span>
            <span className="text-xs text-gray-500">আগের ডাটা রিস্টোর করুন</span>
          </div>
        </button>

        <div className="p-4 flex items-center gap-3 text-left">
          <div className="p-2 bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 rounded-lg">
            <Shield size={20} />
          </div>
          <div className="flex-1">
            <span className="font-medium block">সিকিউরিটি পিন</span>
            <span className="text-xs text-gray-500">ফোল্ডার লক করার জন্য পিন সেট করুন</span>
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
    </div>
  );
}
