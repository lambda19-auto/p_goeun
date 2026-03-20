import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  BarChart3, 
  LayoutDashboard, 
  Search, 
  Layout, 
  User 
} from 'lucide-react';
import { cn } from '../lib/utils';

const navItems = [
  { id: 'dashboard', label: 'Дэшборд', icon: LayoutDashboard, path: '/' },
  { id: 'auditor', label: 'Аудитор', icon: Search, path: '/auditor' },
  { id: 'templates', label: 'Шаблоны', icon: Layout, path: '/templates' },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0">
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-900/20">
          <BarChart3 size={24} />
        </div>
        <span className="text-xl font-bold tracking-tight text-zinc-100">Auditor AI</span>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {navItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) => cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
              isActive 
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20" 
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            )}
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-zinc-800">
        <NavLink
          to="/profile"
          className={({ isActive }) => cn(
            "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
            isActive 
              ? "bg-zinc-800 text-white" 
              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
          )}
        >
          <User size={20} />
          Профиль
        </NavLink>
      </div>
    </aside>
  );
};
