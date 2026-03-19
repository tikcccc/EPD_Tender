import { NextResponse } from "next/server";

const FALLBACK_API_BASE = "http://localhost:8000";

function getBackendApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!configured) {
    return FALLBACK_API_BASE;
  }
  return configured.replace(/\/$/, "");
}

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; documentId: string }> },
) {
  const { projectId, documentId } = await context.params;
  const backendUrl = `${getBackendApiBaseUrl()}/api/v1/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/file`;
  const range = request.headers.get("range");

  const upstreamResponse = await fetch(backendUrl, {
    cache: "no-store",
    headers: range ? { Range: range } : undefined,
  });

  if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
    const errorPayload = await upstreamResponse.arrayBuffer();
    return new Response(errorPayload, {
      status: upstreamResponse.status,
      headers: {
        "content-type": upstreamResponse.headers.get("content-type") ?? "application/json",
      },
    });
  }

  const responseHeaders = new Headers();
  const passThroughHeaders = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "content-disposition",
    "cache-control",
    "etag",
    "last-modified",
  ];

  passThroughHeaders.forEach((name) => {
    const value = upstreamResponse.headers.get(name);
    if (value) {
      responseHeaders.set(name, value);
    }
  });
  responseHeaders.set("x-document-proxy", "nextjs");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export function OPTIONS() {
  return NextResponse.json({}, { status: 204 });
}
