#!/usr/bin/env bun
import { ensureSolidTransformPlugin } from "@opentui/solid/bun-plugin"

ensureSolidTransformPlugin()

await import("./index.tsx")
