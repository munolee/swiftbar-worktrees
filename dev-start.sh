#!/bin/sh
set -eu

path="$1"
manager="$2"
script="$3"

cd "$path"
printf '\033]0;%s · %s\007' "$(basename "$path")" "$script"
echo "\$ $manager run $script"
echo
exec "$manager" run "$script"
