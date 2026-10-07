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
| Seerr | Movies and shows: play what's there, request what isn't | Automatic through Jellyfin or Plex; otherwise a Quick Connect code | `!sr` |

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

Seerr needs no sign-in of its own for users who connected Jellyfin or Plex: Holm asks Seerr for a Quick Connect code and approves it with the user's Jellyfin token, or passes Seerr the user's Plex token, and keeps the Seerr session that comes back. When that session lapses (Seerr keeps them 30 days), Holm renews it the same way. Holm only does this for the Seerr at `default_url`; a user who points Seerr at another URL signs in with a code. Holm asks Seerr which server it runs on, so the cards only point to the one that can sign in. When a user connects Plex, Holm lends Seerr that sign-in's account token once, so shared users connect too, not only the server's owner; the token isn't kept, so after the session lapses only the owner renews silently, and others sign in again with a code. Without Jellyfin or Plex in Holm, **Sign in** on the Seerr card gives a code for the app Seerr uses: a Jellyfin Quick Connect code, or a code to enter at plex.tv/link. Seerr on Emby isn't supported yet. If Seerr has no account for a Jellyfin user, the card says so instead of showing a code. Set `default_url` for Seerr, or the automatic connection can't know where Seerr is. Seerr must be able to log the user in: the Jellyfin or Plex account has to exist in Seerr, or Seerr's new-user import has to be on.

Jellyfin, Plex and Seerr movies and shows share one **Movies & TV** row, each title once: titles the user has first, then those they can request, then those already requested. Albums and artists stay in their own Jellyfin or Plex row. Music, from Navidrome or that row, shows as compact cards, three to a row on a wide window and two on a narrower one: a small cover on the left, the name on top and the details under it. Seerr results show each title once: if it's on the media server, it opens there (**Play**), and Jellyfin or Plex results for the same title are folded into it. When Jellyfin or Plex returned the title itself, its link is used and Seerr's status is ignored. Each poster has the icon of the app it opens in on its top-right corner, in the icon style picked for the apps: Jellyfin or Plex for a title the user has, Seerr for one they don't. Movies and shows the user has carry a play mark on the poster that plays them in Jellyfin or Plex. For a title that isn't there, hovering the poster shows a **Request** chip along its bottom that files the request in Seerr as that user; it spins while the request is filed and then stays as a disabled **Requested** with a clock, as it does for any title Seerr already has a request for. A show that's only partly there can still be requested, and the request asks for just the missing seasons. Users whose Seerr account can't request (or can't request that kind of title) see no **Request** at all. Clicking anywhere else on a movie or show poster, from Seerr, Jellyfin or Plex, opens a detail view in the search panel (backdrop, year, runtime, rating, genres, overview, cast) with **Play on Jellyfin** or **Plex**, or **Request** and **Open in Seerr**; it never requests on its own. → opens it for the selected poster, and ← or Esc goes back to the results. While the row is still loading with nothing to show yet, it shows placeholder posters.

Navidrome asks for a password once. Holm computes the Subsonic token `md5(password + salt)` with a random salt and stores the salt and token, encrypted at rest, never the password. The token works for the Subsonic API until the password changes, and anyone holding the salt and token can try to brute-force a weak password, so use a strong one. Changing the username asks for the password again.

After connecting, results from the app appear in the search bar. Typing `!<shortcut>` searches only that app.

## Security

- **Per-user credentials.** Each user connects with their own key, so search results respect that user's permissions in the app.
- **Encrypted at rest** with AES-256-GCM. Set `HOLM_SECRET_KEY` to 32 bytes, hex or base64 (`openssl rand -hex 32`). Without it, Holm generates `.integrations-key` next to the database, so anyone with a copy of the data directory also has the key. See [configuration.md](configuration.md#integration-credentials).
- **Never sent back to the browser.** API responses redact secret fields. Thumbnails and previews are fetched through Holm (`/api/integrations/<id>/proxy/…`), so the key never appears in an `<img src>`.
- **Disconnect** deletes the stored credentials. A disconnected Seerr stays disconnected rather than reconnecting through Jellyfin or Plex on its own; **Sign in** on its card brings it back, and so does connecting Jellyfin or Plex again, through Jellyfin or Plex when it can and with a code otherwise. Jellyfin also revokes its token. To revoke a Plex sign-in, remove the "Holm" device under **Authorized Devices** in Plex. A Seerr code sign-in through plex.tv/link appears there as "Holm (Seerr sign-in)"; Holm doesn't keep that token, but Seerr saves it as the user's Plex token, so removing it leaves Holm alone and can stop Seerr's own Plex features for that user, such as watchlist sync.

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

The full contract, including `signIn` for device-code flows like Quick Connect, `signOut`, `linkedTo` / `connectFromLinked` for signing in through another integration, `actions` for writes from a search result, `details` for a result's detail view, and `prepareConfig` for swapping a typed secret for a derived one before it is saved, is documented in [`_types.js`](../src/lib/server/integrations/_types.js). [`karakeep.js`](../src/lib/server/integrations/karakeep.js) is a short, complete example.
