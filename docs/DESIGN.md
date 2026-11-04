# Design contract

Wheelhouse is a holder-first utility, not a trading dashboard. Keep the static browser/SDK/MCP architecture and the equal Sepolia profiles. Do not introduce a backend, redesign the application or change deployment authority as a documentation task.

## Tokens

`web/styles.css` is the source of exact token values. Use its warm neutral surfaces, gold primary actions, blue focus/links, shared radii and spacing. Light is the default; saved light/dark/system choices take precedence. Fonts are local Barlow Condensed (headings), Quicksand (body) and IBM Plex Mono (addresses/data). No remote font dependency.

Core tokens (dark theme overrides the same names):

| Token | Light | Dark |
| --- | --- | --- |
| `--sqk-bg` / `--sqk-panel` | `#fafaf7` / `#ffffff` | `#10120f` / `#141418` |
| `--sqk-ink` / `--sqk-line` | `#292b26` / `#dedfd7` | `#edeee7` / `#353b30` |
| `--sqk-gold-bright` / `--sqk-blue` | `#d9a017` / `#4460cf` | `#ffc048` / `#9aafff` |
| Panel / control radius | 10px / 4px | Same |
| Spacing scale | 8 / 16 / 20 / 24 / 40px | Same |

Header controls: 36px height, shared radius, 8px gaps, 18px SVG glyphs. Body/dialog controls: at least 44px targets. Use visible focus, sufficient contrast in both themes and reduced-motion support. Do not cover the wallet/header with banners; position notices below its measured bottom edge.

## Layout

- One verification badge opens Trust. One address-only wallet button opens ETH balance, network-switch retry, copy, Activity and disconnect.
- Squeeks is the main holder workspace: separate NFT grid and SQK actions. Wallet/Deposited filters share verified counts. Avoid nested border cards and an action dropdown.
- Selection reveals appropriate action/review controls; empty portfolios hide irrelevant actions. Mobile stacks at 390px with full-width controls and no horizontal overflow.
- Token pages, merge paths and address links retain the selected profile. Watch mode has a contextual Viewing chip and Exit, independent of connected wallet identity. Watch actions cannot sign, even for the connected owner's address.
- The merge planner explains readiness/custody/cooldown and selects only the next step. Keep permanent burn review separate from planning.
- Network uses a compact deduplicated feed (five entries plus More), a single ACTIVE line and a Checking state. Distinguish settlement, issuance and provisional measurements.
- Developers and Settings remain lazy-loaded. Put raw technical details behind a collapsed section with Copy JSON; ordinary reviews use human labels.

## Subtract and copy rules

Subtract before adding: remove duplication, decorative panels, redundant helpers and internal jargon. Do not remove a safety warning or replace a known limitation with optimistic copy. Use one non-affiliation footer.

Say **Squeeks**, **SQK**, **Keep**, **Burn**, **SQK issued**, **Viewing**, **Unknown**, **Checking**, **Fee rose** and **Quote expired** where applicable. Internal release IDs, storage slots, digests, method names and revisions belong only in Info/Developers, not ordinary labels. The read-only address placeholder is `0x… (view only)`.

Loading, Unavailable/Retry, wrong chain, empty portfolio and disconnected are distinct. Never ask a connected wallet to reconnect because a read failed. Unknown is not zero. ETA needs fresh measurements; cooldown is completed Squeek blocks, not a guaranteed wall-clock deadline.

## Interaction and accessibility

Review before a wallet prompt; fresh canonical preparation/simulation follows review. Show full differing claim recipient and approval scope/spender. Collection approval explicitly covers all current and future Squeeks. Never imply that network gas is the SQK unstake fee cap.

Use exact `BURN-<donorId>` before constructing/simulating a merge. Re-quote is explicit, not an automatic wallet retry. Wallet waiting has inline progress and Cancel, with honest provider-prompt/broadcast limitations and late-hash Activity links.

Preserve keyboard tab/menu navigation, skip link, modal/sheet focus traps, focus restoration and accessible lifecycle toasts. Announce loading/failure states without hiding the header. Isolate artwork as images; lazy loading and skeletons must not become transaction authority.
