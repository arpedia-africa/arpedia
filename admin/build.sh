#!/bin/sh
# Assemble admin/index.html from src parts in filename order (00-head ... 95-feedback).
cd "$(dirname "$0")" && cat $(ls src/*.html | sort) > index.html && echo "built index.html ($(wc -c < index.html) bytes, $(grep -c 'class="screen' index.html) screens)"
