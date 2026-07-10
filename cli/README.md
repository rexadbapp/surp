# surp

`nvim`-style terminal client for Supabase — manage projects, tables, SQL, edge functions, storage, auth users, and more from your terminal.

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

2. Authenticate with your RexaDB account (email + one-time code):

   ```
   :login-backend
   ```

   An OTP is emailed to you; enter the 6-digit code to sign in.

3. A valid **subscription** (Pro / Team / Lifetime) is required to use surp. If you don't have one yet:

   ```
   :subscribe
   ```

## Useful commands

| Command            | Description                                  |
| ------------------ | -------------------------------------------- |
| `:login-backend`   | Sign in to your RexaDB account (email OTP)   |
| `:logout-backend`  | Sign out of your RexaDB account              |
| `:subscribe`       | View plans and upgrade                        |
| `:account`         | Show auth status, plan, and version          |
| `:entitlement`     | Force-refresh subscription status            |
| `:update`          | Check for and apply updates from GitHub      |
| `:check-update`    | Show whether a newer version is available    |
| `:projects`        | Browse your Supabase projects                |

## Self-update

Inside surp, run `:update` to fetch the latest release from GitHub Releases and replace the binary.

## Releases

Binaries for every platform are published on the [GitHub Releases](https://github.com/rexadbapp/surp/releases) page.
