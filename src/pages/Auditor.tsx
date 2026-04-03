import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Upload,
  FileAudio,
  FileVideo,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BarChart3,
  FileText,
  ChevronDown
} from 'lucide-react';
import Markdown from 'react-markdown';
import { cn } from '../lib/utils';
import { CallScore, FactBlocks, Template, TranscriptionTurn } from '../types';

interface AuditorProps {
  templates: Template[];
  reloadData: () => Promise<void>;
}

const buildAnalysisTranscript = (turns: TranscriptionTurn[]): string => {
  const hasChunkLocalSpeakers = turns.some((turn) => turn.speakerReliable === false);
  const transcriptBody = turns
    .map((turn) => {
      const speakerLabel = turn.speaker?.trim() || 'Speaker';
      const timestampPrefix = turn.timestamp ? `${turn.timestamp} ` : '';
      return `${timestampPrefix}${speakerLabel}: ${turn.text}`;
    })
    .join('\n');

  if (!hasChunkLocalSpeakers) {
    return transcriptBody;
  }

  return [
    'ВНИМАНИЕ: запись была разбита на фрагменты из-за размера файла.',
    'Метки спикеров внутри одного фрагмента помогают различать собеседников, но не должны считаться глобально стабильными между разными фрагментами.',
    transcriptBody,
  ].join('\n\n');
};

const estimateDurationFromTurns = (turns: TranscriptionTurn[]) => {
  const lastTimestamp = turns
    .map((turn) => turn.timestamp)
    .filter(Boolean)
    .at(-1);

  if (!lastTimestamp) {
    return 0;
  }

  const match = lastTimestamp.match(/-(\d{2}):(\d{2})\]/);
  if (!match) {
    return 0;
  }

  return Number(match[1]) * 60 + Number(match[2]);
};


interface RenderedPdfPage {
  data: Uint8Array;
  width: number;
  height: number;
}

const PDF_PAGE_WIDTH = 595;
const PDF_PAGE_HEIGHT = 842;

const createWrappedLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  if (!text.trim()) {
    return [''];
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = '';
    }

    if (ctx.measureText(word).width <= maxWidth) {
      currentLine = word;
      continue;
    }

    let chunk = '';
    for (const char of word) {
      const nextChunk = `${chunk}${char}`;
      if (ctx.measureText(nextChunk).width > maxWidth && chunk) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk = nextChunk;
      }
    }
    currentLine = chunk;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};

const dataUrlToUint8Array = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const renderReportPages = (reportLines: string[]): RenderedPdfPage[] => {
  const scale = 2;
  const pageWidthPx = Math.floor(PDF_PAGE_WIDTH * scale);
  const pageHeightPx = Math.floor(PDF_PAGE_HEIGHT * scale);
  const marginPx = 48 * scale;
  const lineHeight = 18 * scale;

  const canvas = document.createElement('canvas');
  canvas.width = pageWidthPx;
  canvas.height = pageHeightPx;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Не удалось инициализировать canvas для PDF.');
  }

  const pages: RenderedPdfPage[] = [];

  const resetPage = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageWidthPx, pageHeightPx);
    ctx.fillStyle = '#111827';
    ctx.font = `${15 * scale}px Arial, sans-serif`;
    ctx.textBaseline = 'top';
  };

  const pushPage = () => {
    const jpegData = canvas.toDataURL('image/jpeg', 0.9);
    pages.push({
      data: dataUrlToUint8Array(jpegData),
      width: pageWidthPx,
      height: pageHeightPx,
    });
  };

  resetPage();
  let y = marginPx;
  const textWidth = pageWidthPx - marginPx * 2;

  for (const line of reportLines) {
    const wrappedLines = createWrappedLines(ctx, line, textWidth);

    for (const wrappedLine of wrappedLines) {
      if (y + lineHeight > pageHeightPx - marginPx) {
        pushPage();
        resetPage();
        y = marginPx;
      }
      ctx.fillText(wrappedLine, marginPx, y);
      y += lineHeight;
    }

    y += Math.floor(lineHeight * 0.35);
  }

  pushPage();
  return pages;
};

const buildPdfFromImages = (pages: RenderedPdfPage[]): Uint8Array => {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let position = 0;

  const append = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
    chunks.push(bytes);
    position += bytes.length;
  };

  append('%PDF-1.4\n%\u00FF\u00FF\u00FF\u00FF\n');

  const objectCount = 2 + pages.length * 3;
  const pageObjectIds: number[] = [];

  offsets[1] = position;
  append('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  for (let index = 0; index < pages.length; index += 1) {
    pageObjectIds.push(5 + index * 3);
  }

  offsets[2] = position;
  append(
    `2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds
      .map((id) => `${id} 0 R`)
      .join(' ')}] >>\nendobj\n`
  );

  pages.forEach((page, index) => {
    const imageObjectId = 3 + index * 3;
    const contentObjectId = 4 + index * 3;
    const pageObjectId = 5 + index * 3;

    offsets[imageObjectId] = position;
    append(
      `${imageObjectId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.data.length} >>\nstream\n`
    );
    append(page.data);
    append('\nendstream\nendobj\n');

    const content = `q\n${PDF_PAGE_WIDTH} 0 0 ${PDF_PAGE_HEIGHT} 0 0 cm\n/Im${index + 1} Do\nQ`;
    const contentBytes = encoder.encode(content);

    offsets[contentObjectId] = position;
    append(`${contentObjectId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
    append(contentBytes);
    append('\nendstream\nendobj\n');

    offsets[pageObjectId] = position;
    append(
      `${pageObjectId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /XObject << /Im${index + 1} ${imageObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>\nendobj\n`
    );
  });

  const xrefOffset = position;
  append(`xref\n0 ${objectCount + 1}\n`);
  append('0000000000 65535 f \n');

  for (let index = 1; index <= objectCount; index += 1) {
    const offset = offsets[index] || 0;
    append(`${offset.toString().padStart(10, '0')} 00000 n \n`);
  }

  append(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const fullSize = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(fullSize);
  let cursor = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, cursor);
    cursor += chunk.length;
  });

  return output;
};

export const Auditor: React.FC<AuditorProps> = ({ templates, reloadData }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'upload' | 'transcribing' | 'extracting' | 'scoring' | 'result'>('upload');
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionTurn[]>([]);
  const [facts, setFacts] = useState<FactBlocks | null>(null);
  const [scores, setScores] = useState<CallScore | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(String(templates[0]?.id || ''));
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [savedCallId, setSavedCallId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type.startsWith('audio/') || selectedFile.type.startsWith('video/')) {
        setFile(selectedFile);
        setAudioUrl(URL.createObjectURL(selectedFile));
        setError(null);
      } else {
        setError('Пожалуйста, выберите аудио или видео файл.');
      }
    }
  };

  const safeFetchJSON = async (response: Response, errorMessage: string) => {
    const text = await response.text();
    if (!response.ok) {
      let parsedError = errorMessage;
      try {
        const errData = JSON.parse(text);
        parsedError = errData.error || errorMessage;
      } catch {
        parsedError = text || errorMessage;
      }
      throw new Error(parsedError);
    }
    try {
      return JSON.parse(text);
    } catch {
      console.error('Failed to parse JSON response:', text);
      throw new Error(`Invalid response format from server: ${text.substring(0, 100)}...`);
    }
  };

  const processCall = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    setSavedCallId(null);
    try {
      setStep('transcribing');

      const formData = new FormData();
      formData.append('file', file);

      const transcribeResponse = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      const transcriptionData = await safeFetchJSON(transcribeResponse, 'Transcription failed');
      if (!transcriptionData || transcriptionData.length === 0) {
        throw new Error('Транскрибация не вернула данных. Попробуйте другой файл или проверьте настройки API.');
      }
      setTranscription(transcriptionData);

      setStep('extracting');
      const analysisTranscript = buildAnalysisTranscript(transcriptionData);

      const factsResponse = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcriptionText: analysisTranscript, factsOnly: true }),
      });

      const factsData = await safeFetchJSON(factsResponse, 'Fact extraction failed');
      setFacts(factsData);

      setStep('scoring');
      const selectedTemplate = templates.find(t => t.id === Number(selectedTemplateId)) || templates[0];
      if (!selectedTemplate) {
        throw new Error('Не найден шаблон для оценки.');
      }

      const scoringResponse = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcriptionText: analysisTranscript,
          facts: factsData,
          weights: selectedTemplate.weights,
          factsOnly: false
        }),
      });

      const scoresData = await safeFetchJSON(scoringResponse, 'Scoring failed');
      setScores(scoresData);

      const saveResponse = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          audioFileName: file.name,
          audioMimeType: file.type,
          audioSizeBytes: file.size,
          durationSeconds: estimateDurationFromTurns(transcriptionData),
          transcriptText: analysisTranscript,
          transcriptJson: transcriptionData,
          averageScore: scoresData.average,
          summary: factsData.summary,
          feedbackText: scoresData.feedback,
          factsJson: factsData,
          scoresJson: scoresData,
        }),
      });

      const savedCall = await safeFetchJSON(saveResponse, 'Saving call failed');
      setSavedCallId(savedCall.callId || null);
      await reloadData();
      setStep('result');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Произошла ошибка при обработке файла.');
      setStep('upload');
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setFile(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setTranscription([]);
    setFacts(null);
    setScores(null);
    setSavedCallId(null);
    setStep('upload');
    setError(null);
  };

  const downloadReport = () => {
    try {
      const reportLines = [
        `Отчет по аудиту: ${file?.name || 'call'}`,
        `Дата: ${new Date().toLocaleString()}`,
        savedCallId ? `ID звонка: ${savedCallId}` : 'ID звонка: не сохранен',
        '',
        'Итоговая оценка',
        `Средний балл: ${scores?.average?.toFixed(1) || '0.0'} / 10`,
        `Вступление: ${scores?.introduction ?? '-'} / 10`,
        `Потребности: ${scores?.needDiscovery ?? '-'} / 10`,
        `Презентация: ${scores?.presentation ?? '-'} / 10`,
        `Возражения: ${scores?.objectionHandling ?? '-'} / 10`,
        `Стоп-слова: ${scores?.stopWords ?? '-'} / 10`,
        `Завершение: ${scores?.closing ?? '-'} / 10`,
        '',
        'Фидбек',
        scores?.feedback || 'Нет данных',
        '',
        'Факты',
        `Вступление: ${facts?.introduction || 'Нет данных'}`,
        `Потребности: ${facts?.needDiscovery || 'Нет данных'}`,
        `Презентация: ${facts?.presentation || 'Нет данных'}`,
        `Возражения: ${facts?.objectionHandling || 'Нет данных'}`,
        `Стоп-слова: ${facts?.stopWords || 'Нет данных'}`,
        `Завершение: ${facts?.closing || 'Нет данных'}`,
        `Summary: ${facts?.summary || 'Нет данных'}`,
        '',
        'Транскрипция',
        ...transcription.map((turn) => {
          const timestamp = turn.timestamp ? `${turn.timestamp} ` : '';
          const speaker = turn.speaker?.trim() || 'Speaker';
          return `${timestamp}${speaker}: ${turn.text}`;
        }),
      ];

      const pages = renderReportPages(reportLines);
      const pdfBytes = buildPdfFromImages(pages);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${file?.name || 'call'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Не удалось сформировать PDF-отчет:', err);
      setError('Не удалось сформировать PDF-отчет. Попробуйте еще раз.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-8 max-w-7xl mx-auto"
    >
      {step === 'upload' && !isProcessing && (
        <div className="flex flex-col items-center justify-center min-h-[70vh]">
          <div className="w-full max-w-2xl bg-zinc-900 rounded-3xl border-2 border-dashed border-zinc-800 p-12 text-center hover:border-indigo-500 transition-colors group relative overflow-hidden">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="audio/*,video/*" className="absolute inset-0 opacity-0 cursor-pointer" />
            <div className="relative z-10">
              <div className="w-20 h-20 bg-indigo-950/30 rounded-2xl flex items-center justify-center text-indigo-400 mx-auto mb-6 group-hover:scale-110 transition-transform">
                <Upload size={40} />
              </div>
              <h2 className="text-2xl font-bold text-zinc-100 mb-2">Аудит нового звонка</h2>
              <p className="text-zinc-400 mb-8">Результат анализа сохраняется в SQLite вместе с шаблоном, транскрипцией и итоговой оценкой.</p>

              {file && (
                <div className="bg-indigo-950/20 border border-indigo-900/30 rounded-xl p-4 flex items-center gap-4 mb-8 max-w-md mx-auto">
                  {file.type.startsWith('video/') ? <FileVideo className="text-indigo-400" /> : <FileAudio className="text-indigo-400" />}
                  <div className="text-left flex-1 overflow-hidden">
                    <p className="text-sm font-semibold text-zinc-100 truncate">{file.name}</p>
                    <p className="text-xs text-zinc-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                  <CheckCircle2 className="text-emerald-500" size={20} />
                </div>
              )}
              {error && <div className="flex items-center gap-2 text-red-400 justify-center mb-6"><AlertCircle size={18} /><span className="text-sm font-medium">{error}</span></div>}
              <button onClick={(e) => { e.stopPropagation(); if (file) void processCall(); else fileInputRef.current?.click(); }} className={cn('px-8 py-4 rounded-2xl font-bold text-lg transition-all shadow-xl', file ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-900/20' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed')}>
                {file ? 'Начать анализ' : 'Выбрать файл'}
              </button>

              <div className="max-w-xs mx-auto mt-10 text-left relative z-20">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Шаблон оценки</label>
                <div className="relative group/select">
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 pl-10 pr-10 py-3 rounded-xl appearance-none focus:outline-none focus:border-indigo-500 transition-colors font-bold text-sm cursor-pointer"
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500 group-hover/select:text-indigo-400 transition-colors">
                    <FileText size={18} />
                  </div>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                    <ChevronDown size={18} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
          <div className="relative w-32 h-32 mb-8">
            <div className="absolute inset-0 border-4 border-zinc-800 rounded-full"></div>
            <motion.div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}></motion.div>
            <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="text-indigo-400 animate-pulse" size={40} /></div>
          </div>
          <h2 className="text-2xl font-bold text-zinc-100 mb-4">
            {step === 'transcribing' && 'Транскрибируем звонок...'}
            {step === 'extracting' && 'Выделяем ключевые факты...'}
            {step === 'scoring' && 'Оцениваем качество...'}
          </h2>
        </div>
      )}

      {step === 'result' && (
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900 p-6 rounded-3xl border border-zinc-800">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
                <FileAudio size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-100">{file?.name}</h2>
                <p className="text-sm text-zinc-500">{((file?.size || 0) / (1024 * 1024)).toFixed(2)} MB • {new Date().toLocaleDateString()}</p>
                {savedCallId && <p className="text-xs text-emerald-400 mt-1">Сохранено в SQLite как звонок #{savedCallId}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {audioUrl && (
                <audio controls src={audioUrl} className="h-10 rounded-lg bg-zinc-800" />
              )}
              <button onClick={downloadReport} title="Экспорт" className="w-10 h-10 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-colors flex items-center justify-center">
                <Upload size={18} className="rotate-180" />
              </button>
              <button onClick={reset} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors">
                Новый аудит
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-8">
              <div className="bg-indigo-600 rounded-3xl p-5 text-white shadow-2xl shadow-indigo-900/40 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12 blur-2xl group-hover:scale-110 transition-transform duration-700"></div>
                <div className="relative z-10">
                  <p className="text-indigo-100 text-[9px] font-black uppercase tracking-[0.2em] mb-1 opacity-80">Call Quality Score</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-black tracking-tighter">{scores?.average?.toFixed(1) || '0.0'}</span>
                    <span className="text-lg font-bold text-indigo-200 opacity-60">/ 10</span>
                  </div>
                  {scores?.feedback && (
                    <div className="mt-3 p-4 bg-white/10 rounded-xl backdrop-blur-md border border-white/10 shadow-inner">
                      <p className="text-sm font-medium leading-relaxed italic text-indigo-50">
                        "{scores.feedback}"
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800 shadow-xl">
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-zinc-500 mb-8 flex items-center gap-3">
                  <BarChart3 size={16} className="text-indigo-400" />
                  Оценка по блокам
                </h3>
                <div className="space-y-5">
                  {scores && [
                    { label: 'Вступление', value: scores.introduction },
                    { label: 'Потребности', value: scores.needDiscovery },
                    { label: 'Презентация', value: scores.presentation },
                    { label: 'Возражения', value: scores.objectionHandling },
                    { label: 'Стоп-слова', value: scores.stopWords },
                    { label: 'Завершение', value: scores.closing },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm font-semibold text-zinc-300">{item.label}</span>
                        <span className="text-sm font-bold text-zinc-100">{item.value}/10</span>
                      </div>
                      <div className="w-full bg-zinc-800 rounded-full h-2">
                        <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${item.value * 10}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-8 space-y-8">
              <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800 shadow-xl">
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-zinc-500 mb-6">Факты и summary</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {facts && [
                    { label: 'Вступление', text: facts.introduction },
                    { label: 'Потребности', text: facts.needDiscovery },
                    { label: 'Презентация', text: facts.presentation },
                    { label: 'Возражения', text: facts.objectionHandling },
                    { label: 'Стоп-слова', text: facts.stopWords },
                    { label: 'Завершение', text: facts.closing },
                    { label: 'Summary', text: facts.summary, fullWidth: true },
                  ].map((item) => (
                    <div key={item.label} className={cn('rounded-2xl bg-zinc-950 border border-zinc-800 p-4', item.fullWidth && 'md:col-span-2')}>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-2">{item.label}</p>
                      <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{item.text || 'Нет данных'}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800 shadow-xl">
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-zinc-500 mb-6">Транскрипция</h3>
                <div className="space-y-4 max-h-[32rem] overflow-y-auto pr-2">
                  {transcription.map((turn, index) => (
                    <div key={`${turn.speaker}-${index}`} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                      <div className="flex items-center gap-3 mb-2 text-xs text-zinc-500 uppercase tracking-widest font-bold">
                        <span>{turn.speaker}</span>
                        {turn.timestamp && <span>{turn.timestamp}</span>}
                      </div>
                      <div className="text-sm text-zinc-300 leading-relaxed prose prose-invert max-w-none">
                        <Markdown>{turn.text}</Markdown>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
