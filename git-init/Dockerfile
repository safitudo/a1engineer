FROM alpine/git:latest

COPY git-init.sh /git-init.sh
RUN chmod +x /git-init.sh

ENTRYPOINT ["/git-init.sh"]
