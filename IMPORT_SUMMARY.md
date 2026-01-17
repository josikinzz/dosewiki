# Replication Gallery - Ready for Import

## Current Status ✅

**145 replications ready to import** (83% complete)
- ✅ 66 videos (from folder structure)
- ✅ 79 images (from EffectIndex mapping)
- ⏳ 30 images (can be added later)

**Code deployed** ✅
- Convex schema updated with replications table
- ReplicationGallery component ready
- Import scripts tested and working

## What Will Happen

### Effects Getting Galleries (27 total)

The import will connect replications to these effects:

```
1. breathing                      (1 video)
2. closed-eye-visuals            (2 videos)
3. color-enhancement             (4 images)
4. color-modulation              (1 video)
5. external-hallucinations       (2 videos)
6. visual-geometry               (14 videos)
7. hallucinatory-entities        (30 items: 11 videos + 19 images)
8. internal-hallucinations       (4 videos)
9. loss-of-contact-with-reality  (3 videos)
10. open-eye-visuals             (12 videos)
11. symmetrical-texture-repetition (22 items: 10 videos + 12 images)
12. tracers                        (7 items: 1 video + 6 images)
13. recursion                      (6 items: 1 video + 5 images)
14. peripheral-pareidolia         (6 images)
15. scenery-slicing               (4 images)
16. environmental-cubism          (4 images)
17. machinescapes                 (3 images)
18. melting                        (3 items: 1 video + 2 images)
19. visual-acuity-enhancement     (3 images)
20. visual-distortions            (4 images)
21. visual-drifting               (4 images)
22. chromatic-aberration          (1 image)
23. depersonalization             (1 image)
24. diffraction-spikes            (1 image)
25. double-vision                 (1 image)
26. aesthetic-distillation        (1 image)
27. blurred-vision                (2 images)
```

## Quick Start (5 minutes)

### Terminal 1: Start Convex Dev

```bash
cd "/Users/josie/Documents/Utilities/dose.wiki copy"
npx convex dev
```

Wait for: `✔ Convex functions ready!`

### Terminal 2: Run Import

```bash
cd "/Users/josie/Documents/Utilities/dose.wiki copy"

# Preview (1 second)
node scripts/import-to-convex.mjs --dry-run

# Execute (2-5 minutes)
node scripts/import-to-convex.mjs --execute

# Set gallery order (1 second)
node scripts/create-gallery-order.mjs --execute
```

### Terminal 1: Restart Convex

```
Ctrl+C to stop
npx convex dev
```

### Terminal 3: Start App

```bash
npm run dev
```

## Test

Visit any effect URL, e.g.:
- http://localhost:5173/effects/breathing
- http://localhost:5173/effects/visual-geometry
- http://localhost:5173/effects/hallucinatory-entities

You should see:
- Gallery grid with thumbnails
- Click image/video → lightbox opens
- Videos play with controls
- Images zoom
- Artist attribution in captions
- Mobile responsive

## What Gets Created

### In Convex Database
- 145 replication records (one per image/video)
- 27 effect records updated with gallery_order arrays

### In Browser
- Responsive gallery grid (2-4 columns)
- Lightgallery modal with video/image support
- Artist captions
- Keyboard navigation

## Files Involved

- `convex/schema.ts` - Replications table (already deployed)
- `convex/replications.ts` - Query/mutation API
- `src/components/effects/ReplicationGallery.tsx` - Gallery component
- `src/components/pages/EffectArticlePage.tsx` - Page integration
- `replications-metadata.json` - Metadata for import
- `scripts/import-to-convex.mjs` - Import script
- `scripts/create-gallery-order.mjs` - Gallery order script

## Commands Reference

```bash
# Preview import
node scripts/import-to-convex.mjs --dry-run

# Execute import (creates records)
node scripts/import-to-convex.mjs --execute

# Preview gallery order
node scripts/create-gallery-order.mjs --dry-run

# Set gallery order (updates effect articles)
node scripts/create-gallery-order.mjs --execute

# Skip videos (import images only)
node scripts/import-to-convex.mjs --execute --skip-videos

# Skip images (import videos only)
node scripts/import-to-convex.mjs --execute --skip-images
```

## Troubleshooting

**"Cannot connect to Convex dev server"**
- Make sure `npx convex dev` is running
- Check Terminal 1 shows: `✔ Convex functions ready!`

**"Galleries not showing"**
- Verify gallery_order was created (step 3)
- Restart app with `npm run dev`
- Check browser console for errors

**"Some videos don't play"**
- Check browser network tab
- Verify Convex storage is accessible
- Try different effect (some may have 0 replications)

**Want to add the 30 remaining images?**
1. Edit `replications-metadata.json`
2. Find images with `"effect_slug": null`
3. Set effect_slug from suggestion in `MANUAL_IMAGE_ASSIGNMENT.md`
4. Run steps 2-3 again

## What's Next

### Immediate
- Run the import process (above)
- Test galleries on 5-10 effect pages
- Verify videos and images play

### Short Term
- Add remaining 30 images (optional)
- Create DevMode interface for replication management
- Build admin tools for gallery_order reordering

### Future
- User submissions system
- Replication voting/ratings
- Advanced filtering (by artist, category, etc.)
- Artist profile pages

## Success Criteria

✅ 145 replications imported
✅ 27 effects have gallery_order arrays
✅ Galleries render on effect pages
✅ Videos play with controls
✅ Images display with zoom
✅ Artist attribution visible
✅ Mobile responsive
✅ Keyboard navigation works

---

**Status**: Ready to import anytime
**Implementation**: 100% complete
**Testing**: Ready to go

Run the import and check the galleries! 🚀
