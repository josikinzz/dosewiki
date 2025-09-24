# Notes Card Formatting Report

## Current Implementation

### Component Structure
The notes are displayed using the `NotesSection` component located at `/src/components/sections/NotesSection.tsx`.

**Current rendering method:**
```tsx
<p className="mt-3 text-[0.95rem] leading-7 text-white/85">{notes}</p>
```

The notes are rendered as **plain text within a `<p>` tag**, which means:
- ❌ **NO markdown support** currently
- ❌ **NO line break preservation** (newlines are collapsed)
- ❌ **NO bullet point formatting** (bullets appear inline)
- ✅ Text wrapping and basic styling only

### Data Processing
1. **Source**: Raw notes from `articles.json` field `drug_info.notes`
2. **Processing**: `contentBuilder.ts:145` - `cleanString(info.notes) ?? ""`
3. **cleanString function**: Simply trims whitespace, no formatting applied

## Current Formatting in Data

Analysis of the articles.json shows various formatting attempts in the notes field:

### Type 1: Plain Text (Most Common)
```json
"notes": "3-MeO-PCP is more potent than ketamine and PCP, with a higher affinity for the NMDA receptor..."
```

### Type 2: Bullet Points with Line Breaks
Example from 3-Cl-PCP:
```json
"notes": "• 3-Cl-PCP is roughly equipotent to 3-MeO-PCP by weight...\n• Subjective amplitude varies widely...\n• Caustic on nasal tissue..."
```

### Type 3: Very Long Detailed Notes
Some substances have extensive paragraph-style notes with complex medical information that would benefit from formatting.

## Current Display Issues

When notes contain formatting like `\n` and `•`:
1. **Line breaks (`\n`) are ignored** - All text runs together in one paragraph
2. **Bullet points (`•`) appear inline** - No visual separation or indentation
3. **Long notes become hard to read** - Wall of text without structure

## Recommendations for Markdown Support

### Option 1: Preserve Basic Formatting (Quick Fix)
Replace the `<p>` tag with a `<pre>` or use CSS to preserve whitespace:

```tsx
// Option A: Use pre-wrap CSS
<p className="mt-3 text-[0.95rem] leading-7 text-white/85 whitespace-pre-wrap">{notes}</p>

// Option B: Use pre tag with styling
<pre className="mt-3 text-[0.95rem] leading-7 text-white/85 font-sans whitespace-pre-wrap">{notes}</pre>
```

**Pros:**
- Minimal code change
- Preserves line breaks and spacing
- Works with existing data

**Cons:**
- No rich formatting (bold, links, etc.)
- Manual bullet points only

### Option 2: Full Markdown Support (Recommended)
Implement proper markdown parsing using a library like `react-markdown`:

1. **Install markdown parser**: `npm install react-markdown`
2. **Update NotesSection component** to parse and render markdown
3. **Sanitize output** for security
4. **Style markdown elements** to match site design

**Benefits:**
- Support for headers, bold, italic, links
- Proper bullet/numbered lists
- Code blocks for drug testing reagents
- Tables for complex interaction data

### Option 3: Structured Notes System
Convert notes to a structured format in contentBuilder:

```typescript
interface StructuredNote {
  type: 'paragraph' | 'bullet' | 'warning' | 'table';
  content: string | string[];
}
```

**Benefits:**
- Type-safe formatting
- Custom components per note type
- Better semantic HTML

## Data Format Recommendations

If markdown is implemented, update notes in articles.json to use:

```markdown
## Key Information
- **Potency**: More potent than ketamine
- **Duration**: 4-6 hours
- **Risk**: High affinity for NMDA receptor

## Harm Reduction
1. Use accurate milligram scale
2. Avoid combinations with depressants
3. Start with low doses

⚠️ **Warning**: Can cause severe dissociation
```

## Implementation Priority

1. **Immediate**: Add `whitespace-pre-wrap` CSS class to preserve line breaks
2. **Short-term**: Implement react-markdown for rich text support
3. **Long-term**: Standardize all notes in articles.json to use consistent markdown formatting

## Security Considerations

If implementing markdown:
- Sanitize all HTML output
- Disable raw HTML in markdown
- Only allow safe markdown features
- Consider using `rehype-sanitize` plugin