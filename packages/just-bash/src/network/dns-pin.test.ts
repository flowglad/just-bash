import dns from "node:dns";
import { describe, expect, it } from "vitest";
import { _createPinnedLookup, createPinnedConnectionOwner } from "./dns-pin.js";

function lookup(
  pin: { hostname: string; address: string; family: 4 | 6 },
  hostname: string,
  options: { family?: number; all?: boolean } = {},
): Promise<{
  address?: string | { address: string; family: number }[];
  family?: number;
}> {
  return new Promise((resolve, reject) => {
<<<<<<< HEAD
    dns.lookup(hostname, { all: true, ...options }, (err, addresses) => {
      if (err) reject(err);
      else resolve(addresses as { address: string; family: number }[]);
    });
  });
}

function lookupSingle(
  hostname: string,
  options: dns.LookupOptions = {},
): Promise<{ address: string; family: number }> {
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, { ...options, all: false }, (err, address, family) => {
      if (err) reject(err);
      else resolve({ address: address as string, family });
=======
    _createPinnedLookup(pin)(hostname, options, (error, address, family) => {
      if (error) reject(error);
      else resolve({ address, family });
>>>>>>> @just-bash/executor@3.0.0
    });
  });
}

<<<<<<< HEAD
describe("dns-pin", () => {
  it("returns the pinned address inside the pinning context (all=true)", async () => {
    const result = await pinDns(
      {
        hostname: "rebind.example",
        addresses: [{ address: "1.2.3.4", family: 4 }],
      },
      () => lookupCb("rebind.example"),
    );
    expect(result).toEqual([{ address: "1.2.3.4", family: 4 }]);
  });

  it("returns the pinned address inside the pinning context (callback form)", async () => {
    const result = await pinDns(
      {
        hostname: "rebind.example",
        addresses: [{ address: "1.2.3.4", family: 4 }],
      },
      () => lookupSingle("rebind.example"),
    );
    expect(result).toEqual({ address: "1.2.3.4", family: 4 });
  });

  it("ignores hostname mismatch — falls through to original dns.lookup", async () => {
    // Inside the pinning context for "evil.example" we look up "localhost".
    // The pinning entry must NOT apply, and the original dns.lookup runs.
    const result = await pinDns(
      {
        hostname: "evil.example",
        addresses: [{ address: "1.2.3.4", family: 4 }],
      },
      () => lookupCb("localhost"),
    );
    // localhost resolves to loopback (127.0.0.1 or ::1)
    const hasLoopback = result.some(
      ({ address }) => address === "127.0.0.1" || address === "::1",
    );
    expect(hasLoopback).toBe(true);
    // And NOT the pinned address
    const hasPinned = result.some(({ address }) => address === "1.2.3.4");
    expect(hasPinned).toBe(false);
  });

  it("hostname match is case-insensitive", async () => {
    const result = await pinDns(
      {
        hostname: "Mixed.Case.Example",
        addresses: [{ address: "1.2.3.4", family: 4 }],
      },
      () => lookupCb("mixed.case.example"),
    );
    expect(result).toEqual([{ address: "1.2.3.4", family: 4 }]);
  });

  it("outside pinning context, dns.lookup behaves normally", async () => {
    _ensureDnsHookInstalled();
    // No pinning context — should hit real DNS for "localhost".
    const result = await lookupCb("localhost");
    const hasLoopback = result.some(
      ({ address }) => address === "127.0.0.1" || address === "::1",
    );
    expect(hasLoopback).toBe(true);
  });

  it("family mismatch fails closed with ENOTFOUND when only one family pinned", async () => {
    // Pinned address is family=4 only, but caller asks for family=6 — the
    // fix returns ENOTFOUND rather than silently substituting an IPv4.
    await expect(
      pinDns(
        {
          hostname: "rebind.example",
          addresses: [{ address: "1.2.3.4", family: 4 }],
        },
        () =>
          new Promise<void>((resolve, reject) => {
            dns.lookup(
              "rebind.example",
              { family: 6 },
              (err: NodeJS.ErrnoException | null) => {
                if (err) reject(err);
                else resolve();
              },
            );
          }),
=======
describe("request-owned DNS connector lookup", () => {
  it("returns only the reviewed address", async () => {
    await expect(
      lookup(
        { hostname: "API.Example", address: "93.184.216.34", family: 4 },
        "api.example",
>>>>>>> @just-bash/executor@3.0.0
      ),
    ).resolves.toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("supports all=true without adding alternate addresses", async () => {
    await expect(
      lookup(
        { hostname: "api.example", address: "2001:4860:4860::8888", family: 6 },
        "api.example",
        { all: true },
      ),
    ).resolves.toEqual({
      address: [{ address: "2001:4860:4860::8888", family: 6 }],
      family: undefined,
    });
  });

  it("fails closed for another hostname or address family", async () => {
    const pin = {
      hostname: "api.example",
      address: "1.1.1.1",
      family: 4,
    } as const;
    await expect(lookup(pin, "other.example")).rejects.toMatchObject({
      code: "ENOTFOUND",
    });
    await expect(
      lookup(pin, "api.example", { family: 6 }),
    ).rejects.toMatchObject({ code: "ENOTFOUND" });
  });

<<<<<<< HEAD
  it("dual-stack pin: caller asking for IPv4 gets the IPv4 address", async () => {
    // Both families pinned at preflight. Caller asks specifically for IPv4
    // (undici under fetch may do this when one family is unreachable on the
    // host). The patched lookup must filter the pinned set, not return ENOTFOUND.
    // The IPv6 address appears first to mimic an IPv6-first dual-stack order.
    const result = await pinDns(
      {
        hostname: "dualstack.example",
        addresses: [
          { address: "2001:db8::1", family: 6 },
          { address: "93.184.216.34", family: 4 },
        ],
      },
      () => lookupSingle("dualstack.example", { family: 4 }),
    );
    expect(result).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("dual-stack pin: caller asking for IPv6 gets the IPv6 address", async () => {
    const result = await pinDns(
      {
        hostname: "dualstack.example",
        addresses: [
          { address: "2001:db8::1", family: 6 },
          { address: "93.184.216.34", family: 4 },
        ],
      },
      () => lookupSingle("dualstack.example", { family: 6 }),
    );
    expect(result).toEqual({ address: "2001:db8::1", family: 6 });
  });

  it("dual-stack pin: all=true returns every pinned address regardless of order", async () => {
    const result = await pinDns(
      {
        hostname: "dualstack.example",
        addresses: [
          { address: "2001:db8::1", family: 6 },
          { address: "93.184.216.34", family: 4 },
        ],
      },
      () => lookupCb("dualstack.example"),
    );
    expect(result).toEqual([
      { address: "2001:db8::1", family: 6 },
      { address: "93.184.216.34", family: 4 },
    ]);
  });

  it("dual-stack pin: all=true with explicit family filters", async () => {
    const result = await pinDns(
      {
        hostname: "dualstack.example",
        addresses: [
          { address: "2001:db8::1", family: 6 },
          { address: "93.184.216.34", family: 4 },
        ],
      },
      () => lookupCb("dualstack.example", { family: 4 }),
    );
    expect(result).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it("concurrent pin contexts do not leak between async chains", async () => {
    // Two simultaneous pinDns() calls with different addresses for the
    // same hostname must each see their own pinned value.
    const [a, b] = await Promise.all([
      pinDns(
        {
          hostname: "x.example",
          addresses: [{ address: "1.1.1.1", family: 4 }],
        },
        () => lookupCb("x.example"),
      ),
      pinDns(
        {
          hostname: "x.example",
          addresses: [{ address: "2.2.2.2", family: 4 }],
        },
        () => lookupCb("x.example"),
=======
  it("keeps concurrent decisions independent", async () => {
    const [first, second] = await Promise.all([
      lookup(
        { hostname: "same.example", address: "1.1.1.1", family: 4 },
        "same.example",
      ),
      lookup(
        { hostname: "same.example", address: "8.8.8.8", family: 4 },
        "same.example",
>>>>>>> @just-bash/executor@3.0.0
      ),
    ]);
    expect([first, second]).toEqual([
      { address: "1.1.1.1", family: 4 },
      { address: "8.8.8.8", family: 4 },
    ]);
  });

  it("creates independent pools without patching process-global DNS", async () => {
    const originalLookup = dns.lookup;
    const pin = {
      hostname: "pool.example",
      address: "93.184.216.34",
      family: 4 as const,
    };
    const [first, second] = await Promise.all([
      createPinnedConnectionOwner(pin),
      createPinnedConnectionOwner(pin),
    ]);
    try {
      expect(first).not.toBe(second);
      expect(dns.lookup).toBe(originalLookup);
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });
});
