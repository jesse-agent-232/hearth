# Configuration

Everything is in a single `config.yml`. See [`config.example.yml`](../config.example.yml) for the full reference.

Config is watched and reloaded automatically — no restart needed.

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
  admin_usernames: ["admin"]
  admin_groups: ["admins"]
  password_change_url: null
  registration:
    enabled: false
    url: null
```

Secrets use `${ENV_VAR}` syntax — substituted at runtime, never committed. Session cookies are HMAC-signed using the OIDC client secret.

Any OIDC provider works. Two details trip people up:

- **The issuer must match the provider's exactly.** Copy it from the provider's `/.well-known/openid-configuration`. Holm retries once with or without a trailing slash. If discovery still fails, the login page says sign-in is unavailable and the server log has the reason.
- **Log out ends the provider session only if the provider supports it.** When the discovery document lists an `end_session_endpoint`, Log out sends the user there, so the next login asks for a password. Without one (Authelia, for example), Log out only clears Holm's session, and the next login goes straight back in while the provider session lasts.

### Authentik

1. **Applications → Applications → Create with provider**, provider type **OAuth2/OpenID**.
2. Client type **Confidential**. Copy the client ID and secret into `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`. If the provider lists grant types (Authentik 2026.x), make sure **Authorization Code** is enabled. A provider without it rejects the login with "The request is otherwise malformed".
3. Redirect URI (strict): `https://dash.example.com/auth/callback`, the same host as `redirect_base`.
   On Authentik 2026.5 or later, also add `https://dash.example.com/` as a redirect URI of type **Logout**, so Log out returns to Holm. Without it, users end up on Authentik's login page. Earlier versions always do that.
4. **Invalidation flow: `default-invalidation-flow`.** The default `default-provider-invalidation-flow` logs the user out of Holm only and offers an Authentik logout as an extra button. On a shared device you want the full logout.
5. Leave the default scopes (`openid`, `email`, `profile`). Authentik sends `groups` as part of `profile`, so `admin_groups` works without a `groups` scope.

```yaml
auth:
  enabled: true
  oidc:
    issuer: "https://authentik.example.com/application/o/holm/"   # the application slug, trailing slash included
    client_id: "${OIDC_CLIENT_ID}"
    client_secret: "${OIDC_CLIENT_SECRET}"
    scopes: "openid profile email"
    redirect_base: "https://dash.example.com"
  admin_groups: ["authentik Admins"]   # or a group you create for Holm admins
```

## Database

```yaml
database:
  enabled: true          # false = localStorage-only, no SQLite
  # path: "./data/holm.db"   # can also set via DATABASE_PATH env var
```

SQLite is built in (one file in the data volume), so there's no separate database to run. When enabled, user preferences persist there and sync across devices.

When disabled, Holm runs browser-only: preferences live in each browser's localStorage, apps admins add with **+** aren't saved, and integrations are switched off, since they have nowhere to keep credentials.

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

Apps are a flat list. The older `category:` / `items:` shape still loads (flattened, with a warning).

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

tips:
  enabled: true
  max_days: 7

privacy:
  enabled: true
  last_updated: "April 2026"
  file: "privacy.md"
```

## Integration credentials

Users connect integrations with their own credentials, encrypted at rest with AES-256-GCM. Set `HOLM_SECRET_KEY` (32 bytes, hex or base64: `openssl rand -hex 32`) in production. Without it, Holm generates `.integrations-key` in the same directory as the database, so anyone with a copy of the data directory also has the key.

For the list of supported apps, how users connect and how to add a new integration, see [integrations.md](integrations.md).
