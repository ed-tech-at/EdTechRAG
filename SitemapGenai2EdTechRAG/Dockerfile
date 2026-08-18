FROM golang:1.24-alpine AS build

WORKDIR /src
COPY go.mod ./
COPY main.go ./
COPY trigger ./trigger
RUN go build -trimpath -ldflags="-s -w" -o /out/sitemapgenai2edtechrag . \
	&& go build -trimpath -ldflags="-s -w" -o /out/sitemapgenai2edtechrag-trigger ./trigger

FROM alpine:3.21

RUN apk add --no-cache ca-certificates git openssh-client tzdata \
	&& adduser -D -h /app app \
	&& mkdir -p /work /app/.ssh \
	&& chown -R app:app /work /app

COPY --from=build /out/sitemapgenai2edtechrag /usr/local/bin/sitemapgenai2edtechrag
COPY --from=build /out/sitemapgenai2edtechrag-trigger /usr/local/bin/sitemapgenai2edtechrag-trigger
# Manual/CI batch mode (build->diff->push->notify once, then exit), kept for
# `docker compose run --rm --entrypoint /usr/local/bin/entrypoint.sh ...`.
# The default entrypoint is the HTTP trigger server below.
COPY --chown=app:app entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER app
WORKDIR /work
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/sitemapgenai2edtechrag-trigger"]
