# Manual Image Assignment Guide

**Status**: 79/109 images automatically assigned (72%)  
**Remaining**: 30 images need manual effect assignment

## How to Assign Effects

Edit `replications-metadata.json` and find each image below. Update the `effect_slug` field:

```json
{
  "filename": "example.jpg",
  "effect_slug": null,  // ← Change this to the effect slug
  ...
}
```

## 30 Remaining Images

| # | Image | Suggested Effect | Notes |
|---|-------|------------------|-------|
| 1 | 0EvBcsq.jpg | ? | Unidentified, check filename pattern |
| 2 | A_merging_to_the_boundless_by_Star_Gazer.jpg | environmental-cubism | "merging" suggests distortion/melting |
| 3 | Abrogation_by_Chaos_inception.webp | hallucinatory-entities | "Chaos" + artist suggests entity/abstract |
| 4 | carnivalian grid by incedgris.jpg | symmetrical-texture-repetition | "grid" pattern |
| 5 | Day_Tripping.webp | open-eye-visuals | "Day Tripping" suggests daytime outdoor effect |
| 6 | death-by-astonishment upscaled.jpg | hallucinatory-entities | Entity/creature related |
| 7 | ESADhIOWoAAyFYZ.jpg | ? | Reddit image ID, check visually |
| 8 | fish eye lense by midjourney.png | distortion-related | Lens distortion |
| 9 | Giger-The_Spell_IV.jpg | hallucinatory-entities | H.R. Giger - biomechanical creatures |
| 10 | Hatheg-Kla_by_MOracz.jpg | hallucinatory-entities | Lovecraftian entity reference |
| 11 | hgcjhgcjg_digital_art_x4.jpg | ? | Random name, visual inspection needed |
| 12 | Hr_giger_landschaft.webp | environmental-cubism | H.R. Giger landscape |
| 13 | internal_hallucination_scene_by_salviadroid.jpg | internal-hallucinations | Artist name + "internal hallucination" |
| 14 | King_in_yellow_by_Borja_Pintado.webp | hallucinatory-entities | "King in Yellow" = entity/cosmic |
| 15 | KV55lA4.webp | ? | Generic ID, visual check needed |
| 16 | Lake_on_LSD_by_Mrmedicman.webp | open-eye-visuals | "Lake on LSD" suggests OEV |
| 17 | morbid mandala by sunterry art.jpg | symmetrical-texture-repetition | "mandala" = symmetrical pattern |
| 18 | Moss_on_tree_bark.webp | color-enhancement | Nature photography, likely color saturation |
| 19 | mountains by codedinblood.webp | open-eye-visuals | Landscape suggests OEV |
| 20 | NationalPark.webp | open-eye-visuals | Landscape/outdoor |
| 21 | overclocked-cortex.jpg | hallucinatory-entities | "cortex" suggests brain/abstract entity |
| 22 | paradise_valley.jpg | open-eye-visuals | Valley landscape |
| 23 | prometheusconceptart.jpg | hallucinatory-entities | Mythological entity |
| 24 | salvia room by cuckington iv.jpeg | internal-hallucinations | "salvia room" = internal space |
| 25 | seers portal by salvia droid.jpg | loss-of-contact-with-reality | "portal" = dissociative |
| 26 | shadow gang by unknown.webp | hallucinatory-entities | "shadow" entities |
| 27 | shadowpersonanomymous.webp | hallucinatory-entities | Shadow person effect |
| 28 | subtle geometry in the sky by cold wasabi.png | visual-geometry | "geometry in sky" = geometric patterns |
| 29 | switch by sam perkins.png | visual-distortions | "Switch" suggests state change/distortion |
| 30 | walk in the forest by thatswissengineer.webp | open-eye-visuals | Forest walk = OEV scenario |

## Quick Reference: Effect Slugs

Valid effect slugs for reference:

```
breathing
closed-eye-visuals
color-enhancement
color-modulation
color-transformation
chromatic-aberration
depersonalization
diffraction-spikes
double-vision
environmental-cubism
external-hallucinations
hallucinatory-entities
internal-hallucinations
loss-of-contact-with-reality
machinescapes
melting
open-eye-visuals
recursion
scenery-slicing
symmetrical-texture-repetition
tracers
visual-acuity-enhancement
visual-distortions
visual-drifting
visual-geometry
```

## How to Update

### Option 1: JSON Edit (Recommended)
```bash
# Open in your editor
nano replications-metadata.json

# Find each image and set effect_slug
# Search for: "filename": "0EvBcsq.jpg"
# Change: "effect_slug": null,
# To:     "effect_slug": "visual-geometry",
```

### Option 2: Skip for Now
Leave `effect_slug: null` for undecided images. They'll be skipped during import and can be added later.

### Option 3: Bulk Edit Script
If you want to create a script to update multiple images at once, let me know!

## Tips for Identifying Effects

1. **Artist Name**: Some artists specialize in certain effects
   - chelsea morgan, phosform = geometry/visual distortions
   - salviadroid, cuckington = internal/dissociative
   - coldwasabi, loka = OEV/landscape

2. **Filename Clues**:
   - "geometry", "pattern", "grid" → symmetrical-texture-repetition
   - "entity", "being", "creature" → hallucinatory-entities
   - "portal", "room", "space" → internal-hallucinations
   - "tree", "forest", "landscape" → open-eye-visuals

3. **Visual Inspection**:
   - Open the image in your image viewer
   - Match visual style to effect descriptions

4. **Uncertainty**: 
   - If unsure, make your best guess
   - Can be corrected later in Convex dashboard
   - Mark with "?" if completely uncertain

## Next Steps

1. Review and assign the 30 images (estimated: 15-30 minutes)
2. Save `replications-metadata.json`
3. Run import: `node scripts/import-replications.mjs --execute`
4. Done!

Alternatively, import what we have now (145/175 = 83%) and add the rest later.

---

Need help? Check EffectIndex: https://effectindex.com/effects
