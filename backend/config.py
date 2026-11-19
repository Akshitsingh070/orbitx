from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gemini_api_key: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    notion_token: str = ""
    neo4j_uri: str = ""
    neo4j_username: str = "neo4j"
    neo4j_password: str = ""
    jwt_secret: str = "changeme"
    demo_mode: bool = False
    # Server-side GitHub token (public-repo PAT) used when no user OAuth
    # token is available. Raises anonymous rate limit 60 -> 5000 req/hour.
    github_token: str = ""
    # Comma-separated list of allowed frontend origins (CORS).
    frontend_origins: str = "http://localhost:3000,http://127.0.0.1:3000,https://orbitx-indol.vercel.app"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
