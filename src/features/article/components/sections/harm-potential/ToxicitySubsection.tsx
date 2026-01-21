import { useState } from "react";
import { Icon } from "@/components/common/Icon";
import { ExpandButton } from "@/components/common/ExpandButton";
import { NormalizedHarmPotential } from "./HarmPotentialUtils";
import { CarcinogenicityLevelBadge, EvidenceLevelIndicator, EVIDENCE_LEVEL_CONFIG, CARCINOGENICITY_LEVEL_CONFIG, CarcinogenicityLevel } from "./HarmPotentialBadges";

interface ToxicitySubsectionProps {
  toxicity: NormalizedHarmPotential['toxicity'];
}

// Mapping of organ system names to their icons
const ORGAN_SYSTEM_ICONS: Record<string, string> = {
  "Urinary System": "healthicons:bladder-outline",
  "Hepatic": "healthicons:liver-alt-outline",
  "Central Nervous System": "healthicons:nerve",
  "Renal": "healthicons:kidneys-outline-24px",
  "Respiratory": "tabler:lungs",
  "Cardiovascular": "icon-park-outline:heart",
  "Digestive": "covid:symptoms-nausea",
  "Hematological": "hugeicons:blood",
  "Dermatological": "material-symbols-light:dermatology-outline-rounded",
  "Endocrine": "tabler:adjustments",
  "Immunological": "tabler:virus",
  "Musculoskeletal": "healthicons:skeleton",
};

function LD50Display({ toxicity }: { toxicity: NormalizedHarmPotential['toxicity'] }) {
  const { ld50, ld50String } = toxicity;
  const hasLD50 = ld50.length > 0 || ld50String.trim().length > 0;

  if (!hasLD50) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 break-inside-avoid">
      <div className="flex items-center gap-2">
        <Icon icon="tabler:grave" size={18} className="text-fuchsia-300" />
        <h4 className="font-semibold text-white">LD50</h4>
      </div>

      {ld50String ? (
        <p className="text-sm text-white/80">{ld50String}</p>
      ) : ld50.length === 1 && !ld50[0].species ? (
        <p className="text-sm text-white/80">
          {ld50[0].unit || `${ld50[0].value} ${ld50[0].unit}`}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/10 text-xs uppercase tracking-wider text-white/70">
                <th className="px-4 py-2 text-left font-medium">Species</th>
                <th className="px-4 py-2 text-left font-medium">Route</th>
                <th className="px-4 py-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-white/5">
              {ld50.map((entry, idx) => (
                <tr key={idx} className="transition hover:bg-white/10">
                  <td className="px-4 py-2 font-medium text-white/90">{entry.species || "—"}</td>
                  <td className="px-4 py-2 text-white/70">{entry.route || "—"}</td>
                  <td className="px-4 py-2 text-right font-mono text-white/90">
                    {entry.value != null ? `${entry.value} ${entry.unit}` : entry.unit || "—"}
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

interface OrganToxicityEntry {
  system?: string;
  findings?: string;
  mechanism?: string;
  notes?: string;
}

function OrganToxicityCard({ entry }: { entry: OrganToxicityEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!entry.mechanism || !!entry.notes;
  const systemIcon = entry.system ? ORGAN_SYSTEM_ICONS[entry.system] || "healthicons:organ-outline" : "healthicons:organ-outline";

  return (
    <div className="break-inside-avoid flex flex-col rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10">
      {entry.system && (
        <div className="mb-3 flex items-center gap-2 border-b border-white/5 pb-2">
           <Icon icon={systemIcon} size={24} className="text-fuchsia-300" />
           <div className="font-semibold text-fuchsia-100">{entry.system}</div>
        </div>
      )}
      
      {entry.findings && (
        <p className="text-sm leading-relaxed text-white/80">{entry.findings}</p>
      )}
      
      {hasDetails && (
        <>
          {expanded && (
            <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
               <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
               {entry.mechanism && (
                  <div className="text-sm">
                    <span className="block mb-1 font-semibold uppercase tracking-wider text-white/40 text-[10px]">Mechanism</span>
                    <p className="text-white/70 leading-relaxed">{entry.mechanism}</p>
                  </div>
                )}
                {entry.notes && (
                  <div className="text-sm">
                     <span className="block mb-1 font-semibold uppercase tracking-wider text-white/40 text-[10px]">Notes</span>
                     <p className="italic text-white/60 leading-relaxed">{entry.notes}</p>
                  </div>
                )}
            </div>
          )}
          
          <div className="mt-3 flex justify-start">
             <ExpandButton 
               isExpanded={expanded} 
               onToggle={() => setExpanded(!expanded)} 
               className="bg-white/5 hover:bg-white/10"
             />
          </div>
        </>
      )}
    </div>
  );
}

function OrganToxicityGrid({ toxicity }: { toxicity: NormalizedHarmPotential['toxicity'] }) {
  const { organ_toxicity, organToxicityString } = toxicity;
  const hasOrganToxicity = organ_toxicity.length > 0 || organToxicityString.trim().length > 0;

  if (!hasOrganToxicity) return null;

  if (organToxicityString) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-2">
          <Icon icon="healthicons:pain-outline" size={20} className="text-fuchsia-300" />
          <h4 className="font-semibold text-white">Organ Toxicity</h4>
        </div>
        <p className="text-sm text-white/80">{organToxicityString}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon icon="healthicons:pain-outline" size={20} className="text-fuchsia-300" />
        <h4 className="font-semibold text-white">Organ Toxicity</h4>
      </div>
      <div className="columns-1 gap-4 space-y-4 md:columns-2">
        {organ_toxicity.map((entry, idx) => (
          <OrganToxicityCard key={idx} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function CarcinogenicityCard({ toxicity }: { toxicity: NormalizedHarmPotential['toxicity'] }) {
  const { carcinogenicity } = toxicity;
  const hasCarcinogenicity =
    (carcinogenicity.description || "").trim().length > 0 || carcinogenicity.level != null;

  if (!hasCarcinogenicity) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 break-inside-avoid">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="mingcute:cancer-line" size={18} className="text-fuchsia-300" />
          <h4 className="font-semibold text-white">Carcinogenicity</h4>
        </div>
        <CarcinogenicityLevelBadge level={carcinogenicity.level} />
      </div>

      {carcinogenicity.description && (
        <p className="text-sm text-white/80">{carcinogenicity.description}</p>
      )}

      {carcinogenicity.evidence && (
        <div className="mt-2 rounded-lg bg-black/20 p-3 text-sm">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/50">Evidence Basis</div>
          <div className="grid gap-y-2">
            <EvidenceLevelIndicator
              level={carcinogenicity.evidence.human_epidemiological}
              label="Human Epidemiological"
            />
            
            {carcinogenicity.evidence.animal_models && (
              <div className="flex items-center justify-between">
                <span className="text-white/60">Animal Models</span>
                <div className="text-right">
                  <span className={EVIDENCE_LEVEL_CONFIG[carcinogenicity.evidence.animal_models.level || "none"]?.color || "text-white/60"}>
                    {carcinogenicity.evidence.animal_models.level
                      ? EVIDENCE_LEVEL_CONFIG[carcinogenicity.evidence.animal_models.level]?.label || "None"
                      : "None"}
                  </span>
                  {carcinogenicity.evidence.animal_models.species?.length > 0 && (
                    <div className="text-xs text-white/40">
                      ({carcinogenicity.evidence.animal_models.species.join(", ")})
                    </div>
                  )}
                </div>
              </div>
            )}

            {carcinogenicity.evidence.in_vitro && (
              <div className="flex items-center justify-between">
                <span className="text-white/60">In Vitro</span>
                <div className="text-right text-white/80">
                  {carcinogenicity.evidence.in_vitro.type}
                  {carcinogenicity.evidence.in_vitro.assay_type && (
                    <div className="text-xs text-white/40">{carcinogenicity.evidence.in_vitro.assay_type}</div>
                  )}
                </div>
              </div>
            )}

            {carcinogenicity.evidence.mechanistic && (
               <div className="flex items-center justify-between">
               <span className="text-white/60">Mechanistic</span>
               <span className={EVIDENCE_LEVEL_CONFIG[carcinogenicity.evidence.mechanistic.level || "none"]?.color || "text-white/60"}>
                 {carcinogenicity.evidence.mechanistic.level
                   ? EVIDENCE_LEVEL_CONFIG[carcinogenicity.evidence.mechanistic.level]?.label || "None"
                   : "None"}
               </span>
             </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AntibioticFunctionCard({ toxicity }: { toxicity: NormalizedHarmPotential['toxicity'] }) {
  const { antibiotic_function } = toxicity;
  const hasAntibioticFunction =
    (antibiotic_function.description || "").trim().length > 0 || antibiotic_function.level != null;

  if (!hasAntibioticFunction) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 break-inside-avoid">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="streamline:bacteria-virus-cells-biology" size={18} className="text-fuchsia-300" />
          <h4 className="font-semibold text-white">Antibiotic Function</h4>
        </div>
        {antibiotic_function.level && (
           <span
           className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
             CARCINOGENICITY_LEVEL_CONFIG[antibiotic_function.level as CarcinogenicityLevel]?.color || "text-white/60"
           } ${CARCINOGENICITY_LEVEL_CONFIG[antibiotic_function.level as CarcinogenicityLevel]?.bgColor || "bg-white/10"}`}
         >
           {CARCINOGENICITY_LEVEL_CONFIG[antibiotic_function.level as CarcinogenicityLevel]?.label || antibiotic_function.level}
         </span>
        )}
      </div>
      {antibiotic_function.description && (
        <p className="text-sm text-white/80">{antibiotic_function.description}</p>
      )}
    </div>
  );
}

export function ToxicitySubsection({ toxicity }: ToxicitySubsectionProps) {
  const { ld50, ld50String, organ_toxicity, organToxicityString, carcinogenicity, antibiotic_function } = toxicity;
  
  const hasContent = 
    ld50.length > 0 || 
    ld50String.trim().length > 0 || 
    organ_toxicity.length > 0 || 
    organToxicityString.trim().length > 0 ||
    (carcinogenicity.description || "").trim().length > 0 || 
    carcinogenicity.level != null ||
    (antibiotic_function.description || "").trim().length > 0 || 
    antibiotic_function.level != null;

  if (!hasContent) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Icon icon="healthicons:poison-24px" size={20} className="text-rose-300" />
          <h3 className="font-semibold text-white">Toxicity</h3>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <div className="flex flex-col gap-4">
        <div className="columns-1 gap-4 space-y-4 md:columns-2">
          <LD50Display toxicity={toxicity} />
          <CarcinogenicityCard toxicity={toxicity} />
          <AntibioticFunctionCard toxicity={toxicity} />
        </div>
        
        <OrganToxicityGrid toxicity={toxicity} />
      </div>
    </div>
  );
}
