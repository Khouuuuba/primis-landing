"""
Primis SDK - Official Python SDK for Primis Protocol

Example:
    >>> from primis import Primis
    >>> 
    >>> client = Primis(api_key="prmis_xxx")
    >>> 
    >>> # Generate an image
    >>> job = client.images.generate(prompt="A futuristic city")
    >>> result = client.images.wait_for_job(job["id"])
    >>> print(result["images"])
"""

from .client import Primis
from .exceptions import PrimisError, PrimisAPIError, PrimisTimeoutError

__version__ = "0.1.0"
__all__ = ["Primis", "PrimisError", "PrimisAPIError", "PrimisTimeoutError"]
