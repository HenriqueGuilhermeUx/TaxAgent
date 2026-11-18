FROM golang:1.27.1-alpine AS build

ARG RTC_DANFSE_COMMIT=8d79e6b2f7fad6375340afcb51c85ed370c64a14

RUN apk add --no-cache git ca-certificates

RUN git init /src \
 && cd /src \
 && git remote add origin https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse.git \
 && git fetch --depth 1 origin "${RTC_DANFSE_COMMIT}" \
 && git checkout --detach FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "${RTC_DANFSE_COMMIT"

WORKDIR /src

RUN go mod download \
 && go install github.com/swaggo/swag/cmd/swag@v1.16.6 \
 && /go/bin/swag init -g cmd/danfse/main.go -o ./api/swagger \
 && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o /out/danfse-service ./cmd/danfse

FROM alpine:3.22

RUN apk add --no-cache ca-certificates tzdata
ENV TZ=America/Sao_Paulo
WORKDIR /app

COPY --from=build /out/danfse-service ./danfse-service

EXPOSE 8080

ENTRYPOINT ["./danfse-service"]
