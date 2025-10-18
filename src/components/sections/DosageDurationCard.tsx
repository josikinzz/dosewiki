import { ChartNoAxesCombined, Scale, Timer } from 'lucide-react';
import { SectionCard } from '../common/SectionCard';
import { IconBadge } from '../common/IconBadge';
import { RouteInfo, RouteKey } from '../../types/content';

interface DosageDurationCardProps {
  route: RouteKey;
  onRouteChange: (route: RouteKey) => void;
  routes: Record<RouteKey, RouteInfo>;
  routeOrder: RouteKey[];
  note: string;
}

function formatRouteLabel(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function DosageDurationCard({
  route,
  onRouteChange,
  routes,
  routeOrder,
  note,
}: DosageDurationCardProps) {
  const orderedRoutes = routeOrder.length
    ? routeOrder
    : (Object.keys(routes) as RouteKey[]);

  const activeRouteKey = routes[route] ? route : orderedRoutes[0];
  const activeRoute = activeRouteKey ? routes[activeRouteKey] : undefined;

  if (!activeRouteKey || !activeRoute) {
    return null;
  }

  const resolveLabel = (key: RouteKey): string => {
    const label = routes[key]?.label;
    if (label && label.trim().length > 0) {
      return label;
    }

    return formatRouteLabel(String(key));
  };

  const trimmedNote = note.trim();
  const showNote =
    trimmedNote.length > 0 && !trimmedNote.toLowerCase().startsWith('units');

  return (
    <SectionCard
      delay={0.05}
      className="border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/10 to-violet-500/10 shadow-[0_10px_30px_-12px_rgba(168,85,247,0.35)] hover:shadow-[0_18px_50px_-12px_rgba(168,85,247,0.45)]"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <IconBadge icon={ChartNoAxesCombined} label="Dosage and duration" />
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold text-fuchsia-300">Dosage & Duration</h2>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-left md:items-end md:text-right">
          {showNote && <p className="text-xs text-white/65 md:text-[13px]">{trimmedNote}</p>}
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {orderedRoutes.map((key) => {
            const info = routes[key];
            if (!info) {
              return null;
            }

            const isActive = key === activeRouteKey;
            const label = resolveLabel(key);

            return (
              <button
                key={key}
                type="button"
                onClick={() => onRouteChange(key)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                  isActive
                    ? 'border-white/40 bg-white/20 text-white shadow-[0_10px_30px_-12px_rgba(168,85,247,0.65)]'
                    : 'border-white/20 bg-white/0 text-white/75 hover:bg-white/10 hover:text-white'
                }`}
                aria-pressed={isActive}
              >
                {label}
              </button>
            );
          })}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
        <div>
          <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-white/85">
            <Scale className="h-4 w-4 text-fuchsia-200" aria-hidden="true" focusable="false" />
            <span>Dosage ({resolveLabel(activeRouteKey)})</span>
          </h3>
          <div className="space-y-1.5">
            {activeRoute.dosage.length > 0 ? (
              activeRoute.dosage.map((entry) => (
                <div
                  key={entry.label}
                  className="flex items-center justify-between gap-4 rounded-xl bg-white/[0.06] px-4 py-2 text-sm text-white/80 ring-1 ring-white/10 transition hover:bg-white/10"
                >
                  <span className="font-semibold text-white/90">{entry.label}</span>
                  <span className="text-white/75">{entry.value}</span>
                </div>
              ))
            ) : (
              <p className="rounded-xl bg-white/[0.06] px-4 py-3 text-sm italic text-white/60 ring-1 ring-dashed ring-white/15">
                Dosage guidance is not available for this route in the dataset.
              </p>
            )}
          </div>
        </div>
        <div>
          <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-white/85">
            <Timer className="h-4 w-4 text-fuchsia-200" aria-hidden="true" focusable="false" />
            <span>Duration ({resolveLabel(activeRouteKey)})</span>
          </h3>
          <div className="space-y-1.5">
            {activeRoute.duration.length > 0 ? (
              activeRoute.duration.map((entry) => (
                <div
                  key={entry.label}
                  className="flex items-center justify-between gap-4 rounded-xl bg-white/[0.06] px-4 py-2 text-sm text-white/80 ring-1 ring-white/10 transition hover:bg-white/10"
                >
                  <span className="font-semibold text-white/90">{entry.label}</span>
                  <span className="text-white/75">{entry.value}</span>
                </div>
              ))
            ) : (
              <p className="rounded-xl bg-white/[0.06] px-4 py-3 text-sm italic text-white/60 ring-1 ring-dashed ring-white/15">
                Duration details are not available for this route in the dataset.
              </p>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
