#!/bin/sh
# Assemble prototype/index.html from src parts (order matters).
cd "$(dirname "$0")" && cat src/00-head.html src/00b-components.html src/00c-motion.html src/01-shell.html src/02-auth-discovery.html src/03-book-reader.html src/04-library-social.html src/05-money-profile-studio.html src/06-tail.html src/07-feedback.html > index.html
