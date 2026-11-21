import React, { useState } from 'react';
import { QrCode, Copy, ExternalLink, Wifi, Check, X, Smartphone } from 'lucide-react';
import { Modal, Spinner, toast } from './ui.jsx';

export default function QrShareModal({ open, onClose, data, loading }) {
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    if (!data || !data.url) return;
    navigator.clipboard.writeText(data.url).then(() => {
      setCopied(true);
      toast('Tautan berhasil disalin', 'success');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const openInBrowser = () => {
    if (data && data.url) {
      window.open(data.url, '_blank');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Kirim Video ke HP" width={440}>
      <div className="space-y-4 pt-1">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-muted">
            <Spinner size={24} />
            <span className="text-[13px]">Menyiapkan barcode & server lokal…</span>
          </div>
        ) : data ? (
          <>
            <div className="text-center space-y-1">
              <div className="text-[13.5px] font-semibold text-fg line-clamp-2 px-2">
                {data.title}
              </div>
              <p className="text-[12px] text-muted max-w-xs mx-auto">
                Scan barcode ini menggunakan <b>kamera bawaan HP</b> Anda untuk langsung download ke galeri.
              </p>
            </div>

            {/* QR Code Container */}
            <div className="flex justify-center py-2">
              <div className="p-3.5 bg-white rounded-2xl shadow-md border border-line/40 inline-flex flex-col items-center">
                <img
                  src={data.qrDataUrl}
                  alt="QR Code Video"
                  className="w-56 h-56 object-contain select-none"
                />
                <span className="text-[11px] text-gray-500 font-medium mt-1.5 flex items-center gap-1">
                  <Smartphone size={12} /> Scan langsung pakai kamera HP
                </span>
              </div>
            </div>

            {/* Wi-Fi Info Box */}
            <div className="p-2.5 rounded-xl bg-panel2 border border-line text-[11.5px] text-muted flex items-start gap-2.5">
              <Wifi size={16} className="text-accent shrink-0 mt-0.5" />
              <div className="leading-snug">
                <span className="font-semibold text-fg">Syarat: </span>
                HP dan komputer harus terhubung ke <b>Wi-Fi / hotspot yang sama</b> (IP: <span className="font-mono text-fg">{data.ip}</span>).
              </div>
            </div>

            {/* Link Box */}
            <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-panel2 border border-line">
              <input
                type="text"
                readOnly
                value={data.url}
                className="flex-1 bg-transparent text-[11px] font-mono text-muted outline-none px-2 truncate"
              />
              <button
                type="button"
                onClick={copyUrl}
                className="btn-soft btn-xs h-7 px-2.5 gap-1 shrink-0"
                title="Salin tautan"
              >
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                <span>{copied ? 'Tersalin' : 'Salin'}</span>
              </button>
              <button
                type="button"
                onClick={openInBrowser}
                className="btn-soft btn-xs h-7 px-2 shrink-0"
                title="Buka di browser PC"
              >
                <ExternalLink size={12} />
              </button>
            </div>
          </>
        ) : (
          <div className="py-10 text-center text-muted text-[13px]">
            Gagal memuat barcode transfer.
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-line">
          <button type="button" className="btn-soft btn-sm" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </Modal>
  );
}
