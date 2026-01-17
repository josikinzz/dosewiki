# Subjective Effects Extraction Prompt

You are extracting subjective effects content from source articles about a psychoactive substance.

## Task
Extract ALL verbatim text describing subjective effects, experiences, and sensations from the provided source content.

## IMPORTANT: Excluded Sources
Skip extraction entirely from these sources - they are processed separately:
- **PsychonautWiki** (`psychonautwiki`)
- **DEIS / Disregard Everything I Say** (`disregardeverythingisay`)

## What to Extract

### Physical Effects
- Body high descriptions (tingling, warmth, heaviness, lightness)
- Stimulation vs sedation
- Euphoria (physical)
- Nausea, appetite changes
- Pupil dilation, sweating
- Motor control effects (coordination, tremor)
- Tactile sensations and enhancement
- Temperature regulation changes
- Muscle tension or relaxation
- Heart rate and blood pressure sensations
- Bodily control enhancement or impairment
- Pain perception changes
- Energy levels

### Cognitive Effects
- Thought patterns (acceleration, deceleration, loops)
- Conceptual thinking
- Time distortion (compression, expansion)
- Memory effects (enhancement, suppression)
- Introspection and self-reflection
- Euphoria (cognitive/emotional)
- Anxiety, paranoia
- Ego effects (suppression, dissolution, death)
- Unity and interconnectedness
- Empathy and sociability
- Focus and concentration
- Creativity enhancement
- Mindfulness
- Delusions, confusion
- Deja vu

### Visual Effects
**Enhancements:**
- Color enhancement
- Visual acuity enhancement
- Pattern recognition enhancement

**Distortions:**
- Drifting (melting, breathing, morphing, flowing)
- Color shifting
- Tracers, after images
- Depth/perspective distortions
- Symmetrical texture repetition
- Scenery slicing

**Geometry:**
- Open-eye and closed-eye geometry descriptions
- Geometry style (algorithmic, organic, structured)
- Geometry complexity and intensity levels

**Hallucinatory States:**
- Internal hallucinations (entities, settings, scenarios)
- External hallucinations
- Transformations
- Machinescapes, shadow people

### Auditory Effects
- Sound enhancement
- Sound distortions
- Auditory hallucinations
- Music appreciation enhancement

### Other Sensory Effects
- Tactile enhancement or distortion
- Olfactory (smell) effects
- Gustatory (taste) effects
- Synesthesia (cross-sensory experiences)

### Experiential States
- Mystical experiences
- Near-death experiences
- Out-of-body experiences
- Hole experiences (dissociatives)
- Peak experiences

## First-Person Narratives (HIGH VALUE)
First-person experience descriptions are especially valuable. Sources with rich narratives:
- **Drug Users Bible** - Personal trip reports
- **Isomer Design** - First-person phenethylamine/tryptamine experiences

When extracting narratives:
- Include complete passages, not just effect keywords
- Preserve the author's voice and descriptive language
- Extract temporal descriptions ("at the peak...", "as it wore off...")
- Capture comparative descriptions ("similar to X but with more...")

## Extraction Rules
1. Extract COMPLETE paragraphs and sections - do not truncate mid-sentence
2. Preserve all markdown formatting (headers, lists, bold, etc.)
3. Include surrounding context when effects are embedded in other text
4. Prioritize qualitative descriptions over simple effect names
5. Do NOT paraphrase - extract verbatim text only
6. Skip PsychonautWiki and DEIS sources entirely

## Output Format

For each source that has effects content, output:

```
## Source: {Source Name}

{verbatim extracted text}

---
```

For excluded sources (PsychonautWiki, DEIS), output:

```
## Source: {Source Name}

*Source excluded from this extraction workflow.*

---
```

If a source has NO effects content, output:

```
## Source: {Source Name}

*No subjective effects content found.*

---
```

## Important
Effect descriptions help users understand what to expect. Prioritize rich narrative descriptions over simple effect lists when available.
