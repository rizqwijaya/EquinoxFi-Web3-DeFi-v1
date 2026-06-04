/**
 * EquinoxFi dApp — root component (scaffold).
 *
 * The full wallet/stake/withdraw/claim flow (wagmi + viem + react-query,
 * approval handling, Etherscan tx links) is implemented in Phase 6. This
 * scaffold renders the hero with the protocol tagline so the package builds
 * and runs end-to-end from the start.
 */
export function App() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-5xl font-bold text-aurora">EquinoxFi</h1>
      <p className="mt-4 text-xl text-indigo">Balance at the heart of yield.</p>
    </main>
  );
}
