FROM node:22-bookworm

# Tools Claude Code and the build rely on.
# build-essential + python3: generic node-gyp toolchain (no native tree-sitter
# binding is a dependency; web-tree-sitter is pure WASM). tree-sitter-cli only
# serves the optional external grammar oracle (V2), never build/test/release.
RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        ripgrep \
        fzf \
        jq \
        less \
        curl \
        ca-certificates \
        sudo \
        python3 \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI + tree-sitter CLI (global).
RUN npm install -g @anthropic-ai/claude-code tree-sitter-cli

# Passwordless sudo for the non-root user (convenience inside the disposable container).
RUN echo "node ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/node \
    && chmod 0440 /etc/sudoers.d/node

# Claude Code refuses bypassPermissions as root, so we run as the unprivileged `node` user.
USER node
WORKDIR /workspaces/query_console_vscode
