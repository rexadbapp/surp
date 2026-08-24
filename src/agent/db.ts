import {
	classifySql,
	describeClass,
	hasTransactionControl,
	SqlGuardError,
} from "./safety";

/** Abstraction over the active surp connection so the agent works
 *  with both the direct-postgres driver and the Supabase mgmt API driver. */
export interface SqlExecutor {
	kind: "postgres" | "supabase";
	label: string;
	query(text: string): Promise<Record<string, unknown>[]>;
	/** Driver-backed forced READ ONLY execution (direct postgres only). */
	readOnlyQuery?(text: string, timeoutMs?: number): Promise<Record<string, unknown>[]>;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_CHARS = 40_000;

export type DbMode = "read-only" | "read-write";

export const READ_ONLY_HINT =
	"surp's agent is running in read-only mode; data/schema changes are not available here (use the SQL editor or `dbagent --read-write` in a terminal).";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			p,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error(`Query timed out after ${ms}ms`)), ms);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

function guardReadOnly(query: string, toolName: string): void {
	const { sqlClass } = classifySql(query);
	if (sqlClass === "dangerous") {
		throw new SqlGuardError(`Blocked: ${describeClass("dangerous")} detected.`);
	}
	if (toolName === "sql_query" && sqlClass !== "read") {
		throw new SqlGuardError(
			`Blocked: sql_query only allows read-only statements, but this looks like ${describeClass(sqlClass)}.`,
		);
	}
	if (hasTransactionControl(query)) {
		throw new SqlGuardError("Blocked: transaction control statements are not allowed.");
	}
	const { statements } = classifySql(query);
	if (statements.length !== 1) {
		throw new SqlGuardError(
			`Blocked: this tool accepts exactly one statement (got ${statements.length}).`,
		);
	}
}

/**
 * Run a single read statement. On direct postgres connections the query runs
 * inside a driver-level READ ONLY transaction (defense in depth); on the
 * Supabase management API only the classifier guards apply.
 */
export async function runRead(
	executor: SqlExecutor,
	query: string,
	opts: { timeoutMs?: number; toolName?: string } = {},
): Promise<{ rows: Record<string, unknown>[]; durationMs: number }> {
	guardReadOnly(query, opts.toolName ?? "sql_query");
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const started = Date.now();
	try {
		let rows: Record<string, unknown>[];
		if (executor.readOnlyQuery) {
			rows = await withTimeout(executor.readOnlyQuery(query, timeoutMs), timeoutMs + 5_000);
		} else if (executor.kind === "postgres") {
			throw new SqlGuardError("This connection does not support forced read-only execution.");
		} else {
			rows = await withTimeout(executor.query(query), timeoutMs + 15_000);
		}
		return { rows, durationMs: Date.now() - started };
	} catch (err) {
		throw normalizeError(err);
	}
}

export function formatRows(rows: Record<string, unknown>[], maxRows = 200): string {
	if (rows.length === 0) return "(0 rows)";
	const limited = rows.slice(0, maxRows);
	let text = JSON.stringify(limited, null, 2);
	const notes: string[] = [];
	if (rows.length > maxRows) notes.push(`${rows.length - maxRows} more rows not shown`);
	if (text.length > MAX_OUTPUT_CHARS) {
		text = text.slice(0, MAX_OUTPUT_CHARS);
		notes.push("output truncated due to size");
	}
	const header = `(${rows.length} row${rows.length === 1 ? "" : "s"})`;
	return notes.length > 0 ? `${header}\n${text}\n[${notes.join("; ")}]` : `${header}\n${text}`;
}

export function sqlLiteral(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

export function normalizeError(err: unknown): Error {
	if (err instanceof Error) return err;
	return new Error(String(err));
}

/** Validate a possibly schema-qualified identifier and quote it safely. */
export function quoteIdent(name: string): string {
	if (!/^[\w$ ]+$/.test(name)) throw new SqlGuardError(`Invalid identifier: "${name}"`);
	const parts = name.split(".");
	if (parts.length > 2) throw new SqlGuardError(`Invalid qualified identifier: "${name}"`);
	return parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
}

/** Split "schema.table" into parts, defaulting schema to public. */
export function resolveTableRef(ref: string, defaultSchema = "public"): [string, string] {
	const parts = ref.split(".");
	if (parts.length === 1 && parts[0] !== undefined) return [defaultSchema, parts[0]];
	if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) return [parts[0], parts[1]];
	throw new SqlGuardError(`Invalid table reference: "${ref}"`);
}

export { SqlGuardError };
