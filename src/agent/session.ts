import { homedir } from "node:os";
import path from "node:path";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { createSignal } from "solid-js";
import { createStore, produce, type SetStoreFunction } from "solid-js/store";
import {
	createAgentSessionServices,
	createAgentSessionFromServices,
	ModelRuntime,
	SessionManager,
	resolveCliModel,
	type AgentSession,
} from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { SqlExecutor } from "./db";
import { makeDbTools } from "./tools";
import { buildSystemPrompt } from "./prompt";

export type AgentItem =
	| { kind: "user"; text: string }
	| { kind: "assistant"; id: string; text: string; live: boolean }
	| { kind: "tool"; callId: string; name: string; args: string; state: "running" | "done" | "error"; summary: string }
	| { kind: "error"; text: string }
	| { kind: "info"; text: string };

const HOME = process.env.DBAGENT_HOME ?? path.join(homedir(), ".dbagent");
const WORKSPACE = path.join(HOME, "workspace");
const SESSIONS = path.join(HOME, "sessions");

// --- reactive state ---------------------------------------------------------

const [items, setItems] = createStore<{ list: AgentItem[] }>({ list: [] });
const [busy, setBusy] = createSignal(false);
const [initializing, setInitializing] = createSignal(false);
const [initError, setInitError] = createSignal<string | null>(null);
const [modelLabel, setModelLabel] = createSignal("");

export function agentItems() {
	return items.list;
}
export const agentBusy = busy;
export const agentInitializing = initializing;
export const agentInitError = initError;
export const agentModel = modelLabel;

export function clearAgentTranscript() {
	setItems(produce((s) => void (s.list = [])));
}

function pushItem(item: AgentItem) {
	setItems("list", items.list.length, item);
}

function pushInfo(text: string) {
	pushItem({ kind: "info", text });
}

/** Surface a notice (e.g. command feedback) in the agent transcript from outside. */
export function pushAgentNotice(text: string, kind: "info" | "error" = "info") {
	pushItem(kind === "error" ? { kind: "error", text } : { kind: "info", text });
}

// --- executor provider ------------------------------------------------------

let provider: (() => SqlExecutor | null) | null = null;

/** The buffer registers a live lookup of the currently active connection. */
export function setExecutorProvider(fn: () => SqlExecutor | null) {
	provider = fn;
}

function currentExecutor(): SqlExecutor | null {
	return provider?.() ?? null;
}

// --- session lifecycle ------------------------------------------------------

let session: AgentSession | null = null;
let initPromise: Promise<AgentSession> | null = null;

async function ensureHome(): Promise<void> {
	await mkdir(WORKSPACE, { recursive: true });
	await mkdir(SESSIONS, { recursive: true });
	const authPath = path.join(HOME, "auth.json");
	try {
		await readFile(authPath);
	} catch {
		// First run — piggyback on an existing pi install's credentials if present.
		try {
			await copyFile(path.join(homedir(), ".pi", "agent", "auth.json"), authPath);
			await writeFile(authPath, await readFile(authPath, "utf8"), { mode: 0o600 });
		} catch {
			// no pi credentials around; env-var keys may still work
		}
	}
}

async function readConfiguredModel(): Promise<string | undefined> {
	const fromEnv = process.env.DBAGENT_MODEL ?? process.env.SURP_AGENT_MODEL;
	if (fromEnv) return fromEnv;
	try {
		const raw = JSON.parse(await readFile(path.join(HOME, "config.json"), "utf8")) as { model?: string };
		return raw.model || undefined;
	} catch {
		return undefined;
	}
}

function extractAssistantText(message: AssistantMessage): string {
	const parts: string[] = [];
	for (const block of message.content) {
		if (block.type === "text") parts.push(block.text);
	}
	return parts.join("\n");
}

/** Index of the assistant item currently streaming, or -1. */
let liveAssistantIdx = -1;

function upsertAssistant(
	setItems: SetStoreFunction<{ list: AgentItem[] }>,
	items: { list: AgentItem[] },
	msg: AssistantMessage,
	live: boolean,
) {
	const text = extractAssistantText(msg);
	if (liveAssistantIdx < 0 || items.list[liveAssistantIdx]?.kind !== "assistant") {
		if (text.length === 0 && live) return;
		liveAssistantIdx = items.list.length;
		pushItem({ kind: "assistant", id: msg.responseId ?? "", text, live });
		return;
	}
	setItems("list", liveAssistantIdx, produce((it) => {
		if (it.kind === "assistant") {
			it.text = text;
			it.live = live;
		}
	}));
}

async function createSession(): Promise<AgentSession> {
	await ensureHome();
	const modelRuntime = await ModelRuntime.create({
		authPath: path.join(HOME, "auth.json"),
		modelsPath: path.join(HOME, "models.json"),
		allowModelNetwork: true,
	});

	let model = undefined;
	const wanted = await readConfiguredModel();
	if (wanted) {
		const resolved = await resolveCliModel({ cliModel: wanted, modelRuntime });
		if ("model" in resolved && resolved.model) model = resolved.model;
		else throw new Error(`Unknown model "${wanted}" (${String(resolved.error ?? "not available")}).`);
	} else {
		const available = await modelRuntime.getAvailable();
		model = available[0];
		if (!model) {
			throw new Error(
				"No AI providers configured. Run :agent-login to add an API key (or set OPENAI_API_KEY / ANTHROPIC_API_KEY).",
			);
		}
	}
	setModelLabel(`${model.provider}/${model.id}`);

	const services = await createAgentSessionServices({
		cwd: WORKSPACE,
		agentDir: HOME,
		resourceLoaderOptions: { systemPromptOverride: () => buildSystemPrompt({ mode: "read-only" }) },
	});

	const result = await createAgentSessionFromServices({
		services,
		sessionManager: SessionManager.create(WORKSPACE, SESSIONS),
		model,
		customTools: makeDbTools({ getExecutor: currentExecutor, mode: "read-only" }),
		noTools: "builtin",
	});

	// Tracks auto-retry so per-attempt message_end errors don't spam the
	// transcript — the retry events below narrate them instead.
	let retrying = false;

	result.session.subscribe((event) => {
		switch (event.type) {
			case "message_start":
			case "message_update": {
				if (event.message.role !== "assistant") return;
				if (event.type === "message_start") liveAssistantIdx = -1;
				upsertAssistant(setItems, items, event.message as AssistantMessage, true);
				break;
			}
			case "message_end": {
				if (event.message.role === "assistant") {
					upsertAssistant(setItems, items, event.message as AssistantMessage, false);
					liveAssistantIdx = -1;
					const msg = event.message as AssistantMessage;
					if (msg.stopReason === "error" && !retrying) {
						const errText = `Model error${msg.errorMessage ? `: ${msg.errorMessage}` : "."}`;
						const hint = msg.errorMessage ? hintFor(msg.errorMessage) : null;
						pushItem({ kind: "error", text: hint ? `${errText}\n${hint}` : errText });
					} else if (msg.stopReason === "error") {
						// attempt failed but a retry is queued — show one quiet line
						liveAssistantIdx = -1;
					}
				}
				break;
			}
			case "auto_retry_start": {
				retrying = true;
				liveAssistantIdx = -1;
				const short = event.errorMessage.length > 140 ? `${event.errorMessage.slice(0, 137)}…` : event.errorMessage;
				pushInfo(`transient error — retrying (${event.attempt}/${event.maxAttempts}) in ${Math.max(1, Math.round(event.delayMs / 1000))}s: ${short}`);
				break;
			}
			case "auto_retry_end": {
				retrying = false;
				if (event.success) pushInfo(`retry succeeded on attempt ${event.attempt}`);
				else if (event.finalError) {
					const hint = hintFor(event.finalError);
					pushItem({ kind: "error", text: hint ? `${event.finalError}\n${hint}` : event.finalError });
				}
				break;
			}
			case "tool_execution_start": {
				let args = "";
				try {
					args = JSON.stringify(event.args ?? {});
				} catch {
					args = "{}";
				}
				pushItem({ kind: "tool", callId: event.toolCallId, name: event.toolName, args, state: "running", summary: "" });
				break;
			}
			case "tool_execution_end": {
				const idx = items.list.findIndex((it) => it.kind === "tool" && it.callId === event.toolCallId);
				if (idx < 0) break;
				let summary = "";
				const content = (event.result as { content?: Array<{ type: string; text?: string }> })?.content;
				const firstText = Array.isArray(content) ? content.find((c) => c.type === "text")?.text : undefined;
				if (typeof firstText === "string") summary = firstText.split("\n")[0] ?? "";
				if (event.isError) {
					const errText = typeof firstText === "string" ? firstText : "failed";
					summary = errText.length > 160 ? `${errText.slice(0, 157)}…` : errText;
				}
				setItems("list", idx, produce((it) => {
					if (it.kind === "tool") {
						it.state = event.isError ? "error" : "done";
						it.summary = summary;
					}
				}));
				break;
			}
			default:
				break;
		}
	});

	// Retry transient failures (5xx, rate limits, overloaded) automatically.
	result.session.setAutoRetryEnabled(true);

	return result.session;
}

export async function ensureAgentSession(): Promise<AgentSession> {
	if (session) return session;
	if (!initPromise) {
		initPromise = (async () => {
			setInitializing(true);
			setInitError(null);
			try {
				session = await createSession();
				pushInfo(`agent ready · ${modelLabel()} · read-only`);
				return session;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				setInitError(message);
				throw err;
			} finally {
				setInitializing(false);
				initPromise = null;
			}
		})();
	}
	return initPromise;
}

export async function sendAgentPrompt(text: string): Promise<void> {
	const trimmed = text.trim();
	if (!trimmed || busy()) return;
	pushItem({ kind: "user", text: trimmed });
	try {
		const s = await ensureAgentSession();
		setBusy(true);
		// abortAgent() disarms auto-retry before stopping; re-arm per run.
		try { s.setAutoRetryEnabled(true); } catch { /* ignore */ }
		await s.prompt(trimmed);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (/abort|cancel|stop/i.test(message)) {
			// Ghost "· stopped" already covers the empty-response case;
			// avoid a duplicate line.
			const hasGhost = items.list.some((it) => it.kind === "assistant" && it.text === "" && !it.live);
			if (!hasGhost) pushInfo("stopped");
			return;
		}
		const hint = hintFor(message);
		pushItem({ kind: "error", text: hint ? `${message}\n${hint}` : message });
	} finally {
		setBusy(false);
	}
}

export async function abortAgent(): Promise<void> {
	if (session && busy()) {
		// Separate guards: a throw from one must not starve the other.
		try {
			session.abortRetry();
			// An aborted run surfaces as an error to the auto-retry machinery;
			// disarm it so esc can't accidentally trigger another attempt.
			session.setAutoRetryEnabled(false);
		} catch {
			// ignore
		}
		try {
			await session.abort();
		} catch {
			// ignore
		}
	}
}

export function newAgentChat(): void {
	void abortAgent().finally(() => {
		session = null;
		initPromise = null;
		clearAgentTranscript();
	});
}

/** Validate + persist a model choice ("provider/model"), then reset the chat so it takes effect. */
export async function setAgentModel(wanted: string): Promise<string | null> {
	const modelRuntime = await ModelRuntime.create({
		authPath: path.join(HOME, "auth.json"),
		modelsPath: path.join(HOME, "models.json"),
		allowModelNetwork: true,
	});
	const resolved = await resolveCliModel({ cliModel: wanted, modelRuntime });
	if (!("model" in resolved) || !resolved.model) {
		return `Unknown or unavailable model "${wanted}" (${String(resolved.error ?? "not available")}).`;
	}
	await mkdir(HOME, { recursive: true });
	let cfg: Record<string, unknown> = {};
	try {
		cfg = JSON.parse(await readFile(path.join(HOME, "config.json"), "utf8")) as Record<string, unknown>;
	} catch {
		// start fresh
	}
	cfg.model = wanted;
	await writeFile(path.join(HOME, "config.json"), `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
	newAgentChat();
	pushInfo(`model set to ${wanted} — applies to the next message`);
	return null;
}

function hintFor(message: string): string | null {
	if (/credit|payment|billing|402|insufficient/i.test(message)) {
		return "Your provider account lacks credits for this model. Pick another with :agent-model provider/model (e.g. :agent-model opencode/hy3-free), or set DBAGENT_MODEL.";
	}
	if (/NoApiCredentials|no credentials/i.test(message)) {
		return "No API key for this provider. Run :agent-login to add one, or pick a configured provider via :agent-model.";
	}
	if (/401|unauthorized|api key|invalid.*key|authentication/i.test(message)) {
		return "Provider rejected the credentials. Fix them with :agent-login (re-entering overwrites), or pick another provider via :agent-model provider/model.";
	}
	return null;
}
