# Changelog

What changed in each Holm release, newest first. Holm shows a version's
section in its "What's new" dialog, so each entry is written for the people
using it. Headings are `## <version> — <date>`. One line per change:
**New:**, **Improved:** or **Fixed:**, then a plain line of at most about
twelve words.

## 0.8.0 — 2026-10-17

- **New:** Papra document search, contributed by Pi Home Server.
- **New:** `config.minimal.yml`, a quick-start config with no sign-in.
- **Improved:** Search results and details animate in instead of snapping.
- **Improved:** Search shows one loading line, documents first and a Top hit.
- **Improved:** Sums and conversions no longer search your apps.
- **Improved:** The Play button uses your accent colour.
- **Fixed:** Apps set to `default_visible` now appear on a new person's page.

## 0.7.0 — 2026-10-15

- **New:** Glass for the page: Clear, Frosted or Solid, in Configure → Appearance.
- **New:** 12- or 24-hour clock and °C or °F, from their menus.
- **New:** Apps can open a browser or mobile-app setup guide on click.
- **New:** Change your password during onboarding, with a `password` slide.
- **Fixed:** a shared browser no longer carries someone else's settings into your account.

## 0.6.2 — 2026-10-13

- **Fixed:** upgrading from 0.5.0 shows every release since, not just the latest.

## 0.6.1 — 2026-10-13

- **Fixed:** wallpaper missing after a reload.

## 0.6.0 — 2026-10-13

- **Improved:** Phone: search sits above the apps and stays on top while typing.
- **Improved:** Phone: the clock, weather and next event fit on the page.
- **Improved:** Phone: reminders and the install prompt slide in under the account menu.
- **New:** Your CalDAV calendar on the page: iCloud, Fastmail, Nextcloud, Stalwart and others.
- **New:** Up to six calendar accounts in one card, each with its own color.
- **New:** The next event sits under the clock, the week ahead a click away.
- **New:** Event reminders in the corner, with Join call, Snooze and Dismiss.
- **New:** `!cal` finds events by title and opens them, or shows their details.
- **New:** Search Linkwarden links, Miniflux articles, and Komga and Kavita series.
- **New:** After a reload, your song comes back, paused at the same spot.
- **New:** Search answers sums, conversions and city times, like `3pm london in tokyo`.
- **New:** Onboarding, privacy notice and What's new can each be limited to `groups:`.
- **New:** Configure says when a newer Holm is out, checked every 6 hours.
- **New:** `update_check` turns the update notice off or limits it to groups.
- **New:** `security.frame_ancestors` lets other pages embed Holm.
- **New:** This What's new dialog after an update; Configure's version links to GitHub.

## 0.5.0 — 2026-10-09

- **New:** Navidrome songs from search play in a small corner player.
- **New:** The music player is a widget you can turn off.
- **New:** Apps in `config.yml` can list the groups that see their tile.
- **Improved:** Holm refuses to start, rather than run open, without its config or key.
- **Improved:** Sessions are signed with Holm's own key and expire after 30 days.
- **Improved:** Integration URLs are checked on the server.
- **Improved:** The image runs as the `node` user.
- **Improved:** The media proxy serves only images and audio; other files download.
- **Improved:** Every page sends security headers.
- **Improved:** The privacy notice, security policy and config reference match the code.
