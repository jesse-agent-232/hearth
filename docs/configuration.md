# Configuration

Everything is in a single `config.yml`, found at `CONFIG_PATH` (default `config.yml` in the working directory; `/app/config.yml` in the image). [`config.example.yml`](../config.example.yml) is an annotated example and the [reference table](#reference) below lists every key.

**Reloading.** Holm watches the file and rereads it on the next request after a save: apps, branding, search, integrations, onboarding and the rest take effect without a restart. These are read once and need a restart: `auth.oidc` (the provider is discovered once), `database`, and the encryption key. A save that breaks the file (bad YAML, an unset `${VAR}`) makes every request fail with the reason in the log until it's fixed.

**Failing closed.** Holm refuses to start, and logs why, when the config is missing or unreadable, isn't valid YAML, names an unset or empty `${VAR}`, when `HOLM_SECRET_KEY` is malformed, or when the data directory isn't writable. That directory holds the database and, without `HOLM_SECRET_KEY`, the key file, so it must be writable even with `database.enabled: false` unless you set `HOLM_SECRET_KEY`. It never falls back to defaults with sign-in off.

## Environment variables

| Variable | Purpose |
|---|---|
| `CONFIG_PATH` | Path to `config.yml`. |
| `DATABASE_PATH` | SQLite file. Overrides `database.path`. Default `./data/holm.db`. |
| `HOLM_SECRET_KEY` | 32 bytes, hex or base64 (`openssl rand -hex 32`). Encrypts integration credentials and signs sessions. Without it, Holm generates `.integrations-key` next to the database. Set but malformed = Holm won't start. |
| `PORT` | Listening port (`3000` in the image). |
| anything in `${…}` | Substituted into `config.yml` at load. Unset or empty = Holm won't start. |

## Branding

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

## Authentication

```yaml
auth:
  enabled: true
  oidc:
    issuer: "https://auth.example.com"
    client_id: "${OIDC_CLIENT_ID}"
    client_secret: "${OIDC_CLIENT_SECRET}"
    scopes: "openid profile groups"
    redirect_base: "https://dash.example.com"
  password_change_url: null
  registration:
    enabled: false
    url: null
```

Secrets use `${ENV_VAR}` syntax, substituted at load, so they stay out of the file. Session cookies are HMAC-signed with a key derived from Holm's master key (`HOLM_SECRET_KEY` or the key file) and expire after 30 days; groups are read at sign-in.

Any OIDC provider works. Two details trip people up:

- **The issuer must match the provider's exactly.** Copy it from the provider's `/.well-known/openid-configuration`. Holm retries once with or without a trailing slash. If discovery still fails, the login page says sign-in is unavailable and the server log has the reason.
- **Log out ends the provider session only if the provider supports it.** When the discovery document lists an `end_session_endpoint`, Log out sends the user there, so the next login asks for a password. Without one (Authelia, for example), Log out only clears Holm's session, and the next login goes straight back in while the provider session lasts.

### Authentik

1. **Applications → Applications → Create with provider**, provider type **OAuth2/OpenID**.
2. Client type **Confidential**. Copy the client ID and secret into `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`. If the provider lists grant types (Authentik 2026.x), make sure **Authorization Code** is enabled. A provider without it rejects the login with "The request is otherwise malformed".
3. Redirect URI (strict): `https://dash.example.com/auth/callback`, the same host as `redirect_base`.
   On Authentik 2026.5 or later, also add `https://dash.example.com/` as a redirect URI of type **Logout**, so Log out returns to Holm. Without it, users end up on Authentik's login page. Earlier versions always do that.
4. **Invalidation flow: `default-invalidation-flow`.** The default `default-provider-invalidation-flow` logs the user out of Holm only and offers an Authentik logout as an extra button. On a shared device you want the full logout.
5. Leave the default scopes (`openid`, `email`, `profile`). Authentik sends `groups` as part of `profile`, so app `groups:` work without a `groups` scope.

```yaml
auth:
  enabled: true
  oidc:
    issuer: "https://authentik.example.com/application/o/holm/"   # the application slug, trailing slash included
    client_id: "${OIDC_CLIENT_ID}"
    client_secret: "${OIDC_CLIENT_SECRET}"
    scopes: "openid profile email"
    redirect_base: "https://dash.example.com"
```

## Database

```yaml
database:
  enabled: true          # false = localStorage-only, no SQLite
  # path: "./data/holm.db"   # can also set via DATABASE_PATH env var
```

SQLite is built in (one file in the data volume), so there's no separate database to run. When enabled, user preferences persist there and sync across devices.

When disabled, Holm runs browser-only: preferences live in each browser's localStorage and integrations are switched off, since they have nowhere to keep credentials.

## Apps

```yaml
apps:
  - id: photos                             # stable — user prefs key off it
    name: "Photos"
    url: "https://photos.example.com"
    icon: "di:immich"                      # colored icon (required)
    icon_mono: "si:immich"                 # mono icon for white/grayed styles (optional)
    tile_color: "#4250AF"                  # brand tile background (optional)
    self_hosted: true                      # listed in onboarding's services slide
    default_visible: true                  # placed on a new user's surface
    app_store:
      ios: "https://apps.apple.com/..."
      android: "https://play.google.com/..."
    setup_guide:
      subtitle: "Auto backup your photos"
      steps:
        - label: "Download"
          desc: "Get the app from your store."
```

### Who sees an app

Give an app `groups:` to show it only to users in at least one of those OIDC groups. An app without `groups` is shown to everyone.

```yaml
  - id: sonarr
    name: "Sonarr"
    url: "https://sonarr.example.com"
    icon: "di:sonarr"
    groups: ["arr"]
```

The server drops apps a user can't see before the page reaches the browser, so their tiles and URLs never reach it. This covers the app grid only. Integrations aren't covered by `groups:`: every enabled integration is still listed to every signed-in user, with its URL, and anyone can connect it. With auth disabled everyone is a guest with no groups, so every app with `groups:` disappears. Groups come from the provider's `groups` claim (add the `groups` scope; Authentik includes it in `profile`) and are read at login, so a group change applies the next time the user signs in.

`admin_only: true` and the `admin_groups` / `admin_usernames` settings are gone. An app that still has `admin_only: true` and no `groups` is hidden from everyone, with a warning in the log; replace it with something like `groups: ["admins"]`.

Apps are a flat list. The older `category:` / `items:` shape still loads, flattened silently.

## Icons

Icons load from CDNs. Users choose Colored, White, or Grayed in the Configure panel.

**Colored mode** displays full-color dashboard icons by default. Apps with an explicit `tile_color` field get iOS-style brand tiles (mono glyph on colored background).

**White/Grayed modes** use the mono icon source with CSS filters. When no mono icon is available, the colored icon is automatically grayscaled.

| Field | Purpose | Example |
|-------|---------|---------|
| `icon` | Full-color icon (required) | `"di:immich"`, `"https://example.com/icon.svg"` |
| `icon_mono` | Mono icon for white/grayed styles (optional) | `"si:immich"`, `"di:immich-light"` |
| `tile_color` | Brand tile background hex (optional) | `"#FF0000"` |

**Prefixes:**

| Prefix | Source | Example |
|--------|--------|---------|
| `di:` | [Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) | `di:nextcloud` |
| `si:` | [Simple Icons](https://simpleicons.org) | `si:youtube` |

Direct URLs also work: `"https://cdn.example.com/icon.svg"`.

## Onboarding

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

## Optional Features

```yaml
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

privacy:
  enabled: true
  last_updated: "April 2026"
  file: "privacy.md"
```

Set `default_url` for every integration you enable: it pins the server URL for every user. Without it, users can point the integration at any http(s) host Holm can reach, and Holm logs a warning at startup.

`tips` is accepted but has no effect: the first-week tips are switched off in this release.

## Integration credentials

Users connect integrations with their own credentials, encrypted at rest with AES-256-GCM. Set `HOLM_SECRET_KEY` (32 bytes, hex or base64: `openssl rand -hex 32`) in production. Without it, Holm generates `.integrations-key` in the same directory as the database, so anyone with a copy of the data directory also has the key. The same key signs sessions, so changing it signs everyone out.

For the list of supported apps, how users connect and how to add a new integration, see [integrations.md](integrations.md).

## Reference

Every key Holm reads. "Reload" means a save takes effect without a restart.

| Key | Type | Default | Reload | Notes |
|---|---|---|---|---|
| `branding.name` / `short_name` / `description` | string | `Holm` / `holm` / `Self-hosted dashboard` | yes | Header, footer, PWA manifest, meta description |
| `branding.logo` / `favicon` | path or URL | built-in | yes | Favicon falls back to the logo |
| `branding.font.family` / `font.url` | string / URL | `JetBrains Mono` / none | yes | The default font is bundled; a URL is only for another font |
| `branding.theme_color` | hex | `#09090b` | yes | PWA theme color |
| `branding.accent_color` | hex | `#f5b942` | yes | Focus rings, selected states, hover halos |
| `branding.show_footer` | bool | `true` | yes | Footer with the brand name and register / privacy links |
| `auth.enabled` | bool | `false` | yes | `false` = every visitor is the same Guest with no groups |
| `auth.oidc.issuer` / `client_id` / `client_secret` / `scopes` / `redirect_base` | string | none | restart | Endpoints are discovered from the issuer |
| `auth.password_change_url` | URL | none | yes | Adds "Change password" to the user menu |
| `auth.registration.enabled` / `url` | bool / URL | `false` | yes | A "Register" link on the sign-in screen |
| `database.enabled` | bool | `true` | restart | `false` = preferences in each browser only, integrations off |
| `database.path` | path | `./data/holm.db` | restart | `DATABASE_PATH` wins |
| `customization.enabled` | bool | `false` | yes | Without it there is no Configure panel and the grid is fixed |
| `apps[]` | list | `[]` | yes | Fields under [Apps](#apps): `id`, `name`, `url`, `icon`, `icon_mono`, `tile_color`, `self_hosted`, `default_visible`, `groups`, `tags` (shown on search results), `app_store`, `browser_extension`, `setup_guide` |
| `search.enabled` / `url` / `param` / `name` / `icon` | | enabled, Google, `q` | yes | The fallback web search |
| `integrations.<id>.enabled` | bool | on when the block exists | yes | `false` hides it; so does leaving the block out |
| `integrations.<id>.name` / `shortcut` / `tip` | string | adapter's | yes | Display name, `!scope`, a hint on the connect card |
| `integrations.<id>.default_url` | URL | none | yes | Pins the server URL for every user. Set it for every integration |
| `integrations.<id>.surfaces.search` / `widgets` | bool | `true` / `false` | yes | `widgets` is used by Navidrome's player only |
| `integrations.planka.cache_ttl` | seconds | `300` | yes | How long Planka cards are cached per user |
| `wallpapers.enabled` | bool | `false` | yes | Wallpaper picker and daily rotation |
| `weather.enabled` | bool | `false` | yes | Users set their own location |
| `onboarding.enabled` / `welcome_text` / `services` / `slides` | | off | yes | See [Onboarding](#onboarding) |
| `privacy.enabled` / `last_updated` / `file` / `sections` | | off | yes | `file` is relative to `config.yml` |
| `tips.*` | | | | Accepted, no effect in this release |
