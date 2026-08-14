FROM mcr.microsoft.com/devcontainers/typescript-node:22-bookworm

# Install firewall tooling used by init-firewall.sh to build the network allowlist
RUN apt-get update && apt-get install -y --no-install-recommends \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  jq \
  curl \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install jj (Jujutsu VCS) - this repo is a jj/git colocated repo and CLAUDE.md
# prefers jj for version control. No official devcontainer feature exists for
# it, so pull the latest release binary directly. This runs at build time, so
# it isn't subject to the runtime firewall init-firewall.sh installs below.
RUN JJ_VERSION=$(curl -fsSL https://api.github.com/repos/jj-vcs/jj/releases/latest | jq -r .tag_name) && \
  curl -fsSL "https://github.com/jj-vcs/jj/releases/download/${JJ_VERSION}/jj-${JJ_VERSION}-x86_64-unknown-linux-musl.tar.gz" -o /tmp/jj.tar.gz && \
  mkdir -p /tmp/jj-extract && \
  tar -xzf /tmp/jj.tar.gz -C /tmp/jj-extract && \
  mv /tmp/jj-extract/jj /usr/local/bin/jj && \
  chmod +x /usr/local/bin/jj && \
  rm -rf /tmp/jj.tar.gz /tmp/jj-extract

# Placeholder for the host's jj user config, bind-mounted read-only over this
# exact path in devcontainer.json. The file must already exist here before the
# mount happens, or Docker creates an (empty, root-owned) directory at this
# path instead of mounting the host file onto it.
RUN mkdir -p /home/node/.config/jj && \
  touch /home/node/.config/jj/config.toml && \
  chown -R node:node /home/node/.config

# Run the firewall script directly from the bind-mounted workspace rather than
# COPYing it into the image: the official claude-code devcontainer feature
# (installed after this Dockerfile, in a later stage) unconditionally overwrites
# /usr/local/bin/init-firewall.sh with its own bundled copy via a
# setup_firewall_script() step in its install.sh, with no check for a pre-existing
# file - so anything COPYed to that exact path here gets silently clobbered.
RUN echo "node ALL=(root) NOPASSWD: /bin/bash /workspaces/torn_war_stuff_enhanced/.devcontainer/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
  chmod 0440 /etc/sudoers.d/node-firewall

# Pre-create the mount points for the named volumes (Claude config, bash history)
# owned by node (this base image's non-root user, unlike the vscode user on the
# rust image). An empty named volume inherits the ownership/content already
# present at its mount path on first use - without this, Docker creates it
# root-owned, and node can't write credentials or transcripts into it.
RUN mkdir -p /home/node/.claude /commandhistory && \
  chown node:node /home/node/.claude /commandhistory

# Seed the container-local Claude config with auto mode as the default
# permission mode. This is scoped to the devcontainer's own isolated
# ~/.claude (the named volume above, distinct from the host's), so it never
# affects host Claude Code sessions. Project-level .claude/settings.json can't
# set defaultMode: "auto" - Claude Code silently ignores it there so a repo
# can't grant itself auto mode - so it has to be seeded here instead, into
# what is effectively this container's user-level settings file.
RUN echo '{"permissions": {"defaultMode": "auto"}}' > /home/node/.claude/settings.json && \
  chown node:node /home/node/.claude/settings.json
