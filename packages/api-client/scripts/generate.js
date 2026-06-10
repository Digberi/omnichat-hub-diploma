import path from "node:path"
import { fileURLToPath } from "node:url"
import { readFile, writeFile } from "node:fs/promises"
import openapiTS, { COMMENT_HEADER, astToString } from "openapi-typescript"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const openapiPath = path.resolve(__dirname, "../../../apps/api/openapi.json")
const outPath = path.resolve(__dirname, "../src/schema.ts")

const raw = await readFile(openapiPath, "utf8")
const document = JSON.parse(raw)

const nodes = await openapiTS(document)
const output = COMMENT_HEADER + astToString(nodes)

await writeFile(outPath, output, "utf8")

// eslint-disable-next-line no-console
console.log(`Generated ${path.relative(process.cwd(), outPath)} from ${path.relative(process.cwd(), openapiPath)}`)
