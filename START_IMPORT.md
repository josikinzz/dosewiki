# Import Replications to Production

This guide walks you through importing 145 replications (66 videos + 79 images) into Convex and connecting them to the effect galleries on the site.

## Step 1: Start Convex Dev Server

Open a **new terminal** and run:

```bash
cd "/Users/josie/Documents/Utilities/dose.wiki copy"
npx convex dev
```

Keep this terminal open! It will show:
```
✔ Convex functions ready!
(when done, shows: Dev dashboard is available at http://localhost:19000)
```

## Step 2: Dry Run (Preview)

In your main terminal, preview what will be imported:

```bash
node scripts/import-to-convex.mjs --dry-run
```

You should see something like:
```
🎬 breathing-bricks-phosform                  → breathing
🎬 breathing-by-phosform                      → breathing
🖼️  10376-12927-25985-unknown                 → color-enhancement
🖼️  8696092281-e167055dd3-k-unknown           → tracers
... and 141 more replications
```

## Step 3: Execute Import

Import all 145 replications to Convex:

```bash
node scripts/import-to-convex.mjs --execute
```

This will:
- Create database records for all 145 replications
- Take 2-5 minutes (one batch operation)
- Show progress

Expected output:
```
✓ Created: 145
Total: 145

✅ All replications imported successfully!
```

## Step 4: Create Gallery Order

Connect replications to their effect articles:

```bash
node scripts/create-gallery-order.mjs --dry-run
```

Preview shows which effects will get galleries:
```
breathing                          (1)
closed-eye-visuals                 (2)
color-enhancement                  (4)
... 
```

Then execute:

```bash
node scripts/create-gallery-order.mjs --execute
```

This will:
- Update 16 effect articles
- Add gallery_order arrays
- Prepare galleries for display

## Step 5: Restart Dev Server

Stop the Convex dev server (Ctrl+C) and restart it to reload:

```bash
npx convex dev
```

Then start your app:

```bash
npm run dev
```

## Step 6: Test Galleries

Open your browser and visit an effect that has replications:

**Effects with galleries:**
- https://localhost:5173/effects/breathing (1 video)
- https://localhost:5173/effects/closed-eye-visuals (2 videos)
- https://localhost:5173/effects/color-enhancement (4 images)
- https://localhost:5173/effects/visual-geometry (14 videos)
- https://localhost:5173/effects/hallucinatory-entities (19 images + 11 videos)
- https://localhost:5173/effects/open-eye-visuals (10 videos)
- ... and 10 more

**What to test:**
1. Gallery grid displays (responsive: 2-4 columns)
2. Click/tap images → lightbox opens
3. Click/tap videos → video player
4. Keyboard navigation (arrow keys, ESC)
5. Artist attribution in captions
6. Mobile responsiveness

## Troubleshooting

### "Cannot connect to Convex dev server"
- Make sure convex dev is running in another terminal
- Should see: "Convex functions ready!"
- Try: `npx convex dev --clear`

### Galleries not showing on effect pages
- Check that gallery_order was created (step 4)
- Restart npm dev server (kill and `npm run dev`)
- Check browser console for errors

### Some replications missing
- Only 145/175 are imported (66 videos + 79 images)
- 30 images still need effect assignment
- These can be added later

### Change gallery order
Edit in Convex dashboard or manually set `gallery_order` in effect articles:
```json
{
  "gallery_order": ["image-slug-1", "image-slug-2", "video-slug-1"]
}
```

## File Locations

- **Replications metadata**: `replications-metadata.json` (145 imported)
- **Convex functions**: `convex/replications.ts`
- **Gallery component**: `src/components/effects/ReplicationGallery.tsx`
- **Effect page**: `src/components/pages/EffectArticlePage.tsx`

## What Gets Imported

```
66 Videos:
  ├─ breathing: 1
  ├─ closed-eye-visuals: 2
  ├─ color-modulation: 1
  ├─ external-hallucinations: 2
  ├─ visual-geometry: 14
  ├─ hallucinatory-entities: 11
  ├─ internal-hallucinations: 4
  ├─ loss-of-contact-with-reality: 3
  ├─ open-eye-visuals: 10
  ├─ symmetrical-texture-repetition: 10
  └─ ... (6 more effects)

79 Images:
  ├─ hallucinatory-entities: 19
  ├─ symmetrical-texture-repetition: 19
  ├─ peripheral-pareidolia: 6
  ├─ recursion: 5
  ├─ color-enhancement: 4
  ├─ tracers: 4
  ├─ environmental-cubism: 4
  ├─ scenery-slicing: 4
  └─ ... (8 more effects)
```

## Summary

| Step | Command | Time |
|------|---------|------|
| 1 | `npx convex dev` | Keep running |
| 2 | `node scripts/import-to-convex.mjs --dry-run` | 1s |
| 3 | `node scripts/import-to-convex.mjs --execute` | 2-5min |
| 4 | `node scripts/create-gallery-order.mjs --dry-run` | 1s |
| 5 | `node scripts/create-gallery-order.mjs --execute` | 1s |
| 6 | Restart convex dev & `npm run dev` | 30s |
| 7 | Test galleries in browser | 5-10min |

**Total time: ~10-20 minutes**

---

Once complete, you'll have a fully functional replication gallery system with 145 replications connected to 16 effect articles!

For the remaining 30 images, manually assign effect_slug in replications-metadata.json and run steps 3-6 again.
