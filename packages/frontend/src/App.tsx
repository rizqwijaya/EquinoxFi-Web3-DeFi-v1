/**
 * EquinoxFi dApp root: routed layout shell (Stake / Analytics / History) with a
 * sticky navbar and an aurora deep-space backdrop. GENERAL.md Section 0/8.
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { SwapPage } from './pages/SwapPage';
import { PoolPage } from './pages/PoolPage';
import { StakePage } from './pages/StakePage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { HistoryPage } from './pages/HistoryPage';

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen aurora-bg flex flex-col">
        {/* floating orbs */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
          <div className="absolute top-20 -left-20 h-72 w-72 rounded-full bg-indigo/20 blur-3xl animate-float" />
          <div className="absolute bottom-10 right-0 h-80 w-80 rounded-full bg-aurora/10 blur-3xl animate-pulse-slow" />
        </div>

        <Navbar />

        <main className="flex-1 w-full mx-auto max-w-6xl px-4 sm:px-6 pb-16">
          <Routes>
            <Route path="/" element={<SwapPage />} />
            <Route path="/pool" element={<PoolPage />} />
            <Route path="/stake" element={<StakePage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Routes>
        </main>

        <footer className="border-t border-indigo/10 py-5 text-center text-xs text-slate-600">
          EquinoxFi · Sepolia testnet · Balance at the heart of yield.
        </footer>
      </div>
    </BrowserRouter>
  );
}
