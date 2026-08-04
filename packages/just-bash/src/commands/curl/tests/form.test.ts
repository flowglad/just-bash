/**
 * Tests for curl form data options
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Bash } from "../../../Bash.js";

const originalFetch = global.fetch;
let lastRequest: { url: string; options: RequestInit } | null = null;

const mockFetch = vi.fn(async (url: string, options?: RequestInit) => {
  lastRequest = { url, options: options ?? {} };
  return new Response('{"ok":true}', {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

beforeAll(() => {
  global.fetch = mockFetch as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("curl form data", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    lastRequest = null;
  });

  describe("--data-urlencode", () => {
    it("URL-encodes data with --data-urlencode", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://api.example.com"],
          allowedMethods: ["POST"],
        },
      });
      await env.exec(
        "curl --data-urlencode 'message=hello world' https://api.example.com/post",
      );

      expect(lastRequest?.options.body).toBe("message=hello+world");
    });

    it("encodes special characters", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://api.example.com"],
          allowedMethods: ["POST"],
        },
      });
      await env.exec(
        "curl --data-urlencode 'data=a&b=c' https://api.example.com/post",
      );

      expect(lastRequest?.options.body).toBe("data=a%26b%3dc");
    });

    it("appends multiple --data-urlencode values", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://api.example.com"],
          allowedMethods: ["POST"],
        },
      });
      await env.exec(
        "curl --data-urlencode 'a=1' --data-urlencode 'b=2' https://api.example.com/post",
      );

      expect(lastRequest?.options.body).toBe("a=1&b=2");
    });

    it("sets form content type for POST data unless already supplied", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://api.example.com"],
          allowedMethods: ["POST"],
        },
      });
      await env.exec(
        "curl --data-urlencode 'q=hello world' https://api.example.com/post",
      );

      const headers = new Headers(lastRequest?.options.headers as HeadersInit);
      expect(lastRequest?.options.method).toBe("POST");
      expect(headers.get("Content-Type")).toBe(
        "application/x-www-form-urlencoded",
      );
    });

    it("preserves user-supplied content type for POST data", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://api.example.com"],
          allowedMethods: ["POST"],
        },
      });
      await env.exec(
        "curl -H 'Content-Type: text/plain' --data-urlencode 'q=hello world' https://api.example.com/post",
      );

      const headers = new Headers(lastRequest?.options.headers as HeadersInit);
      expect(headers.get("Content-Type")).toBe("text/plain");
    });
  });

  describe("-G/--get data query strings", () => {
    it("appends encoded query parameters for the motivating GET case", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://httpbin.org"],
        },
      });
      const result = await env.exec(
        "curl -G 'https://httpbin.org/get' --data-urlencode \"query=select * from Foo where Bar = '2026-05-01'\" --data-urlencode 'minorversion=75'",
      );

      expect(result.exitCode).toBe(0);
      expect(lastRequest?.options.method).toBe("GET");
      expect(lastRequest?.options.body).toBeUndefined();
      expect(lastRequest?.url).toBe(
        "https://httpbin.org/get?query=select%20%2A%20from%20Foo%20where%20Bar%20%3D%20%272026-05-01%27&minorversion=75",
      );
    });

    it("uses ampersand when URL already has a query string", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://api.example.com"],
        },
      });
      await env.exec(
        "curl -G 'https://api.example.com/q?fixed=1' --data-urlencode 'extra=hi there'",
      );

      expect(lastRequest?.url).toBe(
        "https://api.example.com/q?fixed=1&extra=hi%20there",
      );
    });

    it("leaves URL unchanged for -G without data payloads", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://api.example.com"],
        },
      });
      await env.exec("curl -G 'https://api.example.com/path'");

      expect(lastRequest?.url).toBe("https://api.example.com/path");
    });

    it("supports --data-urlencode value forms", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://x.example"],
        },
      });

      await env.exec("curl -G https://x.example/ --data-urlencode 'k=a b'");
      expect(lastRequest?.url).toBe("https://x.example/?k=a%20b");

      await env.exec("curl -G https://x.example/ --data-urlencode '=a b'");
      expect(lastRequest?.url).toBe("https://x.example/?=a%20b");

      await env.exec("curl -G https://x.example/ --data-urlencode 'a b'");
      expect(lastRequest?.url).toBe("https://x.example/?a%20b");
    });

    it("mixes -d and --data-urlencode in order", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://x.example"],
        },
      });
      await env.exec(
        "curl -G https://x.example/ -d 'a=1' --data-urlencode 'b=hello world' -d 'c=3'",
      );

      expect(lastRequest?.url).toBe(
        "https://x.example/?a=1&b=hello%20world&c=3",
      );
    });

    it("supports --data-urlencode=value form with -G", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://x.example"],
        },
      });
      await env.exec(
        "curl -G https://x.example/ --data-urlencode='q=hello world'",
      );

      expect(lastRequest?.url).toBe("https://x.example/?q=hello%20world");
    });

    it("treats repeated -G as harmless", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://x.example"],
        },
      });
      await env.exec("curl -G -G https://x.example/ --data-urlencode 'q=1'");

      expect(lastRequest?.url).toBe("https://x.example/?q=1");
    });

    it("keeps headers working alongside -G", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://x.example"],
        },
      });
      await env.exec(
        "curl -G -H 'Accept: application/json' https://x.example/ --data-urlencode 'q=1'",
      );

      const headers = new Headers(lastRequest?.options.headers as HeadersInit);
      expect(lastRequest?.url).toBe("https://x.example/?q=1");
      expect(headers.get("Accept")).toBe("application/json");
    });

    it("uses RFC 3986 encoding for query values", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://x.example"],
        },
      });
      await env.exec(
        'curl -G https://x.example/ --data-urlencode "q=a b=&\'*/-_.~"',
      );

      expect(lastRequest?.url).toBe(
        "https://x.example/?q=a%20b%3D%26%27%2A%2F-_.~",
      );
    });
  });

  describe("--data-binary", () => {
    it("sends data as-is with --data-binary", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://api.example.com"],
          allowedMethods: ["POST"],
        },
      });
      await env.exec(
        'curl --data-binary "line1\\nline2" https://api.example.com/post',
      );

      expect(lastRequest?.options.body).toBe("line1\\nline2");
    });

    it("supports --data-binary=value format", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://api.example.com"],
          allowedMethods: ["POST"],
        },
      });
      await env.exec("curl --data-binary=rawdata https://api.example.com/post");

      expect(lastRequest?.options.body).toBe("rawdata");
    });
  });

  describe("-d/--data", () => {
    it("appends multiple data flags in order", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://api.example.com"],
          allowedMethods: ["POST"],
        },
      });
      await env.exec(
        "curl -d 'a=1' --data 'b=2' --data-raw 'c=3' https://api.example.com/post",
      );

      expect(lastRequest?.options.body).toBe("a=1&b=2&c=3");
    });
  });

  describe("-F/--form multipart", () => {
    it("sends multipart form data with -F", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://api.example.com"],
          allowedMethods: ["POST"],
        },
      });
      await env.exec("curl -F 'name=John' https://api.example.com/upload");

      const headers = new Headers(lastRequest?.options.headers as HeadersInit);
      expect(headers.get("Content-Type")).toMatch(
        /^multipart\/form-data; boundary=/,
      );
      expect(lastRequest?.options.body).toContain('name="name"');
      expect(lastRequest?.options.body).toContain("John");
    });

    it("sends multiple form fields", async () => {
      const env = new Bash({
        network: {
          allowedUrlPrefixes: ["https://api.example.com"],
          allowedMethods: ["POST"],
        },
      });
      await env.exec(
        "curl -F 'first=John' -F 'last=Doe' https://api.example.com/upload",
      );

      const body = lastRequest?.options.body as string;
      expect(body).toContain('name="first"');
      expect(body).toContain("John");
      expect(body).toContain('name="last"');
      expect(body).toContain("Doe");
    });

    it("uploads file content with @", async () => {
      const env = new Bash({
        files: { "/data.txt": "file contents here" },
        network: {
          allowedUrlPrefixes: ["https://api.example.com"],
          allowedMethods: ["POST"],
        },
      });
      await env.exec(
        "curl -F 'file=@/data.txt' https://api.example.com/upload",
      );

      const body = lastRequest?.options.body as string;
      expect(body).toContain('name="file"');
      expect(body).toContain('filename="data.txt"');
      expect(body).toContain("file contents here");
    });

    it("supports custom content type with ;type=", async () => {
      const env = new Bash({
        files: { "/doc.json": '{"key":"value"}' },
        network: {
          allowedUrlPrefixes: ["https://api.example.com"],
          allowedMethods: ["POST"],
        },
      });
      await env.exec(
        "curl -F 'data=@/doc.json;type=application/json' https://api.example.com/upload",
      );

      const body = lastRequest?.options.body as string;
      expect(body).toContain("Content-Type: application/json");
    });
  });
});
