import { createServer } from "node:http";

const json = (response, status, body) => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
};

const readJson = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const paginate = (items, args) => {
  const limit = Number.isInteger(args.limit) && args.limit > 0 ? args.limit : 32;
  const offset = args.cursor === undefined ? 0 : Number.parseInt(args.cursor, 10);
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const isDone = nextOffset >= items.length;

  return {
    items: page,
    cursor: isDone ? null : String(nextOffset),
    isDone,
  };
};

const createReadHandlers = (corpus) => new Map([
  ["substanceIndex:getPublicPreviewsPage", (args) => paginate(corpus.substances, args)],
]);

export const startPublicReadStub = async ({ corpus, host = "127.0.0.1", port = 0 }) => {
  if (host !== "127.0.0.1") {
    throw new Error("The local public-read fixture must bind to 127.0.0.1.");
  }

  const requests = [];
  const handlers = createReadHandlers(corpus);
  const server = createServer(async (request, response) => {
    const endpoint = new URL(request.url ?? "/", `http://${host}`);

    const [requestHostname] = (request.headers.host ?? "").split(":");
    if (requestHostname !== host) {
      json(response, 421, { error: "The fixture answers loopback Host headers only." });
      return;
    }

    if (request.method !== "POST") {
      json(response, 405, { error: "The fixture accepts POST queries only." });
      return;
    }

    if (endpoint.pathname !== "/api/query") {
      json(response, 405, { error: "Mutation and action endpoints are disabled." });
      return;
    }

    try {
      const body = await readJson(request);
      const path = typeof body.path === "string" ? body.path : "";
      const args = Array.isArray(body.args) && body.args[0] && typeof body.args[0] === "object"
        ? body.args[0]
        : {};
      requests.push({ path, args });

      const handler = handlers.get(path);
      if (!handler) {
        json(response, 200, {
          status: "error",
          errorMessage: `Public fixture query is not allowlisted: ${path || "<missing>"}`,
        });
        return;
      }

      json(response, 200, { status: "success", value: handler(args), logLines: [] });
    } catch {
      json(response, 400, { error: "Invalid fixture query payload." });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to resolve the local fixture address.");
  }

  let closed = false;
  return {
    url: `http://${host}:${address.port}`,
    requests,
    close: () => new Promise((resolve, reject) => {
      if (closed) {
        resolve();
        return;
      }
      closed = true;
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
};
