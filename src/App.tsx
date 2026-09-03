import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Home } from './pages/Home'
import { MatchDay } from './pages/MatchDay'
import { Search } from './pages/Search'
import { Login } from './pages/Login'
import { History } from './pages/History'
import { HistoricalMatch } from './pages/HistoricalMatch'
import { UpdateBanner } from './components/UpdateBanner'
import { useAppUpdate } from './hooks/useAppUpdate'
import { AuthProvider } from './hooks/useAuth'

function App() {
  const updateAvailable = useAppUpdate()

  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen" style={{ backgroundColor: 'var(--color-pitch)' }}>
          {updateAvailable && <UpdateBanner />}
          <Nav />
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/match/:id" element={<MatchDay />} />
              <Route path="/search" element={<Search />} />
              <Route path="/login" element={<Login />} />
              <Route path="/history" element={<History />} />
              <Route path="/history/match/:slug" element={<HistoricalMatch />} />
              <Route path="/history/:year" element={<History />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
