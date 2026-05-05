FROM golang:1.24-alpine AS build

WORKDIR /src
COPY go.mod ./
COPY main.go ./
RUN go build -trimpath -ldflags="-s -w" -o /out/github2edtechrag .

FROM alpine:3.21

RUN apk add --no-cache ca-certificates git openssh-client \
	&& adduser -D -h /app app \
	&& mkdir -p /repos /log /app/.ssh \
	&& chown -R app:app /repos /log /app

COPY --from=build /out/github2edtechrag /usr/local/bin/github2edtechrag

USER app
ENV ADDR=:8080 \
	GITHUB_REPOS_DIR=/repos \
	LOG_DIR=/log \
	GITHUB_SSH_KEY_PATH=/app/.ssh/id_ed25519 \
	PUBLIC_BASE_URL=https://github2.edtechrag.local

EXPOSE 8080
ENTRYPOINT ["github2edtechrag"]
