# Replication Import Guide

This guide explains how to import the 175 video and image replications into DoseWiki.

## Current Status

✅ **66 Videos** - Ready to import (effect mapping from folder names)
⚠️ **109 Images** - Need manual effect assignment

## Step 1: Review the Metadata

A `replications-metadata.json` file has been generated with all file information:

```bash
# View the file
cat replications-metadata.json

# Filter to see only videos (ready to import)
jq '.replications[] | select(.type == "video")' replications-metadata.json | head -50

# Filter to see only images (need effect assignment)
jq '.replications[] | select(.type == "image")' replications-metadata.json | head -50
```

## Step 2: Assign Effects to Images (Required)

The 109 images need manual effect assignment. There are two approaches:

### Option A: Use Existing Effect Index Mapping (Recommended)

The `esei-replications-index.json` file in the unified osmanthus app has pre-existing mappings for some images:

```bash
# Check if images are already mapped in the EI mapping
cat "/Users/josie/Documents/Utilities/unified osmanthus app/replications/esei-replications-index.json" | jq '.eseiEffects'
```

You can use this as a reference to manually update `replications-metadata.json`.

### Option B: Manual Assignment in replications-metadata.json

Edit the file directly:

```json
{
  "slug": "some-image-unknown",
  "title": "Some Image",
  "artist": "Unknown",
  "type": "image",
  "effect_slug": null,  // ← Change this to the effect slug
  "filename": "some-image.jpg"
}
```

Valid effect slugs (DoseWiki):
- breathing
- closed-eye-visuals
- color-modulation
- color-enhancement
- color-transformation
- visual-geometry
- external-hallucinations
- hallucinatory-entities
- internal-hallucinations
- loss-of-contact-with-reality
- open-eye-visuals
- symmetrical-texture-repetition
- visual-acuity-enhancement
- visual-distortions
- visual-drifting
- melting (visual flowing)
- recursion
- tracers
- ... (see EFFECT_SLUG_MAP in scripts/scan-replications.mjs for full list)

## Step 3: Prepare Convex

Before importing, make sure Convex is initialized:

```bash
# Deploy schema changes
npx convex dev

# Keep this running in a separate terminal while importing
```

## Step 4: Import Replications

### Dry Run (See what will be imported)

```bash
# See all videos that will be imported (no changes)
node scripts/import-replications.mjs --dry-run

# Import only videos (skip images until you assign effects)
node scripts/import-replications.mjs --dry-run --skip-images
```

### Execute Import

```bash
# Import videos only (safe - images don't have effect assignments yet)
node scripts/import-replications.mjs --execute --skip-images

# After assigning effects to images, import them
node scripts/import-replications.mjs --execute --skip-videos
```

## Step 5: Verify Import in Convex

Check Convex dashboard:

```bash
# Convex dev dashboard URL appears when you run: npx convex dev
# Look for: "Dev dashboard is available at ..."
```

You should see:
- 66 video replications imported
- 109 image replications (once effect_slug is assigned)

## Step 6: Update Effect Articles

For each effect that has replications, update the effect's `gallery_order` field:

1. In Convex dashboard, find the subjective effect
2. Add a `gallery_order` array with replication slugs in desired order:

```json
{
  "gallery_order": [
    "breathing-bricks-phosform",
    "another-breathing-video-artist"
  ]
}
```

Or leave empty for default order (alphabetical by slug).

## Troubleshooting

### "Convex dev not running" error

Make sure you have Convex dev server running:

```bash
cd /Users/josie/Documents/Utilities/dose.wiki\ copy
npx convex dev
# Keep this terminal open while importing
```

### Image effect assignment

If you're unsure about which effect an image represents:

1. Check the filename for clues
2. Look at the artist name (some artists specialize in certain effects)
3. Search the EffectIndex site for similar images: https://effectindex.com/
4. Ask in the community or skip it for now (set effect_slug to a guess, can be corrected later)

### File not found errors

Make sure files are in the correct locations:

```bash
# Videos should be in:
/Users/josie/Documents/Utilities/unified osmanthus app/replications/videos/new/[effect-folder]/

# Images should be in:
/Users/josie/Documents/Utilities/unified osmanthus app/replications/images/
```

## File Structure

```
videos/new/
├── breathing/
│   └── breathing bricks by phosform.mp4
├── geometry/
│   ├── cushions by phosform.mp4
│   └── dmtunnel by bearfromvoid.mov
├── visual-trails/
└── ... [14 more effect folders]

images/
├── image1.jpg
├── image2.png
└── ... [107 more images]
```

## Replication Metadata Format

Each replication has:

```json
{
  "slug": "unique-slug-identifier",
  "title": "Display Title",
  "artist": "Artist Name",
  "type": "video|image",
  "effect_slug": "effect-slug-or-null",
  "folder_name": "folder-name-or-null",
  "filename": "filename.ext",
  "format": "mp4|jpg|png|etc",
  "fileSize": 12345,
  "width": 1920,
  "height": 1080,
  "duration": 30.5
}
```

## Next Steps

1. ✅ Review `replications-metadata.json`
2. ⬜ Assign `effect_slug` to all 109 images
3. ⬜ Run `npx convex dev`
4. ⬜ Import videos: `node scripts/import-replications.mjs --execute --skip-images`
5. ⬜ Import images: `node scripts/import-replications.mjs --execute --skip-videos`
6. ⬜ Update `gallery_order` in effect articles (optional - controls display order)
7. ⬜ Test gallery on effect pages

## Quick Reference

```bash
# Scan for metadata
node scripts/scan-replications.mjs

# Dry run (see what will happen)
node scripts/import-replications.mjs --dry-run

# Import videos only (safe)
node scripts/import-replications.mjs --execute --skip-images

# Import images only (after assigning effects)
node scripts/import-replications.mjs --execute --skip-videos

# Import everything (requires all images to have effect_slug)
node scripts/import-replications.mjs --execute
```

## Additional Resources

- Lightgallery docs: https://www.lightgalleryjs.com/
- EffectIndex site: https://effectindex.com/
- DoseWiki effects: `/effects` route in the app
