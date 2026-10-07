# Security

Please report vulnerabilities privately through [GitHub's advisory form](https://github.com/man15h/holm/security/advisories/new), not in a public issue. We'll reply within a few days.

## How Holm handles your users

- **Sign-in** is delegated to your OIDC provider. Holm never sees the password for it. Sessions are HMAC-signed cookies that expire after 30 days, signed with a key derived from Holm's master key (`HOLM_SECRET_KEY`, or the key file next to the database). Groups are read at sign-in and kept in the session.
- **App visibility.** An app with `groups:` is sent only to users in one of those groups; the server filters the list before the page is built.
- **Integration credentials** (Immich, Paperless, Jellyfin, …) belong to each user and are encrypted at rest with AES-256-GCM. Set `HOLM_SECRET_KEY` in production; otherwise the key is generated next to the database (the directory of `DATABASE_PATH`), so it lives on the same volume.
- **The person running Holm can read the integration tokens you connect.** Only connect apps that person already runs. Holm stores scoped, revocable tokens where the app has them (API keys, app passwords, Quick Connect). Navidrome is the exception: it asks for your Navidrome password once, and Holm keeps the Subsonic token derived from it (`md5(password + salt)`), not the password.
- **Integration URLs** are checked on the server. Set `default_url` for every integration: users then can't point Holm at another host. Without it, a user can pick any http(s) URL Holm can reach, including hosts inside your network, and Holm logs a warning at startup. Moving a connection to another host drops its stored credentials.
- **The integration proxy** only serves images and audio (other binary replies only as a download), with `nosniff` and a sandboxing Content-Security-Policy.
- **Pages** are sent with a Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff` and a Referrer-Policy.
- **Links** from search results are opened only if they are `http:` or `https:`.
- **Failing closed.** Holm refuses to start on a missing or invalid config, an unset `${VAR}`, or a malformed `HOLM_SECRET_KEY`, rather than running with sign-in off or a key nobody chose.
- **`auth.enabled: false`** makes every visitor the same user, with no groups. Use it only for a local demo.
