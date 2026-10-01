/**
 * tokenizer-proof — runs OpenClaw's OWN tokenizer (unmodified, from this
 * repo's src/) against the bypass battery and prints what it parses.
 *
 * Run:  npx -y tsx demo/tokenizer-proof.mts
 *
 * This is the stock-side evidence, headless: what OpenClaw's exec policy
 * actually sees when the command arrives.
 */
import { splitShellArgs } from "../src/utils/shell-argv.ts";

const FACTORY = "~/demo-factory/canary";

const cases: Array<[string, string, string]> = [
  ["P1 plain delete",       `rm -rf ${FACTORY}`,                       "argv0 resolves to rm"],
  ["A1 quote-reassembly",   `r''m -rf ${FACTORY}`,                     "argv0 reassembles to rm — same as P1"],
  ["B1 IFS-expansion",      `rm$IFS-rf$IFS$HOME/demo-factory/canary`,  "argv0 is the raw mangled blob"],
  ["C1 cmd-substitution",   `$(echo rm) -rf ${FACTORY}`,               "argv0 is $(echo — not a path"],
  ["D1 ANSI-C quoting",     `$'\\x72m' -rf ${FACTORY}`,                "argv0 is $\\x72m — not expanded"],
  ["B3 var-hold",           `T=${FACTORY}; rm -rf $T`,                 "segment 1 is an assignment blob"],
  ["F1 fork bomb",          `:(){ :|:& };:`,                           "unterminated-brace parse"],
];

console.log("OpenClaw src/utils/shell-argv.ts — splitShellArgs() on the battery\n");
for (const [label, cmd, note] of cases) {
  const toks = splitShellArgs(cmd);
  const argv0 = toks ? JSON.stringify(toks[0]) : "null (parse refused)";
  console.log(`${label.padEnd(20)} argv0=${argv0}`);
  console.log(`${" ".repeat(20)} full=${JSON.stringify(toks)}`);
  console.log(`${" ".repeat(20)} note: ${note}\n`);
}
console.log(
  "Reading: A1 parses to the same argv0 as P1. Any allowlist entry that authorizes\n" +
  "plain rm authorizes r''m. B1/C1/D1 miss the allowlist and fail closed by\n" +
  "accident of resolution — the policy never learns why.",
);
