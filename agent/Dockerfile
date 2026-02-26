FROM node:22-slim

RUN apt-get update && apt-get install -y \
    git tmux curl jq openssh-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/local/lib/a1

COPY package.json package-lock.json ./
RUN npm ci --production

COPY bin/ /usr/local/bin/
COPY lib/ /usr/local/lib/a1/lib/

RUN chmod +x /usr/local/bin/agent-entrypoint.sh \
    /usr/local/bin/msg.js /usr/local/bin/irc-poll.js \
    && ln -s /usr/local/bin/msg.js /usr/local/bin/msg

ENTRYPOINT ["/usr/local/bin/agent-entrypoint.sh"]
