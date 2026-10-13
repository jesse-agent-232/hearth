# Changelog

What changed in each Holm release, newest first. Holm shows a version's
section in its "What's new" dialog, so each entry is written for the people
using it. Headings are `## <version> — <date>`. One line per change: a bold
label, then at most about twelve words.

## 0.6.1 — 2026-10-13

- **Fixed:** wallpaper missing after a reload.

## 0.6.0 — 2026-10-13

- **Holm on your phone.** Search sits above the apps and stays at the top while you type. The clock, weather and next event fit on the page, and reminders and the install prompt slide in under the account menu.
- **Your calendar on the page.** Connect any CalDAV calendar (iCloud, Fastmail, Nextcloud, Stalwart and others), up to six accounts in one card, each with its own color. The next event sits under the clock, with the week ahead a click away, and event reminders pop up in the corner with Join call, Snooze and Dismiss.
- **Calendar search.** `!cal` finds events by title; picking one opens it in your calendar, or shows its time, place, notes and a Join call button.
- **More to search.** Linkwarden links, Miniflux articles, and Komga and Kavita series, each with your own login.
- **Music picks up where you left off.** Reload the page and the song you were playing comes back, paused at the same spot.
- **Answers in search.** Type a sum, a unit conversion (`5 km in miles`, `10 lb`) or a time in another city (`3pm london in tokyo`) and the answer shows right away, ready to copy.
- **Onboarding, privacy and What's new per group.** Give each `groups:` in `config.yml`, like apps, to show it only to those groups.
- **Update notice.** Configure says when a newer Holm is out, from a check of GitHub by Holm's server every 6 hours. `update_check` turns it off or limits it to some groups.
- **Holm in a frame.** Operators can let other pages embed Holm with `security.frame_ancestors` in `config.yml`.
- **What's new.** After an update, this dialog shows what changed, once. The version at the bottom of Configure links to Holm on GitHub.

## 0.5.0 — 2026-10-09

- **Music from search.** Songs found through Navidrome play in a small player in the corner, and the player is a widget you can turn off.
- **Apps per group.** An app in `config.yml` can list the groups that see it; everyone else doesn't get its tile.
- **Safer by default.** Holm refuses to start rather than run open when its config or key is missing. Sessions are signed with Holm's own key and expire after 30 days, integration URLs are checked on the server, and the image runs as the `node` user.
- **Media only through the proxy.** The proxy serves images and audio (other files only as downloads) and every page sends security headers.
- **Clearer docs.** The privacy notice, security policy and config reference now match what the code does.
