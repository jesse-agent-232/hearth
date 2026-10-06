# Integrations

Holm has two kinds of app support.

- **Tiles** work with any app that has a URL. List it under `apps:` in `config.yml` and Holm looks up its icon by name from [Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) or [Simple Icons](https://simpleicons.org). No fixed list applies. See [configuration.md](configuration.md#apps).
- **Integrations** let users search *inside* an app from Holm's search bar, with each user's own credentials.

## Supported integrations

| App | What you can search | How users connect | Default scope |
|---|---|---|---|
| Immich | Photos (smart search) | URL + API key | `!photos` |
| Paperless-ngx | Documents (full text) | URL + API token | `!d` |
| Nextcloud | Files | URL + username + app password | `!f` |
| Jellyfin | Movies, shows and music | Quick Connect sign-in, no key to copy | `!jf` |
| Planka | Boards and cards | URL + API key | `!p` |
| Karakeep | Bookmarks (full text) | URL + API key | `!b` |
| Plex | Movies, shows and music | Code at plex.tv/link, no key to copy | `!plex` |
| Navidrome | Artists, albums and songs | URL + username + password (only a derived token is kept) | `!nd` |
| Audiobookshelf | Audiobooks and podcasts | URL + API key | `!abs` |
| Mealie | Recipes | URL + API token | `!r` |

Integrations are marked Alpha in the UI. Widgets on the dashboard are reserved for a later release.

## Enabling an integration (operator)

An integration is invisible to users until it is listed under `integrations:` in `config.yml`:

```yaml
integrations:
  immich:
    enabled: true                             # omit the entry, or set false, to hide it
    name: "Photos"                            # optional display name
    shortcut: "photos"                        # optional: !photos scopes the search bar to this integration
    default_url: "https://photos.example.com" # optional: pre-fills and locks the URL field
    surfaces:
      search: true
      widgets: false                          # reserved
```

The key (`immich`) must match the adapter id. If an app in `apps:` has the same `id`, the integration uses that app's icon.

## Connecting (users)

1. Open **Settings → Integrations**.
2. Pick an app and fill in the fields. Each field says where to find the key in that app, with a link to the right settings page.
3. Press **Connect**. Holm tests the connection first and only saves credentials that work.

Jellyfin skips the form: Holm shows a code, the user approves it under Quick Connect in Jellyfin, and Holm receives that user's own token.

Plex works the same way: the user enters Holm's code at [plex.tv/link](https://plex.tv/link). Holm keeps only the access token for the server at the configured URL. For a server you only have shared access to, that token can't reach anything else. For a server you own, Plex returns your account token itself, so treat the stored connection as being as sensitive as your Plex account.

Navidrome asks for a password once. Holm computes the Subsonic token `md5(password + salt)` with a random salt and stores the salt and token, encrypted at rest, never the password. The token works for the Subsonic API until the password changes, and anyone holding the salt and token can try to brute-force a weak password, so use a strong one. Changing the username asks for the password again.

After connecting, results from the app appear in the search bar. Typing `!<shortcut>` searches only that app.

## Security

- **Per-user credentials.** Each user connects with their own key, so search results respect that user's permissions in the app.
- **Encrypted at rest** with AES-256-GCM. Set `HOLM_SECRET_KEY` to 32 bytes, hex or base64 (`openssl rand -hex 32`). Without it, Holm generates `.integrations-key` next to the database, so anyone with a copy of the data directory also has the key. See [configuration.md](configuration.md#integration-credentials).
- **Never sent back to the browser.** API responses redact secret fields. Thumbnails and previews are fetched through Holm (`/api/integrations/<id>/proxy/…`), so the key never appears in an `<img src>`.
- **Disconnect** deletes the stored credentials. Jellyfin also revokes its token. To revoke a Plex sign-in, remove the "Holm" device under **Authorized Devices** in Plex.

## Adding an integration

An integration is one file plus one import line. The settings form, API routes and search bar discover it on their own.

1. Create `src/lib/server/integrations/<id>.js` that default-exports an adapter object:

   ```js
   /** @type {import('./_types.js').IntegrationAdapter} */
   export default {
   	id: 'myapp',                 // must match the config.yml key
   	name: 'My App',
   	shortcut: 'm',               // default !scope
   	description: 'One-line summary',

   	// Fields rendered in the connect form: url, text or secret
   	configSchema: [
   		{ key: 'url', type: 'url', label: 'URL', required: true, fromOperatorDefault: 'default_url' },
   		{ key: 'apiKey', type: 'secret', label: 'API key', required: true }
   	],

   	// Runs on Test and before Connect; message is shown as-is
   	async test({ config, fetch }) {
   		return { ok: true, message: 'Connected' };
   	},

   	searchProviders: {
   		items: {
   			label: 'Items',
   			mode: 'inline',
   			async query({ config, query, limit, fetch }) {
   				return { results: [{ id, title, subtitle, thumbnail, href }] };
   			}
   		}
   	},

   	// Optional: serve authenticated images through Holm
   	proxy: {
   		thumbnail: { async fetch({ config, params, fetch }) { /* return a Response */ } }
   	}
   };
   ```

2. Import it in `src/lib/server/integrations/index.js` and add it to `KNOWN_ADAPTERS`.
3. Add an example entry under `integrations:` in `config.example.yml`.

The full contract, including `signIn` for device-code flows like Quick Connect, `signOut`, and `prepareConfig` for swapping a typed secret for a derived one before it is saved, is documented in [`_types.js`](../src/lib/server/integrations/_types.js). [`karakeep.js`](../src/lib/server/integrations/karakeep.js) is a short, complete example.
