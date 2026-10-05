# Hearth

The self-hosted dashboard for your team, family, or org — not just the admin.

Most self-hosted dashboards are admin tools: one person configures them, one person uses them. Hearth is different. It's a **shared portal** where every member logs in, sees their own customized view, and gets guided through setting up apps.

## Features

- **OIDC authentication** — works with Authelia, Authentik, Keycloak, Auth0, or any OIDC provider
- **Per-user app grid** — each user toggles which apps appear on their dashboard
- **Optional SQLite** — enable via config for server-side prefs, or use localStorage-only mode
- **Shared admin apps** — admins add apps from a searchable directory (~90 curated apps)
- **Custom bookmarks** — users add their own links with auto-favicon or icon prefix
- **Theme selector** — Auto, Dark, or Light mode per user
- **Configurable icon style** — Colored (brand tiles), White, or Grayed
- **Brand tiles** — set `color` per app for iOS-style tiles (mono glyph on brand background)
- **CDN-based icons** — Dashboard Icons, Simple Icons — no bundled SVGs
- **Custom mono icons** — `icon_mono` field for apps not in Simple Icons
- **Grayscale fallback** — auto-grayscale when mono icon fails to load
- **Config-driven fonts** — any Google Font or self-hosted font via `config.yml`
- **Wallpaper picker** — choose from 326 wallpapers or use daily rotation (Auto theme only)
- **Password change prompt** — gate that prompts new users to change their default password
- **Onboarding flow** — composable config-driven slides with built-in types and a generic `list` slide
- **Setup guides** — step-by-step instructions for connecting to self-hosted services
- **Inline tips** — subtle setup hints below the app grid, dismissable per user
- **App store links** — context menu shows iOS/Android download links per app
- **Admin vs member views** — admins (by username or OIDC group) see infrastructure tools
- **Markdown privacy policy** — write `privacy.md` or use inline YAML sections
- **YAML config** — one file configures everything: apps, auth, branding, features
- **Hot reload** — config changes detected automatically, no container restart needed
- **Weather widget** — Open-Meteo (free, no API key)
- **News headlines** — any RSS feed
- **Integrations** — pluggable app adapters (Immich, Paperless, Nextcloud, Planka, Karakeep, Jellyfin) with encrypted per-user credentials
- **Launcher** — Raycast-style: apps, commands, integration results and web-search fallbacks in one ranked list; apps you open often rise to the top
- **Command prefixes** — `!p` / `!b` / `!photos` scope search to one integration; `!settings` / `!theme` / `!icon` / `!wall` / `!logout` fire quick actions
- **Keyboard** — type anywhere (or `/`, `⌘K` / `Ctrl+K`) to search; `↑ ↓` move, `↵` opens, `⌘↵` opens the other way (tab vs new tab), `⌘K` shows every action for the selected result, `Esc` steps back one level
- **Browser default search** — `/?q=…` opens Hearth with the launcher prefilled, and `/opensearch.xml` lets browsers add Hearth as a search engine. On phones the search docks at the bottom, above the keyboard
- **Search bar** — configurable fallback search engine (Google, SearXNG, etc.)
- **PWA support** — installable as a native app on mobile
- **Docker** — single container, multi-arch (amd64/arm64)

## Quick Start

```bash
git clone https://github.com/sameerman/hearth.git
cd hearth
cp config.example.yml config.yml
npm install
npm run dev
# Visit http://localhost:5173/?user=demo
```

## Docker

```yaml
services:
  hearth:
    image: ghcr.io/sameerman/hearth:latest
    ports:
      - "3000:3000"
    environment:
      - OIDC_CLIENT_ID=your-client-id
      - OIDC_CLIENT_SECRET=your-client-secret
    volumes:
      - ./config.yml:/app/config.yml:ro
      - hearth-data:/app/data       # only needed if database.enabled: true
    restart: unless-stopped

volumes:
  hearth-data:
```

## Configuration

Everything is in a single `config.yml`. See [`config.example.yml`](config.example.yml) for the full reference.

Config is watched and reloaded automatically — no restart needed.

### Branding

```yaml
branding:
  name: "My Homelab"
  short_name: "homelab"
  description: "Personal dashboard"
  logo: "/icons/logo.svg"
  favicon: "/icons/favicon.svg"
  font:
    family: "JetBrains Mono"
    url: null   # JetBrains Mono is bundled; set a stylesheet URL only for another font
  theme_color: "#09090b"
```

### Authentication

```yaml
auth:
  enabled: true
  oidc:
    issuer: "https://auth.example.com"
    client_id: "${OIDC_CLIENT_ID}"
    client_secret: "${OIDC_CLIENT_SECRET}"
    scopes: "openid profile groups"
    redirect_base: "https://dash.example.com"
  admin_usernames: ["admin"]
  admin_groups: ["lldap_admin"]
  password_change_url: null
  registration:
    enabled: false
    url: null
```

Secrets use `${ENV_VAR}` syntax — substituted at runtime, never committed. Session cookies are HMAC-signed using the OIDC client secret.

### Database

```yaml
database:
  enabled: true          # false = localStorage-only, no SQLite
  # path: "./data/hearth.db"   # can also set via DATABASE_PATH env var
```

When enabled, user preferences persist in SQLite and sync across devices. When disabled, preferences are stored in the browser's localStorage only — no server-side state, no data volume needed.

### Apps

```yaml
apps:
  - category: "Storage"
    items:
      - id: photos
        name: "Photos"
        url: "https://photos.example.com"
        icon: "di:immich"                    # colored icon (required)
        icon_mono: "si:immich"               # mono icon for white/grayed styles (optional)
        color: "#4250AF"                     # brand tile background (optional)
        internal: true
        default_visible: true
        app_store:
          ios: "https://apps.apple.com/..."
          android: "https://play.google.com/..."
        setup_guide:
          subtitle: "Auto backup your photos"
          steps:
            - label: "Download"
              desc: "Get the app from your store."
```

### Icons

Icons load from CDNs. Users choose Colored, White, or Grayed in the Configure panel.

**Colored mode** displays full-color dashboard icons by default. Apps with an explicit `color` field get iOS-style brand tiles (mono glyph on colored background).

**White/Grayed modes** use the mono icon source with CSS filters. When no mono icon is available, the colored icon is automatically grayscaled.

| Field | Purpose | Example |
|-------|---------|---------|
| `icon` | Full-color icon (required) | `"di:immich"`, `"https://example.com/icon.svg"` |
| `icon_mono` | Mono icon for white/grayed styles (optional) | `"si:immich"`, `"di:immich-light"` |
| `color` | Brand tile background hex (optional) | `"#FF0000"` |

**Prefixes:**

| Prefix | Source | Example |
|--------|--------|---------|
| `di:` | [Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) | `di:nextcloud` |
| `si:` | [Simple Icons](https://simpleicons.org) | `si:youtube` |

Direct URLs also work: `"https://cdn.example.com/icon.svg"`.

### Onboarding

Onboarding uses a composable `slides` array. Each slide has a `type` — built-in types (`welcome`, `services`) have special behavior, while `privacy`, `security`, and `list` all render through a generic list engine with per-type defaults.

```yaml
onboarding:
  enabled: true
  welcome_text: "Your data stays on your hardware."
  slides:
    - type: welcome                        # greeting with brand logo
    - type: services                       # auto-derived from self-hosted apps
    - type: privacy                        # defaults: shield icon, privacy claims
      items:                               # override default items
        - text: "Your data lives on **our hardware**"
        - text: "**No tracking**, no ads — ever"
    - type: security                       # defaults: lock icon, security tips
    - type: list                           # fully custom slide (no defaults)
      icon: info                           # any Lucide icon name or direct URL
      title: "House Rules"
      subtitle: "A few things to know"
      list_icon: arrow-right               # default icon for all items (default: check)
      items:
        - text: "Be **respectful** to everyone"        # {text} format — supports **bold**
        - title: "Report issues"                       # {title, desc} format
          desc: "Contact the admin if something breaks"
          icon: alert-circle                           # per-item icon override
      footer: "Thanks for being here"
```

All list-based types (`privacy`, `security`, `list`) support: `icon`, `title`, `subtitle`, `items`, `footer`, `list_icon`. Items auto-detect format: `{text}` renders with bold markdown, `{title, desc}` renders as **title** — desc. Both formats can coexist in one slide.

**Icons:** Use any [Lucide](https://lucide.dev/icons) icon by name (e.g., `shield-check`, `lock`, `info`). Direct URLs also work. Browse 1400+ icons at [lucide.dev/icons](https://lucide.dev/icons).

### Optional Features

```yaml
news:
  enabled: true
  rss_url: "https://news.google.com/rss"

search:
  enabled: true
  url: "https://www.google.com/search"
  param: "q"
  name: "Google"
  icon: "di:google"

integrations:
  immich:
    enabled: true
    name: "Photos"
    default_url: "https://immich.example.com"
    surfaces:
      search: true
      widgets: false
  karakeep:
    enabled: true
    name: "Bookmarks"
    default_url: "https://karakeep.example.com"
    surfaces:
      search: true
      widgets: false

wallpapers:
  enabled: true

weather:
  enabled: true                # users set their location from the weather pill

tips:
  enabled: true
  max_days: 7

privacy:
  enabled: true
  last_updated: "April 2026"
  file: "privacy.md"
```

## How It Works

1. Admin creates `config.yml` with apps, auth, and branding
2. Users log in via OIDC — new users see a configurable onboarding flow
3. Each user customizes their grid, theme, icon style, and bookmarks
4. Preferences stored in SQLite (if enabled) with localStorage cache for instant load
5. Admins add apps from a searchable directory via the Configure panel
6. Config changes hot-reload on next request

## Stack

- [SvelteKit](https://kit.svelte.dev/) + [Tailwind CSS](https://tailwindcss.com/)
- [sql.js](https://github.com/sql-js/sql.js) (optional, WASM-based SQLite)
- [openid-client](https://github.com/panva/node-openid-client) for OIDC
- [simple-icons](https://github.com/simple-icons/simple-icons) for brand colors
- [js-yaml](https://github.com/nodeca/js-yaml) for config
- [marked](https://github.com/markedjs/marked) + [DOMPurify](https://github.com/cure53/DOMPurify) for markdown
- [adapter-node](https://kit.svelte.dev/docs/adapter-node) for Docker

## Design System

Hearth ships a small Tailwind-v4 design system: a 4-level surface elevation ladder (`surface-0..3`), unified type/radius/shadow/motion scales, and a single `bloom-focus` focus state. See [`docs/design-system.md`](docs/design-system.md) for the full guide and recipe gallery — every UI surface composes from this vocabulary.

## License

MIT
