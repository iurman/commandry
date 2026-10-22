// Bound transport parsing and SDK validation before application tools run.
export const mcpHttpOptions = {
  responseMode: "json" as const,
  maxRequestBodySize: 1024 * 1024,
};

export const mcpServerLimits = { maxToolInputElements: 10_000 };
