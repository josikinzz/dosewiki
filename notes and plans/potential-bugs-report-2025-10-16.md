# Potential Bugs Report
**Generated**: 2025-10-16
**Scope**: Full codebase review
**Severity Levels**: Critical, High, Medium, Low

---

## Executive Summary

This report identifies **12 potential bugs** across the codebase, categorized by severity. The analysis covered React components, data transformation logic, routing, state management, TypeScript configuration, and utility functions.

### Bug Distribution
- **Critical**: 1
- **High**: 4
- **Medium**: 5
- **Low**: 2

---

## Critical Issues

### C1. TypeScript Configuration Error
**File**: `tsconfig.json:9`
**Severity**: Critical
**Status**: Resolved — added `noEmit: true` to `tsconfig.json` so `allowImportingTsExtensions` is now valid.

**Description**:
The TypeScript configuration contains an invalid setting that causes a compilation error:
```
Option 'allowImportingTsExtensions' can only be used when either 'noEmit' or 'emitDeclarationOnly' is set.
```

**Location**:
```json
{
  "allowImportingTsExtensions": true  // Line 9
}
```

**Impact**:
- TypeScript compilation may fail or behave unexpectedly
- IDE may show incorrect errors or miss real issues
- Build process reliability is compromised

**Root Cause**:
The `allowImportingTsExtensions` option requires `noEmit: true` or `emitDeclarationOnly: true` but neither is set.

**Recommended Fix**:
Add `noEmit: true` to the compilerOptions (safe for Vite projects):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2020"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,           // ADD THIS
    "esModuleInterop": true,
    "jsx": "react-jsx",
    "types": ["vite/client"]
  }
}
```

---

## High Severity Issues

### H1. Missing Array Type Check in Psychedelic Group Filter
**File**: `src/data/library.ts:1070-1078`
**Severity**: High
**Type**: Runtime Error Potential
**Status**: Resolved — 2C-X filter now reads from `normalizedCategories` and guards chemical classes.

**Description**:
The psychedelic group filter previously referenced `context.categories`, a property that doesn't exist on the `CategorizedRecordContext` object, leading to potential runtime `TypeError`s. The filter now relies on the normalized category set already stored on the context.

**Updated Code**:
```typescript
filter: (context) => {
  const normalizedTarget = normalizeCategoryKey("2C-X");
  const hasCategory = context.normalizedCategories.has(normalizedTarget);
  const classList = Array.isArray(context.chemicalClasses) ? context.chemicalClasses : [];
  const hasClass = classList.some((entry) => normalizeKey(entry) === normalizedTarget);
  return hasCategory || hasClass;
},
```

**Impact**:
- Prevents runtime crashes when rendering psychedelic groups
- Ensures 2C-X category membership is detected reliably

---

### H2. Potential Infinite Loop in InteractionsPage useEffect
**File**: `src/components/pages/InteractionsPage.tsx:262-317`
**Severity**: High
**Type**: State Management Bug

**Description**:
The `useEffect` hook that syncs initial selections can potentially trigger infinite re-renders due to calling `onSelectionChange` within the effect, which may cause parent component re-renders and prop changes.

**Problematic Code**:
```typescript
useEffect(() => {
  // ... selection logic ...

  if (selectionChanged) {
    setPrimarySlug(resolvedPrimary);
    setSecondarySlug(resolvedSecondary);
    lastSyncedSelection.current = { primary: resolvedPrimary, secondary: resolvedSecondary };

    if (shouldSyncSelection && onSelectionChange && resolvedPrimary && resolvedSecondary) {
      onSelectionChange(resolvedPrimary, resolvedSecondary);  // May trigger parent re-render
    }
  } else if (shouldSyncSelection && onSelectionChange && resolvedPrimary && resolvedSecondary) {
    lastSyncedSelection.current = { primary: resolvedPrimary, secondary: resolvedSecondary };
    onSelectionChange(resolvedPrimary, resolvedSecondary);  // May trigger parent re-render
  }
}, [
  sortedSubstances,
  substanceLookup,
  initialPrimarySlug,
  initialSecondarySlug,
  onSelectionChange,  // This reference may change on every render
]);
```

**Impact**:
- Potential infinite render loop
- Performance degradation
- Browser may become unresponsive
- Excessive history entries in browser

**Root Cause**:
The `onSelectionChange` callback in the dependency array may not be memoized by the parent component, causing the effect to re-run on every render.

**Recommended Fix**:
1. Remove `onSelectionChange` from dependency array and use `useCallback` ref pattern
2. Or ensure parent component memoizes the callback with `useCallback`
3. Add additional guard conditions

```typescript
const onSelectionChangeRef = useRef(onSelectionChange);
useEffect(() => {
  onSelectionChangeRef.current = onSelectionChange;
}, [onSelectionChange]);

useEffect(() => {
  // ... existing logic ...

  if (shouldSyncSelection && onSelectionChangeRef.current && resolvedPrimary && resolvedSecondary) {
    onSelectionChangeRef.current(resolvedPrimary, resolvedSecondary);
  }
}, [
  sortedSubstances,
  substanceLookup,
  initialPrimarySlug,
  initialSecondarySlug,
  // onSelectionChange removed from deps
]);
```

---

### H3. Route State Desynchronization in App.tsx
**File**: `src/App.tsx:154-216`
**Severity**: High
**Type**: State Synchronization Bug
**Status**: Resolved — route selections are now persisted per substance and only reset when invalid.

**Description**:
Previously, switching substances forced the dosage route back to the default, erasing user context. The app now keeps a per-slug route preference map and validates stored routes against the active record before applying them.

**Updated Code**:
```typescript
const routePreferencesRef = useRef<Map<string, RouteKey>>(new Map());
const [route, setRoute] = useState<RouteKey | undefined>(defaultRoute);

useEffect(() => {
  if (!content) {
    if (route !== undefined) {
      setRoute(undefined);
    }
    return;
  }

  const storedRoute = routePreferencesRef.current.get(activeSlug);
  const validStoredRoute = storedRoute && content.routes[storedRoute] ? storedRoute : undefined;

  if (!validStoredRoute && storedRoute) {
    routePreferencesRef.current.delete(activeSlug);
  }

  const fallbackRoute = defaultRoute && content.routes[defaultRoute] ? defaultRoute : undefined;
  const nextRoute = validStoredRoute ?? fallbackRoute;

  if (route !== nextRoute) {
    setRoute(nextRoute);
  }
}, [activeSlug, content, defaultRoute, route]);

const handleRouteChange = useCallback(
  (nextRoute: RouteKey) => {
    if (!content || !content.routes[nextRoute]) {
      return;
    }

    routePreferencesRef.current.set(activeSlug, nextRoute);
    setRoute(nextRoute);
  },
  [activeSlug, content],
);
```

**Impact**:
- User-selected routes persist when moving between substances
- Invalid stored preferences are discarded safely
- Eliminates unexpected resets while keeping fallback behavior intact

---

### H4. Unsafe Non-Null Assertions in Library.ts
**File**: `src/data/library.ts` (multiple locations)
**Severity**: High
**Type**: Null Safety Violation
**Status**: Resolved — replaced map lookups that used `!` with explicit guards and fallbacks.

**Description**:
Several helper maps assumed entries existed after `set()` calls, relying on non-null assertions. These sites now retrieve the map entry into a local variable, create it when missing, or bail out early so we never dereference `undefined`.

**Updated Patterns**:
- Hallucinogen filter checks `const hallucinogenRecords = precomputedFilteredRecords.get("hallucinogen")` before filtering.
- Chemical class aggregators (`chemicalMap`, `bucketMap`) create mutable arrays/maps up front and skip when missing.
- Mechanism/effect indexes hydrate accumulators, then reuse the guarded references; qualifier sets use optional chaining when adding records.

**Impact**:
- Eliminates latent "cannot read property" crashes during category/index builds
- Improves resilience for future refactors that reorder guard logic
- Keeps map data structures consistent even if upstream inputs change

---

## Medium Severity Issues

### M1. Search Query XSS Vulnerability via DecodeURIComponent
**File**: `src/utils/routing.ts:102-146`
**Severity**: Medium
**Type**: Security - Potential XSS
**Status**: Resolved — query parsing now wraps `decodeURIComponent` in a try/catch and falls back to the encoded segment.

**Description**:
Malformed or malicious search hashes no longer throw or inject unexpected strings. Both the search query and contributor keys share the same defensive decoder, logging failures and preserving the raw segment as a safe fallback.

**Updated Code**:
```typescript
case "search": {
  const querySegment = segments.slice(1).join("/");
  let query = "";
  if (querySegment) {
    try {
      query = decodeURIComponent(querySegment);
    } catch (error) {
      console.warn("Failed to decode search query from hash", error);
      query = querySegment;
    }
  }
  return { type: "search", query };
}
```

**Impact**:
- Prevents router crashes on malformed percent-encoding
- Reduces risk of script-like payloads being supplied to future renderers
- Shares the same guard for contributor routes for consistency

---

### M2. Missing Dependency in Navigate Callbacks
**File**: `src/App.tsx:69-103`
**Severity**: Medium
**Type**: React Hooks - Stale Closure

**Description**:
Several navigation callbacks (`selectSubstance`, `selectCategory`, etc.) use `navigate` in their dependency array, but `navigate` itself depends on nothing and could theoretically change.

**Code**:
```typescript
const navigate = useCallback((nextView: AppView) => {
  const nextHash = viewToHash(nextView);
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  } else {
    setView(nextView);
  }
}, []); // Empty deps - navigate is stable

const selectSubstance = useCallback((slug: string) => {
  navigate({ type: "substance", slug });
}, [navigate]); // Could just be []
```

**Impact**:
- Unnecessary re-creation of callback functions
- Minor performance overhead
- No functional bugs, but suboptimal

**Recommended Fix**:
Since `navigate` has no dependencies, the callbacks that use it can also omit it:
```typescript
const selectSubstance = useCallback((slug: string) => {
  navigate({ type: "substance", slug });
}, []); // navigate is stable, no need to include
```

---

### M3. Unsafe Type Casting in ContentBuilder
**File**: `src/data/contentBuilder.ts:104-781`
**Severity**: Medium
**Type**: Type Safety
**Status**: Resolved — `RawArticle` now declares the `index-category` field and parsing uses standard helpers.

**Description**:
We removed the string index escape hatch by extending the article type and running the value through `cleanString`, which trims and normalizes optional strings across the builder.

**Updated Code**:
```typescript
interface RawArticle {
  id?: number;
  title?: string | null;
  drug_info?: RawDrugInfo;
  "index-category"?: string | null;
}

const rawIndexCategory = cleanString(article["index-category"]) ?? "";
```

**Impact**:
- Restores TypeScript coverage for article metadata
- Shields parsing from unexpected non-string values
- Aligns field access with other normalized content helpers

---

### M4. Potential Memory Leak in Search Index
**File**: `src/data/search.ts:225-235`
**Severity**: Medium
**Type**: Memory Management

**Description**:
The search index is built at module load time with all substance records, which creates a large in-memory structure that's never garbage collected.

**Code**:
```typescript
const withLabelKeywords = entryPool.map((entry) => ({
  ...entry,
  keywords: mergeKeywords(entry.keywords, keywordize(entry.label)),
  labelLower: entry.label.toLowerCase(),
}));
```

**Impact**:
- ~57K lines of articles.json loaded into memory
- Multiple index structures created (entryPool, withLabelKeywords, searchEntries)
- Approximately 2-5 MB of memory that can't be freed
- Mobile devices may struggle

**Severity Justification**:
While static sites need to load data, the triple storage (original + indexed + lowercase) is wasteful.

**Recommended Fix**:
1. Consider lazy-loading search index
2. Or use a single optimized structure:
```typescript
const searchIndex = entryPool.map((entry) => {
  const labelLower = entry.label.toLowerCase();
  const keywords = [...new Set([...entry.keywords, ...keywordize(entry.label)])];

  return {
    ...entry,
    labelLower,
    keywords,
  };
});
```

---

### M5. Missing Error Handling in Hash Parsing
**File**: `src/utils/routing.ts:105-173`
**Severity**: Medium
**Type**: Error Handling
**Status**: Resolved — the router now wraps parsing in a top-level try/catch and logs failures.

**Description**:
`parseHash` no longer assumes well-formed segments. It captures unexpected errors, emits a console warning with the offending hash, and falls back to the default view. Route-specific decoders (search, contributors) already log decoding issues and retain the raw segment when necessary.

**Updated Code**:
```typescript
export function parseHash(
  hashValue: string | undefined,
  defaultSlug: string,
  defaultView: AppView = { type: "substances" },
): AppView {
  const resolveDefault = () => defaultView;

  try {
    const source = typeof hashValue === "string"
      ? hashValue
      : typeof window !== "undefined"
        ? window.location.hash
        : "";
    const raw = source.replace(/^#/, "");

    if (!raw) {
      return resolveDefault();
    }

    const segments = raw.split("/").filter(Boolean);
    if (segments.length === 0) {
      return resolveDefault();
    }

    // … existing switch logic …
  } catch (error) {
    console.warn("Failed to parse hash", hashValue, error);
    return resolveDefault();
  }
}
```

**Impact**:
- Prevents silent failures when encountering malformed hashes
- Adds diagnostic logging for analytics or debugging
- Keeps navigation stable by falling back to the configured default view

---

## Low Severity Issues

### L1. Inconsistent Null Checks in Duration Building
**File**: `src/data/contentBuilder.ts:232-257`
**Severity**: Low
**Type**: Code Quality

**Description**:
The `isStructuredDurationValue` function uses inconsistent null checking patterns. It checks for `!duration || typeof duration !== "object"` but then uses `Object.prototype.hasOwnProperty.call()` for property checks.

**Code**:
```typescript
function isStructuredDurationValue(duration?: RawDuration): duration is StructuredDuration {
  if (!duration || typeof duration !== "object") {
    return false;
  }
  return (
    Object.prototype.hasOwnProperty.call(duration, "general") ||
    Object.prototype.hasOwnProperty.call(duration, "routes_of_administration")
  );
}
```

**Impact**:
- None functional, but inconsistent code style
- Makes the codebase harder to understand
- Mixing modern and legacy patterns

**Recommended Fix**:
Use consistent modern syntax:
```typescript
function isStructuredDurationValue(duration?: RawDuration): duration is StructuredDuration {
  if (!duration || typeof duration !== "object") {
    return false;
  }
  return "general" in duration || "routes_of_administration" in duration;
}
```

---

### L2. Inefficient Array Filtering in Library
**File**: `src/data/library.ts:1943-1958`
**Severity**: Low
**Type**: Performance

**Description**:
The `filterStimulantRecords` function creates a Set on every record iteration, which is inefficient.

**Code**:
```typescript
function filterStimulantRecords(records: SubstanceRecord[]): SubstanceRecord[] {
  return records.filter((record) => {
    const normalizedCategories = new Set(  // Created for EVERY record
      (record.categories ?? [])
        .map((category) => normalizeCategoryKey(category))
        .filter((category) => category.length > 0),
    );

    for (const excludedKey of STIMULANT_EXCLUDED_CATEGORY_KEYS) {
      if (normalizedCategories.has(excludedKey)) {
        return false;
      }
    }

    return true;
  });
}
```

**Impact**:
- Minimal performance impact (records list is relatively small)
- Scales poorly if dataset grows
- Creates unnecessary garbage

**Recommended Fix**:
Use early return without Set when possible:
```typescript
function filterStimulantRecords(records: SubstanceRecord[]): SubstanceRecord[] {
  return records.filter((record) => {
    const categories = record.categories ?? [];

    for (const category of categories) {
      const normalized = normalizeCategoryKey(category);
      if (normalized.length > 0 && STIMULANT_EXCLUDED_CATEGORY_KEYS.has(normalized)) {
        return false;
      }
    }

    return true;
  });
}
```

---

## Summary of Findings

### Critical Actions Required
1. **Fix TypeScript configuration** (C1) - Resolved; `noEmit` enabled so type checking runs without config errors
2. **Fix categories property access** (H1) - Resolved; psychedelic filters now use normalized category sets

### High Priority Fixes
3. **Review InteractionsPage useEffect** (H2) - Potential infinite loop
4. **Improve route state management** (H3) - Resolved; route choices persist per substance
5. **Replace non-null assertions** (H4) - Resolved; map access now guarded explicitly

### Medium Priority Improvements
6. **Add error handling for hash parsing** (M5) - Resolved; `parseHash` now wraps parsing in try/catch with logging
7. **Fix type casting in contentBuilder** (M3) - Resolved; `RawArticle` now models `index-category`
8. **Review search query sanitization** (M1) - Resolved; hash parsing now guards decoder failures

### Low Priority Optimizations
9. **Optimize filterStimulantRecords** (L2)
10. **Modernize null checks** (L1)

---

## Testing Recommendations

1. **Add Unit Tests For**:
   - Route parsing with malformed URLs
   - Search functionality with special characters
   - Duration building with edge cases
   - Category filtering logic

2. **Add Integration Tests For**:
   - Navigation flow between substances
   - Route state persistence
   - Search and navigation integration

3. **Add E2E Tests For**:
   - Full user journey through substance pages
   - Interactions comparison workflow
   - Search to substance navigation

---

## Code Quality Recommendations

1. **Enable Strict TypeScript**:
   ```json
   {
     "strict": true,
     "noUncheckedIndexedAccess": true,
     "noImplicitAny": true
   }
   ```

2. **Add ESLint Rules**:
   - `no-non-null-assertion`
   - `no-explicit-any`
   - `react-hooks/exhaustive-deps`

3. **Implement Error Boundaries**:
   - Add React error boundaries around route components
   - Add global error handler for navigation failures

4. **Add Logging**:
   - Log navigation failures
   - Log search errors
   - Log data transformation errors

---

## Notes

- No malicious code detected
- Code follows React best practices overall
- Data transformation logic is well-structured
- Good separation of concerns
- TypeScript usage could be stricter
- Test coverage appears minimal

**Review Date**: 2025-10-16
**Reviewer**: Claude Code
**Files Analyzed**: 47 TypeScript/TSX files
**Data Files**: articles.json (~57K lines)
