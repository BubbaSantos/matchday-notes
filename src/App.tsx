import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Home } from './pages/Home'
import { MatchDay } from './pages/MatchDay'
import { Search } from './pages/Search'
import { UpdateBanner } from './components/UpdateBanner'
import { useAppUpdate } from './hooks/useAppUpdate'

function App() {
  const updateAvailable = useAppUpdate()

  return (
    <BrowserRouter>
      <div className="min-h-screen" style={{ backgroundColor: 'var(--color-pitch)' }}>
        {updateAvailable && <UpdateBanner />}
        <Nav />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/match/:id" element={<MatchDay />} />
            <Route path="/search" element={<Search />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
