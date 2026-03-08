import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Toaster, { toast } from './components/Toaster'
import ConfirmDialog from './components/ConfirmDialog'
import Home from './pages/Home'
import Search from './pages/Search'
import Library from './pages/Library'
import Downloads from './pages/Downloads'
import Settings from './pages/Settings'
import './styles/app.css'

const IS_ELECTRON = Boolean(window.retrio)

export default function App() {
  useEffect(() => {
    if (!IS_ELECTRON) return
    const offDone = window.retrio.onDownloadDone(() => {
      toast(`Descarga completa — juego listo para jugar`, 'success')
    })
    const offError = window.retrio.onDownloadError((data) => {
      toast(`Error en la descarga: ${data.message}`, 'error')
    })
    return () => { offDone(); offError() }
  }, [])

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
    </BrowserRouter>
  )
}
