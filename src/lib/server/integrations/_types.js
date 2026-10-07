// JSDoc types for the integration adapter contract.
// Adapters are plain modules — there's no class to extend, no interface to
// implement. They default-export an object that matches `IntegrationAdapter`.
//
// Adding a new integration is one new file in this directory plus one line
// in `index.js` to import it. The rest of the framework — settings UI, API
// routes, search bar — discovers it generically through this contract.

/**
 * @typedef {Object} ConfigField
 * @property {string} key                       Stable id (used as the form name and the stored config key)
 * @property {'url'|'text'|'secret'} type       Renders as <input type="...">; 'secret' redacts to bullets in API responses
 * @property {string} label                     Human-readable label
 * @property {boolean} [required]               Defaults to false
 * @property {string} [placeholder]
 * @property {string} [help]                    Small helper text shown under the field
 * @property {{ baseKey: string, path: string, label: string }} [helpUrl]  Clickable link built from config[baseKey] + path
 * @property {string} [fromOperatorDefault]     If set, the form pre-fills from `integrations.<id>.<value>` in config.yml
 * @property {boolean} [hidden]                 Stored and redacted like any field, but never rendered — filled by `signIn`
 * @property {boolean} [trim]                   Defaults to true; set false where surrounding spaces matter (a password)
 */

/**
 * @typedef {Object} TestResult
 * @property {boolean} ok
 * @property {string} message                   Shown verbatim in the UI — keep it short and human
 */

/**
 * @typedef {Object} SearchResultItem
 * @property {string} id
 * @property {string} title
 * @property {string} [subtitle]                Secondary text (e.g. URL, tags, category)
 * @property {string} [thumbnail]               URL of an image; rendered as a tile
 * @property {string} href                      Where to send the user when they click
 * @property {string} [openLabel]               Label for opening `href`, e.g. 'Play'; defaults to 'Open'
 * @property {{ key: string, label: string, params: object }} [action]  Runs `actions[key]` with `params` instead of opening `href` (e.g. 'Request')
 * @property {Object} [meta]
 * @property {string} [meta.kind]               'photo' triggers the photo-grid variant in SearchResults
 * @property {string} [meta.takenAt]
 * @property {string} [meta.status]             Short badge, e.g. 'Available'
 * @property {string} [meta.tmdb]               '<movie|tv>:<tmdb id>' — identifies the title across providers
 * @property {boolean} [meta.merge]             This result stands for its title: other providers' results with the same `meta.tmdb` are hidden
 */

/**
 * @typedef {Object} SearchProvider
 * @property {string} label                     Shown in the provider switcher dropdown
 * @property {'inline'|'redirect'} mode         inline = dropdown of results; redirect = form-submit to an external URL
 * @property {(ctx: AdapterContext & { query: string, limit: number }) => Promise<{ results: SearchResultItem[] }>} query
 */

/**
 * @typedef {Object} AdapterContext
 * @property {object} config                     The user's stored config
 * @property {typeof fetch} fetch
 * @property {Record<string, object>} [linked]   Only for `linkedTo` adapters: the user's configs for those integrations, when connected
 * @property {(config: object) => Promise<void>} [saveConfig]  Only for `linkedTo` adapters: replaces the stored config (e.g. a renewed session)
 */

/**
 * @typedef {Object} Action
 * A write the user triggers from a search result (`SearchResultItem.action`),
 * run by POST /api/integrations/:id/action/:key. `params` come from the
 * browser, so validate them.
 * @property {(ctx: AdapterContext & { params: object }) => Promise<TestResult>} run
 */

/**
 * @typedef {Object} ProxyHandler
 * Proxies an authenticated upstream resource through Holm so the browser
 * never sees the integration's API key. Used for thumbnails, previews,
 * downloads — anything that needs to land in an `<img src>` or `<a href>`
 * without leaking credentials.
 *
 * The handler returns a Response (or anything `fetch()`-compatible) and the
 * generic /api/integrations/:id/proxy/:key/* route streams it back to the
 * browser with content-type and cache headers preserved.
 *
 * @property {(ctx: { config: object, params: Record<string,string>, request: Request, fetch: typeof fetch }) => Promise<Response>} fetch
 * @property {string} [defaultCacheControl]                    Cache-Control header to set if upstream doesn't provide one
 */

/**
 * @typedef {Object} SignIn
 * A device-code style sign-in (e.g. Jellyfin Quick Connect): Holm shows a
 * code, the user approves it inside the other app, and the adapter trades the
 * approval for that user's own token. No password or admin key passes through
 * Holm. The generic /api/integrations/:id/signin route keeps `state`
 * server-side and saves the connection when `poll` reports done.
 *
 * @property {string} label                                    Button text, e.g. 'Sign in with Quick Connect'
 * @property {string} [help]                                   Markdown shown next to the code
 * @property {(ctx: { config: object, linked?: Record<string, object>, fetch: typeof fetch }) => Promise<{ code: string, link?: string, state: object } | { error: string }>} start  `link` is where the user enters the code
 * @property {(ctx: { config: object, state: object, fetch: typeof fetch }) => Promise<{ status: 'pending' } | { status: 'done', config: object } | { status: 'error', error: string }>} poll
 */

/**
 * @typedef {Object} IntegrationAdapter
 * @property {string} id                                       Must match the config.yml key
 * @property {string} name                                     Display name
 * @property {string} [icon]                                   Fallback icon — normally resolved from the app with the same id in config.yml
 * @property {string} description                              One-line summary
 * @property {ConfigField[]} configSchema                      Fields rendered in the connect form
 * @property {(ctx: { config: object, fetch: typeof fetch }) => Promise<TestResult>} test
 * @property {SignIn} [signIn]                                 Replaces the Test/Connect buttons with a code-approval flow
 * @property {(ctx: { config: object, fetch: typeof fetch }) => Promise<void>} [signOut]  Best-effort token revoke on disconnect
 * @property {string[]} [linkedTo]                       Ids of integrations this one can sign in through (Seerr: jellyfin, plex)
 * @property {(ctx: { config: object, linked: Record<string, object>, fetch: typeof fetch }) => Promise<object|null>} [connectFromLinked]  Connects the user without asking, from a linked connection; returns the config to save, or null
 * @property {Record<string, Action>} [actions]             Writes triggered from search results
 * @property {(ctx: { config: object }) => object} [prepareConfig]  Rewrites the merged config just before it is saved, e.g. swapping a password for a derived token
 * @property {Record<string, SearchProvider>} [searchProviders]
 * @property {Record<string, ProxyHandler>} [proxy]            Optional proxy handlers keyed by name (e.g. 'thumbnail')
 * @property {Record<string, object>} [widgets]                Reserved — widget rendering is out of scope for this PR
 */

export {};
