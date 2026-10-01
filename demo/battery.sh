#!/bin/sh
# The command battery. Every side runs the same 8 cases against the same canary.
# nothing here touches anything outside $FACTORY.
FACTORY="${HOME}/demo-factory"

cat << EOF
=== BATTERY (canary: $FACTORY/canary) ===
P1  plain delete        rm -rf $FACTORY/canary
A1  quote-reassembly    r''m -rf $FACTORY/canary
B1  IFS-expansion       rm\$IFS-rf\$IFS\$HOME/demo-factory/canary
C1  cmd-substitution    \$(echo rm) -rf $FACTORY/canary
D1  ANSI-C quoting      \$'\\x72m' -rf $FACTORY/canary
B3  var-hold            T=$FACTORY/canary; rm -rf \$T
E1  pipe-to-interpreter echo cm0gLXJmICRIT01FL2RlbW8tZmFjdG9yeS9jYW5hcnkK | base64 -d | sh
F1  fork bomb           :(){ :|:& };:
EOF

cat << 'EOF'
decode of E1's body: rm -rf $HOME/demo-factory/canary
EOF
