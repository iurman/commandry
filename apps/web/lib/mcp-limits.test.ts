import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
import { createKnowledgeMcpServer } from "./knowledge-mcp";
import { mcpHttpOptions, mcpServerLimits } from "./mcp-limits";

describe("MCP request resource limits", () => {
  it("rejects oversized bodies before constructing a server", async () => {
    const build = vi.fn(() => {
      throw new Error("Oversized requests must not create a server");
    });
    const handler = createMcpHandler(build, mcpHttpOptions);
    try {
      const response = await handler.fetch(
        new Request("http://127.0.0.1/mcp/knowledge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "x".repeat(mcpHttpOptions.maxRequestBodySize + 1),
        }),
      );
      expect(response.status).toBe(413);
      expect(build).not.toHaveBeenCalled();
    } finally {
      await handler.close();
    }
  });

  it("rejects excessive tool elements before dispatch and keeps normal reads working", async () => {
    const getBrief = vi.fn().mockResolvedValue({ name: "Scoped project" });
    const service = { getBrief } as unknown as Parameters<
      typeof createKnowledgeMcpServer
    >[0];
    const handler = createMcpHandler(
      () => createKnowledgeMcpServer(service, "test-token"),
      mcpHttpOptions,
    );
    const client = new Client({
      name: "resource-limit-test",
      version: "1.0.0",
    });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL("http://127.0.0.1/mcp/knowledge"),
          { fetch: (input, init) => handler.fetch(new Request(input, init)) },
        ),
      );
      const rejected = await client.callTool({
        name: "get_project_brief",
        arguments: {
          extra: Array.from(
            { length: mcpServerLimits.maxToolInputElements + 1 },
            () => 0,
          ),
        },
      });
      expect(rejected.isError).toBe(true);
      expect(getBrief).not.toHaveBeenCalled();
      const accepted = await client.callTool({
        name: "get_project_brief",
        arguments: {},
      });
      expect(accepted.isError).not.toBe(true);
      expect(accepted.structuredContent).toEqual({ name: "Scoped project" });
      expect(getBrief).toHaveBeenCalledOnce();
    } finally {
      await client.close();
      await handler.close();
    }
  });
});
