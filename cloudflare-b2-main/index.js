import { AwsClient } from 'aws4fetch'

const UNSIGNABLE_HEADERS = [
    'x-forwarded-proto',
    'x-real-ip',
    'accept-encoding',
    'if-match',
    'if-modified-since',
    'if-none-match',
    'if-range',
    'if-unmodified-since',
]

const HTTPS_PROTOCOL = 'https:'
const HTTPS_PORT = '443'
const RANGE_RETRY_ATTEMPTS = 3
const CACHE_TTL = 31536000

function createHeadResponse(response) {
    return new Response(null, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText
    })
}

function filterHeaders(headers, env) {
    return new Headers(
        Array.from(headers.entries()).filter(pair => !(
            UNSIGNABLE_HEADERS.includes(pair[0])
            || pair[0].startsWith('cf-')
            || ('ALLOWED_HEADERS' in env && !env['ALLOWED_HEADERS'].includes(pair[0]))
        ))
    )
}

function normalizeTitle(titlex) {
    return titlex
        .toLowerCase()
        .replace(/w\.\s*sol/gi, '')
        .replace(/\s+/g, '')
}

function validateViewNo(viewno) {
    return /^\d{4}$/.test(viewno)
}

function validateFragment(fragment) {
    return /^\d+$/.test(fragment)
}

function makeFragmentFilename(viewno, titlex, fragment) {
    return `${viewno}-${normalizeTitle(titlex)}.${fragment}`
}

function makeFragmentPrefix(viewno, titlex) {
    return `${viewno}-${normalizeTitle(titlex)}.`
}

function createB2Client(env) {
    return new AwsClient({
        accessKeyId: env['B2_APPLICATION_KEY_ID'],
        secretAccessKey: env['B2_APPLICATION_KEY'],
        service: 's3',
    })
}

function createB2ObjectUrl(env, objectPath) {
    const url = new URL(`https://${env['BUCKET_NAME']}.${env['B2_ENDPOINT']}`)
    url.protocol = HTTPS_PROTOCOL
    url.port = HTTPS_PORT
    url.pathname = '/' + objectPath.replace(/^\/+/, '')
    return url
}

function createB2ListUrl(env, prefix, continuationToken = null) {
    const url = new URL(`https://${env['BUCKET_NAME']}.${env['B2_ENDPOINT']}`)
    url.protocol = HTTPS_PROTOCOL
    url.port = HTTPS_PORT
    url.pathname = '/'
    url.searchParams.set('list-type', '2')
    url.searchParams.set('prefix', prefix)

    if (continuationToken) {
        url.searchParams.set('continuation-token', continuationToken)
    }

    return url
}

function decodeXmlEntities(value) {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
}

async function countFragments(env, client, viewno, titlex) {
    const prefix = makeFragmentPrefix(viewno, titlex)
    let count = 0
    let continuationToken = null

    do {
        const url = createB2ListUrl(env, prefix, continuationToken)
        const signedRequest = await client.sign(url.toString(), {
            method: 'GET',
        })
        const response = await fetch(signedRequest)

        if (!response.ok) {
            console.error(`B2 ListObjectsV2 failed: ${response.status}`)
            throw new Error('Unable to query Backblaze B2')
        }

        const xml = await response.text()
        const keyMatches = [...xml.matchAll(/<Key>(.*?)<\/Key>/g)]

        for (const match of keyMatches) {
            const key = decodeXmlEntities(match[1])
            const fragmentSuffix = key.slice(prefix.length)

            if (/^\d+$/.test(fragmentSuffix)) {
                count++
            }
        }

        const tokenMatch = xml.match(
            /<NextContinuationToken>(.*?)<\/NextContinuationToken>/
        )

        continuationToken = tokenMatch
            ? decodeXmlEntities(tokenMatch[1])
            : null
    } while (continuationToken)

    return count
}

function getFileName(viewno, titlex) {
    let fieldname

    switch (viewno) {
        case "1076":
            fieldname = titlex + " Agriculture HY.pdf"
            fieldname = fieldname.replace("w. sol Agriculture HY", "Agriculture HY & Solutions")
            break

        case "1078":
            fieldname = titlex + " Agriculture Trials.pdf"
            fieldname = fieldname.replace("w. sol Agriculture Trials", "Agriculture Trials & Solutions")
            break

        case "1178":
            fieldname = titlex + " Ancient History Trials.pdf"
            fieldname = fieldname.replace("w. sol Ancient History Trials", "Ancient History Trials & Solutions")
            break

        case "1366":
            fieldname = titlex + " Biology Prelim HY.pdf"
            fieldname = fieldname.replace("w. sol Biology Prelim HY", "Biology Prelim HY & Solutions")
            break

        case "1368":
            fieldname = titlex + " Biology Prelim Yearly.pdf"
            fieldname = fieldname.replace("w. sol Biology Prelim Yearly", "Biology Prelim Yearly & Solutions")
            break

        case "1376":
            fieldname = titlex + " Biology HY.pdf"
            fieldname = fieldname.replace("w. sol Biology HY", "Biology HY & Solutions")
            break

        case "1378":
            fieldname = titlex + " Biology Trials.pdf"
            fieldname = fieldname.replace("w. sol Biology Trials", "Biology Trials & Solutions")
            break

        case "1568":
            fieldname = titlex + " Business Studies Prelim Yearly.pdf"
            fieldname = fieldname.replace("w. sol Business Studies Prelim Yearly", "Business Studies Prelim Yearly & Solutions")
            break

        case "1576":
            fieldname = titlex + " Business Studies HY.pdf"
            fieldname = fieldname.replace("w. sol Business Studies HY", "Business Studies HY & Solutions")
            break

        case "1578":
            fieldname = titlex + " Business Studies Trials.pdf"
            fieldname = fieldname.replace("w. sol Business Studies Trials", "Business Studies Trials & Solutions")
            break

        case "1816":
            fieldname = titlex + " Chemistry Prelim HY.pdf"
            fieldname = fieldname.replace("w. sol Chemistry Prelim HY", "Chemistry Prelim HY & Solutions")
            break

        case "1818":
            fieldname = titlex + " Chemistry Prelim Yearly.pdf"
            fieldname = fieldname.replace("w. sol Chemistry Prelim Yearly", "Chemistry Prelim Yearly & Solutions")
            break

        case "1821":
            fieldname = titlex + " Chemistry CT1.pdf"
            fieldname = fieldname.replace("w. sol Chemistry CT1", "Chemistry CT1 & Solutions")
            break

        case "1823":
            fieldname = titlex + " Chemistry CT3.pdf"
            fieldname = fieldname.replace("w. sol Chemistry CT3", "Chemistry CT3 & Solutions")
            break

        case "1826":
            fieldname = titlex + " Chemistry HY.pdf"
            fieldname = fieldname.replace("w. sol Chemistry HY", "Chemistry HY & Solutions")
            break

        case "1828":
            fieldname = titlex + " Chemistry Trials.pdf"
            fieldname = fieldname.replace("w. sol Chemistry Trials", "Chemistry Trials & Solutions")
            break

        case "2418":
            fieldname = titlex + " Earth & Environmental Science Prelim Yearly.pdf"
            fieldname = fieldname.replace("w. sol Earth & Environmental Science Prelim Yearly", "Earth & Environmental Science Prelim Yearly & Solutions")
            break

        case "2428":
            fieldname = titlex + " Earth & Environmental Science Trials.pdf"
            fieldname = fieldname.replace("w. sol Earth & Environmental Science Trials", "Earth & Environmental Science Trials & Solutions")
            break

        case "2466":
            fieldname = titlex + " Economics Prelim HY.pdf"
            fieldname = fieldname.replace("w. sol Economics Prelim HY", "Economics Prelim HY & Solutions")
            break

        case "2468":
            fieldname = titlex + " Economics Prelim Yearly.pdf"
            fieldname = fieldname.replace("w. sol Economics Prelim Yearly", "Economics Prelim Yearly & Solutions")
            break

        case "2476":
            fieldname = titlex + " Economics HY.pdf"
            fieldname = fieldname.replace("w. sol Economics HY", "Economics HY & Solutions")
            break

        case "2478":
            fieldname = titlex + " Economics Trials.pdf"
            fieldname = fieldname.replace("w. sol Economics Trials", "Economics Trials & Solutions")
            break

        case "2716":
            fieldname = titlex + " English HY.pdf"
            fieldname = fieldname.replace("w. sol English HY", "English HY & Solutions")
            fieldname = fieldname.replace("(AOS) English HY", "English HY (AOS)")
            break

        case "2718":
            fieldname = titlex + ".pdf"
            fieldname = fieldname.replace("P1 Practice Exam w. sol", "English Trial Paper 1 - Practice Paper & Solutions")
            fieldname = fieldname.replace("P1 Practice Exam", "English Trial Paper 1 - Practice Paper")
            fieldname = fieldname.replace("P1 w. sol", "English Trial Paper 1 & Solutions")
            fieldname = fieldname.replace("P1", "English Trial Paper 1")
            break

        case "2727":
            fieldname = titlex + ".pdf"
            fieldname = fieldname.replace("P2 (Adv.) Practice Exam w. sol", "English Trial Paper 2 Advanced - Practice Paper & Solutions")
            fieldname = fieldname.replace("P2 (Adv.) Practice Exam", "English Trial Paper 2 Advanced - Practice Paper")
            fieldname = fieldname.replace("P2 (Adv.) w. sol", "English Trial Paper 2 Advanced & Solutions")
            fieldname = fieldname.replace("P2 (Adv.)", "English Trial Paper 2 Advanced")
            fieldname = fieldname.replace("P2 (Std.) Practice Exam w. sol", "English Trial Paper 2 Standard - Practice Paper & Solutions")
            fieldname = fieldname.replace("P2 (Std.) Practice Exam", "English Trial Paper 2 Standard - Practice Paper")
            fieldname = fieldname.replace("P2 (Std.) w. sol", "English Trial Paper 2 Standard & Solutions")
            fieldname = fieldname.replace("P2 (Std.)", "English Trial Paper 2 Standard")
            fieldname = fieldname.replace("P2 Practice Exam w. sol", "English Trial Paper 2 Standard - Practice Paper & Solutions")
            fieldname = fieldname.replace("P2 Practice Exam", "English Trial Paper 2 Standard - Practice Paper")
            fieldname = fieldname.replace("P2 w. sol", "English Trial Paper 2 Standard & Solutions")
            fieldname = fieldname.replace("P2", "English Trial Paper 2 Standard")
            break

        case "2728":
            fieldname = titlex + ".pdf"
            fieldname = fieldname.replace("P2 (Adv.) Practice Exam w. sol", "English Trial Paper 2 Advanced - Practice Paper & Solutions")
            fieldname = fieldname.replace("P2 (Adv.) Practice Exam", "English Trial Paper 2 Advanced - Practice Paper")
            fieldname = fieldname.replace("P2 (Adv.) w. sol", "English Trial Paper 2 Advanced & Solutions")
            fieldname = fieldname.replace("P2 (Adv.)", "English Trial Paper 2 Advanced")
            fieldname = fieldname.replace("P2 (Std.) Practice Exam w. sol", "English Trial Paper 2 Standard - Practice Paper & Solutions")
            fieldname = fieldname.replace("P2 (Std.) Practice Exam", "English Trial Paper 2 Standard - Practice Paper")
            fieldname = fieldname.replace("P2 (Std.) w. sol", "English Trial Paper 2 Standard & Solutions")
            fieldname = fieldname.replace("P2 (Std.)", "English Trial Paper 2 Standard")
            fieldname = fieldname.replace("P2 Practice Exam w. sol", "English Trial Paper 2 Advanced - Practice Paper & Solutions")
            fieldname = fieldname.replace("P2 Practice Exam", "English Trial Paper 2 Advanced - Practice Paper")
            fieldname = fieldname.replace("P2 w. sol", "English Trial Paper 2 Advanced & Solutions")
            fieldname = fieldname.replace("P2", "English Trial Paper 2 Advanced")
            break

        case "2738":
            fieldname = titlex + " English Ext 1 Trials.pdf"
            fieldname = fieldname.replace("w. sol English Ext 1 Trials", "English Ext 1 Trials & Solutions")
            break

        case "2666":
            fieldname = titlex + " Engineering Studies Prelim HY.pdf"
            fieldname = fieldname.replace("w. sol Engineering Studies Prelim HY", "Engineering Studies Prelim HY & Solutions")
            break

        case "2668":
            fieldname = titlex + " Engineering Studies Prelim Yearly.pdf"
            fieldname = fieldname.replace("w. sol Engineering Studies Prelim Yearly", "Engineering Studies Prelim Yearly & Solutions")
            break

        case "2676":
            fieldname = titlex + " Engineering Studies HY.pdf"
            fieldname = fieldname.replace("w. sol Engineering Studies HY", "Engineering Studies HY & Solutions")
            break

        case "2678":
            fieldname = titlex + " Engineering Studies Trials.pdf"
            fieldname = fieldname.replace("w. sol Engineering Studies Trials", "Engineering Studies Trials & Solutions")
            break

        case "3638": {
            const titlexy = titlex.replace(" History Extension Trials", "")
            fieldname = titlexy + " History Extension Trials.pdf"
            fieldname = fieldname.replace("w. sol History Extension Trials", "History Extension Trials & Solutions")
            fieldname = fieldname.replace("Practice Paper 1 History Extension Trials", "Practice Paper 1")
            break
        }

        case "4078": {
            fieldname = titlex + " Investigating Science Trials.pdf"
            fieldname = fieldname.replace("w. sol Investigating Science Trials", "Investigating Science Trials & Solutions")
            const year = -(1 - titlex.replace(" w. sol", "").split(" ").pop()) + 1
            if (year < 2018) {
                fieldname = fieldname.replace("Investigating Science", "Senior Science")
            }
            break
        }

        case "4118":
            fieldname = titlex + " IPT Prelim Yearly.pdf"
            fieldname = fieldname.replace("w. sol IPT Prelim Yearly", "IPT Prelim Yearly & Solutions")
            break

        case "4126":
            fieldname = titlex + " IPT HY.pdf"
            fieldname = fieldname.replace("w. sol IPT HY", "IPT HY & Solutions")
            break

        case "4128":
            fieldname = titlex + " IPT Trials.pdf"
            fieldname = fieldname.replace("w. sol IPT Trials", "IPT Trials & Solutions")
            break

        case "4200": {
            let titlexy
            switch (titlex) {
                case "Character Grid for Asian Languages (A5 Size)":
                    titlexy = "A5 Character Grid"
                    break
                default:
                    titlexy = "Languages " + titlex
                    break
            }
            fieldname = titlexy + ".pdf"
            break
        }

        case "4600": {
            let titlexy
            switch (titlex) {
                case "Japanese Skills Booklet":
                    titlexy = "Japanese JTAN Skills Booklet"
                    break
                default:
                    titlexy = titlex
                    break
            }
            fieldname = titlexy + ".pdf"
            break
        }

        case "4626": {
            const titlexy = titlex.replace(" Japanese Continuers HY", "")
            fieldname = titlexy + " Japanese Continuers HY.pdf"
            fieldname = fieldname.replace("w. sol Japanese Continuers HY", "Japanese Continuers HY & Solutions")
            break
        }

        case "4627": {
            const titlexy = titlex.replace(" Japanese Beginners Trials", "")
            fieldname = titlexy + " Japanese Beginners Trials.pdf"
            fieldname = fieldname.replace("w. sol Japanese Beginners Trials", "Japanese Beginners Trials & Solutions")
            break
        }

        case "4628": {
            const titlexy = titlex.replace(" Japanese Continuers Trials", "")
            fieldname = titlexy + " Japanese Continuers Trials.pdf"
            fieldname = fieldname.replace("w. sol Japanese Continuers Trials", "Japanese Continuers Trials & Solutions")
            break
        }

        case "4643": {
            const titlexy = titlex.replace(" Latin Continuers Trials", "")
            fieldname = titlexy + " Latin Continuers Trials.pdf"
            fieldname = fieldname.replace("w. sol Latin Continuers Trials", "Latin Continuers Trials & Solutions")
            break
        }

        case "4644": {
            const titlexy = titlex.replace(" Latin Extension Trials", "")
            fieldname = titlexy + " Latin Extension Trials.pdf"
            fieldname = fieldname.replace("w. sol Latin Extension Trials", "Latin Extension Trials & Solutions")
            break
        }

        case "5018":
            fieldname = titlex + " Legal Studies Prelim Yearly.pdf"
            fieldname = fieldname.replace("w. sol Legal Studies Prelim Yearly", "Legal Studies Prelim Yearly & Solutions")
            break

        case "5028":
            fieldname = titlex + " Legal Studies Trials.pdf"
            fieldname = fieldname.replace("w. sol Legal Studies Trials", "Legal Studies Trials & Solutions")
            break

        case "5076":
            fieldname = titlex + " Year 7 Maths HY.pdf"
            fieldname = fieldname.replace("w. sol Year 7 Maths HY", "Year 7 Maths HY & Solutions")
            break

        case "5078":
            fieldname = titlex + " Year 7 Maths Yearly.pdf"
            fieldname = fieldname.replace("w. sol Year 7 Maths Yearly", "Year 7 Maths Yearly & Solutions")
            break

        case "5086":
            fieldname = titlex + " Year 8 Maths HY.pdf"
            fieldname = fieldname.replace("w. sol Year 8 Maths HY", "Year 8 Maths HY & Solutions")
            break

        case "5088":
            fieldname = titlex + " Year 8 Maths Yearly.pdf"
            fieldname = fieldname.replace("w. sol Year 8 Maths Yearly", "Year 8 Maths Yearly & Solutions")
            break

        case "5096":
            fieldname = titlex + " Year 9 Maths HY.pdf"
            fieldname = fieldname.replace("w. sol Year 9 Maths HY", "Year 9 Maths HY & Solutions")
            break

        case "5098":
            fieldname = titlex + " Year 9 Maths Yearly.pdf"
            fieldname = fieldname.replace("w. sol Year 9 Maths Yearly", "Year 9 Maths Yearly & Solutions")
            break

        case "5106":
            fieldname = titlex + " Year 10 Maths HY.pdf"
            fieldname = fieldname.replace("w. sol Year 10 Maths HY", "Year 10 Maths HY & Solutions")
            break

        case "5108":
            fieldname = titlex + " Year 10 Maths Yearly.pdf"
            fieldname = fieldname.replace("w. sol Year 10 Maths Yearly", "Year 10 Maths Yearly & Solutions")
            break

        case "5218": {
            fieldname = titlex + " General Maths Prelim Yearly.pdf"
            fieldname = fieldname.replace("w. sol General Maths Prelim Yearly", "General Maths Prelim Yearly & Solutions")
            const year = -(1 - titlex.replace(" w. sol", "").split(" ").pop()) + 1
            if (year >= 2018) {
                fieldname = fieldname.replace("General Maths", "Standard Maths")
            }
            break
        }

        case "5221":
            fieldname = titlex + " 2U PT1.pdf"
            fieldname = fieldname.replace("w. sol 2U PT1", "2U PT1 & Solutions")
            break

        case "5222":
            fieldname = titlex + " 2U PT2.pdf"
            fieldname = fieldname.replace("w. sol 2U PT2", "2U PT2 & Solutions")
            break

        case "5223":
            fieldname = titlex + " 2U PT3.pdf"
            fieldname = fieldname.replace("w. sol 2U PT3", "2U PT3 & Solutions")
            break

        case "5226":
            fieldname = titlex + " 2U Prelim HY.pdf"
            fieldname = fieldname.replace("w. sol 2U Prelim HY", "2U Prelim HY & Solutions")
            break

        case "5228":
            fieldname = titlex + " 2U Prelim Yearly.pdf"
            fieldname = fieldname.replace("w. sol 2U Prelim Yearly", "2U Prelim Yearly & Solutions")
            break

        case "5231":
            fieldname = titlex + " 3U PT1.pdf"
            fieldname = fieldname.replace("w. sol 3U PT1", "3U PT1 & Solutions")
            break

        case "5232":
            fieldname = titlex + " 3U PT2.pdf"
            fieldname = fieldname.replace("w. sol 3U PT2", "3U PT2 & Solutions")
            break

        case "5233":
            fieldname = titlex + " 3U PT3.pdf"
            fieldname = fieldname.replace("w. sol 3U PT3", "3U PT3 & Solutions")
            break

        case "5236":
            fieldname = titlex + " 3U Prelim HY.pdf"
            fieldname = fieldname.replace("w. sol 3U Prelim HY", "3U Prelim HY & Solutions")
            break

        case "5238":
            fieldname = titlex + " 3U Prelim Yearly.pdf"
            fieldname = fieldname.replace("w. sol 3U Prelim Yearly", "3U Prelim Yearly & Solutions")
            break

        case "5276":
            fieldname = titlex + " 2U Accelerated Prelim HY.pdf"
            fieldname = fieldname.replace("w. sol 2U Accelerated Prelim HY", "2U Accelerated Prelim HY & Solutions")
            break

        case "5278":
            fieldname = titlex + " 2U Accelerated Prelim Yearly.pdf"
            fieldname = fieldname.replace("w. sol 2U Accelerated Prelim Yearly", "2U Accelerated Prelim Yearly & Solutions")
            break

        case "5310": {
            const year = titlex.substring(0, 4)
            const root = titlex.substr(5).toLowerCase()
            if (year < 2019) {
                fieldname = "General Maths " + titlex + ".pdf"
            } else {
                fieldname = "Standard Maths " + titlex + ".pdf"
            }
            if (root === "solutions" || root === "solution") {
                if (year < 2005) {
                    fieldname = fieldname.replace("Solutions", "MANSW Solutions")
                }
            }
            break
        }

        case "5313": {
            fieldname = titlex + " General Maths CT3.pdf"
            fieldname = fieldname.replace("w. sol General Maths CT3", "General Maths CT3 & Solutions")
            const year = -(1 - titlex.replace(" w. sol", "").split(" ").pop()) + 1
            if (year >= 2019) {
                fieldname = fieldname.replace("General Maths", "Standard Maths")
            }
            break
        }

        case "5316": {
            fieldname = titlex + " General Maths HY.pdf"
            fieldname = fieldname.replace("w. sol General Maths HY", "General Maths HY & Solutions")
            const year = -(1 - titlex.replace(" w. sol", "").split(" ").pop()) + 1
            if (year >= 2019) {
                fieldname = fieldname.replace("General Maths", "Standard Maths")
            }
            break
        }

        case "5318": {
            fieldname = titlex + " General Maths Trials.pdf"
            fieldname = fieldname.replace("w. sol General Maths Trials", "General Maths Trials & Solutions")
            const year = -(1 - titlex.replace(" w. sol", "").split(" ").pop()) + 1
            if (year >= 2019) {
                fieldname = fieldname.replace("General Maths", "Standard Maths")
            }
            break
        }

        case "5320": {
            const year = titlex.substring(0, 4)
            const root = titlex.substr(5).toLowerCase()
            if (year < 2001) {
                fieldname = "Maths 2U " + titlex + ".pdf"
            } else {
                fieldname = "Maths " + titlex + ".pdf"
            }
            if (root === "solutions" || root === "solution") {
                if (year < 2005) {
                    fieldname = fieldname.replace("Solutions", "MANSW Solutions")
                }
            }
            break
        }

        case "5321":
            fieldname = titlex + " 2U CT1.pdf"
            fieldname = fieldname.replace("w. sol 2U CT1", "2U CT1 & Solutions")
            break

        case "5322":
            fieldname = titlex + " 2U CT2.pdf"
            fieldname = fieldname.replace("w. sol 2U CT2", "2U CT2 & Solutions")
            break

        case "5323":
            fieldname = titlex + " 2U CT3.pdf"
            fieldname = fieldname.replace("w. sol 2U CT3", "2U CT3 & Solutions")
            break

        case "5324":
            fieldname = titlex + " 2U CT4.pdf"
            fieldname = fieldname.replace("w. sol 2U CT4", "2U CT4 & Solutions")
            break

        case "5326":
            fieldname = titlex + " 2U HY.pdf"
            fieldname = fieldname.replace("w. sol 2U HY", "2U HY & Solutions")
            break

        case "5328":
            fieldname = titlex + " 2U Trials.pdf"
            fieldname = fieldname.replace("w. sol 2U Trials", "2U Trials & Solutions")
            break

        case "5330": {
            const year = titlex.substring(0, 4)
            const root = titlex.substr(5).toLowerCase()
            if (year < 2001) {
                fieldname = "Maths 3U " + titlex + ".pdf"
            } else {
                fieldname = "Maths Ext 1 " + titlex + ".pdf"
            }
            if (root === "solutions" || root === "solution") {
                if (year < 2005) {
                    fieldname = fieldname.replace("Solutions", "MANSW Solutions")
                }
            }
            break
        }

        case "5331":
            fieldname = titlex + " 3U CT1.pdf"
            fieldname = fieldname.replace("w. sol 3U CT1", "3U CT1 & Solutions")
            break

        case "5332":
            fieldname = titlex + " 3U CT2.pdf"
            fieldname = fieldname.replace("w. sol 3U CT2", "3U CT2 & Solutions")
            break

        case "5333":
            fieldname = titlex + " 3U CT3.pdf"
            fieldname = fieldname.replace("w. sol 3U CT3", "3U CT3 & Solutions")
            break

        case "5334":
            fieldname = titlex + " 3U CT4.pdf"
            fieldname = fieldname.replace("w. sol 3U CT4", "3U CT4 & Solutions")
            break

        case "5336":
            fieldname = titlex + " 3U HY.pdf"
            fieldname = fieldname.replace("w. sol 3U HY", "3U HY & Solutions")
            break

        case "5338":
            fieldname = titlex + " 3U Trials.pdf"
            fieldname = fieldname.replace("w. sol 3U Trials", "3U Trials & Solutions")
            break

        case "5340": {
            const year = titlex.substring(0, 4)
            const root = titlex.substr(5).toLowerCase()
            if (year < 2001) {
                fieldname = "Maths 4U " + titlex + ".pdf"
            } else {
                fieldname = "Maths Ext 2 " + titlex + ".pdf"
            }
            if (root === "solutions" || root === "solution") {
                if (year < 2005) {
                    fieldname = fieldname.replace("Solutions", "MANSW Solutions")
                }
            }
            break
        }

        case "5341":
            fieldname = titlex + " 4U CT1.pdf"
            fieldname = fieldname.replace("w. sol 4U CT1", "4U CT1 & Solutions")
            break

        case "5342":
            fieldname = titlex + " 4U CT2.pdf"
            fieldname = fieldname.replace("w. sol 4U CT2", "4U CT2 & Solutions")
            break

        case "5343":
            fieldname = titlex + " 4U CT3.pdf"
            fieldname = fieldname.replace("w. sol 4U CT3", "4U CT3 & Solutions")
            break

        case "5344":
            fieldname = titlex + " 4U CT4.pdf"
            fieldname = fieldname.replace("w. sol 4U CT4", "4U CT4 & Solutions")
            break

        case "5346":
            fieldname = titlex + " 4U HY.pdf"
            fieldname = fieldname.replace("w. sol 4U HY", "4U HY & Solutions")
            break

        case "5348":
            fieldname = titlex + " 4U Trials.pdf"
            fieldname = fieldname.replace("w. sol 4U Trials", "4U Trials & Solutions")
            break

        case "5405":
            fieldname = titlex + ".pdf"
            fieldname = fieldname.replace("w. sol", "& Solutions")
            break

        case "5518":
            fieldname = titlex + " Modern History Prelim Yearly.pdf"
            fieldname = fieldname.replace("w. sol Modern History Prelim Yearly", "Modern History Prelim Yearly & Solutions")
            break

        case "5528":
            fieldname = titlex + " Modern History Trials.pdf"
            fieldname = fieldname.replace("w. sol Modern History Trials", "Modern History Trials & Solutions")
            break

        case "6428": {
            const titlexy = titlex.replace(" PDHPE Trials", "")
            fieldname = titlexy + " PDHPE Trials.pdf"
            fieldname = fieldname.replace("w. sol PDHPE Trials", "PDHPE Trials & Solutions")
            break
        }

        case "6516":
            fieldname = titlex + " Physics Prelim HY.pdf"
            fieldname = fieldname.replace("w. sol Physics Prelim HY", "Physics Prelim HY & Solutions")
            break

        case "6518":
            fieldname = titlex + " Physics Prelim Yearly.pdf"
            fieldname = fieldname.replace("w. sol Physics Prelim Yearly", "Physics Prelim Yearly & Solutions")
            break

        case "6521":
            fieldname = titlex + " Physics CT1.pdf"
            fieldname = fieldname.replace("w. sol Physics CT1", "Physics CT1 & Solutions")
            break

        case "6523":
            fieldname = titlex + " Physics CT3.pdf"
            fieldname = fieldname.replace("w. sol Physics CT3", "Physics CT3 & Solutions")
            break

        case "6526":
            fieldname = titlex + " Physics HY.pdf"
            fieldname = fieldname.replace("w. sol Physics HY", "Physics HY & Solutions")
            break

        case "6528":
            fieldname = titlex + " Physics Trials.pdf"
            fieldname = fieldname.replace("w. sol Physics Trials", "Physics Trials & Solutions")
            break

        case "7428":
            fieldname = titlex + " Society & Culture Trials.pdf"
            fieldname = fieldname.replace("w. sol Society & Culture Trials", "Society & Culture Trials & Solutions")
            break

        case "7478":
            fieldname = titlex + " Software Trials.pdf"
            fieldname = fieldname.replace("w. sol Software Trials", "Software Trials & Solutions")
            break

        case "7508":
            fieldname = titlex + " Year 10 Science Yearly.pdf"
            fieldname = fieldname.replace("w. sol Year 10 Science Yearly", "Year 10 Science Yearly & Solutions")
            break

        case "7528":
            fieldname = titlex + " Senior Science Trials.pdf"
            fieldname = fieldname.replace("w. sol Senior Science Trials", "Senior Science Trials & Solutions")
            break

        case "7718":
            fieldname = titlex + " Studies of Religion 1 Trials.pdf"
            fieldname = fieldname.replace("w. sol Studies of Religion 1 Trials", "Studies of Religion 1 Trials & Solutions")
            break

        case "7728":
            fieldname = titlex + " Studies of Religion 2 Trials.pdf"
            fieldname = fieldname.replace("w. sol Studies of Religion 2 Trials", "Studies of Religion 2 Trials & Solutions")
            break

        case "8678":
            fieldname = titlex + " Visual Arts Trials.pdf"
            fieldname = fieldname.replace("w. sol Visual Arts Trials", "Visual Arts Trials & Solutions")
            break
		default:
			var fieldname = titlex + ".pdf";
			fieldname=fieldname.replace(".doc.pdf", ".doc");
			fieldname=fieldname.replace(".docx.pdf", ".docx");
			fieldname=fieldname.replace("w. sol", "& Solutions");  
		break;
    }

    return fieldname
}

async function getFragment(request, env, client, viewno, titlex, fragment) {
    const filename = makeFragmentFilename(viewno, titlex, fragment)
    const url = createB2ObjectUrl(env, filename)
    const headers = filterHeaders(request.headers, env)
    const requestMethod = request.method

    const signedRequest = await client.sign(url.toString(), {
        method: 'GET',
        headers,
    })

    if (signedRequest.headers.has('range')) {
        let attempts = RANGE_RETRY_ATTEMPTS
        let response

        do {
            const controller = new AbortController()

            response = await fetch(signedRequest.url, {
                method: signedRequest.method,
                headers: signedRequest.headers,
                signal: controller.signal,
            })

            if (response.headers.has('content-range')) {
                if (attempts < RANGE_RETRY_ATTEMPTS) {
                    console.log(`Retry for ${signedRequest.url} succeeded - response has content-range header`)
                }
                break
            }

            if (response.ok) {
                attempts--
                console.error(`Range header in request for ${signedRequest.url} but no content-range header in response. Will retry ${attempts} more times`)

                if (attempts > 0) {
                    controller.abort()
                }
            } else {
                break
            }
        } while (attempts > 0)

        if (attempts <= 0) {
            console.error(`Tried range request for ${signedRequest.url} ${RANGE_RETRY_ATTEMPTS} times, but no content-range in response.`)
        }

        if (requestMethod === 'HEAD') {
            return createHeadResponse(response)
        }

        return response
    }

    const response = await fetch(signedRequest)

    if (requestMethod === 'HEAD') {
        return createHeadResponse(response)
    }

    return response
}

function getCacheKey(request) {
    return new Request(request.url, {
        method: 'GET',
    })
}

async function handleCountFragments(request, env, client, viewno, titlex) {
    const cache = caches.default
    const cacheKey = getCacheKey(request)
    const cached = await cache.match(cacheKey)

    if (cached) {
        if (request.method === 'HEAD') {
            return createHeadResponse(cached)
        }
        return cached
    }

    try {
        const count = await countFragments(env, client, viewno, titlex)

        const response = new Response(String(count), {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': `public, max-age=${CACHE_TTL}`,
            },
        })

        await cache.put(cacheKey, response.clone())

        if (request.method === 'HEAD') {
            return createHeadResponse(response)
        }

        return response
    } catch (error) {
        console.error(error)

        return new Response('Unable to query Backblaze B2', {
            status: 502,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
        })
    }
}

async function handleGetFileName(request, env, viewno, titlex) {
    const cache = caches.default
    const cacheKey = getCacheKey(request)
    const cached = await cache.match(cacheKey)

    if (cached) {
        if (request.method === 'HEAD') {
            return createHeadResponse(cached)
        }
        return cached
    }

    const filename = getFileName(viewno, titlex)

    if (filename === undefined) {
        return new Response('Not Found', {
            status: 404,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
        })
    }

    const response = new Response(filename, {
        status: 200,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': `public, max-age=${CACHE_TTL}`,
        },
    })

    await cache.put(cacheKey, response.clone())

    if (request.method === 'HEAD') {
        return createHeadResponse(response)
    }

    return response
}

async function handleGetFragment(request, env, client, viewno, titlex, fragment) {
    const cache = caches.default
    const cacheKey = getCacheKey(request)
    const cached = await cache.match(cacheKey)

    if (cached) {
        if (request.method === 'HEAD') {
            return createHeadResponse(cached)
        }
        return cached
    }

    const response = await getFragment(
        request,
        env,
        client,
        viewno,
        titlex,
        fragment
    )

    if (response.ok) {
        const headers = new Headers(response.headers)
        headers.set(
            'Cache-Control',
            `public, max-age=${CACHE_TTL}, immutable`
        )

        const cacheableResponse = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        })

        await cache.put(cacheKey, cacheableResponse.clone())

        return cacheableResponse
    }

    return response
}

function parseApiPath(pathname) {
    const segments = pathname
        .split('/')
        .filter(Boolean)

    if (segments.length < 4 || segments[0] !== 'api' || segments[1] !== 'v1') {
        return null
    }

    const route = segments[2]
    const viewno = segments[3]
    const titlex = decodeURIComponent(segments[4] || '')
    const fragment = segments[5] !== undefined
        ? decodeURIComponent(segments[5])
        : '0'

    if (!viewno || !titlex) {
        return null
    }

    return {
        route,
        viewno,
        titlex,
        fragment,
    }
}

export default {
    async fetch(request, env) {
        if (!['GET', 'HEAD'].includes(request.method)) {
            return new Response(null, {
                status: 405,
                statusText: 'Method Not Allowed',
                headers: {
                    'Allow': 'GET, HEAD',
                },
            })
        }

        const url = new URL(request.url)

        if (!url.pathname.startsWith('/api/v1/')) {
            return new Response('Not Found', {
                status: 404,
            })
        }

        let route

        try {
            route = parseApiPath(url.pathname)
        } catch {
            return new Response('Bad Request', {
                status: 400,
            })
        }

        if (!route || !validateViewNo(route.viewno)) {
            return new Response('Not Found', {
                status: 404,
            })
        }

        const {
            route: routeName,
            viewno,
            titlex,
            fragment,
        } = route

        const client = createB2Client(env)

        if (routeName === 'countfragments') {
            if (fragment !== '0') {
                return new Response('Not Found', {
                    status: 404,
                })
            }

            return handleCountFragments(
                request,
                env,
                client,
                viewno,
                titlex
            )
        }

        if (routeName === 'getFileName') {
            if (fragment !== '0') {
                return new Response('Not Found', {
                    status: 404,
                })
            }

            return handleGetFileName(
                request,
                env,
                viewno,
                titlex
            )
        }

        if (routeName === 'getFragment') {
            if (!validateFragment(fragment)) {
                return new Response('Bad Request', {
                    status: 400,
                })
            }

            return handleGetFragment(
                request,
                env,
                client,
                viewno,
                titlex,
                fragment
            )
        }

        return new Response('Not Found', {
            status: 404,
        })
    },
}
