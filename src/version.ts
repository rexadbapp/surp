// Version + self-update repo config.
// These are independent of any account/subscription system.

const ENV = typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>)

/** GitHub repo for self-updates — override via SURP_UPDATE_REPO env */
export const UPDATE_REPO: string = ENV["SURP_UPDATE_REPO"] ?? "rexadbapp/surp"

export const CURRENT_VERSION: string =
  process.env.SURP_VERSION ?? "0.1.4"
