# The Empty Hook — a side-by-side guardrail demo

This fork exists to run one experiment, publicly and fairly:

> **OpenClaw's native exec guardrails, at their strongest configuration,
> versus the same OpenClaw plus Operator Lite.**

**This fork changes zero lines of OpenClaw code.** `git diff openclaw/main`
against this repo shows only this `demo/` directory. Same binary, same
machine, same canary workspace, same command battery — the only variable
is configuration.

## Fairness rules

1. **Stock side runs its best config, not a strawman.** We enable exec
   approvals in `allowlist` mode with `askFallback: deny` — stronger than
   OpenClaw's documented default (`security: "full"`, `ask: "off"`).
2. **We give stock its wins on camera.** Plain destructive commands get
   caught by the prompt, and obfuscated forms that fail path resolution
   fail closed. We show those.
3. **Every claim about OpenClaw internals is tested against OpenClaw's
   own source.** `tokenizer-proof.mts` runs `src/utils/shell-argv.ts`
   (their shipped tokenizer, unmodified) and prints what it parses.
4. Both sides run the same battery (`battery.sh`) against the same canary
   workspace (`setup.sh` rebuilds it before each take).

## What is already verified (run it yourself)

```
npx -y tsx demo/tokenizer-proof.mts
```

Their tokenizer reassembles `r''m -rf <path>` into a clean `argv0="rm"`.
An allowlist entry containing `rm` — the convenience entry anyone running
a real workspace eventually adds — authorizes it. The command executes.

Their own threat model concedes the class
(`docs/security/THREAT-MODEL-ATLAS/defense-evasion.md`):
"novel obfuscation can still slip past layered heuristics."

## Layout

| File | Purpose |
|---|---|
| `setup.sh` | Rebuild the canary factory (`~/demo-factory`) — fake prod files, safe paths |
| `battery.sh` | The 8-command battery every side runs |
| `tokenizer-proof.mts` | Runs OpenClaw's own tokenizer on the battery — stock-side evidence, headless |
| `configs/stock-default.json` | Out-of-the-box exec policy (their documented defaults) |
| `configs/stock-hardened.json` | Allowlist mode, deny fallback — their best |
| `SCRIPT.md` | The filming beat sheet |

## The one-line conclusion

OpenClaw ships the rails: a `before_tool_call` hook that can block, an
approval router, an audit ledger. Core ships no default security hook on
those rails. Operator Lite is the verdict that rides them — deterministic,
shadow-first, receipt-chained.

    clawhub install vestige-operator-lite
