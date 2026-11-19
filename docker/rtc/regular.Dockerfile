FROM maven:3.9.5-eclipse-temurin-21 AS build

ARG RTC_REGULAR_COMMIT=150cccbe414d4a5edea703e4f7a424af5aa222c7

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN git init /src \
 && cd /src \
 && git remote add origin https://github.com/ReceitaFederal/calculadora-rtc-regime-regular.git \
 && git fetch --depth 1 origin "${RTC_REGULAR_COMMIT}" \
 && git checkout --detach FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "${RTC_REGULAR_COMMIT}"

WORKDIR /src

RUN mkdir -p ./calculadora/db \
 && mvn flyway:migrate \
      -Dflyway.configFiles=./flyway/flyway-pro.conf \
      --batch-mode --errors

RUN mvn --batch-mode --errors -ntp -DskipTests clean package \
 && test -s target/api-regime-geral.jar \
 && test -s calculadora/db/calculadora-pro.db

FROM eclipse-temurin:21-jre-jammy

WORKDIR /app
ENV SPRING_PROFILES_ACTIVE=offline

COPY --from=build /src/target/api-regime-geral.jar ./api-regime-geral.jar
COPY --from=build /src/calculadora ./calculadora

EXPOSE 8080 9101

ENTRYPOINT ["java","-jar","api-regime-geral.jar"]
