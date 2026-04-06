import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Header from './components/Header.jsx'
import Overview from './pages/Overview.jsx'
import Reputation from './pages/Reputation.jsx'
import Benchmark from './pages/Benchmark.jsx'
import CX from './pages/CX.jsx'
import ScrapingHub from './pages/ScrapingHub.jsx'
import Automation from './pages/Automation.jsx'
import DataManager from './pages/DataManager.jsx'
import ComexReport from './pages/ComexReport.jsx'
import ScrapingResults from './pages/ScrapingResults.jsx'
import ScrapingBrand from './pages/ScrapingBrand.jsx'
import ScrapingCompetitor from './pages/ScrapingCompetitor.jsx'

export default function App() {
  return (
    <div className="layout">
      <Sidebar />
      <div className="main-wrapper">
        <Header />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/scraping-brand" element={<ScrapingBrand />} />
            <Route path="/scraping-competitor" element={<ScrapingCompetitor />} />
            <Route path="/reputation" element={<Reputation />} />
            <Route path="/benchmark" element={<Benchmark />} />
            <Route path="/cx" element={<CX />} />
            <Route path="/scraping" element={<ScrapingHub />} />
            <Route path="/scraping/results" element={<ScrapingResults />} />
            <Route path="/automation" element={<Automation />} />
            <Route path="/data" element={<DataManager />} />
            <Route path="/comex" element={<ComexReport />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
