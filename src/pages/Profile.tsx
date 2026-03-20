import React from 'react';
import { motion } from 'motion/react';
import { 
  User, 
  CreditCard, 
  Settings, 
  ChevronRight, 
  LogOut 
} from 'lucide-react';

export const Profile: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-8 max-w-3xl mx-auto space-y-8"
    >
      <h2 className="text-3xl font-black mb-8">Профиль</h2>
      
      <div className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden">
        <div className="p-8 flex items-center gap-6 border-b border-zinc-800">
          <div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-500 border-2 border-zinc-700">
            <User size={40} />
          </div>
          <div>
            <h3 className="text-xl font-bold">Константин Константинопольский</h3>
            <p className="text-zinc-500">lidofgen@gmail.com</p>
          </div>
        </div>
        
        <div className="p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-emerald-950/30 text-emerald-400 rounded-xl flex items-center justify-center">
                <CreditCard size={20} />
              </div>
              <div>
                <p className="font-bold">Подписка: Pro</p>
                <p className="text-xs text-zinc-500">Следующее списание: 28 Марта 2026</p>
              </div>
            </div>
            <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-bold transition-colors">Управлять</button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-indigo-950/30 text-indigo-400 rounded-xl flex items-center justify-center">
                <Settings size={20} />
              </div>
              <div>
                <p className="font-bold">Настройки аккаунта</p>
                <p className="text-xs text-zinc-500">Безопасность, уведомления, API</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-zinc-600" />
          </div>

          <div className="pt-4">
            <button className="w-full flex items-center justify-center gap-2 py-4 bg-rose-950/20 text-rose-400 hover:bg-rose-950/30 rounded-2xl font-bold transition-colors">
              <LogOut size={20} />
              Выйти из системы
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
