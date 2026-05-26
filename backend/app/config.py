from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://localhost:5432/worldcup"

    # Header names set by the auth proxy. The proxy authenticates users and
    # forwards their identity in these headers.
    auth_header_user_id: str = "X-Auth-User-Id"
    auth_header_email: str = "X-Auth-User-Email"
    auth_header_name: str = "X-Auth-User-Name"
    auth_header_photo: str = "X-Auth-User-Photo"

    # For local dev without a proxy, set these to simulate a logged-in user.
    dev_user_email: str = ""
    dev_user_name: str = ""

    admin_emails: str = ""
    allowed_email_domain: str = "antenna.live"

    apifootball_key: str = ""
    apifootball_league_id: int = 1
    apifootball_season: int = 2026

    # Minutes before kickoff that predictions lock.
    lock_lead_minutes: int = 60

    cors_origins: str = "http://localhost:5173"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
