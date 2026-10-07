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

// Browser cache: 1 hour
// Cloudflare edge cache: 24 hours
const PDF_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400";
const COUNT_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400";

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
                ("ALLOWED_HEADERS" in env &&
                    !env.ALLOWED_HEADERS.includes(name))
            )
        )
    );
}

function createB2Url(env, filename) {
    const url = new URL(
        `https://${env.B2_ENDPOINT}/${encodeURIComponent(filename)}`
    );

    url.protocol = HTTPS_PROTOCOL;
    url.port = HTTPS_PORT;
    url.hostname = `${env.BUCKET_NAME}.${env.B2_ENDPOINT}`;

    return url;
}

/**
 * Fetch an actual file from Backblaze B2.
 *
 * IMPORTANT:
 * - Only GET requests reach B2.
 * - HEAD requests are handled locally.
 * - No bucket listing.
 * - No metadata request.
 * - Range requests are passed directly to B2.
 */
async function getB2Object(request, env, filename) {
    /*
     * Never make a HEAD request to Backblaze.
     *
     * We don't need to inspect the object because the client
     * should only use GET to download actual files.
     */
    if (request.method === "HEAD") {
        return new Response(null, {
            status: 200,
            headers: {
                "Content-Type": "application/octet-stream",
                "Accept-Ranges": "bytes",
                "Cache-Control": PDF_CACHE_CONTROL
            }
        });
    }

    const url = createB2Url(env, filename);

    /*
     * Preserve useful request headers such as Range,
     * while removing Cloudflare/proxy headers that should
     * not be signed and forwarded to B2.
     */
    const headers = filterHeaders(request.headers, env);

    const client = new AwsClient({
        accessKeyId: env.B2_APPLICATION_KEY_ID,
        secretAccessKey: env.B2_APPLICATION_KEY,
        service: "s3"
    });

    const signedRequest = await client.sign(url.toString(), {
        method: "GET",
        headers
    });

    /*
     * Actual file download.
     *
     * This is the only request made to Backblaze.
     */
    let attempts = RANGE_RETRY_ATTEMPTS;
    let response;

    do {
        response = await fetch(signedRequest);

        /*
         * For Range requests, make sure B2 actually returned
         * a partial response.
         *
         * If it did not, retry up to RANGE_RETRY_ATTEMPTS.
         */
        if (
            !signedRequest.headers.has("range") ||
            response.headers.has("content-range") ||
            !response.ok
        ) {
            break;
        }

        attempts--;
    } while (attempts > 0);

    return response;
}

/**
 * Get fragment count from Cloudflare KV.
 *
 * KV example:
 *
 * Key:
 *   5348-james-ruse-2026
 *
 * Value:
 *   3
 *
 * Request:
 *   /5348-james-ruse-2026.count
 *
 * Response:
 *   {"fragmentCount":3}
 */
async function getFragmentCountFromKV(env, filename) {
    const key = filename.slice(0, -".count".length);

    /*
     * `thsconline` is the KV binding name.
     */
    const value = await env.thsconline.get(key);

    /*
     * Missing KV key.
     *
     * Return zero rather than querying Backblaze.
     */
    if (value === null) {
        return new Response(
            JSON.stringify({
                fragmentCount: 0
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json; charset=utf-8"
                }
            }
        );
    }

    const count = Number(value);

    /*
     * Protect against malformed KV values.
     */
    if (!Number.isInteger(count) || count < 0) {
        return new Response(
            JSON.stringify({
                error: "Invalid fragment count in KV"
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json; charset=utf-8"
                }
            }
        );
    }

    return new Response(
        JSON.stringify({
            fragmentCount: count
        }),
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

        /*
         * CORS preflight.
         */
        if (request.method === "OPTIONS") {
            if (!origin || !ALLOWED_ORIGINS.has(origin)) {
                return new Response(null, {
                    status: 403
                });
            }

            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Methods":
                        "GET, HEAD, OPTIONS",
                    "Access-Control-Allow-Headers":
                        "Range, Content-Type",
                    "Access-Control-Max-Age": "86400",
                    "Access-Control-Expose-Headers":
                        "Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified",
                    "Vary": "Origin"
                }
            });
        }

        /*
         * Only GET and HEAD are allowed.
         */
        if (
            request.method !== "GET" &&
            request.method !== "HEAD"
        ) {
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

        /*
         * Reject unknown origins.
         */
        if (origin && !ALLOWED_ORIGINS.has(origin)) {
            return new Response(null, {
                status: 403
            });
        }

        const url = new URL(request.url);

        /*
         * Convert:
         *
         * /5348-james-ruse-2026.0
         *
         * into:
         *
         * 5348-james-ruse-2026.0
         */
        const filename = decodeURIComponent(
            url.pathname.replace(/^\/+/, "")
        );

        /*
         * Prevent path traversal.
         */
        if (
            !filename ||
            filename.includes("..") ||
            filename.includes("/")
        ) {
            return addCorsHeaders(
                new Response(null, {
                    status: 400
                }),
                request
            );
        }

        /*
         * ============================================================
         * FRAGMENT COUNT
         * ============================================================
         *
         * .count requests NEVER contact Backblaze.
         *
         * They are served exclusively from KV.
         */
        if (filename.endsWith(".count")) {
            /*
             * HEAD is handled locally.
             * No KV request and no B2 request.
             */
            if (request.method === "HEAD") {
                const response = new Response(null, {
                    status: 200,
                    headers: {
                        "Content-Type":
                            "application/json; charset=utf-8"
                    }
                });

                return addCorsHeaders(
                    addCacheControl(
                        response,
                        COUNT_CACHE_CONTROL
                    ),
                    request
                );
            }

            /*
             * GET → KV only.
             */
            const response =
                await getFragmentCountFromKV(
                    env,
                    filename
                );

            return addCorsHeaders(
                addCacheControl(
                    response,
                    COUNT_CACHE_CONTROL
                ),
                request
            );
        }

        /*
         * ============================================================
         * ACTUAL FILE
         * ============================================================
         *
         * Only actual file requests reach B2.
         *
         * GET  → B2 GET
         * HEAD → handled locally
         */
        const response = await getB2Object(
            request,
            env,
            filename
        );

        if (!response.ok) {
            return addCorsHeaders(
                response,
                request
            );
        }

        return addCorsHeaders(
            addCacheControl(
                response,
                PDF_CACHE_CONTROL
            ),
            request
        );
    }
};
