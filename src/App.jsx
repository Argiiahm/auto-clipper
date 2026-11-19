import React, { useCallback, useEffect, useState } from 'react';
import { api, call } from './lib/api';
import { applyTheme } from './lib/theme';
import Home from './pages/Home.jsx';
import Project from './pages/Project.jsx';
import Settings from './components/Settings.jsx';
import { Toaster, toast } from './components/ui.jsx';

export default function App() {
  const [settings, setSettings] = useState(null);
  const [route, setRoute] = useState({ page: 'home' });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('ai');

  const loadSettings = useCallback(async () => {
    try { const s = await call('settings:get'); setSettings(s); applyTheme(s.theme); } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => api.on('theme:updated', () => applyTheme(settings ? settings.theme : 'system')), [settings && settings.theme]);

  const saveSettings = async (patch) => { const s = await call('settings:save', patch); setSettings(s); if (patch && patch.theme !== undefined) applyTheme(s.theme); return s; };
  const setTheme = async (t) => {
    applyTheme(t);
    setSettings((s) => (s ? { ...s, theme: t } : s));
    try { await call('settings:save', { theme: t }); await call('theme:set', t); } catch (e) { toast(e.message, 'error'); }
  };
  const openSettings = (tab) => { setSettingsTab(typeof tab === 'string' ? tab : 'ai'); setShowSettings(true); };
  const hasKey = settings && ((settings.keys || {})[settings.llmProvider] || settings.llmProvider === 'custom');

  return (
    <div className="h-full flex flex-col">
      {route.page === 'home' && settings && (
        <Home settings={settings} hasKey={hasKey} openSettings={openSettings} setTheme={setTheme} openProject={(id) => setRoute({ page: 'project', id })} />
      )}
      {route.page === 'project' && settings && (
        <Project id={route.id} settings={settings} saveSettings={saveSettings} setTheme={setTheme} back={() => setRoute({ page: 'home' })} openSettings={openSettings} />
      )}
      <Settings open={showSettings} initialTab={settingsTab} onClose={() => setShowSettings(false)} settings={settings} save={saveSettings} />
      <Toaster />
    </div>
  );
}
