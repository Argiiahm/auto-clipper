import React, { useState } from 'react';
import { Flame, Laugh, Lightbulb, Zap, BookOpen, Mic, Sparkles, MessageSquare, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { PROMPT_TEMPLATES, getTemplate } from '../lib/templates';
import { cx } from '../lib/format';

const ICON_MAP = {
  Flame,
  Laugh,
  Lightbulb,
  Zap,
  BookOpen,
  Mic,
  Sparkles,
};

export default function PromptSelector({
  template = 'viral',
  onSelectTemplate,
  customPrompt = '',
  onChangePrompt,
  title = 'Gaya Klip & Prompt AI',
  showCustomInput = true,
  className = '',
}) {
  const [expanded, setExpanded] = useState(false);
  const current = getTemplate(template);

  return (
    <div className={cx('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg">
          <Sparkles size={14} className="text-accent" />
          <span>{title}</span>
        </div>
        <span className="text-[11px] text-muted">
          Fokus: <b className="text-accent-300 font-medium">{current.label}</b>
        </span>
      </div>

      {/* Template Badges / Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {PROMPT_TEMPLATES.map((t) => {
          const Icon = ICON_MAP[t.icon] || Sparkles;
          const active = template === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTemplate(t.id)}
              className={cx(
                'relative flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all',
                active
                  ? 'border-accent bg-accent/10 shadow-sm ring-1 ring-accent/30'
                  : 'border-line hover:border-faint bg-panel2 text-fg2 hover:text-fg'
              )}
            >
              <div
                className={cx(
                  'w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors',
                  active ? 'bg-accent text-onaccent' : 'bg-panel border border-line text-muted'
                )}
              >
                <Icon size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold leading-tight flex items-center gap-1">
                  <span className="truncate">{t.label}</span>
                </div>
                <div className="text-[10px] text-muted truncate mt-0.5">{t.badge}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Description of active template */}
      <div className="px-3 py-2 rounded-lg bg-panel2/80 border border-line/60 text-[11.5px] flex items-start gap-2 text-muted">
        <HelpCircle size={14} className="text-accent shrink-0 mt-0.5" />
        <div className="flex-1 leading-relaxed">
          <span className="font-semibold text-fg">{current.label}: </span>
          {current.desc}
        </div>
      </div>

      {/* Optional custom prompt input */}
      {showCustomInput && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[11.5px]">
            <label className="font-medium text-fg flex items-center gap-1">
              <span>{template === 'custom' ? 'Instruksi Prompt Kustom (Wajib):' : 'Instruksi Tambahan (Opsional):'}</span>
            </label>
            {template !== 'custom' && (
              <span className="text-[10.5px] text-faint">
                {customPrompt ? `${customPrompt.length} karakter` : 'Bisa dikosongkan'}
              </span>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              className={cx(
                'input text-[12.5px] transition-all',
                template === 'custom' && !customPrompt.trim() && 'border-amber-500/60 focus:border-amber-500'
              )}
              placeholder={current.placeholder || 'Ketik instruksi khusus pencarian klip di sini...'}
              value={customPrompt}
              onChange={(e) => onChangePrompt(e.target.value)}
            />
          </div>
          {template === 'custom' && !customPrompt.trim() && (
            <p className="text-[11px] text-amber-500">
              * Mode Kustom: Masukkan kata kunci atau topik klip yang ingin dicari AI.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
