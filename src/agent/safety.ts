export type SqlClass = "read" | "write" | "ddl" | "dangerous" | "unknown";

const READ_START = /^(select|explain|show|table|values|with)\b/i;
const WRITE_START = /^(insert|update|delete|merge)\b/i;
const DDL_START = /^(create|alter|drop|truncate|comment|rename|reindex|vacuum|analyze|analyse|cluster|lock|listen|notify|unlisten|declare|fetch|move|close|do|call|checkpoint|discard|refresh\s+materialized\s+view|grant|revoke|set|reset|begin|start|commit|rollback|savepoint|release|prepare|execute|deallocate)\b/i;

const HARD_BLOCKED: RegExp[] = [
	/\bdrop\s+database\b/i,
	/\balter\s+system\b/i,
	/\bcopy\b[\s\S]*\bprogram\b/i,
	/\bpg_read_file/i,
	/\bpg_read_binary_file/i,
	/\bpg_ls_dir\b/i,
	/\blo_import\b/i,
	/\bpg_terminate_backend\b/i,
];

/** Split a SQL script into individual statements, respecting quotes and dollar-quoting. */
export function splitStatements(sql: string): string[] {
	const statements: string[] = [];
	let current = "";
	let i = 0;
	const n = sql.length;

	while (i < n) {
		const ch = sql[i];
		const next = sql[i + 1];

		// line comment
		if (ch === "-" && next === "-") {
			const end = sql.indexOf("\n", i);
			const stop = end === -1 ? n : end + 1;
			current += sql.slice(i, stop);
			i = stop;
			continue;
		}
		// block comment
		if (ch === "/" && next === "*") {
			const end = sql.indexOf("*/", i + 2);
			const stop = end === -1 ? n : end + 2;
			current += sql.slice(i, stop);
			i = stop;
			continue;
		}
		// single / double quoted strings & identifiers
		if (ch === "'" || ch === '"') {
			let j = i + 1;
			while (j < n) {
				if (sql[j] === ch) {
					if (sql[j + 1] === ch) {
						j += 2; // escaped quote
						continue;
					}
					j++;
					break;
				}
				j++;
			}
			current += sql.slice(i, j);
			i = j;
			continue;
		}
		// dollar-quoted strings
		const dollarMatch = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
		if (dollarMatch) {
			const tag = dollarMatch[0];
			const end = sql.indexOf(tag, i + tag.length);
			const stop = end === -1 ? n : end + tag.length;
			current += sql.slice(i, stop);
			i = stop;
			continue;
		}

		if (ch === ";") {
			statements.push(current);
			current = "";
			i++;
			continue;
		}
		current += ch;
		i++;
	}
	if (current.trim().length > 0) statements.push(current);

	return statements.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Remove string literals, quoted identifiers, dollar-quoted strings, and comments. */
export function stripLiterals(sql: string): string {
	let out = "";
	let i = 0;
	while (i < sql.length) {
		const ch = sql[i];
		const next = sql[i + 1];

		if (ch === "-" && next === "-") {
			while (i < sql.length && sql[i] !== "\n") i++;
			out += " ";
			continue;
		}
		if (ch === "/" && next === "*") {
			const end = sql.indexOf("*/", i + 2);
			i = end === -1 ? sql.length : end + 2;
			out += " ";
			continue;
		}
		if (ch === "'" || ch === '"') {
			i++;
			while (i < sql.length) {
				if (sql[i] === ch && sql[i + 1] === ch) {
					i += 2;
					continue;
				}
				if (sql[i] === ch) {
					i++;
					break;
				}
				i++;
			}
			out += "?";
			continue;
		}
		const dollarMatch = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
		if (dollarMatch) {
			const tag = dollarMatch[0];
			const end = sql.indexOf(tag, i + tag.length);
			i = end === -1 ? sql.length : end + tag.length;
			out += "?";
			continue;
		}
		out += ch;
		i++;
	}
	return out;
}

const WRITE_KEYWORDS =
	/\b(insert\s+into|delete\s+from|merge\s+into|for\s+update|lock\s+table|(?:update)\s+["\w])|\bselect\b[\s\S]*\binto\s+["\w]/i;

function classifyInner(stmt: string): SqlClass {
	for (const re of HARD_BLOCKED) {
		if (re.test(stmt)) return "dangerous";
	}
	const isExplain = /^explain\b/i.test(stmt);
	if (READ_START.test(stmt)) {
		// data-modifying CTEs hide behind WITH; plain EXPLAIN never executes anything
		if (!isExplain && WRITE_KEYWORDS.test(stmt)) return "write";
		return "read";
	}
	if (WRITE_START.test(stmt)) return "write";
	if (DDL_START.test(stmt)) return "ddl";
	return "unknown";
}

function classifyOne(rawStmt: string): SqlClass {
	const stmt = stripLiterals(rawStmt).trim();
	// EXPLAIN ANALYZE actually executes the inner statement — classify by the inner statement.
	const explainMatch = /^explain\s+(?:verbose\s+)?(?:analyze|analyse)\b/i.exec(stmt);
	if (explainMatch) {
		return classifyInner(stmt.slice(explainMatch[0].length).trim());
	}
	return classifyInner(stmt);
}

const CLASS_RANK: Record<SqlClass, number> = {
	read: 0,
	write: 1,
	ddl: 2,
	dangerous: 4,
	unknown: 3,
};

/** Classify the whole script; returns the strongest class found. */
export function classifySql(sql: string): { sqlClass: SqlClass; statements: string[] } {
	const statements = splitStatements(sql);
	let worst: SqlClass = "read";
	for (const stmt of statements) {
		const c = classifyOne(stmt);
		if (CLASS_RANK[c] > CLASS_RANK[worst]) worst = c;
	}
	return { sqlClass: worst, statements };
}

export function describeClass(c: SqlClass): string {
	switch (c) {
		case "read":
			return "read-only";
		case "write":
			return "data modification";
		case "ddl":
			return "schema change (DDL)";
		case "dangerous":
			return "destructive / blocked operation";
		default:
			return "unrecognized statement type";
	}
}

/** Statements that cannot run inside a transaction wrapper. */
export const NO_TRANSACTION = /\b(create\s+index\s+(concurrently|.*\bconcurrently)|drop\s+index\s+concurrently|vacuum|create\s+database|drop\s+database|alter\s+system|reindex|cluster)\b/i;

const TXN_CONTROL = /\b(begin|commit|rollback|start\s+transaction|savepoint|release\s+savepoint)\b|\bend(\s+work)?[\s;]*$/i;

export function hasTransactionControl(sql: string): boolean {
	return TXN_CONTROL.test(sql);
}

export class SqlGuardError extends Error {}
