import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Toaster, { toast } from './components/Toaster'
import ConfirmDialog from './components/ConfirmDialog'
import RomPickerModal from './components/RomPickerModal'
import SplashScreen from './components/SplashScreen'
import Onboarding from './components/Onboarding'
import Home from './pages/Home'
import Search from './pages/Search'
import Library from './pages/Library'
import Downloads from './pages/Downloads'
import Settings from './pages/Settings'
import './styles/app.css'

const IS_ELECTRON = Boolean(window.retrio)

type Phase = 'splash' | 'onboarding' | 'ready'

export default function App() {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('splash')
  const [isFirstRun, setIsFirstRun] = useState(false)

  useEffect(() => {
    if (!IS_ELECTRON) { setPhase('ready'); return }
    if (localStorage.getItem('retrio-onboarding-done')) return
    void window.retrio.getIgdbCredentials().then(({ clientId }) => {
      if (!clientId) {
        setIsFirstRun(true)
      } else {
        localStorage.setItem('retrio-onboarding-done', '1')
      }
    })
  }, [])

  useEffect(() => {
    if (!IS_ELECTRON || phase !== 'ready') return
    const saved = localStorage.getItem('retrio-window-size')
    if (saved) {
      const [w, h] = saved.split('x').map(Number)
      if (w && h) void window.retrio.setWindowSize(w, h)
    }
  }, [phase])

  useEffect(() => {
    if (!IS_ELECTRON || phase !== 'ready') return
    const offDone = window.retrio.onDownloadDone(() => {
      toast(t('app.download_complete'), 'success')
    })
    const offError = window.retrio.onDownloadError((data) => {
      toast(t('app.download_error', { message: data.message }), 'error')
    })
    return () => { offDone(); offError() }
  }, [t, phase])

  if (phase === 'splash') {
    return (
      <SplashScreen
        onDone={() => setPhase(isFirstRun ? 'onboarding' : 'ready')}
      />
    )
  }

  if (phase === 'onboarding') {
    return <Onboarding onDone={() => setPhase('ready')} />
  }

  return (
    <BrowserRouter>
      <div className="app-layout">
        <Sidebar />
        <main className="app-content">
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/library" element={<Library />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
      <Toaster />
      <ConfirmDialog />
      <RomPickerModal />
    </BrowserRouter>
  )
}
