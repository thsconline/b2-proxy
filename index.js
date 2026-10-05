import { AwsClient } from "aws4fetch";

const UNSIGNABLE_HEADERS = [
    "x-forwarded-proto",
    "x-real-ip",
    "accept-encoding",
    "if-match",
    "if-modified-since",
    "if-none-match",
    "if-range",
    "if-unmodified-since"
];

const HTTPS_PROTOCOL = "https:";
const HTTPS_PORT = "443";
const RANGE_RETRY_ATTEMPTS = 3;

const ALLOWED_ORIGINS = new Set([
    "https://thsconline.github.io",
    "https://www.thsconline.net"
]);

const PDF_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400";
const COUNT_CACHE_CONTROL = "public, max-age=30, s-maxage=30";

function getCorsHeaders(request) {
    const origin = request.headers.get("Origin");
    const headers = new Headers();

    if (origin && ALLOWED_ORIGINS.has(origin)) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Vary", "Origin");
        headers.set(
            "Access-Control-Expose-Headers",
            "Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified"
        );
    }

    return headers;
}

function addCorsHeaders(response, request) {
    const headers = new Headers(response.headers);
    const corsHeaders = getCorsHeaders(request);

    for (const [name, value] of corsHeaders) {
        headers.set(name, value);
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

function addCacheControl(response, cacheControl) {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", cacheControl);

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

function filterHeaders(headers, env) {
    return new Headers(
        Array.from(headers.entries()).filter(([name]) =>
            !(
                UNSIGNABLE_HEADERS.includes(name) ||
                name.startsWith("cf-") ||
                ("ALLOWED_HEADERS" in env && !env.ALLOWED_HEADERS.includes(name))
            )
        )
    );
}

function createHeadResponse(response) {
    return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
    });
}

function createB2Url(env, filename) {
    const url = new URL(`https://${env.B2_ENDPOINT}/${encodeURIComponent(filename)}`);
    url.protocol = HTTPS_PROTOCOL;
    url.port = HTTPS_PORT;
    url.hostname = `${env.BUCKET_NAME}.${env.B2_ENDPOINT}`;
    return url;
}

async function getB2Object(request, env, filename) {
    const url = createB2Url(env, filename);
    const headers = filterHeaders(request.headers, env);

    const client = new AwsClient({
        accessKeyId: env.B2_APPLICATION_KEY_ID,
        secretAccessKey: env.B2_APPLICATION_KEY,
        service: "s3"
    });

    const originalMethod = request.method;

    const signedRequest = await client.sign(url.toString(), {
        method: "GET",
        headers
    });

    if (signedRequest.headers.has("range")) {
        let attempts = RANGE_RETRY_ATTEMPTS;
        let response;

        do {
            const controller = new AbortController();

            response = await fetch(signedRequest.url, {
                method: signedRequest.method,
                headers: signedRequest.headers,
                signal: controller.signal
            });

            if (response.headers.has("content-range") || !response.ok) {
                break;
            }

            attempts--;

            if (attempts > 0) {
                controller.abort();
            }
        } while (attempts > 0);

        if (originalMethod === "HEAD") {
            return createHeadResponse(response);
        }

        return response;
    }

    const response = await fetch(signedRequest);

    if (originalMethod === "HEAD") {
        return createHeadResponse(response);
    }

    return response;
}

async function countFragments(env, prefix) {
    const url = new URL(`https://${env.B2_ENDPOINT}/`);
    url.protocol = HTTPS_PROTOCOL;
    url.port = HTTPS_PORT;
    url.hostname = `${env.BUCKET_NAME}.${env.B2_ENDPOINT}`;

    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", prefix);

    const client = new AwsClient({
        accessKeyId: env.B2_APPLICATION_KEY_ID,
        secretAccessKey: env.B2_APPLICATION_KEY,
        service: "s3"
    });

    const signedRequest = await client.sign(url.toString(), {
        method: "GET"
    });

    const response = await fetch(signedRequest);

    if (!response.ok) {
        return response;
    }

    const xml = await response.text();

    const keys = [...xml.matchAll(/<Key>(.*?)<\/Key>/g)]
        .map(match => match[1]);

    const fragments = keys
        .map(key => {
            const match = key.match(
                new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`)
            );
            return match ? Number(match[1]) : null;
        })
        .filter(value => value !== null);

    const count = fragments.length ? Math.max(...fragments) + 1 : 0;

    return new Response(
        JSON.stringify({ fragmentCount: count }),
        {
            status: 200,
            headers: {
                "Content-Type": "application/json; charset=utf-8"
            }
        }
    );
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get("Origin");

        if (request.method === "OPTIONS") {
            if (!origin || !ALLOWED_ORIGINS.has(origin)) {
                return new Response(null, { status: 403 });
            }

            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
                    "Access-Control-Allow-Headers": "Range, Content-Type",
                    "Access-Control-Max-Age": "86400",
                    "Access-Control-Expose-Headers":
                        "Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified",
                    "Vary": "Origin"
                }
            });
        }

        if (request.method !== "GET" && request.method !== "HEAD") {
            return addCorsHeaders(
                new Response(null, {
                    status: 405,
                    headers: {
                        Allow: "GET, HEAD, OPTIONS"
                    }
                }),
                request
            );
        }

        if (origin && !ALLOWED_ORIGINS.has(origin)) {
            return new Response(null, { status: 403 });
        }

        const url = new URL(request.url);
        const filename = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

        if (!filename || filename.includes("..") || filename.includes("/")) {
            return addCorsHeaders(
                new Response(null, { status: 400 }),
                request
            );
        }

        if (filename.endsWith(".count")) {
            if (request.method === "HEAD") {
                const response = new Response(null, {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json; charset=utf-8"
                    }
                });

                return addCorsHeaders(
                    addCacheControl(response, COUNT_CACHE_CONTROL),
                    request
                );
            }

            const prefix = filename.slice(0, -".count".length) + ".";
            const response = await countFragments(env, prefix);

            if (!response.ok) {
                return addCorsHeaders(response, request);
            }

            return addCorsHeaders(
                addCacheControl(response, COUNT_CACHE_CONTROL),
                request
            );
        }

        const response = await getB2Object(request, env, filename);

        if (!response.ok) {
            return addCorsHeaders(response, request);
        }

        return addCorsHeaders(
            addCacheControl(response, PDF_CACHE_CONTROL),
            request
        );
    }
};
