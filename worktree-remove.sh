#!/bin/sh
set -eu

repo="$1"
path="$2"
name=$(basename "$path")

lang="${WORKTREES_LANG:-}"
if [ -z "$lang" ]; then
  case "$(defaults read -g AppleLocale 2>/dev/null || echo "${LANG:-}")" in
    ko*) lang=ko ;;
    *) lang=en ;;
  esac
fi

if [ "$lang" = ko ]; then
  ask="워크트리를 지웁니다."
  note="작업 중인 변경이 있으면 git이 거부합니다."
  cancel="취소"
  confirm="지우기"
  done_msg="지웠습니다"
  failed="지우지 못했습니다."
  ok="확인"
else
  ask="Remove this worktree?"
  note="Git refuses when there are uncommitted changes."
  cancel="Cancel"
  confirm="Remove"
  done_msg="removed"
  failed="Could not remove it."
  ok="OK"
fi

osascript -e "display dialog \"$ask

$name
$path

$note\" buttons {\"$cancel\", \"$confirm\"} default button \"$cancel\" with icon caution" >/dev/null 2>&1 || exit 0

if out=$(git -C "$repo" worktree remove "$path" 2>&1); then
  osascript -e "display notification \"$name $done_msg\" with title \"Worktrees\"" >/dev/null 2>&1
else
  osascript -e "display dialog \"$failed

$out\" buttons {\"$ok\"} default button \"$ok\" with icon stop" >/dev/null 2>&1
fi
