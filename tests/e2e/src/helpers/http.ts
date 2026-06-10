const baseUrl = process.env.E2E_API_BASE_URL ?? "http://localhost:4121"

export type HttpResponse = {
  status: number
  headers: Headers
  json: unknown | null
  text: string
}

export async function httpRequest(input: {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path: string
  token?: string
  body?: unknown
  formData?: FormData
  redirect?: RequestRedirect
}): Promise<HttpResponse> {
  const headers: Record<string, string> = {
    accept: "application/json",
  }
  if (input.token) headers.authorization = `Bearer ${input.token}`
  if (input.body !== undefined && input.formData === undefined) headers["content-type"] = "application/json"

  const init: RequestInit = {
    method: input.method,
    headers,
  }
  if (input.redirect) init.redirect = input.redirect
  if (input.formData !== undefined) {
    init.body = input.formData
  } else if (input.body !== undefined) {
    init.body = JSON.stringify(input.body)
  }

  const res = await fetch(`${baseUrl}${input.path}`, init)

  const text = await res.text()
  let json: unknown | null = null
  try {
    json = text.length ? JSON.parse(text) : null
  } catch {
    json = null
  }

  return { status: res.status, headers: res.headers, json, text }
}
