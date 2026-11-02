export const minimumChromiumVersion: string;
export function assertChromiumVersion(output: string): string;
export function browserEndpoint(): string | undefined;
export function browserNetwork(): string;
export function chromiumLaunchOptions(
  chromium: { executablePath(): string },
  options?: Record<string, unknown>,
): { executablePath: string; chromiumSandbox: true };
export function chromiumTestOptions(
  chromium: { executablePath(): string },
  options?: Record<string, unknown>,
): {
  connectOptions?: { wsEndpoint: string; exposeNetwork: string };
  launchOptions?: { executablePath: string; chromiumSandbox: true };
};
export function launchChromium<
  T extends { version(): string; close(): Promise<void> },
>(
  chromium: {
    executablePath(): string;
    launch(options?: never): Promise<T>;
    connect(endpoint: string, options: { exposeNetwork: string }): Promise<T>;
  },
  options?: Record<string, unknown>,
): Promise<T>;
