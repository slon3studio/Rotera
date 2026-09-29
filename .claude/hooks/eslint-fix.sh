#!/bin/bash
# After Claude edits a JS/TS file, run eslint --fix on just that file.
# Never blocks: lint problems that can't be auto-fixed are caught by `npx expo lint`.
file=$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).tool_input.file_path||"")}catch{}})')
case "$file" in
  *.ts|*.tsx|*.js|*.jsx) ;;
  *) exit 0 ;;
esac
cd "$CLAUDE_PROJECT_DIR" || exit 0
npx --no-install eslint --fix "$file" >/dev/null 2>&1
exit 0
