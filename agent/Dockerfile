FROM node:22-slim

RUN apt-get update && apt-get install -y \
    git tmux curl jq openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -s /bin/bash agent

WORKDIR /usr/local/lib/a1

COPY package.json package-lock.json ./
RUN npm ci --production

COPY bin/ bin/
COPY lib/ lib/

RUN chmod +x bin/agent-entrypoint.sh bin/msg.js bin/irc-poll.js \
    && ln -s /usr/local/lib/a1/bin/msg.js /usr/local/bin/msg \
    && ln -s /usr/local/lib/a1/bin/irc-poll.js /usr/local/bin/irc-poll \
    && ln -s /usr/local/lib/a1/bin/agent-entrypoint.sh /usr/local/bin/agent-entrypoint.sh

ENTRYPOINT ["agent-entrypoint.sh"]
