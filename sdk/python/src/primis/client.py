"""
Primis SDK Client - Main client class for interacting with the Primis API.

Example:
    >>> from primis import Primis
    >>> 
    >>> client = Primis(api_key="prmis_xxx")
    >>> files = client.files.list()
"""

import time
from typing import Any, Dict, List, Optional, TypedDict
import requests

from .exceptions import (
    PrimisError,
    PrimisAPIError,
    PrimisTimeoutError,
    PrimisAuthError,
    PrimisRateLimitError,
)


# Type definitions
class FileInfo(TypedDict):
    name: str
    path: str
    size: int
    type: str
    folder: str
    url: str
    createdAt: str


class StorageInfo(TypedDict):
    usedBytes: int
    usedGB: str
    maxBytes: int
    maxGB: int
    percentUsed: str


class ImageJob(TypedDict):
    id: str
    status: str
    prompt: str
    numImages: int
    images: Optional[List[str]]
    cost: Optional[float]
    createdAt: str
    completedAt: Optional[str]


class GpuInstance(TypedDict):
    id: str
    name: str
    gpuType: str
    status: str
    costPerHour: float
    createdAt: str
    sshHost: Optional[str]
    sshPort: Optional[int]


# HTTP Client
class HttpClient:
    """Low-level HTTP client for making API requests."""
    
    def __init__(
        self,
        api_key: str,
        base_url: str = "http://localhost:3001",
        timeout: int = 30,
    ):
        if not api_key.startswith("prmis_"):
            raise PrimisError("Invalid API key format. Keys must start with 'prmis_'")
        
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        })
    
    def request(
        self,
        method: str,
        path: str,
        json: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Make an HTTP request to the API."""
        url = f"{self.base_url}{path}"
        
        try:
            response = self.session.request(
                method=method,
                url=url,
                json=json,
                params=params,
                timeout=self.timeout,
            )
        except requests.Timeout:
            raise PrimisTimeoutError(f"Request to {path} timed out")
        except requests.ConnectionError as e:
            raise PrimisError(f"Connection error: {e}", "CONNECTION_ERROR")
        
        # Parse response
        try:
            data = response.json()
        except ValueError:
            raise PrimisError(f"Invalid JSON response from {path}", "PARSE_ERROR")
        
        # Handle errors
        if not response.ok:
            error_msg = data.get("error", f"HTTP {response.status_code}")
            error_code = data.get("code", "HTTP_ERROR")
            
            if response.status_code == 401:
                raise PrimisAuthError(error_msg)
            elif response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", 60))
                raise PrimisRateLimitError(error_msg, retry_after)
            else:
                raise PrimisAPIError(error_msg, error_code, response.status_code)
        
        return data
    
    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self.request("GET", path, params=params)
    
    def post(self, path: str, json: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self.request("POST", path, json=json)
    
    def patch(self, path: str, json: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self.request("PATCH", path, json=json)
    
    def delete(self, path: str) -> Dict[str, Any]:
        return self.request("DELETE", path)


# Resource Classes
class FilesResource:
    """Files API - Upload, list, and manage files."""
    
    def __init__(self, client: HttpClient):
        self._client = client
    
    def list(self) -> Dict[str, Any]:
        """
        List all files for the authenticated user.
        
        Returns:
            Dict containing files list, folder counts, and storage info.
        
        Example:
            >>> files = client.files.list()
            >>> print(f"Used: {files['storage']['usedGB']} GB")
        """
        return self._client.get("/api/files")
    
    def get_usage(self) -> StorageInfo:
        """Get storage usage statistics."""
        response = self._client.get("/api/files/usage")
        return response.get("storage", {})
    
    def delete(self, folder: str, filename: str) -> None:
        """
        Delete a file.
        
        Args:
            folder: The folder containing the file (datasets, models, outputs)
            filename: The name of the file to delete
        """
        self._client.delete(f"/api/files/{folder}/{filename}")


class ImagesResource:
    """Images API - Generate images using SDXL."""
    
    def __init__(self, client: HttpClient):
        self._client = client
    
    def estimate(
        self,
        prompt: str,
        num_images: int = 1,
        width: int = 1024,
        height: int = 1024,
        steps: int = 30,
    ) -> Dict[str, Any]:
        """
        Estimate the cost of generating images.
        
        Args:
            prompt: The prompt describing the image
            num_images: Number of images to generate (1-10)
            width: Image width in pixels
            height: Image height in pixels
            steps: Number of inference steps
        
        Returns:
            Dict with estimatedCost, estimatedTime, and gpuType
        """
        return self._client.post("/api/batch/estimate", {
            "prompt": prompt,
            "numImages": num_images,
            "width": width,
            "height": height,
            "steps": steps,
        })
    
    def generate(
        self,
        prompt: str,
        negative_prompt: Optional[str] = None,
        num_images: int = 1,
        width: int = 1024,
        height: int = 1024,
        steps: int = 30,
        guidance_scale: float = 7.5,
        seed: Optional[int] = None,
    ) -> ImageJob:
        """
        Generate images from a prompt.
        
        Args:
            prompt: The prompt describing the image to generate
            negative_prompt: What to avoid in the image
            num_images: Number of images to generate (1-10)
            width: Image width in pixels
            height: Image height in pixels
            steps: Number of inference steps
            guidance_scale: How closely to follow the prompt
            seed: Random seed for reproducibility
        
        Returns:
            ImageJob dict with job details
        
        Example:
            >>> job = client.images.generate(prompt="A sunset over mountains")
            >>> print(f"Job ID: {job['id']}")
        """
        payload = {
            "prompt": prompt,
            "numImages": num_images,
            "width": width,
            "height": height,
            "steps": steps,
            "guidanceScale": guidance_scale,
        }
        if negative_prompt:
            payload["negativePrompt"] = negative_prompt
        if seed is not None:
            payload["seed"] = seed
        
        response = self._client.post("/api/batch/generate", payload)
        return response.get("job", response)
    
    def get_job(self, job_id: str) -> ImageJob:
        """Get the status of an image generation job."""
        response = self._client.get(f"/api/batch/jobs/{job_id}")
        return response.get("job", response)
    
    def list_jobs(self) -> List[ImageJob]:
        """List all image generation jobs."""
        response = self._client.get("/api/batch/jobs")
        return response.get("jobs", [])
    
    def wait_for_job(
        self,
        job_id: str,
        poll_interval: float = 2.0,
        max_wait: float = 300.0,
    ) -> ImageJob:
        """
        Wait for a job to complete (polling).
        
        Args:
            job_id: The ID of the job to wait for
            poll_interval: Seconds between status checks
            max_wait: Maximum seconds to wait before timing out
        
        Returns:
            The completed ImageJob
        
        Raises:
            PrimisTimeoutError: If the job doesn't complete in time
        
        Example:
            >>> job = client.images.generate(prompt="A cat")
            >>> result = client.images.wait_for_job(job["id"])
            >>> print(result["images"])
        """
        start_time = time.time()
        
        while time.time() - start_time < max_wait:
            job = self.get_job(job_id)
            
            if job["status"] in ("completed", "failed"):
                return job
            
            time.sleep(poll_interval)
        
        raise PrimisTimeoutError(f"Job {job_id} timed out after {max_wait}s")


class TextResource:
    """Text API - Generate text using Llama models."""
    
    def __init__(self, client: HttpClient):
        self._client = client
    
    def estimate(
        self,
        prompt: str,
        max_tokens: int = 512,
        model: str = "llama8b",
    ) -> Dict[str, Any]:
        """Estimate the cost of text generation."""
        return self._client.post("/api/inference/text/estimate", {
            "prompt": prompt,
            "maxTokens": max_tokens,
            "model": model,
        })
    
    def generate(
        self,
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.7,
        model: str = "llama8b",
    ) -> Dict[str, Any]:
        """
        Generate text from a prompt.
        
        Args:
            prompt: The prompt for text generation
            max_tokens: Maximum tokens to generate
            temperature: Randomness (0-2)
            model: Model to use ('llama8b' or 'llama70b')
        
        Returns:
            Dict with generated text
        
        Example:
            >>> result = client.text.generate(prompt="Write a haiku about AI")
            >>> print(result["result"])
        """
        return self._client.post("/api/inference/text/generate", {
            "prompt": prompt,
            "maxTokens": max_tokens,
            "temperature": temperature,
            "model": model,
        })


class InstancesResource:
    """Instances API - Launch and manage GPU instances."""
    
    def __init__(self, client: HttpClient):
        self._client = client
    
    def list(self) -> List[GpuInstance]:
        """List all GPU instances."""
        response = self._client.get("/api/instances")
        return response.get("instances", [])
    
    def get_gpu_types(self) -> List[Dict[str, Any]]:
        """Get available GPU types and pricing."""
        response = self._client.get("/api/instances/gpus")
        return response.get("gpus", [])
    
    def launch(
        self,
        gpu_type: str,
        name: Optional[str] = None,
        docker_image: Optional[str] = None,
        volume_size: Optional[int] = None,
    ) -> GpuInstance:
        """
        Launch a new GPU instance.
        
        Args:
            gpu_type: GPU type (e.g., 'RTX 4090', 'A100')
            name: Instance name
            docker_image: Docker image to use
            volume_size: Volume size in GB
        
        Returns:
            GpuInstance dict with instance details
        """
        payload = {"gpuType": gpu_type}
        if name:
            payload["name"] = name
        if docker_image:
            payload["dockerImage"] = docker_image
        if volume_size:
            payload["volumeSize"] = volume_size
        
        response = self._client.post("/api/instances/launch", payload)
        return response.get("instance", response)
    
    def stop(self, instance_id: str) -> None:
        """Stop an instance."""
        self._client.post(f"/api/instances/{instance_id}/stop")
    
    def terminate(self, instance_id: str) -> None:
        """Terminate an instance."""
        self._client.delete(f"/api/instances/{instance_id}")


class ApiKeysResource:
    """API Keys API - Manage API keys."""
    
    def __init__(self, client: HttpClient):
        self._client = client
    
    def list(self) -> List[Dict[str, Any]]:
        """List all API keys."""
        response = self._client.get("/api/api-keys")
        return response.get("keys", [])


# Main Client
class Primis:
    """
    Primis SDK Client - Main entry point for the Primis API.
    
    Args:
        api_key: Your Primis API key (starts with 'prmis_')
        base_url: API base URL (default: http://localhost:3001)
        timeout: Request timeout in seconds (default: 30)
    
    Example:
        >>> from primis import Primis
        >>> 
        >>> client = Primis(api_key="prmis_xxx")
        >>> 
        >>> # List files
        >>> files = client.files.list()
        >>> 
        >>> # Generate an image
        >>> job = client.images.generate(prompt="A beautiful sunset")
        >>> result = client.images.wait_for_job(job["id"])
    """
    
    def __init__(
        self,
        api_key: str,
        base_url: str = "http://localhost:3001",
        timeout: int = 30,
    ):
        self._client = HttpClient(api_key, base_url, timeout)
        
        # Resource namespaces
        self.files = FilesResource(self._client)
        self.images = ImagesResource(self._client)
        self.text = TextResource(self._client)
        self.instances = InstancesResource(self._client)
        self.api_keys = ApiKeysResource(self._client)
    
    @property
    def base_url(self) -> str:
        """Get the API base URL."""
        return self._client.base_url
