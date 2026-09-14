import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { canonicalHash } from "../../lib/generatedPublication/canonical.mjs";
import {
  GENERATION_MODEL,
  GENERATION_THINKING,
} from "../../lib/sectionGeneration/contract.mjs";

const PROVIDER = "openai-codex";
const MODEL_ID = "gpt-5.6-sol";
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const WIRE_KEYS = new Set([
  "model",
  "store",
  "stream",
  "instructions",
  "input",
  "tools",
  "tool_choice",
  "reasoning",
  "text",
  "include",
  "prompt_cache_key",
  "prompt_cache_retention",
  "client_metadata",
  "service_tier",
  "stream_options",
]);

function invariant(value, message) {
  if (!value) throw new Error(message);
}

function validateWorkerPacket(packet) {
  invariant(
    packet?.model === GENERATION_MODEL &&
      packet?.thinking === GENERATION_THINKING,
    "Worker accepts only exact Sol-low packets",
  );
  invariant(
    Array.isArray(packet.messages) && packet.messages.length === 2,
    "Worker requires exactly one system and one user message",
  );
  for (const [index, role] of ["system", "user"].entries()) {
    const message = packet.messages[index];
    invariant(
      message?.role === role &&
        typeof message.content === "string" &&
        message.content.trim(),
      `Invalid isolated ${role} message`,
    );
    invariant(
      Object.keys(message).every((key) => key === "role" || key === "content"),
      "Unexpected message metadata",
    );
  }
  invariant(
    packet.inputHash === canonicalHash(packet.messages),
    "Packet input hash mismatch",
  );
  return packet;
}

export function contextForPacket(packet, timestamp = Date.now()) {
  validateWorkerPacket(packet);
  return {
    systemPrompt: [packet.messages[0].content],
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: packet.messages[1].content }],
        timestamp,
      },
    ],
    tools: [],
  };
}

export function assertIsolatedPayload(payload, model, packet) {
  validateWorkerPacket(packet);
  invariant(
    model?.provider === PROVIDER &&
      model?.id === MODEL_ID &&
      model?.api === "openai-codex-responses",
    "Resolved model is not exact Sol",
  );
  invariant(payload?.model === MODEL_ID, "Wire model is not exact Sol");
  invariant(
    Object.keys(payload).every((key) => WIRE_KEYS.has(key)),
    "Unexpected wire request field",
  );
  invariant(
    payload.store === false && payload.stream === true,
    "Unexpected persistence or transport mode",
  );
  invariant(
    payload.reasoning?.effort === "low" && !payload.reasoning.mode,
    "Wire reasoning is not low or enables another serving mode",
  );
  invariant(
    payload.tools === undefined ||
      (Array.isArray(payload.tools) && payload.tools.length === 0),
    "Worker request contains tools",
  );
  invariant(
    payload.tool_choice === undefined || payload.tool_choice === "none",
    "Worker enables tool selection",
  );
  invariant(
    payload.instructions === packet.messages[0].content,
    "System prompt changed or inherited context",
  );
  invariant(
    Array.isArray(payload.input) && payload.input.length === 1,
    "Worker request contains history",
  );
  const message = payload.input[0];
  invariant(
    message?.role === "user" &&
      (message.type === undefined || message.type === "message"),
    "Unexpected wire message role",
  );
  invariant(
    Object.keys(message).every((key) =>
      ["role", "type", "content"].includes(key),
    ),
    "Unexpected wire message metadata",
  );
  invariant(
    Array.isArray(message.content) && message.content.length === 1,
    "Unexpected wire content",
  );
  const content = message.content[0];
  invariant(
    content?.type === "input_text" &&
      content.text === packet.messages[1].content &&
      Object.keys(content).every((key) => key === "type" || key === "text"),
    "User evidence changed or inherited context",
  );
}

export function selectOAuthAccount(accounts, requestedId) {
  invariant(Array.isArray(accounts), "Invalid OAuth account metadata");
  if (requestedId !== undefined) {
    invariant(
      /^\d+$/.test(String(requestedId)),
      "Account ID must be a durable numeric credential ID",
    );
    const match = accounts.find(
      (account) => String(account.credentialId) === String(requestedId),
    );
    invariant(match, "Requested current-account credential is unavailable");
    return match;
  }
  const active = accounts.filter((account) => account.active);
  if (active.length === 1) return active[0];
  invariant(
    accounts.length === 1,
    "Current OAuth account is ambiguous or missing; select its credential ID explicitly. No account fallback is allowed.",
  );
  return accounts[0];
}

async function loadSdk() {
  const version = process.versions.bun?.split(".").map(Number);
  invariant(
    version &&
      (version[0] > 1 ||
        (version[0] === 1 &&
          (version[1] > 3 || (version[1] === 3 && version[2] >= 14)))),
    "Worker requires Bun >=1.3.14; use the pinned runtime script",
  );
  return import("./runtime/sdk.mjs");
}

async function prepareWorker({ sdk, accountId } = {}) {
  sdk ??= await loadSdk();
  const model = sdk.getBundledModel(PROVIDER, MODEL_ID);
  invariant(
    model?.provider === PROVIDER &&
      model?.id === MODEL_ID &&
      model?.api === "openai-codex-responses" &&
      (!model.requestModelId || model.requestModelId === MODEL_ID),
    "Exact Sol model is unavailable in the pinned catalog",
  );
  sdk.requireSupportedEffort(model, sdk.Effort.Low);
  const auth = await sdk.discoverAuthStorage({
    configValueResolver: async (value) => {
      invariant(
        !value.startsWith("!"),
        "Command-backed auth configuration is unsupported; no local-account fallback allowed",
      );
      return process.env[value] || value;
    },
  });
  try {
    const account = selectOAuthAccount(
      auth.listOAuthAccounts(PROVIDER),
      accountId,
    );
    return { sdk, model, auth, account };
  } catch (error) {
    auth.close?.();
    throw error;
  }
}

function hasPendingSafetyChecks(value) {
  if (!value || typeof value !== "object") return false;
  if (
    Array.isArray(value.pending_safety_checks) &&
    value.pending_safety_checks.length > 0
  )
    return true;
  return Object.values(value).some(
    (entry) =>
      entry && typeof entry === "object" && hasPendingSafetyChecks(entry),
  );
}

export async function runWorker(
  packet,
  { prepared, accountId, timeoutMs = 300_000 } = {},
) {
  validateWorkerPacket(packet);
  invariant(
    Number.isSafeInteger(timeoutMs) && timeoutMs > 0,
    "Invalid worker deadline",
  );
  const owned = !prepared;
  prepared ??= await prepareWorker({ accountId });
  const { sdk, model, auth, account } = prepared;
  const startedAt = new Date().toISOString();
  let guardedRequests = 0;
  let safetyApprovalRequired = false;
  let responseModel;
  let responseId;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const access = await auth.getOAuthAccessByCredentialId(
      PROVIDER,
      account.credentialId,
      { modelId: MODEL_ID },
    );
    invariant(
      access?.ok &&
        typeof access.accessToken === "string" &&
        access.accessToken,
      "Current-account OAuth access unavailable; no provider or account fallback attempted",
    );
    const response = await sdk
      .streamOpenAICodexResponses(model, contextForPacket(packet), {
        apiKey: access.accessToken,
        reasoning: "low",
        responsesLite: false,
        preferWebsockets: false,
        signal: controller.signal,
        onPayload(payload, resolvedModel) {
          assertIsolatedPayload(payload, resolvedModel, packet);
          guardedRequests += 1;
        },
        onSseEvent(event) {
          let data;
          try {
            data = JSON.parse(event.data);
          } catch {
            return;
          }
          if (hasPendingSafetyChecks(data)) {
            safetyApprovalRequired = true;
            controller.abort();
          }
          if (typeof data.response?.model === "string")
            responseModel = data.response.model;
          if (typeof data.response?.id === "string")
            responseId = data.response.id;
        },
      })
      .result();
    invariant(
      !safetyApprovalRequired,
      "Provider safety check requires explicit interactive approval; no acknowledgement sent",
    );
    invariant(
      guardedRequests > 0,
      "Transport bypassed the outgoing isolation guard",
    );
    invariant(
      response.stopReason === "stop",
      `Worker did not complete normally (${response.stopReason})`,
    );
    invariant(
      !responseModel || responseModel === MODEL_ID,
      "Server reported a different model",
    );
    invariant(
      Array.isArray(response.content) &&
        response.content.every(
          (part) => part.type === "text" || part.type === "thinking",
        ),
      "Worker returned a tool call or unsupported content",
    );
    const rawText = response.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    invariant(rawText.trim(), "Worker returned no text");
    return {
      rawText,
      model: GENERATION_MODEL,
      thinking: GENERATION_THINKING,
      tools: [],
      inputHash: packet.inputHash,
      provider: PROVIDER,
      accountId: String(account.credentialId),
      startedAt,
      completedAt: new Date().toISOString(),
      wireModel: MODEL_ID,
      guardedRequests,
      ...(responseModel ? { responseModel } : {}),
      ...(responseId ? { responseId } : {}),
    };
  } finally {
    clearTimeout(timer);
    if (owned) await auth.close?.();
  }
}

async function workerPreflight({ sdk, accountId } = {}) {
  const prepared = await prepareWorker({ sdk, accountId });
  try {
    const messages = [
      { role: "system", content: "Return only the supplied evidence." },
      {
        role: "user",
        content:
          "Synthetic isolation preflight. No inference request is authorized.",
      },
    ];
    const packet = {
      model: GENERATION_MODEL,
      thinking: GENERATION_THINKING,
      messages,
      inputHash: canonicalHash(messages),
    };
    const payload = await prepared.sdk.buildTransformedCodexRequestBody(
      prepared.model,
      contextForPacket(packet),
      { reasoning: "low", responsesLite: false, preferWebsockets: false },
    );
    assertIsolatedPayload(payload, prepared.model, packet);
    return {
      status: "ready",
      model: GENERATION_MODEL,
      thinking: GENERATION_THINKING,
      accountId: String(prepared.account.credentialId),
      tools: [],
      sdkVersion: "18.1.10",
      isolationGuard: "verified with actual SDK serializer",
      inferencePerformed: false,
      accountEntitlementVerified: false,
    };
  } finally {
    await prepared.auth.close?.();
  }
}

async function workerMain(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      packet: { type: "string" },
      output: { type: "string" },
      "packet-digest": { type: "string" },
      "account-id": { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help || positionals.length === 0) {
    console.log(
      "worker.mjs preflight [--account-id=<credential-id>]\nworker.mjs run --packet=<packet-json> --output=<receipt-json> [--packet-digest=<digest>] [--account-id=<credential-id>]\nPaths are dosewiki-root-relative. Preflight makes no inference call.",
    );
    return;
  }
  invariant(positionals.length === 1, "Expected exactly one worker command");
  let accountId = values["account-id"];
  if (accountId === undefined) {
    try {
      const selection = JSON.parse(
        await readFile(
          path.join(ROOT, "runs/section-generation/worker-account.json"),
          "utf8",
        ),
      );
      invariant(
        selection.provider === PROVIDER &&
          Number.isSafeInteger(selection.credentialId),
        "Invalid locally approved worker account selection",
      );
      accountId = String(selection.credentialId);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (positionals[0] === "preflight") {
    invariant(
      !values.packet && !values.output && !values["packet-digest"],
      "Preflight does not accept packet/output flags",
    );
    console.log(JSON.stringify(await workerPreflight({ accountId }), null, 2));
    return;
  }
  invariant(
    positionals[0] === "run" && values.packet && values.output,
    "Run requires --packet and --output",
  );
  const input = JSON.parse(
    await readFile(path.resolve(ROOT, values.packet), "utf8"),
  );
  const packets = Array.isArray(input) ? input : [input];
  const selected = values["packet-digest"]
    ? packets.filter(
        (packet) => packet.packetDigest === values["packet-digest"],
      )
    : packets;
  invariant(
    selected.length === 1,
    "Select exactly one packet with --packet-digest",
  );
  const outputPath = path.resolve(ROOT, values.output);
  // Reserve before inference so duplicate launches cannot spend quota for one artifact.
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(`${outputPath}.lock`, `${process.pid}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  const output = await runWorker(selected[0], { accountId });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      outputPath,
      inputHash: output.inputHash,
      model: output.model,
      thinking: output.thinking,
    }),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  workerMain().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
