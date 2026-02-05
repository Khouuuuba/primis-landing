"""Custom exceptions for the Primis SDK."""


class PrimisError(Exception):
    """Base exception for all Primis SDK errors."""
    
    def __init__(self, message: str, code: str = "UNKNOWN"):
        self.message = message
        self.code = code
        super().__init__(self.message)


class PrimisAPIError(PrimisError):
    """Exception raised when the API returns an error response."""
    
    def __init__(self, message: str, code: str, status_code: int):
        self.status_code = status_code
        super().__init__(message, code)
    
    def __str__(self):
        return f"[{self.code}] {self.message} (HTTP {self.status_code})"


class PrimisTimeoutError(PrimisError):
    """Exception raised when a request or job times out."""
    
    def __init__(self, message: str = "Request timed out"):
        super().__init__(message, "TIMEOUT")


class PrimisAuthError(PrimisAPIError):
    """Exception raised for authentication errors."""
    
    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message, "AUTH_ERROR", 401)


class PrimisRateLimitError(PrimisAPIError):
    """Exception raised when rate limit is exceeded."""
    
    def __init__(self, message: str, retry_after: int = 60):
        self.retry_after = retry_after
        super().__init__(message, "RATE_LIMIT_EXCEEDED", 429)
