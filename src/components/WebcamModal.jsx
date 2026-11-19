import React, { useEffect, useRef, useState } from 'react';
import { Modal } from './ui.jsx';
import { fileUrl } from '../lib/api';
import { fmtTime } from '../lib/format';

export default function WebcamModal({ open, onClose, project, onSave, startTime }) {
  const vref = useRef(null); const boxRef = useRef(null);
  const [rect, setRect] = useState(project.webcam || null);
  const [drag, setDrag] = useState(null);
  const [t, setT] = useState(startTime || 0);
  useEffect(() => { if (open) { setRect(project.webcam || null); setT(startTime || (project.video ? project.video.duration * 0.3 : 0)); } }, [open]);
  useEffect(() => { if (vref.current && open) vref.current.currentTime = t; }, [t, open]);
  if (!open || !project.video) return null;
  const ar = project.video.width / project.video.height;

  const pos = (e) => { const b = boxRef.current.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)), y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)) }; };
  const down = (e) => { const p = pos(e); setDrag(p); setRect({ x: p.x, y: p.y, w: 0, h: 0 }); };
  const move = (e) => { if (!drag) return; const p = pos(e); setRect({ x: Math.min(p.x, drag.x), y: Math.min(p.y, drag.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) }); };
  const up = () => setDrag(null);

  return (
    <Modal open={open} onClose={onClose} title="Tandai area webcam" width="max-w-5xl"
      footer={<>
        <button className="btn-ghost mr-auto" onClick={() => { onSave(null); onClose(); }}>Tanpa webcam</button>
        <button className="btn-ghost" onClick={onClose}>Batal</button>
        <button className="btn-primary" disabled={!rect || rect.w < 0.03} onClick={() => { onSave(rect); onClose(); }}>Simpan & pakai layout Split</button>
      </>}>
      <div className="p-5 space-y-3">
        <div className="text-[12.5px] text-muted">Tarik kotak di atas area kamera. Area ini ditaruh di bagian atas video vertikal (layout <b className="text-fg">Split</b>), gameplay di bawah.</div>
        <div ref={boxRef} className="relative w-full bg-black rounded-lg overflow-hidden cursor-crosshair select-none" style={{ aspectRatio: ar }} onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}>
          <video ref={vref} src={fileUrl(project.dir + '/' + project.video.path)} className="w-full h-full pointer-events-none" muted preload="auto" />
          {rect && rect.w > 0 && (<>
            <div className="absolute inset-0 bg-black/50 pointer-events-none" style={{ clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${rect.x * 100}% ${rect.y * 100}%,${rect.x * 100}% ${(rect.y + rect.h) * 100}%,${(rect.x + rect.w) * 100}% ${(rect.y + rect.h) * 100}%,${(rect.x + rect.w) * 100}% ${rect.y * 100}%,${rect.x * 100}% ${rect.y * 100}%)` }} />
            <div className="absolute border-2 border-amber-400 rounded-sm pointer-events-none shadow-[0_0_0_1px_rgba(0,0,0,.5)]" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}>
              <span className="absolute -top-6 left-0 text-[11px] bg-amber-400 text-black font-semibold px-1.5 rounded">Webcam</span>
            </div>
          </>)}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-muted w-16">{fmtTime(t)}</span>
          <input type="range" className="flex-1 range-fill" style={{ '--p': `${(t / project.video.duration) * 100}%` }} min={0} max={project.video.duration} step={1} value={t} onChange={(e) => setT(parseFloat(e.target.value))} />
          <span className="text-[12px] text-muted w-16 text-right">{fmtTime(project.video.duration)}</span>
        </div>
      </div>
    </Modal>
  );
}
