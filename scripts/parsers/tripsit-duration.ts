export type ParsedRouteDurationValue = {
  unit: string;
  value: string;
};

export type ParsedRouteDurationMap = Map<string, ParsedRouteDurationValue>;

const INLINE_ROUTE_PATTERN =
  /\b(Oral|Insufflated|Smoked|Inhaled|Intravenous|Intramuscular|Sublingual|Rectal|Vapourized|Vaporized|IV|IM):/gi;

const INLINE_ROUTE_VALUE_PATTERN =
  /\b(Oral|Insufflated|Smoked|Inhaled|Intravenous|Intramuscular|Sublingual|Rectal|Vapourized|Vaporized|IV|IM):\s*([\d.-]+)/i;

export function detectInlineRoutes(content: string): string[] {
  const routes = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = INLINE_ROUTE_PATTERN.exec(content)) !== null) {
    routes.add(match[1]);
  }

  return Array.from(routes);
}

export function parseNestedDurationDict(value: string): ParsedRouteDurationMap | null {
  if (!value.includes("{") || !value.includes("'_unit'")) {
    return null;
  }

  const result: ParsedRouteDurationMap = new Map();
  const unitMatch = value.match(/'_unit':\s*'([^']+)'/);
  const unit = unitMatch ? unitMatch[1] : "hours";
  const routePattern = /'([A-Za-z]+)':\s*'([^']+)'/g;

  let match: RegExpExecArray | null;
  while ((match = routePattern.exec(value)) !== null) {
    const routeName = match[1];
    const routeValue = match[2];

    if (routeName !== "_unit") {
      result.set(routeName, { value: routeValue, unit });
    }
  }

  return result.size > 0 ? result : null;
}

export function parseInlineMultiRouteDuration(value: string): ParsedRouteDurationMap | null {
  if (!value.match(INLINE_ROUTE_VALUE_PATTERN)) {
    return null;
  }

  const result: ParsedRouteDurationMap = new Map();
  const unitMatch = value.match(/(minutes?|hours?|mins?|hrs?)$/i);
  const unit = unitMatch ? unitMatch[1] : "hours";
  const parts = value.includes(",") ? value.split(",") : [value];

  for (const part of parts) {
    const routeMatch = part.match(INLINE_ROUTE_VALUE_PATTERN);
    if (routeMatch) {
      result.set(routeMatch[1], { value: routeMatch[2], unit });
    }
  }

  return result.size > 0 ? result : null;
}

export function resolveRouteDurationValue(
  routeValues: ParsedRouteDurationMap,
  routeName: string,
): ParsedRouteDurationValue | undefined {
  return routeValues.get(routeName) || routeValues.values().next().value;
}
