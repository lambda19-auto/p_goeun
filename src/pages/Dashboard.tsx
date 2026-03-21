import React, { useEffect, useState } from 'react';
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
import { DashboardData, Template } from '../types';

interface DashboardProps {
  templates: Template[];
  initialDashboard: DashboardData;
  reloadData: () => Promise<void>;
}

const formatDuration = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}ч ${minutes}м`;
};

export const Dashboard: React.FC<DashboardProps> = ({ templates, initialDashboard }) => {
  const [dashboardFilter, setDashboardFilter] = useState<string>('all');
  const [dashboard, setDashboard] = useState<DashboardData>(initialDashboard);

  useEffect(() => {
    setDashboard(initialDashboard);
  }, [initialDashboard]);

  useEffect(() => {
    const controller = new AbortController();

    const loadDashboard = async () => {
      const query = dashboardFilter === 'all' ? '' : `?templateId=${dashboardFilter}`;
      const response = await fetch(`/api/bootstrap${query}`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error('Не удалось загрузить статистику.');
      }
      const data = await response.json();
      setDashboard(data.dashboard ?? initialDashboard);
    };

    void loadDashboard().catch((error) => {
      if (error.name !== 'AbortError') {
        console.error(error);
      }
    });

    return () => controller.abort();
  }, [dashboardFilter, initialDashboard]);

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
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500" />
          </div>
          <div className="bg-zinc-900 px-4 py-2 rounded-xl border border-zinc-800 text-sm font-bold text-zinc-400">
            {new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Всего звонков', value: dashboard.totalCalls.toLocaleString('ru-RU'), icon: MessageSquare, color: 'text-indigo-400' },
          { label: 'Средний балл', value: dashboard.averageScore.toFixed(1), icon: TrendingUp, color: 'text-emerald-400' },
          { label: 'Время анализа', value: formatDuration(dashboard.totalDurationSeconds), icon: Clock, color: 'text-amber-400' },
          { label: 'Активных шаблонов', value: dashboard.activeTemplates.toLocaleString('ru-RU'), icon: Users, color: 'text-rose-400' },
        ].map((stat, i) => (
          <div key={i} className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800 shadow-sm">
            <stat.icon className={cn(stat.color, 'mb-4')} size={24} />
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">{stat.label}</p>
            <p className="text-3xl font-black">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 p-8 rounded-3xl border border-zinc-800 h-80 flex flex-col items-center justify-center text-center">
          <BarChart3 className="text-zinc-700 mb-4" size={48} />
          <p className="text-zinc-500 font-bold">Динамика качества будет строиться из таблиц calls и call_reviews</p>
          <p className="text-xs text-zinc-600 mt-2">Сейчас данные уже собираются в SQLite и готовы для следующего графика.</p>
        </div>
        <div className="bg-zinc-900 p-8 rounded-3xl border border-zinc-800 h-80 flex flex-col items-center justify-center text-center">
          <TrendingUp className="text-zinc-700 mb-4" size={48} />
          <p className="text-zinc-500 font-bold">Топ сотрудников строится по сохранённым анализам</p>
          <p className="text-xs text-zinc-600 mt-2">Название шаблона фиксируется в звонке как snapshot, поэтому статистика не ломается при переименовании.</p>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden">
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
          <h3 className="font-bold text-lg">Рейтинг сотрудников</h3>
          <span className="text-xs font-bold text-indigo-400">На основе сохранённых звонков</span>
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
              {dashboard.leaderboard.length > 0 ? dashboard.leaderboard.map((agent, i) => (
                <tr key={`${agent.name}-${i}`} className="hover:bg-zinc-800/50 transition-colors group cursor-pointer">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        {agent.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <span className="font-bold text-sm">{agent.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-zinc-400">{agent.calls}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{agent.score.toFixed(1)}</span>
                      <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', agent.score >= 8 ? 'bg-emerald-500' : agent.score >= 7 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${agent.score * 10}%` }}></div>
                      </div>
                    </div>
                  </td>
                  <td className={cn('px-6 py-4 text-sm font-bold', agent.trend.startsWith('+') ? 'text-emerald-400' : 'text-rose-400')}>
                    {agent.trend}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      'px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider',
                      agent.status === 'Top Performer' ? 'bg-emerald-950/30 text-emerald-400' :
                      agent.status === 'Improving' ? 'bg-indigo-950/30 text-indigo-400' :
                      agent.status === 'Needs Coaching' ? 'bg-rose-950/30 text-rose-400' :
                      'bg-zinc-800 text-zinc-500'
                    )}>
                      {agent.status}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-zinc-500">Пока нет сохранённых анализов. Загрузите первый звонок на странице аудита.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};
