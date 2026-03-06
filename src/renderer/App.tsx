import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Toaster, { toast } from './components/Toaster'
import Home from './pages/Home'
import Search from './pages/Search'
import Library from './pages/Library'
import Settings from './pages/Settings'
import './styles/app.css'

const IS_ELECTRON = Boolean(window.retrio)

export default function App() {
  useEffect(() => {
    if (!IS_ELECTRON) return
    window.retrio.onDownloadDone((data) => {
      toast(`Descarga completa — juego listo para jugar`, 'success')
      void data
    })
    window.retrio.onDownloadError((data) => {
      toast(`Error en la descarga: ${data.message}`, 'error')
    })
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
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
      <Toaster />
    </BrowserRouter>
  )
}
