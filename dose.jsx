import { useState } from "react";
import { motion } from "framer-motion";

export default function DoseWikiLSD() {
  const roaOptions = {
    oral: {
      dosage: [
        ["Threshold", "10–20 µg"],
        ["Light", "20–75 µg"],
        ["Common", "75–150 µg"],
        ["Strong", "150–300 µg"],
        ["Heavy", "300+ µg"],
      ],
      duration: [
        ["Total Duration", "8–12 hours"],
        ["Onset", "20–90 minutes"],
        ["Peak", "2–6 hours"],
        ["Offset", "6–12 hours"],
        ["After Effects", "Up to 24 hours (residual stimulation, afterglow)"],
      ],
    },
    sublingual: {
      dosage: [
        ["Threshold", "5–15 µg"],
        ["Light", "15–60 µg"],
        ["Common", "60–125 µg"],
        ["Strong", "125–250 µg"],
        ["Heavy", "250+ µg"],
      ],
      duration: [
        ["Total Duration", "6–10 hours"],
        ["Onset", "15–60 minutes"],
        ["Peak", "2–5 hours"],
        ["Offset", "5–10 hours"],
        ["After Effects", "Up to 20 hours"],
      ],
    },
    rectal: {
      dosage: [
        ["Threshold", "5–15 µg"],
        ["Light", "15–60 µg"],
        ["Common", "60–125 µg"],
        ["Strong", "125–250 µg"],
        ["Heavy", "250+ µg"],
      ],
      duration: [
        ["Total Duration", "6–10 hours"],
        ["Onset", "10–45 minutes"],
        ["Peak", "2–5 hours"],
        ["Offset", "5–10 hours"],
        ["After Effects", "Up to 20 hours"],
      ],
    },
  };

  const [roa, setRoa] = useState("oral");

  const cardAnim = {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#0b0818] via-[#130e2b] to-[#0f0a1f] text-white selection:bg-fuchsia-500/30">
      {/* Ambient blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="absolute top-40 -right-24 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur  bg-[#0f0a1f]/70 border-b border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-fuchsia-500 to-violet-500 shadow-lg shadow-fuchsia-500/30" />
            <span className="text-xl font-bold tracking-tight">dose.wiki</span>
          </div>

          <div className="ml-auto hidden md:flex items-center gap-4">
            <nav className="flex items-center gap-6 text-sm text-white/80">
              <a className="hover:text-white transition-colors" href="#">Substances</a>
              <a className="hover:text-white transition-colors" href="#">Interactions</a>
              <a className="hover:text-white transition-colors" href="#">Effects</a>
            </nav>
            {/* Search */}
            <div className="relative">
              <input
                type="search"
                placeholder="Search..."
                className="w-48 lg:w-64 rounded-xl bg-white/10 ring-1 ring-white/15 focus:ring-2 focus:ring-fuchsia-400/40 focus:outline-none px-8 py-1.5 text-sm placeholder-white/50"
              />
              <svg aria-hidden="true" className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <button className="rounded-xl bg-white/10 hover:bg-white/15 px-3 py-1.5 text-white/90 ring-1 ring-white/15 transition">Donate</button>
          </div>
        </div>
      </header>

      {/* Hero / Title */}
      <section className="mx-auto max-w-6xl px-4 pt-14 pb-6 text-center">
        <div className="flex flex-col items-center gap-6">
          <h1 className="mt-2 text-4xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-fuchsia-300 via-violet-200 to-fuchsia-100 bg-clip-text text-transparent drop-shadow-[0_1px_0_rgba(255,255,255,0.15)]">
            LSD
          </h1>
          <p className="text-white/80 text-base md:text-lg -mt-2">Lysergic acid diethylamide</p>
          {/* Molecule Placeholder */}
          <div className="mt-4 h-48 w-48 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            Molecule Diagram Placeholder
          </div>
          {/* Meta badges */}
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            {[
              { label: 'Half-life: 3–5 hours', emoji: 'λ' },
              { label: 'Chemical: Ergolines', emoji: '🔬' },
              { label: 'Class: Psychedelic', emoji: '🧠' },
            ].map((t) => (
              <span
                key={t.label}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-tr from-white/10 to-white/5 ring-1 ring-white/20 px-5 py-2.5 text-base text-white/90 shadow-sm shadow-fuchsia-500/10 hover:ring-white/30 transition leading-none"
              >
                <span className="text-xl leading-none translate-y-[1px]">{t.emoji}</span>
                <span className="tracking-wide font-medium">{t.label}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Content Grid */}
      <main className="mx-auto max-w-3xl md:max-w-4xl px-4 pb-20">
        <div className="space-y-10 md:space-y-12">
          {/* Combined Dosage + Duration Card */}
          <motion.section
            {...cardAnim}
            transition={{ ...cardAnim.transition, delay: 0.05 }}
            className="rounded-2xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/10 to-violet-500/10 p-6 shadow-[0_10px_30px_-12px_rgba(168,85,247,0.35)] hover:shadow-[0_18px_50px_-12px_rgba(168,85,247,0.45)] transition"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-3">
                <IconBadge>⏱️</IconBadge>
                Dosage & Duration
              </h2>
              <div className="relative">
                <label htmlFor="roa" className="sr-only">Route of administration</label>
                <select
                  id="roa"
                  value={roa}
                  onChange={(e) => setRoa(e.target.value)}
                  className="appearance-none bg-white/10 text-white text-sm rounded-lg pl-3 pr-8 py-2 border border-white/20 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/40 focus:border-fuchsia-400/40 transition"
                >
                  {Object.keys(roaOptions).map((key) => (
                    <option key={key} value={key} className="bg-[#130e2b]">
                      {key.charAt(0).toUpperCase() + key.slice(1)}
                    </option>
                  ))}
                </select>
                <svg aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 opacity-70" viewBox="0 0 20 20" fill="currentColor"><path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"/></svg>
              </div>
            </div>
            <p className="text-xs text-white/70 mt-2">Units in micrograms (µg). Verify source and measurement accuracy.</p>
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Dosage */}
              <div>
                <h3 className="text-sm font-semibold mb-3 opacity-90">Dosage ({roa})</h3>
                <div className="space-y-2">
                  {roaOptions[roa].dosage.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between rounded-xl bg-white/5 ring-1 ring-white/10 px-4 py-2.5 hover:bg-white/10 transition">
                      <span className="text-white/80">{label}</span>
                      <span className="font-semibold tracking-tight">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Duration */}
              <div>
                <h3 className="text-sm font-semibold mb-3 opacity-90">Duration ({roa})</h3>
                <div className="space-y-2">
                  {roaOptions[roa].duration.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between rounded-xl bg-white/5 ring-1 ring-white/10 px-4 py-2.5 hover:bg-white/10 transition">
                      <span className="text-white/80">{label}</span>
                      <span className="font-semibold tracking-tight">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.section>

          {/* Addiction Card */}
          <motion.section
            {...cardAnim}
            transition={{ ...cardAnim.transition, delay: 0.1 }}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)] transition"
          >
            <h2 className="text-xl font-semibold flex items-center gap-3">
              <IconBadge>⚠️</IconBadge>
              Addiction Potential
            </h2>
            <p className="mt-3 text-[0.95rem] leading-7 text-white/85">
              LSD is not considered physically addictive and has a low potential for psychological dependence. Tolerance develops rapidly but also dissipates quickly.
            </p>
          </motion.section>

          {/* Subjective Effects */}
          <motion.section
            {...cardAnim}
            transition={{ ...cardAnim.transition, delay: 0.15 }}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)] transition"
          >
            <h2 className="text-xl font-semibold">Subjective Effects</h2>
            <p className="text-sm text-white/70 mt-2">Effects vary widely by individual, dose, and context.</p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {[
                'Visual hallucinations',
                'Altered thinking and perception',
                'Euphoria',
                'Synesthesia',
                'Time distortion',
                'Spiritual experiences',
                'Anxiety',
                'Paranoia',
                'Enhanced creativity',
              ].map((tag) => (
                <span key={tag} className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs ring-1 ring-white/10 text-white/85 hover:bg-white/10 transition">{tag}</span>
              ))}
            </div>
          </motion.section>

          {/* Interactions */}
          <motion.section
            {...cardAnim}
            transition={{ ...cardAnim.transition, delay: 0.2 }}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)] transition space-y-4"
          >
            <h2 className="text-xl font-semibold">Interactions</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 ring-1 ring-white/10">
                <h3 className="font-semibold flex items-center gap-2">⚠️ Dangerous</h3>
                <ul className="mt-2 text-sm text-white/85 list-disc list-inside space-y-1">
                  <li>Tramadol (risk of seizures)</li>
                  <li>Lithium (risk of seizures)</li>
                </ul>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 ring-1 ring-white/10">
                <h3 className="font-semibold flex items-center gap-2">⚠️ Unsafe</h3>
                <ul className="mt-2 text-sm text-white/85 list-disc list-inside space-y-1">
                  <li>MAOIs (risk of unpredictable effects)</li>
                </ul>
              </div>
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 ring-1 ring-white/10">
                <h3 className="font-semibold flex items-center gap-2">⚠️ Caution</h3>
                <ul className="mt-2 text-sm text-white/85 list-disc list-inside space-y-1">
                  <li>SSRIs (may reduce effects)</li>
                  <li>Antipsychotics (may block effects)</li>
                </ul>
              </div>
            </div>
          </motion.section>

          {/* Tolerance */}
          <motion.section
            {...cardAnim}
            transition={{ ...cardAnim.transition, delay: 0.25 }}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)] transition"
          >
            <h2 className="text-lg font-semibold">Tolerance</h2>
            <div className="mt-3 grid sm:grid-cols-2 gap-2">
              {[
                ['Full', 'After 3–4 consecutive days of use'],
                ['Half', '3–7 days'],
                ['Zero', '~2 weeks'],
                ['Cross', 'Other psychedelics (e.g., psilocybin, mescaline)'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-xl bg-white/5 ring-1 ring-white/10 px-4 py-2.5">
                  <span className="text-white/80 font-medium">{label}</span>
                  <span className="text-sm text-white/85">{value}</span>
                </div>
              ))}
            </div>
          </motion.section>

          {/* Notes */}
          <motion.section
            {...cardAnim}
            transition={{ ...cardAnim.transition, delay: 0.3 }}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)] transition"
          >
            <h2 className="text-xl font-semibold">Notes</h2>
            <p className="mt-3 text-[0.95rem] leading-7 text-white/85">
              LSD is a powerful hallucinogen with extremely high potency. It is illegal in most countries and classified as a Schedule I/Class A drug. While generally considered physically safe, it can cause intense psychological effects, including anxiety, paranoia, and, rarely, persistent perceptual changes (HPPD). Set and setting are crucial for safe use. Not recommended for individuals with a personal or family history of psychotic disorders.
            </p>
          </motion.section>

          {/* Citations */}
          <motion.section
            {...cardAnim}
            transition={{ ...cardAnim.transition, delay: 0.35 }}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)] transition"
          >
            <h2 className="text-xl font-semibold">Citations</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                'TripSit LSD Factsheet',
                'DrugWise LSD Information',
                'DrugBank: Lysergic Acid Diethylamide',
              ].map((src) => (
                <li key={src} className="flex items-center gap-2 text-white/85">
                  <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
                  <span className="hover:text-white transition-colors cursor-pointer">{src}</span>
                </li>
              ))}
            </ul>
          </motion.section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-10 flex flex-col md:flex-row gap-4 items-center justify-between text-xs text-white/60">
          <p>
            © {new Date().getFullYear()} dose.wiki • Data provided by rc.community — Use responsibly
          </p>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-white">Privacy</a>
            <a href="#" className="hover:text-white">Terms</a>
            <a href="#" className="hover:text-white">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function IconBadge({ children }) {
  return (
    <span className="inline-grid place-items-center h-8 w-8 rounded-xl bg-white/10 ring-1 ring-white/15 leading-none">
      <span className="text-base md:text-lg translate-y-[0.5px]">{children}</span>
    </span>
  );
}

function InfoRow({ title, value, icon }) {
  return (
    <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
      <div className="text-xs uppercase tracking-wide text-white/60">{icon} {title}</div>
      {typeof value === 'string' ? (
        <p className="mt-1 text-sm text-white/80">{value}</p>
      ) : (
        <div className="mt-1">{value}</div>
      )}
    </div>
  );
}
