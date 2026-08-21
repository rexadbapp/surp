import { COLORS } from "../ui/colors"

export type TsTokType = "keyword" | "string" | "number" | "comment" | "operator" | "paren" | "builtin" | "ident" | "space" | "other"
export interface TsToken { type: TsTokType; text: string }

const JS_KEYWORDS = new Set([
  "async", "await", "break", "case", "catch", "class", "const", "continue",
  "debugger", "default", "delete", "do", "else", "export", "extends", "false",
  "finally", "for", "function", "if", "import", "in", "instanceof", "let",
  "new", "null", "of", "return", "super", "switch", "this", "throw", "true",
  "try", "typeof", "undefined", "var", "void", "while", "with", "yield",
  "type", "interface", "enum", "implements", "abstract", "private", "protected",
  "public", "static", "readonly", "as", "from", "satisfies", "keyof",
  "declare", "namespace", "module", "global", "infer", "is", "never",
  "unknown", "any", "boolean", "string", "number", "symbol", "void", "object",
  "bigint", "asserts", "using",
])

const JS_BUILTINS = new Set([
  "console", "JSON", "Math", "Date", "Array", "Object", "Map", "Set",
  "Promise", "Error", "RegExp", "String", "Number", "Boolean", "Symbol",
  "BigInt", "fetch", "setTimeout", "setInterval", "clearTimeout",
  "clearInterval", "Request", "Response", "Headers", "URL", "URLSearchParams",
  "atob", "btoa", "structuredClone", "crypto", "performance",
])

export function tokenizeTsLine(line: string): TsToken[] {
  const tokens: TsToken[] = []
  let i = 0
  while (i < line.length) {
    const ch = line[i]!

    // Line comment
    if (ch === "/" && line[i + 1] === "/") {
      tokens.push({ type: "comment", text: line.slice(i) }); break
    }
    // Block comment start
    if (ch === "/" && line[i + 1] === "*") {
      let j = i + 2
      while (j < line.length) {
        if (line[j] === "*" && line[j + 1] === "/") { j += 2; break }
        j++
      }
      tokens.push({ type: "comment", text: line.slice(i, j) }); i = j; continue
    }
    // Template literal
    if (ch === "`") {
      let j = i + 1
      let depth = 0
      while (j < line.length) {
        if (line[j] === "\\") { j += 2; continue }
        if (line[j] === "${") { depth++; j++; continue }
        if (line[j] === "}" && depth > 0) { depth--; j++; continue }
        if (line[j] === "`" && depth === 0) { j++; break }
        j++
      }
      tokens.push({ type: "string", text: line.slice(i, j) }); i = j; continue
    }
    // String literal
    if (ch === "'" || ch === '"') {
      let j = i + 1
      while (j < line.length) {
        if (line[j] === "\\") { j += 2; continue }
        if (line[j] === ch) { j++; break }
        j++
      }
      tokens.push({ type: "string", text: line.slice(i, j) }); i = j; continue
    }
    // Number
    if (/\d/.test(ch)) {
      let j = i
      if (ch === "0" && (line[i + 1] === "x" || line[i + 1] === "X")) { j += 2; while (j < line.length && /[0-9a-fA-F]/.test(line[j]!)) j++ }
      else if (ch === "0" && (line[i + 1] === "b" || line[i + 1] === "B")) { j += 2; while (j < line.length && /[01]/.test(line[j]!)) j++ }
      else if (ch === "0" && (line[i + 1] === "o" || line[i + 1] === "O")) { j += 2; while (j < line.length && /[0-7]/.test(line[j]!)) j++ }
      else { while (j < line.length && /[\d._]/.test(line[j]!)) j++ }
      tokens.push({ type: "number", text: line.slice(i, j) }); i = j; continue
    }
    // Identifier / keyword / builtin
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j]!)) j++
      const word = line.slice(i, j)
      if (JS_KEYWORDS.has(word)) tokens.push({ type: "keyword", text: word })
      else if (JS_BUILTINS.has(word)) tokens.push({ type: "builtin", text: word })
      else tokens.push({ type: "ident", text: word })
      i = j; continue
    }
    // Paren / bracket / brace
    if ("()[]{}".includes(ch)) { tokens.push({ type: "paren", text: ch }); i++; continue }
    // Whitespace
    if (ch === " " || ch === "\t") {
      let j = i
      while (j < line.length && (line[j] === " " || line[j] === "\t")) j++
      tokens.push({ type: "space", text: line.slice(i, j) }); i = j; continue
    }
    // Operator or other
    tokens.push({ type: /[=<>!+\-*\/%~&|^?.:;,@#]/.test(ch) ? "operator" : "other", text: ch })
    i++
  }
  return tokens
}

export function tsTokenColor(type: TsTokType): string {
  switch (type) {
    case "keyword":  return COLORS.mauve
    case "builtin":  return COLORS.blue
    case "string":   return COLORS.green
    case "number":   return COLORS.peach
    case "comment":  return COLORS.muted
    case "operator": return COLORS.teal
    case "paren":    return COLORS.yellow
    default:         return COLORS.text
  }
}
