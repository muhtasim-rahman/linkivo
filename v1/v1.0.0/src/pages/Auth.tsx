import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import logoLight from '../assets/logo-light.svg';
import logoDark from '../assets/logo-dark.svg';
import appInfo from '../data/appInfo.json';
import toast from 'react-hot-toast';

export default function AuthPage() {
  const { user, signInWithGoogle } = useAuth();

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error("Auth Error:", error);
      if (error.code === 'auth/configuration-not-found') {
        toast.error('Firebase Console-এ Google Authentication চালু করা নেই। দয়া করে Firebase Console -> Authentication -> Sign-in method থেকে Google Provider চালু করুন।', { duration: 6000 });
      } else {
        toast.error('লগইন করতে সমস্যা হয়েছে: ' + error.message);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-gray-100 dark:border-gray-700">
        <img src={logoLight} alt="Linkivo" className="h-12 mx-auto mb-6 dark:hidden" />
        <img src={logoDark} alt="Linkivo" className="h-12 mx-auto mb-6 hidden dark:block" />
        
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">স্বাগতম!</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">{appInfo.tagline}</p>

        <button
          onClick={handleSignIn}
          className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-700 text-gray-700 dark:text-white border border-gray-300 dark:border-gray-600 rounded-xl px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium shadow-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google দিয়ে লগইন করুন
        </button>
      </div>
      <p className="mt-8 text-sm text-gray-400">{appInfo.version} | {appInfo.copyright}</p>
    </div>
  );
}
