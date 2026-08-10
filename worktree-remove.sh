#!/bin/sh
set -eu

repo="$1"
path="$2"
name=$(basename "$path")

osascript -e "display dialog \"워크트리를 지웁니다.

$name
$path

작업 중인 변경이 있으면 git이 거부합니다.\" buttons {\"취소\", \"지우기\"} default button \"취소\" with icon caution" >/dev/null 2>&1 || exit 0

if out=$(git -C "$repo" worktree remove "$path" 2>&1); then
  osascript -e "display notification \"$name 지웠습니다\" with title \"Worktrees\"" >/dev/null 2>&1
else
  osascript -e "display dialog \"지우지 못했습니다.

$out\" buttons {\"확인\"} default button \"확인\" with icon stop" >/dev/null 2>&1
fi
