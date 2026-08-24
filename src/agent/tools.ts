import { Type } from "typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
	formatRows,
	normalizeError,
	quoteIdent,
	resolveTableRef,
	runRead,
	sqlLiteral,
	SqlGuardError,
	type SqlExecutor,
} from "./db";

export interface ToolEnv {
	getExecutor(): SqlExecutor | null;
	mode: "read-only" | "read-write";
}

export function makeDbTools(env: ToolEnv): ToolDefinition[] {
	function requireExecutor(): SqlExecutor {
		const exec = env.getExecutor();
		if (!exec) {
			throw new Error(
				"No database connected. Ask the user to connect first (e.g. :connect postgres://... or open a project).",
			);
		}
		return exec;
	}

	const dbInfo = defineTool({
		name: "db_info",
		label: "DB Info",
		description:
			"Get information about the currently connected PostgreSQL database: server version, current database/user, size, and agent mode. Call this first if unsure about the environment.",
		parameters: Type.Object({}),
		execute: async () => {
			const exec = requireExecutor();
			const result = await runRead(
				exec,
				`SELECT current_database() AS database,
				        current_user AS "user",
				        version() AS version,
				        pg_size_pretty(pg_database_size(current_database())) AS database_size,
				        (SELECT count(*) FROM pg_stat_activity WHERE datid = (SELECT oid FROM pg_database WHERE datname = current_database())) AS active_connections`,
				{ toolName: "sql_query" },
			);
			const row = result.rows[0];
			if (!row) throw new Error("Could not read database info.");
			const text = [
				`connection: ${exec.label}`,
				`database: ${row.database}`,
				`user: ${row.user}`,
				`version: ${String(row.version).split(",")[0]}`,
				`size: ${row.database_size}`,
				`active connections: ${row.active_connections}`,
				`agent mode: ${env.mode}`,
			].join("\n");
			return { content: [{ type: "text", text }], details: { ...row, mode: env.mode } };
		},
	});

	const listTables = defineTool({
		name: "list_tables",
		label: "List Tables",
		description:
			"List tables, views, and materialized views with schema, kind, estimated rows, and disk sizes. Ordered by total size descending. Use this to discover what exists before querying.",
		parameters: Type.Object({
			schema: Type.Optional(Type.String({ description: "Schema name to list (default: all non-system schemas)" })),
			includeViews: Type.Optional(Type.Boolean({ description: "Include views and materialized views (default: true)" })),
		}),
		execute: async (_id, params) => {
			const exec = requireExecutor();
			const includeViews = params.includeViews ?? true;
			const kinds = includeViews ? "('r','p','v','m','f')" : "('r','p')";
			let where = `c.relkind IN ${kinds}
				AND n.nspname NOT IN ('pg_catalog','information_schema')
				AND n.nspname NOT LIKE 'pg_toast%'
				AND n.nspname NOT LIKE 'pg_temp%'`;
			if (params.schema) {
				if (!/^[\w$]+$/.test(params.schema)) throw new SqlGuardError(`Invalid schema name: "${params.schema}"`);
				where += `\nAND n.nspname = ${sqlLiteral(params.schema)}`;
			}
			const result = await runRead(
				exec,
				`SELECT n.nspname AS schema,
				        c.relname AS name,
				        CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned table' WHEN 'v' THEN 'view'
				                       WHEN 'm' THEN 'materialized view' WHEN 'f' THEN 'foreign table' END AS kind,
				        GREATEST(c.reltuples, 0)::bigint AS estimated_rows,
				        pg_total_relation_size(c.oid) AS total_bytes,
				        obj_description(c.oid, 'pg_class') AS comment
				FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
				WHERE ${where}
				ORDER BY pg_total_relation_size(c.oid) DESC
				LIMIT 500`,
				{ toolName: "sql_query" },
			);
			const summary = `${result.rows.length} relation(s) found`;
			return {
				content: [{ type: "text", text: `${summary}\n${formatRows(result.rows, 300)}` }],
				details: { count: result.rows.length },
			};
		},
	});

	const describeTable = defineTool({
		name: "describe_table",
		label: "Describe Table",
		description:
			'Describe a table or view: columns (name, type, nullable, default), primary key, foreign keys, indexes, and estimated row count. Accepts "table" or "schema.table".',
		parameters: Type.Object({
			table: Type.String({ description: "Table/view name, optionally schema-qualified (e.g. users or public.users)" }),
		}),
		execute: async (_id, params) => {
			const exec = requireExecutor();
			const [schema, table] = resolveTableRef(params.table);
			const s = sqlLiteral(schema);
			const t = sqlLiteral(table);
			const columns = await runRead(
				exec,
				`SELECT column_name, data_type, udt_name, is_nullable, column_default,
				        character_maximum_length, numeric_precision, numeric_scale
				FROM information_schema.columns
				WHERE table_schema = ${s} AND table_name = ${t}
				ORDER BY ordinal_position`,
				{ toolName: "sql_query" },
			);
			if (columns.rows.length === 0) {
				throw new Error(`Table "${params.table}" not found. Use list_tables to discover available tables.`);
			}
			const pk = await runRead(
				exec,
				`SELECT a.attname AS column_name
				FROM pg_index i
				JOIN pg_class c ON c.oid = i.indrelid
				JOIN pg_namespace n ON n.oid = c.relnamespace
				JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
				WHERE n.nspname = ${s} AND c.relname = ${t} AND i.indisprimary`,
				{ toolName: "sql_query" },
			);
			const fks = await runRead(
				exec,
				`SELECT tc.constraint_name, kcu.column_name,
				        ccu.table_schema AS ref_schema, ccu.table_name AS ref_table, ccu.column_name AS ref_column
				FROM information_schema.table_constraints tc
				JOIN information_schema.key_column_usage kcu
				  ON tc.constraint_name = kcu.constraint_name AND tc.constraint_schema = kcu.constraint_schema
				JOIN information_schema.constraint_column_usage ccu
				  ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
				WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = ${s} AND tc.table_name = ${t}`,
				{ toolName: "sql_query" },
			);
			const indexes = await runRead(
				exec,
				`SELECT indexname AS index_name, indexdef AS definition
				FROM pg_indexes
				WHERE schemaname = ${s} AND tablename = ${t}`,
				{ toolName: "sql_query" },
			);
			const stats = await runRead(
				exec,
				`SELECT GREATEST(c.reltuples, 0)::bigint AS estimated_rows
				FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
				WHERE n.nspname = ${s} AND c.relname = ${t}`,
				{ toolName: "sql_query" },
			);

			const sections: string[] = [];
			sections.push(`## ${params.table}\n\n### Columns\n${formatRows(columns.rows, 200)}`);
			if (pk.rows.length > 0) sections.push(`### Primary key\n${pk.rows.map((r) => r.column_name).join(", ")}`);
			if (fks.rows.length > 0) sections.push(`### Foreign keys\n${formatRows(fks.rows, 100)}`);
			sections.push(`### Indexes (${indexes.rows.length})\n${formatRows(indexes.rows, 50)}`);
			if (stats.rows[0]) sections.push(`### Estimated rows\n${stats.rows[0].estimated_rows}`);

			return {
				content: [{ type: "text", text: sections.join("\n\n") }],
				details: {
					columns: columns.rows.length,
					indexes: indexes.rows.length,
					foreignKeys: fks.rows.length,
					estimatedRows: stats.rows[0]?.estimated_rows ?? null,
				},
			};
		},
	});

	const findColumns = defineTool({
		name: "find_columns",
		label: "Find Columns",
		description:
			"Search all columns across schemas by name pattern (case-insensitive substring match). Useful for locating which table stores a piece of data.",
		parameters: Type.Object({
			pattern: Type.String({ description: "Column name pattern to search for" }),
			limit: Type.Optional(Type.Number({ description: "Max matches to return (default 50)" })),
		}),
		execute: async (_id, params) => {
			const exec = requireExecutor();
			const limit = Math.min(Math.max(1, Math.trunc(params.limit ?? 50)), 200);
			const result = await runRead(
				exec,
				`SELECT table_schema, table_name, column_name, data_type
				FROM information_schema.columns
				WHERE table_schema NOT IN ('pg_catalog','information_schema')
				  AND column_name ILIKE ${sqlLiteral(`%${params.pattern}%`)}
				ORDER BY table_schema, table_name
				LIMIT ${limit}`,
				{ toolName: "sql_query" },
			);
			return {
				content: [{ type: "text", text: formatRows(result.rows, limit) }],
				details: { matches: result.rows.length },
			};
		},
	});

	const sampleRows = defineTool({
		name: "sample_rows",
		label: "Sample Rows",
		description:
			"Preview rows from a table ordered by primary key. Cheaper and more convenient than writing a SELECT by hand.",
		parameters: Type.Object({
			table: Type.String({ description: "Table name, optionally schema-qualified" }),
			limit: Type.Optional(Type.Number({ description: "Number of rows (default 10, max 100)" })),
			columns: Type.Optional(Type.Array(Type.String(), { description: "Optional subset of columns to select" })),
		}),
		execute: async (_id, params) => {
			const exec = requireExecutor();
			const [schema, table] = resolveTableRef(params.table);
			const qualified = `${quoteIdent(schema)}.${quoteIdent(table)}`;
			let columnList = "*";
			if (params.columns && params.columns.length > 0) {
				columnList = params.columns.map((c) => quoteIdent(c)).join(", ");
			}
			const limit = Math.min(Math.max(1, Math.trunc(params.limit ?? 10)), 100);
			const pk = await runRead(
				exec,
				`SELECT a.attname AS column_name FROM pg_index i
				JOIN pg_class c ON c.oid = i.indrelid
				JOIN pg_namespace n ON n.oid = c.relnamespace
				JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
				WHERE n.nspname = ${sqlLiteral(schema)} AND c.relname = ${sqlLiteral(table)} AND i.indisprimary`,
				{ toolName: "sql_query" },
			);
			let query = `SELECT ${columnList}\nFROM ${qualified}`;
			if (pk.rows.length > 0) {
				query += `\nORDER BY ${pk.rows.map((r) => quoteIdent(String(r.column_name))).join(", ")}`;
			}
			query += `\nLIMIT ${limit}`;
			const result = await runRead(exec, query, { toolName: "sql_query" });
			return {
				content: [{ type: "text", text: formatRows(result.rows, limit) }],
				details: { rowCount: result.rows.length, durationMs: result.durationMs },
			};
		},
	});

	const tableStats = defineTool({
		name: "table_stats",
		label: "Table Stats",
		description:
			"Statistics for one table or the whole schema: estimated/exact row counts, table+index sizes, dead tuples, and scan activity. Set exact=true for a precise COUNT(*) (can be slow on huge tables).",
		parameters: Type.Object({
			table: Type.Optional(Type.String({ description: "Specific table (optionally schema-qualified). Omit for all tables." })),
			exact: Type.Optional(Type.Boolean({ description: "Run exact COUNT(*) per table (default false, uses planner estimates)" })),
		}),
		execute: async (_id, params) => {
			const exec = requireExecutor();
			let sizes: Record<string, unknown>[];
			if (params.table) {
				const [schema, table] = resolveTableRef(params.table);
				const s = sqlLiteral(schema);
				const t = sqlLiteral(table);
				const res = await runRead(
					exec,
					`SELECT n.nspname AS schema, c.relname AS table_name,
					        GREATEST(c.reltuples, 0)::bigint AS estimated_rows,
					        pg_total_relation_size(c.oid) AS total_bytes,
					        st.n_live_tup, st.n_dead_tup, st.seq_scan, st.idx_scan
					FROM pg_class c
					JOIN pg_namespace n ON n.oid = c.relnamespace
					LEFT JOIN pg_stat_user_tables st ON st.relid = c.oid
					WHERE n.nspname = ${s} AND c.relname = ${t}`,
					{ toolName: "sql_query" },
				);
				if (res.rows.length === 0) throw new Error(`Table "${params.table}" not found.`);
				sizes = res.rows;
			} else {
				const res = await runRead(
					exec,
					`SELECT n.nspname AS schema, c.relname AS table_name,
					        GREATEST(c.reltuples, 0)::bigint AS estimated_rows,
					        pg_total_relation_size(c.oid) AS total_bytes,
					        st.n_live_tup, st.n_dead_tup, st.seq_scan, st.idx_scan
					FROM pg_class c
					JOIN pg_namespace n ON n.oid = c.relnamespace
					LEFT JOIN pg_stat_user_tables st ON st.relid = c.oid
					WHERE c.relkind IN ('r','p')
					  AND n.nspname NOT IN ('pg_catalog','information_schema')
					  AND n.nspname NOT LIKE 'pg_toast%'
					ORDER BY pg_total_relation_size(c.oid) DESC
					LIMIT 100`,
					{ toolName: "sql_query" },
				);
				sizes = res.rows;
			}

			if (params.exact && sizes.length > 0) {
				for (const row of sizes.slice(0, 20)) {
					const qualified = `${quoteIdent(String(row.schema))}.${quoteIdent(String(row.table_name))}`;
					const cnt = await runRead(exec, `SELECT count(*)::bigint AS exact_count FROM ${qualified}`, {
						toolName: "sql_query",
					});
					row.exact_count = cnt.rows[0]?.exact_count ?? null;
				}
			}

			return {
				content: [{ type: "text", text: formatRows(sizes, 120) }],
				details: { tables: sizes.length },
			};
		},
	});

	const sqlQuery = defineTool({
		name: "sql_query",
		label: "SQL Query",
		description:
			"Execute read-only SQL (SELECT / EXPLAIN / SHOW / VALUES / WITH...SELECT). Runs inside a forced READ ONLY transaction with a statement timeout — writes will fail. Results are JSON. Add LIMIT for large tables.",
		parameters: Type.Object({
			query: Type.String({ description: "A single read-only SQL statement" }),
			maxRows: Type.Optional(Type.Number({ description: "Rows shown in output (default 200)" })),
		}),
		execute: async (_id, params) => {
			const exec = requireExecutor();
			const result = await runRead(exec, params.query, { toolName: "sql_query" });
			return {
				content: [{ type: "text", text: formatRows(result.rows, params.maxRows ?? 200) }],
				details: { rowCount: result.rows.length, durationMs: result.durationMs },
			};
		},
	});

	const explainQuery = defineTool({
		name: "explain_query",
		label: "Explain Query",
		description:
			"Get a PostgreSQL query plan as JSON. analyze=false gives a cheap plan without running the query; analyze=true actually executes the query (read-only queries only).",
		parameters: Type.Object({
			query: Type.String({ description: "SQL statement to explain" }),
			analyze: Type.Optional(Type.Boolean({ description: "Execute the query to produce real timings (default false)" })),
		}),
		execute: async (_id, params): Promise<{ content: [{ type: "text"; text: string }]; details: { analyzed: boolean; durationMs: number } }> => {
			const exec = requireExecutor();
			const analyze = params.analyze ?? false;
			const started = Date.now();
			try {
				const { classifySql, describeClass, SqlGuardError: Guard } = await import("./safety");
				const { sqlClass } = classifySql(params.query);
				if (analyze && sqlClass !== "read") {
					throw new Guard(
						`EXPLAIN ANALYZE executes the statement, so it is only allowed for read-only queries here (this looks like ${describeClass(sqlClass)}).`,
					);
				}
				const wrapped = analyze
					? `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${params.query}`
					: `EXPLAIN (FORMAT JSON) ${params.query}`;
				const result = await runRead(exec, wrapped, { toolName: "sql_query" });
				return {
					content: [{ type: "text", text: JSON.stringify(result.rows[0], null, 2).slice(0, 60_000) }],
					details: { analyzed: analyze, durationMs: Date.now() - started },
				};
			} catch (err) {
				throw normalizeError(err);
			}
		},
	});

	const sqlExecute = defineTool({
		name: "sql_execute",
		label: "SQL Execute",
		description:
			"Execute mutating SQL (INSERT/UPDATE/DELETE/DDL). Not available in this embedded agent — it always runs read-only. If the user wants changes applied, tell them to run the statements themselves via the SQL editor (:sql) or the standalone dbagent CLI with --read-write.",
		parameters: Type.Object({
			query: Type.String({ description: "The SQL statement(s) the user wants executed" }),
		}),
		execute: async () => {
			throw new Error(READ_ONLY_EXECUTE_HINT);
		},
	});

	return [
		dbInfo,
		listTables,
		describeTable,
		findColumns,
		sampleRows,
		tableStats,
		sqlQuery,
		sqlExecute,
		explainQuery,
	];
}

const READ_ONLY_EXECUTE_HINT =
	"This agent session is read-only and cannot execute data or schema changes. Suggest the user run the SQL themselves in surp's SQL editor (:sql command) or review it manually.";

export const DB_TOOL_NAMES = [
	"db_info",
	"list_tables",
	"describe_table",
	"find_columns",
	"sample_rows",
	"table_stats",
	"sql_query",
	"sql_execute",
	"explain_query",
];
