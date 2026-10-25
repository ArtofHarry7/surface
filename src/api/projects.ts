export interface PlanningProject {
  id: string;
  name: string;
}

const API_STORAGE_KEY = "routewise.apiBase";
const DEFAULT_API_BASE = import.meta.env.DEV ? "" : import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

export async function createProject(name: string): Promise<PlanningProject> {
  const apiBase = (localStorage.getItem(API_STORAGE_KEY) || DEFAULT_API_BASE).replace(/\/+$/, "");
  let response: Response;

  try {
    response = await fetch(`${apiBase}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
  } catch {
    throw new Error(`Could not reach the Planning API at ${apiBase}. Check that the backend is running and the API URL is correct.`);
  }

  const contentType = response.headers.get("content-type") || "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const errorMessage = typeof payload === "object" && payload !== null
      ? ("error" in payload && typeof payload.error === "string"
        ? payload.error
        : "message" in payload && typeof payload.message === "string"
          ? payload.message
          : `Request failed (${response.status}).`)
      : typeof payload === "string" && payload.length > 0
        ? payload
        : `Request failed (${response.status}).`;
    throw new Error(errorMessage);
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("id" in payload) ||
    typeof payload.id !== "string" ||
    !("name" in payload) ||
    typeof payload.name !== "string"
  ) {
    throw new Error("The Planning API returned an invalid project response.");
  }

  return { id: payload.id, name: payload.name };
}
