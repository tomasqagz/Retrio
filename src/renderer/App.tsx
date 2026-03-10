import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Toaster, { toast } from './components/Toaster'
import ConfirmDialog from './components/ConfirmDialog'
import RomPickerModal from './components/RomPickerModal'
import Home from './pages/Home'
import Search from './pages/Search'
import Library from './pages/Library'
import Downloads from './pages/Downloads'
import Settings from './pages/Settings'
import './styles/app.css'

const IS_ELECTRON = Boolean(window.retrio)

export default function App() {
  const { t } = useTranslation()

useEffect(() => {
    if (!IS_ELECTRON) return
    const saved = localStorage.getItem('retrio-window-size')
    if (saved) {
      const [w, h] = saved.split('x').map(Number)
      if (w && h) void window.retrio.setWindowSize(w, h)
    }
  }, [])

  useEffect(() => {
    if (!IS_ELECTRON) return
    const offDone = window.retrio.onDownloadDone(() => {
      toast(t('app.download_complete'), 'success')
    })
    const offError = window.retrio.onDownloadError((data) => {
      toast(t('app.download_error', { message: data.message }), 'error')
    })
    return () => { offDone(); offError() }
  }, [t])

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
