# Security

Please report vulnerabilities privately through [GitHub's advisory form](https://github.com/man15h/holm/security/advisories/new), not in a public issue. We'll reply within a few days.

## How Holm handles your users

- **Sign-in** is delegated to your OIDC provider. Holm never sees passwords. Sessions are HMAC-signed cookies keyed from the OIDC client secret.
- **Integration credentials** (Immich, Paperless, Jellyfin, …) belong to each user and are encrypted at rest with AES-256-GCM. Set `HOLM_SECRET_KEY` in production; otherwise the key is generated next to the database (the directory of `DATABASE_PATH`), so it lives on the same volume.
- **The person running Holm can read the integration tokens you connect.** Only connect apps that person already runs. Holm stores scoped, revocable tokens (API keys, app passwords, Quick Connect), and never asks for your sign-in password.
- **Links** from search results are opened only if they are `http:` or `https:`.
- **`auth.enabled: false`** makes every visitor the same user. Use it only for a local demo.
