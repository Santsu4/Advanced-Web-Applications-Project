import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { ApiError, createApiClient } from "../src/shared/services/apiClient.js";

let server;
let get;
before(async () => {
  server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    const path = new URL(request.url, "http://localhost").pathname;
    if (path === "/api/success")
      return response.end(
        JSON.stringify({
          success: true,
          data: { path: request.url, accept: request.headers.accept },
        }),
      );
    if (path === "/api/empty")
      return response.end(JSON.stringify({ success: true, data: [] }));
    if (path === "/api/client-error") {
      response.statusCode = 400;
      return response.end(
        JSON.stringify({ success: false, error: "Screen is required" }),
      );
    }
    if (path === "/api/false-success")
      return response.end(
        JSON.stringify({ success: false, error: "Request failed" }),
      );
    if (path === "/api/missing-data")
      return response.end(JSON.stringify({ success: true }));
    if (path === "/api/http-error") {
      response.statusCode = 503;
      return response.end(JSON.stringify({ success: true, data: [] }));
    }
    response.statusCode = 502;
    response.end("<html>Upstream unavailable</html>");
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  get = createApiClient(`http://127.0.0.1:${server.address().port}/api///`);
});
after(
  () =>
    new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
);

test("unwraps successful envelopes, normalizes slashes and preserves query parameters", async () => {
  assert.deepEqual(await get("/success?cityId=7"), {
    path: "/api/success?cityId=7",
    accept: "application/json",
  });
});
test("accepts an empty result array", async () => {
  assert.deepEqual(await get("empty"), []);
});
test("preserves handled API error status and message", async () => {
  await assert.rejects(
    get("client-error"),
    (error) =>
      error instanceof ApiError &&
      error.status === 400 &&
      error.message === "Screen is required",
  );
});
test("rejects unsuccessful envelopes even with HTTP 200", async () => {
  await assert.rejects(get("false-success"), { name: "ApiError", status: 200 });
});
test("rejects an HTTP error even when the body claims success", async () => {
  await assert.rejects(get("http-error"), { name: "ApiError", status: 503 });
});
test("rejects incomplete success envelopes", async () => {
  await assert.rejects(get("missing-data"), { name: "ApiError", status: 200 });
});
test("handles non-JSON upstream errors without exposing HTML", async () => {
  await assert.rejects(
    get("html"),
    (error) =>
      error instanceof ApiError &&
      error.status === 502 &&
      !error.message.includes("<html>"),
  );
});
test("passes cancellation through as AbortError", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(get("success", { signal: controller.signal }), {
    name: "AbortError",
  });
});
