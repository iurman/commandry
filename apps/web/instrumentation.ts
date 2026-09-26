import { loadRuntimeConfig } from "@commandry/config";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    loadRuntimeConfig();
  }
}
