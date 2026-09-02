import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Home } from './pages/Home'
import { MatchDay } from './pages/MatchDay'
import { Search } from './pages/Search'
import { Login } from './pages/Login'
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
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
