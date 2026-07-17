// Stands in for a real editor CLI (§10.3) so browser tests never spawn one
// (task 0015 implementation note). Records the location it was launched with
// so a test can assert on the exact open-in-editor request.
import { appendFileSync } from "node:fs"

const [, , resultFile, file, line, column] = process.argv
appendFileSync(resultFile, `${JSON.stringify({ file, line: Number(line), column: Number(column) })}\n`)
