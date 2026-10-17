/** The limit bounds transport input, never the authorized inventory population. */
export class ObservatoryBodyTooLarge extends Error {
  constructor() {
    super("Observatory input exceeds the transport limit");
  }
}
export async function readObservatoryJson(
  request: Request,
  maximum = 262144,
): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > maximum) {
    await request.body?.cancel();
    throw new ObservatoryBodyTooLarge();
  }
  if (!request.body) throw new SyntaxError("JSON body required");
  const reader = request.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0,
    text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximum) {
        await reader.cancel();
        throw new ObservatoryBodyTooLarge();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof ObservatoryBodyTooLarge) throw error;
    throw new SyntaxError("Invalid JSON body");
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(text);
}
