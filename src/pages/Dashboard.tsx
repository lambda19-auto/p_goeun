import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  MessageSquare, 
  TrendingUp, 
  Clock, 
  Users, 
  BarChart3, 
  ChevronDown 
} from 'lucide-react';
import { cn } from '../lib/utils';

interface Template {
  id: string;
  title: string;
}

interface DashboardProps {
  templates: Template[];
}

export const Dashboard: React.FC<DashboardProps> = ({ templates }) => {
  const [dashboardFilter, setDashboardFilter] = useState<string>('all');

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-8 max-w-7xl mx-auto space-y-8"
    >
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black mb-2">Дэшборд</h2>
          <p className="text-zinc-400">Обзор активности вашего колл-центра за последние 30 дней.</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <select 
              value={dashboardFilter}
              onChange={(e) => setDashboardFilter(e.target.value)}
              className="bg-zinc-900 px-4 py-2 pr-10 rounded-xl border border-zinc-800 text-sm font-bold text-zinc-400 appearance-none focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">Все шаблоны</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500" />
          </div>
          <div className="bg-zinc-900 px-4 py-2 rounded-xl border border-zinc-800 text-sm font-bold text-zinc-400">
            Февраль 2026
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Всего звонков', value: '1,284', icon: MessageSquare, color: 'text-indigo-400' },
          { label: 'Средний балл', value: '7.8', icon: TrendingUp, color: 'text-emerald-400' },
          { label: 'Время анализа', value: '12ч 40м', icon: Clock, color: 'text-amber-400' },
          { label: 'Активных агентов', value: '24', icon: Users, color: 'text-rose-400' },
        ].map((stat, i) => (
          <div key={i} className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800 shadow-sm">
            <stat.icon className={cn(stat.color, "mb-4")} size={24} />
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">{stat.label}</p>
            <p className="text-3xl font-black">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 p-8 rounded-3xl border border-zinc-800 h-80 flex flex-col items-center justify-center text-center">
          <BarChart3 className="text-zinc-700 mb-4" size={48} />
          <p className="text-zinc-500 font-bold">График динамики качества</p>
          <p className="text-xs text-zinc-600 mt-2">Здесь будет визуализация данных Recharts</p>
        </div>
        <div className="bg-zinc-900 p-8 rounded-3xl border border-zinc-800 h-80 flex flex-col items-center justify-center text-center">
          <TrendingUp className="text-zinc-700 mb-4" size={48} />
          <p className="text-zinc-500 font-bold">Топ проблемных зон</p>
          <p className="text-xs text-zinc-600 mt-2">Анализ стоп-слов и возражений</p>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden">
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
          <h3 className="font-bold text-lg">Рейтинг сотрудников</h3>
          <button className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors">Весь список</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-800">
                <th className="px-6 py-4">Сотрудник</th>
                <th className="px-6 py-4">Звонков</th>
                <th className="px-6 py-4">Ср. балл</th>
                <th className="px-6 py-4">Динамика</th>
                <th className="px-6 py-4">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {[
                { name: 'Александр Петров', calls: 142, score: 8.4, trend: '+0.2', status: 'Top Performer' },
                { name: 'Мария Сидорова', calls: 128, score: 8.1, trend: '+0.5', status: 'Improving' },
                { name: 'Иван Иванов', calls: 156, score: 7.6, trend: '-0.1', status: 'Stable' },
                { name: 'Елена Кузнецова', calls: 94, score: 7.2, trend: '+0.3', status: 'Stable' },
                { name: 'Дмитрий Волков', calls: 112, score: 6.8, trend: '-0.4', status: 'Needs Coaching' },
              ].map((agent, i) => (
                <tr key={i} className="hover:bg-zinc-800/50 transition-colors group cursor-pointer">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        {agent.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="font-bold text-sm">{agent.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-zinc-400">{agent.calls}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{agent.score}</span>
                      <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", agent.score >= 8 ? "bg-emerald-500" : agent.score >= 7 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${agent.score * 10}%` }}></div>
                      </div>
                    </div>
                  </td>
                  <td className={cn("px-6 py-4 text-sm font-bold", agent.trend.startsWith('+') ? "text-emerald-400" : "text-rose-400")}>
                    {agent.trend}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                      agent.status === 'Top Performer' ? "bg-emerald-950/30 text-emerald-400" :
                      agent.status === 'Improving' ? "bg-indigo-950/30 text-indigo-400" :
                      agent.status === 'Needs Coaching' ? "bg-rose-950/30 text-rose-400" :
                      "bg-zinc-800 text-zinc-500"
                    )}>
                      {agent.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};
