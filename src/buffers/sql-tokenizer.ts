import { COLORS } from "../ui/colors"

export type TokType = "keyword" | "string" | "number" | "comment" | "operator" | "paren" | "ident" | "space" | "other"
export interface SqlToken { type: TokType; text: string }

export const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "LIKE", "ILIKE", "IS",
  "NULL", "AS", "DISTINCT", "ORDER", "BY", "GROUP", "HAVING", "LIMIT", "OFFSET",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE",
  "DROP", "ALTER", "INDEX", "VIEW", "WITH", "UNION", "ALL", "EXISTS", "CASE",
  "WHEN", "THEN", "ELSE", "END", "BETWEEN", "ASC", "DESC", "TRUE", "FALSE",
  "LEFT", "RIGHT", "INNER", "OUTER", "JOIN", "ON", "RETURNING", "USING",
  "CROSS", "FULL", "NATURAL", "OVER", "PARTITION", "WINDOW",
  "COALESCE", "NULLIF", "CAST", "COUNT", "SUM", "AVG", "MIN", "MAX",
  "NOW", "CURRENT_TIMESTAMP", "EXTRACT", "TO_CHAR", "DATE_TRUNC",
  "PRIMARY", "KEY", "UNIQUE", "DEFAULT", "CONSTRAINT", "FOREIGN", "REFERENCES",
]

const KW = new Set(SQL_KEYWORDS.map(k => k.toUpperCase()))

export function tokenizeLine(line: string): SqlToken[] {
  const tokens: SqlToken[] = []
  let i = 0
  while (i < line.length) {
    const ch = line[i]!
    // Line comment
    if (ch === "-" && line[i + 1] === "-") {
      tokens.push({ type: "comment", text: line.slice(i) }); break
    }
    // String literal
    if (ch === "'" || ch === '"') {
      let j = i + 1
      while (j < line.length) {
        if (line[j] === ch) {
          if (line[j + 1] === ch) { j += 2; continue }
          j++; break
        }
        j++
      }
      tokens.push({ type: "string", text: line.slice(i, j) }); i = j; continue
    }
    // Number
    if (/\d/.test(ch)) {
      let j = i
      while (j < line.length && /[\d.]/.test(line[j]!)) j++
      tokens.push({ type: "number", text: line.slice(i, j) }); i = j; continue
    }
    // Identifier / keyword
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j]!)) j++
      const word = line.slice(i, j)
      tokens.push({ type: KW.has(word.toUpperCase()) ? "keyword" : "ident", text: word })
      i = j; continue
    }
    // Paren / bracket
    if ("()[]{}".includes(ch)) { tokens.push({ type: "paren", text: ch }); i++; continue }
    // Whitespace
    if (ch === " " || ch === "\t") {
      let j = i
      while (j < line.length && (line[j] === " " || line[j] === "\t")) j++
      tokens.push({ type: "space", text: line.slice(i, j) }); i = j; continue
    }
    tokens.push({ type: /[=<>!+\-*\/,;.@#~|&^%$]/.test(ch) ? "operator" : "other", text: ch })
    i++
  }
  return tokens
}

export function tokenColor(type: TokType): string {
  switch (type) {
    case "keyword":  return COLORS.mauve
    case "string":   return COLORS.green
    case "number":   return COLORS.peach
    case "comment":  return COLORS.muted
    case "operator": return COLORS.teal
    case "paren":    return COLORS.yellow
    default:         return COLORS.text
  }
}
