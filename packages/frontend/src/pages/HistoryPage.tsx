/** Per-user transaction history: stake / withdraw / claim events with Etherscan links. */
import { useAccount } from 'wagmi';
import { useHistory } from '../hooks';
import { Badge, EmptyState } from '../components/ui';
import { fmt, txUrl } from '../format';

export function HistoryPage() {
  const { isConnected } = useAccount();
  const { data, isLoading, isError } = useHistory();

  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mt-8 mb-4">Your history</h2>

      {!isConnected ? (
        <EmptyState title="Connect your wallet" hint="Your stake, withdraw, and claim history appears here." />
      ) : isLoading ? (
        <EmptyState title="Loading history…" />
      ) : isError ? (
        <EmptyState title="Backend unavailable" hint="Start the indexer to see your history." />
      ) : !data || data.events.length === 0 ? (
        <EmptyState title="No transactions yet" hint="Stake some eSTAKE to get started." />
      ) : (
        <div className="card-glow rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-indigo/10">
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Block</th>
                <th className="px-4 py-3 font-medium text-right">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo/5">
              {data.events.map((e) => (
                <tr key={e.txHash + e.kind} className="hover:bg-indigo/5 transition">
                  <td className="px-4 py-3">
                    <Badge kind={e.kind} />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {fmt(BigInt(e.amount))} {e.kind === 'RewardPaid' ? 'eRWD' : 'eSTAKE'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{e.blockNumber}</td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={txUrl(e.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-bright hover:underline"
                    >
                      {e.txHash.slice(0, 10)}…
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
