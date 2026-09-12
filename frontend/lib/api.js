// Client for the FastAPI backend.
//
// Paths are relative ("/api/..."), which Next rewrites to FastAPI (see next.config.mjs).
// Relative URLs only resolve in the browser, so call these from Client Components
// ("use client"). In Server Components, fetch `${process.env.BACKEND_URL}/api/...` directly.

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, options);

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : res;

  if (!res.ok) {
    // FastAPI puts error messages in `detail`
    const detail = isJson ? body.detail : res.statusText;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return body;
}

export function apiGet(path) {
  return request(path);
}

export function apiPost(path, data) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// `field` must match the FastAPI parameter name (e.g. `file: UploadFile`).
export function apiUpload(path, file, field = "file") {
  const form = new FormData();
  form.append(field, file);
  // Don't set Content-Type — the browser adds the multipart boundary itself.
  return request(path, { method: "POST", body: form });
}
