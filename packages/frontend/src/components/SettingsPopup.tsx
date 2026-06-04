/**
 * Transaction settings popup (slippage tolerance + deadline), shared by the
 * Swap and Stake cards. The values flow back to the parent, which uses them to
 * compute `amountOutMin`/`amountMin` and the router `deadline` argument.
 */
export function SettingsPopup({
  slippage,
  setSlippage,
  deadline,
  setDeadline,
  onClose,
}: {
  slippage: string;
  setSlippage: (v: string) => void;
  deadline: string;
  setDeadline: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-10 z-50 w-72 rounded-2xl bg-[#11162e] border border-indigo/20 shadow-2xl shadow-indigo/10 p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <span className="font-semibold text-sm text-slate-200">Transaction settings</span>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">
          ×
        </button>
      </div>

      <div className="mb-4">
        <div className="text-xs text-slate-500 mb-2">Max slippage</div>
        <div className="flex gap-2">
          {['0.1', '0.5', '1.0'].map((v) => (
            <button
              key={v}
              onClick={() => setSlippage(v)}
              className={`flex-1 rounded-xl py-1.5 text-sm font-semibold border transition ${
                slippage === v
                  ? 'border-aurora text-aurora bg-aurora/10'
                  : 'border-white/10 text-slate-400 hover:border-white/20'
              }`}
            >
              {v}%
            </button>
          ))}
          <div className="flex-1 flex items-center rounded-xl border border-white/10 px-2">
            <input
              value={slippage}
              onChange={(e) => setSlippage(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="Custom"
              className="w-full bg-transparent text-sm text-slate-300 outline-none placeholder:text-slate-600"
            />
            <span className="text-slate-500 text-sm">%</span>
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs text-slate-500 mb-2">Transaction deadline</div>
        <div className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2">
          <input
            value={deadline}
            onChange={(e) => setDeadline(e.target.value.replace(/[^0-9]/g, ''))}
            className="w-full bg-transparent text-sm text-slate-300 outline-none"
          />
          <span className="text-slate-500 text-sm shrink-0">minutes</span>
        </div>
      </div>
    </div>
  );
}

/** The gear icon used to toggle the {SettingsPopup}. */
export function GearIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 ${className}`} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 15.667a3.667 3.667 0 1 1 0-7.334 3.667 3.667 0 0 1 0 7.334zm8.793-2.49a1 1 0 0 0 .9-1.122 9.02 9.02 0 0 0 0-1.11 1 1 0 0 0-.9-1.123l-1.072-.12a7.016 7.016 0 0 0-.57-1.375l.666-.87a1 1 0 0 0-.082-1.316 9.055 9.055 0 0 0-.786-.785 1 1 0 0 0-1.316-.083l-.87.667a7.016 7.016 0 0 0-1.375-.57l-.12-1.072A1 1 0 0 0 14.145 4a9.02 9.02 0 0 0-1.11 0 1 1 0 0 0-1.122.9l-.12 1.072a7.016 7.016 0 0 0-1.375.57l-.87-.666a1 1 0 0 0-1.316.082 9.055 9.055 0 0 0-.785.786 1 1 0 0 0-.083 1.316l.667.87a7.016 7.016 0 0 0-.57 1.375l-1.072.12A1 1 0 0 0 4 11.855a9.02 9.02 0 0 0 0 1.11 1 1 0 0 0 .9 1.122l1.072.12a7.016 7.016 0 0 0 .57 1.375l-.666.87a1 1 0 0 0 .082 1.316 9.055 9.055 0 0 0 .786.785 1 1 0 0 0 1.316.083l.87-.667a7.016 7.016 0 0 0 1.375.57l.12 1.072A1 1 0 0 0 11.855 20a9.02 9.02 0 0 0 1.11 0 1 1 0 0 0 1.122-.9l.12-1.072a7.016 7.016 0 0 0 1.375-.57l.87.666a1 1 0 0 0 1.316-.082 9.055 9.055 0 0 0 .785-.786 1 1 0 0 0 .083-1.316l-.667-.87a7.016 7.016 0 0 0 .57-1.375l1.072-.12z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}
