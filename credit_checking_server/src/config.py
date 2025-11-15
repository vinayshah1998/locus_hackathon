"""
Configuration management for the Credit Checking Server.

Uses pydantic-settings for environment variable loading and validation.
"""

from typing import List
from decimal import Decimal
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.

    All settings can be overridden via environment variables or .env file.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # Server Configuration
    server_host: str = Field(default="localhost", description="Server host address")
    server_port: int = Field(default=8000, description="Server port")
    env: str = Field(default="development", description="Environment (development/production)")
    debug: bool = Field(default=True, description="Debug mode")

    # MongoDB Configuration
    mongodb_uri: str = Field(
        default="mongodb://localhost:27017",
        description="MongoDB connection URI"
    )
    mongodb_db: str = Field(
        default="credit_checking",
        description="MongoDB database name"
    )
    mongodb_user: str = Field(default="", description="MongoDB username (optional)")
    mongodb_password: str = Field(default="", description="MongoDB password (optional)")

    # X402 Protocol Configuration
    x402_enabled: bool = Field(
        default=True,
        description="Enable x402 payment verification"
    )

    # Locus Wallet Configuration
    locus_wallet_address: str = Field(
        default="",
        description="Server's Locus wallet address for receiving payments"
    )
    locus_api_key: str = Field(
        default="",
        description="Locus API key for payment verification"
    )
    locus_api_url: str = Field(
        default="https://api.paywithlocus.com",
        description="Locus API base URL"
    )

    # API Pricing (in USD)
    credit_score_price: Decimal = Field(
        default=Decimal("0.002"),
        description="Price for credit score endpoint in USD"
    )
    payment_history_price: Decimal = Field(
        default=Decimal("0.001"),
        description="Price for payment history endpoint in USD"
    )

    # Credit Scoring Configuration
    default_credit_score: int = Field(
        default=70,
        description="Default credit score for new agents with no history"
    )
    max_credit_score: int = Field(
        default=100,
        description="Maximum possible credit score"
    )
    min_credit_score: int = Field(
        default=0,
        description="Minimum possible credit score"
    )

    # Credit Score Calculation Parameters
    on_time_payment_bonus: float = Field(
        default=0.5,
        description="Points added for each on-time payment"
    )
    max_on_time_bonus: float = Field(
        default=30.0,
        description="Maximum total bonus from on-time payments"
    )
    late_payment_penalty_1_7_days: float = Field(
        default=2.0,
        description="Points deducted for late payment (1-7 days)"
    )
    late_payment_penalty_8_30_days: float = Field(
        default=5.0,
        description="Points deducted for late payment (8-30 days)"
    )
    late_payment_penalty_over_30_days: float = Field(
        default=10.0,
        description="Points deducted for late payment (>30 days)"
    )
    defaulted_payment_penalty: float = Field(
        default=15.0,
        description="Points deducted for defaulted payment"
    )

    # Logging Configuration
    log_level: str = Field(default="INFO", description="Logging level")
    log_format: str = Field(
        default="json",
        description="Log format (json or text)"
    )

    # CORS Configuration
    cors_origins: str = Field(
        default="http://localhost:3000,http://localhost:8080",
        description="Comma-separated list of allowed CORS origins"
    )

    # Rate Limiting (for future implementation)
    rate_limit_enabled: bool = Field(
        default=False,
        description="Enable rate limiting"
    )
    rate_limit_per_minute: int = Field(
        default=100,
        description="Maximum requests per minute per wallet"
    )

    # Cache Configuration (for future implementation)
    cache_enabled: bool = Field(
        default=False,
        description="Enable caching for credit scores"
    )
    cache_ttl_seconds: int = Field(
        default=300,
        description="Cache TTL in seconds"
    )

    @field_validator("server_port")
    @classmethod
    def validate_port(cls, v: int) -> int:
        """Validate server port is in valid range."""
        if not 1 <= v <= 65535:
            raise ValueError("Server port must be between 1 and 65535")
        return v

    @field_validator("env")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        """Validate environment is development or production."""
        if v not in ["development", "production"]:
            raise ValueError("Environment must be 'development' or 'production'")
        return v

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """Validate log level."""
        valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        v_upper = v.upper()
        if v_upper not in valid_levels:
            raise ValueError(f"Log level must be one of: {', '.join(valid_levels)}")
        return v_upper

    @field_validator("default_credit_score", "max_credit_score", "min_credit_score")
    @classmethod
    def validate_credit_score_range(cls, v: int) -> int:
        """Validate credit score is in valid range."""
        if not 0 <= v <= 100:
            raise ValueError("Credit scores must be between 0 and 100")
        return v

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins string into list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def mongodb_connection_string(self) -> str:
        """
        Build full MongoDB connection string with credentials if provided.
        """
        if self.mongodb_user and self.mongodb_password:
            # Insert credentials into URI
            # Format: mongodb://user:pass@host:port
            base_uri = self.mongodb_uri.replace("mongodb://", "")
            return f"mongodb://{self.mongodb_user}:{self.mongodb_password}@{base_uri}"
        return self.mongodb_uri

    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.env == "development"

    @property
    def is_production(self) -> bool:
        """Check if running in production mode."""
        return self.env == "production"

    def validate_required_production_settings(self) -> None:
        """
        Validate that required settings are configured for production.

        Raises ValueError if critical settings are missing in production.
        """
        if not self.is_production:
            return

        errors = []

        if not self.locus_wallet_address:
            errors.append("LOCUS_WALLET_ADDRESS is required in production")

        if not self.locus_api_key:
            errors.append("LOCUS_API_KEY is required in production")

        if self.debug:
            errors.append("DEBUG should be False in production")

        if errors:
            raise ValueError(
                "Production configuration errors:\n" + "\n".join(f"  - {err}" for err in errors)
            )

    def model_post_init(self, __context) -> None:
        """Validate configuration after initialization."""
        # Validate production settings if in production mode
        if self.is_production:
            self.validate_required_production_settings()


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    """
    Get the global settings instance.

    This function can be used as a FastAPI dependency.
    """
    return settings


# Export for convenience
__all__ = ["Settings", "settings", "get_settings"]
