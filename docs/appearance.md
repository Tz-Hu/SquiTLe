# Timeline appearance

- `app/tokens.css` defines theme colors, typography, spacing, opacity, borders and motion. Component styles in `app/globals.css` consume these tokens. Typography uses 11/12/13/14/18px; weekday labels have the requested 10px exception.
- `lib/appearance.ts` defines configurable defaults, valid ranges, category colors and shared task geometry. Task bodies, connection ports and routing obstacles use the same vertical bounds. Rows stay 64px high when bar height changes.
- Settings expose theme, task height/radius/fill, completion opacity, dependency opacity, weekend/weekly structure, category colors and separate light/dark table palettes. Preferences persist with schedule data in `research-gantt-v2`.
- Palette version 2 upgrades previous default colors while preserving customized values. Reset controls affect only their named section/current theme, never tasks or relationships.
- Category filters change opacity only; hidden-category tasks remain selectable and keep their dates and dependencies. Click the active category again or “显示全部” to clear the filter.
- Dependencies use one solid orthogonal route with 4px corners and 5px arrows. Selection retains its wider invisible hit area and endpoint editing. The selected line renders last so crossing lines do not cover it.

Validation: `npx tsc --noEmit` and `node --experimental-strip-types --test tests/*.test.ts`.

## Language and typography

The globe next to the theme controls switches Chinese/English. UI copy lives in `lib/i18n.ts`; `LocaleProvider` stores language separately from schedule data and updates the document language/title. Task/project names and stored status/type identifiers remain unchanged. Visible month headers center within the intersection of each month and the date viewport.

Inter Variable is self-hosted in `public/fonts/` with its SIL OFL license. Chinese uses PingFang SC or Noto Sans SC when installed. Typography references: https://linear.app/now/how-we-redesigned-the-linear-ui, https://vercel.com/font, https://rsms.me/inter/.
