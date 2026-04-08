import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { FilterProvider } from './lib/FilterContext.jsx'
import Sidebar from './components/Sidebar.jsx'
import Header from './components/Header.jsx'
import ChatBot from './components/ChatBot.jsx'

const ExecutiveCockpit = lazy(() => import('./pages/ExecutiveCockpit.jsx'))
const WarRoom = lazy(() => import('./pages/WarRoom.jsx'))
const SocialMedia = lazy(() => import('./pages/SocialMedia.jsx'))
const BattleMatrix = lazy(() => import('./pages/BattleMatrix.jsx'))
const VoiceOfCustomer = lazy(() => import('./pages/VoiceOfCustomer.jsx'))
const Stores = lazy(() => import('./pages/Stores.jsx'))
const ActionCenter = lazy(() => import('./pages/ActionCenter.jsx'))
const ScrapingHub = lazy(() => import('./pages/ScrapingHub.jsx'))
const ScrapingResults = lazy(() => import('./pages/ScrapingResults.jsx'))
const DataManager = lazy(() => import('./pages/DataManager.jsx'))
const Automation = lazy(() => import('./pages/Automation.jsx'))
const ComexReport = lazy(() => import('./pages/ComexReport.jsx'))

function RouteFallback() {
  return (
    <div className="strategic-hero loading-wrap">
      <div className="spinner" />
      <div className="loading-text">Chargement de la vue...</div>
    </div>
  )
}

export default function App() {
  return (
    <FilterProvider>
      <div className="layout">
        <Sidebar />
        <div className="main-wrapper">
          <Header />
          <main className="main-content">
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<ExecutiveCockpit />} />
                <Route path="/overview" element={<Navigate to="/" replace />} />
                <Route path="/war-room" element={<WarRoom />} />
                <Route path="/social" element={<SocialMedia />} />
                <Route path="/battle-matrix" element={<BattleMatrix />} />
                <Route path="/voix-du-client" element={<VoiceOfCustomer />} />
                <Route path="/magasins" element={<Stores />} />
                <Route path="/action-center" element={<ActionCenter />} />

                <Route path="/alertes" element={<Navigate to="/war-room" replace />} />
                <Route path="/reputation" element={<Navigate to="/war-room" replace />} />
                <Route path="/benchmark" element={<Navigate to="/battle-matrix" replace />} />
                <Route path="/cx" element={<Navigate to="/voix-du-client" replace />} />
                <Route path="/verbatims" element={<Navigate to="/voix-du-client" replace />} />
                <Route path="/scraping-brand" element={<Navigate to="/magasins" replace />} />
                <Route path="/scraping-competitor" element={<Navigate to="/voix-du-client" replace />} />
                <Route path="/actions" element={<Navigate to="/action-center" replace />} />

                <Route path="/scraping" element={<ScrapingHub />} />
                <Route path="/scraping/results" element={<ScrapingResults />} />
                <Route path="/automation" element={<Automation />} />
                <Route path="/data" element={<DataManager />} />
                <Route path="/comex" element={<ComexReport />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
      <ChatBot />
    </FilterProvider>
  )
}
