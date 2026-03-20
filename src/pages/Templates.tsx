import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  FileText, 
  X, 
  Save 
} from 'lucide-react';
import { cn } from '../lib/utils';

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

interface TemplatesProps {
  templates: Template[];
  setTemplates: React.Dispatch<React.SetStateAction<Template[]>>;
}

export const Templates: React.FC<TemplatesProps> = ({ templates, setTemplates }) => {
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState<Partial<Template>>({
    title: '',
    desc: '',
    weights: { introduction: 15, needDiscovery: 15, presentation: 15, objectionHandling: 15, stopWords: 15, closing: 25 },
    active: true
  });

  const handleCreateTemplate = () => {
    if (!newTemplate.title) return;
    const template: Template = {
      id: Math.random().toString(36).substr(2, 9),
      title: newTemplate.title || 'Новый шаблон',
      desc: newTemplate.desc || 'Без описания',
      weights: newTemplate.weights as Template['weights'],
      active: true
    };
    setTemplates([template, ...templates]);
    setIsCreatingTemplate(false);
    setNewTemplate({
      title: '',
      desc: '',
      weights: { introduction: 15, needDiscovery: 15, presentation: 15, objectionHandling: 15, stopWords: 15, closing: 25 },
      active: true
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-8 max-w-7xl mx-auto space-y-8"
    >
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black mb-2">Шаблоны аудита</h2>
          <p className="text-zinc-400">Настройте критерии оценки для различных типов звонков.</p>
        </div>
        <button 
          onClick={() => setIsCreatingTemplate(true)}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-900/20 flex items-center gap-2"
        >
          <Plus size={20} />
          Создать шаблон
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((template) => (
          <div key={template.id} className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800 hover:border-zinc-700 transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center text-zinc-400 group-hover:text-indigo-400 transition-colors">
                <FileText size={24} />
              </div>
            </div>
            <h3 className="text-lg font-bold mb-2">{template.title}</h3>
            <p className="text-sm text-zinc-500 mb-6 leading-relaxed">{template.desc}</p>
            
            <div className="space-y-2 mb-6">
              <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Веса блоков:</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(template.weights).map(([key, value]) => (
                  <span key={key} className="text-[10px] bg-zinc-800 px-2 py-1 rounded text-zinc-400">
                    {key === 'introduction' ? 'Вст' : key === 'needDiscovery' ? 'Потр' : key === 'presentation' ? 'През' : key === 'objectionHandling' ? 'Вопр' : key === 'stopWords' ? 'Стоп' : 'Зав'}: {value}%
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Template Modal */}
      <AnimatePresence>
        {isCreatingTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-zinc-900 w-full max-w-2xl rounded-3xl border border-zinc-800 shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-xl font-bold">Новый шаблон аудита</h3>
                <button onClick={() => setIsCreatingTemplate(false)} className="text-zinc-500 hover:text-zinc-100 transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Название шаблона (напр. Имя сотрудника)</label>
                    <input 
                      type="text" 
                      value={newTemplate.title}
                      onChange={(e) => setNewTemplate({...newTemplate, title: e.target.value})}
                      placeholder="Введите название..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:border-indigo-500 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Описание (необязательно)</label>
                    <textarea 
                      value={newTemplate.desc}
                      onChange={(e) => setNewTemplate({...newTemplate, desc: e.target.value})}
                      placeholder="Для чего этот шаблон..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:border-indigo-500 outline-none transition-colors h-24 resize-none"
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Настройка весов блоков (%)</label>
                    <span className={cn(
                      "text-xs font-bold px-2 py-1 rounded",
                      Object.values(newTemplate.weights!).reduce((a, b) => a + b, 0) === 100 ? "bg-emerald-950/30 text-emerald-400" : "bg-rose-950/30 text-rose-400"
                    )}>
                      Итого: {Object.values(newTemplate.weights!).reduce((a, b) => a + b, 0)}%
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                      { id: 'introduction', label: 'Вступление' },
                      { id: 'needDiscovery', label: 'Потребности' },
                      { id: 'presentation', label: 'Презентация' },
                      { id: 'objectionHandling', label: 'Возражения' },
                      { id: 'stopWords', label: 'Стоп-слова' },
                      { id: 'closing', label: 'Завершение' },
                    ].map((block) => (
                      <div key={block.id} className="space-y-3">
                        <div className="flex justify-between text-xs">
                          <span className="font-bold text-zinc-400">{block.label}</span>
                          <span className="font-mono text-indigo-400">{(newTemplate.weights as any)[block.id]}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          step="5"
                          value={(newTemplate.weights as any)[block.id]}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setNewTemplate({
                              ...newTemplate,
                              weights: { ...newTemplate.weights!, [block.id]: val }
                            });
                          }}
                          className="w-full accent-indigo-500 bg-zinc-800 h-1.5 rounded-full appearance-none cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                  {Object.values(newTemplate.weights!).reduce((a, b) => a + b, 0) !== 100 && (
                    <p className="text-[10px] text-rose-400 italic">Сумма весов должна быть равна 100% для корректного расчета.</p>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-zinc-800 flex gap-4">
                <button 
                  onClick={() => setIsCreatingTemplate(false)}
                  className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold rounded-xl transition-colors"
                >
                  Отмена
                </button>
                <button 
                  onClick={handleCreateTemplate}
                  disabled={!newTemplate.title || Object.values(newTemplate.weights!).reduce((a, b) => a + b, 0) !== 100}
                  className={cn(
                    "flex-1 py-3 font-bold rounded-xl transition-all flex items-center justify-center gap-2",
                    newTemplate.title && Object.values(newTemplate.weights!).reduce((a, b) => a + b, 0) === 100
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-900/20"
                      : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  )}
                >
                  <Save size={20} />
                  Сохранить шаблон
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
