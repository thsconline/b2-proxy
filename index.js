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
		JSON.stringify({
			fragmentCount: count
		}),
		{
			status: 200,
			headers: {
				"Content-Type": "application/json"
			}
		}
	);
}

export default {
    async fetch(request, env) {
        if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response(null, {
                status: 405,
                headers: {
                    Allow: "GET, HEAD"
                }
            });
        }

        const url = new URL(request.url);
        const filename = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

        if (!filename || filename.includes("..") || filename.includes("/")) {
            return new Response(null, { status: 400 });
        }

        if (filename.endsWith(".count")) {
            if (request.method === "HEAD") {
                return new Response(null, {
                    status: 200,
                    headers: {
                        "Content-Type": "application/octet-stream"
                    }
                });
            }

            const prefix = filename.slice(0, -".count".length) + ".";
            return countFragments(env, prefix);
        }

        return getB2Object(request, env, filename);
    }
};
