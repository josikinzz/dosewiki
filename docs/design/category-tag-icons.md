# Category Tag Icon Workflow

Category assignments change with the taxonomy, so the repository sources are the
inventory:

- `src/data/config/categoryIcons.ts` owns symbolic category aliases, the default
  icon, direct Iconify identifier pass-through, and `getCategoryIcon`.
- `data/substances/psychoactiveIndexManual.json` stores the current layout's
  `iconKey` values.
- `src/components/common/Icon.tsx` is the shared renderer for Iconify and local
  custom icons.

## Change an icon

1. Use a full Iconify identifier in layout data when the assignment belongs to
   that layout entry.
2. Update `CATEGORY_ICON_MAP` when a normalized symbolic key and its singular or
   plural aliases should resolve consistently across builders and article
   surfaces.
3. Keep `DEFAULT_CATEGORY_ICON` for unknown keys so a taxonomy addition cannot
   remove the visual affordance.
4. Render the resolved name through the shared `Icon` or `IconBadge` component;
   do not import an icon package directly for a category tag.

## Verify

1. Run `npm run test -- src/data/config/categoryIcons.test.ts`. Add an assertion
   when the change introduces a new alias or fallback rule.
2. Run `npm run dev`, then open `/substances`, a substance article with the
   affected category, and the protected `/dev/index-layout` editor.
3. Confirm the icon renders at tag and card sizes, has an accessible label where
   the icon carries meaning, and remains legible in dark and light themes.
4. Test an unknown symbolic key and confirm it still resolves to
   `DEFAULT_CATEGORY_ICON`.
