#!/usr/bin/env bash
cd "$(git rev-parse --show-toplevel)" || exit 2
printf "#!/usr/bin/env bash
exec node \"\$(git rev-parse --show-toplevel)/scripts/secret-scan.js\"
" > .git/hooks/pre-push
chmod +x .git/hooks/pre-push
echo "pre-push secret scan installed"
