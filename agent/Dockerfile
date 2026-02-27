FROM node:22-slim

RUN apt-get update && apt-get install -y \
    git tmux curl jq openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && userdel -r node 2>/dev/null; useradd -m -s /bin/bash -u 1000 agent

WORKDIR /usr/local/lib/a1

COPY package.json package-lock.json ./
RUN npm ci --production

COPY bin/ bin/
COPY lib/ lib/

RUN chmod +x bin/agent-entrypoint.sh bin/msg.js bin/irc-poll.js bin/sidecar.sh bin/git-credential-manager-token bin/pty-send \
    && ln -s /usr/local/lib/a1/bin/msg.js /usr/local/bin/msg \
    && ln -s /usr/local/lib/a1/bin/irc-poll.js /usr/local/bin/irc-poll \
    && ln -s /usr/local/lib/a1/bin/sidecar.sh /usr/local/bin/sidecar.sh \
    && ln -s /usr/local/lib/a1/bin/agent-entrypoint.sh /usr/local/bin/agent-entrypoint.sh \
    && ln -s /usr/local/lib/a1/bin/git-credential-manager-token /usr/local/bin/git-credential-manager-token \
    && ln -s /usr/local/lib/a1/bin/pty-send /usr/local/bin/pty-send

ENTRYPOINT ["agent-entrypoint.sh"]
