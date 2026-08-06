# Root Dockerfile: build the SkillHub Spring Boot backend.
# Place this at the repository root so Zeabur detects this as a Java/Docker
# service instead of a static Vite site.

# ---- Build Stage ----
FROM eclipse-temurin:21-jdk-alpine AS build

WORKDIR /app

# Copy Maven wrapper and module POMs first for dependency caching.
COPY server/pom.xml ./server/
COPY server/mvnw ./server/
COPY server/mvnw.cmd ./server/
COPY server/.mvn ./server/.mvn
COPY server/skillhub-domain/pom.xml ./server/skillhub-domain/
COPY server/skillhub-auth/pom.xml ./server/skillhub-auth/
COPY server/skillhub-search/pom.xml ./server/skillhub-search/
COPY server/skillhub-infra/pom.xml ./server/skillhub-infra/
COPY server/skillhub-storage/pom.xml ./server/skillhub-storage/
COPY server/skillhub-notification/pom.xml ./server/skillhub-notification/
COPY server/skillhub-app/pom.xml ./server/skillhub-app/

WORKDIR /app/server
RUN ./mvnw dependency:go-offline -B

# Copy full source and package the application.
COPY server .
RUN ./mvnw package -DskipTests -B

# ---- Runtime Stage ----
FROM eclipse-temurin:21-jre-alpine

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY --from=build /app/server/skillhub-app/target/*.jar app.jar

RUN mkdir -p /var/lib/skillhub/storage && \
    chown -R app:app /app /var/lib/skillhub/storage

USER app

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=12 \
    CMD wget -qO- http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
