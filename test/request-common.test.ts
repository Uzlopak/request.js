import zlib from "node:zlib";
import fs from "node:fs";
import stream from "node:stream";
import { ReadableStream } from "node:stream/web";

import { describe, it, expect, vi } from "vitest";
import { getUserAgent } from "universal-user-agent";
import fetchMock from "fetch-mock";
import { createAppAuth } from "@octokit/auth-app";
import type {
  EndpointOptions,
  RequestInterface,
  ResponseHeaders,
} from "@octokit/types";

import { request } from "../src/index.ts";

const userAgent = `octokit-request.js/0.0.0-development ${getUserAgent()}`;
const __filename = new URL(import.meta.url);
function stringToArrayBuffer(str: string) {
  return new TextEncoder().encode(str).buffer;
}

describe("request()", () => {
  it("is a function", () => {
    expect(request).toBeInstanceOf(Function);
  });

  it("Request error", async () => {
    expect.assertions(1);

    // port: 8 // officially unassigned port. See https://en.wikipedia.org/wiki/List_of_TCP_and_UDP_port_numbers
    await expect(request("GET https://127.0.0.1:8/")).rejects.toHaveProperty(
      "status",
      500,
    );
  });

  it("Resolves with url", async () => {
    expect.assertions(1);

    // this test cannot be mocked with `fetch-mock`. I don’t like to rely on
    // external websites to run tests, but in this case I’ll make an exception.
    // The alternative would be to start a local server we then send a request to,
    // this would only work in Node, so we would need to adapt the test setup, too.
    // We also can’t test the GitHub API, because on Travis unauthenticated
    // GitHub API requests are usually blocked due to IP rate limiting
    const response = await request(
      "https://www.githubstatus.com/api/v2/status.json",
    );
    expect(response.url).toEqual(
      "https://www.githubstatus.com/api/v2/status.json",
    );
  });

  it("should error when globalThis.fetch is undefined", async () => {
    expect.assertions(1);

    const originalFetch = globalThis.fetch;
    // @ts-expect-error force undefined to mimic older node version
    globalThis.fetch = undefined;

    try {
      await request("GET /orgs/me");
    } catch (error) {
      expect(error.message).toEqual(
        "fetch is not set. Please pass a fetch implementation as new Octokit({ request: { fetch }}). Learn more at https://github.com/octokit/octokit.js/#fetch-missing",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("request should pass the `redirect` option to fetch", () => {
    expect.assertions(1);

    const customFetch = async (url: string, options: RequestInit) => {
      expect(options.redirect).toEqual("manual");
      return await fetch(url, options);
    };

    return request("/", {
      request: {
        redirect: "manual",
        fetch: customFetch,
      },
    });
  });

  it("options.request.fetch", async () => {
    expect.assertions(1);

    const response = await request("/", {
      request: {
        fetch: () =>
          Promise.resolve({
            status: 200,
            headers: new Headers({
              "Content-Type": "application/json; charset=utf-8",
            }),
            url: "http://api.github.com/",
            json() {
              return Promise.resolve("funk");
            },
          }),
      },
    });
    expect(response.data).toEqual("funk");
  });

  it("Request TypeError error with an Error cause", async () => {
    expect.assertions(2);

    try {
      // port: 8 // officially unassigned port. See https://en.wikipedia.org/wiki/List_of_TCP_and_UDP_port_numbers
      await request("GET https://127.0.0.1:8/", {
        request: {
          fetch: () =>
            Promise.reject(
              Object.assign(new TypeError("fetch failed"), {
                cause: new Error("bad"),
              }),
            ),
        },
      });
      throw new Error("should not resolve");
    } catch (error) {
      expect(error.status).toEqual(500);
      expect(error.message).toEqual("bad");
    }
  });

  it("Request TypeError error with a string cause", async () => {
    expect.assertions(2);

    const mock = fetchMock.sandbox().get("https://127.0.0.1:8/", {
      throws: Object.assign(new TypeError("fetch failed"), { cause: "bad" }),
    });

    try {
      // port: 8 // officially unassigned port. See https://en.wikipedia.org/wiki/List_of_TCP_and_UDP_port_numbers
      await request("GET https://127.0.0.1:8/", {
        request: {
          fetch: () =>
            Promise.reject(
              Object.assign(new TypeError("fetch failed"), {
                cause: "bad",
              }),
            ),
        },
      });
      throw new Error("should not resolve");
    } catch (error) {
      expect(error.status).toEqual(500);
      expect(error.message).toEqual("bad");
    }
  });
});
