import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  Bot, X, RefreshCw,
  Database, Package, Users, FileText, ShoppingCart, Layers, Cpu, MessageSquare,
} from 'lucide-react';
import { CHATBOT_MODULES } from './chatbotConfig';
import { askChatbot } from './chatbotApi';

// ── Module metadata ───────────────────────────────────────────────────────────
const MODULE_META = {
  orders:              { icon: ShoppingCart, bg: 'bg-amber-500'   },
  'customer-invoices': { icon: FileText,     bg: 'bg-blue-500'    },
  customers:           { icon: Users,        bg: 'bg-emerald-500' },
  inventory:           { icon: Package,      bg: 'bg-violet-500'  },
  stock:               { icon: Database,     bg: 'bg-rose-500'    },
  bom:                 { icon: Layers,       bg: 'bg-cyan-500'    },
  'work-orders':       { icon: Cpu,          bg: 'bg-orange-500'  },
};
const DEFAULT_META = { icon: Database, bg: 'bg-gray-500' };

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Inline markdown parser (**bold**) ─────────────────────────────────────────
function parseInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
      : part
  );
}

// ── Structured bot response renderer ─────────────────────────────────────────
function FormattedText({ text }) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line → small spacer
    if (!trimmed) {
      elements.push(<div key={`sp-${i}`} className="h-1.5" />);
      i++;
      continue;
    }

    // Bullet list block (- or * or •)
    if (/^[-*•] /.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*•] /.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•] /, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="mt-1 space-y-1.5">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
              <span className="text-sm leading-relaxed text-gray-700">{parseInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list block (1. 2. 3. …)
    if (/^\d+\.\s/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="mt-1 space-y-1.5">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2.5">
              <span className="flex-shrink-0 min-w-[16px] text-xs font-bold text-amber-500">{j + 1}.</span>
              <span className="text-sm leading-relaxed text-gray-700">{parseInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Section header: line ending with ":"
    if (trimmed.endsWith(':') && trimmed.length < 60) {
      elements.push(
        <p key={`h-${i}`} className="mt-2.5 mb-0.5 text-xs font-bold uppercase tracking-wider text-gray-500 first:mt-0">
          {trimmed.slice(0, -1)}
        </p>
      );
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="text-sm leading-relaxed text-gray-800">
        {parseInline(trimmed)}
      </p>
    );
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-end gap-2.5 px-4 pt-2 pb-1">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-800">
        <Bot className="h-3.5 w-3.5 text-amber-400" />
      </div>
      <div className="rounded-2xl rounded-bl-sm border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          {[0, 160, 320].map((delay) => (
            <span
              key={delay}
              className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Data table (inside bot message) ──────────────────────────────────────────
function DataTable({ data }) {
  if (!Array.isArray(data) || data.length === 0) return null;
  const columns = Object.keys(data[0]);
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between bg-slate-800 px-3 py-2">
        <span className="text-xs font-semibold tracking-wide text-gray-300">Query Results</span>
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-400 ring-1 ring-amber-500/30">
          {data.length} {data.length === 1 ? 'record' : 'records'}
        </span>
      </div>
      <div className="overflow-x-auto" style={{ maxHeight: '180px', overflowY: 'auto' }}>
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-slate-700">
            <tr>
              {columns.map((col) => (
                <th key={col} className="whitespace-nowrap px-3 py-2 text-left font-medium uppercase tracking-wider text-gray-300">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className={`transition-colors hover:bg-amber-50/40 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}`}>
                {columns.map((col) => (
                  <td key={col} className="whitespace-nowrap px-3 py-2 text-gray-700">
                    {String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Bot message bubble ────────────────────────────────────────────────────────
function BotMessage({ msg }) {
  return (
    <div className="flex items-end gap-2.5 px-4 pt-2 pb-1">
      <div className="mb-5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-800 shadow-sm">
        <Bot className="h-3.5 w-3.5 text-amber-400" />
      </div>
      <div className="flex-1" style={{ maxWidth: '85%' }}>
        <div className="rounded-2xl rounded-bl-sm border border-gray-100 bg-white px-4 py-3 shadow-sm">
          <FormattedText text={msg.text} />
          {msg.data && <DataTable data={msg.data} />}
        </div>
        <p className="ml-1 mt-1 text-xs text-gray-400">{formatTime(msg.timestamp)}</p>
      </div>
    </div>
  );
}

// ── User message bubble ───────────────────────────────────────────────────────
function UserMessage({ msg }) {
  return (
    <div className="flex items-end justify-end gap-2.5 px-4 pt-2 pb-1">
      <div style={{ maxWidth: '80%' }}>
        <div className="rounded-2xl rounded-br-sm bg-gradient-to-br from-amber-500 to-orange-500 px-4 py-3 shadow-sm">
          <p className="text-sm leading-relaxed text-white">{msg.text}</p>
        </div>
        <p className="mr-1 mt-1 text-right text-xs text-gray-400">{formatTime(msg.timestamp)}</p>
      </div>
    </div>
  );
}

// ── Questions panel ───────────────────────────────────────────────────────────
function QuestionsPanel({ module, loading, onSelect }) {
  // No module selected
  if (!module) {
    return (
      <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
            <MessageSquare className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-xs font-medium text-gray-500">Select a module above</p>
          <p className="text-xs text-gray-400">Questions will appear here</p>
        </div>
      </div>
    );
  }

  const meta = MODULE_META[module.key] || DEFAULT_META;
  const Icon = meta.icon;

  // Module selected but no questions yet
  if (module.questions.length === 0) {
    return (
      <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className={`flex h-9 w-9 items-center justify-center rounded-full ${meta.bg}`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <p className="text-xs font-medium text-gray-600">Coming soon</p>
          <p className="text-xs text-gray-400">{module.label} questions are being configured</p>
        </div>
      </div>
    );
  }

  // Module with questions
  return (
    <div className="flex-shrink-0 border-t border-gray-100 bg-white">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-gray-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className={`flex h-5 w-5 items-center justify-center rounded-md ${meta.bg}`}>
            <Icon className="h-3 w-3 text-white" />
          </div>
          <span className="text-xs font-semibold text-gray-700">{module.label}</span>
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
          {module.questions.length} questions
        </span>
      </div>

      {/* Scrollable question list */}
      <div className="overflow-y-auto px-3 py-2" style={{ maxHeight: '200px' }}>
        <div className="space-y-1.5">
          {module.questions.map((q) => (
            <button
              key={q.value}
              onClick={() => onSelect(q.value)}
              disabled={loading}
              className="group flex w-full items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5 text-left text-xs font-medium text-gray-700 transition-all duration-150 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-800 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${meta.bg} opacity-50 group-hover:opacity-100 transition-opacity`} />
              {q.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────
function ChatbotWidget() {
  const [isOpen, setIsOpen]                       = useState(false);
  const [selectedModuleKey, setSelectedModuleKey] = useState(null);
  const [messages, setMessages]                   = useState([]);
  const [loading, setLoading]                     = useState(false);
  const messagesEndRef                            = useRef(null);

  const selectedModule = useMemo(
    () => CHATBOT_MODULES.find((m) => m.key === selectedModuleKey) || null,
    [selectedModuleKey]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'bot',
        text: "Hi! How can I assist you today?\n\nSelect a module from the bar above. A set of questions will appear below — click any one to get an instant answer.",
        data: null,
        timestamp: new Date(),
      }]);
    }
  }, [isOpen, messages.length]);

  const addMessage = (role, text, data = null) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), role, text, data, timestamp: new Date() },
    ]);
  };

  const handleReset = () => {
    setSelectedModuleKey(null);
    setLoading(false);
    setMessages([{
      id: Date.now(),
      role: 'bot',
      text: "Hi! How can I assist you today?\n\nSelect a module above and pick a question to get started.",
      data: null,
      timestamp: new Date(),
    }]);
  };

  const handleModuleSelect = (moduleKey) => {
    if (moduleKey === selectedModuleKey) return;
    setSelectedModuleKey(moduleKey);
    const module = CHATBOT_MODULES.find((m) => m.key === moduleKey);
    if (!module) return;

    const text = module.questions.length > 0
      ? `Switched to ${module.label}. Pick a question from the panel below.`
      : `${module.label} is being configured. Please select another module for now.`;

    addMessage('bot', text);
  };

  const handleQuestionSelect = async (questionValue) => {
    if (!selectedModule || loading) return;

    addMessage('user', questionValue);
    setLoading(true);

    try {
      const result = await askChatbot(selectedModule.endpoint, questionValue);
      addMessage('bot', result?.response || 'No response received.', result?.data || null);
    } catch (err) {
      addMessage('bot', err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ── Floating trigger ────────────────────────────────────────────────── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open ERP Assistant"
          className="fixed bottom-6 right-6 z-50 group focus:outline-none"
        >
          <span className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 shadow-2xl shadow-slate-900/50 ring-1 ring-white/10 transition-all duration-200 group-hover:scale-110">
            <Bot className="h-6 w-6 text-amber-400" />
          </span>
        </button>
      )}

      {/* ── Widget panel ────────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 z-50 flex w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/30 border border-gray-200"
          style={{ height: '640px', maxHeight: '90vh' }}
        >
          {/* ── Dark robot header ── */}
          <div
            className="relative flex-shrink-0 overflow-hidden bg-slate-900 px-5 py-4"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(251,191,36,0.07) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          >
            <div className="pointer-events-none absolute -right-4 -top-6 h-28 w-28 rounded-full bg-amber-500/15 blur-2xl" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/25">
                    <Bot className="h-6 w-6 text-amber-400" />
                  </div>
                  <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-white">ERP Assistant</h2>
                    <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-400 ring-1 ring-amber-500/30">
                      AI
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">Powered by your ERP data</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleReset}
                  aria-label="Reset chat"
                  className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* ── Module selector strip ── */}
          <div className="flex-shrink-0 border-b border-gray-100 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-2" style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
              <span className="flex-shrink-0 text-xs font-semibold text-gray-400">Module</span>
              <span className="flex-shrink-0 text-gray-300">·</span>
              <div className="flex gap-1.5">
                {CHATBOT_MODULES.map((module) => {
                  const m = MODULE_META[module.key] || DEFAULT_META;
                  const Icon = m.icon;
                  const isSelected = selectedModuleKey === module.key;
                  return (
                    <button
                      key={module.key}
                      onClick={() => handleModuleSelect(module.key)}
                      className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150
                        ${isSelected
                          ? `${m.bg} text-white shadow-sm`
                          : 'border border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        }`}
                    >
                      <Icon className="h-3 w-3" />
                      {module.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Messages area ── */}
          <div className="flex-1 overflow-y-auto bg-gray-50/70 py-2">
            {messages.map((msg) =>
              msg.role === 'user'
                ? <UserMessage key={msg.id} msg={msg} />
                : <BotMessage key={msg.id} msg={msg} />
            )}
            {loading && <TypingDots />}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Questions panel (always visible) ── */}
          <QuestionsPanel
            module={selectedModule}
            loading={loading}
            onSelect={handleQuestionSelect}
          />
        </div>
      )}
    </>
  );
}

export default ChatbotWidget;
