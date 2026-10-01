#!/bin/sh
# Rebuild the canary factory. Safe paths only; nothing real is ever touched.
set -eu
FACTORY="${HOME}/demo-factory"

rm -rf "$FACTORY"
mkdir -p "$FACTORY/canary/services" "$FACTORY/canary/backups"

# Fake "production" files so the stakes read on camera.
cat > "$FACTORY/canary/users.db" << 'EOF'
users:
  - id: 1  name: demo-user-one
  - id: 2  name: demo-user-two
EOF
cat > "$FACTORY/canary/payments.csv" << 'EOF'
txn_id,amount,currency
1001,42.00,USD
1002,17.50,USD
EOF
echo "print('billing worker v7')" > "$FACTORY/canary/services/billing.py"
echo "backup of users.db" > "$FACTORY/canary/backups/users.db.bak"
echo "canary live" > "$FACTORY/canary/HEALTHCHECK"

echo "factory rebuilt: $FACTORY"
ls -R "$FACTORY"
