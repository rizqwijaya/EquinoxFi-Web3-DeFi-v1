/**
 * EquinoxFi dApp root: routed layout shell (Stake / Analytics / History) with a
 * sticky navbar and an aurora deep-space backdrop. GENERAL.md Section 0/8.
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { ScrollToTop } from './components/ScrollToTop';
import { HomePage } from './pages/HomePage';
import { SwapPage } from './pages/SwapPage';
import { PoolPage } from './pages/PoolPage';
import { StakePage } from './pages/StakePage';
import { PortfolioPage } from './pages/PortfolioPage';
import { FaucetPage } from './pages/FaucetPage';

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
            <Route path="/" element={<HomePage />} />
            <Route path="/swap" element={<SwapPage />} />
            <Route path="/pool" element={<PoolPage />} />
            <Route path="/stake" element={<StakePage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/faucet" element={<FaucetPage />} />
          </Routes>
        </main>

        <ScrollToTop />
      </div>
    </BrowserRouter>
  );
}
