# surp

`nvim`-style terminal client for Supabase — manage projects, tables, SQL, edge functions, storage, auth users, and more from your terminal.

> This repository is the **release host** for surp. Precompiled, obfuscated binaries are published to [GitHub Releases](https://github.com/rexadbapp/surp/releases). Source code is not published here.

## Install

```bash
npm install -g @rexadbapp/surp
```

Or run without installing:

```bash
npx @rexadbapp/surp
```

The npm package downloads the correct precompiled binary for your platform from GitHub Releases at install time — no source code is shipped.

Supported platforms: macOS (arm64 / x64), Linux (x64), Windows (x64).

## Getting started

1. Launch `surp`.
2. Authenticate with your RexaDB account (email + one-time code):

   ```
   :login-backend
   ```

3. A valid **subscription** (Pro / Team / Lifetime) is required. Open `:subscribe` if you don't have one.

## Commands

| Command            | Description                                  |
| ------------------ | -------------------------------------------- |
| `:login-backend`   | Sign in to your RexaDB account (email OTP)   |
| `:logout-backend`  | Sign out of your RexaDB account              |
| `:subscribe`       | View plans and upgrade                        |
| `:account`         | Show auth status, plan, and version          |
| `:entitlement`     | Force-refresh subscription status            |
| `:update`          | Check for and apply updates from GitHub      |
| `:projects`        | Browse your Supabase projects                |

## Releasing

Maintainers: `bun run scripts/release.mjs` builds all platforms, uploads to GitHub Releases via `gh`, and offers to publish the npm package. The script prompts for the version and will offer to bump `package.json` + `cli/package.json` if you forgot.
