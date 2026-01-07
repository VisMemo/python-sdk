"""omem - Python SDK for omem memory service.

This package provides a simple, developer-friendly interface for
storing and retrieving conversational memories.

Quick Start:
    >>> from omem import Memory
    >>> 
    >>> # Initialize (cloud service)
    >>> mem = Memory(
    ...     endpoint="https://your-service.sealoshzh.site/api/v1/memory",
    ...     tenant_id="your-tenant",
    ...     api_key="qbk_xxx",
    ... )
    >>> 
    >>> # Save conversation
    >>> mem.add("conv-001", [
    ...     {"role": "user", "content": "Hello"},
    ...     {"role": "assistant", "content": "Hi!"},
    ... ])
    >>> 
    >>> # Search memories
    >>> result = mem.search("greeting")
    >>> if result:
    ...     print(result.to_prompt())

For more information, see: https://github.com/omem/python-sdk
"""

from omem.memory import Memory, Conversation
from omem.models import MemoryItem, SearchResult, Entity, Event, AddResult
from omem.client import (
    MemoryClient,
    SessionBuffer,
    CommitHandle,
    RetryConfig,
    OmemClientError,
    OmemHttpError,
    OmemAuthError,
    OmemForbiddenError,
    OmemRateLimitError,
    OmemQuotaExceededError,
    OmemPayloadTooLargeError,
    OmemValidationError,
    OmemServerError,
)
from omem.types import CanonicalAttachmentV1, CanonicalTurnV1, JobStatusV1, SessionStatusV1

# Version
__version__ = "2.1.0"

__all__ = [
    # Version
    "__version__",
    # High-level API (recommended for most users)
    "Memory",
    "Conversation",
    "MemoryItem",
    "SearchResult",
    "Entity",
    "Event",
    "AddResult",
    # Error types
    "OmemClientError",
    "OmemHttpError",
    "OmemAuthError",
    "OmemForbiddenError",
    "OmemRateLimitError",
    "OmemQuotaExceededError",
    "OmemPayloadTooLargeError",
    "OmemValidationError",
    "OmemServerError",
    # Low-level API (for advanced use cases)
    "MemoryClient",
    "SessionBuffer",
    "CommitHandle",
    "RetryConfig",
    "CanonicalAttachmentV1",
    "CanonicalTurnV1",
    "JobStatusV1",
    "SessionStatusV1",
]
