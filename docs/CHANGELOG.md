# Changelog

Notable changes to Cloudflare Free. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Safety checks cover photos and whole posts: a vision model describes each photo, then Llama Guard checks the title, body and that description together.
- Admin rights go by member id (`ADMIN_USER_IDS`), so nobody can claim them by signing up with a username first.
- The installable app opens offline, and dark mode has readable contrast.
- Diagram pictures keep their true proportions.

## [0.1.0] - 2026-10-20

### Added

- A website and installable app on Workers Static Assets, with a Hono API in the Worker.
- Passkey sign-in, with no passwords.
- Photo posts, checked by a Workflow before they are published.
- Live chat rooms, one Durable Object per room.
- A contact form that runs on Queues.
- An admin inbox for mail from Email Routing.
- Lab tools: AI chat, image generation, link previews, screenshots, DNS lookups and verifiable dice.
- The scoreboard of free Cloudflare offerings.
- Tests that run inside workerd.
- How it works, a guide with 13 interactive diagrams.
