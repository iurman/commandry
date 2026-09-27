import { createDomainPortfolioService } from "@commandry/application";
import { createDomainPortfolioRepository } from "@commandry/db";
import { DomainPortfolioError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getDomainPortfolioService() {
  return createDomainPortfolioService(
    createDomainPortfolioRepository(getDatabase().db),
  );
}

export function domainPortfolioFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof DomainPortfolioError) {
    const notFound =
      error.code === "DOMAIN_NOT_FOUND" || error.code === "PROJECT_NOT_FOUND";
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      notFound ? 404 : 409,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    {
      code: "DATABASE_UNAVAILABLE",
      message: "Domain portfolio is unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
