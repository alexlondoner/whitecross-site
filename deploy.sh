#!/bin/bash
PROJECT="havuz-44f70"

declare -a SITE_IDS=(
  "whitecrossbarbers-admin"
  "whitecrossbarbers-app"
  "whitecrossbarbers-clientapp"
  "whitecrossbarbers-owner"
)

declare -a SITE_LABELS=(
  "Admin Panel    (barber-panel/build)"
  "Staff App      (barber-mobile)"
  "Client App     (client-app)"
  "Owner Panel    (barber-panel/build)"
)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ⚠️  WHITECROSS DEPLOY — SELECT TARGET SITE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for i in "${!SITE_IDS[@]}"; do
  NUM=$((i+1))
  echo "  [$NUM] ${SITE_IDS[$i]}"
  echo "       ${SITE_LABELS[$i]}"
done
echo "  [5] ALL four sites"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "  Choose (1-5): " CHOICE
echo ""

case "$CHOICE" in
  1|2|3|4)
    IDX=$((CHOICE-1))
    SELECTED="${SITE_IDS[$IDX]}"
    TARGETS="hosting:$SELECTED"
    LABEL="$SELECTED"
    ;;
  5)
    TARGETS="hosting"
    LABEL="ALL WHITECROSS SITES"
    ;;
  *)
    echo "  ❌ Invalid choice '$CHOICE'. Exiting."
    exit 1
    ;;
esac

echo "  ┌─────────────────────────────────────────────────┐"
echo "  │  DEPLOYING TO: $LABEL"
echo "  │  Project:      $PROJECT"
echo "  └─────────────────────────────────────────────────┘"
echo ""
read -p "  Type 'yes' to confirm: " CONFIRM
echo ""

if [ "$CONFIRM" != "yes" ]; then
  echo "  ❌ Cancelled."
  exit 1
fi

echo "  Deploying $LABEL ..."
npx firebase-tools deploy --only $TARGETS --project $PROJECT
echo ""
echo "  ✅ Done: $LABEL"
echo ""
