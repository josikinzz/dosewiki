import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = join(__dirname, "../../..");

export const CONFIG = {
  model: process.env.OPENROUTER_MODEL || "anthropic/claude-opus-4-6",
  maxTokens: 2048,
  temperature: 0.3,
  maxConcurrency: 2,
  retryAttempts: 4,
  retryDelayMs: 2000,
  reasoningEffort: process.env.OPENROUTER_REASONING_EFFORT || "high",
  progressDir: join(PROJECT_ROOT, "notes-and-plans/exports/batch"),
  debugDir: join(PROJECT_ROOT, "tmp"),
  backupDir: join(PROJECT_ROOT, "notes-and-plans/exports/batch"),
  maxGenericSourceChars: 90000,
  maxCharsPerSource: 22000,
};

export const INPUT_BOUNDS = {
  concurrency: { min: 1, max: 10 },
  limit: { min: 1, max: 10000 },
};

export const GREEK_TO_ASCII = {
  alpha: "alpha",
  beta: "beta",
  gamma: "gamma",
  delta: "delta",
  epsilon: "epsilon",
  zeta: "zeta",
  eta: "eta",
  theta: "theta",
  iota: "iota",
  kappa: "kappa",
  lambda: "lambda",
  mu: "mu",
  nu: "nu",
  xi: "xi",
  omicron: "omicron",
  pi: "pi",
  rho: "rho",
  sigma: "sigma",
  tau: "tau",
  upsilon: "upsilon",
  phi: "phi",
  chi: "chi",
  psi: "psi",
  omega: "omega",
  "α": "alpha",
  "β": "beta",
  "γ": "gamma",
  "δ": "delta",
  "ε": "epsilon",
  "ζ": "zeta",
  "η": "eta",
  "θ": "theta",
  "ι": "iota",
  "κ": "kappa",
  "λ": "lambda",
  "μ": "mu",
  "ν": "nu",
  "ξ": "xi",
  "ο": "omicron",
  "π": "pi",
  "ρ": "rho",
  "σ": "sigma",
  "τ": "tau",
  "υ": "upsilon",
  "φ": "phi",
  "χ": "chi",
  "ψ": "psi",
  "ω": "omega",
};
