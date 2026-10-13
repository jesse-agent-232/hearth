# Contributing

Thanks for helping make Holm better.

- **Setup:** `npm install`, then `CONFIG_PATH=config.demo.yml npm run dev`.
- **Tests:** `npm test` runs the unit tests; CI runs it and `npm run build` on every pull request. The Playwright specs in `tests/` expect a dev server on port 5173: run `npx playwright install chromium` once, start `npm run dev`, then run `npx playwright test`.
- **Branches:** open pull requests against `dev`. `main` is the release branch.
- **Releases:** a version bump adds its `## X.Y.Z — YYYY-MM-DD` section to [CHANGELOG.md](CHANGELOG.md), written for the people using Holm. It's what their "What's new" dialog shows, and a test fails if the package version has no section. Keep it to one line per change, as the changelog's header says.
- **Shipping:** a release is a pull request from `dev` into `main` that raises `package.json` past the latest `v*` tag; CI refuses anything else. Merging it builds the image, tags `vX.Y.Z` and creates the GitHub release from that version's changelog section.
- **Direction:** read [docs/vision.md](docs/vision.md) before a large change. Holm is a glance for everyone in the house, not a server console, so stats and container widgets are out of scope.
- **UI:** build from the tokens in [docs/design-system.md](docs/design-system.md) rather than one-off styles.

Keep pull requests to one change, describe what a user will notice, and include a screenshot for anything visual.
