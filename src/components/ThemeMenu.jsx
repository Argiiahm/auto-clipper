import React from 'react';
import { Monitor, Sun, Moon } from 'lucide-react';
import { Menu, MenuItem } from './ui.jsx';
import { resolveTheme } from '../lib/theme';

export const THEMES = [['system', 'Ikuti sistem', Monitor], ['light', 'Terang', Sun], ['dark', 'Gelap', Moon]];

export default function ThemeMenu({ value, onChange, align = 'right', up }) {
  const Icon = resolveTheme(value) === 'dark' ? Moon : Sun;
  return (
    <Menu align={align} button={({ toggle }) => <button className="icon-btn" title="Tema" onClick={toggle}><Icon size={16} /></button>}>
      <div className="px-3 pt-1.5 pb-1 text-[11px] text-muted">Tema</div>
      {THEMES.map(([k, l, I]) => <MenuItem key={k} icon={<I size={14} />} active={(value || 'system') === k} onClick={() => onChange(k)}>{l}</MenuItem>)}
    </Menu>
  );
}
