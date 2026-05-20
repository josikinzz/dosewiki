/**
 * Structured logging utility for server helpers and API endpoints.
 * 
 * Features:
 * - Log levels (debug, info, warn, error)
 * - Automatic sensitive data redaction
 * - Production-aware filtering
 * - Contextual prefixes for tracing
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// In production, only log warnings and errors
const MIN_LOG_LEVEL = process.env.NODE_ENV === "production" 
  ? LOG_LEVELS.warn 
  : LOG_LEVELS.debug;

// Patterns to redact from logs
const SENSITIVE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9_.~+/-]+=*/gi,
  /ghp_[A-Za-z0-9]{36,}/gi,
  /sk-or-[A-Za-z0-9-]+/gi,
  /password["']?\s*[:=]\s*["']?[^"'\s,}]+/gi,
];

/**
 * Redact sensitive information from a string.
 * @param {string} text - Text to redact
 * @returns {string} Redacted text
 */
const redact = (text) => {
  if (typeof text !== "string") {
    return text;
  }
  
  let result = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
};

/**
 * Safely stringify an object for logging.
 * @param {unknown} obj - Object to stringify
 * @returns {string} JSON string or fallback
 */
const safeStringify = (obj) => {
  try {
    const str = JSON.stringify(obj);
    return redact(str);
  } catch {
    return "[unstringifiable object]";
  }
};

/**
 * Format log arguments, redacting sensitive data.
 * @param {unknown[]} args - Arguments to format
 * @returns {string[]} Formatted arguments
 */
const formatArgs = (args) => {
  return args.map((arg) => {
    if (typeof arg === "string") {
      return redact(arg);
    }
    if (arg instanceof Error) {
      return redact(arg.message);
    }
    if (typeof arg === "object" && arg !== null) {
      return safeStringify(arg);
    }
    return String(arg);
  });
};

/**
 * Create a logger instance with a specific context prefix.
 * @param {string} context - Context prefix (e.g., "auth", "save-articles")
 * @returns {Object} Logger instance with debug, info, warn, error methods
 */
export const createLogger = (context) => {
  const prefix = `[${context}]`;
  
  const log = (level, ...args) => {
    if (LOG_LEVELS[level] < MIN_LOG_LEVEL) {
      return;
    }
    
    const formatted = formatArgs(args);
    const message = `${prefix} ${formatted.join(" ")}`;
    
    switch (level) {
      case "error":
        console.error(message);
        break;
      case "warn":
        console.warn(message);
        break;
      default:
        console.log(message);
    }
  };
  
  return {
    debug: (...args) => log("debug", ...args),
    info: (...args) => log("info", ...args),
    warn: (...args) => log("warn", ...args),
    error: (...args) => log("error", ...args),
  };
};

/**
 * Default logger for general use.
 */
export const logger = createLogger("api");
