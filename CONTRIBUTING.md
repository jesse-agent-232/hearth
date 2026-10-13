# Contributing

Thanks for helping make Holm better.

- **Setup:** `npm install`, then `CONFIG_PATH=config.demo.yml npm run dev`.
- **Tests:** CI runs `npm run build`. The Playwright specs in `tests/` expect a dev server on port 5173: run `npx playwright install chromium` once, start `npm run dev`, then run `npx playwright test`.
- **Branches:** open pull requests against `dev`. `main` is the release branch.
- **Releases:** a version bump adds its `## X.Y.Z — YYYY-MM-DD` section to [CHANGELOG.md](CHANGELOG.md), written for the people using Holm. It's what their "What's new" dialog shows, and a test fails if the package version has no section.
- **Direction:** read [docs/vision.md](docs/vision.md) before a large change. Holm is a glance for everyone in the house, not a server console, so stats and container widgets are out of scope.
- **UI:** build from the tokens in [docs/design-system.md](docs/design-system.md) rather than one-off styles.

Keep pull requests to one change, describe what a user will notice, and include a screenshot for anything visual.
