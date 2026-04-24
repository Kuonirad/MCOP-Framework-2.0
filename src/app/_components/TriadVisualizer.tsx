/**
 * Inline SVG triad visualization. Server-rendered, no client JS, no fonts
 * outside what's already preloaded in the document — zero LCP cost.
 */
export default function TriadVisualizer() {
  return (
    <figure className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
      <svg
        role="img"
        aria-labelledby="triad-title triad-desc"
        viewBox="0 0 600 360"
        className="mx-auto h-auto w-full max-w-3xl"
      >
        <title id="triad-title">MCOP triad orchestration diagram</title>
        <desc id="triad-desc">
          User input flows into the NOVA-NEO encoder, which emits a context
          tensor consumed in parallel by Stigmergy v5 and the Holographic
          Etch engine. Their outputs feed a dialectical synthesizer that
          surfaces a response in the Next.js experience and loops feedback
          back into Stigmergy v5.
        </desc>

        <defs>
          <linearGradient id="node-encoder" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="node-stig" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="node-etch" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.3" />
          </linearGradient>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#cbd5f5" />
          </marker>
        </defs>

        <g
          stroke="#64748b"
          strokeWidth="1.5"
          fill="none"
          markerEnd="url(#arrow)"
          opacity="0.75"
        >
          <path d="M90 180 L200 180" />
          <path d="M240 160 C 300 120, 340 100, 400 90" />
          <path d="M240 200 C 300 240, 340 260, 400 270" />
          <path d="M480 90 C 520 140, 520 180, 480 180" />
          <path d="M480 270 C 520 220, 520 200, 480 200" />
          <path d="M480 180 L540 180" />
          <path d="M540 200 C 440 330, 280 330, 240 220" />
        </g>

        <g fontFamily="var(--font-geist-sans), system-ui, sans-serif" fill="#e2e8f0">
          <g>
            <rect x="10" y="150" width="80" height="60" rx="14" fill="#0f172a" stroke="#475569" />
            <text x="50" y="185" textAnchor="middle" fontSize="14">Input</text>
          </g>

          <g>
            <rect x="140" y="140" width="100" height="80" rx="16" fill="url(#node-encoder)" stroke="#38bdf8" />
            <text x="190" y="175" textAnchor="middle" fontSize="14" fontWeight="600">
              NOVA-NEO
            </text>
            <text x="190" y="195" textAnchor="middle" fontSize="11" opacity="0.85">
              Encoder
            </text>
          </g>

          <g>
            <rect x="400" y="55" width="100" height="70" rx="16" fill="url(#node-stig)" stroke="#a78bfa" />
            <text x="450" y="85" textAnchor="middle" fontSize="14" fontWeight="600">
              Stigmergy
            </text>
            <text x="450" y="105" textAnchor="middle" fontSize="11" opacity="0.85">
              v5 Resonance
            </text>
          </g>

          <g>
            <rect x="400" y="240" width="100" height="70" rx="16" fill="url(#node-etch)" stroke="#34d399" />
            <text x="450" y="270" textAnchor="middle" fontSize="14" fontWeight="600">
              Holographic
            </text>
            <text x="450" y="290" textAnchor="middle" fontSize="11" opacity="0.85">
              Etch
            </text>
          </g>

          <g>
            <rect x="540" y="150" width="50" height="60" rx="14" fill="#0f172a" stroke="#94a3b8" />
            <text x="565" y="178" textAnchor="middle" fontSize="10">Dialec-</text>
            <text x="565" y="192" textAnchor="middle" fontSize="10">tical</text>
            <text x="565" y="206" textAnchor="middle" fontSize="10">Synth</text>
          </g>
        </g>
      </svg>
      <figcaption className="mt-4 text-center text-xs text-slate-400">
        Inline SVG — rendered on the server, zero client JavaScript.
      </figcaption>
    </figure>
  );
}
