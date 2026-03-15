export function textContent(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function errorContent(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
}
