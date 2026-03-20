import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Auditor } from './pages/Auditor';
import { Templates } from './pages/Templates';
import { Profile } from './pages/Profile';

interface Template {
  id: string;
  title: string;
  desc: string;
  weights: {
    introduction: number;
    needDiscovery: number;
    presentation: number;
    objectionHandling: number;
    stopWords: number;
    closing: number;
  };
  active: boolean;
}

export default function App() {
  // Templates State
  const [templates, setTemplates] = useState<Template[]>([
    { 
      id: '1', 
      title: 'Холодные продажи', 
      desc: 'Фокус на обходе секретаря и выявлении ЛПР.', 
      weights: { introduction: 20, needDiscovery: 20, presentation: 20, objectionHandling: 20, stopWords: 10, closing: 10 },
      active: true 
    },
    { 
      id: '2', 
      title: 'Техподдержка', 
      desc: 'Оценка эмпатии и скорости решения проблемы.', 
      weights: { introduction: 10, needDiscovery: 30, presentation: 10, objectionHandling: 10, stopWords: 10, closing: 30 },
      active: true 
    },
    { 
      id: '3', 
      title: 'Удержание клиентов', 
      desc: 'Анализ работы с оттоком и спецпредложениями.', 
      weights: { introduction: 15, needDiscovery: 15, presentation: 20, objectionHandling: 20, stopWords: 10, closing: 20 },
      active: false 
    },
  ]);

  return (
    <Router>
      <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
        <Sidebar />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto relative">
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/" element={<Dashboard templates={templates} />} />
              <Route path="/auditor" element={<Auditor templates={templates} />} />
              <Route path="/templates" element={<Templates templates={templates} setTemplates={setTemplates} />} />
              <Route path="/profile" element={<Profile />} />
            </Routes>
          </AnimatePresence>
        </main>
      </div>
    </Router>
  );
}
