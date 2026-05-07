# Hearth Vision

> The "why" and "what" — implementation choices push against this doc.

## Premise

Hearth is a self-hosted dashboard an **admin sets up once** for everyone they share a homelab with — family, housemates, team. It is not a status console. It is a **glance**: a personal start page each user makes their own, hosted by someone who already runs the infrastructure.

This is what separates Hearth from Homarr, Dashy, Homepage, and Glance: those are admin tools where one person configures everything for one viewer. Hearth is multi-user from the floor up — the admin never authors a user's surface, and a user never edits the admin's catalog.

## Roles

**admin (global, in `config.yml`)**

- Catalog of self-hosted apps (with `default_visible` per app)
- Integration credentials — wired once
- Custom CSS theme — re-skin Hearth to feel like Glance, Homarr, or anything else; default theme ships as today
- Onboarding slides — composable from built-in types
- Per-app setup guides

**User (per-user, in SQLite or localStorage)**

- Widgets on their surface — which ones, where, how big
- Pinned apps — explicit favorites
- Apps opted into from the broader catalog (anything the admin didn't ship `default_visible: true`)
- Bookmarks — external URLs (YouTube, Reddit, GitHub, anything), picked from a built-in default list or custom-added
- Widget configs — weather location, RSS feeds, etc.

## The surface

A user's surface is a grid of widgets they arrange by drag and resize. **There are no admin-defined categories.** That curation work is gone — the admin exposes apps, the product organizes them through smart built-in widgets.

### Built-in app widgets

- **Pinned** — user's explicit favorites; renders first when non-empty. The escape hatch from any algorithm.
- **Recently used** — last N opened by this user.
- **Most used** — frequency over a rolling window.
- **New apps** — added by the admin within the last 30 days.
- **All apps** — full grid: `default_visible: true` apps plus any the user has opted into from the catalog. Optional tag-based filter if the admin sets tags; no tags means no filter UI.

### Built-in non-app widgets

- **Bookmarks** — user's external links, picked from a built-in default list (YouTube, Reddit, GitHub, etc.) or custom URLs.
- **Integration widgets** — the existing set: weather, RSS, Immich, Paperless, Nextcloud, Planka, Karakeep. admin wires creds; user picks which to display.

Bookmarks and apps stay separate widget types. Mixing them ("recently used" across both) sounds tempting but quickly produces weird rows.

## First-run

1. User signs in.
2. The existing slide-based onboarding plays through — `welcome`, `services` (auto-derived from self-hosted apps), `privacy`, `security`, plus new generic slides (`pin-tutorial`, `bookmarks-intro`, `widgets-intro`) the admin can drop into `onboarding.slides` in any order.
3. After dismiss, default surface = **All apps widget alone**, populated with `default_visible: true` apps.
4. Everything else — bookmarks, more widgets, additional apps from the catalog — is opt-in. Nothing is pushed onto the user's surface.

The existing `services` slide, per-app `setup_guide`, and inline tips system continue to work — they key off `self_hosted: true` and `setup_guide`, not categories, so dropping categories doesn't break them.

## Customization

- **Theme (admin-only)** — a global custom CSS hook. UI elements expose stable class names so the admin can restyle without forking. Per-user CSS is deliberately not supported: the security surface stays tight and the look stays consistent for everyone in a household.
- **Layout (per-user)** — drag, resize, add, remove widgets on their own surface. Persisted per user.

## Non-goals

- **Technical dashboards.** No CPU, disk, container-health widgets. Tools that do that already exist; Hearth is a glance, not a console.
- **admin-defined categories.** Replaced by smart built-in widgets and optional tags-as-filters.
- **Per-user CSS.** Theming is admin-only.
- **Pushing content at the user.** Surfaces show what the user opted into. No surprise widgets, no auto-injected suggestions after first-run.
- **Competing with single-admin dashboards on feature parity.** If a feature only matters for one viewer with all the credentials, it doesn't belong here.

## What changes from today

| Today | New direction |
|---|---|
| Apps grouped by admin-defined categories; users toggle visibility | All apps widget + smart widgets (pinned / recent / most-used / new); no categories |
| Drag/resize at the category level | Drag/resize at the widget level |
| Per-user customization = which apps are visible | Per-user customization = which widgets, where, plus bookmarks and opted-in apps |
| `default_visible` controls toggle-list defaults | `default_visible` controls what shows in All apps without opt-in |
| No admin theming knob | Global custom CSS as a first-class extension point |

## Open questions

- **Tags as a filter inside All apps** — yes, no, or defer? Easy to add later if not now.
- **Onboarding weight** — full guided tour vs. lightweight slides + persistent "Add bookmarks" / "Add widgets" + buttons on an empty surface? The lighter version is more aligned with "glance."
- **Cold start for Recently / Most used** — show them empty with a "use some apps first" hint, or hide until they have signal?
