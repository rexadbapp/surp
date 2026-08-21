# surp

`nvim`-style terminal client for Supabase — manage projects, tables, SQL, edge functions, storage, auth users, and more from your terminal. Free, no account required.

> The precompiled binary is downloaded from GitHub Releases at install time. No source code is shipped in this package.

## Install

```bash
npm install -g @rexadbapp/surp
```

Or run without installing:

```bash
npx @rexadbapp/surp
```

Supported platforms: macOS (arm64 / x64), Linux (x64), Windows (x64).

## Getting started

1. Launch:

   ```bash
   surp
   ```

2. Authenticate with your **Supabase** account:

   ```
   :login
   ```

   This opens a browser-based Supabase login flow and stores a personal access token. surp talks directly to the Supabase Management API — no RexaDB account, subscription, or license is required.

## Useful commands

| Command            | Description                                  |
| ------------------ | -------------------------------------------- |
| `:login`           | Sign in to Supabase                          |
| `:logout`          | Sign out of Supabase                         |
| `:account`         | Show version and update status              |
| `:update`          | Check for and apply updates from GitHub     |
| `:check-update`    | Show whether a newer version is available    |
| `:projects`        | Browse your Supabase projects                |

## Self-update

Inside surp, run `:update` to fetch the latest release from GitHub Releases and replace the binary.

## Releases

Binaries for every platform are published on the [GitHub Releases](https://github.com/rexadbapp/surp/releases) page.
