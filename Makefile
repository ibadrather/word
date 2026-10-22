# Dev tasks. `make setup` once after cloning, then `make check` before pushing.

SKILL_REPO := https://github.com/jeffallan/claude-skills.git
SKILL_SRC  := skills/javascript-pro
SKILL_DEST := .claude/skills/javascript-pro

.PHONY: setup skills serve format lint lint-js typecheck test check

# Install the dev tools (Python's and ESLint) and fetch the latest Claude Code skill.
setup: skills
	uv sync
	npm ci

# Copy the javascript-pro skill from jeffallan/claude-skills. A sparse,
# blobless clone fetches only that folder, not the whole repository.
skills:
	@tmp=$$(mktemp -d) && trap 'rm -rf "$$tmp"' EXIT && \
	git clone --quiet --depth 1 --filter=blob:none --sparse $(SKILL_REPO) "$$tmp" && \
	git -C "$$tmp" sparse-checkout set $(SKILL_SRC) && \
	rm -rf $(SKILL_DEST) && mkdir -p $(dir $(SKILL_DEST)) && \
	cp -R "$$tmp/$(SKILL_SRC)" $(SKILL_DEST) && \
	echo "Updated $(SKILL_DEST)"

# Preview the page at http://localhost:8000
serve:
	python3 -m http.server -d web 8000

format:
	uv run ruff format .
	npx eslint --fix .

lint: lint-js
	uv run ruff format --check .
	uv run ruff check .

# ESLint over web/ and the tests' Node scripts (eslint.config.js); any warning fails it too
lint-js:
	npx eslint --max-warnings 0 .

typecheck:
	uv run mypy tests .github/scripts

test:
	uv run pytest -rs

check: lint typecheck test
