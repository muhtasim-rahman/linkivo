import { Outlet, NavLink } from 'react-router-dom';
import { Home, Folder, Shuffle, History, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';
import logoLight from '../../assets/logo-light.svg';
import logoDark from '../../assets/logo-dark.svg';

const navItems = [
  { icon: Home, label: 'হোম', path: '/' },
  { icon: Folder, label: 'ফোল্ডার', path: '/folders' },
  { icon: Shuffle, label: 'র‍্যান্ডম', path: '/random' },
  { icon: History, label: 'হিস্ট্রি', path: '/history' },
  { icon: Settings, label: 'সেটিংস', path: '/settings' },
];

export default function MainLayout() {
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* Sidebar for PC */}
      <aside className="hidden md:flex flex-col w-64 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="p-6 flex items-center gap-2">
          <img src={logoLight} alt="Linkivo" className="h-8 w-auto object-contain dark:hidden" />
          <img src={logoDark} alt="Linkivo" className="h-8 w-auto object-contain hidden dark:block" />
        </div>
        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-colors",
                  isActive 
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 font-medium" 
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                )
              }
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0 relative">
        <div className="md:hidden p-4 flex justify-center items-center border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 sticky top-0 z-10">
          <img src={logoLight} alt="Linkivo" className="h-6 w-auto object-contain dark:hidden" />
          <img src={logoDark} alt="Linkivo" className="h-6 w-auto object-contain hidden dark:block" />
        </div>
        <div className="p-4 md:p-8 max-w-5xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Bottom Nav for Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 flex justify-around p-2 pb-safe z-50">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center p-2 rounded-lg min-w-[64px]",
                isActive 
                  ? "text-blue-600 dark:text-blue-400" 
                  : "text-gray-500 dark:text-gray-400"
              )
            }
          >
            <item.icon size={24} className="mb-1" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
