/**
 * Decorative, blurred crypto-token coins scattered behind the homepage hero:
 * a nod to a landing page's floating, out-of-focus token art.
 *
 * Purely cosmetic: `pointer-events-none` and `aria-hidden`, rendered behind the
 * hero content (which sits at `z-10`). Icons are imported from the bundled
 * `cryptocurrency-icons` package and emitted as hashed assets by Vite, so they
 * load from our own origin — no third-party CDN, works offline and regardless
 * of ad-blockers. Each coin floats on the shared `float` keyframe with a
 * staggered delay so the cluster drifts gently rather than in lockstep.
 */
import ethIcon from 'cryptocurrency-icons/svg/color/eth.svg';
import btcIcon from 'cryptocurrency-icons/svg/color/btc.svg';
import solIcon from 'cryptocurrency-icons/svg/color/sol.svg';
import usdtIcon from 'cryptocurrency-icons/svg/color/usdt.svg';
import bnbIcon from 'cryptocurrency-icons/svg/color/bnb.svg';
import maticIcon from 'cryptocurrency-icons/svg/color/matic.svg';
import avaxIcon from 'cryptocurrency-icons/svg/color/avax.svg';
import xrpIcon from 'cryptocurrency-icons/svg/color/xrp.svg';

/** Bundled icon URL per symbol (resolved by Vite at build time). */
const ICONS: Record<string, string> = {
  eth: ethIcon,
  btc: btcIcon,
  sol: solIcon,
  usdt: usdtIcon,
  bnb: bnbIcon,
  matic: maticIcon,
  avax: avaxIcon,
  xrp: xrpIcon,
};

/** One floating coin: symbol + placement, size, blur strength, and drift delay. */
type Blob = {
  sym: keyof typeof ICONS;
  /** Tailwind position utilities (top/left/right/bottom). */
  pos: string;
  /** Tailwind size utility, e.g. `h-20 w-20`. */
  size: string;
  /** Tailwind blur utility: larger = further "out of focus". */
  blur: string;
  /** Tailwind opacity utility. */
  opacity: string;
  /** Inline animation-delay (seconds) so coins drift out of phase. */
  delay: number;
};

// Hand-placed cluster framing the hero card. Kept sparse on small screens via
// the `hidden`/`sm:block` wrappers below; positions assume the centered hero.
const BLOBS: Blob[] = [
  { sym: 'eth',   pos: 'top-[18%] left-[8%]',     size: 'h-24 w-24', blur: 'blur-[2px]', opacity: 'opacity-80', delay: 0 },
  { sym: 'btc',   pos: 'top-[10%] right-[10%]',   size: 'h-20 w-20', blur: 'blur-[3px]', opacity: 'opacity-70', delay: 1.4 },
  { sym: 'sol',   pos: 'bottom-[14%] left-[14%]', size: 'h-16 w-16', blur: 'blur-[2px]', opacity: 'opacity-70', delay: 2.2 },
  { sym: 'usdt',  pos: 'bottom-[8%] right-[16%]', size: 'h-20 w-20', blur: 'blur-[4px]', opacity: 'opacity-60', delay: 0.8 },
  { sym: 'bnb',   pos: 'top-[42%] left-[2%]',     size: 'h-14 w-14', blur: 'blur-[5px]', opacity: 'opacity-50', delay: 3.1 },
  { sym: 'matic', pos: 'top-[48%] right-[3%]',    size: 'h-16 w-16', blur: 'blur-[4px]', opacity: 'opacity-60', delay: 1.9 },
  { sym: 'avax',  pos: 'top-[4%] left-[34%]',     size: 'h-12 w-12', blur: 'blur-[6px]', opacity: 'opacity-40', delay: 2.6 },
  { sym: 'xrp',   pos: 'bottom-[4%] left-[40%]',  size: 'h-14 w-14', blur: 'blur-[6px]', opacity: 'opacity-40', delay: 0.4 },
];

export function TokenBlobs() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
      {BLOBS.map(({ sym, pos, size, blur, opacity, delay }) => (
        <img
          key={sym}
          src={ICONS[sym]}
          alt=""
          loading="lazy"
          draggable={false}
          className={`absolute ${pos} ${size} ${blur} ${opacity} animate-float select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.4)]`}
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </div>
  );
}
