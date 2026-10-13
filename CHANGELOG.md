# Changelog

What changed in each Holm release, newest first. Holm shows a version's
section in its "What's new" dialog, so each entry is written for the people
using it. Headings are `## <version> — <date>`.

## 0.5.0 — 2026-10-09

- **Music from search.** Songs found through Navidrome play in a small player in the corner, and the player is a widget you can turn off.
- **Apps per group.** An app in `config.yml` can list the groups that see it; everyone else doesn't get its tile.
- **Safer by default.** Holm refuses to start rather than run open when its config or key is missing. Sessions are signed with Holm's own key and expire after 30 days, integration URLs are checked on the server, and the image runs as the `node` user.
- **Media only through the proxy.** The proxy serves images and audio (other files only as downloads) and every page sends security headers.
- **Clearer docs.** The privacy notice, security policy and config reference now match what the code does.
