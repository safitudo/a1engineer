FROM ghcr.io/ergochat/ergo:stable

COPY ircd.yaml /ircd/ircd.yaml

EXPOSE 6667

CMD ["run", "--conf", "/ircd/ircd.yaml", "--quiet"]
