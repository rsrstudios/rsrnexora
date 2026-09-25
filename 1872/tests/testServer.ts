let testBaseUrl = "http://127.0.0.1:3000";

export async function startTestServer(): Promise<string> {
  testBaseUrl = "http://127.0.0.1:3000";
  // Verify server is responsive
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`${testBaseUrl}/api/health`);
      if (res.ok) {
        return testBaseUrl;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return testBaseUrl;
}

export async function stopTestServer(): Promise<void> {
  // Dev server continues running
}

export function getTestBaseUrl(): string {
  return testBaseUrl;
}
