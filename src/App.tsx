import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Auditor } from './pages/Auditor';
import { Templates } from './pages/Templates';
import { Profile } from './pages/Profile';
import { DashboardData, ProfileData, Template } from './types';

const emptyDashboard: DashboardData = {
  totalCalls: 0,
  averageScore: 0,
  totalDurationSeconds: 0,
  activeTemplates: 0,
  leaderboard: [],
};

export default function App() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBootstrap = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/bootstrap');
      if (!response.ok) {
        throw new Error('Не удалось загрузить данные приложения.');
      }

      const data = await response.json();
      setTemplates(data.templates ?? []);
      setProfile(data.profile ?? null);
      setDashboard(data.dashboard ?? emptyDashboard);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить данные приложения.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBootstrap();
  }, []);

  const sharedProps = useMemo(() => ({ templates, reloadData: loadBootstrap }), [templates]);

  if (isLoading) {
    return <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">Загрузка данных…</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-semibold">{error}</p>
        <button onClick={() => void loadBootstrap()} className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold transition-colors">
          Повторить
        </button>
      </div>
    );
  }

  return (
    <Router>
      <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto relative">
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/" element={<Dashboard templates={templates} initialDashboard={dashboard} reloadData={loadBootstrap} />} />
              <Route path="/auditor" element={<Auditor {...sharedProps} />} />
              <Route path="/templates" element={<Templates templates={templates} setTemplates={setTemplates} reloadData={loadBootstrap} />} />
              <Route path="/profile" element={<Profile profile={profile} />} />
            </Routes>
          </AnimatePresence>
        </main>
      </div>
    </Router>
  );
}
